# Signal

> Disciplined AI development workflow with a project-complexity calibration layer. Right-sized rigor per project tier — so you don't over-engineer throwaways or under-engineer production systems.

Signal is a Claude Code plugin. Run a six-phase workflow (`calibrate → discuss → plan → execute → verify → review → ship`) where every phase reads a `PROFILE.md` written at calibration time, and *that* drives whether you get TDD, four research agents, an 8-dimension plan validation, a full security audit, all of those — or none of them.

A 30-line throwaway script doesn't need ceremony. A production service handling other people's data does. Signal calibrates once and the workflow self-tunes.

## Why this exists

Most AI-development workflows pick a fixed level of rigor. Heavy frameworks demand TDD + plans + reviews on every change; light frameworks skip discipline even when stakes are real. Both fail at the wrong end. Signal asks five diagnostic questions, classifies the work into one of four tiers (SKETCH / FEATURE / SPIKE / FULL), and then every downstream phase reads that classification as its first action.

In Signal's own dogfood:

| Tier | Throwaway | Wall clock | Source LOC | Tests | Research agents | `.planning/` artifacts |
|---|---|---|---|---|---|---|
| **SKETCH** | CSV-to-JSON one-shot | ~5 min | ~30 | 0 (smoke only) | 0 | 8 |
| **FULL** | Production URL shortener | ~2 hours | ~600 | 39 | 4 | 14 |

Same tooling. Same commands. The difference is calibration.

## Install

### Requirements & compatibility

| Component | Notes |
|---|---|
| **Node.js 22+** | ESM, no native modules |
| **Claude Code 2.1.141+** | That release shipped the `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` env var used by the troubleshooting workaround below |
| **Operating system** | Verified on macOS; Linux/WSL untested — see [`docs/install-verification.md`](./docs/install-verification.md) for the verification matrix |
| **Git** | Any modern version (`.planning/` requires a git repo to be useful) |

### Via Claude Code plugin marketplace

```
/plugin marketplace add insightriot/signal
/plugin install sig@signal
/reload-plugins
```

Then try `/sig:calibrate` to confirm the install. Signal's `/sig:*` commands should autocomplete.

#### Troubleshooting install

If `/plugin install` fails with `Permission denied (publickey)` or `Could not read from remote repository`, your machine has a non-default SSH config (multi-identity hosts, `IdentitiesOnly yes`, or no default `Host github.com`) and Claude Code's plugin loader is reaching for SSH. Two documented escape hatches:

1. **Use Anthropic's HTTPS-prefer env var** (Claude Code 2.1.141+):
   ```bash
   export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1
   ```
   Then retry the install. This is the cleanest fix and doesn't change your SSH config.

2. **Or install from a local clone** (no marketplace fetch involved):
   ```bash
   GIT_CONFIG_GLOBAL=/dev/null git clone https://github.com/InsightRiot/signal ~/signal
   ```
   Then in Claude Code: `/plugin marketplace add ~/signal` → `/plugin install sig@signal`.

As of v0.1.1, Signal's marketplace.json pins HTTPS explicitly, so option 1 should rarely be needed — but it's there if some other plugin in your stack triggers the same path.

For other install symptoms — `/plugin install` reporting "already at latest" while running stale code, missing Uninstall verb in the `/plugin` UI, plugin staying Disabled after reinstall, pre-rename `signal@signal` cache orphans — see [`docs/install-troubleshooting.md`](./docs/install-troubleshooting.md).

### From source (for development or hacking on Signal itself)

```bash
git clone https://github.com/InsightRiot/signal
cd signal
npm install
node tools/validate-plugin.js   # should report all checks green
npm test                        # 397 tests should pass
```

Then point Claude Code at the local plugin directory (settings → plugins → load from path), or symlink into your `~/.claude/plugins/` if you prefer.

**`${CLAUDE_PLUGIN_ROOT}` for development.** Several command markdown files reference paths like `${CLAUDE_PLUGIN_ROOT}/skills/...` and `${CLAUDE_PLUGIN_ROOT}/state/config.json`. Claude Code sets this env var when the plugin is installed via the marketplace. For local development (or when dogfooding Signal-on-Signal), set it manually before running Claude Code:

```bash
export CLAUDE_PLUGIN_ROOT="$(pwd)"   # from the Signal repo root
```

Without it, command markdown still works — Claude resolves the literal path from context — but explicit is faster.

**5-minute install target:** clone + `npm install` + validator pass takes well under that on a machine that already has Node 22 + git. Most of the time budget is `npm install` (the `yaml` runtime dep is the one external dependency).

## Your first project

