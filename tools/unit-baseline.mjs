#!/usr/bin/env node
// tools/unit-baseline.mjs — what every source says about every unit, today.
//
// A MAINTAINER TOOL, NOT A SIGNAL FEATURE (like `cross-project-scan.js`): no
// `/sig:` command, not shipped in the plugin. M6.E16 t0.1.
//
// WHY IT EXISTS. M6.E16 turns each Epic or unit into a JSON record and closes
// the already-shipped ones as `legacy`. Before any reader changes, this takes
// the "before": for every unit named by a milestone row, a retrospective, an
// archive folder, an item record or a root artifact, what each of those says,
// and what the closure resolver answers. Nobody had compared them unit by unit.
//
// READ-ONLY except for its two output files. No network, no git.
//
// It REPORTS and does not judge. "Shipped" below means the status cell of the
// milestone row contains the word "shipped", in any case — nothing more.
//
// Usage:
//   node tools/unit-baseline.mjs [project-root]      # default: cwd
//   node tools/unit-baseline.mjs --out-dir <dir>     # write the two files elsewhere
//   node tools/unit-baseline.mjs --check             # compute twice, compare bytes, write nothing

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listMilestones, parseEpicStatusRows } from '../plugin/tools/lib/milestones.js';
import { retroStatusFromContent, RETRO_STATUS } from '../plugin/tools/lib/retro-index.js';
import { listRecords } from '../plugin/tools/lib/work-records.js';
import { epicOf } from '../plugin/tools/lib/work-record.js';
import { deriveUnits } from '../plugin/tools/lib/work-units.js';
import { resolveClosures, CLOSURE } from '../plugin/tools/lib/closure.js';

export const BASELINE_FILE = 'M6.E16-BASELINE.json';
export const DIFF_FILE = 'M6.E16-MIGRATION-DIFF.md';

const PLANNING = '.planning';
const ARCHIVE = `${PLANNING}/archive`;

// The order `sources` is written in, and the only names it uses.
const SOURCES = ['milestone-row', 'retrospective', 'archive-folder', 'items', 'root-artifacts'];

const EPIC_ID_RE = /^M(\d+(?:\.\d+)?)\.E(\d+)$/;
const RETRO_FILE_RE = /^(.+)-RETROSPECTIVE\.md$/;
const MILESTONE_DIR_RE = /^M\d+(?:\.\d+)?$/;
const EPIC_DIR_RE = /^E\d+$/;
const SHIPPED_RE = /shipped/i;

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The stable unit order: milestone as a number, then Epic number, then every
 * name that is not an Epic ID, alphabetically by code unit (no locale).
 */
export function compareUnitIds(a, b) {
  const ma = EPIC_ID_RE.exec(a);
  const mb = EPIC_ID_RE.exec(b);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]) || byText(a, b);
  if (ma) return -1;
  if (mb) return 1;
  return byText(a, b);
}

/** Directory entries, or `[]` when the directory is absent. */
async function entries(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).sort((a, b) => byText(a.name, b.name));
  } catch {
    return [];
  }
}

/**
 * A row's first three cells, verbatim apart from surrounding whitespace. The
 * third cell is everything after the second `|`, so a pipe inside it survives.
 */
function rowCells(raw) {
  const line = raw.trim().replace(/^\|/, '');
  const one = line.indexOf('|');
  const two = line.indexOf('|', one + 1);
  return [
    line.slice(0, one).trim(),
    line.slice(one + 1, two).trim(),
    line.slice(two + 1).replace(/\|\s*$/, '').trim(),
  ];
}

/** Every Epic row in every top-level `MILESTONE-*.md`, in file then line order. */
async function readMilestoneRows(root) {
  const rows = [];
  for (const { id, file } of await listMilestones(root)) {
    const content = await readFile(join(root, PLANNING, file), 'utf-8');
    for (const row of parseEpicStatusRows(content, { milestone: id })) {
      rows.push({ id: row.id, file: `${PLANNING}/${file}`, line: row.line, cells: rowCells(row.raw) });
    }
  }
  return rows;
}

