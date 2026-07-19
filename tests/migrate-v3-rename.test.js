// M5.E3.S6a.t1 — FR6 v2→v3 rename mechanics (senseV3Rename + senseArchiveTree fold).
//
// The v3 layout renames the capture inbox `FUTURE-IDEAS.md` → `ISSUES-INBOX.md`
// (and its archive ledger). The rename folds into the archive-tree move set so it
// rides the SAME lock-free move + byte-identical relocate + referrer-rewrite spine
// as the closed-Epic scaffold moves. R7: the rename's referrer rewrite + residual
// scan EXCLUDE files under `.planning/archive/` — an archived doc's historical
// `.planning/FUTURE-IDEAS.md` reference is a fact of the past, not a live link to
// repair. Built RED-first: senseV3Rename + the `{v3Rename}` opt do not exist yet.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  senseV3Rename,
  senseArchiveTree,
  applyArchiveTree,
} from '../tools/lib/archive-tree.js';
import { scanDanglingLinks } from '../tools/lib/migrate-memory.js';
import { evictTerminalToLedger } from '../tools/lib/drain.js';

// A project with the legacy inbox + ledger, a NON-archive referrer (NOTES.md), and
// an ARCHIVE doc that mentions the flat inbox path in prose (must stay untouched).
async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'v3-rename-'));
  const planning = join(dir, '.planning');
  await mkdir(join(planning, 'archive', 'M1'), { recursive: true });
  await writeFile(join(planning, 'FUTURE-IDEAS.md'), '# Future Ideas\n\n## An idea\n\nbody\n', 'utf-8');
  await writeFile(
    join(planning, 'archive', 'FUTURE-IDEAS-LEDGER.md'),
    '# FUTURE-IDEAS — archive ledger\n\nevicted entries\n',
    'utf-8'
  );
  // NON-archive referrer: an inline link + a prose flat-path reference. Both rewrite.
  await writeFile(
    join(planning, 'NOTES.md'),
    'Notes. See [the inbox](FUTURE-IDEAS.md); it lives at `.planning/FUTURE-IDEAS.md`.\n',
    'utf-8'
  );
  // ARCHIVE doc: a historical prose reference to the flat inbox path — R7 leaves it.
  await writeFile(
    join(planning, 'archive', 'M1', 'OLD.md'),
    'Historically captured to `.planning/FUTURE-IDEAS.md` before the rename.\n',
    'utf-8'
  );
  return dir;
}

const rel = (dir, ...p) => join(dir, '.planning', ...p);

describe('t1 — senseV3Rename (the fixed rename moveMap)', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('plans the inbox + ledger rename (existence-gated, repo-root-relative POSIX)', () => {
    const map = senseV3Rename(dir);
    expect(map.get('.planning/FUTURE-IDEAS.md')).toBe('.planning/ISSUES-INBOX.md');
    expect(map.get('.planning/archive/FUTURE-IDEAS-LEDGER.md')).toBe(
      '.planning/archive/ISSUES-INBOX-LEDGER.md'
    );
    expect(map.size).toBe(2);
  });

  it('is a no-op when the inbox is already renamed (dest present / source absent)', async () => {
    // Already-v3 repo: only the new names exist → nothing to rename (idempotent).
    const born = await mkdtemp(join(tmpdir(), 'v3-born-'));
    await mkdir(join(born, '.planning'), { recursive: true });
    await writeFile(join(born, '.planning', 'ISSUES-INBOX.md'), '# inbox\n', 'utf-8');
    const map = senseV3Rename(born);
    expect(map.size).toBe(0);
    await rm(born, { recursive: true, force: true });
  });

  it('does NOT clobber an existing dest (both names present → skip the move)', async () => {
    // A half-migrated repo with BOTH names present must never overwrite ISSUES-INBOX.
    await writeFile(rel(dir, 'ISSUES-INBOX.md'), '# already here\n', 'utf-8');
    const map = senseV3Rename(dir);
    expect(map.has('.planning/FUTURE-IDEAS.md')).toBe(false);
  });
});

