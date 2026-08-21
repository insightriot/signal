/**
 * The loop driver — the thing that runs the flow so a person does not have to sit
 * at every gate.
 *
 * Built from Signal's loop-engineering audit (a repository document, not shipped with
 * the plugin), which measured the problem before proposing anything: a FULL-tier Epic costs **48–86 synchronous human
 * touchpoints**, and almost all of that ceremony existed only in command prose,
 * enforced by nothing This module does not add ceremony. It decides what
 * happens next, and — crucially — what still has to stop for a person.
 *
 * Three pieces already existed and are reused rather than reinvented:
 *   - `describeNextAction` (B70, v0.1.17) — the "what's next" primitive, hardened
 *     against every phase value found across 12 real projects.
 *   - sweep's halt protocol — needs-a-person vs clears-itself.
 *   - `attentionFor` — how much of your time this is allowed to cost.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { attentionFor } from './profile.js';
import { LOOP_BOUNDED_PHASES } from './loop-ceiling.js';
import { atomicWrite } from './atomic-write.js';

export const QUEUE_REL = '.planning/DECISION-QUEUE.md';

/**
 * Gates that stop the loop NO MATTER WHAT the attention setting says.
 *
 * These are not an oversight and they are not tunable. Each was made
 * tier-independent by a specific decision, and an autonomy layer that quietly
 * overrode them would be re-litigating those decisions by omission — which is
 * exactly how `ship.md` came to carry a self-exemption that survived thirteen
 * releases. Sourced from that audit's inventory of tier-independent gates.
 */
export const FLOORS = Object.freeze([
  {
    id: 'ship-pr',
    at: 'SHIP',
    why: 'A pull request is how the change reaches main, and merge is delivery. `D-M5E17-5`; `ship.md` has no direct-to-main exemption.',
  },
  {
    id: 'ship-retro',
    at: 'SHIP',
    why: 'The Epic-close retrospective gate is explicitly "no bypass" — no flag, no env var, no extra-args trick (`D-E9-3`).',
  },
  {
    id: 'plan-drain-preview',
    at: 'PLAN',
    why: 'A drain write mutates the idea database; the diff is previewed and accepted before any write (`plan.md` R1 hard gate).',
  },
  {
    id: 'plan-drain-destructive',
    at: 'PLAN',
    why: 'delete/merge remove text and confirm per entry regardless of gate_strictness (`plan.md` R5 sub-gate).',
  },
  {
    id: 'resume-orphans',
    at: 'RESUME',
    why: 'Orphan detection is interactive by design (`D12`); the prompt IS the recovery mechanism.',
  },
]);

export function floorsFor(phase) {
  return FLOORS.filter((f) => f.at === phase);
}

/**
 * Can the loop take this step without a person?
 *
 * Fail-closed on every axis. An unreadable profile, an unknown phase, or a missing
 * attention setting yields `false` — a missing setting must never be the reason
 * something ran unattended. This is the opposite of the `B39` fail-open posture
 * used for *reporting*, and deliberately so: a detector that cannot look should
 * say so and continue; an actor that cannot tell should stop.
 */
