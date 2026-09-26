// tools/lib/state-facts.js — M6.E3 t1.4: what the Jev STATE.md check reads,
// and the facts it judges against.
//
// Two rules decide everything here:
//
// 1. Paragraphs carry their 1-based line IN THE FILE, not in the body. A receipt
//    cites `STATE.md:<line>`; a body-relative number would be wrong by exactly
//    the frontmatter's length, and `M6.E7` shipped an advisory whose every
//    citation was off by five for a reason of this size.
//
// 2. The fact list is closed, built by code, and holds TEXT for sameness
//    judgments only — names, ids, a version string (AC9.1, AC9.5). Never dates
//    or counts: Jev's own documented weaknesses are counting (#2) and dates read
//    as text (#3). `completed_phases` therefore loses its dates, and blockers,
//    timestamps and totals are left out entirely. A paragraph whose only claim
//    is a number gets no finding from Jev — by design (M6.E3-RESEARCH Finding 9).
//
// Only sources every Signal project has are read (`NFR4`): STATE.md
// frontmatter, and a version manifest when one exists. What is missing is named
// in `unavailable`, never silently dropped.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Index of the closing `---` of a leading frontmatter block, or -1. */
function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return i;
  return -1;
}

/**
 * Split STATE.md into body paragraphs (runs of non-blank lines).
 * @returns {Array<{line: number, text: string}>} `line` is 1-based, in the file.
 */
export function splitParagraphs(raw) {
  const lines = String(raw).split(/\r?\n/);
  const end = frontmatterEnd(lines);
  const out = [];
  let buf = [];
  let start = 0;
  for (let i = end + 1; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : '';
    if (line.trim() === '') {
      if (buf.length) out.push({ line: start + 1, text: buf.join('\n') });
      buf = [];
    } else {
      if (!buf.length) start = i;
      buf.push(line);
    }
  }
  return out;
}

function lineOf(lines, re, from = 0, to = lines.length) {
  for (let i = from; i < to; i++) if (re.test(lines[i])) return i + 1;
  return null;
}

const phaseName = (entry) => String(entry).replace(/\s*\(.*\)\s*$/, '').trim();

async function readVersion(baseDir) {
  // A Claude Code plugin's manifest decides the version its users see; Signal's
  // own lives one level down (`plugin/`). package.json is the general fallback.
  for (const rel of ['.claude-plugin/plugin.json', 'plugin/.claude-plugin/plugin.json', 'package.json']) {
    let raw;
    try {
      raw = await readFile(join(baseDir, rel), 'utf8');
    } catch {
      continue;
    }
    let version;
    try {
      version = JSON.parse(raw)?.version;
    } catch {
      continue;
    }
    if (typeof version !== 'string' || !version.trim()) continue;
    const line = lineOf(raw.split(/\r?\n/), /"version"\s*:/) ?? 1;
    return { version, source: rel, line };
  }
  return null;
}

/**
 * @param {string} baseDir
 * @param {object} state `readState` output
 * @returns {Promise<{
 *   facts: Record<string, string>,
 *   sources: Record<string, {source: string, line: number}>,
 *   unavailable: string[],
 * }>}
 */
export async function buildFactList(baseDir, state) {
  const facts = {};
  const sources = {};
  const unavailable = [];

  let lines = [];
  try {
    lines = (await readFile(join(baseDir, '.planning/STATE.md'), 'utf8')).split(/\r?\n/);
  } catch {
    // Facts still come from `state`; sources fall back to line 1.
  }
  const fmEnd = Math.max(frontmatterEnd(lines), 0);
  const fm = (key) => ({ source: '.planning/STATE.md frontmatter', line: lineOf(lines, new RegExp(`^${key}:`), 0, fmEnd) ?? 1 });

  const phase = typeof state?.phase === 'string' && state.phase ? state.phase : null;
  const epic = typeof state?.current_epic === 'string' && state.current_epic ? state.current_epic : null;

  if (phase) {
    facts.phase = phase;
    sources.phase = fm('phase');
  } else {
    unavailable.push('phase (not set)');
  }

  if (epic) {
    facts.current_epic = epic;
    sources.current_epic = fm('current_epic');
  } else {
    unavailable.push('current_epic (linear mode)');
  }

  if (phase) {
    facts.in_flight = epic
      ? `${epic}, at its ${phase} phase${phase === 'SHIP' ? ' (an Epic at SHIP is in flight until it closes)' : ''}`
      : `work at its ${phase} phase`;
    sources.in_flight = epic ? fm('current_epic') : fm('phase');
  }

  const tasks = Array.isArray(state?.current_tasks) ? state.current_tasks.map((t) => t?.id).filter(Boolean) : [];
  facts.current_tasks = tasks.length ? tasks.join(', ') : 'none';
  sources.current_tasks = fm('current_tasks');

  const done = Array.isArray(state?.completed_phases) ? [...new Set(state.completed_phases.map(phaseName).filter(Boolean))] : [];
  facts.completed_phases = done.length ? done.join(', ') : 'none';
  sources.completed_phases = fm('completed_phases');

  const v = await readVersion(baseDir);
  if (v) {
    facts.version = v.version;
    sources.version = { source: v.source, line: v.line };
  } else {
    unavailable.push('version (no plugin.json or package.json)');
  }

  return { facts, sources, unavailable };
}
