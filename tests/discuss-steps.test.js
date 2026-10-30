// discuss.md as numbered steps (course correction Step 1): checks that read the
// command file for a step an agent following it would get wrong.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const discuss = readFileSync(join(ROOT, 'plugin', 'commands', 'discuss.md'), 'utf-8');
const flat = discuss.replace(/\s+/g, ' ');

describe('a per-Epic calibrate is settled before the requirements are written (SIG-369)', () => {
  // Measured twice on the test project: at checkpointed the approval came in the
  // end-of-phase batch, after the requirements were written at the project tier,
  // so the calibrate was written down as a next step and never run.
  it('is asked in step 3, even at checkpointed, because the tier sets what step 6 writes', () => {
    const step3 = discuss.slice(discuss.indexOf('## 3. Read the profile'), discuss.indexOf('## 4. ')).replace(/\s+/g, ' ');
    expect(step3).toMatch(/clearly smaller or larger than the project's tier, ask now, even at `checkpointed` \(the tier sets what step 6 writes\)/);
    expect(step3).toMatch(/On yes, run it, then read the profile again/);
    expect(discuss.indexOf('ask now, even at `checkpointed`')).toBeLessThan(discuss.indexOf('## 6. Write the requirements'));
  });

  it('at unattended nothing is asked: the project tier is kept and the recommendation recorded', () => {
    expect(flat).toMatch(/At `unattended`, keep the project's tier and note the recommendation in `## Deferred`/);
    expect(flat).toMatch(/`## Decisions` \(each with its reason\), `## Deferred`/);
  });
});
