// M6.E16 r6.8 — `..` after a folder link is resolved where the system
// resolves it: AFTER following the link.
//
// `src/x -> ../.planning/work/items/00`, so `src/x/../../units` is
// `.planning/work/units` to the system. Collapsed as TEXT first, it is
// `<root>/units`. Two places did that:
//
//   - following a dangling link (`realpathLoose`, `store-above.js`):
//     `src/notes.json -> x/../../units/M9.E7.json` resolved to
//     `<root>/units/M9.E7.json`;
//   - the entry (`resolve(cwd, file_path)` in the hook and the guard): a
//     `file_path` of `<root>/src/x/../../units/M9.E7.json` was judged as
//     `<root>/units/M9.E7.json`.
//
// Both were allowed by the hook and by the guard, and a write created the
// record. Every case runs through the hook's stdin AND `checkWorkWrite`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { checkWorkWrite } from '../plugin/tools/lib/work-write-guard.js';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks', 'check-state-write.js');
const TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

function event(tool, file, cwd) {
  const input = {
    Write: { file_path: file, content: '{}\n' },
    Edit: { file_path: file, old_string: 'a', new_string: 'b' },
    MultiEdit: { file_path: file, edits: [{ old_string: 'a', new_string: 'b' }] },
    NotebookEdit: { notebook_path: file, new_source: 'x' },
  }[tool];
  return { tool_name: tool, cwd, tool_input: input };
}
function runHook(ev) {
  return new Promise((done, fail) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.on('error', fail);
    child.on('close', (status) => done(status));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(ev));
  });
}
async function judged(tool, file, cwd) {
  const ev = event(tool, file, cwd);
  const [status, guard] = await Promise.all([runHook(ev), checkWorkWrite({ filePath: file, cwd, tool, input: ev.tool_input })]);
  return [status, guard.block];
}
const allTools = (file, cwd) => Promise.all(TOOLS.map((tool) => judged(tool, file, cwd)));
const REFUSED = [2, true];
const ALLOWED = [0, false];

let root;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sig-dotdot-')));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
function store(dir) {
  for (const sub of ['units', 'items/00']) mkdirSync(join(dir, '.planning', 'work', ...sub.split('/')), { recursive: true });
  writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
}

// One project (`p`), or the monorepo (`repo`, store in `repo/pkg`). `src` holds
// `x -> <store>/.planning/work/items/00`; the record paths go through `x/../..`.
const LAYOUTS = {
  'one project': { proj: 'p', srcRel: 'p/src', storeRel: 'p', cwds: ['p'] },
  monorepo: { proj: 'repo', srcRel: 'repo/src', storeRel: 'repo/pkg', cwds: ['repo', 'repo/src', 'repo/pkg'] },
};
function layout(name) {
  const l = LAYOUTS[name];
  store(join(root, l.storeRel));
  const src = join(root, l.srcRel);
  mkdirSync(src, { recursive: true });
  symlinkSync(join(root, l.storeRel, '.planning', 'work', 'items', '00'), join(src, 'x'));
  return { src, cwds: l.cwds.map((c) => join(root, c)), store: join(root, l.storeRel, '.planning', 'work') };
}

describe.each(Object.keys(LAYOUTS))('%s: `..` after a folder link', { timeout: 60_000 }, (name) => {
  it.each([['a new unit', 'units/M9.E7.json'], ['a new item', 'items/00/SIG-77.json']])('%s, through a dangling link `notes.json -> x/../../…`: refused, every tool, every cwd', async (_label, rel) => {
    const l = layout(name);
    symlinkSync(`x/../../${rel}`, join(l.src, 'notes.json'));
    for (const cwd of l.cwds) expect(await allTools(join(l.src, 'notes.json'), cwd), cwd).toEqual(TOOLS.map(() => REFUSED));
    expect(existsSync(join(l.store, rel))).toBe(false);
  });

  it.each([['a new unit', 'units/M9.E7.json'], ['a new item', 'items/00/SIG-77.json']])('%s, as the path written `src/x/../../…`: refused, every tool, every cwd', async (_label, rel) => {
    const l = layout(name);
    const written = `${l.src}/x/../../${rel}`;
    for (const cwd of l.cwds) expect(await allTools(written, cwd), cwd).toEqual(TOOLS.map(() => REFUSED));
    // and written relative to the cwd too
    const fromCwd = `${l.src.slice(l.cwds[0].length + 1)}/x/../../${rel}`;
    expect(await allTools(fromCwd, l.cwds[0])).toEqual(TOOLS.map(() => REFUSED));
  });
});

describe('what stays allowed, and a loop', { timeout: 60_000 }, () => {
  it('an ordinary `src/a/../b.js` with no links; a dangling link with `..` to an ordinary new file: allowed', async () => {
    const l = layout('one project');
    mkdirSync(join(l.src, 'a'));
    symlinkSync('a/../new.js', join(l.src, 'to-new.js'));
    const got = await Promise.all([judged('Write', `${l.src}/a/../b.js`, l.cwds[0]), judged('Write', join(l.src, 'to-new.js'), l.cwds[0])]);
    expect(got).toEqual([ALLOWED, ALLOWED]);
  });

  it('a loop: refused', async () => {
    const l = layout('one project');
    symlinkSync('loop-b', join(l.src, 'loop-a'));
    symlinkSync('loop-a', join(l.src, 'loop-b'));
    expect(await judged('Write', join(l.src, 'loop-a'), l.cwds[0])).toEqual(REFUSED);
  });
});
