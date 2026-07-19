// Tests for tools/lib/backlog.js — the living BACKLOG.md + drain classify/promote
// (M5.E3.S4 / FR2). See .planning/M5.E3-PLAN.md § S4 and § FR2 (AC2.1, AC2.3–AC2.6).
//
// BACKLOG.md is the groomed, sequenced roadmap; the /sig:plan drain classifies
// each promoted inbox entry (work→BACKLOG / bug→BUGS), promotes it (retitle +
// roadmap/hygiene tag), then stamps + evicts it from the inbox — so a promoted
// entry converges (never resurfaces) and double-homes in the destination + ledger.
//
// HARD constraint: every behavioral test uses a temp dir + fake fixtures. NONE of
// these tests may touch Signal's real .planning/BACKLOG.md or its inbox.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createBacklogIfMissing,
  promoteToBacklog,
  promoteToBugs,
} from '../tools/lib/backlog.js';
import {
  parseEntries,
  isEvictable,
  promoteDrainEntry,
  evictTerminalToLedger,
} from '../tools/lib/drain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const planMd = readFileSync(join(ROOT, 'commands', 'plan.md'), 'utf-8');
const shipMd = readFileSync(join(ROOT, 'commands', 'ship.md'), 'utf-8');
const executeMd = readFileSync(join(ROOT, 'commands', 'execute.md'), 'utf-8');

const BACKLOG_REL = '.planning/BACKLOG.md';

// A realistic inbox entry block (heading + Status line + idea body + separator),
// exactly the shape parseEntries yields via content.slice(range.start, range.end).
const WORK_BLOCK = [
  '## Old capture title',
  '',
  '**Status:** Logged 2026-07-01 via `/sig:add`.',
  '',
  'Add a status-line breadcrumb reading STATE frontmatter.',
  '',
  '---',
].join('\n');

const BUG_BLOCK = [
  '## resume crashes on schema drift',
  '',
  '**Status:** Logged 2026-07-02 via `/sig:add`.',
  '',
  '`/sig:resume` throws when STATE.md schema_version is ahead of the reader.',
  '',
  '---',
].join('\n');

async function stageBase() {
  const baseDir = await mkdtemp(join(tmpdir(), 'signal-backlog-'));
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  return baseDir;
}

describe('createBacklogIfMissing (S4.t1 — idempotent skeleton)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('creates BACKLOG.md with an intro + a *Last updated:* footer when absent', async () => {
    const res = await createBacklogIfMissing(baseDir, { today: '2026-07-19' });
    expect(res.created).toBe(true);
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toMatch(/^# Backlog/m);
    expect(text).toMatch(/\*Last updated: 2026-07-19\*/);
  });

  it('is idempotent — a second call does not overwrite (created:false, byte-identical)', async () => {
    await createBacklogIfMissing(baseDir, { today: '2026-07-19' });
    const first = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    const res2 = await createBacklogIfMissing(baseDir, { today: '2026-07-20' });
    expect(res2.created).toBe(false);
    expect(await readFile(join(baseDir, BACKLOG_REL), 'utf-8')).toBe(first);
  });
});

