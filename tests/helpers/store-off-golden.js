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

import { mkdtemp, rm, cp, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
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
import { collectPreflight } from '../../plugin/tools/lib/drive.js';
import { isStateStale } from '../../plugin/tools/lib/state.js';

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

// ── Readers (t6.1 audit, after S5) ───────────────────────────────────────────
//
// S5 taught four READ paths about Epic folders: the resolver and artifactName
// (now given `planningDir`, as every phase command passes it), drive's
// REQUIREMENTS preflight, and isStateStale's pathspec. A project can have a
// `.planning/work/` or `.planning/archive/epics/` directory and still have the
// store OFF (no WORK.md) — these files are planted to make that case
// non-vacuous: with the store off, none of them may be seen. Some exist ONLY in
// a folder (M6.E2-RESEARCH, the folder's REQUIREMENTS `[FILL IN]`), so a leak
// shows up as a folder path or an extra blocking entry.
//
// The pre-Epic code has no `planningDir` option: old artifactName destructures
// only `currentEpic`, so passing it there is ignored. Both call shapes are
// recorded; in the baseline they are equal by construction, and today's code
// must match both.
export const READER_PLANTS = {
  '.planning/work/epics/M6.E2/M6.E2-PLAN.md': '# M6.E2 plan (folder copy)\n',
  '.planning/work/epics/M6.E2/PLAN.md': '# M6.E2 plan (bare, folder)\n',
  '.planning/work/epics/M6.E2/M6.E2-RESEARCH.md': '# research that exists only in the folder\n',
  '.planning/work/epics/M6.E2/M6.E2-REQUIREMENTS.md': '# M6.E2 requirements (folder)\n\n- [FILL IN: only the folder copy says this]\n',
  '.planning/work/epics/M6.E3/M6.E3-REQUIREMENTS.md': '# M6.E3 requirements\n\n- [FILL IN: folder-only Epic]\n',
  '.planning/work/backlog/SIG-1.md': '---\nid: SIG-1\n---\n\nAn item file with no WORK.md.\n',
  '.planning/archive/epics/M6.E1/M6.E1-PLAN.md': '# M6.E1 plan (archived copy)\n',
  '.planning/archive/epics/M6.E1/M6.E1-VERIFICATION.md': '# M6.E1 verification (archive only)\n',
  '.planning/archive/epics/M6.E0/M6.E0-REQUIREMENTS.md': '# M6.E0 requirements (archive only)\n\n- [FILL IN: archive]\n',
};
const FAKE_BASELINE = 'abc1234';

function readerResolver(planningDir) {
  const pairs = [];
  for (const currentEpic of ['M6.E2', 'M6.E1', 'M6.E0', 'M6.E3', null]) {
    for (const artifact of ['PLAN', 'REQUIREMENTS', 'RESEARCH', 'VERIFICATION', 'PROGRESS']) {
      pairs.push([artifact, currentEpic]);
    }
  }
  return pairs.map(([artifact, currentEpic]) => {
    const hit = resolveArtifactPath(planningDir, artifact, { currentEpic, phase: 'PLAN' });
    return {
      artifact,
      currentEpic,
      name: artifactName(artifact, { currentEpic }),
      nameWithPlanningDir: artifactName(artifact, { currentEpic, planningDir }),
      resolved: hit === null ? null : relative(planningDir, hit).split(sep).join('/'),
    };
  });
}

async function readerResults(root) {
  const roots = [realpathSync(root), root];
  const planningDir = join(root, '.planning');
  const preflight = {};
  for (const epic of ['M6.E2', 'M6.E1', 'M6.E0', 'M6.E3', null]) {
    preflight[String(epic)] = normalize(await collectPreflight(root, { epic }), roots);
  }
  // isStateStale's git calls, recorded through the execFn seam: the pathspec
  // is the behaviour, and no repository is needed to see it.
  const calls = [];
  const execFn = (cmd, args) => {
    calls.push([cmd, ...args]);
    return '';
  };
  const stale = await isStateStale(root, { execFn, bypassGrace: true });
  return {
    resolver: readerResolver(planningDir),
    preflight,
    isStateStale: { result: stale, calls },
  };
}

async function readersProject() {
  const root = await freshProject();
  for (const [rel, text] of Object.entries(READER_PLANTS)) {
    await mkdir(join(root, rel, '..'), { recursive: true });
    await writeFile(join(root, rel), text, 'utf-8');
  }
  const statePath = join(root, '.planning', 'STATE.md');
  const state = await readFile(statePath, 'utf-8');
  await writeFile(statePath, state.replace('last_updated: 2026-01-10\n',
    `last_updated: 2026-01-10\nlast_updated_commit: ${FAKE_BASELINE}\n`), 'utf-8');
  return root;
}

/**
 * Run every store-off write path and the resolver; return what they left.
 * @returns {Promise<{frozenAt: string, fixture: object, fresh: object, resolver: object[], readers: object}>}
 */
export async function captureStoreOff() {
  const a = await freshProject();
  const b = await freshProject(['.planning/STATE.md']);
  const c = await readersProject();
  try {
    return await withFrozenClock(FROZEN_AT, async () => {
      // The resolver is read before the archive step moves M6.E1's plan away.
      const resolver = resolverResults(join(a, '.planning'));
      const fixture = await runSteps(a, FIXTURE_STEPS);
      const fresh = await runSteps(b, FRESH_STEPS);
      const readers = await readerResults(c);
      return { frozenAt: FROZEN_AT, resolver, fixture, fresh, readers };
    });
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
    await rm(c, { recursive: true, force: true });
  }
}

// ── AC3.1 readers on a store-off project (M6.E13 t1.6, AC4.1 pin) ────────────
//
// M6.E13 S4 converts every AC3.1 reader to read records when the store is on.
// The promise, again, is that a project WITHOUT `.planning/work/WORK.md` sees
// no change — and "store off is unchanged" broke twice in M6.E11 (RESEARCH
// § Risk 8, M6.E11 retro A3). So, BEFORE any reader moves, this records what
// each one answers today on `tests/fixtures/work-store-off/readers/`: a
// store-off project built to trip each reader's branches (stale Epic and bug
// rows, a struck row, a held-open row, a `<details>` row, a `Fixes B2` row, a
// standing watchlist entry, a dangling fence, struck questions, a wrong bug
// tally, a CHANGELOG headline naming a `confirmed` bug, `[FILL IN]` markers, a
// dangling `B99`). Pinned whatever the answer is, right or wrong: a misparse
// found here is a report item, not something this file fixes.
//
// Separate from `captureStoreOff()` and from `golden.json` on purpose:
// `golden.json` is the 7f44ba1 baseline and must not be regenerated at HEAD.
//
//   node tests/helpers/store-off-golden.js --write-readers   # regenerate readers-ac31.json
//
// Keys are the RESEARCH § "Readers, by AC3.1 group" groups, and each entry names
// the `plugin/tools/lib` site(s) it covers, so S4 can find the pin for each
// reader it converts.

export const READERS_FIXTURE_DIR = join(FIXTURE_DIR, 'readers');
export const READERS_GOLDEN_PATH = join(FIXTURE_DIR, 'readers-ac31.json');

// The line a backlog heading sits on, so the priorities below cite rows by the
// fixture's text rather than by hand-counted numbers.
async function lineOf(root, rel, needle) {
  const lines = (await readFile(join(root, rel), 'utf-8')).split('\n');
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`fixture drift: no "${needle}" in ${rel}`);
  return i + 1;
}

