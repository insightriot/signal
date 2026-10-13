// M6.E16 r6 (REVIEW: the sentence was held for `/sig:docs-archive` only) —
// `/sig:docs-migrate`'s dry run says, for a unit that is closed by its record
// and is still the current unit, that it is closed and why its files stay.
// `tests/archive-units.test.js` holds `/sig:docs-archive`'s copy of the
// sentence (`archive-command.js`); this holds the dry run's
// (`explainArchiveOutcome`, `archive-report.js`).
//
// The project is `tests/helpers/unit-fixture.js`'s: M7.E9 is the current Epic
// and its record is closed. Every name is invented.

import { describe, it, expect, afterEach } from 'vitest';

import { explainArchiveOutcome } from '../plugin/tools/lib/archive-report.js';
import { renderDryRun } from '../plugin/tools/lib/migrate-memory.js';
import { cleanupUnitProjects, contradiction, plant, put, state } from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const SENTENCE = '  ↳ M7.E9 is closed; still the current unit, so its files stay until the next Epic opens.';
const closed = { unit: 'M7.E9', status: 'closed', reason: 'its unit record is closed' };

describe('the dry run\'s sentence for a closed unit that is still the current unit', () => {
  it('explainArchiveOutcome prints it, once per such unit, in these words', () => {
    const lines = explainArchiveOutcome({ closures: [closed], current: ['M7.E9'], unitRecords: true, moveCount: 0 });
    expect(lines.filter((l) => l.includes('still the current unit'))).toEqual([SENTENCE]);
    const two = explainArchiveOutcome({ closures: [closed, { ...closed, unit: 'GATE-A' }], current: ['M7.E9', 'GATE-A'], unitRecords: true, moveCount: 0 });
    expect(two.filter((l) => l.includes('still the current unit'))).toEqual([SENTENCE, SENTENCE.replace('M7.E9', 'GATE-A')]);
  });

  it('it is not printed when no closed unit is current, nor when STATE.md could not be read', () => {
    expect(explainArchiveOutcome({ closures: [closed], current: [], unitRecords: true, moveCount: 0 }).join('\n')).not.toContain('still the current unit');
    expect(explainArchiveOutcome({ closures: [closed], unitRecords: true, moveCount: 0 }).join('\n')).not.toContain('still the current unit');
    expect(explainArchiveOutcome({ closures: [closed], current: ['M7.E9'], unitRecords: true, moveCount: 0, stateReadable: false }).join('\n'))
      .not.toContain('still the current unit');
  });

  it('/sig:docs-migrate\'s dry run prints it for the project\'s current unit, and proposes no move of its files', async () => {
    const base = contradiction({ units: true }); // M7.E9 is current, and its record is closed
    put(base, '.planning/STATE.md', state({ front: ['docs_layout_version: 3'] }));
    put(base, '.planning/M7.E9-PLAN.md', '# plan\n');
    const out = await renderDryRun(base);
    expect(out.split('\n')).toContain(SENTENCE);
    expect(out).not.toContain('.planning/M7.E9-PLAN.md →');
    // Once another Epic is current the sentence is gone, and the file is proposed for a move.
    put(base, '.planning/STATE.md', state({ epic: 'M7.E4', front: ['docs_layout_version: 3'] }));
    plant(base, 'M7.E4', 'open');
    const later = await renderDryRun(base);
    expect(later).not.toContain('still the current unit');
    expect(later).toContain('.planning/M7.E9-PLAN.md →');
  });
});
