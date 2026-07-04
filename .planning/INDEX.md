# Signal — `.planning/` Documentation Map

> **Read this first.** This is the map of Signal's own planning corpus. Load the
> file you need from here instead of scanning the whole directory. Pointers only —
> this index *never paraphrases* a doc's content (that would create a second copy
> to keep accurate). It carries: where the doc is, its lifecycle status, and any
> non-obvious gotcha.

**Corpus state (2026-06-05):** 24 files in root + 48 archived · ~16.8k lines · active working set ≈ 7 files.
**Maintenance:** hand-curated for now; structural rows are mechanical and will move to
a future `/sig:index`. Curated one-liners survive regeneration by file/Epic ID.

**Tier legend:**
- 🔥 **HOT** — load by default; the live working set.
- 🌤 **WARM** — load on demand; live but not every-session.
- 🧊 **COLD** — closed work; archived under `.planning/archive/M4.5/E{n}/` (scaffolding) and
  `.planning/archive/milestones/` (M1–M4). Retros stay in root as the traceability spine.

---

## 🔥 HOT — the working set (load by default)

| File | What it is · gotcha |
|---|---|
| [STATE.md](STATE.md) | Authoritative current state. **YAML frontmatter is the machine truth**; prose below is human history. `schema_version: 1` auto-migrates on first write. |
| [PROFILE.md](PROFILE.md) | Active tier + rigor overrides (the calibration contract every phase reads first). |
| [CONTEXT.md](CONTEXT.md) | Locked + deferred decisions for the *current* work; what DISCUSS settled. |
| [MILESTONE-4.5.md](MILESTONE-4.5.md) | **Active milestone** — release hardening / stranger-adoption. |
| [M4.5.E5-PLAN.md](M4.5.E5-PLAN.md) | **Active Epic** plan (E5 — external validation + launch). Currently in EXECUTE. |
| [M4.5.E5-PROGRESS.md](M4.5.E5-PROGRESS.md) | **Active Epic** progress; last task `M4.5.E5.S1.t4` (commit `f1e11c8`). |
| [PROJECT.md](PROJECT.md) | v1 spec + locked vocabulary. **Gotcha:** ID-is-identity rule (Milestone/Epic/Slice/Task/Phase/Wave/Tier are fixed terms). |

## 🌤 WARM — load on demand

| File | What it is · gotcha |
|---|---|
| [RETROSPECTIVES.md](RETROSPECTIVES.md) | **Traceability spine** — per-Epic retro ledger. `stub`/`complete` flag auto-derived from `[FILL IN]` markers; hooks hand-curated, survive regen by Epic ID. |
| [DECISIONS.md](DECISIONS.md) | Decision log (`D-E{n}-{k}` IDs). **1,257 lines — append-only monolith; grep/TOC, don't load whole.** |
| [FUTURE-IDEAS.md](FUTURE-IDEAS.md) | Post-v1 idea backlog. **1,549 lines — append-only monolith; grep/TOC, don't load whole.** Drained advisorily by `/sig:plan`. |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | Unresolved questions surfaced across phases. |
| [BUGS.md](BUGS.md) | Bugs & verified findings catalog. **Where bugs get logged** (catalog → triage → confirm/dismiss). GitHub Issues deferred to live-users. |
| [MILESTONE-5.md](MILESTONE-5.md) | Forward placeholder — v2 ports + memory-management milestone (next horizon). |
| [BACKLOG-REVIEW-2026-07-04.md](BACKLOG-REVIEW-2026-07-04.md) | Full backlog pass: 5 gap-fills, 8 sharpened entries, 8 sprint clusters + watchlist. **Ratified 2026-07-04** (DECISIONS BR-1…BR-9): dispositions stamped into FUTURE-IDEAS, E10 added to M4.5, M5 opening move locked. |
| E5 working refs | [REQUIREMENTS](M4.5.E5-REQUIREMENTS.md) · [RESEARCH](M4.5.E5-RESEARCH.md) · [VALIDATION](M4.5.E5-VALIDATION.md) — active-Epic detail, read when the PLAN points to them. |

## 🧊 COLD — closed work (reference; retro carries the "what mattered")

Each closed Epic's scaffolding (REQUIREMENTS / RESEARCH / PLAN / PROGRESS / VERIFICATION /
VALIDATION / REVIEW, varying by Epic) is archived at `.planning/archive/M4.5/E{n}/`. The
`RETROSPECTIVE.md` stays in root (the spine). For *why it mattered*, read the linked retro —
don't reload the scaffolding.

| Epic | Released | One-liner | Retro |
|---|---|---|---|
| **E4** | `[Unreleased]` — batches w/ E5 (closed 2026-06-03) | Worked example (`examples/url-shortener/`) + `docs/vs.md` toolbox comparison | [complete](M4.5.E4-RETROSPECTIVE.md) |
| **E8** | v0.1.3 | `/sig:doctor` install-state diagnostician (15th command) | [complete](M4.5.E8-RETROSPECTIVE.md) |
| **E9** | v0.1.3 | Retro Foundations — SHIP retro gate + `RETROSPECTIVES.md` index | [complete](M4.5.E9-RETROSPECTIVE.md) |
| **E7** | v0.1.3 | Synthesizer prose-quality (`embedSection`) + install-UX docs | [stub](M4.5.E7-RETROSPECTIVE.md) |
| **E3** | v0.1.3 | Public-facing docs rewrite (privacy / compat / origins / SECURITY) | [stub](M4.5.E3-RETROSPECTIVE.md) |
| **E2** | v0.1.3 | `/sig:add` capture-and-route + `/sig:plan` advisory drain | [complete](M4.5.E2-RETROSPECTIVE.md) |
| **E6** | v0.1.2 | STATE schema_version 1 + auto-update protocol + `/sig:checkpoint` | [stub](M4.5.E6-RETROSPECTIVE.md) |
| **E1** | v0.1.1 | Marketplace install-path fix (Slices 3–5 shelved) | [stub](M4.5.E1-RETROSPECTIVE.md) |

**Closed milestones:** [M1](./archive/milestones/MILESTONE-1.md) · [M2](./archive/milestones/MILESTONE-2.md) · [M3](./archive/milestones/MILESTONE-3.md) · [M4](./archive/milestones/MILESTONE-4.md) (M1–M4 closed; M4 closed 2026-05-12).

---

### Archive-move status — DONE (2026-06-05)

48 closed-cycle files (8 Epics' scaffolding + M1–M4) moved to `.planning/archive/` via
`tools/archive-migrate.mjs` (a path-aware migration script — prototype of `/sig:migrate-memory`).
Nested folders keep Epic-ID-prefixed filenames so the ~99 bare-identifier references in live
docs stay valid; 68 clickable links + 92 prose paths were rewritten and verified (zero dangling
`.md` links). Retros stayed in root. The script self-verifies and is re-runnable on the next
closed Epic.

*Last updated: 2026-06-05 (hand-curated).*
