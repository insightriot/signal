# OpenKB, assessed against Signal's memory and docs management

**Date:** 2026-09-01
**Source:** [`VectifyAI/OpenKB`](https://github.com/VectifyAI/OpenKB) (Apache-2.0, Python, 4,372 stars,
created 2026-04-04, last pushed 2026-07-22).
**Method:** Primary source via the GitHub API — repo metadata, tree, [`README.md`](../README.md),
`docs/golden-principles.md`, `openkb/lint.py` (function inventory). Not read from a summarising
model's description of the page (`v0.1.25`).
**Scope:** Brett's ask — memory / docs management only. Not the LLM plumbing, not the web UI.

---

## 0. What it is, and the honest framing

OpenKB compiles raw documents (PDF, Word, Markdown, URLs…) into a **wiki of plain Markdown pages with
`[[wikilinks]]`**, maintained by an LLM: summaries, concept pages, entity pages, cross-references,
contradiction flags. Retrieval is **vectorless** — a tree index (PageIndex) the model reasons over,
rather than embeddings in a vector DB.

Its thesis, quoted: *"Traditional RAG rediscovers knowledge from scratch on every query. Nothing
accumulates. OpenKB compiles knowledge once into a persistent wiki, then keeps it current."*

**Signal already believes this.** `.planning/` *is* a compiled, cross-referenced, persistent corpus,
and it is unusually good at the **write** side. So the interesting comparison is not the thesis — it
is the two things OpenKB has that Signal does not: **a retrieval story**, and **a promotion path from
convention to enforced check**.

**Caveats bounding everything below.** Last pushed six weeks ago; 4.4k stars is real adoption but
modest. I read documented behavior and one module's function inventory — not test runs, and not
evidence any of it works well. And this is a **Python CLI with per-compile LLM calls**; Signal is a
Claude Code plugin. Nothing here transfers as a dependency without a serious cost conversation (§5).

---

## 1. The best finding: a stated ladder from convention → lint, with grandfathering

`docs/golden-principles.md` opens:

> *"Opinionated, mechanical rules that keep this agent-generated codebase legible and consistent for
> future agent runs. **Enforced by CI where possible; the rest are honored by convention and checked
> in review. When a rule proves valuable, promote it into a lint** (see `tests/test_file_size.py` for
> the pattern)."*

And the file-size rule itself:

> *"Keep modules focused and under 800 lines (enforced by `tests/test_file_size.py`). **Existing
> over-limit files are grandfathered (with reasons)** in the test's `_GRANDFATHERED` set and
> additionally tracked in `docs/internal/tech-debt.md`."*

**Two mechanisms, and the second is why the first is usable.**

[`analysis/UNREACHED-MECHANISM-ANALYSIS.md`](UNREACHED-MECHANISM-ANALYSIS.md) named Signal's habit: when a rule is not followed, Signal
writes the rule more carefully. `B75` measured the ceiling on that — `light` and `strict` differ by
one boolean in code and the rest is prose. Signal's answer has been to build a check per defect.
**What Signal has never written down is the ladder itself**: a rule starts as convention, and there
is a stated moment it becomes a test.

**The grandfather set is the part I would actually copy.** Signal cannot adopt a doc-size rule today:
`BUGS.md` is 320 KB, `DECISIONS.md` 235 KB, `BACKLOG.md` 139 KB. A flat budget — the shape
[`DEEPSEEK-HARNESS-ASSESSMENT.md`](DEEPSEEK-HARNESS-ASSESSMENT.md) §2.5 found — just fails on day one,
so it never gets adopted. A limit **plus an explicit exception list carrying reasons** is adoptable
immediately, and the exception list *is* the visible debt register. That converts an unenforceable
aspiration into a ratchet.

⚠ This is the same shape as the opt-out **ratio** in the DeepSeek assessment: an escape hatch that is
*counted and named* is a measurement; one that is merely available is an unbounded leak.

---

## 2. Worth borrowing, ranked

### 2.1 Orphan detection — a page nothing links to

`openkb/lint.py` ships `find_orphans` alongside `find_broken_links` and `check_index_sync`.

`/sig:sweep` checks dead internal links (the *outbound* direction) and INDEX drift. **It has no
inbound check.** `.planning/` holds ~200 files; a document that nothing references is either dead
weight or a broken hand-off, and today nothing says which.

Cheap, mechanically decidable, and it composes with a mechanism Signal already has.

### 2.2 Retrieval over a structure index, instead of reading whole files

OpenKB's retrieval is a **tree index the model navigates** — no embeddings, no vector store.

[`LOOP-GOAL-DIRECTION.md`](LOOP-GOAL-DIRECTION.md) §4 identified memory read-forward as the one purely
additive gap and named **budget** as the real constraint: dead ends are recorded richly and nothing
reads them at cycle start because the files are too big to read. The recommendation there was
"targeted extraction, not a file read" — and left the *how* open.

**This is the how, and Signal is closer to it than it looks.** `INDEX.md` is already generated at
every phase transition, and `BACKLOG.md`'s 72 `###`/`####` headings are already a tree. The missing
piece is not an index; it is **using the index to fetch spans instead of files**.

