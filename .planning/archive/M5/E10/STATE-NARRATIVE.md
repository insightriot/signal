> ## ▶ IN FLIGHT — `M5.E10`, opened 2026-08-11. The frontmatter is now authoritative again.
>
> **`phase: REVIEW` / `current_epic: M5.E10` are correct.** The Epic that closes **Milestone 5**
> (`D-BR0809-1`, `D-BR0809-2`) is open; `M5.E19`'s four-phase ledger archived cleanly to
> [`archive/M5/E19/STATE-NARRATIVE.md`](archive/M5/E19/STATE-NARRATIVE.md) on the roll.
>
> **DISCUSS, PLAN, all five EXECUTE waves, VERIFY and REVIEW are all closed. Next action: `/sig:ship`.**
>
> ✅ **`B94` (P1) is FIXED** — it landed after the planned slices and was taken in scope as **FR9 /
> S7** (`92ad0df`, `4e3bfe5`). `BACKLOG.md` gains a discharge path, a SHIP §6.6 step that uses it, and
> a `/sig:sweep` `backlog-discharge` check. **The check evaluates 1 of 12 corpus projects and cannot
> see `eval-project-A`, the project the bug was filed from** — that number belongs in the release
> notes, not a footnote.
>
> **All build work is done. 2410 → 2586 tests.** VERIFY ran as a real dogfood and
> [`M5.E10-VERIFICATION.md`](M5.E10-VERIFICATION.md) is **PASS with documented limits** — coverage
> `45/45`, template gate `valid`. **Its own first draft failed the coverage diff**: it asserted
> *"56 of 56, none missing"* and the check returned **6 missing**, every one an id written only inside
> an en-dash range. Left standing in the report as a boxed note; it is the Epic's best evidence.
>
> Two findings the phase produced: **`B95`** (filed, P2, not fixed — `RETROSPECTIVES.md` orders by
> file mtime, so FR7 reports ordering-only drift) and a **second live FR8 sighting caused by this
> phase's own transition**, fixed above.
>
> **REVIEW returned PASS-WITH-FIXES**, and the independent `/code-review` pass Brett triggers has
> **already run** — 7 findings, all reproduced, 5 fixed in code and 2 (`B97`/`B98`) fixed as a corpus
> scrub. **`B97` was the serious one: this repo is public and 8 of 13 eval-corpus projects were named
> in it, because the guard covered only 5.** 113 replacements across 30 files; all 13 now denied.
>
> Next: SHIP as **v0.1.25** — *not* v0.1.23, which shipped 2026-08-08; `plugin.json` reads `0.1.24`.
> Shipping closes Milestone 5. Suite **2602**, CI green, PR #141 mergeable.
>
> **Read [`M5.E10-PROGRESS.md`](M5.E10-PROGRESS.md) first** — it carries every finding, including the
> ones that falsified the plan.
>
> ⚠ **This line said `phase: DISCUSS` at the PLAN close and `Next action: EXECUTE` at the EXECUTE
> close — instances SIX and EIGHT, both forming inside the Epic chartered to fix them.** It is not
> carelessness; it is the mechanism: a phase transition moves the frontmatter and structurally cannot
> touch this prose. **Instance eight is the one the shipped check does not catch** — FR8 reads
> `phase:` claims beside the Epic id, and *"Next action: EXECUTE"* is neither. The narrow rule was
> chosen deliberately (a literal reading flagged 62 episodes, most of them false), and this is the
> cost of that choice, paid immediately and on the record.
>
> **The block that used to sit here retired itself, and that is worth keeping.** It read *"do not
> orient from the frontmatter"* and named its own expiry in the same breath — *"both stay wrong
> until `M5.E10` opens."* That condition fired at the roll, which is why it could be removed with
> confidence rather than guessed at. **A staleness note that states its own expiry condition is
> strictly better than one that merely rots** — but nothing retired it automatically, and for the
> ~18 hours between the roll and this edit it was actively steering readers away from the half of
> the file that had just become correct.
>
> **Log that as instance five** of the narrative-vs-frontmatter defect this Epic absorbed
> (`D-BR0810-2`), and note what makes it different from the first four: the prose was not careless,
> it was *conditional and correct*, and it still went wrong the moment its condition flipped. It is
> the strongest available argument that the fix cannot be "write the note more carefully."
>
> **`last_updated_commit` is maintained; the narrative is not.** `/sig:checkpoint` advances the
> commit baseline, and the commit that *records* that refresh necessarily lands after it — so this
> file reads **exactly one commit behind immediately after a checkpoint**. That is the mechanism,
> not drift. **Do not put a commit sha in this block:** naming one is what made two earlier versions
> of this paragraph rot, each falsified by the very run it described.
>
> **For the fuller picture** read [`CONTEXT.md`](CONTEXT.md) § Active work → HANDOFF: the inbox
> triage is **done** (2026-08-10, PRs #136/#137/#138 — 52 entries → 50 dispositioned + 2 standing,
> `B92` filed, 13 rows added to `BACKLOG.md`, `D-BR0810-1…3`), and `B46` is **dismissed** (#140).
> **The routing further down this file that sends the inbox triage to `M5.E14` is historical**
> (`D-M5E17-3` cut it there when nothing else had a home for it); it ran in the fix lane instead.

## Phase log — Epic M5.E10 (archived 2026-08-14) <!-- phase-log:archived -->

- DISCUSS (2026-08-12)
- PLAN (2026-08-12)
- EXECUTE (2026-08-13)
- VERIFY (2026-08-13)
- REVIEW (2026-08-13)
- SHIP (2026-08-13)
