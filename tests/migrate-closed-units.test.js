// M6.E15 S6 (`SIG-286`, FR8) — `/sig:docs-migrate` moves only CLOSED units.
//
// The observed case, rebuilt with invented Epic IDs: a dry run put every file of
// an Epic on the archive move list while the explanation beneath the same count
// said that Epic "could not be evaluated" — its VERIFICATION.md has `## Verdict`
// with `**PASS …**` on the NEXT line, which the verdict reader refuses to read on
// purpose (`verdict.js`, M5.E18 FR2). The move list came from a filled-in
// retrospective alone, which also has no current-unit check.
//
//   M9.E1 — properly closed: readable `**Verdict:** PASS`, not current, retro. MOVES.
//   M9.E2 — filled retro, verdict unreadable by design. Does NOT move.
//   M9.E3 — the CURRENT Epic (STATE.md current_epic), filled retro, readable PASS.
//           Does NOT move: a current unit never moves.
//
// The same rule decides the vector-3 STATE-narrative eviction, so the three
// surfaces — move list, vector-3 evicts, "could not evaluate" lines — agree.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrate, renderDryRun } from '../plugin/tools/lib/migrate-memory.js';
import { parseVerdict } from '../plugin/tools/lib/verdict.js';

const FRONTMATTER =
  `schema_version: 1\ndocs_layout_version: 3\nphase: EXECUTE\ncurrent_epic: M9.E3\n` +
  `current_tasks: []\ncompleted_phases: []\nblockers: []\n`;

const BODY =
  `# Project State\n\n` +
  `## M9.E1 — lantern indexing\n\nShipped the lantern index and its reader.\n\n` +
  `## M9.E2 — harbour sync\n\nShipped the harbour sync with one pending item.\n\n` +
  `## M9.E3 — orchard export\n\nExport is in progress.\n`;

const STATE_READABLE = `---\n${FRONTMATTER}---\n${BODY}`;
// Fenced frontmatter (so the dry run still renders) with no schema_version key:
// `readState` throws, so the current unit is unknown.
const STATE_UNREADABLE = `---\ndocs_layout_version: 3\nphase: EXECUTE\ncurrent_epic: M9.E3\n---\n${BODY}`;

const UNREADABLE_VERDICT =
  `# M9.E2 verification\n\n## Verdict\n\n**PASS with one documented pending item.**\n`;

const retro = (id, words) => `# ${id} retrospective\n\n## What happened\n\n${words}\n`;

async function setup(dir, stateText) {
  const p = join(dir, '.planning');
  await mkdir(p, { recursive: true });
  await writeFile(join(p, 'STATE.md'), stateText, 'utf-8');
  await writeFile(join(p, 'BACKLOG.md'), '# Backlog\n', 'utf-8');

  await writeFile(join(p, 'M9.E1-PLAN.md'), '# M9.E1 plan\n', 'utf-8');
  await writeFile(join(p, 'M9.E1-VERIFICATION.md'), '# M9.E1 verification\n\n**Verdict:** PASS\n', 'utf-8');
  await writeFile(join(p, 'M9.E1-RETROSPECTIVE.md'), retro('M9.E1', 'Shipped the lantern index and its reader.'), 'utf-8');

  await writeFile(join(p, 'M9.E2-PLAN.md'), '# M9.E2 plan\n', 'utf-8');
  await writeFile(join(p, 'M9.E2-VERIFICATION.md'), UNREADABLE_VERDICT, 'utf-8');
  await writeFile(join(p, 'M9.E2-RETROSPECTIVE.md'), retro('M9.E2', 'Shipped the harbour sync with one pending item.'), 'utf-8');

  await writeFile(join(p, 'M9.E3-PLAN.md'), '# M9.E3 plan\n', 'utf-8');
  await writeFile(join(p, 'M9.E3-VERIFICATION.md'), '# M9.E3 verification\n\n**Verdict:** PASS\n', 'utf-8');
  await writeFile(join(p, 'M9.E3-RETROSPECTIVE.md'), retro('M9.E3', 'Export is in progress.'), 'utf-8');
}

