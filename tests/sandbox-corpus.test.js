/**
 * tests/sandbox-corpus.test.js — the QA sandbox asserts what it advertises.
 *
 * `examples/sandbox/` exists so nobody has to point a Signal command at a real
 * project to see what it does. That only works if the corpus still forces the
 * answers its README claims — a fixture that drifts into agreeing with whatever
 * the code currently does is worse than no fixture, because it reads as
 * coverage while testing nothing.
 *
 * So this file pins the corpus, not the library: each assertion says "this
 * SHAPE is still present and still resolves this way." If someone edits the
 * sandbox and flattens a distinction, these fail.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

import { readFile } from 'node:fs/promises';

import { senseArchiveTree } from '../tools/lib/archive-tree.js';
import { resolveClosures, CLOSURE } from '../tools/lib/closure.js';
import { deriveUnits } from '../tools/lib/work-units.js';
import { extractRequirementIds } from '../tools/lib/requirement-ids.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SANDBOX = join(ROOT, 'examples', 'sandbox');

const statusOf = (units, id) => units.find((u) => u.unit === id)?.status;

describe('QA sandbox — the corpus still forces every answer it advertises', () => {
  it('resolves all six units, across all three closure outcomes', async () => {
    const { units, counts, stateReadable } = await resolveClosures(SANDBOX);
    expect(stateReadable).toBe(true);

    // Every outcome is represented. A corpus that lost one would silently stop
    // exercising a branch while still looking populated.
    expect(counts.closed).toBeGreaterThan(0);
    expect(counts.open).toBeGreaterThan(0);
    expect(counts.cannotDetermine).toBeGreaterThan(0);

    expect(statusOf(units, 'M1.E1')).toBe(CLOSURE.CLOSED);
    expect(statusOf(units, 'SLICE-AUTH')).toBe(CLOSURE.CLOSED);
    expect(statusOf(units, 'M1.E3')).toBe(CLOSURE.OPEN); // the current unit
    expect(statusOf(units, 'SLICE-BILLING')).toBe(CLOSURE.OPEN); // no terminal artifact
    expect(statusOf(units, 'GATE-B')).toBe(CLOSURE.CANNOT_DETERMINE); // no readable verdict
  });

  it('M1.E2 is closed BY VERDICT but vetoed by its stub retro (B64)', async () => {
    // The subtle one, and the reason it is in the corpus. The two layers
    // disagree on purpose: closure reads the PASS, the archive gate refuses
    // anyway because the retrospective is still `[FILL IN]`. A run that
    // archives M1.E2 is not a closure bug — it is the veto having broken.
    const { units } = await resolveClosures(SANDBOX);
    expect(statusOf(units, 'M1.E2')).toBe(CLOSURE.CLOSED);

    const { closedUnits } = await senseArchiveTree(SANDBOX);
    expect(closedUnits).not.toContain('M1.E2');
  });

  it('archives exactly the two genuinely-closed units, and nothing else', async () => {
    const { closedUnits } = await senseArchiveTree(SANDBOX);
    expect([...closedUnits].sort()).toEqual(['M1.E1', 'SLICE-AUTH']);
  });

  it('SLICE-AUTH carries the B82 fold shape and archives WHOLE', async () => {
    const names = readdirSync(join(SANDBOX, '.planning')).filter((f) => f.endsWith('.md'));
    const { units } = deriveUnits(names);
    const derived = units.get('SLICE-AUTH') ?? [];

    // The shape itself: files split across two naming conventions, folded into
    // one unit. If this stops holding, the corpus no longer covers B82 at all.
    expect(derived).toContain('PLAN-SLICE-AUTH-RESEARCH.md');
    expect(derived).toContain('SLICE-AUTH-PROGRESS.md');
    expect(derived.length).toBe(5);

    const { moves } = await senseArchiveTree(SANDBOX);
    const planned = moves.map((m) => m.from.replace('.planning/', ''));
    for (const f of derived) {
      expect(planned, `${f} must archive with its unit`).toContain(f);
    }
    // …and all of it into ONE directory. A unit in two places is the defect.
    for (const m of moves.filter((x) => planned.includes(x.from.replace('.planning/', '')))) {
      if (derived.includes(m.from.replace('.planning/', ''))) {
        expect(m.to.startsWith('.planning/archive/SLICE-AUTH/')).toBe(true);
      }
    }
  });

  it('M1.E4 carries the claim-integrity shapes without touching the archive surface', async () => {
    // The coverage gap has to be real in the corpus, not just described in the
    // README — the checks that read it land in S2, and a fixture that quietly
    // stopped having a gap would let them pass while testing nothing.
    const dir = join(SANDBOX, '.planning');
    const req = extractRequirementIds(await readFile(join(dir, 'M1.E4-REQUIREMENTS.md'), 'utf8'));
    const ver = extractRequirementIds(await readFile(join(dir, 'M1.E4-VERIFICATION.md'), 'utf8'));
    const missing = req.filter((id) => !ver.includes(id));

    expect(req.sort()).toEqual(['AC1.1', 'AC1.2', 'FR1', 'NFR1']);
    // NFR1 must be among the missing: it is the id the pre-M5.E10 pattern could
    // not see at all, so it is the one worth pinning by name.
    expect(missing.sort()).toEqual(['AC1.2', 'NFR1']);

    // A FAIL verdict keeps the unit open, which is what keeps this shape out of
    // the archive expectations asserted above.
    const { units } = await resolveClosures(SANDBOX);
    expect(statusOf(units, 'M1.E4')).toBe(CLOSURE.OPEN);
  });

  it('M1.E4-VALIDATION contradicts itself, and the contradiction survives edits', async () => {
    const content = await readFile(
      join(SANDBOX, '.planning', 'M1.E4-VALIDATION.md'),
      'utf8'
    );
    const [, completeness = '', nyquist = ''] = content.split(/^## /m).map((s) => `## ${s}`);

    // Dimension 2 owns four requirements; the Nyquist map rows cover three, and
    // assigns one of them to a different slice. Both disagreements are the
    // fixture's whole purpose (FR2), so both are pinned.
    expect(extractRequirementIds(completeness).sort()).toEqual([
      'AC1.1',
      'AC1.2',
      'FR1',
      'NFR1',
    ]);
    expect(extractRequirementIds(nyquist)).not.toContain('NFR1');
    expect(completeness).toMatch(/\|\s*AC1\.2\s*\|\s*S2\s*\|/);
    expect(nyquist).toMatch(/\|\s*AC1\.2\s*\|\s*\*\*S1\*\*\s*\|/);
  });

  it('the live unit is never proposed for archive', async () => {
    const { moves } = await senseArchiveTree(SANDBOX);
    for (const m of moves) {
      expect(m.from.includes('M1.E3'), 'the current unit must never archive').toBe(false);
    }
  });
});
