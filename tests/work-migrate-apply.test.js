// applyMigration — the write half of the migration (M6.E11.S7 t7.2, AC-9.3, AC-9.5).
// See .planning/M6.E11-PLAN.md § S7 and D-M6E11-14 / -15 (revised) / -18 / -21 / -24.
//
// Every test runs on a temp COPY of Signal's four lists, never on the repo's
// own `.planning/`. The copy is taken from `.planning/archive/pre-work-store/`
// once the real apply has happened (the live files are generated after it), and
// from `.planning/` before — so this file needs no repointing at t7.2.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyMigration, formatMigrationReport, planMigration, SOURCES } from '../plugin/tools/lib/work-migrate.js';
import { generateFiles, GENERATED_MARKER, WATCHLIST_FILE } from '../plugin/tools/lib/work-generate.js';
import { parseItem } from '../plugin/tools/lib/work-item.js';
import { checkStore, isStoreOn, parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';
import { walkBugEntries, compareBugTally } from '../plugin/tools/lib/bugs-tally.js';
import { parseBacklogRows } from '../plugin/tools/lib/backlog.js';
import { listDrainCandidates, parseTriggerWatchlist } from '../plugin/tools/lib/drain.js';
import { countOpenQuestions } from '../plugin/tools/lib/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATE = '2026-09-29';
const CLI = join(ROOT, 'tools', 'work-migrate.mjs');

const ARCHIVED = join(ROOT, '.planning', 'archive', 'pre-work-store');
const SOURCE_DIR = existsSync(join(ARCHIVED, 'BUGS.md')) ? ARCHIVED : join(ROOT, '.planning');
const original = (f) => readFileSync(join(SOURCE_DIR, f));

const tmps = [];
afterAll(() => {
  for (const t of tmps) rmSync(t, { recursive: true, force: true });
});

function makeProject({ git = false, edit } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'work-apply-'));
  tmps.push(dir);
  const planning = join(dir, '.planning');
  mkdirSync(planning);
  for (const f of SOURCES) writeFileSync(join(planning, f), original(f));
  writeFileSync(join(planning, 'STATE.md'), '---\nschema_version: 1\nphase: EXECUTE\n---\n\n# State\n');
  writeFileSync(join(planning, 'PROFILE.md'), '---\ntier: FULL\n---\n\n# Profile\n');
  if (edit) edit(planning);
  if (git) {
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    g('init', '-q');
    g('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
    g('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
  }
  return dir;
}

// Every file under the project, as bytes. `.git` is left out: git's own index
// is not part of the tree a failed apply must leave untouched.
function tree(dir) {
  const out = {};
  for (const abs of walkFiles(dir)) {
    const rel = relative(dir, abs).split(sep).join('/');
    if (rel.startsWith('.git/')) continue;
    out[rel] = readFileSync(abs).toString('base64');
  }
  const dirs = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      if (e.isDirectory()) {
        dirs.push(relative(dir, join(d, e.name)));
        walk(join(d, e.name));
      }
    }
  })(dir);
  return { files: out, dirs: dirs.sort() };
}

const itemFileCount = (dir) =>
  walkFiles(join(dir, '.planning', 'work')).filter((p) => parseItemFileName(p.slice(p.lastIndexOf(sep) + 1))).length;

