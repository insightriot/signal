// review.md as numbered steps (course correction Step 1, 2026-10-30).
//
// The command is followed by an agent reading it, so a call it names that no
// module exports, or a step that runs a check before the file it reads is
// written, is a defect in the product. These checks read the command file
// against the code. The loop's own doc contract is
// tests/review-loop-doc-contract.test.js; the dispatch, tests/fresh-reviewer-dispatch.test.js.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initState, readState, transitionPhase, recordPass } from '../plugin/tools/lib/state.js';
import { loopStatusFor } from '../plugin/tools/lib/loop-ceiling.js';
import { checkFixRounds } from '../plugin/tools/lib/review-rounds.js';
import { describeNextAction } from '../plugin/tools/lib/status.js';
import { gitEnv } from '../plugin/tools/lib/git-env.js';

const ROOT = join(import.meta.dirname, '..');
const LIB = join(ROOT, 'plugin', 'tools', 'lib');
const review = readFileSync(join(ROOT, 'plugin', 'commands', 'review.md'), 'utf-8');
const flat = review.replace(/\s+/g, ' ');

const at = (s) => {
  const i = flat.indexOf(s);
  expect(i, `missing: ${s}`).toBeGreaterThan(-1);
  return i;
};

// A project at REVIEW: every earlier phase left its file, so each transition is accepted.
async function atReview(base) {
  await initState(base, 'DISCUSS');
  await writeFile(join(base, '.planning', 'REQUIREMENTS.md'), '# r\n');
  await transitionPhase(base, 'PLAN');
  await writeFile(join(base, '.planning', 'PLAN.md'), '# p\n');
  await transitionPhase(base, 'EXECUTE');
  await transitionPhase(base, 'VERIFY');
  await writeFile(join(base, '.planning', 'VERIFICATION.md'), '# v\n');
  await recordPass(base, 'VERIFY', 'PASS');
  await transitionPhase(base, 'REVIEW');
}

