# Question Patterns

How Signal commands ask the user for input. The goal: reduce decision fatigue, surface tradeoffs explicitly, prevent drift across commands, and let Claude improvise *consistently* rather than freshly each turn.

This doc is consumed by command authors when writing or editing any command that asks the user a question. The convention is **strongly recommended** — see "Strictness convention" below for what that means in practice.

---

## Why this matters

When commands ask questions inconsistently, three things break:

1. **Decision fatigue.** Open-ended questions ("how should we handle this?") force the user to generate options before choosing. Closed-form questions with named options ("A, B, or C — which fits?") let the user evaluate, not invent.
2. **Drift across commands.** Without a shared pattern, two phase commands may ask similar questions in incompatible shapes. The user re-learns the question grammar each time.
3. **Implicit recommendations.** Without a structured "make a recommendation, then ask," Claude either over-defers (every choice presented as equal) or under-defers (the recommendation is hidden). Neither is signal.

Signal's pitch is *signal vs. noise at every phase.* Consistent question patterns are part of the signal.

---

## The three patterns

Signal recognizes exactly three question shapes. Every user-facing question must fit one of them.

### 1. Strict enum

**Use when.** The answer must be one of a small fixed set of values that downstream code parses literally. No "other" is valid because the schema or validator will reject it.

**Examples in Signal today.**
- `/sig:calibrate`'s 5 diagnostic questions (`scope: throwaway | feature | subsystem | product`, etc.) — values feed `PROFILE.md` schema validation.
- Phase names — must be one of `CALIBRATE | DISCUSS | PLAN | EXECUTE | VERIFY | REVIEW | SHIP`.
- Tier names — must be one of `SKETCH | FEATURE | SPIKE | FULL`.

**Shape.**

```
Question — one-line ask.

Pick one:
- `value-1` — what it means
- `value-2` — what it means
- `value-3` — what it means
- `value-4` — what it means
```

**Rules.**
- No "other." If the user's answer doesn't match an enum, **restate the question** — don't accept free-text.
- Always show all valid values. Don't truncate.
- Always show what each value means. The enum value alone (`subsystem`) isn't enough context.

---

### 2. 3-options-plus-other (the default for tradeoff questions)

**Use when.** The answer is a genuine choice between viable approaches with real tradeoffs, and the user is the right decider. Most architecture / approach / scope questions fit here.

**Examples in Signal today.**
- `/sig:discuss` step 4 — gray-area decisions (monolith vs. services, framework choice, etc.).
- `/sig:plan` (forthcoming) — approach selection where multiple paths are viable.

**Shape.**

```
Question — one-line ask.

Three options:

A. {name}
   {one-line description}
   Pick this if: {trade-off / scenario}

B. {name}
   {one-line description}
   Pick this if: {trade-off / scenario}

C. {name}
   {one-line description}
   Pick this if: {trade-off / scenario}

Recommendation: {A | B | C}, because {one-line rationale}.

If none of these fit, describe what you'd prefer and I'll work from there (your reasoning will be captured for context).
```

**Rules.**
- **Always exactly three options + "other."** Two feels binary and forces false dichotomies; four+ is back into decision fatigue. If you genuinely have only two viable options, force a third (e.g., "do nothing for now") so the user sees the do-nothing tradeoff explicitly.
- **Always make a recommendation.** Hiding the recommendation is failing to use the model's signal. The user can override; that's fine.
- **The "other" branch always accepts free-text.** Capture the user's reasoning verbatim in the relevant `.planning/` artifact (CONTEXT.md, DECISIONS.md, etc.). Future phases need to see *why* the user went off-pattern.
- **Each option's "Pick this if:"** must name a real trade-off — not "you want quality" (everyone does) but "you'll trade longer initial setup for faster iteration later."

---

### 3. Open-ended

**Use when.** Clarifying genuinely unknown user intent that no pre-formed option set could anticipate. Reserved for the *opening* of a workflow, not the middle.

**Examples in Signal today.**
- `/sig:new-project` step 2 — "What are you building?", "What's the target audience?", "What does done look like?"
- `/sig:escalate` — "What's changed since calibration that brought you here?"

**Shape.**

```
Question — one-line ask, possibly with a brief framing.
```

**Rules.**
- **Justify in a comment in the command markdown** if you use this pattern outside `new-project` / `escalate` / phase openings. Document why no enum or 3+other fits.
- **Always capture the answer verbatim** — open-ended answers are the source material for downstream work, not transient clarifications.
- **Don't ask multiple open-ended questions in a row** without summarizing back. After 2–3 open-ended questions, restate what you heard so the user can correct misunderstandings before they propagate.

---

## Decision tree — which pattern does this question need?

