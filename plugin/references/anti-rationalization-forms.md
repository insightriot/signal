# Anti-rationalization: which form each entry takes

> **Generated from the corpus, not maintained by hand.**
> `tests/anti-rationalization-forms.test.js` re-derives this classification and fails when it
> and the corpus disagree. A hand-kept list of what a corpus contains is a completeness claim,
> and this repository is done writing those.

**128 entries: 108 discipline, 20 shaping.**

## The rule (`B38`)

Signal adopted the prohibition-plus-rationalization-table form **universally**. Its own upstream
source classifies the failure first, and pairs each kind with a form:

| Failure | Looks like | Right form |
|---|---|---|
| **Discipline** | knows the rule, skips it under pressure | prohibition + rationalization table |
| **Shaping** | complies, but the output comes out the wrong shape — bloated, buried, suppressed | **positive recipe** stating what the output IS |

The evidence is empirical rather than stylistic: in head-to-head wording tests the prohibition
arm produced **more** of the unwanted content than the recipe arm (fully separated
distributions), and trended worse than a no-guidance control. Applying the prohibition form to a
shaping failure does not merely underperform — **it backfires**.

**Most of Signal’s entries are discipline entries, and were already in the right form.** That is
`B38`’s own finding, and re-measuring it is what this page is: 16 of 109 needed converting.

## Shaping — stated as recipes

### `commands/add.md`

- **The body written is byte-identical to what the user typed** — same characters, same casing, same punctuation. Capture is a recording, not an edit.
- **The file's shape is: one heading, then entries appended in order.** New content goes at the end of its section and nowhere else.
- **The onboarding note renders once per repo**, gated by its marker file. After that the command's output is the capture confirmation alone.

### `commands/calibrate.md`

- **`PROFILE.md` carries all ten `rigor_overrides` keys with explicit values, every run.** A downstream command reads a key; an absent key is a different answer from a stated default.

### `commands/checkpoint.md`

- **The diff renders through `renderStateDiff`, unchanged.** One renderer means a reader who has seen one checkpoint can read every checkpoint.

### `commands/escalate.md`

- **Every run ends by stating the resulting tier**, whether or not it moved. "No change" is a result, and a command that says nothing is indistinguishable from one that failed.

### `commands/init.md`

- **Each Step 5 question is one sentence, plus at most one clarifying line.** The user is answering, not reading.

### `commands/resume.md`

- **Load the current phase's artifact, plus `PROJECT.md` and `CONTEXT.md`.** That set is what re-anchors a reader; anything more spends context they need for the work.
- **The Vision renders in three sentences or fewer, and decisions as their first five bullets.** The briefing is for re-anchoring, not re-reading.
- **Trust banners render above the body, in the order given** — binding, schema, staleness, origin, then advisory. A reader decides whether to trust the briefing before spending attention on it.

### `commands/ship.md`

- **The PR body states what changed, why, and how it was verified.** Those three, in that order; the diff shows the rest.

### `commands/status.md`

- **The report is one screen: the blocks specified below, and nothing else.** A status nobody finishes reading is a status nobody read.

### `commands/docs-sweep.md`

- **The report always states which checks were skipped and why.** A check that could not run and a check that found nothing must never render the same.

### `commands/update.md`

- **The report shows installed, available, AND the CHANGELOG entries between them.** The delta is the half `/plugin` cannot show, and the reason to run this at all.
- **The restart line renders on every update.** Size does not predict whether a stale binding bites; `B52` was a one-line release.

### `commands/permissions.md`

- **The report renders in any repository**, including one with no `.planning/` and no Signal install. The tracked artifact is written only where `.planning/` already exists.
- **A scope that could not be read is a line the reader sees**, with its reason — never a silent omission and never "0 rules".
- **Flow-derived and stack-derived rules stay under separate headings**, so a reader can accept one and refuse the other.
- **The approximation limit renders whenever the read renders**, including when every scope parsed cleanly. That is the case where a reader would otherwise conclude the picture is complete.

### `references/anti-rationalization.md`

- **Provenance: an upstream claim about a third artifact is repeated only after opening that

## Discipline — prohibition form retained

Each stays a prohibition because the failure it names is **skipping a rule**, not mis-shaping an
output. Listed so the classification is complete rather than asserted.

### `agents/support/phase-gate-enforcer.md` (6)

- "Tests aren't needed for this"
- "We'll fix it in the next phase"
- "It works on my machine"
- "This is just a prototype"
- "The deadline is too tight"
- "It's a minor issue"

### `commands/add.md` (6)

- "Just use `appendFile` — `atomicWrite` is overkill."
- "Skip the lock — solo dev never races."
- "Auto-redact secrets without asking."
- "Show entry preview before write so user can confirm."
- "`gate_strictness: strict` means I should confirm the destination before writing."
- "Write to a different file if the inbox (`ISSUES-INBOX.md`) is too long."

### `commands/calibrate.md` (3)

- "I know this is a FULL project, skip the questions."
- "This feels like SKETCH but I should say FEATURE to be safe."
- "The user said to skip the .gitignore check."

### `commands/checkpoint.md` (5)

- "Auto-apply the refresh without confirming — saves a step."
- "Skip the orphan prompt under strict — too chatty."
- "Auto-redact sensitive data in `--context` capture."
- "If `--context` is given, skip the quick-mode refresh."
- "Don't bother running pre-CALIBRATE — just emit empty diff."

