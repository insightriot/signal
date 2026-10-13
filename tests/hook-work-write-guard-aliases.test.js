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
// The hook is spawned with an event on stdin, as hook-work-write-guard.test.js
// does. Projects are temp folders; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { checkWorkWrite, protectedTarget } from '../plugin/tools/lib/work-write-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'plugin', 'hooks', 'check-state-write.js');
const HOOKS_JSON = join(__dirname, '..', 'plugin', 'hooks', 'hooks.json');

function runRaw(input) {
  const r = spawnSync('node', [HOOK], { encoding: 'utf-8', input });
  return { status: r.status, stderr: (r.stderr ?? '').toString() };
}
const runHook = (event) => runRaw(JSON.stringify(event));

const edit = (file_path, cwd) => ({ tool_name: 'Edit', cwd, tool_input: { file_path, old_string: 'a', new_string: 'b' } });
const write = (file_path, cwd) => ({ tool_name: 'Write', cwd, tool_input: { file_path, content: 'x\n' } });
const multi = (file_path, cwd) => ({ tool_name: 'MultiEdit', cwd, tool_input: { file_path, edits: [{ old_string: 'a', new_string: 'b' }] } });
const notebook = (notebook_path, cwd) => ({ tool_name: 'NotebookEdit', cwd, tool_input: { notebook_path, new_source: 'x', edit_mode: 'replace' } });
const TOOLS = [edit, write, multi, notebook];

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

