// M6.E15 S1 — `/sig:docs-migrate --work-store` turns the store on for a project
// with no lists (FR1, FR2, AC7.3, SIG-274).
//
// Two shapes a project can have before the store is on, both stamped layout v3:
//   (A) no lists at all — the `/sig:init` / `/sig:new-project` shape (lists are
//       created lazily);
//   (B) only the skeleton `BACKLOG.md` a layout migration leaves
//       (`backlog.js` `backlogSkeleton`).
// A third repo WITH lists pins that a plain `/sig:docs-migrate` never touches
// them (AC1.1). Lists with items are S4's (work-migrate-lists-apply.test.js).
//
// Folder names and keys are invented (`tests/private-name-guard.test.js`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseMigrateArgs, runMigrate } from '../plugin/tools/lib/migrate-memory.js';
import { createBacklogIfMissing } from '../plugin/tools/lib/backlog.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';
import { STORE_KEY_RE, STORE_OFF_MESSAGE } from '../plugin/tools/lib/work-store.js';
import { V1_STORE_MESSAGE } from '../plugin/tools/lib/work-records.js';

// Imported lazily so AC1.1 (a regression guard that passes before the change)
// still runs while the module does not exist.
const lists = () => import('../plugin/tools/lib/work-migrate-lists.js');

const git = (cwd, args) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }));
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
function commitAll(dir) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

const stateText = (stamp) => `---\nschema_version: 1\n${stamp === null ? '' : `docs_layout_version: ${stamp}\n`}`
  + 'phase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# Project State\n\nbody\n';

const VIEWS = ['.planning/BUGS.md', '.planning/BACKLOG.md', '.planning/ISSUES-INBOX.md', '.planning/OPEN-QUESTIONS.md', '.planning/work/EPICS.md'];
const WORK_MD = '.planning/work/WORK.md';
const ARCHIVED_BACKLOG = '.planning/archive/pre-work-store/BACKLOG.md';

// Every file under the project (outside .git), with its bytes and mtime, so any
// write — new file or rewrite — shows up as a difference.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p.slice(dir.length)] = `${statSync(p).mtimeMs}:${readFileSync(p, 'utf-8')}`;
    }
  };
  walk(dir);
  return out;
}

