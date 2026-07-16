# Signal vs. the "Software Factory" — alignment & gap analysis

**How Pierson Marks's continuous software-factory architecture maps onto Signal, where they align, and where the gaps are.**

> **Purpose.** Compare Signal's structure against a widely-shared "software factory" design (Pierson Marks, [@piersonmarks on X](https://x.com/piersonmarks/status/2075361336381555096), Jul 2026) and pin down exactly where the two align, where they diverge, and what building the missing pieces would take. Companion to `SIGNAL-INTEGRATION-RUNDOWN.md` (v2 vision) — this doc is a roadmap input, not a commitment. Written 2026-07-15.

> **Source claims about Signal in this doc are grounded in a repo scan**, not memory: `commands/{add,discuss,init,plan,execute,verify,review,ship}.md`, `tools/lib/{add,drain,state}.js`, `.planning/{FUTURE-IDEAS,OPEN-QUESTIONS,BUGS,STATE}.md`, `hooks/hooks.json`, `README.md` § Privacy & telemetry, `agents/scanners/*.md`.

---

## The factory, in one picture

Marks's architecture has three intentionally-seamed stages, with an external issue tracker (Linear) as the source of truth in the center:

```
   CREATE work                STORE work            COMPLETE work
 (always-on loops)   ──────►   (Linear)   ──────►   (SDLC agent)
  • System Health (5am):                             /do skill:
    Posthog + Vercel errors                          fetch issue → implement
  • UX/Feedback (Mon 9am):                           → verify in browser
    Intercom + session replays                       → open PR → watch comments
  • Churn (6am):
    Stripe + Posthog + Supabase

  Trigger: cron schedules          Trigger: Linear 'auto' label
  (cloud routines)                 → webhook → routing service
                                   → parallel cloud Claude sessions
```

The whole thing runs unattended on Claude Code Cloud Routines. The `auto` label is the human-in-the-loop gate: a human (or an agent) adds it to promote an issue from "to do" into "doing."

## Bottom line

Signal and the factory answer **different questions on the same SDLC**:

- **The factory** answers *"how do I keep a shipped product continuously improving with minimal babysitting?"* — an always-on **outer loop**.
- **Signal** answers *"how do I take THIS unit of work from idea to shipped at the right rigor?"* — a human-driven **inner loop**.

They overlap almost entirely on **completing work** (and Signal is *deeper* there), partially on **storing work**, and not at all on **creating work from production signals** or on the **async/event trigger**. Those last two absences are exactly what make the article a *factory* rather than a *workflow*.

## Correcting the obvious parallel

The intuitive mapping is *"Signal's PLAN phase → capture issues for execution."* That's one connection off. The true analog to **Linear-as-standing-queue is Signal's staging files** (`FUTURE-IDEAS.md` / `BUGS.md` / `OPEN-QUESTIONS.md`), **not `PLAN.md`**. `PLAN.md` is a per-Epic execution DAG produced and consumed inside a single flow; Linear is a cross-time, multi-source inbox.

| Article | Signal (already built) |
|---|---|
| pre-triage loops → **Linear** | `/sig:add` capture → **`FUTURE-IDEAS.md`** |
| labeled issue → **implementation agent** | `/sig:plan` (drains FUTURE-IDEAS) → `/sig:execute` |

**Signal already has the spine** — capture → stage → drain → plan → execute → ship. It is not missing a side of the pipeline. It is missing three *properties* of the store and the trigger. That reframes the work from "build a whole new half" to "change the nature of pieces that already exist."

The promotion mechanism today: `/sig:add` writes verbatim capture to `FUTURE-IDEAS.md`; `/sig:plan`'s Step 1b "drain" (advisory, diff-previewed, per-entry `promote / defer / merge / delete / skip`) folds an idea into the plan and stamps it `→ Promoted {date}`; `/sig:execute` builds it. That is a real capture→build path — it's just human-run and synchronous.

## Alignment matrix

| Seam | Article (factory) | Signal | Verdict |
|---|---|---|---|
| **Create work** | 3 always-on loops ingesting production signals — Posthog errors, Stripe churn, Intercom/session-replay feedback → auto-file issues | Human-driven only: `/sig:discuss` decisions, `/sig:add` capture, `/sig:init` scan *reporting*. No product-signal ingestion. | **Biggest gap** — a different left-side entirely |
| **Store work** | Linear — external, multi-writer, webhook-emitting, MCP-queryable, cross-project | `.planning/*.md` — flat markdown, local, git-tracked, human-serialized writes, no events | **Partial** — same role, wrong properties |
| **Complete work** | `/do` skill: one SDLC pass (fetch → implement → verify-in-browser → PR → watch comments) | `/sig:plan→execute→verify→review→ship`: 5 tier-gated phases, 26 agents, anti-test-theater, security audit, review panel | **Strong overlap — Signal is deeper** |
| **Trigger** (cuts across all three) | Event-driven: cron schedules + Linear label webhooks → parallel cloud sessions, unattended | Human-invoked slash commands in one interactive session. No scheduler, no webhook surface, no daemon. | **Orthogonal gap** — this is what makes it a *factory* |

