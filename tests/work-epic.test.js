// Epic folders in the work store (M6.E11.S5 t5.2–t5.3, FR-8, D-M6E11-13).
// See .planning/M6.E11-VALIDATION.md rows AC-8.1 … AC-8.4.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { execFileSync } from 'node:child_process';

import { closeEpic, closeItem, getItem, listItems, moveItem, newItem } from '../plugin/tools/lib/work-ops.js';
import { checkStore } from '../plugin/tools/lib/work-store.js';
import { parseFrontmatter } from '../plugin/tools/lib/state.js';
import { checkInternalLinks } from '../plugin/tools/lib/doc-hygiene.js';
import { stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';
import { GENERATED_MARKER, generateAll } from '../plugin/tools/lib/work-generate.js';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-epic-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'brett' };
const CLOSE = { reason: 'fixed', by: 'brett', at: '2026-09-20T00:00:00.000Z', proof: 'v0.1.40' };
const item = (id, type, status, extra = {}) => ({ id, type, status, title: `${id} title`, created: CREATED, ...extra });
const plant = (folder, it, body = 'The words.\n') => put(`.planning/${folder}/${it.id}.md`, stringifyItem(it, body));
const read = (rel) => readFile(join(base, rel), 'utf-8');

describe('t5.2 — list --epic reads only that Epic\'s folder (AC-8.1)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('work/epics/M6.E11', item('SIG-1', 'FEAT', 'P'));
    await plant('work/epics/M6.E11', item('SIG-2', 'BUG', 'Q'));
    await plant('work/epics/M6.E7', item('SIG-3', 'FEAT', 'Q'));
    await plant('work/backlog', item('SIG-4', 'FEAT', 'T'));
    await put('.planning/work/epics/M6.E11/M6.E11-PLAN.md', '# not an item\n');
  });

  it('returns the folder\'s items and nothing from other folders', () => {
    expect(listItems(base, { epic: 'M6.E11' }).map((r) => r.item.id)).toEqual(['SIG-1', 'SIG-2']);
  });

  it('a broken item elsewhere breaks the whole list but not the Epic\'s — it never reads outside the folder', async () => {
    await put('.planning/work/inbox/SIG-9.md', '---\nid: SIG-9\n---\nno status\n');
    expect(() => listItems(base)).toThrow(WorkStoreError);
    expect(listItems(base, { epic: 'M6.E11' }).map((r) => r.item.id)).toEqual(['SIG-1', 'SIG-2']);
  });

  it('an archived Epic\'s items are still its items', async () => {
    await plant('archive/epics/M6.E1', item('SIG-5', 'CHORE', 'C', { close: CLOSE }));
    expect(listItems(base, { epic: 'M6.E1' }).map((r) => r.item.id)).toEqual(['SIG-5']);
  });

  it('refuses an Epic ID that could leave the store', () => {
    for (const bad of ['..', '../x', 'M6.E1/..', 'nope']) {
      expect(() => listItems(base, { epic: bad })).toThrow(WorkStoreError);
    }
  });
});

describe('t5.2 — generateAll reads archived Epics too (carried finding)', () => {
  it('a closed bug archived with its Epic stays in BUGS.md', async () => {
    await storeOn();
    await plant('archive/epics/M6.E1', item('SIG-7', 'BUG', 'C', { close: CLOSE, title: 'Archived bug' }));
    await plant('work/backlog', item('SIG-8', 'BUG', 'T', { title: 'Live bug' }));
    await generateAll(base);
    const bugs = await read('.planning/BUGS.md');
    expect(bugs).toMatch(/^\| B7 \| `fixed` \|/m);
    expect(bugs).toMatch(/^\| B8 \| `confirmed` \|/m);
  });
});

