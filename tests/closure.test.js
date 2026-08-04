// M5.E18 S4 — closure has three outcomes (FR2). See .planning/M5.E18-PLAN.md § S4.
//
// The third status is the slice. A two-way closed/not-closed answer forces
// every ambiguity into one of two buckets, and S3 measured how much ambiguity
// is really there: 30 terminal artifacts across the corpus, 9 of them (30%)
// carrying no verdict this code will read.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveUnitClosure, resolveClosures, CLOSURE } from '../tools/lib/closure.js';

const STATE_FM = (epic) =>
  `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: ${epic === null ? 'null' : epic}\n` +
  `current_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n` +
  `last_completed_task: null\n---\n# Project State\n`;

const PASS = '# Verification\n\n**Verdict:** ✅ **PASS**\n';
const FAIL = '# Verification\n\n**Verdict:** **FAIL** — three criteria unmet\n';
// The traction-engine/PHASE8-SHIP.md shape: a terminal artifact with no verdict.
const NO_VERDICT = '# Ship\n\nRelease cut and pushed.\n';
// The agent-builder shape AC2.6 settled: a lowercase `pass` inside prose, which
// a body scan cannot tell from "Only 3 of 22 criteria pass."
const PROSE_ONLY = '## Verdict\n\n**All 22 acceptance criteria pass.**\n';

let baseDir;
beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s4-'));
  await mkdir(join(baseDir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

async function planning(files) {
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(baseDir, '.planning', name), content, 'utf-8');
  }
}
const planningDir = () => join(baseDir, '.planning');

// ---------------------------------------------------------------------------
// AC2.1 — three statuses in the RETURNED STRUCTURE, not at render time
// ---------------------------------------------------------------------------

describe('S4 AC2.1 — cannotDetermine is a value, not a rendering decision', () => {
  it('a caller counts three statuses without re-reading a file', async () => {
    await planning({
      'STATE.md': STATE_FM('M9.E9'),
      'M9.E1-VERIFICATION.md': PASS, // closed
      'M9.E2-VERIFICATION.md': FAIL, // open
      'M9.E3-SHIP.md': NO_VERDICT, // cannotDetermine
    });
    const { counts, units } = await resolveClosures(baseDir);
    expect(counts).toEqual({ closed: 1, open: 1, cannotDetermine: 1 });
    // The status is on the record itself — no second pass over the files.
    expect(units.every((u) => typeof u.status === 'string' && u.reason)).toBe(true);
    expect(new Set(units.map((u) => u.status))).toEqual(
      new Set([CLOSURE.CLOSED, CLOSURE.OPEN, CLOSURE.CANNOT_DETERMINE])
    );
  });
});

// ---------------------------------------------------------------------------
// AC2.2′ — absent or unreadable verdict → cannotDetermine, NEVER closed/open
// ---------------------------------------------------------------------------