describe('promoteToBacklog (S4.t1 — tagged entry + sha1 dedupe, AC2.1)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('appends a `## {title}` entry carrying **Tag:** + the block body; grooms the old heading', async () => {
    const res = await promoteToBacklog(baseDir, {
      block: WORK_BLOCK,
      tag: 'roadmap',
      title: 'Status-line breadcrumb',
      today: '2026-07-19',
    });
    expect(res.written).toBe(true);
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toContain('## Status-line breadcrumb');
    expect(text).toContain('**Tag:** roadmap');
    expect(text).toContain('Add a status-line breadcrumb reading STATE frontmatter.');
    // the source entry's own `## ` heading is not carried (retitle grooms it away)
    expect(text).not.toContain('## Old capture title');
    // footer bumped to the promote date
    expect(text).toMatch(/\*Last updated: 2026-07-19\*/);
  });

  it('supports the hygiene tag', async () => {
    await promoteToBacklog(baseDir, {
      block: 'Clean up drifted docs across the repo.',
      tag: 'hygiene',
      title: 'Doc hygiene sweep',
      today: '2026-07-19',
    });
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toContain('**Tag:** hygiene');
  });

  it('a blank title keeps the source block heading (plan.md: "A blank keeps the source heading")', async () => {
    await promoteToBacklog(baseDir, {
      block: WORK_BLOCK,
      tag: 'roadmap',
      title: '',
      today: '2026-07-19',
    });
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toContain('## Old capture title');
  });

  it('a second promote of the same block (same key) is a no-op — no duplicate', async () => {
    await promoteToBacklog(baseDir, {
      block: WORK_BLOCK,
      tag: 'roadmap',
      title: 'Status-line breadcrumb',
      today: '2026-07-19',
    });
    const after1 = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    // Same block, DIFFERENT tag + title: the key is sha1(block), so still dedupes.
    const res2 = await promoteToBacklog(baseDir, {
      block: WORK_BLOCK,
      tag: 'hygiene',
      title: 'A different title, same source block',
      today: '2026-07-20',
    });
    expect(res2.written).toBe(false);
    expect(res2.deduped).toBe(true);
    expect(await readFile(join(baseDir, BACKLOG_REL), 'utf-8')).toBe(after1);
  });

  it('rejects an unknown tag (strict enum: roadmap | hygiene)', async () => {
    await expect(
      promoteToBacklog(baseDir, { block: 'x', tag: 'nonsense', title: 'y', today: '2026-07-19' })
    ).rejects.toThrow(/roadmap|hygiene/);
  });

  it('creates BACKLOG.md on first promote when it is missing', async () => {
    expect(existsSync(join(baseDir, BACKLOG_REL))).toBe(false);
    await promoteToBacklog(baseDir, {
      block: 'Some idea body.',
      tag: 'roadmap',
      title: 'An idea',
      today: '2026-07-19',
    });
    expect(existsSync(join(baseDir, BACKLOG_REL))).toBe(true);
  });
});

describe('promoteToBugs (S4.t2 — simple entry into BUGS.md, AC2.3 bug half)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('appends a simple needs-triage entry into an existing BUGS.md (reuses buildBugsEntry)', async () => {
    await writeFile(join(baseDir, '.planning/BUGS.md'), '# Bugs\n\nExisting.\n', 'utf-8');
    const res = await promoteToBugs(baseDir, {
      block: BUG_BLOCK,
      title: 'Resume crash on schema drift',
    });
    expect(res.written).toBe(true);
    const text = await readFile(join(baseDir, '.planning/BUGS.md'), 'utf-8');
    expect(text).toContain('## Resume crash on schema drift');
    expect(text).toContain('**Status:** needs-triage');
    expect(text).toContain(
      '`/sig:resume` throws when STATE.md schema_version is ahead of the reader.'
    );
    expect(text).toContain('Existing.'); // pre-existing content preserved
  });

  it('a second promote of the same block is a no-op (sha1 dedupe)', async () => {
    await writeFile(join(baseDir, '.planning/BUGS.md'), '# Bugs\n', 'utf-8');
    await promoteToBugs(baseDir, { block: BUG_BLOCK, title: 'X' });
    const after1 = await readFile(join(baseDir, '.planning/BUGS.md'), 'utf-8');
    const res2 = await promoteToBugs(baseDir, { block: BUG_BLOCK, title: 'A different title' });
    expect(res2.written).toBe(false);
    expect(res2.deduped).toBe(true);
    expect(await readFile(join(baseDir, '.planning/BUGS.md'), 'utf-8')).toBe(after1);
  });

  it('creates BUGS.md when missing (drain resilience — conscious deviation from captureToBugs)', async () => {
    expect(existsSync(join(baseDir, '.planning/BUGS.md'))).toBe(false);
    await promoteToBugs(baseDir, { block: 'A defect body.', title: 'A defect' });
    const text = await readFile(join(baseDir, '.planning/BUGS.md'), 'utf-8');
    expect(text).toContain('## A defect');
    expect(text).toContain('**Status:** needs-triage');
  });
});

// A two-entry inbox: one work idea, one bug — the drain classify-step fodder.
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

