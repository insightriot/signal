# Backlog review — 2026-10-20

What to work on next in signal, read from its own `.planning/` corpus.

**This changes nothing on its own.** It proposes; you pick. Nothing in `.planning/` was modified, no row was struck, and nothing was added to the decision queue.

The priorities are a **judgment**, made by the agent that ran this command from a digest of this project's documents. Another run over the same files can propose different ones. What is checked is that each one cites lines that exist and covers rows and bugs that are live.

*Produced `via /sig:advise`.*

## Corpus read

**Read:** work records (backlog rows) · work records (bugs) · STATE/closure · milestone rows · other branches — the work store is on, so BACKLOG.md and BUGS.md, its views, were not opened.

**Consulted by the row inputs:** `BACKLOG.md`.

**Read, not consulted:** `BUGS.md` — read from the work records for the covers; the row inputs run no discharge check on a work store; `STATE/closure` — read from the work records for the covers; the row inputs run no discharge check on a work store; `milestone rows` — kept because it is cheap and is the natural home for a future "already sequenced into an open Epic" input; no ranking input reads it; `other branches` — not ranked — no Epic is open on another branch.

**Could not read:** nothing — all 5 sources were readable.

**Digest read** (re-read when this file was written): vision · milestone · open Epics · bugs · backlog · retrospectives · open questions · inbox.

**Digest cut to fit:** retrospectives: the newest 3 read, 42 older not opened; open questions: 10 of 11 shown.

**Digest note:** 1 backlog row(s) dropped (discharged, self-declared not live, or folded) are not offered here — they cannot be covered, and the advisory lists them under Dropped.

## Open on other branches

1 unmerged branch(es) carry a `STATE.md` with no Epic id, so they could not be compared: `worktree-dogfood-status`.

## Citation rule

Every claim below ends with a citation. A work item is cited by its own record file, which had to exist; any other citation names a repo-root-relative path and line, and the line had to be inside the file. Each one was resolved against disk before this file was written. A citation that did not resolve fails the run, and this file would not exist. What that does NOT check is whether the cited file or line says what the claim says it says.

## Priorities — 4

### 1. Make the review loop's signals trustworthy, then prove them with a driven Epic

**Why:** M6.E17 made REVIEW passes countable, and its own retro says the next step is to exercise that with /sig:drive on a real Epic. But the PR reviewer passed #304 without reading it, an old PASS can lift the loop ceiling, and recordPass/checkFixRounds trust a line as written. A driver built on these signals stops only as well as they hold. — evidence: `.planning/M6.E17-RETROSPECTIVE.md:103`, `.planning/M6.E17-RETROSPECTIVE.md:104`, `.planning/work/items/00/SIG-348.md:1`, `.planning/work/items/00/SIG-349.md:1`, `.planning/work/items/00/SIG-344.md:1`

Covers:

- **`SIG-348`** The PR reviewer passed PR #304 without reviewing again (4 turns, $0.11 on 6861 lines) — open bug. — evidence: `.planning/work/items/00/SIG-348.json`
- **`SIG-349`** Loop ceiling: an old PASS record lifts the ceiling when a later visit left no record (needs a visit marker) — open bug. — evidence: `.planning/work/items/00/SIG-349.json`
- **checkFixRounds and recordPass: trust gaps and missing tests (passes 3–4)** — backlog row. — evidence: `.planning/work/items/00/SIG-344.json`
- **checkFixRounds: tie each round's range and parent-run base together, and say the base for round 2+** — backlog row. — evidence: `.planning/work/items/00/SIG-335.json`
- **recordPass / phase_passes: check the phase matches STATE, and the date on read** — backlog row. — evidence: `.planning/work/items/00/SIG-337.json`
- **`SIG-343`** A re-invoked /sig:ship records SHIP as a phase left, leaving a stray SHIP entry in the live list — open bug. — evidence: `.planning/work/items/00/SIG-343.json`
- **`SIG-319`** /sig:resume says "Next phase: done" at SHIP while the PR is unmerged and the close waits — open bug. — evidence: `.planning/work/items/00/SIG-319.json`
- **`SIG-336`** review-rounds.js: parsing edges (empty Parent run line, placeholders, fences, duplicates) — open bug. — evidence: `.planning/work/items/00/SIG-336.json`
- **markRunEnded / linear run boundary: idempotence, Epic mode, symlinked report, staging** — backlog row. — evidence: `.planning/work/items/00/SIG-342.json`

