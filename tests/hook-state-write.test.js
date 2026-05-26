// Tests for the PreToolUse + SessionStart-resume hook helpers
// (M4.5.E9.S1.t7 — D-E9-8 layers 2 + 3).

import { describe, it, expect } from 'vitest';
import {
  checkProposedStateWrite,
  detectDirtyExecute,
} from '../tools/lib/retrospective.js';

const STATE_SHIP_NO_RETRO = `---
schema_version: 1
phase: SHIP
current_epic: M4.5.E3
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-05-24)
  - PLAN (2026-05-24)
  - EXECUTE (2026-05-25)
  - VERIFY (2026-05-25)
  - REVIEW (2026-05-25)
  - SHIP (2026-05-26)
blockers: []
last_completed_task: M4.5.E3.S2.t7
last_decision_at: 2026-05-26T00:00:00.000Z
---
body
`;

const STATE_EXECUTE_MID_EPIC = `---
schema_version: 1
phase: EXECUTE
current_epic: M4.5.E9
current_wave: 4
current_tasks: []
completed_phases:
  - DISCUSS (2026-05-25)
  - PLAN (2026-05-25)
blockers: []
last_completed_task: M4.5.E9.S1.t6
last_decision_at: 2026-05-26T00:00:00.000Z
---
`;

const STATE_SHIP_NO_CURRENT_EPIC = `---
schema_version: 1
phase: SHIP
current_epic: null
completed_phases:
  - SHIP (2026-05-26)
---
`;

describe('checkProposedStateWrite (PreToolUse layer)', () => {
  it('blocks when proposed STATE marks SHIP completion for an Epic missing its retro', () => {
    const result = checkProposedStateWrite({
      proposedContent: STATE_SHIP_NO_RETRO,
      baseDir: '/tmp/fake',
      fileExistsFn: () => false, // retro NOT on disk
    });
    expect(result.block).toBe(true);
    expect(result.retroPath).toBe('.planning/M4.5.E3-RETROSPECTIVE.md');
    expect(result.reason).toMatch(/M4\.5\.E3/);
    expect(result.reason).toMatch(/retrospective-template/);
  });

  it('allows when the retro file exists on disk', () => {
    const result = checkProposedStateWrite({
      proposedContent: STATE_SHIP_NO_RETRO,
      baseDir: '/tmp/fake',
      fileExistsFn: () => true, // retro exists
    });
    expect(result.block).toBe(false);
  });

  it('allows non-SHIP writes (mid-EXECUTE STATE bumps)', () => {
    const result = checkProposedStateWrite({
      proposedContent: STATE_EXECUTE_MID_EPIC,
      baseDir: '/tmp/fake',
      fileExistsFn: () => false,
    });
    expect(result.block).toBe(false);
  });

  it('allows SHIP-phase writes where completed_phases has no SHIP entry yet', () => {
    const stateMidShip = STATE_SHIP_NO_RETRO.replace(
      '  - SHIP (2026-05-26)\n',
      '',
    );
    const result = checkProposedStateWrite({
      proposedContent: stateMidShip,
      baseDir: '/tmp/fake',
      fileExistsFn: () => false,
    });
    // Phase is SHIP but completion not recorded — the actual transition
    // hasn't happened yet. Don't block; FR1 command-internal handles it.
    expect(result.block).toBe(false);
  });

  it('allows when current_epic is null (no Epic to enforce against)', () => {
    const result = checkProposedStateWrite({
      proposedContent: STATE_SHIP_NO_CURRENT_EPIC,
      baseDir: '/tmp/fake',
      fileExistsFn: () => false,
    });
    expect(result.block).toBe(false);
  });

  it('allows content with no frontmatter (legacy STATE before migration)', () => {
    const result = checkProposedStateWrite({
      proposedContent: '# Just narrative content, no YAML\nsome body',
      baseDir: '/tmp/fake',
      fileExistsFn: () => false,
    });
    expect(result.block).toBe(false);
  });
});

describe('detectDirtyExecute (SessionStart-resume layer)', () => {
  const MILESTONE_E3_CLOSED = `
| **E3 — docs rewrite** | **✓ shipped 2026-05-24** | |
| **E9 — Retro Foundations** | DISCUSS + PLAN done | |
`;
  const MILESTONE_E9_NOT_CLOSED = MILESTONE_E3_CLOSED;

  it('warns when STATE shows EXECUTE but milestone shows Epic closed and no retro exists', () => {
    // Construct a fake "dirty" scenario: state.phase = EXECUTE but the
    // milestone says E3 is fully shipped. (Realistically this happens
    // when ship.md wasn't invoked yet but the slice work is "done".)
    const dirtyMilestone = MILESTONE_E3_CLOSED;
    const warning = detectDirtyExecute({
      state: { phase: 'EXECUTE', current_epic: 'M4.5.E3' },
      milestoneContent: dirtyMilestone,
      baseDir: '/tmp/fake',
      fileExistsFn: () => false,
    });
    expect(warning).not.toBeNull();
    expect(warning).toMatch(/M4\.5\.E3/);
    expect(warning).toMatch(/retro/i);
  });

  it('stays silent when no current_epic', () => {
    expect(
      detectDirtyExecute({
        state: { phase: 'EXECUTE', current_epic: null },
        milestoneContent: MILESTONE_E3_CLOSED,
        baseDir: '/tmp/fake',
        fileExistsFn: () => false,
      }),
    ).toBeNull();
  });

  it('stays silent when phase is not EXECUTE', () => {
    expect(
      detectDirtyExecute({
        state: { phase: 'DISCUSS', current_epic: 'M4.5.E3' },
        milestoneContent: MILESTONE_E3_CLOSED,
        baseDir: '/tmp/fake',
        fileExistsFn: () => false,
      }),
    ).toBeNull();
  });

  it('stays silent when retro exists', () => {
    expect(
      detectDirtyExecute({
        state: { phase: 'EXECUTE', current_epic: 'M4.5.E3' },
        milestoneContent: MILESTONE_E3_CLOSED,
        baseDir: '/tmp/fake',
        fileExistsFn: () => true,
      }),
    ).toBeNull();
  });

  it("stays silent when milestone shows Epic NOT yet close-able (still has pending slices)", () => {
    const milestoneE9NotClosed = `
| **E9 — Retro Foundations** | DISCUSS + PLAN done; EXECUTE in flight | |
`;
    expect(
      detectDirtyExecute({
        state: { phase: 'EXECUTE', current_epic: 'M4.5.E9' },
        milestoneContent: milestoneE9NotClosed,
        baseDir: '/tmp/fake',
        fileExistsFn: () => false,
      }),
    ).toBeNull();
  });
});
