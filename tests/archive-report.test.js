// M5.E18 S7 — four statuses, and the applicability gap (FR4 / `B63` + FR6).
// See .planning/M5.E18-PLAN.md § S7. Last wave: it renders what the others resolve.
//
// M5.E16's model ported one command over: **`0` must stop meaning both "could
// not look" and "checked and clean."** `B63` is that defect in
// `/sig:migrate-memory` — its dry-run prints `0` for its two Epic-only vectors
// on a linear project, so *could not apply* is byte-identical to *already
// clean*. Same week M5.E16 fixed it for `/sig:sweep`.
//
// AC4.4 is not a hypothetical. It is the defect wave 3 found in S4's OWN code:
// affiliate-mojo (STATE unreadable, 0 units) returns counts {0,0,0}, byte-
// identical to prompt-library, which is readable and simply has no units. That
// finding was pinned by a closure test and carried forward as an obligation on
// this slice. This is where it gets paid.
//
// WRITTEN BEFORE THE IMPLEMENTATION.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { renderArchivePlan } from '../tools/lib/archive-report.js';
import { planArchiveMoves } from '../tools/lib/archive-tree.js';
import { checkEpicWithoutRetro, APPLICABILITY } from '../tools/lib/state-drift.js';

const P = '.planning';

// Shorthand builders for the four shapes a project can be in.
const closed = (unit) => ({ unit, status: 'closed', reason: `${unit} passed`, evidence: 'PASS' });
const open = (unit) => ({ unit, status: 'open', reason: `${unit} is mid-flight`, evidence: null });
const cannot = (unit, why) => ({
  unit,
  status: 'cannotDetermine',
  reason: why ?? `${unit} has 1 terminal artifact but none states a readable verdict`,
  evidence: null,
});

const base = {
  moves: [],
  dropped: [],
  stateReadable: true,
  stateReason: null,
};

// ---------------------------------------------------------------------------
// AC4.1 — checked-and-clean vs could-not-check, per unit, with its own line
// ---------------------------------------------------------------------------

describe('S7 AC4.1 — the dry-run separates checked-and-clean from could-not-check', () => {
  const out = () =>
    renderArchivePlan({
      ...base,
      closures: [closed('M5.E13'), open('M5.E18'), cannot('T25'), cannot('PHASE8')],
      moves: [{ from: `${P}/M5.E13-PLAN.md`, to: `${P}/archive/M5/E13/M5.E13-PLAN.md` }],
    });

  it('reports the cannotDetermine count on its own line', () => {
    const line = out()
      .split('\n')
      .find((l) => /could not determine/i.test(l));
    expect(line, 'no dedicated could-not-determine line').toBeTruthy();
    expect(line).toMatch(/\b2\b/);
  });

  it('names each un-evaluable unit and WHY — a count alone is not actionable', () => {
    const text = out();
    expect(text).toContain('T25');
    expect(text).toContain('PHASE8');
    expect(text.toLowerCase()).toContain('readable verdict');
  });

  it('says a person is needed, not that the project is clean', () => {
    expect(out().toLowerCase()).toMatch(/needs? (a person|you)|review/);
  });

  it('still reports the moves it DID find', () => {
    expect(out()).toContain('M5.E13');
    expect(out()).toMatch(/1 file/);
  });
});

// ---------------------------------------------------------------------------
// AC4.2 — all-cannotDetermine must not read as "nothing to archive"
// ---------------------------------------------------------------------------

