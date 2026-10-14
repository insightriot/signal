// M6.E16 r6.1 — three more ways past, or around, the edit guard
// (`plugin/tools/lib/work-write-guard.js`, behind
// `plugin/hooks/check-state-write.js`).
//
//   - macOS names any file by its numbers: `/.vol/<device>/<inode>`, and a
//     file inside a folder as `/.vol/<device>/<folder's inode>/<name>`. Such a
//     path has no `.planning` in it, cannot be resolved to one (`realpath`
//     says no such file), and the file behind it has one name, so the
//     hard-link check never looked. The guard now compares the numbers
//     themselves with those of the project's guarded files and folders, and
//     refuses a `/.vol` path it cannot resolve at all.
//   - the hard-link check read at most 20,000 folder entries and then
//     ALLOWED. 20,001 files dropped into `.planning/work/` switched it off.
//     The files every store has are now asked about by name, the records'
//     folders are read first, and a file with two names that is still
//     undecided when the limit is reached is refused.
//   - a path of 16,000 folders made the hook walk every one of them, twice:
//     three seconds. A path longer than any file can be opened by is let
//     through at once.
//
// The `/.vol` tests that open real `/.vol` paths run on macOS only and say so
// in their names; the decision behind them is tested in this process on every
// system. The limit is lowered through `testSeam`, not by writing 20,001
// files. Projects are temp folders; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { checkWorkWrite, folderCandidate, isVolPath, testSeam, volCandidate } from '../plugin/tools/lib/work-write-guard.js';
import { PATH_BYTES_MAX, pathCannotExist, storeAbove } from '../plugin/tools/lib/store-above.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'plugin', 'hooks', 'check-state-write.js');

const edit = (file_path, cwd) => ({ filePath: file_path, cwd, tool: 'Edit', input: { file_path, old_string: 'a', new_string: 'b' } });
const write = (file_path, cwd) => ({ filePath: file_path, cwd, tool: 'Write', input: { file_path, content: 'x\n' } });

async function blocked(call) {
  const out = await checkWorkWrite(call);
  expect(out.block, call.filePath).toBe(true);
  expect(out.reason).toMatch(/v2 work store/);
  return out.reason;
}
async function allowed(call) {
  expect(await checkWorkWrite(call), call.filePath).toEqual({ block: false });
}

