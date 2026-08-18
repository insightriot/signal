---
name: sig:doctor
description: "Claude Code plugin install-state diagnostician. Detects 5 documented failure modes, can generate a remediation shell script (--fix surgical, --reinstall full canonical), and reports healthy or actionable findings. macOS only first ship."
args: "[--fix | --reinstall]"
---

# `/sig:doctor` — Install-state diagnostician

You are running `/sig:doctor`, a not-phase-gated diagnostic + remediation command. Same class as `/sig:status`, `/sig:resume`, `/sig:checkpoint`, `/sig:add` — no tier-gating preamble, no skill loading, no agent spawning.

Three modes:

- **No flags** (default): detection-only. Reads `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json`, and `~/.claude/plugins/cache/signal/*` to check for 5 documented P-state failure modes. Prints findings + recommended next action. Exit 0 healthy / 1 P-states detected / 2 doctor errored (D-E8-12).
- **`--fix`**: detection + generate a *surgical* remediation script (only the steps required by detected P-states) at `~/.claude/sig-doctor.sh`. Does NOT execute the script. User reviews, runs, then re-invokes doctor to verify. **[S2 not yet implemented]**
- **`--reinstall`**: detection + generate the *full canonical clean reinstall* script at `~/.claude/sig-doctor.sh` regardless of starting state. Same script body whether the install is healthy or broken — the safeguard is per-mutating-step `[y/N]` prompts at execution time. **[S2 not yet implemented]**

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/doctor.js` — `detectP1StaleGitCommitSha`, `detectP2OrphanCacheEntry`, `detectP3OrphanEnabledFlag`, `detectP4PreRenameSlug`, `detectP5SshMultiIdentity`, `runAllDetectors`, `readInstallState`, `checkDoctorEnvironment`, `readLiveBindings`, `detectLiveBindings`, `parseClaudeProcesses`, `DoctorDetectionError`, `DoctorEnvironmentError`
- [`docs/install-troubleshooting.md`](https://github.com/InsightRiot/signal/blob/main/docs/install-troubleshooting.md) — human-readable troubleshooting docs (referenced from doctor output). **A URL, not a `${CLAUDE_PLUGIN_ROOT}` path (`M6.E1`):** `docs/` is not part of the plugin payload, so this file does not exist in an install and the old path resolved to nothing on every user's machine.
- [`.planning/DECISIONS.md`](https://github.com/InsightRiot/signal/blob/main/.planning/DECISIONS.md) — D-E8-1 through D-E8-12 (locked decisions). Same reason, and worse: the old plugin-root-relative form named **Signal's own** `.planning/` working notes, which are deliberately not shipped.

## Workflow

### 1. Pre-flight — environment check

Call `checkDoctorEnvironment({ platform: process.platform, homeDir: os.homedir() })`. If it throws `DoctorEnvironmentError`:

- Print the error message verbatim (it names the specific failure: platform, homeDir shape, or missing `~/.claude/`).
- Exit 0. Stub is a polite no-op — non-macOS users will see how to use the manual sequence in `docs/install-troubleshooting.md` and should not see Signal as broken.

### 2. Parse args

Recognized flags: `--fix`, `--reinstall`. Mutually exclusive. Any other flag → warn ("Ignoring unknown args: foo, bar.") and continue with default detect-only mode.

### 3. Read install state

Call `readInstallState({ homeDir: os.homedir() })`. If it throws `DoctorDetectionError`:

- Print the error message verbatim (it explains the malformed-JSON case + retry hint).
- Exit 2 — install state is unknown; user should investigate manually before running `--fix` / `--reinstall`.

### 4. Run all detectors

Call `runAllDetectors(state)`. Returns
`{ healthy, checked_all, findings, undetermined, aggregate_recommendation }`.

**`healthy` does not mean "everything was checked."** If `checked_all === false`, one or more
detectors could not run — read `undetermined` and render §5's *"could not check"* block. A clean
report that silently omits a check that never looked is `B39`, which this command exists downstream
of.

### 5. Report findings

#### Could-not-check block — renders BEFORE any verdict, whenever `checked_all === false`

Unconditional. Never suppressed because the rest of the report looks clean — that suppression *is*
the defect.

```
? {code} — could not check.
    {reason}
    This is not a clean result. It is an unknown.
```

#### Healthy path

If `healthy === true` and `findings.length === 0`:

```
✓ Signal v{version} installed and healthy — no action needed.
```

If `checked_all === false`, the line above must instead read:

```
✓ Signal v{version} — no problems found in the checks that ran ({n} could not).
```

Read `version` from `<state.manifest.plugins["sig@signal"][0].installPath>/.claude-plugin/plugin.json` for accuracy. Exit 0.

If `healthy === true` and `findings.length > 0` (P5 info-only path):

```
✓ Signal v{version} installed and healthy — informational findings below.

[i] P5 — SSH multi-identity config detected.
    Evidence: {evidence}
    This may affect git clone if marketplace operations are SSH-routed.
    If you see SSH auth errors during /plugin install:
      export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1
