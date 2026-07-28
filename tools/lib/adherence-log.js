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
