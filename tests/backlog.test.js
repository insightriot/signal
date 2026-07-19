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
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createBacklogIfMissing,
  promoteToBacklog,
  promoteToBugs,
} from '../tools/lib/backlog.js';

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