let root;
let base;
// A project folder with an invented name; its proposed key is ACMENOTES.
function project({ stamp = 3, gitRepo = true, commit = true } = {}) {
  base = join(root, 'acme-notes');
  mkdirSync(join(base, '.planning'), { recursive: true });
  writeFileSync(join(base, '.planning', 'STATE.md'), stateText(stamp));
  if (gitRepo) initRepo(base);
  return {
    commit: () => { if (gitRepo && commit) commitAll(base); },
  };
}
const read = (rel) => readFileSync(join(base, rel), 'utf-8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'signal-wse-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('AC1.1 — a plain /sig:docs-migrate never touches the lists or work/', () => {
  it('dry run and apply leave every list byte-identical and write no .planning/work/ file', async () => {
    const p = project();
    writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n\n| ID | Title |\n|---|---|\n| B1 | a crash |\n');
    writeFileSync(join(base, '.planning', 'BACKLOG.md'), '# Backlog\n\n### #1 — first idea\n');
    p.commit();
    const before = { bugs: read('.planning/BUGS.md'), backlog: read('.planning/BACKLOG.md') };
    await runMigrate(base, { apply: false });
    await runMigrate(base, { apply: true, stamp: 'T1', dateStr: '2026-10-09' });
    expect(read('.planning/BUGS.md')).toBe(before.bugs);
    expect(read('.planning/BACKLOG.md')).toBe(before.backlog);
    expect(existsSync(join(base, '.planning', 'work'))).toBe(false);
  });
});

describe('parseMigrateArgs — --work-store and --key (t1.3)', () => {
  it('reads --work-store and --key VALUE', () => {
    expect(parseMigrateArgs(['--work-store', '--key', 'ACN', '--apply'])).toEqual({ apply: true, force: false, workStore: true, key: 'ACN' });
    expect(parseMigrateArgs(['--work-store'])).toEqual({ apply: false, force: false, workStore: true });
  });
  it('a --key with no value sets no key, and unknown flags are still ignored', () => {
    expect(parseMigrateArgs(['--work-store', '--key'])).toEqual({ apply: false, force: false, workStore: true });
    expect(parseMigrateArgs(['--key', '--apply', '--bogus'])).toEqual({ apply: true, force: false });
  });
  it('without the new flags the result is unchanged', () => {
    expect(parseMigrateArgs(['--apply', '--force'])).toEqual({ apply: true, force: true });
  });
});

describe('AC2.1 — proposeKey from the folder name', () => {
  it.each([
    ['acme-notes', 'ACMENOTES'],
    ['2024-ledger', 'LEDGER'],
    ['a-very-long-folder-name', 'AVERYLONGF'],
    ['tool_kit 2', 'TOOLKIT2'],
    ['ab', 'AB'],
  ])('%s → %s, valid against STORE_KEY_RE', async (folder, key) => {
    const { proposeKey } = await lists();
    expect(proposeKey(folder)).toBe(key);
    expect(STORE_KEY_RE.test(key)).toBe(true);
  });
  it.each(['x', '42', '--', ''])('%j → null: nothing valid to propose', async (folder) => {
    const { proposeKey } = await lists();
    expect(proposeKey(folder)).toBeNull();
  });
});

describe('AC1.2 / AC2.1 — the dry run proposes the key and writes nothing', () => {
  it('(A) no lists: prints the proposed key and no list', async () => {
    const p = project();
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: false });
    expect(r.dryRun).toBe(true);
    expect(r.key).toBe('ACMENOTES');
    expect(r.report).toContain('ACMENOTES');
    expect(r.files).toEqual([]);
    expect(typeof r.inputHash).toBe('string');
    expect(snapshot(base)).toEqual(before);
  });

  it('(B) skeleton BACKLOG.md: one named non-item region, no item, nothing written', async () => {
    const p = project();
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: false });
    expect(r.files).toEqual([{ file: '.planning/BACKLOG.md', items: 0, open: 0, closed: 0, flagged: 0, regions: ['backlog skeleton'] }]);
    expect(r.report).toMatch(/BACKLOG\.md: 0 items.*1 non-item region \(backlog skeleton\)/);
    expect(snapshot(base)).toEqual(before);
  });
});

