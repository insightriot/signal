// /sig:checkpoint — manual state-refresh helpers (M4.5.E6.S2).
//
// Quick mode (default): diff git log since last_updated_commit against
// STATE.md's recorded state, render the diff, write under strict gate.
// --context mode (D16): additionally prompt for decisions + open questions
// and dual-write them to CONTEXT.md (§Locked Decisions) AND DECISIONS.md.

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import {
  readState,
  isStateStale,
  detectOrphans,
  clearCurrentTask,
} from './state.js';
import { scrubSensitive } from './add.js';

// Vocabulary task-ID regex (per Signal's ID-is-identity convention): matches
// `M4`, `M4.5`, `M4.5.E6`, `M4.5.E6.S1`, `M4.5.E6.S1.t6`, with an optional
// `.gate` suffix for explicit gate commits. Anchored at line start + colon
// so it only catches commit subjects shaped like `M…: <description>`.
const TASK_ID_RE = /^((?:M\d+(?:\.\d+)?)(?:\.E\d+)?(?:\.S\d+)?(?:\.t\d+)?(?:\.gate)?):/;

function extractTaskId(subject) {
  const m = subject.match(TASK_ID_RE);
  return m ? m[1] : null;
}

/**
 * Parse `$ARGUMENTS` for `/sig:checkpoint`. Only the `--context` flag is
 * recognized in Slice 2; everything else surfaces as `unknownFlags` so the
 * command file can render a warning rather than silently dropping input.
 *
 * @param {string|undefined} argsString
 * @returns {{contextMode: boolean, unknownFlags: string[]}}
 */
export function parseCheckpointArgs(argsString) {
  const tokens = String(argsString ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let contextMode = false;
  const unknownFlags = [];
  for (const t of tokens) {
    if (t === '--context') {
      contextMode = true;
    } else {
      unknownFlags.push(t);
    }
  }
  return { contextMode, unknownFlags };
}

/**
 * Read-only inspection of "what would STATE.md become if we accepted the
 * commit log as ground truth?" Pairs the current STATE.md against commits
 * since `last_updated_commit`, proposes a fresh state, and packages both
 * for `renderStateDiff` (S2.t3) to consume.
 *
 * Rules applied to the proposed state:
 * - In-flight tasks whose IDs appear in any commit subject get dropped
 *   from `current_tasks[]` (work landed; clearCurrentTask just didn't run).
 * - `last_updated` advances to now; `last_updated_commit` is left to the
 *   caller (`markFresh` typically resolves HEAD at write time).
 *
 * `execFn` is injectable so tests stub git output.
 *
 * @param {string} baseDir
 * @param {{execFn?: typeof import('node:child_process').execFileSync}} [opts]
 * @returns {Promise<{
 *   current: object,
 *   proposed: object,
 *   diff: {
 *     commitsBehind: number,
 *     commits: Array<{sha: string, subject: string}>,
 *     taskIdsInCommits: string[],
 *   },
 * }>}
 */
export async function detectStateChanges(baseDir, opts = {}) {
  const current = await readState(baseDir);
  if (!current) {
    return {
      current: null,
      proposed: null,
      diff: { commitsBehind: 0, commits: [], taskIdsInCommits: [] },
    };
  }
  // bypassGrace: true — /sig:checkpoint is the user explicitly asking
  // "what changed?"; suppressing via the 60s grace window would hide
  // commits that landed seconds after a STATE.md write.
  const stale = await isStateStale(baseDir, { ...opts, bypassGrace: true });
  const taskIds = stale.commits
    .map((c) => extractTaskId(c.subject))
    .filter((id) => id !== null);

  // Build the speculative state.
  const proposed = { ...current };
  delete proposed._schema;
  delete proposed.completedPhases;
  delete proposed.lastUpdated;
  const taskIdSet = new Set(taskIds);
  if (Array.isArray(proposed.current_tasks)) {
    proposed.current_tasks = proposed.current_tasks.filter(
      (t) => !taskIdSet.has(t.id)
    );
  }
  proposed.last_updated = new Date().toISOString();

  return {
    current,
    proposed,
    diff: {
      commitsBehind: stale.commitCount,
      commits: stale.commits,
      taskIdsInCommits: taskIds,
    },
  };
}

// Fields that exist on readState's return only for read-side ergonomics.
// They shouldn't appear in a diff (the user didn't write them).
const META_FIELDS = new Set(['_schema', 'completedPhases', 'lastUpdated']);

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    return ak.every((k, i) => k === bk[i] && deepEqual(a[k], b[k]));
  }
  return false;
}

