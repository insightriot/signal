# Backlog review — 2026-10-10

What to work on next in Signal, read from its own `.planning/` corpus.

**This changes nothing on its own.** It proposes; you pick. Nothing in `.planning/` was modified, no row was struck, and nothing was added to the decision queue.

The priorities are a **judgment**, made by the agent that ran this command from a digest of this project's documents. Another run over the same files can propose different ones. What is checked is that each one cites lines that exist and covers rows and bugs that are live.

*Produced `via /sig:advise`.*

## Corpus read

**Read:** work records (backlog rows) · work records (bugs) · STATE/closure · milestone rows · other branches — the work store is on, so BACKLOG.md and BUGS.md, its views, were not opened.

**Consulted by the row inputs:** `BACKLOG.md`.

**Read, not consulted:** `BUGS.md` — read from the work records for the covers; the row inputs run no discharge check on a work store; `STATE/closure` — read from the work records for the covers; the row inputs run no discharge check on a work store; `milestone rows` — kept because it is cheap and is the natural home for a future "already sequenced into an open Epic" input; no ranking input reads it; `other branches` — not ranked — no Epic is open on another branch.

**Could not read:** nothing — all 5 sources were readable.

**Digest read** (re-read when this file was written): vision · milestone · open Epics · bugs · backlog · retrospectives · open questions · inbox.

**Digest cut to fit:** retrospectives: the newest 3 read, 40 older not opened.

**Digest note:** 4 backlog row(s) dropped (discharged, self-declared not live, or folded) are not offered here — they cannot be covered, and the advisory lists them under Dropped.

## Open on other branches

1 unmerged branch(es) carry a `STATE.md` with no Epic id, so they could not be compared: `worktree-dogfood-status`.

## Citation rule

Every claim below ends with a citation. A work item is cited by its own record file, which had to exist; any other citation names a repo-root-relative path and line, and the line had to be inside the file. Each one was resolved against disk before this file was written. A citation that did not resolve fails the run, and this file would not exist. What that does NOT check is whether the cited file or line says what the claim says it says.

## Priorities — 5

### 1. Epics and units become records — the next stage of the storage redesign

**Why:** Work items are records now, but Epics and units are still worked out from filenames and hand-kept tables, and that is where the remaining status bugs sit. The storage proposal names this as the first stage after work items. It would also give a project a way to say an Epic is closed but must stay live. — evidence: `analysis/STORAGE-ARCHITECTURE-PROPOSAL.md:122`, `.planning/work/items/00/SIG-255.md:1`, `.planning/work/items/00/SIG-132.md:4`, `.planning/M6.E15-RETROSPECTIVE.md:90`

Covers:

- **`SIG-132`** Two mutually-blind milestone Epic-row parsers, and the one feeding the SHIP gate cannot read Milestone 6 at all — open bug. — evidence: `.planning/work/items/00/SIG-132.json`
- **`SIG-255`** Archiving ignores a project's explicit keep-live list, so work held open on purpose is proposed for archive — open bug. — evidence: `.planning/work/items/00/SIG-255.json`
- **`SIG-288`** /sig:docs-archive shares the retro-only closure default (archive-tree.js senseArchiveTree), so a filled retrospective alone can archive an unfinished Epic — open bug. — evidence: `.planning/work/items/00/SIG-288.json`
- **`SIG-289`** An Epic whose VERIFICATION is already in archive/ keeps its STATE narrative and isV3Conformant reads true (resolveClosures lists only top-level .planning/) — open bug. — evidence: `.planning/work/items/00/SIG-289.json`
- **Epics and units as records in the work store** — unfiled: not in the corpus yet, so there is no line to cite.

### 2. Get the migration ready for corpus project 2's list shapes

