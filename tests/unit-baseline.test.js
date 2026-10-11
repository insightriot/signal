/**
 * tests/unit-baseline.test.js — the "before" snapshot for M6.E16's cutover (t0.1).
 *
 * `tools/unit-baseline.mjs` records what every existing source says about every
 * unit: milestone rows, retrospectives, archive folders, item records, root
 * artifacts, and the closure resolver. The detection is existing, already-tested
 * library code; what is pinned here is the UNION, the order, the mechanical
 * contradiction lists, and that a second run writes identical bytes.
 *
 * Every name in the fixture is invented.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import {
  collectBaseline,
  serializeBaseline,
  renderDiff,
  compareUnitIds,
  BASELINE_FILE,
  DIFF_FILE,
} from '../tools/unit-baseline.mjs';

const TOOL = fileURLToPath(new URL('../tools/unit-baseline.mjs', import.meta.url));

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const item = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const queued = (epic) => ({ type: 'queued', at: AT, by, epic });

const PASS = '# Verification\n\n**Verdict:** PASS\n';
const FAIL = '# Verification\n\n**Verdict:** FAIL\n';
const NO_VERDICT = '# Verification\n\nIt went fine.\n';
const RETRO_DONE = '# Retrospective\n\nIt went well.\n';
const RETRO_STUB = '# Retrospective\n\n[FILL IN] what happened\n';

const MILESTONE_1 = [
  '# Milestone 1',
  '',
  '| Risk | Likelihood | Note |',
  '|---|---|---|',
  '| Rain | low | not an Epic row |',
  '',
  '| Epic | Status | Notes |',
  '|---|---|---|',
  '| **E1** | ✅ shipped 2026-01-02 | First thing. Has a `a|b` pipe. |',
  '| **E2 — second thing** | **✓ shipped 2026-01-03 (in v9.0.1)** | Stub retro. |',
  '| **E10** | ✅ shipped as **v9.0.2** — ran ahead of E3 | Tenth. |',
  '| E3 — an idea | ⏸ parked | Never started. |',
  '',
].join('\n');

const MILESTONE_1_5 = '| Epic | Status | Scope |\n|---|---|---|\n| **E1** | ✅ shipped | Half step. |\n';

const MILESTONE_2 = [
  '| Epic | Status | Summary |',
  '|---|---|---|',
  '| `M2.E1` | **shipped** — `v9.1.0`, 2026-02-01 | Full-ID row. |',
  '| `M2.E2` | in flight | The current one. |',
  '| `M2.E1` | **shipped** again | A second row for the same Epic. |',
  '',
].join('\n');

const FILES = {
  '.planning/STATE.md':
    '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M2.E2\ncompleted_phases: []\n---\n# S\n',
  '.planning/MILESTONE-1.md': MILESTONE_1,
  '.planning/MILESTONE-1.5.md': MILESTONE_1_5,
  '.planning/MILESTONE-2.md': MILESTONE_2,
  // M1.E1 — row, complete retro, archive folder, nothing left in the root.
  '.planning/M1.E1-RETROSPECTIVE.md': RETRO_DONE,
  '.planning/archive/M1/E1/M1.E1-PLAN.md': '# plan\n',
  // M1.E2 — row, STUB retro, root artifacts that resolve closed.
  '.planning/M1.E2-RETROSPECTIVE.md': RETRO_STUB,
  '.planning/M1.E2-PLAN.md': '# plan\n',
  '.planning/M1.E2-VERIFICATION.md': PASS,
  // M1.E10 — row, retro only in the archive, root verification with no verdict.
  '.planning/archive/M1/E10/M1.E10-RETROSPECTIVE.md': RETRO_DONE,
  '.planning/M1.E10-VERIFICATION.md': NO_VERDICT,
  // M1.5.E1 — row and complete retro.
  '.planning/M1.5.E1-RETROSPECTIVE.md': RETRO_DONE,
  // M2.E1 — row says shipped, verification says FAIL, archived in the other layout.
  '.planning/M2.E1-RETROSPECTIVE.md': RETRO_DONE,
  '.planning/M2.E1-VERIFICATION.md': FAIL,
  '.planning/archive/epics/M2.E1/note.md': '# note\n',
  // M2.E2 — the current unit.
  '.planning/M2.E2-PLAN.md': '# plan\n',
  // GATE-A — a non-Epic unit with root artifacts and no row.
  '.planning/GATE-A-PLAN.md': '# plan\n',
  '.planning/GATE-A-VERIFICATION.md': PASS,
  // v9.9.9 — a non-Epic unit named by a retrospective only.
  '.planning/v9.9.9-RETROSPECTIVE.md': RETRO_DONE,
  // Files that are not units and must not become one.
  '.planning/RETROSPECTIVES.md': '# index\n',
  '.planning/archive/M1/DECISIONS.md': '# old decisions\n',
  '.planning/archive/milestones/MILESTONE-0.md': '| **E1** | shipped | archived milestone file, not read |\n',
  // The work store: two items in M2.E2, one in M3.E7 (named nowhere else), one in none.
  '.planning/work/WORK.md': '---\nkey: SIG\nschema_version: 2\n---\n',
};

const ITEMS = [
  item('SIG-1', [created, triaged, queued('M2.E2')]),
  item('SIG-2', [created, triaged, queued('M2.E2')]),
  item('SIG-3', [created, triaged, queued('M3.E7')]),
  item('SIG-4', [created]),
];

async function put(base, rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function makeFixture({ store = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'sig-unit-baseline-'));
  for (const [rel, content] of Object.entries(FILES)) {
    if (!store && rel.startsWith('.planning/work/')) continue;
    await put(base, rel, content);
  }
  if (store) for (const r of ITEMS) await put(base, recordPath(r.id), serializeRecord(r));
  return base;
}

describe('unit-baseline — what the sources say today', () => {
  let base;
  let baseline;
  const unit = (id) => baseline.units.find((u) => u.id === id);

  beforeEach(async () => {
    base = await makeFixture();
    baseline = await collectBaseline(base);
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('names the union of every source, in milestone / Epic / other order', () => {
    expect(baseline.units.map((u) => u.id)).toEqual([
      'M1.E1', 'M1.E2', 'M1.E3', 'M1.E10', 'M1.5.E1', 'M2.E1', 'M2.E2', 'M3.E7', 'GATE-A', 'v9.9.9',
    ]);
  });

  it('sorts Epic numbers as numbers and non-Epic names last', () => {
    const ids = ['v0.2', 'M10.E1', 'GATE-A', 'M2.E10', 'M2.E2', 'M4.5.E1', 'M4.E3', 'M5.E1'];
    expect([...ids].sort(compareUnitIds)).toEqual([
      'M2.E2', 'M2.E10', 'M4.E3', 'M4.5.E1', 'M5.E1', 'M10.E1', 'GATE-A', 'v0.2',
    ]);
  });

  it('keeps a bare-E row verbatim, with its file and line', () => {
    expect(unit('M1.E1')).toEqual({
      id: 'M1.E1',
      sources: ['milestone-row', 'retrospective', 'archive-folder'],
      milestone_row: {
        file: '.planning/MILESTONE-1.md',
        line: 9,
        cells: ['**E1**', '✅ shipped 2026-01-02', 'First thing. Has a `a|b` pipe.'],
      },
      retro: 'complete',
      retro_path: '.planning/M1.E1-RETROSPECTIVE.md',
      archive_dirs: ['.planning/archive/M1/E1'],
      item_count: 0,
      root_artifact_count: 0,
      resolver: { answer: null, reason: null },
    });
  });

  it('keeps a full-ID row verbatim, and the FIRST row when an Epic has two', () => {
    expect(unit('M2.E1').milestone_row).toEqual({
      file: '.planning/MILESTONE-2.md',
      line: 3,
      cells: ['`M2.E1`', '**shipped** — `v9.1.0`, 2026-02-01', 'Full-ID row.'],
    });
    expect(baseline.counts.extra_milestone_rows).toEqual([
      { id: 'M2.E1', file: '.planning/MILESTONE-2.md', line: 5 },
    ]);
  });

  it('reads a stub retrospective as a stub, and a closed resolver answer with its reason', () => {
    const u = unit('M1.E2');
    expect(u.retro).toBe('stub');
    expect(u.sources).toEqual(['milestone-row', 'retrospective', 'root-artifacts']);
    expect(u.root_artifact_count).toBe(2);
    expect(u.resolver).toEqual({
      answer: 'closed',
      reason: 'M1.E2-VERIFICATION.md records a PASS, and M1.E2 is not the current unit',
    });
  });

  it('finds a retrospective that lives only in the archive', () => {
    const u = unit('M1.E10');
    expect(u.retro).toBe('complete');
    expect(u.retro_path).toBe('.planning/archive/M1/E10/M1.E10-RETROSPECTIVE.md');
    expect(u.archive_dirs).toEqual(['.planning/archive/M1/E10']);
    expect(u.resolver.answer).toBe('cannotDetermine');
  });

  it('reads both archive layouts', () => {
    expect(unit('M2.E1').archive_dirs).toEqual(['.planning/archive/epics/M2.E1']);
    expect(unit('M2.E1').resolver.answer).toBe('open');
  });

  it('counts items by their folded Epic, and names an Epic only items name', () => {
    expect(unit('M2.E2').item_count).toBe(2);
    expect(unit('M2.E2').sources).toEqual(['milestone-row', 'items', 'root-artifacts']);
    expect(unit('M2.E2').resolver.answer).toBe('open');
    expect(unit('M3.E7')).toMatchObject({
      sources: ['items'], milestone_row: null, retro: 'none', retro_path: null, item_count: 1,
    });
    expect(baseline.counts.items).toEqual({ readable: true, total: 4, with_unit: 3, broken: 0 });
  });

  it('carries a non-Epic unit from root artifacts, and one from a retrospective alone', () => {
    expect(unit('GATE-A')).toMatchObject({
      sources: ['root-artifacts'], milestone_row: null, retro: 'none', root_artifact_count: 2,
      resolver: { answer: 'closed' },
    });
    expect(unit('v9.9.9')).toMatchObject({
      sources: ['retrospective'], retro: 'complete', retro_path: '.planning/v9.9.9-RETROSPECTIVE.md',
    });
  });

  it('counts what it saw', () => {
    expect(baseline.counts).toMatchObject({
      units: 10,
      epic_units: 8,
      other_units: 2,
      milestone_rows: 7,
      shipped_rows: 5,
      retro: { complete: 5, stub: 1, none: 4 },
      resolver: { closed: 2, open: 2, cannotDetermine: 1, not_seen: 5 },
      by_source: {
        'milestone-row': 7, retrospective: 6, 'archive-folder': 3, items: 2, 'root-artifacts': 5,
      },
    });
  });

  it('lists the contradictions mechanically', () => {
    expect(baseline.contradictions).toEqual({
      shipped_row_resolver_not_closed: ['M1.E10', 'M2.E1'],
      shipped_row_resolver_never_saw: ['M1.E1', 'M1.5.E1'],
      row_without_complete_retro: ['M1.E2', 'M1.E3', 'M2.E2'],
      named_by_one_source: ['M1.E3', 'M3.E7', 'GATE-A', 'v9.9.9'],
      named_but_never_run: ['M1.E3', 'M3.E7'],
    });
  });

  it('says so when the work store is off, and still reports every other source', async () => {
    const off = await makeFixture({ store: false });
    try {
      const b = await collectBaseline(off);
      expect(b.counts.items).toEqual({ readable: false, total: 0, with_unit: 0, broken: 0 });
      expect(b.units.map((u) => u.id)).not.toContain('M3.E7');
      expect(b.units.find((u) => u.id === 'M2.E2').item_count).toBe(0);
    } finally {
      await rm(off, { recursive: true, force: true });
    }
  });

  it('renders one table row per unit, the contradictions, and the markers S8 fills', () => {
    const md = renderDiff(baseline);
    for (const u of baseline.units) expect(md).toContain(`| \`${u.id}\` |`);
    expect(md.match(/^\| `/gm)).toHaveLength(baseline.units.length);
    expect(md).toContain('## Contradictions visible today');
    expect(md).toContain('`M1.E10`, `M2.E1`');
    // Every unit row has the header's eleven columns.
    for (const line of md.split('\n').filter((l) => l.startsWith('| `'))) {
      expect(line.split(/(?<!\\)\|/)).toHaveLength(13);
    }
    expect(md.trimEnd().split('\n').slice(-3)).toEqual([
      '<!-- diff:begin -->',
      '_The right side — what the unit records say — is added at S8._',
      '<!-- diff:end -->',
    ]);
  });

  it('writes no timestamp and no absolute path', () => {
    const out = serializeBaseline(baseline) + renderDiff(baseline);
    expect(out).not.toContain(base);
    expect(out).not.toContain(tmpdir());
    expect(out).not.toMatch(/generated (at|on)/i);
  });

  it('gives identical bytes on a second run', async () => {
    const again = await collectBaseline(base);
    expect(serializeBaseline(again)).toBe(serializeBaseline(baseline));
    expect(renderDiff(again)).toBe(renderDiff(baseline));
  });
});

describe('unit-baseline — the command', () => {
  let base;
  let out;

  beforeEach(async () => {
    base = await makeFixture();
    out = await mkdtemp(join(tmpdir(), 'sig-unit-baseline-out-'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  const run = (...args) => execFileSync(process.execPath, [TOOL, ...args], { encoding: 'utf-8' });
  const tree = async (dir) => (await readdir(dir, { recursive: true })).sort();

  it('writes its two files to --out-dir and nothing into the project', async () => {
    const before = await tree(base);
    run(base, '--out-dir', out);
    expect(await tree(base)).toEqual(before);
    expect(await tree(out)).toEqual([BASELINE_FILE, DIFF_FILE].sort());

    const first = [await readFile(join(out, BASELINE_FILE), 'utf-8'), await readFile(join(out, DIFF_FILE), 'utf-8')];
    expect(JSON.parse(first[0]).units).toHaveLength(10);
    run(base, '--out-dir', out);
    expect([await readFile(join(out, BASELINE_FILE), 'utf-8'), await readFile(join(out, DIFF_FILE), 'utf-8')])
      .toEqual(first);
  });

  it('--check computes twice, exits 0 when the bytes agree, and writes nothing', async () => {
    run(base, '--out-dir', out, '--check');
    expect(await tree(out)).toEqual([]);
  });
});