function runHook(event) {
  return new Promise((done, fail) => {
    const child = spawn('node', [HOOK], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', fail);
    child.on('close', (status) => done({ status, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(event));
  });
}

let tmp;
let dir;
const at = (rel) => join(dir, ...rel.split('/'));
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sig-guard-r61-')));
  dir = join(tmp, 'project');
  mkdirSync(at('src'), { recursive: true });
  mkdirSync(at('.planning/work/items/00'), { recursive: true });
  mkdirSync(at('.planning/work/history'), { recursive: true });
  mkdirSync(at('.planning/work/units'), { recursive: true });
  writeFileSync(at('src/index.js'), 'a\n');
  for (const v of ['BUGS.md', 'DECISIONS.md']) writeFileSync(at(`.planning/${v}`), `# ${v}\n`);
  writeFileSync(at('.planning/work/items/00/SIG-1.json'), '{}\n');
  writeFileSync(at('.planning/work/items/00/SIG-1.md'), 'body\n');
  writeFileSync(at('.planning/work/units/M7.E1.json'), '{}\n');
  writeFileSync(at('.planning/work/EPICS.md'), 'epics\n');
  writeFileSync(at('.planning/work/WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(() => {
  testSeam.linkScanMax = null;
  rmSync(tmp, { recursive: true, force: true });
});

// ── /.vol ───────────────────────────────────────────────────────────────────

// `/.vol/<device>/<inode>` for a file or folder of the project.
const vol = (rel) => {
  const s = statSync(at(rel));
  return `/.vol/${s.dev}/${s.ino}`;
};
// Does this system open files by `/.vol` paths? (macOS does.)
const volWorks = (() => {
  try {
    const s = statSync(tmpdir());
    return statSync(`/.vol/${s.dev}/${s.ino}`).ino === s.ino;
  } catch {
    return false;
  }
})();

describe('the decision behind a /.vol path (every system)', () => {
  it('a path is a /.vol path by its first folder, however it is spelt', () => {
    for (const p of ['/.vol/16777234/123', '/.vol/1/2/units/X.json', '/.VOL/1/2', '/.vol']) expect(isVolPath(p), p).toBe(true);
    for (const p of ['/tmp/.vol/1/2', '/.volume/1/2', '/vol/1/2', '/Users/x/.planning/work/units/X.json']) expect(isVolPath(p), p).toBe(false);
  });

  // `volCandidate(target, above, entries)`: the numbers of the target (null
  // when it is not there), of each folder above it nearest first with the path
  // under it, and the project's guarded files and folders with theirs.
  const n = (ino) => ({ dev: 1n, ino: BigInt(ino) });
  const entries = [
    { rel: '.planning/work/WORK.md', dir: false, ...n(10) },
    { rel: '.planning/work/units/M7.E1.json', dir: false, ...n(11) },
    { rel: '.planning/work/items/00/SIG-1.json', dir: false, ...n(12) },
    { rel: '.planning', dir: true, ...n(20) },
    { rel: '.planning/work', dir: true, ...n(21) },
    { rel: '.planning/work/units', dir: true, ...n(22) },
    { rel: '.planning/work/items/00', dir: true, ...n(23) },
  ];
  it('the numbers of a guarded file → that file', () => {
    expect(volCandidate(n(11), [], entries)).toEqual({ rel: '.planning/work/units/M7.E1.json' });
    expect(volCandidate(n(10), [], entries)).toEqual({ rel: '.planning/work/WORK.md' });
  });
  it('a file that is not there, in a guarded folder → the path it would have', () => {
    expect(volCandidate(null, [{ ...n(22), rest: ['NEW.json'] }], entries)).toEqual({ rel: '.planning/work/units/NEW.json' });
    expect(volCandidate(null, [{ ...n(1), rest: ['NEW.json'] }, { ...n(21), rest: ['units', 'NEW.json'] }], entries)).toEqual({ rel: '.planning/work/units/NEW.json' });
    expect(volCandidate(null, [{ ...n(20), rest: ['BUGS.md'] }], entries)).toEqual({ rel: '.planning/BUGS.md' });
  });
  it('what is not guarded is not a candidate: another file, a body file, a document beside the views', () => {
    expect(volCandidate(n(99), [], entries)).toBeNull();
    expect(volCandidate(null, [{ ...n(23), rest: ['SIG-1.md'] }], entries)).toBeNull();
    expect(volCandidate(null, [{ ...n(20), rest: ['DECISIONS.md'] }], entries)).toBeNull();
    // the same inode number on another device is another file
    expect(volCandidate({ dev: 2n, ino: 11n }, [], entries)).toBeNull();
  });
  it('nothing resolved at all → unresolved, which the guard refuses in a project with a store', () => {
    expect(volCandidate(null, [], entries)).toEqual({ unresolved: true });
    expect(volCandidate(null, [{ dev: null, ino: null, rest: ['x'] }], entries)).toEqual({ unresolved: true });
  });
});

describe.skipIf(!volWorks)('/.vol paths, for real (macOS only — skipped where /.vol does not open files)', () => {
  it.each([
    ['a unit record', '.planning/work/units/M7.E1.json'],
    ['an item record', '.planning/work/items/00/SIG-1.json'],
    ['a view', '.planning/BUGS.md'],
    ['the Epic list', '.planning/work/EPICS.md'],
  ])('%s named by its numbers: refused, and the message names the record', async (_label, rel) => {
    for (const call of [edit, write]) {
      const reason = await blocked(call(vol(rel), dir));
      expect(reason).toContain(rel);
      expect(reason).toMatch(/names .* by its file numbers \(a \/\.vol path\)/);
    }
  });

  it('a new file in a guarded folder named by the folder\'s numbers: refused', async () => {
    expect(await blocked(write(`${vol('.planning/work/units')}/M7.E9.json`, dir))).toContain('.planning/work/units/M7.E9.json');
    expect(await blocked(write(`${vol('.planning/work')}/units/M7.E9.json`, dir))).toContain('.planning/work/units/M7.E9.json');
    expect(await blocked(write(`${vol('.planning')}/BACKLOG.md`, dir))).toContain('.planning/BACKLOG.md');
    await blocked(write(`${vol('.')}/.planning/work/units/M7.E9.json`, dir));
  });

  it('WORK.md by its numbers: an edit that keeps the version and key is allowed, one that changes them is refused', async () => {
    const p = vol('.planning/work/WORK.md');
    await allowed({ filePath: p, cwd: dir, tool: 'Edit', input: { file_path: p, old_string: 'key: SIG\nschema_version: 2\n---\n', new_string: 'key: SIG\nschema_version: 2\n---\n\nA note.\n' } });
    const out = await checkWorkWrite({ filePath: p, cwd: dir, tool: 'Edit', input: { file_path: p, old_string: 'schema_version: 2', new_string: 'schema_version: 1' } });
    expect(out.block).toBe(true);
  });

  it('what is not guarded stays editable by its numbers: a source file, an item\'s body file, a document beside the views', async () => {
    await allowed(edit(vol('src/index.js'), dir));
    await allowed(edit(vol('.planning/work/items/00/SIG-1.md'), dir));
    await allowed(edit(vol('.planning/DECISIONS.md'), dir));
    await allowed(write(`${vol('src')}/new.js`, dir));
  });

  it('a /.vol path that resolves to nothing: refused in a project with a v2 store, allowed anywhere else', async () => {
    const nowhere = `/.vol/${statSync(dir).dev}/999999999999`;
    const reason = await blocked(edit(nowhere, dir));
    expect(reason).toMatch(/could not be resolved/);
    expect(reason).toMatch(/Address the file by its path/);
    await allowed(edit(nowhere, tmp)); // no store above this folder
  });

  it('the hook itself refuses a record named by its numbers (exit 2)', async () => {
    const p = vol('.planning/work/units/M7.E1.json');
    const { status, stderr } = await runHook({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: p, old_string: 'a', new_string: 'b' } });
    expect(status).toBe(2);
    expect(stderr).toMatch(/^\[signal:check-state-write\] .*v2 work store/s);
  });
});

// ── the hard-link check and its limit ───────────────────────────────────────

describe('a hard link in a project whose store holds more files than the check reads', () => {
  // Thirty files directly in `.planning/work/`, and a limit of ten entries.
  beforeEach(() => {
    for (let i = 0; i < 30; i += 1) writeFileSync(at(`.planning/work/junk-${i}.txt`), 'x\n');
    testSeam.linkScanMax = 10;
  });
  const link = (rel, to) => {
    linkSync(at(rel), at(to));
    return at(to);
  };

  it.each([
    ['a unit record', '.planning/work/units/M7.E1.json'],
    ['an item record', '.planning/work/items/00/SIG-1.json'],
    ['a view', '.planning/BUGS.md'],
    ['the Epic list', '.planning/work/EPICS.md'],
  ])('a second name for %s is still found: the records\' folders and the known files are asked about first', async (_label, rel) => {
    const reason = await blocked(edit(link(rel, 'src/alias.txt'), dir));
    expect(reason).toContain(rel);
    expect(reason).toMatch(/another name \(a hard link\)/);
  });

  it('a file with two names that is not found before the limit is refused, not allowed', async () => {
    const reason = await blocked(edit(link('src/index.js', 'src/second-name.js'), dir));
    expect(reason).toMatch(/has more than one name \(a hard link\)/);
    expect(reason).toMatch(/too many files to check/);
  });

  it('a file with one name is not asked about at all, whatever the store holds', async () => {
    await allowed(edit(at('src/index.js'), dir));
  });

  it('under the limit nothing changes: the same second name is allowed', async () => {
    testSeam.linkScanMax = null;
    await allowed(edit(link('src/index.js', 'src/second-name.js'), dir));
  });
});

// ── a very long path ────────────────────────────────────────────────────────

describe('a path longer than a file can be opened by', () => {
  it('is said to be one past 4096 bytes, counted in bytes', () => {
    expect(PATH_BYTES_MAX).toBe(4096);
    expect(pathCannotExist(`/${'a'.repeat(4095)}`)).toBe(false);
    expect(pathCannotExist(`/${'a'.repeat(4096)}`)).toBe(true);
    expect(pathCannotExist(`/${'é'.repeat(2048)}`)).toBe(true); // 4097 bytes in 2049 characters
  });

  it('16,000 folders deep: the guard answers at once, and so does the hook (it took 3 s)', async () => {
    const deep = `${dir}${'/a'.repeat(16000)}/.planning/work/units/X.json`;
    const t = process.hrtime.bigint();
    await allowed(write(deep, dir));
    expect(Number(process.hrtime.bigint() - t) / 1e6).toBeLessThan(200);
    const { status, stderr } = await runHook({ tool_name: 'Write', cwd: dir, tool_input: { file_path: deep, content: 'x\n' } });
    expect(status).toBe(0);
    expect(stderr).toBe('');
  });

  it('the longest path that can exist, as many folders as fit: the walk for a store stays well under 200 ms', () => {
    const longest = `/${'a/'.repeat(2047)}a`; // 4096 bytes, 2048 folders
    expect(pathCannotExist(longest)).toBe(false);
    const t = process.hrtime.bigint();
    expect(storeAbove(longest)).toBe(false);
    expect(Number(process.hrtime.bigint() - t) / 1e6).toBeLessThan(200);
  });

  it('a guarded path of ordinary length is still refused', async () => {
    await blocked(write(at('.planning/work/units/M7.E9.json'), dir));
  });
});

// ── r6.3: a guarded folder is known by its numbers, whatever the path says ──
//
// The guard compared a symlinked `.planning` with the target by the TEXT of
// their real paths. macOS has a second spelling for every path on the data
// volume — `/System/Volumes/Data/…` — that `realpath` leaves as it is, so the
// text never matched and the edit went through. Each folder above the target
// is now compared with the project's guarded folders by device and file
// number: one mechanism for that spelling, for a bind mount, for any other.

describe('the decision by a folder\'s numbers (every system)', () => {
  const n = (ino) => ({ dev: 1n, ino: BigInt(ino) });
  const dirs = [
    { rel: '.planning', ...n(20) }, { rel: '.planning/work', ...n(21) },
    { rel: '.planning/work/items', ...n(22) }, { rel: '.planning/work/units', ...n(23) }, { rel: '.planning/work/history', ...n(24) },
  ];
  it('a folder above the target with a guarded folder\'s numbers → the path the target has under it', () => {
    expect(folderCandidate([{ ...n(99), rest: ['SIG-1.json'] }, { ...n(22), rest: ['00', 'SIG-1.json'] }], dirs)).toEqual({ rel: '.planning/work/items/00/SIG-1.json' });
    expect(folderCandidate([{ ...n(23), rest: ['M7.E9.json'] }], dirs)).toEqual({ rel: '.planning/work/units/M7.E9.json' });
    expect(folderCandidate([{ ...n(20), rest: ['BUGS.md'] }], dirs)).toEqual({ rel: '.planning/BUGS.md' });
  });
  it('what is not guarded under such a folder, another device, or no such folder → nothing', () => {
    expect(folderCandidate([{ ...n(99), rest: ['SIG-1.md'] }, { ...n(22), rest: ['00', 'SIG-1.md'] }], dirs)).toBeNull();
    expect(folderCandidate([{ ...n(20), rest: ['DECISIONS.md'] }], dirs)).toBeNull();
    expect(folderCandidate([{ dev: 2n, ino: 23n, rest: ['M7.E9.json'] }], dirs)).toBeNull();
    expect(folderCandidate([{ dev: null, ino: null, rest: ['x.json'] }, { ...n(5), rest: ['a', 'x.json'] }], dirs)).toBeNull();
  });
});

// The same folder under its other spelling on a Mac's data volume.
const dataVolume = (p) => `/System/Volumes/Data${p}`;
const dataVolumeWorks = (() => {
  try {
    const s = statSync(tmpdir());
    const t = statSync(dataVolume(realpathSync(tmpdir())));
    return s.ino === t.ino && s.dev === t.dev && realpathSync(dataVolume(realpathSync(tmpdir()))).startsWith('/System/Volumes/Data');
  } catch {
    return false;
  }
})();

describe.skipIf(!dataVolumeWorks)('a symlinked `.planning`, reached by the data volume\'s other spelling (macOS only — skipped elsewhere)', () => {
  // The store is kept beside the project, and `.planning` is a link to it.
  let kept;
  beforeEach(() => {
    kept = join(tmp, 'store-real');
    renameSync(at('.planning'), kept);
    symlinkSync(kept, at('.planning'));
  });

  it('a record, a view and a new unit file by that spelling: refused', async () => {
    for (const rel of ['work/items/00/SIG-1.json', 'work/units/M7.E1.json', 'BUGS.md', 'work/EPICS.md']) {
      const p = dataVolume(join(kept, rel));
      expect(p).not.toContain('.planning');
      expect(statSync(p).ino).toBe(statSync(join(kept, rel)).ino);
      expect(await blocked(edit(p, dir)), rel).toContain(`.planning/${rel}`);
    }
    await blocked(write(dataVolume(join(kept, 'work/units/M7.E9.json')), dir));
  });

  it('what is not guarded there stays editable: a body file, a document, a file outside the store', async () => {
    await allowed(edit(dataVolume(join(kept, 'work/items/00/SIG-1.md')), dir));
    await allowed(edit(dataVolume(join(kept, 'DECISIONS.md')), dir));
    await allowed(edit(dataVolume(at('src/index.js')), dir));
  });

  it('the hook refuses it too (exit 2)', async () => {
    const p = dataVolume(join(kept, 'work/units/M7.E1.json'));
    const { status, stderr } = await runHook({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: p, old_string: 'a', new_string: 'b' } });
    expect(status).toBe(2);
    expect(stderr).toMatch(/v2 work store/);
  });
});

// r6.4 — a folder of records that is a LINK is not read. r6.3 read through
// such links, for a case nobody had run: a hard link to a record inside one.
// But the store does not read a linked folder (`listRecords` refuses it), so
// nothing under one is a live record — and reading through `items/zz -> /`
// walked the whole disk's top: the hook took over half a second and then
// refused every file that has a second name.
describe('a folder of records that is a link is not read', () => {
  beforeEach(() => {
    symlinkSync('/', at('.planning/work/items/zz'));
    symlinkSync(at('.planning/work/items'), at('.planning/work/items/loop'));
  });

  it('an ordinary file with a second name is allowed, quickly', async () => {
    linkSync(at('src/index.js'), at('src/second-name.js'));
    const t = process.hrtime.bigint();
    await allowed(edit(at('src/second-name.js'), dir));
    expect(Number(process.hrtime.bigint() - t) / 1e6).toBeLessThan(50);
  });

  it('a record\'s own second name is still refused', async () => {
    linkSync(at('.planning/work/items/00/SIG-1.json'), at('src/alias.json'));
    const reason = await blocked(edit(at('src/alias.json'), dir));
    expect(reason).toMatch(/another name \(a hard link\) for \.planning\/work\/items\/00\/SIG-1\.json/);
  });

  it('a file under the linked folder is not taken for a record of this project', async () => {
    const elsewhere = join(tmp, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, 'SIG-101.json'), '{}\n');
    symlinkSync(elsewhere, at('.planning/work/items/01'));
    linkSync(join(elsewhere, 'SIG-101.json'), at('src/other-alias.json'));
    await allowed(edit(at('src/other-alias.json'), dir));
  });
});

