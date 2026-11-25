# Research prompt: existing tools (2026-11-24)

Paste everything below the line into a research-capable model with live web search. It is written to
be run on two different models separately, so the two answers can be compared. It belongs to the open
question at the end of "The cut-down, step by step" in [`SLIM-SIGNAL.md`](SLIM-SIGNAL.md).

---

Today is 2026-11-24. I need live research, not what you remember: this field changes monthly, so
search the web and open the repositories and docs before you answer.

## Who I am and what I need

I am a solo, non-engineer founder. I build real production software with AI coding agents, mainly
Claude Code. I cannot review code line by line, so the only proof I trust is something I can run
myself or a check a program can fail (a test, a script, a CI job). An agent telling me the work is
done is not proof.

I spent months building my own Claude Code plugin to manage this, and most of it did not pay off. I
would now rather adopt existing open-source tools than build. I need to know which tools already do
these four jobs:

1. **Size the work before building.** Agree with me what is being built and how big it is, so a small
   fix gets a light process and a risky feature gets a careful one.
2. **Keep the work records.** Capture ideas and bugs, hold one ranked backlog that is the roadmap, and
   log what was done and why. Most important: the agent must read the known open problems before it
   builds on top of them, and must file the limits it leaves behind.
3. **Keep documentation of the codebase accurate.** Docs about the app and code that stay true as the
   code changes, and that an agent or I can find our way around quickly.
4. **Run a sprint unattended.** I agree several backlog items up front, then the agent builds them in
   a row without me, each one gated by passing tests and each leaving a record.

## What I already know, so you do not repeat it

- In my own tests, plain Claude Code built features as well as a six-phase process (discuss, plan,
  execute, verify, review, ship), about four times faster. Heavy process did not buy better code.
- Two records tools, Beads and Backlog.md, did no better than plain markdown files. In every setup,
  the agent did not read earlier follow-ups before building and mostly did not file its own limits.
  Storage was not the problem. Getting the records read and written was.
- Rules written as instructions in a prompt file often were not followed. Rules enforced by code
  (hooks, scripts, CI) were.
- I already know of GSD (get-shit-done), Agent Skills, superpowers, gstack, pm-skills,
  compound-engineering, planning-with-files and oh-my-claudecode. Check their current state, but look
  well beyond them, including spec-driven tools, task and backlog tools, loop runners, codebase-doc
  generators, and features now built into Claude Code and its competitors.

## What to check for each tool

- What it does for each of the four jobs, and which of them it does not touch.
- **Whether each claim is enforced by code or is only an instruction to the model.** Say which. This
  is the distinction I care most about.
- Whether it works with Claude Code, keeps its records as plain files in the repository, and can be
  installed in minutes without running a server.
- Whether it is alive: last commit date, open issues, licence.
- Evidence it works from people other than its author, and the main complaints about it. Stars are
  not evidence.

For every claim, give the link, and say whether you read it in the README, read it in the source, or
could not confirm it.

## What to give me back

One page, in plain language, no jargon I would have to look up:

1. A table of the tools worth my attention (eight at most), with one decision each: **adopt**,
   **borrow one named thing**, or **nothing**, and a one-sentence reason.
2. The smallest combination that covers the four jobs, and which jobs nothing covers well.
3. Whether Claude Code itself now does any of the four jobs without a plugin.
4. What you could not verify.

If nothing fits a job, say so plainly. That is a useful answer.
