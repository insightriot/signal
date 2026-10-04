// Epic folders in the work store (M6.E11.S5 t5.2–t5.3, FR-8, D-M6E11-13).
// See .planning/M6.E11-VALIDATION.md rows AC-8.2 … AC-8.4.
//
// M6.E13 t7.4: moved onto a v2 store. An item is a record under
// `work/items/`, and its Epic is folded from its events (`epicOf`), so the
// Epic folder holds documents only and nothing moves an item into it. What
// these pin is what survived the cutover: the generated Epic index
// (`work/EPICS.md`, from `work-views.js`) and `closeEpic` archiving the folder
// once every record of the Epic is done. The v1 cases that only existed
// because items were files in the folder (list --epic reading the folder, a
// close moving the item file, a README created when the first item moved in)
// were retired with the v1 store; their v2 counterparts are `epicOf`
// (work-record tests) and `closeEpicCheck` (work-records-epic).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { execFileSync } from 'node:child_process';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { parseFrontmatter } from '../plugin/tools/lib/state.js';
import { checkInternalLinks } from '../plugin/tools/lib/doc-hygiene.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';

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
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n# Work store\n');
const read = (rel) => readFile(join(base, rel), 'utf-8');

const AT = '2026-09-01T00:00:00.000Z';
const by = 'brett';
const ev = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: (epic) => ({ type: 'queued', at: AT, by, epic }),
  started: (epic) => ({ type: 'started', at: AT, by, epic }),
  wontdo: { type: 'closed', at: '2026-09-20T00:00:00.000Z', by, reason: 'wontdo', proof: 'no' },
};
const plant = (id, type, title, events) => put(records.recordPath(id), serializeRecord({ id, type, title, events }));

