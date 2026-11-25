# Signal Storage and Lifecycle Architecture

## 1. **Executive recommendation**

**[inferred]** Lock Signal onto a **versioned, event-sourced repository store**: strict JSON for immutable entity creation records, one immutable JSON file per lifecycle event, separate Markdown files only for narrative, generated Markdown views, and a disposable local SQLite query index.

Do not retain `status` as independently editable state. Derive it deterministically by folding typed events through versioned state machines. Every transition records actor, timestamp, previous revision, reason, evidence, policy version, and—when used—the complete LLM-judge envelope. Per-event files avoid the merge hotspot of one JSONL ledger; conflicting concurrent transitions become explicit semantic conflicts rather than last-writer-wins corruption.

All canonical writes should go through a Signal CLI/library transaction that validates JSON Schema, referential integrity, state transitions, policies, and replay consistency before atomically renaming files into place. Agents may directly edit designated narrative Markdown only. No reader may parse generated Markdown.

Use stable entity IDs and typed links, commit-pinned evidence plus content anchors, opt-in migrations, lossless import provenance, and a generated SQLite index that can be deleted and rebuilt. This architecture makes most existing failure classes structurally impossible and contains the remaining concurrency and migration risks.

## 2. **Prior-art table.**

“Not verified” means the system was not given architectural weight; it does not mean the capability is absent.

