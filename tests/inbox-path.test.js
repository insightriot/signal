// Tests for tools/lib/inbox-path.js — the back-compat inbox/ledger resolver
// (M5.E3.S1.t1 / FR1). Cross-cutting decision R1: ISSUES-INBOX wins when both
// exist; the code rename is non-breaking and migrate-timing-independent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveInboxPath, resolveLedgerPath } from '../tools/lib/inbox-path.js';

describe('resolveInboxPath (R1 — ISSUES-INBOX wins; back-compat to FUTURE-IDEAS)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'inbox-path-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves to FUTURE-IDEAS.md when only the legacy inbox is present', async () => {
    await writeFile(join(tempDir, '.planning', 'FUTURE-IDEAS.md'), '# x\n', 'utf-8');
    expect(resolveInboxPath(tempDir)).toBe('.planning/FUTURE-IDEAS.md');
  });

  it('resolves to ISSUES-INBOX.md when the new inbox is present', async () => {
    await writeFile(join(tempDir, '.planning', 'ISSUES-INBOX.md'), '# x\n', 'utf-8');
    expect(resolveInboxPath(tempDir)).toBe('.planning/ISSUES-INBOX.md');
  });

  it('R1: ISSUES-INBOX wins when BOTH the new and legacy inbox exist', async () => {
    await writeFile(join(tempDir, '.planning', 'FUTURE-IDEAS.md'), '# x\n', 'utf-8');
    await writeFile(join(tempDir, '.planning', 'ISSUES-INBOX.md'), '# x\n', 'utf-8');
    expect(resolveInboxPath(tempDir)).toBe('.planning/ISSUES-INBOX.md');
  });

  it('resolves to the new ISSUES-INBOX.md name when NEITHER exists (lazy-create default)', () => {
    expect(resolveInboxPath(tempDir)).toBe('.planning/ISSUES-INBOX.md');
  });
});

describe('resolveLedgerPath (existence-first; neither-exists pairs with the inbox)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ledger-path-'));
    await mkdir(join(tempDir, '.planning', 'archive'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves to the new ISSUES-INBOX-LEDGER.md when it is present', async () => {
    await writeFile(join(tempDir, '.planning', 'archive', 'ISSUES-INBOX-LEDGER.md'), 'x\n', 'utf-8');
    expect(resolveLedgerPath(tempDir)).toBe('.planning/archive/ISSUES-INBOX-LEDGER.md');
  });

  it('resolves to the legacy FUTURE-IDEAS-LEDGER.md when only it is present', async () => {
    await writeFile(join(tempDir, '.planning', 'archive', 'FUTURE-IDEAS-LEDGER.md'), 'x\n', 'utf-8');
    expect(resolveLedgerPath(tempDir)).toBe('.planning/archive/FUTURE-IDEAS-LEDGER.md');
  });

  // The advisor's coupling assertion — pins option C so a later "simplify to
  // pure existence" can't silently re-break the drain suite. A legacy-inbox repo
  // that has NEVER evicted (no ledger yet) pairs with the LEGACY ledger name.
  it('neither ledger exists but the LEGACY inbox is present → legacy ledger (pairs with inbox)', async () => {
    await writeFile(join(tempDir, '.planning', 'FUTURE-IDEAS.md'), '# x\n', 'utf-8');
    expect(resolveLedgerPath(tempDir)).toBe('.planning/archive/FUTURE-IDEAS-LEDGER.md');
  });

  it('neither ledger nor legacy inbox present → new ISSUES-INBOX-LEDGER.md', () => {
    expect(resolveLedgerPath(tempDir)).toBe('.planning/archive/ISSUES-INBOX-LEDGER.md');
  });

  it('neither ledger exists but the NEW inbox is present → new ledger', async () => {
    await writeFile(join(tempDir, '.planning', 'ISSUES-INBOX.md'), '# x\n', 'utf-8');
    expect(resolveLedgerPath(tempDir)).toBe('.planning/archive/ISSUES-INBOX-LEDGER.md');
  });
});