describe('AC1.3 / AC1.4 / AC7.3 — apply turns the store on', () => {
  it('(A) no lists: WORK.md + five views, staged not committed, tag and undo line, then newItem succeeds', async () => {
    const p = project();
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const dry = await runWorkStoreMigrate(base, { apply: false });
    const r = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(r.key).toBe('ACMENOTES'); // --apply without --key uses the proposed key

    const workMd = read(WORK_MD);
    expect(workMd).toMatch(/^---\nkey: ACMENOTES\nschema_version: 2\n---\n/);
    // AC7.3: describes this project's store, names no Signal script.
    for (const signalOnly of ['work-migrate', 'pre-work-store-v2', 'tools/', '.mjs', 'SIG-']) expect(workMd).not.toContain(signalOnly);
    expect(workMd).toContain('ACMENOTES-');

    for (const v of VIEWS) expect(read(v).split('\n')[0], v).toBe(GENERATED_MARKER);
    const staged = git(base, ['diff', '--cached', '--name-only']).trim().split('\n');
    for (const f of [WORK_MD, ...VIEWS]) expect(staged).toContain(f);
    expect(git(base, ['rev-list', '--count', 'HEAD']).trim()).toBe('1'); // not committed
    expect(r.tag).toBe('pre-work-store-T1');
    expect(git(base, ['tag', '-l']).trim()).toBe('pre-work-store-T1');
    expect(r.revertLine).toContain('git reset --hard pre-work-store-T1');
    expect(r.report).toContain(r.revertLine);

    const { newItem } = await import('../plugin/tools/lib/work-records.js');
    const item = await newItem(base, { title: 'first capture', by: 'test' });
    expect(item.id).toBe('ACMENOTES-1');
  });

  it('(B) skeleton BACKLOG.md: archived byte-identical before the views, never an item', async () => {
    const p = project();
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    p.commit();
    const skeleton = read('.planning/BACKLOG.md');
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: true, stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(read(ARCHIVED_BACKLOG)).toBe(skeleton);
    expect(read('.planning/BACKLOG.md').split('\n')[0]).toBe(GENERATED_MARKER);
    const { listRecords } = await import('../plugin/tools/lib/work-records.js');
    expect(listRecords(base).records).toEqual([]);
    const staged = git(base, ['diff', '--cached', '--name-only']).trim().split('\n');
    expect(staged).toContain(ARCHIVED_BACKLOG);
  });

  it('the skeleton with a review-snapshot pointer is recognised too', async () => {
    const p = project();
    writeFileSync(join(base, '.planning', 'BACKLOG-REVIEW-2026-01-01.md'), '# review\n');
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: false });
    expect(r.refused).toBeUndefined();
    expect(r.files[0].regions).toEqual(['backlog skeleton']);
  });

  it('--key overrides the proposal', async () => {
    const p = project();
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'ACN', stamp: 'T1' });
    expect(r.key).toBe('ACN');
    expect(read(WORK_MD)).toMatch(/^---\nkey: ACN\n/);
  });

  it('a dirty tree is refused without --force, and nothing is written', async () => {
    const p = project();
    p.commit();
    writeFileSync(join(base, 'notes.txt'), 'uncommitted\n');
    const { runWorkStoreMigrate } = await lists();
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: true, stamp: 'T1' });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/dirty/i);
    expect(snapshot(base)).toEqual(before);
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  });

  it('--force on a dirty tree applies, and its undo line never says to reset the whole tree', async () => {
    const p = project();
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    p.commit();
    writeFileSync(join(base, 'notes.txt'), 'uncommitted\n');
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: true, force: true, stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(r.revertLine).not.toMatch(/^git reset --hard/);
    expect(r.revertLine).toContain('do NOT');
    expect(r.revertLine).toContain(WORK_MD);
    expect(r.revertLine).toContain(`mv -- ${ARCHIVED_BACKLOG} .planning/BACKLOG.md`);
    expect(read('notes.txt')).toBe('uncommitted\n');
  });

  it('outside git: applies with no tag, and the undo line says which files to remove and restore', async () => {
    project({ gitRepo: false });
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: true, stamp: 'T1' });
    expect(r.applied).toBe(true);
    expect(r.mode).toBe('fs-backup');
    expect(r.tag).toBeNull();
    expect(r.revertLine).toContain(WORK_MD);
    expect(r.revertLine).toContain(`mv -- ${ARCHIVED_BACKLOG} .planning/BACKLOG.md`);
    expect(r.revertLine).not.toContain('git ');
  });

  it('a STATE.md changed since the dry run aborts before any write', async () => {
    const p = project();
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const dry = await runWorkStoreMigrate(base, { apply: false });
    writeFileSync(join(base, '.planning', 'STATE.md'), stateText(3).replace('body', 'edited'));
    git(base, ['commit', '-q', '-am', 'edit']);
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1' });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(snapshot(base)).toEqual(before);
  });
});

