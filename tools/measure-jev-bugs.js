#!/usr/bin/env node
/**
 * M6.E3 t3.1 (D-M6E3-15) — measure the shipped Jev bug-fixed check on the
 * corpus the published bug-status figures came from: BUGS.md + CHANGELOG.md at
 * fc4b8b1 (28 `confirmed` rows; the only real fix, `B102`).
 *
 * Maintainer tooling. No network code of its own — the only call is the audited
 * `plugin/tools/lib/jev.js#askNoul`. Needs TYPESAFE_API_KEY (environment, or
 * this repository's .env). Results vary between runs; publish with the date.
 *
 *   node tools/measure-jev-bugs.js
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeBugFixedJevCheck } from '../plugin/tools/lib/bug-fixed-jev.js';
import { runDriftChecks } from '../plugin/tools/lib/state-drift.js';
import { resolveJevKey, askNoul } from '../plugin/tools/lib/jev.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = 'fc4b8b1';
const REAL = new Set(['B102']);

async function main() {
  const key = resolveJevKey(ROOT);
  if (!key) {
    console.error('measure-jev-bugs: TYPESAFE_API_KEY is not set (environment or .env) — nothing measured.');
    process.exit(2);
  }
  const show = (p) => execFileSync('git', ['show', `${CORPUS}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const dir = await mkdtemp(join(tmpdir(), 'sig-measure-bugs-'));
  try {
    await mkdir(join(dir, '.planning'));
    await writeFile(join(dir, '.planning/STATE.md'), '---\nschema_version: 1\nphase: SHIP\n---\nbody\n');
    await writeFile(join(dir, '.planning/BUGS.md'), show('.planning/BUGS.md'));
    await writeFile(join(dir, 'CHANGELOG.md'), show('CHANGELOG.md'));

    const answers = new Map();
    const ask = async (args) => {
      const r = await askNoul(args);
      answers.set(args.question.instructions.match(/Bug (B\d+)/)[1], r);
      return r;
    };
    const [row] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask, key, budgetMs: 120000, concurrency: 4 })])).results;
    const flagged = new Set(row.findings.map((f) => f.message.match(/^(B\d+)/)[1]));

    console.log(`Jev bug-fixed check — measured ${new Date().toISOString().slice(0, 10)} on ${CORPUS}, model ${row.coverage?.model}`);
    console.log(`status: ${row.status}${row.reason ? ` (${row.reason})` : ''}; asked ${row.coverage?.checked} of ${row.coverage?.total}`);
    const hits = [...flagged].filter((id) => REAL.has(id)).length;
    console.log(`flags: ${flagged.size}, of which real: ${hits}; real fixes missed: ${[...REAL].filter((id) => !flagged.has(id)).join(', ') || 'none'}`);
    console.log('');
    for (const [id, r] of [...answers].sort()) {
      const mark = flagged.has(id) ? (REAL.has(id) ? 'HIT ' : 'FA  ') : REAL.has(id) ? 'MISS' : '    ';
      console.log(`${mark} ${id.padEnd(6)} p=${r.ok ? r.noul : `- (${r.reason})`}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`measure-jev-bugs: ${err.message}`);
  process.exit(1);
});
