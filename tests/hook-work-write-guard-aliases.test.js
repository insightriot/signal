// M6.E16 REVIEW r6 — other names for a guarded file. The guard
// (plugin/tools/lib/work-write-guard.js, behind plugin/hooks/check-state-write.js)
// compared a path by its letters as written and as the filesystem resolves it.
// Five routes got past:
//
//   - a look-alike letter: `.planning/work/unitſ/X.json` (U+017F). macOS opens
//     `unitſ` as `units`, `worK` (U+212A) as `work` and `ißues-inbox.md` as
//     `issues-inbox.md`; a later normalisation does the same to fullwidth letters;
//   - a hard link: a second name for a record file, outside `.planning`;
//   - the real path of a `.planning` (or of a folder inside it) that is a symlink;
//   - the NotebookEdit tool, which the hook was not registered for;
//   - (held, not broken) an upper-case name with a `:` in it.
//
// This hook runs before every edit in every project, so the second half of the
// file is what it must NOT do: block an ordinary edit, or fail.
//
// Two ways in, and why both (the file took 68 s when every case spawned the
// hook, and stalled the test worker in CI):
//
//   - `blocked` / `allowed` call the guard in this process, as the hook calls
//     it (`checkWorkWrite`). The large tables go through these.
//   - `hookBlocked` / `hookAllowed` spawn the hook itself with the event on
//     stdin, a few at a time and without blocking the worker. What only the
//     hook does is held by these: which tools it answers to, which field it
//     reads the path from, its test for whether to load the guard at all, its
//     exit code and stderr, and that it never fails. Each route above has at
//     least one.
//
// Projects are temp folders; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers';
import { fileURLToPath } from 'node:url';

import { checkWorkWrite, protectedTarget } from '../plugin/tools/lib/work-write-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'plugin', 'hooks', 'check-state-write.js');
const HOOKS_JSON = join(__dirname, '..', 'plugin', 'hooks', 'hooks.json');

const edit = (file_path, cwd) => ({ tool_name: 'Edit', cwd, tool_input: { file_path, old_string: 'a', new_string: 'b' } });
const write = (file_path, cwd) => ({ tool_name: 'Write', cwd, tool_input: { file_path, content: 'x\n' } });
const multi = (file_path, cwd) => ({ tool_name: 'MultiEdit', cwd, tool_input: { file_path, edits: [{ old_string: 'a', new_string: 'b' }] } });
const notebook = (notebook_path, cwd) => ({ tool_name: 'NotebookEdit', cwd, tool_input: { notebook_path, new_source: 'x', edit_mode: 'replace' } });
const TOOLS = [edit, write, multi, notebook];

const pathOf = (event) => (event.tool_name === 'NotebookEdit' ? event.tool_input?.notebook_path : event.tool_input?.file_path);
const named = (event) => `${event.tool_name} ${JSON.stringify(pathOf(event))}`;

// ── the guard, in this process ──────────────────────────────────────────────

// As the hook calls it: the path from the tool's own field, the event's cwd.
const guard = (event) => checkWorkWrite({ filePath: pathOf(event), cwd: event.cwd, tool: event.tool_name, input: event.tool_input });

async function blocked(event) {
  const out = await guard(event);
  expect(out.block, named(event)).toBe(true);
  expect(out.reason).toMatch(/v2 work store/);
  return out.reason;
}
async function allowed(event) {
  expect(await guard(event), named(event)).toEqual({ block: false });
}

// ── the hook itself, spawned ────────────────────────────────────────────────

function runRaw(input) {
  return new Promise((done, fail) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', fail);
    child.on('close', (status) => done({ status, stderr }));
    child.stdin.on('error', () => {}); // the hook may exit before it has read everything
    child.stdin.end(input);
  });
}

