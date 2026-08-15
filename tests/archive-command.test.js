/**
 * tests/archive-command.test.js — `/sig:archive` (M5.E19).
 *
 * The apply path runs against a TEMP COPY of `examples/sandbox/`, never the
 * committed fixture — a test that mutates its own fixture passes once.
 *
 * No test here touches a project outside this repo. The sandbox exists exactly
 * so that rule costs nothing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, cp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  buildArchiveReport,
  renderArchiveReport,
  applyArchive,
} from '../plugin/tools/lib/archive-command.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = join(ROOT, 'examples', 'sandbox');

/** Content-hash every .md under .planning/, so "wrote nothing" is provable. */
async function snapshot(dir) {
  const out = new Map();
  const walk = async (d, prefix = '') => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p, `${prefix}${e.name}/`);
      else out.set(`${prefix}${e.name}`, createHash('sha1').update(await readFile(p)).digest('hex'));
    }
  };
  await walk(join(dir, '.planning'));
  return out;
}

describe('/sig:archive — the report (S2)', () => {
  it('every unit lands in exactly one of plan or refusals (AC-S2.1)', async () => {
    const r = await buildArchiveReport(SANDBOX);
    const planned = r.plan.map((p) => p.unit);
    const refused = r.refusals.map((x) => x.unit);
    expect(new Set([...planned, ...refused]).size).toBe(r.counts.units);
    for (const u of planned) expect(refused).not.toContain(u);
  });

  it('open and cannotDetermine units are never in the plan (FR2.1 / FR2.2)', async () => {
    const r = await buildArchiveReport(SANDBOX);
    const planned = r.plan.map((p) => p.unit);
    expect(planned).not.toContain('M1.E3'); // current unit
    expect(planned).not.toContain('SLICE-BILLING'); // no terminal artifact
    expect(planned).not.toContain('GATE-B'); // no readable verdict
    expect(planned.sort()).toEqual(['M1.E1', 'SLICE-AUTH']);
  });

  it('every refusal carries a non-empty reason (AC-S2.2)', async () => {
    const r = await buildArchiveReport(SANDBOX);
    expect(r.refusals.length).toBeGreaterThan(0);
    for (const x of r.refusals) {
      expect(x.reason, `${x.unit} must say why`).toBeTruthy();
      expect(x.reason.length).toBeGreaterThan(10);
    }
  });

  it('the stub-retro unit is refused AND the veto is named (AC-S2.3, B64)', async () => {
    // The S1 finding. `resolveClosures` calls M1.E2 CLOSED — its VERIFICATION
    // really does record a PASS — and the archive gate refuses it one layer
    // later. Before this command that refusal was completely silent, which made
    // the most surprising thing the tool does the least explained.
    const r = await buildArchiveReport(SANDBOX);
    const m1e2 = r.refusals.find((x) => x.unit === 'M1.E2');
    expect(m1e2).toBeDefined();
    expect(m1e2.status).toBe('closed');
    expect(m1e2.reason).toMatch(/stub/i);
  });

  it('ungrouped is always present, including when empty (AC-S2.4, B39)', async () => {
    const r = await buildArchiveReport(SANDBOX);
    expect(Array.isArray(r.ungrouped)).toBe(true);
    // Retros are ungrouped BY DESIGN — SCAFFOLD_SUFFIXES excludes RETROSPECTIVE.
    expect(r.ungrouped).toContain('M1.E1-RETROSPECTIVE.md');
  });

  it('an unlistable .planning/ is a reported refusal, not a throw', async () => {
    const r = await buildArchiveReport(join(tmpdir(), 'definitely-not-a-project-xyz'));
    expect(r.plan).toEqual([]);
    expect(r.reason).toBeTruthy();
    expect(r.stateReadable).toBe(false);
  });
});

