#!/usr/bin/env node
// tools/cross-project-scan.js — cross-project analysis.
//
// A MAINTAINER TOOL, NOT A SIGNAL FEATURE. It is repo-local, like
// `cut-release.js` and `adherence-ceiling.js`: no `/sig:` command, not in the
// roster, not in the command count. A Signal *user* has one project and already
// has `/sig:sweep`; this walks MANY projects to measure how Signal behaves in
// the wild, which is a question only the maintainer asks.
//
// WHY IT EXISTS. Signal is used on ~23 local projects that generate evidence
// continuously, and the only collection mechanism was a person noticing
// something and writing it up. Every cross-project measurement ever run found
// something on the first try — `B82` (3 split units across 2 projects, invisible
// in Signal's own tree), M5.E18 (archiving 67 files/1 project -> 114/6 once
// measured), M5.E16 (3 of 13 projects not evaluable at all) — and every one was
// an ad-hoc script written by hand in the moment. This is that script, kept.
//
// It is the `UNREACHED-MECHANISM-ANALYSIS.md` shape applied to Signal itself:
// the evidence existed and nothing routed it.
//
// TWO JOBS, and the second may matter more:
//   1. Surface new findings across the corpus.
//   2. Rank the EXISTING bug backlog by real incidence. 30 confirmed-open bugs
//      are 30 equally-weighted prose rows; this says which fire in 18 of 23
//      projects and which fire in none.
//
// ABSOLUTE RULE: READ-ONLY. It opens files and never writes to a scanned
// project — not a temp file, not a lock, not a stamp. Several of these projects
// are production. Every helper below is chosen because it only reads.
//
// REPORTING DISCIPLINE (M5.E16): a check that COULD NOT RUN must never render as
// a check that found nothing. Every counter below has a `blind` sibling, and the
// report prints it even at zero.
//
// Usage:
//   node tools/cross-project-scan.js [dir...]     # scan roots (default: repo parent)
//   node tools/cross-project-scan.js --json       # machine-readable

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readState, PHASES } from './lib/state.js';
import { readProfile, readEffectiveProfile } from './lib/profile.js';
import { runDriftChecks } from './lib/state-drift.js';
import { resolveClosures, CLOSURE } from './lib/closure.js';
import { senseArchiveTree } from './lib/archive-tree.js';
import { deriveUnits } from './lib/work-units.js';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

/** Every directory under `dir` that carries a `.planning/`. */
async function discover(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (existsSync(join(p, '.planning'))) out.push(p);
  }
  return out.sort();
}

/**
 * Scan one project. Never throws: a project that cannot be read is a REPORTED
 * blindness, not a crash that takes the corpus with it. `eval-project-B` throws
 * on `readState` today, and losing the other 22 to it would be the defect this
 * whole tool exists to remove.
 */
