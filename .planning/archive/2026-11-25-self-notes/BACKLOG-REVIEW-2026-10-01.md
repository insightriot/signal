# Backlog review — 2026-10-01

What to work on next in Signal, read from its own `.planning/` corpus.

**This changes nothing on its own.** It proposes; you pick. Nothing in `.planning/` was modified, no row was struck, and nothing was added to the decision queue.

The priorities are a **judgment**, made by the agent that ran this command from a digest of this project's documents. Another run over the same files can propose different ones. What is checked is that each one cites lines that exist and covers rows and bugs that are live.

*Produced `via /sig:advise`.*

## Corpus read

**Read:** BACKLOG.md · BUGS.md · STATE/closure · milestone rows · other branches.

**Consulted by the row inputs:** `BACKLOG.md` · `BUGS.md` · `STATE/closure`.

**Read, not consulted:** `milestone rows` — kept because it is cheap and is the natural home for a future "already sequenced into an open Epic" input; no ranking input reads it; `other branches` — not ranked — no Epic is open on another branch.

**Could not read:** nothing — all 5 sources were readable.

**Digest read:** vision · milestone · open Epics · bugs · backlog · retrospectives · open questions · inbox.

**Digest cut to fit:** retrospectives: the newest 3 read, 36 older not read.

## Open on other branches

1 unmerged branch(es) carry a `STATE.md` with no Epic id, so they could not be compared: `worktree-dogfood-status`.

## Citation rule

Every claim below ends with a citation naming a repo-root-relative path and line. Each one was resolved against disk before this file was written: the path had to exist and the line had to be inside it. A citation that did not resolve fails the run, and this file would not exist. What that does NOT check is whether the cited line says what the claim says it says.

## Priorities — 3

### 1. Get other projects onto the current system safely

Moving a real project was tried today and stopped: the archive splits a slice and ignores a keep-live list, and the move into the work store (step 5) is not built. It starts with the backlog-reader fixes, because step 5 moves a backlog with that reader and a dropped row there would be lost silently. — evidence: `.planning/M6.E11-RETROSPECTIVE.md:82`, `.planning/BUGS.md:165`, `.planning/BUGS.md:142`, `plugin/tools/lib/work-migrate.js`

Covers:

- **`B121`** `parseBacklogRows` returns ZERO rows for a CRLF `BACKLOG.md`, and `/sig:advise` then writes an advisory saying *"Nothing. No live row survived the ranking inpu… — open bug. — evidence: `.planning/BUGS.md:142`
- **`B122`** The `<details>` counter in `parseBacklogRows` is fence-unaware and code-span-unaware, so any MENTION of `<details` silently drops every row after it. `inFence`… — open bug. — evidence: `.planning/BUGS.md:143`
- **`B127`** A live BACKLOG row whose heading says a PHASE is done reads as a DISCHARGED row — `/sig:advise` stopped seeing the in-flight `M6.E3`. `backlog.js` `DONE_WORD_R… — open bug. — evidence: `.planning/BUGS.md:148`
- **`B135`** dischargeBacklogRows is blind to rows nested below h3 — open bug. — evidence: `.planning/BUGS.md:155`
- **`B254`** A plan named PLAN-<unit>.md is left out of its unit, so the archive moves 5 of 6 files and splits the slice — open bug. — evidence: `.planning/BUGS.md:165`
- **`B255`** Archiving ignores a project's explicit keep-live list, so work held open on purpose is proposed for archive — open bug. — evidence: `.planning/BUGS.md:166`
- **Dedicated test-sandbox project for Signal QA. A commi... · SIG-233** — backlog row. — evidence: `.planning/BACKLOG.md:923`
- **step 5 of the work-item store — /sig:docs-migrate moves a project into one file per item** — unfiled: not in the corpus yet, so there is no line to cite.

### 2. Make the coverage check tell the truth

diffRequirementCoverage drops real requirements, counts a mention as verified, and misses suffixed ids. It is the check VERIFY leans on to say nothing was missed, so its clean result cannot currently be trusted. — evidence: `.planning/BUGS.md:137`, `.planning/BUGS.md:147`, `.planning/M6.E7-RETROSPECTIVE.md:92`

Covers:

- **`B116`** `diffRequirementCoverage`'s denominator silently drops a real requirement on 21 of 22 REQUIREMENTS artifacts in this repo — so `missing: []` can report clean o… — open bug. — evidence: `.planning/BUGS.md:137`
- **`B126`** `diffRequirementCoverage` counts a requirement as verified when the VERIFICATION report merely MENTIONS its id — so a report that marks `AC4.2` FAIL gets `outc… — open bug. — evidence: `.planning/BUGS.md:147`
- **`B100`** `diffRequirementCoverage` cannot see a letter-suffixed acceptance-criterion id, and reports `covered` while blind to it. Found 2026-08-14 on its first use in a… — open bug. — evidence: `.planning/BUGS.md:121`
- **`B101`** `diffRequirementCoverage` clears a requirement group from `unattributableGroups` when the report merely *names* the group — including in a sentence saying the … — open bug. — evidence: `.planning/BUGS.md:122`

