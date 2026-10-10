// M6.E15 S4 — `/sig:docs-migrate --work-store` on a project whose lists have
// entries: the dry run lists every planned item, the apply archives the
// originals, writes the records, regenerates the views (FR6.1, FR6.4, AC1.2,
// D-M6E15-19, -20, -23, NFR security). See .planning/M6.E15-PLAN.md § S4.
//
// Fixtures are invented text in corpus project 1's shapes
// (`fixtures/work-migrate-corpus1/`); folder names and keys are invented
// (`tests/private-name-guard.test.js`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { checkRecords, listRecords } from '../plugin/tools/lib/work-records.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';
import { regeneratePlanningIndexCore } from '../plugin/tools/lib/planning-index.js';
import { runSweep } from '../plugin/tools/lib/sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'work-migrate-corpus1');
const LISTS = ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md'];
const fixture = (name) => readFileSync(join(FIX, name), 'utf-8');
const ARCHIVE = '.planning/archive/pre-work-store';
const VIEWS = ['.planning/BUGS.md', '.planning/BACKLOG.md', '.planning/ISSUES-INBOX.md', '.planning/OPEN-QUESTIONS.md', '.planning/work/EPICS.md'];

const git = (cwd, args, env = {}) => String(execFileSync('git', args, {
  cwd, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env },
}));
const at = (day) => ({ GIT_AUTHOR_DATE: `${day}T12:00:00Z`, GIT_COMMITTER_DATE: `${day}T12:00:00Z` });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
const commitAll = (dir, day, msg = 'c') => {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg], at(day));
};

const STATE = '---\nschema_version: 1\ndocs_layout_version: 3\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\n'
  + 'completed_phases: []\nblockers: []\n---\n# Project State\n\nbody\n';

// Every file under `dir` (outside .git), with its bytes and mtime.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isSymbolicLink()) out[p.slice(dir.length)] = 'link';
      else if (e.isDirectory()) walk(p);
      else out[p.slice(dir.length)] = `${statSync(p).mtimeMs}:${readFileSync(p, 'utf-8')}`;
    }
  };
  walk(dir);
  return out;
}

let root;
let base;
const read = (rel) => readFileSync(join(base, rel), 'utf-8');
const write = (rel, text) => {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), text);
};

// A git project with the corpus-1 lists. BUGS.md is first committed on
// 2026-01-05 (title only), then all four lists land on 2026-02-20 — so BUGS.md's
// first/last dates differ and the other three's are both 2026-02-20.
function corpusProject({ texts = {} } = {}) {
  base = join(root, 'leaf-notes');
  mkdirSync(join(base, '.planning'), { recursive: true });
  initRepo(base);
  write('.planning/STATE.md', STATE);
  write('.planning/BUGS.md', '# Bugs\n');
  commitAll(base, '2026-01-05');
  for (const f of LISTS) write(`.planning/${f}`, texts[f] ?? fixture(f));
  commitAll(base, '2026-02-20');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'signal-wml-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const asideLeft = () => readdirSync(join(base, '.planning')).filter((n) => n.startsWith('.work-store-'));

describe('t4.1 — the dry run lists every planned item and writes nothing (AC1.2)', () => {
  it('prints the key, per-file counts and every item’s new ID, old ID, title and status', async () => {
    corpusProject();
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { key: 'LF' });
    expect(r.refused).toBeUndefined();
    expect(r.dryRun).toBe(true);
    expect(r.key).toBe('LF');
    expect(r.items).toHaveLength(23);
    expect(r.items.map((i) => i.id)).toEqual(Array.from({ length: 23 }, (_, i) => `LF-${i + 1}`));
    expect(r.files.map((f) => [f.file, f.items])).toEqual([
      ['.planning/BUGS.md', 8], ['.planning/BACKLOG.md', 10], ['.planning/ISSUES-INBOX.md', 1], ['.planning/OPEN-QUESTIONS.md', 4],
    ]);
    for (const f of r.files) {
      expect(f.open + f.closed, f.file).toBe(f.items);
      expect(r.report, f.file).toContain(`${f.file}: ${f.items} items (${f.open} open, ${f.closed} closed, ${f.flagged} flagged), ${f.regions.length} non-item region`);
    }
    for (const it of r.items) {
      const line = r.report.split('\n').find((l) => l.includes(`${it.id} `));
      expect(line, it.id).toBeDefined();
      expect(line).toContain(it.title);
      expect(line).toContain(it.legacy_id ?? '—');
      expect(line).toMatch(new RegExp(`\\b${it.status}\\b`));
    }
    expect(r.items.find((i) => i.legacy_id === 'B1')).toMatchObject({ status: 'C' });
    expect(r.items.find((i) => i.legacy_id === '#244')).toMatchObject({ status: 'T' });
    expect(r.report).toMatch(/flagged/);
    expect(typeof r.inputHash).toBe('string');
    expect(snapshot(base)).toEqual(before);
  });
});

