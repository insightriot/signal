# Signal, Explained in Plain Language

## What Signal is

Signal is a system that manages how AI builds software for you.

When you ask an AI to build something, the AI is like a brilliant contractor with no project manager: it works fast, but it can skip steps, forget what it decided yesterday, over-build simple things, under-build important things, and declare "done!" without really checking. Signal is the project manager. It wraps the AI in a proven step-by-step process — with checkpoints, written records, and independent inspections — so what comes out the other end is dependable, not just fast.

The result: you get the speed of AI development *and* the reliability of a disciplined engineering team, without having to be the one enforcing the discipline yourself.

---

## The big idea: effort that matches the job

**What it does:** Before any work starts, Signal asks you five simple questions about the project — How big is it? What happens if it breaks? Have you done something like this before? How hard would it be to undo? How long does it need to last? Based on your answers, it sorts the project into one of four sizes, from "quick throwaway" to "full production system," and writes that decision down. Every later step reads that decision and adjusts itself automatically.

**Why it matters:** Most development processes have one setting. Heavy ones force you to write plans and tests for a 20-minute script — so you stop using the process. Light ones let you skip safety checks on software that handles real customers' data — so things break in public. Both fail you, just at opposite ends. Signal turns rigor into a dial instead of a switch: a throwaway script gets built in minutes with no ceremony, while a production service automatically gets research, testing, a security inspection, and a paper trail. Same tool, same commands — the process right-sizes itself. You never waste effort on things that don't need it, and you never accidentally cut corners on things that do.

**And if the project grows mid-stream:** there's an escape hatch. If a "quick experiment" turns into "actually, we're shipping this to customers," one command re-asks the sizing questions, upgrades the level of care, and records why. Scope creep stops being a silent risk — it becomes a deliberate, documented decision.

---

## The workflow: seven steps from idea to shipped

Signal walks every project through the same sequence. Each step produces a written record before the next step begins, and steps that a small project doesn't need are skipped automatically.

### 1. Calibrate — set the dial
The five sizing questions above. Thirty seconds of honesty up front that shapes everything downstream.

### 2. Discuss — decide before you build
**What it does:** Before writing any code, Signal interviews you about the judgment calls — the places where "it depends what you want" — presents you real options, and writes your choices down.

**Why it matters:** Most wasted effort in software comes from building the wrong thing confidently. This step catches the "wait, that's not what I meant" moments when they cost a conversation, not a rebuild. And because decisions are written down, they don't get silently re-decided differently next week.

### 3. Plan — map the work
**What it does:** Signal sends out multiple research assistants at once to study the problem — your existing code, the tools available, the best approaches — then turns the findings into a concrete, ordered plan. Bigger projects get a stricter treatment: the plan is stress-tested against an eight-point checklist, and every promise in it gets matched to a specific test that will prove it was kept.

**Why it matters:** A plan that's been checked before work starts is dramatically cheaper than discovering mid-build that step 4 contradicts step 9. The plan-to-test matching closes the most common quality loophole in AI development: the AI saying "this works" without anything actually verifying it. Under Signal, every requirement gets its own proof — nothing ships on the honor system.

### 4. Execute — build it, in parallel, in small safe pieces
**What it does:** Signal breaks the plan into tasks, runs independent tasks side-by-side with fresh, focused workers, and saves the project after every completed task — each with its own record in your project history. For high-stakes projects, tests are written *before* the code they check.

**Why it matters:** Parallel work is why this is fast. Small, individually-saved pieces are why it's safe — if anything goes wrong, you lose one small step, not an afternoon, and any single change can be undone cleanly. Fresh workers per task also solve an AI-specific problem: long sessions degrade, like a tired employee at hour eleven. Signal never lets a worker get tired.

### 5. Verify — prove it actually works
**What it does:** A separate check, walking backwards from the original goal: does what got built actually do what was promised? The full test suite runs; every acceptance promise from the plan gets confirmed.

**Why it matters:** The builder never grades their own homework. "I finished it" and "it works" are different claims, and this step is the difference. This is where "it worked when I tried it once" gets replaced with "it's proven."

### 6. Review — independent expert inspection
**What it does:** For projects that warrant it, a panel of specialist inspectors goes over the finished work from different angles: Is the code clear and maintainable? Is it secure against known attack patterns? Is it fast enough? Is there anything over-complicated that should be simpler? Findings come back ranked by seriousness.

**Why it matters:** This is the step humans skip when they're tired and AI skips when nobody asks. It's how a solo developer gets what big companies pay senior review teams for: a second, skeptical set of eyes on everything before it goes out the door. Quick experiments skip it automatically — the inspection effort goes only where the stakes justify it.

### 7. Ship — go out the door clean
**What it does:** A final pre-flight checklist, a tidy project history, and a properly documented release. One last gate checks that nothing was quietly skipped along the way.

**Why it matters:** Shipping is where loose ends become other people's problems. This step makes sure the release is something a teammate — or you in six months — can pick up and understand.