```
Is the answer schema-validated to a fixed enum?
├── Yes → STRICT ENUM
└── No
    │
    Is the question a tradeoff between viable approaches?
    ├── Yes → 3+OTHER (the default)
    └── No
        │
        Is the question opening a workflow / clarifying unknown intent?
        ├── Yes → OPEN-ENDED (justify in comment)
        └── No → re-examine the question; it probably needs reshaping
```

---

## How to write 3+other options well

Three things to nail per option:

1. **Name** — short, distinct, self-evident. "Monolith with feature flags" beats "Option A."
2. **One-line description** — what this approach actually is, in one sentence. No marketing.
3. **"Pick this if" trade-off** — the *real* reason a thinking person would pick it. Must reference a concrete cost or benefit ("you accept slower iteration in exchange for stricter coupling guarantees"). Generic appeals ("if you value quality") aren't trade-offs.

**Anti-patterns to avoid:**

| Anti-pattern | Why it fails |
|---|---|
| Three options with the same trade-off framing | The user can't distinguish them |
| One "obvious right answer" + two strawmen | The user spots the manipulation; trust evaporates |
| Recommendation that contradicts the trade-off framing | Says "Pick A if speed matters" but recommends B for a project where speed matters — internal inconsistency |
| Forgetting to make a recommendation | Defers the synthesis the user invoked Signal for |
| "Other" without a free-text capture mechanism | The user goes off-pattern and the reasoning is lost — future phases re-litigate |

---

## How to handle "other" answers

When the user picks "other" (or none of A/B/C):

1. **Accept the free-text.** Don't push back unless the answer is incoherent.
2. **Capture verbatim.** Write the user's stated reasoning into the appropriate `.planning/` artifact:
   - DISCUSS gray-area decisions → `CONTEXT.md` "Locked Decisions" section.
   - Architectural decisions → `DECISIONS.md` (append-only).
   - Calibration overrides → `PROFILE.md` body.
   - Plan-level approach choices → `PLAN.md` "Approach" section.
3. **Surface to downstream phases.** The user's "other" answer becomes context for PLAN, EXECUTE, etc. Future Claude sessions need to see *why* the user went off-pattern.

Example capture:

```markdown
## Locked Decisions

3. **Architecture: hybrid monolith with extracted auth service.**
   User picked "other" over the three options (pure monolith, microservices, modular monolith).
   Rationale: "We need the deployment simplicity of a monolith for the core product
   but auth is shared across three downstream products built by other teams, so it
   has to live independently. Microservices everywhere would be over-rotation."
```

---

## Command-authoring checklist

Before merging a command that asks the user a question, verify:

- [ ] Every user-facing question fits exactly one of the three patterns.
- [ ] Strict enums show all values + meaning per value, and reject non-enum input.
- [ ] 3+other questions have exactly three named options, real trade-offs in "Pick this if," and an explicit recommendation.
- [ ] 3+other questions accept free-text via "other" and document where the reasoning gets captured.
- [ ] Open-ended questions are justified in a comment if used outside `new-project` / `escalate` / phase openings.
- [ ] Multi-question sequences either summarize back after 2–3 open-ended Qs OR are pure enum chains (e.g., calibrate's 5 questions, where the schema does the summarization for you).
- [ ] Anti-rationalization tables (where present) include rationalizations specific to question patterns ("the user is in a hurry, I'll skip the recommendation" → "no — make the recommendation, the user can override in one word").

---

## Strictness convention

These patterns are **strongly recommended, with explicit justification required for exceptions.**

In practice:

- **Strict enum** is mandatory wherever the schema or downstream parser requires a fixed value. (Non-negotiable — it's a correctness constraint, not a style choice.)
- **3+other** is the default for any tradeoff question. If a command uses open-ended where 3+other would fit, the command author must add a comment explaining why.
- **Open-ended** is the rare case, justified in-line.

The escape clause exists because real workflows have edge cases (the first "what are you building?" question, follow-up clarifications mid-3+other, etc.). Mandatory would be too rigid; "loose suggestion" would let drift creep back in. Strongly-recommended-with-justification is the middle path: default to the convention, document the exception.

---

## Design notes

- **Why three options, not two or four?** Two collapses to a binary that often hides a third path; users feel forced. Four-plus reintroduces decision fatigue and dilutes the recommendation. Three is the smallest number that gives "main path / alternative / fallback" and lets the user see the shape of the choice.
- **Why always make a recommendation?** Signal exists to convert noisy raw signal into actionable decisions. A 3+other question without a recommendation is the model abdicating that work back to the user. The recommendation can be wrong; that's why the user gets to override.
- **Why capture "other" reasoning verbatim?** Future Claude sessions can't reconstruct *why* the user went off-pattern from "user picked other." The reasoning becomes part of the project's institutional memory, the same way `.planning/` artifacts are.
- **Why not codify a 4-options-plus-other pattern?** Tested mentally against real Signal questions; couldn't find a case where the 4th option carried real signal not already in 3 + open-ended. Keeping the convention narrow makes drift detection easier.