**Why:** The migration shipped scoped to corpus project 1; project 2 keeps a prose roadmap and long write-ups with status in the text, which today would come across as one flagged entry. Best started once Brett's first real run on project 1 has shown what the migration gets wrong, since that run also decides whether the Jev second opinion is needed. — evidence: `.planning/M6.E15-RETROSPECTIVE.md:5`, `.planning/M6.E15-RETROSPECTIVE.md:87`, `.planning/work/items/00/SIG-290.md:1`

Covers:

- **/sig:docs-migrate --work-store: support corpus project 2 list shapes (prose roadmap backlog, long write-ups with status in the text)** — backlog row. — evidence: `.planning/work/items/00/SIG-290.json`
- **Jev second opinion on migrated closes (flag-only) — build only if a migrated close proves wrong** — backlog row. — evidence: `.planning/work/items/00/SIG-291.json`

### 3. Make /sig:advise see the whole picture on projects that are not Signal

**Why:** The outside test found the digest misses roadmap files, milestone files with other names, and vision sections with other headings, so the priorities depend on whether the agent happens to wander outside the digest. As more projects move onto the store, this is the command they use to pick work. — evidence: `.planning/work/items/00/SIG-267.md:1`

Covers:

- **`SIG-258`** advise digest: milestone files named MILESTONE-M2.9.md are not recognised, so it reports "no milestone file" when there are two — open bug. — evidence: `.planning/work/items/00/SIG-258.json`
- **`SIG-259`** advise digest: the vision is found only under ## Vision / ## Problem; GSD-style projects use What This Is / Core Value — open bug. — evidence: `.planning/work/items/00/SIG-259.json`
- **`SIG-260`** advise digest: a BACKLOG.md that holds only section headings offers them as live work rows — open bug. — evidence: `.planning/work/items/00/SIG-260.json`
- **`SIG-261`** advise digest reads only .planning/, but a project's big picture often lives in docs/ and a roadmap file — open bug. — evidence: `.planning/work/items/00/SIG-261.json`
- **`SIG-267`** advise digest never reads a roadmap file inside .planning/ — planned milestones vanish from the priorities — open bug. — evidence: `.planning/work/items/00/SIG-267.json`
- **`SIG-262`** advise cannot see a backlog kept in GitHub Issues — open bug. — evidence: `.planning/work/items/00/SIG-262.json`
- **`SIG-268`** advisory says "Could not read: nothing" while the digest lists two gaps — open bug. — evidence: `.planning/work/items/00/SIG-268.json`
- **`SIG-270`** readOpenQuestions counts and lists a struck-through (~~settled~~) question as open — open bug. — evidence: `.planning/work/items/00/SIG-270.json`
- **`SIG-271`** advise digest inbox line counts every heading; checkStaleInbox counts only drainable entries — open bug. — evidence: `.planning/work/items/00/SIG-271.json`
- **`SIG-264`** advise "Other" answer must stay verbatim; summaries go in a separate field — open bug. — evidence: `.planning/work/items/00/SIG-264.json`
- **advise records one pick, but people choose an order** — backlog row. — evidence: `.planning/work/items/00/SIG-263.json`
- **`SIG-284`** /sig:advise and tools/cut-release.js stamp dates with the UTC date, not the local one — open bug. — evidence: `.planning/work/items/00/SIG-284.json`
- **`SIG-119`** `/sig:advise`'s artifact carries no commit anchor, so its `path:line` citations are true at exactly one commit and… — open bug. — evidence: `.planning/work/items/00/SIG-119.json`

### 4. Make the requirement-coverage check count every requirement

**Why:** VERIFY's coverage check drops a real requirement from its own count on 21 of 22 requirements files here, and counts a requirement as verified when the report only mentions its ID. A clean result from it can sit over a requirement it never counted, at the gate every Epic passes through. — evidence: `CLAUDE.md:102`, `.planning/work/items/00/SIG-116.md:1`

Covers:

