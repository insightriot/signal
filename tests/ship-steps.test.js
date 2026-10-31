// ship.md rewrite (course correction Step 1, 2026-10-31): the command is plain
// numbered steps. This checks what an agent following it depends on: every
// function it names is exported by the module it names, the steps come in the
// order the calls must run, and no call is wrapped across a line (the
// directive classifier reads one line at a time).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LIB = join(ROOT, 'plugin/tools/lib');
const ship = readFileSync(join(ROOT, 'plugin/commands/ship.md'), 'utf-8');
const flat = ship.replace(/\s+/g, ' ');

const CALLS = [
  ['readEffectiveProfile', 'profile.js'],
  ['applyRigorOverrides', 'profile.js'],
  ['readState', 'state.js'],
  ['detectMode', 'state.js'],
  ['unitRecordsOn', 'unit-records.js'],
  ['shipFR1Check', 'retrospective.js'],
  ['checkBranchPosture', 'branch-guard.js'],
  ['formatBranchHalt', 'branch-guard.js'],
  ['formatBranchLine', 'branch-guard.js'],
  ['formatBranchUnknown', 'branch-guard.js'],
  ['readOpenObligations', 'obligations.js'],
  ['formatObligationReport', 'obligations.js'],
  ['dischargeObligation', 'obligations.js'],
  ['transitionPhase', 'state.js'],
  ['completePhase', 'state.js'],
  ['markRunEnded', 'state.js'],
  ['evictEpicNarrative', 'evict.js'],
  ['regenerateIndex', 'retro-index.js'],
  ['isStoreOn', 'work-store.js'],
  ['evictTerminalToLedger', 'drain.js'],
  ['dischargeBacklogRows', 'backlog.js'],
  ['runShipContentGate', 'ship-gate.js'],
  ['formatShipContentGate', 'ship-gate.js'],
  ['unitToCloseAtShip', 'work-ops.js'],
  ['closeEpic', 'work-ops.js'],
  ['checkRecords', 'work-records.js'],
  ['runConfirmCloses', 'close-confirm.js'],
  ['generateMilestoneMetaRetro', 'retro-index.js'],
  ['regeneratePlanningIndex', 'planning-index.js'],
  ['readPullRequestEvidence', 'branch-guard.js'],
  ['formatPrEvidenceLine', 'branch-guard.js'],
  ['readPrReviewFindings', 'pr-review-findings.js'],
  ['formatPrReviewFindings', 'pr-review-findings.js'],
  ['readReviewerEffort', 'pr-review-findings.js'],
  ['formatReviewerEffort', 'pr-review-findings.js'],
];

describe('ship.md names real code', () => {
  it.each(CALLS)('%s is exported by %s, and ship.md names both', async (name, file) => {
    const mod = await import(join(LIB, file));
    expect(typeof mod[name], `${name} in ${file}`).toBe('function');
    expect(ship).toMatch(new RegExp('`(?:await )?' + name + '\\('));
    expect(ship).toContain(`\`tools/lib/${file}\``);
  });

  it('every tools/lib path it names exists', () => {
    for (const [, rel] of ship.matchAll(/`tools\/lib\/([a-z-]+\.js)`/g)) {
      expect(existsSync(join(LIB, rel)), rel).toBe(true);
    }
  });

  it('every function call in backticks is on one line', () => {
    const wrapped = ship.split('\n').filter((l) => /`[A-Za-z]+\([^`]*$/.test(l));
    expect(wrapped).toEqual([]);
  });

  it('every path is under ${CLAUDE_PLUGIN_ROOT}', () => {
    expect(ship).toMatch(/Every `tools\/lib\/`, `skills\/` and `references\/` path in this file is under `\$\{CLAUDE_PLUGIN_ROOT\}\/`/);
  });
});

describe('ship.md steps run in order', () => {
  const at = (s) => {
    const i = ship.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };

  it('the numbered steps are 1 to 9, and step 7 has 7.1 to 7.9', () => {
    expect([...ship.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...ship.matchAll(/^### 7\.(\d+) /gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('step 1 reads the profile, then the retrospective check, then the branch, and writes nothing', () => {
    expect(at('## 1. Check SHIP can run (writes nothing)')).toBeLessThan(at('readEffectiveProfile('));
    expect(at('readEffectiveProfile(')).toBeLessThan(at('shipFR1Check('));
    expect(at('shipFR1Check(')).toBeLessThan(at('checkBranchPosture('));
    expect(at('checkBranchPosture(')).toBeLessThan(at('## 2. '));
  });

  it('the pull request is opened before the phase is recorded, and the phase before the records', () => {
    expect(at('## 5. Open the pull request')).toBeLessThan(at('## 6. Record the phase'));
    expect(at("transitionPhase(baseDir, 'SHIP')")).toBeLessThan(at("completePhase(baseDir, 'SHIP')"));
    expect(at("completePhase(baseDir, 'SHIP')")).toBeLessThan(at('## 7. '));
  });

  it('records: evict, retro index, inbox, backlog, content gate, unit close, confirm, meta-retro, INDEX, then the commit', () => {
    const order = [
      'evictEpicNarrative(baseDir, state.current_epic)',
      'regenerateIndex(baseDir)',
      'evictTerminalToLedger(baseDir, { dryRun: true })',
      'dischargeBacklogRows(',
      'runShipContentGate(',
      'Call `closeEpic(baseDir, state.current_epic, {by, pr, release})`',
      'runConfirmCloses(baseDir)',
      'generateMilestoneMetaRetro(',
      'regeneratePlanningIndex(baseDir)',
      '## 8. Make the SHIP commit',
      '## 9. Hand off',
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('the Epic-close sub-steps say so in their headings; the others say every SHIP', () => {
    for (const n of [1, 2, 3, 4]) expect(ship).toMatch(new RegExp(`^### 7\\.${n} .*\\(Epic-close SHIP only\\)$`, 'm'));
    for (const n of [5, 7, 9]) expect(ship).toMatch(new RegExp(`^### 7\\.${n} .*\\(every SHIP\\)$`, 'm'));
  });
});

describe('ship.md keeps the floors and the hand-off rules', () => {
  it('names the two floors the attention dial cannot clear', () => {
    expect(flat).toMatch(/they are floors \(`ship-pr`, `ship-retro`\), not asks the dial can clear/);
  });

  it('says how to undo it, in the checklist and in the PR body', () => {
    expect(flat).toMatch(/\*\*How to undo it\*\* is known/);
    expect(flat).toMatch(/The PR body states what changed, why, how it was verified, and how to undo it\./);
  });

  it('the review-head label goes on after the final push, and nothing here merges', () => {
    const eight = flat.slice(flat.indexOf('## 8. '), flat.indexOf('## 9. '));
    expect(eight).toMatch(/add the `review-head` label only after SHIP's final push/);
    expect(flat).toMatch(/merging is delivery, and nothing here merges/);
  });

  it('the PR description holds what the records steps report', () => {
    expect(flat).toMatch(/put `result\.record` in the PR description under \*"Shipped past the content gate"\*/);
    expect(flat).toMatch(/Copy the `Closes:` line into the PR description/);
  });
});
