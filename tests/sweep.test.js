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
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SWEEP_SRC = join(ROOT, 'tools/lib/sweep.js');
const AUDIT_SCRIPT = join(ROOT, 'tools/audit-network-calls.js');
const SEEDED_FIXTURE = join(ROOT, 'tests/fixtures/audit-network-calls-seeded/with-fetch.js');

import { regeneratePlanningIndexCore } from '../tools/lib/planning-index.js';
import {
  checkIndexFreshness,
  checkStaleInbox,
  checkClaudeMdBloat,
  checkCommandFrontmatter,
  runSweep,
  renderSweepReport,
  CLAUDE_MD_BLOAT_BYTES,
} from '../tools/lib/sweep.js';

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

describe('M5.E6.T4 checkClaudeMdBloat', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-bloat-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC2.3 — a CLAUDE.md over the threshold → advisory', async () => {
    await writeDoc(dir, 'CLAUDE.md', 'x'.repeat(CLAUDE_MD_BLOAT_BYTES + 1) + '\n');
    const findings = checkClaudeMdBloat(dir);
    expect(advisory(findings)).toHaveLength(1);
    expect(structural(findings)).toHaveLength(0);
    expect(findings[0].file).toBe('CLAUDE.md');
  });

  it('AC2.3 — a CLAUDE.md under the threshold → no finding', async () => {
    await writeDoc(dir, 'CLAUDE.md', 'x'.repeat(1024) + '\n');
    expect(checkClaudeMdBloat(dir)).toHaveLength(0);
  });

  it('AC2.3 — a missing CLAUDE.md → no finding (never throws)', () => {
    expect(checkClaudeMdBloat(dir)).toHaveLength(0);
  });

  it('AC2.3 — the threshold is a named constant (40 KiB)', () => {
    expect(CLAUDE_MD_BLOAT_BYTES).toBe(40 * 1024);
  });
});

describe('M5.E6.T5 checkCommandFrontmatter', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-cmdfm-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // A well-formed command md frontmatter (matches commands/status.md's shape).
  const good = '---\nname: sig:good\ndescription: "Does a well-described thing."\nargs: ""\n---\n\n# body\n';

  it('AC2.4 — a command with a present, non-empty description → no finding', async () => {
    await writeDoc(dir, 'commands/good.md', good);
    expect(await checkCommandFrontmatter(dir)).toHaveLength(0);
  });

  it('AC2.4 — a command with an empty description → structural finding', async () => {
    await writeDoc(dir, 'commands/good.md', good);
    await writeDoc(dir, 'commands/empty.md', '---\nname: sig:empty\ndescription: ""\nargs: ""\n---\n\n# body\n');
    const findings = await checkCommandFrontmatter(dir);
    expect(structural(findings)).toHaveLength(1);
    expect(advisory(findings)).toHaveLength(0);
    expect(findings[0].file).toBe('commands/empty.md');
  });

  it('AC2.4 — a command with a missing description key → structural finding', async () => {
    await writeDoc(dir, 'commands/nodesc.md', '---\nname: sig:nodesc\nargs: ""\n---\n\n# body\n');
    const findings = await checkCommandFrontmatter(dir);
    expect(structural(findings)).toHaveLength(1);
    expect(findings[0].file).toBe('commands/nodesc.md');
  });

  it('AC2.4 — a command with no frontmatter at all → structural finding', async () => {
    await writeDoc(dir, 'commands/bare.md', '# Just a heading\n\nNo frontmatter here.\n');
    const findings = await checkCommandFrontmatter(dir);
    expect(structural(findings)).toHaveLength(1);
    expect(findings[0].file).toBe('commands/bare.md');
  });

  it('AC2.4 — malformed frontmatter YAML is caught and emitted as a finding (never throws / never crashes the sweep)', async () => {
    // An unterminated flow sequence — parseFrontmatter throws StateSchemaError.
    await writeDoc(dir, 'commands/broken.md', '---\nname: sig:broken\ndescription: [a, b, c\n---\n\n# body\n');
    const findings = await checkCommandFrontmatter(dir); // must NOT throw
    expect(structural(findings)).toHaveLength(1);
    expect(findings[0].file).toBe('commands/broken.md');
    expect(findings[0].message).toMatch(/malformed|frontmatter|YAML/i);
  });

  it('AC2.4 — no commands/ dir → no finding (never throws)', async () => {
    await mkdir(join(dir, '.planning'), { recursive: true });
    expect(await checkCommandFrontmatter(dir)).toHaveLength(0);
  });
});

