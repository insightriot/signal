/**
 * tests/cross-project-scan.test.js — the maintainer's cross-project analysis.
 *
 * Pins the two properties that make the report trustworthy rather than the
 * detection (which is the existing, already-tested library code):
 *
 *   1. Findings rank by INCIDENCE, not by project. 23 projects x a dozen checks
 *      is a wall that gets muted after one run, and a muted detector is worse
 *      than no detector.
 *   2. "Could not check" renders SEPARATELY and prints AT ZERO. This is M5.E16's
 *      whole subject, and a corpus report that silently omits what it could not
 *      read would be the exact defect this repo has shipped two Epics to remove.
 *
 * It also pins read-only-ness by construction: the scan runs against a temp
 * fixture and the fixture is hashed before and after.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { render, scanProject } from '../tools/cross-project-scan.js';

async function hashTree(dir) {
  const out = new Map();
  const walk = async (d, prefix = '') => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p, `${prefix}${e.name}/`);
      else out.set(`${prefix}${e.name}`, createHash('sha1').update(await readFile(p)).digest('hex'));
    }
  };
  await walk(dir);
  return out;
}

describe('cross-project analysis — reporting discipline', () => {
  it('ranks findings by how many projects they hit, most first', () => {
    const out = render([
      { name: 'a', findings: [{ id: 'wide' }, { id: 'narrow' }], blind: [] },
      { name: 'b', findings: [{ id: 'wide' }], blind: [] },
      { name: 'c', findings: [{ id: 'wide' }], blind: [] },
    ]).join('\n');

    expect(out).toMatch(/3\/3\s+wide/);
    expect(out).toMatch(/1\/3\s+narrow/);
    // Order is the point: the widespread finding must come first.
    expect(out.indexOf('wide')).toBeLessThan(out.indexOf('narrow'));
    // …and the affected projects are named, so a finding is actionable.
    expect(out).toMatch(/a, b, c/);
  });

  it('prints the "could not check" section even when NOTHING was blind', () => {
    // The load-bearing assertion. A report that omits this section when empty
    // teaches the reader that its absence means "fine" — and then its absence
    // on a broken run means "fine" too.
    const out = render([{ name: 'a', findings: [], blind: [] }]).join('\n');
    expect(out).toMatch(/Could not check: nothing/);
  });

  it('separates blindness from findings, and never counts one as the other', () => {
    const out = render([
      { name: 'a', findings: [{ id: 'real-finding' }], blind: [{ id: 'unreadable', why: 'boom' }] },
    ]).join('\n');

    const findingsAt = out.indexOf('DEFECTS IN SIGNAL');
    const blindAt = out.indexOf('Could NOT be checked');
    expect(findingsAt).toBeGreaterThan(-1);
    expect(blindAt).toBeGreaterThan(findingsAt);
    expect(out).toMatch(/not the same as clean/);
    expect(out).toMatch(/1\/1\s+unreadable/);
  });

  it('says so plainly when a corpus is clean, rather than printing nothing', () => {
    const out = render([{ name: 'a', findings: [], blind: [] }]).join('\n');
    // BOTH sections must say "none" rather than be omitted — an absent section
    // teaches the reader that absence means clean.
    expect(out).toMatch(/DEFECTS IN SIGNAL/);
    expect(out).toMatch(/PROJECT ADVISORIES/);
    expect((out.match(/none across the corpus/g) ?? []).length).toBe(2);
  });

  it('never mixes a Signal defect with a project to-do (the loop must be falsifiable)', () => {
    const out = render([
      { name: 'a', findings: [{ id: 'a-bug', kind: 'signal-defect' }], blind: [] },
      { name: 'b', findings: [{ id: 'a-todo', kind: 'project-advisory' }], blind: [] },
      { name: 'c', findings: [{ id: 'a-todo', kind: 'project-advisory' }], blind: [] },
    ]).join('\n');
    const defectsAt = out.indexOf('DEFECTS IN SIGNAL');
    const advisoriesAt = out.indexOf('PROJECT ADVISORIES');
    // The 2-project to-do must NOT outrank the 1-project defect by appearing
    // above it — they are not on the same list at all.
    expect(out.indexOf('a-bug')).toBeGreaterThan(defectsAt);
    expect(out.indexOf('a-bug')).toBeLessThan(advisoriesAt);
    expect(out.indexOf('a-todo')).toBeGreaterThan(advisoriesAt);
  });
});

describe('cross-project analysis — safety', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-xproj-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M1.E1\ncompleted_phases: []\n---\n# S\n'
    );
    await writeFile(join(dir, '.planning', 'M1.E1-PROGRESS.md'), '# progress\n');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is READ-ONLY — several scanned projects are production', async () => {
    const before = await hashTree(dir);
    await scanProject(dir);
    expect(await hashTree(dir)).toEqual(before);
  });

  it('a project it cannot read becomes a reported blindness, never a throw', async () => {
    // eval-project-B throws on readState today. Losing the other 22 projects to
    // it would be the defect this tool exists to remove.
    const r = await scanProject(join(tmpdir(), 'does-not-exist-xyz'));
    expect(r.blind.length).toBeGreaterThan(0);
    expect(r.findings).toEqual([]);
  });

  it('detects B87 — a phase that ran and never entered the ledger', async () => {
    // The fixture has M1.E1-PROGRESS.md (EXECUTE demonstrably ran) and an empty
    // completed_phases. This is the shape found in Signal itself at M5.E19.
    const r = await scanProject(dir);
    expect(r.findings.map((f) => f.id)).toContain('B87-phase-ran-unlogged');
  });
});

describe('scanCorpus — the data the release gate consumes', () => {
  it('returns structured buckets, not text', async () => {
    const { scanCorpus } = await import('../tools/cross-project-scan.js');
    const r = await scanCorpus([tmpdir()]); // a dir with no Signal projects
    expect(r).toHaveProperty('scanned');
    expect(Array.isArray(r.defects)).toBe(true);
    expect(Array.isArray(r.advisories)).toBe(true);
    expect(Array.isArray(r.blind)).toBe(true);
  });

  it('an empty corpus is scanned: 0 — distinguishable from a clean one', async () => {
    // The release gate turns on exactly this. `scanned: 0` must mean "nothing
    // to test against", never "tested and fine" (B39).
    const { scanCorpus } = await import('../tools/cross-project-scan.js');
    const empty = await mkdtemp(join(tmpdir(), 'sig-empty-'));
    try {
      const r = await scanCorpus([empty]);
      expect(r.scanned).toBe(0);
      expect(r.defects).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('buckets a defect and an advisory separately, ranked by incidence', async () => {
    const { scanCorpus } = await import('../tools/cross-project-scan.js');
    const base = await mkdtemp(join(tmpdir(), 'sig-corpus-'));
    try {
      // Two projects, each with the B87 shape -> one advisory hitting both.
      for (const name of ['p1', 'p2']) {
        const d = join(base, name, '.planning');
        await mkdir(d, { recursive: true });
        await writeFile(
          join(d, 'STATE.md'),
          '---\nschema_version: 1\nphase: VERIFY\ncurrent_epic: M1.E1\ncompleted_phases: []\n---\n# s\n'
        );
        await writeFile(join(d, 'M1.E1-PROGRESS.md'), '# p\n');
      }
      const r = await scanCorpus([base]);
      expect(r.scanned).toBe(2);
      expect(r.defects).toEqual([]); // B87 is an advisory now that Signal detects it
      const b87 = r.advisories.find((a) => a.id === 'B87-phase-ran-unlogged');
      expect(b87?.projects.sort()).toEqual(['p1', 'p2']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('the release gate wires the corpus scan', () => {
  it('cut-release blocks on defects and announces a SKIP as not-a-pass', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../tools/cut-release.js', import.meta.url), 'utf-8');
    expect(src).toMatch(/scanCorpus/);
    // Blocks on defects...
    expect(src).toMatch(/DEFECTS IN SIGNAL found in the corpus\. Not cutting a release/);
    // ...and a skip must never read as a pass. Both skip paths say so.
    expect((src.match(/Not a pass/g) ?? []).length).toBe(2);
    // The async main must be awaited, or a rejection exits 0 silently.
    expect(src).toMatch(/await main\(process\.argv\)/);
  });
});
