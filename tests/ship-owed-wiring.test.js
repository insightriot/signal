// M6.E18 REVIEW I9 — `/sig:resume` and `/sig:status` say what SHIP still owes
// only if they hand the current unit's record to `describeNextAction`. The
// lookup is an instruction in each command file, so nothing ran it: reverting
// both calls to the two-argument form kept the suite green. These pin the
// instruction, and that `status.md` renders the owed text rather than "done".

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { describeNextAction, formatNextActionCopy, formatShipOwed } from '../plugin/tools/lib/status.js';

const read = (name) => readFileSync(new URL(`../plugin/commands/${name}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
const CALL = 'describeNextAction(state.phase, profile.phases_skipped, readCurrentUnitStatus(baseDir, state.current_epic))';

describe('the briefings pass the unit record to describeNextAction (SIG-319)', () => {
  for (const name of ['resume.md', 'status.md']) {
    it(`${name} calls describeNextAction with readCurrentUnitStatus(baseDir, state.current_epic)`, () => {
      const text = read(name);
      expect(text).toContain(CALL);
      // Every call in the file passes the record: no two-argument call is left beside it.
      const calls = text.split('describeNextAction(').slice(1);
      expect(calls.length).toBeGreaterThan(0);
      for (const rest of calls) expect(`describeNextAction(${rest}`.startsWith(CALL)).toBe(true);
    });
  }

  it('status.md renders desc.owed with formatShipOwed, before the done branch, and never as done', () => {
    const text = read('status.md');
    const owed = text.indexOf('Else if `desc.owed` is set');
    const done = text.indexOf("Else if `desc.action === 'done'`");
    expect(owed).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(owed);
    expect(text).toContain('`Next: still owed at SHIP — {formatShipOwed(desc.owed)}`');
    expect(text.slice(owed, done)).toMatch(/Never `done` here/);
  });

  it('resume.md renders the next action with formatNextActionCopy, which names what is owed', () => {
    expect(read('resume.md')).toContain(`nextAction: formatNextActionCopy(${CALL})`);
    const desc = describeNextAction('SHIP', [], { unitStatus: 'closing', pr: '304' });
    expect(formatNextActionCopy(desc)).toBe(`Next phase: none — still owed at SHIP: ${formatShipOwed(desc.owed)}`);
    expect(formatShipOwed(desc.owed)).toMatch(/^merge PR #304, then confirm the close/);
  });
});