const movedUnits = (moves) =>
  new Set(moves.map((m) => m.from.match(/(M9\.E\d+)-/)?.[1]).filter(Boolean));

describe('M6.E15 S6 — docs-migrate archives only closed units (SIG-286)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-closed-units-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC8.4 — the verdict reader is unchanged: `## Verdict` + `**PASS …**` on the next line is unreadable', () => {
    expect(parseVerdict(UNREADABLE_VERDICT).status).toBe('unreadable');
  });

  it('AC8.1 — a filled retro alone, or being the current unit, does not move; the closed control does', async () => {
    await setup(dir, STATE_READABLE);
    const { plan } = await runMigrate(dir, { apply: false });
    expect([...movedUnits(plan.archive.moves)]).toEqual(['M9.E1']);
    expect(plan.v3.evicts.map((e) => e.epicId)).toEqual(['M9.E1']);
  });

  it('AC8.1 on --apply — the unclosed Epics\' files do not move; the closed control does', async () => {
    await setup(dir, STATE_READABLE);
    const r = await runMigrate(dir, { apply: true, stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied, r.reason).toBe(true);
    const at = (rel) => existsSync(join(dir, rel));
    for (const id of ['M9.E2', 'M9.E3']) {
      for (const kind of ['PLAN', 'VERIFICATION', 'RETROSPECTIVE']) expect(at(`.planning/${id}-${kind}.md`), `${id}-${kind}`).toBe(true);
    }
    // The positive control: the closed Epic's plan did move, to where the plan said.
    const move = r.plan.archive.moves.find((m) => m.from.endsWith('M9.E1-PLAN.md'));
    expect(move).toBeDefined();
    expect(move.from).toBe('.planning/M9.E1-PLAN.md');
    expect(at(move.from)).toBe(false);
    expect(at(move.to)).toBe(true);
  });

  it('AC8.3 / AC8.4 — the dry run\'s move list, vector-3 evicts and explanation agree for every unit', async () => {
    await setup(dir, STATE_READABLE);
    const out = await renderDryRun(dir);

    // The control moves, on both surfaces.
    expect(out).toContain('.planning/M9.E1-PLAN.md →');
    expect(out).toContain('M9.E1 narrative →');

    // The unreadable-verdict Epic: not moved, not evicted, and the dry run says why.
    expect(out).not.toContain('.planning/M9.E2-PLAN.md →');
    expect(out).not.toContain('M9.E2 narrative →');
    expect(out).toMatch(/M9\.E2 — M9\.E2 has 1 terminal artifact\(s\) but none states a readable verdict/);

    // The current Epic: not moved, not evicted.
    expect(out).not.toContain('.planning/M9.E3-PLAN.md →');
    expect(out).not.toContain('M9.E3 narrative →');
    // And the dry run does not claim its retrospective is missing — it has one.
    expect(out).not.toContain('no M9.E3-RETROSPECTIVE.md');
    expect(out).not.toContain('no M9.E2-RETROSPECTIVE.md');

    expect(out).toContain('archive-tree moves:   2');
    expect(out).toContain('vector-3 (closed-Epic evicts): 1');
  });

  it('AC8.2 — STATE.md unreadable → no archive moves and no vector-3 evictions', async () => {
    await setup(dir, STATE_UNREADABLE);
    const { plan } = await runMigrate(dir, { apply: false });
    expect(plan.archive.moves).toEqual([]);
    expect(plan.v3.evicts).toEqual([]);

    const out = await renderDryRun(dir);
    expect(out).toContain('archive-tree moves:   0');
    expect(out).toContain('vector-3 (closed-Epic evicts): 0');
    expect(out).toContain('Nothing is proposed because nothing could be evaluated');
  });
});