describe('t5.2 — the generated Epic index, .planning/work/EPICS.md (AC-8.2)', () => {
  beforeEach(async () => {
    await storeOn();
    await mkdir(join(base, '.planning/work/epics/M6.E11'), { recursive: true });
    await plant('SIG-1', 'FEAT', 'SIG-1 title', [ev.created, ev.triaged, ev.started('M6.E11')]);
    await plant('SIG-2', 'BUG', 'SIG-2 title', [ev.created, ev.triaged, ev.queued('M6.E11')]);
    await put('.planning/archive/epics/M6.E1/README.md',
      '---\nepic: M6.E1\nclose:\n  at: 2026-09-20T00:00:00.000Z\n  by: brett\n  pr: 240\n  release: v0.1.40\n---\n# M6.E1\n');
    await plant('SIG-5', 'CHORE', 'SIG-5 title', [ev.created, ev.triaged, ev.started('M6.E1'), ev.wontdo]);
  });

  it('is generated with the marker first, one section per Epic, live and archived, with status and items', async () => {
    await regenerateViews(base);
    const text = await read('.planning/work/EPICS.md');
    expect(text.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(text).toMatch(/^## M6\.E11 — open$/m);
    expect(text).toMatch(/^## M6\.E1 — closed 2026-09-20 · PR 240 · v0\.1\.40 · by brett$/m);
    expect(text).toContain('- SIG-1 · FEAT · P — SIG-1 title');
    expect(text).toContain('- SIG-2 · BUG · Q — SIG-2 title');
    expect(text).toContain('- SIG-5 · CHORE · C — SIG-5 title');
    // Deterministic: the same store gives the same bytes.
    await regenerateViews(base);
    expect(await read('.planning/work/EPICS.md')).toBe(text);
  });

  it('orders Epics by number, not by text or by folder creation order (M6.E1 < M6.E2 < M6.E11)', async () => {
    for (const id of ['M6.E2', 'M6.E12', 'M6.E3']) await mkdir(join(base, `.planning/work/epics/${id}`), { recursive: true });
    await regenerateViews(base);
    const text = await read('.planning/work/EPICS.md');
    const at = (id) => text.indexOf(`## ${id} `);
    expect(at('M6.E2')).toBeLessThan(at('M6.E3'));
    expect(at('M6.E3')).toBeLessThan(at('M6.E11'));
    expect(at('M6.E11')).toBeLessThan(at('M6.E12'));
    expect(at('M6.E12')).toBeLessThan(at('M6.E1')); // open Epics first, then archived
  });

  it('an Epic folder with no records is still listed, as open', async () => {
    await mkdir(join(base, '.planning/work/epics/M6.E12'), { recursive: true });
    await regenerateViews(base);
    expect(await read('.planning/work/EPICS.md')).toMatch(/^## M6\.E12 — open$/m);
  });

  it('regenerates on a mutation: a record queued into an Epic appears under it', async () => {
    await regenerateViews(base);
    const it3 = await records.newItem(base, { type: 'FEAT', title: 'Moved in', by }, { execFn: () => { throw new Error('no git'); } });
    await records.triageItem(base, it3.id, { by });
    await records.queueItem(base, it3.id, { epic: 'M6.E11', by });
    expect(await read('.planning/work/EPICS.md')).toContain(`- ${it3.id} · FEAT · Q — Moved in`);
  });

  it('is never written when the store is off', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    await regenerateViews(base);
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
const noGit = { execFn: () => { throw new Error('not a git repository'); } };
const close = (id) => records.closeItem(base, id, { reason: 'wontdo', by: 'b', proof: 'not needed' }, noGit);
const triageOut = (id) => records.triageItem(base, id, { by: 'b' }, noGit);

describe('t5.3 — closeEpic (AC-8.3, AC-8.4)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('SIG-1', 'FEAT', 'Build it', [ev.created, ev.triaged, ev.started('M6.E99')]);
    await plant('SIG-2', 'BUG', 'Fix it', [ev.created, ev.triaged, ev.queued('M6.E99')]);
    await plant('SIG-3', 'FEAT', 'SIG-3 title', [ev.created, ev.triaged]);
    await put(`${EPIC}/M6.E99-PLAN.md`,
      '# Plan\n\nSee [reqs](M6.E99-REQUIREMENTS.md) and [ctx](../../../CONTEXT.md).\n');
    await put(`${EPIC}/M6.E99-REQUIREMENTS.md`, '# Reqs\n');
    await regenerateViews(base);
  });

  it('an Epic with no folder is a no-op (every legacy Epic): nothing written, nothing created', async () => {
    const r = await closeEpic(base, 'M6.E1', CLOSE_BY);
    expect(r.status).toBe('no-folder');
    expect(existsSync(join(base, '.planning/archive'))).toBe(false);
  });

  it('refuses while any record of the Epic is open, naming each (id, status, title); nothing moves', async () => {
    const err = await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY, noGit), 'OPEN_ITEMS');
    expect(err.message).toContain('SIG-1 (status P) — Build it');
    expect(err.message).toContain('SIG-2 (status Q) — Fix it');
    expect(err.message).not.toContain('SIG-3');
    expect(existsSync(join(base, `${EPIC}/M6.E99-PLAN.md`))).toBe(true);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('passes once each record is closed or triaged out of the Epic; the folder moves to archive/epics/ with the close recorded', async () => {
    await close('SIG-1');
    await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY, noGit), 'OPEN_ITEMS', /SIG-2 \(status Q\)/);
    await triageOut('SIG-2');

    const r = await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    expect(r.status).toBe('closed');
    expect(r.to).toBe(ARCH);
    expect(existsSync(join(base, EPIC))).toBe(false);
    expect(existsSync(join(base, `${ARCH}/M6.E99-PLAN.md`))).toBe(true);
    expect(existsSync(join(base, `${ARCH}/M6.E99-REQUIREMENTS.md`))).toBe(true);
    // Records never move.
    expect(existsSync(join(base, records.recordPath('SIG-1')))).toBe(true);

    const { data } = parseFrontmatter(await read(`${ARCH}/README.md`));
    expect(data.epic).toBe('M6.E99');
    expect(data.close).toEqual({ at: '2026-09-29T12:00:00.000Z', by: 'brett', pr: 251, release: 'v0.1.43' });

    const index = await read('.planning/work/EPICS.md');
    expect(index).toMatch(/^## M6\.E99 — closed 2026-09-29 · PR 251 · v0\.1\.43 · by brett$/m);
    expect(index).toContain('- SIG-1 · FEAT · C — Build it');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('rewrites links leaving the folder for the new location and leaves links inside it alone', async () => {
    await close('SIG-1');
    await triageOut('SIG-2');
    await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    const plan = await read(`${ARCH}/M6.E99-PLAN.md`);
    expect(plan).toContain('[reqs](M6.E99-REQUIREMENTS.md)');
    expect(plan).toContain('[ctx](../../../CONTEXT.md)');
  });

  it('rewrites INBOUND links: a live doc linking into the folder still resolves after the close', async () => {
    await put('.planning/STATE.md', '# State\n\nSee [the plan](work/epics/M6.E99/M6.E99-PLAN.md#goal) and [r](./work/epics/M6.E99/M6.E99-REQUIREMENTS.md).\n');
    await put('.planning/notes/deep.md', 'Up [plan](../work/epics/M6.E99/M6.E99-PLAN.md), out [c](../CONTEXT.md).\n');
    await put('.planning/archive/old/OLD.md', 'Frozen [p](../../work/epics/M6.E99/M6.E99-PLAN.md).\n');
    await put('.planning/CONTEXT.md', '# ctx\n');
    await close('SIG-1');
    await triageOut('SIG-2');
    await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    const state = await read('.planning/STATE.md');
    expect(state).toContain('](./archive/epics/M6.E99/M6.E99-PLAN.md#goal)');
    expect(state).toContain('](./archive/epics/M6.E99/M6.E99-REQUIREMENTS.md)');
    expect(await read('.planning/notes/deep.md')).toBe('Up [plan](../archive/epics/M6.E99/M6.E99-PLAN.md), out [c](../CONTEXT.md).\n');
    // archive/ is history — left as written.
    expect(await read('.planning/archive/old/OLD.md')).toBe('Frozen [p](../../work/epics/M6.E99/M6.E99-PLAN.md).\n');
    const findings = checkInternalLinks(base, { topFiles: [], dirs: ['.planning/notes'] })
      .concat(checkInternalLinks(base, { topFiles: ['.planning/STATE.md'], dirs: [] }));
    expect(findings.filter((f) => f.severity === 'hard')).toEqual([]);
  });

  // REVIEW I5, carried to v2: an item body's link into the folder is relative
  // to the BODY's folder — `../../epics/<id>/…` from items/00/ — so it never
  // contains the text `work/epics/<id>`, and a pre-filter on that text would
  // skip it.
  it('rewrites an item BODY\'s link into the folder (../../epics/<id>/…), and the regenerated BACKLOG.md has no dead link', async () => {
    await put(records.bodyPath('SIG-3'), 'See [the plan](../../epics/M6.E99/M6.E99-PLAN.md#goal).\n');
    await regenerateViews(base);
    await close('SIG-1');
    await triageOut('SIG-2');
    const r = await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    expect(r.rewritten).toEqual([records.bodyPath('SIG-3')]);
    expect(await read(records.bodyPath('SIG-3'))).toContain('[the plan](../../../archive/epics/M6.E99/M6.E99-PLAN.md#goal)');
    const backlog = await read('.planning/BACKLOG.md');
    expect(backlog.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(backlog).toContain('archive/epics/M6.E99/M6.E99-PLAN.md#goal');
    const findings = checkInternalLinks(base, { topFiles: ['.planning/BACKLOG.md'], dirs: [] });
    expect(findings.filter((f) => f.severity === 'hard')).toEqual([]);
  });

  it('a failed inbound rewrite rewinds the inbound file too', async () => {
    const stateText = '# State\n\n[plan](work/epics/M6.E99/M6.E99-PLAN.md)\n';
    await put('.planning/STATE.md', stateText);
    await close('SIG-1');
    await triageOut('SIG-2');
    const renameFn = async (from, to) => {
      if (to.endsWith('README.md')) throw new Error('disk full');
      const { rename } = await import('node:fs/promises');
      return rename(from, to);
    };
    await expect(closeEpic(base, 'M6.E99', CLOSE_BY, { ...noGit, renameFn })).rejects.toThrow(/disk full/);
    expect(await read('.planning/STATE.md')).toBe(stateText);
    expect(existsSync(join(base, `${EPIC}/M6.E99-PLAN.md`))).toBe(true);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('keeps an existing README.md\'s frontmatter and body and adds the close', async () => {
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\ngoal: ship the store\n---\n# M6.E99\n\nWhy this Epic exists.\n');
    await close('SIG-1');
    await triageOut('SIG-2');
    await closeEpic(base, 'M6.E99', { by: 'brett' }, noGit);
    const { data, body } = parseFrontmatter(await read(`${ARCH}/README.md`));
    expect(data.goal).toBe('ship the store');
    expect(data.close.by).toBe('brett');
    expect(typeof data.close.at).toBe('string');
    expect(body).toContain('Why this Epic exists.');
  });

  it('refuses when the archive folder already exists; nothing moves', async () => {
    await close('SIG-1');
    await triageOut('SIG-2');
    await mkdir(join(base, ARCH), { recursive: true });
    await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY, noGit), 'CONFLICT', /archive\/epics\/M6\.E99/);
    expect(existsSync(join(base, `${EPIC}/M6.E99-PLAN.md`))).toBe(true);
  });

  it('a failed write rewinds: every file back where it was, byte-for-byte, no archive folder left', async () => {
    await close('SIG-1');
    await triageOut('SIG-2');
    const before = await read(`${EPIC}/M6.E99-PLAN.md`);
    const renameFn = async () => {
      throw new Error('disk full');
    };
    await expect(closeEpic(base, 'M6.E99', CLOSE_BY, { ...noGit, renameFn })).rejects.toThrow(/disk full/);
    expect(await read(`${EPIC}/M6.E99-PLAN.md`)).toBe(before);
    expect(existsSync(join(base, `${EPIC}/M6.E99-REQUIREMENTS.md`))).toBe(true);
    expect(existsSync(join(base, `${EPIC}/README.md`))).toBe(false);
    expect(existsSync(join(base, ARCH))).toBe(false);
  });

  it('closing again after archiving says so and changes nothing', async () => {
    await close('SIG-1');
    await triageOut('SIG-2');
    await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    const readme = await read(`${ARCH}/README.md`);
    const r = await closeEpic(base, 'M6.E99', CLOSE_BY, noGit);
    expect(r.status).toBe('already-archived');
    expect(await read(`${ARCH}/README.md`)).toBe(readme);
  });

  it('refuses a bad Epic ID and a missing `by`', async () => {
    await expectCode(closeEpic(base, '../x', CLOSE_BY), 'SCHEMA');
    await expectCode(closeEpic(base, 'M6.E99', { pr: 1 }), 'SCHEMA', /by/);
  });

  // D-M6E11-33 (from work-epic-artifacts-move, whose other cases were the
  // retired v1 moveItem's): the folder holds the whole Epic, so an artifact a
  // store-off command wrote at the root is refused rather than left behind.
  it('refuses while the Epic still has artifacts at the root, naming each; the retrospective and profile do not block', async () => {
    await close('SIG-1');
    await triageOut('SIG-2');
    await put('.planning/M6.E99-VERIFICATION.md', '# v\n');
    await put('.planning/M6.E99-RETROSPECTIVE.md', '# retro\n');
    await put('.planning/M6.E99-PROFILE.md', '---\ntier: FEATURE\n---\n');
    await put('.planning/M6.E990-PLAN.md', '# another Epic\n');
    const err = await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY, noGit), 'CONFLICT', /\.planning\/M6\.E99-VERIFICATION\.md/);
    expect(err.message).not.toMatch(/RETROSPECTIVE|PROFILE|M6\.E990/);
    expect(existsSync(join(base, EPIC))).toBe(true);

    await rm(join(base, '.planning/M6.E99-VERIFICATION.md'));
    expect((await closeEpic(base, 'M6.E99', CLOSE_BY, noGit)).status).toBe('closed');
    expect(existsSync(join(base, '.planning/M6.E99-RETROSPECTIVE.md'))).toBe(true);
  });

  it('a v1 store refuses (CONFIG, naming the migration); nothing moves', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
    const err = await expectCode(closeEpic(base, 'M6.E99', CLOSE_BY, noGit), 'CONFIG', /work-migrate-v2\.mjs/);
    expect(err.version).toBe(1);
    expect(existsSync(join(base, `${EPIC}/M6.E99-PLAN.md`))).toBe(true);
    expect(existsSync(join(base, '.planning/work/.lock'))).toBe(false);
  });
});

describe('t5.3 — closeEpic in a git repo moves tracked files with git mv', () => {
  it('the index records renames, so history follows the files', async () => {
    initRepo();
    await storeOn();
    await put(`${EPIC}/M6.E99-PLAN.md`, '# Plan\n');
    await plant('SIG-4', 'CHORE', 'SIG-4 title', [ev.created, ev.triaged, ev.started('M6.E99'), ev.wontdo]);
    await regenerateViews(base);
    commitAll();
    await closeEpic(base, 'M6.E99', CLOSE_BY);
    const staged = git(['diff', '--cached', '--name-status', '-M']);
    expect(staged).toMatch(/^R\d*\t\.planning\/work\/epics\/M6\.E99\/M6\.E99-PLAN\.md\t\.planning\/archive\/epics\/M6\.E99\/M6\.E99-PLAN\.md$/m);
  });
});

describe('t5.3 — an Epic\'s README.md is not an item', () => {
  it('checkRecords and the views ignore it, live and archived', async () => {
    await storeOn();
    await put(`${EPIC}/README.md`, '---\nepic: M6.E99\n---\n# M6.E99\n');
    await put(`${ARCH.replace('M6.E99', 'M6.E1')}/README.md`, '---\nepic: M6.E1\n---\n# M6.E1\n');
    await regenerateViews(base);
    expect(records.checkRecords(base)).toEqual([]);
    expect(records.listRecords(base).records).toEqual([]);
  });
});

describe('t5.3 — ship.md wires the Epic close (AC-8.3)', () => {
  it('has a store-on step calling closeEpic on one line, halting on OPEN_ITEMS, placed after the content gate and before the SHIP commit', async () => {
    const ship = await readFile(new URL('../plugin/commands/ship.md', import.meta.url), 'utf-8');
    const step = ship.slice(ship.indexOf('### 6.8'), ship.indexOf('### 7.'));
    expect(step).toMatch(/^Call `closeEpic\(baseDir, state\.current_epic, \{by, pr, release\}\)`/m);
    expect(step).toMatch(/OPEN_ITEMS.*HALT/);
    expect(step).toMatch(/no-folder/);
    // closeEpicCheck runs before the folder lookup, so a broken record anywhere
    // in the store throws SCHEMA at every Epic-close SHIP (REVIEW loop 1 part B).
    expect(step).toMatch(/`SCHEMA`.*HALT/);
    expect(step).toMatch(/`SCHEMA`.*\/sig:docs-sweep.*checkRecords.*\/sig:item/);
    expect(ship.indexOf('### 6.7')).toBeLessThan(ship.indexOf('### 6.8'));
    expect(ship.indexOf('### 6.8')).toBeLessThan(ship.indexOf('### 9.'));
  });
});
