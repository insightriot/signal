// The store-off golden baseline (M6.E11 t6.1, AC-1.2).
//
// S4 teaches nine writer modules to write items instead of the four lists
// when `.planning/work/WORK.md` exists. The promise is that a project WITHOUT
// that file sees no change at all. This helper is how that promise is checked:
// it runs every write path S4 touches against a small hand-made project that
// has no store, and records every byte left on disk after each step, plus what
// the artifact resolver answers.
//
// The baseline in `tests/fixtures/work-store-off/golden.json` was produced by
// THIS script from the writer code as it stood BEFORE S4 changed any of it
// (the commit that adds this file changes no writer). `work-store-off.test.js`
// re-runs it and compares. A difference means S4 changed store-off behaviour.
//
//   node tests/helpers/store-off-golden.js --write   # regenerate golden.json
//
// Regenerating is only correct when a store-off change is intended — the
// point of the file is that it does NOT move with the code.
//
// Determinism: every function that takes a date is given one, and the clock
// is frozen for the whole run (checkpoint reads `new Date()` with no seam).
// The same freeze is used when writing and when comparing — two mechanisms
// would produce phantom diffs. Absolute temp paths in return values are
// replaced with `<ROOT>`.

import { mkdtemp, rm, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  captureToFutureIdeas,
  captureToBugs,
  captureToOpenQuestions,
  captureToMilestone,
  captureToFile,
} from '../../plugin/tools/lib/add.js';
import { captureCheckpointContext } from '../../plugin/tools/lib/checkpoint.js';
import {
  applyDispositionToFile,
  evictTerminalToLedger,
  promoteDrainEntry,
  parseEntries,
} from '../../plugin/tools/lib/drain.js';
import {
  createBacklogIfMissing,
  promoteToBacklog,
  promoteToBugs,
  dischargeBacklogRows,
} from '../../plugin/tools/lib/backlog.js';
import { applyArchiveTree } from '../../plugin/tools/lib/archive-tree.js';
import { createSnapshotter } from '../../plugin/tools/lib/migrate-memory.js';
import { atomicWrite } from '../../plugin/tools/lib/atomic-write.js';
import { resolveArtifactPath, artifactName } from '../../plugin/tools/lib/resume.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const FIXTURE_DIR = join(HERE, '..', 'fixtures', 'work-store-off');
export const PROJECT_DIR = join(FIXTURE_DIR, 'project');
export const GOLDEN_PATH = join(FIXTURE_DIR, 'golden.json');

export const FROZEN_AT = '2026-01-15T12:00:00.000Z';
const TODAY = '2026-01-15';

const keep = async () => 'keep';

// ── Clock ────────────────────────────────────────────────────────────────────

async function withFrozenClock(iso, fn) {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(iso).getTime();
  class FrozenDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed]));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

// ── Snapshots ────────────────────────────────────────────────────────────────

async function walk(dir, root, out) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) await walk(abs, root, out);
    else out[relative(root, abs).split(sep).join('/')] = await readFile(abs, 'utf-8');
  }
  return out;
}

async function tree(root) {
  const all = await walk(root, root, {});
  return Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
}

function diffTrees(before, after) {
  const changed = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] !== after[k]) changed[k] = k in after ? after[k] : null;
  }
  return Object.fromEntries(Object.keys(changed).sort().map((k) => [k, changed[k]]));
}

