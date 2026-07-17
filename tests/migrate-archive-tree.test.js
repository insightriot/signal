// M5.E2.S2.t3 — generalized archive-tree + keyed link rewrite.
//
// The load-bearing proof-of-fail is LITERAL-INDEPENDENCE: the archive moves are
// computed from signals (closed-Epic IDs from retros, the milestone derived from
// the Epic ID), NOT from the prototype's hardcoded `['E1',…]` array + `M4.5.…`
// filename template. On a non-M4.5 fixture (M6.E1, M2.E3) the hardcoded prototype
// port computes ZERO moves → these assertions go RED; the generalized impl passes.
// Plus: CRLF round-trips byte-for-byte; every rewritten link target is POSIX `/`
// (no backslash); the keyed single-scan rewrite prevents the link↔prose collision
// / double-rewrite the prototype only avoided by pass ordering.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  planArchiveMoves,
  computeLinkEdits,
  computeProseEdits,
  applyKeyedReplacements,
  applyArchiveTree,
  detectUnhandledLinkForms,
  toPosix,
  SCAFFOLD_SUFFIXES,
} from '../tools/lib/archive-tree.js';

// --- PURE literal-independence: the RED tripwire --------------------------------
describe('M5.E2.S2.t3 planArchiveMoves — computed from signals, not literals', () => {
  it('computes moves for a NON-M4.5 Epic (M6.E1) — hardcoded `[E1]`/`M4.5.…` template returns ZERO here', () => {
    const closedEpicIds = ['M6.E1'];
    const files = [
      '.planning/M6.E1-PLAN.md',
      '.planning/M6.E1-REQUIREMENTS.md',
      '.planning/M6.E1-RETROSPECTIVE.md', // retro STAYS — never in the move set
      '.planning/STATE.md',
    ];
    const { moves, moveMap } = planArchiveMoves(closedEpicIds, files);

    // The scaffold docs move under the milestone DERIVED from the Epic ID.
    expect(moveMap.get('.planning/M6.E1-PLAN.md')).toBe(
      '.planning/archive/M6/E1/M6.E1-PLAN.md',
    );
    expect(moveMap.get('.planning/M6.E1-REQUIREMENTS.md')).toBe(
      '.planning/archive/M6/E1/M6.E1-REQUIREMENTS.md',
    );
    // The retro is NOT moved (warm spine); STATE.md is not a scaffold doc.
    expect(moveMap.has('.planning/M6.E1-RETROSPECTIVE.md')).toBe(false);
    expect(moveMap.has('.planning/STATE.md')).toBe(false);
    expect(moves).toHaveLength(2);
  });

  it('computes moves for a different milestone shape (M2.E3) with zero code change', () => {
    const { moveMap } = planArchiveMoves(
      ['M2.E3'],
      ['.planning/M2.E3-PLAN.md', '.planning/M2.E3-VALIDATION.md'],
    );
    expect(moveMap.get('.planning/M2.E3-PLAN.md')).toBe(
      '.planning/archive/M2/E3/M2.E3-PLAN.md',
    );
    expect(moveMap.get('.planning/M2.E3-VALIDATION.md')).toBe(
      '.planning/archive/M2/E3/M2.E3-VALIDATION.md',
    );
  });

  it('only moves scaffold docs that actually exist on disk', () => {
    const { moves } = planArchiveMoves(['M6.E1'], ['.planning/M6.E1-PLAN.md']);
    expect(moves.map((m) => m.from)).toEqual(['.planning/M6.E1-PLAN.md']);
  });

  it('SCAFFOLD_SUFFIXES excludes RETROSPECTIVE (retros stay in root)', () => {
    expect(SCAFFOLD_SUFFIXES).not.toContain('RETROSPECTIVE');
    expect(SCAFFOLD_SUFFIXES).toContain('PLAN');
  });
});

