// Tests for the store consistency check (M6.E11.S1.t1.4, FR-3, D-M6E11-8).
// See .planning/M6.E11-VALIDATION.md rows AC-3.1, AC-3.2 (fixture part), AC-4.3.
// The live half of AC-3.2 — checkStore returns [] on this repository — is t7.3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { checkStore } from '../plugin/tools/lib/work-store.js';
import { stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-check-'));
  await mkdir(join(base, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');

function itemText(id, status, extra = {}) {
  const item = { id, type: 'BUG', status, ...extra };
  if (status === 'C' && !item.close) item.close = { reason: 'fixed', by: 'brett', at: '2026-09-01' };
  return stringifyItem(item, 'words\n');
}
// Plant an item under .planning/work/<rel>, id taken from the filename.
async function plant(rel, status, extra) {
  const id = rel.split('/').pop().replace(/\.md$/, '');
  await put(join('.planning/work', rel), itemText(id, status, extra));
}

const codes = (findings) => findings.map((f) => f.code).sort();

describe('checkStore — store off / clean', () => {
  it('store off → []', async () => {
    await plant('inbox/SIG-1.md', 'T'); // would be a mismatch, but the store is off
    expect(checkStore(base)).toEqual([]);
  });

  it('a broken WORK.md throws CONFIG rather than reporting clean', async () => {
    await put('.planning/work/WORK.md', '---\nkey: sig\n---\n');
    expect(() => checkStore(base)).toThrow(WorkStoreError);
  });

  it('a consistent store → [], and non-item files are not findings', async () => {
    await storeOn();
    await put('.planning/work/WATCHLIST.md', '# Watchlist\n');
    await plant('inbox/SIG-1.md', 'N');
    await plant('backlog/SIG-2.md', 'T');
    await plant('epics/M6.E11/SIG-3.md', 'Q');
    await plant('epics/M6.E11/SIG-4.md', 'P');
    // An Epic's items close in its folder and travel with it (D-M6E11-29).
    await plant('epics/M6.E11/SIG-13.md', 'C');
    await put('.planning/work/epics/M6.E11/M6.E11-PLAN.md', '# plan\n'); // Epic artifact
    await plant('done/2026-09/SIG-5.md', 'C');
    await put('.planning/archive/epics/M6.E9/SIG-6.md', itemText('SIG-6', 'C'));
    expect(checkStore(base)).toEqual([]);
  });
});

describe('checkStore — AC-3.1: every status/folder disagreement', () => {
  const cases = [
    ['T in inbox/', 'inbox/SIG-10.md', 'T'],
    ['N in backlog/', 'backlog/SIG-11.md', 'N'],
    ['T in an Epic folder', 'epics/M6.E11/SIG-12.md', 'T'],
    ['P in done/', 'done/2026-09/SIG-14.md', 'P'],
    ['C in inbox/', 'inbox/SIG-15.md', 'C'],
  ];
  it.each(cases)('%s', async (_label, rel, status) => {
    await storeOn();
    await plant(rel, status);
    const findings = checkStore(base);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.code).toBe('status-folder');
    expect(f.id).toBe(rel.split('/').pop().replace('.md', ''));
    expect(f.path).toBe(join('.planning/work', rel));
    expect(f.message).toContain(f.path);
  });

  it('an open item in a closed Epic archive is reported', async () => {
    await storeOn();
    await put('.planning/archive/epics/M6.E9/SIG-16.md', itemText('SIG-16', 'P'));
    expect(codes(checkStore(base))).toEqual(['status-folder']);
  });

  it.each([
    ['an Epic folder that is not an Epic ID', 'epics/m6-e11/SIG-20.md', 'Q', /Epic ID/],
    ['a done/ subfolder that is not YYYY-MM', 'done/2026-13/SIG-21.md', 'C', /YYYY-MM/],
    ['an item directly in done/', 'done/SIG-22.md', 'C', /YYYY-MM/],
    ['an item directly in epics/', 'epics/SIG-23.md', 'Q', /Epic/],
    ['an item at the store root', 'SIG-24.md', 'N', /folder/],
    ['an item in an unknown folder', 'someday/SIG-25.md', 'T', /folder/],
    ['an item nested below its folder', 'backlog/old/SIG-26.md', 'T', /folder/],
  ])('%s', async (_label, rel, status, pattern) => {
    await storeOn();
    await plant(rel, status);
    const findings = checkStore(base);
    expect(codes(findings)).toEqual(['status-folder']);
    expect(findings[0].message).toMatch(pattern);
  });
});

describe('checkStore — AC-3.2 / AC-4.3: duplicate IDs name both files', () => {
  it('two branches that allocated the same number, merged', async () => {
    initRepo(base);
    await storeOn();
    await plant('inbox/SIG-1.md', 'N');
    commitAll(base, 'base');
    git(base, ['checkout', '-q', '-b', 'lane-a']);
    await plant('inbox/SIG-5.md', 'N');
    commitAll(base, 'lane a allocates 5');
    git(base, ['checkout', '-q', 'main']);
    git(base, ['checkout', '-q', '-b', 'lane-b']);
    await plant('backlog/SIG-5.md', 'T');
    commitAll(base, 'lane b also allocates 5');
    git(base, ['checkout', '-q', 'main']);
    git(base, ['merge', '-q', '--no-edit', 'lane-a']);
    git(base, ['merge', '-q', '--no-edit', 'lane-b']);

    const findings = checkStore(base);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.code).toBe('duplicate-id');
    expect(f.id).toBe('SIG-5');
    expect(f.paths).toEqual(['.planning/work/backlog/SIG-5.md', '.planning/work/inbox/SIG-5.md']);
    expect(f.message).toContain('.planning/work/backlog/SIG-5.md');
    expect(f.message).toContain('.planning/work/inbox/SIG-5.md');
  });

  it('a live item and an archived item with the same ID', async () => {
    await storeOn();
    await plant('backlog/SIG-7.md', 'T');
    await put('.planning/archive/epics/M6.E9/SIG-7.md', itemText('SIG-7', 'C'));
    const findings = checkStore(base);
    expect(codes(findings)).toEqual(['duplicate-id']);
    expect(findings[0].paths).toHaveLength(2);
  });
});

describe('checkStore — schema errors and filename/id disagreement', () => {
  it('every schema error is reported with its path', async () => {
    await storeOn();
    await put('.planning/work/backlog/SIG-30.md', itemText('SIG-30', 'T', { type: 'TASK', epic: 'M6.E11' }));
    const findings = checkStore(base);
    expect(codes(findings)).toEqual(['schema', 'schema']);
    for (const f of findings) {
      expect(f.id).toBe('SIG-30');
      expect(f.path).toBe('.planning/work/backlog/SIG-30.md');
      expect(f.message).toContain('.planning/work/backlog/SIG-30.md');
    }
  });

  it('unparseable frontmatter is a schema finding, and the check carries on', async () => {
    await storeOn();
    await put('.planning/work/inbox/SIG-31.md', 'no frontmatter\n');
    await plant('inbox/SIG-32.md', 'T');
    expect(codes(checkStore(base))).toEqual(['schema', 'status-folder']);
  });

  it('filename ≠ frontmatter id', async () => {
    await storeOn();
    await put('.planning/work/inbox/SIG-40.md', itemText('SIG-41', 'N'));
    const findings = checkStore(base);
    expect(codes(findings)).toEqual(['filename-id']);
    expect(findings[0].id).toBe('SIG-40');
    expect(findings[0].message).toMatch(/SIG-41/);
  });

  it('an item file with another key is reported', async () => {
    await storeOn();
    await put('.planning/work/inbox/OTHER-3.md', itemText('OTHER-3', 'N'));
    expect(codes(checkStore(base))).toEqual(['schema']);
  });

  it('a symlinked folder is not followed', async () => {
    await storeOn();
    const outside = join(base, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'SIG-50.md'), itemText('SIG-50', 'C'), 'utf-8');
    await mkdir(join(base, '.planning/work'), { recursive: true });
    await symlink(outside, join(base, '.planning/work/inbox'));
    expect(checkStore(base)).toEqual([]);
  });
});