function normalize(value, roots) {
  const json = JSON.stringify(value, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
  if (json === undefined) return null;
  let s = json;
  for (const r of roots) s = s.split(r).join('<ROOT>');
  return JSON.parse(s);
}

// A temp copy of the fixture project — all of it, or only the listed files.
async function freshProject(only) {
  const root = await mkdtemp(join(tmpdir(), 'signal-store-off-'));
  if (!only) {
    await cp(PROJECT_DIR, root, { recursive: true });
  } else {
    for (const rel of only) await cp(join(PROJECT_DIR, rel), join(root, rel));
  }
  return root;
}

// ── The run ──────────────────────────────────────────────────────────────────

async function runSteps(root, steps) {
  const roots = [realpathSync(root), root];
  const out = [];
  let before = await tree(root);
  for (const [name, fn] of steps) {
    let result;
    try {
      result = { ok: normalize(await fn(root), roots) };
    } catch (err) {
      result = { threw: normalize(err.message, roots) };
    }
    const after = await tree(root);
    out.push({ name, result, changed: diffTrees(before, after) });
    before = after;
  }
  return { steps: out, final: before };
}

async function inboxIndex(root, heading) {
  const content = await readFile(join(root, '.planning', 'ISSUES-INBOX.md'), 'utf-8');
  const entries = parseEntries(content);
  const i = entries.findIndex((e) => e.heading.includes(heading));
  if (i < 0) throw new Error(`fixture drift: no inbox entry "${heading}"`);
  return { i, block: content.slice(entries[i].range.start, entries[i].range.end) };
}

const FIXTURE_STEPS = [
  ['add: default inbox', (r) =>
    captureToFutureIdeas(r, { body: 'Show the tier in the status header.', today: TODAY,
      triggerContext: '(during M6.E2 PLAN)', title: 'Tier in status header', sensitivePrompt: keep })],
  ['add: --bug', (r) =>
    captureToBugs(r, { body: 'Resume prints the wrong phase after a checkpoint.', today: TODAY,
      title: 'Resume shows the wrong phase', sensitivePrompt: keep })],
  ['add: --question', (r) =>
    captureToOpenQuestions(r, { body: 'Should advise read archived Epics?', today: TODAY,
      triggerContext: '(during M6.E2 PLAN)', sensitivePrompt: keep })],
  ['add: --milestone 6', (r) =>
    captureToMilestone(r, { milestoneArg: '6', body: 'Split the milestone file when it passes 40 KB.', today: TODAY,
      sensitivePrompt: keep })],
  ['add: --file NOTES.md', (r) =>
    captureToFile(r, { filePath: '.planning/NOTES.md', body: 'A raw note, verbatim.', today: TODAY,
      sensitivePrompt: keep })],
  ['checkpoint: decisions + questions', (r) =>
    captureCheckpointContext(r, { decisions: ['Keep the store opt-in'], questions: ['Who owns the key?'] })],
  ['drain: defer one entry', async (r) => {
    const { i } = await inboxIndex(r, 'Faster status output');
    return applyDispositionToFile(r, '.planning/ISSUES-INBOX.md',
      { entryIndex: i, verb: 'defer', reason: 'M6.E2 drain', date: TODAY });
  }],
  ['drain: delete one entry (confirmed)', async (r) => {
    const { i } = await inboxIndex(r, 'Old idea nobody wants');
    return applyDispositionToFile(r, '.planning/ISSUES-INBOX.md',
      { entryIndex: i, verb: 'delete', reason: 'M6.E2 drain', date: TODAY, confirmPrompt: async () => 'confirm' });
  }],
  ['drain: promote work → backlog', async (r) => {
    const { i, block } = await inboxIndex(r, 'Export the report as CSV');
    return promoteDrainEntry(r, { classification: 'work', block, tag: 'roadmap', entryIndex: i,
      reason: 'M6.E2 drain', date: TODAY });
  }],
  ['drain: promote bug → bugs', async (r) => {
    const { i, block } = await inboxIndex(r, 'Crash when the inbox is empty');
    return promoteDrainEntry(r, { classification: 'bug', block, entryIndex: i, reason: 'M6.E2 drain', date: TODAY });
  }],
  ['drain: evict dry run', (r) => evictTerminalToLedger(r, { dryRun: true })],
  ['drain: evict', (r) => evictTerminalToLedger(r)],
  ['backlog: createBacklogIfMissing (exists)', (r) => createBacklogIfMissing(r, { today: TODAY })],
  ['backlog: promoteToBacklog (raw block)', (r) =>
    promoteToBacklog(r, { block: '## Batch the index writes\n\nOne write per run, not per file.\n\n---\n',
      tag: 'hygiene', today: TODAY })],
  ['backlog: promoteToBacklog again (dedupe)', (r) =>
    promoteToBacklog(r, { block: '## Batch the index writes\n\nOne write per run, not per file.\n\n---\n',
      tag: 'hygiene', today: TODAY })],
  ['backlog: promoteToBugs (raw block)', (r) =>
    promoteToBugs(r, { block: '## Lock left behind after a crash\n\nA killed run leaves .state.lock.\n\n---\n' })],
  ['backlog: dischargeBacklogRows', (r) =>
    dischargeBacklogRows(r, { rows: ['Tidy the command index', 'no such row'], by: 'M6.E2', at: TODAY })],
  ['migrate: snapshot → overwrite → rollback', async (r) => {
    const { snap, rollback } = createSnapshotter(join(r, '.planning'));
    await snap('BACKLOG.md');
    await snap('BUGS.md');
    await snap('NEW-FROM-MIGRATE.md');
    await atomicWrite(join(r, '.planning', 'BACKLOG.md'), 'clobbered\n');
    await atomicWrite(join(r, '.planning', 'BUGS.md'), 'clobbered\n');
    await atomicWrite(join(r, '.planning', 'NEW-FROM-MIGRATE.md'), 'created then rolled back\n');
    await rollback();
    return 'rolled back';
  }],
  ['atomicWrite: ordinary existing file', (r) => atomicWrite(join(r, '.planning', 'NOTES.md'), '# Notes\n\nReplaced.\n')],
  ['atomicWrite: new file', (r) => atomicWrite(join(r, '.planning', 'SCRATCH.md'), 'new\n')],
  ['archive-tree: dry run', (r) => applyArchiveTree(r)],
  ['archive-tree: apply', async (r) => {
    const res = await applyArchiveTree(r, { apply: true });
    return { applied: res.applied, moves: res.moves, rewrittenFiles: res.rewrittenFiles };
  }],
];

// A project with `.planning/` but none of the lists: the create-if-missing
// branches (lazy inbox, BACKLOG skeleton, BUGS skeleton) only run here.
const FRESH_STEPS = [
  ['fresh: add default inbox (lazy-create)', (r) =>
    captureToFutureIdeas(r, { body: 'First capture in a new project.', today: TODAY, sensitivePrompt: keep })],
  ['fresh: createBacklogIfMissing (creates)', (r) => createBacklogIfMissing(r, { today: TODAY })],
  ['fresh: promoteToBugs (creates BUGS.md)', (r) =>
    promoteToBugs(r, { block: '## Fresh bug\n\nSomething broke.\n\n---\n' })],
  ['fresh: add --bug (BUGS.md created by the promote above)', (r) =>
    captureToBugs(r, { body: 'Second bug.', today: TODAY, sensitivePrompt: keep })],
  ['fresh: checkpoint question with no OPEN-QUESTIONS.md', (r) =>
    captureCheckpointContext(r, { questions: ['Where do questions go in a new project?'] })],
];

function resolverResults(planningDir) {
  const pairs = [
    ['PLAN', { currentEpic: 'M6.E2' }],
    ['REQUIREMENTS', { currentEpic: 'M6.E2' }],
    ['VERIFICATION', { currentEpic: 'M6.E2' }],
    ['VERIFICATION', { currentEpic: null }],
    ['PLAN', { currentEpic: null }],
    ['REQUIREMENTS', { currentEpic: null }],
    ['PLAN', { currentEpic: 'v0.1.6' }],
    ['PLAN', { currentEpic: 'M6.E1' }],
    ['RETROSPECTIVE', { currentEpic: 'M6.E1' }],
  ];
  return pairs.map(([artifact, opts]) => {
    const hit = resolveArtifactPath(planningDir, artifact, opts);
    return {
      artifact,
      currentEpic: opts.currentEpic,
      name: artifactName(artifact, opts),
      resolved: hit === null ? null : relative(planningDir, hit).split(sep).join('/'),
    };
  });
}

/**
 * Run every store-off write path and the resolver; return what they left.
 * @returns {Promise<{frozenAt: string, fixture: object, fresh: object, resolver: object[]}>}
 */
export async function captureStoreOff() {
  const a = await freshProject();
  const b = await freshProject(['.planning/STATE.md']);
  try {
    return await withFrozenClock(FROZEN_AT, async () => {
      // The resolver is read before the archive step moves M6.E1's plan away.
      const resolver = resolverResults(join(a, '.planning'));
      const fixture = await runSteps(a, FIXTURE_STEPS);
      const fresh = await runSteps(b, FRESH_STEPS);
      return { frozenAt: FROZEN_AT, resolver, fixture, fresh };
    });
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (!process.argv.includes('--write')) {
    console.error('usage: node tests/helpers/store-off-golden.js --write');
    process.exit(2);
  }
  const golden = await captureStoreOff();
  await writeFile(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf-8');
  console.log(`wrote ${relative(process.cwd(), GOLDEN_PATH)}`);
}
