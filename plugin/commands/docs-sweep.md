---
name: sig:docs-sweep
description: "Read-only doc-hygiene sweep over the invoking project — dead internal links, unfilled [FILL IN] stubs, INDEX/roster/version drift, a stale capture inbox, and CLAUDE.md bloat. Detect-and-report only; writes nothing, touches no network. Not phase-gated."
args: ""
---

# `/sig:docs-sweep` — Doc-hygiene report

You are running `/sig:docs-sweep`, a not-phase-gated, read-only meta command. Same class as `/sig:status`, `/sig:docs-index`, `/sig:doctor` — no tier-gating preamble, no skill loading, no agent spawning. Its one job: run the deterministic, offline hygiene checks over the **invoking** project and print a grouped report of what's drifted. It **writes nothing** — detect-and-report only (no `--fix` in v1).

The report groups findings into two severities:
- **structural** — the drift the standing test-suite guard hard-fails on (dead internal links, unfilled `[FILL IN]` stubs, a stale auto-generated `INDEX.md`, roster/version count drift, a broken command frontmatter).
- **advisory** — nudges that never block (a stale capture inbox, an oversized `CLAUDE.md`, an absent/foreign `INDEX.md`).
- **Document drift — STATE and published facts** (M5.E16; extended by `M6.E2`) — what `.planning/` and its sibling documents **assert**, measured against what is on disk and in git. Its own group by design (FR1.2): a STATE contradiction is a different kind of wrong from a dead link — it carries a **heal category**, and it can be *unevaluable* rather than merely absent.

  Each finding lands in exactly one heal bucket, and a check that cannot state its bucket does not ship (FR4.2):

  | Bucket | Meaning | Interrupts? |
  |---|---|---|
  | **needs you** | two documents disagree and only you know which is right | **yes — the only one that does** |
  | **clears the next time Signal writes STATE here** | normal use fixes it; reported as reassurance | no |
  | **cannot evaluate** | the check could not look, and says why | no — but it is **NOT** "clean" |

  That last row is the point of the group. Measured across 13 real projects, the two Epic-mode checks can evaluate **2** of them: Signal's own hand-maintained, Epic-mode, `schema_version: 1` shape is the *minority* shape. A sweep that printed nothing for the other 11 would read as *clean* when it never looked — `B39`'s shape. So "could not check" is reported as loudly as "checked".

