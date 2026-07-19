// tests/docs-hygiene.test.js — the all-docs structural hygiene guard (M5.E3.S3 / FR4).
//
// Deterministic + offline. HARD findings fail the suite (structural drift);
// SOFT findings are reported (warned) but never fail. Fixtures are built in a
// temp dir per check so the RED cases prove each check catches its own drift;
// the "live repo" cases prove the whole guard is GREEN on Signal as-is (the
// pre-dogfood repo, `FUTURE-IDEAS.md` still present, all versions at 0.1.7).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  checkInternalLinks,
  checkRosterCounts,
  listDocFiles,
} from '../tools/lib/doc-hygiene.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function writeDoc(dir, rel, body) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body, 'utf-8');
}

const hard = (findings) => findings.filter((f) => f.severity === 'hard');
const soft = (findings) => findings.filter((f) => f.severity === 'soft');

// ---------------------------------------------------------------------------
// t2 — internal link-health
// ---------------------------------------------------------------------------
describe('M5.E3.S3.t2 checkInternalLinks', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-hyg-links-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('flags a dead internal .md link as HARD, ignores external + resolving links', async () => {
    await writeDoc(dir, 'CLAUDE.md', '# Heading\n\nbody\n');
    await writeDoc(
      dir,
      'README.md',
      [
        'A [dead](nope.md) link.',
        'A [good](CLAUDE.md) link.',
        'A [relative](docs/guide.md) link.',
        'An [external](https://example.invalid/x.md) link.',
      ].join('\n') + '\n',
    );
    await writeDoc(dir, 'docs/guide.md', 'See [up](../README.md).\n');

    const findings = checkInternalLinks(dir);
    const h = hard(findings);
    expect(h).toHaveLength(1);
    expect(h[0].file).toBe('README.md');
    expect(h[0].message).toMatch(/nope\.md/);
  });

  it('does NOT descend into ignored dirs (.claude duplicate plugin tree)', async () => {
    await writeDoc(dir, 'README.md', 'clean.\n');
    // A dead link inside a .claude/ subtree (the dogfood-status duplicate) must
    // never be scanned — else the duplicate plugin tree false-fails the guard.
    await writeDoc(dir, '.claude/worktrees/dogfood-status/NOTES.md', '[x](gone.md)\n');
    await writeDoc(dir, 'node_modules/pkg/README.md', '[x](gone.md)\n');
    await writeDoc(dir, 'archive/OLD.md', '[x](gone.md)\n');
    await writeDoc(dir, 'examples/demo/README.md', '[x](gone.md)\n');

    expect(hard(checkInternalLinks(dir))).toHaveLength(0);
    // And those files are not part of the scanned surface at all.
    const surface = listDocFiles(dir).map((p) => p.replace(dir + '/', ''));
    expect(surface).toContain('README.md');
    expect(surface.some((p) => p.startsWith('.claude/'))).toBe(false);
    expect(surface.some((p) => p.startsWith('archive/'))).toBe(false);
  });

  it('flags an unresolvable #anchor as SOFT (file exists, slug missing)', async () => {
    await writeDoc(dir, 'CLAUDE.md', '# Real Heading\n');
    await writeDoc(
      dir,
      'README.md',
      'A [resolves](CLAUDE.md#real-heading) and a [broken](CLAUDE.md#no-such).\n',
    );
    const findings = checkInternalLinks(dir);
    expect(hard(findings)).toHaveLength(0);
    const s = soft(findings);
    expect(s).toHaveLength(1);
    expect(s[0].message).toMatch(/no-such/);
  });

  it('is GREEN on the live Signal repo (no dead internal links on the public surface)', () => {
    expect(hard(checkInternalLinks(ROOT))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// t3 — roster / count-drift
// ---------------------------------------------------------------------------
describe('M5.E3.S3.t3 checkRosterCounts', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-hyg-roster-'));
    // A real mini-roster: 2 commands / 1 agent / 1 skill (read from disk).
    await writeDoc(dir, 'commands/a.md', 'x');
    await writeDoc(dir, 'commands/b.md', 'x');
    await writeDoc(dir, 'agents/x.md', 'x');
    await writeDoc(dir, 'skills/foo/SKILL.md', 'x');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('flags a wrong count at a canonical site as HARD', async () => {
    await writeDoc(dir, 'CLAUDE.md', 'structure\n# 99 slash commands — /sig:a\n');
    const h = hard(checkRosterCounts(dir));
    expect(h).toHaveLength(1);
    expect(h[0].message).toMatch(/99 commands, roster has 2/);
  });

  it('passes when the canonical counts match the roster', async () => {
    await writeDoc(dir, 'CLAUDE.md', '# 2 slash commands — /sig:a\n# 1 agents\n# 1 quality skills\n');
    await writeDoc(dir, 'docs/map/index.html', '<h2>Command library — 2 commands</h2>\n');
    expect(hard(checkRosterCounts(dir))).toHaveLength(0);
  });

  it('does NOT scrape the historical narrative (# prefix required)', async () => {
    // A prose line claims "15 slash commands" (no `#`); the canonical comment
    // says "# 2 slash commands". The check must read the canonical 2, not 15.
    await writeDoc(
      dir,
      'CLAUDE.md',
      'Back then we had 15 slash commands, 26 agents, 21 skills.\n\n# 2 slash commands — /sig:a\n',
    );
    expect(hard(checkRosterCounts(dir))).toHaveLength(0);
  });

  it('is GREEN on the live Signal repo (17/26/21 at every canonical site)', () => {
    expect(hard(checkRosterCounts(ROOT))).toHaveLength(0);
  });
});