```

For a **P6** finding (`recommendation: 'info-only'`), render:

```
[i] P6 — Signal's marketplace is still fetched from GitHub.
    Evidence: marketplace "{evidence.marketplace}" → {evidence.repo}

    Your install works and nothing is broken. But a github-sourced
    marketplace clones the whole repository (~19 MB) on every refresh,
    where the published catalog is a single file.

    To switch — THREE commands, and the first one uninstalls Signal:
      claude plugin marketplace remove {evidence.marketplace}
      claude plugin marketplace add https://signal.insightriot.com/install/marketplace.json
      claude plugin install sig@signal

    `marketplace remove` uninstalls the plugin, and `add` alone does not
    bring it back — the third line is required, not optional. Your
    settings and your projects are untouched; the plugin itself is
    removed and reinstalled. Do this when you can finish all three.
```

Exit 0. **P6 never makes the install unhealthy** — the old path keeps working (`AC5.1`,
`D-M6E1-5`), so this is a nudge and must read as one.

#### Findings path

If `healthy === false`:

```
[!] {N} P-state(s) detected. Recommended action: /sig:doctor {aggregate_recommendation}
```

Then per finding, one block:

```
[X] {code} — {short title from finding type}
    Evidence: {evidence rendered as JSON or list}
    Upstream: {upstream issue URL if known, else "see docs/install-troubleshooting.md"}
```

Finding-code → short-title map:
- `P1` → `stale gitCommitSha (Claude Code short-circuited install)`
- `P2` → `orphan cache directories (Disable left filesystem behind)`

For a **P2** finding, call `readLiveBindings({homeDir: os.homedir()})` and render which orphans a
running session is still using — the report has to say this, because "orphan" means *not the current
version*, not *nobody is using it*:

```
    Held: {path}  (pid {pids}) — a running Claude Code session resolved this copy.
```

If `cannotDetermine`, print the reason under the §5 could-not-check shape instead. Never render an
empty held list when the check did not run.
- `P3` → `disabled-state survives reinstall (orphan enabledPlugins entry)`
- `P4` → `pre-rename signal@signal slug present`
- `P5` → `SSH multi-identity config detected (info-only)`

Upstream-issue map (D-E8-9):
- P1 → `https://github.com/anthropics/claude-code/issues/56740`
- P2 → `https://github.com/anthropics/claude-code/issues/62497`
- P3 → `https://github.com/anthropics/claude-code/issues/63624`
- P4 → no upstream (historical Signal rename)
- P5 → no upstream (environmental)

Exit 1.

### 6. Flag dispatch

Both script builders emit a **live-session binding guard** ahead of any deletion, and it re-checks
at script-run time rather than at generation time — a session can start in the gap, and
`~/.claude/sig-doctor.sh` survives to be run days later. Under `--fix` a held directory is never
offered for deletion at all; under `--reinstall` the wipe is the point, so the guard names the
sessions it will break *before* the `[y/N]`. Pass `libPath` only to override where the script calls
back for that re-check; the default is this module's own resolved path, which is the copy actually
running (`B52`).

Call `checkCacheCasingClash({homeDir: os.homedir()})` before any script generation — aborts with `DoctorDetectionError → exit 2` if the marketplace cache contains case-mismatched siblings (`signal/` + `Signal/`).

- **No flags** → exit code per § 5.

- **`--fix`**:
  1. If `findings.length === 0` (healthy) → print `No findings to remediate. Signal v{version} installed and healthy.` Exit 0. Script NOT written.
  2. Otherwise → `const script = buildFixScript(findings, {homeDir: os.homedir()})` → `await writeDoctorScript(join(os.homedir(), "sig-doctor.sh"), script)` → print `Generated {scriptPath} — review then run: bash {scriptPath}` → exit 0.

- **`--reinstall`**:
  Always → `const script = buildReinstallScript({homeDir: os.homedir()})` → `await writeDoctorScript(join(os.homedir(), "sig-doctor.sh"), script)` → print same `Generated ... — review then run: ...` message → exit 0.

Generated script lives at `~/.claude/sig-doctor.sh` (NOT next to the source repo). User reviews, runs `bash ~/.claude/sig-doctor.sh`, then re-invokes `/sig:doctor` to verify.

