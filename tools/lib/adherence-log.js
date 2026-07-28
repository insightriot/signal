// tools/lib/adherence-log.js — the published measurement record (M5.E8, FR4 + FR5).
//
// `.planning/ADHERENCE-LOG.md` has two halves with DIFFERENT write rules, and
// keeping them apart is the whole design:
//
//   1. THE CEILING (FR5) — a function of the command corpus as it stands today.
//      Regenerable: recompute it whenever `commands/*.md` changes. Lives between
//      the ceiling markers and is replaced wholesale on each regeneration.
//
//   2. THE RUN RECORDS (FR4) — measurements of real agent behaviour at a point in
//      time. APPEND-ONLY. A later run never rewrites an earlier one. Everything
//      below the runs marker is untouchable by this module.
//
// The marker boundary is what lets the ceiling be regenerated without the
// regeneration ever being able to reach a run record. `M5.E9` shipped `B44` — a
// silent write that dropped data — and this Epic's own plan says it does not get
// to collapse another log. So the ceiling upsert is bounded by construction
// rather than by care.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { PLANNING_DIR } from './state.js';

export const ADHERENCE_LOG = 'ADHERENCE-LOG.md';

export const CEILING_BEGIN = '<!-- adherence:ceiling:begin -->';
export const CEILING_END = '<!-- adherence:ceiling:end -->';
export const RUNS_MARKER = '<!-- adherence:runs -->';

/**
 * Render the FR5 ceiling section from a classified corpus.
 *
 * @param {{files: Array, counts: object}} corpus - classifyCommandCorpus() output
 * @param {{computedAt: string, commit: string}} meta
 */
export function renderCeilingSection(corpus, { computedAt, commit }) {
  const { directives, measurable, unmeasurable, libCall, artifactWrite } = corpus.counts;
  const pct = n => ((n / directives) * 100).toFixed(1);

  const rows = [...corpus.files]
    .sort((a, b) => b.counts.measurable - a.counts.measurable || a.file.localeCompare(b.file))
    .map(f => `| \`${f.file}\` | ${f.counts.directives} | ${f.counts.measurable} | ${f.counts.unmeasurable} |`)
    .join('\n');

  return `## The coverage ceiling

**Computed:** ${computedAt} · **Commit:** \`${commit}\` · **Corpus:** ${corpus.files.length} \`commands/*.md\` files

This is the bound on everything the adherence harness can ever report. It is computed
directly from the command corpus by \`tools/lib/directive-classifier.js\`, whose split
rule is written out in full in that file's header so a reader can disagree with it line
by line.

| | count | share |
|---|---:|---:|
| Directive lines | **${directives}** | 100% |
| …naming a real \`tools/lib\` export | ${libCall} | ${pct(libCall)}% |
| …writing a named artifact | ${artifactWrite} | ${pct(artifactWrite)}% |
| **Trace-measurable (either)** | **${measurable}** | **${pct(measurable)}%** |
| **No observable trace** | **${unmeasurable}** | **${pct(unmeasurable)}%** |

### What the remainder is, stated plainly

The ${unmeasurable} directives with no observable trace are **unmeasured, not passing.**

They are not "probably fine", not "covered by the test suite", and not "verified by the
fact that Signal works". Nothing in this repository establishes whether an agent follows
them. That includes the guidance carrying most of Signal's value — *surface ambiguity*,
*don't rationalize*, *gate at product altitude* — none of which leaves a trace this
method can see. A future reader looking for the sentence that lets them treat a green
harness run as evidence about the whole corpus will not find it here.

### Per-file

| File | directives | measurable | unmeasured |
|---|---:|---:|---:|
${rows}
`;
}

/**
 * Replace the marked ceiling block, leaving every other byte of the file alone.
 * If the markers are absent, the ceiling is inserted above the runs marker (or
 * appended, when the file has neither).
 */
export function upsertCeiling(existing, section) {
  const block = `${CEILING_BEGIN}\n${section}${CEILING_END}`;
  const begin = existing.indexOf(CEILING_BEGIN);
  const end = existing.indexOf(CEILING_END);

  if (begin !== -1 && end !== -1 && end > begin) {
    return existing.slice(0, begin) + block + existing.slice(end + CEILING_END.length);
  }

  const runsAt = existing.indexOf(RUNS_MARKER);
  if (runsAt !== -1) {
    return `${existing.slice(0, runsAt)}${block}\n\n${existing.slice(runsAt)}`;
  }
  return `${existing}${existing.endsWith('\n') ? '' : '\n'}${block}\n`;
}

const VERDICT_GLOSS = {
  obeyed: 'the trace appears only with the instruction present — the instruction changed what the agent did',
  inert: 'the trace appears in BOTH arms — the instruction caused nothing. A **finding**, not a failure, and not retried until it passes',
  absent: 'the trace appeared in neither arm — nothing happened; check whether the fixture reached the instruction at all',
  indeterminate: 'not a clean split, or a run failed — an honest "we do not know", recorded rather than rounded into a finding',
};

