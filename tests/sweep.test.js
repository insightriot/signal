// tests/sweep.test.js — M5.E6 Slice 1 (FR1/FR2): the portable /sig:sweep checks.
//
// Read-only doc-hygiene checks over an ARBITRARY invoking project (a fixture
// baseDir, never Signal's own paths). Each check returns findings shaped
// `{check, severity, file, message}` with severity ∈ 'structural' | 'advisory'.
//
// RED-first: the discriminating assertion for each check is a POSITIVE finding
// (index drift → structural, N>0 inbox → advisory, over-threshold → advisory);
// a `return []` stub fails those, so the RED is assertion-level.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { regeneratePlanningIndexCore } from '../tools/lib/planning-index.js';
import { checkIndexFreshness, checkStaleInbox } from '../tools/lib/sweep.js';

const structural = (findings) => findings.filter((f) => f.severity === 'structural');
const advisory = (findings) => findings.filter((f) => f.severity === 'advisory');

async function writeDoc(dir, rel, body) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body, 'utf-8');
}

/** Order-stable content hash of every file under `root` (for the read-only assert). */
async function hashTree(root) {
  const files = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) files.push(p);
    }
  }
  await walk(root);
  files.sort();
  const h = createHash('sha256');
  for (const p of files) {
    h.update(p);
    h.update('\0');
    h.update(await readFile(p));
    h.update('\0');
  }
  return h.digest('hex');
}

// A minimal but real .planning/ corpus so enumeratePlanningDocs finds docs.
async function seedPlanning(dir) {
  await writeDoc(dir, '.planning/CONTEXT.md', '# Context\n\norientation.\n');
  await writeDoc(dir, '.planning/STATE.md', '# State\n\nstatus.\n');
  await writeDoc(dir, '.planning/DECISIONS.md', '# Decisions\n\nlog.\n');
}

describe('M5.E6.T2 checkIndexFreshness', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-index-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC2.1 — drift (autogen INDEX, corpus changed) is STRUCTURAL', async () => {
    await seedPlanning(dir);
    await regeneratePlanningIndexCore(dir); // writes a valid, marker-bearing INDEX
    // Corpus grows AFTER the index was written → the on-disk index is now stale.
    await writeDoc(dir, '.planning/NEW-DOC.md', '# New\n\nadded after index.\n');

    const findings = await checkIndexFreshness(dir);
    const s = structural(findings);
    expect(s).toHaveLength(1);
    expect(s[0].file).toBe('.planning/INDEX.md');
    expect(advisory(findings)).toHaveLength(0);
  });

  it('AC2.1 — a fresh (in-sync) autogen INDEX passes with no finding', async () => {
    await seedPlanning(dir);
    await regeneratePlanningIndexCore(dir);
    expect(await checkIndexFreshness(dir)).toHaveLength(0);
  });

  it('AC2.1 — a foreign / hand-written INDEX is ADVISORY, not structural', async () => {
    await seedPlanning(dir);
    // No autogen marker, no parseable annotations → isForeignIndexFormat === true.
    await writeDoc(dir, '.planning/INDEX.md', '# My hand-written index\n\nSome notes about the project.\n');

    const findings = await checkIndexFreshness(dir);
    expect(advisory(findings)).toHaveLength(1);
    expect(structural(findings)).toHaveLength(0);
  });

  it('AC2.1 — an absent INDEX is ADVISORY, not structural', async () => {
    await seedPlanning(dir); // no INDEX.md written
    const findings = await checkIndexFreshness(dir);
    expect(advisory(findings)).toHaveLength(1);
    expect(structural(findings)).toHaveLength(0);
  });

  it('AC1.5 — checkIndexFreshness writes nothing (tree byte-identical, even on drift)', async () => {
    await seedPlanning(dir);
    await regeneratePlanningIndexCore(dir);
    await writeDoc(dir, '.planning/NEW-DOC.md', '# New\n\nadded.\n'); // force a drift finding
    const before = await hashTree(join(dir, '.planning'));
    await checkIndexFreshness(dir);
    const after = await hashTree(join(dir, '.planning'));
    expect(after).toBe(before);
  });
});

describe('M5.E6.T3 checkStaleInbox', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-inbox-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC2.2 — N undrained inbox entries → advisory reporting N', async () => {
    await writeDoc(
      dir,
      '.planning/ISSUES-INBOX.md',
      [
        '# ISSUES-INBOX',
        '',
        'Capture inbox.',
        '',
        '---',
        '',
        '## Idea one',
        '',
        '**Status:** open',
        '',
        'Body one.',
        '',
        '## Idea two',
        '',
        'Body two.',
      ].join('\n') + '\n',
    );

    const findings = await checkStaleInbox(dir);
    expect(advisory(findings)).toHaveLength(1);
    expect(structural(findings)).toHaveLength(0);
    expect(findings[0].message).toMatch(/\b2\b/);
  });

  it('AC2.2 — an all-disposed inbox produces no finding', async () => {
    await writeDoc(
      dir,
      '.planning/ISSUES-INBOX.md',
      [
        '# ISSUES-INBOX',
        '',
        '## ✓ SHIPPED — Idea one',
        '',
        'Body one.',
        '',
        '## PROMOTED — Idea two',
        '',
        'Body two.',
      ].join('\n') + '\n',
    );
    expect(await checkStaleInbox(dir)).toHaveLength(0);
  });

  it('AC2.2 — a missing inbox produces no finding (never throws)', async () => {
    await mkdir(join(dir, '.planning'), { recursive: true });
    expect(await checkStaleInbox(dir)).toHaveLength(0);
  });
});
