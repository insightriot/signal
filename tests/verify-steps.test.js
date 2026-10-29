// verify.md as numbered steps (course correction Step 1, 2026-10-29).
//
// The command is followed by an agent reading it, so a call it names that no
// module exports, or a step that runs a check on a file not yet written, is a
// defect in the product. These checks read the command file against the code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initState, readState, transitionPhase, recordPass } from '../plugin/tools/lib/state.js';
import { loopStatusFor } from '../plugin/tools/lib/loop-ceiling.js';
import { diffRequirementCoverage } from '../plugin/tools/lib/requirement-coverage.js';

const ROOT = join(import.meta.dirname, '..');
const LIB = join(ROOT, 'plugin', 'tools', 'lib');
const verify = readFileSync(join(ROOT, 'plugin', 'commands', 'verify.md'), 'utf-8');
const flat = verify.replace(/\s+/g, ' ');

const at = (s) => {
  const i = flat.indexOf(s);
  expect(i, `missing: ${s}`).toBeGreaterThan(-1);
  return i;
};

describe('verify.md names only calls that exist', () => {
  const CALLS = {
    readEffectiveProfile: 'profile.js',
    applyRigorOverrides: 'profile.js',
    resolveArtifactPath: 'resume.js',
    artifactName: 'resume.js',
    transitionPhase: 'state.js',
    readState: 'state.js',
    recordPass: 'state.js',
    markFresh: 'state.js',
    diffRequirementCoverage: 'requirement-coverage.js',
    checkValidationConsistency: 'validation-consistency.js',
    validateVerificationContent: 'verification-template.js',
    loopStatusFor: 'loop-ceiling.js',
    formatLoopCeilingHalt: 'loop-ceiling.js',
  };

  it.each(Object.entries(CALLS))('%s is exported by tools/lib/%s', async (name, file) => {
    expect(verify, `verify.md no longer names ${name}`).toContain(name);
    const mod = await import(join(LIB, file));
    expect(typeof mod[name], `${file} does not export ${name}`).toBe('function');
  });

  it('every call written with parentheses is in the list above', () => {
    const named = [...verify.matchAll(/`(?:await )?([a-zA-Z]+)\(/g)].map((m) => m[1]);
    const unknown = [...new Set(named)].filter((n) => !(n in CALLS));
    expect(unknown).toEqual([]);
  });

  it('says plainly that it dispatches no verifier agent', () => {
    expect(flat).toMatch(/this command dispatches no verifier agent/);
    expect(verify).not.toMatch(/subagent_type/);
  });

  it('applyRigorOverrides is named with its config first', () => {
    expect(verify).toContain('`applyRigorOverrides({}, profile)`');
  });
});

describe('verify.md runs the coverage check on the report, not before it', () => {
  // The old file ran diffRequirementCoverage in step 1b and wrote the report in
  // step 5, but the check reads the report: on a first pass it had nothing to read.
  it('drafts the report, then diffs it, then validates it, then records the verdict', () => {
    const draft = at('Draft the report from `references/verification-template.md`');
    const diff = at('Run `diffRequirementCoverage({ requirementsText, verificationText })`');
    expect(at("write it to `artifactName('VERIFICATION', { currentEpic, planningDir })`")).toBeLessThan(
      at('run `validateVerificationContent(content, profile.tier)`'),
    );
    const validate = at('run `validateVerificationContent(content, profile.tier)`');
    const record = at("call `recordPass(baseDir, 'VERIFY', verdict)` (`tools/lib/state.js`) once");
    expect(draft).toBeLessThan(diff);
    expect(diff).toBeLessThan(validate);
    expect(validate).toBeLessThan(record);
  });

  it('the draft is fresh each pass and cites only the requirements verified, because the check counts every id named', () => {
    expect(flat).toMatch(/fresh on every pass \(not edited from an earlier one\)/);
    expect(flat).toMatch(/Cite by id \(`AC1\.2`, `FR3`\) only the requirements you verified/);
    expect(flat).toMatch(/on the requirements and that draft, once,/);
    // Review round 2: a report that names a missing id (as a limit, or a
    // previous pass's "missing" line) reads as covering it.
    const reqs = '## Requirements\n- AC1.1 a\n- AC1.2 b\n';
    const named = diffRequirementCoverage({ requirementsText: reqs, verificationText: 'AC1.1 passes.\nMissing: AC1.2.\n' });
    expect(named.missing).toEqual([]);
    const requirementsText = '## Requirements\n- AC1.1 times refresh\n- AC1.2 no flicker\n';
    // A report written in prose alone: the check cannot scope a denominator.
    const prose = diffRequirementCoverage({ requirementsText, verificationText: '## Verdict\nAll criteria pass.\n' });
    expect(prose.outcome).toBe('cannot-evaluate');
    // The same report citing one id: the other is named as missing.
    const cited = diffRequirementCoverage({ requirementsText, verificationText: '## Requirement coverage\nAC1.1 passes.\n' });
    expect(cited.missing).toEqual(['AC1.2']);
  });

  it('a missing requirement is a FAIL; the test-map check is reported too', () => {
    expect(flat).toMatch(/Any `missing` makes the verdict FAIL/);
    expect(flat).toMatch(/`assignedNotMapped` and `mappedNotAssigned`, as test-map gaps/);
  });

  it('the verdict is decided before the report is validated, since an empty Verdict heading fails it', () => {
    expect(at('Decide the verdict:')).toBeLessThan(at('run `validateVerificationContent(content, profile.tier)`'));
  });

  it('says the names artifactName returns are inside planningDir', () => {
    // Written at the project root, the report is invisible to transitionPhase's
    // check when /sig:execute or /sig:review leaves VERIFY (review round 1).
    expect(flat).toMatch(/`artifactName` returns a path inside `planningDir`/);
  });

  it('at strict, the failed-first proof is the parent-run line /sig:execute records', () => {
    expect(flat).toMatch(/At `strict`, each new test also needs proof it failed before its code: the parent-run line the progress file records/);
    // The name /sig:execute writes. The lookup's older names can be another unit's file (review round 2).
    expect(flat).toContain("`artifactName('PROGRESS', { currentEpic, planningDir })`, where it exists (`strict` requires it)");
    expect(verify).not.toContain("'PROGRESS', { currentEpic, phase:");
  });

  it('a missing plan stops the run in step 1, before the phase is recorded', () => {
    const noPlan = verify.indexOf('finds no plan: stop and say to run `/sig:plan`');
    expect(noPlan).toBeGreaterThan(-1);
    expect(noPlan).toBeLessThan(verify.indexOf('## 2. Record the phase'));
  });
});

describe('verify.md re-entry and the loop ceiling', () => {
  it('a re-run records the phase again, unlike execute.md, so the ceiling can only come sooner', async () => {
    const step2 = verify.slice(verify.indexOf('## 2. Record the phase'), verify.indexOf('## 3. ')).replace(/\s+/g, ' ');
    expect(step2).not.toMatch(/Skip this step/);
    expect(step2).toMatch(/Call it on a re-run too/);
    expect(step2).toMatch(/skip it if `phase` is already `VERIFY` and no report exists yet \(step 8 writes it\)/);
    const base = await mkdtemp(join(tmpdir(), 'sig-verify-reentry-'));
    try {
      await initState(base, 'DISCUSS');
      await writeFile(join(base, '.planning', 'REQUIREMENTS.md'), '# r\n');
      await transitionPhase(base, 'PLAN');
      await writeFile(join(base, '.planning', 'PLAN.md'), '# p\n');
      await transitionPhase(base, 'EXECUTE');
      await transitionPhase(base, 'VERIFY');
      const exits = async () =>
        (await readState(base)).completed_phases.filter((e) => e.startsWith('VERIFY ')).length;
      expect(await exits()).toBe(0);
      // The exception: a run that stopped before its report. The call refuses,
      // which would leave a re-run with no way forward.
      await expect(transitionPhase(base, 'VERIFY')).rejects.toThrow(/no VERIFICATION artifact/);
      await writeFile(join(base, '.planning', 'VERIFICATION.md'), '# v\n');
      await transitionPhase(base, 'VERIFY'); // the re-run, once a report exists
      expect(await exits()).toBe(1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('on a FAIL the count is read first, and the ceiling or an unreadable count stops for a person', () => {
    const loopBack = flat.slice(flat.indexOf('### Loop Back'));
    const count = loopBack.indexOf("`loopStatusFor(await readState(baseDir), 'VERIFY')`");
    expect(count).toBeGreaterThan(-1);
    expect(loopBack).toMatch(/It returns `null`: a list or mark in `STATE\.md` it counts from is damaged\. Say so, do step 10, and stop/);
    // Review round 1: at attended the person is there, so the ceiling asks rather than stopping bare.
    expect(loopBack).toMatch(/`atCeiling`: show `formatLoopCeilingHalt\(status\)`\. At `attended`, ask the options below with it; at `checkpointed` and `unattended`, do step 10 and stop: a person decides/);
    expect(count).toBeLessThan(loopBack.indexOf('AskUserQuestion'));
  });

  it('after taking A the next command is /sig:execute, because /sig:drive picks REVIEW from the phase alone (SIG-373)', () => {
    expect(flat).toMatch(/This command ends after step 10, and the next command is `\/sig:execute`, not `\/sig:review`/);
  });

  it('a refused recordPass still commits, and C goes on as a pass does', () => {
    expect(flat).toMatch(/before the Loop Back; if it refuses, show why, do step 10, and stop/);
    expect(flat).toMatch(/list the failed criteria as limits in the report; then go on as on a pass/);
  });

  it('under the ceiling, checkpointed and unattended loop back without asking; an open decision is still asked', () => {
    expect(flat).toMatch(/at `checkpointed` and `unattended`, take A and say so/);
    expect(flat).toMatch(/\| `checkpointed` \| [^|]*A decision the plan leaves open is still asked/);
  });

  it('a first FAIL is under the ceiling, so an unattended run loops back once on its own', async () => {
    const base = await mkdtemp(join(tmpdir(), 'sig-verify-fail-'));
    try {
      await initState(base, 'DISCUSS');
      await writeFile(join(base, '.planning', 'REQUIREMENTS.md'), '# r\n');
      await transitionPhase(base, 'PLAN');
      await writeFile(join(base, '.planning', 'PLAN.md'), '# p\n');
      await transitionPhase(base, 'EXECUTE');
      await transitionPhase(base, 'VERIFY');
      await recordPass(base, 'VERIFY', 'FAIL');
      const status = loopStatusFor(await readState(base), 'VERIFY');
      expect(status.atCeiling).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('a FAIL lists its fixes, which /sig:execute builds on a loop back', () => {
    expect(flat).toMatch(/List each failure as a fix to make: on a loop back, `\/sig:execute` builds those/);
    const execute = readFileSync(join(ROOT, 'plugin', 'commands', 'execute.md'), 'utf-8').replace(/\s+/g, ' ');
    expect(execute).toMatch(/the tasks are the fixes in that phase's report \(`'VERIFICATION'`/);
  });

  it('sets no next phase itself; the report and STATE are committed before markFresh', () => {
    expect(flat).toMatch(/This command sets no next phase/);
    expect(at('Commit the report and every `.planning/` file')).toBeLessThan(at('after the commit call `markFresh('));
  });
});
