#!/usr/bin/env node
// NFR5 — run every check M5.E10 shipped across the eval corpus and report, per
// check, how many projects it can actually EVALUATE.
//
// READ-ONLY. Nothing is written to any corpus project; this reads `.planning/`
// documents and prints. No Signal command is pointed at a corpus project — see
// `references/eval-corpus.md`, and `examples/sandbox/` for the throwaway tree
// built to be run against.
//
// WHY THIS EXISTS. A check that runs against twelve projects, reports findings
// from four, and says nothing about the other eight reads as a clean bill of
// health for all twelve. `M5.E16` shipped six checks and measured that the two
// aimed at its own originating incident could evaluate 2 of 13 projects — a
// number that could not have come from this repository, whose shape is the
// minority shape.
//
// Usage:  node tools/measure-corpus.js <dir-of-projects> [...more]

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import { diffRequirementCoverage, COVERAGE } from '../plugin/tools/lib/requirement-coverage.js';
import { checkValidationConsistency, CONSISTENCY } from '../plugin/tools/lib/validation-consistency.js';
import { validateVerificationContent } from '../plugin/tools/lib/verification-template.js';
import { checkCorrectionProtocol, CORRECTION } from '../plugin/tools/lib/correction-protocol.js';
import { retroIndexFreshness, RETRO_FRESHNESS } from '../plugin/tools/lib/sweep.js';
import { backlogDischargeStatus, BACKLOG_DISCHARGE } from '../plugin/tools/lib/backlog.js';
import { runDriftChecks } from '../plugin/tools/lib/state-drift.js';

const EVALUABLE = 'evaluable';
const BLIND = 'could-not-evaluate';

function planningDocs(dir) {
  const p = join(dir, '.planning');
  if (!existsSync(p)) return null;
  try {
    return readdirSync(p).filter((f) => f.endsWith('.md'));
  } catch {
    return null;
  }
}

const read = (dir, name) => {
  try {
    return readFileSync(join(dir, '.planning', name), 'utf8');
  } catch {
    return null;
  }
};

/** Pair a REQUIREMENTS artifact with the VERIFICATION of the same unit. */
function pairs(files) {
  const out = [];
  for (const f of files.filter((x) => x.endsWith('REQUIREMENTS.md'))) {
    const unit = f.replace(/-?REQUIREMENTS\.md$/, '');
    const ver = files.find((x) => x === `${unit}-VERIFICATION.md` || (unit === '' && x === 'VERIFICATION.md'));
    if (ver) out.push({ unit: unit || '(root)', req: f, ver });
  }
  return out;
}

