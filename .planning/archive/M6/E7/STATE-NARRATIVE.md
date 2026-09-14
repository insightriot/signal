# Phase log archive

Finished runs relocated out of `STATE.md` by Signal (M5.E9 FR5). Append-only; nothing here is ever rewritten.

## Phase log — Epic M6.E7 (archived 2026-09-07) <!-- phase-log:archived -->

- DISCUSS (2026-09-05)
- PLAN (2026-09-05)
- EXECUTE (2026-09-06)
- VERIFY (2026-09-06)
- REVIEW (2026-09-06)
- EXECUTE (2026-09-06)
- VERIFY (2026-09-06)
- REVIEW (2026-09-06)
- SHIP (2026-09-06)


<!-- Relocated verbatim from .planning/STATE.md on 2026-09-14 during M6.E8 EXECUTE, when STATE.md
     crossed its 40 KB ceiling (tools/doc-budgets.json). M6.E7 shipped and merged as PR #239; this is
     its closed resume-pointer narrative, on the same relocate-never-delete terms as archive/M6/E6/.
     Retro: .planning/M6.E7-RETROSPECTIVE.md. The phase log above was archived separately (M5.E9 FR5). -->

### ▶ PREVIOUS — `M6.E7` shipped and merged (PR #239), 2026-09-06

**`M6.E7` — `/sig:advise`, the Roadmap Advisor.** Merged 2026-09-06 as
[PR #239](https://github.com/insightriot/signal/pull/239). Signal's **23rd command**: read-only, it
reads this project's own `.planning/` corpus and writes one dated advisory naming what to work on
next *and every live row it looked at and passed over*. **Every claim carries a `path:line` citation
resolved against disk before the file is written.** 2979 → **3304 tests**. Artifacts:
[`M6.E7-RETROSPECTIVE.md`](M6.E7-RETROSPECTIVE.md) (read this one — the findings are in it),
[`M6.E7-VERIFICATION.md`](M6.E7-VERIFICATION.md), [`M6.E7-REVIEW.md`](M6.E7-REVIEW.md).

**⚠ PR #239 WAS SQUASHED — the third instance, and the first one whose cause is now known.** All 35
Epic commits were collapsed into one, orphaning two published anchors and turning
`tests/adherence-anchor-reachability.test.js` **red on `main`**. Repaired by
[PR #240](https://github.com/insightriot/signal/pull/240), which re-pins both to `63c5d95`.
**The cause is not carelessness: GitHub's merge button remembers the last method used
REPO-WIDE.** The fix lane correctly squashes, which leaves the button on squash, and the next Epic
inherits it silently and reports success. `#236`'s row said the root cause was *"still open pending
one question about how #236 was merged"* — **that question is now answered.** Filed as `B117`.

⚠ **The per-commit history survives only on the branch** `feat/m6.e7-roadmap-advisor`, which is
pushed to origin. GitHub deleted it at merge and it existed on one machine for a few minutes. If you
want the reasoning behind a line — why the citation gate counts instead of trusting a flag, why the
backlog is read at `maxDepth: 4` — it is in those 35 commit messages, not in `main`.

**What `M6.E7` learned, in one line, because the retro says it at length:** six times in one Epic a
claim was written from the shape of the work rather than derived from the artifact — **in the Epic
that built a mechanism against exactly that.** Two of the six reached committed artifacts. The
feedback items with triggers are in the retrospective's *What to feed back into Signal*.

**Open, and worth knowing before you pick anything up:**
- **`B116`** (P2) — `diffRequirementCoverage` drops a real requirement from its denominator on **21
  of 22** `*-REQUIREMENTS.md` artifacts here. A false clean in the check built to stop unfalsifiable
  coverage claims. Found by *using* it during `M6.E7` VERIFY.
- **`B117`** (P2) — the sticky merge button, above.
- **PR #240** — open, fix lane, `--squash`. `main` is red until it merges.
- **PR #238** — open, fix lane, merge guidance for button users. Also `--squash`.
- `Q-M6E6-1` in [`DECISION-QUEUE.md`](DECISION-QUEUE.md), still unanswered. Product-altitude.
- ⚠ **`/sig:drive` has still never been run end to end** — unchanged by this Epic, and still the
  gate on further loop work.

---