describe('t5.2 — the generated Epic index, .planning/work/EPICS.md (AC-8.2)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('work/epics/M6.E11', item('SIG-1', 'FEAT', 'P'));
    await plant('work/epics/M6.E11', item('SIG-2', 'BUG', 'Q'));
    await put('.planning/archive/epics/M6.E1/README.md',
      '---\nepic: M6.E1\nclose:\n  at: 2026-09-20T00:00:00.000Z\n  by: brett\n  pr: 240\n  release: v0.1.40\n---\n# M6.E1\n');
    await plant('archive/epics/M6.E1', item('SIG-5', 'CHORE', 'C', { close: CLOSE }));
  });

  it('is generated with the marker first, one section per Epic folder, live and archived, with status and items', async () => {
    await generateAll(base);
    const text = await read('.planning/work/EPICS.md');
    expect(text.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(text).toMatch(/^## M6\.E11 — open$/m);
    expect(text).toMatch(/^## M6\.E1 — closed 2026-09-20 · PR 240 · v0\.1\.40 · by brett$/m);
    expect(text).toContain('SIG-1-FEAT-P');
    expect(text).toContain('SIG-2-BUG-Q');
    expect(text).toContain('SIG-5-CHORE-C');
    // Deterministic: the same store gives the same bytes.
    await generateAll(base);
    expect(await read('.planning/work/EPICS.md')).toBe(text);
  });

  it('orders Epics by number, not by text or by folder creation order (M6.E1 < M6.E2 < M6.E11)', async () => {
    for (const id of ['M6.E2', 'M6.E12', 'M6.E3']) await mkdir(join(base, `.planning/work/epics/${id}`), { recursive: true });
    await generateAll(base);
    const text = await read('.planning/work/EPICS.md');
    const at = (id) => text.indexOf(`## ${id} `);
    expect(at('M6.E2')).toBeLessThan(at('M6.E3'));
    expect(at('M6.E3')).toBeLessThan(at('M6.E11'));
    expect(at('M6.E11')).toBeLessThan(at('M6.E12'));
    expect(at('M6.E12')).toBeLessThan(at('M6.E1')); // open Epics first, then archived
  });

  it('an Epic folder with no items is listed with "no items"', async () => {
    await mkdir(join(base, '.planning/work/epics/M6.E12'), { recursive: true });
    await generateAll(base);
    expect(await read('.planning/work/EPICS.md')).toMatch(/## M6\.E12 — open\n\n_no items_/);
  });

  it('regenerates on a mutation: an item moved into an Epic appears under it', async () => {
    await generateAll(base);
    const it3 = await newItem(base, { type: 'FEAT', title: 'Moved in', by: 'brett' });
    await moveItem(base, it3.id, { status: 'Q', epic: 'M6.E11' });
    expect(await read('.planning/work/EPICS.md')).toContain(`${it3.id}-FEAT-Q`);
  });

  it('is never written when the store is off', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    await generateAll(base);
    expect(existsSync(join(base, '.planning/work/EPICS.md'))).toBe(false);
  });
});

// ── t5.3 — closing an Epic ───────────────────────────────────────────────────

const git = (args) => String(execFileSync('git', args, { cwd: base, stdio: ['ignore', 'pipe', 'ignore'] }));
function initRepo() {
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'T']);
  git(['config', 'commit.gpgsign', 'false']);
}
const commitAll = () => {
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'x']);
};
async function expectCode(promise, code, pattern) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err, `expected a ${code} error`).toBeInstanceOf(WorkStoreError);
  expect(err.code).toBe(code);
  if (pattern) expect(err.message).toMatch(pattern);
  return err;
}
const EPIC = '.planning/work/epics/M6.E99';
const ARCH = '.planning/archive/epics/M6.E99';
const CLOSE_BY = { by: 'brett', pr: 251, release: 'v0.1.43', at: '2026-09-29T12:00:00.000Z' };