### `commands/discuss.md` (4)

- "We can figure out the details during planning"
- "The requirements are obvious"
- "We don't need a spec for something this simple"
- "The user seems impatient, let's move on"

### `commands/doctor.md` (15)

- An orphan cache dir is by definition unused — just `rm -rf` it
- Do the live-session check once, when the script is generated
- No live sessions found → nothing to warn about
- Skip the platform check — most users are on macOS anyway
- Skip Signal-scoping detectors — `~/.claude/` is Signal's domain
- Treat `--fix` as `--auto-fix` and execute the script directly
- Bundle `--fix` and `--reinstall` into a single mode with detection-based branching
- Auto-execute `/plugin install/uninstall` from inside doctor
- Exit 0 on findings — they're informational, not fatal
- Fall through to detector logic on Linux just because the paths *might* exist
- Use `sed` for JSON edits in the generated script — `node -e` is verbose
- Hardcode `~/.claude/plugins/cache/signal/sig/` paths in the generated script
- Skip the `claude --version` preamble — users will have a recent version
- Auto-execute `--fix` since it's surgical
- Skip the casing-clash check — `signal/` + `Signal/` siblings can't happen on APFS

### `commands/escalate.md` (3)

- "The user wants more rigor — skip the questions, just bump the tier."
- "The 5 questions feel repetitive — they were just answered."
- "Back-fill warnings feel preachy — skip them."

### `commands/execute.md` (4)

- "The tests are too slow, I'll skip them for now"
- "This works but I'll refactor it later"
- "I'll commit everything together at the end"
- "The plan says X but I think Y is better"

### `commands/docs-index.md` (4)

- "Hand-edit the mechanical rows to fix a path or tier."
- "Rewrite a curated gotcha to sound better while I'm here."
- "Skip the render-then-compare and just always write."
- "Regenerate even though `.planning/` is gitignored — it's just a local file."

### `commands/init.md` (8)

- "The user clearly wants /sig:init; skip the pre-flight checks."
- "Auto-run `git init` if no .git/ — saves the user a step."
- "If `.planning/` exists, just merge into it."
- "Skip the gitignore check; the user knows what they're doing."
- "Empty repo? Just proceed — the scanners will return empty data, no harm done."
- "Walk LANDSCAPE.md too — it has markers."
- "Skip Step 5's Defer option to force completeness."
- "Auto-accept high-confidence `[INFERRED]` markers without asking."

### `commands/docs-migrate.md` (5)

- "The dry-run diff is long; just apply and let the user `git revert` if it's wrong."
- "The frontmatter prose has no IDs to preserve — dropping it is fine."
- "Tests pass, so the migration is faithful."
- "The project looks non-standard; I'll assume the common old layout and move accordingly."
- "Apply, then log any dangling links so the user can fix them."

### `commands/permissions.md` (5)

- "Just write the settings file — the user clearly wants these rules."
- "`.planning/` is missing — create it so the artifact has somewhere to go."
- "The deny list is short; add a few more useful blocks."
- "Add a `permission_level` to PROFILE.md so this is configurable."
- "The scan found a binary nobody classified — default it to allow so the run is clean."

### `commands/plan.md` (5)

- "The plan is in my head, I don't need to write it down"
- "This task is too small to need acceptance criteria"
- "We can figure out the test strategy during execution"
- "Vertical slicing is overkill for this"
- "The plan's decided — skip the inbox drain"

### `commands/resume.md` (3)

- "Auto-invoke the next phase to save the user a step."
- "Refresh STATE.md with a 'last resumed' timestamp."
- "Skip the orphan prompt under `gate_strictness: off` — too chatty."

### `commands/review.md` (4)

- "The code works and tests pass, review is redundant"
- "Security hardening is overkill for this project"
- "Performance optimization is premature"
- "Simplification is just bikeshedding"

### `commands/ship.md` (3)

- "Nobody reads CHANGELOGs"
- "I'll clean up the git history later"
- "Docs can wait until after merge"

### `commands/status.md` (3)

- "Users can read .planning/ themselves; this is redundant."
- "Add a `--json` flag for hooks."
- "Mutate state to record 'last checked' so we can show recency."

### `commands/docs-sweep.md` (4)

- "Add a `--fix` flag so it repairs drift in place."
- "Add an arg parser / flags."
- "Regenerate `INDEX.md` while I'm here — the freshness check already computed the expected content."
- "Point it at Signal's repo so the Signal-only checks always run."

### `commands/update.md` (3)

- "Parse the version out of `claude plugin list` and move on."
- "Restart for the user — it's one more step otherwise."
- "Offline? Assume they're current."

### `commands/verify.md` (3)

- "The tests pass, so it must work"
- "That edge case probably won't happen"
- "It's close enough"

### `references/anti-rationalization.md` (5)

- "This is simple enough that we don't need [spec/tests/review]"
- "We're running low on context, skip the non-essential steps"
- "The user seems to want speed over thoroughness"
- "I'll come back and add [tests/docs/security] later"
- "This is just a prototype / MVP / internal tool"
- "The user set `unattended`, so merging is implied."
- "This floor is obviously fine to skip in this case."
- "The profile is malformed, but the intent is obviously `unattended`."
- "The queue is long, but the run succeeded, so report success."
- "STATE.md names a phase, so just start there — that IS the work."
- "No backlog file, so there's nothing to work on — report done."
- "Preflight found nothing blocking, so go" — when a source failed to read.