/** Every `<unit>-RETROSPECTIVE.md` in the planning root and anywhere under the archive. */
async function readRetros(root) {
  const found = [];
  const visit = async (rel, recurse) => {
    for (const e of await entries(join(root, rel))) {
      if (e.isDirectory()) {
        if (recurse) await visit(`${rel}/${e.name}`, true);
        continue;
      }
      const m = e.isFile() ? RETRO_FILE_RE.exec(e.name) : null;
      if (!m) continue;
      const path = `${rel}/${e.name}`;
      const status = retroStatusFromContent(await readFile(join(root, path), 'utf-8'));
      found.push({ id: m[1], path, status: status === RETRO_STATUS.ABSENT ? 'none' : status });
    }
  };
  await visit(PLANNING, false);
  await visit(ARCHIVE, true);
  return found;
}

/** Both archive layouts: `archive/<M>/E<n>/` and `archive/epics/<ID>/`. */
async function readArchiveDirs(root) {
  const found = [];
  for (const m of await entries(join(root, ARCHIVE))) {
    if (!m.isDirectory()) continue;
    const kids = (await entries(join(root, ARCHIVE, m.name))).filter((e) => e.isDirectory());
    if (m.name === 'epics') {
      for (const e of kids) found.push({ id: e.name, path: `${ARCHIVE}/epics/${e.name}` });
    } else if (MILESTONE_DIR_RE.test(m.name)) {
      for (const e of kids) {
        if (EPIC_DIR_RE.test(e.name)) found.push({ id: `${m.name}.${e.name}`, path: `${ARCHIVE}/${m.name}/${e.name}` });
      }
    }
  }
  return found;
}

/** Item counts per unit, from each record's folded Epic. A store that is off is said, not thrown. */
function readItems(root) {
  const perUnit = new Map();
  let listed;
  try {
    listed = listRecords(root);
  } catch {
    return { perUnit, counts: { readable: false, total: 0, with_unit: 0, broken: 0 } };
  }
  let withUnit = 0;
  for (const { record } of listed.records) {
    const unit = epicOf(record);
    if (unit === null) continue;
    withUnit += 1;
    perUnit.set(unit, (perUnit.get(unit) ?? 0) + 1);
  }
  return {
    perUnit,
    counts: { readable: true, total: listed.records.length, with_unit: withUnit, broken: listed.broken.length },
  };
}

/**
 * What every source says about every unit of the project at `root`.
 *
 * @param {string} root — project root
 * @returns {Promise<{units: object[], counts: object, contradictions: object}>}
 */
