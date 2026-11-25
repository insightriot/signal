# **Storage and Lifecycle Architecture for Signal: Durable, Deterministic State in Git**

## **Executive recommendation**

The recommended architecture establishes a **Decoupled Canonical Store with an Ephemeral Query Cache and Derived Human Views**. Signal must transition from prose-inferred status and directory-based state tracking to a canonical store where every work item and decision is an individual, immutable-path JSON document under .planning/records/. Status transitions and closures are explicit, machine-validated events bearing actor, timestamp, commit-pinned proof, and rationale, eliminating markdown scraping and artifact-presence heuristics.  
To preserve human ergonomics and multi-agent performance without compromising type safety, canonical JSON records compile into a gitignored, local SQLite cache for sub-millisecond querying, and project into deterministic, read-only Markdown views (STATE.md, BACKLOG.md) protected by pre-commit integrity hashes. A two-tiered gate couples an external LLM judge ("Jev") operating strictly as an untrusted proposer with an authoritative deterministic policy engine that verifies cryptographically signed verdict envelopes against strict state-machine constraints and test execution receipts. This architecture resolves all twelve historical defect classes, accommodates heterogeneous repository shapes, guarantees conflict-free git branching, and provides verified, lossless forward migrations.

## **Prior-art table**

The following table evaluates seventeen systems across the autonomous agent harness ecosystem, repo-native issue management, distributed version control tooling, and enterprise issue tracking systems.

| System | Storage Format | Source of Truth | Status Model (Event or Inferred) | Relationships | Validation | Concurrency / Merge | Migration | Known Failures | Link / Citations |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Beads** (Steve Yegge / beads\_rust) | JSONL (issues.jsonl) backed by SQLite cache1 | Committed JSONL file in Git1 | Stored status mutated via CLI events (bd close \--reason) auto-flushed to JSONL2 | Explicit task dependency DAG (--parent, blocked\_by)2 | CLI runtime schema validation; Rust port enforces typed contracts2 | Line-per-issue JSONL minimizes git collisions; SQLite hydrates locally1 | Schema migration routines executed on SQLite hydration2 | Daemon instability6; context exhaustion on large issue graphs7; agents bypass task creation without hooks6; fork churn2 | Beads Blog1; Beads Rust2 |
| **Backlog.md** | Markdown files with YAML frontmatter in backlog/tasks/ \[cite: 8, 9\] | Markdown files on filesystem8 | Stored YAML frontmatter field (status), mutated via CLI8 | Parent epics, task tags, acceptance criteria checkboxes11 | CLI parses and validates YAML frontmatter; warns against manual file edits11 | File-per-task isolates diffs; directory moves across states cause git merge collisions8 | File rename and frontmatter schema upgrade utilities8 | LLMs bypass CLI, edit files directly, and corrupt frontmatter or checkboxes11; indexing lag between files and Markdown views9 | Backlog.md8; Backlog Manager11 |
| **GSD (Get Shit Done)** | Markdown prompt commands and plans (.planning/)13 | Markdown documents in repository14 | Inferred from heading markers, checkboxes, and phase logs14 | Phase progression, embedded task lists in plans14 | Procedural checks in TypeScript SDK and command routing hub14 | Frequent merge conflicts on shared markdown files across branches14 | Multiple breaking rewrites; migrated to Open GSD SDK core13 | Heading and regex parsing drift; command routing breakage; prompt fragility across minor LLM model updates13 | GSD Core13 |
| **Agent Skills** (Addy Osmani) | Markdown skill specifications (SKILL.md)16 | Git-tracked skill definitions and project rules (CONSTRAINTS.md)16 | Inferred from stage checkpoints and non-negotiable verification evidence (test outputs)16 | Skill-to-phase mapping (Define, Plan, Build, Test, Review, Ship)17 | Verification gates and anti-rationalization tables16 | Stateless skill definitions avoid data concurrency; state handled by git commits16 | Package versioning via skills CLI marketplace16 | Models rationalize skipping steps without adversarial tables; lack of cross-session persistent state ledger16 | Agent Skills16 |
| **gstack** (Garry Tan) | Markdown prompt skills in .claude/skills/ with Bun/bash runners18 | Git working tree, diffs, and generated design documents19 | Inferred from review commands and readiness dashboards19 | Phase pipeline (Office Hours to Plan to Build to Review to Ship)19 | Coverage audits, automated test generators, safety commands (/guard, /freeze)20 | Directory freeze locks edits to one folder; git handles diffs20 | Scripted upgrades via git clone and checkout scripts18 | Self-review bias (same model grades own work)21; supply chain concerns vendoring binaries21; regex scraping of drifted markdown docs19 | gstack18; Inside gstack22 |
| **pm-skills** (phuryn) | Markdown skill prompts and commands (/discover, /interview)23 | Unstructured Markdown files and CSV imports23 | Inferred from conversational prompts and artifact completion23 | Opportunity Solution Trees (Outcome to Opportunity to Solution)23 | Prompt-based rubrics (Impact by Risk prioritization matrices)23 | Manual git merge resolution on generated markdown docs23 | Marketplace plugin updates23 | Inconsistent formatting when summarizing bulk customer interviews; missing formal state machine23 | pm-skills23 |
| **superpowers** (Jesse Vincent / obra) | Markdown skill files with embedded execution workflows24 | Git worktrees, design specs, and plan documents on disk24 | Deterministic TDD gate (RED-GREEN-REFACTOR) and task checklists24 | Hierarchical decomposition (spec to bite-sized 2-5 minute tasks)24 | Strict verification-before-completion; deletes code written before failing tests25 | Git worktrees (using-git-worktrees) provide isolated workspaces per task24 | Marketplace package distribution (pi install, /plugin install)24 | Subagents ignore plans or loop when context compaction resets working memory6 | superpowers24 |
| **compound-engineering** (Every Inc) | Markdown skills, memory in docs/solutions/ and docs/learnings/ \[cite: 27, 28, 29\] | Git repo files and persistent solution markdown logs27 | Inferred via compound lifecycle: Brainstorm to Plan to Work to Review to Compound29 | Cross-references between documented learnings and component specs29 | Multi-agent review passes (/ce-code-review), test/lint validations27 | Worktrees and atomic branch PRs27 | Plugin marketplace updates30 | Unbounded growth of docs/solutions/ dilutes agent retrieval context; prose restatement drifts from code29 | Compound Engineering Plugin30; Every Compound Engineering29 |
| **planning-with-files** (OthmanAdi) | Three Markdown files: task\_plan.md, findings.md, progress.md \[cite: 15\] | Flat markdown files in repo or .planning/YYYY-MM-DD-slug/ \[cite: 15\] | Checkbox status in task\_plan.md; per-turn cryptographic hash attestation15 | Linear phase transitions and nested task lists15 | Cryptographic hash attestation; deterministic stop gate holds agent15 | Isolated directory-per-task avoids collisions15 | Manual folder renaming and layout versioning15 | Markdown checkbox regex breaks on non-standard indentation; write aborts leave half-written state15 | planning-with-files15 |
| **oh-my-claudecode** (Yeachan-Heo) | Local JSON state files in .omc/state/ and Markdown wiki pages in .omc/wiki/ \[cite: 32, 33\] | JSON state files and frontmatter Markdown wiki32 | Explicit JSON state machines; stage handoffs (plan to prd to exec to verify)33 | Specialist agent mesh (19 roles), keyword/tag wiki catalog in index.md \[cite: 32, 34\] | wiki\_lint() verifies links, orphan pages, and contradictions; TypeScript schema checks32 | Session-scoped JSON files (sessions/{id}/) with atomic .migrating sentinels33 | state\_migrate\_non\_git utility; atomic migration flags33 | Native binary build failures on SQLite (better-sqlite3); file descriptor leaks; orphaned PR provenance anchors35 | oh-my-claudecode32 |
| **Claude Task Master / Taskmaster AI** | Monolithic tasks.json in repository root \[inferred\] | Single JSON file committed to Git \[inferred\] | Stored status field (pending, in\_progress, completed) \[inferred\] | JSON arrays of parentId, subtaskIds, and dependencies \[inferred\] | Zod and JSON Schema structural validation on read/write \[inferred\] | Frequent git merge conflicts on concurrent branch task updates \[inferred\] | Programmatic schema migration scripts on JSON object \[inferred\] | Concurrency collisions on the monolithic file; large projects exhaust context loading full task graphs \[inferred\] | Taskmaster AI Repository \[inferred\] |
| **Spec-Driven Frameworks** (Spec Kit, Kiro, OpenSpec, BMAD) | Markdown specification templates with frontmatter and YAML metadata blocks \[inferred\] | Git-tracked spec and plan markdown files \[inferred\] | Inferred from checklist completion, acceptance criteria tables, or status badges \[inferred\] | Hierarchical trace matrices (Spec to Task to Verification Criteria) \[inferred\] | Linter scripts, JSON schema over YAML frontmatter, manual human gate approval \[inferred\] | Isolated branch workflows; spec merges subject to standard prose git conflicts \[inferred\] | Versioned specification templates \[inferred\] | Drift between spec prose and codebase; regex extractors fail on formatting deviations \[inferred\] | GitHub Spec Kit \[inferred\]; OpenSpec \[inferred\] |
| **git-bug / Fossil Tickets** | git-bug: Git DAG objects in refs/bugs/; Fossil: signed append-only manifest artifacts \[inferred\] | Distributed Git/Fossil DAG repository ledger \[inferred\] | Pure Event Sourcing: operations (Create, SetStatus, Comment) form a CRDT/DAG \[inferred\] | Cryptographic parent links and hash-based entity cross-references \[inferred\] | Cryptographic hash attestation; strict type-safe binary serialization \[inferred\] | Conflict-free distributed merge via CRDT resolution algorithms \[inferred\] | Upward-compatible event deserializers \[inferred\] | Inaccessible to standard LLM file readers without custom CLI binaries; invisible in standard worktrees \[inferred\] | git-bug GitHub \[inferred\]; Fossil Tickets \[inferred\] |
| **TaskWarrior / todo.txt / org-mode** | TaskWarrior: custom line-delimited records; todo.txt: plain text lines; org-mode: outline text \[inferred\] | Text files in filesystem (pending.data, todo.txt, .org) \[inferred\] | todo.txt: prepended x; org-mode: TODO/DONE keywords; TaskWarrior: recorded timestamps \[inferred\] | TaskWarrior: depends: UUIDs; org-mode: parent/child headings and tag inheritance \[inferred\] | TaskWarrior CLI validation; org-mode and todo.txt rely on loose regex grammar \[inferred\] | Central files cause merge collisions when multiple devices or branches sync \[inferred\] | In-place text conversion scripts \[inferred\] | Line-number drift; fragile regex parsers; sync collisions on flat append-only files \[inferred\] | TaskWarrior \[inferred\]; Org-Mode \[inferred\] |
| **ADR Tooling** (adr-tools, MADR, log4brains) | Sequenced Markdown documents with frontmatter (doc/adr/0001-init.md) \[inferred\] | Markdown files in Git repository \[inferred\] | Stored status in frontmatter: Proposed, Accepted, Rejected, Superseded \[inferred\] | Explicit links in body/frontmatter (Supersedes ADR-0002) \[inferred\] | Linter scripts checking frontmatter fields and file numbering sequence \[inferred\] | Numbering race conditions: parallel branches claim identical prefix numbers \[inferred\] | Sequential file renumbering scripts \[inferred\] | Sequential ID collisions during branch merges; broken links when decisions are moved or renamed \[inferred\] | adr-tools \[inferred\]; MADR \[inferred\] |
| **Curator Knowledge Tooling** | Markdown documents with semantic frontmatter and relation links \[inferred\] | Local repository markdown files \[inferred\] | Inferred from link graphs, staleness timestamps, and review flags \[inferred\] | Typed bidirectional links (relates\_to, derived\_from) in frontmatter \[inferred\] | Graph consistency linters; markdown link parsers \[inferred\] | Git text merges; high potential for merge conflicts on shared index files \[inferred\] | Graph schema transform scripts \[inferred\] | Bidirectional links drift when files are renamed without linter execution; regex extractors drop malformed tags \[inferred\] | Curator Tooling Architecture \[inferred\] |
| **Linear / GitHub Issues / Jira** | Cloud Relational Database (PostgreSQL) with event audit tables \[inferred\] | Central hosted database server \[inferred\] | Strict state machines with transactional transition logs and webhook triggers \[inferred\] | Relational foreign keys (Epics to Issues to Sub-tasks, BlockedBy, Duplicates) \[inferred\] | Server-side database constraints, JSON schemas, typed GraphQL/REST APIs \[inferred\] | ACID transactions with optimistic locking; no git merge conflicts \[inferred\] | Automated database schema migrations (Liquibase, Prisma, Flyway) \[inferred\] | Server dependency breaks repo-native local workflows; detached from offline code branching \[inferred\] | Linear Documentation \[inferred\]; GitHub Issues API \[inferred\] |

