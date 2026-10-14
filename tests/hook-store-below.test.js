// M6.E16 r6.7 — a write through a link into a store that is NOT above the
// session's folder: a monorepo whose store is in a sub-package, or another
// project's store.
//
// The edit hook decides whether to load the guard from cheap questions: does
// the path, or where it resolves, mention `.planning`; is there a store
// above the cwd or above the target. Its own resolver walked up to the
// nearest existing folder and never followed a dangling link, so
// `repo/src/c0 -> ../pkg/.planning/work/units/M9.E1.json` resolved to
// `repo/src/c0`: no `.planning`, no store above `repo/` or `repo/src`. The
// guard was never loaded, the hook exited 0, and the write went through the
// link and created the record. `checkWorkWrite` alone blocked it.
//
// Now there is one resolver (`realpathLoose`, `store-above.js`), used by both,
// following dangling links as far as the system does (40); the hook also
// loads the guard whenever the target itself is a link; and the guard looks
// for a store from where the write would land, too.
//
// Every case runs through BOTH the hook's stdin entry and `checkWorkWrite`.

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
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', fail);
    child.on('close', (status) => done({ status, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(ev));
  });
}
// Both entries, for one target, from one cwd: [hook exit status, guard's block].
async function judged(tool, file, cwd) {
  const ev = event(tool, file, cwd);
  const [hook, guard] = await Promise.all([runHook(ev), checkWorkWrite({ filePath: file, cwd, tool, input: ev.tool_input })]);
  return [hook.status, guard.block];
}
const REFUSED = [2, true];
const ALLOWED = [0, false];

let root;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sig-store-below-')));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const at = (rel) => join(root, ...rel.split('/'));
function store(dir, version = 2) {
  mkdirSync(join(dir, '.planning', 'work', 'units'), { recursive: true });
  mkdirSync(join(dir, '.planning', 'work', 'items', '00'), { recursive: true });
  writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), `---\nkey: SIG\nschema_version: ${version}\n---\n`);
}
// `from/c0 -> c1 -> … -> c(n-1) -> end`: n links, all in `from`.
function chain(from, n, end) {
  mkdirSync(from, { recursive: true });
  for (let i = 0; i < n; i += 1) symlinkSync(i === n - 1 ? end : `c${i + 1}`, join(from, `c${i}`));
  return join(from, 'c0');
}

describe('a monorepo whose store is in a sub-package (repo/pkg), the session in repo/', { timeout: 60_000 }, () => {
  beforeEach(() => {
    mkdirSync(at('repo/src'), { recursive: true });
    store(at('repo/pkg'));
  });
  const RECORD = () => at('repo/pkg/.planning/work/units/M9.E1.json');

  it('one link, every tool, from repo/, repo/src and repo/pkg: refused by the hook and by the guard', async () => {
    const link = chain(at('repo/src'), 1, '../pkg/.planning/work/units/M9.E1.json');
    for (const cwd of [at('repo'), at('repo/src'), at('repo/pkg')]) {
      const got = await Promise.all(TOOLS.map((tool) => judged(tool, link, cwd)));
      expect(got, cwd).toEqual(TOOLS.map(() => REFUSED));
    }
    expect(existsSync(RECORD())).toBe(false);
  });

  it.each([2, 8, 9, 20, 40])('a chain of %i dangling links, from repo/ and repo/src: refused by both', async (n) => {
    const link = chain(at('repo/src'), n, RECORD());
    for (const cwd of [at('repo'), at('repo/src')]) {
      expect(await judged('Write', link, cwd), `${cwd}, n=${n}`).toEqual(REFUSED);
    }
  });

  it('a chain of 41 — past what the system follows: the system will not write through it, and the guard refuses it where it can tell', async () => {
    const link = chain(at('repo/src'), 41, RECORD());
    // From inside the package a store is found, and the guard refuses.
    expect(await judged('Write', link, at('repo/pkg'))).toEqual(REFUSED);
    // From repo/ no store can be found from the chain; the system refuses the write.
    let code;
    try {
      writeFileSync(link, '{}\n');
    } catch (err) {
      code = err.code;
    }
    expect(code).toBe('ELOOP');
    expect(existsSync(RECORD())).toBe(false);
  });

  // The store's `.planning` is a link to a folder beside it, so where the write
  // lands has no `.planning` in its path: only the store found from THAT
  // folder (`storeRoots`, from the resolved target) judges it.
  it('a link to where a sub-package\'s linked `.planning` really is: refused by both', async () => {
    mkdirSync(at('repo/pkg2/realplan/work/units'), { recursive: true });
    writeFileSync(at('repo/pkg2/realplan/work/WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
    symlinkSync('realplan', at('repo/pkg2/.planning'));
    const link = chain(at('repo/src'), 1, at('repo/pkg2/realplan/work/units/M9.E2.json'));
    expect(await judged('Write', link, at('repo'))).toEqual(REFUSED);
  });
});

describe('across projects: the session in a project with no store, a link into another project\'s', { timeout: 60_000 }, () => {
  it('every tool: refused by both', async () => {
    mkdirSync(at('mine/src'), { recursive: true });
    store(at('theirs'));
    const link = chain(at('mine/src'), 2, at('theirs/.planning/work/items/00/SIG-9.json'));
    const got = await Promise.all(TOOLS.map((tool) => judged(tool, link, at('mine'))));
    expect(got).toEqual(TOOLS.map(() => REFUSED));
  });
});

describe('what stays allowed', { timeout: 60_000 }, () => {
  it('a link that loops, in a project with a store: refused, quickly', async () => {
    store(at('p'));
    mkdirSync(at('p/src'));
    symlinkSync('b', at('p/src/a'));
    symlinkSync('a', at('p/src/b'));
    const t = process.hrtime.bigint();
    expect((await checkWorkWrite({ filePath: at('p/src/a'), cwd: at('p'), tool: 'Write', input: {} })).block).toBe(true);
    expect(Number(process.hrtime.bigint() - t) / 1e6).toBeLessThan(50);
    expect(await judged('Write', at('p/src/a'), at('p'))).toEqual(REFUSED);
  });

  it('ordinary files: through 12 existing links; through 3 dangling links to a new file; no store anywhere; a v1 store', async () => {
    store(at('p'));
    mkdirSync(at('p/src'));
    writeFileSync(at('p/src/real.js'), 'a\n');
    const existing = chain(at('p/src/e'), 12, at('p/src/real.js'));
    const dangling = chain(at('p/src/d'), 3, at('p/src/new.js'));
    mkdirSync(at('nostore/src'), { recursive: true });
    const noStore = chain(at('nostore/src'), 3, at('nostore/.planning/work/units/M9.E1.json'));
    store(at('v1'), 1);
    mkdirSync(at('v1/src'));
    const v1 = chain(at('v1/src'), 2, at('v1/.planning/work/units/M9.E1.json'));
    const got = await Promise.all([
      judged('Write', existing, at('p')), judged('Edit', dangling, at('p')), judged('Write', noStore, at('nostore')), judged('Write', v1, at('v1')),
    ]);
    expect(got).toEqual([ALLOWED, ALLOWED, ALLOWED, ALLOWED]);
  });
});
