// M6.E8 S1 t1.2 — AC5.2: `readCorpus` performs NO retrospective enumeration,
// asserted by the ABSENCE OF THE CALL and not by the shape of the output.
//
// Why a mock and not an output check: an output check ("the corpus has no
// `retros` slot") passes equally well if the read still happens and is merely
// discarded — 32 files parsed per run for nothing, which is exactly the cost
// FR5 removes. The mock makes any call fail loudly.
import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../plugin/tools/lib/retro-index.js', () => ({
  enumerateRetros: vi.fn(() => {
    throw new Error('enumerateRetros was called by readCorpus — the retrospective read is supposed to be gone (M6.E8 FR5)');
  }),
}));
vi.mock('../plugin/tools/lib/retrospective.js', () => ({
  parseSections: vi.fn(() => {
    throw new Error('parseSections was called by readCorpus — the retrospective read is supposed to be gone (M6.E8 FR5)');
  }),
}));

import { ADVISOR_SOURCES, readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'sig-advise-no-retros-'));
  const p = join(base, '.planning');
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, 'BACKLOG.md'), '# Backlog\n\n## Queue\n\n### R1 — a live row\n\nFiled 2026-01-01.\n');
  writeFileSync(join(p, 'BUGS.md'), '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P2 | **Open.** |\n');
  writeFileSync(
    join(p, 'STATE.md'),
    '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M6.E1\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\nlast_updated: 2026-09-05T00:00:00.000Z\n---\n# State\n'
  );
  writeFileSync(join(p, 'MILESTONE-6.md'), '# M6\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M6.E1` | **in flight** | A thing. |\n');
  // A retrospective is PRESENT so that a surviving read would have something to find.
  writeFileSync(join(p, 'M6.E1-RETROSPECTIVE.md'), '## What happened\n\nIt shipped.\n');
  return base;
}

describe('M6.E8 AC5.2 — readCorpus never enumerates retrospectives', () => {
  it('reads all four sources cleanly with the retrospective readers mocked to throw', async () => {
    const corpus = await readCorpus(fixture());
    expect(corpus.checked).toEqual([...ADVISOR_SOURCES]);
    expect(corpus.cannotCheck).toEqual([]);
    expect('retros' in corpus.sources).toBe(false);
  });

  it('the module no longer imports either retrospective reader', () => {
    const src = readFileSync(join(repoRoot, 'plugin/tools/lib/advise-corpus.js'), 'utf8');
    expect(src).not.toMatch(/retro-index\.js/);
    expect(src).not.toMatch(/retrospective\.js/);
  });
});
