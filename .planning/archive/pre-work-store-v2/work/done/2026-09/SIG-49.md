---
id: SIG-49
type: BUG
status: C
title: "`package.json` says `0.1.11`; `.claude-plugin/plugin.json` says `0.1.12`."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:86
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B49
---
| B49 | `fixed` (v0.1.13) | P3 | **`package.json` says `0.1.11`; `.claude-plugin/plugin.json` says `0.1.12`.** The plugin manifest is the version of record for what a user installs, and it is correct; `package.json` was not bumped at the v0.1.12 release cut. Low impact today — nothing in the runtime reads `package.json.version`, and the marketplace install path uses the manifest — but the two files are the project's two public statements of its own version, and they disagree. **Cataloged from M5.E8 VERIFY (2026-07-28), deliberately not fixed there:** a version bump inside a measurement Epic is scope creep, and the release that fixes it should be the one that sets it. **FIXED in v0.1.13 (2026-07-28)** — bumped at the release cut, exactly as the fix shape specified. **And the fix shape's second half was wrong in an informative way:** `checkVersionConsistency` **already exists and already works** — it fired immediately on `.claude-plugin/marketplace.json` during this very release, catching a **third** version file the bump had missed. What it does not cover is `package.json`, which is precisely why `B49` survived undetected while the suite stayed green. **Remaining open work, re-scoped:** extend `checkVersionConsistency` to include `package.json`. The guard is not missing; its **scope** is. |