### 3. Prove /sig:drive end to end

It has driven VERIFY through SHIP once and has never started at DISCUSS. DISCUSS also auto-adopts irreversible decisions when unattended, which is the first step a full run would take. — evidence: `.planning/BACKLOG.md:221`, `.planning/BACKLOG.md:70`

Covers:

- **Drive `/sig:drive` end-to-end through a real Epic · verification · small · filed 2026-09-01 · SIG-163** — backlog row. — evidence: `.planning/BACKLOG.md:221`
- **DISCUSS silently auto-adopts irreversible decisions at `unattended` · roadmap · small · filed 2026-09-03 · SIG-151** — backlog row. — evidence: `.planning/BACKLOG.md:70`

## Appendix — every live row — 51

**Not ranked.** Every live row appears exactly once: under the priority that covers it, or in the list after, in file order. Age is not an input. A row here was looked at, which is a different thing from a row nobody considered — the list is complete, not curated.

### Under priority 1 — Get other projects onto the current system safely

- ****Dedicated test-sandbox project for Signal QA.** A commi... · SIG-233** — evidence: `.planning/BACKLOG.md:923`

### Under priority 3 — Prove /sig:drive end to end

- **DISCUSS silently auto-adopts irreversible decisions at `unattended` · **roadmap** · small · **filed 2026-09-03** · SIG-151** — evidence: `.planning/BACKLOG.md:70`
- **Drive `/sig:drive` end-to-end through a real Epic · **verification** · small · **filed 2026-09-01** · SIG-163** — evidence: `.planning/BACKLOG.md:221`

### Not covered by a priority — 48, in file order