Visual companion: [Signal map](./docs/map/index.html) — workflow phases, tier matrix, and the 5 calibration questions on one page.

```bash
mkdir my-project && cd my-project
git init   # Signal requires .planning/ to be tracked in git
```

Then in Claude Code:

```
/sig:new-project
```

Claude asks five questions about what you're building. The output is a `.planning/PROJECT.md` capturing intent. Then:

```
/sig:calibrate
```

Five diagnostic questions:

1. **Scope** — `throwaway / feature / subsystem / product`
2. **Stakes** — `none / minor / major / catastrophic`
3. **Novelty** — `familiar / rare / first-for-org / first-in-industry`
4. **Reversibility** — `trivial / moderate / painful / irreversible`
5. **Horizon** — `hours / days / months / years`

Out comes `.planning/PROFILE.md` with your tier and ten rigor toggles (TDD on/off, security audit none/basic/full, Nyquist test-mapping off/basic/strict, etc.).

Then walk the phases:

| Command | What it does | Skipped if… |
|---|---|---|
| `/sig:discuss` | Lock implementation decisions; produces `CONTEXT.md` (and `REQUIREMENTS.md` for FULL). | Never. |
| `/sig:plan` | Up to 4 parallel research agents → `1-RESEARCH.md` → vertical-slice plan → 8-dim validation → Nyquist test-coverage mapping. | Per-step skips at lower tiers (no research at SKETCH; no 8-dim at SKETCH; no Nyquist at SKETCH). |
| `/sig:execute` | Wave-based execution; TDD where required; atomic commit per task; per-phase progress in `1-PROGRESS.md`. | Never. |
| `/sig:verify` | Run the full test suite; check acceptance criteria; Nyquist compliance pass at strict. | Never. |
| `/sig:review` | Specialist passes — code quality, security hardening, performance, simplification. Produces `1-REVIEW.md`. | SKETCH and SPIKE tiers skip REVIEW entirely. |
| `/sig:ship` | Pre-ship checklist; clean git history; PR creation; final anti-rationalization. | SPIKE skips SHIP (its output is internal — a finding doc, not a deliverable). |

Mid-flight scope grew? `/sig:escalate` re-runs calibration, promotes tier, and preserves the decision trail in `escalation_history`.

Want a status check without running anything? `/sig:status` (read-only inspection) and `/sig:resume` (re-orientation briefing for a fresh session).

Got a new idea mid-flow? `/sig:add "your idea here"` captures it to `.planning/FUTURE-IDEAS.md` without breaking your current phase. Know where it belongs? Route it explicitly: `--question "…"` files to `.planning/OPEN-QUESTIONS.md`, and `--milestone [N] "…"` files to a holding section in a milestone file. Not tier-gated; available anywhere `.planning/` exists. Planning phases pick up captured entries on the next `/sig:plan` run.

### State hygiene — `/sig:checkpoint`

`/sig:checkpoint` is the manual state-refresh ritual. Use it when you want `STATE.md` to reflect the actual state of your work right now — typically because you're about to clear context, switch machines, or hand a session off to a teammate.

Two modes:

- **Default (quick)** — `/sig:checkpoint` walks the git log since the last refresh, proposes an updated `STATE.md`, and writes it after a confirmation (under `gate_strictness: strict`). Cleared tasks come out of `current_tasks[]`; `last_updated_commit` advances to HEAD.
- **`--context`** — same as default, then prompts for any decisions worth locking in (dual-written to `.planning/CONTEXT.md` § Locked Decisions AND `.planning/DECISIONS.md`) and any open questions worth surfacing on next `/sig:resume` (appended to `.planning/OPEN-QUESTIONS.md`). This is the ritual to run **before** a planned context clear so the next session's `/sig:resume` is genuinely useful.

You don't strictly need to run `/sig:checkpoint` — `/sig:execute` auto-records each task to `STATE.md` (the auto-state-protocol) so resume works out of the box. `/sig:checkpoint` is the manual safety net for when you've done work outside the `/sig:execute` loop, or want to capture decisions and questions explicitly before stepping away.

See [`references/state-schema.md`](references/state-schema.md) for the full `STATE.md` schema and the auto-update protocol's tier-aware behavior.

## Bringing Signal to an existing codebase

If you already have code and want Signal applied to it (the most common adoption path), use `/sig:init` instead of `/sig:new-project`:

```bash
cd /path/to/your-existing-project   # must be a git repo with commits
```

In Claude Code:

```
/sig:init
```

`/sig:init` runs four parallel scanner agents that read your repo (read-only — no installs, no edits) and produces:

