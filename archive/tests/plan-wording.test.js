// Archived 2026-10-28 (course correction Step 1): these checks pinned the
// wording and section layout of plan.md before it was rewritten as numbered
// steps (and, for two of them, the identical phase-entry paragraph plan.md
// shared with execute, verify and review). Each is copied verbatim from the
// file named above it. What they protected is still checked against the new
// file in the same live test files. This file does not run.

// --- from tests/b93-epic-roll-ordering.test.js
    it.each(siblings)('%s.md carries the tier preamble', (name) => {
      expect(read(name)).toMatch(/^## 0\. Tier-gating preamble/m);
    });

// --- from tests/backlog.test.js
describe('commands/plan.md classify step (S4.t3 — FR2 wiring in Step 1b)', () => {
  it('classifies with a strict-enum [work, bug] routing to promoteToBacklog / promoteToBugs', () => {
    expect(planMd).toMatch(/\[work, bug\]/);
    expect(planMd).toContain('promoteToBacklog');
    expect(planMd).toContain('promoteToBugs');
    expect(planMd).toContain('promoteDrainEntry');
  });

  it('a work promote takes a [roadmap, hygiene] tag and may retitle', () => {
    expect(planMd).toMatch(/\[roadmap, hygiene\]/);
    expect(planMd.toLowerCase()).toContain('retitle');
  });

  it('reads the inbox via the resolver, not a hardcoded FUTURE-IDEAS', () => {
    expect(planMd).toContain('resolveInboxPath');
    expect(planMd).toContain('ISSUES-INBOX.md');
    // back-compat mention retained so a legacy repo still reads
    expect(planMd).toMatch(/FUTURE-IDEAS\.md/);
  });
});

// --- from tests/commands-wording.test.js
describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  it('all four middle commands carry the conditional clause', () => {
    for (const f of MIDDLE) expect(read(f), f).toContain(CONDITION);
  });

  it('the old UNCONDITIONAL phrasing is gone from every command', () => {
    // The exact string B48 was filed against.
    for (const f of MIDDLE) {
      expect(read(f), f).not.toMatch(/\*\*Before any Workflow step\*\*, call `await transitionPhase/);
    }
  });

  it('the four wordings are IDENTICAL apart from the phase name — drift is caught, not trusted', () => {
    // A single shared wording was the requirement (FR1.1) precisely so the four
    // cannot diverge. Normalising the phase token is what makes them comparable.
    const normalised = MIDDLE.map((f) => {
      const src = read(f);
      const start = src.indexOf(CONDITION);
      expect(start, `${f}: conditional clause missing`).toBeGreaterThan(-1);
      const end = src.indexOf('\n## ', start);
      return src
        .slice(start, end === -1 ? undefined : end)
        .replace(/\b(PLAN|EXECUTE|VERIFY|REVIEW)\b/g, '{PHASE}');
    });
    for (const n of normalised.slice(1)) expect(n).toBe(normalised[0]);
  });

  it('each command still names its OWN phase in the call (normalisation did not hide a copy-paste bug)', () => {
    for (const f of MIDDLE) {
      const phase = f.toUpperCase();
      expect(read(f), f).toContain(`transitionPhase(baseDir, '${phase}')`);
    }
  });
});

// --- from tests/commands-wording.test.js
  it('names a worked example so a reader knows what counts (AC1.2)', () => {
    const text = denorm(plan());
    expect(text).toMatch(/worked example/i);
    // The example must distinguish a NEW thing from a FIRST-RUN thing — the
    // distinction the instruction turns on.
    expect(text.toLowerCase()).toMatch(/never (been )?run|real purpose|not previously/);
  });

// --- from tests/drain-standing.test.js
  it('commands/plan.md tells the reader no disposition verb applies', () => {
    const planMd = readFileSync(join(repoRoot, 'plugin/commands/plan.md'), 'utf8');
    expect(planMd).toMatch(/standing/i);
    expect(planMd).toMatch(/never promote, merge, or delete/);
  });

// --- from tests/drain.test.js
describe('commands/plan.md drain step (S5.t3 — FR7.1-7.4, R1 hard gate)', () => {
  it('inserts `### 1b.` between Step 1 and Step 2 without renumbering Steps 2-6', () => {
    expect(planMd).toMatch(/^### 1b\. /m);
    // Untouched, numerically-referenced steps still present. Matched on the
    // NUMBER, not the title — this test is about renumbering, and pinning the
    // full heading made it fail on `M6.E9`'s rename of Step 2's title (FR5:
    // "Research (Parallel Agents)" -> "Research (parallel angles)", because the
    // section no longer names agents). Over-specification, loosened to what the
    // test is actually for.
    expect(planMd).toMatch(/^### 2\. Research /m);
    expect(planMd).toContain('### 4. Plan Validation (8 Dimensions)');
    // 1b. sits between Step 1 and Step 2.
    const i1 = planMd.indexOf('### 1. Load Context');
    const i1b = planMd.search(/^### 1b\. /m);
    const i2 = planMd.search(/^### 2\. Research /m);
    expect(i1).toBeGreaterThan(-1);
    expect(i1b).toBeGreaterThan(i1);
    expect(i2).toBeGreaterThan(i1b);
  });

  it('FR7.1: reads candidates via the drain helper, all un-dispositioned (no window)', () => {
    expect(planMd).toContain('listDrainCandidates');
    expect(planMd).toContain('tools/lib/drain.js');
    expect(planMd).toMatch(/FUTURE-IDEAS\.md/);
  });

  it('FR7.2: advisory + skippable + "defer all remaining" batch', () => {
    expect(planMd.toLowerCase()).toContain('advisory');
    expect(planMd.toLowerCase()).toMatch(/skip the whole step|fully skippable|skippable/);
    expect(planMd).toMatch(/defer all remaining/i);
  });

  it('FR7.2/7.3: per-entry strict-enum offers promote/defer/merge/delete + explicit skip', () => {
    expect(planMd).toMatch(/strict-enum/);
    for (const verb of ['promote', 'defer', 'merge', 'delete']) {
      expect(planMd, `drain step must offer "${verb}"`).toContain(verb);
    }
  });

  it('FR7.3 + R5: delete/merge confirm regardless of gate_strictness; keep preserves', () => {
    expect(planMd).toMatch(/\[confirm, keep\]/);
    expect(planMd).toMatch(/regardless of `?gate_strictness`?/);
  });

  it('R1 HARD GATE: previews the diff before any disposition write', () => {
    expect(planMd).toMatch(/HARD GATE/);
    expect(planMd.toLowerCase()).toContain('preview');
    expect(planMd).toContain('applyDispositionToFile');
  });

  it('FR7.4: empty candidate set emits a one-line note and continues', () => {
    // M5.E3.S4.t3: the note was reworded FUTURE-IDEAS → inbox as the drain now
    // reads the resolved inbox (ISSUES-INBOX.md, back-compat FUTURE-IDEAS.md).
    expect(planMd).toContain('(no inbox candidates to drain)');
  });

  it('FR3 (M5.E1): wires evictTerminalToLedger with a dry-run preview; DEFERRED stays', () => {
    expect(planMd).toContain('evictTerminalToLedger');
    expect(planMd).toMatch(/dryRun:\s*true/);
    expect(planMd.toLowerCase()).toContain('preview');
    expect(planMd).toMatch(/DEFERRED[^\n]*stays/i);
    expect(planMd).toMatch(/danglingFence/);
  });
});

// --- from tests/drain.test.js
  it('FR7.5: plan.md anti-rationalization table gains a "skip the drain" row', () => {
    // Inside the Phase Gate's Anti-Rationalization Check table.
    const tableStart = planMd.indexOf('### Anti-Rationalization Check');
    expect(tableStart).toBeGreaterThan(-1);
    const table = planMd.slice(tableStart);
    // Qualifier deliberately name-AGNOSTIC (`B89`, 2026-08-08). This read
    // `(FUTURE-IDEAS )?` and broke when the row was updated to say "inbox" —
    // the current filename is `ISSUES-INBOX.md`, with FUTURE-IDEAS only a
    // back-compat fallback. FR7.5's intent is that the table REFUSES the skip;
    // pinning which noun the row uses for the file tests the spelling instead,
    // and would fail again at the next rename.
    expect(table).toMatch(/skip the (?:[A-Za-z-]+ )?drain/i);
    expect(table.toLowerCase()).toContain('rot');
    // The row must also point at the legitimate alternative — a refusal with no
    // permitted move is what made the original contradiction survivable.
    expect(table).toContain('defer all remaining');
  });

// --- from tests/drain.test.js
describe('commands/plan.md offers the verb it now has', () => {
  it('lists `shipped` in the drain enum — a verb no command offers is unreachable', () => {
    // The B39/B46 class, applied to this change on the day it shipped: a
    // capability with no caller. plan.md is the only surface that offers
    // disposition verbs to a user.
    const planMd = readFileSync(join(ROOT, 'plugin/commands/plan.md'), 'utf-8');
    expect(planMd).toContain('[promote, defer, shipped, merge, delete]');
    expect(planMd).toMatch(/\|\s*\*\*shipped\*\*\s*\|/);
  });
});

// --- from tests/intra-file-consistency.test.js
  it('plan.md requires the drain, and does not also call it skippable', () => {
    const src = readFileSync(join(COMMANDS, 'plan.md'), 'utf8');
    const live = liveText(src);

    // The permission that contradicted the table. Gone from the live text.
    expect(live).not.toMatch(/advisory and fully skippable/i);
    expect(live).not.toMatch(/skip the whole step and planning proceeds unchanged/i);

    // The requirement, and the bounded escape it depends on.
    expect(live).toMatch(/###\s*1b\..*\(required/i);
    expect(live).toMatch(/This step is required\./);
    expect(live).toContain('defer all remaining');
  });

// --- from tests/intra-file-consistency.test.js
  it('the retired permission survives as a quotation, and is marked retired', () => {
    // Deleting the old wording outright would pass every check above and lose
    // the only in-file record of why the rule changed. Keeping it unmarked is
    // what makes it indistinguishable from a live instruction. It must be both
    // present and marked — this test fails if either half is dropped.
    const src = readFileSync(join(COMMANDS, 'plan.md'), 'utf8');
    const quoted = src
      .split('\n')
      .filter((l) => /advisory and fully skippable/i.test(l));
    expect(quoted.length, 'the retired wording should be quoted exactly once').toBe(1);
    expect(quoted[0]).toMatch(/\[RETIRED\b/i);
    expect(quoted[0]).toMatch(/no longer in force/i);
  });

// --- from tests/intra-file-consistency.test.js
  it('the bounded escape is offered unconditionally, not above some size threshold', () => {
    const src = liveText(readFileSync(join(COMMANDS, 'plan.md'), 'utf8'));
    // A required step whose only escape appears "on a large first run" is a
    // step with no escape on a small one.
    expect(src).not.toMatch(/On a large first run, offer \*\*"defer all remaining"\*\*/);
    expect(src).toMatch(/Always offer "defer all remaining"/i);
  });

// --- from tests/intra-file-consistency.test.js
  it('the anti-rationalization row still refuses the skip, and now names the legitimate move', () => {
    const table = antiRationalizationBlock(readFileSync(join(COMMANDS, 'plan.md'), 'utf8'));
    expect(table).toBeTruthy();
    const row = table.split('\n').find((l) => /skip the inbox drain/i.test(l));
    expect(row, 'the drain row must survive — removing it was the other resolution').toBeTruthy();
    expect(row).toMatch(/\bNo\b/);
    expect(row).toContain('defer all remaining');
  });

// --- from tests/phase-recording.test.js
  it('every middle phase command documents its entry transition (presence, not obedience)', async () => {
    for (const cmd of MIDDLE_COMMANDS) {
      const src = await readFile(join(process.cwd(), 'plugin', 'commands', `${cmd}.md`), 'utf-8');
      expect(src, `${cmd}.md must instruct a phase-entry transition`).toMatch(
        new RegExp(`transitionPhase\\(baseDir, '${cmd.toUpperCase()}'\\)`)
      );
      // At ENTRY, not exit: the position must be true WHILE the phase runs.
      const idx = src.indexOf('## Phase entry');
      expect(idx, `${cmd}.md phase-entry step must precede the Workflow`).toBeGreaterThan(0);
      expect(idx).toBeLessThan(src.indexOf('## Workflow'));
    }
  });

// --- from tests/phase-recording.test.js
  it('no longer states a precondition no command can satisfy (AC6.1)', async () => {
    const src = await readFile(join(process.cwd(), 'plugin', 'commands', 'plan.md'), 'utf-8');
    // plan.md:50 used to read "verify current phase is PLAN" while nothing in
    // Signal could ever make that true — the bug written into the spec.
    //
    // Matched on the BULLET form specifically, not the bare phrase: the
    // corrected line quotes the old wording to explain what changed, and a
    // naive `not.toMatch(/verify current phase is PLAN/)` fails on that
    // explanation. A test that forbids a project from describing its own
    // history is a bad test — it pressures the fix toward deleting the record.
    expect(src).not.toMatch(/^- `STATE\.md` — verify current phase is PLAN\s*$/m);
    expect(src).toMatch(/^- `STATE\.md` — current phase is `PLAN`, set by the phase-entry step/m);
  });