describe('t4.1 — apply: originals archived byte-for-byte, records + views written, staged (FR6.1, AC1.3)', () => {
  it('archives, writes 23 records, regenerates the views, checkRecords is clean, stages and tags', async () => {
    corpusProject();
    const dry = await runWorkStoreMigrate(base, { key: 'LF' });
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', expectedHash: dry.inputHash, stamp: 'T1' });
    expect(r.applied).toBe(true);

    for (const f of LISTS) expect(read(`${ARCHIVE}/${f}`), f).toBe(fixture(f));
    const manifest = JSON.parse(read(`${ARCHIVE}/MANIFEST.json`));
    expect(manifest.key).toBe('LF');
    expect(manifest.items).toHaveLength(23);
    expect(manifest.items[0].ranges[0]).toEqual({ line: expect.any(Number), endLine: expect.any(Number) });
    for (const f of LISTS) expect(manifest.files[f].verified, f).toBe(true);
    expect(manifest.verification).toMatchObject({ ok: true, checkRecords: [] });
    expect(manifest.dates['BUGS.md']).toEqual({ first: '2026-01-05', last: '2026-02-20', source: 'git' });

    const listed = listRecords(base);
    expect(listed.records).toHaveLength(23);
    expect(listed.broken).toEqual([]);
    expect(checkRecords(base)).toEqual([]);
    const b1 = listed.records.find((x) => x.record.legacy_id === 'B1');
    expect(b1.record.events.at(-1)).toMatchObject({ type: 'closed', legacy: true });
    for (const v of VIEWS) expect(read(v).split('\n')[0], v).toBe(GENERATED_MARKER);
    expect(asideLeft()).toEqual([]);

    const staged = git(base, ['diff', '--cached', '--name-only']).trim().split('\n');
    for (const f of LISTS) expect(staged).toContain(`${ARCHIVE}/${f}`);
    expect(staged).toContain(`${ARCHIVE}/MANIFEST.json`);
    expect(staged).toContain('.planning/work/WORK.md');
    for (const v of VIEWS) expect(staged).toContain(v);
    expect(staged.filter((p) => p.startsWith('.planning/work/items/'))).toHaveLength(46);
    expect(git(base, ['rev-list', '--count', 'HEAD']).trim()).toBe('2'); // not committed
    expect(r.tag).toBe('pre-work-store-T1');
    expect(r.revertLine).toContain('git reset --hard pre-work-store-T1');
    expect(r.report).toContain(r.revertLine);
    expect(existsSync(join(base, '.planning/work/.lock'))).toBe(false);
  });
});