// Every event through the hook, four at a time, results in the order given.
async function runHooks(events) {
  const results = new Array(events.length);
  let next = 0;
  const worker = async () => {
    while (next < events.length) {
      const i = next;
      next += 1;
      results[i] = await runRaw(JSON.stringify(events[i]));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return results;
}

async function hookBlocked(...events) {
  const results = await runHooks(events);
  results.forEach(({ status, stderr }, i) => {
    expect(status, `${named(events[i])}: ${stderr}`).toBe(2);
    expect(stderr).toMatch(/^\[signal:check-state-write\] .*v2 work store/s);
  });
  return results.map((r) => r.stderr);
}
async function hookAllowed(...events) {
  const results = await runHooks(events);
  results.forEach(({ status, stderr }, i) => {
    expect(status, `${named(events[i])}: ${stderr}`).toBe(0);
    expect(stderr).toBe('');
  });
}

const WORK_MD = '---\nkey: SIG\nschema_version: 2\n---\n\nSome prose.\n';

// The planning files of a project, written under `planning` (the project's
// `.planning`, or the folder a symlinked `.planning` points at).
function plantPlanning(planning, store = 'v2') {
  mkdirSync(join(planning, 'work', 'items', '00'), { recursive: true });
  mkdirSync(join(planning, 'work', 'history'), { recursive: true });
  mkdirSync(join(planning, 'work', 'units'), { recursive: true });
  for (const v of ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md', 'DECISIONS.md']) writeFileSync(join(planning, v), `# ${v}\n`);
  writeFileSync(join(planning, 'work', 'items', '00', 'SIG-1.json'), '{}\n');
  writeFileSync(join(planning, 'work', 'items', '00', 'SIG-1.md'), 'body\n');
  writeFileSync(join(planning, 'work', 'units', 'M7.E1.json'), '{}\n');
  writeFileSync(join(planning, 'work', 'history', '2026-10.md'), 'history\n');
  writeFileSync(join(planning, 'work', 'EPICS.md'), 'epics\n');
  if (store === 'v2') writeFileSync(join(planning, 'work', 'WORK.md'), WORK_MD);
  if (store === 'v1') writeFileSync(join(planning, 'work', 'WORK.md'), '---\nkey: SIG\n---\n');
}

let tmp;
let dir;
beforeEach(() => {
  // The real path: on macOS the temp folder is itself reached through a symlink.
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sig-guard-alias-')));
  dir = join(tmp, 'project');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), 'readme\n');
  writeFileSync(join(dir, 'src', 'index.js'), 'a\n');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

// ── a look-alike letter ─────────────────────────────────────────────────────

// Each spelling, and the guarded path it is a look-alike of.
const LOOKALIKES = [
  ['a long s (U+017F) in `units`', '.planning/work/unitſ/X.json'],
  ['a long s in `items`', '.planning/work/itemſ/00/SIG-9.json'],
  ['two long s in a view\'s name', '.planning/iſſues-inbox.md'],
  ['a sharp s (U+00DF) for `ss` in a view\'s name', '.planning/ißues-inbox.md'],
  ['a capital sharp s (U+1E9E) for `ss`', '.planning/IẞUES-INBOX.md'],
  ['a Kelvin sign (U+212A) in `work`', '.planning/worK/units/X.json'],
  ['a Kelvin sign in a view\'s name', '.planning/BACKLOG.md'],
  ['fullwidth letters for `units`', '.planning/work/ｕｎｉｔｓ/X.json'],
  ['fullwidth letters for `.planning`', '．ｐｌａｎｎｉｎｇ/BUGS.md'],
  ['a fullwidth `.json`', '.planning/work/items/00/SIG-9．json'],
  ['a ligature (U+FB06, st) in `history`', '.planning/work/hiﬆory/2026-11.md'],
  ['a long s and an upper-case name', '.PLANNING/WORK/UNITſ/X.JSON'],
  // A target by one of the guard's two readings only, so each reading folds:
  // the trailing dot is a record only as Windows would open it, the `:` only as written.
  ['a long s, and a trailing dot', '.planning/work/itemſ/00/SIG-9.json.'],
  ['a sharp s, and a trailing space', '.planning/ißues-inbox.md '],
  ['a long s, and a `:` in the name', '.planning/work/itemſ/00/SIG:1.json'],
];
// Marks that join the letter before them: the name is another name, on every
// filesystem, and stays editable.
const NOT_LOOKALIKES = [
  ['an accent after the s of `units` (a combining sequence)', '.planning/work/unitś/X.json'],
  ['the same, composed', '.planning/work/unitś/X.json'],
  ['an accent inside `work`', '.planning/wórk/units/X.json'],
  ['an accented view name', '.planning/BÜGS.md'],
  ['a zero-width space inside `units`', '.planning/work/un​its/X.json'],
];

describe('a look-alike letter in a guarded path', () => {
  beforeEach(() => plantPlanning(join(dir, '.planning')));

  // Under a folder that is not there, so no filesystem has a say: the path is
  // read by its letters alone. (Under the planted project macOS resolves most
  // of these to the real file, and the guard's real-path reading catches them.)
  it.each(LOOKALIKES)('%s is the guarded path, by shape alone (any filesystem)', (_label, rel) => {
    expect(protectedTarget(join(tmp, 'not-there', rel))).toMatchObject({ blocked: true });
  });

  // M6.E16 r6.2 — deliberate, and pinned so it is not "fixed" by accident: a
  // dotless ı (U+0131) is read as `i`. No filesystem opens `unıts` as `units`,
  // so this guards a name that is not the guarded file — it can only refuse
  // too much, never too little. It falls out of the fold that reads `ß` as
  // `ss` (upper case, then lower), and a fold that told the two apart would be
  // one more thing to get wrong for a name nobody has a reason to use.
  it('a dotless ı is read as i: `unıts` and `ıtems` are guarded, though no filesystem opens them as the folder', () => {
    for (const rel of ['.planning/work/unıts/X.json', '.planning/work/ıtems/00/SIG-9.json', '.plannıng/BUGS.md']) {
      expect(protectedTarget(join(tmp, 'not-there', rel)), rel).toMatchObject({ blocked: true });
    }
  });

  it.each(NOT_LOOKALIKES)('%s is a different name, and is not guarded', (_label, rel) => {
    expect(protectedTarget(join(tmp, 'not-there', rel))).toMatchObject({ blocked: false });
    expect(protectedTarget(join(dir, rel))).toMatchObject({ blocked: false });
  });

  it.each(LOOKALIKES.filter(([, rel]) => rel.startsWith('.planning/')))('the guard refuses it: %s', async (_label, rel) => {
    await blocked(write(join(dir, rel)));
    await blocked(edit(rel, dir));
  });

  // The route that mattered: with no `units` folder a Write of `unitſ/X.json`
  // creates a folder that macOS then opens as `units`, which turns unit records on.
  it('with no units folder: a Write under `unitſ/` is refused, by the guard and by the hook', async () => {
    rmSync(join(dir, '.planning', 'work', 'units'), { recursive: true });
    await blocked(write(join(dir, '.planning/work/unitſ/X.json')));
    await blocked(write(join(dir, '.planning/work/unitſ/notes.md')));
    await blocked(notebook(join(dir, '.planning/work/unitſ/X.json')));
    await hookBlocked(
      write(join(dir, '.planning/work/unitſ/X.json')),
      notebook(join(dir, '.planning/work/unitſ/X.json')),
      edit('.planning/work/ｕｎｉｔｓ/X.json', dir),
    );
  });

  it.each(NOT_LOOKALIKES)('the guard allows it: %s', async (_label, rel) => {
    await allowed(write(join(dir, rel)));
  });

  it('the hook allows a name with a mark on it, and one with a zero-width space in it', async () => {
    await hookAllowed(write(join(dir, NOT_LOOKALIKES[0][1])), write(join(dir, NOT_LOOKALIKES[4][1])));
  });

  // What this holds depends on the filesystem. On macOS (APFS) the long s, the
  // Kelvin sign and both sharp s open the real file, and those are refused
  // through the hook. On Linux (ext4, where CI runs) none of them is the real
  // file, nothing is spawned, and the spellings are still refused by shape —
  // the tests above, which no filesystem has a say in.
  it('on this filesystem: every spelling it opens as the real file is refused', async () => {
    const real = {
      '.planning/work/unitſ/M7.E1.json': '.planning/work/units/M7.E1.json',
      '.planning/worK/units/M7.E1.json': '.planning/work/units/M7.E1.json',
      '.planning/ißues-inbox.md': '.planning/ISSUES-INBOX.md',
      '.planning/IẞUES-INBOX.md': '.planning/ISSUES-INBOX.md',
      '.planning/work/ｕｎｉｔｓ/M7.E1.json': '.planning/work/units/M7.E1.json',
    };
    const opened = [];
    for (const [rel, to] of Object.entries(real)) {
      expect(existsSync(join(dir, to))).toBe(true);
      if (existsSync(join(dir, rel))) opened.push(rel);
      await blocked(edit(join(dir, rel))); // by shape, whatever the filesystem
    }
    await hookBlocked(...opened.map((rel) => edit(join(dir, rel))));
  });

  // Not a fixed list: ask this filesystem which single characters it opens as
  // a plain letter (or as `ss`), and check the guard reads each the same way.
  // The whole Basic Multilingual Plane, 63,360 names; it gives the worker a
  // turn every 4,096. On a filesystem that compares names exactly (ext4) it
  // finds none, and passes having compared nothing.
  it('on this filesystem: every character it opens as a plain letter is read as that letter (whole BMP)', async () => {
    const probe = join(tmp, 'probe');
    mkdirSync(probe);
    for (const name of [...'abcdefghijklmnopqrstuvwxyz', 'ss']) writeFileSync(join(probe, name), '');
    const templates = [
      '.planning/bugs.md', '.planning/backlog.md', '.planning/issues-inbox.md', '.planning/open-questions.md',
      '.planning/work/epics.md', '.planning/work/history/y.md', '.planning/work/units/x',
    ];
    const missed = [];
    for (let cp = 0x80; cp <= 0xFFFF; cp += 1) {
      if (cp % 4096 === 0) await new Promise((turn) => { setImmediate(turn); });
      if (cp >= 0xD800 && cp <= 0xDFFF) continue;
      const ch = String.fromCodePoint(cp);
      if (!existsSync(join(probe, ch))) continue;
      const opensAs = realpathSync.native(join(probe, ch)).slice(probe.length + 1);
      const template = templates.find((t) => t.includes(opensAs));
      if (template === undefined) continue; // a letter no guarded name holds
      if (!protectedTarget(join(tmp, 'not-there', template.replace(opensAs, ch))).blocked) missed.push(`U+${cp.toString(16)} (opens as ${opensAs})`);
    }
    expect(missed).toEqual([]);
  });
});

// ── an upper-case name with a `:` in it ─────────────────────────────────────

describe('a name with a `:` in it is read as written too, whatever its case', () => {
  // Read as Windows would open it, `SIG:1.JSON` is the file `SIG`, which is
  // no record. Read as written it is a `.json` under `items/`, which is one.
  it('an upper-case record name holding a `:` is guarded', () => {
    const at = join(tmp, 'not-there');
    expect(protectedTarget(join(at, '.planning/work/items/00/SIG:1.JSON'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(at, '.Planning/Work/Items/00/SIG:1.JSON'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(at, '.planning/work/items/00/SIG:1.json'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(at, '.planning/work/items/00/SIG:1.MD'))).toMatchObject({ blocked: false });
  });
});

// ── NotebookEdit ────────────────────────────────────────────────────────────

describe('NotebookEdit reaches the guard', () => {
  beforeEach(() => plantPlanning(join(dir, '.planning')));
  const GUARDED = ['.planning/work/units/M7.E1.json', '.planning/work/items/00/SIG-1.json', '.planning/BUGS.md', '.planning/work/units/new.ipynb'];

  it('hooks.json registers the hook for it', () => {
    const cfg = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
    const entry = cfg.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('check-state-write.js')));
    expect(entry.matcher.split('|')).toContain('NotebookEdit');
  });

  // Which tools the hook answers to, and which field it reads, are the hook's
  // own: every case here is spawned.
  it('the hook reads its `notebook_path`: a guarded path is refused, absolute and relative', async () => {
    await hookBlocked(...GUARDED.map((rel) => notebook(join(dir, rel))), notebook(GUARDED[0], dir), notebook(GUARDED[2], dir));
  });

  it('a notebook anywhere else is allowed, and so is a call with no path', async () => {
    await hookAllowed(
      notebook(join(dir, 'src', 'analysis.ipynb')),
      notebook(join(dir, '.planning', 'notes.ipynb')),
      { tool_name: 'NotebookEdit', cwd: dir, tool_input: { new_source: 'x' } },
      { tool_name: 'NotebookEdit', cwd: dir, tool_input: { notebook_path: 7 } },
      // `file_path` is not this tool's field: it is not read for it.
      { tool_name: 'NotebookEdit', cwd: dir, tool_input: { file_path: join(dir, '.planning/BUGS.md') } },
    );
  });

  it('a project with no v2 store is never blocked', async () => {
    const off = join(tmp, 'off');
    plantPlanning(join(off, '.planning'), 'v1');
    await allowed(notebook(join(off, '.planning/work/units/M7.E1.json')));
    await hookAllowed(notebook(join(off, '.planning/work/units/M7.E1.json')));
  });
});

// ── a hard link ─────────────────────────────────────────────────────────────

describe('a hard link: a second name for a guarded file', () => {
  beforeEach(() => plantPlanning(join(dir, '.planning')));
  const link = (rel, at) => {
    linkSync(join(dir, rel), at);
    return at;
  };

  it.each([
    ['a unit record', '.planning/work/units/M7.E1.json'],
    ['an item record', '.planning/work/items/00/SIG-1.json'],
    ['a view', '.planning/BUGS.md'],
    ['a history file', '.planning/work/history/2026-10.md'],
    ['the Epic list', '.planning/work/EPICS.md'],
  ])('%s, linked from inside the project: every tool is refused, and the message names the record', async (_label, rel) => {
    const alias = link(rel, join(dir, 'src', 'alias.txt'));
    for (const tool of TOOLS) {
      const reason = await blocked(tool(alias, dir));
      expect(reason).toContain(rel);
      expect(reason).toMatch(/another name \(a hard link\)/);
    }
    await blocked(edit('src/alias.txt', dir));
  });

  // Nothing in this path says `.planning`, so the hook loads the guard only
  // because the project has a store: its own test for that is held here.
  it('through the hook: every tool is refused, with the same message', async () => {
    const rel = '.planning/work/units/M7.E1.json';
    const alias = link(rel, join(dir, 'src', 'alias.txt'));
    for (const stderr of await hookBlocked(...TOOLS.map((tool) => tool(alias, dir)), edit('src/alias.txt', dir))) {
      expect(stderr).toContain(rel);
      expect(stderr).toMatch(/another name \(a hard link\)/);
    }
  });

  it('linked from outside the project, edited from inside it (the event\'s cwd) and from a folder below it', async () => {
    const alias = link('.planning/work/units/M7.E1.json', join(tmp, 'elsewhere.json'));
    await blocked(edit(alias, dir));
    await blocked(edit(alias, join(dir, 'src')));
    await hookBlocked(edit(alias, dir), edit(alias, join(dir, 'src')));
  });

  it('linked from inside the project, edited from a cwd outside it', async () => {
    const alias = link('.planning/work/units/M7.E1.json', join(dir, 'src', 'alias.json'));
    await blocked(edit(alias, tmp));
    await hookBlocked(edit(alias, tmp));
  });

  it('a link to WORK.md: an edit of its version is refused, an edit of its prose is allowed', async () => {
    const alias = link('.planning/work/WORK.md', join(dir, 'src', 'work-alias.md'));
    const ed = (old_string, new_string) => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: alias, old_string, new_string } });
    const out = await guard(ed('schema_version: 2', 'schema_version: 1'));
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/switches this project's v2 work store on/);
    await allowed(ed('Some prose.', 'Other prose.'));
    const [{ status, stderr }] = await runHooks([ed('schema_version: 2', 'schema_version: 1')]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/switches this project's v2 work store on/);
    await hookAllowed(ed('Some prose.', 'Other prose.'));
  });

  it('a link to a file that is not guarded is allowed: an item body, an ordinary file', async () => {
    const links = [
      link('.planning/work/items/00/SIG-1.md', join(dir, 'src', 'body.md')),
      link('README.md', join(dir, 'src', 'readme-again.md')),
      link('.planning/DECISIONS.md', join(dir, 'src', 'decisions.md')),
    ];
    for (const alias of links) await allowed(edit(alias, dir));
    await hookAllowed(edit(links[0], dir), edit(links[1], dir));
  });

  it('a project with no v2 store is never blocked', async () => {
    const off = join(tmp, 'off');
    plantPlanning(join(off, '.planning'), 'v1');
    linkSync(join(off, '.planning/work/units/M7.E1.json'), join(off, 'alias.json'));
    await allowed(edit(join(off, 'alias.json'), off));
    await hookAllowed(edit(join(off, 'alias.json'), off));
  });
});

// ── a symlinked .planning, addressed by its real path ───────────────────────

describe('a `.planning` that is a symlink, edited by the real path', () => {
  let store; // where the planning files really are
  beforeEach(() => {
    store = join(tmp, 'kept-elsewhere');
    plantPlanning(store);
    symlinkSync(store, join(dir, '.planning'));
  });

  it.each([
    'work/units/M7.E1.json', 'work/units/new.json', 'work/items/00/SIG-1.json', 'work/items/04/SIG-400.json',
    'BUGS.md', 'work/EPICS.md', 'work/history/2026-10.md',
  ])('%s by its real path is refused, from the project and from a folder below it', async (rest) => {
    const reason = await blocked(edit(join(store, rest), dir));
    expect(reason).toContain(`.planning/${rest}`);
    await blocked(write(join(store, rest), join(dir, 'src')));
    await blocked(notebook(join(store, rest), dir));
  });

  // No `.planning` in these paths either: held through the hook as well.
  it('through the hook: a record, a new record and a view by their real paths are refused', async () => {
    const [first] = await hookBlocked(
      edit(join(store, 'work/units/M7.E1.json'), dir),
      write(join(store, 'work/units/new.json'), join(dir, 'src')),
      notebook(join(store, 'work/items/00/SIG-1.json'), dir),
      multi(join(store, 'BUGS.md'), dir),
    );
    expect(first).toContain('.planning/work/units/M7.E1.json');
  });

  it('through the symlink it is refused, as before', async () => {
    await blocked(edit(join(dir, '.planning/work/units/M7.E1.json'), dir));
    await blocked(edit('.planning/BUGS.md', dir));
    await hookBlocked(edit('.planning/BUGS.md', dir));
  });

  it('what is editable through `.planning` is editable by the real path: a body, a hand-kept file, a new note', async () => {
    for (const rest of ['work/items/00/SIG-1.md', 'DECISIONS.md', 'NOTES.md', 'work/notes/x.json']) await allowed(edit(join(store, rest), dir));
    await hookAllowed(edit(join(store, 'work/items/00/SIG-1.md'), dir), edit(join(store, 'NOTES.md'), dir));
  });

  it('WORK.md by its real path: an edit of its version is refused, an edit of its prose is allowed', async () => {
    const ed = (old_string, new_string) => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: join(store, 'work', 'WORK.md'), old_string, new_string } });
    expect((await guard(ed('schema_version: 2', 'schema_version: 1'))).block).toBe(true);
    await allowed(ed('Some prose.', 'Other prose.'));
    const [refused, let_through] = await runHooks([ed('schema_version: 2', 'schema_version: 1'), ed('Some prose.', 'Other prose.')]);
    expect(refused.status).toBe(2);
    expect(let_through).toEqual({ status: 0, stderr: '' });
  });

  it('with no units folder: a Write under the real `work/units/` is refused', async () => {
    rmSync(join(store, 'work', 'units'), { recursive: true });
    await blocked(write(join(store, 'work', 'units', 'M7.E9.json'), dir));
    await blocked(write(join(store, 'work', 'UNITS', 'notes.md'), dir));
    await hookBlocked(write(join(store, 'work', 'units', 'M7.E9.json'), dir));
  });
});

