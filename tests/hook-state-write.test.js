// Tests for the PreToolUse + SessionStart-resume hook helpers
// (M4.5.E9.S1.t7 — D-E9-8 layers 2 + 3).

import { describe, it, expect } from 'vitest';
import {
  checkProposedStateWrite,
  checkStateFrontmatterShape,
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

// --- FR1 (v0.1.6): block prose in STATE frontmatter fields ---
// Field-specific, raw-text, blacklist discriminator. `completed_phases` items
// are single-line scalars (multi-line OR >150 chars = prose). `blockers` items
// are 3-line objects (NEVER flagged for being multi-line — only the `text:`
// value is inspected: multi-line block-scalar OR >500 chars = prose).

const FM_HEAD = `---
schema_version: 1
phase: EXECUTE
current_epic: null
current_wave: null
current_tasks: []`;

describe('checkStateFrontmatterShape (FR1 prose-block)', () => {
  it('AC1.1 blocks a multi-line completed_phases item (the cmmc double-quoted-scalar pollution)', () => {
    const content = `${FM_HEAD}
completed_phases:
  - CALIBRATE (2026-05-13)
  - "**▶ Active: Slice SEC1 — Supabase hardening: DISCUSS done →
    PLAN done landed 2026-07-01 (4-agent research + MCP pulls +
    independent plan-checker 8-dim PASS-WITH-NOTES)"
blockers: []
---
body
`;
    const r = checkStateFrontmatterShape({ proposedContent: content });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/completed_phases/);
  });

  it('AC1.1 blocks an over-length (>150 char) single-line completed_phases item', () => {
    const longEntry = `PLAN (2026-07-04) — ${'narrative '.repeat(20)}`; // ~220 chars
    const content = `${FM_HEAD}
completed_phases:
  - CALIBRATE (2026-05-13)
  - "${longEntry}"
blockers: []
---
`;
    const r = checkStateFrontmatterShape({ proposedContent: content });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/completed_phases/);
  });

  it('AC1.2 blocks a blockers[].text over the length budget (>500 chars)', () => {
    const longText = 'x'.repeat(600);
    const content = `${FM_HEAD}
completed_phases:
  - DISCUSS (2026-07-13)
blockers:
  - id: blk-1a2b
    text: ${longText}
    raisedAt: 2026-07-13T00:00:00.000Z
---
`;
    const r = checkStateFrontmatterShape({ proposedContent: content });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/blockers/);
  });

  it('AC1.2 blocks a blockers[].text written as a multi-line block scalar', () => {
    const content = `${FM_HEAD}
completed_phases:
  - DISCUSS (2026-07-13)
blockers:
  - id: blk-1a2b
    text: |
      first paragraph of narrative prose that should never
      live inside a structured blocker text field at all
    raisedAt: 2026-07-13T00:00:00.000Z
---
`;
    const r = checkStateFrontmatterShape({ proposedContent: content });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/blockers/);
  });

  it('B8: the block reason states the check is whole-file so incremental cleanup is not attempted (multiple prose entries, the 529 KB nextpass case)', () => {
    const content = `${FM_HEAD}
completed_phases:
  - "DISCUSS (2026-07-01) — full narrative prose that pollutes the frontmatter and far exceeds the single-line scalar budget for a completed_phases entry, exactly the shape that wedged the live file"
  - "PLAN (2026-07-01) — a second, equally over-length narrative entry; a user fixing these one at a time would still be blocked by this one on the next save"
blockers: []
---
body
`;
    const r = checkStateFrontmatterShape({ proposedContent: content });
    expect(r.block).toBe(true);
    // The reason must reveal the whole-file semantics — the escape B8 found
    // invisible: all offending entries have to be corrected in a single save.
    expect(r.reason).toMatch(/whole file/i);
    expect(r.reason).toMatch(/single save/i);
  });

  it('AC1.3 allows well-formed frontmatter, incl. the 58-char annotated completed_phases entry', () => {
    const content = `${FM_HEAD}
completed_phases:
  - DISCUSS (2026-07-13)
  - "DISCUSS (2026-05-13) — Slice A: build-order infrastructure"
blockers: []
---
body
`;
    expect(checkStateFrontmatterShape({ proposedContent: content }).block).toBe(false);
  });

  it("AC1.6 allows a legit multi-line blockers object (id/text/raisedAt, semicolon in text)", () => {
    const content = `${FM_HEAD}
completed_phases:
  - CALIBRATE (2026-05-14)
blockers:
  - id: blk-abcd
    text: Marketplace install hangs on first run; tracked under F2
    raisedAt: 2026-05-16T10:00:00.000Z
---
`;
    expect(checkStateFrontmatterShape({ proposedContent: content }).block).toBe(false);
  });

  it('AC1.7 self-unblock: a write producing clean frontmatter is allowed (hook is stateless)', () => {
    // A cleanup edit that lands clean frontmatter always passes, regardless of
    // whatever polluted state the file had before — that is how a wedged file
    // gets un-wedged.
    const cleaned = `${FM_HEAD}
completed_phases:
  - DISCUSS (2026-07-13)
  - PLAN (2026-07-13)
blockers: []
---
`;
    expect(checkStateFrontmatterShape({ proposedContent: cleaned }).block).toBe(false);
  });

  it('AC1.5 fails open (allow) on content with no frontmatter or garbage input', () => {
    expect(checkStateFrontmatterShape({ proposedContent: '' }).block).toBe(false);
    expect(checkStateFrontmatterShape({ proposedContent: 'no frontmatter here' }).block).toBe(false);
    expect(checkStateFrontmatterShape({ proposedContent: undefined }).block).toBe(false);
  });
});