function formatScalar(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Plain-text rendering of the diff between two state objects. Sorted
 * key-by-key; arrays render with nested `- removed: X` / `+ added: Y`
 * markers (D8 confirm-then-write flow consumes this).
 *
 * @param {object|null} oldState
 * @param {object|null} newState
 * @returns {string}
 */
export function renderStateDiff(oldState, newState) {
  if (!oldState || !newState) return 'No state to diff.';

  const allKeys = new Set([
    ...Object.keys(oldState),
    ...Object.keys(newState),
  ]);
  for (const k of META_FIELDS) allKeys.delete(k);

  const lines = [];
  for (const key of [...allKeys].sort()) {
    const oldVal = oldState[key];
    const newVal = newState[key];
    if (deepEqual(oldVal, newVal)) continue;

    if (Array.isArray(oldVal) || Array.isArray(newVal)) {
      const oldArr = Array.isArray(oldVal) ? oldVal : [];
      const newArr = Array.isArray(newVal) ? newVal : [];
      lines.push(`${key}:`);
      for (const item of oldArr) {
        if (!newArr.some((n) => deepEqual(n, item))) {
          lines.push(`  - removed: ${formatScalar(item)}`);
        }
      }
      for (const item of newArr) {
        if (!oldArr.some((o) => deepEqual(o, item))) {
          lines.push(`  + added: ${formatScalar(item)}`);
        }
      }
      continue;
    }

    lines.push(`${key}: ${formatScalar(oldVal)} → ${formatScalar(newVal)}`);
  }

  return lines.length === 0 ? 'No changes.' : lines.join('\n');
}

// --- captureCheckpointContext (S2.t4, D16 dual-write) ---

const CONTEXT_PATH_REL = '.planning/CONTEXT.md';
const DECISIONS_PATH_REL = '.planning/DECISIONS.md';
const OPEN_QUESTIONS_PATH_REL = '.planning/OPEN-QUESTIONS.md';
const LOCKED_DECISIONS_HEADING = '## Locked Decisions';

function appendToLockedDecisions(content, decisions, date) {
  const bullets = decisions.map((d) => `- ${d} (${date})`).join('\n');
  if (!content.trim()) {
    // Fresh file — emit a minimal skeleton.
    return `# Project Context\n\n${LOCKED_DECISIONS_HEADING}\n\n${bullets}\n`;
  }
  if (!content.includes(LOCKED_DECISIONS_HEADING)) {
    const trimmed = content.replace(/\s+$/, '');
    return `${trimmed}\n\n${LOCKED_DECISIONS_HEADING}\n\n${bullets}\n`;
  }
  // Section exists — insert bullets at the end of the section (before next
  // `\n## ` heading or end-of-file).
  const idx = content.indexOf(LOCKED_DECISIONS_HEADING);
  const sectionStart = idx + LOCKED_DECISIONS_HEADING.length;
  const nextHeadingIdx = content.indexOf('\n## ', sectionStart);
  const cutAt = nextHeadingIdx === -1 ? content.length : nextHeadingIdx;
  const before = content.slice(0, cutAt).replace(/\s+$/, '');
  const after = nextHeadingIdx === -1 ? '' : content.slice(cutAt);
  return `${before}\n\n${bullets}\n${after}`;
}

function appendDecisionsFile(content, decisions, date) {
  const entries = decisions
    .map((d) => `## ${date} — Checkpoint-captured: ${d}\n`)
    .join('\n');
  const trimmed = content.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${entries}` : `# Decisions\n\n${entries}`;
}

function appendOpenQuestions(content, questions, date) {
  const entries = questions
    .map((q) => `## ${q}\n\n*Logged ${date} via /sig:checkpoint*\n`)
    .join('\n');
  const trimmed = content.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${entries}` : `# Open Questions\n\n${entries}`;
}

/**
 * --context mode side-effect for /sig:checkpoint. Appends:
 *   - decisions → CONTEXT.md § Locked Decisions (creates section if absent;
 *     creates the file from a minimal skeleton when absent)
 *   - decisions → DECISIONS.md (per-decision level-2 heading; D16 dual-write)
 *   - questions → OPEN-QUESTIONS.md (per-question level-2 heading)
 *
 * Empty/whitespace-only inputs are stripped before deciding what to write,
 * so passing `{decisions: ['', '  ']}` is equivalent to passing nothing.
 *
 * Sensitive-data contract (S6.t1 — matches tools/lib/add.js precedent):
 * inputs run through `add.js#scrubSensitive` *before any write*. When hits
 * are detected and `acknowledgeSensitive` is not set, the function refuses
 * to mutate any file and returns `{wrote: [], sensitiveHits, aborted:
 * 'sensitive-data-pending'}` so the caller (commands/checkpoint.md § 7) can
 * prompt the user with [keep, abort]. On `keep`, the caller re-invokes with
 * `acknowledgeSensitive: true`. On `abort`, no rollback is needed because
 * no writes happened. Detection only — never auto-redacts.
 *
 * @param {string} baseDir
 * @param {{
 *   decisions?: string[],
 *   questions?: string[],
 *   acknowledgeSensitive?: boolean,
 * }} [opts]
 * @returns {Promise<{
 *   wrote: string[],
 *   sensitiveHits: object[],
 *   aborted?: 'sensitive-data-pending',
 * }>}
 */
export async function captureCheckpointContext(baseDir, opts = {}) {
  const decisions = (Array.isArray(opts.decisions) ? opts.decisions : [])
    .map((d) => String(d).trim())
    .filter(Boolean);
  const questions = (Array.isArray(opts.questions) ? opts.questions : [])
    .map((q) => String(q).trim())
    .filter(Boolean);

  if (decisions.length === 0 && questions.length === 0) {
    return { wrote: [], sensitiveHits: [] };
  }

  const scrub = scrubSensitive([...decisions, ...questions].join('\n'));
  if (scrub.hits.length > 0 && !opts.acknowledgeSensitive) {
    return {
      wrote: [],
      sensitiveHits: scrub.hits,
      aborted: 'sensitive-data-pending',
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const planningDir = join(baseDir, '.planning');
  await mkdir(planningDir, { recursive: true });

  const wrote = [];

  if (decisions.length > 0) {
    const ctxPath = join(baseDir, CONTEXT_PATH_REL);
    const ctxExisting = existsSync(ctxPath)
      ? await readFile(ctxPath, 'utf-8')
      : '';
    await atomicWrite(ctxPath, appendToLockedDecisions(ctxExisting, decisions, today));
    wrote.push(ctxPath);

    const decPath = join(baseDir, DECISIONS_PATH_REL);
    const decExisting = existsSync(decPath)
      ? await readFile(decPath, 'utf-8')
      : '';
    await atomicWrite(decPath, appendDecisionsFile(decExisting, decisions, today));
    wrote.push(decPath);
  }

  if (questions.length > 0) {
    const oqPath = join(baseDir, OPEN_QUESTIONS_PATH_REL);
    const oqExisting = existsSync(oqPath)
      ? await readFile(oqPath, 'utf-8')
      : '';
    await atomicWrite(oqPath, appendOpenQuestions(oqExisting, questions, today));
    wrote.push(oqPath);
  }

  return { wrote, sensitiveHits: scrub.hits };
}

// --- handleCheckpointOrphans (S2.t7) ---

/**
 * Orphan-detection step for /sig:checkpoint. Calls `detectOrphans`; if any
 * are found, awaits `prompt(orphans) → 'clear' | 'keep'` and acts:
 *   - 'clear' → call clearCurrentTask({status: 'aborted'}) for each entry.
 *   - 'keep'  → no-op (user is still working on them).
 *   - no prompt supplied → returns action: 'pending' so the caller can
 *     route to its own UI (the command markdown wires AskUserQuestion).
 *
 * `execFn` and `thresholdMs` pass through to `detectOrphans`.
 *
 * @param {string} baseDir
 * @param {{
 *   prompt?: (orphans: Array) => Promise<'clear' | 'keep'>,
 *   thresholdMs?: number,
 *   execFn?: typeof import('node:child_process').execFileSync
 * }} [opts]
 * @returns {Promise<{orphans: Array, action: 'none' | 'cleared' | 'kept' | 'pending'}>}
 */
export async function handleCheckpointOrphans(baseDir, opts = {}) {
  const orphans = await detectOrphans(baseDir, opts);
  if (orphans.length === 0) {
    return { orphans: [], action: 'none' };
  }
  if (!opts.prompt) {
    return { orphans, action: 'pending' };
  }
  const choice = await opts.prompt(orphans);
  if (choice === 'clear') {
    for (const o of orphans) {
      await clearCurrentTask(baseDir, { id: o.id, status: 'aborted' });
    }
    return { orphans, action: 'cleared' };
  }
  return { orphans, action: 'kept' };
}