**The thread through all seven steps:** Signal is built to resist its own shortcuts. At every gate, it runs "no excuses" checks — pre-written counters to the exact rationalizations that both people and AI reach for under pressure ("the tests mostly pass," "we can document it later," "this edge case probably won't happen"). Corners don't get cut silently; if a step is skipped, it's because the project's size says so, and it's on the record.

---

## The project's memory: nothing gets lost

This may be Signal's most valuable trait day-to-day. Every project keeps a living memory folder — the plans, the decisions and *why* they were made, the current status, what's done, and what's next — stored right inside the project and saved with your code.

**Pick up exactly where you left off.** One command reads the memory and gives you a briefing: here's the project, here's where we are, here's what's next — ready? Close your laptop mid-project, come back Tuesday (or hand the project to someone else, or to a brand-new AI session), and nothing has to be re-explained or re-discovered. It even checks whether work was pushed from another machine that your local status doesn't know about yet, so two computers can't quietly drift apart.

**Check status anytime.** A read-only snapshot — current step, what's finished, open questions, recommended next move — without touching anything.

**Save your place deliberately.** Before stepping away or clearing a session, one command brings the status up to date and prompts you to record any decisions or open questions worth remembering — so your future self gets a genuinely useful briefing instead of a stale one.

**Why it matters:** The most expensive thing in software isn't writing code — it's *re-establishing context*: re-explaining, re-deciding, re-discovering why things are the way they are. Signal makes context a permanent asset instead of something that evaporates when a session ends. That's what makes development *sustainably* fast, not just fast in bursts.

---

## Capturing ideas without derailing the work

**What it does:** Mid-build, you'll think of things — a new feature, a question, a possible bug. One quick command captures the thought, word-for-word, into the right inbox (ideas, open questions, or bugs) and you keep working. The next time you plan, Signal walks you through the inbox: promote this idea into the plan, save it for later, merge it, or drop it — your call, every time.

**Why it matters:** The two ways good ideas die are being forgotten and being chased immediately (wrecking the current task). This gives every stray thought a safe landing spot in under ten seconds, and guarantees it resurfaces at exactly the right moment — planning time. Nothing falls through the cracks, and nothing derails you.

---

## A memory that maintains itself

Written records are only valuable if they stay accurate and findable. Signal tends its own memory:

- **A living table of contents** for the whole memory folder, rebuilt automatically each time you ship, so anyone can find any document.
- **A hygiene check** that catches records drifting out of shape — bloated files, notes in the wrong place — before they rot.
- **Automatic archiving:** when a chunk of work is finished and closed, its detailed paper trail moves to an archive (never deleted, always recoverable) so day-to-day files stay lean and readable.
- **A one-command cleanup** for projects whose memory has grown messy over time — it reorganizes everything to the current layout, moving rather than deleting, with every change reversible.

**Why it matters:** Every documentation system ever tried dies the same death: it decays, people stop trusting it, people stop using it. Signal's memory is the first kind that cleans its own room. Six months in, the records are as trustworthy as on day one — which is precisely when you need them most.

---

## Getting started — new project or existing one

**Brand-new project:** one command sets everything up, asks what you're building, and flows straight into the sizing questions. You're working within minutes.

**Existing codebase** (the more common case): a different command sends four scanners through your code — read-only, touching nothing — and produces a "lay of the land" report: what languages and tools it uses, how it's organized, how active it's been, how healthy the tests are. It then drafts the project paperwork for you, honestly marking every guess as a guess ("inferred — please verify") and every blank it couldn't fill as needing your input. You correct the draft instead of writing from scratch, then calibrate and go.

**And if the plugin itself misbehaves:** a built-in "doctor" diagnoses the known installation problems and generates the exact fix — so a broken install is a two-minute detour, not a lost evening.

**Why it matters:** Adopting a process is usually the hardest part of any process. Signal meets your project where it is — including years-old codebases — and does its own onboarding homework.

---

## Private by design

Signal sends no analytics, no telemetry, no usage data — nothing. All records live in your project, on your machine, under your control. Its only network activity is checking for its own updates and checking your own code backup for new work — and there's a built-in audit tool that proves it, so you don't have to take that on faith.

---

## Why this adds up to rock-solid, faster development

Each piece is simple. Together they compound:

1. **Right-sized effort** means you're never paying a rigor tax on small things or skipping safety on big ones. Speed where speed is safe; care where care is owed.
2. **Decide-before-build** means the expensive mistakes — building the wrong thing — get caught while they're still cheap conversations.
3. **Small, parallel, individually-saved steps** mean the work is fast *and* every step is reversible. Mistakes cost minutes, not days.
4. **Independent verification and inspection** mean "done" actually means done. Every promise has a proof; every release got a skeptical second look.
5. **Built-in resistance to excuses** means quality doesn't depend on anyone's willpower on a tired Friday — the process holds the line automatically, and any exception is on the record.
6. **Permanent, self-maintaining memory** means momentum survives interruptions, handoffs, machine switches, and months of shelf time. The project never forgets, so you never start over.

That's the trade most teams believe they have to make — fast *or* reliable — dissolved. Signal makes reliability the byproduct of the process rather than an act of discipline, which is the only way it survives contact with real life. You describe what you want and make the judgment calls; the system handles the rigor, remembers everything, and proves the work before it ships.
