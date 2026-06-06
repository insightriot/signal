# Signal — Bugs & Findings

Lightweight catalog of bugs, defects, and verified findings for Signal itself.
Markdown-native by design — GitHub Issues are deferred until Signal has live
users (see `FUTURE-IDEAS.md` § "GitHub Issues for work-item tracking — deferred").

**Discipline** (per the "always catalog bugs" norm): catalog a finding the moment
it surfaces → **triage** (read the code / confirm the root cause) → mark
**confirmed** or **dismissed**. Never graduate a finding to a confirmed bug
unverified.

- **Status:** `needs-triage` · `confirmed` · `dismissed` · `fixed`
- **Priority:** `P1` ship-blocker · `P2` should-fix · `P3` nice-to-have
- **Scope:** defects + verified findings only. Architectural ideas → `FUTURE-IDEAS.md`;
  design questions → `OPEN-QUESTIONS.md`; decisions → `DECISIONS.md`.

| ID | Status | Pri | Summary |
|---|---|---|---|
| B1 | `dismissed` | — | **`/sig:checkpoint` "Epic-ID-as-task-ID" + "only 2 of 5 commits".** Non-bug (triaged 2026-06-06). `isStateStale` deliberately filters the commit walk to `STATE_AFFECTING_PATHS` (`state.js:583`, D6 — editing future-ideas / decisions / milestone files is metadata curation, excluded by design), so 2-of-5 counting is correct. `TASK_ID_RE` (`checkpoint.js:25`) intentionally matches every hierarchy level, so `taskIdsInCommits` can include Epic/milestone IDs — harmless: it only filters `current_tasks`, which holds full task IDs. Surfaced from unverified surface behavior during a `markFresh` detour; reading the source dismissed it. |

*0 open · 1 dismissed. Last updated: 2026-06-06.*