describe('promoteDrainEntry (S4.t3 — classify → destination-first → stamp terminal, AC2.3/2.5)', () => {
  const INBOX_REL = '.planning/ISSUES-INBOX.md';
  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
    await writeFile(join(baseDir, INBOX_REL), DRAIN_INBOX, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('work → BACKLOG (retitled + tagged); bug → BUGS; both stamp → terminal/evictable', async () => {
    const before = parseEntries(DRAIN_INBOX);
    const workBlock = DRAIN_INBOX.slice(before[0].range.start, before[0].range.end);
    const bugBlock = DRAIN_INBOX.slice(before[1].range.start, before[1].range.end);

    // promote stamps inline (never removes the block), so indices stay stable.
    const r0 = await promoteDrainEntry(baseDir, {
      classification: 'work',
      block: workBlock,
      tag: 'roadmap',
      title: 'Status-line breadcrumb',
      entryIndex: 0,
      reason: 'M5.E3 drain',
      date: '2026-07-19',
    });
    expect(r0.destination).toBe('backlog');

    const r1 = await promoteDrainEntry(baseDir, {
      classification: 'bug',
      block: bugBlock,
      title: 'Resume crash on schema drift',
      entryIndex: 1,
      reason: 'M5.E3 drain',
      date: '2026-07-19',
    });
    expect(r1.destination).toBe('bugs');

    const backlog = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(backlog).toContain('## Status-line breadcrumb');
    expect(backlog).toContain('**Tag:** roadmap');

    const bugs = await readFile(join(baseDir, '.planning/BUGS.md'), 'utf-8');
    expect(bugs).toContain('## Resume crash on schema drift');
    expect(bugs).toContain('**Status:** needs-triage');

    // Both inbox entries are now stamped `→ Promoted` → terminal → evictable.
    const afterInbox = await readFile(join(baseDir, INBOX_REL), 'utf-8');
    expect(afterInbox).toMatch(/→ Promoted 2026-07-19 \(M5\.E3 drain\)/);
    const entries = parseEntries(afterInbox);
    expect(entries.length).toBe(2);
    expect(entries.every((e) => isEvictable(e))).toBe(true);
  });

  it('rejects an unknown classification', async () => {
    await expect(
      promoteDrainEntry(baseDir, {
        classification: 'other',
        block: 'x',
        entryIndex: 0,
        reason: 'r',
        date: '2026-07-19',
      })
    ).rejects.toThrow(/work|bug/);
  });
});

describe('crash-safe promote → stamp → evict convergence (S4.t4 — AC2.4)', () => {
  const INBOX_REL = '.planning/ISSUES-INBOX.md';
  const LEDGER_REL = '.planning/archive/ISSUES-INBOX-LEDGER.md';
  const SINGLE_INBOX = [
    '# Issues Inbox',
    '',
    'Preamble.',
    '',
    '---',
    '',
    '## An idea to promote',
    '',
    '**Status:** Logged 2026-07-03 via `/sig:add`.',
    '',
    'Real work that should land in the backlog.',
    '',
    '---',
    '',
  ].join('\n');

  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
    await writeFile(join(baseDir, INBOX_REL), SINGLE_INBOX, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  // Re-slice the (byte-stable) source block from the current inbox on disk.
  async function block0() {
    const c = await readFile(join(baseDir, INBOX_REL), 'utf-8');
    const e = parseEntries(c)[0];
    return c.slice(e.range.start, e.range.end);
  }

  const backlogKeyCount = (s) => (s.match(/<!-- backlog-key: /g) || []).length;
  const ledgerKeyCount = (s) => (s.match(/<!-- evicted-key: /g) || []).length;

  it('crash BEFORE the stamp → re-run dedupes; entry double-homes (destination + ledger), gone from inbox', async () => {
    const block = await block0();
    // Sequence step 1 ran (destination written), then the process died before
    // the stamp — the inbox is untouched, so the re-run re-slices the same bytes.
    await promoteToBacklog(baseDir, {
      block,
      tag: 'roadmap',
      title: 'An idea to promote',
      today: '2026-07-19',
    });

    // Re-run the WHOLE compose: promote (dedupe no-op) → stamp → evict.
    await promoteDrainEntry(baseDir, {
      classification: 'work',
      block,
      tag: 'roadmap',
      title: 'An idea to promote',
      entryIndex: 0,
      reason: 'M5.E3 drain',
      date: '2026-07-19',
    });
    await evictTerminalToLedger(baseDir);

    const backlog = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    const ledger = await readFile(join(baseDir, LEDGER_REL), 'utf-8');
    const inbox = await readFile(join(baseDir, INBOX_REL), 'utf-8');

    expect(backlogKeyCount(backlog)).toBe(1); // no duplicate in the destination
    expect(backlog).toContain('## An idea to promote'); // present in destination
    expect(ledger).toContain('Real work that should land in the backlog.'); // + ledger
    expect(ledgerKeyCount(ledger)).toBe(1);
    expect(inbox).not.toContain('## An idea to promote'); // gone from the inbox
  });

  it('crash AFTER the stamp, before evict → re-run completes eviction; no dupe, no loss', async () => {
    const block = await block0();
    await promoteDrainEntry(baseDir, {
      classification: 'work',
      block,
      tag: 'roadmap',
      title: 'An idea to promote',
      entryIndex: 0,
      reason: 'M5.E3 drain',
      date: '2026-07-19',
    });
    // Crash before evict: entry stamped terminal, still physically in the inbox.
    const midInbox = await readFile(join(baseDir, INBOX_REL), 'utf-8');
    expect(midInbox).toMatch(/→ Promoted 2026-07-19 \(M5\.E3 drain\)/);
    expect(parseEntries(midInbox).every((e) => isEvictable(e))).toBe(true);

    // Re-run: the entry is no longer a candidate (it's dispositioned); the sweep
    // evicts it. A second sweep is a no-op (idempotent).
    await evictTerminalToLedger(baseDir);
    const res2 = await evictTerminalToLedger(baseDir);
    expect(res2.evicted).toEqual([]);

    const backlog = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    const ledger = await readFile(join(baseDir, LEDGER_REL), 'utf-8');
    const inbox = await readFile(join(baseDir, INBOX_REL), 'utf-8');
    expect(backlogKeyCount(backlog)).toBe(1);
    expect(inbox).not.toContain('## An idea to promote');
    expect(ledgerKeyCount(ledger)).toBe(1);
  });

  it('injected crash ON the stamp write (destination already committed) → re-run converges, no dupe', async () => {
    const block = await block0();
    // A renameFn that throws on the INBOX (stamp) write but lets the destination
    // write through — so destination commits FIRST, then the stamp crashes. This
    // is the crash-between-the-two-writes case: it proves destination-first, since
    // a stamp-first order would strand a terminal entry with no destination home.
    const crashOnStamp = async (from, to) => {
      if (to.endsWith('ISSUES-INBOX.md')) throw new Error('simulated stamp crash');
      return rename(from, to);
    };
    await expect(
      promoteDrainEntry(baseDir, {
        classification: 'work',
        block,
        tag: 'roadmap',
        title: 'An idea to promote',
        entryIndex: 0,
        reason: 'M5.E3 drain',
        date: '2026-07-19',
        renameFn: crashOnStamp,
      })
    ).rejects.toThrow(/simulated stamp crash/);

    // Destination committed; inbox NOT yet stamped (still a live candidate).
    expect(backlogKeyCount(await readFile(join(baseDir, BACKLOG_REL), 'utf-8'))).toBe(1);
    expect(await readFile(join(baseDir, INBOX_REL), 'utf-8')).not.toMatch(/→ Promoted/);

    // Re-run without the crash: promote dedupes, the stamp lands, the sweep evicts.
    await promoteDrainEntry(baseDir, {
      classification: 'work',
      block,
      tag: 'roadmap',
      title: 'An idea to promote',
      entryIndex: 0,
      reason: 'M5.E3 drain',
      date: '2026-07-19',
    });
    await evictTerminalToLedger(baseDir);

    const backlog = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    const ledger = await readFile(join(baseDir, LEDGER_REL), 'utf-8');
    const inbox = await readFile(join(baseDir, INBOX_REL), 'utf-8');
    expect(backlogKeyCount(backlog)).toBe(1); // no dupe in the destination
    expect(inbox).not.toContain('## An idea to promote'); // evicted
    expect(ledgerKeyCount(ledger)).toBe(1);
  });
});

describe('light /sig:ship inbox sweep + execute exclusion (S4.t5 — AC2.6)', () => {
  it('ship.md wires evictTerminalToLedger with a dry-run preview, gated on Epic-close', () => {
    expect(shipMd).toContain('evictTerminalToLedger');
    expect(shipMd).toMatch(/dryRun:\s*true/);
    expect(shipMd.toLowerCase()).toContain('preview');
    expect(shipMd).toMatch(/isEpicClose|Epic-close/);
    expect(shipMd).toMatch(/gate_strictness/);
  });

  it('/sig:execute never invokes the sweep (AC2.6)', () => {
    expect(executeMd).not.toContain('evictTerminalToLedger');
  });

  it('the sweep mechanism evicts a terminal entry from the v3-named inbox', async () => {
    const baseDir = await stageBase();
    const INBOX_REL = '.planning/ISSUES-INBOX.md';
    const inbox = [
      '# Issues Inbox',
      '',
      '---',
      '',
      '## A promoted thing',
      '',
      '**Status:** Logged 2026-07-01. → Promoted 2026-07-19 (M5.E3 drain).',
      '',
      'Body.',
      '',
      '---',
      '',
    ].join('\n');
    await writeFile(join(baseDir, INBOX_REL), inbox, 'utf-8');
    const res = await evictTerminalToLedger(baseDir);
    expect(res.evicted.map((e) => e.heading)).toContain('A promoted thing');
    expect(await readFile(join(baseDir, INBOX_REL), 'utf-8')).not.toContain('## A promoted thing');
    await rm(baseDir, { recursive: true, force: true });
  });
});

describe('createBacklogIfMissing snapshot-seed branch (S4.t6 — create-if-missing only)', () => {
  // HARD constraint: a FAKE snapshot in a temp dir — never Signal's real repo,
  // where BACKLOG-REVIEW-2026-07-04.md is actually present.
  let baseDir;
  beforeEach(async () => {
    baseDir = await stageBase();
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('with a snapshot present → BACKLOG references it; body NOT restructured (S6b owns that)', async () => {
    await writeFile(
      join(baseDir, '.planning/BACKLOG-REVIEW-2026-07-04.md'),
      '# Backlog Review\n\nDistinctive snapshot body text.\n',
      'utf-8'
    );
    const res = await createBacklogIfMissing(baseDir, { today: '2026-07-19' });
    expect(res.created).toBe(true);
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toMatch(/^# Backlog/m);
    expect(text).toContain('BACKLOG-REVIEW-2026-07-04.md');
    expect(text).toMatch(/\*Last updated: 2026-07-19\*/);
    // create-if-missing ONLY — the snapshot content is not folded in here.
    expect(text).not.toContain('Distinctive snapshot body text.');
  });

  it('with no snapshot present → plain empty skeleton (no snapshot reference)', async () => {
    const res = await createBacklogIfMissing(baseDir, { today: '2026-07-19' });
    expect(res.created).toBe(true);
    const text = await readFile(join(baseDir, BACKLOG_REL), 'utf-8');
    expect(text).toMatch(/^# Backlog/m);
    expect(text).not.toContain('BACKLOG-REVIEW');
  });
});

describe('commands/plan.md classify step (S4.t3 — FR2 wiring in Step 1b)', () => {
  it('classifies with a strict-enum [work, bug] routing to promoteToBacklog / promoteToBugs', () => {
    expect(planMd).toMatch(/\[work, bug\]/);
    expect(planMd).toContain('promoteToBacklog');
    expect(planMd).toContain('promoteToBugs');
    expect(planMd).toContain('promoteDrainEntry');
  });

  it('a work promote takes a [roadmap, hygiene] tag and may retitle', () => {
    expect(planMd).toMatch(/\[roadmap, hygiene\]/);
    expect(planMd.toLowerCase()).toContain('retitle');
  });

  it('reads the inbox via the resolver, not a hardcoded FUTURE-IDEAS', () => {
    expect(planMd).toContain('resolveInboxPath');
    expect(planMd).toContain('ISSUES-INBOX.md');
    // back-compat mention retained so a legacy repo still reads
    expect(planMd).toMatch(/FUTURE-IDEAS\.md/);
  });
});