- **Whole-population deny assertion — the shape B81 needs · SIG-129** — evidence: `.planning/BACKLOG.md:4`
- **`/sig:advise` ranks on age alone for 44 of 46 rows · **hygiene** · medium · *filed 2026-09-07 from `M6.E8` DISCUSS* · SIG-142** — its written trigger has fired. — evidence: `.planning/BACKLOG.md:16`
- **More places Jev can decide — where code cannot, and only after measuring · **roadmap** · medium · *filed 2026-09-26 from `M6.E3` EXECUTE* · SIG-149** — evidence: `.planning/BACKLOG.md:50`
- **A stated ladder: convention → lint, with a grandfather list · **roadmap** · medium · **filed 2026-09-01** · SIG-153** — evidence: `.planning/BACKLOG.md:90`
- **`/sig:sweep` has no inbound-link check — find orphaned documents · **hygiene** · small · **filed 2026-09-01** · SIG-154** — evidence: `.planning/BACKLOG.md:115`
- **Retrieval over the heading tree, instead of reading whole files · **roadmap** · medium · **filed 2026-09-01** · SIG-155** — evidence: `.planning/BACKLOG.md:130`
- **`.planning/` layout as a runtime-read schema doc · **roadmap** · medium · **filed 2026-09-01** · SIG-156** — evidence: `.planning/BACKLOG.md:153`
- **Cross-references become links, so a walker can check them · **hygiene** · small · **filed 2026-09-01** · SIG-158** — evidence: `.planning/BACKLOG.md:169`
- **Doc↔code symbol contract, generalized past `drive.md` · **roadmap** · medium · **filed 2026-09-01** · SIG-159** — evidence: `.planning/BACKLOG.md:188`
- **Per-file documentation budgets · **hygiene** · small · **filed 2026-09-01** · SIG-160** — evidence: `.planning/BACKLOG.md:207`
- **The row that doesn't know what the platform already does · **roadmap** · small · **filed 2026-08-25** · SIG-164** — evidence: `.planning/BACKLOG.md:258`
- **Adopt prose's "actually fine" rule into Signal's own reports · **hygiene** · small · SIG-168** — evidence: `.planning/BACKLOG.md:306`
- **Re-aim on "the unreached mechanism" — the class behind `B87`–`B90` · **roadmap** · medium · SIG-169** — it names a gate that has not fired. — evidence: `.planning/BACKLOG.md:332`
- **The entry price for *any* Phase A autonomy work: `B73`–`B76` · **agreed 2026-08-08** · SIG-173** — evidence: `.planning/BACKLOG.md:381`
- **Trajectory scoring — score whole runs, not single instructions · **roadmap** · medium · **UNPARKED 2026-08-10** · SIG-174** — its written trigger has fired. — evidence: `.planning/BACKLOG.md:394`
- **The dry-run gate, written down as a pattern · **hygiene** · small · SIG-178** — evidence: `.planning/BACKLOG.md:417`
- **Resume-time retro nudge · **hygiene** · small · SIG-179** — evidence: `.planning/BACKLOG.md:432`
- **Map drift-guard · **hygiene** · small · SIG-180** — evidence: `.planning/BACKLOG.md:444`
- **Config-drift hazard check before shipping · **roadmap** · medium · SIG-181** — evidence: `.planning/BACKLOG.md:462`
- **The contradiction sweep's live residual · **hygiene** · medium · SIG-183** — evidence: `.planning/BACKLOG.md:480`
- **Loop engineering — split attention from rigor · **roadmap** · large · **M6** · SIG-185** — evidence: `.planning/BACKLOG.md:496`
- **M5.E20 — The other two shapes of "shipped but never run" *(renumbered from `M5.E16`, 2026-08-09)* · SIG-192** — evidence: `.planning/BACKLOG.md:613`
- **Add a "first use" step to `/sig:plan` · SIG-196** — evidence: `.planning/BACKLOG.md:674`
- **M5.E12 — Project-facing currency · SIG-198** — evidence: `.planning/BACKLOG.md:695`
- **M5.E14 — Obligation tracker integration (single home for open/closed work) · SIG-199** — evidence: `.planning/BACKLOG.md:722`
- **Traversal-artifact decision spike · SIG-202** — evidence: `.planning/BACKLOG.md:778`
- **`/sig:sweep --docs / --code` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11, M5.E6, 2026-07-25)** · SIG-205** — evidence: `.planning/BACKLOG.md:783`
- **Passive `OBSERVATIONS.md` capture · SIG-206** — evidence: `.planning/BACKLOG.md:800`
- **Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed** · SIG-211** — evidence: `.planning/BACKLOG.md:805`
- **Cross-Epic pattern detection — **KEPT, absorbed into M5.E11** · SIG-212** — evidence: `.planning/BACKLOG.md:813`
- **Slash-command testing harness (A5) · SIG-214** — evidence: `.planning/BACKLOG.md:818`
- **`/sig:report` + `/sig:orient` (co-ship) · SIG-215** — evidence: `.planning/BACKLOG.md:823`
- **`/sig:audit` — engineering-readiness scorecard · SIG-216** — evidence: `.planning/BACKLOG.md:828`
- **Status-line breadcrumb · SIG-217** — evidence: `.planning/BACKLOG.md:833`
- **Pre-scoped DISCUSS agenda · SIG-218** — evidence: `.planning/BACKLOG.md:838`
- **`/sig:goal` wrapper · SIG-219** — evidence: `.planning/BACKLOG.md:843`
- **Option C — concern weighting · SIG-220** — evidence: `.planning/BACKLOG.md:848`
- **Audience-technicality dial · SIG-221** — evidence: `.planning/BACKLOG.md:853`
- **Multi-feature lifecycle remainder · SIG-222** — evidence: `.planning/BACKLOG.md:858`
- **Tier-count validation · SIG-223** — evidence: `.planning/BACKLOG.md:863`
- **CLAUDE.md version headline: derive at release, check as backstop · SIG-231** — evidence: `.planning/BACKLOG.md:890`
- **Nothing compares the tier a decision states with the tier the phase commands read · SIG-232** — evidence: `.planning/BACKLOG.md:910`
- **Behavioral evals as a second measurement shape (eve factory) · SIG-234** — evidence: `.planning/BACKLOG.md:945`
- **/sig:permissions principle — authority from outside the model input surface · SIG-235** — it names a gate that has not fired. — evidence: `.planning/BACKLOG.md:959`
- **Prior art for the attention axis — an unattended principal that parks · SIG-236** — evidence: `.planning/BACKLOG.md:974`
- **A hard size bound on the curated memory document · SIG-237** — evidence: `.planning/BACKLOG.md:991`
- **ship.md §6.8 omits closeEpic's sensitive-data abort outcome · SIG-250** — evidence: `.planning/BACKLOG.md:1005`
- **aborted store discharge still labels rows discharged · SIG-253** — evidence: `.planning/BACKLOG.md:1009`

### Dropped — 4

- **Since the snapshot — what shipped (reconciliation, 2026-07-19) · SIG-144** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:39`
- **Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26) · SIG-187** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:597`
- **Context-discipline hooks — **parked, all three, with triggers** · SIG-228** — Dropped by the **self-declared** input — the row's own heading says `parked`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:868`
- **Parked — the trigger watchlist *(not sprint material)* · SIG-230** — Dropped by the **self-declared** input — the row's own heading says `Parked`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:873`

## Picked by you

**Priority 1 — Get other projects onto the current system safely**, picked on 2026-10-01 by brett.