const blocked = (event) => {
  const { status, stderr } = runHook(event);
  expect(status, `${event.tool_name} ${JSON.stringify(event.tool_input.file_path ?? event.tool_input.notebook_path)}: ${stderr}`).toBe(2);
  expect(stderr).toMatch(/v2 work store/);
  return stderr;
};
const allowed = (event) => {
  const { status, stderr } = runHook(event);
  expect(status, `${event.tool_name} ${JSON.stringify(event.tool_input.file_path ?? event.tool_input.notebook_path)}: ${stderr}`).toBe(0);
  expect(stderr).toBe('');
};

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

  it.each(NOT_LOOKALIKES)('%s is a different name, and is not guarded', (_label, rel) => {
    expect(protectedTarget(join(tmp, 'not-there', rel))).toMatchObject({ blocked: false });
    expect(protectedTarget(join(dir, rel))).toMatchObject({ blocked: false });
  });

  it.each(LOOKALIKES.filter(([, rel]) => rel.startsWith('.planning/')))('the hook refuses it: %s', (_label, rel) => {
    blocked(write(join(dir, rel)));
    blocked(edit(rel, dir));
  });

  // The route that mattered: with no `units` folder a Write of `unitſ/X.json`
  // creates a folder that macOS then opens as `units`, which turns unit records on.
  it('with no units folder: a Write under `unitſ/` is refused', () => {
    rmSync(join(dir, '.planning', 'work', 'units'), { recursive: true });
    blocked(write(join(dir, '.planning/work/unitſ/X.json')));
    blocked(write(join(dir, '.planning/work/unitſ/notes.md')));
    blocked(notebook(join(dir, '.planning/work/unitſ/X.json')));
  });

  it.each(NOT_LOOKALIKES)('the hook allows it: %s', (_label, rel) => {
    allowed(write(join(dir, rel)));
  });

  it('on this filesystem: every spelling it opens as the real file is refused', () => {
    const real = {
      '.planning/work/unitſ/M7.E1.json': '.planning/work/units/M7.E1.json',
      '.planning/worK/units/M7.E1.json': '.planning/work/units/M7.E1.json',
      '.planning/ißues-inbox.md': '.planning/ISSUES-INBOX.md',
      '.planning/IẞUES-INBOX.md': '.planning/ISSUES-INBOX.md',
      '.planning/work/ｕｎｉｔｓ/M7.E1.json': '.planning/work/units/M7.E1.json',
    };
    for (const [rel, to] of Object.entries(real)) {
      expect(existsSync(join(dir, to))).toBe(true);
      // Where the filesystem does not open it as the real file it is still
      // refused, by shape (above); here it must be.
      if (existsSync(join(dir, rel))) blocked(edit(join(dir, rel)));
    }
  });

  // Not a fixed list: ask this filesystem which single characters it opens as
  // a plain letter (or as `ss`), and check the guard reads each the same way.
  // On a filesystem that compares names exactly this finds none.
  it('on this filesystem: every character it opens as a plain letter is read as that letter', () => {
    const probe = join(tmp, 'probe');
    mkdirSync(probe);
    for (const name of [...'abcdefghijklmnopqrstuvwxyz', 'ss']) writeFileSync(join(probe, name), '');
    const templates = [
      '.planning/bugs.md', '.planning/backlog.md', '.planning/issues-inbox.md', '.planning/open-questions.md',
      '.planning/work/epics.md', '.planning/work/history/y.md', '.planning/work/units/x',
    ];
    const missed = [];
    for (let cp = 0x80; cp <= 0xFFFF; cp += 1) {
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

  it('hooks.json registers the hook for it', () => {
    const cfg = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
    const entry = cfg.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('check-state-write.js')));
    expect(entry.matcher.split('|')).toContain('NotebookEdit');
  });

  it.each([
    '.planning/work/units/M7.E1.json', '.planning/work/items/00/SIG-1.json', '.planning/BUGS.md', '.planning/work/units/new.ipynb',
  ])('its `notebook_path` is read: %s is refused', (rel) => {
    blocked(notebook(join(dir, rel)));
    blocked(notebook(rel, dir));
  });

  it('a notebook anywhere else is allowed, and so is a call with no path', () => {
    allowed(notebook(join(dir, 'src', 'analysis.ipynb')));
    allowed(notebook(join(dir, '.planning', 'notes.ipynb')));
    allowed({ tool_name: 'NotebookEdit', cwd: dir, tool_input: { new_source: 'x' } });
    allowed({ tool_name: 'NotebookEdit', cwd: dir, tool_input: { notebook_path: 7 } });
    // `file_path` is not this tool's field: it is not read for it.
    allowed({ tool_name: 'NotebookEdit', cwd: dir, tool_input: { file_path: join(dir, '.planning/BUGS.md') } });
  });

  it('a project with no v2 store is never blocked', () => {
    const off = join(tmp, 'off');
    plantPlanning(join(off, '.planning'), 'v1');
    allowed(notebook(join(off, '.planning/work/units/M7.E1.json')));
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
  ])('%s, linked from inside the project: every tool is refused, and the message names the record', (_label, rel) => {
    const alias = link(rel, join(dir, 'src', 'alias.txt'));
    for (const tool of TOOLS) {
      const stderr = blocked(tool(alias, dir));
      expect(stderr).toContain(rel);
      expect(stderr).toMatch(/another name \(a hard link\)/);
    }
    blocked(edit('src/alias.txt', dir));
  });

  it('linked from outside the project, edited from inside it (the event\'s cwd) and from a folder below it', () => {
    const alias = link('.planning/work/units/M7.E1.json', join(tmp, 'elsewhere.json'));
    blocked(edit(alias, dir));
    blocked(edit(alias, join(dir, 'src')));
  });

  it('linked from inside the project, edited from a cwd outside it', () => {
    const alias = link('.planning/work/units/M7.E1.json', join(dir, 'src', 'alias.json'));
    blocked(edit(alias, tmp));
  });

  it('a link to WORK.md: an edit of its version is refused, an edit of its prose is allowed', () => {
    const alias = link('.planning/work/WORK.md', join(dir, 'src', 'work-alias.md'));
    const ed = (old_string, new_string) => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: alias, old_string, new_string } });
    const { status, stderr } = runHook(ed('schema_version: 2', 'schema_version: 1'));
    expect(status).toBe(2);
    expect(stderr).toMatch(/switches this project's v2 work store on/);
    allowed(ed('Some prose.', 'Other prose.'));
  });

  it('a link to a file that is not guarded is allowed: an item body, an ordinary file', () => {
    allowed(edit(link('.planning/work/items/00/SIG-1.md', join(dir, 'src', 'body.md')), dir));
    allowed(edit(link('README.md', join(dir, 'src', 'readme-again.md')), dir));
    allowed(edit(link('.planning/DECISIONS.md', join(dir, 'src', 'decisions.md')), dir));
  });

  it('a project with no v2 store is never blocked', () => {
    const off = join(tmp, 'off');
    plantPlanning(join(off, '.planning'), 'v1');
    linkSync(join(off, '.planning/work/units/M7.E1.json'), join(off, 'alias.json'));
    allowed(edit(join(off, 'alias.json'), off));
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
  ])('%s by its real path is refused, from the project and from a folder below it', (rest) => {
    const stderr = blocked(edit(join(store, rest), dir));
    expect(stderr).toContain(`.planning/${rest}`);
    blocked(write(join(store, rest), join(dir, 'src')));
    blocked(notebook(join(store, rest), dir));
  });

  it('through the symlink it is refused, as before', () => {
    blocked(edit(join(dir, '.planning/work/units/M7.E1.json'), dir));
    blocked(edit('.planning/BUGS.md', dir));
  });

  it('what is editable through `.planning` is editable by the real path: a body, a hand-kept file, a new note', () => {
    for (const rest of ['work/items/00/SIG-1.md', 'DECISIONS.md', 'NOTES.md', 'work/notes/x.json']) allowed(edit(join(store, rest), dir));
  });

  it('WORK.md by its real path: an edit of its version is refused, an edit of its prose is allowed', () => {
    const ed = (old_string, new_string) => ({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: join(store, 'work', 'WORK.md'), old_string, new_string } });
    expect(runHook(ed('schema_version: 2', 'schema_version: 1')).status).toBe(2);
    allowed(ed('Some prose.', 'Other prose.'));
  });

  it('with no units folder: a Write under the real `work/units/` is refused', () => {
    rmSync(join(store, 'work', 'units'), { recursive: true });
    blocked(write(join(store, 'work', 'units', 'M7.E9.json'), dir));
    blocked(write(join(store, 'work', 'UNITS', 'notes.md'), dir));
  });
});

