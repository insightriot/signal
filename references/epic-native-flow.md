# Epic-Native Flow — Reference

Signal runs in one of two modes. **Linear mode** is the default: one `calibrate → ship` pass, phase-named artifacts (`1-PLAN.md`, `REQUIREMENTS.md`), a single project `PROFILE.md`. **Epic mode** makes Milestones → Epics first-class: each Epic runs its own `discuss → ship`, writes Epic-scoped artifacts (`{EpicID}-PLAN.md`), and may carry its own tier. Epic mode is **opt-in and additive** (M4.5.E11) — a project with no active Epic behaves byte-identically to pre-E11, and no existing linear project is migrated.

The signal that selects the mode is a single STATE field: `current_epic`.

---

## Mode detection

`detectMode(state)` (`tools/lib/state.js`) is the sole mode signal:

- A **strict** `current_epic` — matching `EPIC_ID_STRICT_RE = /^M\d+(\.\d+)*\.E\d+$/` (e.g. `M4.5.E11`, `M5.E1`) → **`'epic'`**.
- `null` / absent / empty / whitespace / a non-strict value (a version string like `v0.1.6`, a bare milestone `M4.5`, garbage) → **`'linear'`**.

`detectMode` is pure and **fail-open**: it never throws. A hand-edited garbage `current_epic` degrades to linear rather than crashing a read path. Every other Epic-mode consumer uses the same strict shape and the same fail-open posture, so a malformed STATE never breaks `/sig:resume` or `/sig:status`.

## Epic creation & the `current_epic` write-half (FR1)

Epics are opened with the additive `--epic <name>` flag on `/sig:discuss` and `/sig:new-project` — no new required command, so the install contract (`REQUIRED_COMMANDS`) is unchanged.

- If `<name>` is already a strict Epic ID (e.g. `M5.E1`, opening a new milestone), it's used verbatim.
- Otherwise `<name>` is a human label and the ID is **derived**: `deriveNextEpicId(baseDir)` (`tools/lib/milestones.js`) scans existing `M*.E*-*.md` artifacts + STATE for the max `E{N}` under the current milestone and returns the next strict ID (`M4.5.E11` latest → `M4.5.E12`).

The resolved ID is written by `setCurrentEpic(baseDir, epicId)` (`tools/lib/state.js`) — **no hand-editing STATE**. It re-validates the strict shape before touching disk, and on an open/roll atomically resets the coupled in-flight fields `current_wave: null` + `current_tasks: []` under the same lock (this also covers the abandon case). Setting the already-active id is an idempotent no-op that leaves coupled fields untouched.

**Close = roll-on-open, never clear to null.** Opening the next Epic rolls `current_epic`. The done-signal is the existence of `{EpicID}-RETROSPECTIVE.md` (`isEpicDone`, `tools/lib/retrospective.js`) — **not** `phase = SHIP` (Signal never moves SHIP into `completed_phases`). A writing command against a *done* Epic with no `--epic` **errors, requiring `--epic`**, so a completed Epic's artifacts are never clobbered. There is no `clearCurrentEpic` — the roll-on-open semantics give it no caller.

## Epic-scoped artifact naming (FR2)

`artifactName(artifact, { currentEpic })` (`tools/lib/resume.js`) names what a phase command **writes**; `resolveArtifactPath(planningDir, artifact, { currentEpic, phase })` resolves what it **reads**. They are symmetric — whatever `artifactName` emits, `resolveArtifactPath` with the same opts resolves back.

| Mode | Naming |
|---|---|
| **Epic** (strict `currentEpic`) | `{EpicID}-{ARTIFACT}.md` for all kinds (e.g. `M4.5.E11-PLAN.md`) |
| **Linear** | `1-{ARTIFACT}.md`, **except** `REQUIREMENTS` → unprefixed `REQUIREMENTS.md` |

Carve-outs, so the names match what the commands actually write:

- **`REQUIREMENTS`** is unprefixed in linear mode (`REQUIREMENTS.md`, as `discuss.md` writes it). Emitting `1-REQUIREMENTS.md` here would fork every existing linear project — this is FR4 byte-identity, not cosmetics.
- **`CONTEXT.md`** is a project-level running doc and is **never** Epic-prefixed, in either mode. It is not one of the eight Epic-scoped artifact kinds.
- **`RETROSPECTIVE`** has one owner: in Epic mode `artifactName` agrees byte-for-byte with `deriveRetroPath(currentEpic)` (`{EpicID}-RETROSPECTIVE.md`); in linear mode the retrospective is milestone-scoped and written by `ship` via `deriveRetroPath`, **not** `artifactName`.

`artifactName` uses the strict Epic-ID shape, so a non-strict `currentEpic` fails open to linear naming (never `v0.1.6-PLAN.md`), consistent with `detectMode`.

## Per-Epic calibration (FR3)

An Epic can carry its own tier that overrides the project PROFILE **for that Epic's phases only**. Storage is a whole-file shadow: `.planning/{EpicID}-PROFILE.md` (a complete, standalone PROFILE — no merge, no `schema_version` bump, no STATE field).

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`) composes it:

- strict `currentEpic` **and** `{EpicID}-PROFILE.md` exists → the Epic PROFILE (validated; malformed *content* throws `ProfileSchemaError`);
- otherwise → the project `.planning/PROFILE.md` (byte-identical to `readProfile` — the linear / no-override path).

It is **fail-open on the STATE value**: a null / non-strict `current_epic` skips the Epic probe and falls back to the project PROFILE — it never throws on `current_epic` itself. (This is distinct from a *malformed Epic PROFILE file that exists*, which throws.) When neither PROFILE exists, the project-path read throws the same "not found" error a linear command already surfaces, so command halt copy is unchanged.

**Every phase command's first action reads the effective profile**, and passes it to its rigor consumers — so a SKETCH Epic inside a FULL project genuinely runs its phases at SKETCH (e.g. `dispatchTaskWithState` keys the auto-state-protocol off `profile.tier`). `/sig:calibrate` and `/sig:escalate` target `.planning/{EpicID}-PROFILE.md` when an Epic is active (R10), leaving the project PROFILE untouched.

**Shadowing is never silent.** `formatTierLine({ effectiveTier, projectTier, currentEpic })` (`tools/lib/status.js`) renders the tier line in `/sig:status` and `/sig:resume`. When a strict Epic's effective tier differs from the project default it reads `SKETCH (Epic M4.5.E11 override; project default FULL)`; otherwise the bare tier (linear / same-tier / non-strict → no phantom override).

## The two-tier retro coupling (B2)

Retro enforcement lives on two paths with **different** strictness, by design:

1. **The STATE-write hook** (`checkProposedStateWrite`, fired by `hooks/check-state-write.js` on *arbitrary* STATE edits — the stranger blast-radius surface) → **warn, non-blocking** (exit 0 + stderr), and throw-safe (a malformed `current_epic` can't crash it). Hooks nudge on process; they don't hard-block an editor's own STATE write.
2. **The command gate** (`shipFR1Check` via `ship.md` §0.5, fired *only* when you run `/sig:ship` on an Epic close) → **retained hard gate** (E9's SHIP contract). Running the workflow command opts you into its documented retro step.

Rationale: a hook firing in someone else's repo should never block them, but invoking `/sig:ship` is opting into its contract.

## Back-compat guarantee

- **Linear mode is byte-identical to pre-E11.** A project with `current_epic: null` writes/resolves `{phase}-*.md`, reads the project PROFILE, and shows a bare tier line — proven by the linear golden fixture (`tests/fixtures/epic-native/linear/`) and the full suite passing with no fixture edits.
- **No migration of existing linear projects.** Epic mode is entered only by an explicit `--epic`. Nothing auto-converts.
- **No `schema_version` bump.** Per-Epic tier rides in a separate PROFILE file, not a new STATE field.

## Related

- `references/state-schema.md` — STATE.md frontmatter (`current_epic`, `current_wave`).
- `references/profile-schema.md` — PROFILE.md format (identical for project and Epic PROFILEs).
- `references/tier-definitions.md` — the four tiers + tier-to-defaults.
- `references/hooks-api.md` — the STATE-write hook contract.