export function canProceedUnattended(phase, profile, { hasFloor = null, loopStatus } = {}) {
  const attention = attentionFor(profile);
  const floors = hasFloor ?? floorsFor(phase).length > 0;

  if (floors) {
    return { proceed: false, reason: 'floor', attention, floors: floorsFor(phase) };
  }

  // THE LOOP CEILING, CHECKED BEFORE ATTENTION (`B76`).
  //
  // A ceiling is not a preference the attention dial can turn off. `unattended`
  // buys freedom from being ASKED; it does not buy an unbounded loop, and
  // `review.md`'s FAIL path returning straight to EXECUTE is precisely how one
  // arises. So this sits above the attention branches, next to the floors, and
  // is reached on every call rather than only on the unattended path.
  //
  // FAIL CLOSED ON NOT KNOWING. For a phase that loops, a caller that supplies
  // no `loopStatus` — or one derived from state this could not read — gets a
  // refusal, not a pass. That is this file's stated posture: a detector that
  // cannot look should say so and continue; an actor that cannot tell should
  // stop. `loop-unknown` is kept distinct from `loop-ceiling` so the halt says
  // which of the two happened instead of implying a count it never had.
  if (LOOP_BOUNDED_PHASES.includes(phase)) {
    if (!loopStatus) {
      return { proceed: false, reason: 'loop-unknown', attention, floors: [] };
    }
    if (loopStatus.atCeiling) {
      return { proceed: false, reason: 'loop-ceiling', attention, floors: [], loopStatus };
    }
  }
  if (attention === 'attended') {
    return { proceed: false, reason: 'attended', attention, floors: [] };
  }
  if (attention === 'checkpointed') {
    // Checkpointed confirms at phase boundaries and runs free inside a phase.
    return { proceed: false, reason: 'phase-boundary', attention, floors: [] };
  }
  return { proceed: true, reason: 'unattended', attention, floors: [] };
}

/** One queued decision, rendered for a human to answer later. */
export function formatQueuedDecision({ id, phase, question, recommendation, why, date }) {
  if (!id || !question) {
    throw new Error('formatQueuedDecision requires an id and a question.');
  }
  const lines = [
    `## ${id} — ${question}`,
    '',
    `**Phase:** ${phase ?? 'unknown'} · **Queued:** ${date ?? 'unknown'}`,
    '',
    `**Recommendation:** ${recommendation ?? '(none offered)'}`,
  ];
  // Every gray-area question in Signal already carries a recommendation — hiding it
  // is "failing to use the model's signal" (`references/question-patterns.md`). So a
  // queued decision without one is a bug in the caller, and says so out loud rather
  // than rendering a blank that reads like "no opinion".
  if (!recommendation) {
    lines.push('', '⚠ No recommendation was supplied. That is a defect in whatever queued this.');
  }
  if (why) lines.push('', `**Why it was queued rather than asked:** ${why}`);
  lines.push('', '**Answer:** _(unanswered)_', '');
  return lines.join('\n');
}

const QUEUE_HEADER = `# Decision queue

Decisions the loop reached, did **not** guess at, and parked for a person.

An entry here means the run continued past a question rather than blocking on it.
Nothing in this file has been acted on. Answer an entry by replacing the
placeholder on its **Answer** line; the loop reads answers on its next pass.

(That placeholder is deliberately not quoted here: it is the exact token the
parser keys on, and a header containing it would make the file's own preamble
look like an unanswered entry to anything scanning loosely.)

⚠ **A long queue is a signal, not a backlog.** If entries accumulate faster than
they are answered, the attention setting is wrong for this project — that is the
measurement this file exists to produce.

---
`;

export async function queueDecision(baseDir, decision) {
  const path = join(baseDir, QUEUE_REL);
  const entry = formatQueuedDecision(decision);
  const current = existsSync(path) ? await readFile(path, 'utf-8') : QUEUE_HEADER;
  const next = `${current.replace(/\s*$/, '')}\n\n${entry}`;
  await atomicWrite(path, next);
  return { path, id: decision.id };
}

export async function readQueue(baseDir) {
  const path = join(baseDir, QUEUE_REL);
  if (!existsSync(path)) return { path, entries: [], unanswered: 0 };
  const content = await readFile(path, 'utf-8');
  const entries = [];
  const re = /^## (\S+) — (.+)$/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    const nextIdx = content.indexOf('\n## ', start + 1);
    const block = content.slice(start, nextIdx === -1 ? undefined : nextIdx);
    entries.push({
      id: m[1],
      question: m[2],
      answered: !block.includes('_(unanswered)_'),
    });
  }
  return { path, entries, unanswered: entries.filter((e) => !e.answered).length };
}