describe('t4.8 — a project with an INDEX.md: the apply regenerates it, stages it, and puts it back on failure', () => {
  // corpusProject, plus a managed INDEX.md generated from the lists and committed.
  async function withIndex() {
    corpusProject();
    await regeneratePlanningIndexCore(base);
    commitAll(base, '2026-02-21');
    return read('.planning/INDEX.md');
  }

  it('after the apply, /sig:docs-sweep reports no stale INDEX.md and no orphan item files', async () => {
    const before = await withIndex();
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(read('.planning/INDEX.md')).not.toBe(before);
    expect(git(base, ['diff', '--cached', '--name-only']).trim().split('\n')).toContain('.planning/INDEX.md');
    const { findings } = await runSweep(base);
    expect(findings.filter((f) => f.check === 'index-freshness')).toEqual([]);
    expect(findings.filter((f) => f.check === 'orphan-doc' && String(f.file).startsWith('.planning/work/'))).toEqual([]);
  });

  it('a failure after the INDEX.md regeneration puts INDEX.md back byte for byte', async () => {
    const before = await withIndex();
    const fail = (s) => {
      if (s === 'index') throw new Error('injected failure at index');
    };
    await expect(runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1', onSwapStep: fail })).rejects.toThrow(/injected failure/);
    expect(read('.planning/INDEX.md')).toBe(before);
    for (const f of LISTS) expect(read(`.planning/${f}`), f).toBe(fixture(f));
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');
  });

  it('a project with no INDEX.md does not get one', async () => {
    corpusProject();
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(existsSync(join(base, '.planning/INDEX.md'))).toBe(false);
  });

  it('a hand-written (foreign) INDEX.md is left as it is, and the report says so', async () => {
    corpusProject();
    write('.planning/INDEX.md', '# Our own index\n\nWritten by hand.\n');
    commitAll(base, '2026-02-21');
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(read('.planning/INDEX.md')).toBe('# Our own index\n\nWritten by hand.\n');
    expect(r.report).toMatch(/INDEX\.md.*left as it is/);
  });

  it('an INDEX.md that is a symbolic link is not followed or written; the report says so', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'INDEX.md'), 'outside\n');
    corpusProject();
    symlinkSync(join(outside, 'INDEX.md'), join(base, '.planning/INDEX.md'));
    commitAll(base, '2026-02-21');
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(readFileSync(join(outside, 'INDEX.md'), 'utf-8')).toBe('outside\n');
    expect(r.report).toMatch(/INDEX\.md is a symbolic link or not a regular file/);
  });
});

