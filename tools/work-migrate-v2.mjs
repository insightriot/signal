#!/usr/bin/env node

// tools/work-migrate-v2.mjs — migrate this repository's v1 work store (item
// files in status folders) to v2 records (M6.E13 t7.1a, PLAN Decision 10).
//
// SCOPE: maintainer tooling, repo-root, not shipped — like `tools/work-migrate.mjs`
// (v1). The v1 refusal message of `work-records.js` names this script. Moving
// other projects is a later Epic. The logic is `migrateWorkStoreV2` in
// `plugin/tools/lib/work-migrate-v2.js`.
//
// Dry run by default: the store as it is now is converted, verified, and built
// ASIDE as a v2 project in OUT (default: a new directory under $TMPDIR; never
// inside the repository), with `OUT/manifest.json`. Nothing in the repository
// changes. `--apply` does the same, then migrates the repository itself:
// records into `.planning/work/items/`, `WORK.md` to `schema_version: 2` (its body
// rewritten for records), the v1 item files relocated to
// `.planning/archive/pre-work-store-v2/` and the emptied status folders removed,
// close requests confirmed, views regenerated, and the manifest kept as
// `.planning/archive/pre-work-store-v2/MANIFEST.json`. It refuses a dirty working tree.
//
//   node tools/work-migrate-v2.mjs                 # dry run
//   node tools/work-migrate-v2.mjs --out /tmp/v2   # dry run, built in /tmp/v2
//   node tools/work-migrate-v2.mjs --apply         # migrate (the cutover)
//   node tools/work-migrate-v2.mjs --help
//
// Runs against the current directory. Any other argument is refused (exit 2).

import { migrateWorkStoreV2 } from '../plugin/tools/lib/work-migrate-v2.js';

const USAGE = 'usage: node tools/work-migrate-v2.mjs [--apply] [--out DIR] [--help]\n'
  + '  dry run by default: builds the v2 store aside in DIR (default: a new $TMPDIR directory) and writes\n'
  + '  DIR/manifest.json; --apply also migrates this repository (refuses a dirty working tree).';

let apply = false;
let help = false;
let out;
const unknown = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') apply = true;
  else if (a === '--help' || a === '-h') help = true;
  else if (a === '--out') out = args[++i] ?? '';
  else unknown.push(a);
}

if (help) {
  console.log(USAGE);
  process.exit(0);
}
if (unknown.length || out === '') {
  console.error(`${unknown.length ? `unknown argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}` : '--out needs a directory'}\n${USAGE}`);
  process.exit(2);
}

try {
  const { mode, outDir, manifest } = await migrateWorkStoreV2(process.cwd(), { apply, ...(out ? { outDir: out } : {}) });
  const s = manifest.summary;
  const p = manifest.closes.probe;
  console.log(`${mode}: ${s.v1Files} v1 item files → ${s.records} records; ${s.errors} conversion errors; `
    + `${manifest.verification.errors.length} verification errors`);
  console.log(`close forms: ${JSON.stringify(s.closeForms)} (legacy closes: ${s.legacyCloses})`);
  console.log(`body: ${s.cellsRemoved} cells removed, ${s.statusLinesRemoved} status lines removed, ${s.linksRewritten} links rewritten`);
  console.log(`close requests: ${manifest.closes.requested.join(', ') || 'none'}`);
  console.log(`  probe vs ${p.ref ?? '(no origin default branch)'} ${p.sha ?? ''}: confirmable ${p.confirmable.join(', ') || 'none'}`
    + `${p.stillClosing.length ? `; still closing ${p.stillClosing.map((c) => `${c.id} (${c.reason})`).join(', ')}` : ''}`);
  if (manifest.closes.confirmed) console.log(`  confirmed: ${manifest.closes.confirmed.join(', ') || 'none'}`);
  console.log(`built aside in ${outDir}; manifest: ${outDir}/manifest.json`);
} catch (err) {
  console.error(err.code ? `${err.code}: ${err.message}` : err.stack ?? String(err));
  process.exit(1);
}