async function measureProject(dir) {
  const files = planningDocs(dir);
  const r = {};
  if (!files) {
    for (const k of ['coverage', 'validation', 'template', 'correction', 'retro-index', 'narrative', 'backlog'])
      r[k] = { status: BLIND, reason: 'no .planning/ directory' };
    return r;
  }

  // FR1 — requirement-coverage diff
  const ps = pairs(files);
  if (ps.length === 0) {
    r.coverage = { status: BLIND, reason: 'no REQUIREMENTS/VERIFICATION pair in the same unit' };
  } else {
    let evaluated = 0;
    let missing = 0;
    for (const p of ps) {
      const res = diffRequirementCoverage({
        requirementsText: read(dir, p.req),
        verificationText: read(dir, p.ver),
      });
      if (res.outcome !== COVERAGE.CANNOT_EVALUATE) {
        evaluated++;
        if (res.outcome === COVERAGE.MISSING) missing++;
      }
    }
    r.coverage = evaluated
      ? { status: EVALUABLE, detail: `${evaluated}/${ps.length} pairs, ${missing} with missing requirements` }
      : { status: BLIND, reason: `${ps.length} pair(s), none evaluable` };
  }

  // FR2 — VALIDATION self-consistency
  const vals = files.filter((f) => f.endsWith('VALIDATION.md'));
  if (vals.length === 0) {
    r.validation = { status: BLIND, reason: 'no VALIDATION artifact' };
  } else {
    let evaluated = 0;
    let inconsistent = 0;
    for (const v of vals) {
      const res = checkValidationConsistency(read(dir, v));
      if (res.outcome !== CONSISTENCY.CANNOT_EVALUATE) {
        evaluated++;
        if (res.outcome === CONSISTENCY.INCONSISTENT) inconsistent++;
      }
    }
    r.validation = evaluated
      ? { status: EVALUABLE, detail: `${evaluated}/${vals.length} artifacts, ${inconsistent} self-contradicting` }
      : { status: BLIND, reason: `${vals.length} artifact(s), none comparable (namespace or shape)` };
  }

  // FR3 — VERIFICATION template gate. Tier comes from PROFILE; without one the
  // gate has no contract to apply, which is a real blindness, not a pass.
  const profile = read(dir, 'PROFILE.md');
  const tier = /^tier:\s*(SKETCH|FEATURE|SPIKE|FULL)/m.exec(profile ?? '')?.[1];
  const vers = files.filter((f) => f.endsWith('VERIFICATION.md'));
  if (!tier) r.template = { status: BLIND, reason: 'no readable tier in PROFILE.md' };
  else if (vers.length === 0) r.template = { status: BLIND, reason: 'no VERIFICATION artifact' };
  else {
    let failing = 0;
    for (const v of vers) if (!validateVerificationContent(read(dir, v), tier).valid) failing++;
    r.template = { status: EVALUABLE, detail: `${vers.length} artifacts at ${tier}, ${failing} would fail the gate` };
  }

  // FR4 — correction protocol. Needs a claim to search for, which only a person
  // has; what is measurable is whether the corpus is searchable at all.
  const corpus = files.map((f) => ({ path: f, content: read(dir, f) ?? '' }));
  const probe = checkCorrectionProtocol({ claim: 'RETRACTED', files: corpus });
  r.correction =
    probe.outcome === CORRECTION.CANNOT_EVALUATE
      ? { status: BLIND, reason: probe.reason }
      : { status: EVALUABLE, detail: `${corpus.length} documents searchable` };

  // FR7 — retro-index freshness
  const retro = await retroIndexFreshness(dir);
  r['retro-index'] =
    retro.outcome === RETRO_FRESHNESS.CANNOT_EVALUATE
      ? { status: BLIND, reason: retro.reason }
      : { status: EVALUABLE, detail: `${retro.outcome} (${retro.retroCount} retros)` };

  // FR8 — STATE narrative vs frontmatter
  try {
    const drift = await runDriftChecks(dir);
    const row = drift.results.find((x) => x.id === 'narrative-phase-contradicts-frontmatter');
    r.narrative =
      !row || row.status === 'cannot-evaluate' || row.status === 'not-applicable'
        ? { status: BLIND, reason: row?.reason ?? 'check did not run' }
        : { status: EVALUABLE, detail: `${row.status} (${row.findings?.length ?? 0} findings)` };
  } catch (err) {
    r.narrative = { status: BLIND, reason: `drift checks threw — ${err.message}` };
  }

  // FR9 — backlog rows asserting `pending` about closed work
  const backlog = await backlogDischargeStatus(dir);
  r.backlog =
    backlog.outcome === BACKLOG_DISCHARGE.CANNOT_EVALUATE
      ? { status: BLIND, reason: backlog.reason }
      : { status: EVALUABLE, detail: `${backlog.outcome} (${backlog.resolvable} resolvable rows)` };

  return r;
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: node tools/measure-corpus.js <dir-of-projects> [...]');
  process.exit(2);
}

const projects = [];
for (const root of roots) {
  for (const e of readdirSync(root)) {
    const p = join(root, e);
    try {
      if (statSync(p).isDirectory() && existsSync(join(p, '.planning'))) projects.push(p);
    } catch {
      /* unreadable entry — skipped, and the count below reflects it */
    }
  }
}