describe('a folder inside `.planning` that is a symlink, edited by the real path', () => {
  it('`.planning/work` kept elsewhere', async () => {
    const planning = join(tmp, 'staging');
    plantPlanning(planning);
    mkdirSync(join(dir, '.planning'));
    for (const v of ['BUGS.md', 'DECISIONS.md']) writeFileSync(join(dir, '.planning', v), 'x\n');
    symlinkSync(join(planning, 'work'), join(dir, '.planning', 'work'));
    await blocked(edit(join(planning, 'work', 'units', 'M7.E1.json'), dir));
    await blocked(edit(join(planning, 'work', 'items', '00', 'SIG-1.json'), dir));
    await blocked(edit(join(planning, 'work', 'EPICS.md'), dir));
    await allowed(edit(join(planning, 'work', 'items', '00', 'SIG-1.md'), dir));
    // `staging/BUGS.md` is not this project's view: only `work` points there.
    await allowed(edit(join(planning, 'BUGS.md'), dir));
    await hookBlocked(edit(join(planning, 'work', 'units', 'M7.E1.json'), dir));
    await hookAllowed(edit(join(planning, 'BUGS.md'), dir));
  });

  it('`.planning/work/units` kept elsewhere', async () => {
    plantPlanning(join(dir, '.planning'));
    const units = join(tmp, 'units-elsewhere');
    mkdirSync(units);
    writeFileSync(join(units, 'M7.E2.json'), '{}\n');
    rmSync(join(dir, '.planning', 'work', 'units'), { recursive: true });
    symlinkSync(units, join(dir, '.planning', 'work', 'units'));
    await blocked(edit(join(units, 'M7.E2.json'), dir));
    await blocked(write(join(units, 'notes.md'), dir));
    await allowed(write(join(tmp, 'units-elsewhere-2', 'notes.md'), dir));
    await hookBlocked(write(join(units, 'notes.md'), dir));
    await hookAllowed(write(join(tmp, 'units-elsewhere-2', 'notes.md'), dir));
  });
});

