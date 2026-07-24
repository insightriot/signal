// tests/add-drain-lock.test.js — M5.E6 FR7 / B31: `/sig:add`'s inbox doc-write and
// the drain's disposition write must be MUTUALLY EXCLUSIVE on the same inbox file.
//
// B31 (the cross-lock gap): `/sig:add` writes the inbox (and OPEN-QUESTIONS / BUGS)
// under `.add.lock`, while drain/ship write the SAME files under `.state.lock` →
// two DIFFERENT mutexes → no mutual exclusion → concurrent lost-update. The M5.E4
// read-enclosure locking closed drain-vs-drain, never add-vs-drain.
//
// Harness (mirrors the B25 read-enclosure interleaving shape): writer A = a drain
// disposition that PAUSES right after its version-establishing read (INSIDE
// `.state.lock`, via the existing `_afterRead` seam); inside that pause, writer B =
// a full `/sig:add` inbox write races on the SAME file.
//   - main  (add writes under `.add.lock` only): B acquires `.add.lock` freely,
//     commits its new entry, then A's stale-content write CLOBBERS it → lost update.
//   - fixed (add's doc-write nested under `.state.lock`): B's `.state.lock` acquire
//     THROWS (A holds it) → B never commits → no lost update.
// Twin-discriminated: `expect(lostUpdate).toBe(false)` FAILS on `main` and passes
// only after the T23 fix. A permanent broken-add twin (writes under `.add.lock`
// only, the pre-fix behavior) proves the harness detects the exact bug (anti-
// tautology), so the "no lost update" verdict is a real discriminator.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyDispositionToFile } from '../tools/lib/drain.js';
import {
  captureToFutureIdeas,
  insertFutureIdeasEntry,
  buildFutureIdeasEntry,
  acquireLock,
  releaseLock,
} from '../tools/lib/add.js';
import { atomicWrite } from '../tools/lib/atomic-write.js';
import { withStateLock } from '../tools/lib/state.js';

const INBOX_REL = '.planning/ISSUES-INBOX.md';

// A realistic inbox with two un-dispositioned `## ` entries — the exact shape
// parseEntries yields, so the drain disposition (writer A) has a valid entry 0 to
// stamp. No `*Last updated:*` footer (insertFutureIdeasEntry handles the footerless
// case by appending one), matching the drain fixtures.
const DRAIN_INBOX = [
  '# Issues Inbox',
  '',
  'Raw capture inbox.',
  '',
  '---',
  '',
  '## Status-line breadcrumb idea',
  '',
  '**Status:** Logged 2026-07-01 via `/sig:add`.',
  '',
  'Wire a statusline script that reads STATE frontmatter.',
  '',
  '---',
  '',
  '## resume crashes on schema drift',
  '',
  '**Status:** Logged 2026-07-02 via `/sig:add`.',
  '',
  '`/sig:resume` throws when schema_version is ahead.',
  '',
  '---',
  '',
].join('\n');

// The body writer B (add) appends — a distinctive marker so its presence/absence in
// the final on-disk file is the lost-update discriminator. Contains no sensitive-data
// pattern, so the scrub prompt never fires (the interleaving is about the write lock).
const B_BODY = 'B-add-new-idea-during-drain-pause';

// A deliberately-BROKEN read-outside-`.state.lock` twin of `/sig:add`'s inbox write,
// built from the exported pure helpers. It reads → builds → inserts → atomicWrites
// under `.add.lock` ONLY (never `.state.lock`) — the exact pre-fix add behavior B31
// guards against. As writer B it proves the harness detects a genuine add-vs-drain
// lost update (the anti-tautology reference; independent of add.js's real impl).
async function brokenAddInboxWrite(baseDir, { body, today }) {
  const lock = await acquireLock(baseDir); // .add.lock only — NOT .state.lock
  try {
    const targetPath = join(baseDir, INBOX_REL);
    const content = await readFile(targetPath, 'utf-8');
    const entry = buildFutureIdeasEntry({ body, date: today });
    const { content: next } = insertFutureIdeasEntry(content, entry, today);
    await atomicWrite(targetPath, next);
    return { written: true };
  } finally {
    await lock.released();
  }
}

// The real capture entry point needs a `sensitivePrompt`; the body is clean so it
// never fires. Adapter normalizes the signature to `addWrite(dir, {body, today})`.
const realAddWrite = (dir, { body, today }) =>
  captureToFutureIdeas(dir, { body, today, sensitivePrompt: async () => 'keep' });

// Writer A = a drain disposition (entry 0) that pauses right after its read (inside
// `.state.lock`, via `_afterRead`); inside that pause, writer B (`addWrite`) races on
// the SAME inbox. `.catch` semantics: B's rejection MUST be captured inside the hook —
// if it propagated it would unwind into A's own Core and abort A's write, false-passing.
async function interleaveAddVsDrain(dir, addWrite) {
  let bSucceeded = false;
  let bError = null;
  const afterRead = async () => {
    try {
      await addWrite(dir, { body: B_BODY, today: '2026-07-20' });
      bSucceeded = true;
    } catch (err) {
      bError = err;
    }
  };
  await applyDispositionToFile(dir, INBOX_REL, {
    entryIndex: 0,
    verb: 'defer',
    reason: 'A-drain-disposition',
    date: '2026-07-20',
    _afterRead: afterRead,
  });
  const finalContent = await readFile(join(dir, INBOX_REL), 'utf-8');
  const bReflected = finalContent.includes(B_BODY);
  const aReflected = /Deferred 2026-07-20 \(A-drain-disposition\)/.test(finalContent);
  // Lost update: B reported success yet its entry is ABSENT from the final file — it
  // committed and was then clobbered by A's stale-content write.
  const lostUpdate = bSucceeded && !bReflected;
  return { lostUpdate, bSucceeded, bError, bReflected, aReflected };
}