`--fix` and `--reinstall` are mutually exclusive — combining them prints an "ignoring --reinstall because --fix takes precedence" warning and proceeds with `--fix`.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| Skip the platform check — most users are on macOS anyway | No. D-E8-2 + positive-allowlist (D-E8-10 spirit). Linux/WSL users see a polite stub, not a crash with destructive cache scanning against unexpected paths. |
| Skip Signal-scoping detectors — `~/.claude/` is Signal's domain | No. D-E8-11. `~/.claude/` is Claude Code's domain; Signal coexists with every other installed plugin. Detectors that don't filter would propose `rm -rf` against other plugins. |
| Treat `--fix` as `--auto-fix` and execute the script directly | No. D-E8-1 + D-E8-3 + D-E8-5. The script-generate-then-user-runs-it model IS the safety mechanism. Even `--fix` writes a script for review. |
| Bundle `--fix` and `--reinstall` into a single mode with detection-based branching | No. D-E8-5. `--reinstall` is "I want to start clean regardless of starting state"; `--fix` is "do the surgical thing." Different intents, separate flags. |
| Auto-execute `/plugin install/uninstall` from inside doctor | No. OQ3 → option (b). Generated script invokes `claude plugin {uninstall,install}` shell CLI subcommands explicitly. Doctor itself doesn't run them. |
| Exit 0 on findings — they're informational, not fatal | No. D-E8-12. Exit 1 on P-states detected so CI / pre-commit hooks can gate on `!= 0`. P5 alone (info-only) keeps healthy:true → exit 0. |
| Fall through to detector logic on Linux just because the paths *might* exist | No. macOS-first ship per D-E8-2. Linux + WSL paths land in a follow-on slice when E1.S3 fresh-machine hardware exists. |
| Use `sed` for JSON edits in the generated script — `node -e` is verbose | No. JSON has nested structure; `sed` corrupts it on the second mutation. Inline `node -e` does atomic parse→mutate→temp-file-rename (S2 GREEN bundle 4f0105a). Length tradeoff documented in FUTURE-IDEAS § "/sig:doctor helper-script split". |
| Hardcode `~/.claude/plugins/cache/signal/sig/` paths in the generated script | No. D-E8-10. Detection resolves the actual absolute path; the script template substitutes it. Meta-test in `tests/doctor-script-gen.test.js` asserts the script body never contains literal `~/.claude/`. |
| Skip the `claude --version` preamble — users will have a recent version | No. The script is downloaded + reviewed + run in arbitrary environments. The preamble surfaces the detected version line and prints the 2.1.150+ requirement so a too-old runtime is visible before any `claude plugin` call fails (S2.t8). |
| Auto-execute `--fix` since it's surgical | No. D-E8-1 + D-E8-3. Script-gen-with-review applies to BOTH flags. Consistency over per-flag UX nuance. |
| An orphan cache dir is by definition unused — just `rm -rf` it | No. "Orphan" means the manifest does not name it as current; it says nothing about who is *running* it. Claude Code resolves a plugin path once per session and holds it for the process's life (`B52`), so a copy two versions old can have live sessions on it. Observed 2026-08-18: two sessions bound to a directory `--fix` listed for deletion. Held directories are skipped, not prompted. |
| Do the live-session check once, when the script is generated | No. The script is reviewed, then run — and may be re-run days later. A session started in that gap is invisible to a generation-time check. The guard runs inside the script, calling back into this module so there is one implementation of "which copy is in use" rather than a second one in bash (`B82`). |
| No live sessions found → nothing to warn about | Only if the check ran. `ps` unavailable, an unreadable cache dir, a missing `node` — each is `cannotDetermine`, and the generated script marks those steps `[UNVERIFIED]` rather than prompting as though it had looked (`B39`). |
| Skip the casing-clash check — `signal/` + `Signal/` siblings can't happen on APFS | No. They can't on the default case-insensitive APFS volume, but external volumes + WSL bind-mounts produce them. `checkCacheCasingClash` aborts hard (exit 2) so the user can resolve manually rather than have the script `rm -rf` the wrong directory (S2.t7). |

## Gate: Doctor Complete

- [ ] Platform check fires first; non-darwin / non-/Users / no-~/.claude → polite stub exit 0.
- [ ] `readInstallState` errors map to exit 2 with friendly retry message.
- [ ] Each finding is Signal-scoped (D-E8-11) — non-Signal plugin state in fixtures never triggers detection.
- [ ] Exit code per D-E8-12: 0 healthy / 1 P-states / 2 doctor errored.
- [ ] `--fix` on healthy install prints `No findings to remediate.` — no script written.
- [ ] `--fix` on findings writes `~/.claude/sig-doctor.sh` with surgical steps only.
- [ ] `--reinstall` writes the full canonical reinstall script regardless of starting state.
- [ ] Every mutating step in the generated script is wrapped in `read -p "Execute: ... [y/N]"`.
- [ ] Generated script body contains NO literal `~/.claude/` — paths are resolved absolute (D-E8-10 + S2.t12 meta-test).
- [ ] P2 findings name which orphans a live session resolved, or say the check could not run.
- [ ] Generated `--fix` script never prompts to delete a held directory — it skips it with the reason.
- [ ] The binding check runs inside the generated script, not only at generation time.
- [ ] `checkCacheCasingClash` fires before script gen; case-mismatched cache siblings abort with `DoctorDetectionError → exit 2`.
- [ ] Validator recognizes `commands/doctor.md` (S1.t11).
- [ ] CLAUDE.md + CONTEXT.md + README list `/sig:doctor` (S1.t12).
- [ ] `docs/install-troubleshooting.md` cross-links upstream #56740 + #62497 (S1.t13).
- [ ] New P3 issue filed; URL captured in install-troubleshooting.md (S1.t14).