describe('t5.3 — closeEpic (AC-8.3, AC-8.4)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('work/epics/M6.E99', item('SIG-1', 'FEAT', 'P', { title: 'Build it' }));
    await plant('work/epics/M6.E99', item('SIG-2', 'BUG', 'Q', { title: 'Fix it' }));
    await plant('work/backlog', item('SIG-3', 'FEAT', 'T'));
    await put(`${EPIC}/M6.E99-PLAN.md`,
      '# Plan\n\nSee [reqs](M6.E99-REQUIREMENTS.md), [item](SIG-1.md) and [queue](../../backlog/SIG-3.md) and [ctx](../../../CONTEXT.md).\n');
    await put(`${EPIC}/M6.E99-REQUIREMENTS.md`, '# Reqs\n');
  });

  it('an Epic with no folder is a no-op (every legacy Epic): nothing written, nothing created', async () => {
    const r = await closeEpic(base, 'M6.E1', CLOSE_BY);
    expect(r.status).toBe('no-folder');
    expect(existsSync(join(base, '.planning/archive'))).toBe(false);
  });

  it('refuses while any item in the folder is open, naming each (id, label, status); nothing moves', async () => {
    const err = await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY), 'OPEN_ITEMS');
    expect(err.message).toContain('SIG-1-FEAT-P');
    expect(err.message).toContain('Build it');
    expect(err.message).toContain('SIG-2-BUG-Q');
    expect(err.message).toContain('Fix it');
    expect(err.message).not.toContain('SIG-3');
    expect(existsSync(join(base, `${EPIC}/SIG-1.md`))).toBe(true);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('passes once each item is closed or moved back to backlog; the folder moves to archive/epics/ with the close recorded', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'brett', proof: 'tests', at: '2026-09-29T00:00:00.000Z' });
    await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY), 'OPEN_ITEMS', /SIG-2-BUG-Q/);
    await moveItem(base, 'SIG-2', { status: 'T' });

    const r = await closeEpic(base, 'M6.E99', CLOSE_BY);
    expect(r.status).toBe('closed');
    expect(r.to).toBe(ARCH);
    expect(existsSync(join(base, EPIC))).toBe(false);
    // The closed item travelled with its Epic; the one moved back did not.
    expect(existsSync(join(base, `${ARCH}/SIG-1.md`))).toBe(true);
    expect(existsSync(join(base, '.planning/work/backlog/SIG-2.md'))).toBe(true);
    expect(existsSync(join(base, `${ARCH}/M6.E99-PLAN.md`))).toBe(true);
    expect(existsSync(join(base, `${ARCH}/M6.E99-REQUIREMENTS.md`))).toBe(true);

    const { data } = parseFrontmatter(await read(`${ARCH}/README.md`));
    expect(data.epic).toBe('M6.E99');
    expect(data.close).toEqual({ at: '2026-09-29T12:00:00.000Z', by: 'brett', pr: 251, release: 'v0.1.43' });

    const index = await read('.planning/work/EPICS.md');
    expect(index).toMatch(/^## M6\.E99 — closed 2026-09-29 · PR 251 · v0\.1\.43 · by brett$/m);
    expect(checkStore(base)).toEqual([]);
  });

  it('rewrites links leaving the folder for the new location and leaves links inside it alone', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const plan = await read(`${ARCH}/M6.E99-PLAN.md`);
    expect(plan).toContain('[reqs](M6.E99-REQUIREMENTS.md)');
    expect(plan).toContain('[item](SIG-1.md)');
    expect(plan).toContain('[queue](../../../work/backlog/SIG-3.md)');
    expect(plan).toContain('[ctx](../../../CONTEXT.md)');
  });

  it('closeItem on an Epic\'s item closes it IN the folder (D-M6E11-29); an item with no Epic still goes to done/', async () => {
    const r1 = await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b', at: '2026-09-29T00:00:00.000Z' });
    expect(r1.to).toBe(`${EPIC}/SIG-1.md`);
    expect(getItem(base, 'SIG-1').item.status).toBe('C');
    const r3 = await closeItem(base, 'SIG-3', { reason: 'stale', by: 'b', at: '2026-09-29T00:00:00.000Z' });
    expect(r3.to).toBe('.planning/work/done/2026-09/SIG-3.md');
    expect(checkStore(base)).toEqual([]);
  });

  it('a closed item archived with its Epic is still found by show (getItem), and listed under the Epic', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const found = getItem(base, 'SIG-1');
    expect(found.path).toBe(`${ARCH}/SIG-1.md`);
    expect(found.epic).toBe('M6.E99');
    expect(found.item.status).toBe('C');
    expect(listItems(base, { epic: 'M6.E99' }).map((x) => x.item.id)).toEqual(['SIG-1']);
  });

  it('rewrites INBOUND links: a live doc linking into the folder still resolves after the close', async () => {
    await put('.planning/STATE.md', '# State\n\nSee [the plan](work/epics/M6.E99/M6.E99-PLAN.md#goal) and [x](./work/epics/M6.E99/SIG-1.md).\n');
    await put('.planning/notes/deep.md', 'Up [plan](../work/epics/M6.E99/M6.E99-PLAN.md), out [c](../CONTEXT.md).\n');
    await put('.planning/archive/old/OLD.md', 'Frozen [p](../../work/epics/M6.E99/M6.E99-PLAN.md).\n');
    await put('.planning/CONTEXT.md', '# ctx\n');
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const state = await read('.planning/STATE.md');
    expect(state).toContain('](./archive/epics/M6.E99/M6.E99-PLAN.md#goal)');
    expect(state).toContain('](./archive/epics/M6.E99/SIG-1.md)');
    expect(await read('.planning/notes/deep.md')).toBe('Up [plan](../archive/epics/M6.E99/M6.E99-PLAN.md), out [c](../CONTEXT.md).\n');
    // archive/ is history — left as written.
    expect(await read('.planning/archive/old/OLD.md')).toBe('Frozen [p](../../work/epics/M6.E99/M6.E99-PLAN.md).\n');
    const findings = checkInternalLinks(base, { topFiles: [], dirs: ['.planning/notes'] })
      .concat(checkInternalLinks(base, { topFiles: ['.planning/STATE.md'], dirs: [] }));
    expect(findings.filter((f) => f.severity === 'hard')).toEqual([]);
  });

  it('a failed inbound rewrite rewinds the inbound file too', async () => {
    const stateText = '# State\n\n[plan](work/epics/M6.E99/M6.E99-PLAN.md)\n';
    await put('.planning/STATE.md', stateText);
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    const renameFn = async (from, to) => {
      if (to.endsWith('README.md')) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    await expect(closeEpic(base, 'M6.E99', CLOSE_BY, { renameFn })).rejects.toThrow(/disk full/);
    expect(await read('.planning/STATE.md')).toBe(stateText);
    expect(existsSync(join(base, `${EPIC}/SIG-1.md`))).toBe(true);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('keeps an existing README.md\'s frontmatter and body and adds the close', async () => {
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\ngoal: ship the store\n---\n# M6.E99\n\nWhy this Epic exists.\n');
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await closeEpic(base, 'M6.E99', { by: 'brett' });
    const { data, body } = parseFrontmatter(await read(`${ARCH}/README.md`));
    expect(data.goal).toBe('ship the store');
    expect(data.close.by).toBe('brett');
    expect(typeof data.close.at).toBe('string');
    expect(body).toContain('Why this Epic exists.');
  });

  it('refuses when the archive folder already exists; nothing moves', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await mkdir(join(base, ARCH), { recursive: true });
    await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY), 'CONFLICT', /archive\/epics\/M6\.E99/);
    expect(existsSync(join(base, `${EPIC}/M6.E99-PLAN.md`))).toBe(true);
  });

  it('a failed write rewinds: every file back where it was, byte-for-byte, no archive folder left', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    const before = await read(`${EPIC}/M6.E99-PLAN.md`);
    const renameFn = async () => {
      throw new Error('disk full');
    };
    await expect(closeEpic(base, 'M6.E99', CLOSE_BY, { renameFn })).rejects.toThrow(/disk full/);
    expect(await read(`${EPIC}/M6.E99-PLAN.md`)).toBe(before);
    expect(existsSync(join(base, `${EPIC}/M6.E99-REQUIREMENTS.md`))).toBe(true);
    expect(existsSync(join(base, `${EPIC}/README.md`))).toBe(false);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('closing again after archiving says so and changes nothing', async () => {
    await closeItem(base, 'SIG-1', { reason: 'fixed', by: 'b' });
    await moveItem(base, 'SIG-2', { status: 'T' });
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const readme = await read(`${ARCH}/README.md`);
    const r = await closeEpic(base, 'M6.E99', CLOSE_BY);
    expect(r.status).toBe('already-archived');
    expect(await read(`${ARCH}/README.md`)).toBe(readme);
  });

  it('refuses a bad Epic ID and a missing `by`', async () => {
    await expectCode(closeEpic(base, '../x', CLOSE_BY), 'SCHEMA');
    await expectCode(closeEpic(base, 'M6.E99', { pr: 1 }), 'SCHEMA', /by/);
  });
});

