# Requirements

Project-scoped: every phase's requirements live in this one file. Structure and ID inventory are
carried from a real artifact; all copy is written for this fixture. See `README.md`.

## Functional Requirements

### FR-1 — Record management

- AC-1.1: Records can be created, listed, edited and archived.
- AC-1.2: An archived record is excluded from the default list view.
- AC-1.5: A record's audit trail survives an archive/restore round trip.

### FR-5 — Third-stage lookup

- AC-5.6: A lookup returning zero rows is reported as zero, never as an error.

### FR-6 — Fourth-stage enrichment

- AC-6.6: An enrichment provider timeout degrades the row, not the run.

### FR-7 — Generation step

- AC-7.1: Every generated item records the model and the cost that produced it.
- AC-7.8: A generation exceeding its budget is marked and skipped, not truncated.
- AC-7.16: One structured log line per item processed.

### FR-10 — Scorecard

- AC-10.1: The scorecard totals match the underlying rows.
- AC-10.2: A partial run scores what completed and says what did not.

### FR-15 — Second operating mode

- AC-15.1: The second mode is selectable per run and recorded on the result.
- AC-15.5: Mode selection is resolved in code, from structured inputs only.

### FR-16 — Authoring layer

**Scope + model (added at DISCUSS).** An operator-facing layer for authoring content, structure and
tone. Sequenced engine-first — the Phase-10 stage-four engine, reshaped per AC-15.5 to consume
structured direction — then a subsequent authoring-UI phase (Phase 11) on top. The ACs immediately
below are the DISCUSS-locked framing; the detailed UI-spec ACs are finalized at Phase 11's own
DISCUSS.

- AC-16.1: Structured inputs only — no free-text passthrough to the generator.
- AC-16.2: A guide-and-preview loop; variant, A/B and URL handling are deferred.
- ~~AC-16.3 (bounded tone controls)~~ — **DEFERRED out of Phase 11.** The principle stands and
  remains binding whenever controls land: a fixed, enumerated set mapping to pre-vetted rule
  variants, never a raw text box. Only the timing moved — one variant ships today, so a control now
  would be a one-entry dropdown. Returns as its own phase once a second variant exists.
- AC-16.4: Direction persists on the template row; per-item selection stays automatic.
- AC-16.5: Existing validation is untouched by this layer.

**Detailed UI-spec ACs (added at Phase 11's own DISCUSS).** The framing ACs above are direction;
these are the buildable spec.

- AC-16.6: The authoring form loads existing direction and shows unsaved-change state.
- AC-16.7: Preview renders from the same code path the run uses, never a second renderer.
- AC-16.8: The form is reachable from the unit detail view and from the run summary.
- AC-16.9: An empty direction is a valid state and renders as "none set".
- AC-16.10: The save action enforces the schema — non-empty after trim, bounded length — and
  surfaces a validation failure in the form. It never silently truncates, never stores an over-long
  value, and never stores a whitespace-only one.
- AC-16.11: Saving is idempotent; a repeated save writes no new revision.

### FR-17 — Pipeline hardening

- AC-17.1: The fourth stage runs off the batch worker.
- AC-17.5: A real-volume first-to-fourth-stage run completes without manual intervention.

### FR-18 — Strategy layer

- AC-18.1: Candidate lifecycle is explicit — proposed, active, retired.

## Non-Functional Requirements

### NFR-3 — Reliability

- NFR-3.4: A failed stage is retryable without duplicating completed work.
- NFR-3.5: Partial failure is visible in the run summary.

### NFR-4 — Observability

- NFR-4.1: Every run emits a structured summary line.

### NFR-5 — Security

- NFR-5.5: Operator secrets are asserted present and well-formed before a live run.
- NFR-5.6: A public webhook route validates its payload shape before doing any work.

### NFR-8 — Schema-as-code

- NFR-8.1: Schema changes ship as migrations, never as manual edits.
- NFR-8.2: A migration is reversible or documents why it is not.
- NFR-8.3: The generated types are checked in and verified in CI.

### NFR-9 — Phase 11 authoring-layer ops hygiene

The FULL-tier non-functional pass, run explicitly at Phase 11's DISCUSS. Each item below is
in-scope, deferred with a reason, or marked not-applicable.

- NFR-9.1: The authoring form is keyboard-navigable and labelled.
- NFR-9.2: The write path is rate-limited per operator.
- NFR-9.3: Direction content is escaped at render, in preview and in the live path alike.
- NFR-9.4: An authoring save is audit-logged with actor and timestamp.
- NFR-9.5: The form degrades to read-only when the operator lacks write scope.

### NFR-10 — Phase 13 strategy-layer ops hygiene

The FULL-tier non-functional pass for the strategy layer. Scope note: this pass **reuses the
rate-limiting decision made for the authoring layer in Phase 11** (NFR-9.2) rather than re-deciding
it, and inherits NFR-9.1's accessibility baseline unchanged. Where an item below restates a Phase 11
conclusion it is marked as inherited.

- NFR-10.1: Candidate lists are paginated at the query, not in the client.
- NFR-10.2: A strategy run is cancellable and leaves no partial writes.
- NFR-10.3: Inherited from NFR-9.1 — the strategy views meet the same accessibility baseline.
- NFR-10.4: Inherited from NFR-9.2 — the strategy write path reuses the authoring rate limit.
- NFR-10.5: Strategy outputs record which candidate and which brief produced them, per AC-18.1 and
  FR-18, and are reconciled against AC-1.5's audit trail.