| System | Format | Source of truth | Status model | Relationships | Validation | Concurrency/merge | Migration | Known failures | Link |
|---|---|---|---|---|---|---|---|---|---|
| GSD / Get Shit Done | Markdown `PROJECT`, `REQUIREMENTS`, `ROADMAP`, `STATE`, phase plans/summaries; JSON config | `.planning/` documents | Stored in prose fields and artifact progression; code parses and updates `STATE.md` and `ROADMAP.md` | Requirement IDs, phase/plan numbering, frontmatter dependencies | Workflow checks and optional state validation | Separate phase/plan files support parallelism; shared `STATE.md` remains a hotspot **[inferred]** | Layout/template evolution; no durable public schema-migration contract verified | Its architecture explicitly includes Markdown parsing/updating modules, reproducing Signal’s mixed-ledger risk | [Primary](https://github.com/gsd-build/get-shit-done/blob/main/docs/ARCHITECTURE.md) |
| Agent Skills | `SKILL.md` with YAML frontmatter, hooks and Markdown commands | Skill definitions, not project lifecycle data | No general project-status store | Skill sequencing | Repository conventions and tests | Git-native skill files | Plugin/package evolution | Not a planning database; applying it as one would leave lifecycle facts in agent-authored prose **[inferred]** | [Primary](https://github.com/addyosmani/agent-skills) |
| gstack | Markdown skills; design/test artifacts; optional GitHub issues | Mixed local artifacts, Git/GitHub, and active plan | Workflow gates; some checks inspect required Markdown headings | Stage-to-stage artifact handoff; issue-to-PR links | Procedural review gates and tests | Work occurs on branches/worktrees | Tool upgrades rather than project-store migration | A plan-exit gate checks a particular final heading, demonstrating structure-by-heading fragility | [Primary](https://github.com/garrytan/gstack) |
| pm-skills | Plugin manifests plus `SKILL.md` and Markdown commands | Plugin repository | No project lifecycle store | Workflow-level conceptual relations | Plugin validator and documentation-consistency tests | Normal Git | Plugin manifest evolution | It is a workflow catalog, not a durable planning store | [Primary](https://github.com/phuryn/pm-skills) |
| Superpowers | Markdown specifications and plans; checkbox tasks | Saved plan/spec plus Git branch | Checklist/procedural progression | Plan-to-task ordering; fresh subagent per task | Human plan approval, task tests, review agents | Worktrees and task isolation | Release-driven skill changes | Issue reports identify monolithic-plan/token-efficiency and handoff limitations | [Primary](https://github.com/obra/superpowers) |
| compound-engineering | Markdown/HTML plans; solution knowledge Markdown with YAML frontmatter | Plan and Git branch; sometimes GitHub issue | Procedural workflow/todos | Plan, worktree and issue associations | Continuous test/review workflow | Isolated worktrees | Plugin release evolution | No general typed lifecycle store verified | [Primary](https://github.com/EveryInc/compound-engineering-plugin) |
| planning-with-files | `task_plan.md`, `findings.md`, `progress.md` | Three selected Markdown files | Phase/status text in plan; progress log | Active-plan pointer and plan ownership | Hooks re-read plans and remind writers | Explicitly assigns one owner to shared plan files | Adapter-specific installation changes | Shared Markdown is protected mainly through single ownership and reminders rather than schema enforcement | [Primary](https://github.com/OthmanAdi/planning-with-files) |
| oh-my-claudecode | JSON state/session files, JSONL replay/events, local Markdown notes, native Claude task JSON | Local `.omc/` runtime state; generally gitignored | Explicit JSON state and team events | Task dependencies, team manifests, session IDs | MCP/state APIs and repository-boundary checks | Native task lock plus per-worker state files; optional worktrees | Explicit migration commands copy without overwriting or deleting sources | Replaced a legacy SQLite swarm implementation; migration docs address fragmented state roots | [Primary](https://github.com/Yeachan-Heo/oh-my-claudecode) |
| Curator-style knowledge bases | **Not uniquely identifiable** | Not verified | Not verified | Often backlinks/tags **[inferred]** | Not verified | Not verified | Not verified | “Curator” names several unrelated tools; no specific repository could be safely attributed | — |
| Beads | Dolt; issue-oriented JSONL export for interoperability | Dolt database and its version history | Explicit issue records/history | Issue graph | Database schema and CLI | Dolt branches, table-aware merges and conflicts | Backups preserve Dolt history | JSONL export does not preserve branches, full history, working state or non-issue tables | [Primary](https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md) |
| Backlog.md | One Markdown file per task with structured metadata; config YAML; stable JSON read API | Repository-local backlog directory | Explicit task status; complete/archive commands | IDs, dependencies, milestones, references | CLI/MCP/Web normalize fields | One task per file; recommended one-task/one-PR workflow | Backward-compatible CLI/config evolution | Documentation recommends CLI/MCP/Web over hand editing so metadata stays consistent | [Primary](https://github.com/MrLesk/Backlog.md) |
| Taskmaster AI | Tagged `tasks.json` plus generated individual task Markdown | Structured JSON | Stored status field | Numeric dependencies and subtasks | Allowed-status and dependency-reference checks | Central `tasks.json` is a merge hotspot **[inferred]** | Tagged format introduced with backward compatibility | Generated Markdown duplicates JSON facts; central collection increases conflicts **[inferred]** | [Primary](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/task-structure.md) |
| GitHub Spec Kit | Markdown spec, plan and task artifacts; newer workflows in YAML | Feature-spec directory and Git | Checkbox/procedural status | Roadmap dependencies and staged artifacts | Templates, checklists and cross-artifact analysis | Separate worktrees for independent slices | Template/workflow upgrades | Dependency and done values remain ordinary Markdown in some workflows | [Primary](https://github.com/github/spec-kit) |
| Kiro specs | `requirements.md`/`bugfix.md`, `design.md`, `tasks.md` | Workspace Markdown specs | Tracked tasks/checklists | Requirements → design → tasks | Structured generation and review | Git/workspace behavior | Living docs can be regenerated/edited | Editable documents can diverge when they restate facts **[inferred]** | [Primary](https://kiro.dev/docs/specs/) |
| OpenSpec | Markdown specs and structured change folders with delta sections | Current specs; active changes are proposals | Archive operation is the explicit completion transition | Change-to-capability/spec relationships | `openspec validate`; archive performs a dry semantic merge | Change folders isolate parallel work until deltas merge | Archive/sync converts deltas and preserves old change folder | Release history includes fixes for task-marker parsing and archived-task completeness checks | [Primary](https://github.com/Fission-AI/OpenSpec) |
| BMAD-METHOD | PRDs, architecture, epic/story Markdown plus `sprint-status.yaml` | `sprint-status.yaml` during implementation | Explicit enumerated story status | Epic/story hierarchy and dependencies | Agent workflows and reviews | One shared YAML status file is a merge hotspot **[inferred]** | Workflow/version updates | Manual status changes mean conformance depends on the writer | [Primary](https://docs.bmad-method.org/how-to/workflows/run-sprint-planning/) |
| git-bug | Not verified deeply enough in this run | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | Excluded from design weight | [Primary](https://github.com/git-bug/git-bug) |
| Fossil tickets | Not verified deeply enough in this run | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | Excluded from design weight | [Primary](https://fossil-scm.org/home/doc/trunk/www/bugtheory.wiki) |
| TaskWarrior | Not verified deeply enough in this run | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | Excluded from design weight | [Primary](https://taskwarrior.org/docs/) |
| todo.txt | Not verified deeply enough in this run | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | Excluded from design weight | [Primary](https://github.com/todotxt/todo.txt) |
| org-mode | Not verified deeply enough in this run | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | Excluded from design weight | [Primary](https://orgmode.org/manual/) |
| adr-tools | Markdown ADR files | ADR directory **[inferred]** | Decision state, not work lifecycle **[inferred]** | Supersession links **[inferred]** | Not verified | File-per-ADR **[inferred]** | Not verified | Detailed failure evidence not verified | [Primary](https://github.com/npryce/adr-tools) |
| MADR | Markdown ADR template | ADR documents **[inferred]** | Decision status | Links among decisions **[inferred]** | Template conformance | File-per-record **[inferred]** | Template versions | Detailed failure evidence not verified | [Primary](https://adr.github.io/madr/) |
| log4brains | Markdown ADRs with generated browsing views **[inferred]** | ADR files **[inferred]** | Decision status | ADR links **[inferred]** | Not verified | Git-native files **[inferred]** | Not verified | Detailed failure evidence not verified | [Primary](https://github.com/thomvaill/log4brains) |
| GitHub Issues | Hosted structured issues plus comments/events | GitHub database | Explicit open/closed state; default-branch merge can close via typed keywords | Issue/PR links, project membership and references | Issue-form YAML supports typed inputs and required validations | Server transaction model | Hosted API evolution | Closing keywords are interpreted according to branch and merge rules | [Primary](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) |
| Linear | Hosted structured issues | Linear database | Explicit workflow status; duplicate is a terminal outcome | Typed blocked-by, blocking, related and duplicate relations | Hosted application rules | Server transaction model | Hosted migration | Detailed rewrite/failure evidence not verified | [Primary](https://linear.app/docs/issue-relations) |
| Jira | Hosted issue records and configurable workflows | Jira database | Explicit status plus resolution; state changes require transitions | Parent/subtask, link and workflow relationships | Conditions, validators and post-functions | Server transaction model | Admin-managed workflow/schema changes | Flexible configuration can create confusing status/resolution combinations | [Primary](https://support.atlassian.com/jira-cloud-administration/docs/configure-advanced-issue-workflows/) |

**[inferred]** The strongest recurring patterns are: file-per-record beats one shared ledger for Git concurrency; generated views are safe only when every reader treats them as noncanonical; explicit transitions outperform existence- or wording-based closure; agent instructions alone do not enforce invariants; and Markdown becomes dangerous when lifecycle semantics depend on headings, checkboxes or marker syntax.

## 3. **Format comparison matrix.**

Scores are **[inferred]**: 5 is best for Signal’s requirements.

| Option | Git diff/merge | LLM read/write | Human readability | Validation | Query speed | Corruption risk |
|---|---|---|---|---|---|---|
| Markdown + frontmatter per record | **4/5** — file isolation is good, but YAML/Markdown boundaries create ambiguity | **4/5** — natural, but agents may alter syntax | **5/5** | **3/5** — prose semantics remain weak | **2/5** | **3/5** — duplicate facts and direct edits remain possible |
| JSON per record | **4/5** — conflicts localized | **4/5** tool-mediated | **3/5** | **5/5** | **3/5** | **4/5** — malformed writes fail parsing |
| YAML per record | **4/5** | **3/5** — indentation and implicit types add risk | **4/5** | **4/5** | **3/5** | **3/5** |
| One JSON/YAML aggregate | **1/5** — all writers touch it | **3/5** | **3/5** | **5/5** | **4/5** | **2/5** — conflict resolution can discard records |
| JSONL append-only log | **2/5** — branch appends conflict at EOF | **3/5** | **3/5** | **4/5** per event | **2/5** without index | **3/5** |
| One immutable JSON file per event | **5/5** | **3/5** direct, **5/5** via CLI | **3/5** | **5/5** | **2/5** raw, **5/5** indexed | **5/5** — immutable, hashable, replayable |
| SQLite committed as canonical | **1/5** — binary merge | **1/5** direct | **1/5** direct | **5/5** | **5/5** | **4/5** locally, poor Git conflict recovery |
| SQLite as ignored cache | **5/5** | **5/5** via API | **2/5** direct | **5/5** | **5/5** | **5/5** if fully rebuildable |
| Dolt | **3/5** — table-aware merge | **2/5** | **2/5** | **5/5** | **5/5** | **4/5**, but adds a second VCS |
| Structured canonical files + generated Markdown | **5/5** | **5/5** | **5/5** | **5/5** | **5/5** with index | **5/5** when projections are disposable |

**[inferred] Recommendation:** canonical JSON entity/event files, narrative Markdown as a separate payload, generated Markdown views, and ignored SQLite. Do not use a committed SQLite database, Dolt, or a single JSONL ledger for Signal’s scale and deployment constraints.

## 4. **Proposed architecture.**

The proposed design is **[inferred]**, except where implementation mechanisms are linked to primary documentation.

### **Canonical data model: entities, fields, relationships and state machines.**

Use three canonical object classes:

1. **Entities** establish identity and immutable origin.
2. **Events** make all structured lifecycle mutations.
3. **Narratives** hold prose that cannot determine lifecycle state.

Entity fields include `apiVersion`, `kind`, stable `id`, `projectId`, creation actor/time, immutable initial values, narrative reference, and import provenance. Do not include independently editable `status`, folder-derived state, path-derived parentage, or duplicated narrative summaries.

Use a unified `WorkItem` supertype with `workType` values such as `bug`, `capture`, `question`, `backlog`, `milestone`, `epic`, `slice`, and `task`. Use separate record kinds for `Decision`, `Requirement`, `Verification`, `Review`, `Retrospective`, `Release`, `Evidence`, `ProjectSession`, and `NarrativeEntry`.

Each lifecycle event records `eventId`, `entityId`, `eventType`, actor, occurrence time, expected prior revision, transition payload, evidence, and policy evaluation. Event families include classification, relation changes, triage, start, block/unblock, review readiness, close request, close, reopen, supersession, artifact acceptance, and migration-assertion confirmation/rejection.

Current state is a deterministic fold of an entity’s ordered event set through a versioned state machine. A derived projection may cache status only if it stores the source-event digest and can be reproduced exactly. State machines and guarded transitions follow the conventional finite-state model documented by [XState](https://stately.ai/docs/machines).

Use distinct state machines for intake, delivery, questions, decisions, requirements, retrospectives, and releases. JSON Schema validates event shape and conditionally required fields through `if`/`then`/`else` and dependent schemas; see the [JSON Schema conditional-validation reference](https://json-schema.org/understanding-json-schema/reference/conditionals).

Relationships are typed objects or events: `contains`, `member_of`, `depends_on`, `blocks`, `implements`, `verifies`, `evidence_for`, `supersedes`, `duplicate_of`, `released_in`, `derived_from`, and `discusses`. Epic membership remains optional; folders never establish membership.

### **Physical storage layout.**

```text
.planning/
├── signal-store.json
├── store/
│   ├── entities/<kind>/<shard>/<id>/
│   │   ├── entity.json
│   │   └── content.md
│   ├── events/<entity-id>/<event-id>.json
│   └── relations/<shard>/<relation-id>.json
├── policy/
│   ├── state-machines/
│   ├── gates/
│   └── policy-lock.json
├── migrations/
│   ├── receipts/
│   ├── source-manifests/
│   └── unresolved/
├── narrative/project-journal.md
├── views/
│   ├── STATE.md
│   ├── BACKLOG.md
│   ├── BUGS.md
│   ├── ROADMAP.md
│   ├── DECISIONS.md
│   └── epics/...
└── legacy/...

.planning/.cache/             # gitignored
└── signal.sqlite
```

Status never determines path. Each event is a separate immutable file, avoiding a shared JSONL append point. The whole `views/` tree is generated. Project narrative is separate from generated `STATE.md`. SQLite is disposable and rebuildable.

SQLite provides transactions and concurrent readers but permits only one simultaneous writer, which suits a local cache rather than distributed Git writes; see [SQLite transactions](https://www.sqlite.org/lang_transaction.html). WAL introduces auxiliary files, reinforcing the case for ignoring the cache; see [SQLite WAL](https://sqlite.org/wal.html).

### **Write path: who may write what, and how each write is validated.**

Canonical structured data may be written only through Signal CLI/library/MCP operations such as `create`, `classify`, `link`, `transition`, `close`, `decide`, and `migrate`. Agents may directly edit only designated narrative files.

A write acquires one short non-nested repository lock, checks the expected revision, validates schema, resolves IDs, verifies graph invariants, runs the state machine and gates, writes into a temporary directory, replays the entity, atomically renames files, updates the cache, regenerates views, and validates the complete store.

A pre-commit hook runs changed-object validation; CI validates the full store, rebuilds SQLite from zero, regenerates views, and fails on projection diffs. Hooks are convenience, not the only enforcement point.

### **Read path: how every tool queries the data. No tool parses rendered views.**

All consumers use a single API:

```js
store.get(id)
store.query({ kind, state, relation, text })
store.history(id)
store.explainState(id)
store.evaluateGate(gate, id)
store.resolveReference(ref)
```

The library uses SQLite only when its source digest matches the canonical store; otherwise it rebuilds or replays canonical files. Remove legacy Markdown parsers from production exports, ban renderer imports in domain readers, statically detect reads from `.planning/views`, and test that corrupting/deleting views cannot change canonical query results.

### **Generated human views.**

Generate concise Markdown for `STATE`, roadmap, backlog, bugs, Epic summaries, decisions, and event histories. Every file carries a generated warning, source digest, and regeneration command. Build views into a temporary directory and replace the set only after validation. Generated files may be committed for readability but are never queried as data.

### **Gates: where deterministic rules sit and where an LLM judge sits.**

Use three deterministic layers:

1. JSON Schema for shape, types, enums, and conditional presence.
2. Typed state machines for allowed transitions and pure guards.
3. Domain policies for graph rules, readiness, closure proof, and membership.

CUE can validate JSON with expressive constraints, but adding a Go/CUE runtime is likely unjustified initially **[inferred]**; see [CUE and JSON](https://cuelang.org/docs/concept/how-cue-works-with-json/). OPA/Rego has strong policy separation and decision logging, but also adds a runtime; Signal should initially copy OPA’s decision-envelope pattern rather than embed OPA. See [OPA bundles](https://www.openpolicyagent.org/docs/management-bundles).

Jev must be a proposer, never the mutator. Record its verdict, confidence, evidence IDs, model/version, prompt-template hash, input-bundle hash, response hash, and timestamp. A deterministic gate validates that envelope, verifies evidence and graph constraints, applies confidence/approval policy, and fails closed when the judge is unavailable. LLM evaluations are auditable but not exactly reproducible.

### **References: how one record points to another.**

Use stable `signal://<project-id>/<kind>/<entity-id>` URIs, optional stable section IDs, and independently identified typed links. Use content hashes for exact immutable content and commit SHA + path + line hint + symbol/content anchor for source evidence.

GitHub permanent links bind a path and line range to a specific commit, while Software Heritage IDs demonstrate content-addressed references with contextual qualifiers. See [GitHub permanent links](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files) and [Software Heritage persistent identifiers](https://docs.softwareheritage.org/devel/swh-model/persistent-identifiers.html). Line numbers are hints, never identity.

## 5. **Failure-class check.**

Assessments are **[inferred]**.

| Failure class | Result | Mechanism |
|---|---|---|
| 1. Status inferred from wording | **Impossible for canonical state** | Status is a pure fold of validated events; prose cannot transition an entity. |
| 2. Markdown parsed by regex | **Impossible for lifecycle data; reduced elsewhere** | Domain readers consume JSON/API only. Narrative parsing cannot change state. |
| 3. Two derivations drift | **Impossible for canonical reads** | Event set is authoritative; SQLite and Markdown projections carry source digests and rebuild checks. |
| 4. Closure inferred from artifacts | **Impossible** | Only a valid `work.closed` event closes work; artifacts are evidence. |
| 5. Machine ledger mixed with narrative | **Impossible** | Structured entity/event files and narrative Markdown are physically separate. |
| 6. Maintainer-specific repo assumptions | **Reduced substantially** | Epic membership is optional; adapters import heterogeneous shapes into one canonical model. |
| 7. Generated files clash with hand-edited files | **Impossible by contract; detectable operationally** | Generated tree is marked, hashed, regenerated, and never read canonically. |
| 8. Layout migrations break readers | **Reduced substantially** | Readers resolve IDs through the store API; `apiVersion` controls decoding. |
| 9. Many writers, few files, nested locks | **Reduced substantially** | Independent event files and a short non-nested lock; semantic conflicts are explicit. |
| 10. IDs and `path:line` drift | **Reduced substantially** | Stable IDs, typed links, hashes, anchors, and commit-pinned evidence replace live lines. |
| 11. Structured store re-parsed from rendered Markdown | **Impossible** | Renderer has no domain read API; architecture tests prove views are disposable. |
| 12. Decisions/rationale/user choices lack schema/home | **Reduced substantially** | Dedicated decision/choice records structure outcomes and actors; rationale stays in one attached narrative. |

Two branches can still make locally valid but mutually incompatible transitions. Validation must report both event IDs and require explicit reconciliation; silently selecting one would recreate the defect class.

## 6. **Migration plan.**

The migration plan is **[inferred]**. It follows the API-evolution principle of decoding old persisted versions until migration is proven and requiring lossless round trips, as described in [Kubernetes storage versions](https://kubernetes.io/docs/concepts/overview/working-with-objects/storage-version/) and its [deprecation policy](https://kubernetes.io/docs/reference/deprecation-policy/).

### Compatibility foundation

1. Add the new store library, schemas, reducer, validators, and renderer without changing existing projects.
2. Keep old readers behind a `legacy` adapter.
3. Add a read-only inventory command that reports every source file, parsed candidate, unparsed fragment, duplicate ID, contradiction, and hash.
4. Add fixture repositories covering all known layouts and adversarial Markdown.
5. Ensure the plugin reads old and new stores before any migration writes.

### Dry-run importer

```text
signal migrate plan
signal migrate import --dry-run
signal migrate verify --dry-run
```

The importer writes only to temporary storage. Every object receives a stable ID, original source path/hash, source fragment or raw copy, adapter/parser version, field-level mapping, warnings, and an unresolved record for every unparsed fragment.

Normalize once at import into one canonical schema, while preserving source proof and unresolved material. Do not support heterogeneous canonical shapes at runtime.

### Historical closure

Do not automatically convert the 142 inherited “closed” verdicts into close events. Import them as pending migration assertions. Confirm only those with unambiguous evidence; put contradictory and unprovable cases into explicit review queues. The ten frontmatter/body contradictions must never be resolved by silently preferring one representation.

### Repository rehearsal

For the maintainer repository and each heterogeneous repository:

1. Create a migration branch from main.
2. Manifest every `.planning/` path and hash.
3. Import into a new directory without modifying source files.
4. Verify counts and source coverage.
5. Verify every source fragment is mapped, preserved, or unresolved.
6. Validate IDs, references, graph constraints, and replay.
7. Rebuild SQLite from empty.
8. Generate views from canonical data.
9. Compare old and new query results, treating mismatches as findings.
10. Run Signal and repository smoke tests.
11. Produce a receipt with source commit, manifest hash, target digest, tool version, and findings.
12. Review contradictions and samples.
13. Merge with a merge commit only after verification.

### Activation and rollback

Activation must be explicit, changing only a small store pointer after a verified receipt. All new writes then use the event store; legacy files remain preserved. Later, legacy files can move wholesale into an archive commit, while old filenames become generated compatibility views.

Rollback reverts the activation merge commit or switches the pointer back to `legacy`, deletes the ignored cache, and preserves all new-store files and receipts for diagnosis. Do not write a reverse migration into the old prose format; it would be lossy and recreate dual writes.

### Verification invariants

Migration succeeds only when source hashes are preserved; every byte is mapped, retained, or flagged; IDs are unique; references resolve or are explicitly unresolved; replay is deterministic; re-import is idempotent; cache/view rebuilds preserve results; a second dry run is empty; compatibility works during rollback; and no closed state exists without a valid close event.

## 7. **Risks and open questions.**

### Principal risks

- **Event-store complexity:** More code than mutable records; control it with a small event vocabulary and replay tests.
- **Semantic conflicts:** Independent files expose real concurrent-transition conflicts; reconciliation UX must be strong.
- **Event ordering:** Wall-clock timestamps cannot establish causality; use expected revisions and parent-event references.
- **Policy sprawl:** Start with declarative configuration plus named pure TypeScript predicates before considering CUE/Rego.
- **LLM trust:** Confidence is not calibrated truth; Jev proposes and high-impact decisions need deterministic/human approval.
- **Generated-file habits:** Make CLI writes easier than direct editing and reject hand edits clearly.
- **Bypassable hooks:** Validate in every command and CI, not only hooks.
- **Close timing:** Model `close_requested` before merge and close only when required proof is reachable from main, or append merge evidence later under an explicit policy.
- **Automatic rollout:** Never auto-migrate merely because users track plugin `main`; activation must be explicit.

### Decisions to settle

- Human-readable IDs, ULIDs, or immutable IDs plus aliases.
- Whether narrative amendments require events or Git history is sufficient.
- Whether generated views remain committed.
- Which transitions require human approval.
- Compatibility-decoder support window.
- Alias retirement policy.
- Exact release/closure proof requirements.

### Verification gaps

Code-level investigation was strongest for GSD, OpenSpec, Taskmaster, Superpowers, planning-with-files, oh-my-claudecode, gstack, Backlog.md, and Beads. git-bug, git-issue, Fossil, TaskWarrior, todo.txt, org-mode, and the ADR tools were not verified deeply enough to carry architectural weight.

“Curator-style knowledge-base tooling” was not a unique product identifier. The Jev API contract, calibration, retention, and model-version guarantees were unavailable; the judge envelope is therefore **[inferred]**.

## 8. **Sources.**

### Primary

- [GSD architecture](https://github.com/gsd-build/get-shit-done/blob/main/docs/ARCHITECTURE.md)
- [GSD `STATE.md` template](https://github.com/gsd-build/get-shit-done/blob/main/sdk/prompts/templates/state.md)
- [Agent Skills](https://github.com/addyosmani/agent-skills)
- [gstack](https://github.com/garrytan/gstack)
- [pm-skills](https://github.com/phuryn/pm-skills)
- [Superpowers](https://github.com/obra/superpowers)
- [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
- [planning-with-files](https://github.com/OthmanAdi/planning-with-files)
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)
- [Beads Dolt architecture](https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md)
- [Backlog.md](https://github.com/MrLesk/Backlog.md)
- [Taskmaster task structure](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/task-structure.md)
- [Spec Kit](https://github.github.com/spec-kit/)
- [Kiro specs](https://kiro.dev/docs/specs/)
- [OpenSpec concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [OpenSpec CLI](https://openspec.dev/docs/cli)
- [OpenSpec releases](https://github.com/Fission-AI/OpenSpec/releases)
- [BMAD sprint planning](https://docs.bmad-method.org/how-to/workflows/run-sprint-planning/)
- [JSON Schema conditionals](https://json-schema.org/understanding-json-schema/reference/conditionals)
- [CUE and JSON](https://cuelang.org/docs/concept/how-cue-works-with-json/)
- [OPA bundles](https://www.openpolicyagent.org/docs/management-bundles)
- [XState machines](https://stately.ai/docs/machines)
- [GitHub permanent links](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files)
- [Software Heritage identifiers](https://docs.softwareheritage.org/devel/swh-model/persistent-identifiers.html)
- [GitHub issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [GitHub issue-closing links](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- [Linear issue relations](https://linear.app/docs/issue-relations)
- [Jira advanced workflows](https://support.atlassian.com/jira-cloud-administration/docs/configure-advanced-issue-workflows/)
- [Dolt Git-for-data](https://www.dolthub.com/docs/introduction/getting-started/git-for-data/)
- [Dolt schema migrations](https://www.dolthub.com/blog/2024-04-18-dolt-schema-migrations/)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite WAL](https://sqlite.org/wal.html)
- [Kubernetes storage versions](https://kubernetes.io/docs/concepts/overview/working-with-objects/storage-version/)
- [Kubernetes deprecation policy](https://kubernetes.io/docs/reference/deprecation-policy/)

### Secondary

- [Archiving and Referencing Source Code with Software Heritage](https://pmc.ncbi.nlm.nih.gov/articles/PMC7340894/)
- [Kiro team guide, AWS Builder Center](https://builder.aws.com/content/39juiKF2uwxhek0RuYHhjf24JjL/kiro-the-complete-guide-for-teams)