// --- B10: SHIP scaffolds archive WITH their Epic (RETROSPECTIVE + LAUNCH-KIT stay) --
describe('M5.E2.S2.t6 planArchiveMoves — SHIP archives with its Epic (B10)', () => {
  it('includes the SHIP doc in the moves → archive/<m>/<e>/ (was orphaned in root pre-fix)', () => {
    const closedEpicIds = ['M6.E1'];
    const files = [
      '.planning/M6.E1-PLAN.md',
      '.planning/M6.E1-SHIP.md',
      '.planning/M6.E1-RETROSPECTIVE.md', // warm spine — stays in root
      '.planning/M6.E1-LAUNCH-KIT.md', // one-off living asset — stays in root
    ];
    const { moveMap } = planArchiveMoves(closedEpicIds, files);

    // The SHIP doc moves under the milestone DERIVED from the Epic ID (B10 fix).
    expect(moveMap.get('.planning/M6.E1-SHIP.md')).toBe(
      '.planning/archive/M6/E1/M6.E1-SHIP.md',
    );
    // RETROSPECTIVE still stays in root (warm-spine exclusion intact).
    expect(moveMap.has('.planning/M6.E1-RETROSPECTIVE.md')).toBe(false);
    // LAUNCH-KIT is a non-standard suffix — left in root (product call), no special-case.
    expect(moveMap.has('.planning/M6.E1-LAUNCH-KIT.md')).toBe(false);
  });

  it('SCAFFOLD_SUFFIXES includes SHIP (still excludes RETROSPECTIVE / LAUNCH-KIT)', () => {
    expect(SCAFFOLD_SUFFIXES).toContain('SHIP');
    expect(SCAFFOLD_SUFFIXES).not.toContain('RETROSPECTIVE');
    expect(SCAFFOLD_SUFFIXES).not.toContain('LAUNCH-KIT');
  });
});

// --- POSIX-`/` guarantee (bites on macOS via path.posix + toPosix) --------------
describe('M5.E2.S2.t3 POSIX link targets — no backslash on any platform', () => {
  it('toPosix normalizes a backslash path to `/`', () => {
    expect(toPosix('.planning\\archive\\M6\\E1\\M6.E1-PLAN.md')).toBe(
      '.planning/archive/M6/E1/M6.E1-PLAN.md',
    );
  });

  it('recomputes a moved-file link with POSIX separators (exact `/`-only string)', () => {
    // A file relocated deep into the archive linking UP to a live retro: the
    // relative path must be POSIX. path.posix.relative guarantees `/` even on
    // Windows, where node `path.relative` would emit `..\\..\\..\\`.
    const moveMap = new Map([
      ['.planning/M6.E1-PLAN.md', '.planning/archive/M6/E1/M6.E1-PLAN.md'],
    ]);
    const edits = computeLinkEdits(
      '.planning/M6.E1-PLAN.md',
      'see [retro](M6.E1-RETROSPECTIVE.md)',
      moveMap,
    );
    expect(edits).toHaveLength(1);
    expect(edits[0].to).toBe('](../../../M6.E1-RETROSPECTIVE.md)');
    expect(edits[0].to).not.toMatch(/\\/); // no backslash
  });

  it('every rewritten link target across a plan is backslash-free', () => {
    const moveMap = new Map([
      ['.planning/M6.E1-PLAN.md', '.planning/archive/M6/E1/M6.E1-PLAN.md'],
    ]);
    const edits = computeLinkEdits(
      '.planning/STATE.md',
      'a [x](M6.E1-PLAN.md) and [y](.planning/M6.E1-PLAN.md)',
      moveMap,
    );
    for (const e of edits) expect(e.to).not.toMatch(/\\/);
  });
});