describe('a project whose parent folder is a symlink', () => {
  let realProject;
  let linkedProject;
  beforeEach(() => {
    mkdirSync(join(tmp, 'real-parent'));
    realProject = join(tmp, 'real-parent', 'proj');
    plantPlanning(join(realProject, '.planning'));
    symlinkSync(join(tmp, 'real-parent'), join(tmp, 'linked-parent'));
    linkedProject = join(tmp, 'linked-parent', 'proj');
  });

  it.each(['.planning/work/units/M7.E1.json', '.planning/BUGS.md', '.planning/work/items/00/SIG-1.json'])(
    '%s is refused by the real path and by the linked one, from either cwd', async (rel) => {
      for (const cwd of [realProject, linkedProject]) {
        await blocked(edit(join(realProject, rel), cwd));
        await blocked(edit(join(linkedProject, rel), cwd));
        await blocked(edit(rel, cwd));
      }
    });

  it('a body and an ordinary file stay editable by either path', async () => {
    for (const cwd of [realProject, linkedProject]) {
      await allowed(edit(join(realProject, '.planning/work/items/00/SIG-1.md'), cwd));
      await allowed(edit(join(linkedProject, '.planning/work/items/00/SIG-1.md'), cwd));
      await allowed(write(join(linkedProject, 'src', 'x.js'), cwd));
    }
  });

  it('through the hook: the same, each path from the other one\'s cwd', async () => {
    const rel = '.planning/work/units/M7.E1.json';
    await hookBlocked(edit(join(realProject, rel), linkedProject), edit(join(linkedProject, rel), realProject), edit(rel, linkedProject));
    await hookAllowed(write(join(linkedProject, 'src', 'x.js'), realProject));
  });
});

