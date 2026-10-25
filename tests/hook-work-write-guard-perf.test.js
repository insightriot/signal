// The edit guard's wall-clock budgets (`plugin/tools/lib/work-write-guard.js`,
// `plugin/tools/lib/store-above.js`). Moved out of
// tests/hook-work-write-guard-r61.test.js, budgets unchanged, after one of them
// failed twice in CI on load alone — 288 ms, then 200.3 ms against 200, with the
// pull_request run on the same commit passing both times (SIG-346). Measured while
// the rest of the suite runs in parallel, a budget fails for reasons other than
// slowness (SIG-303). This file runs in `npm run test:perf`
// (vitest.perf.config.js, one file at a time), never in `npm test`. What each case
// decides is still asserted in the r61 file; here only how long it takes.
//
// Each case makes the same call once, untimed, before the timed one. In the r61
// file earlier tests had already warmed the code; alone, a first call measured
// 177 ms against 50 for a check that takes 2 ms after it (JIT and module loading).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkWorkWrite } from '../plugin/tools/lib/work-write-guard.js';
import { storeAbove } from '../plugin/tools/lib/store-above.js';

const edit = (file_path, cwd) => ({ filePath: file_path, cwd, tool: 'Edit', input: { file_path, old_string: 'a', new_string: 'b' } });
const write = (file_path, cwd) => ({ filePath: file_path, cwd, tool: 'Write', input: { file_path, content: 'x\n' } });
const ms = (t) => Number(process.hrtime.bigint() - t) / 1e6;

let tmp;
let dir;
const at = (rel) => join(dir, ...rel.split('/'));
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sig-guard-perf-')));
  dir = join(tmp, 'project');
  mkdirSync(at('src'), { recursive: true });
  mkdirSync(at('.planning/work/items/00'), { recursive: true });
  mkdirSync(at('.planning/work/units'), { recursive: true });
  writeFileSync(at('src/index.js'), 'a\n');
  writeFileSync(at('.planning/work/items/00/SIG-1.json'), '{}\n');
  writeFileSync(at('.planning/work/WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('a path longer than a file can be opened by', () => {
  it('16,000 folders deep: the guard answers in under 200 ms (it took 3 s)', async () => {
    const deep = `${dir}${'/a'.repeat(16000)}/.planning/work/units/X.json`;
    await checkWorkWrite(write(deep, dir));
    const t = process.hrtime.bigint();
    expect(await checkWorkWrite(write(deep, dir))).toEqual({ block: false });
    expect(ms(t)).toBeLessThan(200);
  });

  it('the longest path that can exist, as many folders as fit: the walk for a store stays under 200 ms', () => {
    const longest = `/${'a/'.repeat(2047)}a`; // 4096 bytes, 2048 folders
    storeAbove(longest);
    const t = process.hrtime.bigint();
    expect(storeAbove(longest)).toBe(false);
    expect(ms(t)).toBeLessThan(200);
  });
});

describe('a folder of records that is a link is not read', () => {
  it('an ordinary file with a second name is allowed in under 50 ms', async () => {
    symlinkSync('/', at('.planning/work/items/zz'));
    symlinkSync(at('.planning/work/items'), at('.planning/work/items/loop'));
    linkSync(at('src/index.js'), at('src/second-name.js'));
    await checkWorkWrite(edit(at('src/second-name.js'), dir));
    const t = process.hrtime.bigint();
    expect(await checkWorkWrite(edit(at('src/second-name.js'), dir))).toEqual({ block: false });
    expect(ms(t)).toBeLessThan(50);
  });
});

describe('a write through a dangling link', () => {
  it('a link that loops is refused in under 50 ms', async () => {
    symlinkSync('loop-b', at('src/loop-a'));
    symlinkSync('loop-a', at('src/loop-b'));
    await checkWorkWrite(write(at('src/loop-a'), dir));
    const t = process.hrtime.bigint();
    const out = await checkWorkWrite(write(at('src/loop-a'), dir));
    expect(ms(t)).toBeLessThan(50);
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/more than 40 links/);
  });
});