export async function scanProject(dir) {
  const r = { dir, name: basename(dir), findings: [], blind: [] };

  const planning = join(dir, '.planning');
  let names = [];
  try {
    names = (await readdir(planning)).filter((f) => f.endsWith('.md'));
  } catch (err) {
    r.blind.push({ id: 'planning-unreadable', why: err.message });
    return r;
  }

  // --- STATE ---------------------------------------------------------------
  let state = null;
  try {
    state = await readState(dir);
    if (state === null) r.blind.push({ id: 'no-state', why: 'no .planning/STATE.md' });
  } catch (err) {
    r.blind.push({ id: 'state-unparseable', why: err.message });
  }

  // `B87` incidence — a phase ran and never entered the ledger. PROGRESS on disk
  // is proof EXECUTE happened; the ledger is the claim. Only meaningful when we
  // can read both.
  if (state) {
    const logged = (state.completed_phases ?? []).map((p) => String(p).split(' ')[0]);
    const unit = state.current_epic;
    const hasProgress = unit && names.includes(`${unit}-PROGRESS.md`);
    if (hasProgress && !logged.includes('EXECUTE')) {
      // RECLASSIFIED 2026-08-08, and the reasoning is recorded because the
      // change makes a counter go green and therefore deserves scrutiny.
      //
      // Before `B87`'s fix this was a SIGNAL DEFECT: nothing in Signal could see
      // a phase that ran and left no ledger entry, so every instance was
      // Signal's blindness. After the fix, `phase-log-gap` in `state-drift.js`
      // detects it and `/sig:sweep` + `/sig:resume` report it — so a remaining
      // instance is a fact about that PROJECT's ledger that a person must judge,
      // not a bug here. The log is append-only (`D-M5E9-5`), so some instances
      // are permanent and correct to leave.
      //
      // The test of whether this is honest rather than convenient: Signal now
      // SURFACES the condition where it occurs. If that ever stops being true,
      // this belongs back in `signal-defect`.
      r.findings.push({
        id: 'B87-phase-ran-unlogged', kind: 'project-advisory',
        detail: `${unit}-PROGRESS.md exists but EXECUTE is absent from completed_phases`,
      });
    }
    if (state.phase && !PHASES.includes(state.phase)) {
      r.findings.push({ id: 'phase-not-canonical', kind: 'project-advisory', detail: `phase: ${state.phase}` });
    }
  }

  // --- PROFILE / tier ------------------------------------------------------
  // `B90` incidence — what tier is this project ACTUALLY running at, and does a
  // per-unit profile ever override it? The claim being tested: everything runs
  // at the project tier because nobody knows the dial turns down.
  try {
    const proj = await readProfile(dir);
    r.tier = proj.tier;
    const epicProfiles = names.filter((n) => /-PROFILE\.md$/.test(n));
    r.perUnitProfiles = epicProfiles.length;
    if (proj.tier === 'FULL' && epicProfiles.length === 0) {
      r.findings.push({
        id: 'B90-tier-dial-unused', kind: 'project-advisory',
        detail: 'project tier FULL and no {unit}-PROFILE.md exists — every slice pays FULL',
      });
    }
    if (state?.current_epic) {
      try {
        const eff = await readEffectiveProfile(dir, { currentEpic: state.current_epic });
        r.effectiveTier = eff.tier;
      } catch (err) {
        r.findings.push({ id: 'B59-epic-profile-unparseable', kind: 'signal-defect', detail: err.message });
      }
    }
  } catch (err) {
    r.blind.push({ id: 'profile-unreadable', why: err.message });
  }

  // --- STATE-vs-world drift ------------------------------------------------
  try {
    const d = await runDriftChecks(dir);
    for (const c of d.results) {
      if (c.status === 'findings' || (c.findings?.length ?? 0) > 0) {
        r.findings.push({ id: `drift:${c.id}`, kind: 'project-advisory', detail: c.findings?.[0]?.message ?? c.reason ?? '' });
      } else if (c.status === 'blind' || c.status === 'cannotEvaluate') {
        r.blind.push({ id: `drift:${c.id}`, why: c.reason ?? 'not evaluable' });
      }
    }
  } catch (err) {
    r.blind.push({ id: 'drift-checks', why: err.message });
  }

  // --- closure + archive ---------------------------------------------------
  try {
    const c = await resolveClosures(dir);
    r.closure = c.counts;
    if (!c.stateReadable) r.blind.push({ id: 'closure', why: c.reason ?? 'STATE unreadable' });
    const undecidable = c.units.filter((u) => u.status === CLOSURE.CANNOT_DETERMINE).length;
    if (undecidable > 0) {
      r.findings.push({
        id: 'closure-undecidable', kind: 'project-advisory',
        detail: `${undecidable} of ${c.units.length} unit(s) have no readable verdict`,
      });
    }
  } catch (err) {
    r.blind.push({ id: 'closure', why: err.message });
  }

  try {
    const a = await senseArchiveTree(dir);
    const { units, ungrouped } = deriveUnits(names);
    r.archivable = a.moves.length;
    r.ungrouped = ungrouped.length;

    // `B82` regression detector. Fixed in v0.1.21 — kept because this is the
    // only place it could ever have been caught, and a silent return to 0 is
    // the point.
    const planned = new Set(a.moves.map((m) => m.from.replace('.planning/', '')));
    let stranded = 0;
    for (const u of a.closedUnits ?? []) {
      const derived = units.get(u) ?? [];
      const missed = derived.filter((f) => !planned.has(f));
      if (missed.length && derived.length !== missed.length) stranded += missed.length;
    }
    if (stranded > 0) {
      r.findings.push({ id: 'B82-unit-split', kind: 'signal-defect', detail: `${stranded} file(s) stranded` });
    }
    if (a.moves.length > 0) {
      r.findings.push({
        id: 'archivable-work-pending', kind: 'project-advisory',
        detail: `${a.moves.length} file(s) in closed units still in the live root`,
      });
    }
  } catch (err) {
    r.blind.push({ id: 'archive', why: err.message });
  }

  return r;
}

/**
 * Scan a corpus and return the split, for programmatic callers (the release
 * gate). Returns data, never text — a caller that greps a human report is a
 * second implementation of the classification.
 *
 * @param {string[]} [roots] directories to search; defaults to the repo's parent
 * @returns {Promise<{scanned: number, defects: Array, advisories: Array, blind: Array}>}
 */
export async function scanCorpus(roots) {
  let projects = [];
  if (roots?.length) {
    for (const r of roots) {
      const abs = resolve(r);
      projects.push(...(existsSync(join(abs, '.planning')) ? [abs] : await discover(abs)));
    }
  } else {
    projects = await discover(dirname(ROOT));
  }

  const results = [];
  for (const p of projects) results.push(await scanProject(p));

  const bucket = (want) => {
    const by = new Map();
    for (const r of results) {
      for (const f of r.findings) {
        if ((f.kind ?? 'signal-defect') !== want) continue;
        if (!by.has(f.id)) by.set(f.id, []);
        by.get(f.id).push(r.name);
      }
    }
    return [...by.entries()]
      .map(([id, projectsHit]) => ({ id, projects: projectsHit }))
      .sort((a, b) => b.projects.length - a.projects.length);
  };

  return {
    scanned: results.length,
    defects: bucket('signal-defect'),
    advisories: bucket('project-advisory'),
    blind: results.flatMap((r) => r.blind.map((b) => ({ project: r.name, ...b }))),
  };
}

