# The eval corpus

Signal's checks are tested against a set of **real projects of varying size, age and complexity** —
not synthetic fixtures. That set is the **eval corpus**, and it is what statements like *"this check
could evaluate 4 of 12 projects"* refer to throughout Signal's documents.

## Why it exists

Signal's own `.planning/` tree is not representative, and assuming it is has produced real defects.
`B82` is the clearest case: every unit in this repository is a strict Epic ID whose files really are
`{EpicID}-{SUFFIX}.md`, so a template-based mover and a derivation-based one agree **by
construction**. The bug lived only where unit names are *not* Epic IDs — 8 of 12 corpus projects —
so dogfooding here was structurally blind to it.

The corpus is therefore the answer to a specific question: **does this check work anywhere but
here?** `M5.E16` shipped six checks and measured that the two aimed at its originating incident could
evaluate **2 of 13** projects. That number is the finding; it could not have come from this repo.

## How corpus projects are referred to

**By anonymous, stable labels — `eval-project-A`, `eval-project-B`, and so on. Never by name.**

- The labels are **stable**: `eval-project-A` is the same project in every document that mentions it,
  so evidence stays traceable across releases.
- **No mapping is published**, here or anywhere else in this repository. The maintainer knows which
  is which; nothing else needs to.
- What *is* published is the **shape** that mattered — *"a project whose units are not Epic IDs"*,
  *"a project whose `STATE.md` cannot be parsed"*, *"a 529 KB state file"*. The shape is the
  evidence. The identity never was.

This repository is public and the corpus is a set of private commercial projects.
`tests/private-name-guard.test.js` enforces the rule rather than trusting it: a file naming a corpus
project fails the suite.

## How it is used

**Read-only, always.** Corpus runs measure; they never write to a corpus project, and no Signal
command is pointed at one — not even in dry-run, because a dry run is one typo away from `--apply`
and the downside is asymmetric. For exercising a command end-to-end there is
[`examples/sandbox/`](../examples/sandbox/README.md), a throwaway corpus built for exactly that.

**Every corpus measurement reports what it could NOT evaluate**, by count and reason. A check that
runs against twelve projects, reports findings from four, and says nothing about the other eight
reads as a clean bill of health for all twelve. That is `B39`'s shape, and it is the failure the
corpus exists to prevent rather than reproduce.
