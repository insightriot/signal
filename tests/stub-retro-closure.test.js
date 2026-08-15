// M5.E18 S5 — a stub retro is not closure, and the guard reaches linear
// projects. See .planning/M5.E18-PLAN.md § S5.
//
// ONE defect, five decision sites. `isStubRetro` is computed in exactly one
// place (`retro-index.js`) and, before this slice, consumed in exactly one
// place: rendering "*stub*" vs "*complete*" into INDEX.md. Every caller that
// used a retrospective to make a DECISION threw the flag away, so a
// `[FILL IN]` placeholder read as a finished unit at all five.
//
// The plan named two of the five (t1, t2). The other three came out of t4's
// sibling sweep, which is why AC5.5 requires the sweep result be written down
// whether or not it finds anything — see M5.E18-PROGRESS.md § "Wave 3".
//
// The five, and what each did on a stub before this slice:
//   1. archive-tree.js   senseArchiveTree    — archived a live Epic
//   2. retrospective.js  isEpicDone          — reported the Epic done
//   3. retrospective.js  detectDirtyExecute  — silenced "you haven't written
//                                              the retro" (the most on-the-nose
//                                              instance: writing the stub is
//                                              what turned the reminder off)
//   4. migrate-memory.js senseVector3        — evicted live narrative to archive
//   5. state-drift.js    checkEpicWithoutRetro — suppressed a TRUE finding, in
//                                              the detector M5.E16 shipped to
//                                              catch exactly this shape

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

import { isStubRetro, retroStatusFromContent, RETRO_STATUS } from '../plugin/tools/lib/retro-index.js';
import { isEpicDone, detectDirtyExecute } from '../plugin/tools/lib/retrospective.js';
import { senseArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { checkEpicWithoutRetro } from '../plugin/tools/lib/state-drift.js';
import { senseVector3 } from '../plugin/tools/lib/migrate-memory.js';

// A retro body that `isStubRetro` calls a stub, and one it calls complete.
const STUB = '# M9.E1 — Retrospective\n\n## What went well\n\n[FILL IN]\n';
const COMPLETE = '# M9.E1 — Retrospective\n\n## What went well\n\nThe wave shipped green.\n';

async function planning(baseDir, files) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(baseDir, '.planning', name), content, 'utf-8');
  }
}

const STATE_FM = (epic, phase = 'EXECUTE') =>
  `---\nschema_version: 1\nphase: ${phase}\ncurrent_epic: ${epic === null ? 'null' : epic}\n` +
  `current_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n` +
  `last_completed_task: null\n---\n# Project State\n`;

// ---------------------------------------------------------------------------
// The shared vocabulary. One place answers "is this retro finished", so the
// five sites below cannot drift apart again.
// ---------------------------------------------------------------------------

describe('S5 — retroStatusFromContent: the value the five sites were throwing away', () => {
  it('distinguishes absent / stub / complete — three answers, not a boolean', () => {
    expect(retroStatusFromContent('')).toBe(RETRO_STATUS.ABSENT);
    expect(retroStatusFromContent(null)).toBe(RETRO_STATUS.ABSENT);
    expect(retroStatusFromContent(STUB)).toBe(RETRO_STATUS.STUB);
    expect(retroStatusFromContent(COMPLETE)).toBe(RETRO_STATUS.COMPLETE);
  });

  it('agrees with isStubRetro, which stays the single definition of "stub"', () => {
    // The new function must not become a SECOND definition of stub-ness —
    // that is the defect class this Epic keeps finding, one layer up.
    expect(isStubRetro(STUB)).toBe(true);
    expect(retroStatusFromContent(STUB)).toBe(RETRO_STATUS.STUB);
    expect(isStubRetro(COMPLETE)).toBe(false);
    expect(retroStatusFromContent(COMPLETE)).toBe(RETRO_STATUS.COMPLETE);
  });
});

// ---------------------------------------------------------------------------
// Site 2 + B72 — isEpicDone. Three answers, and the third is the bug.
// ---------------------------------------------------------------------------

describe('S5.t2/t3 — isEpicDone separates "no" from "cannot tell" (AC5.3, AC5.4, B72)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s5-done-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('a COMPLETE retro reports done', async () => {
    await planning(baseDir, { 'M9.E1-RETROSPECTIVE.md': COMPLETE });
    expect(isEpicDone(baseDir, 'M9.E1').status).toBe('done');
  });

  it('a STUB retro does NOT report the Epic done (AC5.3)', async () => {
    await planning(baseDir, { 'M9.E1-RETROSPECTIVE.md': STUB });
    const r = isEpicDone(baseDir, 'M9.E1');
    expect(r.status).toBe('not-done');
    // The reason has to name the stub, or the caller cannot tell this apart
    // from "no retro at all" — and those want different next actions.
    expect(r.reason.toLowerCase()).toContain('stub');
  });

  it('an absent retro reports not-done', async () => {
    await planning(baseDir, {});
    expect(isEpicDone(baseDir, 'M9.E1').status).toBe('not-done');
  });

  it('B72 (AC5.4) — a NON-STRICT unit id is "cannot-evaluate", never the proceed answer', async () => {
    // The bug: a non-strict id returned `false`, which the caller reads as
    // "not done, proceed". That is why the done-Epic guard never fired on the
    // 8-of-12 real projects that are not in Epic mode.
    await planning(baseDir, { 'PHASE12-RETROSPECTIVE.md': COMPLETE });
    const r = isEpicDone(baseDir, 'PHASE12');
    expect(r.status).toBe('cannot-evaluate');
    expect(r.status).not.toBe('not-done');
    expect(r.reason).toBeTruthy();
  });

  it('"cannot-evaluate" is DISTINGUISHABLE from a genuine not-done — the whole of B72', async () => {
    // Before the fix both answers were `false`. If these two ever collapse to
    // the same value again, the guard silently stops firing again.
    await planning(baseDir, {});
    const genuine = isEpicDone(baseDir, 'M9.E1'); // strict id, no retro
    const cannot = isEpicDone(baseDir, 'PHASE12'); // non-strict id
    expect(genuine.status).not.toBe(cannot.status);
  });
});

