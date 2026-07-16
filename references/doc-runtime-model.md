# Doc-Runtime Model — how Signal keeps a project's docs lean

**Status: provisional-canonical (M5.E1, FR1).** This is the canonical model Signal
uses to organize a project's `.planning/` corpus so finished work *leaves* the live
files instead of accreting forever. It is recorded as **provisional-canonical**: the
later M5 feature-port re-audit may revisit it, but until then every downstream doc-runtime
requirement (FR2–FR7) references *this* doc rather than re-deciding the structure. No
second, competing index or graph design may be introduced by a downstream FR.

It is **borrowed from Curator, owned by Signal.** Curator's behavioral spine — a
read-first index, closed work distilled into short cards, a shallow `archive/<unit>/`
tree, link-health, a deterministic mover plus judgment-at-boundary — is the proven
blueprint. Per DECISIONS 2026-07-13, Signal takes **no runtime dependency** on the
external Curator CLI; the good parts are reimplemented Signal-native.

Related: `references/state-schema.md` (the STATE.md body skeleton this model prescribes),
`.planning/M5.E1-RESEARCH.md` (the 4-agent synthesis behind every claim here),
`.planning/DECISIONS.md` 2026-07-13 + 2026-07-16 (D-M5E1-1…6).

---

## 1. The two axes

Every `.planning/` file is classified on **two orthogonal axes**. The first is already
in `INDEX.md`; the second is the new, planner-facing one this Epic adds. HOT/WARM/COLD
alone cannot explain why `FUTURE-IDEAS.md` should evict but `DECISIONS.md` should not —
the second axis is what does.

### Axis 1 — load-frequency (heat; already in `INDEX.md`)

| Tier | Meaning |
|---|---|
| 🔥 **HOT** | Load by default; the live working set. |
| 🌤 **WARM** | Load on demand; live but not every session. |
| 🧊 **COLD** | Closed work; archived, read only when a specific closed unit is in question. |

This is classic heat-driven eviction, and Signal already has it.

### Axis 2 — growth-policy (NEW; the eviction-governing axis)

| Policy | Behavior | Examples | Governed by |
|---|---|---|---|
| **working-set** | Evicts **on close** — closed-unit narrative leaves the live file, leaving a one-line pointer. | STATE.md body, active-Epic scaffolding | FR2b (evict-on-close) |
| **inbox** | Evicts **on ship/promote** — a disposed entry physically leaves the file for a ledger. | `FUTURE-IDEAS.md` | FR3 |
| **append-log** | **Grows by design.** Bounded by TOC + grep, never loaded whole, **never evicted.** | `DECISIONS.md`, `RETROSPECTIVES.md` ledger | — (no eviction) |
| **spine** | Small, curated, **permanent.** | `INDEX.md` | — (hand-curated) |

The growth-policy axis is what tells an agent *what to do at a boundary*: working-set and
inbox files shed closed content; append-log and spine files never do. An append-log is not
"bloated" when it is large — it is doing its job; you navigate it by TOC/grep, not by loading.

---

## 2. Eviction destination — one rule: **unit-homed single-home**

Closed content joins **its own unit's** archive folder. There is exactly one home per
piece of closed content — no piece is copied into two places to keep in sync (a single-home
violation is a bug, not a convenience).

| Closed content | Destination |
|---|---|
| A closed Epic's scaffolding **+ that Epic's evicted STATE narrative** | `.planning/archive/<milestone>/<epic>/` |
| A closed milestone doc | `.planning/archive/milestones/` |
| Shipped/promoted `FUTURE-IDEAS.md` entries | an archive **ledger** (FR3) |
| Dated snapshots (e.g. `BACKLOG-REVIEW-*`) | archive + a pointer (FR5 — deferred to E2) |

The `.planning/archive/<milestone>/<epic>/` pattern **already exists** (the 2026-06-05
restructure). What is missing — and what FR2b fills — is a distilled **card** living beside
that scaffolding and a **one-line pointer** replacing the evicted narrative in the live file.

> **`STATE-HISTORY.md` is NOT a general destination.** It is *only* the one-time bucket for
> pre-existing, un-unitized **legacy body prose** — the FR2a new-migration case. Evict-on-close
> (FR2b) goes to the Epic's archive folder, never to `STATE-HISTORY.md`.