- **`.planning/LANDSCAPE.md`** — a "lay of the land" derived from your code: detected languages and frameworks, project structure, git activity signals (cadence, contributors, hot files, health classification), test surface, open work signals (TODOs / CHANGELOG state), license, and a synthesized "What this project is" paragraph.
- **`.planning/PROJECT.md`** — a baseline project spec drafted from `LANDSCAPE.md`, with `[INFERRED — please verify]` markers on auto-filled fields and `[FILL IN — Signal could not infer this]` markers on forward-looking fields (Success Criteria, Done When, Scope-out — these need your input, not your code's inference).
- **`.planning/STATE.md`** — initialized to `Current Phase: CALIBRATE` so you can run `/sig:calibrate` next.
- **`.planning/scan/{stack,structure,activity,quality}.md`** — the raw per-scanner outputs that fed `LANDSCAPE.md`. Useful for verifying any inference Signal made.

**Before you run `/sig:calibrate`**, open `LANDSCAPE.md` and `PROJECT.md` and resolve the markers. Calibration depends on knowing reversibility, stakes, and horizon — all of which derive from your real goals, not Signal's inferred ones. Brownfield codebases tend to lean toward higher tiers (a 5-year-old codebase rarely calibrates to SKETCH; reversibility cost is non-trivial for established work).

If `/sig:calibrate` is run in a directory with no `.planning/`, it now auto-detects whether the project is brownfield (existing code + git history + tracked source files) and recommends `/sig:init` first — so you don't have to remember the order.

## `.planning/` is your project's memory — keep it in git

Signal's `.planning/` directory is **not scratch state**. It holds the project's institutional memory: state, decisions log, plans, verification reports. **Commit it. Do not add it to `.gitignore`.** Any contributor who clones a Signal project without `.planning/` loses every accumulated decision, every captured assumption, every plan that drove the current code shape.

Both `/sig:new-project` and `/sig:calibrate` check this on entry and refuse to proceed if `.gitignore` would silence `.planning/`. The check is non-negotiable; you can override it explicitly, and the override is logged.

## Privacy & telemetry

Signal makes **no network calls beyond what Claude Code itself makes to Anthropic's API**. All state lives in `.planning/` in your repo — no analytics, no telemetry, no usage pings, no remote logging.

Verify it yourself: `node tools/audit-network-calls.js`. The script greps `tools/`, `skills/`, `agents/`, and `commands/` for `fetch`, `axios`, `node-fetch`, `got`, `http.request`, and the usual `child_process curl|wget` shapes. Exit 0 means clean; exit 1 prints the violating path. The audit covers Signal's own source, not transitive npm dependencies — that responsibility stays upstream.

Any future telemetry would require a major-version bump, an explicit opt-in flag, and an updated audit script documented here.

## Command reference

- **`/sig:new-project`** — initializes a new (greenfield) Signal project. Creates `.planning/`, asks for project intent, writes `PROJECT.md`, transitions into CALIBRATE.
- **`/sig:init`** — brownfield onboarding for an existing codebase. Spawns 4 parallel scanner agents (stack / structure / activity / quality), writes `LANDSCAPE.md` + a baseline `PROJECT.md` (with `[INFERRED]` / `[FILL IN]` markers), transitions into CALIBRATE.
- **`/sig:calibrate`** — Phase 0. Five questions → tier → `PROFILE.md` with ten rigor toggles. The contract every other phase reads.
- **`/sig:escalate`** — re-runs calibration with prior answers as defaults, preserves `escalation_history`, and surfaces backfill warnings (e.g., strict Nyquist is one-way: code shipped before strict mode was active is structurally non-recoverable for strict Nyquist).
- **`/sig:discuss`** — DISCUSS phase. Loads `idea-refine` + `spec-driven-development` skills. Identifies gray-area decisions; locks them via 3-options-plus-other. Output: `CONTEXT.md`, `REQUIREMENTS.md` (FULL).
- **`/sig:plan`** — PLAN phase. Up to 4 parallel research agents. 8-dimension plan validation. Strict Nyquist test-coverage mapping. Output: `{phase}-RESEARCH.md`, `{phase}-PLAN.md`, `{phase}-VALIDATION.md`.
- **`/sig:execute`** — EXECUTE phase. Wave-based parallel execution. TDD where `tdd_required`. Atomic commit per task. Output: `{phase}-PROGRESS.md` + the actual code.
- **`/sig:verify`** — VERIFY phase. Acceptance-criteria walkthrough; full test suite; Nyquist compliance check at strict. Output: `{phase}-VERIFICATION.md`.
- **`/sig:review`** — REVIEW phase. Code quality, security hardening (OWASP / ASVS), performance, simplification. Output: `{phase}-REVIEW.md` with critical/important/suggestion/nit findings. (Skipped for SKETCH and SPIKE.)
- **`/sig:ship`** — SHIP phase. Pre-ship checklist, git history hygiene, PR creation. Output: `{phase}-SHIP.md`. (Skipped for SPIKE.)
- **`/sig:status`** — read-only inspection of the current project: tier, current phase, completed phases, blockers, open questions, recommended next action.
- **`/sig:resume`** — re-orientation briefing for a fresh session. Reads `PROJECT.md`, `PROFILE.md`, `STATE.md`, and the current phase's artifact, prints a concise summary, ends with "Ready to continue with `/sig:{phase}`?"
- **`/sig:add`** — capture a new idea or work item without breaking the current phase. Verbatim capture (no rewrites), atomic write, sensitive-data scrub, lock-protected. Not tier-gated. Capture defaults to `.planning/FUTURE-IDEAS.md`; `--question "…"` routes to `.planning/OPEN-QUESTIONS.md`, and `--milestone [N] "…"` routes to a `## Captured via /sig:add` holding section in a milestone file (current milestone when `N` is omitted, else `MILESTONE-N.md`). Routing is flags-only — with no flag, capture always lands in FUTURE-IDEAS.
- **`/sig:checkpoint`** — manual state refresh. Default (quick) mode diffs git log against `STATE.md` and refreshes. `--context` mode additionally prompts for decisions + open questions (D16 dual-write to `CONTEXT.md` + `DECISIONS.md` + `OPEN-QUESTIONS.md`). Use before a planned context clear so the next session's `/sig:resume` is genuinely useful.
- **`/sig:doctor`** — Claude Code plugin install-state diagnostician (macOS only first ship). Detects 5 documented failure modes — stale `gitCommitSha`, orphan cache, disabled-state-survives-reinstall, pre-rename `signal@signal` slug, SSH multi-identity. `--fix` generates a surgical remediation shell script; `--reinstall` generates the full canonical clean reinstall. Exits 0 healthy / 1 P-states / 2 doctor errored.

## Open Source Origins

Signal is a synthesis of patterns from many other people's work. The projects below shaped Signal's architecture directly — through code ported, ideas borrowed, or examples studied. Listed with thanks to their maintainers; their work is what made Signal possible.

### Directly ported (v1)

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — execution orchestration: wave-based parallel execution, 19 specialized agents, context monitoring, file-based `.planning/` state management, CLI tools layer.
- **[Agent Skills](https://github.com/addyosmani/agent-skills) (Addy Osmani)** — quality enforcement: 21 on-demand skills, 3 specialist agents (code-reviewer, security-auditor, codebase-analyst), anti-rationalization tables, phase gates.

### Inspiration for v2

- **[gstack](https://github.com/garrytan/gstack) (Garry Tan)** — 15-phase security audit, retro + learn memory loop, office-hours reframing.
- **[pm-skills](https://github.com/phuryn/pm-skills) (phuryn)** — upstream ideation / validation / strategy phases.
- **[superpowers](https://github.com/obra/superpowers) (Jesse Vincent / obra)** — harder TDD, systematic-debugging, `<HARD-GATE>` mechanism.
- **[compound-engineering](https://github.com/everyinc/compound-engineering) (Every Inc)** — post-ship Compound memory phase, multi-lens review panel.

### Patterns borrowed (without full ports)

- **[planning-with-files](https://github.com/OthmanAdi/planning-with-files) (OthmanAdi)** — hook-driven context discipline.
- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Yeachan-Heo)** — deep-interview spec-rigor gate, consensus planning.

### Bridge references

- **[GSD Skill Creator](https://github.com/Tibsfox/gsd-skill-creator) (Tibsfox)** — bridge reference for skill-creation patterns.

### Signal's own contribution

The Phase 0 calibration router (`/sig:calibrate` + `/sig:escalate`) and `PROFILE.md` schema are not from any source repo — Signal is the first plugin in this ecosystem to address the right-sized-rigor problem at the workflow-routing layer rather than at individual command level. Every downstream phase command reads `PROFILE.md` as its first action; that contract is what makes the calibration meaningful instead of decorative.

See `LICENSES.md` for full MIT license texts of the directly-ported (v1) source projects. v2 license texts will be added when code is actually ported, not speculatively.

## License

MIT. See `LICENSE`.

## Security

Found a vulnerability? See [`SECURITY.md`](./SECURITY.md) — preferred channel is a private GitHub advisory; email backup available.
