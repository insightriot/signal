// tools/lib/roster.js — the single filesystem-glob roster authority (M5.E3.S2.t1).
//
// One source of truth for WHAT the plugin ships: the counts + lists of commands,
// agents, and skills, read straight from disk. `validate-plugin.js` sources its
// command existence-check from here, and the FR4 all-docs hygiene guard (S3)
// reconciles prose count-claims (README, CLAUDE.md, docs/map) against it — so the
// roster never drifts from a second hand-maintained copy.
//
// The walks are ANCHORED at the specific top-level dirs (`commands/`, `agents/`,
// `skills/`), never a repo-wide recursive glob. That matters: a duplicate plugin
// tree lives under `.claude/worktrees/dogfood-status/` (its own `plugin.json` +
// `commands/` + `agents/`); a `**/commands/**` walk would double-count it. Since
// we only ever descend from the three anchors, that tree is structurally out of
// reach.

import { readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// roster.js lives in tools/lib/ → repo root is two levels up.
export const ROOT = join(__dirname, '..', '..');

/**
 * Recursively collect files under `dir` matching `predicate`, returned as
 * POSIX-relative paths from `baseDir`, sorted ascending. Missing `dir` → `[]`.
 * Deterministic (sorted by path; no mtime anywhere).
 *
 * @param {string} baseDir  root the returned paths are relative to
 * @param {string} dir      absolute directory to walk
 * @param {(name: string) => boolean} predicate  filename test
 * @returns {string[]}
 */
function collect(baseDir, dir, predicate) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collect(baseDir, full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      // POSIX-normalize for stable, platform-independent paths. `relative` (not a
      // raw slice) so a relative baseDir like '.' — where join() normalizes the
      // leading './' away — doesn't chop real path chars (B18).
      out.push(relative(baseDir, full).split('\\').join('/'));
    }
  }
  out.sort();
  return out;
}

/**
 * Commands: the flat `commands/*.md` set (commands are never nested).
 * @param {string} [baseDir=ROOT]
 * @returns {string[]} sorted POSIX-relative paths
 */
export function listCommands(baseDir = ROOT) {
  const dir = join(baseDir, 'commands');
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => `commands/${e.name}`)
    .sort();
}

/**
 * Agents: every `*.md` under `agents/` (recursive — agents nest by role).
 * @param {string} [baseDir=ROOT]
 * @returns {string[]} sorted POSIX-relative paths
 */
export function listAgents(baseDir = ROOT) {
  return collect(baseDir, join(baseDir, 'agents'), (n) => n.endsWith('.md'));
}

/**
 * Skills: every `SKILL.md` under `skills/` (recursive — one per skill dir).
 * @param {string} [baseDir=ROOT]
 * @returns {string[]} sorted POSIX-relative paths
 */
export function listSkills(baseDir = ROOT) {
  return collect(baseDir, join(baseDir, 'skills'), (n) => n === 'SKILL.md');
}

/**
 * The full roster: lists + counts, from disk. Deterministic.
 * @param {string} [baseDir=ROOT]
 * @returns {{commands: string[], agents: string[], skills: string[], counts: {commands: number, agents: number, skills: number}}}
 */
export function roster(baseDir = ROOT) {
  const commands = listCommands(baseDir);
  const agents = listAgents(baseDir);
  const skills = listSkills(baseDir);
  return {
    commands,
    agents,
    skills,
    counts: { commands: commands.length, agents: agents.length, skills: skills.length },
  };
}
