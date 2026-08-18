# Milestone 6 — opened 2026-08-14

**Opened on a decided Epic, not on a theme.** Milestone 5 closed with `v0.1.25` (`D-BR0809-2`), and
the "what is M6 about?" question was deliberately left open. `M6.E1` did not wait for it: the work is
concrete, the research is done, and the decision was made (Brett, 2026-08-14). **The theme should
follow from what M6 actually does, rather than being declared first and then argued with.**

The two candidate themes are recorded in `BACKLOG.md` and remain live for `E2` onward:

- **The semantic half of claim integrity** — `AC0.1` / `D-M5E10-1`, the faithfulness backstop
  `M5.E10` deliberately did not build, plus `M5.E11` (Roadmap Advisor), which was sequenced behind
  `M5.E10` and is now unblocked.
- **"A mechanism exists and does not do its job"** — the reading that came out of the 2026-08-14
  unreached-mechanism count: **17 of 25 confirmed bugs**, against 8 that need something built. See
  `analysis/UNREACHED-MECHANISM-ANALYSIS.md` § *The count, run*. **Note the count's own caveat before
  using it as a mandate:** the stated decision rule was *not* satisfied, and 7 of those 17 are the
  `B39` sibling class rather than the unreached class.

## Epic status

| Epic | Status | Summary |
|---|---|---|
| `M6.E1` | **in flight** — opened 2026-08-14 | The plugin payload: what an install actually copies. |

---

## `M6.E1` — The plugin payload

**Plain: an install ships the whole repository. Make it ship the plugin.**

**Source:** `B99` (P2, `BUGS.md`) — carries the measurements and the completed packaging research.

**The problem, measured rather than estimated.** A cached install is **58 MB**: ~11 MB of tracked
files (of which `.planning/` is 4.8 MB and `tests/` 2.1 MB) plus **47 MB of `node_modules`** that
Claude Code installs itself because the plugin root contains a `package.json` and a lockfile. What
running `/sig:*` actually needs is **~2.1 MB**. Separately, the marketplace is a **second** fetch —
a full clone of this repo, 19 MB, `.planning/` included.

**Two costs, and the second is why this is not a tidiness Epic.** Size is the visible one. The other
is that `.planning/` is Signal's working memory — measurements against real client projects, bug
diagnoses, business reasoning. Publishing it **in a public repository** was a deliberate, defensible
choice. **Copying it into every user's plugin cache was never separately decided**; it followed from
`source: "."`.

**Decided before the Epic opened** (Brett, 2026-08-14), so DISCUSS does not re-litigate it:

1. **Route A — move the plugin files into their own directory** — chosen over Route B (a CI-built zip
   published per release). **The reason is specific to this repo:** `D-M5E17-4` moved delivery *away*
   from pinned refs because keeping a version and a digest in sync drifted and caused `B58`. Route B
   reintroduces exactly that, permanently, to avoid a one-time cost — and pre-1.0 with four users is
   when that one-time cost is cheapest.
2. **The catalog moves to a URL** — `signal.insightriot.com/install/marketplace.json`, served by the
   existing `signal-map` Vercel project. A URL marketplace downloads **only that file**, which is
   what removes the 19 MB clone. Verified: that domain is public (project SSO is
   `all_except_custom_domains`).
3. **Users keep tracking `main`.** `git-subdir` with no `ref`/`sha` resolves to the default branch, so
   `D-M5E17-4`'s property survives — nothing pinned, nothing to drift. *"Latest" continues to mean
   latest **released***: `plugin.json`'s version is the cache key, so an update is visible when that
   field is bumped, exactly as today.

**Known constraints, established by research and not to be rediscovered:**

- There is **no include/exclude/files/ignore field** anywhere in the plugin system — confirmed by
  grep over the full 1316-line plugin reference. A subdirectory plugin root is the only lever.
- **Nothing may reference outside the plugin root after the move.** Documented: paths that traverse
  outside it *"will not work after installation."* `${CLAUDE_PLUGIN_ROOT}` becomes the subdirectory,
  and it is referenced from `tools/`, `hooks/` and 7+ command files.
- **The dependency install is triggered by `package.json` + a lockfile in the plugin root** and
  *"can't be turned off; no setting or environment variable disables it."* A plugin root without
  those two files never triggers it. Signal has exactly **one** runtime dependency (`yaml`).
- `tests/install-contract.test.js` pins `plugins[0].source` to `"."`. `"./plugin"` is still the
  relative **string** form, so `B58`'s lesson survives the edit; the assertion changes, its intent
  does not.

**Blast radius, measured at open:** 138 test files import from `tools/`; the build script, lint path,
vitest config and `validate-plugin.js` all assume today's layout. This is the largest structural
change Signal has made to itself.

**Required deliverable, not optional** (`B99`): the existing-user migration section on
`signal.insightriot.com/install`. It could not be written before this Epic because its instruction is
*re-add from the new URL*. **Measured first:** the version cache mostly clears itself (11 of 13
survivors are inside the documented ~14-day orphan sweep), so the section must **not** tell users to
delete version directories. The **marketplace clone** is the part that does not self-clean and is
orphaned outright by this change.

**Done when:** a fresh install carries only the plugin payload, `.planning/` and `tests/` reach no
user by either fetch, `node_modules` is not installed into the cache, users still track `main` with
nothing pinned, the suite is green, and the install page tells an existing user how to migrate.

**Out of scope, stated so it is not absorbed:** whether `.planning/` should be public at all. This
Epic stops it being **copied to users**; keeping it in a public repo remains a separate, deferred
decision (`B99`).