/**
 * Render one run record (AC4.1). Everything needed to repeat the run (AC4.3) is
 * on the face of it: canary, command, runs per arm, surface, commit.
 */
export function renderRunRecord(record, { date, commit }) {
  const { treatment: t, control: c } = record;
  const gloss = VERDICT_GLOSS[record.verdict] ?? '(unknown verdict)';

  return `### ${date} · \`${record.canary}\` · **${record.verdict.toUpperCase()}**

| | |
|---|---|
| Commit | \`${commit}\` |
| Command | \`/sig:${record.command}\` |
| Trace | \`${record.trace}\` |
| Surface | claude ${record.surface.cliVersion} · ${record.surface.model} |
| Runs per arm | ${record.runsPerArm} |
| Seam precondition | ${record.seamProven ? 'PASS — the mutated tree is the one the agent read' : 'FAIL'} |
| as-written (treatment) | **${t.hits}/${t.runs}** ${t.unanimous ? 'unanimous' : '**SPLIT**'} |
| instruction deleted (control) | **${c.hits}/${c.runs}** ${c.unanimous ? 'unanimous' : '**SPLIT**'} |
| Failed runs | ${record.failedRuns} |

**${record.verdict.toUpperCase()}** — ${gloss}.

`;
}

/**
 * AC4.2 — APPEND-ONLY. Adds a run record beneath the runs marker without
 * touching a single byte above it, and without touching any earlier record.
 *
 * Implemented as a pure concatenation for a reason: there is no code path here
 * that reads an existing record, so there is none that can rewrite one. The Epic
 * that shipped `B44` — a silent write that dropped data — does not get to
 * collapse another log, and M5.E9 established that a past collapse is not
 * detectable from the file afterwards, because the evidence is what gets
 * destroyed. So the guarantee is structural, not procedural.
 */
export async function appendRunRecord(baseDir, record, { date, commit } = {}) {
  const path = join(baseDir, PLANNING_DIR, ADHERENCE_LOG);
  const stamp = date ?? new Date().toISOString().slice(0, 10);

  let existing;
  try {
    existing = await readFile(path, 'utf-8');
  } catch {
    existing = `${HEADER}${RUNS_MARKER}\n`;
  }
  if (!existing.includes(RUNS_MARKER)) {
    existing = `${existing}${existing.endsWith('\n') ? '' : '\n'}\n${RUNS_MARKER}\n`;
  }

  const body = renderRunRecord(record, { date: stamp, commit: commit ?? 'unknown' });
  const next = `${existing}${existing.endsWith('\n') ? '' : '\n'}${body}`;
  await atomicWrite(path, next);
  return { path };
}

/**
 * Mark an earlier run record as invalidated — by APPENDING a notice, never by
 * editing the record.
 *
 * This is the same rule `DECISIONS.md` states at its top: when something is
 * reversed, add an entry noting the reversal; do not edit the old one. A log
 * that quietly deletes its own wrong answers cannot be audited, and "the run
 * that was wrong" is often the most informative thing in it — M5.E8's invalid
 * ABSENT run is what surfaced `B48`.
 */
export async function appendInvalidation(baseDir, { commit, verdict, reason }) {
  const path = join(baseDir, PLANNING_DIR, ADHERENCE_LOG);
  const existing = await readFile(path, 'utf-8');
  const note = `> ### ⚠ INVALIDATED — the \`${verdict}\` record at commit \`${commit}\` above
>
> ${reason.split('\n').join('\n> ')}
>
> *Left in place byte-identical rather than removed. This log is append-only: a
> wrong answer that is deleted cannot be audited, and the run that produced this
> one was the most informative of the Epic.*

`;
  await atomicWrite(path, `${existing}${existing.endsWith('\n') ? '' : '\n'}${note}`);
  return { path };
}

const HEADER = `# Adherence Log

Signal's measurement record: what its own instructions actually cause an agent to do.

**Two halves, two rules.** The ceiling below is *regenerated* whenever the command
corpus changes. The run records beneath the runs marker are **append-only** — a later
run never rewrites an earlier one.

`;

/**
 * Write the ceiling into `.planning/ADHERENCE-LOG.md`, creating the file with its
 * header + runs marker if absent. Never touches content below the runs marker.
 */
export async function writeCeiling(baseDir, corpus, meta) {
  const path = join(baseDir, PLANNING_DIR, ADHERENCE_LOG);
  let existing;
  try {
    existing = await readFile(path, 'utf-8');
  } catch {
    existing = `${HEADER}${RUNS_MARKER}\n`;
  }
  const next = upsertCeiling(existing, renderCeilingSection(corpus, meta));
  if (next !== existing) await atomicWrite(path, next);
  return { path, changed: next !== existing };
}
