#!/usr/bin/env node

// tools/work-migrate.mjs — migrate this repository's four hand-kept lists into
// the work-item store (M6.E11 t7.2, AC-9.3).
//
// SCOPE: Signal's own repository, step 1 of the work-item design. Other
// projects move over through `/sig:docs-migrate`, which is step 5 and not
// built yet — so this is repo tooling (like `tools/archive-migrate.mjs`), not a
// `/sig:` command.
//
// Dry run by default: prints the report and writes nothing. `--apply` writes.
// Runs against the current directory's `.planning/`.
//
//   node tools/work-migrate.mjs                      # dry run
//   node tools/work-migrate.mjs --date 2026-09-29    # dry run, close date pinned
//   node tools/work-migrate.mjs --apply              # migrate
//   node tools/work-migrate.mjs --help               # usage, nothing else
//
// Any other argument is refused with the usage line and exit 2 — a mistyped
// flag never falls through to a run.

import { applyMigration, formatMigrationReport } from '../plugin/tools/lib/work-migrate.js';

const USAGE = 'usage: node tools/work-migrate.mjs [--apply] [--date YYYY-MM-DD] [--help]';

let apply = false;
let help = false;
let date;
const unknown = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') apply = true;
  else if (a === '--help' || a === '-h') help = true;
  else if (a === '--date') date = args[++i] ?? '';
  else unknown.push(a);
}

if (help) {
  console.log(USAGE);
  process.exit(0);
}
if (unknown.length) {
  console.error(`unknown argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}\n${USAGE}`);
  process.exit(2);
}
if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`--date needs YYYY-MM-DD (got ${JSON.stringify(date)})\n${USAGE}`);
  process.exit(2);
}

try {
  const report = await applyMigration(process.cwd(), { dryRun: !apply, ...(date ? { date } : {}) });
  process.stdout.write(formatMigrationReport(report));
} catch (err) {
  console.error(err.code ? `${err.code}: ${err.message}` : err.stack ?? String(err));
  process.exit(1);
}