## **Format comparison matrix**

The evaluation matrix grades the storage paradigms on a scale from 1 to 5 points across six critical operational dimensions.

| Storage Format Option | Git Diff & Merge Friendliness | LLM Read / Write Reliability | Human Readability | Validation & Type Enforcement | Query Speed | Corruption Risk | Total Score (/30) | Architectural Assessment |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Markdown \+ YAML Frontmatter** (1 file per item) | **4/5**: File isolation prevents git merge conflicts between distinct records8. | **2/5**: LLMs frequently corrupt frontmatter syntax, wrap types in quotes, or inject prose into YAML blocks11. | **5/5**: Highly readable in web viewers, IDEs, and terminal viewers. | **2/5**: Parsers require custom remark/gray-matter pipelines; YAML allows ambiguous typings33. | **2/5**: Slow; requires full disk I/O scan and regex/frontmatter parsing of hundreds of files. | **2/5**: High; prose edits inadvertently break frontmatter delimiters or unescaped colons11. | **17/30** | Unsuitable as canonical machine state; ideal as a generated view. |
| **One JSON / YAML file per record** (e.g. .planning/records/{id}.json) | **5/5**: Optimal git diffs; clean line-by-line field additions; independent files merge cleanly across branches. | **4/5**: Excellent for JSON; LLMs reliably construct valid JSON when constrained by schemas; YAML can have whitespace defects. | **3/5**: Structured and clear, though less conversational than prose documents. | **5/5**: Deterministic validation via standard JSON Schema / Zod with conditional branching. | **3/5**: Moderate; requires reading discrete files from disk unless indexed. | **4/5**: Very low; isolated to single item; atomic filesystem writes (write-rename) eliminate partial corruption33. | **24/30** | Superior canonical persistence format for git tracking and distributed branch isolation. |
| **JSONL Append-Only Event Log** (e.g. .planning/events.jsonl) | **2/5**: Git auto-merges concurrent line appends incorrectly; branch merges cause interleaved chronological drift3. | **3/5**: Models can append lines, but frequently introduce invalid unescaped newline characters. | **2/5**: Impractical for humans to review long histories without specialized viewer tooling3. | **4/5**: Each line is an independent JSON object validated against an event schema. | **4/5**: Fast sequential read; full scan required to materialize current state. | **3/5**: Medium; a single corrupted line or partial write can disrupt downstream streaming parsers. | **18/30** | Problematic for multi-branch git merges if centralized in a single file. |
| **Committed SQLite Database** (Binary .sqlite in git) | **1/5**: Completely hostile to git; binary merge conflicts are unresolvable and inflate git repo size exponentially. | **1/5**: LLM agents cannot read or edit binary files directly without external tool invocation. | **1/5**: Unreadable without database inspection binaries (sqlite3, GUI clients). | **5/5**: Relational integrity, foreign keys, CHECK constraints, and strict typing. | **5/5**: Sub-millisecond indexed queries across thousands of records. | **2/5**: High risk of unrecoverable merge conflicts on concurrent branch modifications. | **15/30** | Disqualified as a committed git artifact; exceptional as a generated, gitignored query cache1. |
| **Dolt / Versioned Database** | **4/5**: Built-in cell-level three-way SQL merging and native git-like commit semantics37. | **2/5**: Requires complex SQL CLI commands; steep context-window tool-call overhead for LLMs. | **2/5**: Requires Dolt CLI or GUI; not browsable in standard GitHub file views. | **5/5**: Native relational constraints, strict schemas, and ACID transaction guarantees. | **5/5**: Direct SQL engine performance with indexed lookups and joins. | **4/5**: Very low; transactional database engine with cryptographic integrity. | **22/30** | Excessive runtime dependency; violates the self-contained Node.js plugin requirement. |
| **Hybrid: Canonical JSON Records \+ SQLite Cache \+ Generated Views** | **5/5**: File-per-item JSON isolates git diffs; views and SQLite cache are strictly gitignored or regenerated. | **5/5**: LLMs read/write structured parameters via CLI/Node tools; models consume generated Markdown for context. | **5/5**: Humans consume rich generated Markdown views; machine consumes validated JSON. | **5/5**: End-to-end validation: JSON Schema on write, SQLite relational constraints on query. | **5/5**: Sub-millisecond queries via hydrated SQLite cache; zero disk scan overhead during runs1. | **5/5**: Minimal; canonical JSON files written via atomic rename; cache regenerated automatically on hash mismatch. | **30/30** | Selected Architecture. Combines git mergeability, type safety, query speed, and human ergonomics. |

