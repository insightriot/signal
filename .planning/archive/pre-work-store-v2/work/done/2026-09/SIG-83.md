---
id: SIG-83
type: BUG
status: C
title: "`guard-callers.test.js`'s scope-limit assertion was vacuous: every
  string it pinned appeared inside the assertion that…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:116
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B83
---
| B83 | `fixed` | P2 | **`guard-callers.test.js`'s scope-limit assertion was vacuous: every string it pinned appeared inside the assertion that pinned it.** `AC2.4 — this file states its own scope limit` read the WHOLE file into `self` and asserted `self` contained `SCOPE LIMIT`, `2 of the 4 known instances`, `B39`, `B46`, `NOT a check for the`. Each of those literals also occurs in the `expect(...)` line asserting it, so the test matched its own source and could never fail. **Proven, not reasoned: deleting the entire header comment block — all five pinned strings — left the test green.** Shipped M5.E13 (2026-07-29) and unguarded for three releases. **This is the exact failure the file was written to catch, and the file says so forty lines above**, in `hasCaller`: it explicitly skips `guard-callers.test.js` when looking for callers because *"a checker that satisfies itself is the failure it looks for"* — the authors saw the trap for the mechanism and not for the label. The scope limit is `D-M5E13-3`'s deliverable, the thing that stops the guard-caller mechanism over-claiming its coverage; it was the one part of the file nothing protected. **Found 2026-08-05 at M5.E15 VERIFY**, by mutation-testing the M5.E15 assertions rather than trusting them green — the new `AC5.2` note assertion was written the same way and was equally vacuous, so the Epic came within one commit of shipping a second instance. **Fixed in the same pass:** both assertions now read a `headerBlock()` helper scoped to everything above the first `import`, so a pinned string must appear where a reader actually meets it. A further assertion pins the non-vacuity itself (the header must be strictly shorter than the file and must not contain `expect(header)`), and both mutations — deleting the header, and removing only the `B81` banner — now correctly go red. **Second-order finding, same fix:** the `auto-discovered count is NOT the coverage count` assertion only ever passed because the phrase wraps across a comment line in the header and *did not* wrap in the assertion. Scoping to the header made it fail honestly, and it now matches the wrapped form. |