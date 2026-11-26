# Reviews of other tools (2026-11-25)

Two outside projects, read to decide what Signal should borrow while it is cut down
([`SLIM-SIGNAL.md`](SLIM-SIGNAL.md)). Each one is checked against the rule in
[`COURSE-CORRECTION.md`](COURSE-CORRECTION.md): would someone running Signal on their own project
notice the difference?

Both were **read, not run**. Nothing here was measured in a Signal run. Each borrowed idea is a
candidate until it is built and tested against plain Claude Code.

## 1. mattpocock/skills

<https://github.com/mattpocock/skills>, read at commit `d653911` (2026-11-25). About 332K stars.

### What it is for

It is a small set of skills, each aimed at one common way coding agents go wrong:

| What goes wrong | Skill |
|---|---|
| The agent builds the wrong thing | `grilling` / `grill-me`: interview the person until every decision is settled |
| The agent is too wordy | a `GLOSSARY.md` of project terms that the agent builds with the person (`domain-modeling`) |
| The code does not work | `tdd` (write a failing test, then make it pass) and `diagnosing-bugs` |
| The codebase turns into a mess | `codebase-design` and `improve-codebase-architecture` |

Around these are skills that chain them: `to-spec` → `to-tickets` → `implement` → `code-review`,
plus `retro` and `handoff`. The README names its rivals directly: *"GSD, BMAD, and Spec-Kit try to
help by owning the process. But while doing so, they take away your control."* GSD is Signal's
base, so this is a direct critique of Signal's starting design.

### How well it does it

**Very well, one skill at a time.** It does not try to run a loop.

Why it works:

- **The skills are tiny.** `grill-me` is 22 words. `grill-with-docs` is one line that calls two
  other skills. The 32 skills, counting unfinished and retired ones, total about 28K words.
- **Skills build on each other instead of repeating each other.** Skills the person types may call
  only skills the agent can also pick up on its own, so shared rules live in one place.
- **The bar for changes is strict** (`SCOPE.md`). An issue stays open only if it describes
  *"something that went wrong in a real session."* New skill proposals are closed outright. Each
  rejected idea gets a file in `.out-of-scope/` saying why.
- **Records go where the person already works.** Specs and tickets go to the person's GitHub Issues
  or GitLab, not to files the tool keeps for itself.
- **The grilling method is good.** It asks every question it can ask now in one numbered round.
  Each question carries a recommended answer, and "yes" accepts it. Looking up facts is the agent's
  job, in a fresh subagent; making decisions is the person's.

Where it falls short:

- **There is no loop.** The person runs every step by hand. `software-factory`, the autonomous
  version, is a vocabulary and design guide, still in `skills/in-progress/`.
- **Nothing is enforced.** It is all written instructions, with no hooks and no checks of its own.
- **It adds stops for the person.** `tdd` writes no test at a seam (the boundary where a test goes)
  the person has not confirmed.
- **It is starting to grow.** The router skill `ask-matt` (~2K words) and `wayfinder` (~2K) are the
  largest, and the repo's own `CLAUDE.md` has to warn that a router out of sync "lies".
- **No evidence it works better.** There are no evals in the repo. Popularity shows people like it,
  not that it produces better code.

### What to borrow

1. **The grilling round format** (`skills/productivity/grilling/SKILL.md`, 333 words). Every question
   answerable now, in one round, each with a recommendation; facts looked up by the agent, never
   asked. A candidate for how `/sig:build` sizes work with the person.
2. **`retro`'s rules for the agent's setup** (`skills/engineering/retro/SKILL.md`). Turn mistakes
   into automated checks rather than written rules. Keep `CLAUDE.md` to pointers. Look for
   instructions that change nothing the agent does. Give coding standards to the reviewer, because
   the agent writing the code is already short on context. A ready method for trimming Signal's
   command files.
3. **Review in two separate parts** (`skills/engineering/code-review/SKILL.md`). One fresh subagent
   checks the coding standards, another checks the change against the spec, and their findings are
   never merged or re-ranked. The spec check aims at completeness claims written from the shape of
   the work.