async function withProject(prefix, fn) {
  const base = await mkdtemp(join(tmpdir(), prefix));
  try {
    await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

describe('review.md names only calls that exist', () => {
  const CALLS = {
    readEffectiveProfile: 'profile.js',
    applyRigorOverrides: 'profile.js',
    resolveArtifactPath: 'resume.js',
    artifactName: 'resume.js',
    resolveDefaultBranch: 'branch-guard.js',
    transitionPhase: 'state.js',
    readState: 'state.js',
    recordPass: 'state.js',
    markRunEnded: 'state.js',
    checkFixRounds: 'review-rounds.js',
    loopStatusFor: 'loop-ceiling.js',
    formatLoopCeilingHalt: 'loop-ceiling.js',
  };

  it.each(Object.entries(CALLS))('%s is exported by tools/lib/%s', async (name, file) => {
    expect(review, `review.md no longer names ${name}`).toContain(name);
    const mod = await import(join(LIB, file));
    expect(typeof mod[name], `${file} does not export ${name}`).toBe('function');
  });

  it('every call written with parentheses is in the list above', () => {
    const named = [...review.matchAll(/`(?:await )?([a-zA-Z]+)\(/g)].map((m) => m[1]);
    const unknown = [...new Set(named)].filter((n) => !(n in CALLS));
    expect(unknown).toEqual([]);
  });

  it('runs parent-run.js from the plugin root, not from another copy', () => {
    expect(review).toContain('node "${CLAUDE_PLUGIN_ROOT}/tools/lib/parent-run.js"');
  });

  it('applyRigorOverrides is named with its config first', () => {
    expect(review).toContain('`applyRigorOverrides({}, profile)`');
  });
});

describe('review.md runs its steps in the order the checks need', () => {
  it('opens the pass section, reviews, dispatches, fixes, writes, checks, records, then the Loop Back', () => {
    const order = [
      at("Open this pass's section first."),
      at('### 4.1 Quality'),
      at('### 4.5 Fresh-context reviewers'),
      at('### 4.6 Fix rounds'),
      at('## 5. Write the report and check it'),
      at('Decide the verdict:'),
      at('`checkFixRounds(reportContent, verdict, { phasePasses, cwd: baseDir })`'),
      at("Call `recordPass(baseDir, 'REVIEW', verdict, { fixRounds })`"),
      at('### Loop Back'),
      at('## 8. Finish'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('a PASS-WITH-FIXES with no fix round is refused by the check, and recordPass refuses a PASS with no check', async () => {
    const report = '# Review\n\n## Pass 1 — 2026-10-30, at abc1234\n\n## Verdict\nPASS-WITH-FIXES\n';
    const result = checkFixRounds(report, 'PASS-WITH-FIXES', { phasePasses: [] });
    expect(result.ok).toBe(false);
    expect(flat).toMatch(/If it refuses, its reasons say what is wrong with the report or the verdict: fix that, and never write around the check/);

    await withProject('sig-review-record-', async (base) => {
      await atReview(base);
      await expect(recordPass(base, 'REVIEW', 'PASS')).rejects.toThrow(/needs fixRounds/);
      expect(flat).toMatch(/A PASS or PASS-WITH-FIXES is refused with no `fixRounds`/);
      await recordPass(base, 'REVIEW', 'FAIL'); // "A FAIL needs none."
      expect(flat).toMatch(/A FAIL needs none\./);
    });
  });

  it('review_depth decides first: quality-only runs 4.1 alone, and 4.5 and 4.6 run at every depth', () => {
    expect(flat).toMatch(/at `quality-only` only step 4\.1 of 4\.1–4\.4 runs, whatever the other three say/);
    expect(flat).toMatch(/Steps 4\.5 and 4\.6 run at every depth\./);
  });

  it('names the change under review: the merge-base with the default branch, else the newest commit that changed the plan', () => {
    expect(flat).toMatch(/\*\*The change under review\*\* is `git diff <base>\.\.HEAD`/);
    expect(flat).toMatch(/`git merge-base HEAD origin\/<branch>`, where `<branch>` is `resolveDefaultBranch\(baseDir\)`/);
    // Not the plan's first add: a linear project reuses one plan name every run (fresh read).
    expect(flat).toMatch(/the base is the newest commit that changed the plan, `git log -1 --format=%H -- <plan>`/);
    expect(flat).not.toMatch(/--diff-filter=A/);
    expect(flat).toMatch(/Write the base you used in the report\./);
  });

  it('a cannot-dispatch makes the verdict FAIL', () => {
    expect(flat).toMatch(/write `cannot-dispatch`, with what was tried, in the report: it makes the verdict FAIL/);
  });
});

describe('review.md re-entry and the loop ceiling', () => {
  it('a re-run records the phase again, so the ceiling can only come sooner', async () => {
    const step2 = review.slice(review.indexOf('## 2. Record the phase'), review.indexOf('## 3. ')).replace(/\s+/g, ' ');
    expect(step2).toMatch(/Call it on a re-run too/);
    expect(step2).toMatch(/skip it if `phase` is already `REVIEW` and no REVIEW file is on disk yet/);
    await withProject('sig-review-reentry-', async (base) => {
      await atReview(base);
      const exits = async () =>
        (await readState(base)).completed_phases.filter((e) => e.startsWith('REVIEW ')).length;
      expect(await exits()).toBe(0);
      // A run that stopped before its report: the call refuses, so the file says skip it.
      await expect(transitionPhase(base, 'REVIEW')).rejects.toThrow(/no REVIEW artifact/);
      await writeFile(join(base, '.planning', 'REVIEW.md'), '# r\n');
      await transitionPhase(base, 'REVIEW');
      expect(await exits()).toBe(1);
    });
  });

  it('on a FAIL the count is read first, and the ceiling or an unreadable count stops for a person', () => {
    const loopBack = flat.slice(flat.indexOf('### Loop Back'));
    const count = loopBack.indexOf("`loopStatusFor(await readState(baseDir), 'REVIEW')`");
    expect(count).toBeGreaterThan(-1);
    expect(loopBack).toMatch(/It returns `null`: a list or mark in `STATE\.md` it counts from is damaged\. Say so, do step 8, and stop/);
    expect(loopBack).toMatch(/`atCeiling`: show `formatLoopCeilingHalt\(status\)`\. At `attended`, ask the options below with it; at `checkpointed` and `unattended`, do step 8 and stop: a person decides/);
    expect(count).toBeLessThan(loopBack.indexOf('AskUserQuestion'));
  });

  it('under the ceiling, checkpointed and unattended loop back without asking; an open decision is still asked', () => {
    expect(flat).toMatch(/at `checkpointed` and `unattended`, take A and say so/);
    expect(flat).toMatch(/\| `checkpointed` \| [^|]*A decision the plan leaves open is still asked/);
    expect(flat).toMatch(/\| `attended` \| [^|]*`gates\.confirm_review`/);
  });

  it('a first REVIEW FAIL is under the ceiling, and the next command is /sig:execute, as the file says', async () => {
    await withProject('sig-review-fail-', async (base) => {
      await atReview(base);
      await recordPass(base, 'REVIEW', 'FAIL');
      const state = await readState(base);
      expect(loopStatusFor(state, 'REVIEW').atCeiling).toBe(false);
      // What /sig:drive, /sig:status and /sig:resume read (SIG-373).
      expect(describeNextAction(state.phase, [], null, state).action).toBe('/sig:execute');
    });
    expect(flat).toMatch(/the next command records leaving REVIEW: `\/sig:execute` after a loop back \(then `\/sig:verify`, then `\/sig:review` again\); `\/sig:review` again after a refused `recordPass`, once its cause is fixed; else `\/sig:ship`/);
  });

  it('a FAIL lists its fixes, which /sig:execute builds on a loop back', () => {
    expect(flat).toMatch(/List each Critical and Important issue as a fix to make: `\/sig:execute` builds those/);
    const execute = readFileSync(join(ROOT, 'plugin', 'commands', 'execute.md'), 'utf-8').replace(/\s+/g, ' ');
    expect(execute).toMatch(/the tasks are the fixes in that phase's report \(`'VERIFICATION'` or `'REVIEW'`\)/);
  });

  it('a refused recordPass still commits; the report and STATE are committed together, with no markFresh', () => {
    expect(flat).toMatch(/If it refuses, show why, do step 8, and stop\./);
    expect(flat).toMatch(/Commit the report and every `\.planning\/` file the phase changed, `STATE\.md` with them/);
    expect(flat).not.toMatch(/markFresh/);
  });

  it('commits once and does not re-run the check after that commit (measured on the test project)', () => {
    // A fresh run re-ran checkFixRounds after its commit, found that commit
    // "uncovered", and committed the report again without STATE.md, so STATE read stale.
    expect(flat).toMatch(/`STATE\.md` with them, in one commit\. Do not run `checkFixRounds` again after it/);
  });
});

// A fresh read of the rewrite: nothing said what the loop-back round's head is,
// and two readings of the old text gave a chain the check accepts and one it refuses.
describe('review.md after a loop back: the fixes EXECUTE made are this pass\'s first round', () => {
  const round = (n, base, head, parent) =>
    `### Fix round ${n}\n**Fresh read:** ${base}..${head} — Critical 0, Important 0 — stop: yes\n` +
    `**Parent run:** parent-run ${parent}: 1 of 1 failed on the base\n\n`;

  it('base = the previous pass\'s sha, head = this pass\'s sha; a later round starts there (real git)', () => {
    const flat46 = flat.slice(flat.indexOf('### 4.6 Fix rounds'), flat.indexOf('## 5. Write the report'));
    expect(flat46).toMatch(/the fixes `\/sig:execute` made are this pass's first round, recorded before any other: its base is the head of the last round recorded before it, or the previous pass's `\{sha\}` if there is none; its head is this pass's `\{sha\}`/);
    expect(flat46).toMatch(/Any round made in this pass then starts at this pass's `\{sha\}`/);

    const dir = mkdtempSync(join(tmpdir(), 'sig-review-loopback-'));
    try {
      const g = (...args) => execFileSync('git', args, { cwd: dir, env: gitEnv(dir), encoding: 'utf-8' }).trim();
      g('init', '-q');
      const sha = [];
      // pass 1 at c0; EXECUTE's fix c1; VERIFY's report c2 (pass 2 opens here); an in-phase fix c3.
      for (const n of [0, 1, 2, 3]) {
        writeFileSync(join(dir, 'f.txt'), `${n}\n`);
        g('add', 'f.txt');
        g('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `c${n}`);
        sha.push(g('rev-parse', 'HEAD').slice(0, 8));
      }
      const [p1, fix, p2, inPhase] = sha;
      const head = (pass2) => `# Review\n\n## Pass 1 — 2026-10-01, at ${p1}\n\n## Verdict\nFAIL\n\n## Pass 2 — 2026-10-01, at ${p2}\n\n${pass2}`;
      const opts = { phasePasses: ['REVIEW FAIL (2026-10-01)'], cwd: dir };

      const asWritten = head(round(1, p1, p2, p1) + round(2, p2, inPhase, p2));
      expect(checkFixRounds(asWritten, 'PASS-WITH-FIXES', opts).reasons).toEqual([]);

      // The other reading: round 1 ends at the last fix, round 2 starts at the pass's sha.
      const otherReading = head(round(1, p1, fix, p1) + round(2, p2, inPhase, p2));
      expect(checkFixRounds(otherReading, 'PASS-WITH-FIXES', opts).ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a FAIL with no fix to make stops for a person: EXECUTE would have nothing to build', () => {
    // The attention table agrees: it loops back on its own only on a FAIL that lists fixes.
    expect(flat).toMatch(/\| `checkpointed` \| [^|]*On a FAIL under the loop ceiling that lists fixes, take A and say so/);
    expect(flat).toMatch(/The FAIL lists no fix to make \(a `cannot-dispatch`, or work that needs re-planning\): at `attended`, ask the options below; at `checkpointed` and `unattended`, do step 8 and stop: a person decides/);
  });

  it('a pass heading with no verdict recorded is one `phase_passes` does not count, and commits are shas', () => {
    // Only this run's sections: a linear SHIP clears phase_passes and appends "## Run ended",
    // and checkFixRounds reads only what follows that line (second fresh read).
    expect(flat).toMatch(/Count only the `## Pass` sections after the report's last `## Run ended` line\. If there are more of them than `phase_passes` has REVIEW entries/);
    expect(flat).toMatch(/A section whose `\{sha\}` comes before this run's base \(step 3\) is an earlier run's whose `## Run ended` line is missing: call `markRunEnded`/);
    expect(flat).toMatch(/Write every commit in the report as its sha \(7 to 40 lowercase hex characters\), never `HEAD` or a tag/);
    // Step 5 fills in the section under step 4's heading; it does not write the heading again.
    const step5 = review.slice(review.indexOf('## 5. Write the report'), review.indexOf('## 6. Record the pass'));
    expect(step5).not.toMatch(/^## Pass /m);
  });
});

