#!/usr/bin/env node

// tools/work-convert-dryrun.mjs — the first real conversion of this
// repository's v1 work store to v2 records (M6.E13 t1.5).
//
// SCOPE: maintainer tooling, repo-root, not shipped (like `tools/work-migrate.mjs`).
// READ-ONLY on the repository: it reads every v1 item file and the git log, and
// writes only into a scratch directory OUTSIDE the repository. It never touches
// `.planning/`. The migration itself is `work-migrate-v2.js` (S7).
//
//   node tools/work-convert-dryrun.mjs [OUT_DIR]
//
// OUT_DIR defaults to `os.tmpdir()/signal-v2-dryrun` and is refused when it is
// inside the repository. It gets, per item, `work/items/NN/SIG-n.json` (the
// record, `serializeRecord`) and `work/items/NN/SIG-n.md` (the cleaned body),
// plus `manifest.json` (one entry per v1 file). Every record is validated and
// folded; the summary is printed.
//
// The pieces are exported so `tests/work-convert-live.test.js` runs the same
// conversion in memory, without writing.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bodyDirFor, convertV1Item } from '../plugin/tools/lib/work-convert.js';
import { checkEvents, deriveStatus, epicOf, parseRecord, serializeRecord, validateRecord } from '../plugin/tools/lib/work-record.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ITEM_FILE_RE = /^SIG-\d+\.md$/;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.isFile() && ITEM_FILE_RE.test(e.name)) out.push(abs);
  }
}

/**
 * Every v1 item file: `.planning/work/{inbox,backlog,epics,done}/**` and
 * `.planning/archive/epics/**`, as paths relative to `.planning/`, sorted.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function listV1Items(repoRoot) {
  const planning = path.join(repoRoot, '.planning');
  const found = [];
  for (const sub of ['work/inbox', 'work/backlog', 'work/epics', 'work/done', 'archive/epics']) {
    walk(path.join(planning, sub), found);
  }
  return found.map((abs) => path.relative(planning, abs).split(path.sep).join('/')).sort();
}

/**
 * The date (YYYY-MM-DD, author date) of the first commit that added any file
 * named `SIG-n.md` under `.planning/`, keyed by file name. One `git log` for
 * the whole store; the earliest date wins, so the answer does not depend on
 * log order. Renames are not followed (`--no-renames`): a move is an add of
 * the new path, which is never earlier than the original add.
 *
 * @param {string} repoRoot
 * @returns {Map<string, string>}
 */