describe('t4.2 — built aside, then swapped; a failure mid-swap puts the project back (D-M6E15-20)', () => {
  it.each(['archive', 'work', 'views', 'verify'])('a failure at the %s step: originals byte-identical, no work/, no archive, tag removed', async (step) => {
    corpusProject();
    const before = snapshot(base);
    const fail = (s) => {
      if (s === step) throw new Error(`injected failure at ${s}`);
    };
    await expect(runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1', onSwapStep: fail })).rejects.toThrow(/injected failure/);
    for (const f of LISTS) expect(read(`.planning/${f}`), f).toBe(fixture(f));
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
    expect(existsSync(join(base, '.planning/archive'))).toBe(false);
    expect(asideLeft()).toEqual([]);
    expect(git(base, ['tag', '-l']).trim()).toBe('');
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');
    expect(Object.keys(snapshot(base)).sort()).toEqual(Object.keys(before).sort());
  });
});

describe('t4.3 — the input hash covers STATE.md and the four lists (AC6.4)', () => {
  it('a list edited between the dry run and the apply aborts before any write', async () => {
    corpusProject();
    const dry = await runWorkStoreMigrate(base, { key: 'LF' });
    write('.planning/ISSUES-INBOX.md', `${fixture('ISSUES-INBOX.md')}\n## A capture added after the dry run\n`);
    commitAll(base, '2026-02-21');
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', expectedHash: dry.inputHash, stamp: 'T1' });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(snapshot(base)).toEqual(before);
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  });

  it('the dry run’s hash moves when any list or STATE.md changes', async () => {
    corpusProject();
    const h0 = (await runWorkStoreMigrate(base, { key: 'LF' })).inputHash;
    write('.planning/OPEN-QUESTIONS.md', `${fixture('OPEN-QUESTIONS.md')}x`);
    const h1 = (await runWorkStoreMigrate(base, { key: 'LF' })).inputHash;
    write('.planning/STATE.md', STATE.replace('body', 'edited'));
    const h2 = (await runWorkStoreMigrate(base, { key: 'LF' })).inputHash;
    expect(new Set([h0, h1, h2]).size).toBe(3);
  });
});

describe('t4.4 — dates from git, else the file’s mtime, stated in the manifest (D-M6E15-19)', () => {
  it('git: created at each file’s first commit; an undated close at its last commit', async () => {
    corpusProject();
    await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    const { records } = listRecords(base);
    const bugs = records.filter((x) => x.record.source === 'migration:BUGS.md');
    for (const b of bugs) expect(b.record.events[0].at.slice(0, 10) <= '2026-01-05', b.id).toBe(true);
    const inbox = records.filter((x) => x.record.source === 'migration:ISSUES-INBOX.md');
    for (const b of inbox) expect(b.record.events[0].at.slice(0, 10), b.id).toBe('2026-02-20');
    const b1 = bugs.find((x) => x.record.legacy_id === 'B1');
    expect(b1.record.events.at(-1).at.slice(0, 10)).toBe('2026-02-20');
  });

  it('a list renamed by the layout migration dates from its original first commit, not the rename (t4.8)', async () => {
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning'), { recursive: true });
    initRepo(base);
    write('.planning/STATE.md', STATE);
    write('.planning/FUTURE-IDEAS.md', fixture('ISSUES-INBOX.md'));
    commitAll(base, '2025-11-02');
    git(base, ['mv', '.planning/FUTURE-IDEAS.md', '.planning/ISSUES-INBOX.md']);
    commitAll(base, '2026-02-20', 'layout migration: rename');
    const r = await runWorkStoreMigrate(base, { key: 'LF' });
    expect(r.dryRun).toBe(true);
    expect(r.dates['ISSUES-INBOX.md']).toEqual({ first: '2025-11-02', last: '2026-02-20', source: 'git' });
  });

  it('no git: each file’s mtime, and the manifest says so', async () => {
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning'), { recursive: true });
    write('.planning/STATE.md', STATE);
    const when = new Date('2026-02-03T12:00:00Z');
    for (const f of LISTS) {
      write(`.planning/${f}`, fixture(f));
      utimesSync(join(base, '.planning', f), when, when);
    }
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(r.mode).toBe('fs-backup');
    const manifest = JSON.parse(read(`${ARCHIVE}/MANIFEST.json`));
    for (const f of LISTS) expect(manifest.dates[f], f).toEqual({ first: '2026-02-03', last: '2026-02-03', source: 'mtime' });
    expect(checkRecords(base)).toEqual([]);
  });
});

describe('a real secret stops the apply for a decision (NFR security, D-M6E15-23)', () => {
  const SECRET = `AKIA${'Q'.repeat(16)}`;
  const withSecret = () => fixture('BUGS.md').replace('not reproduced.', `not reproduced. Logs show ${SECRET}.`);

  it('dry run: lists the hit; apply: aborted, nothing written; acknowledged: applied', async () => {
    corpusProject({ texts: { 'BUGS.md': withSecret() } });
    const dry = await runWorkStoreMigrate(base, { key: 'LF' });
    expect(dry.dryRun).toBe(true);
    expect(dry.sensitiveHits).toEqual([expect.objectContaining({ file: 'BUGS.md', type: 'aws-key' })]);
    expect(dry.report).toMatch(/sensitive/i);

    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', expectedHash: dry.inputHash, stamp: 'T1' });
    expect(r.applied).toBe(false);
    expect(r.aborted).toBe('sensitive-data-pending');
    expect(r.hits).toEqual([expect.objectContaining({ file: 'BUGS.md', type: 'aws-key' })]);
    expect(snapshot(base)).toEqual(before);
    expect(existsSync(join(base, '.planning/work'))).toBe(false);
    expect(git(base, ['tag', '-l']).trim()).toBe('');

    const ok = await runWorkStoreMigrate(base, { apply: true, key: 'LF', expectedHash: dry.inputHash, stamp: 'T2', acknowledgeSensitive: true });
    expect(ok.applied).toBe(true);
    const manifest = JSON.parse(read(`${ARCHIVE}/MANIFEST.json`));
    expect(JSON.stringify(manifest)).not.toContain(SECRET);
  });

  it('Signal’s own backlog-key comment (in the corpus BACKLOG.md) does not stop it', async () => {
    corpusProject();
    const dry = await runWorkStoreMigrate(base, { key: 'LF' });
    expect(dry.sensitiveHits).toEqual([]);
  });
});

describe('t4.6 — a hostile repository: links are text, linked paths are refused (NFR security)', () => {
  it('a link in list text pointing outside the repo is kept as text and never followed', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'TOPSECRET-CONTENT\n');
    corpusProject({ texts: { 'BUGS.md': `${fixture('BUGS.md')}\n## Reads a file it should not\n\n**Status:** confirmed\n\nSee [the file](../../outside/secret.txt).\n` } });
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LF', stamp: 'T1' });
    expect(r.applied).toBe(true);
    const { records } = listRecords(base, { bodies: true });
    const hit = records.find((x) => x.record.title.includes('Reads a file'));
    const body = read(hit.path.replace(/\.json$/, '.md'));
    expect(body).toContain('outside/secret.txt');
    for (const x of records) expect(read(x.path.replace(/\.json$/, '.md'))).not.toContain('TOPSECRET');
    expect(readFileSync(join(outside, 'secret.txt'), 'utf-8')).toBe('TOPSECRET-CONTENT\n');
  });

  const refusedBoth = async (pattern, outsideDir) => {
    const outsideBefore = outsideDir ? snapshot(outsideDir) : null;
    for (const apply of [false, true]) {
      const before = snapshot(base);
      const r = await runWorkStoreMigrate(base, { apply, key: 'LF', stamp: 'T1' });
      expect(r.refused, `apply: ${apply}`).toBe(true);
      expect(r.reason).toMatch(pattern);
      expect(snapshot(base)).toEqual(before);
      if (outsideDir) expect(snapshot(outsideDir)).toEqual(outsideBefore);
    }
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  };

  it('a list file that is a symbolic link (to outside the repo) is refused before any read or write', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'BUGS.md'), fixture('BUGS.md'));
    corpusProject();
    rmSync(join(base, '.planning/BUGS.md'));
    symlinkSync(join(outside, 'BUGS.md'), join(base, '.planning/BUGS.md'));
    commitAll(base, '2026-02-21');
    await refusedBoth(/BUGS\.md is a symbolic link/, outside);
  });

  it('.planning/work linked to a folder outside the repo is refused, and nothing lands there', async () => {
    const outside = join(root, 'outside-work');
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep.txt'), 'x\n');
    corpusProject();
    symlinkSync(outside, join(base, '.planning/work'));
    commitAll(base, '2026-02-21');
    await refusedBoth(/symbolic link/, outside);
  });

  it('.planning linked to a folder outside the repo is refused, and nothing lands there', async () => {
    const outside = join(root, 'outside-planning');
    mkdirSync(outside);
    writeFileSync(join(outside, 'STATE.md'), STATE);
    for (const f of LISTS) writeFileSync(join(outside, f), fixture(f));
    base = join(root, 'leaf-notes');
    mkdirSync(base);
    initRepo(base);
    symlinkSync(outside, join(base, '.planning'));
    commitAll(base, '2026-02-20');
    await refusedBoth(/outside the repo/, outside);
  });
});

