# Be a first tester for Signal

Thanks for taking a look. This is a small, honest ask — read this once, run one short thing, and jot down where it tripped you up.

## The frame: this is early

Signal is at **version 0.1.x**. It's feature-complete for v1 but **freshly released and lightly traveled** — so far the only person who's run it on real work is me, so you're genuinely a first tester, not a rubber-stamp. Expect rough edges, confusing moments, and at least one "wait, what just happened?" That's exactly the signal I'm after. You won't hurt my feelings; a blank friction log helps me less than a brutal one.

I'm **not** asking you to adopt it, endorse it, or finish anything. I'm asking you to walk a few steps in and tell me where the floor creaked.

## The ask (~20 minutes)

On a real project of your own (see below), in Claude Code:

1. `/sig:calibrate` — answer the 5 questions about the project.
2. `/sig:discuss` — let it interview you toward a spec.
3. **Stop whenever you want** and log where you paused, got confused, or got stuck.

That's the whole core ask: **calibrate → discuss, then log the friction.** Twenty minutes is plenty.

If you're enjoying it and have more time, keep going — `/sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship` is the full flow, and going further surfaces deeper friction. But the short version is the real ask; anything past `discuss` is a bonus, not an expectation.

Watch the [demo script](./demo-script.md) first if you'd like to see the shape of it before you start.

## Who this is a good fit for

A good first tester is someone who:

- **Isn't me.** Fresh eyes are the entire point — you'll hit the assumptions I can't see anymore.
- **Has a real project to point it at.** Not a toy. Calibration only does something interesting when there are genuine stakes to weigh (a throwaway script vs. long-lived infrastructure calibrate very differently). A repo you actually care about, even a small one, is ideal.
- **Is on a Mac, for now.** See the caveat below.

You do **not** need to know GSD, Agent Skills, or anything about how Signal was built. If the brief assumes knowledge you don't have, that's a finding — log it.

## Platform caveat: macOS only, for now

Install is **verified on macOS**. **Linux/WSL untested** — the install path on those platforms hasn't been verified yet, so if you're not on a Mac, you're likely to hit setup failures that aren't about Signal's actual workflow. Please sit this round out rather than fight the installer; I'd rather not waste your 20 minutes on an environment gap. Details: [`install-verification.md`](./install-verification.md).

## What I will and won't ask for

This brief requests **nothing sensitive**. Don't send me:

- Source code, repo contents, or file paths that reveal proprietary work.
- Secrets, credentials, `.env` contents, or customer data.
- Anything under NDA or that your employer would object to sharing.

The friction log below is about **your experience of the tool** — what confused you, what you expected, where it stalled. You can describe a step ("the calibrate questions") without pasting anything from your actual project. Redact freely; vague-but-honest beats specific-but-leaky.

## Friction log

### How to use it

Copy the block between the markers below into a message, a gist, or a plain text file — whatever's easiest to send back. Fill in the context header once, then add one row per moment something snagged. Replace each `[FILL IN — …]` with your own words; leave a field blank if it doesn't apply. A worked example row is included to show the shape — delete it before sending.

**Severity scale:** `1` = cosmetic / mild confusion, kept going · `2` = stalled, had to guess or re-read · `3` = blocked, couldn't proceed without help.

<!-- TEMPLATE: friction-log -->
## Signal friction log

**Tester context** (one-time header):
- Project type / stakes (no specifics needed): [FILL IN — e.g. "small personal CLI, low stakes" or "side project I'd put in front of users"]
- Have you used GSD / Agent Skills / similar before? [FILL IN — yes / no / which]
- macOS version + Claude Code version: [FILL IN]
- How far did you get? [FILL IN — e.g. "calibrate + discuss" or "all the way to ship"]

**Friction rows** (one per snag):

| Step | What I expected | What actually happened | The exact words that confused me | Severity (1–3) | Did I recover? |
|---|---|---|---|---|---|
| _e.g._ `/sig:calibrate` Q3 | _A plain-English question_ | _Term "reversibility" wasn't defined_ | _"How reversible is this work?"_ | 2 | _Guessed, moved on_ |
| [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] |
| [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] | [FILL IN] |

**What worked** (anything that felt good or clicked):
[FILL IN — even one line helps me not break it]

**The one thing you expected that didn't exist:**
[FILL IN — the single missing thing that surprised you most. This field is gold.]
<!-- /TEMPLATE: friction-log -->

## Sending it back

Reply however we already talk — paste the filled log, or send the file. No format police; a rough log in your own words is worth more than a polished one. Findings feed straight into the next patch backlog (v0.1.(N+1)), and I'll tell you what your notes changed.

Thank you — genuinely. First testers are how this stops being a sample of one.
