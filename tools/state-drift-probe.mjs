#!/usr/bin/env node
// tools/state-drift-probe.mjs — M5.E16 S1.t4
//
// Runs the STATE-vs-world checks across MANY real projects and prints the
// applicability table. Read-only; writes nothing anywhere.
//
// Why this is a committed tool and not a paragraph in a document:
//
//   The PLAN for M5.E16 rests on a measurement — that checks (a) and (b) can
//   evaluate 2 of 13 real projects, and that Signal's own hand-maintained,
//   Epic-mode, schema_version-1 shape is the MINORITY shape. A number that only
//   exists in prose is a claim. A number anyone can re-derive by running one
//   command is a fact, and this project has a standing rule that completeness
//   claims must be derived, checked, or labelled unverified — never asserted
//   from memory (`analysis/CLAIM-INTEGRITY-ANALYSIS.md`).
//
//   It is also the answer to AC2.2, which asks for the projects used and their
//   results to be recorded — including any check killed by the precision gate.
//
// Usage:
//   node tools/state-drift-probe.mjs                  # scan siblings of cwd
//   node tools/state-drift-probe.mjs ../a ../b        # scan the given projects
//   node tools/state-drift-probe.mjs --json           # machine-readable
//
// Exit code is always 0 on a successful scan: this is a measuring instrument,
// not a gate. A project that cannot be evaluated is a RESULT, and the whole
// point of the exercise is that such results stay visible instead of being
// rounded down to "clean".

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

import { readState, PHASES, EPIC_ID_STRICT_RE } from './lib/state.js';
import { runDriftChecks, STATE_DRIFT_CHECKS, STATUS } from './lib/state-drift.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const explicit = args.filter((a) => !a.startsWith('--'));

async function discover() {
  if (explicit.length) return explicit.map((p) => resolve(p));
  // Default: every sibling directory of the current project that has a
  // .planning/STATE.md. Keeps the probe portable — no machine-specific paths.
  const parent = dirname(resolve(process.cwd()));
  const entries = await readdir(parent, { withFileTypes: true });
  return entries
    .filter((d) => d.isDirectory() && existsSync(join(parent, d.name, '.planning', 'STATE.md')))
    .map((d) => join(parent, d.name))
    .sort();
}

async function shapeOf(baseDir) {
  let state = null;
  let error = null;
  try {
    state = await readState(baseDir);
  } catch (err) {
    error = err.message;
  }
  if (error) return { readable: false, error };
  if (!state) return { readable: false, error: 'no .planning/STATE.md' };

  const epicRaw = state.current_epic;
  const epicSet = epicRaw !== null && epicRaw !== undefined && String(epicRaw).length > 0;
  return {
    readable: true,
    phase: state.phase,
    phaseCanonical: state.phase === null || PHASES.includes(state.phase),
    epicSet,
    epicStrict: epicSet && EPIC_ID_STRICT_RE.test(String(epicRaw)),
    epicRaw: epicSet ? String(epicRaw) : null,
    blockers: Array.isArray(state.blockers) ? state.blockers.length : 0,
  };
}

const projects = await discover();
const rows = [];

for (const dir of projects) {
  const shape = await shapeOf(dir);
  const drift = await runDriftChecks(dir, STATE_DRIFT_CHECKS);
  rows.push({ project: basename(dir), path: dir, shape, drift });
}

if (asJson) {
  console.log(JSON.stringify({ projects: rows, checks: STATE_DRIFT_CHECKS.map((c) => c.id) }, null, 2));
  process.exit(0);
}

const readable = rows.filter((r) => r.shape.readable);

console.log(`# STATE-vs-world probe — ${rows.length} project(s) with .planning/STATE.md\n`);
console.log('project'.padEnd(24) + 'phase'.padEnd(12) + 'canon'.padEnd(7) + 'epic'.padEnd(14) + 'strict');
console.log('-'.repeat(64));
for (const r of rows) {
  if (!r.shape.readable) {
    console.log(`${r.project.padEnd(24)}unreadable — ${r.shape.error.slice(0, 60)}`);
    continue;
  }
  const phase = String(r.shape.phase ?? '(null)').slice(0, 10);
  const epic = String(r.shape.epicRaw ?? '(linear)').slice(0, 12);
  console.log(
    r.project.padEnd(24) +
      phase.padEnd(12) +
      (r.shape.phaseCanonical ? 'yes' : 'NO').padEnd(7) +
      epic.padEnd(14) +
      (!r.shape.epicSet ? '—' : r.shape.epicStrict ? 'yes' : 'NO')
  );
}

console.log('\n## Shape of the real corpus');
console.log(`  readable STATE.md ........ ${readable.length}/${rows.length}`);
console.log(`  canonical phase .......... ${readable.filter((r) => r.shape.phaseCanonical).length}/${readable.length}`);
console.log(`  Epic mode ................ ${readable.filter((r) => r.shape.epicSet).length}/${readable.length}`);
console.log(`  ...of those, strict ID ... ${readable.filter((r) => r.shape.epicStrict).length}/${readable.filter((r) => r.shape.epicSet).length}`);
console.log(`  non-empty blockers[] ..... ${readable.filter((r) => r.shape.blockers > 0).length}/${readable.length}`);

if (STATE_DRIFT_CHECKS.length === 0) {
  console.log('\n## Checks\n  none registered yet — S1 ships the harness; S2/S3 register the checks.');
  console.log('  The shape table above is what determines what those checks will be able to see.');
  process.exit(0);
}

console.log('\n## Per-check outcome across the corpus');
const tally = {};
for (const r of rows) {
  for (const res of r.drift.results) {
    const t = (tally[res.id] ??= { findings: 0, clean: 0, na: 0, blind: 0 });
    if (res.status === STATUS.FINDINGS) t.findings += res.findings.length;
    else if (res.status === STATUS.CLEAN) t.clean++;
    else if (res.status === STATUS.NOT_APPLICABLE) t.na++;
    else t.blind++;
  }
}
console.log('check'.padEnd(28) + 'findings'.padEnd(10) + 'clean'.padEnd(8) + 'n/a'.padEnd(7) + 'cannot-eval');
console.log('-'.repeat(64));
for (const [id, t] of Object.entries(tally).sort()) {
  console.log(
    id.padEnd(28) + String(t.findings).padEnd(10) + String(t.clean).padEnd(8) +
    String(t.na).padEnd(7) + String(t.blind)
  );
}

console.log('\n## Findings');
let any = false;
for (const r of rows) {
  const hits = r.drift.results.filter((x) => x.status === STATUS.FINDINGS);
  if (!hits.length) continue;
  any = true;
  console.log(`\n  ${r.project}`);
  for (const h of hits) for (const f of h.findings) console.log(`    [${f.check}] ${f.message}`);
}
if (!any) console.log('  none');