### 2. Get other projects onto the work store: corpus project 1, then project 2's list shapes

**Why:** The migration command shipped in v0.1.50 and has not been run on a real project yet; that run is yours to do, at an Epic boundary. The design doc rates the whole overhaul 9/10 only if other projects get onboarded soon, and corpus project 2's shapes (a prose roadmap backlog, status written in the text) are known not to migrate cleanly today. — evidence: `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md:126`, `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md:128`, `.planning/work/items/00/SIG-290.md:1`

Covers:

- **/sig:docs-migrate --work-store: support corpus project 2 list shapes (prose roadmap backlog, long write-ups with status in the text)** — backlog row. — evidence: `.planning/work/items/00/SIG-290.json`
- **`SIG-308`** The v1-to-v2 migration manifest names a guessed default branch beside closes that no longer use the guess — open bug. — evidence: `.planning/work/items/00/SIG-308.json`
- **Jev second opinion on migrated closes (flag-only) — build only if a migrated close proves wrong** — backlog row. — evidence: `.planning/work/items/00/SIG-291.json`
- **run /sig:docs-migrate --work-store on corpus project 1 (run by Brett) and file what it gets wrong** — unfiled: not in the corpus yet, so there is no line to cite.

### 3. Make a VERIFY result something you can trust: typed verdicts plus a correct coverage count

**Why:** Typed verdicts on VERIFICATION and REVIEW are the next stage of the storage plan. The coverage check those verdicts would rest on is known to be wrong today: it drops a requirement from its count on 21 of 22 artifacts, and it counts a criterion marked FAIL as covered. A typed verdict built on that count would make a wrong answer look official. — evidence: `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md:123`, `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md:161`, `.planning/work/items/00/SIG-116.md:1`, `.planning/work/items/00/SIG-126.md:1`

