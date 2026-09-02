---
name: sig:permissions
description: "Propose an intentional permission set for this project — what Signal's flow needs, plus what this project's own stack needs — as an allowlist and a short deny list the USER installs. Dry-run always; it never writes a settings file. Not phase-gated."
args: "[--apply]"
---

# `/sig:permissions` — What Signal Should Be Allowed To Do Here

You are running `/sig:permissions`, a not-phase-gated meta command. Same class as `/sig:status`, `/sig:doctor`, `/sig:docs-index` — no tier-gating preamble, no skill loading, no agent spawning.

Its one job: **propose** a permission set, and hand it to you to install.

## ⚠ Read this before anything else: Signal cannot grant itself permission

Permission rules are enforced by **Claude Code, not by the model**. Quoted from the platform docs: *"Instructions in your prompt or `CLAUDE.md` shape what Claude tries to do, but they don't change what Claude Code allows."*

Plugins are locked out of the mechanism **three ways**, verified 2026-08-25 (`analysis/PERMISSIONS-SPIKE.md`): the plugin manifest has no `permissions` key; `permissionMode` is explicitly unsupported for plugin-shipped agents *"for security reasons"*; and plugins are not a settings source at all.

So this command **emits a proposal**. You install it. There is no `--force`, no `--install`, and no code path in `tools/lib/permissions-report.js` that writes to `.claude/` or `~/.claude/` — asserted by a test that checks the filesystem after a full render, not by a reviewer reading the source.

**Do not add a Signal permission model, a consent vocabulary, or a rigor-style dial for this.** The three options anyone would design are the three modes the platform already ships — `default`, an `allow` rule, `dontAsk` — and a fourth unenforced dial beside `tier` / `gate_strictness` / `attention` is `B75`, this repository's named defect.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/permissions-report.js` — `buildProposal`, `formatReport`, `renderArtifact`, `writeArtifact`, `parseFlags`, `DENY_PROPOSALS`, `DENY_CAP`, `PLATFORM_MODES`, `ARTIFACT_REL`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/permissions-scan.js` — `scanPrescribedCommands`, `classify`, `unclassifiedBinaries`, `CLASSIFICATION`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/permissions-state.js` — `readPermissionScopes`, `proposalDelta`, `formatScopeReport`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/stack-detect.js` — `detectStack`, `stackRules`

## Workflow

### 1. Parse flags

Call `parseFlags(argv)`. On `ok: false`, emit the returned `error` — which names the offending flag **and** the valid set — and exit. An unrecognised flag is never ignored.

- *(no flags)* — report only.
- `--apply` — additionally write the proposal to `.planning/PERMISSIONS.md`. ⚠ **`--apply` writes the ARTIFACT, never a settings file.** The name means "write the document", not "install the rules".

### 2. Build and render

```js
const p = buildProposal({ pluginRoot: CLAUDE_PLUGIN_ROOT, baseDir, homeDir: os.homedir() });
console.log(formatReport(p));
```

The report has four parts, and each carries its own honesty:

1. **What the payload prescribes** — split into prose and code counts. A rule traceable to an `execFileSync` call site is stronger evidence than one traceable to prose, and the report says which.
2. **What is already granted** — user / project / local. A scope that is **absent** and one that is **unreadable** render differently and neither renders as "0 rules" (`B39`).
3. **What is proposed** — flow-derived and stack-derived, labelled **separately** so you can install one half and refuse the other.
4. **What this could not establish** — the approximation limit, on every path including the clean one.

### 3. Write the artifact (only with `--apply`)

```js
const r = writeArtifact(baseDir, renderArtifact(p));
```

Three outcomes, and **report whichever came back**:

- `written` — the proposal is at `.planning/PERMISSIONS.md`.
- `unchanged` — byte-identical to what was there; the file was not touched.
- `skipped` — **there is no `.planning/` here.** Report the returned `reason`. The report above is still complete: the flow half needs only the payload and the stack half only the host manifests.

⚠ **Never create `.planning/` from this command.** Scaffolding a project belongs to `/sig:new-project` and `/sig:init`; a permissions report that quietly initialises a project is a side effect nobody asked for.

### 4. Tell them where to install it

The recommended target is **`.claude/settings.json`** — the *tracked* project scope.

**Not `.claude/settings.local.json`.** That file is gitignored, so a rule installed there cannot be shared, committed, or carried to another machine — every repo on every machine starts empty and re-accumulates its own. It is also where *"Yes, and don't ask again"* writes by default, which is why permission state so often is not under version control at all.

Name the `update-config` skill as the route if they want help editing settings. **Do not invoke it.**

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Just write the settings file — the user clearly wants these rules." | **No.** Authority stays with the user; that is the whole design (`D-BR0826-1`), and the platform put it there deliberately. A proposal they did not read is not consent. |
| "`.planning/` is missing — create it so the artifact has somewhere to go." | No. Report `skipped` with its reason. The report is complete without the artifact, and creating project scaffolding from a permissions command is scope nobody asked for. |
| "The deny list is short; add a few more useful blocks." | Deny is **absolute** and cannot carry allowlist exceptions. `DENY_CAP` is 8 and enforced by a test precisely so this list cannot grow by accretion into something that stops work the operator wanted. |
| "Add a `permission_level` to PROFILE.md so this is configurable." | That is a fourth unenforced dial beside `tier` / `gate_strictness` / `attention` — `B75` exactly. Signal's prose cannot change what Claude Code allows. |
| "The scan found a binary nobody classified — default it to allow so the run is clean." | No. `classify` returns `undefined` on purpose, and the suite fails until someone decides. Failing open is how `rm` reaches a proposal the day somebody renames it. |

## Output contract (shaping failures — stated as recipes, `B38`)

- **The report renders in any repository**, including one with no `.planning/` and no Signal install. The tracked artifact is written only where `.planning/` already exists.
- **A scope that could not be read is a line the reader sees**, with its reason — never a silent omission and never "0 rules".
- **Flow-derived and stack-derived rules stay under separate headings**, so a reader can accept one and refuse the other.
- **The approximation limit renders whenever the read renders**, including when every scope parsed cleanly. That is the case where a reader would otherwise conclude the picture is complete.

## Gate: Proposal Complete

- [ ] The report rendered, including the "what this could not establish" section
- [ ] Every unreadable scope appeared as `cannot-check`, never as "none"
- [ ] Flow-derived and stack-derived rules were labelled separately
- [ ] **No settings file was written** — this is a property of the code, not of your care
- [ ] With `--apply`: the artifact outcome (`written` / `unchanged` / `skipped`) was reported as returned