const CHECKS = ['coverage', 'validation', 'template', 'correction', 'retro-index', 'narrative', 'backlog'];
const results = [];
for (const p of projects) results.push({ name: basename(p), r: await measureProject(p) });

console.log(`\neval corpus: ${results.length} projects with a .planning/ tree\n`);
console.log('| Check | Could evaluate | Could not | Blind reasons (most common) |');
console.log('|---|---|---|---|');
for (const c of CHECKS) {
  const ok = results.filter((x) => x.r[c]?.status === EVALUABLE);
  const no = results.filter((x) => x.r[c]?.status !== EVALUABLE);
  const reasons = {};
  for (const x of no) {
    const why = (x.r[c]?.reason ?? 'unknown').replace(/\d+/g, 'N').slice(0, 58);
    reasons[why] = (reasons[why] ?? 0) + 1;
  }
  const top = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([w, n]) => `${w} (${n})`)
    .join('; ');
  console.log(`| ${c} | **${ok.length}/${results.length}** | ${no.length} | ${top || '—'} |`);
}
// Labels must be STABLE across runs and consistent with the ones already used
// in Signal's documents — `eval-project-C` has to mean the same project here
// that it means in `tests/fixtures/claim-integrity/README.md`. Positional
// labelling gave a different answer every time the directory listing changed,
// which would have made every recorded measurement quietly incomparable.
//
// The assignment is keyed by a HASH of the directory name, so the names
// themselves appear nowhere in this repository (see `references/eval-corpus.md`
// and `tests/private-name-guard.test.js`).
const KNOWN_LABELS = new Map([
  // ALL corpus members are pinned, not just the first five (`B98`).
  //
  // Before this, `A`–`E` were pinned and `F` onward came from `spare.shift()`
  // over a hash-sorted list — so adding or removing ONE project renamed every
  // unpinned one. The comment below already claimed stability; it held for
  // `A`–`E` and for nothing past it, while `references/eval-corpus.md` published
  // A–L and `CLAUDE.md` cited `eval-project-L`. Measured while fixing it: the
  // set changed twice inside ten minutes, and `c983…` moved `M` → `L` between
  // two runs. A letter is now a property of the project, not of the roster.
  //
  // A NEW project takes the next free letter and keeps it forever. A project
  // that leaves does NOT free its letter — reusing one would make two different
  // projects share a label across releases, which is the whole failure.
  ['089f4667dcc1924d', 'D'],
  ['1a6ed3839eed3172', 'F'],
  ['26eab90d2b0be7cd', 'G'],
  ['38dfd52ec35ea8b8', 'H'],
  ['4b3e37e57f00dcdc', 'B'],
  ['5709cb590880d6d6', 'E'],
  ['733aee8b43e1f22f', 'I'],
  ['aafd6a4c64386852', 'J'],
  ['ae0162a32c456b36', 'A'],
  ['b1785dc8b4c98350', 'C'],
  ['b984b04187721cbc', 'K'],
  ['bee98bf120e89063', 'L'],
  ['c983c585ac3c40d9', 'M'],
]);

const { createHash } = await import('node:crypto');
const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const taken = new Set(KNOWN_LABELS.values());
const spare = [...'FGHIJKLMNOPQRSTUVWXYZ'].filter((c) => !taken.has(c));
const labelled = results
  .map((x) => ({ ...x, h: digest(x.name) }))
  .sort((a, b) => a.h.localeCompare(b.h))
  .map((x) => {
    const letter = KNOWN_LABELS.get(x.h) ?? spare.shift() ?? '?';
    return { ...x, label: `eval-project-${letter}` };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

console.log('\nPer project (stable labels — see references/eval-corpus.md):\n');
for (const x of labelled) {
  const line = CHECKS.map((c) => `${c}:${x.r[c]?.status === EVALUABLE ? 'Y' : 'n'}`).join(' ');
  console.log(`  ${x.label.padEnd(16)} ${line}`);
}