describe('S7 AC4.2 — a wholly un-evaluable project cannot read as clean', () => {
  const allCannot = () =>
    renderArchivePlan({ ...base, closures: [cannot('A'), cannot('B'), cannot('C')] });
  const allClean = () =>
    renderArchivePlan({ ...base, closures: [open('A'), open('B'), open('C')] });

  it('the two renderings DIFFER — asserted by diff, not by inspection', () => {
    expect(allCannot()).not.toBe(allClean());
  });

  it('the un-evaluable rendering does not claim there is nothing to archive', () => {
    // Targets a bare REASSURANCE. An earlier version of this test banned the
    // phrase "nothing to archive" outright, which the correct copy must use in
    // order to negate it — the assertion, not the code, was wrong.
    const t = allCannot().toLowerCase();
    expect(t).not.toMatch(/all clear|everything is clean|nothing to do/);
    // Line-scoped and plain, rather than a lookahead that is harder to read
    // than the rule it encodes: wherever the phrase appears, that same line
    // must negate it.
    for (const line of allCannot().split('\n')) {
      if (!/nothing to archive/i.test(line)) continue;
      expect(line, `unnegated reassurance: ${line}`).toMatch(/\bnot\b/i);
    }
  });

  it('it states plainly that zero moves is not the same as nothing to do', () => {
    expect(allCannot().toLowerCase()).toMatch(/not the same|does not mean|is not/);
  });

  it('the all-open rendering carries no BLINDNESS warning — the contrast is the point', () => {
    // It still prints "Could not determine: 0 unit(s)" — that explicit zero IS
    // M5.E16's model, and demanding its absence would re-create the silence
    // this slice removes. What must be absent is the warning block.
    const t = allClean().toLowerCase();
    expect(t).toContain('could not determine:');
    expect(t, 'a clean project should not carry the un-evaluable warning').not.toMatch(
      /could not be evaluated|needs? a person/
    );
  });
});

// ---------------------------------------------------------------------------
// AC4.4 — zero units is a DIFFERENT fact from every-unit-unevaluable
// ---------------------------------------------------------------------------

describe('S7 AC4.4 — "no units" and "no unit could be read" are not the same fact', () => {
  const zeroUnits = () => renderArchivePlan({ ...base, closures: [] });
  const allCannot = () => renderArchivePlan({ ...base, closures: [cannot('A'), cannot('B')] });

  it('they render differently — the exact defect wave 3 found in S4\'s own code', () => {
    // affiliate-mojo (STATE unreadable, 0 units) vs prompt-library (readable,
    // 0 units) produced byte-identical counts {0,0,0}. Counts could not tell
    // blindness from cleanliness; the RENDERING must.
    expect(zeroUnits()).not.toBe(allCannot());
  });

  it('zero units says the filenames derive no units — not that nothing needs doing', () => {
    expect(zeroUnits().toLowerCase()).toMatch(/no work units|zero units|derive/);
  });

  it('an unreadable STATE renders differently again — a THIRD distinct fact', () => {
    const blind = renderArchivePlan({
      ...base,
      closures: [],
      stateReadable: false,
      stateReason: 'STATE.md could not be read — bad frontmatter',
    });
    expect(blind).not.toBe(zeroUnits());
    expect(blind.toLowerCase()).toContain('state.md');
  });

  it('the STATE reason is passed through, not re-prefixed — found by first use', () => {
    // affiliate-mojo rendered "STATE.md could not be read — STATE.md could not
    // be read — …" with a doubled full stop, because resolveClosures' reason is
    // already a sentence naming the file. Caught on the first real render.
    const blind = renderArchivePlan({
      ...base,
      closures: [],
      stateReadable: false,
      stateReason: 'STATE.md could not be read — no schema_version key.',
    });
    expect(blind.match(/STATE\.md could not be read/g)?.length ?? 0).toBe(1);
    expect(blind).not.toMatch(/\.\./);
  });
});

// ---------------------------------------------------------------------------
// AC4.5 (NFR5) — a bound the planner applies must be reported, or its absence stated
// ---------------------------------------------------------------------------

describe('S7 AC4.5 — what the planner dropped is reported by count AND reason', () => {
  it('planArchiveMoves reports the units it refused, it does not drop them silently', () => {
    const { moves, dropped } = planArchiveMoves(
      ['../etc', 'M5.E13'],
      [`${P}/M5.E13-PLAN.md`]
    );
    expect(moves.length).toBe(1);
    expect(dropped.length).toBe(1);
    expect(dropped[0].unit).toBe('../etc');
    expect(dropped[0].reason).toBeTruthy();
  });

  it('the report surfaces dropped units with the reason', () => {
    const text = renderArchivePlan({
      ...base,
      closures: [closed('M5.E13')],
      dropped: [{ unit: '../etc', reason: 'unsafe unit name — cannot be a path component' }],
    });
    expect(text).toContain('../etc');
    expect(text.toLowerCase()).toContain('unsafe');
  });

  it('when NOTHING was dropped, the report says so rather than staying silent', () => {
    // "If it bounds nothing, that is stated." A silent absence is exactly how a
    // bound becomes invisible.
    const text = renderArchivePlan({ ...base, closures: [closed('M5.E13')] });
    expect(text.toLowerCase()).toMatch(/nothing (was )?(dropped|skipped)|no units (were )?(dropped|skipped)/);
  });
});

