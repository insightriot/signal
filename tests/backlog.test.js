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
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createBacklogIfMissing,
  promoteToBacklog,
  promoteToBugs,
} from '../tools/lib/backlog.js';
import { parseEntries, isEvictable, promoteDrainEntry } from '../tools/lib/drain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const planMd = readFileSync(join(ROOT, 'commands', 'plan.md'), 'utf-8');

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