// ---------------------------------------------------------------------------
// Site 1 — senseArchiveTree. AC5.2 runs against Signal's OWN tree.
// ---------------------------------------------------------------------------

describe('S5.t1 — a stub retro does not archive its Epic (AC5.1, AC5.2)', () => {
  it('AC5.2 — Signal\'s own four stub Epics are NOT proposed for archive', async () => {
    // Measured, not assumed: enumerateRetros over this repo reports exactly
    // M4.5.E1, M4.5.E3, M4.5.E6, M4.5.E7 as stubs (23 retros, 4 stubs).
    const { closedEpicIds } = await senseArchiveTree(ROOT);
    for (const stubEpic of ['M4.5.E1', 'M4.5.E3', 'M4.5.E6', 'M4.5.E7']) {
      expect(closedEpicIds, `${stubEpic} is a STUB retro and must not read as closed`).not.toContain(
        stubEpic
      );
    }
  });

  it('a completed Epic in the same tree still IS proposed — the fix is not a blanket off-switch', async () => {
    // Guards the obvious over-correction: filtering stubs must not filter
    // everything. M5.E13's retro is complete.
    const { closedEpicIds } = await senseArchiveTree(ROOT);
    expect(closedEpicIds).toContain('M5.E13');
  });

  it('AC5.1 — a stub yields no closed-Epic id in an isolated tree', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s5-arch-'));
    try {
      await planning(baseDir, {
        'STATE.md': STATE_FM('M9.E2'),
        'M9.E1-RETROSPECTIVE.md': STUB,
        'M9.E1-PLAN.md': '# plan\n',
      });
      const { closedEpicIds } = await senseArchiveTree(baseDir);
      expect(closedEpicIds).not.toContain('M9.E1');
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Site 3 — detectDirtyExecute. Found by the sweep, not by the plan.
// ---------------------------------------------------------------------------

describe('S5.t4 sweep site 3 — a stub does not silence the write-the-retro reminder', () => {
  let baseDir;
  // `isEpicCloseShip` requires a status row saying "shipped" with nothing
  // pending. An earlier fixture omitted the word, so BOTH tests below returned
  // null before ever reaching the retro read — the "complete retro silences it"
  // case passed vacuously. The absent-retro test at the end of this block
  // exists to prove the gate is actually cleared.
  const MILESTONE = '# Milestone 9\n\n| Epic | Status |\n|---|---|\n| **E1** | shipped |\n';

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s5-dirty-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('a STUB retro still warns — writing the placeholder is not writing the retro', async () => {
    await planning(baseDir, { 'M9.E1-RETROSPECTIVE.md': STUB });
    const banner = detectDirtyExecute({
      state: { current_epic: 'M9.E1', phase: 'EXECUTE' },
      milestoneContent: MILESTONE,
      baseDir,
    });
    // This is the sharpest instance of the class: the banner exists to say
    // "write the retro", and a [FILL IN] placeholder turned it off.
    expect(banner, 'a stub retro silenced the reminder').toBeTruthy();
  });

  it('a COMPLETE retro still silences it — no false alarm', async () => {
    await planning(baseDir, { 'M9.E1-RETROSPECTIVE.md': COMPLETE });
    const banner = detectDirtyExecute({
      state: { current_epic: 'M9.E1', phase: 'EXECUTE' },
      milestoneContent: MILESTONE,
      baseDir,
    });
    expect(banner).toBeNull();
  });

  it('NON-VACUITY — with no retro at all the banner fires, proving the fixture clears the gate', async () => {
    // Without this, the test above passes whenever the fixture fails
    // `isEpicCloseShip` — which is exactly what happened on the first draft.
    await planning(baseDir, {});
    const banner = detectDirtyExecute({
      state: { current_epic: 'M9.E1', phase: 'EXECUTE' },
      milestoneContent: MILESTONE,
      baseDir,
    });
    expect(banner, 'the fixture never reaches the retro check').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Site 5 — checkEpicWithoutRetro. The detector M5.E16 shipped.
// ---------------------------------------------------------------------------

describe('S5.t4 sweep site 5 — a stub does not suppress a true drift finding', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s5-drift-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('a unit whose only retro is a STUB is still reported', async () => {
    await planning(baseDir, {
      'STATE.md': STATE_FM('M9.E2'),
      'M9.E1-PLAN.md': '# plan\n',
      'M9.E1-VERIFICATION.md': '# verification\n',
      'M9.E1-RETROSPECTIVE.md': STUB,
      // A second, COMPLETE retro so the check stays applicable (the project
      // demonstrably uses retrospectives).
      'M9.E0-RETROSPECTIVE.md': COMPLETE,
      'M9.E0-PLAN.md': '# plan\n',
    });
    const res = await checkEpicWithoutRetro.run({
      baseDir,
      planningDir: join(baseDir, '.planning'),
      state: { current_epic: 'M9.E2' },
      files: (await readdir(join(baseDir, '.planning'))).sort(),
      stateBody: '',
    });
    const hit = res.find((f) => f.file.includes('M9.E1'));
    expect(hit, 'M9.E1 has a stub retro only — that is not a retrospective').toBeTruthy();
    expect(hit.message.toLowerCase()).toContain('stub');
  });

  it('a unit with a COMPLETE retro is not reported — the check does not cry wolf', async () => {
    await planning(baseDir, {
      'STATE.md': STATE_FM('M9.E2'),
      'M9.E1-PLAN.md': '# plan\n',
      'M9.E1-RETROSPECTIVE.md': COMPLETE,
    });
    const res = await checkEpicWithoutRetro.run({
      baseDir,
      planningDir: join(baseDir, '.planning'),
      state: { current_epic: 'M9.E2' },
      files: (await readdir(join(baseDir, '.planning'))).sort(),
      stateBody: '',
    });
    expect(res.find((f) => f.file.includes('M9.E1'))).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// The caller. `isEpicDone`'s only consumer is prose an agent executes, so the
// polarity change has to be pinned in the document too — AC5.4 asserts the
// halt, AC5.6 asserts the escape hatch, and they are the SAME instruction read
// two ways. A guard that becomes unconditional and makes a documented mode
// unusable is `B42`, which M5.E13's REVIEW shipped once already.
// ---------------------------------------------------------------------------

describe('S5.t3 — discuss.md reads three answers, not a boolean (AC5.4, AC5.6)', () => {
  const guard = () => {
    const text = readFileSync(join(ROOT, 'plugin', 'commands', 'discuss.md'), 'utf-8');
    return text.match(/\*\*Done-Epic guard\.\*\*[\s\S]*?\n\n/)?.[0] ?? '';
  };

  it('the guard paragraph is present and substantial (non-vacuity for the rest)', () => {
    expect(guard().length).toBeGreaterThan(200);
  });

  it('it no longer describes the signal as "the retro file exists"', () => {
    // The old wording WAS the bug: existence, not completeness.
    expect(guard()).not.toMatch(/RETROSPECTIVE\.md` exists/);
  });

  it('AC5.4 — it halts on cannot-evaluate, not only on done', () => {
    const t = guard().toLowerCase();
    expect(t, 'the three-value contract is not named').toContain('cannot-evaluate');
    // The load-bearing sentence: an un-evaluable unit must not read as
    // permission to proceed. That collapse is B72.
    expect(t).toMatch(/not (permission|a licence|a license) to proceed|never .* proceed/);
  });

  it('AC5.6 — `--epic` stays the escape hatch, so linear projects are not locked out', () => {
    expect(guard()).toContain('--epic');
  });

  it('it names the stub case, so a placeholder retro cannot read as closed', () => {
    expect(guard().toLowerCase()).toContain('stub');
  });
});

// ---------------------------------------------------------------------------
// Site 4 — senseVector3. Found by the sweep, not by the plan.
// ---------------------------------------------------------------------------

describe('S5.t4 sweep site 4 — a stub is not the closed-signal that evicts live narrative', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s5-v3-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('a STUB retro does not make its Epic a vector-3 eviction candidate', async () => {
    const stateText =
      STATE_FM('M9.E2') + '\n## M9.E1 — the epic\n\nLive narrative that must not be evicted.\n';
    await planning(baseDir, {
      'STATE.md': stateText,
      'M9.E1-RETROSPECTIVE.md': STUB,
    });
    const plan = await senseVector3(baseDir, stateText);
    // Evicting against a [FILL IN] card replaces live narrative with a pointer
    // to a card that says nothing. `evict.js` is guarded by verifyCardCoverage;
    // this path was not.
    expect(
      JSON.stringify(plan.evicts ?? []),
      'a stub card produced an eviction candidate'
    ).not.toContain('M9.E1');
  });

  it('a COMPLETE retro still is one — the eviction path is not disabled', async () => {
    const stateText =
      STATE_FM('M9.E2') + '\n## M9.E1 — the epic\n\nLive narrative ready to evict.\n';
    await planning(baseDir, {
      'STATE.md': stateText,
      'M9.E1-RETROSPECTIVE.md': COMPLETE,
    });
    const plan = await senseVector3(baseDir, stateText);
    expect(JSON.stringify(plan.evicts ?? [])).toContain('M9.E1');
  });
});