export async function collectBaseline(root) {
  const units = new Map();
  const unit = (id) => {
    if (!units.has(id)) {
      units.set(id, {
        id, named: new Set(), row: null, retros: [], archive_dirs: [], item_count: 0,
        root_artifact_count: 0, resolver: { answer: null, reason: null },
      });
    }
    return units.get(id);
  };

  const extraRows = [];
  for (const row of await readMilestoneRows(root)) {
    const u = unit(row.id);
    u.named.add('milestone-row');
    const { id, ...rest } = row;
    if (u.row === null) u.row = rest;
    else extraRows.push({ id, file: row.file, line: row.line });
  }

  for (const retro of await readRetros(root)) {
    const u = unit(retro.id);
    u.named.add('retrospective');
    u.retros.push(retro);
  }

  for (const dir of await readArchiveDirs(root)) {
    const u = unit(dir.id);
    u.named.add('archive-folder');
    u.archive_dirs.push(dir.path);
  }

  const items = readItems(root);
  for (const [id, count] of items.perUnit) {
    const u = unit(id);
    u.named.add('items');
    u.item_count = count;
  }

  const rootFiles = (await entries(join(root, PLANNING))).filter((e) => e.isFile()).map((e) => e.name);
  for (const [id, files] of deriveUnits(rootFiles).units) {
    const u = unit(id);
    u.named.add('root-artifacts');
    u.root_artifact_count = files.length;
  }

  const closures = await resolveClosures(root);
  for (const c of closures.units) {
    unit(c.unit).resolver = { answer: c.status, reason: c.reason ?? null };
  }

  const out = [...units.values()].sort((a, b) => compareUnitIds(a.id, b.id)).map((u) => {
    // The planning root's retrospective wins over an archived copy; then path order.
    const retro = [...u.retros].sort(
      (a, b) => a.path.split('/').length - b.path.split('/').length || byText(a.path, b.path)
    )[0] ?? null;
    return {
      id: u.id,
      sources: SOURCES.filter((s) => u.named.has(s)),
      milestone_row: u.row,
      retro: retro ? retro.status : 'none',
      retro_path: retro ? retro.path : null,
      archive_dirs: [...u.archive_dirs].sort(byText),
      item_count: u.item_count,
      root_artifact_count: u.root_artifact_count,
      resolver: u.resolver,
    };
  });

  const count = (pred) => out.filter(pred).length;
  const ids = (pred) => out.filter(pred).map((u) => u.id);
  const shipped = (u) => u.milestone_row !== null && SHIPPED_RE.test(u.milestone_row.cells[1]);

  const counts = {
    units: out.length,
    epic_units: count((u) => EPIC_ID_RE.test(u.id)),
    other_units: count((u) => !EPIC_ID_RE.test(u.id)),
    milestone_rows: count((u) => u.milestone_row !== null),
    shipped_rows: count(shipped),
    extra_milestone_rows: extraRows,
    retro: {
      complete: count((u) => u.retro === 'complete'),
      stub: count((u) => u.retro === 'stub'),
      none: count((u) => u.retro === 'none'),
    },
    resolver: {
      closed: count((u) => u.resolver.answer === CLOSURE.CLOSED),
      open: count((u) => u.resolver.answer === CLOSURE.OPEN),
      cannotDetermine: count((u) => u.resolver.answer === CLOSURE.CANNOT_DETERMINE),
      not_seen: count((u) => u.resolver.answer === null),
    },
    resolver_state_readable: closures.stateReadable,
    items: items.counts,
    by_source: Object.fromEntries(SOURCES.map((s) => [s, count((u) => u.sources.includes(s))])),
  };

  const contradictions = {
    shipped_row_resolver_not_closed: ids(
      (u) => shipped(u) && u.resolver.answer !== null && u.resolver.answer !== CLOSURE.CLOSED
    ),
    shipped_row_resolver_never_saw: ids((u) => shipped(u) && u.resolver.answer === null),
    row_without_complete_retro: ids((u) => u.milestone_row !== null && u.retro !== 'complete'),
    named_by_one_source: ids((u) => u.sources.length === 1),
    named_but_never_run: ids(
      (u) => u.sources.every((s) => s === 'milestone-row' || s === 'items')
    ),
  };

  return { units: out, counts, contradictions };
}

/** The JSON file's bytes. Key order is the order the objects are built in. */
export function serializeBaseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const tick = (id) => `\`${id}\``;
const idList = (list) => (list.length === 0 ? 'none' : list.map(tick).join(', '));