describe('refusals — nothing written, in a dry run or an apply', () => {
  const refuses = async (opts, pattern) => {
    const { runWorkStoreMigrate } = await lists();
    for (const apply of [false, true]) {
      const before = snapshot(base);
      const r = await runWorkStoreMigrate(base, { ...opts, apply, stamp: 'T1' });
      expect(r.refused, `apply: ${apply}`).toBe(true);
      expect(r.reason).toMatch(pattern);
      expect(snapshot(base)).toEqual(before);
    }
  };

  it.each([
    ['valid', '---\nkey: ACME\nschema_version: 2\n---\n'],
    ['broken', '---\nkey: 12\n---\n'],
    ['v1', '---\nkey: ACME\n---\n'],
    ['no frontmatter', 'hello\n'],
  ])('AC1.5 an existing WORK.md (%s) → already on the store', async (_label, text) => {
    const p = project();
    mkdirSync(join(base, '.planning', 'work'), { recursive: true });
    writeFileSync(join(base, WORK_MD), text);
    p.commit();
    await refuses({}, /already on the store/);
  });

  it.each([[2], [null]])('AC1.6 layout stamp %j → names the plain command to run first', async (stamp) => {
    const p = project({ stamp });
    p.commit();
    await refuses({}, /`\/sig:docs-migrate --apply`/);
  });

  it('AC1.6 no STATE.md → refused the same way', async () => {
    const p = project();
    rmSync(join(base, '.planning', 'STATE.md'));
    writeFileSync(join(base, '.planning', 'keep.md'), 'x\n');
    p.commit();
    await refuses({}, /`\/sig:docs-migrate --apply`/);
  });

  it.each(['acme', 'A', 'TOOLONGKEY01', '1ABC'])('AC2.2 invalid --key %j → states the rule', async (key) => {
    const p = project();
    p.commit();
    await refuses({ key }, /an uppercase letter, then 1–9 uppercase letters or digits/);
  });

  it('a folder name with no usable letters and no --key → asks for --key', async () => {
    base = join(root, '42');
    mkdirSync(join(base, '.planning'), { recursive: true });
    writeFileSync(join(base, '.planning', 'STATE.md'), stateText(3));
    initRepo(base);
    commitAll(base);
    await refuses({}, /--key/);
  });

});

// S1 refused these with "lists with items are migrated by a later slice"; S4
// plans them (tests/work-migrate-lists-apply.test.js covers the apply).
describe('a list with items is planned, not refused (S4)', () => {
  it('a list with items → its entries are planned as items by the dry run, nothing written', async () => {
    const p = project();
    writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n\n## a crash\n');
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const before = snapshot(base);
    const r = await runWorkStoreMigrate(base, { apply: false });
    expect(r.refused).toBeUndefined();
    expect(r.files).toMatchObject([{ file: '.planning/BUGS.md', items: 1 }]);
    expect(snapshot(base)).toEqual(before);
  });

  it('a skeleton BACKLOG.md with anything added is not the skeleton: its row is an item', async () => {
    const p = project();
    await createBacklogIfMissing(base, { today: '2026-01-02' });
    writeFileSync(join(base, '.planning', 'BACKLOG.md'), `${read('.planning/BACKLOG.md')}\n### #1 — an idea\n`);
    p.commit();
    const { runWorkStoreMigrate } = await lists();
    const r = await runWorkStoreMigrate(base, { apply: false });
    expect(r.refused).toBeUndefined();
    expect(r.files[0].regions).not.toContain('backlog skeleton');
    expect(r.items.filter((i) => i.legacy_id === '#1')).toHaveLength(1);
  });
});