Authoritative reference:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/sweep.js` — `runSweep`, `renderSweepReport`

## Workflow

### 1. Pre-flight

- Resolve the project root — the current working directory (`process.cwd()`). Never a hard-coded Signal path; `/sig:docs-sweep` reports on whatever project it's invoked in.
- No `.planning/` requirement. The portable checks are meaningful in any repo; the Signal-only checks (roster / version / command-frontmatter) auto-skip when there's no plugin manifest at `.claude-plugin/plugin.json` (a stranger repo), and the skip is stated in the report rather than dropped.

### 2. Run the sweep

Call `runSweep(process.cwd())` from `tools/lib/sweep.js`. It:
1. runs the **portable** checks in any repo — dead internal `.md` links **and their inbound counterpart** — a document nothing links to — plus unfilled `[FILL IN]` markers over the widened `.planning/`-inclusive scope (still exempting `archive/`), `INDEX.md` freshness (pure compose-and-diff — never the writing regenerator), a stale-inbox count, a `CLAUDE.md`-bloat size nudge, and a **backlog-discharge** check (`B94`) reporting rows that read as pending while the work they name is recorded closed;
2. gated on the plugin manifest, runs the **Signal-only** checks — roster-count drift, version consistency, and command-frontmatter freshness;
3. returns `{ findings, stateDrift, signalOnly: { ran, checks } }` — `findings` already normalized to `structural`/`advisory` and sorted deterministically; `stateDrift` is `{results, summary}` from `runDriftChecks`, kept **separate from `findings`** so the heal category and the cannot-evaluate state are not flattened away.

**Cited identifiers that resolve to nothing** (`dangling-reference`). A `B…` or `D-…` named in
`.planning/` prose while `BUGS.md` / `DECISIONS.md` never defines it — a typo, a withdrawn record
whose citations outlived it, or something referenced but never filed. This is the id-level counterpart
to the two link walks, and it exists because **`B112` was cited as *filed* in six documents across
five files for three days while absent from `BUGS.md`.**

⚠ **D-ids resolve through `buildDecisionIdMap`, not by reading `DECISIONS.md`.** Closed-milestone
decisions are **evicted to the archive**, so a direct read reports ~29 perfectly good ids as dangling
(measured). A project whose decision map cannot be built skips D-ids entirely rather than flagging all
of them.

**The orphan check reports two different problems and never conflates them.** *Nothing links to or
mentions this* is dead weight or a broken hand-off. *Referenced N times as a bare path in backticks
and linked from nowhere* is a live document whose references **nothing can verify** and which break
silently when the file moves. Measured on Signal's own corpus at introduction: **0 of the former, 5 of
the latter.**

⚠ **Entry points are excluded by name** — a file a tool opens by name (`STATE.md`, an Epic's
`-PLAN.md`) has no reason to be linked. That list is the check's honest weak point: widen it and the
check goes quiet, narrow it and it cries wolf. ⚠ **A truncated or unreadable file emits its own
`(scope)` finding**, because a clean orphan list computed from a partial read is exactly the shape of
a false all-clear (`B39`).

It is **read-only** (AC1.5): the index-freshness check composes the expected index and diffs it, never calling the atomic-writing Core; every other check only reads. It is offline and deterministic — two runs on unchanged input are byte-identical.

### 3. Render + report

Call `renderSweepReport(result)` (pure — no I/O) and print the returned markdown verbatim. It groups the findings by severity, each group sorted, and states whether the Signal-only checks ran or were skipped (so a stranger repo sees the skip, never a silent drop).

If the report surfaces structural drift, point the user at the fix rather than mutating anything here — e.g. a stale `INDEX.md` is closed by `/sig:docs-index`, a stale inbox by draining it during `/sig:plan`, a roster/version mismatch by reconciling the declaration site. `/sig:docs-sweep` diagnoses; it does not repair.

**That holds for the STATE-vs-world group too, and it was a real decision** (`D-M5E16-1`). FR4 said a command-healable finding is one where *"Signal runs it"*; NFR2 and FR1.3 said sweep never writes. Those cannot both be true, and it was settled in NFR2's favour: sweep stays read-only, healing arrives at the **phase transition** (an `INDEX.md` regenerates whenever you run a phase command) and behind an explicit `/sig:docs-sweep --heal`. **The recorded cost:** the "Signal runs it" bucket currently contains **zero** checks, and a test asserts that emptiness — so registering one without `--heal` existing to run it fails the suite rather than promising a user something nothing keeps.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Add a `--fix` flag so it repairs drift in place." | No — v1 is read-only by design (AD1). A sweep that both scans and writes can't be trusted as the safe check-without-disturbing tool. Structural findings route to the command that owns the fix (`/sig:docs-index`, etc.); the sweep only reports. |
| "Add an arg parser / flags." | No — v1 ships no flags (AD1). `runSweep(process.cwd())` is the whole surface. Adding flags before a real use case is maintenance for nothing; log to FUTURE-IDEAS if one lands. |
| "Regenerate `INDEX.md` while I'm here — the freshness check already computed the expected content." | No. The freshness check uses the **pure** compose-and-diff path precisely so the sweep never writes. Regenerating is `/sig:docs-index`'s job — keep the read-only guarantee (AC1.5). |
| "Point it at Signal's repo so the Signal-only checks always run." | No. It runs on `process.cwd()` — the invoking project. In a stranger repo the Signal-only checks auto-skip and the report states the skip; that's the correct behavior, not a gap to paper over. |

### Output contract (shaping failures — stated as recipes, `B38`)

These are not prohibitions. A prohibition is the right form when the failure is *discipline* —
knowing the rule and skipping it under pressure. It is the **wrong** form when the output merely
comes out the wrong shape, where head-to-head wording tests measured the prohibition arm producing
**more** of the unwanted content than a positive recipe, and worse than no guidance at all.
So these say what the output IS. See `references/anti-rationalization-forms.md`.

- **The report always states which checks were skipped and why.** A check that could not run and a check that found nothing must never render the same.


## Gate: Sweep Complete

- [ ] Ran `runSweep(process.cwd())` (invoking project — no hard-coded Signal path).
- [ ] Printed `renderSweepReport` output verbatim (structural, advisory, **document drift**, Signal-only ran/skipped stated).
- [ ] The **cannot evaluate** count was shown even when it was zero — a group that disappears when empty cannot be distinguished from a group that never ran.
- [ ] Nothing written — read-only (verify no file mtime changed if uncertain).
- [ ] No skills loaded, no agents spawned, no tier-gating preamble run.
