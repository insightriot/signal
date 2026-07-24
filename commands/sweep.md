---
name: sig:sweep
description: "Read-only doc-hygiene sweep over the invoking project — dead internal links, unfilled [FILL IN] stubs, INDEX/roster/version drift, a stale capture inbox, and CLAUDE.md bloat. Detect-and-report only; writes nothing, touches no network. Not phase-gated."
args: ""
---

# `/sig:sweep` — Doc-hygiene report

You are running `/sig:sweep`, a not-phase-gated, read-only meta command. Same class as `/sig:status`, `/sig:index`, `/sig:doctor` — no tier-gating preamble, no skill loading, no agent spawning. Its one job: run the deterministic, offline hygiene checks over the **invoking** project and print a grouped report of what's drifted. It **writes nothing** — detect-and-report only (no `--fix` in v1).

The report groups findings into two severities:
- **structural** — the drift the standing test-suite guard hard-fails on (dead internal links, unfilled `[FILL IN]` stubs, a stale auto-generated `INDEX.md`, roster/version count drift, a broken command frontmatter).
- **advisory** — nudges that never block (a stale capture inbox, an oversized `CLAUDE.md`, an absent/foreign `INDEX.md`).

Authoritative reference:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/sweep.js` — `runSweep`, `renderSweepReport`

## Workflow

### 1. Pre-flight

- Resolve the project root — the current working directory (`process.cwd()`). Never a hard-coded Signal path; `/sig:sweep` reports on whatever project it's invoked in.
- No `.planning/` requirement. The portable checks are meaningful in any repo; the Signal-only checks (roster / version / command-frontmatter) auto-skip when there's no plugin manifest at `.claude-plugin/plugin.json` (a stranger repo), and the skip is stated in the report rather than dropped.

### 2. Run the sweep

Call `runSweep(process.cwd())` from `tools/lib/sweep.js`. It:
1. runs the **portable** checks in any repo — dead internal `.md` links and unfilled `[FILL IN]` markers over the widened `.planning/`-inclusive scope (still exempting `archive/`), `INDEX.md` freshness (pure compose-and-diff — never the writing regenerator), a stale-inbox count, and a `CLAUDE.md`-bloat size nudge;
2. gated on the plugin manifest, runs the **Signal-only** checks — roster-count drift, version consistency, and command-frontmatter freshness;
3. returns `{ findings, signalOnly: { ran, checks } }` — findings already normalized to `structural`/`advisory` and sorted deterministically.

It is **read-only** (AC1.5): the index-freshness check composes the expected index and diffs it, never calling the atomic-writing Core; every other check only reads. It is offline and deterministic — two runs on unchanged input are byte-identical.

### 3. Render + report

Call `renderSweepReport(result)` (pure — no I/O) and print the returned markdown verbatim. It groups the findings by severity, each group sorted, and states whether the Signal-only checks ran or were skipped (so a stranger repo sees the skip, never a silent drop).

If the report surfaces structural drift, point the user at the fix rather than mutating anything here — e.g. a stale `INDEX.md` is closed by `/sig:index`, a stale inbox by draining it during `/sig:plan`, a roster/version mismatch by reconciling the declaration site. `/sig:sweep` diagnoses; it does not repair.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Add a `--fix` flag so it repairs drift in place." | No — v1 is read-only by design (AD1). A sweep that both scans and writes can't be trusted as the safe check-without-disturbing tool. Structural findings route to the command that owns the fix (`/sig:index`, etc.); the sweep only reports. |
| "Add an arg parser / flags." | No — v1 ships no flags (AD1). `runSweep(process.cwd())` is the whole surface. Adding flags before a real use case is maintenance for nothing; log to FUTURE-IDEAS if one lands. |
| "Regenerate `INDEX.md` while I'm here — the freshness check already computed the expected content." | No. The freshness check uses the **pure** compose-and-diff path precisely so the sweep never writes. Regenerating is `/sig:index`'s job — keep the read-only guarantee (AC1.5). |
| "Point it at Signal's repo so the Signal-only checks always run." | No. It runs on `process.cwd()` — the invoking project. In a stranger repo the Signal-only checks auto-skip and the report states the skip; that's the correct behavior, not a gap to paper over. |
| "Suppress the Signal-only skip line to keep the report short." | No (AC1.3). A skipped check must be stated, never silently dropped — the user needs to know roster/version/frontmatter were not evaluated. |

## Gate: Sweep Complete

- [ ] Ran `runSweep(process.cwd())` (invoking project — no hard-coded Signal path).
- [ ] Printed `renderSweepReport` output verbatim (structural then advisory, Signal-only ran/skipped stated).
- [ ] Nothing written — read-only (verify no file mtime changed if uncertain).
- [ ] No skills loaded, no agents spawned, no tier-gating preamble run.