describe('t1 — senseArchiveTree folds the rename (archive-excluded rewrite, R7)', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('merges the rename into moveMap when {v3Rename:true}; omits it otherwise', async () => {
    const without = await senseArchiveTree(dir);
    expect(without.moveMap.has('.planning/FUTURE-IDEAS.md')).toBe(false);

    const withRename = await senseArchiveTree(dir, { v3Rename: true });
    expect(withRename.moveMap.get('.planning/FUTURE-IDEAS.md')).toBe('.planning/ISSUES-INBOX.md');
    expect([...withRename.renameFroms]).toContain('.planning/FUTURE-IDEAS.md');
  });

  it('rewrites the NON-archive referrer but NOT the archived flat-path reference', async () => {
    const s = await senseArchiveTree(dir, { v3Rename: true });
    const notesEdits = s.editsByFile.get('.planning/NOTES.md') ?? [];
    // The non-archive referrer's inline link + prose path both get rewrite edits.
    expect(notesEdits.some((e) => e.from === '](FUTURE-IDEAS.md)')).toBe(true);
    expect(notesEdits.some((e) => e.from === '.planning/FUTURE-IDEAS.md')).toBe(true);

    // The archived doc gets NO rename edit (R7 — historical reference stays).
    const oldEdits = s.editsByFile.get('.planning/archive/M1/OLD.md') ?? [];
    expect(oldEdits.some((e) => e.from === '.planning/FUTURE-IDEAS.md')).toBe(false);
  });
});

describe('t1 — applyArchiveTree renames + rewrites; dangling-gate stays green', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('moves the files, rewrites the referrer, leaves the archive doc untouched', async () => {
    const res = await applyArchiveTree(dir, { apply: true, v3Rename: true });
    expect(res.applied).toBe(true);

    // Files renamed; sources gone.
    expect(existsSync(rel(dir, 'ISSUES-INBOX.md'))).toBe(true);
    expect(existsSync(rel(dir, 'FUTURE-IDEAS.md'))).toBe(false);
    expect(existsSync(rel(dir, 'archive', 'ISSUES-INBOX-LEDGER.md'))).toBe(true);
    expect(existsSync(rel(dir, 'archive', 'FUTURE-IDEAS-LEDGER.md'))).toBe(false);

    // Non-archive referrer rewritten (link → new name; prose path → new path).
    const notes = await readFile(rel(dir, 'NOTES.md'), 'utf-8');
    expect(notes).toContain('](./ISSUES-INBOX.md)');
    expect(notes).toContain('`.planning/ISSUES-INBOX.md`');
    expect(notes).not.toContain('FUTURE-IDEAS.md');

    // Archive doc's historical prose reference is UNTOUCHED (R7).
    const old = await readFile(rel(dir, 'archive', 'M1', 'OLD.md'), 'utf-8');
    expect(old).toContain('`.planning/FUTURE-IDEAS.md`');

    // The dangling-link gate stays green — the rewritten referrer resolves.
    const dangling = await scanDanglingLinks(dir);
    expect(dangling).toEqual([]);
  });
});

describe('t1 — drain LEDGER_HEADER tracks the resolved ledger name', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('a fresh v3 ledger names ISSUES-INBOX, not FUTURE-IDEAS', async () => {
    // A born-v3 repo (ISSUES-INBOX.md, no ledger yet): a terminal-eviction that
    // creates the ledger must title it for the RESOLVED inbox, not the legacy name.
    dir = await mkdtemp(join(tmpdir(), 'v3-ledger-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    await writeFile(
      rel(dir, 'ISSUES-INBOX.md'),
      ['# Issues Inbox', '', '## ✓ SHIPPED — done', '', 'body', '', '---', ''].join('\n'),
      'utf-8'
    );
    await evictTerminalToLedger(dir);
    const ledger = await readFile(rel(dir, 'archive', 'ISSUES-INBOX-LEDGER.md'), 'utf-8');
    expect(ledger).toContain('# ISSUES-INBOX — archive ledger');
    expect(ledger).toContain('`.planning/ISSUES-INBOX.md`');
    expect(ledger).not.toContain('FUTURE-IDEAS');
  });
});
