# Backlog review — 2026-09-13

What to work on next in Signal, read from its own `.planning/` corpus.

**This changes nothing on its own.** It recommends; you decide. Nothing in `.planning/` was modified, no row was struck, and nothing was added to the decision queue.

*Produced `via /sig:advise`.*

## Corpus read

**Read:** BACKLOG.md · BUGS.md · retrospectives · STATE/closure · milestone rows.

**Consulted by the ranking:** `BACKLOG.md` only. The other sources are read so this section can say what was and was not legible, and so a future ranking input can use them; **no current ranking input reads them.** A row is not promoted or demoted here because of a bug, a retrospective, a closure record or a milestone row.

**Could not read:** nothing — all 5 sources were readable.

## Citation rule

Every claim below ends with a citation naming a repo-root-relative path and line. Each one was resolved against disk before this file was written: the path had to exist and the line had to be inside it. A citation that did not resolve fails the run, and this file would not exist. What that does NOT check is whether the cited line says what the claim says it says.

## Recommended — 5

### 1. Trajectory scoring — score whole runs, not single instructions · **roadmap** · medium · **UNPARKED 2026-08-10**

Ranked because its written trigger has fired; nothing it names as a gate is unmet; it was filed 2026-08-10, 34 days ago. Ranked above *M5.E14 — Obligation tracker integration (single home for open/closed work)*, which was demoted by the **trigger-met** and **age** inputs — 5 rows scored above it. — evidence: `.planning/BACKLOG.md:876`, `.planning/BACKLOG.md:1809`

### 2. `/sig:advise` ranks on the backlog alone, while reading five sources · **hygiene** · small · *filed 2026-09-05 from `M6.E7` REVIEW*

Ranked because its written trigger has fired; nothing it names as a gate is unmet; it was filed 2026-09-05, 8 days ago. — evidence: `.planning/BACKLOG.md:95`

### 3. Map drift-guard · **hygiene** · small

Ranked because nothing it names as a gate is unmet; it was filed 2026-07-13, 62 days ago. — evidence: `.planning/BACKLOG.md:991`

### 4. `/sig:sweep --docs / --code` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11, M5.E6, 2026-07-25)**

Ranked because nothing it names as a gate is unmet; it was filed 2026-07-25, 50 days ago. — evidence: `.planning/BACKLOG.md:1903`

### 5. M5.E12 — Project-facing currency

Ranked because nothing it names as a gate is unmet; it was filed 2026-07-28, 47 days ago. — evidence: `.planning/BACKLOG.md:1783`

## Declined — 45

Every live row not recommended, each with the reason it was not. A row here was **looked at and passed over** — which is a different thing from a row nobody considered, and the distinction only exists because this list is complete rather than curated.