---

## 3. The three bloat vectors

Doc bloat is not one problem. It has three distinct vectors, and a mechanism that fixes one
does not touch the others. This table is the pivotal finding of the FR1 research — it is the
reason "FR2a fixes the acute 455 KB case" was **wrong** (the acute case is vector 1; FR2a is
a body mechanism that never touches frontmatter).

| # | Vector | Where it lives | Prevented by | Remediated by |
|---|---|---|---|---|
| **1** | **Frontmatter-list prose** | multi-paragraph prose crammed into `completed_phases` / `blockers` YAML entries (the acute 455 KB `examples/Example-cmmc-STATE.md`) | ✅ v0.1.6 write-guard (`checkStateFrontmatterShape`) blocks *new* ones | ❌ **not yet** — a one-time "de-prose" transform → **E3 migrate command** (the CMMC file is its fixture) |
| **2** | **Inlined legacy body** | `upgradeStateFile` inlines the *entire* legacy file into the new body and preserves it verbatim forever (Signal's own STATE.md: ~64 KB body) | — | **FR2a** for *new* migrations. **Existing** already-migrated inlined bodies have **no shipped mechanism** — FR2b's `evictEpicNarrative` is Epic-*section*-scoped and a migrated body is one un-sectioned blob, so the M5.E1 S5 dogfood relocated Signal's own body with a **one-off hand script**, not a reusable helper. A general "relocate an already-migrated inlined body" command is **E3 / FR6 (migrate command)** territory — E3 must not assume it exists. |
| **3** | **Ongoing body accretion** | closed-Epic narrative piles into the STATE body and never leaves | — | **FR2b** evict-on-close (E1) |

**What M5.E1 covers:** vector 2-new (FR2a) + vector 3 (FR2b), and it shrinks Signal's own
vector-2-existing body in the S5 dogfood. **Vector 1 (the acute frontmatter-prose case) is
routed to E3's migrate command,** where the CMMC file is the real-world test fixture. v0.1.6
already stopped vector 1 from *recurring*.

---

## 4. The SUMMARY card **is** the RETROSPECTIVE

Closed work is represented in the archive by a short **card**. Signal does **not** mint a
parallel `SUMMARY.md` family — it already has the retro spine (`{EpicID}-RETROSPECTIVE.md`),
the `RETROSPECTIVES.md` ledger, and the `INDEX.md` one-liner. A third artifact would be a
new copy to keep faithful — a single-home violation.

**Consequence this model accepts:** the retrospective's shape leads with the **card** — outcome
+ decisions-with-IDs + what's-still-open — and *then* the reflection. When evict-on-close needs
a card for a closed Epic, it produces (or points at) the retro, not a new summary artifact.

---

## 5. Faithfulness — an ordered gate, not a pre-summary verifier

Eviction replaces live closed-work narrative with a card + a pointer. The **move** is
loss-proof by construction (byte-identical relocation, zero-loss word-accounting, and the
original **survives in archive** — move-never-delete). So the residual risk is **not**
information *loss*; it is *legibility degradation* — a card that silently misrepresents its
source. Curator has **no pre-archive summary verifier** (its summary is written *after* the
move), so Signal does not build a phantom one. Instead, the gate is **ordered**:

1. **distill** (judgment) — write the card by **lift-verbatim-don't-rewrite**: when a faithful
   paragraph already exists, lift it; keep IDs verbatim; cite the archived artifacts;
   single-home. **Lift open carry-overs / blockers UP** into the live in-flight/blockers
   section — never bury a still-open item in an archive card.
2. **verify-against-source** (the gate) — read the card against the **already-archived**
   original and confirm no material claim was dropped or distorted. Plus a **deterministic
   coverage backstop:** assert that every `M*.E*` / `D-*` / `FR*` / `AC*` ID, every ISO date,
   and every `open` / `deferred` / `shelved` / `carry-over` status token in the source survives
   into the card **or** appears on an explicit "intentionally dropped" list. A **lossy** card
   **fails** the gate.
3. **then evict** — replace the live narrative with the one-line pointer. An Auditor-style
   **closed-vs-live confirm** runs before any archive move.

> **Known blind spot (carry to VERIFY/REVIEW).** The deterministic backstop catches *loss* of
> IDs/dates/status-tokens. It does **not** catch *paraphrase distortion* — a card that keeps
> every ID but subtly misstates what happened. Automated tests can prove the backstop and the
> move mechanics; they **cannot** prove a card faithfully represents its source. Faithfulness
> is verified for real only on live content (the S5 dogfood) and in REVIEW. Green eviction
> tests must **not** be read as "faithfulness proven."

---

## 6. Read-first index — tiered (so the index itself stays bounded)

A flat root `INDEX.md` whose COLD table lists *every* closed Epic recreates the
unbounded-growth problem this Epic exists to kill. So the target shape is **tiered**:

- **Root `INDEX.md`** = the live working set + **one pointer per milestone** (not per Epic).
- **Each `archive/<milestone>/`** carries **its own sub-index** of that milestone's closed Epics.

**E1 records this shape; E1 does not build it.** The tiered-index *build* is **FR4 (E2)**.
E1 preserves `INDEX.md`'s current **hand-curated** stance unchanged.

> **Flagged for E2, not decided in E1 — derived-vs-hand-curated INDEX.** Curator's Rule 3 says
> the index is *generated, never hand-edited*. Signal's `INDEX.md` is **hand-curated by locked
> decision** (memory `curator-dormant-on-signal-planning`). These conflict. The conflict bites
> at FR4 (index-freshness-in-validator), which is **E2** — so E1 keeps hand-curation and
> **defers the call.** Do not paper over it in E2.

---

## 7. Curator — what Signal borrows, what it leaves

**Borrow (reimplement Signal-native):** the clerk/librarian split (a Node mover extending
`tools/archive-migrate.mjs` + a judgment distill step at a boundary); read-first index as a
derived projection; `archive/<unit>/` + a one-page card; the Distiller's faithfulness
discipline (§5's distill spec); the Auditor's closed-vs-live gate + drift sweep (FR4 + the
pre-move confirm); the safety rules (never move the live zone, dry-run default, byte-identical
`git mv`, zero-loss word-accounting, unit-boundary-only — the FR6 NFRs); and the two-speed
cadence (deterministic-on-commit / judgment-at-boundary).

**Leave (solves problems Signal doesn't have):** the Python CLI + `.curator.yml` + taxonomy
*discovery* (Signal's taxonomy is locked); OKF frontmatter / `llms.txt` (a second frontmatter
axis colliding with `schema_version` / `docs_layout_version`, with no external consumer); the
full reference graph / `graphify` (beyond lightweight link-health); `log.md` (DECISIONS +
RETROSPECTIVES already cover it); the per-commit engine hook (FR4's validator-wiring is the
native equivalent).

---

## 8. Scope map — which FR owns what (so this doc isn't re-litigated)

| FR | Owns | Epic |
|---|---|---|
| **FR1** | *this model doc* + the STATE body skeleton | **M5.E1** |
| **FR2a** | new-migration body relocate → `STATE-HISTORY.md` | **M5.E1** |
| **FR2b** | evict-on-close + the faithfulness gate | **M5.E1** |
| **FR2c** | the STATE.md body skeleton (in `state-schema.md` + `initState`) | **M5.E1** |
| **FR2d** | tier-aware size warning | **M5.E1** |
| **FR3** | `FUTURE-IDEAS.md` physical eviction → ledger | **M5.E1** |
| **FR4** | all-docs hygiene runtime + the tiered-index **build** + the derived-vs-hand-curated call | **M5.E2** |
| **FR5** | living `BACKLOG.md` lifecycle | **M5.E2** |
| **FR6** | the auto-sensing migrate command (incl. vector-1 de-prose remediation) | **M5.E3** |
| **FR7** | `docs_layout_version` stamp + SessionStart upgrade banner | **M5.E3** |

---

*Last updated: 2026-07-16 — M5.E1.S1.t1. Provisional-canonical doc-runtime model established
(FR1). Tiered-index build, derived-vs-hand-curated INDEX resolution → E2; migrate command +
vector-1 remediation + layout stamp → E3.*