## **Proposed architecture**

The proposed architecture implements strict separation between canonical machine state, ephemeral query caching, and human markdown projections.

### **Canonical data model**

State is modeled through four first-class entities: WorkItem, DecisionRecord, ArtifactRecord, and PhaseState. Each entity is governed by a strict Zod and JSON Schema contract.  
A WorkItem represents any actionable lifecycle unit, including milestones, epics, slices, tasks, bugs, inbox captures, and questions. To prevent classification brittleness across heterogeneous repositories, epic association is purely an optional relation rather than a structural container. The schema requires the following fields:

* id: A permanent, uppercase string combining a repository prefix with a monotonic, collision-resistant identifier (such as SIG-BUG-0104a). IDs are strictly immutable and never recycled.  
* schema\_version: An integer indicating the document structure revision (initial release: 1).  
* type: An enumerated string taking one of seven values: "milestone", "epic", "slice", "task", "bug", "capture", or "question".  
* status: An enumerated lifecycle state: "inbox", "todo", "in\_progress", "blocked", "verifying", or "closed".  
* title: A concise single-line summary string.  
* priority: An enumerated string: "low", "medium", "high", or "critical".  
* relationships: An array of typed link objects containing a rel type ("parent", "child", "blocked\_by", "blocks", "relates\_to", or "duplicates") and a target\_id.  
* closure: A nullable object that is required to be non-null when status is set to "closed". It encapsulates:  
  * closed\_at: An ISO-8601 UTC timestamp.  
  * closed\_by: The actor identity (agent identifier, model name, or committer email).  
  * reason: An enumerated string taking one of five values: "shipped", "resolved", "wontfix", "duplicate", or "abandoned".  
  * proof\_commit\_sha: A mandatory 40-character hexadecimal git commit SHA confirming that the work was committed to the repository tree.  
  * proof\_summary: A concise prose statement explaining the verification result.  
* history: An append-only array of state transition envelopes, recording previous status, new status, timestamp, actor, and any associated gate verdict identifiers.

A DecisionRecord provides a permanent home for architectural choices, rationale, and user decisions:

* id: An immutable decision identifier (such as DEC-0042).  
* status: An enumerated string: "proposed", "accepted", "rejected", or "superseded".  
* context: Structured prose defining the driving forces and architectural context.  
* decision: Concrete prose detailing the chosen path.  
* consequences: Documented trade-offs and operational impacts.  
* superseded\_by: An optional target decision identifier.

An ArtifactRecord formalizes verification documents, specifications, and retrospectives:

* id: A unique artifact identifier (such as ART-EPC0012-VERIFY).  
* target\_id: Foreign key reference to the associated WorkItem or DecisionRecord.  
* artifact\_type: An enumerated string: "requirements", "plan", "progress", "verification", "review", "retrospective", or "profile".  
* path: Relative filesystem path to the author-written Markdown document under .planning/prose/.  
* content\_sha256: Cryptographic SHA-256 hash of the target prose document.  
* commit\_sha: Git commit SHA pinning the exact version of the narrative.

The PhaseState singleton governs project workflow progression:

* current\_phase: An enumerated value tracking the active lifecycle stage: "CALIBRATE", "DISCUSS", "PLAN", "EXECUTE", "VERIFY", "REVIEW", or "SHIP".  
* tier: Rigor tier governing gate strictness: "SKETCH", "SPIKE", "FEATURE", or "FULL".  
* active\_epic\_id: An optional reference to the currently executing epic.  
* phase\_history: A ledger of phase completions with attached gate verdict envelopes.

State machine transitions are strictly enforced. A work item can transition from "inbox" to "todo" or "closed" (as wontfix/duplicate); from "todo" to "in\_progress" or "blocked"; from "in\_progress" to "verifying", "blocked", or "todo"; from "blocked" to "todo" or "in\_progress"; and from "verifying" to "closed" or back to "in\_progress". The transition to "closed" cannot be bypassed through file renaming or prose updates.

### **Physical storage layout**

The repository layout establishes strict boundaries between machine-maintained canonical state, user-authored prose, generated views, and ephemeral caches:

* .planning/config.json: Project configuration specifying repository prefix, tier, and schema version.  
* .planning/records/items/: Flat directory containing one canonical JSON document per work item (e.g., SIG-BUG-0104a.json, SIG-EPC-0012.json). Files remain at this exact path across all lifecycle states.  
* .planning/records/decisions/: Flat directory containing one canonical JSON document per decision record (e.g., DEC-0042.json).  
* .planning/records/artifacts/: Metadata records tracking narrative artifact hashes and verification links.  
* .planning/records/phase.json: Canonical machine state file tracking project phase and active tier.  
* .planning/prose/: Free-form narrative Markdown documents authored by agents and users (such as epic design docs, architectural rationale, and retrospectives).  
* .planning/views/: Deterministically generated, read-only Markdown projections (STATE.md, BACKLOG.md, BUGS.md, DECISIONS.md).  
* .planning/.cache/: Gitignored directory hosting the SQLite index (index.sqlite) and dirty-state tracking markers.

Moving files between status directories (inbox/, backlog/, done/YYYY-MM/) was a primary driver of historical defects \[inferred\]. It created false git merge conflicts, broke relative Markdown links, and caused file history tracking to drift. Under the new layout, work item JSON files are strictly immobile \[inferred\].

### **Write path**

To prevent data corruption, agents and users never edit JSON records or generated Markdown views directly with arbitrary text manipulation tools11. All writes must pass through the Signal CLI or its backing Node.js programmatic API:  
The write sequence proceeds deterministically:

> 1. An agent or developer issues an explicit mutation command, such as signal item close SIG-BUG-0104a \--reason resolved \--proof-commit 7f8a1c2 \--proof "Verified against test suite".  
> 2. The Signal runtime intercepts the call and runs the input arguments through the Zod schema validator, asserting structural validity, required field presence, and regex compliance.  
> 3. The state machine engine checks the transition legality against the current state of SIG-BUG-0104a.json. If transitioning to "closed", it confirms that the target commit SHA exists in the local git repository using git cat-file \-e ^{commit}.  
> 4. The write engine writes the updated document to an adjacent temporary file (.planning/records/items/SIG-BUG-0104a.json.tmp.) and executes an atomic POSIX filesystem rename (fs.renameSync), guaranteeing that crashes or abrupt process terminations never yield partially written or malformed records33.  
> 5. An update transaction synchronizes the local SQLite database cache.  
> 6. The view compiler marks projections dirty and re-renders affected Markdown views in .planning/views/.  
> 7. A Git pre-commit hook runs signal verify. It scans all files under .planning/records/ against the JSON Schema, checks foreign key referential integrity across all relationships, and recalculates the integrity hashes stamped inside .planning/views/\*.md. If a user or rogue agent has manually altered a generated view or committed an invalid record, the pre-commit hook aborts the commit.

### **Read path**

The read pipeline decouples high-speed querying from filesystem serialization1. No tool, script, or agent prompt ever parses generated Markdown files or scrapes heading text2:  
Query operations execute via a high-performance path:

> 1. When a command such as signal query \--type bug \--status open is executed, the runtime checks .planning/.cache/index.sqlite.  
> 2. The runtime verifies cache freshness by comparing a dirty-state timestamp against the maximum modification timestamp of the .planning/records/ directory. If the cache is absent or stale, an automatic in-memory hydration scans all .json records and rebuilds the SQLite tables in under 50 milliseconds1.  
> 3. The query executes as an indexed SQL statement against the SQLite cache.  
> 4. The CLI formats the result into a clean, minimal JSON object or a compact terminal summary tailored for agent context windows, eliminating regex token parsing overhead.

### **Generated human views**

Generated views exist solely to satisfy human inspection and standard repository browsing in tools like GitHub or VS Code8.  
Each generated view begins with a standard non-editable header block:

* A machine-readable comment declaring the view as generated and specifying the source directory.  
* A cryptographic integrity hash representing the SHA-256 digest of all source record IDs and modification timestamps used during generation.  
* An explicit warning directing users to make modifications via the Signal CLI.

The compilation engine is strictly unidirectional: canonical JSON records project into SQLite, which then projects into generated Markdown views. No logic exists in the codebase to ingest, parse, or synchronize changes from views/\*.md back into records/\*.json. If a developer manually edits a generated view, the pre-commit integrity verification detects a hash mismatch, rejects the commit, and displays the appropriate CLI command needed to update the underlying canonical record.

### **Gates**

Classification, phase progression, and completion gates utilize a two-tiered verification model separating probabilistic reasoning from deterministic policy enforcement:  
The gate evaluation process separates duties:

* **Tier 1: LLM Judge as Structured Proposer ("Jev")**: When a phase transition or item closure requires qualitative judgment (such as evaluating whether an implementation satisfies complex narrative requirements), the agent or system invokes the "Jev" judging service. The judge cannot mutate repository state. It evaluates the spec, diff, and verification artifacts, returning a strictly typed JSON Verdict Envelope. This envelope records the verdict ("PASS" or "FAIL"), a confidence score between 0.00 and 1.00, a rubric version, the model identifier, an evaluation timestamp, a cryptographic SHA-256 hash of the exact prompt context, and an array of individual criterion assessments with concise rationale.  
* **Tier 2: Authoritative Deterministic Policy Engine**: The Signal runtime receives the Verdict Envelope and evaluates it against deterministic project criteria defined by the active tier. Under the "FULL" tier, closure requires that verdict \=== "PASS", confidence \>= 0.90, all child work items have status \=== "closed", all mandatory artifact records exist with verified content\_sha256 matching disk, and the referenced proof\_commit\_sha passes all local automated test suites. Under the "SKETCH" tier, the LLM judge is bypassed entirely, requiring only a non-empty proof\_summary.

If the deterministic engine validates all checks, it stores the complete Verdict Envelope inside the work item's history log and applies the state transition. If any check fails, the transition is rejected with a structured error log. This creates an immutable, auditable trail in Git history that allows any past decision to be inspected and verified.

### **References**

To permanently end citation rot caused by moving lines or changing file structures, Signal deprecates loose path:line pointers in favor of a three-tier immutable reference framework:

> 1. **Stable Entity Identifiers**: All intra-record relationships (such as task dependencies or epic assignments) reference immutable entity IDs (SIG-TSK-0841). Renaming a title or moving an epic has zero impact on the reference.  
> 2. **Commit-Pinned Code Anchors**: Citations of source code must pin the exact 40-character commit SHA at which the observation was recorded. An anchor record stores the commit SHA, the target file path, a structural AST symbol identifier (such as StorageEngine.prototype.writeAtomic), a SHA-256 hash of the referenced content slice, and the historical line range. If the file is modified on subsequent commits, the citation remains valid because it resolves against the pinned commit object in git, while an AST symbol resolver can track forward renames.  
> 3. **Semantic Artifact Heading Anchors**: Citations into narrative Markdown documents link via normalized semantic slugs derived from heading titles (such as ART-EPC0012-PLAN\#database-migration-strategy). An artifact validator asserts during verification that all cross-referenced heading anchors exist within the target document.

## **Failure-class check**

The proposed architecture systematically resolves all twelve historical defect classes through foundational structural guarantees rather than incremental regex adjustments.

| Historical Failure Class | Operational Status in Proposed Architecture | Architectural Mechanism and Rationale |
| :---- | :---- | :---- |
| **1\. Status inferred from wording** (e.g. strikethroughs, bold DONE/SHIPPED) | **IMPOSSIBLE** | Status is stored strictly as an enumerated machine field ("inbox", "todo", "in\_progress", "blocked", "verifying", "closed") within canonical JSON records. No component of the query or lifecycle system parses prose formatting to determine state. |
| **2\. Markdown structure parsed by regex** (heading depth, CRLF, \` |  |  |

, tables) | \*\*IMPOSSIBLE\*\* | Regex scrapers are eradicated from the machine state pipeline. All lifecycle data is stored in canonical JSON documents validated by strict Zod schemas and parsed using native JSON parsers \[cite: 11, 33\]. | | \*\*3. Two derivations of one fact drifting apart\*\* | \*\*IMPOSSIBLE\*\* | Canonical JSON files are the sole system of record. Derived Markdown views are ephemeral, one-way projections. Drift is caught by pre-commit integrity hashing, which prevents commits if a view does not match its source records. | | \*\*4. Closure inferred from which artifacts exist\*\* | \*\*IMPOSSIBLE\*\* | The physical presence of a file never triggers closure. Closing an item requires an explicit programmatic transition command providing a verified closure object containing an actor, timestamp, reason, and valid commit proof. | | \*\*5. Machine ledger mixed with narrative in one file\*\* (STATE.md) | \*\*IMPOSSIBLE\*\* | Machine state resides exclusively in .planning/records/phase.jsonand work item files. Human narratives reside in.planning/prose/. STATE.md is a purely generated view that rejects direct hand edits. | | \*\*6. Rules built from maintainer's repo shape failing on other repos\*\* | \*\*ELIMINATES\*\* | Work item schemas make epic associations optional (epic\_id: null | string). Configurable repository namespaces and generic intake channels support diverse project structures without enforcing epic hierarchies. | | \*\*7. Generated files clashing with hand-edited files\*\* | \*\*IMPOSSIBLE\*\* | Physical and semantic separation: .planning/records/contains canonical machine data;.planning/prose/contains author-written narrative;.planning/views/ contains generated projections stamped with tamper-detection integrity headers. | | \*\*8. Layout migrations breaking readers that find things by path or heading\*\* | \*\*IMPOSSIBLE\*\* | Work items reside in a flat directory (.planning/records/items/{id}.json) and never move across directories when changing status. Tools look up items by ID via indexed SQLite queries rather than path traversal. | | \*\*9. Concurrency: many writers, few files, nested locks\*\* | \*\*REDUCES SIGNIFICANTLY\*\* | A fine-grained, file-per-record storage model ensures that concurrent agents working on separate tasks touch completely distinct files, eliminating file contention and git merge conflicts. All writes use atomic temporary-file renames without long-lived locking \[cite: 33\]. | | \*\*10. IDs and path:linecitations drifting\*\* | \*\*ELIMINATES\*\* | Volatile line numbers are deprecated. Citations require immutable commit SHAs, AST symbol paths, and cryptographic content hashes, resolving deterministically against the git object store regardless of branch line shifts. | | \*\*11. Structured store re-parsed from rendered markdown\*\* | \*\*IMPOSSIBLE\*\* | Architectural boundaries prevent view ingestion. No parsing routine exists to read data fromviews/\*.md. All reads query the SQLite cache directly, terminating the feedback loop that previously reintroduced regex errors. | | \*\*12. Decisions, rationale, and user choices having no schema or single home\*\* | \*\*IMPOSSIBLE\*\* | Architecture Decision Records are elevated to first-class schema entities in .planning/records/decisions/\`, capturing status lifecycles, structured context, consequences, and explicit links to affected work items. |

## **Migration plan**

The migration strategy transforms existing mixed-state repositories into the canonical store through a verified, non-destructive, and fully reversible process designed to execute safely across all twelve user projects.

The migration executes across three sequential phases:

\[ Phase 1: Audit & Discovery \]  
       |  
       v  
  \- Discover legacy items across prose, frontmatter, & tables  
  \- Ingest 142 historical closed verdicts  
  \- Triage 10 self-contradictory records  
  \- Generate Pre-Migration Content Digest  
       |  
       v  
\[ Phase 2: Transformation & Cutover \]  
       |  
       v  
  \- Generate canonical JSON records in .planning/records/items/  
  \- Mark unproven closures as "legacy\_unverified"  
  \- Populate SQLite cache and compile initial .planning/views/  
  \- Run verification suite (\~4,400 automated tests)  
  \- Verify zero-loss invariant (Pre vs Post content hash parity)  
       |  
       v  
\[ Phase 3: Rollback / Commit \]  
       |  
       \+---\> SUCCESS: Atomic git commit staged and verified  
       |  
       \+---\> FAILURE: Instantaneous rollback via git reset / revert

### **Phase 1: Audit and discovery**

The migration binary (signal-migrate) performs a non-destructive analysis of the .planning/ directory:

> 1. **Discovery Engine**: The tool scans all legacy directories (inbox/, backlog/, epics/, done/), parsing existing frontmatter and applying the legacy regex extractors to BUGS.md, BACKLOG.md, and STATE.md one final time.  
> 2. **Auditing the 142 Historical Closed Verdicts**:  
   * The migration engine inspects each closed item. If the item contains a verifiable git commit SHA or passing test receipt in its legacy record, it transitions to status: "closed" with closure.reason \= "resolved".  
   * If the item lacks concrete proof, the engine flags it with closure.reason \= "legacy\_unverified" and sets migration\_audit\_required: true. The item is safely marked closed to respect historical intent, but isolated from modern verified items.  
> 3. **Triaging the 10 Contradicting Items**:  
   * Items exhibiting contradictions (such as closed frontmatter paired with active body text) are assigned status: "inbox", tagged with priority: "high" and labeled migration\_conflict.  
   * The migration tool generates a human-readable MIGRATION\_TRIAGE.md file listing these ten items with exact file paths and excerpts, ensuring zero silent drops.  
> 4. **Pre-Migration Digest**: The engine computes a complete cryptographic inventory:

![][image1]  
Every text snippet, note, and metadata attribute is indexed into an in-memory verification map.

### **Phase 2: Transformation and cutover**

> 1. **Record Generation**: The tool constructs .planning/records/items/{id}.json for every discovered item, .planning/records/decisions/{id}.json for architectural decisions, and .planning/records/phase.json for project status. Unidentified items receive newly minted, collision-free IDs.  
> 2. **Archival Staging**: The legacy directories (inbox/, backlog/, epics/, done/) and legacy Markdown files are moved into .planning/.archive-pre-v4/ rather than deleted.  
> 3. **Cache Hydration and View Compilation**: The SQLite cache is instantiated from the newly generated JSON records. The view compiler runs, emitting fresh, read-only Markdown views to .planning/views/.  
> 4. **Verification Proof**: The migration engine compares the post-migration records against the pre-migration inventory:

![][image2]  
The tool asserts that exactly ![][image3] legacy items were ingested and exactly ![][image3] canonical records were created, proving zero data loss.

5\. **Test Suite Execution**: The complete test suite of \~4,400 tests is executed against the new storage engine.

### **Phase 3: Rollback and verification**

Because users track the plugin's main branch, the migration must execute deterministically across repositories without manual intervention:

> 1. **Verification Gate**: The cutover only proceeds if all \~4,400 unit tests pass and the inventory verification map confirms zero item loss.  
> 2. **Atomic Git Commit**: If verification passes, all changes—including the newly generated records, the archived legacy files, and the compiled views—are staged into a single atomic commit: chore(storage): migrate planning state to canonical store \[v4-schema\].  
> 3. **Rollback Mechanism**: If any verification step fails, or if a user encounters repository anomalies, the migration binary provides an immediate rollback command: signal-migrate \--rollback. This command reverts the working tree using git reset \--hard HEAD (if uncommitted) or generates a clean git revert commit, fully restoring the legacy directory structure and Markdown files without loss of history.

## **Risks and open questions**

The proposed architecture resolves the primary failure classes, but several operational risks and empirical questions remain:

> 1. **Large Repository Filesystem and Inode Overhead**: In repositories tracking more than 10,000 tasks, maintaining one JSON file per item inside .planning/records/items/ could cause performance degradation in git status checks and filesystem directory scans on certain operating systems \[inferred\]. If directory file limits or slow git scans manifest, a two-level prefix-sharded hierarchy (such as .planning/records/items/0104/SIG-BUG-0104a.json) can be introduced transparently without breaking the entity ID space or query abstractions.  
> 2. **Model Compliance with CLI Boundaries**: While the architecture prohibits direct file editing, an LLM coding agent equipped with general bash capabilities might attempt to bypass the Signal CLI and modify .planning/records/\*.json directly using tools like sed or raw filesystem writes. To mitigate this risk, Signal must configure Claude Code harness rules, project-level instructions, and pre-commit hook verifications to detect unindexed or structurally invalid manual file modifications.  
> 3. **External LLM Judge API Operational Dependency ("Jev")**: The exact latency, cost per evaluation, rate limits, and availability profile of the external "Jev" judging API could not be verified from available codebase materials \[inferred\]. If Jev experiences service degradation or network outages, autonomous agent pipelines could stall. The gate engine must provide an explicit offline fallback mode, allowing a human maintainer to sign a gate transition envelope using a local git GPG or SSH key (signal gate override \--reason "Jev offline").  
> 4. **Platform Portability of SQLite Drivers in Node.js 22**: Many prior tools experienced build and runtime failures when relying on native C++ SQLite bindings (such as better-sqlite3) across diverse operating system environments, Alpine containers, and non-standard architectures. Signal must build its cache hydration engine around Node.js 22's native built-in SQLite module (node:sqlite) or pure WebAssembly implementations (sql.js), eliminating external build tools and native compilation failures entirely.

## **Sources**

The evidence base supporting this research consists of primary open-source code repositories, formal documentation, and secondary engineering reviews:

### **Primary sources**

> * [Beads Rust Port Repository](https://github.com/Dicklesworthstone/beads_rust) (Code, documentation, and SQLite/JSONL sync architecture)  
> * [GSD Core Repository](https://github.com/gsd-build/get-shit-done) (Code, command routing, and spec-driven development SDK)  
> * [Agent Skills Repository](https://github.com/addyosmani/agent-skills) (Engineering workflow skills, anti-rationalization tables, and verification gates)  
> * [Superpowers Repository](https://github.com/obra/superpowers) (Composable agent skills framework, git worktree isolation, and TDD enforcement)  
> * [Superpowers Issue \#230](https://github.com/obra/superpowers/issues/230) (Discussion on planning depth and compounding engineering patterns)  
> * [Compound Engineering Plugin Repository](https://github.com/everyinc/compound-engineering-plugin) (Multi-agent review passes, solution compounding, and skill workflows)  
> * [EveryInc GitHub Organization](https://github.com/EveryInc) (Agent tooling repositories and proof SDK)  
> * [oh-my-claudecode Repository](https://github.com/yeachan-heo/oh-my-claudecode) (Multi-agent orchestration, session state managers, and wiki systems)  
> * [oh-my-claudecode Wiki Skill Documentation](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/skills/wiki/SKILL.md) (Markdown knowledge base with YAML frontmatter and lint verification)  
> * [oh-my-claudecode Reference Guide](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/REFERENCE.md) (State migration flags, session directory boundaries, and atomic migration)  
> * [oh-my-claudecode Releases](https://github.com/yeachan-heo/oh-my-claudecode/releases) (Release notes, native build failure fixes, and state engine changes)  
> * [gstack Repository](https://github.com/garrytan/gstack) (Claude Code tools, lifecycle roles, and directory guard utilities)  
> * [gstack Fork Repository](https://github.com/asecretcompany/gstack-fork) (Setup scripts, review routing, and doc synchronization)  
> * [pm-skills Repository](https://github.com/phuryn/pm-skills) (Product management skills, opportunity solution trees, and triage workflows)  
> * [Backlog.md Go Implementation](https://github.com/veggiemonk/backlog) (Repo-native task management in Go)  
> * [Vibe-Kanban Issue \#319](https://github.com/BloopAI/vibe-kanban/issues/319) (Filesystem as single source of truth architectural discussion)  
> * [LifeOS Issue \#1034](https://github.com/danielmiessler/LifeOS/issues/1034) (Empirical tracking of Beads memory in large-scale tasks)  
> * [Agentic-OS Task Tutorial](https://github.com/itseffi/agentic-os/blob/main/Tutorials/build-your-personal-os.md) (Markdown and frontmatter task storage formats)  
> * [VS Code Backlog.md Marketplace Extension](https://marketplace.visualstudio.com/items?itemName=ysamlan.vscode-backlog-md) (Task tracking interface and inline markdown management)  
> * [Open VSX Backlog.md Changelog](https://open-vsx.org/extension/ysamlan/vscode-backlog-md/changes) (Task browsing and frontmatter schema revisions)  
> * [Cursor Marketplace Every Plugin](https://cursor.com/marketplace/every) (Skill specifications and automated PR monitoring)

### **Secondary sources**

> * [Yuv.ai: Beads Memory Architecture for AI Agents](https://yuv.ai/blog/beads-git-backed-memory-for-ai-agents-that-actually-remembers) (Detailed analysis of Beads git-backed memory engine)  
> * [Steve Yegge: Introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a) (Design rationale, task graph models, and memory persistence)  
> * [Steve Yegge: Beads Blows Up](https://steve-yegge.medium.com/beads-blows-up-a0a61bb889b4) (Architectural review of SQLite cache hydration from JSONL)  
> * [DoltHub: Restoring Beads Classic](https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/) (Comparative analysis of JSONL, SQLite, and versioned databases)  
> * [Hacker News: Beads Discussion](https://news.ycombinator.com/item?id=46075616) (Evaluation of JSONL merge behaviors and source of truth trade-offs)  
> * [Reddit vibecoding: Is Beads Worth a Try?](https://www.reddit.com/r/vibecoding/comments/1p9tnm3/is_beads_worth_a_try/) (Field reports on daemon stability and task creation prompts)  
> * [HysenLabs: Backlog.md Technical Review](https://hysenlabs.com/projects/mrlesk-backlog-md) (Analysis of review bottlenecks and file-per-task layouts)  
> * [Smithery AI: Backlog Manager Skill Analysis](https://smithery.ai/skills/kasuboski/backlog-manager) (Rules enforcing CLI-only mutations over direct file edits)  
> * [Markplane: Git-Native AI Project Management](https://prompts.brightcoding.dev/blog/stop-juggling-saas-tools-markplane-puts-your-ai-project-manager-inside-git) (Frontmatter schemas, task IDs, and pre-commit verification)  
> * [Addy Osmani: Agent Skills Architectural Overview](https://addyosmani.com/blog/agent-skills/) (Software development lifecycle encoding and anti-rationalization patterns)  
> * [Every.to: Compound Engineering Architecture](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents) (Compounding workflows, verification nets, and solution repositories)  
> * [Zentor AI: Compound Engineering Deep Dive](https://zentor.ai/blog/compound-engineering) (Operational review of filing conventions and solution context scaling)  
> * [Dev.to: Compound Engineering Overview](https://dev.to/arshtechpro/compound-engineering-a-plugin-that-makes-your-ai-coding-agent-smarter-over-time-2pp0) (Multi-agent review and engineering memory loops)  
> * [SkillsLLM: Planning with Files Specification](https://skillsllm.com/skill/planning-with-files) (Three-file pattern, crash recovery, and completion gates)  
> * [SkillsLLM: Get Shit Done Overview](https://skillsllm.com/skill/get-shit-done) (Meta-prompting and context engineering analysis)  
> * [SkillsLLM: Superpowers Overview](https://skillsllm.com/skill/superpowers) (TDD enforcement and subagent planning analysis)  
> * [SkillsLLM: oh-my-claudecode Overview](https://skillsllm.com/skill/oh-my-claudecode) (Multi-agent orchestration and native dependency considerations)  
> * [Towards AI: Garry Tan's gstack Explained](https://pub.towardsai.net/gstack-garry-tans-claude-code-setup-that-turns-one-developer-into-a-full-engineering-team-2026-02854a569730) (Complete workflow, review gates, and directory freezing)  
> * [Y Combinator Library: Inside Garry Tan's Setup](https://www.ycombinator.com/library/OW-inside-garry-tan-s-ai-coding-setup) (Thin harness, specialized skills, and automated review)  
> * [Reddit ClaudeAI: gstack Technical Critique](https://www.reddit.com/r/ClaudeAI/comments/1s7jdof/garry_tan_opensourced_gstack_his_personal_skill/) (Analysis of self-review bias, token bloat, and supply chain aspects)  
> * [Reddit ClaudeCode: Superpowers vs oh-my-claudecode](https://www.reddit.com/r/ClaudeCode/comments/1seq10m/obrasuperpowers_yeachanheoohmyclaudecode_or_else/) (User comparisons of task persistence and workflow friction)  
> * [Reddit ClaudeCode: Task Trackers in Practice](https://www.reddit.com/r/ClaudeCode/comments/1v91nk4/what_task_tracker_are_you_using_with_claude_code/) (Evaluation of Backlog.md and frontmatter task models)  
> * [Genie Devoxx: Spec-Driven Development with Backlog.md](https://genie.devoxx.com/docs/features/spec-driven-development) (Autonomous implementation from structured Markdown specs)

#### **Works cited**

> 1. Beads Blows Up \- Steve Yegge \- Medium, [https\://steve-yegge.medium.com/beads-blows-up-a0a61bb889b4](https://steve-yegge.medium.com/beads-blows-up-a0a61bb889b4)  
> 2. GitHub \- Dicklesworthstone/beads\_rust: Fast Rust port of Steve, [https\://github.com/Dicklesworthstone/beads\_rust](https://github.com/Dicklesworthstone/beads_rust)  
> 3. Beads – A memory upgrade for your coding agent \- Hacker News, [https\://news.ycombinator.com/item?id=46075616](https://news.ycombinator.com/item?id=46075616)  
> 4. Beads: Git-Backed Memory for AI Agents That Actually Remembers, [https\://yuv.ai/blog/beads-git-backed-memory-for-ai-agents-that-actually-remembers](https://yuv.ai/blog/beads-git-backed-memory-for-ai-agents-that-actually-remembers)  
> 5. Introducing Beads: A coding agent memory system \- Medium, [https\://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)  
> 6. Is Beads worth a try? : r/vibecoding \- Reddit, [https\://www\.reddit.com/r/vibecoding/comments/1p9tnm3/is\_beads\_worth\_a\_try/](https://www.reddit.com/r/vibecoding/comments/1p9tnm3/is_beads_worth_a_try/)  
> 7. Experimenting with Steve Yegge's beads for large project task tracking, [https\://github.com/danielmiessler/LifeOS/issues/1034](https://github.com/danielmiessler/LifeOS/issues/1034)  
> 8. Backlog.md CLI: Markdown task manager for AI agents \- Hysen Labs, [https\://hysenlabs.com/projects/mrlesk-backlog-md](https://hysenlabs.com/projects/mrlesk-backlog-md)  
> 9. Markplane Puts Your AI Project Manager Inside Git \- Prompts, [https\://prompts.brightcoding.dev/blog/stop-juggling-saas-tools-markplane-puts-your-ai-project-manager-inside-git](https://prompts.brightcoding.dev/blog/stop-juggling-saas-tools-markplane-puts-your-ai-project-manager-inside-git)  
> 10. \[Feature request\] Integrate with Backlog.md for Git-Native Task, [https\://github.com/BloopAI/vibe-kanban/issues/319](https://github.com/BloopAI/vibe-kanban/issues/319)  
> 11. backlog-manager \- Skill \- Smithery, [https\://smithery.ai/skills/kasuboski/backlog-manager](https://smithery.ai/skills/kasuboski/backlog-manager)  
> 12. What task tracker are you using with Claude Code? \- Reddit, [https\://www\.reddit.com/r/ClaudeCode/comments/1v91nk4/what\_task\_tracker\_are\_you\_using\_with\_claude\_code/](https://www.reddit.com/r/ClaudeCode/comments/1v91nk4/what_task_tracker_are_you_using_with_claude_code/)  
> 13. get-shit-done \- AI Agents on GitHub (64.4k ) | SkillsLLM, [https\://skillsllm.com/skill/get-shit-done](https://skillsllm.com/skill/get-shit-done)  
> 14. GitHub \- gsd-build/get-shit-done: A light-weight and powerful meta, [https\://github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)  
> 15. planning-with-files \- AI Agents on GitHub (27.3k ) | SkillsLLM, [https\://skillsllm.com/skill/planning-with-files](https://skillsllm.com/skill/planning-with-files)  
> 16. addyosmani/agent-skills: Production-grade engineering ... \- GitHub, [https\://github.com/addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)  
> 17. Agent Skills | AddyOsmani.com, [https\://addyosmani.com/blog/agent-skills/](https://addyosmani.com/blog/agent-skills/)  
> 18. GitHub \- garrytan/gstack: Use Garry Tan's exact Claude Code setup, [https\://github.com/garrytan/gstack](https://github.com/garrytan/gstack)  
> 19. GitHub \- asecretcompany/gstack-fork: Use Garry Tan's exact Claude, [https\://github.com/asecretcompany/gstack-fork](https://github.com/asecretcompany/gstack-fork)  
> 20. GStack: Garry Tan's Claude Code Setup That Turns One Developer, [https\://pub.towardsai.net/gstack-garry-tans-claude-code-setup-that-turns-one-developer-into-a-full-engineering-team-2026-02854a569730](https://pub.towardsai.net/gstack-garry-tans-claude-code-setup-that-turns-one-developer-into-a-full-engineering-team-2026-02854a569730)  
> 21. Garry Tan open-sourced gstack : his personal skill pack for Claude, [https\://www\.reddit.com/r/ClaudeAI/comments/1s7jdof/garry\_tan\_opensourced\_gstack\_his\_personal\_skill/](https://www.reddit.com/r/ClaudeAI/comments/1s7jdof/garry_tan_opensourced_gstack_his_personal_skill/)  
> 22. Inside Garry Tan's AI Coding Setup : YC Startup Library | Y Combinator, [https\://www\.ycombinator.com/library/OW-inside-garry-tan-s-ai-coding-setup](https://www.ycombinator.com/library/OW-inside-garry-tan-s-ai-coding-setup)  
> 23. PM Skills Marketplace: 100+ agentic skills, commands, and plugins, [https\://github.com/phuryn/pm-skills](https://github.com/phuryn/pm-skills)  
> 24. obra/superpowers: An agentic skills framework & software ... \- GitHub, [https\://github.com/obra/superpowers](https://github.com/obra/superpowers)  
> 25. superpowers \- AI Agents on GitHub (235k ) \- SkillsLLM, [https\://skillsllm.com/skill/superpowers](https://skillsllm.com/skill/superpowers)  
> 26. obra/superpowers, yeachan-heo/oh-my-claudecode, or else ... \- Reddit, [https\://www\.reddit.com/r/ClaudeCode/comments/1seq10m/obrasuperpowers\_yeachanheoohmyclaudecode\_or\_else/](https://www.reddit.com/r/ClaudeCode/comments/1seq10m/obrasuperpowers_yeachanheoohmyclaudecode_or_else/)  
> 27. Compound Engineering: A Plugin That Makes Your AI Coding Agent, [https\://dev.to/arshtechpro/compound-engineering-a-plugin-that-makes-your-ai-coding-agent-smarter-over-time-2pp0](https://dev.to/arshtechpro/compound-engineering-a-plugin-that-makes-your-ai-coding-agent-smarter-over-time-2pp0)  
> 28. I stacked gstack, Superpowers and Compound Engineering together, [https\://www\.reddit.com/r/whaaat\_ai/comments/1s9f5et/i\_stacked\_gstack\_superpowers\_and\_compound/](https://www.reddit.com/r/whaaat_ai/comments/1s9f5et/i_stacked_gstack_superpowers_and_compound/)  
> 29. What Compound Engineering Actually Compounds | Zentor Blog, [https\://zentor.ai/blog/compound-engineering](https://zentor.ai/blog/compound-engineering)  
> 30. Official Compound Engineering plugin for Claude Code ... \- GitHub, [https\://github.com/everyinc/compound-engineering-plugin](https://github.com/everyinc/compound-engineering-plugin)  
> 31. Compound Engineering: How Every Codes With Agents, [https\://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)  
> 32. oh-my-claudecode/skills/wiki/SKILL.md at main \- GitHub, [https\://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/skills/wiki/SKILL.md](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/skills/wiki/SKILL.md)  
> 33. oh-my-claudecode/docs/REFERENCE.md at main \- GitHub, [https\://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/REFERENCE.md](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/REFERENCE.md)  
> 34. oh-my-claudecode \- Ship 3× Faster with a Team of AI Agents, [https\://ohmyclaudecode.com/](https://ohmyclaudecode.com/)  
> 35. Releases · Yeachan-Heo/oh-my-claudecode \- GitHub, [https\://github.com/yeachan-heo/oh-my-claudecode/releases](https://github.com/yeachan-heo/oh-my-claudecode/releases)  
> 36. oh-my-claudecode \- AI Agents on GitHub (39.5k ) | SkillsLLM, [https\://skillsllm.com/skill/oh-my-claudecode](https://skillsllm.com/skill/oh-my-claudecode)  
> 37. Restoring Beads Classic | DoltHub Blog, [https\://www\.dolthub.com/blog/2026-04-02-restoring-beads-classic/](https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAATCAYAAAAtflEYAAAEAElEQVR4Xu3cW6hUdRTH8ZWVaVaW2UMXKihCI+ihh6CiG0QQUUQRPRRp9JS+CEo9FHahwOqhgogotAt0oRKLKALxTiCaRLeH0uyeXZCie1S2fqz/n7PO/4yH2Z0GR/l+4Mf8Z+09s/ee2XJW/70nMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAPm6n50fPN56vU771fOf5wfOT5+cmy/RiAAAADN7Znl0l/XrRuq0PAACACVpt0YBt8RzULBvPNW3BHeKZUcaz8oKOTm0LA/B6Gh9h3Y4d/bnR83BbBACgq/meHZ6vPNtLNnmOzCu5hc3zfcmxnu8tmrYHm2Xj0excS5dYn/C8YfFZykeeD8vja01tq41t7KZ4lja1arrnPs/RqXad5yrPNIt9Oj4tO8Bzkee8VKueLI8vWRx7r3X2pNM8x7XFvcx+Fv+eAACYsHs9c5ua7uPKTdsVaTxRt3rmtcUhUC+NHtMu6NPLzXPdA1fpfb9Iz2vtgqYmz1gsu7Spr/FcX8Z/eX5J9Tc9j3guLzU5zKKZkz9SXdY2z4exYdP5l8/Bc9J4ULSNF9piR73O7efaAgAAXalhq41ApWbh0ab2f9lgvf+o7WlvWzQuq9oFffq0ef55Gut9P0vPa61t2KZ6tpVlTzXL/vT8U8baR61TxyeWcabGTzNskmdIT7ex9+ANY8PWurstDIC2MYiG7W8bO2sNAEAnatjqTEymP+Lne1610TM0F3vu8CyxuPT3Tqk/7Vlv8QvK2aX2rkUz+JhnpucWi/f9wOJ9h80NFvt3VrugD+davHad57Zmmeq67HxySq+G7XnPhRafTdtUZbrMplk2Wem5ybPZ81CpnWTx+mctPvt8ifVxi3Wz3LDpXj6to22sKbXlFrNyGz2feD4u9VcszpEFnmtLTXR+aIbxSs+dFrOWalq0nYMtfn2rcb3frxc1rovLWOeZGlY91nNL+3uz52qLc1jUNGvbKywu+f5eHm+3kRnJ3bnEYhu6RSBvR422jk2/JtalZ72/9l3N85kWx6XZU53b+o8Rndt6faZtd7ncDgDAGOM1bJeV8f3l8YxSr+r4QItmTfdRKb9Z3L+jP2oPeCZ79i/r6jW9ZiGGRZ3hUvPUlY5xkUVj819m2OoN6rpXTc2G7mdrHWrRQOkzlVM8k8r4BIt76PT55u9Jl+Rqc7Tdc1daJlpXDZAuCd5jI9/jW2X5rxbfpy6z5vdVE17l+pdpXI9B99apuRE1mUeV8e7oBxyL03P9r1Yyba/up95XDdPhNvry4/s28tn0M2OsbeQZNu2njlHbUPNZj1Ezoe9ZXIaeU2qiH4v0Orf1fa1uiwBG+xcnpteg2fjXNAAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAATCAYAAAAtflEYAAAEO0lEQVR4Xu3baahtYxzH8b95TMRVRN5QeKEkpete4SaSDC8MbxC5krzAvZd7b1eSFMpYypQhUZJkeGEeQrmGZEyGROZ5yjz9f/2fp/Ps/7HPWdth70XfT/06z3rWWnuvvdY+Pf/9rL3NAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9dLznK8/Hng88H5Z85PnU87nnW893KddrZwAAAIzHr54/PMfmFUPsZrE9AAAAxmRNiwJMWS+tm8lRucNt7FmYO0e0hueM3PkvWMuzR+7sOV2rzXNnD/T1uLp6wrNR7gQATM4pFrf7dPvv7ZJnbPpg03W26f/iM4uC7bK8YgZ75g73hec6z30Wt1vlDc+b5a9S+2r/66Wvmm/DZ/C291xg06/PAZ4ty98z07r9POdYFBWtS9LybDb1nJ87x+w3G35uJqmvx9XVRZ67cicAYLIu9ByX+vS9rbZoO7Jpz9Wq3NFTl1sMulvnFR3dmZaPaNpbeN5rluV+zz6pT1TIfe3ZLPVv4tmptA/zPN2se9zziGfXpk/bv1za63ieb9Y95lnRLHextuf03DlHD+aOWSy2fhZG4z6uuf5PLcgdFh8w1s2dAIDJUcGWZ2gO8lyV+v4put3yX6DboRp0H7bps1FdvJOWdXu0UsH2brMswwq22z032tQMXaVB9rXS3sDiWDXjNswtNlgkHt60ta+OaZL0AUGF6ShOsPEWRl2N+7jm+j91Xu6wuEWuDwIAgJ5QwXZ07rQYcPb23FPa1f4Wt9Q0C6dbfS+W/ps8h1j8YrLO/LzkWeS5xqIgWG7xWNpPj9t3KpJ0vPohwqj2stj3J89ZNjhjqXOh29AqsGo06OaCTYWiCj3NiP2S1rU0e1avg5xqMVt1YtOnY7nZ4lqoWNSAXD3btHUcOmYV8cssCk9dcz3ekza1n/Zp3xcrPUs9t1kU+5qh1LK2ucHzfdlO5+Ukz8Ge50qfvGpT741K7ynNFrbvqX0tCk/dzte62Qqjpyzeh3d4vvFs59nGc63nQM+jFgWv6JfA+n/QdpWO61zPlZ4dmj49r2ZR9Ro02zjqcYmeT69xteeh0ne351aLa6j3iLTXROvbDwNa1+W8fWmx3QNl3SulX+fgZ4v928eQF9IyAGCCZirYNKjWtrS/iLy4aaug0CCgLyorP1h8Wf53i4FMt1bqQN9lIOuTtyyOWYPoqPSad7cYkNvX3XWG7YqmPey87WJxvv+KBvi6n/62txx/bNoqSFqXenYsbc3EacZItvKcXdpSC70lNnh87UCv/vz4lQrA6mQbfIxh7ylts23ZJj/vMCp212+WtU99XBVc99rgdwf1/T85zeL6VdrvmNJ+v+mXUY/rapsqAFUwzrO4ha0iudrQ4juQkq/JotLe2bqdt0Ob7fRc7T6fNO2Wvov3d2aXgd75E32l68XUrJ9+AAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAYCAYAAAD3Va0xAAABF0lEQVR4Xu2TvUoDQRRGr1qZSkTSpBQMIjZ5AAvjA0jE0jYJ1jZ2go1VQLCxsgkk8SUELRQUkQTSBEJIo502kkLUnHFm2J27m8J+Dxx25n7D/C0jkvFftnGIr/iGzTD+4xFHOBA7thGkijZ+4A+uqmwBT/AWC2GUpItH+CvpK57hvi5qiniNS/iJ75gLRojcYV7VEtTw0LUvxe6qGsWyiM+x/kxauO7am2InMkf1lPEi1p/Ji+rfiJ1sy/VPcS+K0/H3E6cidiJfN/ezEsXp1CW6H4/53WP8wjV8CuN0Orihi3Asdlf3eK6yBHPYd1+NOcpE7GS7KktwgD2c14HjCr9xWQeeHbHvyqxoNE/DvDlNCR90MSMDpvMbNCf6RtASAAAAAElFTkSuQmCC>