describe("S4 AC2.2′ — an unreadable verdict is never closed and never open", () => {
  it('a SHIP artifact with no verdict at all (traction-engine/PHASE8-SHIP.md shape)', async () => {
    await planning({ 'STATE.md': STATE_FM(null), 'PHASE8-SHIP.md': NO_VERDICT });
    const r = await resolveUnitClosure({
      unit: 'PHASE8',
      files: ['PHASE8-SHIP.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.CANNOT_DETERMINE);
    expect(r.status).not.toBe(CLOSURE.CLOSED);
    expect(r.status).not.toBe(CLOSURE.OPEN);
  });

  it('a heading that defers its value to prose (consensus/T25-VERIFICATION.md shape)', async () => {
    await planning({ 'STATE.md': STATE_FM(null), 'T25-VERIFICATION.md': PROSE_ONLY });
    const r = await resolveUnitClosure({
      unit: 'T25',
      files: ['T25-VERIFICATION.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    // Reading the body would produce a CONFIDENT WRONG ANSWER — the same
    // sentence shape carries "Only 3 of 22 criteria pass."
    expect(r.status).toBe(CLOSURE.CANNOT_DETERMINE);
  });

  it('the reason names the artifacts it looked at, so "could not tell" is auditable', async () => {
    await planning({ 'STATE.md': STATE_FM(null), 'PHASE8-SHIP.md': NO_VERDICT });
    const r = await resolveUnitClosure({
      unit: 'PHASE8',
      files: ['PHASE8-SHIP.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.reason).toContain('PHASE8-SHIP.md');
  });
});

// ---------------------------------------------------------------------------
// AC2.4 — the not-current clause, carried by the regression guard
// ---------------------------------------------------------------------------

describe('S4 AC2.4 — the current unit is open even with a passing VERIFICATION', () => {
  it("agent-tools-sync's M1 shape: VERIFICATION present AND current → open", async () => {
    const r = await resolveUnitClosure({
      unit: 'M1',
      files: ['M1-VERIFICATION.md'],
      currentUnitId: 'M1',
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.OPEN);
    expect(r.reason.toLowerCase()).toContain('current');
  });

  it('it is in NO proposed move — resolveClosures reports it open end-to-end', async () => {
    await planning({ 'STATE.md': STATE_FM('M1'), 'M1-VERIFICATION.md': PASS });
    const { units, counts } = await resolveClosures(baseDir);
    expect(units.find((u) => u.unit === 'M1').status).toBe(CLOSURE.OPEN);
    expect(counts.closed).toBe(0);
  });

  it('the SAME unit closes once it is no longer current — the clause is load-bearing', async () => {
    // Non-vacuity: proves the open verdict above came from the not-current
    // clause and not from something else refusing to close it.
    await planning({ 'STATE.md': STATE_FM('M2'), 'M1-VERIFICATION.md': PASS });
    const { units } = await resolveClosures(baseDir);
    expect(units.find((u) => u.unit === 'M1').status).toBe(CLOSURE.CLOSED);
  });

  it('the raw current_epic is compared, so a NON-STRICT unit name still matches (D-M5E18-4)', async () => {
    // traction-engine / agent-tools-sync both park a non-strict name here. A
    // strict-gated read returns null and this clause silently never fires.
    await planning({ 'STATE.md': STATE_FM('PHASE12'), 'PHASE12-VERIFICATION.md': PASS });
    const { units } = await resolveClosures(baseDir);
    expect(units.find((u) => u.unit === 'PHASE12').status).toBe(CLOSURE.OPEN);
  });
});

// ---------------------------------------------------------------------------
// AC2.5 — a readable FAIL is an answer, and the answer is "open"
// ---------------------------------------------------------------------------

describe('S4 AC2.5 — a readable FAIL is open, not closed', () => {
  it('FAIL → open', async () => {
    await planning({ 'STATE.md': STATE_FM(null), 'M9.E1-VERIFICATION.md': FAIL });
    const r = await resolveUnitClosure({
      unit: 'M9.E1',
      files: ['M9.E1-VERIFICATION.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.OPEN);
    // Not cannotDetermine — a FAIL is a real, read value.
    expect(r.status).not.toBe(CLOSURE.CANNOT_DETERMINE);
    expect(r.evidence).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC2.10 — a folded split pair whose halves disagree
// ---------------------------------------------------------------------------

describe('S4 AC2.10 — conflicting verdicts at the same authority → cannotDetermine', () => {
  it('two VERIFICATIONs on one folded unit, one PASS one FAIL', async () => {
    // S1's fold merges `PLAN-SLICE-SSO-*` into `SLICE-SSO`, so one unit can own
    // two artifacts of equal authority. Picking one would be a guess.
    await planning({
      'STATE.md': STATE_FM(null),
      'SLICE-SSO-VERIFICATION.md': PASS,
      'PLAN-SLICE-SSO-VERIFICATION.md': FAIL,
    });
    const r = await resolveUnitClosure({
      unit: 'SLICE-SSO',
      files: ['SLICE-SSO-VERIFICATION.md', 'PLAN-SLICE-SSO-VERIFICATION.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.CANNOT_DETERMINE);
    expect(r.reason.toLowerCase()).toContain('conflict');
  });

  it('a VERIFICATION outranking a SHIP is RESOLUTION, not conflict (S3 ranking still applies)', async () => {
    // traction-engine's PHASE8 has both, one with a verdict and one without.
    // Different authority levels must not read as a disagreement.
    await planning({
      'STATE.md': STATE_FM(null),
      'PHASE8-VERIFICATION.md': PASS,
      'PHASE8-SHIP.md': NO_VERDICT,
    });
    const r = await resolveUnitClosure({
      unit: 'PHASE8',
      files: ['PHASE8-VERIFICATION.md', 'PHASE8-SHIP.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.CLOSED);
  });

  it('agreeing halves still close — the conflict rule is not a blanket refusal', async () => {
    await planning({
      'STATE.md': STATE_FM(null),
      'SLICE-SSO-VERIFICATION.md': PASS,
      'PLAN-SLICE-SSO-VERIFICATION.md': PASS,
    });
    const r = await resolveUnitClosure({
      unit: 'SLICE-SSO',
      files: ['SLICE-SSO-VERIFICATION.md', 'PLAN-SLICE-SSO-VERIFICATION.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.CLOSED);
  });
});

// ---------------------------------------------------------------------------
// AC2.11 (NFR3) — three failure modes, asserted SEPARATELY. Each must also
// leave the run completing and reporting every other unit.
// ---------------------------------------------------------------------------

describe('S4 AC2.11 — one unit\'s failure never takes the run down', () => {
  it('(a) a THROWING readState — every unit is reported, none is closed', async () => {
    // Live path, not defensive: affiliate-mojo's readState throws on one of the
    // 12 real projects. Without the current unit the not-current clause cannot
    // be evaluated for ANY unit, so nothing may close.
    await planning({
      'STATE.md': '---\nthis: [is not\n  valid: yaml\n---\nbody\n',
      'M9.E1-VERIFICATION.md': PASS,
      'M9.E2-VERIFICATION.md': PASS,
    });
    const res = await resolveClosures(baseDir);
    expect(res.units.length).toBe(2); // the run COMPLETED and reported both
    expect(res.counts.closed).toBe(0);
    expect(res.counts.cannotDetermine).toBe(2);
    expect(res.stateReadable).toBe(false);
    expect(res.reason).toBeTruthy(); // it says WHY it could not look
  });

  it('(b) an UNREADABLE artifact (EACCES) — that unit only; the rest still resolve', async () => {
    await planning({
      'STATE.md': STATE_FM(null),
      'M9.E1-VERIFICATION.md': PASS,
      'M9.E2-VERIFICATION.md': PASS,
    });
    const locked = join(baseDir, '.planning', 'M9.E2-VERIFICATION.md');
    await chmod(locked, 0o000);
    try {
      const res = await resolveClosures(baseDir);
      expect(res.units.length).toBe(2);
      const e1 = res.units.find((u) => u.unit === 'M9.E1');
      const e2 = res.units.find((u) => u.unit === 'M9.E2');
      expect(e2.status).toBe(CLOSURE.CANNOT_DETERMINE); // affected unit
      expect(e1.status).toBe(CLOSURE.CLOSED); // untouched neighbour
    } finally {
      await chmod(locked, 0o644);
    }
  });

  it('(c) MALFORMED frontmatter in STATE.md — reported, not thrown, nothing closed', async () => {
    await planning({
      'STATE.md': '---\nschema_version: not-a-number\ncurrent_epic\n---\n',
      'M9.E1-VERIFICATION.md': PASS,
    });
    const res = await resolveClosures(baseDir);
    expect(res.units.length).toBe(1);
    expect(res.units[0].status).toBe(CLOSURE.CANNOT_DETERMINE);
    expect(res.counts.closed).toBe(0);
  });

  it('"could not look" is distinguishable from "nothing to look at" — found in first use', async () => {
    // Found by running the resolver over all 12 real projects: affiliate-mojo
    // (STATE.md unreadable) returns counts {0,0,0} — BYTE-IDENTICAL to
    // prompt-library, a perfectly readable project that simply has no units.
    // A caller rendering only the counts cannot tell blindness from cleanliness,
    // which is C1's shape in code written by this very slice. The distinction
    // exists on the record (`stateReadable` + `reason`); this pins it so S7's
    // reporting cannot quietly drop it.
    await planning({ 'STATE.md': '---\nnot: [valid\n---\n' }); // unreadable, no units
    const blind = await resolveClosures(baseDir);

    const clean = await mkdtemp(join(tmpdir(), 'signal-e18-s4-clean-'));
    try {
      await mkdir(join(clean, '.planning'), { recursive: true });
      await writeFile(join(clean, '.planning', 'STATE.md'), STATE_FM(null), 'utf-8');
      const ok = await resolveClosures(clean);

      expect(blind.counts).toEqual(ok.counts); // the counts alone CANNOT tell them apart
      expect(blind.stateReadable).toBe(false); // but the record can
      expect(ok.stateReadable).toBe(true);
      expect(blind.reason).toBeTruthy();
      expect(ok.reason).toBeNull();
    } finally {
      await rm(clean, { recursive: true, force: true });
    }
  });

  it('a missing .planning/ returns empty and says why — it does not throw', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'signal-e18-s4-none-'));
    try {
      const res = await resolveClosures(empty);
      expect(res.units).toEqual([]);
      expect(res.reason).toBeTruthy();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The "clearly open" half of FR2's fallback
// ---------------------------------------------------------------------------

describe('S4 — a unit with no terminal artifact is OPEN, not ambiguous', () => {
  it('worked but never verified → open', async () => {
    const r = await resolveUnitClosure({
      unit: 'M9.E1',
      files: ['M9.E1-PLAN.md', 'M9.E1-PROGRESS.md'],
      currentUnitId: null,
      planningDir: planningDir(),
    });
    expect(r.status).toBe(CLOSURE.OPEN);
    expect(r.reason.toLowerCase()).toContain('no terminal artifact');
  });
});