- **`SIG-100`** `diffRequirementCoverage` cannot see a letter-suffixed acceptance-criterion id, and reports `covered` while blind to it. — open bug. — evidence: `.planning/work/items/00/SIG-100.json`
- **`SIG-101`** `diffRequirementCoverage` clears a requirement group from `unattributableGroups` when the report merely *names* the… — open bug. — evidence: `.planning/work/items/00/SIG-101.json`
- **`SIG-116`** `diffRequirementCoverage`'s denominator silently drops a real requirement on 21 of 22 REQUIREMENTS artifacts in this… — open bug. — evidence: `.planning/work/items/00/SIG-116.json`
- **`SIG-126`** `diffRequirementCoverage` counts a requirement as verified when the VERIFICATION report merely MENTIONS its id — so a… — open bug. — evidence: `.planning/work/items/00/SIG-126.json`

### 5. Close the gaps between a session saying it passed and main being sound

**Why:** CI does not run lint, so a lint error reached a branch while VERIFY recorded lint as clean; the suite also times out on a different test each run under load, and SHIP's reviewer check misreads a re-push. These are small fix-lane items that each make a green result mean less. — evidence: `.planning/M6.E14-RETROSPECTIVE.md:71`, `.planning/M6.E14-RETROSPECTIVE.md:86`, `.planning/work/items/00/SIG-283.md:1`, `.planning/work/items/00/SIG-139.md:1`

Covers:

- **`SIG-283`** CI does not run lint, so a lint error can reach main unnoticed — open bug. — evidence: `.planning/work/items/00/SIG-283.json`
- **`SIG-139`** The suite is flaky under local parallel load — a different test times out each run — open bug. — evidence: `.planning/work/items/00/SIG-139.json`
- **`SIG-266`** private-name guard can time out under a full parallel run — open bug. — evidence: `.planning/work/items/00/SIG-266.json`
- **`SIG-120`** `tests/drain-standing.test.js` AC2.2c pins THIS repo's `ISSUES-INBOX.md` at zero live candidates, so every `/sig:add`… — open bug. — evidence: `.planning/work/items/00/SIG-120.json`
- **`SIG-285`** SHIP's reviewer-effort check reads only the latest run, so a re-push after a real review reads as 'did NOT review' — open bug. — evidence: `.planning/work/items/00/SIG-285.json`

## Appendix — every live row — 52

**Not ranked.** Every live row appears exactly once: under the priority that covers it, or in the list after, in item-ID order. Age is not an input. A row here was looked at, which is a different thing from a row nobody considered — the list is complete, not curated.

### Under priority 2 — Get the migration ready for corpus project 2's list shapes

- **/sig:docs-migrate --work-store: support corpus project 2 list shapes (prose roadmap backlog, long write-ups with status in the text)** — evidence: `.planning/work/items/00/SIG-290.json`
- **Jev second opinion on migrated closes (flag-only) — build only if a migrated close proves wrong** — evidence: `.planning/work/items/00/SIG-291.json`

### Under priority 3 — Make /sig:advise see the whole picture on projects that are not Signal

- **advise records one pick, but people choose an order** — evidence: `.planning/work/items/00/SIG-263.json`

### Not covered by a priority — 49, in item-ID order

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

### Dropped — 4

- **Since the snapshot — what shipped (reconciliation, 2026-07-19)** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/work/items/00/SIG-144.json`
- **Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26)** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/work/items/00/SIG-187.json`
- **Context-discipline hooks — **parked, all three, with triggers**** — Dropped by the **self-declared** input — the row's own heading says `parked`, so it is not actionable work. — evidence: `.planning/work/items/00/SIG-228.json`
- **Parked — the trigger watchlist *(not sprint material)*** — Dropped by the **self-declared** input — the row's own heading says `Parked`, so it is not actionable work. — evidence: `.planning/work/items/00/SIG-230.json`

## Picked by you

**Priority 1 — Epics and units become records — the next stage of the storage redesign**, picked on 2026-10-11 by Brett.
