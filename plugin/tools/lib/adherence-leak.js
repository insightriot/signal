/**
 * The independent leak walk (M5.E15, FR2).
 *
 * ── WHY THIS IS NOT PART OF THE DELETION CODE ────────────────────────────────
 *
 * `B55`: the only check on the control arm asked the canary what it had deleted,
 * then confirmed those files were clean. That check can only find sites the
 * deletion list already knows about — it is the mutation restating itself. It
 * reported a clean control arm while four other command files still ordered the
 * measured instruction, and a verdict was published on that basis.
 *
 * So this module NEVER reads `canary.deletions`. It greps every file in the
 * copied tree for the residue token and classifies what survives against an
 * allowlist of reviewed, known-descriptive sites. Everything else is directive.
 * `checkLeak` accepts a canary argument and deliberately ignores it — the test
 * that passes `deletions: []` and still expects a failure is the assertion that
 * this independence is real and not merely intended.
 *
 * ── WHY IT FAILS CLOSED ──────────────────────────────────────────────────────
 *
 * An unrecognised file naming the token is treated as DIRECTIVE, never skipped.
 * A declared list of "places the instruction lives" is correct the day it is
 * written and silently stops matching the corpus the moment a sixth command
 * names the function. Failing closed converts that drift into a loud refusal
 * instead of a quiet leak into a verdict.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { PLUGIN_COPY_DIRS } from './adherence-harness.js';

/**
 * Files that may name the residue token WITHOUT ordering the call.
 *
 * AC2.3 pins this list exactly, so adding an entry is a visible, reviewed edit
 * rather than a side effect of some other change. Each value is the reason,
 * written for whoever audits a verdict later and asks why this file was allowed
 * to keep the token.
 */
export const DESCRIPTIVE_ALLOWLIST = new Map([
  [
    'commands/discuss.md',
    'Teaches the rule without ordering it: it tells the agent NOT to set the phase here, ' +
    'because the incoming command advances it. Deleting a prohibition does not remove an ' +
    'instruction to act — it removes an instruction to refrain, which is a different change.',
  ],
  [
    'commands/index.md',
    'Names the function while describing what regenerates the documentation map. Descriptive ' +
    'reference to a capability, not an order to invoke it during the measured run.',
  ],
  [
    'commands/calibrate.md',
    'Mentions the function while explaining how calibration interacts with recorded phases. ' +
    'It does not instruct the agent to call it, so deleting it would change the agents ' +
    'background knowledge rather than remove the instruction under measurement.',
  ],
  [
    'references/state-schema.md',
    'Documents the semantics of the state file the function writes. An agent stripped of the ' +
    'schema reference is not the same agent minus one instruction — it is an agent that can no ' +
    'longer understand the file it is being asked to update. That is over-deletion.',
  ],
  [
    'tools/lib/state.js',
    'THE CAPABILITY, not a leak (AC2.4). This is the function itself. Deleting it would convert ' +
    'the measurement from "was not told to do it" into "could not do it" — the control arm would ' +
    'then prove only that removing an implementation removes its effect, which is not a fact ' +
    'about instructions at all. Every verdict drawn from such a run would be meaningless.',
  ],
  [
    'tools/lib/directive-classifier.js',
    'Apparatus. It names the token as data while classifying instruction kinds; it is part of ' +
    'the machinery doing the measuring, not part of the corpus being measured.',
  ],
  [
    'tools/lib/adherence-verdict.js',
    'Apparatus. Retained on the list defensively: M5.E15 S1.t7 scrubbed the verbatim instruction ' +
    'text out of this file, so it should produce no hits at all — but if measurement machinery ' +
    'reacquires a mention, that is an apparatus concern to review, not a corpus leak that should ' +
    'refuse a run.',
  ],
]);

/**
 * Every file under every copied directory that names the token.
 *
 * AC2.5 — this walks all of `PLUGIN_COPY_DIRS`, not just `commands/`. The
 * previous check looked only at the measured command file, which is precisely
 * how residue in four other files went unseen.
 *
 * @returns {{file:string, line:number, text:string}[]} `file` is tree-relative
 *   and always POSIX-separated, so allowlist keys compare identically on any OS.
 */
export function walkResidue(copyRoot, token) {
  const hits = [];

  const visit = dir => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a copy without one of these dirs is still measurable
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        visit(p);
        continue;
      }
      if (!e.isFile()) continue;
      let src;
      try {
        if (statSync(p).size > 2_000_000) continue; // not a corpus file
        src = readFileSync(p, 'utf-8');
      } catch {
        continue; // binary or unreadable — cannot state an instruction
      }
      if (!src.includes(token)) continue;
      src.split('\n').forEach((text, i) => {
        if (text.includes(token)) {
          hits.push({
            file: relative(copyRoot, p).split(sep).join('/'),
            line: i + 1,
            text: text.trim(),
          });
        }
      });
    }
  };

  for (const d of PLUGIN_COPY_DIRS) visit(join(copyRoot, d));
  return hits;
}

/**
 * Split residue into descriptive (allowlisted) and directive (everything else).
 *
 * AC2.2 — the default is DIRECTIVE. A file nobody has reviewed is not assumed
 * harmless; that assumption is what a leak needs in order to reach a verdict.
 */
export function classifyResidue(hits) {
  const descriptive = [];
  const directive = [];
  for (const hit of hits) {
    if (DESCRIPTIVE_ALLOWLIST.has(hit.file)) descriptive.push(hit);
    else directive.push(hit);
  }
  return { descriptive, directive };
}

/**
 * Walk the copied tree and decide whether it is a valid control arm.
 *
 * The `canary` option is accepted and IGNORED, deliberately. Callers already
 * hold the canary and would naturally pass it; taking it without consulting it
 * makes the independence explicit at the call site, and the coupling-guard test
 * hands over `deletions: []` and still requires a failure.
 *
 * @returns {{ok:boolean, directive:Array, descriptive:Array}} `ok` is true only
 *   when NO directive residue survives.
 */
// `_options` is unused BY DESIGN. It carries the canary that callers naturally
// hold, and never reading it is the exact property FR2 exists to guarantee.
// Deleting the parameter would satisfy the linter and erase the signal; the
// coupling-guard test pins the behaviour either way.
// eslint-disable-next-line no-unused-vars
export function checkLeak(copyRoot, token, _options = {}) {
  const { descriptive, directive } = classifyResidue(walkResidue(copyRoot, token));
  return { ok: directive.length === 0, directive, descriptive };
}

/**
 * The refusal message for directive residue, naming file and line (AC2.1).
 */
export function formatLeakRefusal(token, directive) {
  const lines = directive.map(h => `  ${h.file}:${h.line}  ${h.text.slice(0, 120)}`);
  return (
    `Control arm is not a control: ${directive.length} directive site(s) still name ` +
    `${token} after the mutation.\n${lines.join('\n')}\n` +
    'Any verdict from this run would be void — the arm labelled "instruction deleted" ' +
    'still carries the instruction. Declare these sites in the canary\'s deletions[], or ' +
    'add them to DESCRIPTIVE_ALLOWLIST with a reason if they do not order the call.'
  );
}
