import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSweepReport } from '../plugin/tools/lib/sweep.js';

/**
 * M6.E3 t1.8 — what the shipped docs say about the Jev check (AC7.4, AC8.5,
 * AC10.3). Nothing shipped may read as though the semantic gap is closed.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const jevItem = README.split('\n').find((l) => l.includes('**Jev (optional'));

describe('README → network list names the Jev call (AC8.5) and its limits (AC7.4)', () => {
  it('exists and names the key, the endpoint and where to get one', () => {
    expect(jevItem).toBeDefined();
    expect(jevItem).toContain('TYPESAFE_API_KEY');
    expect(jevItem).toContain('api.typesafe.ai');
    expect(jevItem).toMatch(/Get a key/);
  });

  it('says it is advisory, STATE.md only, judged against supplied facts, and varies run to run', () => {
    expect(jevItem).toMatch(/advice only/);
    expect(jevItem).toMatch(/never blocks/);
    expect(jevItem).toMatch(/`STATE\.md` only/);
    expect(jevItem).toMatch(/only against the facts Signal derives/);
    expect(jevItem).toMatch(/results can vary between runs/);
  });
});

describe('/sig:docs-sweep says the Jev check does not run there (AC10.3)', () => {
  it('the report has a Model-judged checks section saying so', () => {
    const out = renderSweepReport({ findings: [], stateDrift: { results: [], summary: {} }, signalOnly: null });
    expect(out).toMatch(/## Model-judged checks\nnot run here — this sweep is offline/);
  });

  it('docs-sweep.md says so too', () => {
    const doc = readFileSync(join(ROOT, 'plugin/commands/docs-sweep.md'), 'utf8');
    expect(doc).toMatch(/never runs the \*\*Jev `STATE\.md` check\*\*/);
  });
});