describe('import rule — no v2 module reaches work-migrate-lists.js', () => {
  // Same walk as tests/legacy-lists.test.js (AC3.2): work-migrate-lists.js will
  // reach the list parsers (S3), so no v2 module may import it.
  const LIB = join(process.cwd(), 'plugin', 'tools', 'lib');
  const source = (file) => readFileSync(join(LIB, file), 'utf-8');
  const staticImports = (file) =>
    [...source(file).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'\.\/([\w.-]+\.js)'/gm)].map((m) => m[1]);
  const dynamicImports = (file) => [...source(file).matchAll(/import\(\s*'\.\/([\w.-]+\.js)'\s*\)/g)].map((m) => m[1]);
  const reaches = (start) => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      stack.push(...staticImports(f), ...dynamicImports(f));
    }
    return seen;
  };
  const V2_MODULES = [
    'work-marker.js', 'atomic-write.js', 'work-record.js', 'work-records.js', 'work-views.js',
    'work-convert.js', 'work-write-guard.js', 'scrub.js', 'work-errors.js', 'close-confirm.js',
  ];
  it.each(V2_MODULES)('%s', (mod) => {
    expect([...reaches(mod)]).not.toContain('work-migrate-lists.js');
  });
});

describe('t1.5 — the store-off messages name the shipped command', () => {
  it('STORE_OFF_MESSAGE, the hand-kept refusal and /sig:item no longer say "in a later release"', async () => {
    const { assertNoHandKeptLists } = await import('../plugin/tools/lib/work-generate.js');
    expect(STORE_OFF_MESSAGE).not.toContain('later release');
    expect(STORE_OFF_MESSAGE).toContain('/sig:docs-migrate --work-store');
    project();
    mkdirSync(join(base, '.planning', 'work'), { recursive: true });
    writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n');
    let msg = '';
    try {
      assertNoHandKeptLists(base);
    } catch (err) {
      msg = err.message;
    }
    expect(msg).not.toContain('later release');
    expect(msg).toContain('/sig:docs-migrate --work-store');
    const item = readFileSync(join(process.cwd(), 'plugin', 'commands', 'item.md'), 'utf-8');
    expect(item).not.toContain('in a later release');
    expect(item).toContain('/sig:docs-migrate --work-store');
  });

  it('V1_STORE_MESSAGE still names the v1 migration, and says what to do with a hand-made WORK.md', () => {
    expect(V1_STORE_MESSAGE).toContain('node tools/work-migrate-v2.mjs');
    expect(V1_STORE_MESSAGE).toContain('/sig:docs-migrate --work-store');
  });

  it('commands/docs-migrate.md documents --work-store and drops "NOT done by this command yet"', () => {
    const doc = readFileSync(join(process.cwd(), 'plugin', 'commands', 'docs-migrate.md'), 'utf-8');
    expect(doc).toMatch(/^args: ".*--work-store.*--key/m);
    expect(doc).not.toContain('NOT done by this command yet');
    expect(doc).toContain('runWorkStoreMigrate');
  });
});

describe('S4 — the pointers name the shipped lists migration', () => {
  it('the hand-kept view refusal points a never-migrated list at /sig:docs-migrate --work-store, not the v1 script', async () => {
    const { regenerateViews } = await import('../plugin/tools/lib/work-views.js');
    project();
    mkdirSync(join(base, '.planning', 'work'), { recursive: true });
    writeFileSync(join(base, WORK_MD), '---\nkey: ACME\nschema_version: 2\n---\n');
    writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n');
    let msg = '';
    try {
      await regenerateViews(base);
    } catch (err) {
      msg = err.message;
    }
    expect(msg).toContain('hand-kept');
    expect(msg).not.toContain('work-migrate-v2.mjs');
    expect(msg).toContain('/sig:docs-migrate --work-store');
  });

  it('commands/docs-migrate.md describes the lists migration, not a refusal', () => {
    const doc = readFileSync(join(process.cwd(), 'plugin', 'commands', 'docs-migrate.md'), 'utf-8');
    expect(doc).not.toContain('refused in this build');
    expect(doc).toContain('MANIFEST.json');
    expect(doc).toContain('acknowledgeSensitive');
    expect(doc).toMatch(/flagged/);
  });

  it('work-migrate.js no longer says the lists migration is "in a later release"', () => {
    const src = readFileSync(join(process.cwd(), 'plugin', 'tools', 'lib', 'work-migrate.js'), 'utf-8');
    expect(src).not.toContain('in a later release');
  });
});