async function proposals(root) {
  const B = '.planning/BACKLOG.md';
  const row = async (needle) => `${B}:${await lineOf(root, B, needle)}`;
  const b2 = `.planning/BUGS.md:${await lineOf(root, '.planning/BUGS.md', '| B2 |')}`;
  const valid = [
    { title: 'Make the doctor honest', why: 'A missing key reads as a pass.', covers: ['B2'], evidence: [b2] },
    { title: 'Finish the export', why: 'The Epic in flight.', covers: [await row('### M6.E3 — Export the report')],
      evidence: [await row('### M6.E3 — Export the report'), '.planning/M6.E3-REQUIREMENTS.md:4'] },
    { title: 'Speed up status', why: 'Two seconds is too slow.', covers: [await row('#### Cache the unit walk'), 'new: profile the walk'],
      evidence: [await row('#### Cache the unit walk')], dependsOn: [2] },
  ];
  const invalid = [
    { title: 'Cover a fixed bug', why: 'B1 is closed.', covers: ['B1'], evidence: ['.planning/BUGS.md:999'] },
    { title: 'Cover a struck row', why: 'It was done.', covers: [await row('### ~~Tidy the command index~~')], evidence: ['.planning/NOPE.md'] },
    { title: 'Cover a held-open row', why: 'One. Two. Three. Four.', covers: [await row('### M6.E4 — Batch')], evidence: ['.planning/STATE.md'],
      dependsOn: [3] },
  ];
  return { valid, invalid };
}