describe('M5.E6.T6 runSweep + renderSweepReport', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-run-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // A stranger repo: a real .planning/ with a genuine dead link, NO plugin.json.
  async function seedStranger(d) {
    await seedPlanning(d);
    await writeDoc(d, '.planning/NOTES.md', '# Notes\n\nSee [the missing doc](does-not-exist.md).\n');
  }

  // A Signal-shaped repo: the plugin manifest lives at .claude-plugin/plugin.json
  // (never repo root — that is where every sibling tool reads it, so that is the
  // gate the Signal-only checks key on).
  async function seedSignal(d) {
    await seedPlanning(d);
    await writeDoc(d, '.claude-plugin/plugin.json', JSON.stringify({ name: 'sig', version: '9.9.9' }) + '\n');
    await writeDoc(d, 'commands/good.md', '---\nname: sig:good\ndescription: "A described command."\nargs: ""\n---\n\n# body\n');
  }

  it('AC1.1/AC2.5 — a stranger repo: portable checks fire against ITS own .planning/', async () => {
    await seedStranger(dir);
    const { findings } = await runSweep(dir);
    const dead = structural(findings).filter((f) => f.check === 'internal-links');
    expect(dead.length).toBeGreaterThanOrEqual(1);
    expect(dead.some((f) => f.file.includes('NOTES.md'))).toBe(true);
  });

  it('AC1.3/AC2.5 — with no plugin.json, Signal-only checks are SKIPPED and the report states it', async () => {
    await seedStranger(dir);
    const result = await runSweep(dir);
    expect(result.signalOnly.ran).toBe(false);
    // Signal-only findings are absent, not silently mixed into the portable set.
    expect(result.findings.some((f) => f.check === 'command-frontmatter')).toBe(false);
    expect(result.findings.some((f) => f.check === 'roster-counts')).toBe(false);
    expect(result.findings.some((f) => f.check === 'version-consistency')).toBe(false);
    // The report SAYS the checks were skipped — not failed (AC1.3).
    expect(renderSweepReport(result)).toContain('skipped (not a plugin repo)');
  });

  it('AC1.4 — with plugin.json at .claude-plugin/, all checks run', async () => {
    await seedSignal(dir);
    const result = await runSweep(dir);
    expect(result.signalOnly.ran).toBe(true);
    expect(result.signalOnly.checks).toContain('command-frontmatter');
    expect(result.signalOnly.checks).toContain('roster-counts');
    expect(result.signalOnly.checks).toContain('version-consistency');
    expect(renderSweepReport(result)).toMatch(/^ran:/m);
  });

  it('AC1.2 — a dead link inside .planning/archive/ is EXEMPT (not reported)', async () => {
    await seedPlanning(dir);
    await writeDoc(dir, '.planning/archive/OLD.md', '# Old\n\n[gone](vanished.md)\n');
    const { findings } = await runSweep(dir);
    expect(findings.some((f) => f.file.includes('archive/'))).toBe(false);
  });

  it('AC1.5 — runSweep is read-only (baseDir tree byte-identical before and after)', async () => {
    await seedSignal(dir);
    const before = await hashTree(dir);
    await runSweep(dir);
    const after = await hashTree(dir);
    expect(after).toBe(before);
  });

  it('AC2.6 — two sweeps of the same fixture render byte-identical reports', async () => {
    await seedSignal(dir);
    const r1 = renderSweepReport(await runSweep(dir));
    const r2 = renderSweepReport(await runSweep(dir));
    expect(r1).toBe(r2);
  });

  it('AC1.6 — the report groups findings by severity (structural before advisory)', () => {
    // Pure render over a hand-built result — structural and advisory land under
    // their own headings, in deterministic order.
    const report = renderSweepReport({
      findings: [
        { check: 'internal-links', severity: 'structural', file: 'a.md', message: 'dead internal link -> x.md' },
        { check: 'stale-inbox', severity: 'advisory', file: '.planning/ISSUES-INBOX.md', message: '3 undrained entries' },
      ],
      signalOnly: { ran: true, checks: ['roster-counts'] },
    });
    const structIdx = report.indexOf('Structural');
    const advIdx = report.indexOf('Advisory');
    expect(structIdx).toBeGreaterThanOrEqual(0);
    expect(advIdx).toBeGreaterThan(structIdx);
    expect(report).toContain('dead internal link -> x.md');
    expect(report).toContain('3 undrained entries');
  });

  it('renderSweepReport also accepts a bare findings array (renders groups, omits the Signal-only line)', () => {
    // Honors the plain renderSweepReport(findings) call shape: no signalOnly info
    // → no "Signal-only checks" section, but findings still group by severity.
    const report = renderSweepReport([
      { check: 'internal-links', severity: 'structural', file: 'a.md', message: 'dead internal link -> x.md' },
    ]);
    expect(report).toContain('dead internal link -> x.md');
    expect(report).toContain('## Structural (1)');
    expect(report).not.toContain('Signal-only checks');
  });
});

// M5.E6.T7 — offline meta-tests + network-audit coverage (NFR1).
//
// A standing invariant (not RED-first-shaped): a "makes no network calls" guard
// can only fail by breaking the very property it guards, so it lands green. Its
// teeth are shown by pointing the same grep at a known-violating fixture — the
// contrast is the discriminating evidence. (Mirrors tests/docs-hygiene.test.js's
// AC4.3 source-grep meta-test.)
describe('M5.E6.T7 sweep offline + network-audit coverage (NFR1)', () => {
  it('NFR1 — sweep.js makes no network calls (offline source-grep, with teeth)', () => {
    const src = readFileSync(SWEEP_SRC, 'utf-8');
    expect(src).not.toMatch(/fetch|http|curl/i);
    // Teeth: the same grep DOES catch a real network call, so the assertion above
    // is discriminating, not vacuously true.
    expect(readFileSync(SEEDED_FIXTURE, 'utf-8')).toMatch(/fetch|http|curl/i);
  });

  it('NFR1 — sweep.js is covered by tools/audit-network-calls.js (recursive tools/ scan) and the audit passes', () => {
    // audit-network-calls.js has NO per-file registration list — it walks its
    // DEFAULT_INCLUDE dirs recursively, so tools/lib/sweep.js is in scope by
    // directory (there is nothing to append to). Assert 'tools' is in that
    // include set, then run the audit over the live repo — a run that actually
    // scans sweep.js — and confirm it exits 0 (clean).
    const auditSrc = readFileSync(AUDIT_SCRIPT, 'utf-8');
    expect(auditSrc).toMatch(/DEFAULT_INCLUDE\s*=\s*\[[^\]]*'tools'/);
    const res = spawnSync('node', [AUDIT_SCRIPT], { encoding: 'utf-8' });
    expect(res.status).toBe(0);
  });
});
