# Install Verification Matrix

Proof that Signal's marketplace install works across the OS / SSH / auth combinations strangers will hit. See `.planning/M4.5.E1-PLAN.md` Slice 3 for the matrix specification and `.planning/M4.5.E1-RESEARCH.md` § 5 for row definitions.

Each row records a real install run on a real machine. Rows are append-only; failed runs stay as the record (with the fix that unblocked the next attempt) rather than being rewritten.

---

## Matrix overview

| Row | Machine type | OS | SSH config | Result | Date |
|---|---|---|---|---|---|
| R1 | Maintainer business box | macOS | Multi-identity; no default `Host github.com` | **PASS** (3 install-UX papercuts documented) | 2026-05-19 |
| R1+ | Maintainer dev box (Mac Studio) | macOS | n/a | **PASS** (M4.5.E7 synthesizer fix verified — 0 R1 patterns reproduce) | 2026-05-23 |
| R2 | Mac happy-path | macOS | Default SSH config | pending | — |
| R3 | Linux | Linux | Default | pending | — |
| R4 | WSL | Windows Subsystem for Linux | Default | best-effort | — |
| R5 | IdentitiesOnly hardened | any | `IdentitiesOnly yes` per-host | pending | — |
| R6 | Corporate proxy | any | SSH port 22 blocked | optional | — |
| R7 | Pre-rename upgrade | any | Had `signal@signal` installed before M4.t19 | optional | — |
| R8 | Cold install on never-touched box | any | Default | optional | — |

---

## R1 — Maintainer business box (macOS, multi-identity SSH)

**Result: PASS — v0.1.2 installed cleanly after working through 3 install-UX papercuts.**

### Machine signature

- macOS, Apple Silicon (hostname: MBP7EYZXT1117)
- Claude Code 2.1.144
- Multi-identity `~/.ssh/config` with no default `Host github.com` block — the original failure mode that motivated v0.1.1's source-block fix

### Goal

