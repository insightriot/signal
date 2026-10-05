---
id: SIG-7
type: BUG
status: C
title: "`plugin.json` version stuck at `0.1.6` through the entire v0.1.7 release
  — clean main fails `install-contract.test.js`."
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:26
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B7
---
| B7 | `fixed` | P2 | **`plugin.json` version stuck at `0.1.6` through the entire v0.1.7 release — clean main fails `install-contract.test.js`.** At `HEAD` **and at the `v0.1.7` tag itself**, `.claude-plugin/plugin.json` reports `"version": "0.1.6"` while `CHANGELOG.md` (`[0.1.7] — 2026-07-15`), the `v0.1.7` git tag, and `marketplace.json` `source.ref` all say v0.1.7. `install-contract.test.js:66` (`expect(marketplace…source.ref).toBe(\`v${plugin.version}\`)`) fails on a clean checkout: ref `v0.1.7` ≠ `v0.1.6`. **User-visible:** a `/plugin install` of v0.1.7 self-reports version 0.1.6 in the plugin list. **Root cause:** the M4.5.E11 SHIP (v0.1.7) bumped CHANGELOG + tag + marketplace ref but missed `.claude-plugin/plugin.json` (last bumped at `7302c21 Signal v0.1.6`). Confirmed 2026-07-16 (M5.E1 EXECUTE baseline run: 998 pass / 1 fail). **Secondary drift (needs a look, not the test cause):** `marketplace.json` pins `sha: 8e05e56…` but `v0.1.7` resolves to commit `0eb8ca8…` — the pinned sha ≠ the tag commit. **Fix:** bump `plugin.json` → `0.1.7` (and reconcile the marketplace `sha` if the drift confirms) on a standalone release-hygiene commit; not M5.E1 scope. |