# Milestone 4.5 — Release Hardening / Stranger-Adoption Readiness

**Goal:** Bridge from "v0.1.0 feature-complete" (M4 closed) to "real strangers can adopt this." Close the gaps that block word-of-mouth adoption — install-path bulletproofing, public-facing docs, vocabulary-friction reduction, and external validation — without expanding Signal's architectural surface.

**Estimated effort:** 5–10 focused days across 5 Epics. Each Epic ships as a v0.1.x minor release. Order is flexible; E1 (install-path) and E2 (`/sig:add`) are highest-leverage early.

**Blocked by:** M4 closed and v0.1.0 tagged (✓ 2026-05-12). Not blocked on usage data — these are known stranger-adoption gaps surfaced during M4.t19 follow-up conversation 2026-05-13.

**Done when:** A developer who has never seen Signal can (a) install it from the marketplace on a fresh machine, (b) read the README and understand within 2 minutes what it does and whether it's for them, (c) run `/sig:init` on an existing codebase and reach `/sig:ship` without consulting source files, and (d) capture new ideas via `/sig:add` without learning the vocabulary. At least 3 non-Signal users have completed this path with their feedback merged.

---

## Why a 4.5, not a 5 or a v2

Three reasons:

1. **M5 is locked as "v2 architectural ports"** per its own roadmap note — IDEATE/VALIDATE/STRATEGIZE/COMPOUND phases from pm-skills + gstack + compound-engineering. That's expansion, not hardening. Conflating release-hardening with v2 ports muddles both.
2. **Release hardening is patch/minor-release work, not architectural work.** README rewrites, CHANGELOG discipline, install verification, vocabulary-friction reduction — these are v0.1.x deliverables. Decimal numbering signals "between M4 and M5" without implying v2.
3. **The vocabulary lock landed in M4.t18** (Milestone / Epic / Phase / Wave / Task). Adding a "between" milestone exercises the new vocabulary's flexibility — and tests whether the locked terms hold up under a non-standard milestone shape. If 4.5 feels wrong, that's signal about vocabulary.

---

## Epics

Listed in suggested execution order. Each Epic is independently shippable as v0.1.x.

### Status snapshot (as of 2026-05-14)

| Epic | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | pending | F2 is headline; gates v0.1.1 |
| E2 — `/sig:add` capture-and-route | **S1 shipped 2026-05-14**; S2–S5 pending | Hot path done; force-route flags + interview + hardening + plan-loop remain |
| E3 — Public-facing docs rewrite | pending | |
| E4 — Worked example + comparison page | pending | |
| E5 — External validation + launch | pending | Cannot finish until E1–E4 land |

E2 plan + execute artifacts live in `M4.5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`.

---

### M4.5.E1 — Stranger-install path bulletproof

The single highest-leverage Epic. If the install path is broken, every other Epic's value is gated.

- **F2 resolution** — verify Claude Code auto-registers Signal's agents post-marketplace-install. Three viable outcomes: (a) it does, document and close. (b) it doesn't but the documented fallback in `/sig:init` Step 2 holds, document the limitation and close. (c) it doesn't and the fallback is brittle — restructure agents to flat `agents/sig-<name>.md` layout. Sub-question open since v0.1.0 tag; resolution unblocks confident promotion.
- **Fresh-machine install protocol** — actual cold install on a Mac (and ideally Linux/WSL) box you've never touched. Document the exact command sequence that worked. Catches papercuts the M4.t19 fix didn't surface (e.g., does `signal` marketplace conflict with prior `signal` plugin slug for users who installed pre-rename? — turns out yes, requires `/plugin uninstall signal@signal` first; this kind of finding belongs in install docs).
- **Versioning & deprecation policy** — write the policy that would have made the `signal → sig` rename non-painful for users (semver-strict? breaking changes only at 0.X.0 minors with explicit upgrade notes? deprecation period before removal?). One-page doc; lives in `docs/versioning.md`. Future renames cite it.

**Exit:** F2 resolved, install protocol documented + verified on at least one fresh machine, versioning policy committed.

### M4.5.E2 — `/sig:add` capture-and-route command

Detail in FUTURE-IDEAS.md entry of same name (logged 2026-05-13). Summary: lowest-friction capture for new ideas, routes default to FUTURE-IDEAS.md with planning-phase promotion. Stranger-adoption value is high — newcomers shouldn't need vocabulary fluency to capture ideas.

**Sliced into 5 waves** during PLAN phase 2026-05-14 (full plan in `M4.5.E2-PLAN.md`):

- **S1 — hardened hot path [shipped 2026-05-14].** `/sig:add "idea"` → atomic write to FUTURE-IDEAS.md. Verbatim capture, sensitive-data scrub, lock-protected, atomic write with EXDEV fallback. 40 tests. `commands/add.md` + `tools/lib/add.js` + minimal fixture + validator/README/CLAUDE.md wiring.
- **S2 — force-route flags [pending].** `--question`, `--milestone`, `--milestone N`, `--file` flags. New `tools/lib/milestones.js` helper for milestone-file resolution.
- **S3 — cold-path interview + heuristic hints [pending].** Naked-invocation 1–3 question interview; heuristic single-key overrides for power users.
- **S4 — stranger-safety hardening [pending].** First-run onboarding warning, brownfield-detection enrichment, `gate_strictness` honoring, vocab-lint validator extension.
- **S5 — close the loop [pending].** `commands/plan.md` "review FUTURE-IDEAS" step so captured entries get reviewed at the next planning gate.

