// Tests for the plugin validator's banned-vocabulary lint (M4.5.E2.S4.t2 / FR6.4).
//
// Two layers:
//  1. UNIT — the line-scan primitive (findJargonHits) the lint mirrors, proving
//     it catches `tranche` case-insensitively and returns [] on clean input.
//  2. INTEGRATION — checkBannedVocabulary() with an injectable baseDir/files,
//     proving it (a) catches a planted `tranche` in a temp add.md, (b) reports
//     ZERO hits against the real repo (guard: the shipped add.md/add.js are
//     clean), plus a subprocess smoke that `node tools/validate-plugin.js`
//     exits 0 on the clean repo.
//
// "Tranche" was renamed to "Milestone" in M4.t18; this lint is the long-term
// guard against the legacy term creeping back into the /sig:add surface.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findJargonHits } from './helpers/template-lint.js';
import { checkBannedVocabulary, ROOT } from '../tools/validate-plugin.js';

describe('findJargonHits — banned-term primitive', () => {
  it('catches a planted tranche', () => {
    const hits = findJargonHits('this has a tranche in it', /tranche/gi);
    expect(hits).toHaveLength(1);
    expect(hits[0].match).toBe('tranche');
    expect(hits[0].line).toBe(1);
  });

  it('returns [] for clean input', () => {
    expect(findJargonHits('milestone epic slice task', /tranche/gi)).toEqual([]);
  });

  it('is case-insensitive (Tranche, TRANCHE)', () => {
    expect(findJargonHits('a Tranche here', /tranche/gi)).toHaveLength(1);
    expect(findJargonHits('a TRANCHE here', /tranche/gi)).toHaveLength(1);
  });
});

describe('checkBannedVocabulary — validator lint', () => {
  let tmp;

  afterEach(() => {
    if (tmp) {
      rmSync(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it('catches a planted tranche in the linted file (AC)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'sig-vocab-lint-'));
    mkdirSync(join(tmp, 'commands'), { recursive: true });
    writeFileSync(
      join(tmp, 'commands', 'add.md'),
      'line one\nthis line mentions a tranche\nline three\n',
      'utf8',
    );

    const errors = [];
    const hits = checkBannedVocabulary(errors, tmp, ['commands/add.md']);

    expect(hits).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tranche');
    expect(errors[0]).toContain('commands/add.md:2');
  });

  it('catches the term case-insensitively', () => {
    tmp = mkdtempSync(join(tmpdir(), 'sig-vocab-lint-'));
    mkdirSync(join(tmp, 'commands'), { recursive: true });
    writeFileSync(join(tmp, 'commands', 'add.md'), 'a TRANCHE leaked back in\n', 'utf8');

    const errors = [];
    expect(checkBannedVocabulary(errors, tmp, ['commands/add.md'])).toBe(1);
  });

  it('reports zero hits for a clean file', () => {
    tmp = mkdtempSync(join(tmpdir(), 'sig-vocab-lint-'));
    mkdirSync(join(tmp, 'commands'), { recursive: true });
    writeFileSync(join(tmp, 'commands', 'add.md'), 'milestone epic slice task\n', 'utf8');

    const errors = [];
    expect(checkBannedVocabulary(errors, tmp, ['commands/add.md'])).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('skips files that do not exist', () => {
    tmp = mkdtempSync(join(tmpdir(), 'sig-vocab-lint-'));
    const errors = [];
    expect(checkBannedVocabulary(errors, tmp, ['commands/add.md', 'tools/lib/add.js'])).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('the real repo (commands/add.md + tools/lib/add.js) is clean', () => {
    const errors = [];
    expect(checkBannedVocabulary(errors, ROOT)).toBe(0);
    expect(errors).toEqual([]);
  });
});

describe('validate-plugin.js subprocess', () => {
  it('exits 0 on the clean repo', () => {
    const out = execFileSync('node', ['tools/validate-plugin.js'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('Plugin validation passed.');
  });
});
