# `/sig:permissions` — the scoping spike

**Date:** 2026-08-25 · **Trigger:** the backlog row's own instruction — *"needs a verify step against
the current API before anything is designed"* · **Status:** scoping only, nothing built

**Result: Signal cannot build a permission model, and should stop describing `/sig:permissions` as
one.** The mechanism already exists, is enforced deterministically by Claude Code rather than by the
model, and is **deliberately closed to plugins**. What is left for Signal is real but far smaller
than `large`, and it is a different shape than the row describes.

This is the third time in five weeks that a scoping pass against the platform has returned *"the
thing you were going to build is not yours to build"* — see [`analysis/PHASE-C-BUILD-VS-ADOPT.md`](PHASE-C-BUILD-VS-ADOPT.md)
(2026-08-21) and [`analysis/CROSS-MODEL-REVIEW-SCOPE.md`](CROSS-MODEL-REVIEW-SCOPE.md). That pattern is itself a finding and is
recorded at the end.

---

## What the row assumed

> **`/sig:permissions` — what Signal is allowed to do here** · *roadmap* · **large**
>
> *Plain: Signal has no way to say what it may run in a given project, so it may run nothing.*
>
> Read-only is not a principle Signal chose per project; it is hard-coded in two scanner files
> (`quality-scanner.md:209`, `stack-scanner.md:150`). **A permission model turns that default into a
> per-project setting.**
>
> *Open, none resolved:* where it lives (a `PROFILE.md` block vs. a separate file); its relationship
> to Claude Code's own permission system — **needs a verify step against the current API before
> anything is designed**; what the levels are (straw man: read-only → run declared read-only commands
> → write → commit → push); and consent.

Three of those four opens are answered below. The fourth — where it lives — becomes trivial once the
first is answered, because there is much less to place.

---

## Finding 1 — the permission system exists, and it is enforced outside the model

Sources: `code.claude.com/docs/en/permissions`, `/docs/en/settings-reference`, both read 2026-08-25.

`permissions` is an object in any settings file with `allow`, `deny`, `ask` arrays plus
`defaultMode` and `additionalDirectories`. Rules are tool-scoped patterns — `Bash(npm run test:*)`,
`Read(...)`, `Edit(...)`, `WebFetch(domain:...)`. Precedence is **deny-first**, and it is absolute:

> A broad deny rule like `Bash(aws *)` blocks every matching call, including calls that also match a
> narrower allow rule like `Bash(aws s3 ls)`, so **a deny rule can't carry allowlist exceptions**.

Six modes exist: `default` (alias `manual`), `acceptEdits`, `plan`, `auto`, `bypassPermissions`,
`dontAsk`. `defaultMode` selects the one a session starts in.

**The load-bearing sentence, quoted in full, because it settles the whole row:**

> Permission rules are enforced by Claude Code, **not by the model**. Instructions in your prompt or
> [`CLAUDE.md`](../CLAUDE.md) shape what Claude tries to do, but **they don't change what Claude Code allows**.

This repository already knows what that means. `B75` shipped **open** four days ago for the identical
reason: a dial that is documented end to end and enforced nowhere is not a control. Anything Signal
writes about permission in a command file, a skill, or `PROFILE.md` is **prose**, and
[`analysis/PHASE-C-BUILD-VS-ADOPT.md`](PHASE-C-BUILD-VS-ADOPT.md) measured the prompt layer at **77.6% unmeasurable**. A Signal
"permission model" expressed in `.planning/` would be exactly the artifact this project is named
after: a rule with nothing that fails when it is broken.

## Finding 2 — plugins cannot contribute permissions, by design

Verified three ways rather than asserted from one page:

1. **The plugin manifest has no such field.** `plugin.json`'s component keys are `skills`,
   `commands`, `agents`, `workflows`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`,
   `experimental.themes`, `experimental.monitors`, `channels`, `userConfig`, `dependencies`. There is
   no `permissions` key and no `defaultMode`.
2. **Plugin-shipped agents are explicitly blocked from it.** Quoted: *"For security reasons, `hooks`,
   `mcpServers`, and `permissionMode` are **not supported** for plugin-shipped agents."*
3. **Plugins are not a settings source at all.** The settings scopes are managed/enterprise, user,
   project, local, and CLI flags. Plugin-related keys that exist (`enabledPlugins`, `pluginConfigs`,
   `pluginTrustMessage`) configure plugins; they are not a channel *from* a plugin *into* settings.

**Measured on this machine, not inferred:** seven plugins installed, and `grep` for a `permissions`
key across every `plugin.json` in the cache returns **zero**.

This is `PHASE-C-BUILD-VS-ADOPT.md`'s finding one layer over. There, a plugin could not declare a
tool dependency or query the session's tool roster. Here, a plugin cannot declare a permission
either. **The pattern is that Claude Code deliberately keeps capability and authority under user
control and does not delegate either to installed code** — which is correct, and which Signal should
stop rediscovering by proposing to build past it.

## Finding 3 — the consent question is already answered by the platform

The row lists consent as an open product call: *"running an unknown project's suite can be slow, hit
a live database, or cost money."* Real concern, and **the platform has already decided it.** The
three options anyone would design are the three modes that ship:

| The question | What Claude Code already calls it |
|---|---|
| Ask every time | `default` / `manual` mode — *"Prompts for permission on first use of each tool"* |
| Ask once, then remember | An `allow` rule. Choosing *"Yes, and don't ask again"* writes one |
| Never ask; only run what was declared | `dontAsk` — quoted: *"Auto-denies tools unless pre-approved via `/permissions` or `permissions.allow` rules"* |

⚠ **"Ask once, then remember" is not universal, and the exception matters here.** The saved-rule
behaviour is documented *"such as for a Bash command or a WebFetch domain"* — and explicitly **not**
for file modifications: *"A file-modification approval isn't saved to the file … it lasts until the
session ends."* So the middle row buys persistence for **commands**, which is what the row was about,
and buys nothing for **edits**.

**So Signal must not invent a consent model.** A second, Signal-flavoured vocabulary for the same
three states would be a fourth dial next to `tier`, `gate_strictness` and `attention` — and `B75`
measured what happens to a dial with no enforcement behind it. Any Signal surface here maps onto
these names or it is noise.

## Finding 4 — what is actually left, and it is not `large`

The row's premise — *"Signal has no way to say what it may run"* — is **half right for the wrong
reason**. Signal has no way to *grant* itself anything, and never will. What it lacks and could have
is the ability to **know** what it has been granted, and to **ask for it legibly**.

Three candidates, smallest first. None requires new platform capability.

**(a) Read the permission state and report it.** Settings files are ordinary JSON on disk and Signal
already reads `installed_plugins.json` this way (`plugin-binding.js`). A phase command could state,
before it tries, what this project permits. This is the same shape as `ENVIRONMENT.md` shipped in
`v0.1.33` — *what an agent can't see* — with *what an agent may do* alongside it. **Reporting, not
granting**, which is the only posture available.

⚠ It must fail as `cannot-check`, never as clean, when a settings file is absent or unreadable
(`B39`). And the reported set is **not** the effective set: `PreToolUse` hooks can block a call that
every rule allows, and precedence across five scopes means a local read is an approximation. Say so
or don't ship it.

**(b) Emit a recommended allowlist the user installs themselves.** `/sig:permissions` becomes a
generator: it proposes rules for what the flow actually needs at this tier, and the **user** pastes
or merges them into their own `settings.json`. This is the **DECLARE not DETECT** shape
`PHASE-C-BUILD-VS-ADOPT.md` already landed on for a different question, and it keeps authority where
the platform put it. Dry-run by default, consistent with house style.

**(c) Make the scanners' hard-coded read-only stance a setting.** ⚠ **This one does not work, and
naming why is the point.** `quality-scanner.md:209` and `stack-scanner.md:150` say *"Never run `npm
install`, `npm test`, `pytest`"* — that is prose in an agent file. Replacing it with prose that reads
a profile field changes **nothing about what the agent can do**: those agents hold `Bash`, and what
stops them is a permission rule or nothing. Turning a hard-coded sentence into a configurable
sentence is a **downgrade** — it reads as a control while remaining a suggestion.

### Measured: the state of permissions on this machine

Read-only, this repo, 2026-08-25:

| | user `~/.claude/settings.json` | project `.claude/settings.local.json` |
|---|---|---|
| `allow` | 40 | 54 |
| `deny` | **0** | **0** |
| `ask` | **0** | **0** |
| `defaultMode` | unset | unset |

**94 allow rules, zero deny rules, zero ask rules, no default mode.** The user list carries
machine-specific one-offs — absolute paths into `/var/folders/.../T/tmp.AOr0Jqr87Y/`, a
`Bash(node /tmp/sig-doctor-run.mjs)` from debugging a Signal bug, an escaped `python3 -c` one-liner
pinned to one temp directory. This is an allowlist that **accreted from prompts**, not one anyone
designed.

**And the accretion is not a habit — it is the documented mechanism.** Choosing *"Yes, and don't ask
again"* saves the rule to **`.claude/settings.local.json` at the root of the git repository**, which
is precisely the file holding those 54 entries. Every one of them is a prompt someone answered once.
So this is what the platform's default path produces over months of ordinary use, on a machine
belonging to someone who thinks about this problem for a living. **Any design assuming operators
curate an allowlist by hand is contradicted by the only sample available.**

That is the strongest argument for **(b)** and the strongest argument against **(a)** being enough:
reporting this state back would report ninety-four lines of accident. A generator that proposes a
small, legible, intentional set is worth more than a reader that faithfully describes a mess.

---

## Recommendation

**Close `/sig:permissions` as scoped, and reopen it as (b) alone — small, not large.**

- ❌ **Do not build a permission model.** Not available to plugins, and a prose one is `B75`.
- ❌ **Do not build a Signal consent vocabulary.** The platform ships three modes that already say it.
- ❌ **Do not make the scanners' read-only stance configurable.** It converts a hard stop into a
  suggestion and reads as a control.
- ⚠️ **(a) reporting is defensible but weak on its own** — on real data it reports accident.
- ✅ **(b) is the honest slice**: a dry-run generator proposing an intentional allowlist for what the
  flow needs at this tier, which the user installs into their own settings. Authority stays with the
  user; Signal supplies the legibility.

**The two items the row said were blocked on this are not unblocked by it.** The readiness
scorecard's executability dimension and the environment-readiness baseline are blocked on *being
permitted to run things* — a user act in a user-owned file. **(b)** makes that act easier to perform
correctly; it does not perform it. Any plan claiming those items are unblocked by shipping **(b)** is
a completeness claim written from the shape of the work rather than the artifact.

---

## The pattern, recorded so it is not rediscovered a fourth time

Three scoping passes since 2026-08-21 — Phase C, cross-model review, and this — each proposed
building a capability, checked the platform, and found the capability either absent by design or
reserved to the user. Two returned *"build neither"* / *"adopt, don't build"*; this returns *"build a
tenth of it."*

**The cheap step is the check, and it keeps paying.** Each of these cost hours and saved an Epic. The
generalization worth keeping is not *"Signal builds too much"* — it is that **a backlog row written
from the shape of a problem does not know what the platform already does about it**, and the row's
own size estimate is the least reliable thing on it. `/sig:permissions` was filed `large`. It is
small, and most of the largeness was work that cannot be done at all.