describe('M5.E6 FR7 / B31 — /sig:add inbox-write vs drain disposition mutual exclusion (AC7.2/AC7.3)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-add-drain-lock-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, INBOX_REL), DRAIN_INBOX, 'utf-8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // AC7.2 / AC7.3 — the load-bearing discriminator. FAILS on `main` (add writes under
  // `.add.lock` → committed then clobbered → lostUpdate true); passes only once add's
  // doc-write is serialized under `.state.lock` (B fails fast on the held lock → never
  // commits → no lost update).
  it('REAL /sig:add: no lost update — add serialized under .state.lock (RED on main)', async () => {
    const r = await interleaveAddVsDrain(dir, realAddWrite);
    expect(r.lostUpdate).toBe(false); // RED on main
    expect(r.bSucceeded).toBe(false); // add fails fast on the held .state.lock (post-fix)
    expect(r.bError).not.toBeNull();
    expect(r.bError.message).toMatch(/lock|another .*state write/i);
    expect(r.aReflected).toBe(true); // the drain disposition landed
  });

  // AC7.2 anti-tautology: the IDENTICAL harness DOES detect a lost update when add
  // writes under `.add.lock` only (the pre-fix behavior). Proves `expect(lostUpdate)
  // .toBe(false)` above is a real discriminator, not a tautology that always reports
  // "no lost update".
  it('BROKEN add twin (writes under .add.lock only): B commits then drain clobbers → LOST UPDATE', async () => {
    const r = await interleaveAddVsDrain(dir, brokenAddInboxWrite);
    expect(r.lostUpdate).toBe(true); // the twin loses B's update — the exact bug B31 prevents
    expect(r.bSucceeded).toBe(true); // B acquired the still-free .add.lock and committed
    expect(r.bReflected).toBe(false); // then A's stale-content write clobbered B's entry
    expect(r.aReflected).toBe(true);
  });
});

describe('M5.E6 FR7 / B31 — /sig:add doc-write re-entrancy + prompt placement (AC7.4/AC7.5)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-add-drain-lock-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, INBOX_REL), DRAIN_INBOX, 'utf-8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // AC7.4 — add's doc-write is genuinely UNDER `.state.lock` (rejects when the coarse
  // lock is externally held) AND completes ONCE the lock frees (no internal re-entrancy).
  // The resolves-after-release leg is the re-entrancy witness: it would fail (the Core
  // would re-enter and throw, "hang" in the plan's phrasing) if any pure insert helper
  // self-locked. Mirrors the rmw-lock.test.js throw-under-held-lock idiom.
  it('add rejects while .state.lock is externally held, then resolves after release (no re-entrant deadlock)', async () => {
    await withStateLock(dir, async () => {
      await expect(
        captureToFutureIdeas(dir, {
          body: 'an idea captured while the coarse lock is held',
          today: '2026-07-20',
          sensitivePrompt: async () => 'keep',
        })
      ).rejects.toThrow(/lock|another .*state write/i);
    });
    // Lock released — add acquires `.state.lock` exactly once inside its Core and
    // completes. A helper that self-locked would re-enter here and throw instead.
    await expect(
      captureToFutureIdeas(dir, {
        body: 'an idea captured after the coarse lock released',
        today: '2026-07-20',
        sensitivePrompt: async () => 'keep',
      })
    ).resolves.toMatchObject({ written: true });
    const content = await readFile(join(dir, INBOX_REL), 'utf-8');
    expect(content).toContain('an idea captured after the coarse lock released');
  });

  // AC7.5 (structural) — the sensitive-data scrub prompt must run OUTSIDE `.state.lock`,
  // so a slow interactive prompt can never hold the coarse mutex for 30s. The probe
  // acquires `.state.lock` from INSIDE the scrub prompt: it succeeds only because add
  // has not yet taken the coarse lock (the prompt precedes it). If a future
  // "simplification" moved the prompt INSIDE addDocWriteCore (under `.state.lock`), add
  // would already hold the lock here, the nested acquire would re-enter → throw → record
  // false → this assertion FAILS. That is the genuine bite (verified by mutation).
  it('the sensitive-data scrub prompt runs OUTSIDE .state.lock (prompt precedes the coarse-lock acquire)', async () => {
    let stateLockAcquirableDuringPrompt = null;
    await captureToFutureIdeas(dir, {
      // A github-token pattern (ghp_ + 36 alphanumerics) → the scrub prompt fires.
      body: 'rotate deploy key ghp_abcdefghijklmnopqrstuvwxyz0123456789 today',
      today: '2026-07-20',
      sensitivePrompt: async () => {
        try {
          await withStateLock(dir, async () => {});
          stateLockAcquirableDuringPrompt = true;
        } catch {
          stateLockAcquirableDuringPrompt = false;
        }
        return 'keep';
      },
    });
    expect(stateLockAcquirableDuringPrompt).toBe(true);
  });
});
