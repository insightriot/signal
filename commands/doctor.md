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
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/doctor.js` — `detectP1StaleGitCommitSha`, `detectP2OrphanCacheEntry`, `detectP3OrphanEnabledFlag`, `detectP4PreRenameSlug`, `detectP5SshMultiIdentity`, `runAllDetectors`, `readInstallState`, `checkDoctorEnvironment`, `DoctorDetectionError`, `DoctorEnvironmentError`
- `${CLAUDE_PLUGIN_ROOT}/docs/install-troubleshooting.md` — human-readable troubleshooting docs (referenced from doctor output)
- `${CLAUDE_PLUGIN_ROOT}/.planning/DECISIONS.md` — D-E8-1 through D-E8-12 (locked decisions)

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

Call `runAllDetectors(state)`. Returns `{ healthy, findings, aggregate_recommendation }`.

### 5. Report findings

#### Healthy path

If `healthy === true` and `findings.length === 0`:

```
✓ Signal v{version} installed and healthy — no action needed.
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

Exit 0.

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
- `P3` → `disabled-state survives reinstall (orphan enabledPlugins entry)`
- `P4` → `pre-rename signal@signal slug present`
- `P5` → `SSH multi-identity config detected (info-only)`

Upstream-issue map (D-E8-9):
- P1 → `https://github.com/anthropics/claude-code/issues/56740`
- P2 → `https://github.com/anthropics/claude-code/issues/62497`
- P3 → (filled by S1.t14 — link in docs/install-troubleshooting.md after issue file)
- P4 → no upstream (historical Signal rename)
- P5 → no upstream (environmental)

Exit 1.

### 6. Flag dispatch

- **No flags** → exit code per § 5.
- **`--fix`** → **[S2 not yet implemented — exit 0 with a "coming in S2" note for now]**
- **`--reinstall`** → **[S2 not yet implemented — exit 0 with a "coming in S2" note for now]**

S2 will replace these stubs with:

1. `--fix` on `healthy: true` → print "No findings to remediate." Exit 0; no script written.
2. `--fix` on findings → call `buildFixScript(findings, {homeDir})` → call `writeDoctorScript("~/.claude/sig-doctor.sh", content)` → print `Generated ~/.claude/sig-doctor.sh — review then run: bash ~/.claude/sig-doctor.sh` → exit 0.
3. `--reinstall` (any state) → call `buildReinstallScript({homeDir})` → write → print run instruction → exit 0.

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

## Gate: Doctor Complete

- [ ] Platform check fires first; non-darwin / non-/Users / no-~/.claude → polite stub exit 0.
- [ ] `readInstallState` errors map to exit 2 with friendly retry message.
- [ ] Each finding is Signal-scoped (D-E8-11) — non-Signal plugin state in fixtures never triggers detection.
- [ ] Exit code per D-E8-12: 0 healthy / 1 P-states / 2 doctor errored.
- [ ] `--fix` / `--reinstall` stubs print "coming in S2" but do not crash.
- [ ] Validator recognizes `commands/doctor.md` (S1.t11).
- [ ] CLAUDE.md + CONTEXT.md + README list `/sig:doctor` (S1.t12).
- [ ] `docs/install-troubleshooting.md` cross-links upstream #56740 + #62497 (S1.t13).
- [ ] New P3 issue filed; URL captured in install-troubleshooting.md (S1.t14).
