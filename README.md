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

**Requirements:** Node.js 22+ and Claude Code.

### Via Claude Code plugin marketplace

```bash
# In Claude Code:
/plugin install signal
```

Or add the marketplace entry pointing at `InsightRiot/signal` if installing from a custom marketplace.

### From source (for development or hacking on Signal itself)

```bash
git clone https://github.com/InsightRiot/signal
cd signal
npm install
node tools/validate-plugin.js   # should report all checks green
npm test                        # 93+ tests should pass
```

Then point Claude Code at the local plugin directory (settings → plugins → load from path), or symlink into your `~/.claude/plugins/` if you prefer.

**5-minute install target:** clone + `npm install` + validator pass takes well under that on a machine that already has Node 22 + git. Most of the time budget is `npm install` (the `yaml` runtime dep is the one external dependency).

## Your first project

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

## `.planning/` is your project's memory — keep it in git

Signal's `.planning/` directory is **not scratch state**. It holds the project's institutional memory: state, decisions log, plans, verification reports. **Commit it. Do not add it to `.gitignore`.** Any contributor who clones a Signal project without `.planning/` loses every accumulated decision, every captured assumption, every plan that drove the current code shape.

Both `/sig:new-project` and `/sig:calibrate` check this on entry and refuse to proceed if `.gitignore` would silence `.planning/`. The check is non-negotiable; you can override it explicitly, and the override is logged.

## Command reference

- **`/sig:new-project`** — initializes a new Signal project. Creates `.planning/`, asks for project intent, writes `PROJECT.md`, transitions into CALIBRATE.
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

## Credits & Heritage

Signal is a synthesis. The architecture borrows heavily — these are the source repositories with their roles in Signal's tier classification:

### Ported (v1)

- **[GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done)** — execution orchestration: wave-based parallel execution, 19 specialized agents, context monitoring, file-based `.planning/` state management, CLI tools layer.
- **[Agent Skills](https://github.com/addyosmani/agent-skills) (Addy Osmani)** — quality enforcement: 21 on-demand skills, 3 specialist agents (code-reviewer, security-auditor, codebase-analyst), anti-rationalization tables, phase gates.

### Planned (v2)

- **[gstack](https://github.com/garrytan/gstack) (Garry Tan)** — 15-phase security audit, retro + learn memory loop, office-hours reframing.
- **[pm-skills](https://github.com/phuryn/pm-skills) (phuryn)** — upstream ideation / validation / strategy phases.
- **[superpowers](https://github.com/obra/superpowers) (Jesse Vincent / obra)** — harder TDD, systematic-debugging, `<HARD-GATE>` mechanism.
- **[compound-engineering](https://github.com/everyinc/compound-engineering) (Every Inc)** — post-ship Compound memory phase, multi-lens review panel.

### Pattern source (ideas borrowed; not full ports)

- **[planning-with-files](https://github.com/OthmanAdi/planning-with-files) (OthmanAdi)** — hook-driven context discipline.
- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Yeachan-Heo)** — deep-interview spec-rigor gate, consensus planning.

### Reference (bridge / inspiration)

- **[GSD Skill Creator](https://github.com/Tibsfox/gsd-skill-creator) (Tibsfox)** — bridge reference for skill-creation patterns.

### Signal's own contribution

The Phase 0 calibration router (`/sig:calibrate` + `/sig:escalate`) and `PROFILE.md` schema are not from any source repo — Signal is the first plugin in this ecosystem to address the right-sized-rigor problem at the workflow-routing layer rather than at individual command level. Every downstream phase command reads `PROFILE.md` as its first action; that contract is what makes the calibration meaningful instead of decorative.

See `LICENSES.md` for full MIT license texts of the Ported (v1) source projects. v2 license texts will be added when code is actually ported, not speculatively.

## License

MIT. See `LICENSE`.