function readerSteps() {
  return [
    // advise
    ['advise: readCorpus', 'advise-corpus.js:90 (BACKLOG), :148-170 (BUGS)', async (r) => {
      const { readCorpus } = await import('../../plugin/tools/lib/advise-corpus.js');
      return readCorpus(r);
    }],
    ['advise: prepareAdvise (readCorpus + classifyCorpus + gatherBigPicture + formatDigest)',
      'advise.js:742 classifyCorpus, advise.js:285 classifyRows, advise-digest.js:236-380', async (r) => {
        const { prepareAdvise } = await import('../../plugin/tools/lib/advise.js');
        return prepareAdvise(r);
      }],
    ['advise: classifyRows with no discharge input', 'advise.js:285 (/^B\\d+$/)', async (r) => {
      const { readCorpus } = await import('../../plugin/tools/lib/advise-corpus.js');
      const { classifyRows } = await import('../../plugin/tools/lib/advise.js');
      const corpus = await readCorpus(r);
      return classifyRows(corpus.sources.backlog.rows, { confirmedBugs: new Set(['B2', 'B3']) });
    }],
    ['advise: validatePriorities (valid)', 'advise-priorities.js:32-160', async (r) => {
      const { prepareAdvise } = await import('../../plugin/tools/lib/advise.js');
      const { validatePriorities } = await import('../../plugin/tools/lib/advise-priorities.js');
      const { corpus, classified } = await prepareAdvise(r);
      return validatePriorities(r, (await proposals(r)).valid, corpus, {
        liveRows: classified.live.map((s) => s.row),
        droppedRows: classified.dropped.map((s) => ({ path: s.row.path, line: s.row.line, why: 'dropped' })),
      });
    }],
    ['advise: validatePriorities (invalid)', 'advise-priorities.js:32-160', async (r) => {
      const { prepareAdvise } = await import('../../plugin/tools/lib/advise.js');
      const { validatePriorities } = await import('../../plugin/tools/lib/advise-priorities.js');
      const { corpus, classified } = await prepareAdvise(r);
      return validatePriorities(r, (await proposals(r)).invalid, corpus, {
        liveRows: classified.live.map((s) => s.row),
        droppedRows: classified.dropped.map((s) => ({ path: s.row.path, line: s.row.line, why: 'dropped' })),
      });
    }],
    ['advise: runAdvise (invalid proposal — refused, nothing written)', 'advise.js:789-853', async (r) => {
      const { runAdvise } = await import('../../plugin/tools/lib/advise.js');
      return runAdvise(r, { today: TODAY, priorities: (await proposals(r)).invalid, projectName: 'fixture' });
    }],
    ['advise: runAdvise (valid proposal — stale-read guard passes, artifact written)', 'advise.js:842-853', async (r) => {
      const { runAdvise } = await import('../../plugin/tools/lib/advise.js');
      return runAdvise(r, { today: TODAY, priorities: (await proposals(r)).valid, projectName: 'fixture' });
    }],
    // drive
    ['drive: inboxHasDrainableEntries (via FLOOR_CONDITIONS)', 'drive.js:150', async (r) => {
      const { FLOOR_CONDITIONS } = await import('../../plugin/tools/lib/drive.js');
      return {
        preview: await FLOOR_CONDITIONS['plan-drain-preview'](r),
        destructive: await FLOOR_CONDITIONS['plan-drain-destructive'](r),
      };
    }],
    ['drive: resolveFloors(PLAN)', 'drive.js:104 → :150', async (r) => {
      const { resolveFloors } = await import('../../plugin/tools/lib/drive.js');
      return resolveFloors('PLAN', r);
    }],
    ['drive: proposeEpicCandidates', 'drive.js:490', async (r) => {
      const { proposeEpicCandidates } = await import('../../plugin/tools/lib/drive.js');
      return proposeEpicCandidates(r);
    }],
    ['drive: collectPreflight (M6.E3)', 'drive.js:602 (inline question parser :653)', async (r) => {
      const { collectPreflight } = await import('../../plugin/tools/lib/drive.js');
      return collectPreflight(r, { epic: 'M6.E3' });
    }],
    ['drive: collectPreflight (no Epic)', 'drive.js:602', async (r) => {
      const { collectPreflight } = await import('../../plugin/tools/lib/drive.js');
      return collectPreflight(r, { epic: null });
    }],
    // status / resume
    ['status: readOpenQuestions', 'status.js:200', async (r) => {
      const { readOpenQuestions } = await import('../../plugin/tools/lib/status.js');
      return readOpenQuestions(r);
    }],
    // sweep
    ['sweep: checkBacklogDischarge', 'sweep.js:236', async (r) => {
      const { checkBacklogDischarge } = await import('../../plugin/tools/lib/sweep.js');
      return checkBacklogDischarge(r);
    }],
    ['sweep: checkStaleInbox', 'sweep.js:296', async (r) => {
      const { checkStaleInbox } = await import('../../plugin/tools/lib/sweep.js');
      return checkStaleInbox(r);
    }],
    ['doc-hygiene: checkDanglingReferences', 'doc-hygiene.js:741 (B\\d at :766-767, :804)', async (r) => {
      const { checkDanglingReferences } = await import('../../plugin/tools/lib/doc-hygiene.js');
      return checkDanglingReferences(r);
    }],
    // published-facts
    ['published-facts: bug tally + bug status vs changelog', 'published-facts.js:82, :173', async (r) => {
      const { runDriftChecks } = await import('../../plugin/tools/lib/state-drift.js');
      const { checkPublishedBugTally, checkBugStatusVsChangelog } = await import('../../plugin/tools/lib/published-facts.js');
      return runDriftChecks(r, [checkPublishedBugTally, checkBugStatusVsChangelog]);
    }],
    // Jev — the deterministic paths only: no key, and a stubbed `ask`.
    ['jev: bug-fixed-jev with no key (blind)', 'bug-fixed-jev.js:162', async (r) => {
      const { runDriftChecks } = await import('../../plugin/tools/lib/state-drift.js');
      const { makeBugFixedJevCheck } = await import('../../plugin/tools/lib/bug-fixed-jev.js');
      return runDriftChecks(r, [makeBugFixedJevCheck({ key: '' })]);
    }],
    ['jev: bug-fixed-jev with a stubbed ask', 'bug-fixed-jev.js:162', async (r) => {
      const { runDriftChecks } = await import('../../plugin/tools/lib/state-drift.js');
      const { makeBugFixedJevCheck } = await import('../../plugin/tools/lib/bug-fixed-jev.js');
      const asked = [];
      const ask = async ({ state, question }) => {
        const id = question.instructions.match(/Bug (B\d+)/)[1];
        asked.push({ id, state });
        return { ok: true, model: 'stub-model', noul: id === 'B3' ? 0.9 : 0.1 };
      };
      const report = await runDriftChecks(r, [makeBugFixedJevCheck({ key: 'k', ask, now: () => 0 })]);
      return { report, asked };
    }],
    // backlog
    ['backlog: backlogDischargeStatus (+ readClosureSources)', 'backlog.js:923, :1038', async (r) => {
      const { backlogDischargeStatus } = await import('../../plugin/tools/lib/backlog.js');
      return backlogDischargeStatus(r);
    }],
    // bugs-tally (outside AC3.1, pinned because the tally readers stand on it)
    ['bugs-tally: deriveBugCounts', 'bugs-tally.js:170', async (r) => {
      const { deriveBugCounts } = await import('../../plugin/tools/lib/bugs-tally.js');
      return deriveBugCounts(await readFile(join(r, '.planning', 'BUGS.md'), 'utf-8'));
    }],
    ['add: rewriteBugTally', 'add.js:1404', async (r) => {
      const { rewriteBugTally } = await import('../../plugin/tools/lib/add.js');
      return rewriteBugTally(await readFile(join(r, '.planning', 'BUGS.md'), 'utf-8'));
    }],
    // capture (store-off write paths)
    ['capture: captureToDestination via captureToBugs (store off)', 'add.js:1088', (r) =>
      captureToBugs(r, { body: 'Export drops the last row.', today: TODAY, title: 'Export drops the last row',
        sensitivePrompt: keep })],
    ['capture: captureToDestination via captureToFutureIdeas (store off)', 'add.js:1088', (r) =>
      captureToFutureIdeas(r, { body: 'Show the tier in the status header.', today: TODAY,
        triggerContext: '(during M6.E3 EXECUTE)', title: 'Tier in status header', sensitivePrompt: keep })],
    ['capture: captureToDestination via captureToOpenQuestions (store off)', 'add.js:1088', (r) =>
      captureToOpenQuestions(r, { body: 'Should the export include archived rows?', today: TODAY,
        triggerContext: '(during M6.E3 EXECUTE)', sensitivePrompt: keep })],
  ];
}