**Comes after:** priority 1 (Make the review loop's signals trustworthy, then prove them with a driven Epic).

Covers:

- **`SIG-116`** `diffRequirementCoverage`'s denominator silently drops a real requirement on 21 of 22 REQUIREMENTS artifacts in this… — open bug. — evidence: `.planning/work/items/00/SIG-116.json`
- **`SIG-126`** `diffRequirementCoverage` counts a requirement as verified when the VERIFICATION report merely MENTIONS its id — so a… — open bug. — evidence: `.planning/work/items/00/SIG-126.json`
- **`SIG-100`** `diffRequirementCoverage` cannot see a letter-suffixed acceptance-criterion id, and reports `covered` while blind to it. — open bug. — evidence: `.planning/work/items/00/SIG-100.json`
- **`SIG-101`** `diffRequirementCoverage` clears a requirement group from `unattributableGroups` when the report merely *names* the… — open bug. — evidence: `.planning/work/items/00/SIG-101.json`
- **`SIG-50`** Completeness claims are written from the shape of the work rather than from the artifact — and Signal contains zero… — open bug. — evidence: `.planning/work/items/00/SIG-50.json`
- **typed verdict records for VERIFICATION and REVIEW (storage stage 2)** — unfiled: not in the corpus yet, so there is no line to cite.

### 4. Make /sig:advise see the big picture of projects shaped differently from Signal

**Why:** The first run outside Signal found that the digest misses milestone files with other names, vision headings in GSD-style projects, roadmap files, and docs/; the agent had to go find them itself. With other projects about to move onto the store, advise is how they will choose their next work, so a digest that only fits Signal's layout gives them a partial picture. — evidence: `.planning/work/items/00/SIG-261.md:1`, `.planning/work/items/00/SIG-261.md:3`, `.planning/work/items/00/SIG-258.md:1`

Covers:

- **`SIG-258`** advise digest: milestone files named MILESTONE-M2.9.md are not recognised, so it reports "no milestone file" when there are two — open bug. — evidence: `.planning/work/items/00/SIG-258.json`
- **`SIG-259`** advise digest: the vision is found only under ## Vision / ## Problem; GSD-style projects use What This Is / Core Value — open bug. — evidence: `.planning/work/items/00/SIG-259.json`
- **`SIG-260`** advise digest: a BACKLOG.md that holds only section headings offers them as live work rows — open bug. — evidence: `.planning/work/items/00/SIG-260.json`
- **`SIG-261`** advise digest reads only .planning/, but a project's big picture often lives in docs/ and a roadmap file — open bug. — evidence: `.planning/work/items/00/SIG-261.json`
- **`SIG-267`** advise digest never reads a roadmap file inside .planning/ — planned milestones vanish from the priorities — open bug. — evidence: `.planning/work/items/00/SIG-267.json`
- **`SIG-262`** advise cannot see a backlog kept in GitHub Issues — open bug. — evidence: `.planning/work/items/00/SIG-262.json`
- **`SIG-268`** advisory says "Could not read: nothing" while the digest lists two gaps — open bug. — evidence: `.planning/work/items/00/SIG-268.json`
- **`SIG-271`** advise digest inbox line counts every heading; checkStaleInbox counts only drainable entries — open bug. — evidence: `.planning/work/items/00/SIG-271.json`
- **`SIG-284`** /sig:advise and tools/cut-release.js stamp dates with the UTC date, not the local one — open bug. — evidence: `.planning/work/items/00/SIG-284.json`
- **advise records one pick, but people choose an order** — backlog row. — evidence: `.planning/work/items/00/SIG-263.json`

## Appendix — every live row — 70

**Not ranked.** Every live row appears exactly once: under the priority that covers it, or in the list after, in item-ID order. Age is not an input. A row here was looked at, which is a different thing from a row nobody considered — the list is complete, not curated.

### Under priority 1 — Make the review loop's signals trustworthy, then prove them with a driven Epic

- **checkFixRounds: tie each round's range and parent-run base together, and say the base for round 2+** — evidence: `.planning/work/items/00/SIG-335.json`
- **recordPass / phase_passes: check the phase matches STATE, and the date on read** — evidence: `.planning/work/items/00/SIG-337.json`
- **markRunEnded / linear run boundary: idempotence, Epic mode, symlinked report, staging** — evidence: `.planning/work/items/00/SIG-342.json`
- **checkFixRounds and recordPass: trust gaps and missing tests (passes 3–4)** — evidence: `.planning/work/items/00/SIG-344.json`

### Under priority 2 — Get other projects onto the work store: corpus project 1, then project 2's list shapes

- **/sig:docs-migrate --work-store: support corpus project 2 list shapes (prose roadmap backlog, long write-ups with status in the text)** — evidence: `.planning/work/items/00/SIG-290.json`
- **Jev second opinion on migrated closes (flag-only) — build only if a migrated close proves wrong** — evidence: `.planning/work/items/00/SIG-291.json`

### Under priority 4 — Make /sig:advise see the big picture of projects shaped differently from Signal

- **advise records one pick, but people choose an order** — evidence: `.planning/work/items/00/SIG-263.json`

### Not covered by a priority — 63, in item-ID order

- **Whole-population deny assertion — the shape B81 needs** — evidence: `.planning/work/items/00/SIG-129.json`
- **More places Jev can decide — where code cannot, and only after measuring · **roadmap** · medium · *filed 2026-09-26 from `M6.E3` EXECUTE*** — evidence: `.planning/work/items/00/SIG-149.json`
- **DISCUSS silently auto-adopts irreversible decisions at `unattended` · **roadmap** · small · **filed 2026-09-03**** — evidence: `.planning/work/items/00/SIG-151.json`
- **A stated ladder: convention → lint, with a grandfather list · **roadmap** · medium · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-153.json`
- **`/sig:sweep` has no inbound-link check — find orphaned documents · **hygiene** · small · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-154.json`
- **Retrieval over the heading tree, instead of reading whole files · **roadmap** · medium · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-155.json`
- **`.planning/` layout as a runtime-read schema doc · **roadmap** · medium · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-156.json`
- **Cross-references become links, so a walker can check them · **hygiene** · small · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-158.json`
- **Doc↔code symbol contract, generalized past `drive.md` · **roadmap** · medium · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-159.json`
- **Per-file documentation budgets · **hygiene** · small · **filed 2026-09-01**** — evidence: `.planning/work/items/00/SIG-160.json`
- **The row that doesn't know what the platform already does · **roadmap** · small · **filed 2026-08-25**** — evidence: `.planning/work/items/00/SIG-164.json`
- **Adopt prose's "actually fine" rule into Signal's own reports · **hygiene** · small** — evidence: `.planning/work/items/00/SIG-168.json`
- **Re-aim on "the unreached mechanism" — the class behind `B87`–`B90` · **roadmap** · medium** — it names a gate that has not fired. — evidence: `.planning/work/items/00/SIG-169.json`
- **The entry price for *any* Phase A autonomy work: `B73`–`B76` · **agreed 2026-08-08**** — evidence: `.planning/work/items/00/SIG-173.json`
- **Trajectory scoring — score whole runs, not single instructions · **roadmap** · medium · **UNPARKED 2026-08-10**** — its written trigger has fired. — evidence: `.planning/work/items/00/SIG-174.json`
- **The dry-run gate, written down as a pattern · **hygiene** · small** — evidence: `.planning/work/items/00/SIG-178.json`
- **Resume-time retro nudge · **hygiene** · small** — evidence: `.planning/work/items/00/SIG-179.json`
- **Map drift-guard · **hygiene** · small** — evidence: `.planning/work/items/00/SIG-180.json`
- **Config-drift hazard check before shipping · **roadmap** · medium** — evidence: `.planning/work/items/00/SIG-181.json`
- **The contradiction sweep's live residual · **hygiene** · medium** — evidence: `.planning/work/items/00/SIG-183.json`
- **Loop engineering — split attention from rigor · **roadmap** · large · **M6**** — evidence: `.planning/work/items/00/SIG-185.json`
- **M5.E20 — The other two shapes of "shipped but never run" *(renumbered from `M5.E16`, 2026-08-09)*** — evidence: `.planning/work/items/00/SIG-192.json`
- **Add a "first use" step to `/sig:plan`** — evidence: `.planning/work/items/00/SIG-196.json`
- **M5.E12 — Project-facing currency** — evidence: `.planning/work/items/00/SIG-198.json`
- **M5.E14 — Obligation tracker integration (single home for open/closed work)** — evidence: `.planning/work/items/00/SIG-199.json`
- **Traversal-artifact decision spike** — evidence: `.planning/work/items/00/SIG-202.json`
- **`/sig:sweep --docs / --code` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11, M5.E6, 2026-07-25)**** — evidence: `.planning/work/items/00/SIG-205.json`
- **Passive `OBSERVATIONS.md` capture** — evidence: `.planning/work/items/00/SIG-206.json`
- **Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed**** — evidence: `.planning/work/items/00/SIG-211.json`
- **Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**** — evidence: `.planning/work/items/00/SIG-212.json`
- **Slash-command testing harness (A5)** — evidence: `.planning/work/items/00/SIG-214.json`
- **`/sig:report` + `/sig:orient` (co-ship)** — evidence: `.planning/work/items/00/SIG-215.json`
- **`/sig:audit` — engineering-readiness scorecard** — evidence: `.planning/work/items/00/SIG-216.json`
- **Status-line breadcrumb** — evidence: `.planning/work/items/00/SIG-217.json`
- **Pre-scoped DISCUSS agenda** — evidence: `.planning/work/items/00/SIG-218.json`
- **`/sig:goal` wrapper** — evidence: `.planning/work/items/00/SIG-219.json`
- **Option C — concern weighting** — evidence: `.planning/work/items/00/SIG-220.json`
- **Audience-technicality dial** — evidence: `.planning/work/items/00/SIG-221.json`
- **Multi-feature lifecycle remainder** — evidence: `.planning/work/items/00/SIG-222.json`
- **Tier-count validation** — evidence: `.planning/work/items/00/SIG-223.json`
- **CLAUDE.md version headline: derive at release, check as backstop** — evidence: `.planning/work/items/00/SIG-231.json`
- **Nothing compares the tier a decision states with the tier the phase commands read** — evidence: `.planning/work/items/00/SIG-232.json`
- ****Dedicated test-sandbox project for Signal QA.** A commi...** — evidence: `.planning/work/items/00/SIG-233.json`
- **Behavioral evals as a second measurement shape (eve factory)** — evidence: `.planning/work/items/00/SIG-234.json`
- **/sig:permissions principle — authority from outside the model input surface** — it names a gate that has not fired. — evidence: `.planning/work/items/00/SIG-235.json`
- **Prior art for the attention axis — an unattended principal that parks** — evidence: `.planning/work/items/00/SIG-236.json`
- **A hard size bound on the curated memory document** — evidence: `.planning/work/items/00/SIG-237.json`
- **ship.md §6.8 omits closeEpic's sensitive-data abort outcome** — evidence: `.planning/work/items/00/SIG-250.json`
- **anti-rationalization-forms.md repeats its Discipline section; commands/add.md is listed three times** — evidence: `.planning/work/items/00/SIG-256.json`
- **GIT_FAILED says "run the confirm again" where the branch gate uses it** — evidence: `.planning/work/items/00/SIG-315.json`
- **git-env.js: GIT_FAILED JSDoc splits dotGitAtOrAbove from its comment** — evidence: `.planning/work/items/00/SIG-316.json`
- **checkClosedProofs repeats a hand-confirm's typed git_reason as fact** — evidence: `.planning/work/items/00/SIG-322.json`
- **runSweep takes no clock, so any sweep test over dated fixtures drifts with the calendar** — evidence: `.planning/work/items/00/SIG-328.json`
- **Move two grandfathered scale tests from npm test to the perf run** — evidence: `.planning/work/items/00/SIG-329.json`
- **parent-run.js: harden against a hostile base commit or working tree** — evidence: `.planning/work/items/00/SIG-331.json`
- **parent-run.js: vitest-only, PERF_TESTS files never provable, no green HEAD run** — evidence: `.planning/work/items/00/SIG-332.json`
- **review.md / verify.md: say what happens when recordPass throws, and at SKETCH** — evidence: `.planning/work/items/00/SIG-333.json`
- **AC3.3 EXECUTE half: nothing reads a PROGRESS entry's parent-run line** — evidence: `.planning/work/items/00/SIG-334.json`
- **Timing-budget guard: reach, the branch-commit pin, and no allowed fix for a false match** — evidence: `.planning/work/items/00/SIG-338.json`
- **M6.E17 test gaps: rules that survive their own deletion** — evidence: `.planning/work/items/00/SIG-339.json`
- **M6.E17 code nits: undefined finding IDs in comments, stale @returns, template H1** — evidence: `.planning/work/items/00/SIG-340.json`
- **parent-run.js: worktree cleanup leaves its own entry while one of yours is missing, and other limits** — evidence: `.planning/work/items/00/SIG-341.json`
- **EXECUTE side of the parent run: brief wording, PROGRESS template, base commit, non-vitest projects** — evidence: `.planning/work/items/00/SIG-345.json`

### Dropped — 1

- **Context-discipline hooks — **parked, all three, with triggers**** — Dropped by the **self-declared** input — the row's own heading says `parked`, so it is not actionable work. — evidence: `.planning/work/items/00/SIG-228.json`

## Picked by you

**Priority 1 — Make the review loop's signals trustworthy, then prove them with a driven Epic**, picked on 2026-10-20 by Brett.