describe('dry run (the default)', () => {
  let dir;
  let before;
  let report;

  beforeAll(async () => {
    dir = makeProject();
    before = tree(dir);
    report = await applyMigration(dir, { date: DATE });
  }, 60_000);

  it('writes nothing', () => {
    expect(tree(dir)).toEqual(before);
    expect(report.dryRun).toBe(true);
  });

  it('reports the same counts the plan derives, per source and per status', () => {
    const plan = planMigration(dir, { today: DATE });
    expect(report.total).toBe(plan.items.length);
    expect(report.bySource).toEqual(plan.counts.bySource);
    expect(report.byStatus).toEqual(plan.counts.byStatus);
    expect(report.byOutcome).toEqual(plan.counts.byOutcome);
    expect(Object.values(report.bySource).reduce((a, b) => a + b, 0)).toBe(report.total);
    expect(report.notes).toBe(plan.notes.length);
    expect(report.orphans).toEqual(plan.orphans.map(({ source, name, line, endLine }) => ({ source, name, line, endLine })));
    expect(report.watchlistRows).toBe(parseTriggerWatchlist(plan.watchlist.text).rows.length);
    expect(report.collisions).toEqual([]);
  });

  it('names the first and last id per source, and the un-numbered bugs start after the highest B-id in the file', () => {
    const highest = Math.max(...walkBugEntries(original('BUGS.md').toString()).filter((e) => e.kind === 'row').map((e) => Number(e.id.slice(1))));
    expect(report.bugs.highestNumbered).toBe(highest);
    expect(report.bugs.unnumberedFirst).toBe(`SIG-${highest + 1}`);
    for (const s of SOURCES) {
      if (!report.bySource[s]) continue;
      expect(report.idRange[s].first).toMatch(/^SIG-\d+$/);
      expect(report.idRange[s].last).toMatch(/^SIG-\d+$/);
    }
    expect(report.idRange['BUGS.md'].first).toBe('SIG-1');
  });

  it('formatMigrationReport renders a markdown record with every count, and no generated marker', () => {
    const md = formatMigrationReport(report);
    expect(md.split('\n')[0]).not.toBe(GENERATED_MARKER);
    expect(md).not.toContain(GENERATED_MARKER);
    expect(md).toContain(`**${report.total}**`);
    for (const s of SOURCES) expect(md).toContain(`| ${s} | ${report.bySource[s]} |`);
    for (const o of report.orphans) expect(md).toContain(`${o.source}:${o.line}–${o.endLine}`);
    expect(md).toMatch(/dry run/i);
  });
});

describe('numbering is read from the file at run time (D-M6E11-15, revised)', () => {
  it('a B-id added after planning pushes the un-numbered bugs up by one', async () => {
    const dir = makeProject({
      edit: (planning) => {
        const p = join(planning, 'BUGS.md');
        const text = readFileSync(p, 'utf-8');
        const highest = Math.max(...walkBugEntries(text).filter((e) => e.kind === 'row').map((e) => Number(e.id.slice(1))));
        const at = text.indexOf(`| B${highest} |`);
        writeFileSync(p, `${text.slice(0, at)}| B${highest + 1} | \`confirmed\` | P3 | **A fix-lane row landed on main.** |\n${text.slice(at)}`);
      },
    });
    const text = readFileSync(join(dir, '.planning', 'BUGS.md'), 'utf-8');
    const highest = Math.max(...walkBugEntries(text).filter((e) => e.kind === 'row').map((e) => Number(e.id.slice(1))));
    const report = await applyMigration(dir, { date: DATE });
    expect(report.bugs.highestNumbered).toBe(highest);
    expect(report.bugs.unnumberedFirst).toBe(`SIG-${highest + 1}`);
  }, 60_000);
});

