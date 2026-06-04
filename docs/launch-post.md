<!-- DRAFT launch post (M4.5.E5). Publish-when-ready: edit the voice, then publish per the handoff in .planning/M4.5.E5-LAUNCH-KIT.md. For a public "Show HN" later, prefix the title accordingly. -->

# Signal: right-sized rigor for AI coding agents

*A Claude Code plugin that calibrates how much process a project actually needs — then runs the workflow to match.*

## The problem

There's a small ecosystem of workflow plugins for AI coding agents now, and I spent a while reading through it — seven of them, closely (the write-up is linked below). They're genuinely good, and they fall into three camps: execution engines that decompose work and run agents in parallel, quality enforcers that bolt on TDD and review gates, and skill libraries that hand the agent a senior engineer's playbook. But almost all of them share one assumption — that every project deserves the same amount of process. So you either get a heavyweight flow that wants a test suite and a four-agent research pass for a 30-line script, or a lightweight one that skips discipline even when you're shipping something that handles other people's data. Both fail at the wrong end. The concrete version I kept hitting: an hour of planning ceremony on a static homepage, for output worse than a 15-minute prompt would have given me.

## Where it came from

I wasn't trying to build a framework. I was trying to pick one, hit that mismatch over and over, and ended up writing the landscape analysis first — then realizing the gap I wanted filled wasn't in any of them. Signal is the result: a synthesis of the patterns I liked best, plus the missing piece.

## What it is

Signal is a Claude Code plugin that runs a six-phase workflow — calibrate → discuss → plan → execute → verify → review → ship. The twist is Phase 0. `/sig:calibrate` asks five diagnostic questions (scope, stakes, novelty, reversibility, horizon) and writes a `PROFILE.md` that classifies the work into one of four tiers: SKETCH, FEATURE, SPIKE, or FULL. Every downstream phase reads that profile as its first action and dials its own rigor up or down — whether you get TDD, four parallel research agents, an eight-dimension plan validation, a full security audit, all of them, or none. v1 directly ports two of the projects I studied — GSD for the execution engine and Agent Skills for the quality gates — and borrows patterns from the rest.

## How it's different

The calibration router is the part none of the others set out to build. They solve rigor at the command level — this command is strict, that one is loose. Signal solves it one level up, at routing: a single decision at the start, and the whole workflow self-tunes. In its own dogfood, a SKETCH-tier throwaway shipped in about 5 minutes with 0 tests and 8 planning artifacts; a FULL-tier service took about 2 hours with 39 tests, 4 research agents, and 14 artifacts. Same commands, same tooling — the only difference is what calibration decided the job was worth. `/sig:escalate` re-sizes mid-flight if the scope grows under you.

## Honest limits

It's early — version 0.1.x, and so far the only person who's run it in anger is me, so treat the calibration premise as a strong hypothesis, not a proven result. Install is verified on macOS; Linux and WSL are untested. The harder-TDD enforcement and the post-ship learning loop you'll see referenced in the docs are on the v2 roadmap, not shipped yet — if those are what you need today, the original projects do them well and I point you straight at them.

On privacy, since people ask: Signal makes no network calls beyond what Claude Code itself makes to Anthropic's API. All state lives in `.planning/` in your repo — no analytics, no telemetry, no usage pings, no remote logging.

## If you want to look

The full landscape write-up this draws on is in [`../analysis/REPO-ANALYSIS.md`](../analysis/REPO-ANALYSIS.md); a candid "when to reach for which" guide — including the projects Signal is built from — is in [`./vs.md`](./vs.md); and a complete FULL-tier run is committed as a worked example at [`../examples/url-shortener/`](../examples/url-shortener/), where you can read the whole `.planning/` chain end to end. If you try it, I'd genuinely like to know where it breaks for you.