Upgrade from v0.1.1 (which was the v0.1.1 source-block fix's own R1 verification target on 2026-05-15) to v0.1.2 (which shipped 2026-05-18 with M4.5.E6), then run F2 verification (M4.5.E1.S2 Phase A) on the v0.1.2 install.

### Install adventure (the actual chronology)

The R1 install on 2026-05-19 surfaced three distinct UX papercuts. None are Signal-side bugs — all are Claude Code-side behaviors — but each one would rage-quit a stranger. They are documented here so install troubleshooting docs (M4.5.E7) can address them.

#### Papercut 1: `/plugin install` short-circuited on stale `gitCommitSha`

- `/plugin marketplace update signal` reported the catalog at v0.1.2.
- `/plugin install sig@signal` reported "already at latest" and exited.
- `/reload-plugins` continued to load v0.1.1-era code.
- Root cause (discovered by reading `~/.claude/plugins/installed_plugins.json`): the `version` field said `0.1.2` but `gitCommitSha` was `fdc1247e09c7f434550a78745274b093d0619dc2` — a commit between v0.1.0 and v0.1.1, predating either tag. Claude Code's install logic appears to short-circuit on `version` match, not on `gitCommitSha` content-identity.

#### Papercut 2: `/plugin` UI has no uninstall verb

- The interactive `/plugin` menu offers Enable / Disable / Update / Add-to-favorites / Open-homepage / View-repository / Back — but no Uninstall.
- "Disable" stops Claude Code from loading the plugin but leaves the cache directory at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` intact, which is exactly why Papercut 1 keeps biting on subsequent install attempts.
- Workaround: filesystem purge — `rm -rf ~/.claude/plugins/cache/signal/`, then edit `~/.claude/plugins/installed_plugins.json` to remove the dangling `sig@signal` entry (which still points at the just-deleted `installPath`).

#### Papercut 3: Disable state survives uninstall + reinstall

- After purging cache, manifest entry, and the entire marketplace registration (`/plugin marketplace remove signal`), a fresh `/plugin marketplace add insightriot/signal` + `/plugin install sig@signal` + `/reload-plugins` reported success — `1 plugin · 14 skills · 32 agents · 1 hook` — but `/sig:` commands did not autocomplete and the plugin showed Status: Disabled.
- Root cause: enable/disable state lives in `~/.claude/settings.json` under `enabledPlugins` as `"sig@signal": false` (or true). The earlier Disable action wrote `false` there. Neither marketplace removal nor uninstall touches this key; the reinstall picked up the stale `false`.
- Resolution: removed the `sig@signal` line from `~/.claude/settings.json` `enabledPlugins`, restarted Claude Code, re-ran the install sequence.

#### Clean v0.1.2 install confirmed

`~/.claude/plugins/installed_plugins.json` after the clean install:

```json
{
  "version": 2,
  "plugins": {
    "sig@signal": [
      {
        "scope": "user",
        "installPath": "/Users/brett.vantil/.claude/plugins/cache/signal/sig/0.1.2",
        "version": "0.1.2",
        "installedAt": "2026-05-19T15:46:51.528Z",
        "lastUpdated": "2026-05-19T15:46:51.528Z",
        "gitCommitSha": "9f504a49de9687ea336d735252215fb5cc72d2d4"
      }
    ]
  }
}
```

`gitCommitSha` matches the `sha` pinned in `marketplace.json` for the v0.1.2 release commit. `installedAt === lastUpdated` confirms this was a genuine fresh install, not a refresh of stale cache.

### F2 verification — M4.5.E1.S2 Phase A

**Outcome: (a) — all Signal agents auto-register; no fallback fires; no agent restructure needed.**

#### `/agents` output

Plugin agents section showed 25 Signal-registered subagents under the naming convention `sig:<subdirectory>:<name>`:

| Category | Count | Examples |
|---|---|---|
| executors | 1 | `sig:executors:executor` |
| planners | 2 | `sig:planners:planner`, `sig:planners:roadmapper` |
| researchers | 7 | `sig:researchers:codebase-researcher`, `sig:researchers:project-researcher`, `sig:researchers:phase-researcher`, `sig:researchers:advisor-researcher`, `sig:researchers:assumptions-analyzer`, `sig:researchers:research-synthesizer`, `sig:researchers:ui-researcher` |
| scanners | 4 | `sig:scanners:stack-scanner`, `sig:scanners:structure-scanner`, `sig:scanners:activity-scanner`, `sig:scanners:quality-scanner` |
| specialists | 3 | `sig:specialists:code-reviewer`, `sig:specialists:security-auditor`, `sig:specialists:test-engineer` |
| support | 3 | `sig:support:codebase-mapper`, `sig:support:debugger`, `sig:support:phase-gate-enforcer` |
| verifiers | 5 | `sig:verifiers:plan-checker`, `sig:verifiers:verifier`, `sig:verifiers:integration-checker` (alias `is:nyquist-auditor`), `sig:verifiers:ui-auditor`, `sig:verifiers:ui-checker` |

Note: `sig:verifiers:integration-checker` displays an alias `is:nyquist-auditor` — that's Claude Code surfacing the agent file's `name:` frontmatter field, which differs from the filename.

Three small discrepancies worth following up but not blocking F2:

1. `/reload-plugins` reported "32 agents" but `/agents` lists 25 Signal agents (and 6 built-ins = 31 visible total). The "32" likely double-counts the alias-bearing agent or includes a hidden default. Worth a quick audit.
2. CLAUDE.md says "26 agents (19 GSD + 3 Agent Skills specialists + 4 brownfield scanners)" — actual on-disk count is 25 plugin agents. The 26-vs-25 difference may be a documentation drift; should be reconciled in a future M4.5.E7 or M4.5.E1.S5 pass.
3. The PLAN-time prediction in `M4.5.E1-PLAN.md` Slice 2 was `sig:<name>` flat; actual is `sig:<subdirectory>:<name>` nested. This nuance only matters for invocation if `subagent_type` requires the full namespaced form (see § Empirical /sig:init run below).

#### Empirical `/sig:init` run on `expressjs/express`

Target: shallow clone of `expressjs/express` (`git clone --depth=1`) in `/tmp/express` — chosen per PLAN as a known canonical mid-sized Node.js codebase with real source, tests, CI, and license signals.

Result: `/sig:init` completed end-to-end. All 4 scanners spawned in parallel via the Task tool with named `subagent_type`; each ran for ~55–58 seconds; token cost was 11.3k–16.7k per scanner. No "Agent type X not found" errors. No fallback path fired.

Generated artifacts in `/tmp/express/.planning/`:

- `scan/stack.md` — JavaScript 66.2%, Express 5.2.1, Mocha + nyc + supertest test stack
- `scan/structure.md` — single-repo (no monorepo markers); `lib/` flat 6-file source root; `test/` with 91 spec files using `{module}.{method}.js` naming convention
- `scan/activity.md` — shallow-clone detected (`.git/shallow` present); flagged contributor/cadence as unreliable; `History.md` external evidence used to infer mature-and-active despite N=1 commit visible
- `scan/quality.md` — Mocha 11.7.5; nyc 17.1.0 + Coveralls; 4 GitHub Actions workflows (ci, legacy, codeql, scorecard); MIT; 0 genuine TODO/FIXME markers
- `LANDSCAPE.md` — 7-section synthesis with appropriate `[INFERRED — high/low confidence]` labels; "Open questions for the user" produced 3 sharp data-grounded questions (is-this-a-fork-vs-clone, target-upstream-or-private-fork, specific-task-vs-exploratory)
- `PROJECT.md` — baseline with Vision + Problem inferred from LANDSCAPE; Success Criteria / Done When / Scope-Out / Constraints-Hard left as `[FILL IN]` per design
- `STATE.md` — initialized to phase `CALIBRATE`

#### Bonus findings beyond F2 itself

These positive discoveries are not part of F2's question but were validated by the same run; they're recorded here so future regressions can be detected.

1. **Shallow-clone handling works.** Activity scanner detected `.git/shallow` and flagged contributor/cadence metrics as unreliable. The synthesizer surfaced the caveat at the top of LANDSCAPE.md with a `git fetch --unshallow` remediation hint. This is a real-world condition the M3 dogfood never exercised (Signal's own repo was non-shallow). First-time-correct on a new edge case is meaningful signal.
2. **Non-standard file casing handled.** `Readme.md` (Express uses sentence-case, not all-caps) and `History.md` (Express's changelog, not the conventional `CHANGELOG.md` name) both detected by the quality scanner without confusion. Section-extraction did not silently skip them.
3. **M4.t8 assumption-surfacing walkthrough fires correctly on a real brownfield codebase.** First real dogfood of the walkthrough step. The 4 `Deferred` + 1 `Skipped` Notes entries written into baseline PROJECT.md were textbook-correct: Defer leaves the `[FILL IN]` marker in the body + appends a timestamped Notes entry; Skip replaces the marker with a placeholder + appends a timestamped Notes entry. The walkthrough copy distinguished `[INFERRED]` (assertable from scan) vs `[FILL IN]` (forward-looking; only the user can answer).
4. **Vision / Problem Statement inference quality is solid.** Both fields generated read naturally and accurately describe what Express is. "In Scope" was inferred cleanly from observed file/directory signals (no overreach into `[FILL IN]` territory).

#### Bug surfaced during the run — synthesizer character-eating

The LANDSCAPE.md and PROJECT.md outputs show systematic character drops. At least 6 confirmed instances in one run:

| Location | Visible | Should be |
|---|---|---|
| LANDSCAPE.md heading | `## Ierred goals & uncertainties` | `## Inferred goals & uncertainties` |
| LANDSCAPE.md structure table | `is \| Top-level entry (224 bytes)` | `index.js \| Top-level entry (224 bytes)` |
| LANDSCAPE.md test command | `--checkt/ test/acceptance/` | `--check-leaks test/ test/acceptance/` (probably) |
| LANDSCAPE.md activity note | `...not real cadence).git fetch --unshallow\`` (missing newline + backtick) | Separate sentence with proper code-fence boundary |
| PROJECT.md heading | `## ints` | `## Constraints` |
| PROJECT.md Notes line | `Constraints (Team / contributoiteria.` (mid-sentence drop) | `Constraints (Team / contributors — no fixed criteria for this project — see Notes).` (or similar) |

The pattern is systematic, not a paste artifact. Routed to **M4.5.E7** for root-cause investigation + fix + regression tests.

### Wall-clock estimate

- Install adventure (papercuts 1–3 + clean reinstall): ~30–40 minutes of real time, including diagnosis pauses
- `/sig:init` on Express (Step 2 scan dispatch through Step 6 handoff): ~2–3 minutes
- F2 verification capture (paste `/agents`, paste LANDSCAPE.md, paste PROJECT.md): ~5 minutes

Total session: ~40–50 minutes for one matrix row, dominated by the install-adventure papercuts. A stranger without diagnostic context would either rage-quit during Papercut 1 or 3, or spend hours.

---

## R1+ — Mac Studio (post-M4.5.E7 synthesizer fix) — 2026-05-23

**Result: PASS — synthesizer fix verified against the original R1 reproduction surface.**

This row records the FR3 spec-named gate for M4.5.E7.S1 (synthesizer prose-quality). Run on the Mac Studio (Brett's primary dev box) against a fresh `--depth=1` clone of `expressjs/express` at `/tmp/express-repro-v2`, using the patched plugin code (M4.5.E7.S1.t1 through S1.t8).

### Method

1. Fresh shallow clone: `git clone --depth=1 https://github.com/expressjs/express /tmp/express-repro-v2`.
2. 4 scanner agents spawned in parallel via `sig:scanners:{stack,structure,activity,quality}` subagent_type — all completed (95–121s, 23k–34k tokens each). No fallback path fired.
3. LANDSCAPE.md synthesized per the patched `commands/init.md` Step 3 — Project structure section embedded the structure-scan Source Tree via `embedSection(scans.structure, 'Source Tree (depth-3)')`. Baseline PROJECT.md synthesized per Step 4.

### Verification of FR3 + AC3 + AC9

**All 6 R1-documented character-drop patterns absent.** Exact-string sweep against `/tmp/express-repro-v2/.planning/LANDSCAPE.md` and `PROJECT.md`:

| # | R1 buggy form | Status in R1+ |
|---|---|---|
| 1 | `## Ierred goals & uncertainties` | absent ✓ — output has clean `## Inferred goals & uncertainties` |
| 2 | `## ints` | absent ✓ — output has clean `## Constraints` |
| 3 | `is \| Top-level entry (224 bytes)` | absent ✓ — Source Tree embedded verbatim via `embedSection` |
| 4 | `--checkt/ test/acceptance/` | absent ✓ — test command quoted intact |
| 5 | `).git fetch --unshallow\`` | absent ✓ — code-fence boundary has proper space + backtick |
| 6 | `contributoiteria.` | absent ✓ — no mid-word truncation in Notes |

**No new character-drop patterns surfaced on maintainer eyeball read.** All 15 h2 headings well-formed; backtick parity clean across all lines; no sentence-then-fence boundary anti-pattern.

### What changed since R1

- New `embedSection(content, heading)` helper in `tools/lib/landscape.js` (S1.t5) — extracts a section body verbatim from scanner output, preserving tables / fenced code / pipes character-for-character.
- `commands/init.md` Step 3 Project structure template (S1.t6) now calls `embedSection(scans.structure, 'Source Tree (depth-3)')` explicitly instead of asking the LLM to "embed verbatim" — which is what produced patterns 3 + 4 in R1.
- `commands/init.md` long lines split (S1.t8) — L170 (851 chars) and L404 (562 chars) broken into shorter paragraphs at natural sentence boundaries. Long lines correlate with LLM truncation under dense generation (pattern 6).
- Test surface: 366 → 384 tests (12 new — 9 Layer B regression in `tests/synthesizer-regression.test.js` + 3 unit in `tests/landscape.test.js`). Fixture at `tests/fixtures/synthesizer-bug-r1/` is the hermetic regression record.

### Caveat: bug is non-deterministic

The S1.t1 re-repro on 2026-05-22 (pre-fix) **also** came out clean — see `.planning/M4.5.E7-RESEARCH.md` § S1.t1 addendum. R1+'s clean result therefore can't be uniquely attributed to the fix (the bug failed to reproduce twice now, with and without the fix). However:

- The deterministic test architecture (Layer B + Layer C, asserting against fixtures) catches regressions that any future run might produce.
- `embedSection` removes the LLM from the verbatim-embed loop entirely, structurally eliminating patterns 3 + 4 regardless of model state.
- Layer C template lint (line-length, sentence-then-fence, heading-literal length) catches the prose-shape anti-patterns that produce patterns 5 + 6.

The fix is therefore "preventive" rather than "demonstrably curative" in this single rerun — but the protective layers are now in place for any future LLM run that would otherwise drift.

### Wall-clock

~6 minutes end-to-end: 4 scanners in parallel (~2 min), synthesis + helper extraction (~2 min), verification sweep (~2 min). Significantly faster than R1's session because there were no install-UX papercuts.

---

## R6 — Mac Studio `/sig:doctor` dogfood (M4.5.E8.S3.t13) — 2026-05-30

**Purpose:** Satisfy M4.5.E8 AC #13 — end-to-end exercise of `/sig:doctor` detection + script-generation + script-execution pipeline against a real `~/.claude/` install. First time `/sig:doctor` ran against non-fixture state.

**Machine:** Mac Studio (Signal-the-codebase dev machine). Claude Code 2.1.157. Pre-dogfood Signal install: `sig@signal` v0.1.2 (marketplace-installed) + dev environment loading code from `/Users/macstudio/dev-biz/signal/`.

**Pre-state on disk** (the maintainer's accumulated install history):
- `~/.claude/plugins/cache/signal/sig/0.1.0/` (P2 orphan — Signal v0.1.0 cache from initial install)
- `~/.claude/plugins/cache/signal/sig/0.1.1/` (P2 orphan — Signal v0.1.1 cache from M4.5.E1.S1 upgrade)
- `~/.claude/plugins/cache/signal/sig/0.1.2/` (current install — manifest-referenced; healthy)
- `~/.claude/plugins/cache/signal/signal/0.1.0/` (P4 — pre-rename `signal@signal` slug cache from before M4.t19 rename on 2026-05-12)
- `~/.ssh/config` with multi-identity `Host github.com-insightriot` + `Host github.com-brettvtcrowe` blocks, no default `Host github.com` (P5 informational)

### Step 1 — backup

```bash
tar -czf ~/claude-backup-pre-doctor-dogfood.tgz ~/.claude
```

Completed cleanly. Backup tarball lives at `~/claude-backup-pre-doctor-dogfood.tgz` as the rollback path if the script had misbehaved.

### Step 2 — detection (read-only)

Driver: `/tmp/sig-doctor-dogfood-detect.mjs` (imports `readInstallState` + `runAllDetectors` from `tools/lib/doctor.js`; invoked via `node`).

Output:

```json
{
  "healthy": false,
  "aggregate_recommendation": "--fix",
  "findings": [
    { "code": "P2", "recommendation": "--fix",
      "evidence": [
        "/Users/macstudio/.claude/plugins/cache/signal/sig/0.1.0",
        "/Users/macstudio/.claude/plugins/cache/signal/sig/0.1.1"
      ] },
    { "code": "P4", "recommendation": "--fix",
      "evidence": ["cache:/Users/macstudio/.claude/plugins/cache/signal/signal"] },
    { "code": "P5", "recommendation": "info-only",
      "evidence": "multi-identity Host github.com-* without default Host github.com" }
  ]
}
```

**Verifications passed:**
- D-E8-11 Signal-scoping held — no spurious non-Signal entries flagged.
- P2 evidence correctly excluded the current v0.1.2 (manifest-narrowed); included only the orphan 0.1.0 / 0.1.1.
- P4 evidence correctly flagged the pre-rename cache via the `cache:` prefix.
- P5 fired as `info-only` — did not flip `healthy` to false on its own (healthy is false because of P2 + P4).
- Aggregate recommendation `--fix` (not `--reinstall`) — correct because no P1 fired (cached `plugin.json` matched manifest for the current install).

### Step 3 — script generation

Driver: `/tmp/sig-doctor-dogfood-write.mjs` (calls `buildFixScript` + `writeDoctorScript`).

```
Wrote /Users/macstudio/.claude/sig-doctor.sh (2005 bytes)
```

Script body verified to contain:
- `#!/usr/bin/env bash` shebang (D-E8-8)
- `set -u -o pipefail` (no `-e`)
- `claude --version` preamble + 2.1.150 minimum call-out
- 3 `read -p "Execute: ... [y/N]"`-wrapped `rm -rf` steps (2 P2 + 1 P4)
- P5 informational echo with `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` hint
- Trailing `/reload-plugins` + `/sig:doctor` re-verify instruction
- All paths absolute (`/Users/macstudio/.claude/...`); no literal `~/.claude/` (D-E8-10 meta-test passed in production).

### Step 4 — script execution

```bash
bash ~/.claude/sig-doctor.sh
```

Output:

```
Detected Claude Code: 2.1.157 (Claude Code)
(This script needs 2.1.150+ for 'claude plugin' subcommands.)

  [skipped]
  [skipped]
  [skipped]
[i] If marketplace operations fail with SSH auth errors, try:
    export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1

Script complete. Final step requires Claude Code:
  1. Inside Claude Code, run: /reload-plugins
  2. Then: /sig:doctor   (to verify install state)
```

**User declined all three `[y/N]` prompts** — a legitimate validation outcome. This exercised:
- ✅ The `claude --version` preamble (printed real version)
- ✅ All three `read -p` prompts fired correctly
- ✅ Default-skip behavior on non-`y` answers (no rm executed)
- ✅ Script continues past skipped steps (not aborting via `set -e`)
- ✅ P5 info echo
- ✅ Final reminder block prints

**What was NOT exercised:** the actual `rm -rf` destructive leg. Filesystem state pre- and post-script-execution is identical.

### Step 5 — `/reload-plugins`

```
Reloaded: 6 plugins · 21 skills · 34 agents · 5 hooks · 1 plugin MCP server · 1 plugin LSP server
```

Picked up the new code from the dev environment. **`/sig:doctor` is now live** as a slash command on this machine, available for follow-on verification of the command-side dispatch path (separate from the script-execution path tested here).

### Outcome summary

| Validation surface | Status |
|---|---|
| Detection against real `~/.claude/` state | ✅ end-to-end |
| Signal-scoping (D-E8-11) | ✅ no non-Signal leakage |
| Aggregate-recommendation logic | ✅ `--fix` correctly selected |
| Script generation (`buildFixScript`) | ✅ well-formed output |
| Atomic write (`writeDoctorScript`) | ✅ 2005 bytes landed via `atomicWrite` |
| Script preamble (`claude --version` probe) | ✅ printed live version |
| `[y/N]` prompt mechanism | ✅ defaulted to skip on non-`y` |
| Skip → continue (no `set -e` abort) | ✅ all 3 skipped, script finished |
| P5 informational echo | ✅ printed |
| `/reload-plugins` post-execution | ✅ Signal hot-reloaded |
| Actual destructive `rm -rf` leg | ⏸️ user declined (legitimate) |

AC #13 satisfied for the execution-mechanism end-to-end. The destructive leg remains unexercised by this dogfood but is covered by:
- Unit tests for `buildFixScript` step-template content (S2 lint tests)
- The structural safety mechanisms themselves (per-step `[y/N]`, no `set -e`)
- Future stranger encountering a real broken install (where their script-run answers `y`)

### What this row does NOT cover

- `--reinstall` script generation + execution. The `--reinstall` body invokes `claude plugin uninstall/install` CLI subcommands which would touch the active install — too high-blast-radius for the dev machine without a more compelling test scenario.
- Cross-machine dogfood (biz machine or laptop). REQUIREMENTS originally suggested biz machine; PLAN reframed AC #13 as "any second macOS machine acceptable." Mac Studio satisfied the spirit; biz/laptop dogfood is a low-priority follow-on that can wait for a real install-state issue to surface there.

---

## Pending rows

R2 through R5 + R7 + R8 not yet run. R2 (Mac happy-path on a fresh machine without R1's SSH config) is the highest-priority remaining row — it isolates whether the install adventure was caused by the multi-identity SSH config or whether it would reproduce on a default-config machine. R3 (Linux) and R5 (IdentitiesOnly hardened) are required for the M4.5.E1 exit gate per `MILESTONE-4.5.md`. R6 above closes the M4.5.E8 AC #13 gate.

---

*Created 2026-05-19 as the M4.5.E1.S2 + S3 R1-row deliverable. Future rows appended chronologically.*
