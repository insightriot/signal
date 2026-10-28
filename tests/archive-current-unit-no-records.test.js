// SIG-361 — the current unit's files never move, on a project with no unit records.
//
// Found on the test project: STATE.md named the current Epic, the Epic had a
// filled-in retrospective, and the project had no `.planning/work/units/`. The
// closure resolver called the unit mid-flight, but the retrospective route
// called it closed, and the "current unit stays" filter only ran with unit
// records. So the archive plan moved the current Epic's files.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { senseArchiveTree } from '../plugin/tools/lib/archive-tree.js';

const RETRO = (id) => `# ${id} — Retrospective\n\n## What went well\n\nThe Epic shipped.\n`;
const STATE = (epic) =>
  `---\nschema_version: 1\nphase: SHIP\ncurrent_epic: ${epic}\n` +
  `current_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n` +
  `last_completed_task: null\n---\n# Project State\n`;

async function project(baseDir, files) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(baseDir, '.planning', name), content, 'utf-8');
  }
}

describe('SIG-361 — no unit records: the current unit stays', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig361-'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('keeps the current Epic out of the moves even with a filled retrospective', async () => {
    await project(base, {
      'STATE.md': STATE('M3.0.E2'),
      'M3.0.E1-PLAN.md': '# plan\n',
      'M3.0.E1-RETROSPECTIVE.md': RETRO('M3.0.E1'),
      'M3.0.E2-PLAN.md': '# plan\n',
      'M3.0.E2-REVIEW.md': '# review\n',
      'M3.0.E2-RETROSPECTIVE.md': RETRO('M3.0.E2'),
    });

    const sense = await senseArchiveTree(base);
    const moved = sense.moves.map((m) => m.from);

    expect(moved.some((f) => f.includes('M3.0.E2'))).toBe(false);
    expect(moved).toContain('.planning/M3.0.E1-PLAN.md');
    expect(sense.current).toEqual(['M3.0.E2']);
  });

  it('the dry-run report declines the current Epic once, as mid-flight, and plans none of its files', async () => {
    const { buildArchiveReport, renderArchiveReport } = await import('../plugin/tools/lib/archive-command.js');
    await project(base, {
      'STATE.md': STATE('M3.0.E2'),
      'M3.0.E1-PLAN.md': '# plan\n',
      'M3.0.E1-RETROSPECTIVE.md': RETRO('M3.0.E1'),
      'M3.0.E2-PLAN.md': '# plan\n',
      'M3.0.E2-RETROSPECTIVE.md': RETRO('M3.0.E2'),
    });

    const text = renderArchiveReport(await buildArchiveReport(base), { apply: false }).join('\n');

    expect(text).toMatch(/M3\.0\.E2 {2}\[open\] {2}M3\.0\.E2 is the current unit/);
    expect(text).not.toContain('M3.0.E2 is closed; still the current unit');
    expect(text).not.toContain('M3.0.E2-PLAN.md →');
  });

  it('keeps the current Epic even when a caller names it closed', async () => {
    await project(base, {
      'STATE.md': STATE('M3.0.E2'),
      'M3.0.E2-PLAN.md': '# plan\n',
    });

    const sense = await senseArchiveTree(base, { closedUnits: ['M3.0.E2'] });

    expect(sense.moves).toEqual([]);
    expect(sense.current).toEqual(['M3.0.E2']);
  });

  it('/sig:docs-migrate does not count the current Epic as closed either', async () => {
    const { resolveMigrateClosedUnits } = await import('../plugin/tools/lib/migrate-memory.js');
    await project(base, {
      'STATE.md': STATE('M3.0.E2'),
      'M3.0.E2-PLAN.md': '# plan\n',
      'M3.0.E2-RETROSPECTIVE.md': RETRO('M3.0.E2'),
    });

    expect((await resolveMigrateClosedUnits(base)).closedUnits).not.toContain('M3.0.E2');
  });

  it('reports nothing current when the current Epic was not going to move', async () => {
    await project(base, {
      'STATE.md': STATE('M3.0.E3'),
      'M3.0.E1-PLAN.md': '# plan\n',
      'M3.0.E1-RETROSPECTIVE.md': RETRO('M3.0.E1'),
    });

    const sense = await senseArchiveTree(base);

    expect(sense.moves.map((m) => m.from)).toContain('.planning/M3.0.E1-PLAN.md');
    expect(sense.current).toEqual([]);
  });
});
