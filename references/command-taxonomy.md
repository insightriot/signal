# Command Taxonomy — the five groups, and the rule for naming a new command

**Status: canonical (2026-08-07).** Signal has 19 commands and had no written ontology, so
every command was named on the day it was built. This doc names the groups that already exist and
fixes the naming rule going forward. It is **descriptive first** — the groups below were derived by
reading `commands/*.md`, not invented — and **prescriptive second**: new commands conform.

Related: `.planning/DECISIONS.md` (`D-M5E19-8`, `D-M5E19-9`), `references/doc-runtime-model.md`.

---

## Why this exists

The fourth group below is the evidence. Three commands acting on the same corpus, in **two naming
styles**: `index` and `sweep` are bare verbs, `migrate-memory` is a verb-noun compound. Nothing was
done wrong — there was simply no rule to follow, so each name was locally reasonable and the set
drifted.

That drift is cheap at 19 commands and expensive at 30. Writing the rule down is most of the fix;
without it, the question gets re-decided from scratch at every addition.

## The five groups

Every command belongs to **exactly one**. A command that seems to belong to two is a sign it does
two things.

### 1. Flow — moves work forward

`new-project` · `init` · `calibrate` · `discuss` · `plan` · `execute` · `verify` · `review` ·
`ship` · `escalate`

Named for **the phase or the act**, because the six phases are a fixed vocabulary users learn once
(`PROJECT.md` § Vocabulary). Tier-gated: each reads `PROFILE.md` and may exit early.

### 2. Orientation — read-only, tells you where you are

`status` · `resume`

**Writes nothing.** `status` is a snapshot; `resume` is a briefing that opens the current phase's
artifacts. The read-only guarantee is the contract — a mutation here would break the trust that
makes them safe to run reflexively.

### 3. Capture — records something you said

`add` · `checkpoint`

Takes input from the user (or from git history) and files it. `add` routes an idea to its home;
`checkpoint` reconciles `STATE.md` against reality.

### 4. Document upkeep — acts on `.planning/` as a corpus

`index` · `sweep` · `migrate-memory` · **`archive`**

Operates over the whole document tree rather than one phase's artifacts. Not phase-gated — these
answer *"is the corpus healthy / current / tidy?"*, a question with its own cadence.

### 5. Signal's own health — acts on the tool, not your project

`doctor` · `update`

The distinction from group 4 is the **object**: group 4 acts on *your documents*, group 5 on
*Signal's installation*. `doctor` diagnoses the install; `update` reports and applies a new version.

## The naming rule

1. **Name the act, as a bare verb, unless the verb is ambiguous without its object.**
   `archive`, `index`, `sweep`, `ship`, `verify`. A bare verb is shortest to type and reads as a
   command.
2. **Add the object only to disambiguate.** `migrate-memory` earns its noun because *migrate* alone
   would not say what moves. `update` does not, because there is only one thing Signal updates.
3. **Never introduce a third style into a group.** If a group's names are bare verbs, a new member
   is a bare verb — or the whole group is converted at once. **Half-migrating a namespace costs the
   inconsistency without buying the grouping.** This is the rule that decided `/sig:archive` over
   `/sig:memory-archive` (`D-M5E19-8`).
4. **State the group in the command's own file**, in the same line that already says whether it is
   phase-gated. A group nobody can see from the file is a group that drifts.

## Separate command, or a flag?

Ask **what question the user is answering**, not what code is shared.

- **Different question, different cadence → separate commands.** Reorganizing document *layout* and
  filing away *finished work* share machinery, but layout changes when the structure does, and
  archiving happens at every unit close. A flag would imply they are variants of one operation
  (`D-M5E19-2`).
- **Same question, different intensity or target → a flag.** `--apply` versus dry-run, `--epic`,
  `--fix`. These do not change what is being asked.

## Known open question — prefixed namespaces

Whether group 4 should eventually become `memory-*` (or `docs-*`) is **open and deliberately not
decided here**. The argument for it is real: at 30 commands a flat namespace is harder to learn than
a grouped one. The argument against acting now is that renaming is a **breaking change** for
existing users and needs deprecation aliases plus a version bump — separate work from adding a
command, and doing both at once means a wrong taxonomy makes the new command wrong too.

Filed in `BACKLOG.md`. Pre-1.0 is when a rename is cheapest, so *"later"* means *"deliberately, and
soon"* — not *"someday."*
