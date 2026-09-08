import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CMD = (name) => join(ROOT, 'plugin/commands', `${name}.md`);
const read = (name) => readFileSync(CMD(name), 'utf8');

/**
 * `B93` — the tier must be read for the Epic a phase is ABOUT TO RUN, never for
 * the one it is leaving.
 *
 * `discuss.md` §0 is headed "run before anything else" and its Epic roll is a
 * later section, so an agent following the file literally calls
 * `readEffectiveProfile` while `current_epic` still names the CLOSING Epic — and
 * a `{PrevEpic}-PROFILE.md` is still shadowing. Measured twice, never reasoned:
 *
 *   M5.E10 open, 2026-08-11 — pre-roll FEATURE/light, post-roll project FULL/strict
 *   M6.E8  open, 2026-09-07 — pre-roll FEATURE/light, post-roll project FULL/strict
 *
 * ⚠ The M6.E8 instance is NOT reachable from `main`. It lives on the unmerged
 * branch `feat/m6.e8-advisor-ranking-inputs` (`7e9c288`), whose STATE.md carries
 * `current_epic: M6.E8`. `main`'s STATE.md still reads M6.E7. Named here because
 * the PR reviewer read the same claim with no reachable evidence and concluded it
 * was invented — a reasonable read, and the citation's fault rather than theirs.
 *
 * The second run reported a `checkpointed` confirm cadence for an Epic that
 * inherits `attended`. `light` batch-confirms once; `strict` confirms every gray
 * area. The phase branches on the difference, so this is not cosmetic.
 *
 * ⚠ THIS IS AN INSTRUCTION BUG, WHICH IS WHY THE GUARD READS PROSE. There is no
 * function to unit-test: the ordering lives in a markdown file an agent obeys.
 * `M5.E17`'s class is fixing one file when six share the shape, so the sibling
 * invariant below is asserted rather than assumed.
 */