// ── what the hook must not do ───────────────────────────────────────────────

const ORDINARY = [
  'README.md', 'src/index.js', 'src/new/deep/file.ts', 'src/units/M7.E1.json', 'src/work/items/00/SIG-1.json', 'BUGS.md',
  'src/ünits.md', 'src/unitſ/X.json', 'src/ｕｎｉｔｓ.json', 'src/a file with spaces.md', 'notes.ipynb',
  '.planning/DECISIONS.md', '.planning/NOTES.md', '.planning/M7.E1-PLAN.md', '.planning/archive/M7/E1/BUGS.md',
  '.planning/work/items/00/SIG-1.md', '.planning/work/notes.md', '.planning/research/units/x.json',
];

describe.each([['a v2 store', 'v2'], ['a v1 store', 'v1'], ['no store', null]])('ordinary edits are allowed — %s', (_label, store) => {
  beforeEach(() => plantPlanning(join(dir, '.planning'), store));

  it.each(ORDINARY)('%s: every tool, absolute and relative', async (rel) => {
    for (const tool of TOOLS) {
      await allowed(tool(join(dir, rel), dir));
      await allowed(tool(rel, dir));
      await allowed(tool(join(dir, rel), join(dir, 'src')));
    }
  });

  // The hook itself, on a sample: an ordinary file with every tool, then one
  // path of each kind above with the tools taken in turn.
  it('through the hook: an ordinary file with every tool, and one of each kind of path', async () => {
    const sample = ['src/new/deep/file.ts', 'src/unitſ/X.json', '.planning/DECISIONS.md', '.planning/work/items/00/SIG-1.md'];
    await hookAllowed(
      ...TOOLS.map((tool) => tool(join(dir, 'README.md'), dir)),
      ...sample.map((rel, i) => TOOLS[i % TOOLS.length](rel, dir)),
      edit(join(dir, 'src', 'index.js'), join(dir, 'src')),
    );
  });

  it('a file outside the project, and one with a second name that is no record', async () => {
    writeFileSync(join(tmp, 'outside.txt'), 'a\n');
    linkSync(join(tmp, 'outside.txt'), join(tmp, 'outside-again.txt'));
    for (const tool of TOOLS) {
      await allowed(tool(join(tmp, 'outside.txt'), dir));
      await allowed(tool(join(tmp, 'outside-again.txt'), dir));
    }
    await hookAllowed(edit(join(tmp, 'outside-again.txt'), dir));
  });
});

