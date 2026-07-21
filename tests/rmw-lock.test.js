// tests/rmw-lock.test.js — M5.E4 FR5: the doc-runtime RMW writers are lock-guarded.
//
// FR5 reuses the coarse `.planning/.state.lock` (withStateLock) so the doc-runtime
// read-modify-write writers can't lost-update across concurrent cross-session
// writers. The lock is throw-on-contention (O_EXCL, non-reentrant), so the
// observable contract is: a wrapped RMW writer, invoked while the caller ALREADY
// holds `withStateLock`, rejects with a lock error — and resolves once the lock is
// released. Mirror of tests/migrate-lock.test.js:46-54.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { withStateLock } from '../tools/lib/state.js';
import { atomicWrite } from '../tools/lib/atomic-write.js';
import { captureCheckpointContext } from '../tools/lib/checkpoint.js';
import {
  parseEntries,
  applyDisposition,
  promoteDrainEntry,
  evictTerminalToLedger,
  applyDispositionToFile,
  applyDispositionToFileCore,
} from '../tools/lib/drain.js';
import { regenerateIndex, generateMilestoneMetaRetro } from '../tools/lib/retro-index.js';
import { regeneratePlanningIndexCore } from '../tools/lib/planning-index.js';
import { applyMigrate } from '../tools/lib/migrate-memory.js';

const INBOX_REL = '.planning/ISSUES-INBOX.md';

// A realistic inbox: two un-dispositioned `## ` entries (heading + Status + body +
// separator), the exact shape parseEntries yields — reused for the drain paths.
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

const INBOX_ENTRIES = parseEntries(DRAIN_INBOX);
const WORK_BLOCK = DRAIN_INBOX.slice(INBOX_ENTRIES[0].range.start, INBOX_ENTRIES[0].range.end);

// One invoker per wrapped RMW path. Each is fed valid fixtures so the pre-wrap RED
// phase RESOLVES (proving the throw-assertion is meaningful) and the post-release
// call succeeds. The lock wrapper acquires BEFORE the body runs, so the throwing
// call is side-effect-free (nothing written before the re-entrant acquire fails).
//
// The optional second `extra` arg is spread into the wrapper's opts — the FR3/B25
// interleaving harness (below) uses it to thread the `_afterRead` read-enclosure seam.
// Callers that omit it (the throw-under-held-lock suite) get byte-identical prod behavior.
const RMW_PATHS = [
  [
    'captureCheckpointContext',
    (d, extra = {}) =>
      captureCheckpointContext(d, { decisions: ['a locked decision worth recording'], ...extra }),
  ],
  [
    'promoteDrainEntry',
    (d, extra = {}) =>
      promoteDrainEntry(d, {
        classification: 'work',
        block: WORK_BLOCK,
        tag: 'roadmap',
        title: 'Status-line breadcrumb',
        entryIndex: 0,
        reason: 'FR5 lock test',
        date: '2026-07-20',
        ...extra,
      }),
  ],
  ['evictTerminalToLedger', (d, extra = {}) => evictTerminalToLedger(d, extra)],
  [
    'applyDispositionToFile',
    (d, extra = {}) =>
      applyDispositionToFile(d, INBOX_REL, {
        entryIndex: 0,
        verb: 'defer',
        reason: 'FR5 lock test',
        date: '2026-07-20',
        ...extra,
      }),
  ],
  ['regenerateIndex', (d, extra = {}) => regenerateIndex(d, extra)],
  ['generateMilestoneMetaRetro', (d, extra = {}) => generateMilestoneMetaRetro(d, 'M9', extra)],
];