describe('B93 — the Epic roll precedes the tier read', () => {
  describe('discuss.md, the one command that both rolls an Epic and gates on a tier', () => {
    const doc = read('discuss');

    it('§0 no longer claims to run before *anything* else, without qualification', () => {
      // The unqualified heading is the instruction that produced the bug.
      expect(doc).not.toMatch(/^## 0\. Tier-gating preamble \(run before anything else\)\s*$/m);
    });

    it('§0 names the --epic carve-out and B93 in its own heading', () => {
      const heading = doc.match(/^## 0\. Tier-gating preamble \(([^)]*)\)/m);
      expect(heading, 'discuss.md has no §0 tier-gating heading at all').toBeTruthy();
      expect(heading[1]).toMatch(/--epic|Epic roll/i);
      expect(doc).toMatch(/B93/);
    });

    it('the Epic-mode section says it runs before §0, not merely before Step 1', () => {
      const heading = doc.match(/^## Epic mode \(`--epic <name>`\)([^\n]*)$/m);
      expect(heading, 'discuss.md has no Epic mode section').toBeTruthy();
      expect(
        heading[1],
        'the Epic-mode heading must say it precedes §0 — "before Step 1" alone is what left the ' +
          'tier read ahead of the roll.',
      ).toMatch(/§\s*0/);
    });

    it('the roll instruction sends the reader back to the tier gate', () => {
      // Without this, obeying the reorder means silently skipping §0 entirely —
      // trading a wrong-profile read for no profile read.
      expect(doc).toMatch(/go back and run § ?0/i);
    });

    // ⚠ ADDED AFTER THE PR REVIEWER CAUGHT WHAT THIS FILE MISSED. The first draft
    // asserted only that the back-pointer EXISTS, and the first draft of
    // discuss.md put it immediately after `setCurrentEpic` — ahead of the
    // per-Epic calibrate step and the Done-Epic guard. That is B93 one step
    // downstream: §0 would read the tier BEFORE `/sig:calibrate` wrote the
    // `{EpicID}-PROFILE.md` it is supposed to honour, and the halt guard would be
    // evaluated after the gate it precedes. Existence was never the property that
    // mattered; POSITION was.
    it('the back-pointer sits at the END of Epic mode, after calibrate and the done-guard', () => {
      const back = doc.search(/go back and run § ?0/i);
      const calibrate = doc.indexOf('**Per-Epic tier');
      const doneGuard = doc.indexOf('**Done-Epic guard.**');
      const workflow = doc.indexOf('## Workflow');

      expect(calibrate, 'discuss.md has no Per-Epic tier paragraph').toBeGreaterThan(-1);
      expect(doneGuard, 'discuss.md has no Done-Epic guard paragraph').toBeGreaterThan(-1);
      expect(back, 'discuss.md has no back-pointer to §0').toBeGreaterThan(-1);

      expect(
        back > calibrate,
        'the "go back to §0" pointer precedes the per-Epic calibrate step, so a freshly written ' +
          '{EpicID}-PROFILE.md is not on disk when the tier gate reads it — B93 one step downstream.',
      ).toBe(true);
      expect(
        back > doneGuard,
        'the "go back to §0" pointer precedes the Done-Epic guard, so a halt meant to stop the run ' +
          'is evaluated after the gate it should precede.',
      ).toBe(true);
      expect(
        back < workflow,
        'the back-pointer must stay inside Epic mode, before § Workflow.',
      ).toBe(true);
    });
  });

  describe('the sibling phase commands — checked, and the check is what is asserted', () => {
    // B93 asks for the siblings to be checked "before fixing just this one". The
    // reason none of them needs the carve-out is that none of them can roll an
    // Epic. That is a property of their args, so assert the property: if one ever
    // grows --epic, this fails and the carve-out has to travel with it.
    const siblings = ['plan', 'execute', 'verify', 'review', 'ship'];

    it.each(siblings)('%s.md carries the tier preamble', (name) => {
      expect(read(name)).toMatch(/^## 0\. Tier-gating preamble/m);
    });

    it.each(siblings)('%s.md does NOT accept --epic, so it never rolls an Epic', (name) => {
      const doc = read(name);
      const args = doc.match(/^args:\s*"([^"]*)"/m);
      expect(args, `${name}.md has no args line to check`).toBeTruthy();
      expect(
        args[1],
        `${name}.md now accepts --epic, so it can roll an Epic before its tier read — ` +
          `it needs discuss.md's B93 carve-out too.`,
      ).not.toMatch(/--epic/);
      expect(
        doc.includes('setCurrentEpic('),
        `${name}.md calls setCurrentEpic, so it rolls an Epic and needs the B93 carve-out.`,
      ).toBe(false);
    });
  });

  describe('drive.md — one dial read cannot govern a run whose Epic changes', () => {
    const doc = read('drive');

    it('never rolls the Epic itself (the premise of the re-read requirement)', () => {
      // If this ever becomes false the fix below is the wrong fix, and the test
      // should fail so someone re-derives it rather than inheriting it.
      expect(doc).not.toMatch(/setCurrentEpic\(/);
    });

    it('instructs a profile re-read inside the loop, not only at step 1', () => {
      const loop = doc.slice(doc.indexOf('### 3. Loop'));
      expect(loop, 'drive.md has no "### 3. Loop" section').toBeTruthy();
      expect(
        /re-?read/i.test(loop) && loop.includes('readEffectiveProfile'),
        'drive.md § 3 must re-read the effective profile each pass — current_epic changes when ' +
          'DISCUSS rolls an Epic, and a step-1-only read pins the whole run to the previous ' +
          "Epic's profile.",
      ).toBe(true);
      expect(loop).toMatch(/B93/);
    });

    it('requires a changed attention level to be announced, not applied silently', () => {
      const loop = doc.slice(doc.indexOf('### 3. Loop'));
      expect(loop).toMatch(/changed/i);
      expect(loop).toMatch(/attention/i);
    });
  });
});