describe('t4.7 — a dry run on a 400-line list finishes well under 5 s (NFR performance)', () => {
  it('400-line BACKLOG.md', async () => {
    const rows = ['# Backlog', ''];
    for (let i = 1; rows.length < 398; i++) {
      rows.push(`### #${i} — Idea number ${i} · **roadmap** · small`, `Text about idea ${i}, with a [link](docs/x${i}.md).`,
        i % 5 === 0 ? `**Done** in v${i}, 2026-02-0${(i % 9) + 1}.` : 'More text.', '');
    }
    rows.push('*Last updated: 2026-02-01*', '');
    expect(rows.length).toBe(400);
    corpusProject({ texts: { 'BACKLOG.md': rows.join('\n') } });
    const t0 = performance.now();
    const r = await runWorkStoreMigrate(base, { key: 'LF' });
    const ms = performance.now() - t0;
    expect(r.dryRun).toBe(true);
    expect(ms).toBeLessThan(5000);
  });
});

describe('AC6.2 — a byte the plan cannot account for refuses the whole apply (integration)', () => {
  it('a segmentation that drops a line → dry run and apply refused, nothing written, no tag', async () => {
    const { segmentBugs } = await import('../plugin/tools/lib/work-migrate.js');
    // Drops the last orphan/gap piece, so its lines are in no record or region.
    const lossy = (text) => {
      const seg = segmentBugs(text);
      return { ...seg, gaps: seg.gaps.slice(0, -1) };
    };
    corpusProject();
    for (const apply of [false, true]) {
      const before = snapshot(base);
      const r = await runWorkStoreMigrate(base, { apply, key: 'LF', stamp: 'T1', segmenters: { 'BUGS.md': lossy } });
      expect(r.refused, `apply: ${apply}`).toBe(true);
      expect(r.reason).toMatch(/could not be planned as records/);
      expect(r.reason).toMatch(/BUGS\.md: line \d+.* is in no record or region/);
      expect(snapshot(base)).toEqual(before);
      expect(existsSync(join(base, '.planning/work'))).toBe(false);
    }
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  });
});