describe('M5.E4 FR5b — doc-runtime RMW writers are lock-guarded (AC5.2)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-rmw-lock-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, INBOX_REL), DRAIN_INBOX, 'utf-8');
    // A closed-Epic retro so the retro-index paths have real content to render.
    await writeFile(
      join(dir, '.planning', 'M9.E1-RETROSPECTIVE.md'),
      '# M9.E1 Retrospective\n\nComplete.\n',
      'utf-8'
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each(RMW_PATHS)(
    '%s: rejects when invoked under an already-held state lock, resolves after release',
    async (_name, invoke) => {
      await withStateLock(dir, async () => {
        // The coarse `.state.lock` is held → the self-locking wrapper re-enters the
        // non-reentrant lock and rejects (why in-lock composers must use lock-free cores).
        await expect(invoke(dir)).rejects.toThrow(/lock|another .*state write/i);
      });
      // Lock released — the wrapper now acquires cleanly and completes.
      await expect(invoke(dir)).resolves.toBeDefined();
    }
  );

  it('applyDispositionToFile DUAL-ROLE split: the lock-free CORE composes under a held lock; the wrapper rejects (AC5.2)', async () => {
    await withStateLock(dir, async () => {
      // The standalone (self-locking) wrapper — the commands/plan.md defer/delete path —
      // re-enters the held lock and rejects.
      await expect(
        applyDispositionToFile(dir, INBOX_REL, {
          entryIndex: 0,
          verb: 'defer',
          reason: 'FR5 split',
          date: '2026-07-20',
        })
      ).rejects.toThrow(/lock|another .*state write/i);
      // The lock-free CORE is exactly what promoteDrainEntry's locked core calls — it
      // must NOT self-lock, so it completes under the already-held coarse lock.
      await expect(
        applyDispositionToFileCore(dir, INBOX_REL, {
          entryIndex: 0,
          verb: 'defer',
          reason: 'FR5 split',
          date: '2026-07-20',
        })
      ).resolves.toMatchObject({ written: true });
    });
  });
});

describe('M5.E4 FR5a — applyMigrate INDEX regen fires the lock-free core under the held coarse lock (AC5.1)', () => {
  const git = (cwd, args) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

  // A needsV3 (docs_layout_version 1 < CURRENT), otherwise-conformant STATE that
  // reaches the tail INDEX regen (mirror tests/migrate-index-guard.test.js): BACKLOG
  // present, no FUTURE-IDEAS, no DECISIONS → the only v3 work is the stamp + tail regen.
  const STATE_V1 =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E4\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-20)\nblockers: []\n---\n# Project State\n\nlive pointer\n`;

  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('completes (no re-entrant deadlock) AND re-renders a stale-but-VALID Signal-format INDEX under the lock', async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-ac51-'));
    const p = join(dir, '.planning');
    await mkdir(p, { recursive: true });
    await writeFile(join(p, 'STATE.md'), STATE_V1, 'utf-8');
    await writeFile(join(p, 'BACKLOG.md'), '# Backlog\n', 'utf-8');

    // Generate a REAL Signal-format INDEX (it carries the `Auto-generated by /sig:index`
    // marker → isForeignIndexFormat is false → the tail regen branch fires, not the
    // foreign-skip branch that would prove nothing).
    await regeneratePlanningIndexCore(dir);

    // Add a doc AFTER the index is generated → the on-disk INDEX is now STALE (it does
    // not list this doc), so the tail regen must do a real read→render→write, not a
    // compare-noop. This discriminates in both directions: it would throw re-entrant if
    // the tail called the self-locking wrapper.
    await writeFile(join(p, 'EXTRA-NOTE.md'), '# Extra note\n', 'utf-8');
    const idxBefore = await readFile(join(p, 'INDEX.md'), 'utf-8');
    expect(idxBefore).not.toContain('EXTRA-NOTE.md');

    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);

    const res = await applyMigrate(dir, { stamp: 'AC51', dateStr: '2026-07-20' });
    expect(res.applied).toBe(true); // no re-entrant throw at the tail regen (§9)

    // The lock-free core actually re-rendered the INDEX under the held coarse lock.
    const idxAfter = await readFile(join(p, 'INDEX.md'), 'utf-8');
    expect(idxAfter).toContain('EXTRA-NOTE.md');
  });
});

