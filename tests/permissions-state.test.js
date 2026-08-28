/**
 * tests/permissions-state.test.js — what this project already grants, and what
 * is genuinely missing (`M6.E5` FR2.1 / FR2.2).
 *
 * WHY A DELTA AND NOT A LIST. Measured 2026-08-26: this repo already grants 43
 * rules. A generator that ignores them re-proposes 43 lines the operator has,
 * burying whatever is actually new.
 *
 * THE TWO TESTS THAT CARRY THIS FILE:
 *
 * 1. ABSENT vs MALFORMED MUST NOT COLLAPSE. A settings file that is missing and
 *    one that is corrupt are different facts, and rendering both as "no rules"
 *    is `B39` — the shape where "checked and found nothing" is indistinguishable
 *    from "could not check". Asserted in both directions.
 *
 * 2. THE APPROXIMATION LIMIT RENDERS ON THE CLEAN PATH. The reported set is not
 *    the effective set — PreToolUse hooks can block a call every rule allows,
 *    and two of the five scopes are unreadable from here. A limit that appears
 *    only on failure is reassurance-shaped: the all-clean render is exactly
 *    where a reader would wrongly conclude the picture is complete, so that is
 *    the case pinned hardest.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readPermissionScopes,
  proposalDelta,
  denyDelta,
  formatScopeReport,
  APPROXIMATION_LIMIT,
  SCOPE_STATUS,
} from '../plugin/tools/lib/permissions-state.js';

function env(files) {
  const root = mkdtempSync(join(tmpdir(), 'perm-state-'));
  const home = join(root, 'home');
  const base = join(root, 'repo');
  mkdirSync(join(home, '.claude'), { recursive: true });
  mkdirSync(join(base, '.claude'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    writeFileSync(join(root, rel), body, 'utf-8');
  }
  return { root, home, base };
}
const rules = (allow) => JSON.stringify({ permissions: { allow } });

describe('readPermissionScopes — three scopes, three outcomes (FR2.1)', () => {
  it('AC2.1a — reads user, project and local scopes when present', () => {
    const { root, home, base } = env({
      'home/.claude/settings.json': rules(['Bash(git log:*)']),
      'repo/.claude/settings.json': rules(['Bash(npm test:*)']),
      'repo/.claude/settings.local.json': rules(['Bash(node:*)']),
    });
    const r = readPermissionScopes({ homeDir: home, baseDir: base });
    expect(r.scopes.map((s) => s.name)).toEqual(['user', 'project', 'local']);
    expect(r.scopes.every((s) => s.status === SCOPE_STATUS.OK)).toBe(true);
    expect([...r.granted].sort()).toEqual(['Bash(git log:*)', 'Bash(node:*)', 'Bash(npm test:*)']);
    rmSync(root, { recursive: true, force: true });
  });

  it('AC2.1b — an ABSENT scope reports absent', () => {
    const { root, home, base } = env({ 'home/.claude/settings.json': rules(['Bash(git log:*)']) });
    const r = readPermissionScopes({ homeDir: home, baseDir: base });
    expect(r.scopes.find((s) => s.name === 'project').status).toBe(SCOPE_STATUS.ABSENT);
    rmSync(root, { recursive: true, force: true });
  });

  it('AC2.1b — a MALFORMED scope reports cannot-check WITH a reason', () => {
    const { root, home, base } = env({ 'repo/.claude/settings.json': '{ this is not json' });
    const s = readPermissionScopes({ homeDir: home, baseDir: base }).scopes.find(
      (x) => x.name === 'project'
    );
    expect(s.status).toBe(SCOPE_STATUS.CANNOT_CHECK);
    expect(s.reason).toBeTruthy();
    rmSync(root, { recursive: true, force: true });
  });

  it('AC2.1b — absent and malformed are DISTINGUISHABLE, which is the whole point (B39)', () => {
    const a = env({});
    const b = env({ 'repo/.claude/settings.json': '{{{' });
    const absent = readPermissionScopes({ homeDir: a.home, baseDir: a.base }).scopes.find(
      (s) => s.name === 'project'
    );
    const broken = readPermissionScopes({ homeDir: b.home, baseDir: b.base }).scopes.find(
      (s) => s.name === 'project'
    );
    expect(absent.status).not.toBe(broken.status);
    // And neither may present itself as "this scope grants nothing".
    expect(broken.rules.allow).toEqual([]);
    expect(broken.status).toBe(SCOPE_STATUS.CANNOT_CHECK);
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  });

  it('a scope present but carrying no permissions key is OK-and-empty, not cannot-check', () => {
    const { root, home, base } = env({ 'repo/.claude/settings.json': '{"model":"opus"}' });
    const s = readPermissionScopes({ homeDir: home, baseDir: base }).scopes.find(
      (x) => x.name === 'project'
    );
    expect(s.status).toBe(SCOPE_STATUS.OK);
    expect(s.rules.allow).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it('reports defaultMode, and its absence — the deny half is empty by construction', () => {
    const { root, home, base } = env({
      'home/.claude/settings.json': JSON.stringify({ permissions: { allow: [], deny: [] } }),
    });
    const r = readPermissionScopes({ homeDir: home, baseDir: base });
    expect(r.defaultMode).toBeNull();
    expect(r.totals.deny).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('proposalDelta — never re-propose what is already granted (AC2.1c)', () => {
  it('suppresses a rule already granted, in ANY readable scope', () => {
    const { root, home, base } = env({
      // granted in the USER scope; proposed for the project scope
      'home/.claude/settings.json': rules(['Bash(git log:*)']),
    });
    const state = readPermissionScopes({ homeDir: home, baseDir: base });
    const d = proposalDelta(['Bash(git log:*)', 'Bash(npm test:*)'], state);
    expect(d.fresh).toEqual(['Bash(npm test:*)']);
    expect(d.suppressed).toEqual(['Bash(git log:*)']);
    expect(d.suppressedCount).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('proposes everything when nothing is granted', () => {
    const { root, home, base } = env({});
    const d = proposalDelta(['Bash(npm test:*)'], readPermissionScopes({ homeDir: home, baseDir: base }));
    expect(d.fresh).toEqual(['Bash(npm test:*)']);
    expect(d.suppressedCount).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('an unreadable scope does NOT suppress — a rule it might hold is still proposed', () => {
    // Suppressing on a scope we could not read would silently drop a proposal
    // on the strength of a file we never parsed. Fail toward proposing.
    const { root, home, base } = env({ 'repo/.claude/settings.json': '{{{' });
    const state = readPermissionScopes({ homeDir: home, baseDir: base });
    const d = proposalDelta(['Bash(npm test:*)'], state);
    expect(d.fresh).toEqual(['Bash(npm test:*)']);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('deny is compared against DENY, not against allow (REVIEW, Critical)', () => {
  it('collects existing deny rules into their own set', () => {
    const { root, home, base } = env({
      'repo/.claude/settings.json': JSON.stringify({ permissions: { allow: [], deny: ['Bash(sudo:*)'] } }),
    });
    const r = readPermissionScopes({ homeDir: home, baseDir: base });
    expect([...r.denied]).toEqual(['Bash(sudo:*)']);
    rmSync(root, { recursive: true, force: true });
  });

  it('an existing ALLOW rule does not suppress the matching DENY proposal', () => {
    // The defect: proposalDelta compared deny proposals against `granted`, so a
    // user who had already allowed curl silently lost the proposal to deny it —
    // the exact case where the deny matters most. The protective half shrank
    // precisely where it was needed, and reported the loss as "already granted".
    const { root, home, base } = env({
      'repo/.claude/settings.json': rules(['Bash(curl:*)']),
    });
    const state = readPermissionScopes({ homeDir: home, baseDir: base });
    const d = denyDelta(['Bash(curl:*)'], state);
    expect(d.fresh).toEqual(['Bash(curl:*)']);
    expect(d.suppressedCount).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('an existing DENY rule DOES suppress the matching deny proposal', () => {
    const { root, home, base } = env({
      'repo/.claude/settings.json': JSON.stringify({ permissions: { allow: [], deny: ['Bash(sudo:*)'] } }),
    });
    const state = readPermissionScopes({ homeDir: home, baseDir: base });
    expect(denyDelta(['Bash(sudo:*)'], state).fresh).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it('a proposed deny that collides with an existing allow is reported as a CONFLICT', () => {
    // Not a suppression and not a silent pass: the user has explicitly allowed
    // something this proposes blocking. That is a decision for them to make
    // knowingly, so it gets its own line.
    const { root, home, base } = env({ 'repo/.claude/settings.json': rules(['Bash(curl:*)']) });
    const state = readPermissionScopes({ homeDir: home, baseDir: base });
    expect(denyDelta(['Bash(curl:*)'], state).conflicts).toEqual(['Bash(curl:*)']);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('formatScopeReport — the stated limit (FR2.2)', () => {
  it('AC2.2a/AC2.2b — the limit renders on the ALL-CLEAN path', () => {
    const { root, home, base } = env({
      'home/.claude/settings.json': rules(['Bash(git log:*)']),
      'repo/.claude/settings.json': rules(['Bash(npm test:*)']),
      'repo/.claude/settings.local.json': rules([]),
    });
    const out = formatScopeReport(readPermissionScopes({ homeDir: home, baseDir: base }));
    expect(out).toContain(APPROXIMATION_LIMIT);
    rmSync(root, { recursive: true, force: true });
  });

  it('AC2.2b — the limit renders on the all-ABSENT path too', () => {
    const { root, home, base } = env({});
    const out = formatScopeReport(readPermissionScopes({ homeDir: home, baseDir: base }));
    expect(out).toContain(APPROXIMATION_LIMIT);
    rmSync(root, { recursive: true, force: true });
  });

  it('AC2.2a — the limit names hooks and the unreadable scopes, not just "approximate"', () => {
    expect(APPROXIMATION_LIMIT).toMatch(/PreToolUse/i);
    expect(APPROXIMATION_LIMIT).toMatch(/enterprise|managed/i);
  });

  it('a cannot-check scope is a visible LINE, not a silent omission (NFR2)', () => {
    const { root, home, base } = env({ 'repo/.claude/settings.json': '{{{' });
    const out = formatScopeReport(readPermissionScopes({ homeDir: home, baseDir: base }));
    expect(out).toMatch(/cannot-check/);
    rmSync(root, { recursive: true, force: true });
  });

  it('never renders a cannot-check scope as "0 rules"', () => {
    const { root, home, base } = env({ 'repo/.claude/settings.json': '{{{' });
    const line = formatScopeReport(readPermissionScopes({ homeDir: home, baseDir: base }))
      .split('\n')
      .find((l) => l.includes('project'));
    expect(line).not.toMatch(/\b0 allow\b/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('findings from the PR #211 independent review', () => {
  it('defaultMode is LAST-wins — the local scope beats the user scope', () => {
    // scopePaths returns [user, project, local] in ASCENDING precedence, so
    // first-wins reported the user value even when the local file overrode it.
    const { root, home, base } = env({
      'home/.claude/settings.json': JSON.stringify({ permissions: { defaultMode: 'default' } }),
      'repo/.claude/settings.local.json': JSON.stringify({ permissions: { defaultMode: 'dontAsk' } }),
    });
    expect(readPermissionScopes({ homeDir: home, baseDir: base }).defaultMode).toBe('dontAsk');
    rmSync(root, { recursive: true, force: true });
  });

  it('"zero deny rules" is NOT claimed when a scope could not be read', () => {
    // `totals` accumulates from OK scopes only, so with an unreadable scope the
    // note asserted a fact about a file nobody parsed — B39's collapse, in the
    // module built to avoid it everywhere else.
    const { root, home, base } = env({
      'home/.claude/settings.json': rules(['Bash(git log:*)']),
      'repo/.claude/settings.json': '{{{',
    });
    const out = formatScopeReport(readPermissionScopes({ homeDir: home, baseDir: base }));
    expect(out).not.toMatch(/empty by construction/);
    expect(out).toMatch(/NOT a claim that none exist/);
    rmSync(root, { recursive: true, force: true });
  });
});