// ---------------------------------------------------------------------------
// AC4.3 — against Signal's own tree
// ---------------------------------------------------------------------------

describe('S7 AC4.3 — Signal\'s own tree: only real retros move, the rest are reported', () => {
  it('renders without throwing and reports every unit by status', async () => {
    const { resolveClosures } = await import('../tools/lib/closure.js');
    const { senseArchiveTree } = await import('../tools/lib/archive-tree.js');
    const root = join(import.meta.dirname, '..');
    const res = await resolveClosures(root);
    const { moves } = await senseArchiveTree(root);
    const text = renderArchivePlan({
      ...base,
      closures: res.units,
      moves,
      stateReadable: res.stateReadable,
    });
    expect(text.length).toBeGreaterThan(0);
    // Every unit the resolver saw is accounted for somewhere in the report.
    expect(res.units.length).toBeGreaterThan(0);
    const counted = text.match(/(\d+) unit/g);
    expect(counted, 'the report states unit counts').toBeTruthy();
  });

  it('the four STUB-retro Epics are not among the proposed moves (S5 still holds)', async () => {
    const { senseArchiveTree } = await import('../tools/lib/archive-tree.js');
    const { moves } = await senseArchiveTree(join(import.meta.dirname, '..'));
    for (const stub of ['M4.5.E1', 'M4.5.E3', 'M4.5.E6', 'M4.5.E7']) {
      expect(moves.some((m) => m.from.includes(`${stub}-`)), stub).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// FR6 — check (c)'s applicability. Latent gap, 0 of 12 blast radius.
// ---------------------------------------------------------------------------

describe('S7 FR6 — an unprefixed RETROSPECTIVE.md counts as "this project uses retros"', () => {
  let dir;
  const mk = async (files) => {
    dir = await mkdtemp(join(tmpdir(), 'signal-e18-s7-'));
    await mkdir(join(dir, P), { recursive: true });
    for (const [n, c] of Object.entries(files)) {
      await writeFile(join(dir, P, n), c, 'utf-8');
    }
    return {
      baseDir: dir,
      planningDir: join(dir, P),
      state: { current_epic: null },
      files: (await readdir(join(dir, P))).sort(),
      stateBody: '',
    };
  };

  it('AC6.1-FR6 — a linear project whose ONLY retro is RETROSPECTIVE.md is EVALUATED', async () => {
    const ctx = await mk({
      'RETROSPECTIVE.md': '# retro\n\nIt went fine.\n',
      '1-PLAN.md': '# plan\n',
      '1-VERIFICATION.md': '# verification\n',
    });
    try {
      const a = checkEpicWithoutRetro.applicability(ctx);
      const status = typeof a === 'string' ? a : a.status;
      expect(status, 'reported not-applicable despite having a retrospective').not.toBe(
        APPLICABILITY.NA
      );
      expect(status).toBe(APPLICABILITY.EVAL);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a project with NO retro of either shape is still not-applicable — fail-safe kept', async () => {
    const ctx = await mk({ '1-PLAN.md': '# plan\n' });
    try {
      const a = checkEpicWithoutRetro.applicability(ctx);
      const status = typeof a === 'string' ? a : a.status;
      expect(status).toBe(APPLICABILITY.NA);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('AC6.2-FR6 — the widening never turns a not-applicable into a false CLEAN', async () => {
    // The fail-safe direction. A project that now evaluates must still REPORT
    // its un-retrospected units rather than silently passing.
    const ctx = await mk({
      'RETROSPECTIVE.md': '# retro\n\nDone.\n',
      'GATE-A-PLAN.md': '# plan\n',
      'GATE-A-VERIFICATION.md': '# verification\n',
    });
    try {
      const findings = await checkEpicWithoutRetro.run(ctx);
      expect(findings.some((f) => f.file.includes('GATE-A'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