describe('the hook never fails', () => {
  beforeEach(() => plantPlanning(join(dir, '.planning')));

  const ODD_PATHS = [
    '', ' ', '.', '..', '/', '\u0000', 'src/\u0000/x', '\uD800', 'src/\uDFFF.md', 'x'.repeat(5000), `${'d/'.repeat(600)}f.md`,
    '.planning', '.planning/', '.planning/work', '.planning/work/', '.planning/work/items', '.planning/\u0000/BUGS.md',
  ];

  it('an odd path, with every tool: the guard answers, and does not throw', async () => {
    for (const p of ODD_PATHS) {
      for (const tool of TOOLS) {
        const out = await guard(tool(p, dir));
        expect(typeof out.block, JSON.stringify(p).slice(0, 40)).toBe('boolean');
        if (out.block) expect(out.reason).toMatch(/v2 work store/);
      }
    }
  });

  // Every odd path through the hook once, the tools taken in turn.
  it('an odd path through the hook: exit 0 or a refusal, never a crash', async () => {
    const events = ODD_PATHS.map((p, i) => TOOLS[i % TOOLS.length](p, dir));
    const results = await runHooks(events);
    results.forEach(({ status, stderr }, i) => {
      expect([0, 2], named(events[i]).slice(0, 60)).toContain(status);
      if (status === 0) expect(stderr).toBe('');
      else expect(stderr).toMatch(/^\[signal:check-state-write\] /);
    });
  });

  it('a cwd that is not there, is a file, or is not a string', async () => {
    const cwds = [join(tmp, 'gone'), join(dir, 'README.md'), '', 7, null, undefined, '\u0000'];
    for (const cwd of cwds) {
      await allowed(edit(join(dir, 'src', 'index.js'), cwd));
      await allowed(notebook(join(dir, 'src', 'a.ipynb'), cwd));
    }
    await hookAllowed(...cwds.map((cwd, i) => (i % 2 === 0 ? edit(join(dir, 'src', 'index.js'), cwd) : notebook(join(dir, 'src', 'a.ipynb'), cwd))));
  });

  it('a `.planning` that cannot be read as a folder: a file, a dangling symlink, a symlink loop', async () => {
    const a = join(tmp, 'a');
    mkdirSync(a);
    writeFileSync(join(a, '.planning'), 'a file\n');
    const b = join(tmp, 'b');
    mkdirSync(b);
    symlinkSync(join(tmp, 'nowhere'), join(b, '.planning'));
    const c = join(tmp, 'c');
    mkdirSync(c);
    symlinkSync(join(c, '.planning'), join(c, '.planning'));
    const events = [
      edit(join(a, 'x.md'), a),
      edit(join(b, 'x.md'), b),
      edit(join(b, '.planning', 'BUGS.md'), b),
      edit(join(c, 'x.md'), c),
      edit(join(c, '.planning', 'work', 'units', 'X.json'), c),
    ];
    for (const event of events) await allowed(event);
    await hookAllowed(...events);
  });

  it('checkWorkWrite itself resolves to "allow" for anything it cannot read', async () => {
    const odd = [undefined, null, 7, {}, [], '', '\u0000', '\uD800', 'x'.repeat(5000)];
    for (const filePath of odd) {
      for (const cwd of [...odd, dir]) {
        await expect(checkWorkWrite({ filePath, cwd, tool: 'Edit', input: {} })).resolves.toMatchObject({ block: false });
      }
    }
    await expect(checkWorkWrite({ filePath: join(dir, 'src', 'index.js'), cwd: dir })).resolves.toEqual({ block: false });
  });
});
