// A project that is on the work store and has NO unit records (M6.E16 S7) —
// the fixture behind `/sig:docs-migrate --work-store`'s units-only branch.
// Built in a temp folder; every name is invented.
//
// What it names, and what the plan should make of each:
//
//   M5.E2      an archive folder with a complete retrospective      legacy close (proposed)
//   M5.E3      `archive/epics/M5.E3/` only                          open
//   M6.E1      a bare-`E1` row that says shipped, a pipe in notes   legacy close (proposed)
//   M7.E1      a shipped row and a complete retrospective           legacy close (proposed)
//   M7.E2      a shipped row and a STUB retrospective               legacy close (proposed, on the row)
//   M7.E3      named only by an item's `queued` event               open
//   M7.E4      a row that says shipped AND parked, nothing else     open, flagged
//   M7.E5      a stub retrospective only                            open
//   M7.E9      the current Epic; its row says in flight             open
//   GATE-A     root files, a PASS verdict, a complete retrospective legacy close (proposed)
//   PHASE10-S4 a PLAN only                                          open
//   phase-11 / Phase-11   differ only by case                       both refused
//   LEAF-7     shaped like this store's item IDs                    refused
//
// Not imported from a test file: importing one registers its tests twice.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { serializeRecord } from '../../plugin/tools/lib/work-record.js';

export const AT = '2026-09-20T10:00:00.000Z';
export const KEY = 'LEAF';
export const UNITS = '.planning/work/units';
export const EPICS = '.planning/work/EPICS.md';
export const MILESTONE = '.planning/MILESTONE-7.md';

export const put = (base, rel, text) => {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), text);
};
export const read = (base, rel) => readFileSync(join(base, rel), 'utf-8');

export const stateText = (current = 'M7.E9') => '---\nschema_version: 1\ndocs_layout_version: 3\nphase: EXECUTE\n'
  + `current_epic: ${current ?? 'null'}\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# Project State\n\nbody\n`;

export const retro = (id) => `# ${id} Retrospective\n\nOutcome: finished 2026-09-01. What went well: the tide tables.\n`;
export const stubRetro = (id) => `# ${id} Retrospective\n\n## What went well\n\n[FILL IN]\n`;
export const PASS = (id) => `# ${id} verification\n\n**Verdict:** PASS\n`;

export const ROWS = {
  'M7.E1': '| `M7.E1` | **shipped** — `v1.2`, 2026-09-01 (PR #12) | Lantern index |',
  'M7.E2': '| `M7.E2` | **shipped** — 2026-09-02 | Harbour sync |',
  'M7.E4': '| `M7.E4` | **shipped** — 2026-09-05 (parked 2026-08-01, reopened) | Tide table |',
  'M7.E9': '| `M7.E9` | **in flight** — PLAN done | The current one |',
};
export const milestone7 = (rows = Object.values(ROWS), { markers = false } = {}) => [
  '# Milestone 7', '', 'Written by hand.', '',
  ...(markers ? ['<!-- signal:epics:begin -->'] : []),
  '| Epic | Status | Summary |', '|---|---|---|', ...rows,
  ...(markers ? ['<!-- signal:epics:end -->'] : []),
  '', 'After the table.', '',
].join('\n');
export const MILESTONE_6 = '# Milestone 6\n\n| Epic | Status | Notes |\n|---|---|---|\n'
  + '| **E1 — Old format** | ✅ shipped 2026-01-01 | Notes with a \\| pipe, and `code` |\n';

const item = (id, events) => serializeRecord({ id, type: 'FEAT', title: `Leaf ${id}`, events });

const made = [];
/** Remove every project made here. Call from `afterEach`. */
export function cleanupUnitsStores() {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
}

export const git = (cwd, args) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }));

/**
 * The project in the table above.
 *
 * @param {{repo?: boolean, markers?: boolean, store?: boolean, name?: string}} [opts] — `repo`: a git repository
 *   with everything committed (an apply needs a clean tree); `markers`: MILESTONE-7.md carries the Epic-table
 *   markers; `store: false`: the same planning files with no work store at all
 * @returns {Promise<string>} the project folder
 */
export async function unitsStore({ repo = false, markers = false, store = true, name = 'leaf-notes' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sig-units-store-'));
  made.push(root);
  const base = join(root, name);
  mkdirSync(base);
  put(base, '.planning/STATE.md', stateText());
  put(base, MILESTONE, milestone7(Object.values(ROWS), { markers }));
  put(base, '.planning/MILESTONE-6.md', MILESTONE_6);
  put(base, '.planning/M7.E1-RETROSPECTIVE.md', retro('M7.E1'));
  put(base, '.planning/M7.E2-RETROSPECTIVE.md', stubRetro('M7.E2'));
  put(base, '.planning/M7.E5-RETROSPECTIVE.md', stubRetro('M7.E5'));
  put(base, '.planning/M7.E9-PLAN.md', '# M7.E9 plan\n');
  put(base, '.planning/GATE-A-PLAN.md', '# GATE-A plan\n');
  put(base, '.planning/GATE-A-VERIFICATION.md', PASS('GATE-A'));
  put(base, '.planning/GATE-A-RETROSPECTIVE.md', retro('GATE-A'));
  put(base, '.planning/PHASE10-S4-PLAN.md', '# PHASE10-S4 plan\n');
  put(base, '.planning/phase-11-PLAN.md', '# phase-11 plan\n');
  put(base, '.planning/archive/old/Phase-11-RETROSPECTIVE.md', retro('Phase-11'));
  put(base, '.planning/LEAF-7-PLAN.md', '# a unit named like an item\n');
  put(base, '.planning/archive/M5/E2/M5.E2-RETROSPECTIVE.md', retro('M5.E2'));
  put(base, '.planning/archive/epics/M5.E3/README.md', '# M5.E3\n');
  if (store) {
    put(base, '.planning/work/WORK.md', `---\nkey: ${KEY}\nschema_version: 2\n---\n\n# Work store\n`);
    const created = { type: 'created', at: AT, by: 'claude' };
    const triaged = { type: 'triaged', at: AT, by: 'claude' };
    put(base, '.planning/work/items/00/LEAF-1.json', item('LEAF-1', [created]));
    put(base, '.planning/work/items/00/LEAF-1.md', 'A body.\n');
    put(base, '.planning/work/items/00/LEAF-2.json', item('LEAF-2', [created, triaged, { type: 'queued', at: AT, by: 'claude', epic: 'M7.E3' }]));
    put(base, '.planning/work/items/00/LEAF-2.md', 'Another body.\n');
    const { regenerateViews } = await import('../../plugin/tools/lib/work-views.js');
    await regenerateViews(base);
  }
  if (repo) {
    git(base, ['init', '-q', '-b', 'main']);
    git(base, ['config', 'user.email', 't@t.co']);
    git(base, ['config', 'user.name', 'T']);
    git(base, ['config', 'commit.gpgsign', 'false']);
    git(base, ['config', 'tag.gpgsign', 'false']);
    commitAll(base);
  }
  return base;
}

export function commitAll(base, msg = 'c') {
  git(base, ['add', '-A']);
  git(base, ['commit', '-q', '-m', msg]);
}

/** Every file under `dir` outside `.git`: rel path → bytes (latin1), a link as its target. */
export function bytesOf(dir, under = '') {
  const out = new Map();
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name === '.git' || /\.lock(\.stale-[^/]*)?$/.test(e.name)) continue;
      const p = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isSymbolicLink()) out.set(p, 'link');
      else if (e.isDirectory()) walk(p);
      else out.set(p, readFileSync(join(dir, p), 'latin1'));
    }
  };
  walk(under);
  return out;
}
