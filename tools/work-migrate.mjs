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

import { applyMigration, formatMigrationReport } from '../plugin/tools/lib/work-migrate.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dateIdx = args.indexOf('--date');
const date = dateIdx === -1 ? undefined : args[dateIdx + 1];

const unknown = args.filter((a, i) => a !== '--apply' && a !== '--date' && i !== dateIdx + 1);
if (unknown.length || (dateIdx !== -1 && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? ''))) {
  console.error('usage: node tools/work-migrate.mjs [--apply] [--date YYYY-MM-DD]');
  process.exit(2);
}

try {
  const report = await applyMigration(process.cwd(), { dryRun: !apply, ...(date ? { date } : {}) });
  process.stdout.write(formatMigrationReport(report));
} catch (err) {
  console.error(err.code ? `${err.code}: ${err.message}` : err.stack ?? String(err));
  process.exit(1);
}