describe('t5.3 — closeEpic in a git repo moves tracked files with git mv', () => {
  it('the index records renames, so history follows the files', async () => {
    initRepo();
    await storeOn();
    await put(`${EPIC}/M6.E99-PLAN.md`, '# Plan\n');
    await plant('work/epics/M6.E99', item('SIG-4', 'CHORE', 'C', { close: CLOSE }));
    commitAll();
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const staged = git(['diff', '--cached', '--name-status', '-M']);
    expect(staged).toMatch(/^R\d*\t\.planning\/work\/epics\/M6\.E99\/M6\.E99-PLAN\.md\t\.planning\/archive\/epics\/M6\.E99\/M6\.E99-PLAN\.md$/m);
    expect(staged).toMatch(/^R\d*\t\.planning\/work\/epics\/M6\.E99\/SIG-4\.md\t\.planning\/archive\/epics\/M6\.E99\/SIG-4\.md$/m);
  });
});

describe('t5.3 — an Epic\'s README.md', () => {
  beforeEach(storeOn);

  it('moveItem into an Epic with no folder creates the folder with a README (epic: <id>)', async () => {
    const it1 = await newItem(base, { type: 'FEAT', title: 'x', by: 'b' });
    await moveItem(base, it1.id, { status: 'Q', epic: 'M6.E99' });
    const { data } = parseFrontmatter(await read(`${EPIC}/README.md`));
    expect(data).toEqual({ epic: 'M6.E99' });
  });

  it('a README write failure rewinds the move and throws a WorkStoreError', async () => {
    const it1 = await newItem(base, { type: 'FEAT', title: 'x', by: 'b' });
    await moveItem(base, it1.id, { status: 'T' });
    const before = await read(`.planning/work/backlog/${it1.id}.md`);
    const renameFn = async (from, to) => {
      if (to.endsWith('README.md')) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    const err = await expectCode(moveItem(base, it1.id, { status: 'Q', epic: 'M6.E99' }, { renameFn }), 'CONFLICT', /README\.md[\s\S]*disk full/);
    expect(err.message).toMatch(/nothing was moved/);
    expect(await read(`.planning/work/backlog/${it1.id}.md`)).toBe(before);
    expect(existsSync(join(base, EPIC))).toBe(false);
  });

  // REVIEW I9: the README goes in first, so a failure moving the ITEM must take
  // the README (and the folder it created) back out — or EPICS.md lists an
  // Epic with no items that nobody created.
  it('a failed item move into a new Epic leaves no README, no folder, and no phantom in EPICS.md', async () => {
    const it1 = await newItem(base, { type: 'FEAT', title: 'x', by: 'b' });
    await moveItem(base, it1.id, { status: 'T' });
    const before = await read(`.planning/work/backlog/${it1.id}.md`);
    const renameFn = async (from, to) => {
      if (to.endsWith(`${it1.id}.md`)) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    await expect(moveItem(base, it1.id, { status: 'Q', epic: 'M6.E99' }, { renameFn })).rejects.toThrow(/disk full/);
    expect(await read(`.planning/work/backlog/${it1.id}.md`)).toBe(before);
    expect(existsSync(join(base, EPIC))).toBe(false);
    await generateAll(base);
    expect(await read('.planning/work/EPICS.md')).not.toContain('M6.E99');
  });

  it('a failed item move into an existing Epic folder keeps the README that was already there', async () => {
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\n---\n# Mine\n');
    const it1 = await newItem(base, { type: 'FEAT', title: 'x', by: 'b' });
    await moveItem(base, it1.id, { status: 'T' });
    const renameFn = async (from, to) => {
      if (to.endsWith(`${it1.id}.md`)) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    await expect(moveItem(base, it1.id, { status: 'Q', epic: 'M6.E99' }, { renameFn })).rejects.toThrow(/disk full/);
    expect(await read(`${EPIC}/README.md`)).toBe('---\nepic: M6.E99\n---\n# Mine\n');
  });

  it('moveItem into an Epic never overwrites its README', async () => {
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\n---\n# Mine\n');
    const it1 = await newItem(base, { type: 'FEAT', title: 'x', by: 'b' });
    await moveItem(base, it1.id, { status: 'Q', epic: 'M6.E99' });
    expect(await read(`${EPIC}/README.md`)).toBe('---\nepic: M6.E99\n---\n# Mine\n');
  });

  it('is not an item: checkStore, listItems and the generator ignore it', async () => {
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\n---\n# M6.E99\n');
    await put(`${ARCH.replace('M6.E99', 'M6.E1')}/README.md`, '---\nepic: M6.E1\n---\n# M6.E1\n');
    expect(checkStore(base)).toEqual([]);
    expect(listItems(base)).toEqual([]);
    await generateAll(base);
  });
});

describe('t5.3 — ship.md wires the Epic close (AC-8.3)', () => {
  it('has a store-on step calling closeEpic on one line, halting on OPEN_ITEMS, placed after the content gate and before the SHIP commit', async () => {
    const ship = await readFile(new URL('../plugin/commands/ship.md', import.meta.url), 'utf-8');
    const step = ship.slice(ship.indexOf('### 6.8'), ship.indexOf('### 7.'));
    expect(step).toMatch(/^Call `closeEpic\(baseDir, state\.current_epic, \{by, pr, release\}\)`/m);
    expect(step).toMatch(/OPEN_ITEMS.*HALT/);
    expect(step).toMatch(/no-folder/);
    expect(ship.indexOf('### 6.7')).toBeLessThan(ship.indexOf('### 6.8'));
    expect(ship.indexOf('### 6.8')).toBeLessThan(ship.indexOf('### 9.'));
  });
});