// -----------------------------------------------------------------------------
// M5.E5 FR3 (B25): the read-enclosure has a BEHAVIORAL (interleaving) test.
//
// The suite above only asserts throw-under-held-lock — which a BROKEN wrapper that
// reads OUTSIDE the lock (then writes inside it) passes identically. That leaves the
// "no lost update" contract (FR5 AC5.2) with no behavioral test. This block closes it
// with an interleaving harness that genuinely FAILs on a read-outside-lock twin.
//
// Mechanics (execution-critical): the lock is throw-on-contention, NOT blocking
// (file-lock.js O_EXCL). So the harness pauses writer A right after its version-
// establishing read (via the `_afterRead` seam) and, inside that hook, invokes writer B.
//   - REAL wrapper: the read (and thus `_afterRead`) sits INSIDE the lock, so B's acquire
//     THROWS → B never commits → no lost update.
//   - BROKEN twin: the read (and thus `_afterRead`) sits OUTSIDE the lock, so B acquires
//     the still-free lock, commits, and is then CLOBBERED by A's stale-content write → lost update.
// B's rejection MUST be caught inside the hook (see `interleave`) — if it propagated it would
// unwind into A's own Core and abort A's write, false-passing the test.
// -----------------------------------------------------------------------------

// A deliberately-BROKEN read-outside-lock twin of applyDispositionToFile, built from the
// exported primitives (applyDisposition + atomicWrite). It reads the file BEFORE acquiring
// the lock — the exact defect FR5 read-enclosure guards against — then writes INSIDE the
// lock. It therefore passes the throw-under-held-lock assertion identically to the real
// wrapper, which is why that assertion alone can't catch the bug. The interleaving harness
// below is what discriminates.
async function brokenApplyDisposition(baseDir, relPath, opts) {
  const { entryIndex, verb, reason, date, _afterRead } = opts;
  const targetPath = join(baseDir, relPath);
  // BUG (deliberate): read OUTSIDE the lock. In the real Core this read sits inside it.
  const content = await readFile(targetPath, 'utf-8');
  if (_afterRead) await _afterRead(); // post-read pause window — here it is OUTSIDE the lock
  return withStateLock(baseDir, async () => {
    const newContent = applyDisposition(content, entryIndex, verb, reason, date);
    await atomicWrite(targetPath, newContent);
    return { written: true, verb, path: targetPath };
  });
}

// Shared orchestration helper (D3). Writer A runs with a post-read pause hook; inside that
// hook writer B is invoked and its outcome captured. The `.catch` here is LOAD-BEARING: the
// lock is throw-on-contention, so in the correct case B rejects at acquire — if that rejection
// propagated it would unwind into A's own Core and abort A's write, false-passing the test.
async function interleave(dir, aInvoke, bInvoke) {
  let bSucceeded = false;
  let bError = null;
  const afterRead = async () => {
    try {
      await bInvoke();
      bSucceeded = true;
    } catch (err) {
      bError = err;
    }
  };
  const aResult = await aInvoke(afterRead);
  return { bSucceeded, bError, aResult };
}

// Reference discriminator: A stamps entry 0, B stamps entry 1 (distinct reasons so each
// stamp is observable). `applyFn` is either the real wrapper or the broken twin.
const A_REASON = 'A-writer-stamp-0';
const B_REASON = 'B-writer-stamp-1';
async function runReferenceInterleaving(dir, applyFn) {
  const { bSucceeded, bError } = await interleave(
    dir,
    (afterRead) =>
      applyFn(dir, INBOX_REL, {
        entryIndex: 0,
        verb: 'defer',
        reason: A_REASON,
        date: '2026-07-20',
        _afterRead: afterRead,
      }),
    () =>
      applyFn(dir, INBOX_REL, {
        entryIndex: 1,
        verb: 'defer',
        reason: B_REASON,
        date: '2026-07-20',
      })
  );
  const finalContent = await readFile(join(dir, INBOX_REL), 'utf-8');
  const aReflected = finalContent.includes(A_REASON);
  const bReflected = finalContent.includes(B_REASON);
  // Lost update: B reported success, yet its stamp is absent from the final file — it
  // committed and was then clobbered by A's stale-content write.
  const lostUpdate = bSucceeded && !bReflected;
  return { lostUpdate, bSucceeded, bError, aReflected, bReflected };
}

