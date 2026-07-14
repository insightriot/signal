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
| B2 | `fixed` | P2 | **FUTURE-IDEAS footer drift — new entries could land below the `*Last updated:*` footer.** Once any content sat below a stranded mid-file footer, `insertAboveFooter` buried every subsequent `/sig:add` above it. **Fixed in v0.1.5 (M4.5.E10.S3):** `insertFutureIdeasEntry` footer-repair (relocate footer to EOF + absorb stranded content, announce) + `lintFutureIdeasFooter` dogfood lint. Migrated from FUTURE-IDEAS 2026-07-13 (v0.1.6.S4). |
| B3 | `fixed` | P3 | **`/sig:add` derived-title cut mid-clause.** `deriveHeading` (`add.js`) sliced the first ~6 words / 60 chars, landing mid-clause (the "STATE.md append-without-evict" capture headed "closed-work narrative must"). **Fixed in v0.1.6 (FR4, `16155b3`):** prefer the first em-dash/`.`/`:`/`,` boundary (followed by whitespace; em-dash not hyphen; ≥20-char floor) before the length cap, word-slice fallback. Shared helper → all 3 capture destinations. |
| B4 | `fixed` | P2 | **Drain disposition-detector missed blockquote promotions.** The 2026-07-04 backlog review stamped promotions as `> **Promoted … → …**` blockquotes, which neither `HEADING_DISPOSED_RE` nor `STATUS_DISPOSED_RE` recognized — so promoted entries resurfaced on every `/sig:plan` drain (~42 candidates, incl. 6 already promoted). **Fixed in v0.1.6 (FR3, `df4fdb4`):** `parseEntries` scans the entry's header region for a `^`-anchored, fence-aware leading blockquote stamp. Live drain candidates 43→37 (FR3 alone; 35 after FR5 removed 3 entries). |

| B5 | `confirmed` | P3 | **`npm run lint` is broken — ESLint v9 with no flat config.** `package.json` pins `eslint ^9.0.0` (installed 9.39.4), which requires an `eslint.config.js`; none has ever been committed, so `npm run lint` exits 2 (`ESLint couldn't find an eslint.config.(js\|mjs\|cjs)`). **Pre-existing** (predates v0.1.6 — no lint config in git history; v0.1.6 touched none of it). Not a blocker: `npm run validate` (the plugin validator + 889-test vitest suite) is the effective quality gate. Surfaced during v0.1.6 VERIFY (2026-07-13). Fix = add a flat `eslint.config.js` (separate chore). |

*0 open · 1 confirmed · 1 dismissed · 3 fixed. Last updated: 2026-07-13.*