describe('a folder inside `.planning` that is a symlink, edited by the real path', () => {
  it('`.planning/work` kept elsewhere', () => {
    const planning = join(tmp, 'staging');
    plantPlanning(planning);
    mkdirSync(join(dir, '.planning'));
    for (const v of ['BUGS.md', 'DECISIONS.md']) writeFileSync(join(dir, '.planning', v), 'x\n');
    symlinkSync(join(planning, 'work'), join(dir, '.planning', 'work'));
    blocked(edit(join(planning, 'work', 'units', 'M7.E1.json'), dir));
    blocked(edit(join(planning, 'work', 'items', '00', 'SIG-1.json'), dir));
    blocked(edit(join(planning, 'work', 'EPICS.md'), dir));
    allowed(edit(join(planning, 'work', 'items', '00', 'SIG-1.md'), dir));
    // `staging/BUGS.md` is not this project's view: only `work` points there.
    allowed(edit(join(planning, 'BUGS.md'), dir));
  });

  it('`.planning/work/units` kept elsewhere', () => {
    plantPlanning(join(dir, '.planning'));
    const units = join(tmp, 'units-elsewhere');
    mkdirSync(units);
    writeFileSync(join(units, 'M7.E2.json'), '{}\n');
    rmSync(join(dir, '.planning', 'work', 'units'), { recursive: true });
    symlinkSync(units, join(dir, '.planning', 'work', 'units'));
    blocked(edit(join(units, 'M7.E2.json'), dir));
    blocked(write(join(units, 'notes.md'), dir));
    allowed(write(join(tmp, 'units-elsewhere-2', 'notes.md'), dir));
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
    '%s is refused by the real path and by the linked one, from either cwd', (rel) => {
      for (const cwd of [realProject, linkedProject]) {
        blocked(edit(join(realProject, rel), cwd));
        blocked(edit(join(linkedProject, rel), cwd));
        blocked(edit(rel, cwd));
      }
    });

  it('a body and an ordinary file stay editable by either path', () => {
    for (const cwd of [realProject, linkedProject]) {
      allowed(edit(join(realProject, '.planning/work/items/00/SIG-1.md'), cwd));
      allowed(edit(join(linkedProject, '.planning/work/items/00/SIG-1.md'), cwd));
      allowed(write(join(linkedProject, 'src', 'x.js'), cwd));
    }
  });
});

// ── what the hook must not do ───────────────────────────────────────────────

describe.each([['a v2 store', 'v2'], ['a v1 store', 'v1'], ['no store', null]])('ordinary edits are allowed — %s', (_label, store) => {
  beforeEach(() => plantPlanning(join(dir, '.planning'), store));

  it.each([
    'README.md', 'src/index.js', 'src/new/deep/file.ts', 'src/units/M7.E1.json', 'src/work/items/00/SIG-1.json', 'BUGS.md',
    'src/ünits.md', 'src/unitſ/X.json', 'src/ｕｎｉｔｓ.json', 'src/a file with spaces.md', 'notes.ipynb',
    '.planning/DECISIONS.md', '.planning/NOTES.md', '.planning/M7.E1-PLAN.md', '.planning/archive/M7/E1/BUGS.md',
    '.planning/work/items/00/SIG-1.md', '.planning/work/notes.md', '.planning/research/units/x.json',
  ])('%s: every tool, absolute and relative', (rel) => {
    for (const tool of TOOLS) {
      allowed(tool(join(dir, rel), dir));
      allowed(tool(rel, dir));
      allowed(tool(join(dir, rel), join(dir, 'src')));
    }
  });

  it('a file outside the project, and one with a second name that is no record', () => {
    writeFileSync(join(tmp, 'outside.txt'), 'a\n');
    linkSync(join(tmp, 'outside.txt'), join(tmp, 'outside-again.txt'));
    for (const tool of TOOLS) {
      allowed(tool(join(tmp, 'outside.txt'), dir));
      allowed(tool(join(tmp, 'outside-again.txt'), dir));
    }
  });
});

describe('the hook never fails', () => {
  beforeEach(() => plantPlanning(join(dir, '.planning')));

  const ODD_PATHS = [
    '', ' ', '.', '..', '/', '\u0000', 'src/\u0000/x', '\uD800', 'src/\uDFFF.md', 'x'.repeat(5000), `${'d/'.repeat(600)}f.md`,
    '.planning', '.planning/', '.planning/work', '.planning/work/', '.planning/work/items', '.planning/\u0000/BUGS.md',
  ];

  it.each(ODD_PATHS.map((p) => [JSON.stringify(p).slice(0, 40), p]))('an odd path %s: exit 0 or a refusal, never a crash', (_label, p) => {
    for (const tool of TOOLS) {
      const { status, stderr } = runHook(tool(p, dir));
      expect([0, 2]).toContain(status);
      if (status === 0) expect(stderr).toBe('');
      else expect(stderr).toMatch(/^\[signal:check-state-write\] /);
    }
  });

  it('a cwd that is not there, is a file, or is not a string', () => {
    for (const cwd of [join(tmp, 'gone'), join(dir, 'README.md'), '', 7, null, undefined, '\u0000']) {
      allowed(edit(join(dir, 'src', 'index.js'), cwd));
      allowed(notebook(join(dir, 'src', 'a.ipynb'), cwd));
    }
  });

  it('a `.planning` that cannot be read as a folder: a file, a dangling symlink, a symlink loop', () => {
    const a = join(tmp, 'a');
    mkdirSync(a);
    writeFileSync(join(a, '.planning'), 'a file\n');
    allowed(edit(join(a, 'x.md'), a));
    const b = join(tmp, 'b');
    mkdirSync(b);
    symlinkSync(join(tmp, 'nowhere'), join(b, '.planning'));
    allowed(edit(join(b, 'x.md'), b));
    allowed(edit(join(b, '.planning', 'BUGS.md'), b));
    const c = join(tmp, 'c');
    mkdirSync(c);
    symlinkSync(join(c, '.planning'), join(c, '.planning'));
    allowed(edit(join(c, 'x.md'), c));
    allowed(edit(join(c, '.planning', 'work', 'units', 'X.json'), c));
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