- **M5.E14 — Obligation tracker integration (single home for open/closed work)** — Demoted by the **trigger-met** and **age** inputs — 5 rows scored above it. — evidence: `.planning/BACKLOG.md:1809`
- **Add a "first use" step to `/sig:plan`** — Demoted by the **trigger-met** and **age** inputs — 6 rows scored above it. — evidence: `.planning/BACKLOG.md:1715`
- **Adopt prose's "actually fine" rule into Signal's own reports · **hygiene** · small** — Demoted by the **trigger-met** and **age** inputs — 7 rows scored above it. — evidence: `.planning/BACKLOG.md:696`
- **The entry price for *any* Phase A autonomy work: `B73`–`B76` · **agreed 2026-08-08**** — Demoted by the **trigger-met** and **age** inputs — 8 rows scored above it. — evidence: `.planning/BACKLOG.md:842`
- **The contradiction sweep's live residual · **hygiene** · medium** — Demoted by the **trigger-met** and **age** inputs — 9 rows scored above it. — evidence: `.planning/BACKLOG.md:1045`
- **M5.E20 — The other two shapes of "shipped but never run" *(renumbered from `M5.E16`, 2026-08-09)*** — Demoted by the **trigger-met** and **age** inputs — 10 rows scored above it. — evidence: `.planning/BACKLOG.md:1476`
- **`STATE.md`'s narrative vs. its frontmatter · **hygiene** · small · **FOLDED INTO `M5.E10`**** — Demoted by the **trigger-met** and **age** inputs — 11 rows scored above it. — evidence: `.planning/BACKLOG.md:899`
- **Loop engineering — split attention from rigor · **roadmap** · large · **M6**** — Demoted by the **trigger-met** and **age** inputs — 12 rows scored above it. — evidence: `.planning/BACKLOG.md:1107`
- **CLAUDE.md version headline: derive at release, check as backstop** — Demoted by the **trigger-met** and **age** inputs — 13 rows scored above it. — evidence: `.planning/BACKLOG.md:2083`
- **The row that doesn't know what the platform already does · **roadmap** · small · **filed 2026-08-25**** — Demoted by the **trigger-met** and **age** inputs — 14 rows scored above it. — evidence: `.planning/BACKLOG.md:544`
- **A stated ladder: convention → lint, with a grandfather list · **roadmap** · medium · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 15 rows scored above it. — evidence: `.planning/BACKLOG.md:306`
- **`/sig:sweep` has no inbound-link check — find orphaned documents · **hygiene** · small · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 16 rows scored above it. — evidence: `.planning/BACKLOG.md:331`
- **Retrieval over the heading tree, instead of reading whole files · **roadmap** · medium · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 17 rows scored above it. — evidence: `.planning/BACKLOG.md:346`
- **`.planning/` layout as a runtime-read schema doc · **roadmap** · medium · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 18 rows scored above it. — evidence: `.planning/BACKLOG.md:369`
- **Cross-references become links, so a walker can check them · **hygiene** · small · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 19 rows scored above it. — evidence: `.planning/BACKLOG.md:411`
- **Doc↔code symbol contract, generalized past `drive.md` · **roadmap** · medium · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 20 rows scored above it. — evidence: `.planning/BACKLOG.md:430`
- **Per-file documentation budgets · **hygiene** · small · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 21 rows scored above it. — evidence: `.planning/BACKLOG.md:449`
- **Structural status — make done-vs-live readable without inference · **roadmap** · large · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 22 rows scored above it. — evidence: `.planning/BACKLOG.md:463`
- **Record rationale on every non-trivial change, not only at Epic close · **product call** · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 23 rows scored above it. — evidence: `.planning/BACKLOG.md:490`
- **Drive `/sig:drive` end-to-end through a real Epic · **verification** · small · **filed 2026-09-01**** — Demoted by the **trigger-met** and **age** inputs — 24 rows scored above it. — evidence: `.planning/BACKLOG.md:506`
- **DISCUSS silently auto-adopts irreversible decisions at `unattended` · **roadmap** · small · **filed 2026-09-03**** — Demoted by the **trigger-met** and **age** inputs — 25 rows scored above it. — evidence: `.planning/BACKLOG.md:265`
- **The dry-run gate, written down as a pattern · **hygiene** · small** — Demoted by the **trigger-met** and **age** inputs — 26 rows scored above it. — evidence: `.planning/BACKLOG.md:964`
- **Resume-time retro nudge · **hygiene** · small** — Demoted by the **trigger-met** and **age** inputs — 27 rows scored above it. — evidence: `.planning/BACKLOG.md:979`
- **Config-drift hazard check before shipping · **roadmap** · medium** — Demoted by the **trigger-met** and **age** inputs — 28 rows scored above it. — evidence: `.planning/BACKLOG.md:1009`
- **Traversal-artifact decision spike** — Demoted by the **trigger-met** and **age** inputs — 29 rows scored above it. — evidence: `.planning/BACKLOG.md:1885`
- **Re-source the stale external claims → **absorbed into M5.E12**** — Demoted by the **trigger-met** and **age** inputs — 30 rows scored above it. — evidence: `.planning/BACKLOG.md:1893`
- **Passive `OBSERVATIONS.md` capture** — Demoted by the **trigger-met** and **age** inputs — 31 rows scored above it. — evidence: `.planning/BACKLOG.md:1920`
- **Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed**** — Demoted by the **trigger-met** and **age** inputs — 32 rows scored above it. — evidence: `.planning/BACKLOG.md:1963`
- **Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**** — Demoted by the **trigger-met** and **age** inputs — 33 rows scored above it. — evidence: `.planning/BACKLOG.md:1970`
- **Slash-command testing harness (A5)** — Demoted by the **trigger-met** and **age** inputs — 34 rows scored above it. — evidence: `.planning/BACKLOG.md:1984`
- **`/sig:report` + `/sig:orient` (co-ship)** — Demoted by the **trigger-met** and **age** inputs — 35 rows scored above it. — evidence: `.planning/BACKLOG.md:1988`
- **`/sig:audit` — engineering-readiness scorecard** — Demoted by the **trigger-met** and **age** inputs — 36 rows scored above it. — evidence: `.planning/BACKLOG.md:1992`
- **Status-line breadcrumb** — Demoted by the **trigger-met** and **age** inputs — 37 rows scored above it. — evidence: `.planning/BACKLOG.md:1996`
- **Pre-scoped DISCUSS agenda** — Demoted by the **trigger-met** and **age** inputs — 38 rows scored above it. — evidence: `.planning/BACKLOG.md:2000`
- **Option C — concern weighting** — Demoted by the **trigger-met** and **age** inputs — 39 rows scored above it. — evidence: `.planning/BACKLOG.md:2014`
- **Audience-technicality dial** — Demoted by the **trigger-met** and **age** inputs — 40 rows scored above it. — evidence: `.planning/BACKLOG.md:2018`
- **Multi-feature lifecycle remainder** — Demoted by the **trigger-met** and **age** inputs — 41 rows scored above it. — evidence: `.planning/BACKLOG.md:2022`
- **Tier-count validation** — Demoted by the **trigger-met** and **age** inputs — 42 rows scored above it. — evidence: `.planning/BACKLOG.md:2026`
- **`/sig:docs-update` — GSD port → **absorbed into M5.E12**** — Demoted by the **trigger-met** and **age** inputs — 43 rows scored above it. — evidence: `.planning/BACKLOG.md:2038`
- **Re-aim on "the unreached mechanism" — the class behind `B87`–`B90` · **roadmap** · medium** — Demoted by the **blocked-by** input — the row names a gate that has not fired. — evidence: `.planning/BACKLOG.md:723`
- **`/sig:goal` wrapper** — Demoted by the **blocked-by** input — the row names a gate that has not fired. — evidence: `.planning/BACKLOG.md:2004`
- **Since the snapshot — what shipped (reconciliation, 2026-07-19)** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:121`
- **Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26)** — Dropped by the **self-declared** input — the row's own heading says `reconciliation`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:1231`
- **Context-discipline hooks — **parked, all three, with triggers**** — Dropped by the **self-declared** input — the row's own heading says `parked`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:2056`
- **Parked — the trigger watchlist *(not sprint material)*** — Dropped by the **self-declared** input — the row's own heading says `Parked`, so it is not actionable work. — evidence: `.planning/BACKLOG.md:2066`