/**
 * Run every AC3.1 reader on the store-off readers fixture; return what each answered.
 * @returns {Promise<{frozenAt: string, steps: Array<{name: string, site: string, result: object, changed: object}>}>}
 */
export async function captureStoreOffReaders() {
  // Git must not find a repository ABOVE the temp copy (a TMPDIR inside a
  // checkout would make the other-branches readers answer from that checkout).
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  const out = [];
  process.env.GIT_CEILING_DIRECTORIES = realpathSync(tmpdir());
  try {
    await withFrozenClock(FROZEN_AT, async () => {
      // A fresh copy per reader, so no reader sees another's writes (runAdvise
      // writes an advisory; the captures write the lists).
      for (const [name, site, fn] of readerSteps()) {
        const root = await mkdtemp(join(tmpdir(), 'signal-store-off-readers-'));
        try {
          await cp(READERS_FIXTURE_DIR, root, { recursive: true });
          const { steps: [ran] } = await runSteps(root, [[name, fn]]);
          out.push({ name, site, result: ran.result, changed: ran.changed });
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    });
  } finally {
    if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = ceiling;
  }
  return { frozenAt: FROZEN_AT, steps: out };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--write-readers')) {
    const golden = await captureStoreOffReaders();
    await writeFile(READERS_GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf-8');
    console.log(`wrote ${relative(process.cwd(), READERS_GOLDEN_PATH)}`);
  } else if (process.argv.includes('--write')) {
    const golden = await captureStoreOff();
    await writeFile(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf-8');
    console.log(`wrote ${relative(process.cwd(), GOLDEN_PATH)}`);
  } else {
    console.error('usage: node tests/helpers/store-off-golden.js --write | --write-readers');
    process.exit(2);
  }
}
