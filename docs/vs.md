# When to use Signal (and the tools it's built from)

Each project below is an excellent tool, and Signal is built from them with real respect. A hammer, a screwdriver, a drill — nothing wrong with any of them. But building a house takes more than one tool, and it takes knowing which to reach for and how much. Signal is the toolbox.

## Reach for Signal when…

…you want a best-practices workflow under one roof — and you want it *right-sized* to the job.

The honest gap in the projects below isn't quality; it's that assembling them yourself is real work. You'd take GSD's execution engine, bolt on Agent Skills' quality gates, graft in superpowers' discipline and planning-with-files' context habits — and then, every single time, decide how much of all that a given project actually warrants. Signal does that assembly for you and adds the one piece none of them set out to solve: a **calibration router**. `/sig:calibrate` asks five questions (scope, stakes, novelty, reversibility, horizon) and writes a `PROFILE.md` that tiers the project **SKETCH / FEATURE / SPIKE / FULL**; every phase then dials its own rigor up or down. The point is to neither over-engineer a throwaway nor under-index on tests and diligence where they matter — "without spending 60 minutes planning a homepage." `/sig:escalate` re-sizes mid-flight if scope grows.

If you only need one of the tools, though, reach for it directly — each is genuinely excellent on its own:

## [GSD](https://github.com/gsd-build/get-shit-done) — the execution engine

Best-in-class at running the work: wave-based parallel execution, a fresh context per task, file-based `.planning/` state. Reach for GSD when you already know what you're building and want a no-nonsense engine to decompose it and run agents in parallel. *Signal ports GSD as its execution layer.*

## [Agent Skills](https://github.com/addyosmani/agent-skills) — the quality gates

The senior-engineer playbook as phase-bound skills, loaded on demand — code review, security, simplification. Reach for Agent Skills when you have a working flow and want to bolt on per-phase quality. *Signal ports it as its quality layer; the REVIEW phase comes from here.*

## [superpowers](https://github.com/obra/superpowers) — the discipline

Strict, single-mode enforcement: hard gates that block progress, TDD that won't let you write code before the test. Reach for superpowers when your problem is an agent that cuts corners. *Signal borrows its anti-rationalization format; the harder TDD and hard-gates are on Signal's v2 roadmap — so if you need that enforcement today, go straight to superpowers.*

## [planning-with-files](https://github.com/OthmanAdi/planning-with-files) — the context habit

One high-leverage pattern with almost no setup: a hook-driven plan / findings / progress trio that keeps an agent oriented across long sessions. Reach for it when you don't want a multi-phase workflow at all. *Signal borrows this disk-as-memory discipline.* (Its authors report a 6.7% → 96.7% task pass-rate lift in their own A/B test.)

## [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) — the memory loop

A learning loop where every project makes the next one sharper, plus a deep multi-lens review panel. Reach for it when institutional memory is your priority. *Signal roadmaps a Compound phase from it for v2; v1 doesn't ship it yet — so if the learning loop is what you need today, go to compound-engineering.*

## In one line

Nothing wrong with a hammer, a screwdriver, or a drill — but to build a house you want all of them in one toolbox, and you want to fit the tool to the job. That's Signal: a best-practices toolbox inspired by the projects above, under one roof, with calibration so the rigor matches the work. Want just one tool? Use it directly — they're great. Want the toolbox, sized to the job? That's the idea.

For the full landscape analysis this page draws on — all seven plugins, including [gstack](https://github.com/garrytan/gstack), [pm-skills](https://github.com/phuryn/pm-skills), and [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — see [`../analysis/REPO-ANALYSIS.md`](../analysis/REPO-ANALYSIS.md).