⚠ **Not an endorsement of importing PageIndex.** The borrowable claim is narrower and load-bearing:
*a heading tree plus span extraction is sufficient for this problem, and a vector store is not
required.* That matters because a vector DB inside a Claude Code plugin would be a non-starter.

### 2.3 The corpus carries its own schema, editable at runtime

> *"The `wiki/AGENTS.md` file defines wiki structure and conventions. It's the LLM's instruction
> manual for maintaining the wiki. **The LLM reads `AGENTS.md` from disk at runtime, so your edits
> take effect immediately.**"*

Signal's equivalent rules — what `.planning/` contains, what each file is for, growth policy — live
scattered across 22 command files, `references/`, and [`CLAUDE.md`](../CLAUDE.md), and changing a convention means
editing prose in several shipped files. One runtime-read schema document per project is a genuinely
different shape, and it is the shape a per-project convention *should* have: `.planning/` layout is a
property of the project, not of the plugin.

⚠ Signal has a real counter-consideration: rules read from the project are rules a project can weaken.
Anything load-bearing must stay in the plugin's deterministic layer.

### 2.4 Public docs vs. maintainer-local docs, split by git

`docs/` is public; `docs/internal/` is *"maintainer-local, not in git."*

Signal has an **open, unresolved question** — whether `.planning/` should be public at all. `M6.E1`
stopped it being *copied to users* (985 files → 382; `.planning/` 270 → 0) but keeping it in a public
repo was never actually decided. This is a concrete third option: a split, by directory, enforced by
`.gitignore`, rather than all-public or all-private.

⚠ It collides with a standing rule here — `.planning/` is always tracked, deliberately, because it is
project memory rather than scratch. So this is a **shape for the decision**, not a recommendation to
make it. `tech-debt.md` being maintainer-local is the interesting precedent: the *debt register* is
the thing they chose not to publish.

### 2.5 "`AGENTS.md` is a map, not a manual"

Their rule, verbatim: keep the top-level agent file short; deep docs live under `docs/`.

Signal's [`CLAUDE.md`](../CLAUDE.md) is a manual. Its current-state section alone runs many screens of release
narrative. This is the same finding as the DeepSeek doc-budget item arriving from a second unrelated
project, which is worth weighting accordingly.

---

## 3. Confirmation, not information

- **All writes go through one atomic/crash-safe module.** Signal has `atomicWrite` and concurrency
  locks on the doc-runtime RMW paths (`M5.E4`/`M5.E5`). Same conclusion, already shipped.
- **Validate shapes at boundaries; never build on guessed shapes.** `readState` / `readProfile` throw
  rather than coerce, deliberately. Already Signal's posture.
- **Plain Markdown with cross-links as the substrate.** Signal's corpus is exactly this. The
  *link-shaped cross-reference* point is now the **second independent source** for the row filed from
  [`DEEPSEEK-HARNESS-ASSESSMENT.md`](DEEPSEEK-HARNESS-ASSESSMENT.md) §2.2 — which strengthens that
  row without changing it.
- **Contradictions are flagged.** Signal's `auditor` agent does cross-document contradiction finding
  and `/sig:sweep` has no equivalent. That gap is already known; OpenKB confirms it is a normal thing
  for a knowledge system to own, but adds no mechanism Signal could not already reach.

---

## 4. Do not borrow

- **Entity pages, OKF conformance, the knowledge graph visualizer, the web UI, the deck generator.**
  These serve a research/document-corpus product. `.planning/` is a work ledger for one project.
- **LLM-compiled summary pages that overwrite manual edits.** `openkb recompile` states plainly that
  *"manual edits are overwritten."* Signal's corpus is hand-authored and its rationale is the asset;
  a compile step that can clobber it is the opposite of what this repository needs.
- **Per-compile LLM calls as a maintenance model.** Signal's doc mechanisms are deterministic on
  purpose — that is the whole `PHASE-C-BUILD-VS-ADOPT.md` finding.

---

## 5. The option I should name rather than bury: use it, don't copy it

OpenKB ships a `.claude-plugin/` and a read-only `skills/openkb/` skill, so pointing a Claude Code
session at an OpenKB-compiled wiki is a supported path. Signal could, in principle, compile
`.planning/` into a queryable KB rather than build retrieval itself.

**I do not recommend it**, and the reasons are specific rather than reflexive: it adds a Python
runtime and per-compile LLM cost to a plugin whose doc mechanisms are deterministic by design; it
introduces a second home for knowledge that already has one (`D-M5E18-1`); and its compile step
overwrites manual edits, which is disqualifying for a corpus whose value is hand-written rationale.

Worth revisiting only if Signal ever needs retrieval over a corpus it does **not** author.

---

## 6. What this assessment could not establish

- **Whether the lint checks or the grandfather ratchet work in practice.** Function names and a
  principles doc were read; no test run, no repo audited against its own rules.
- **Whether vectorless tree retrieval is actually good.** The claim is theirs; I did not evaluate
  retrieval quality, and §2.2's borrowable claim is deliberately narrower than their marketing.
- **Nothing was read of the compile pipeline's prompts or the PageIndex algorithm.**
- **Repository health.** Six weeks since the last push, one primary vendor behind it. Not evidence of
  abandonment; not evidence of durability either.
