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
import { captureCheckpointContext } from '../tools/lib/checkpoint.js';
import {
  parseEntries,
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
const RMW_PATHS = [
  [
    'captureCheckpointContext',
    (d) => captureCheckpointContext(d, { decisions: ['a locked decision worth recording'] }),
  ],
  [
    'promoteDrainEntry',
    (d) =>
      promoteDrainEntry(d, {
        classification: 'work',
        block: WORK_BLOCK,
        tag: 'roadmap',
        title: 'Status-line breadcrumb',
        entryIndex: 0,
        reason: 'FR5 lock test',
        date: '2026-07-20',
      }),
  ],
  ['evictTerminalToLedger', (d) => evictTerminalToLedger(d)],
  [
    'applyDispositionToFile',
    (d) =>
      applyDispositionToFile(d, INBOX_REL, {
        entryIndex: 0,
        verb: 'defer',
        reason: 'FR5 lock test',
        date: '2026-07-20',
      }),
  ],
  ['regenerateIndex', (d) => regenerateIndex(d)],
  ['generateMilestoneMetaRetro', (d) => generateMilestoneMetaRetro(d, 'M9')],
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