// --- keyed rewrite: link↔prose collision + cascade are structurally impossible --
describe('M5.E2.S2.t3 keyed replacements — no collision, no double-rewrite', () => {
  it('a link and a bare prose path to the SAME moved file are each rewritten exactly once', () => {
    // The prototype's ordering hazard: a prose `from` (`.planning/M6.E1-PLAN.md`)
    // matching INSIDE a link the link-pass also touches. The merged single-scan
    // consumes the delimited link edit as a whole, so the bare-path prose key can
    // never match inside it.
    const moveMap = new Map([
      ['.planning/M6.E1-PLAN.md', '.planning/archive/M6/E1/M6.E1-PLAN.md'],
    ]);
    const text = 'See [plan](.planning/M6.E1-PLAN.md) and note `.planning/M6.E1-PLAN.md`.';
    const merged = [
      ...computeLinkEdits('.planning/STATE.md', text, moveMap),
      ...computeProseEdits(moveMap),
    ];
    const out = applyKeyedReplacements(text, merged);

    // The link was recomputed relative to the linker (`.planning/STATE.md`).
    expect(out).toContain('[plan](./archive/M6/E1/M6.E1-PLAN.md)');
    // The bare prose assertion got the archive path.
    expect(out).toContain('`.planning/archive/M6/E1/M6.E1-PLAN.md`');
    // Neither collided: no leftover bare path, no doubled `.planning/.planning/`.
    expect(out).not.toContain('.planning/M6.E1-PLAN.md`');
    expect(out).not.toContain('.planning/.planning/');
    // Exactly one occurrence of each rewritten form.
    expect(out.match(/archive\/M6\/E1\/M6\.E1-PLAN\.md/g)).toHaveLength(2);
  });

  it('does not cascade: A.md→B.md and B.md→C.md leave an original A.md as B.md (not C.md)', () => {
    const out = applyKeyedReplacements('see A.md and B.md', [
      { from: 'A.md', to: 'B.md' },
      { from: 'B.md', to: 'C.md' },
    ]);
    expect(out).toBe('see B.md and C.md'); // sequential split/join would give "C.md and C.md"
  });
});

// --- reference-style / HTML links: OUT of scope here, left byte-unchanged --------
describe('M5.E2.S2.t3 scope floor — reference-style/HTML links untouched (seam for t4)', () => {
  const moveMap = new Map([
    ['.planning/M6.E1-PLAN.md', '.planning/archive/M6/E1/M6.E1-PLAN.md'],
  ]);

  it('leaves a reference-style `[label]: path` link byte-unchanged even when its target moved', () => {
    const text = '[plan]: M6.E1-PLAN.md';
    const edits = computeLinkEdits('.planning/STATE.md', text, moveMap);
    expect(edits).toHaveLength(0); // inline pass does not touch reference-style
    expect(applyKeyedReplacements(text, edits)).toBe(text);
  });

  it('leaves an HTML `<a href>` link byte-unchanged', () => {
    const text = '<a href="M6.E1-PLAN.md">plan</a>';
    const edits = computeLinkEdits('.planning/STATE.md', text, moveMap);
    expect(edits).toHaveLength(0);
    expect(applyKeyedReplacements(text, edits)).toBe(text);
  });

  it('detectUnhandledLinkForms surfaces both forms (the t4 seam) — not silently dropped', () => {
    const forms = detectUnhandledLinkForms(
      '[plan]: M6.E1-PLAN.md\n<a href="M6.E1-REQUIREMENTS.md">req</a>',
    );
    expect(forms).toContainEqual({ form: 'reference', target: 'M6.E1-PLAN.md' });
    expect(forms).toContainEqual({ form: 'html', target: 'M6.E1-REQUIREMENTS.md' });
  });
});