4. **Ideas for the loop**, from `skills/in-progress/software-factory/` and `loop-me/`:
   - *"Accelerators without brakes make a slop cannon."* The brakes are automated checks, automated
     review and human review.
   - Add one automatic trigger at a time, run it rarely at first, and *"cap every loop of runs at a
     few tries before a human."* (This matches the bmad-loop shape already in `SLIM-SIGNAL.md`.)
   - *"A run never waits for a human"*: it ends, and the person's later action starts a new run.
   - "Push right": hold the person's check-in as late as possible, and show a short decision-ready
     summary, not the raw output.
5. **A glossary of the project's terms** that the agent keeps up while planning: shorter replies,
   consistent names in the code.

Not borrowed: the `ask-matt` router, the issue-triage state machine, and a docs page per skill. Each
is upkeep a small tool can skip.

### A comparison to add to the tests

Plain Claude Code plus these skills is probably a stronger thing to beat than bare Claude Code. Worth
one run of the same task on a fresh copy of the test project, three ways: Signal; plain Claude Code;
plain Claude Code with `grill-with-docs` → `to-tickets` → `implement`.

## 2. A private "attention harness"

A friend's project, **not named here because its repository is private and proprietary**. Only its
general shape and the ideas worth borrowing are recorded, in our own words.

### What it is for

It helps one person oversee many AI sessions across many projects and several vendors (Claude Code,
Codex, others) without losing track of what was decided, who may change what, and what needs the
person. It manages the person's attention and who has authority to act, not how well the agent
builds. Its pieces: a short handoff file and a long log in each project, read at every session start
and updated at every close; locks so only one session writes to an area; notes left in another
project's inbox instead of changing its files; sessions that never close or merge on their own; a
fleet registry; and rules for how replies read.

### How well it does it

**The idea is good; the build works against its own goal.** It is honest about its limits: it says
plainly what it does not enforce and separates verified from unverified claims. Several mechanisms
answer real failures it observed. It is in daily use across about 19 projects.

But a tool meant to save attention has become expensive to attend to:

- **A session reads about 400 KB before work starts**, by its own boot order: a "thin" handoff hub of
  287 KB read whole, plus a 62 KB rules file and a 53 KB operating manual. At its own measured rate of
  about 2.4 to 2.5 bytes per token, that is roughly 160K tokens. That figure is an estimate, not a
  measured boot.
- **The handoff, the screen meant to tell the person what needs them, is dense with internal IDs**
  and cannot be skimmed.
- **"Four words to learn" is not true in practice.** The reference page lists 7 ways to open a
  session, 6 to close one, three claim levels, two versions of the session rules, and an 8-row table
  of close banners.
- **It mostly builds itself.** About 2,640 commits in five months, almost all by one author, 225
  research files, a 3 MB session log, and much of the newest work not yet live.

This is the pattern `COURSE-CORRECTION.md` names for Signal, further along.

### What to borrow

1. **Save the person's edits before an agent overwrites them.** A hook takes a copy before a file
   write, and before `git checkout`, `git restore`, `git reset --hard` or `git clean`, so uncommitted
   human work can be recovered. It advises and never blocks. **The strongest idea of the two
   reviews**: unattended runs are when an agent overwrites someone's work, and a user would notice.
2. **A setting for how much the agent says changes only what it says, never what it does or
   records**, with a short fixed list of things always said. Their "focus" setting runs from naming
   every process step to mentioning process only when it needs a decision. This addresses Signal
   narrating its own phases, and keeps wordiness separate from how often the run stops.
3. **End every turn that needs the person with what they must do**, under a plain "Your turn"
   heading, as the last thing they read. Cheap, and visible at every `/sig:drive` stop.
4. **A lesson they measured on themselves:** a prominent format that appears on every reply stops
   carrying information and starts shaping behaviour. A closing flourish asked for on every reply
   made agents close sessions early. Worth remembering before adding any "always do X" line to a
   command.

Not borrowed: locks between sessions and inboxes between projects (Signal is one project and one
session), a rules register, a citation system, session numbering, state banners, the fold and
collapse steps, and parity across vendors.

## The lesson across both

The two projects sit at opposite ends of one choice. The attention harness wrote more records and
rules each time something went wrong. mattpocock/skills cuts back and turns down anything without a
real failure behind it. The cut-down in `SLIM-SIGNAL.md` heads the second way.
