// M5.E2 REVIEW I3 — CRLF through the migrate CORE (deprose / conserve / idempotency).
//
// The archive-tree spine + the write-guard hook have CRLF tests; the within-STATE
// core (deproseFrontmatter / applyMigrate / conservation / idempotency) was the
// LF-only outlier. This pins a `\r\n` fixture through it. The reviewer flagged N2:
// buildRelocationSection joins its parts with the file's `nl` (CRLF) but the
// relocated content (originalForBody) carries internal `\n`, so a multi-line
// entry's relocated body region is genuinely MIXED-EOL. This test SCOPES the
// strict-CRLF assertion to the FRONTMATTER BLOCK (the part the real parser reads),
// documents the body mixed-EOL as cosmetic, and proves it breaks NOTHING:
// conservation is whitespace-agnostic and the second apply is a zero-diff no-op.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  deproseFrontmatter,
  applyMigrate,
  conserves,
  WORD,
} from '../tools/lib/migrate-memory.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// A CRLF STATE.md carrying BOTH multi-line shapes (multi-line completed_phases +
// block-scalar blocker) so the relocated body region is the mixed-EOL case N2 flags.
const CRLF_STATE = [
  '---',
  'schema_version: 1',
  'phase: PLAN',
  'current_epic: M5.E2',
  'current_tasks: []',
  'completed_phases:',
  '  - CALIBRATE (2026-05-13)',
  '  - "DISCUSS (2026-07-01) — a multi-line narrative annotation wrapping',
  '    across several source lines that the migrate must relocate verbatim"',
  'blockers:',
  '  - id: blk-3c4d',
  '    text: |',
  '      first paragraph of narrative prose that should never',
  '      live inside a structured blocker text field at all',
  '    raisedAt: 2026-07-13T00:00:00.000Z',
  '---',
  '# Project State',
  '',
  '## Resume pointer',
  '',
  'existing body',
  '',
].join('\r\n');

// The frontmatter region up to + including the closing fence (what state.js parses).
function frontmatterRegion(text) {
  const m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
  return m ? m[1] : '';
}
function bodyRegion(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return m ? m[1] : text;
}
// True when `s` has a lone LF not preceded by CR (a bare `\n`) or starts with LF.
const hasBareLF = (s) => /[^\r]\n/.test(s) || s.startsWith('\n');

describe('M5.E2 REVIEW I3 — deproseFrontmatter on a CRLF file', () => {
  it('keeps the FRONTMATTER BLOCK clean CRLF (no bare LF where the parser reads)', () => {
    const { changed, newText } = deproseFrontmatter(CRLF_STATE);
    expect(changed).toBe(true);
    expect(hasBareLF(frontmatterRegion(newText))).toBe(false);
  });

  it('WORD conservation holds — every relocated token survives (whitespace-agnostic)', () => {
    const { newText, removedProse } = deproseFrontmatter(CRLF_STATE);
    const cons = conserves(removedProse, bodyRegion(newText), WORD);
    expect(cons.pass).toBe(true);
    expect(cons.missing).toHaveLength(0);
    // Ground-truth anchors — the verbatim prose landed in the body.
    expect(newText).toContain('across several source lines that the migrate must relocate verbatim');
    expect(newText).toContain('live inside a structured blocker text field at all');
  });

  it('documents N2: the relocated BODY region is mixed-EOL (cosmetic — parser reads only the frontmatter)', () => {
    const { newText } = deproseFrontmatter(CRLF_STATE);
    // The relocated multi-line content is joined with `\n`, so the body region
    // carries bare LFs alongside the surrounding CRLF. This is COSMETIC: the
    // frontmatter block (asserted clean CRLF above) is the only part state.js
    // parses, and WORD conservation (asserted above) is whitespace-agnostic — so
    // the mixed-EOL breaks neither the parse nor the faithfulness gate. Left as a
    // reported finding, NOT patched (that would be a production change).
    expect(hasBareLF(bodyRegion(newText))).toBe(true);
  });
});

// --- idempotency of the full apply on the CRLF file ----------------------------

async function treeSnapshot(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '.migrate') await walk(join(d, e.name));
      } else {
        out[join(d, e.name)] = await readFile(join(d, e.name), 'utf-8');
      }
    }
  }
  await walk(join(dir, '.planning'));
  return out;
}

async function setup(dir) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), CRLF_STATE, 'utf-8');
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']); // keep the CRLF bytes exact
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2 REVIEW I3 — applyMigrate on a CRLF file is idempotent', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-crlf-core-'));
    await setup(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a second apply on the migrated CRLF project is a byte-identical no-op', async () => {
    const r1 = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r1.applied).toBe(true);
    // Commit the first apply so the second runs on a clean tree.
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'migrate']);

    const before = await treeSnapshot(dir);
    const r2 = await applyMigrate(dir, { stamp: 'T2', dateStr: '2026-07-17' });
    const after = await treeSnapshot(dir);

    expect(r2.applied).toBe(false); // conformant + stamped → no-op
    expect(after).toEqual(before); // zero file changes on the CRLF file
    expect(String(git(dir, ['status', '--porcelain'])).trim()).toBe('');
  });
});
