// tools/archive-migrate.mjs — one-off archive migration (prototype of /sig:migrate-memory).
//
// Moves CLOSED-Epic scaffolding + CLOSED milestones into .planning/archive/, keeping the
// Epic-ID-prefixed filename inside each nested folder (so the ~99 bare-identifier references
// in live docs stay valid). Then rewrites references so nothing dangles:
//   1. LINK pass  — clickable `](target)` markdown links, recomputed relative to each
//                   linker's NEW location and its target's NEW location.
//   2. PROSE pass — backtick/path-prefixed `.planning/<file>` location-assertions → archive
//                   path. Runs AFTER the link pass (link targets no longer contain the bare
//                   `.planning/<file>` substring), so the two passes can't collide.
//
// RETROSPECTIVE files do NOT move (warm spine + live retro-index machinery parses their flat
// prefixed names). Active Epic (E5) and load-bearing root docs stay in root.
//
// Dry-run by default (touches nothing). Pass --apply to execute.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, resolve, basename } from 'node:path';

const ROOT = process.cwd();
const PLAN = join(ROOT, '.planning');
const APPLY = process.argv.includes('--apply');

const CLOSED_EPICS = ['E1', 'E2', 'E3', 'E4', 'E6', 'E7', 'E8', 'E9']; // E5 active → stays
const SCAFFOLD = ['REQUIREMENTS', 'RESEARCH', 'PLAN', 'PROGRESS', 'VERIFICATION', 'VALIDATION', 'REVIEW']; // NOT RETROSPECTIVE
const CLOSED_MILESTONES = ['1', '2', '3', '4'];

// ── Move map: absolute old → absolute new (prefixed filename preserved) ───────
const moves = new Map();
for (const e of CLOSED_EPICS)
  for (const t of SCAFFOLD) {
    const old = join(PLAN, `M4.5.${e}-${t}.md`);
    if (existsSync(old)) moves.set(old, join(PLAN, 'archive', 'M4.5', e, `M4.5.${e}-${t}.md`));
  }
for (const n of CLOSED_MILESTONES) {
  const old = join(PLAN, `MILESTONE-${n}.md`);
  if (existsSync(old)) moves.set(old, join(PLAN, 'archive', 'milestones', `MILESTONE-${n}.md`));
}
const newLoc = (abs) => moves.get(abs) || abs;

// Prose replacements: repo-root-style `.planning/<old>` → `.planning/<new-rel-to-.planning>`
const prose = [...moves].map(([o, n]) => [`.planning/${basename(o)}`, `.planning/${relative(PLAN, n)}`]);

async function walk(dir) {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p)));
    else if (d.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const LINK_RE = /\]\(([^)]+)\)/g;
const isExternal = (t) => /^(https?:|mailto:|#)/.test(t);
const short = (p) => relative(ROOT, p);

// ── LINK pass: compute clickable-link rewrites (against pre-move layout) ──────
const files = await walk(PLAN); // captured BEFORE any move
const editsByFile = new Map(); // originalPath → [{from, to}]
for (const f of files) {
  const text = await readFile(f, 'utf-8');
  const fNew = newLoc(f);
  for (const m of text.matchAll(LINK_RE)) {
    const raw = m[1];
    if (isExternal(raw)) continue;
    const [pathPart, ...titleParts] = raw.trim().split(/\s+/);
    const [targetPath, anchor = ''] = pathPart.split(/(#.*)/);
    if (!targetPath.endsWith('.md')) continue;
    const cands = [resolve(dirname(f), targetPath), resolve(ROOT, targetPath)];
    const absTarget = cands.find((c) => moves.has(c)) || cands[0];
    const tNew = newLoc(absTarget);
    if (fNew === f && tNew === absTarget) continue;
    let rel = relative(dirname(fNew), tNew);
    if (!rel.startsWith('.')) rel = './' + rel;
    const to = rel + anchor + (titleParts.length ? ' ' + titleParts.join(' ') : '');
    if (raw !== to) editsByFile.set(f, (editsByFile.get(f) || []).concat({ from: raw, to }));
  }
}
const editCount = [...editsByFile.values()].reduce((a, es) => a + es.length, 0);

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n=== ARCHIVE MIGRATION ${APPLY ? '(APPLY)' : '(DRY-RUN — nothing touched)'} ===\n`);
console.log(`Files to move:   ${moves.size}`);
console.log(`Link rewrites:   ${editCount} across ${editsByFile.size} files`);
console.log(`Prose patterns:  ${prose.length}\n`);
console.log('── MOVES ──');
for (const [o, n] of moves) console.log(`  ${short(o)}  →  ${short(n)}`);
console.log('\n── LINK REWRITES ──');
for (const [file, es] of editsByFile) {
  console.log(`  ${short(file)} (${es.length})`);
  for (const e of es) console.log(`      ](${e.from}) → ](${e.to})`);
}

// ── Apply ───────────────────────────────────────────────────────────────────
if (APPLY) {
  for (const [o, n] of moves) {
    await mkdir(dirname(n), { recursive: true });
    execFileSync('git', ['mv', o, n], { cwd: ROOT });
  }
  let proseHits = 0;
  for (const f of files) {
    const cur = newLoc(f); // where this file lives now
    let text = await readFile(cur, 'utf-8');
    for (const e of editsByFile.get(f) || []) text = text.split(`](${e.from})`).join(`](${e.to})`);
    for (const [from, to] of prose) {
      const before = text;
      text = text.split(from).join(to);
      proseHits += (before.length !== text.length) ? (before.split(from).length - 1) : 0;
    }
    await writeFile(cur, text);
  }
  // Verify: no dangling .md links; no residual flat `.planning/<moved-scaffold>` paths.
  const movedScaffold = /\.planning\/M4\.5\.E[0-9]+-(REQUIREMENTS|RESEARCH|PLAN|PROGRESS|VERIFICATION|VALIDATION|REVIEW)\.md|\.planning\/MILESTONE-[1234]\.md/g;
  const dangling = [], residual = [];
  for (const f of await walk(PLAN)) {
    const text = await readFile(f, 'utf-8');
    for (const m of text.matchAll(LINK_RE)) {
      const raw = m[1];
      if (isExternal(raw)) continue;
      const tp = raw.trim().split(/\s+/)[0].split('#')[0];
      if (tp.endsWith('.md') && !existsSync(resolve(dirname(f), tp))) dangling.push(`${short(f)} → ${raw}`);
    }
    for (const m of text.matchAll(movedScaffold)) residual.push(`${short(f)} → ${m[0]}`);
  }
  console.log(`\n── VERIFY ──`);
  console.log(`  Prose paths rewritten: ${proseHits}`);
  console.log(`  Dangling .md links:    ${dangling.length === 0 ? 'none ✓' : dangling.length}`);
  for (const d of dangling) console.log(`    ✗ ${d}`);
  console.log(`  Residual flat paths:   ${residual.length === 0 ? 'none ✓' : residual.length}`);
  for (const r of [...new Set(residual)].slice(0, 30)) console.log(`    ⚠ ${r}`);
}
