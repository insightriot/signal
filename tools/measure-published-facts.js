#!/usr/bin/env node
// M6.E2 — how many real projects publish the facts this Epic proposes to check?
//
// READ-ONLY. Reads `.planning/` documents and prints. Nothing is written to any
// corpus project and no Signal command is pointed at one — see
// `references/eval-corpus.md`; `examples/sandbox/` is the tree built to be run
// against.
//
// WHY. Signal's own `.planning/` is the MINORITY shape, and assuming otherwise
// has produced real defects (`B82`, `B94`). This Epic was pitched on five
// instances found in five files of THIS repository. Before scoping it, the
// question that decides its size is: does any of it reach a project that is not
// this one? Labels are pinned by hash so no project name appears here.
//
// Usage:  node tools/measure-published-facts.js <dir-of-projects> [...more]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const KNOWN = new Map([
  ['089f4667dcc1924d','D'],['1a6ed3839eed3172','F'],['26eab90d2b0be7cd','G'],
  ['38dfd52ec35ea8b8','H'],['4b3e37e57f00dcdc','B'],['5709cb590880d6d6','E'],
  ['733aee8b43e1f22f','I'],['aafd6a4c64386852','J'],['ae0162a32c456b36','A'],
  ['b1785dc8b4c98350','C'],['b984b04187721cbc','K'],['bee98bf120e89063','L'],
  ['c983c585ac3c40d9','M'],
]);
const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0,16);
const read = (p) => { try { return readFileSync(p,'utf8'); } catch { return null; } };

// The published-tally shape bugs-tally.js parses: "N needs-triage · ... (N total)"
const TALLY = /needs-triage[\s\S]{0,200}?total/i;
const UNRELEASED = /^##\s*\[Unreleased\]/mi;
const EPIC_STATUS_ROW = /^\|\s*`?M\d+(\.\d+)*\.E\d+`?\s*\|/mi;

const roots = process.argv.slice(2);
const rows = [];
for (const root of roots) {
  let entries = [];
  try { entries = readdirSync(root); } catch { continue; }
  for (const name of entries) {
    const dir = join(root, name);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    const planning = join(dir, '.planning');
    if (!existsSync(planning)) continue;

    const label = KNOWN.get(digest(name)) ?? '?';
    const bugs = read(join(planning,'BUGS.md'));
    const changelog = read(join(dir,'CHANGELOG.md')) ?? read(join(planning,'CHANGELOG.md'));
    let milestoneWithStatus = false;
    try {
      for (const f of readdirSync(planning)) {
        if (!/^MILESTONE-.*\.md$/.test(f)) continue;
        if (EPIC_STATUS_ROW.test(read(join(planning,f)) ?? '')) { milestoneWithStatus = true; break; }
      }
    } catch {
      /* a project with no readable MILESTONE files simply reports false */
    }

    rows.push({
      label,
      bugs: bugs !== null,
      tally: bugs !== null && TALLY.test(bugs),
      changelog: changelog !== null,
      unreleased: changelog !== null && UNRELEASED.test(changelog),
      milestoneWithStatus,
    });
  }
}
rows.sort((a,b)=>a.label.localeCompare(b.label));
const n = rows.length;
const c = (k) => rows.filter(r=>r[k]).length;
console.log(`projects with .planning/: ${n}\n`);
console.log('label            BUGS.md  tally  CHANGELOG  [Unreleased]  milestone-status');
for (const r of rows) {
  console.log(`eval-project-${r.label.padEnd(3)}  ${String(r.bugs).padEnd(7)} ${String(r.tally).padEnd(6)} ${String(r.changelog).padEnd(10)} ${String(r.unreleased).padEnd(13)} ${r.milestoneWithStatus}`);
}
console.log(`\nreach: BUGS.md ${c('bugs')}/${n} · published tally ${c('tally')}/${n} · CHANGELOG ${c('changelog')}/${n} · [Unreleased] ${c('unreleased')}/${n} · milestone status rows ${c('milestoneWithStatus')}/${n}`);