export function render(results) {
  const L = [];
  const n = results.length;
  L.push('== Cross-project analysis ==', '');
  L.push(`Scanned ${n} project(s) with a .planning/ directory.`, '');

  // Rank by INCIDENCE — how many projects a finding hits — not by a per-project
  // dump. 23 projects x a dozen checks is a wall that gets muted after one run,
  // and a muted detector is worse than none.
  const byId = new Map();
  for (const r of results) {
    for (const f of r.findings) {
      if (!byId.has(f.id)) byId.set(f.id, []);
      byId.get(f.id).push(r);
    }
  }
  // Two categories, never one list. A DEFECT IN SIGNAL is something to fix here;
  // a PROJECT ADVISORY is work waiting in someone's repo. Ranking them together
  // reads as "Signal is broken in six ways" when most rows are a to-do list, and
  // it makes a fix-and-rescan loop unfalsifiable: advisory counts cannot move
  // until a human acts on a project, so chasing them tempts you to weaken the
  // check instead. Found by using this tool on its own first output.
  const kindOf = new Map();
  for (const r of results) for (const f of r.findings) kindOf.set(f.id, f.kind ?? 'signal-defect');
  const rank = (want) =>
    [...byId.entries()]
      .filter(([id]) => (kindOf.get(id) ?? 'signal-defect') === want)
      .sort((a, b) => b[1].length - a[1].length);

  const defects = rank('signal-defect');
  L.push('— DEFECTS IN SIGNAL — fix these here (this is what a fix/rescan loop drives to zero) —', '');
  if (defects.length === 0) {
    L.push('  none across the corpus.');
  } else {
    for (const [id, hits] of defects) {
      L.push(`  ${String(hits.length).padStart(2)}/${n}  ${id}`);
      L.push(`         ${hits.map((h) => h.name).join(', ')}`);
    }
  }
  L.push('');

  const advisories = rank('project-advisory');
  L.push('— PROJECT ADVISORIES — work waiting in a repo, not a Signal bug —', '');
  if (advisories.length === 0) {
    L.push('  none across the corpus.');
  } else {
    for (const [id, hits] of advisories) {
      L.push(`  ${String(hits.length).padStart(2)}/${n}  ${id}`);
      L.push(`         ${hits.map((h) => h.name).join(', ')}`);
    }
  }
  L.push('');

  // Blindness gets its own section and prints at zero (M5.E16). A corpus report
  // that silently omits what it could not read is the exact defect this repo
  // has shipped two Epics to remove.
  const blindById = new Map();
  for (const r of results) {
    for (const b of r.blind) {
      if (!blindById.has(b.id)) blindById.set(b.id, []);
      blindById.get(b.id).push(r.name);
    }
  }
  if (blindById.size === 0) {
    L.push('— Could not check: nothing. Every check ran on every project. —');
  } else {
    L.push('— Could NOT be checked (not the same as clean) —', '');
    for (const [id, who] of [...blindById.entries()].sort((a, b) => b[1].length - a[1].length)) {
      L.push(`  ${String(who.length).padStart(2)}/${n}  ${id}`);
      L.push(`         ${who.join(', ')}`);
    }
  }
  L.push('');

  L.push('— Tier distribution (B90 evidence) —');
  const tiers = new Map();
  for (const r of results) {
    const k = r.tier ?? '(unreadable)';
    tiers.set(k, (tiers.get(k) ?? 0) + 1);
  }
  for (const [t, c] of [...tiers.entries()].sort()) L.push(`  ${t.padEnd(12)} ${c}`);
  const withOverride = results.filter((r) => (r.perUnitProfiles ?? 0) > 0).length;
  L.push(`  projects using a per-unit PROFILE override: ${withOverride}/${n}`);

  return L;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) await main();

async function main() {
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const roots = args.filter((a) => !a.startsWith('--'));

let projects = [];
if (roots.length > 0) {
  for (const r of roots) {
    const abs = resolve(r);
    projects.push(...(existsSync(join(abs, '.planning')) ? [abs] : await discover(abs)));
  }
} else {
  projects = await discover(dirname(ROOT));
}

if (projects.length === 0) {
  process.stdout.write('No projects with a .planning/ directory found.\n');
  process.exit(0);
}

const results = [];
for (const p of projects) results.push(await scanProject(p));

if (asJson) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} else {
  process.stdout.write(`${render(results).join('\n')}\n`);
}
}
