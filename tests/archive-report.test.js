// M5.E18 S7 — four statuses, and the applicability gap (FR4 / `B63` + FR6).
// See .planning/M5.E18-PLAN.md § S7. Last wave: it renders what the others resolve.
//
// M5.E16's model ported one command over: **`0` must stop meaning both "could
// not look" and "checked and clean."** `B63` is that defect in
// `/sig:docs-migrate` — its dry-run prints `0` for its two Epic-only vectors
// on a linear project, so *could not apply* is byte-identical to *already
// clean*. Same week M5.E16 fixed it for `/sig:docs-sweep`.
//
// AC4.4 is not a hypothetical. It is the defect wave 3 found in S4's OWN code:
// eval-project-B (STATE unreadable, 0 units) returns counts {0,0,0}, byte-
// identical to eval-project-H, which is readable and simply has no units. That
// finding was pinned by a closure test and carried forward as an obligation on
// this slice. This is where it gets paid.
//
// WRITTEN BEFORE THE IMPLEMENTATION.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  explainArchiveOutcome,
  renderMoveBreakdown,
} from '../plugin/tools/lib/archive-report.js';
import { planArchiveMoves } from '../plugin/tools/lib/archive-tree.js';
import { checkEpicWithoutRetro, APPLICABILITY } from '../plugin/tools/lib/state-drift.js';

const ROOT = join(import.meta.dirname, '..');
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

// AC4.1–AC4.4 were originally verified against a standalone `renderArchivePlan`.
// REVIEW found that renderer carried a SECOND copy of the distinction and had no
// production caller, so it was deleted. The golden ACs now compose the SAME
// functions `/sig:docs-migrate` calls — which is what they should always have
// pinned: the code a user's output actually comes from.
const render = (args = {}) => {
  const moves = args.moves ?? [];
  const closures = args.closures ?? [];
  const parts = ['Archive plan — dry run (nothing has been written)', ''];
  if ((args.stateReadable ?? true) && closures.length > 0) {
    parts.push(
      moves.length > 0 ? `  ${moves.length} file(s) to archive:` : '  0 file(s) to archive.',
      ...renderMoveBreakdown(moves),
      '',
      `  Closed (ready to archive):  ${closures.filter((c) => c.status === 'closed').length} unit(s)`,
      `  Open (still in flight):     ${closures.filter((c) => c.status === 'open').length} unit(s)`,
      `  Could not determine:        ${closures.filter((c) => c.status === 'cannotDetermine').length} unit(s)`,
      ''
    );
  }
  const explained = explainArchiveOutcome({
    closures,
    dropped: args.dropped ?? [],
    moveCount: moves.length,
    stateReadable: args.stateReadable ?? true,
    stateReason: args.stateReason ?? null,
    indent: '  ',
  });
  if (explained.length > 0) parts.push(...explained, '');
  return parts.join('\n') + '\n';
};

// ---------------------------------------------------------------------------
// AC4.1 — checked-and-clean vs could-not-check, per unit, with its own line
// ---------------------------------------------------------------------------