export function firstAddedDates(repoRoot) {
  const out = execFileSync(
    'git',
    ['log', '--all', '--no-renames', '--diff-filter=A', '--date=short', '--format=%x00%ad', '--name-only', '--', ':(glob).planning/**/SIG-*.md'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const dates = new Map();
  for (const chunk of out.split('\0').slice(1)) {
    const [date, ...files] = chunk.split('\n').filter(Boolean);
    for (const file of files) {
      const name = file.split('/').at(-1);
      if (!ITEM_FILE_RE.test(name)) continue;
      const prev = dates.get(name);
      if (prev === undefined || date < prev) dates.set(name, date);
    }
  }
  return dates;
}

/**
 * Convert the live store in memory. Each result is `{relPath, record, body,
 * manifest, fallbackAt, problems}`; `problems` lists conversion errors and any
 * validate / fold / round-trip failure of the produced record.
 *
 * @param {string} [repoRoot]
 */
export function convertLiveStore(repoRoot = REPO_ROOT) {
  const dates = firstAddedDates(repoRoot);
  const results = listV1Items(repoRoot).map((relPath) => {
    const text = readFileSync(path.join(repoRoot, '.planning', relPath), 'utf8');
    const fallbackAt = dates.get(relPath.split('/').at(-1));
    const { record, body, manifest } = convertV1Item({ relPath, text, fallbackAt });
    const problems = [...manifest.errors];
    let status = null;
    let epic = null;
    if (record) {
      problems.push(...validateRecord(record), ...checkEvents(record).map((e) => e.message));
      try {
        status = deriveStatus(record);
        epic = epicOf(record);
      } catch (err) {
        problems.push(err.message);
      }
      try {
        const bytes = serializeRecord(record);
        const back = parseRecord(bytes);
        if (back.errors.length > 0 || serializeRecord(back.record) !== bytes) {
          problems.push('serialise → parse → serialise is not byte-identical');
        }
      } catch (err) {
        problems.push(err.message);
      }
    }
    return { relPath, record, body, manifest, fallbackAt, status, epic, problems };
  });
  return results;
}

/** Counts for the summary and the PROGRESS line. */
export function summarize(results) {
  const forms = {};
  const statuses = {};
  let cells = 0;
  let statusLines = 0;
  let links = 0;
  let fallbackSupplied = 0;
  let fallbackUsed = 0;
  for (const r of results) {
    const m = r.manifest;
    if (m.closeForm) forms[m.closeForm] = (forms[m.closeForm] ?? 0) + 1;
    if (r.status) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    cells += m.cellsRemoved.length;
    statusLines += m.statusLinesRemoved.length;
    links += m.linksRewritten.length;
    if (r.fallbackAt !== undefined) fallbackSupplied += 1;
    if (m.fieldsMapped.some((f) => f.from === 'fallbackAt')) fallbackUsed += 1;
  }
  return {
    items: results.length,
    records: results.filter((r) => r.record).length,
    errors: results.filter((r) => r.problems.length > 0).length,
    forms,
    statuses,
    cellsRemoved: cells,
    statusLinesRemoved: statusLines,
    linksRewritten: links,
    fallbackSupplied,
    fallbackUsed,
  };
}

/**
 * Refuse an output directory inside the repository: this run is read-only on
 * the repo by contract.
 */
export function assertOutsideRepo(outDir, repoRoot = REPO_ROOT) {
  const rel = path.relative(repoRoot, path.resolve(outDir));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`refusing to write inside the repository: ${outDir}`);
  }
}

export function writeOutput(outDir, results) {
  assertOutsideRepo(outDir);
  // Clear only what this script writes; OUT_DIR itself may hold anything.
  rmSync(path.join(outDir, 'work'), { recursive: true, force: true });
  rmSync(path.join(outDir, 'manifest.json'), { force: true });
  for (const r of results) {
    if (!r.record) continue;
    const dir = path.join(outDir, bodyDirFor(r.record.id));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${r.record.id}.json`), serializeRecord(r.record));
    writeFileSync(path.join(dir, `${r.record.id}.md`), r.body);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(results.map((r) => r.manifest), null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.length > 1) {
    console.log('usage: node tools/work-convert-dryrun.mjs [OUT_DIR]   (default: $TMPDIR/signal-v2-dryrun; never inside the repo)');
    process.exit(args.length > 1 ? 2 : 0);
  }
  const outDir = path.resolve(args[0] ?? path.join(os.tmpdir(), 'signal-v2-dryrun'));
  const results = convertLiveStore();
  writeOutput(outDir, results);
  const s = summarize(results);
  console.log(`v1 items: ${s.items}   records: ${s.records}   items with problems: ${s.errors}`);
  console.log(`close forms: ${JSON.stringify(s.forms)}`);
  console.log(`folded status: ${JSON.stringify(s.statuses)}`);
  console.log(`cells removed: ${s.cellsRemoved}   status lines removed: ${s.statusLinesRemoved}   links rewritten: ${s.linksRewritten}`);
  console.log(`fallbackAt supplied: ${s.fallbackSupplied}   used for created: ${s.fallbackUsed}`);
  for (const r of results) for (const p of r.problems) console.log(`  ✗ ${r.relPath}: ${p}`);
  console.log(`written to ${outDir}`);
  process.exit(s.errors > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