## The three concrete gaps, each pinned to a location

**1. The store isn't event-emitting, multi-writer, or external.**
`.planning/` files are local, git-versioned, and written through a lock so writes serialize — great provenance, but no webhooks and no async decoupling. This is *also why* the "don't run parallel Claude sessions on one repo" rule exists: the race is a symptom of file-based single-writer state. Linear/GitHub Issues moves state out of the racing files, which is precisely what would unblock cross-issue parallelism.
*Location: `FUTURE-IDEAS.md` / `OPEN-QUESTIONS.md` / `BUGS.md`.*

**2. There's no always-on trigger surface, and no "standing agent" category.**
All 26 of Signal's agents are ephemeral, phase-spawned. There's no schedule/webhook surface and no architectural slot for a "loop" agent that runs on Monday at 9am. The only hooks are Claude Code *session-lifecycle* guardrails (`SessionStart`, `PreToolUse: Edit|Write`), not daemons.
*Location: absent; would be a new layer alongside `hooks/`.* For this stack specifically, **GitHub Issues + GitHub Actions is the more natural substrate than Linear**: git-native, matches the InsightRiot account boundary, and Actions *is* the "cloud routine" scheduler. (`/sig:ship` already shells out to `gh` for PRs, so the GitHub surface is partly wired.)

**3. No production-signal ingestion — the article's entire left side.**
Signal's biggest true absence, and it's absent **even from the v2 roadmap.** v2's planned upstream (IDEATE/VALIDATE/STRATEGIZE from pm-skills) is *human product-discovery* — "what should we build?" The article's left side is *telemetry-driven maintenance* — "what is the live product telling us to fix?" Different left-sides. `README` § Privacy & telemetry advertises "no analytics, no telemetry, no usage pings, no remote logging." Signal's own docs already name the miss — `FUTURE-IDEAS.md` quotes `REPO-ANALYSIS.md`: *"No compounding loop. You ship and forget. compound-engineering's Compound phase is the biggest architectural miss."*
*Location: nowhere; nearest planned home is the v2 COMPOUND phase — but see the non-gap below.*

## One important non-gap

Signal is not without a "close-the-loop" muscle. **E9 shipped a SHIP-phase retro gate + `RETROSPECTIVES.md`.** The muscle exists — it's just **aimed the other way.** Signal's retro captures *what we learned building this* (inward, dev-process, capture-only with no replay). The article's loops capture *what the deployed product reports* (outward, telemetry, auto-filed as issues). The precise gap isn't "no feedback loop" — it's that Signal's loop faces inward and never replays into the backlog, while the factory's faces outward and creates work.

## The synthesis — where Signal *beats* the article

The factory has one blind spot: **it treats all work as equally safe to run unattended.** A churn-driven P1 bug and a cosmetic UX polish both get an `auto` label and the same `/do`.

Signal has the exact knob the article lacks: **`/sig:calibrate`'s tier.** Today it runs once per project. In a factory, **tier becomes the per-issue gate deciding how much of the pipeline runs unattended:**

- A **SKETCH** issue runs `calibrate→ship` fully autonomously.
- A **FULL** issue runs to the first human gate and stops.

That's an autonomous factory that **knows which work is safe to run without a human** — reconciling Signal's "right-sized rigor" DNA with the factory's "minimal babysitting" goal instead of fighting it. The article's `auto` label is binary (go / don't-go); Signal's tier is a dial. **That is the genuine differentiator** if this is pursued.

## What building it would take (concrete)

The two are **complementary layers**, not competitors — the factory is the outer loop Signal lacks; Signal is a far higher-rigor inner loop than the article's single `/do` skill. To fuse them:

1. **Adopt GitHub Issues as the "store" seam** — already deferred-logged in `FUTURE-IDEAS.md` § "GitHub Issues for work-item tracking — deferred (pending live users)." Moves the standing queue out of racing local files.
2. **Add a standing-agent category + Actions triggers** — the scheduler/webhook surface Signal lacks.
3. **Build the outward feedback loop** — a scheduled agent that reads product signals via MCP and opens issues. The genuinely new v2-plus work.
4. **Wire tier as the autonomy gate** — a labeled issue's tier decides whether it runs unattended or stops at a human gate.
5. **Solve the parallel-session race** — worktree-per-issue or tracker-held state, since #2 implies concurrent runs.

Steps 1–2 are plumbing Signal half-anticipates. Step 3 is the real frontier. Step 4 is Signal's unfair advantage.

---

*Companion to `SIGNAL-INTEGRATION-RUNDOWN.md`. The v2 COMPOUND phase is the closest planned home for the outward loop, but as speced it captures dev-process learnings, not deployed-product telemetry — the two are not the same left-side.*
