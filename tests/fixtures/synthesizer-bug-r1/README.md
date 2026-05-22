# synthesizer-bug-r1 fixture

Test fixture for M4.5.E7 (synthesizer prose-quality + install-UX hardening) — regression coverage for the 6 character-drop patterns first surfaced in `docs/install-verification.md` § R1 (2026-05-19 biz-machine dogfood of `/sig:init` on `expressjs/express`).

## Layout

| Path | Contents |
|---|---|
| `scan/` | Verbatim copy of the 4 scanner outputs from the 2026-05-22 re-repro (`/tmp/express-repro-e7/.planning/scan/{stack,structure,activity,quality}.md`). These are the synthesizer's deterministic inputs — Layer B tests assert that the synthesizer's output, given these inputs, matches `expected/`. |
| `actual/` | The post-synthesis `LANDSCAPE.md` + `PROJECT.md` containing all 6 R1 character-drop patterns. **Synthetic** — see § Provenance below. |
| `expected/` | Hand-corrected versions where each character drop is reversed and nothing else changes. Produced in S1.t3. Tests assert structural equivalence to `actual/` minus the 6 patterns. |
| `CLASSIFICATION.md` | Per-pattern Layer B (deterministic) vs Layer C (free-form) classification. Produced in S1.t2. |

## Provenance — why `actual/` is synthetic

The S1.t1 re-repro on 2026-05-22 (Mac Studio, Opus 4.7 1M, fresh `--depth=1` clone of `expressjs/express` v5.2.1) produced **clean** LANDSCAPE.md + PROJECT.md output. Zero of the 6 R1 patterns reproduced under exact-string match — every heading was well-formed (`## Inferred goals & uncertainties`, `## Constraints` both intact), the structure table cell was `index.js`-prefixed, and the Activity-signals shallow-clone remediation hint rendered with proper code-fence boundaries.

The re-repro was structurally faithful to the R1 run (same plugin commit, same target repo, same scanner agent definitions, same init.md synthesizer template), but the bug did not surface. Per the M4.5.E7-PLAN.md S1.t1 acceptance criterion ("If patterns vanished entirely, escalate to user — bug may have self-resolved or be environmentally sensitive; tests-first strategy may need re-thinking") and the VALIDATION.md Dim-7 risk acknowledgement ("non-determinism of LIVE LLM output is exactly what the 3-layer architecture sidesteps"), the user (Brett) elected to **synthetic-inject** the 6 documented R1 patterns into the clean re-repro base.

The result is `actual/` — structurally identical to a real synthesizer output, with the 6 R1 patterns injected at the documented locations:

| # | Pattern | Buggy form (in `actual/`) | Clean form (in `expected/`, S1.t3) | Where |
|---|---|---|---|---|
| 1 | Heading boundary | `## Ierred goals & uncertainties` | `## Inferred goals & uncertainties` | LANDSCAPE.md L51 |
| 2 | Heading boundary | `## ints` | `## Constraints` | PROJECT.md L40 |
| 3 | Table-cell drop | `\| is \| Top-level entry (224 bytes)` | `\| index.js \| Top-level entry (224 bytes)` | LANDSCAPE.md Project structure table |
| 4 | Mid-flag command drop | `--checkt/ test/acceptance/` | `--check-leaks test/ test/acceptance/` | LANDSCAPE.md Test surface |
| 5 | Sentence/code-fence boundary | `...not real cadence).git fetch --unshallow\`` | `...not real cadence).` newline `` `git fetch --unshallow` `` | LANDSCAPE.md Activity signals |
| 6 | Mid-word truncation | `Constraints (Team / contributoiteria.` | `Constraints (Team / contributors — no fixed criteria for this project — see Notes).` | PROJECT.md Notes |

The synthetic-injection approach is consistent with the plan's architectural intent: the 3-layer test architecture treats fixtures as deterministic on-disk artifacts, not live LLM captures. Whether `actual/` arrives via real LLM capture or via manual injection from the R1 record, the test surface it presents is the same.

## How the layers use this fixture

- **Layer A — fixture itself.** This directory. The pair (`actual/`, `expected/`) is the canonical record of the 6 patterns.
- **Layer B — deterministic regression tests** (S1.t4). Tests in `tests/synthesizer-regression.test.js` assert that `expected/` is well-formed (every h2 heading parses; `extractSection` recovers every section), and that `extractSection` / `embedSection` applied to scanner inputs in `scan/` produce the substrings that appear in `expected/`. They use `actual/` to anchor "what red would look like" — each test's red-state assertion is encoded inline (e.g., the same regex that matches `expected/` does not match `actual/`).
- **Layer C — prompt-template lint tests** (S1.t7). Tests assert shape properties of `commands/init.md` that, if violated, would produce R1-style output. These do not directly read this fixture; they read `commands/init.md`.

## Updating this fixture

If a future Express version (or a different repository) is needed to expand pattern coverage:

1. Re-clone shallow into `/tmp/express-repro-eN` (where N is a fresh suffix).
2. Run `/sig:init`-flow against the clone (4 scanners + Step 3 + Step 4) per `commands/init.md`.
3. Compare new output against this fixture; if new patterns surface, add a sibling fixture (`tests/fixtures/synthesizer-bug-r2/`) — do **not** mutate this one. The R1 record is historical.

---

*Created 2026-05-22 as part of M4.5.E7.S1.t1. Provenance + per-pattern locations are load-bearing for downstream S1 tasks (S1.t2 classification, S1.t3 hand-correction, S1.t4 Layer B tests).*