- Design routing interview (1–3 questions, adaptive). [S3]
- Implement capture-flow tooling in `tools/lib/` (reuse existing `readProfile`, `readState`, `readOpenQuestions` helpers). [S1 done; S2 adds milestones.js]
- Wire validator's `REQUIRED_COMMANDS` [S1 done], `plugin.json` commands list (auto-discovered — no change needed), README [S1 done], decision-tree viewer (`docs/map/index.html`) [defer; viewer is calibration-focused], MCP/skill descriptions [defer until cross-skill changes].
- Tests: fixture-driven, verify each routing destination receives a well-formed entry. [S1: FUTURE-IDEAS destination covered with 40 tests; S2–S5 expand]

**Exit:** `/sig:add` shipped, all 5 routing destinations (FUTURE-IDEAS / OPEN-QUESTIONS / current MILESTONE / other MILESTONE / new MILESTONE scaffold) demonstrated working, anti-rationalization gates from the FUTURE-IDEAS entry honored.

### M4.5.E3 — Public-facing documentation rewrite

Current top-level docs read as internal architecture notes. Strangers need a pitch + quickstart, not a planning archive.

- **README rewrite as pitch.** Top of README: one-sentence what-it-is, a 30-second animated GIF or screen recording showing `/sig:init` → `/sig:status`, copy-paste install, first command to run. Move existing architecture content below a fold or into `docs/architecture.md`.
- **CHANGELOG.md** — establish the file with v0.1.0 entry (M4 close + signal→sig rename). Subsequent v0.1.x releases (each M4.5 Epic) append entries.
- **Requirements + compatibility matrix** — Node 22+, Claude Code version range, OS support (Mac confirmed; Linux/WSL pending E1's cross-platform install test).
- **CONTRIBUTING.md + SECURITY.md + issue templates** — signals to strangers that bug reports go somewhere.
- **Privacy/telemetry statement** — one section in README: "Signal makes no network calls beyond Claude's own API; all state lives in `.planning/` in your repo."

**Exit:** README opens with the pitch, CHANGELOG exists, compatibility documented, contribution/security paths visible, privacy statement explicit.

### M4.5.E4 — Worked example + comparison page

Strangers learn by seeing outputs and by understanding *why this, not the others*.

- **`examples/` directory** — pick a small public repo (e.g., a small Express app or Python CLI), run `/sig:init` on it, commit the resulting `.planning/` directory + a README explaining what was generated and why. Future Epics can add more examples (a Python project, a Rust project, a dormant repo).
- **Comparison/positioning page** — Signal vs. GSD vs. superpowers vs. Agent Skills vs. planning-with-files vs. compound-engineering. The 7-plugin landscape analysis in `analysis/REPO-ANALYSIS.md` is the raw material. Public-facing version focuses on *when to use Signal* (calibration router is the wedge) — not technical depth. ~60–80 lines, lives in `docs/vs.md`.

**Exit:** At least one worked example committed, comparison page published, both linked from README.

### M4.5.E5 — External validation + launch

Without external feedback, M4.5's earlier Epics are calibrated against a sample of one (the user).

- **Three friendly external testers** — not the author, not on the author's projects. Run `/sig:init` → `/sig:ship` on real work. Capture friction logs (where did they pause? what was confusing? what failed?). Friction logs become v0.1.(N+1) backlog.
- **Launch post** — short, ~600–800 words. Lead with the 7-plugin landscape analysis (genuinely original content) → Signal as the synthesis + calibration router. Distribution channels TBD; minimum bar is a GitHub release announcement linking to the post.
- **v0.1.x → v0.2.0 decision point** — after external feedback merges, evaluate: is v0.2.0 warranted (cumulative changes), or stay on v0.1.x until M5 work begins? Versioning policy from E1 governs this call.

**Exit:** 3 external tester reports captured, launch post published, version bump decision made + tagged.

---

## Exit Criteria for Milestone 4.5

All 5 Epics shipped. At least 3 non-Signal users have run `/sig:init` through `/sig:ship` on real projects. Friction logs from those runs reviewed; resulting fixes either shipped or promoted to FUTURE-IDEAS / M5. README opens with a pitch a stranger can parse in 60 seconds. Install path verified on at least one fresh non-author machine.

## Notes

- **`/sig:add` (E2) likely lands first** despite being listed second. It's small, self-contained, and immediately useful for capturing the rest of M4.5's emergent work. F2 (E1) is technically harder but doesn't block other Epics from starting in parallel.
- **E5 (external testers) cannot finish until E1–E4 land** — strangers shouldn't be the ones discovering install-path bugs or README opacity.
- **No new architectural surface.** M4.5 explicitly does *not* add phase commands, new tier values, or change PROFILE.md schema. Anything that would do those things belongs in M5 or a new FUTURE-IDEAS entry.
- **Versioning discipline starts with this milestone.** Pre-M4.5, `signal → sig` shipped without a written deprecation policy. From M4.5.E1 onward, breaking changes follow the policy.
- **Numbering choice (4.5 vs. promoting to M5):** Decimal preserves M5's identity as "v2 architectural ports." If M4.5 grows beyond 5 Epics (and especially beyond release-hardening into new feature work), reconsider whether it should be renamed M5 with the current M5 becoming M6. Don't make that call until at least 3 Epics ship and the scope is concrete.

---

*Created 2026-05-13 in response to release-hardening / stranger-adoption gap surfaced during M4.t19 follow-up conversation. Expect rewrite as Epics ship and external feedback rolls in.*