describe('/sig:archive — the render (S3)', () => {
  it('names every refusal with its reason (AC-S3.1)', async () => {
    const out = renderArchiveReport(await buildArchiveReport(SANDBOX)).join('\n');
    for (const u of ['GATE-B', 'M1.E2', 'M1.E3', 'SLICE-BILLING']) {
      expect(out, `${u} must appear in the output`).toContain(u);
    }
    expect(out).toMatch(/checked and declined/);
  });

  it('renders the ungrouped line unconditionally (AC-S3.2)', async () => {
    const out = renderArchiveReport(await buildArchiveReport(SANDBOX)).join('\n');
    expect(out).toMatch(/Ungrouped files:/);
    // …and explains it, so 4 does not read as a defect.
    expect(out).toMatch(/stay in the root on purpose/);
  });

  it('renders "Dropped: 0" rather than omitting it (AC-S3.3, B39)', async () => {
    const out = renderArchiveReport(await buildArchiveReport(SANDBOX)).join('\n');
    expect(out).toMatch(/Dropped: 0/);
  });

  it('"could not check" never renders as "checked and clean" (FR6.1)', () => {
    const blind = renderArchiveReport({
      plan: [], moves: [], refusals: [], ungrouped: [], dropped: [],
      stateReadable: false, reason: 'STATE.md could not be read — boom',
      counts: { units: 0, archiving: 0, refused: 0, files: 0 },
    }).join('\n');
    const clean = renderArchiveReport({
      plan: [], moves: [], refusals: [{ unit: 'X', status: 'open', reason: 'still going' }],
      ungrouped: [], dropped: [], stateReadable: true, reason: null,
      counts: { units: 1, archiving: 0, refused: 1, files: 0 },
    }).join('\n');

    // The two must be distinguishable in BOTH directions — asserting only that
    // the blind case says something would pass even if the clean case said the
    // same thing.
    expect(blind).toMatch(/Could not evaluate anything/);
    expect(blind).toMatch(/nothing could be CHECKED/);
    expect(blind).not.toMatch(/clean result, not a failed check/);

    expect(clean).toMatch(/checked and none is finished/);
    expect(clean).toMatch(/clean result, not a failed check/);
    expect(clean).not.toMatch(/Could not evaluate anything/);
  });
});

describe('/sig:archive — apply (S4 / S5)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-archive-'));
    await cp(SANDBOX, dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a dry run writes ZERO bytes (AC-S4.1 / FR4.1)', async () => {
    const before = await snapshot(dir);
    const r = await buildArchiveReport(dir);
    renderArchiveReport(r, { apply: false });
    const after = await snapshot(dir);
    expect(after).toEqual(before);
    expect(r.plan.length).toBeGreaterThan(0); // it DID have something to propose
  });

  it('--apply archives both closed units and nothing else (AC-S5.1)', async () => {
    await applyArchive(dir);
    const root = (await readdir(join(dir, '.planning'))).filter((f) => f.endsWith('.md'));

    // Gone from the root.
    expect(root).not.toContain('M1.E1-PLAN.md');
    expect(root).not.toContain('SLICE-AUTH-PROGRESS.md');
    expect(root).not.toContain('PLAN-SLICE-AUTH-RESEARCH.md'); // the B82 file

    // Still in the root — refused, and a retro that never archives.
    expect(root).toContain('M1.E2-PLAN.md');
    expect(root).toContain('M1.E3-PLAN.md');
    expect(root).toContain('SLICE-BILLING-PROGRESS.md');
    expect(root).toContain('GATE-B-VERIFICATION.md');
    expect(root).toContain('M1.E1-RETROSPECTIVE.md');
  });

  it('SLICE-AUTH lands WHOLE in one directory (AC-S5.1, B82 end-to-end)', async () => {
    await applyArchive(dir);
    const got = (await readdir(join(dir, '.planning', 'archive', 'SLICE-AUTH'))).sort();
    expect(got).toEqual([
      'PLAN-SLICE-AUTH-RESEARCH.md',
      'PLAN-SLICE-AUTH-VALIDATION.md',
      'SLICE-AUTH-PROGRESS.md',
      'SLICE-AUTH-REVIEW.md',
      'SLICE-AUTH-VERIFICATION.md',
    ]);
  });

  it('a second --apply is a clean no-op (AC-S4.3 / NFR2.1)', async () => {
    await applyArchive(dir);
    const after1 = await snapshot(dir);
    const second = await applyArchive(dir);
    expect(second.moves.length).toBe(0);
    expect(await snapshot(dir)).toEqual(after1);
  });

  it('an unreadable STATE.md refuses EVERYTHING, and says so once (AC-S2.5)', async () => {
    // Without STATE.md there is no way to know which unit is current, and a
    // current unit must never be archived — so nothing is evaluable.
    await rm(join(dir, '.planning', 'STATE.md'));
    const r = await buildArchiveReport(dir);
    expect(r.plan).toEqual([]);
    expect(r.stateReadable).toBe(false);
    const out = renderArchiveReport(r).join('\n');
    expect(out).toMatch(/Could not evaluate anything/);
    expect(out.match(/could not be read|is unknown/gi)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('applyArchiveTree works as its SECOND caller ever — no migrate, no lock (AC-S5.3)', async () => {
    // Until now its only caller was /sig:migrate-memory's apply path, which
    // holds one coarse lock and passes v3Rename from its own sense. This is the
    // first invocation with no migration in flight.
    const res = await applyArchive(dir);
    expect(res.applied).toBe(true);
    expect(res.moves.length).toBe(9);
    // The moved content survives byte-identical.
    const moved = await readFile(join(dir, '.planning', 'archive', 'M1', 'E1', 'M1.E1-PLAN.md'), 'utf-8');
    expect(moved).toContain('M1.E1 Plan');
  });
});
