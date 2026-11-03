// Waves from a plan's dependency lines, computed rather than worked out by reading.
//
// The plan's `## Tasks` (or `## Slices`) section holds one `###`+ heading per task. Each heading
// leads with the task's ID (`S1`, `S1.t2`, `T3`), and each task carries one line naming what it
// waits for:
//
//   **Depends on:** S1.t1, S2      or      **Depends on:** none
//
// A heading whose ID has children (`S1` above `S1.t1`, `S1.t2`) is a group, not a task: its
// dependency line, if any, applies to every task under it, and depending on it means depending on
// every task under it.
//
// Refuses rather than guesses. A task with no dependency line is an error, never "no
// dependencies": every plan written before this format has free-text dependencies and no such
// line, and reading those as "everything in wave 1" would report success and be wrong.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePlanTasks } from './plan-consistency.js';

const TASKS_SECTION_RE = /^##\s+(?:Tasks|Slices)\b/i;
const SECTION_RE = /^#{1,2}\s/;
const FENCE_RE = /^\s*(```|~~~)/;
const TASK_ID_RE = /^[\s`*_]{0,6}([A-Za-z]{0,3}\d+(?:\.[A-Za-z]{0,3}\d+)*)(?=[\s`*_:—–-]|$)/;
const DEPENDS_RE = /^\s*(?:[-*]\s+)?[*_]{0,2}Depends on:?[*_]{0,2}:?\s*(.*)$/i;

/** The `## Tasks` section's lines, or null when the plan has none. */
function tasksSection(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => TASKS_SECTION_RE.test(l));
  if (start === -1) return null;
  const out = [];
  let inFence = false;
  for (const line of lines.slice(start + 1)) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (!inFence && SECTION_RE.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * The IDs named on one dependency line. Words that are not IDs (`and`, `then`) are dropped, and a
 * lowercase part written after a space joins the ID before it, so `S3 t1` reads as `S3.t1`.
 */
function dependsIds(text) {
  const ids = [];
  for (const part of text.split(/[,;]/)) {
    let prev = null;
    for (const raw of part.trim().split(/\s+/)) {
      const tok = raw.replace(/[.:]$/, '');
      if (!/^[A-Za-z]{0,3}\d+(?:\.[A-Za-z]{0,3}\d+)*$/.test(tok)) { prev = null; continue; }
      if (prev !== null && /^[a-z]{1,3}\d+$/.test(tok)) ids[prev] += '.' + tok;
      else { ids.push(tok); prev = ids.length - 1; }
    }
  }
  return ids;
}

/** Dependency lines outside code fences, each as its list of IDs. */
function dependsLines(body) {
  const found = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(DEPENDS_RE);
    if (!m) continue;
    const text = m[1].replace(/[`*_]/g, '').replace(/\([^)]*\)/g, ' ').trim();
    found.push(/^none\.?$/i.test(text) ? [] : dependsIds(text));
  }
  return found;
}

/**
 * @param {string} content — a PLAN artifact's text
 * @returns {{ok: true, warnings: string[], waves: Array<{wave: number, tasks: Array<{id: string, heading: string, body: string, dependsOn: string[]}>}>}
 *         | {ok: false, problems: string[]}}
 */
export function planWaves(content) {
  const section = typeof content === 'string' ? tasksSection(content) : null;
  if (section === null) return { ok: false, problems: ['The plan has no "## Tasks" section.'] };

  const problems = [];
  const units = [];
  const seen = new Set();
  for (const { heading, body } of parsePlanTasks(section)) {
    const m = heading.match(TASK_ID_RE);
    if (!m) { problems.push(`"${heading}" does not start with a task ID (like S1 or S1.t2).`); continue; }
    const id = m[1];
    if (seen.has(id)) { problems.push(`${id} is used by more than one task.`); continue; }
    seen.add(id);
    units.push({ id, heading, body, lines: dependsLines(body) });
  }
  if (units.length === 0 && problems.length === 0) problems.push('The "## Tasks" section has no tasks.');

  const childrenOf = (id) => units.filter((u) => u.id.startsWith(id + '.'));
  const isGroup = (u) => childrenOf(u.id).length > 0;
  const byId = new Map(units.map((u) => [u.id, u]));

  for (const u of units) {
    if (u.lines.length > 1) problems.push(`${u.id} has more than one "Depends on:" line.`);
    else if (u.lines.length === 0 && !isGroup(u)) {
      problems.push(`${u.id} has no "Depends on:" line. Write "Depends on: none" if it waits for nothing.`);
    }
  }

  // A task waits for its own line plus every enclosing group's line; a group ID stands for its tasks.
  const leaves = units.filter((u) => !isGroup(u));
  const expand = (id) => {
    const u = byId.get(id);
    return isGroup(u) ? childrenOf(id).filter((c) => !isGroup(c)).map((c) => c.id) : [id];
  };
  const deps = new Map();
  const notes = [];
  for (const leaf of leaves) {
    const named = [];
    for (const u of units) {
      if (u.id === leaf.id || leaf.id.startsWith(u.id + '.')) named.push(...(u.lines[0] ?? []));
    }
    const set = new Set();
    for (let d of named) {
      if (!byId.has(d)) {
        const parent = d.split('.').slice(0, -1).reduce((acc, p) => [...acc, acc.length ? `${acc.at(-1)}.${p}` : p], [])
          .reverse().find((a) => byId.has(a));
        if (!parent) { problems.push(`${leaf.id} depends on ${d}, which is not a task in the plan.`); continue; }
        notes.push(`${leaf.id} depends on ${d}, which has no heading of its own, so it waits for all of ${parent}.`);
        d = parent;
      }
      if (d === leaf.id || leaf.id.startsWith(d + '.')) { problems.push(`${leaf.id} depends on itself (${d}).`); continue; }
      for (const e of expand(d)) set.add(e);
    }
    deps.set(leaf.id, set);
  }
  if (problems.length > 0) return { ok: false, problems: [...new Set(problems)] };

  // Kahn's layering: wave N is every task whose dependencies are all in earlier waves.
  const waveOf = new Map();
  let remaining = leaves.map((l) => l.id);
  for (let wave = 1; remaining.length > 0; wave++) {
    const ready = remaining.filter((id) => [...deps.get(id)].every((d) => waveOf.has(d)));
    if (ready.length === 0) {
      return { ok: false, problems: [`These tasks wait on each other in a loop: ${remaining.join(', ')}.`] };
    }
    for (const id of ready) waveOf.set(id, wave);
    remaining = remaining.filter((id) => !waveOf.has(id));
  }

  const waves = [];
  for (const leaf of leaves) {
    const n = waveOf.get(leaf.id);
    waves[n - 1] ??= { wave: n, tasks: [] };
    waves[n - 1].tasks.push({ id: leaf.id, heading: leaf.heading, body: leaf.body, dependsOn: [...deps.get(leaf.id)] });
  }
  // A heading that still states a wave ("· wave 2 ·") is a second answer; say when it disagrees.
  const warnings = [...new Set(notes)];
  for (const leaf of leaves) {
    const stated = leaf.heading.match(/\bwave\s+(\d+)/i);
    if (stated && Number(stated[1]) !== waveOf.get(leaf.id)) {
      warnings.push(`${leaf.id}'s heading says wave ${stated[1]}, but its dependencies put it in wave ${waveOf.get(leaf.id)}.`);
    }
  }
  return { ok: true, waves, warnings };
}

/** One line per wave, for people. */
export function formatWaves(result) {
  if (!result.ok) return ['The plan cannot be split into waves:', ...result.problems.map((p) => `- ${p}`)].join('\n');
  const lines = result.waves.map((w) => `Wave ${w.wave}: ${w.tasks.map((t) => t.id).join(', ')}`);
  return [...lines, ...(result.warnings ?? []).map((w) => `Warning: ${w}`)].join('\n');
}

// CLI: node plan-waves.js <plan file> [--json]. Exit 1 when the plan is refused.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node plan-waves.js <plan file> [--json]');
    process.exitCode = 2;
  } else {
    const result = planWaves(readFileSync(file, 'utf-8'));
    console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : formatWaves(result));
    process.exitCode = result.ok ? 0 : 1;
  }
}
