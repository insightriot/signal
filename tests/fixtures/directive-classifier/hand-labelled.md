---
name: fixture
description: "Frontmatter is excluded — Call `readState(baseDir)` here must not count."
---

# Heading lines are not directives

This file is the hand-labelled fixture for the FR5 ceiling classifier (AC5.1).

Every line that the classifier should treat as a **directive** carries a trailing
`<!-- label: ... -->` comment stating its expected class. Trailing HTML comments are
stripped before classification, so a label cannot leak into detection; the test
asserts that stripping separately.

Labels: `measurable:lib-call` · `measurable:artifact-write` · `unmeasurable`
Lines with no label are expected to be classified as **not a directive**.

## Trace-measurable — names a real tools/lib export

- Call `readState(baseDir)` to load the current state. <!-- label: measurable:lib-call -->
- Before any Workflow step, call `transitionPhase(baseDir, 'EXECUTE')`. <!-- label: measurable:lib-call -->

| Task | What | AC |
|---|---|---|
| **S2.t1** | Always route the write through `atomicWrite(dest, body)`. | AC1.1 | <!-- label: measurable:lib-call -->

## Trace-measurable — writes a named artifact

- Write the result to `.planning/PROGRESS.md` when the wave closes. <!-- label: measurable:artifact-write -->
- Append the confirmed entry to `BUGS.md`. <!-- label: measurable:artifact-write -->

## Not trace-measurable — the co-occurrence false positives

- Every test must carry a documented "failed before fixed" record. Two evidence forms are valid, and the verdict eventually lands in `VERIFICATION.md` once the phase closes. <!-- label: unmeasurable -->
- Captures accumulate in `ISSUES-INBOX.md` between passes, so they do not rot in a write-only file. <!-- label: unmeasurable -->

Both lines pair a write-verb token with a real artifact name and are **not** artifact
writes. The first is the noun *record* separated from `VERIFICATION.md` by a sentence
boundary; the second is the adjective *write-only*, with the artifact named **before**
the token. Nine of the corpus's twenty-five original artifact-write hits were this
shape, which is why the rule requires the verb to precede its artifact closely rather
than merely share a line with it.

## Directive, but no observable trace

- Surface ambiguity rather than resolving it silently. <!-- label: unmeasurable -->
- You must never rationalize a skipped test. <!-- label: unmeasurable -->
- Do not refactor code outside the scope of the change. <!-- label: unmeasurable -->
1. Read the plan and confirm each task carries acceptance criteria. <!-- label: unmeasurable -->
- Always call `notARealFunctionName(x)` before continuing. <!-- label: unmeasurable -->
- If the current tier skips this phase, exit early. <!-- label: unmeasurable -->
- Descriptive prose that merely mentions what agents must do still counts here. <!-- label: unmeasurable -->

The `notARealFunctionName` line is the discriminating case for the library-call rule:
it is shaped exactly like a call directive, and is **not** measurable, because the
identifier is not an actual export of `tools/lib/`. The rule resolves against the real
export set rather than trusting the shape.

The `If the current tier skips` line covers Stage A1's clause extension — a directive
whose imperative verb sits after a leading condition.

The last line is deliberate, not an accident: Stage A2 fires on the obligation word
regardless of whether the sentence commands or merely describes. That over-counts the
denominator, which makes the published measurable fraction **smaller** than a
narrower rule would produce. Erring toward a smaller ceiling is the honest direction.

## Not directives

This paragraph merely describes behavior and instructs nobody.

> A block quote is commentary, not an instruction to the agent.

```js
// A fenced code block is excluded wholesale, even though it calls readState(baseDir)
// and writes to `.planning/STATE.md`.
await readState(baseDir);
```

---