// ── REVIEW pass 1, fix loop 1, batch B ───────────────────────────────────────

// Refused in a dry run and an apply, nothing written; `outsideDir` unchanged too.
async function refusedEither(pattern, { outsideDir, notIn } = {}) {
  const outsideBefore = outsideDir ? snapshot(outsideDir) : null;
  for (const apply of [false, true]) {
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply, key: 'LF', stamp: 'T1', expectedHash: 'x' });
    expect(r.refused, `apply: ${apply}`).toBe(true);
    expect(r.reason).toMatch(pattern);
    if (notIn) expect(r.reason).not.toContain(notIn);
    expect(snapshot(base)).toEqual(before);
    if (outsideDir) expect(snapshot(outsideDir)).toEqual(outsideBefore);
  }
  expect(git(base, ['tag', '-l']).trim()).toBe('');
}

describe('I5 — the lock paths are confined; a leftover work lock is refused (NFR security)', () => {
  const SECRET = 'TOKEN=very-private-value-0451';

  it('.planning/work/.lock linked to the project’s .env: refused, the .env never read or printed', async () => {
    corpusProject();
    writeFileSync(join(base, '.env'), `${SECRET}\n`);
    mkdirSync(join(base, '.planning/work'));
    symlinkSync('../../.env', join(base, '.planning/work/.lock'));
    await refusedEither(/\.planning\/work\/\.lock/, { notIn: 'very-private' });
    expect(readFileSync(join(base, '.env'), 'utf-8')).toBe(`${SECRET}\n`);
  });

  it('.planning/.add.lock linked to the .env: refused the same way', async () => {
    corpusProject();
    writeFileSync(join(base, '.env'), `${SECRET}\n`);
    symlinkSync('../.env', join(base, '.planning/.add.lock'));
    await refusedEither(/\.planning\/\.add\.lock/, { notIn: 'very-private' });
  });

  it('a regular .planning/work/.lock with no store is left over: refused, naming it', async () => {
    corpusProject();
    mkdirSync(join(base, '.planning/work'));
    writeFileSync(join(base, '.planning/work/.lock'), '123\n0\n');
    await refusedEither(/\.planning\/work\/\.lock[^\n]*left over/);
  });
});

describe('S4 — a run killed part-way is refused, never re-applied as an empty store', () => {
  it('archive copies with no MANIFEST.json and no lists → refused, naming the pre-work-store tag reset', async () => {
    corpusProject();
    mkdirSync(join(base, ARCHIVE), { recursive: true });
    for (const f of LISTS) git(base, ['mv', `.planning/${f}`, `${ARCHIVE}/${f}`]);
    commitAll(base, '2026-02-21');
    await refusedEither(/interrupted[\s\S]*git tag -l 'pre-work-store-\*'[\s\S]*git reset --hard/);
  });

  it('the same with WORK.md already in place (killed after it moved) → the interrupted refusal, not "already on the store"', async () => {
    corpusProject();
    mkdirSync(join(base, ARCHIVE), { recursive: true });
    git(base, ['mv', '.planning/BUGS.md', `${ARCHIVE}/BUGS.md`]);
    write('.planning/work/WORK.md', '---\nkey: LF\nschema_version: 2\n---\n');
    commitAll(base, '2026-02-21');
    await refusedEither(/interrupted/);
  });
});

describe('STATE.md is read only as a regular file', () => {
  it('STATE.md linked outside the repo → refused, the target not read', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'STATE.md'), STATE);
    corpusProject();
    rmSync(join(base, '.planning/STATE.md'));
    symlinkSync(join(outside, 'STATE.md'), join(base, '.planning/STATE.md'));
    commitAll(base, '2026-02-21');
    await refusedEither(/STATE\.md is a symbolic link/, { outsideDir: outside });
  });
});
