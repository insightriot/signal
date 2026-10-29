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
  // discuss.md was rewritten as numbered steps (course correction Step 1,
  // 2026-10-28). The order is what a user would notice, so it is what is
  // checked: the two halts, then the Epic open, then the profile read. The
  // checks of the old wording are in archive/tests/.
  describe('discuss.md, the one command that both opens an Epic and gates on a tier', () => {
    const doc = read('discuss');
    const at = (needle) => {
      const i = doc.indexOf(needle);
      expect(i, `discuss.md has no "${needle}"`).toBeGreaterThan(-1);
      return i;
    };

    it('the halts come before the Epic open, which comes before the profile read', () => {
      const halt = at('No `.planning/PROFILE.md`');
      const skipped = at('`phases_skipped`');
      const open = at('`openEpic(');
      const profile = at('`readEffectiveProfile(');
      expect(halt < open && skipped < open, 'a halt after the open writes current_epic, which cannot be cleared').toBe(true);
      expect(open < profile, 'the profile read must follow the open, or it reads the Epic being left').toBe(true);
    });

    it('a per-Epic calibrate is followed by a second profile read', () => {
      expect(doc.indexOf('read the profile again')).toBeGreaterThan(at('`/sig:calibrate` for it'));
    });

    it('the open runs once and is never come back to', () => {
      expect(doc).toMatch(/Run this step once\. Never come back to it/);
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
      // M6.E16 t3.1: `openEpic` (`work-ops.js`) wraps `setCurrentEpic`, and is
      // what discuss.md and new-project.md now call — so it rolls an Epic too.
      expect(
        doc.includes('openEpic('),
        `${name}.md calls openEpic, so it rolls an Epic and needs the B93 carve-out.`,
      ).toBe(false);
    });
  });

  describe('drive.md — one dial read cannot govern a run whose Epic changes', () => {
    const doc = read('drive');

    it('never rolls the Epic itself (the premise of the re-read requirement)', () => {
      // If this ever becomes false the fix below is the wrong fix, and the test
      // should fail so someone re-derives it rather than inheriting it.
      expect(doc).not.toMatch(/setCurrentEpic\(/);
      expect(doc).not.toMatch(/openEpic\(/); // M6.E16 t3.1: the wrapper rolls an Epic too
    });

    it('instructs a profile re-read inside the loop, not only at step 1', () => {
      // ⚠ `doc.slice(doc.indexOf(...))` with a MISSING heading slices at -1 and
      // returns the file's last CHARACTER — truthy — so the guard could never
      // fail and its message could never print. Caught by the PR reviewer; the
      // correct shape was already three describes up in this same file.
      const idx = doc.indexOf('### 3. Loop');
      expect(idx, 'drive.md has no "### 3. Loop" section').toBeGreaterThan(-1);
      const loop = doc.slice(idx);
      expect(
        /re-?read/i.test(loop) && loop.includes('readEffectiveProfile'),
        'drive.md § 3 must re-read the effective profile each pass — current_epic changes when ' +
          'DISCUSS rolls an Epic, and a step-1-only read pins the whole run to the previous ' +
          "Epic's profile.",
      ).toBe(true);
      expect(loop).toMatch(/B93/);
    });

    it('requires a changed attention level to be announced, not applied silently', () => {
      const idx = doc.indexOf('### 3. Loop');
      expect(idx, 'drive.md has no "### 3. Loop" section').toBeGreaterThan(-1);
      const loop = doc.slice(idx);
      expect(loop).toMatch(/changed/i);
      expect(loop).toMatch(/attention/i);
    });
  });
});
