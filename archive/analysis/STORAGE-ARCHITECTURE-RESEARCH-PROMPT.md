# Research brief: a long-term architecture for how an AI-agent dev workflow stores and manages its planning data

> **How this file is used (2026-10-03).** Brett runs this brief through three deep-research tools and
> pastes the three results back. They are compared section by section, checked against this repo, and
> turned into one proposed storage architecture. The failure history below comes from a read of all
> 265 work items, `DECISIONS.md`, the design and analysis docs and `CHANGELOG.md` on 2026-10-03. It is
> written to stand alone, because the research tools cannot see this repository.
> Everything below the line is the prompt.

---

## Your role

You are a senior systems architect researching how to design the **storage and lifecycle layer** for
"Signal", a Claude Code plugin. I want a durable architecture that ends a recurring class of defects,
not a list of tweaks. Research widely (open-source repositories, docs, design write-ups, issue threads),
cite every claim with a link, and label anything you infer rather than verify as **[inferred]**.

## What Signal is

- A Claude Code plugin (Node.js 22+, ~4,400 tests) that runs AI coding agents through a phased
  workflow: CALIBRATE → DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP. A tier
  (SKETCH / FEATURE / SPIKE / FULL) sets rigor per project.
- Used by a solo maintainer and a few users, across ~12 real projects of very different shapes.
- All state lives in a `.planning/` folder inside each git repo, committed to git. The repo is the
  system of record: no server, no hosted database.
- Commands are markdown prompt files that an LLM agent follows, backed by JavaScript libraries the
  agent calls. Agents read and write these files directly, so the format must work for both LLMs and
  code.
- **Hard preferences from the maintainer:**
  - **Self-contained.** Storage and management stay inside Signal and the repo. An external tracker
    can be an optional add-on, never a requirement.
  - **A more deterministic gate** for classification: what belongs with what (item → Epic, bug →
    release), and whether something meets a criterion (done, blocked, ready). Today this is regex over
    prose or an LLM judgment. The maintainer is open to an LLM-judgment service ("Jev", an external
    API that returns a verdict with a confidence) as one component. He wants the gate as deterministic
    and auditable as possible.
  - **Bulletproof over clever.** Nothing is ever deleted (closing moves or marks, never removes).
    History must be reconstructable from git.

## What it stores

- Bugs, backlog and roadmap items, inbox captures and open questions.
- Decisions, with IDs like `D-M6E11-7`.
- The work hierarchy: milestones → Epics → slices → tasks.
- A per-project `STATE.md`: current phase, current Epic, a phase log, plus hand-written narrative.
- Per-Epic artifacts: REQUIREMENTS, PLAN, PROGRESS, VERIFICATION, REVIEW, RETROSPECTIVE, PROFILE.
- An archive tree, generated indexes, and a few append-only logs that pin git commit SHAs.

## Current architecture (honest summary)

1. **Most things are prose markdown documents, and their status is inferred:**
   - A backlog row is "done" if its heading is struck through or carries a bold DONE/SHIPPED word.
   - An Epic is "closed" if a terminal artifact exists, it is not the current unit, and a verdict
     line can be parsed.
   - A milestone row is shipped if its table cell says so.
2. **A recent "work-item store" (step 1 of 5 built) made some records structured.** Each bug,
   backlog item, capture and question is one markdown file with YAML frontmatter (`id`, `type`,
   `status`, `priority`, `theme`, `close{reason,by,at,proof}`, …). It sits in a folder that mirrors
   its status: `inbox/`, `backlog/`, `epics/<id>/`, `done/YYYY-MM/`. A single command moves items. The
   old list files (`BUGS.md`, `BACKLOG.md`, …) are now **generated** from the items.
3. **Many readers still parse the generated markdown with regex** instead of reading the structured
   items, and the generated files fake old ID formats so those readers keep working. Epic artifacts,
   `STATE.md`, decisions, milestones and retros are still prose.
4. **`STATE.md` mixes machine fields with narrative.** It is YAML frontmatter plus hand-written text
   that retells the same facts and goes stale.
5. **The layout has changed three times** (layout v1 → v3, plus the store). Each change came with a
   migration that relocates prose other code finds by path or heading.

## The failure history this must end (measured)

- **107 of 265 tracked items are storage or lifecycle defects, and 41 are still open.**
- **36 closed fixes were followed by a new defect in the same function, field or regex**, forming 10
  chains.
- **Twelve failure classes:**
  1. Status inferred from wording.
  2. Markdown structure parsed by regex: heading depth, CRLF, `<details>`, tables, filenames.
  3. Two derivations of one fact drifting apart.
  4. Closure inferred from which artifacts exist.
  5. A machine ledger mixed with narrative in one file.
  6. Rules built from the maintainer's repo shape failing on other repos. 8 of 12 projects do not use
     Epic IDs; another has ~10 intake channels and almost no stable IDs.
  7. Generated files clashing with hand-edited files.
  8. Layout migrations breaking readers that find things by path or heading.
  9. Concurrency: many writers, few files, nested locks.
  10. IDs and `path:line` citations drifting. One shipped report had every citation off by five lines.
  11. The new structured store being re-parsed from its own rendered markdown, which brings classes 1
      and 2 back.
  12. Decisions, rationale and user choices having no schema or single home.
- **A migration carried 142 old "closed" verdicts forward without re-checking them**, and 10 items
  contradict themselves: closed in frontmatter, confirmed in the body.