// --- end-to-end apply on a temp fixture: move + rewrite + CRLF round-trip --------
describe('M5.E2.S2.t3 applyArchiveTree — move, rewrite, CRLF, dry-run', () => {
  let baseDir;
  let planningDir;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-archive-tree-'));
    planningDir = join(baseDir, '.planning');
    await mkdir(planningDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('dry-run (default) senses moves but writes NOTHING', async () => {
    await writeFile(join(planningDir, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
    await writeFile(join(planningDir, 'M6.E1-PLAN.md'), '# M6.E1 plan\n', 'utf-8');

    const result = await applyArchiveTree(baseDir); // apply defaults to false
    expect(result.applied).toBe(false);
    expect(result.moves).toHaveLength(1);
    // Nothing moved on disk.
    expect(existsSync(join(planningDir, 'M6.E1-PLAN.md'))).toBe(true);
    expect(existsSync(join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'))).toBe(false);
  });

  it('apply moves scaffold to archive/<m>/<e>/ + rewrites the referring link, byte-identical move', async () => {
    await writeFile(join(planningDir, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
    const planBody = '# M6.E1 plan\n\nContent that must survive verbatim.\n';
    await writeFile(join(planningDir, 'M6.E1-PLAN.md'), planBody, 'utf-8');
    await writeFile(
      join(planningDir, 'STATE.md'),
      'State. See [the plan](M6.E1-PLAN.md) and `.planning/M6.E1-PLAN.md`.\n',
      'utf-8',
    );

    const result = await applyArchiveTree(baseDir, { apply: true });
    expect(result.applied).toBe(true);

    // Source gone, archive present + byte-identical (move-never-delete).
    expect(existsSync(join(planningDir, 'M6.E1-PLAN.md'))).toBe(false);
    const archived = await readFile(
      join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'),
      'utf-8',
    );
    expect(archived).toBe(planBody);

    // The referring link + prose path were rewritten (keyed, once each).
    const state = await readFile(join(planningDir, 'STATE.md'), 'utf-8');
    expect(state).toContain('[the plan](./archive/M6/E1/M6.E1-PLAN.md)');
    expect(state).toContain('`.planning/archive/M6/E1/M6.E1-PLAN.md`');
    expect(state).not.toContain('](M6.E1-PLAN.md)');
  });

  it('§10: NEVER auto-writes the hand-curated INDEX.md — its stale link is left untouched', async () => {
    await writeFile(join(planningDir, 'M6.E1-RETROSPECTIVE.md'), '# M6.E1 retro\n', 'utf-8');
    await writeFile(join(planningDir, 'M6.E1-PLAN.md'), '# M6.E1 plan\n', 'utf-8');
    // INDEX links to the moved scaffold; an auto-rewrite would touch it (§10 forbids).
    const indexBody = '# Index\n\n- [M6.E1 plan](M6.E1-PLAN.md)\n';
    await writeFile(join(planningDir, 'INDEX.md'), indexBody, 'utf-8');
    // STATE links too — to prove rewriting still runs elsewhere (INDEX excluded, not disabled).
    await writeFile(
      join(planningDir, 'STATE.md'),
      'State. See [plan](M6.E1-PLAN.md).\n',
      'utf-8',
    );

    await applyArchiveTree(baseDir, { apply: true });

    // INDEX.md is byte-unchanged (its link left stale for the human to refresh).
    expect(await readFile(join(planningDir, 'INDEX.md'), 'utf-8')).toBe(indexBody);
    // STATE.md WAS rewritten — proving the exclusion is INDEX-specific, not a no-op.
    expect(await readFile(join(planningDir, 'STATE.md'), 'utf-8')).toContain(
      '[plan](./archive/M6/E1/M6.E1-PLAN.md)',
    );
  });

  it('CRLF fixture round-trips byte-for-byte (no LF corruption) through move + rewrite', async () => {
    const crlf = (lines) => lines.join('\r\n');
    await writeFile(join(planningDir, 'M6.E1-RETROSPECTIVE.md'), crlf(['# retro', '']), 'utf-8');
    const planCrlf = crlf(['# M6.E1 plan', '', 'line two', '']);
    await writeFile(join(planningDir, 'M6.E1-PLAN.md'), planCrlf, 'utf-8');
    const stateCrlf = crlf(['# State', '', 'See [plan](M6.E1-PLAN.md).', '']);
    await writeFile(join(planningDir, 'STATE.md'), stateCrlf, 'utf-8');

    await applyArchiveTree(baseDir, { apply: true });

    // The moved file kept its CRLF byte-for-byte.
    const archived = await readFile(
      join(planningDir, 'archive', 'M6', 'E1', 'M6.E1-PLAN.md'),
      'utf-8',
    );
    expect(archived).toBe(planCrlf);

    // The rewritten STATE.md is still CRLF — every `\n` is preceded by `\r`.
    const state = await readFile(join(planningDir, 'STATE.md'), 'utf-8');
    expect(state).toContain('\r\n');
    expect(/[^\r]\n/.test(state)).toBe(false); // no bare LF introduced
    expect(state).toContain('[plan](./archive/M6/E1/M6.E1-PLAN.md)');
  });
});