describe('S7 AC4.1 — the dry-run separates checked-and-clean from could-not-check', () => {
  const out = () =>
    render({
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

  it('still reports the moves it DID find, by destination', () => {
    // Asserts the DESTINATION, not the unit name. The breakdown deliberately
    // stopped inferring unit names from filenames after that inference produced
    // two mislabelling bugs; for an Epic the destination splits the id across
    // directories (`archive/M5/E13/`), which is precise where a guess was not.
    expect(out()).toContain('.planning/archive/M5/E13/');
    expect(out()).toMatch(/1 file/);
  });
});

// ---------------------------------------------------------------------------
// AC4.2 — all-cannotDetermine must not read as "nothing to archive"
// ---------------------------------------------------------------------------

describe('S7 AC4.2 — a wholly un-evaluable project cannot read as clean', () => {
  const allCannot = () =>
    render({ ...base, closures: [cannot('A'), cannot('B'), cannot('C')] });
  const allClean = () =>
    render({ ...base, closures: [open('A'), open('B'), open('C')] });

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
  const zeroUnits = () => render({ ...base, closures: [] });
  const allCannot = () => render({ ...base, closures: [cannot('A'), cannot('B')] });

  it('they render differently — the exact defect wave 3 found in S4\'s own code', () => {
    // eval-project-B (STATE unreadable, 0 units) vs eval-project-H (readable,
    // 0 units) produced byte-identical counts {0,0,0}. Counts could not tell
    // blindness from cleanliness; the RENDERING must.
    expect(zeroUnits()).not.toBe(allCannot());
  });

  it('zero units says the filenames derive no units — not that nothing needs doing', () => {
    expect(zeroUnits().toLowerCase()).toMatch(/no work units|zero units|derive/);
  });

  it('an unreadable STATE renders differently again — a THIRD distinct fact', () => {
    const blind = render({
      ...base,
      closures: [],
      stateReadable: false,
      stateReason: 'STATE.md could not be read — bad frontmatter',
    });
    expect(blind).not.toBe(zeroUnits());
    expect(blind.toLowerCase()).toContain('state.md');
  });

  it('the STATE reason is passed through, not re-prefixed — found by first use', () => {
    // eval-project-B rendered "STATE.md could not be read — STATE.md could not
    // be read — …" with a doubled full stop, because resolveClosures' reason is
    // already a sentence naming the file. Caught on the first real render.
    const blind = render({
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
// REVIEW finding — one definition, two presentations
// ---------------------------------------------------------------------------

describe('REVIEW — the distinction has exactly ONE definition', () => {
  it('renderArchivePlan is GONE — it cannot come back as a second copy', async () => {
    // It carried its own !stateReadable / zero-units / cannotDetermine branches
    // while explainArchiveOutcome's docblock claimed no second definition could
    // drift, and the two were already drifting (only the report said "needs a
    // person"). It had no production caller, so it was deleted rather than kept
    // in sync. This asserts the deletion sticks.
    const mod = await import('../plugin/tools/lib/archive-report.js');
    expect(mod.renderArchivePlan).toBeUndefined();
    expect(typeof mod.explainArchiveOutcome).toBe('function');
  });

  it('the module exports no second function that branches on stateReadable', async () => {
    // A cheap structural guard: the source may test `stateReadable` in exactly
    // one place. A future re-implementation trips this before it can drift.
    const src = readFileSync(join(ROOT, 'plugin', 'tools', 'lib', 'archive-report.js'), 'utf-8');
    expect(src.match(/if \(!stateReadable\)/g)?.length ?? 0).toBe(1);
  });

  it('the dropped section is owned by exactly one renderer', () => {
    const text = render({
      ...base,
      closures: [closed('X')],
      dropped: [{ unit: 'zz-unit', reason: 'UNSAFE-MARKER' }],
    });
    expect(text.match(/UNSAFE-MARKER/g)?.length ?? 0).toBe(1);
    expect(text.match(/zz-unit/g)?.length ?? 0).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The move breakdown — found wrong by running it, twice
// ---------------------------------------------------------------------------

describe('wave 6 — the breakdown never guesses a unit name', () => {
  const M = (from, to) => ({ from, to });

  it('groups by DESTINATION, so a unit name is never inferred from a filename', () => {
    // The first version stripped a trailing -SUFFIX.md to recover the unit and
    // turned FUTURE-IDEAS.md into a unit called "FUTURE".
    const lines = renderMoveBreakdown([
      M('.planning/PHASE8-PLAN.md', '.planning/archive/PHASE8/PHASE8-PLAN.md'),
      M('.planning/PHASE8-SHIP.md', '.planning/archive/PHASE8/PHASE8-SHIP.md'),
    ]).join('\n');
    expect(lines).toContain('.planning/archive/PHASE8/');
    expect(lines).toMatch(/2 files/);
    expect(lines).not.toMatch(/FUTURE/);
  });

  it('a RENAME is counted as a rename, not dressed up as a unit archive', () => {
    // The second version filtered on the destination path and STILL mislabelled
    // the archive-ledger rename, which lands under .planning/archive/. The
    // producer knows which moves are renames — ask it.
    const renameFroms = new Set(['.planning/FUTURE-IDEAS-LEDGER.md']);
    const lines = renderMoveBreakdown(
      [
        M('.planning/PHASE8-PLAN.md', '.planning/archive/PHASE8/PHASE8-PLAN.md'),
        M('.planning/FUTURE-IDEAS-LEDGER.md', '.planning/archive/ISSUES-INBOX-LEDGER.md'),
      ],
      { renameFroms }
    ).join('\n');
    expect(lines).toContain('.planning/archive/PHASE8/');
    expect(lines).toMatch(/1 rename\(s\)/);
    expect(lines, 'the rename was grouped as an archive destination').not.toMatch(
      /archive\/ {2}\(/
    );
  });

  it('no moves → no lines (a zero deserves a sentence, not an empty heading)', () => {
    expect(renderMoveBreakdown([])).toEqual([]);
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
    const text = render({
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
    const text = render({ ...base, closures: [closed('M5.E13')] });
    expect(text.toLowerCase()).toMatch(/nothing (was )?(dropped|skipped)|no units (were )?(dropped|skipped)/);
  });
});

// ---------------------------------------------------------------------------
// The command seam. FR4 names B63, which is /sig:docs-migrate's dry-run — so
// the distinction has to be reachable from the COMMAND, not only the library.
// An AC set can be fully covered by unit tests while the feature is unreachable
// from anything a user runs; that is B54's shape ("being uncalled is what
// protected its bug from discovery").
// ---------------------------------------------------------------------------

describe('S7 — explainArchiveOutcome is reachable from the migrate dry-run (B63)', () => {
  it('a bare "archive-tree moves: 0" never stands alone', async () => {
    const { renderDryRun } = await import('../plugin/tools/lib/migrate-memory.js');
    const dir = await mkdtemp(join(tmpdir(), 'signal-e18-s7-b63-'));
    try {
      await mkdir(join(dir, P), { recursive: true });
      await writeFile(
        join(dir, P, 'STATE.md'),
        '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\n' +
          'current_tasks: []\ncompleted_phases: []\nblockers: []\nlast_completed_task: null\n---\n# S\n',
        'utf-8'
      );
      await writeFile(join(dir, P, '1-PLAN.md'), '# plan\n', 'utf-8');
      const out = (await renderDryRun(dir)).split('\n');
      const i = out.findIndex((l) => l.includes('archive-tree moves:'));
      expect(i, 'the archive tier is missing from the dry-run').toBeGreaterThan(-1);
      expect(out[i]).toMatch(/archive-tree moves:\s+0/);
      // B63: the 0 must be followed by what it means.
      expect(out.slice(i + 1, i + 8).join('\n'), 'the 0 stands bare — B63 is not fixed').toMatch(/↳/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('AC4.1 — moves > 0 AND an unevaluable unit: the count never stands alone either', async () => {
    // Caught by VERIFY. The first wiring gated on `moves.length === 0`, so a
    // project with real moves AND an unreadable unit printed the count and said
    // nothing about the unit needing a person. B63's own class surviving inside
    // the fix for B63 — and the cause was the CALLER re-implementing "is this
    // ambiguous" instead of letting the renderer decide.
    const { renderDryRun } = await import('../plugin/tools/lib/migrate-memory.js');
    const dir = await mkdtemp(join(tmpdir(), 'signal-e18-ac41-'));
    try {
      await mkdir(join(dir, P), { recursive: true });
      await writeFile(
        join(dir, P, 'STATE.md'),
        '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\n' +
          'current_tasks: []\ncompleted_phases: []\nblockers: []\nlast_completed_task: null\n---\n# S\n',
        'utf-8'
      );
      await writeFile(join(dir, P, 'M9.E1-RETROSPECTIVE.md'), '# retro\n\nReal.\n', 'utf-8');
      await writeFile(join(dir, P, 'M9.E1-VERIFICATION.md'), '**Verdict:** PASS\n', 'utf-8');
      await writeFile(join(dir, P, 'M9.E1-PLAN.md'), '# plan\n', 'utf-8');
      await writeFile(join(dir, P, 'T25-VERIFICATION.md'), '## Verdict\n\nAll criteria pass.\n', 'utf-8');

      const out = (await renderDryRun(dir)).split('\n');
      const i = out.findIndex((l) => l.includes('archive-tree moves:'));
      expect(out[i]).toMatch(/archive-tree moves:\s+[1-9]/); // there ARE moves
      // Position-agnostic: the per-unit breakdown may sit between the count and
      // the explanation. What matters is that the count is not the last word.
      const after = out.slice(i + 1, i + 12).join('\n');
      expect(after, 'a real move count hid an unevaluable unit').toMatch(/↳/);
      expect(after).toContain('T25');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('senseArchiveTree FORWARDS dropped — otherwise no command can surface it', async () => {
    const { senseArchiveTree } = await import('../plugin/tools/lib/archive-tree.js');
    const res = await senseArchiveTree(join(import.meta.dirname, '..'));
    expect(Array.isArray(res.dropped), 'dropped is not forwarded').toBe(true);
  });

  it('a closed unit the mover cannot reach is reported as a GAP, not as clean', () => {
    // Found by running it: eval-project-A printed "none closed … genuinely nothing to
    // do" while resolveClosures had found 1 closed unit. senseArchiveTree's
    // default closed-set is retro-derived; the resolver reads verdicts.
    const lines = explainArchiveOutcome({
      closures: [closed('SLICE-SSO'), open('SLICE-VOICE')],
      moveCount: 0,
    }).join('\n');
    expect(lines.toLowerCase()).not.toMatch(/nothing to do/);
    expect(lines.toLowerCase()).toContain('gap');
    expect(lines).toContain('1 unit(s) resolve as CLOSED');
  });
});

describe('AC4.5 second half — the empty bound is stated ON THE WIRED PATH', () => {
  it('the migrate dry-run says a bound found nothing, rather than staying silent', async () => {
    // VERIFY (2nd pass) found this unreachable: the statement lived in a helper
    // only the deleted standalone report called, so no command ever said it. A
    // reader cannot tell "nothing was dropped" from "dropping is not reported".
    const { renderDryRun } = await import('../plugin/tools/lib/migrate-memory.js');
    const dir = await mkdtemp(join(tmpdir(), 'signal-e18-ac45-'));
    try {
      await mkdir(join(dir, P), { recursive: true });
      await writeFile(
        join(dir, P, 'STATE.md'),
        '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\n' +
          'current_tasks: []\ncompleted_phases: []\nblockers: []\nlast_completed_task: null\n---\n# S\n',
        'utf-8'
      );
      await writeFile(join(dir, P, 'GATE-C-VERIFICATION.md'), '**Verdict:** PASS\n', 'utf-8');
      await writeFile(join(dir, P, 'GATE-C-PLAN.md'), '# plan\n', 'utf-8');
      const out = await renderDryRun(dir);
      expect(out, 'no command states the bound').toMatch(/dropped|skipped/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ALWAYS says something — no input produces an empty result', () => {
    // REVIEW pass 2. migrate-memory's wiring comment claimed the renderer
    // returns [] "when there is nothing to say" — untrue once the empty-bound
    // statement moved in. The first correction claimed "[] only when no units
    // were derived", which is backwards: that case produces the MOST lines.
    // Two wrong comments in a row, both prose about behaviour with nothing
    // failing when it went stale. This enumerates every shape instead.
    const U = (status) => ({ unit: 'U', status, reason: 'r' });
    const shapes = [
      ['no units at all', { closures: [], dropped: [], moveCount: 0 }],
      ['STATE unreadable', { closures: [], dropped: [], stateReadable: false, stateReason: 'x' }],
      ['units, moves, all clean', { closures: [U('closed')], dropped: [], moveCount: 5 }],
      ['units, no moves, all open', { closures: [U('open')], dropped: [], moveCount: 0 }],
      ['units, cannotDetermine', { closures: [U('cannotDetermine')], dropped: [], moveCount: 0 }],
      [
        'units + dropped',
        { closures: [U('closed')], dropped: [{ unit: 'z', reason: 'r' }], moveCount: 1 },
      ],
    ];
    for (const [name, args] of shapes) {
      expect(explainArchiveOutcome(args).length, `${name} produced no line`).toBeGreaterThan(0);
    }
  });

  it('a project with no derived units does NOT get the line — nothing was bounded', () => {
    expect(explainArchiveOutcome({ closures: [], dropped: [] }).join('\n')).not.toMatch(
      /Nothing was dropped/
    );
  });
});

// ---------------------------------------------------------------------------
// AC4.3 — against Signal's own tree
// ---------------------------------------------------------------------------

describe('S7 AC4.3 — Signal\'s own tree: only real retros move, the rest are reported', () => {
  it('renders without throwing and reports every unit by status', async () => {
    const { resolveClosures } = await import('../plugin/tools/lib/closure.js');
    const { senseArchiveTree } = await import('../plugin/tools/lib/archive-tree.js');
    const root = join(import.meta.dirname, '..');
    const res = await resolveClosures(root);
    const { moves } = await senseArchiveTree(root);
    const text = render({
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
    const { senseArchiveTree } = await import('../plugin/tools/lib/archive-tree.js');
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