## Locked decisions (respect them, or argue explicitly for overturning one)

- **One system of record per project.** A tracker, if used, replaces the repo store; it never
  mirrors it.
- **Every item has a stable ID and a recorded close event.** IDs are never reused. Epic membership is
  optional.
- **Things move between states; nothing is deleted.**
- **Lifecycle things may need different treatment from records.** Bugs and backlog items move and
  close; decisions, retros and requirements are records.
- **Merges to `main` use merge commits**, because logs pin SHAs.
- **Users track the plugin's `main` branch**, so a storage change reaches every project at once.
  Migration must be safe, reversible and verifiable on repos the maintainer does not control.

## Research questions

1. **Prior art: how have others solved agent-workflow and repo-native planning storage?** For each
   system, report:
   - the storage format;
   - the source of truth;
   - how status and closure are recorded (event, or inferred);
   - how relationships are represented;
   - how records are validated;
   - how concurrency and merges are handled;
   - how the schema is migrated;
   - what broke for them (issue threads, rewrites).

   **Signal's original inspirations — study each:**
   - GSD / "Get Shit Done" (gsd-build/get-shit-done)
   - Agent Skills (addyosmani/agent-skills)
   - gstack (Garry Tan)
   - pm-skills (phuryn)
   - superpowers (obra / Jesse Vincent)
   - compound-engineering (Every Inc)
   - planning-with-files (OthmanAdi)
   - oh-my-claudecode (Yeachan-Heo)
   - Curator-style knowledge-base tooling

   **Others that tackle this directly — verify each, and add any I have missed:**
   - Beads (Steve Yegge; a git-backed issue graph for agents)
   - Backlog.md (a markdown + frontmatter task manager)
   - Claude Task Master / Taskmaster AI (`tasks.json`)
   - GitHub Spec Kit, Kiro specs, OpenSpec, BMAD-METHOD
   - git-bug, git-issue, Fossil tickets
   - TaskWarrior, todo.txt, org-mode
   - ADR tooling: adr-tools, MADR, log4brains
   - The data models of Linear, GitHub Issues and Jira (state machines, close-by-commit "Fixes #n")
2. **Format.** Compare these options:
   - markdown + frontmatter files;
   - one JSON or YAML file per record;
   - JSONL append-only event logs;
   - SQLite, committed or as a regenerated cache;
   - Dolt or other versioned databases;
   - hybrids, such as canonical structured data with generated human views.

   Judge each on: git diff and merge friendliness, how reliably an LLM reads and writes it, human
   readability, validation, query speed and corruption risk.
3. **Event sourcing vs current state.** Should status be a stored field, or derived from an
   append-only log of events (created, triaged, moved, closed with proof)? How do repo-native tools
   handle merge conflicts in such logs?
4. **Deterministic classification and gates.**
   - Patterns for rule-based membership and criteria: JSON Schema with conditionals, CUE, OPA/Rego
     policy-as-code, typed state machines.
   - Where an LLM judge fits: as a proposer whose output a deterministic validator accepts or
     rejects, with the verdict, confidence and model version recorded.
   - How to make LLM-assisted decisions auditable and reproducible.
5. **References that do not rot.** Compare stable IDs, typed links between records, content-anchored
   citations and commit-pinned citations. Which survive files moving and lines shifting?
6. **Prose vs structure.** Which artifacts should stay free prose (narrative, rationale) and which
   must be structured? How do successful systems keep narrative from restating, and then
   contradicting, structured facts?
7. **Heterogeneous repos.** Should a system normalise at import (one canonical schema plus adapters)
   or support many shapes? How do tools onboard messy existing backlogs losslessly, with proof?
8. **Migration safety.** Versioned schemas, forward-only migrations, dry run plus verification,
   rollback in git, and proving nothing was lost.
9. **Agent ergonomics.** What makes an LLM reliably create, update and close records: CLI-only
   writes or direct file edits, validation on write, hooks? Bring evidence on failure modes from
   agent tools.

## Required output (use exactly these headings, so several research runs can be compared)

1. **Executive recommendation** (≤ 200 words): the architecture you would lock in, and why.
2. **Prior-art table.** One row per system. Columns: format, source of truth, status model (event or
   inferred), relationships, validation, concurrency/merge, migration, known failures, link.
3. **Format comparison matrix.** Options × criteria, with a score and a one-line reason per cell.
4. **Proposed architecture.** Cover each of these:
   - **Canonical data model:** entities, fields, relationships and state machines.
   - **Physical storage layout.**
   - **Write path:** who may write what, and how each write is validated.
   - **Read path:** how every tool queries the data. No tool parses rendered views.
   - **Generated human views.**
   - **Gates:** where deterministic rules sit and where an LLM judge sits.
   - **References:** how one record points to another.
5. **Failure-class check.** For each of the 12 classes above, say whether the design makes it
   impossible, reduces it, or does not address it, and how.
6. **Migration plan.** From today's mixed state to the target, for the maintainer's repo and for ~12
   heterogeneous repos, with verification and rollback.
7. **Risks and open questions.** What could make this fail, and what you could not verify.
8. **Sources.** Every link, marked primary (code, official docs) or secondary (blog, discussion).

Prefer depth over breadth. Read the actual code and data files of the 5–8 most relevant systems, not
just their READMEs.