describe('apply', () => {
  let dir;
  let report;
  let plan;

  beforeAll(async () => {
    dir = makeProject({ git: true });
    plan = planMigration(dir, { today: DATE });
    report = await applyMigration(dir, { date: DATE, dryRun: false });
  }, 120_000);

  it('creates one item file per planned item — the count equals the report total', () => {
    expect(report.dryRun).toBe(false);
    expect(itemFileCount(dir)).toBe(report.total);
    expect(report.total).toBe(plan.items.length);
  });

  it('writes each item where the plan put it, byte-for-byte the plan\'s item and body', () => {
    for (const { item, body, dir: d } of plan.items) {
      const parsed = parseItem(readFileSync(join(dir, '.planning', d, `${item.id}.md`), 'utf-8'));
      expect(parsed.errors, item.id).toEqual([]);
      expect(parsed.item, item.id).toEqual(item);
      expect(parsed.body, item.id).toBe(body);
    }
    // N → inbox, T → backlog, C → done/YYYY-MM; no Epic folders at migration.
    expect(existsSync(join(dir, '.planning', 'work', 'epics'))).toBe(false);
    expect(readdirSync(join(dir, '.planning', 'work', 'done'))).toEqual([DATE.slice(0, 7)]);
  });

  it('keeps the four originals byte-identical under archive/pre-work-store/, with a README that is not generated', () => {
    const arch = join(dir, '.planning', 'archive', 'pre-work-store');
    for (const f of SOURCES) expect(readFileSync(join(arch, f)).equals(original(f)), f).toBe(true);
    const readme = readFileSync(join(arch, 'README.md'), 'utf-8');
    expect(readme).not.toContain(GENERATED_MARKER);
    expect(readme).toContain(DATE);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
    expect(readme).toContain(head);
  });

  it('writes WORK.md (key SIG, schema_version 1) and WATCHLIST.md verbatim', () => {
    expect(isStoreOn(dir)).toEqual({ on: true, key: 'SIG' });
    const work = readFileSync(join(dir, '.planning', 'work', 'WORK.md'), 'utf-8');
    expect(work).toMatch(/^---\nkey: SIG\nschema_version: 1\n---\n/);
    expect(work).toContain('/sig:item');
    expect(readFileSync(join(dir, '.planning', 'work', WATCHLIST_FILE), 'utf-8')).toBe(plan.watchlist.text);
  });

  it('the four lists are now generated — and identical to the round-trip pipeline\'s output', () => {
    const expected = generateFiles({ items: plan.items, watchlist: { text: plan.watchlist.text, dir: 'work' } });
    for (const f of SOURCES) {
      const text = readFileSync(join(dir, '.planning', f), 'utf-8');
      expect(text.split('\n')[0], f).toBe(GENERATED_MARKER);
      expect(text, f).toBe(expected[f]);
    }
  });

  it('checkStore finds nothing wrong', () => {
    expect(checkStore(dir)).toEqual([]);
  });

  it('each shipped reader over the generated files agrees with the items', () => {
    const items = plan.items.map((i) => i.item);
    const gen = (f) => readFileSync(join(dir, '.planning', f), 'utf-8');
    const word = (it) =>
      it.status === 'N' ? 'needs-triage' : it.status === 'C' ? (it.close.reason === 'fixed' ? 'fixed' : 'dismissed') : 'confirmed';
    expect(walkBugEntries(gen('BUGS.md')).map((e) => `${e.id} ${e.status}`).sort()).toEqual(
      items.filter((it) => it.type === 'BUG').map((it) => `B${it.id.slice(4)} ${word(it)}`).sort()
    );
    expect(compareBugTally(gen('BUGS.md')).ok).toBe(true);
    expect(parseBacklogRows(gen('BACKLOG.md'), { maxDepth: 4 }).map((r) => r.text).sort()).toEqual(
      items
        .filter((it) => ['T', 'Q', 'P'].includes(it.status) && it.type !== 'BUG' && it.type !== 'Q')
        .map((it) => `${it.title.replace(/~~/g, '')} · ${it.id}`)
        .sort()
    );
    expect(listDrainCandidates(gen('ISSUES-INBOX.md')).map((c) => c.heading)).toEqual(
      items.filter((it) => it.status === 'N' && it.type !== 'BUG' && it.type !== 'Q').map((it) => it.title)
    );
    expect(parseTriggerWatchlist(gen('ISSUES-INBOX.md'))).toEqual(parseTriggerWatchlist(original('ISSUES-INBOX.md').toString()));
    expect(countOpenQuestions(gen('OPEN-QUESTIONS.md'))).toBe(items.filter((it) => it.type === 'Q' && it.status !== 'C').length);
  });

  it('leaves no lock behind', () => {
    expect(existsSync(join(dir, '.planning', 'work', '.lock'))).toBe(false);
  });

  it('refuses a second apply (CONFLICT) and writes nothing', async () => {
    const before = tree(dir);
    await expect(applyMigration(dir, { date: DATE, dryRun: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tree(dir)).toEqual(before);
  });
});

describe('refusals, before anything is written', () => {
  it('a source that is already a generated file (GENERATED)', async () => {
    const dir = makeProject({
      edit: (planning) => {
        const p = join(planning, 'OPEN-QUESTIONS.md');
        writeFileSync(p, `${GENERATED_MARKER}\n${readFileSync(p, 'utf-8')}`);
      },
    });
    const before = tree(dir);
    await expect(applyMigration(dir, { date: DATE, dryRun: false })).rejects.toMatchObject({ code: 'GENERATED' });
    expect(tree(dir)).toEqual(before);
  });

  it('an item id the plan would write is already taken (CONFLICT), and the dry run names it', async () => {
    const dir = makeProject({
      edit: (planning) => {
        mkdirSync(join(planning, 'work', 'backlog'), { recursive: true });
        writeFileSync(join(planning, 'work', 'backlog', 'SIG-5.md'), '---\nid: SIG-5\ntype: FEAT\nstatus: T\n---\n');
      },
    });
    const before = tree(dir);
    const report = await applyMigration(dir, { date: DATE });
    expect(report.collisions).toEqual(['SIG-5']);
    await expect(applyMigration(dir, { date: DATE, dryRun: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tree(dir)).toEqual(before);
  });

  it('an existing archive/pre-work-store/ (CONFLICT)', async () => {
    const dir = makeProject({
      edit: (planning) => {
        mkdirSync(join(planning, 'archive', 'pre-work-store'), { recursive: true });
        writeFileSync(join(planning, 'archive', 'pre-work-store', 'BUGS.md'), 'older copy\n');
      },
    });
    const before = tree(dir);
    await expect(applyMigration(dir, { date: DATE, dryRun: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tree(dir)).toEqual(before);
  });
});

describe('a failed apply leaves the tree as it was', () => {
  it.each([
    ['half-way through the item files', (rel, n) => n === 120],
    ['after WATCHLIST.md, before WORK.md', (rel) => rel.endsWith(`work/${WATCHLIST_FILE}`)],
    ['after WORK.md, before generation', (rel) => rel.endsWith('work/WORK.md')],
    ['after generation overwrote the lists', (rel) => rel === '.planning/OPEN-QUESTIONS.md'],
  ])('%s', async (_label, when) => {
    const dir = makeProject({ git: true });
    const before = tree(dir);
    let n = 0;
    const boom = new Error('injected failure');
    const _afterWrite = (rel) => {
      n += 1;
      if (when(rel, n)) throw boom;
    };
    await expect(applyMigration(dir, { date: DATE, dryRun: false, _afterWrite })).rejects.toBe(boom);
    expect(tree(dir)).toEqual(before);
  }, 120_000);

  // REVIEW Suggestion: a list the run CREATED (no original) must go on
  // rollback too — here OPEN-QUESTIONS.md, absent before, generated by the
  // run, and the failure lands before the loop that used to record it.
  it('a list that did not exist before is removed, not left generated', async () => {
    const dir = makeProject({ git: true, edit: (planning) => rmSync(join(planning, 'OPEN-QUESTIONS.md')) });
    const before = tree(dir);
    const boom = new Error('injected failure');
    const _afterWrite = (rel) => {
      if (rel === '.planning/BUGS.md') throw boom;
    };
    await expect(applyMigration(dir, { date: DATE, dryRun: false, _afterWrite })).rejects.toBe(boom);
    expect(tree(dir)).toEqual(before);
  }, 120_000);

  // REVIEW I2: rollback removes only what the run created. `work/` already
  // exists (holding the user's own file), so it is not the run's to remove,
  // and the generated `work/EPICS.md` inside it is.
  it('with work/ already present: the user\'s file survives and work/EPICS.md does not linger', async () => {
    const dir = makeProject({
      git: true,
      edit: (planning) => {
        mkdirSync(join(planning, 'work'));
        writeFileSync(join(planning, 'work', 'NOTES.md'), 'mine\n');
      },
    });
    const before = tree(dir);
    const boom = new Error('injected failure');
    const _afterWrite = (rel) => {
      if (rel === '.planning/BUGS.md') throw boom;
    };
    await expect(applyMigration(dir, { date: DATE, dryRun: false, _afterWrite })).rejects.toBe(boom);
    expect(tree(dir)).toEqual(before);
  }, 120_000);
});

// REVIEW I2: a file the migration would create that already exists is
// refused up front — never overwritten, and so never deleted by a rollback.
describe('refusals — files the migration would create', () => {
  it.each([
    [`work/${WATCHLIST_FILE}`, 'my watchlist\n'],
    ['work/EPICS.md', '# my epics\n'],
  ])('an existing %s (CONFLICT), nothing written', async (rel, text) => {
    const dir = makeProject({
      edit: (planning) => {
        mkdirSync(join(planning, 'work'), { recursive: true });
        writeFileSync(join(planning, ...rel.split('/')), text);
      },
    });
    const before = tree(dir);
    const err = await applyMigration(dir, { date: DATE, dryRun: false }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toContain(`.planning/${rel}`);
    expect(tree(dir)).toEqual(before);
  });
});

// REVIEW Suggestion: applyMigration confines its writes like every other
// `.planning/` writer — a directory symlink out of `.planning/` is refused.
describe('confinement', () => {
  it.each([['work'], ['archive']])('a .planning/%s symlink pointing outside is refused before any write', async (name) => {
    const outside = mkdtempSync(join(tmpdir(), 'work-apply-outside-'));
    tmps.push(outside);
    const dir = makeProject({ edit: (planning) => symlinkSync(outside, join(planning, name), 'dir') });
    const before = tree(dir);
    await expect(applyMigration(dir, { date: DATE, dryRun: false })).rejects.toThrow(/escapes|symlink/);
    expect(readdirSync(outside)).toEqual([]);
    expect(tree(dir)).toEqual(before);
  });
});

describe('the `by` option', () => {
  it('names who closed the migrated items', async () => {
    const dir = makeProject();
    await applyMigration(dir, { date: DATE, dryRun: false, by: 'brett' });
    const doneDir = join(dir, '.planning', 'work', 'done', DATE.slice(0, 7));
    const first = readdirSync(doneDir)[0];
    expect(parseItem(readFileSync(join(doneDir, first), 'utf-8')).item.close.by).toBe('brett');
  }, 120_000);
});

describe('tools/work-migrate.mjs', () => {
  const run = (cwd, args = []) => execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8' });

  it('dry-runs by default, prints the report, writes nothing', () => {
    const dir = makeProject();
    const before = tree(dir);
    const out = run(dir, ['--date', DATE]);
    expect(out).toMatch(/dry run/i);
    expect(out).toMatch(/Items: \*\*\d+\*\*/);
    expect(tree(dir)).toEqual(before);
  }, 60_000);

  it('--apply migrates', () => {
    const dir = makeProject();
    const out = run(dir, ['--apply', '--date', DATE]);
    expect(out).toMatch(/applied/i);
    expect(isStoreOn(dir).on).toBe(true);
    expect(checkStore(dir)).toEqual([]);
    expect(statSync(join(dir, '.planning', 'archive', 'pre-work-store', 'README.md')).isFile()).toBe(true);
  }, 120_000);

  // Runs the CLI and returns {status, stdout, stderr} whatever the exit code.
  const spawn = (cwd, args) => {
    try {
      return { status: 0, stdout: execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8', stdio: 'pipe' }), stderr: '' };
    } catch (err) {
      return { status: err.status, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
    }
  };

  it('refuses an unknown flag in ANY position — the first one included — and writes nothing', () => {
    const dir = makeProject();
    const before = tree(dir);
    for (const args of [['--aply'], ['--aply', '--date', DATE], ['--date', DATE, '--aply'], ['--apply', '--dryrun'], ['apply']]) {
      const r = spawn(dir, args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr, args.join(' ')).toMatch(/usage: node tools\/work-migrate\.mjs/);
      expect(r.stderr, args.join(' ')).toMatch(/unknown/i);
      expect(r.stdout, args.join(' ')).not.toMatch(/Items:/);
    }
    expect(tree(dir)).toEqual(before);
  }, 60_000);

  it('--help (and -h) prints usage and exits 0 without migrating or dry-running, even beside --apply', () => {
    const dir = makeProject();
    const before = tree(dir);
    for (const args of [['--help'], ['-h'], ['--apply', '--help']]) {
      const r = spawn(dir, args);
      expect(r.status, args.join(' ')).toBe(0);
      expect(r.stdout, args.join(' ')).toMatch(/usage: node tools\/work-migrate\.mjs/);
      expect(r.stdout, args.join(' ')).not.toMatch(/Items:/);
    }
    expect(tree(dir)).toEqual(before);
  }, 60_000);

  it('refuses a malformed --date', () => {
    const dir = makeProject();
    expect(() => execFileSync(process.execPath, [CLI, '--date', '29-09-2026'], { cwd: dir, stdio: 'pipe' })).toThrow();
  });
});