// r6.4: the folder comparison is made on the target as the system resolves it
// too. Behind ONE link whose text is the data volume's other spelling, the
// path as written has no guarded folder above it by its numbers' route.
describe.skipIf(!dataVolumeWorks)('a link to the data volume\'s spelling of a record folder (macOS only — skipped elsewhere)', () => {
  it('a Write through `alias2 -> /System/Volumes/Data/<the store>/work/items/00` is refused', async () => {
    const kept = join(tmp, 'realplan');
    renameSync(at('.planning'), kept);
    symlinkSync(kept, at('.planning'));
    const proj2 = join(tmp, 'proj2');
    mkdirSync(proj2);
    symlinkSync(dataVolume(join(kept, 'work', 'items', '00')), join(proj2, 'alias2'));
    const target = join(proj2, 'alias2', 'KK-1.json');
    expect(target).not.toContain('.planning');
    expect(await blocked(write(target, dir))).toContain('.planning/work/items/00/KK-1.json');
    // and what is not a record there is left alone
    await allowed(write(join(proj2, 'alias2', 'notes.md'), dir));
  });
});

describe('the guard never throws, whatever the folders above the target are', () => {
  it('a target under a folder that is not there, under a file, and at the top of the disk', async () => {
    await allowed(write(at('src/not/there/yet/x.js'), dir));
    await allowed(write(at('src/index.js/x.js'), dir));
    await allowed(write('/x.js', dir));
  });
});
