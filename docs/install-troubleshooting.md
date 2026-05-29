# Install Troubleshooting

Symptom-organized troubleshooting for `/plugin install sig@signal` on Claude Code. If the install isn't behaving as expected, find your symptom in § Quick Triage below and jump to the matching section. For the full empirical record of what's been verified, see [`install-verification.md`](./install-verification.md) § R1.

> **Claude Code version verified:** 2.1.150 (commands tested below). Most workarounds require ≥ 2.1.121 (CLI verbs like `claude plugin uninstall`) or ≥ 2.1.141 (`CLAUDE_CODE_PLUGIN_PREFER_HTTPS` env var). Check yours with `claude --version`.

---

## Quick triage

What did you see? Jump to the matching section.

| You see... | Section |
|---|---|
| `/plugin install sig@signal` reports "already at latest" but `/sig:*` commands run stale code | [Symptom 1 — install short-circuit on stale gitCommitSha](#symptom-1--plugin-install-reports-already-at-latest-but-cached-code-is-stale-p1) |
| `/plugin` interactive menu shows Enable / Disable / Update but no Uninstall verb | [Symptom 2 — no Uninstall verb in interactive UI](#symptom-2--plugin-interactive-menu-has-no-uninstall-verb-p2) |
| You uninstalled + reinstalled, but `/sig:*` commands still don't register | [Symptom 3 — Disabled state survives uninstall + reinstall](#symptom-3--plugin-stays-disabled-after-uninstall--reinstall-p3) |
| `/sig:*` namespace ambiguous, or commands not resolving on a machine that had `signal@signal` (pre-rename) | [Symptom 4 — pre-rename signal@signal cache orphan](#symptom-4--pre-rename-signalsignal-cache-orphan) |
| `git clone` of the marketplace fails with SSH auth error on a multi-identity SSH config | [Symptom 5 — SSH multi-identity clone failure](#symptom-5--ssh-multi-identity-clone-failure-cross-link) |

If your symptom isn't here, the [§ Canonical clean reinstall](#canonical-clean-reinstall-sequence) below is the safe full reset.

---

## Canonical clean reinstall sequence

Use this when you want a guaranteed-clean reinstall, or when no specific symptom above matches. This is the 4-step sequence the maintainer used to recover from compounded P1 + P2 + P3 (see [`install-verification.md`](./install-verification.md) § R1).

1. **Uninstall via CLI** (covers the cache + manifest entry that the interactive UI can't):

   ```bash
   claude plugin uninstall sig --scope user
   ```

2. **Edit `~/.claude/settings.json`** — remove the `enabledPlugins` entry for `sig@signal` if it exists (it survives uninstall and will keep the plugin "Disabled" on reinstall):

   ```bash
   # Open in your editor — the file is JSON. Look for:
   #   "enabledPlugins": {
   #     "sig@signal": false   ← delete this line entirely
   #   }
   ```

3. **Reinstall:**

   ```bash
   # In a Claude Code session:
   /plugin marketplace add insightriot/signal
   /plugin install sig@signal
   ```

4. **Reload + verify:**

   ```bash
   /reload-plugins
   /agents      # should show sig:scanners:*, sig:specialists:*, etc.
   ```

If `/reload-plugins` reports "1 plugin · 14 skills · 32 agents · 1 hook" and `/agents` lists the Signal agents under `sig:<subdirectory>:<name>` naming, the install succeeded.

---

## Symptom 1 — `/plugin install` reports "already at latest" but cached code is stale (P1)

**Upstream:** [anthropics/claude-code#56740](https://github.com/anthropics/claude-code/issues/56740) — open since 2026-05-06. This is a Claude Code plugin-host bug, not a Signal bug.

### You will see

```
/plugin marketplace update signal
  → Catalog updated to v0.1.3.

/plugin install sig@signal
  → Plugin already at latest version. Nothing to do.

/reload-plugins
  → 1 plugin · 14 skills · 32 agents · 1 hook
```

But when you actually invoke a `/sig:*` command, the behavior matches an older version of the code, not v0.1.3.

### Root cause

Claude Code's `/plugin install` short-circuits on the `version` field in `~/.claude/plugins/installed_plugins.json` rather than on the `gitCommitSha` content-identity. If the catalog bumped the version string but the installed entry already carries that version (even though the cached code at `installPath` is older), the install logic concludes "nothing to do."

Reference: [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference). Empirically observed on the maintainer business box, 2026-05-19, where the installed entry showed `version: 0.1.2` and `gitCommitSha: fdc1247e09c7f434550a78745274b093d0619dc2` (a commit between v0.1.0 and v0.1.1 — predating either tag).

### Workaround

Force a fresh install by uninstalling first via the CLI:

```bash
claude plugin uninstall sig --scope user
```

Then reinstall in a Claude Code session:

```
/plugin install sig@signal
/reload-plugins
```

### Why this happens

Plugin manifests have two version-identity fields. The `version` field tracks the human-readable semver tag (`0.1.3`). The `gitCommitSha` tracks the actual content identity (the commit the install resolved). When the catalog bumps the version but the local cache holds an older commit pinned to that same version string, the short-circuit fires. Fully uninstalling clears both fields so the next install resolves fresh.

---

## Symptom 2 — `/plugin` interactive menu has no Uninstall verb (P2)

**Upstream:** [anthropics/claude-code#62497](https://github.com/anthropics/claude-code/issues/62497) — open since 2026-05-26. This is a Claude Code plugin-host bug, not a Signal bug.

### You will see

The `/plugin` interactive menu offers these verbs:

- Enable
- Disable
- Update
- Add to favorites
- Open homepage
- View repository
- Back

No "Uninstall." Choosing "Disable" stops Claude Code from loading the plugin's commands and agents, but leaves the cache directory at `~/.claude/plugins/cache/signal/sig/<version>/` and the manifest entry in `~/.claude/plugins/installed_plugins.json` in place. Subsequent `/plugin install` attempts re-trigger Symptom 1's short-circuit.

### Root cause

The interactive `/plugin` UI doesn't expose an Uninstall verb (see [Claude Code issue #30138](https://github.com/anthropics/claude-code/issues/30138)). The CLI verb `claude plugin uninstall` was added in Claude Code 2.1.121+ — it covers both cache directory removal and `installed_plugins.json` cleanup.

### Workaround

Use the CLI:

```bash
claude plugin uninstall sig --scope user
```

Verify with:

```bash
cat ~/.claude/plugins/installed_plugins.json
# The "sig@signal" entry should be absent.
ls ~/.claude/plugins/cache/signal/ 2>/dev/null
# Should be empty or absent.
```

### Fallback (if CLI verb unavailable, e.g. older Claude Code)

Manual filesystem purge — use only if `claude plugin uninstall` isn't present:

```bash
# 1. Remove the cache directory
rm -rf ~/.claude/plugins/cache/signal/sig/

# 2. Edit ~/.claude/plugins/installed_plugins.json — remove the
#    "sig@signal" key from the "plugins" object. Save.

# 3. If the marketplace registration is also stale:
#    in a Claude Code session, run:
#      /plugin marketplace remove signal
#      /plugin marketplace add insightriot/signal
```

The cache directory path is `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. For Signal, that's `~/.claude/plugins/cache/signal/sig/<version>/`.

---

## Symptom 3 — Plugin stays Disabled after uninstall + reinstall (P3)

**Upstream:** [anthropics/claude-code#63624](https://github.com/anthropics/claude-code/issues/63624) — filed 2026-05-29. This is a Claude Code plugin-host bug, not a Signal bug.

### You will see

A clean reinstall completed without errors:

```
/plugin marketplace add insightriot/signal
/plugin install sig@signal
/reload-plugins
  → 1 plugin · 14 skills · 32 agents · 1 hook
```

But `/sig:*` commands don't autocomplete, and `/plugin` shows the plugin with `Status: Disabled`.

### Root cause

Enable/disable state lives in `~/.claude/settings.json` under the `enabledPlugins` key, as `"sig@signal": false` (Disabled) or `true` (Enabled). Neither marketplace removal nor `claude plugin uninstall` touches this key — so if you previously Disabled the plugin via `/plugin → Disable`, that `false` value persists across uninstall + reinstall, and the next reinstall picks it up.

### Workaround

Edit `~/.claude/settings.json` and remove (or flip to `true`) the `sig@signal` entry under `enabledPlugins`:

```json
{
  "enabledPlugins": {
    "sig@signal": true    // or just delete this line
  }
}
```

Then restart Claude Code (or `/reload-plugins`) and re-run the install sequence if needed.

### Note

This is a Claude Code UX papercut. Filed upstream as [#63624](https://github.com/anthropics/claude-code/issues/63624) on 2026-05-29. Disabled state surviving uninstall is rarely what a user wants, and there's no visible signal during install that explains why a "successful" install isn't producing working commands.

---

## Symptom 4 — Pre-rename `signal@signal` cache orphan

### Who is affected

Only users who installed Signal **before M4.t19 (2026-05-12)**, when the plugin slug was renamed `signal` → `sig` so the marketplace install would produce the `/sig:*` command prefix. The pre-rename install entry was registered as `signal@signal`; the post-rename install is `sig@signal`. Upgrading without first removing the pre-rename install leaves a dangling cache directory.

If you installed Signal for the first time on or after 2026-05-12, this section does not apply.

### Symptom

Inconsistent — may manifest as `/sig:*` commands not resolving cleanly, `/signal:*` commands appearing as ghosts, or `/plugin` showing two entries (one for each slug). The dangling directory at `~/.claude/plugins/cache/signal/signal/<version>/` is the actual landmine, but its user-visible symptom depends on Claude Code's plugin-resolution order on the local machine.

### Workaround

Inspect for the orphan first:

```bash
ls ~/.claude/plugins/cache/signal/
# If you see both `signal/` and `sig/` subdirectories, the orphan
# is present. If you see only `sig/`, you're clean.
```

If present, remove the orphan cache directory + the manifest entry:

```bash
# 1. Delete the dangling cache
rm -rf ~/.claude/plugins/cache/signal/signal/

# 2. Edit ~/.claude/plugins/installed_plugins.json — remove the
#    "signal@signal" key from the "plugins" object if present.

# 3. Reload
#    /reload-plugins
```

After this, the canonical `sig@signal` install path is clean.

---

## Symptom 5 — SSH multi-identity clone failure (cross-link)

If `/plugin marketplace add insightriot/signal` or `/plugin install` fails with an SSH authentication error on a machine using multi-identity `~/.ssh/config` (separate identity files for personal vs. work GitHub accounts, no default `Host github.com` block), this was the original failure mode that motivated **v0.1.1's marketplace source-block fix**.

Resolution: set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` in your environment (Claude Code 2.1.141+) to make plugin operations use HTTPS rather than SSH. Details:

- [`CHANGELOG.md`](../CHANGELOG.md) § [0.1.1]
- [`install-verification.md`](./install-verification.md) § R1 — "Install adventure" prelude

---

## Reference — where Claude Code stores plugin state

If you need to inspect or hand-edit plugin state, these are the files Claude Code uses:

| Path | Purpose | When to hand-edit |
|---|---|---|
| `~/.claude/plugins/installed_plugins.json` | Per-scope manifest of installed plugins. Each entry has `scope`, `installPath`, `version`, `installedAt`, `lastUpdated`, `gitCommitSha`. | When `claude plugin uninstall` isn't available, or to clear orphan entries (Symptoms 2 + 4). |
| `~/.claude/settings.json` (`enabledPlugins`) | Per-plugin enable/disable state, keyed by `<plugin>@<marketplace>`. Survives uninstall. | To resolve Symptom 3, or to manually enable/disable without using `/plugin`. |
| `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` | Cached plugin source. For Signal: `~/.claude/plugins/cache/signal/sig/<version>/`. | When you need a guaranteed-clean cache (Symptoms 1 + 2 + 4). |
| `~/.claude/plugins/known_marketplaces.json` | Registered marketplaces (name → repo). | If `/plugin marketplace remove` fails to clean up, or to manually register a marketplace. |

---

## See also

- [README](../README.md) — install + first-project walkthrough
- [CHANGELOG](../CHANGELOG.md) — version history, including the v0.1.1 SSH fix and v0.1.3 synthesizer-prose hardening
- [install-verification.md](./install-verification.md) — empirical install matrix; § R1 contains the maintainer's full install-adventure record that motivated this troubleshooting doc
- [Claude Code Plugins Reference (official)](https://code.claude.com/docs/en/plugins-reference)