/** The Markdown file: the left side of the cutover diff. */
export function renderDiff(baseline) {
  const { units, counts, contradictions: c } = baseline;
  const L = [];
  L.push('# M6.E16 — Migration diff');
  L.push('');
  L.push('This is the **left side**: what the sources say today, taken before any reader changed.');
  L.push('The right side — what the unit records say — is added at S8, between the markers at the end.');
  L.push('');
  L.push('Written by `node tools/unit-baseline.mjs`. Do not edit by hand above the markers.');
  L.push(`The same facts, with every row's third cell, are in [\`${BASELINE_FILE}\`](${BASELINE_FILE}).`);
  L.push('');
  L.push('## How to read it');
  L.push('');
  L.push('- A unit is listed if **any** source names it: a milestone table row, a retrospective,');
  L.push('  an archive folder, an item record, or files in the planning root.');
  L.push('- **Row** is the first and second cell of the milestone row, copied as written.');
  L.push('- **Retro** is `complete`, `stub` (it still holds a `[FILL IN]` line) or `none`.');
  L.push('- **Resolver** is what today\'s closure check (`resolveClosures`, the code-level name) answers.');
  L.push('  It only looks at files in the planning root. `not seen` means the unit has none there,');
  L.push('  so the check gave no answer for it. That is not the same as `open`.');
  L.push('- "Shipped" below means the row\'s status cell contains the word "shipped". Nothing more is read into it.');
  L.push('');
  L.push('## Counts');
  L.push('');
  L.push(`- Units: ${counts.units} (${counts.epic_units} with an Epic ID, ${counts.other_units} with another name).`);
  L.push(`- Milestone rows: ${counts.milestone_rows}. Rows that say shipped: ${counts.shipped_rows}.`);
  L.push(`- Retrospectives: ${counts.retro.complete} complete, ${counts.retro.stub} stub, ${counts.retro.none} none.`);
  L.push(
    `- Resolver: ${counts.resolver.closed} closed, ${counts.resolver.open} open, ` +
    `${counts.resolver.cannotDetermine} cannot determine, ${counts.resolver.not_seen} not seen.`
  );
  L.push(
    counts.items.readable
      ? `- Items: ${counts.items.total} records, ${counts.items.with_unit} of them in a unit, ${counts.items.broken} unreadable.`
      : '- Items: the work store is off or could not be read, so no item was counted.'
  );
  L.push(
    '- Named by: ' +
    SOURCES.map((s) => `${s} ${counts.by_source[s]}`).join(', ') + '.'
  );
  if (counts.extra_milestone_rows.length > 0) {
    L.push(
      '- A unit with more than one row keeps its first. Extra rows: ' +
      counts.extra_milestone_rows.map((r) => `${tick(r.id)} at \`${r.file}:${r.line}\``).join(', ') + '.'
    );
  }
  L.push('');
  L.push('## What the sources say today');
  L.push('');
  L.push('| Unit | Named by | Row (where) | Row: first cell | Row: status cell | Retro | Archive folders | Items | Root files | Resolver | Resolver\'s reason |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const u of units) {
    const row = u.milestone_row;
    L.push(
      '| ' +
      [
        tick(u.id),
        u.sources.join(', '),
        row ? `\`${row.file.replace(`${PLANNING}/`, '')}:${row.line}\`` : '—',
        row ? row.cells[0] : '—',
        row ? row.cells[1] : '—',
        u.retro,
        u.archive_dirs.length ? u.archive_dirs.map((d) => tick(d.replace(`${ARCHIVE}/`, ''))).join(', ') : '—',
        u.item_count,
        u.root_artifact_count,
        u.resolver.answer ?? 'not seen',
        u.resolver.reason ?? '—',
      ].map(cell).join(' | ') +
      ' |'
    );
  }
  L.push('');
  L.push('## Contradictions visible today');
  L.push('');
  L.push('Each list is computed from the table above. Nothing here is a judgement.');
  L.push('');
  L.push(`- **The row says shipped, and the resolver says open or cannot determine** (${c.shipped_row_resolver_not_closed.length}): ${idList(c.shipped_row_resolver_not_closed)}`);
  L.push(`- **The row says shipped, and the resolver never saw the unit** — no files in the planning root (${c.shipped_row_resolver_never_saw.length}): ${idList(c.shipped_row_resolver_never_saw)}`);
  L.push(`- **A row, but the retrospective is a stub or missing** (${c.row_without_complete_retro.length}): ${idList(c.row_without_complete_retro)}`);
  L.push(`- **Named by only one source** (${c.named_by_one_source.length}): ${idList(c.named_by_one_source)}`);
  L.push(`- **Named but never run?** Named only by a milestone row or by items; no retrospective, no archive folder, no root files (${c.named_but_never_run.length}): ${idList(c.named_but_never_run)}`);
  L.push('');
  L.push('<!-- diff:begin -->');
  L.push('_The right side — what the unit records say — is added at S8._');
  L.push('<!-- diff:end -->');
  return `${L.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) await main();

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outAt = args.indexOf('--out-dir');
  const outArg = outAt === -1 ? null : args[outAt + 1];
  if (outAt !== -1 && !outArg) {
    process.stderr.write('--out-dir needs a directory.\n');
    process.exit(2);
  }
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== outAt + 1);
  const root = resolve(positional[0] ?? process.cwd());
  const outDir = outArg ? resolve(outArg) : join(root, PLANNING);

  const compute = async () => {
    const baseline = await collectBaseline(root);
    return [serializeBaseline(baseline), renderDiff(baseline), baseline];
  };
  const [json, md, baseline] = await compute();

  if (check) {
    const [json2, md2] = await compute();
    if (json !== json2 || md !== md2) {
      process.stderr.write('Two runs gave different bytes — the snapshot is not deterministic.\n');
      process.exit(1);
    }
    process.stdout.write('Two runs gave identical bytes. Nothing written.\n');
    return;
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, BASELINE_FILE), json, 'utf-8');
  await writeFile(join(outDir, DIFF_FILE), md, 'utf-8');
  process.stdout.write(`${baseline.counts.units} units. Wrote ${BASELINE_FILE} and ${DIFF_FILE}.\n`);
}