describe('M5.E5 FR3 — read-enclosure behavioral interleaving test (B25, AC3.1–AC3.6)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-rmw-interleave-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(join(dir, INBOX_REL), DRAIN_INBOX, 'utf-8');
    await writeFile(
      join(dir, '.planning', 'M9.E1-RETROSPECTIVE.md'),
      '# M9.E1 Retrospective\n\nComplete.\n',
      'utf-8'
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // AC3.1 / AC3.2 / AC3.3 — the load-bearing discriminator, on the reference path.
  it('applyDispositionToFile (REAL, read-enclosed): the contending writer fails fast, NO lost update', async () => {
    const r = await runReferenceInterleaving(dir, applyDispositionToFile);
    // AC3.2 — behavioral: the verdict is on final on-disk content, not a throw-under-held-lock.
    // AC3.1 — this SAME assertion FAILs on the broken twin (proven by the next test).
    expect(r.lostUpdate).toBe(false);
    // AC3.3 — the arriving writer B fails fast with a lock error and never commits.
    expect(r.bSucceeded).toBe(false);
    expect(r.bError).not.toBeNull();
    expect(r.bError.message).toMatch(/lock|another .*state write/i);
    // A's change landed; B's is absent BECAUSE it never committed (not because A clobbered it).
    expect(r.aReflected).toBe(true);
    expect(r.bReflected).toBe(false);
  });

  // AC3.1 (anti-tautology / RED proof): the IDENTICAL harness DOES detect a lost update
  // when the read sits OUTSIDE the lock. This proves `expect(lostUpdate).toBe(false)` in the
  // test above is a real discriminator, not a tautology that always reports "no lost update".
  // Asserting `toBe(false)` here would produce the literal vitest RED "expected true to be false".
  it('brokenApplyDisposition (read-OUTSIDE-lock twin): B commits then A clobbers → LOST UPDATE', async () => {
    const r = await runReferenceInterleaving(dir, brokenApplyDisposition);
    expect(r.lostUpdate).toBe(true); // the twin loses B's update — the exact bug read-enclosure prevents
    expect(r.bSucceeded).toBe(true); // B acquired the still-free lock and committed entry 1
    expect(r.bReflected).toBe(false); // then A's stale-content write clobbered B's stamp
    expect(r.aReflected).toBe(true);
  });

  // AC3.6 — full close: every RMW_PATHS wrapper (all 6) carries an interleaving assertion.
  // While writer A is paused mid-Core (post-read, INSIDE the coarse lock), a contending
  // writer B fails fast with a lock error — proving the Core's read→write window is
  // lock-enclosed. (Genuine lost-update DETECTION is proven on applyDispositionToFile
  // above; here the uniform assertion is "the paused-writer's post-read window rejects a
  // contender", which a read-OUTSIDE-lock wrapper would fail because B would acquire freely.)
  it.each(RMW_PATHS)(
    '%s: a writer contending inside the paused writer post-read window fails fast (read-enclosed)',
    async (_name, invoke) => {
      const { bSucceeded, bError, aResult } = await interleave(
        dir,
        (afterRead) => invoke(dir, { _afterRead: afterRead }),
        () => invoke(dir)
      );
      expect(aResult).toBeDefined(); // A completed — its write landed
      expect(bSucceeded).toBe(false); // B never committed
      expect(bError).not.toBeNull();
      expect(bError.message).toMatch(/lock|another .*state write/i);
    }
  );
});
