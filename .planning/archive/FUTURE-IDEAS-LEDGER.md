# FUTURE-IDEAS — archive ledger

Terminally-disposed entries (SHIPPED / PROMOTED / MERGED / DELETED) evicted from
`.planning/FUTURE-IDEAS.md`. Append-only; DEFERRED entries stay in the inbox.

<!-- evicted-key: ea40589ee3f7debfe00a25550db9a8efc9326c95 -->
## Hook output format reference doc

> **Promoted 2026-07-04 → M4.5.E10** (trust-hardening Epic, v0.1.5) — pairs with the SessionStart smoke test. See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Status:** Logged 2026-05-26 at M4.5.E9 REVIEW close.

**Trigger.** M4.5.E9.S1.t7 needed to emit a SessionStart hook payload that injects an `additionalContext` warning. The shape used was:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "..."
  }
}
```

This was inferred from existing Claude Code patterns + cached plugin behavior — there is no `references/hooks-api.md` in this repo that documents the exact JSON shape the hook should emit per event type. If a future hook needs `PreToolUse` denial shapes or `PostToolUse` data injection, the author has to re-discover the format.

**Proposal.** Add `references/hooks-api.md` documenting each Claude Code hook event Signal uses + the exact stdin/stdout/exit-code contract per event:

- `PreToolUse(Edit|Write)` — read event JSON from stdin (shape: `{tool_name, tool_input: {file_path, ...}}`); exit 0 to allow, exit 2 + stderr to block.
- `SessionStart(resume|startup|clear)` — emit JSON to stdout: `{hookSpecificOutput: {hookEventName, additionalContext}}` to inject context; exit 0.
- Plus the matchers in `hooks.json` and how Claude Code routes events.

**Why not just link to upstream docs.** Upstream Claude Code docs cover the API surface in general terms; Signal's `references/` exists to capture exactly the subset Signal uses + the Signal-specific conventions (e.g., fail-open on malformed JSON, sync I/O for synchronous hook decisions).

**Resolve by.** Next Epic that adds a new hook surface, or a routine docs-refresh round. Low priority — workable as-is, but a stranger reading Signal's hook scripts has to grep the source rather than read a doc.

**Cross-references:** `.planning/archive/M4.5/E9/M4.5.E9-REVIEW.md` § 8.

---


<!-- evicted-key: 46ac5120a0e4edd9a9be160e2acea3765c9a42df -->
## SessionStart-resume hook manual smoke test (M4.5.E9 follow-on)

> **Promoted 2026-07-04 → M4.5.E10** (trust-hardening Epic, v0.1.5). See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Status:** Logged 2026-05-26 at M4.5.E9 SHIP. Known limitation, not blocking SHIP.

**Trigger.** M4.5.E9.S1.t7 added a `SessionStart(resume)` hook that emits an `additionalContext` warning when STATE.md shows a dirty-EXECUTE state. The unit tests (`tests/hook-state-write.test.js`) cover the JS logic of `detectDirtyExecute` end-to-end. The hook-firing handshake — Claude Code → SessionStart event → matcher `resume` → `node hooks/warn-dirty-execute.js` → stdout JSON → context injection — is **not yet verified in a real session**. PreToolUse smoke was confirmed (exit 2 + stderr block) but SessionStart-resume was not.

**Proposal.** When the user has a convenient moment, exercise the smoke test in a real Claude Code session:

1. Synthesize a dirty-EXECUTE state: edit STATE.md frontmatter to `phase: EXECUTE` + `current_epic: M4.5.E9` (already there); ensure MILESTONE-4.5.md shows E9 as shipped (which it does post-SHIP); delete or rename `.planning/M4.5.E9-RETROSPECTIVE.md` temporarily.
2. Quit the Claude Code session.
3. Run `claude --continue` or open a session in the same project. The SessionStart(resume) hook should fire and inject the additionalContext warning visible in the next message.
4. Restore the retro file (or run `/sig:resume`).

**Why deferred.** The unit tests cover the load-bearing logic. The hook handshake is a Claude Code platform contract that's been observed working on the existing `session-start.sh` plugin hook (the unmatched-default SessionStart entry); the matcher-specific resume variant uses the same mechanism. Practically high-confidence but not yet empirically verified.

**Resolve by.** Whenever the user wants to validate; alternatively, fold into a future install-verification matrix entry.

**Cross-references:** `.planning/archive/M4.5/E9/M4.5.E9-VERIFICATION.md` § 5.2 #2; `.planning/archive/M4.5/E9/M4.5.E9-REVIEW.md` § 8.

---


<!-- evicted-key: 9907b401a98f2f34a42d6cf5beef392bbca34193 -->
## `/sig:resume` origin-drift detection (2026-05-19)

> **Promoted 2026-07-04 → M4.5.E10** — bundled with STATE auto-update Option A per BR-3 (verified still open same day: no `isStaleVsOrigin` in `tools/lib/state.js`). See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Problem:** `/sig:resume` reads local `STATE.md` as the source of truth. If another machine shipped work to origin but the commit didn't touch `STATE.md`, `/sig:resume` orients against stale local state and the user re-plans work that's already done. Happened 2026-05-19: biz-machine Claude session shipped M4.5.E1.S2 Phase A as `f38187a` (no STATE.md touch); dev-machine `/sig:resume` next session re-planned the same Epic from scratch. ~90 min duplicate planning work.

**Enhancement:** at the start of every `/sig:resume` (and likely `/sig:status` + `/sig:checkpoint`):
1. `git fetch origin` (read-only, ~1 sec).
2. Compare `origin/<default-branch>` HEAD vs `STATE.md.last_updated_commit` (the field added in E6.S1).
3. If origin has commits the local STATE doesn't acknowledge:
   - Surface a banner: "⚠ origin has N commits since last STATE update. Recent commits: ... Consider `git pull` before continuing."
   - Highlight if any of the new commits touched `.planning/` files — that's strong signal another Signal session shipped work.
4. Do not block; surface drift, let user decide.

**Why E6 didn't catch this:** E6's staleness check compares `STATE.md.last_updated` against the most recent `.planning/` commit *on local main* (not origin). Catches the case where Signal commands didn't update STATE; doesn't catch the case where another machine's commits aren't yet pulled. Different failure modes.

**Scope:** small. Add helper `isStaleVsOrigin(baseDir)` to `tools/lib/state.js`; wire into `/sig:resume` + `/sig:status` + `/sig:checkpoint`. Tests: fixture where local STATE.md points at one commit but origin has 2 newer commits in `.planning/`.

**Slot:** likely a slice in M4.5.E1 S5 (validator hardening + tooling polish) or its own micro-Epic. Defer-or-promote decision at next planning session.

---


<!-- evicted-key: 2635c7a6e32839fd7572926a18a3b115ec6473a6 -->
## Drain safety check — an unclosed

> **Promoted 2026-07-04 → M4.5.E10** (capture-pipe guard). See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Status:** Logged 2026-05-31 via `/sig:add`.

Drain safety check — an unclosed code fence can hide ideas. If a FUTURE-IDEAS entry contains an opening triple-backtick code fence with no matching close, the /sig:plan drain treats everything below it as inside the fence and skips every entry after it — they become invisible in the candidate list (not deleted, just not shown). Low risk while the file stays well-formed markdown.

Possible fix: in tools/lib/drain.js parseEntries, if the fence is still open at end-of-file, warn (or treat the dangling fence as closed) so a typo cannot silently hide ideas from the drain. Surfaced in M4.5.E2 REVIEW (finding S4).

---


<!-- evicted-key: f046f15e1035effa3561028151af4af9b197b90c -->
## STATE.md auto-update protocol — extend beyond EXECUTE waves

> **Promoted 2026-07-04 → M4.5.E10** — Option A ratified (BR-3), bundled with origin-drift detection as one slice (shared failure mode + shared fixtures). Options B/C parked on the Trigger watchlist entry. See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Status:** Logged 2026-05-24. Trigger: hit during M4.5.E3 DISCUSS work. After E7 SHIP closed (commit `8723967`, 2026-05-23), `last_updated_commit` in STATE.md frontmatter stayed pinned at `8723967` across 5+ subsequent commits spanning E8 scaffolding, E3 DISCUSS lock, vocabulary updates, docs/map work, and E3 DISCUSS revision. The frontmatter was only refreshed by manual intervention after the user called it out as "a bug."

**Context.** E6 (v0.1.2, 2026-05-18) shipped the STATE.md auto-update protocol as part of resume reliability. The protocol fires during EXECUTE waves — `commands/execute.md` and the executor agent both write STATE.md frontmatter after each task commit. **DISCUSS, PLAN, REVIEW, and SHIP phases don't have the equivalent.** Phase-entry transitions update `phase:` and `completed_phases:`, but `last_updated_commit` and `last_updated` only refresh when an EXECUTE-phase task ships. Result: any work done during DISCUSS or PLAN — including the DISCUSS phase artifact commits themselves, vocabulary refinements, milestone-doc updates, scoping decisions — leaves the frontmatter pointing at the previous EXECUTE commit.

`/sig:checkpoint` exists as the manual escape hatch, but it requires conscious invocation. The protocol is only as good as the human remembering to run it; in practice, between-EXECUTE work accumulates silently.

**Symptom inventory** (cases the gap manifests):

| Case | Example | What goes stale |
|---|---|---|
| DISCUSS phase commits | Today: bc8b10b (DISCUSS lock), b4aa79b (DISCUSS revision) | `last_updated_commit`, `last_updated`, `last_decision_at` |
| PLAN phase commits | Plan artifact writes, validation refinements | Same fields |
| Out-of-flow doc edits | Vocabulary additions (`939ecf4` Tier, `7339b5d` Slice) | Same fields |
| Parallel-machine work | A peer commits from another machine without running EXECUTE | Same fields + origin drift |
| Manual SHIP polish | `[BREAKING]` flag tweaks, README cross-link audits | Same fields |

**Why it matters.** `/sig:resume` reads frontmatter as the authoritative re-orientation source. A frontmatter pointing 5 commits back means:

- Staleness banner correctly fires (good — the gap doesn't *hide*).
- But the recommended next action is computed against stale context.
- The contributor (human or AI) opening a fresh session sees "last commit: <some ancient hash>" and has to manually run `git log` to bridge — defeating the entire briefing contract `/sig:resume` is meant to provide.

The 2026-05-19 origin-drift incident already proved this class of problem produces ~90 min of duplicate work. Today's case is gentler (single machine, just intra-conversation freshness) but the failure mode is identical.

**Candidate direction.**

Three options, ascending cost:

### Option A — Extend the protocol to every phase command (lowest cost)

Each `commands/{discuss,plan,verify,review,ship}.md` ends its workflow with a "refresh STATE.md frontmatter" step, same shape as the executor agent's step 6 (write `last_updated_commit: <HEAD>`, `last_updated: <ISO now>`). One step appended to 5 command markdowns.

**Pros:** Localized change. Doesn't require a new tool. Each command knows when its work "ends" so the refresh happens at the natural transaction boundary.
**Cons:** 5 commands updated; risk of drift if one of them forgets. Doesn't cover out-of-flow doc edits (vocabulary commits, MILESTONE-x.md edits made outside any `/sig:*` command).

### Option B — Add a post-commit hook approach (mid cost)

A documented opt-in git hook (`.githooks/post-commit`) that runs `node tools/refresh-state.js` after every commit, regardless of which `/sig:*` command (if any) drove it. The script reads HEAD + current time and patches STATE.md frontmatter.

**Pros:** Catches every commit, including out-of-flow edits and parallel-machine sessions. No discipline burden on the user.
**Cons:** Git hooks are opt-in (each clone has to enable them via `git config core.hooksPath .githooks`). Not portable across IDEs (some don't trigger hooks the same way). Risk: hook running during a rebase or amend creates weird intermediate frontmatter writes.

### Option C — Compute on-read instead of writing on-commit (highest cost)

`/sig:resume` and `/sig:status` recompute "last commit" by calling `git log -1` at read time, never trusting a stored field. STATE.md frontmatter drops `last_updated_commit` entirely; staleness becomes definitionally impossible because there's no stored value to go stale.

**Pros:** Eliminates the gap class entirely. The frontmatter only stores fields that *can't* be re-derived (phase, current_epic, blockers).
**Cons:** Bigger schema change (`schema_version: 1` → `schema_version: 2`); breaks any external tooling that reads the field. Auto-migration logic needed. Decision-trail fields (`last_decision_at`) still need writing; only the derivable ones move to read-time.

**Recommended starting point.**

Option A as the minimum viable fix — append "refresh STATE.md frontmatter" to the 5 non-EXECUTE phase commands. Probably 1–2 hours of work + tests. Defers Option B / C until evidence shows discipline-based refresh keeps failing.

**Triage hint.** This sits between "Signal enhancement" and "resume-reliability bug." If it's a bug, it belongs in a release-hardening Epic; if it's an enhancement, it belongs after M4.5 closes. **Recommended:** treat as a P2 bug — slot into M4.5 as a fast follow on E6 (call it E6.S7 or a new mini-Epic) **only if a second instance happens** during M4.5's remaining work. Otherwise, ship as part of v0.1.3-or-later release-hardening pass once E5 launch posture is clearer.

**Source data.** STATE.md frontmatter, `commands/execute.md` step-6 protocol, `agents/executors/executor.md` task-completion step, `tools/lib/state.js` (writers + readers), `references/state-schema.md` (the contract definition). See M4.5.E6 SHIP artifacts in `.planning/` + commit `8723967` (E7 SHIP) for the most recent canonical example of the EXECUTE-only refresh in action.


<!-- evicted-key: 512837ebb9328c1cf279de95a645b7988547b0af -->
## `/sig:resume` artifact-resolution doesn't recognize Epic-prefixed naming (`M4.5.E3-PLAN.md`)

> **Promoted 2026-07-04 → M4.5.E10** — verified still open same day (`commands/resume.md` Step 3 still lists only the 3 legacy patterns). See DECISIONS 2026-07-04 + MILESTONE-4.5.md § E10.

**Status:** Logged 2026-05-24. Trigger: M4.5.E3 PLAN phase complete; in preparing for a context clear, observed that `/sig:resume`'s artifact-resolution table won't find `M4.5.E3-PLAN.md` and will degrade to a "Note: expected artifact for PLAN not found" line.

**Context.** `commands/resume.md` Step 3's resolution rules try three filename patterns for the current phase's artifact:

1. `{N}-{ARTIFACT}.md` for any `N` in `[1..9]` — numeric/GSD-style prefix (e.g., `1-PLAN.md`).
2. `{ARTIFACT}.md` — no-prefix simplified form (e.g., `PLAN.md`).
3. `{PHASE_NAME}-{ARTIFACT}.md` — literal-substitution (e.g., `PLAN-PLAN.md`).

Signal's actual convention since the Milestone/Epic vocabulary lock (`939ecf4`, `7339b5d`) is **Epic-prefixed**: `{epic-id}-{ARTIFACT}.md`. Examples shipped:

- `.planning/archive/M4.5/E3/M4.5.E3-REQUIREMENTS.md`
- `.planning/archive/M4.5/E3/M4.5.E3-RESEARCH.md`
- `.planning/archive/M4.5/E3/M4.5.E3-PLAN.md`
- `.planning/archive/M4.5/E3/M4.5.E3-VALIDATION.md`
- `.planning/archive/M4.5/E7/M4.5.E7-PROGRESS.md`
- ... and every other M4.5.E* artifact

None of these match patterns 1, 2, or 3.

**Impact.** Every `/sig:resume` against a project mid-Epic hits the "expected artifact not found" path and skips the most useful briefing content — the task breakdown, slice status, or current-phase notes. The user has to manually `cat` the file to see what's planned. Briefing still works (tier + Epic + Vision + decisions + next-action all come from STATE.md + PROJECT.md + CONTEXT.md), but the artifact-content section that's supposed to make resume "rich" is empty.

This Epic (M4.5.E3) just shipped a 9-task PLAN.md, and `/sig:resume` won't surface a single task in the briefing without this fix.

**Staleness inventory** (cases the gap manifests):

| Artifact | File on disk | Resolver finds? |
|---|---|---|
| Epic PLAN | `M4.5.E3-PLAN.md` | ❌ no |
| Epic PROGRESS | `M4.5.E7-PROGRESS.md` | ❌ no |
| Epic VERIFICATION | `M4.5.E6-VERIFICATION.md` | ❌ no |
| Epic REVIEW | `M4.5.E6-REVIEW.md` | ❌ no |
| Epic SHIP | (would be `M4.5.E3-SHIP.md`) | ❌ no |
| Epic RESEARCH | `M4.5.E3-RESEARCH.md` | ❌ no (and resume doesn't yet load this) |
| Project-level | `PROFILE.md`, `STATE.md`, `CONTEXT.md`, `PROJECT.md` | ✅ yes (named directly) |

**Candidate direction.**

Extend the resolver to recognize a 4th pattern as the FIRST attempt (since it's the actual Signal convention now):

```
0. {state.current_epic}-{ARTIFACT}.md — Epic-prefixed (e.g., M4.5.E3-PLAN.md)
1. {N}-{ARTIFACT}.md for N in [1..9]
2. {ARTIFACT}.md
3. {PHASE_NAME}-{ARTIFACT}.md
```

Read `state.current_epic` from STATE.md frontmatter (already loaded for the briefing); if non-null, try the Epic-prefixed form first. Falls through to existing patterns for projects that don't use Epic-prefixed naming (legacy `.planning/` directories from M1-M4 used numeric prefixes).

**Scope of fix.**

- `commands/resume.md` Step 3 table — add the new pattern as bullet 0.
- `tools/lib/resume.js` (if the resolver lives there as helper code) — add the Epic-prefix branch.
- `tools/lib/status.js` `nextActionForPhase` — verify it doesn't share the same resolver bug. (Probably not — it computes the *next-phase recommendation*, not the artifact path.)
- Tests: one new vitest case asserting Epic-prefixed resolution works on a fixture project with `current_epic: M4.5.E99` and `.planning/M4.5.E99-PLAN.md` on disk.

**Cost estimate.** ~30 LOC change + ~25 LOC test = 1-2 hours including verification on M4.5.E3 (this Epic, mid-flight).

**Triage hint.** P2 — a real briefing-quality regression that hits every Epic-mid-flight resume call. Worth slotting into M4.5 as a fast-follow tooling fix if `/sig:resume` is run more than ~2-3 times before another release; otherwise, batch with a release-hardening tooling sweep. Either way, ship before any external launch where strangers might run `/sig:resume` on their own Signal-managed project. Related to `/sig:resume` origin-drift gap (also logged) — both are resume-reliability papercuts that compound to "the briefing doesn't actually brief."

**Source data.** `commands/resume.md` (resolution rules in Step 3); `tools/lib/resume.js` (if helper exists); existing `.planning/M4.5.E*` artifacts as proof of the convention; STATE.md `current_epic` field availability since schema_version 1 (M4.5.E6 ship).

---

