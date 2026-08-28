// M6.E5 FR2.1 / FR2.2 — what this project already grants, read from disk, and
// what a proposal should therefore leave out.
//
// WHY A DELTA. Measured 2026-08-26: this repo already grants 43 rules across two
// files. A generator that ignores them re-proposes 43 lines the operator already
// has, and the two or three that are actually new are lost in the middle.
//
// WHY THE READ IS AN APPROXIMATION, AND WHY THAT IS SAID OUT LOUD EVERY TIME.
// Five settings scopes exist; this reads three. `PreToolUse` hooks can block a
// call every rule allows. So what comes back is what is WRITTEN DOWN in the
// three readable files, not what the session will actually permit. Rendering
// that as "here is what this project allows" would be a completeness claim
// written from the shape of the data rather than from the artifact — so
// `formatScopeReport` carries the limit on every path, including the clean one.
//
// B39 IS THE GOVERNING SHAPE. A missing settings file and a corrupt one are
// different facts. Both would naturally render as "no rules", and that collapse
// is the bug: one means "nothing is granted here", the other means "we do not
// know what is granted here". They are kept apart end to end — different
// statuses, different report lines, and a cannot-check scope never suppresses a
// proposal.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Per-scope read outcome. */
export const SCOPE_STATUS = Object.freeze({
  /** Read and parsed. */
  OK: 'ok',
  /** No such file — this scope grants nothing. */
  ABSENT: 'absent',
  /** Present but unreadable or unparseable — we do not know what it grants. */
  CANNOT_CHECK: 'cannot-check',
});

/**
 * The limit that renders with every read (`AC2.2a`).
 *
 * Names the specific reasons rather than hedging generically: a reader can only
 * judge how far to trust the numbers if they know which way they are wrong.
 */
export const APPROXIMATION_LIMIT =
  'These are the rules WRITTEN DOWN in the readable settings files — not the effective permission set. ' +
  'A PreToolUse hook can block a call that every rule allows; managed/enterprise settings and CLI ' +
  'flags are two further scopes that are not readable from here, and precedence runs across all five.';

/** The three scopes readable from a project directory, in precedence order. */
function scopePaths({ homeDir, baseDir }) {
  return [
    { name: 'user', path: join(homeDir, '.claude', 'settings.json') },
    { name: 'project', path: join(baseDir, '.claude', 'settings.json') },
    { name: 'local', path: join(baseDir, '.claude', 'settings.local.json') },
  ];
}

const EMPTY = () => ({ allow: [], deny: [], ask: [] });

function readScope({ name, path }) {
  try {
    statSync(path);
  } catch {
    return { name, path, status: SCOPE_STATUS.ABSENT, rules: EMPTY(), defaultMode: null, reason: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    // Present but unreadable. `rules` stays empty because there is nothing to
    // report — but `status` is what callers must branch on, and nothing here
    // may treat this as "grants nothing".
    return {
      name,
      path,
      status: SCOPE_STATUS.CANNOT_CHECK,
      rules: EMPTY(),
      defaultMode: null,
      reason: `could not parse ${path}: ${err.message}`,
    };
  }
  const p = parsed?.permissions ?? {};
  return {
    name,
    path,
    status: SCOPE_STATUS.OK,
    rules: {
      allow: Array.isArray(p.allow) ? p.allow : [],
      deny: Array.isArray(p.deny) ? p.deny : [],
      ask: Array.isArray(p.ask) ? p.ask : [],
    },
    defaultMode: typeof p.defaultMode === 'string' ? p.defaultMode : null,
    reason: null,
  };
}

/**
 * Read the three readable permission scopes (FR2.1).
 *
 * @param {{homeDir: string, baseDir: string}} opts
 * @returns {{
 *   scopes: Array<object>,
 *   granted: Set<string>,
 *   totals: {allow: number, deny: number, ask: number},
 *   defaultMode: string|null,
 *   unreadable: string[],
 * }}
 */
export function readPermissionScopes({ homeDir, baseDir }) {
  const scopes = scopePaths({ homeDir, baseDir }).map(readScope);
  const granted = new Set();
  const denied = new Set();
  const totals = { allow: 0, deny: 0, ask: 0 };
  let defaultMode = null;

  for (const s of scopes) {
    if (s.status !== SCOPE_STATUS.OK) continue;
    for (const r of s.rules.allow) granted.add(r);
    for (const r of s.rules.deny) denied.add(r);
    totals.allow += s.rules.allow.length;
    totals.deny += s.rules.deny.length;
    totals.ask += s.rules.ask.length;
    // ⚠ LAST-WINS, not first-wins. `scopePaths` returns [user, project, local]
    // in ASCENDING precedence, so the LAST scope that sets `defaultMode` is the
    // one that actually applies. First-wins reported the user scope's value even
    // when the local file overrode it. (PR #211 review.)
    if (s.defaultMode) defaultMode = s.defaultMode;
  }

  return {
    scopes,
    granted,
    denied,
    totals,
    defaultMode,
    unreadable: scopes.filter((s) => s.status === SCOPE_STATUS.CANNOT_CHECK).map((s) => s.name),
  };
}

/**
 * Split a proposed rule set into what is new and what is already granted
 * (`AC2.1c`).
 *
 * FAILS TOWARD PROPOSING. Suppression is driven by `state.granted`, which only
 * ever collects rules from scopes that parsed. A scope we could not read
 * therefore suppresses nothing — dropping a proposal on the strength of a file
 * nobody parsed would be a silent omission justified by an unread file.
 *
 * @param {string[]} proposed
 * @param {ReturnType<typeof readPermissionScopes>} state
 * @returns {{fresh: string[], suppressed: string[], suppressedCount: number}}
 */
export function proposalDelta(proposed, state) {
  const granted = state?.granted ?? new Set();
  const fresh = [];
  const suppressed = [];
  for (const rule of proposed) (granted.has(rule) ? suppressed : fresh).push(rule);
  return { fresh, suppressed, suppressedCount: suppressed.length };
}

/**
 * Split proposed DENY rules against the existing DENY set — never against allow.
 *
 * ⚠ THE DEFECT THIS REPLACES, found at REVIEW. Deny proposals were routed
 * through `proposalDelta`, which suppresses against `granted` — the ALLOW set.
 * So a user who had already allowed `curl` silently lost the proposal to deny
 * it, and the loss was counted as "already granted". **The protective half shrank
 * precisely in the case it exists for**, and said nothing.
 *
 * A collision between a proposed deny and an existing allow is not a suppression
 * — it is a CONFLICT, and it is the most interesting thing the report can tell
 * anyone: they have explicitly permitted something this proposes blocking.
 * Deny-first precedence means installing it would silently override that allow,
 * so it must be a decision taken knowingly.
 *
 * @param {string[]} proposed
 * @param {ReturnType<typeof readPermissionScopes>} state
 * @returns {{fresh: string[], suppressed: string[], suppressedCount: number, conflicts: string[]}}
 */
export function denyDelta(proposed, state) {
  const denied = state?.denied ?? new Set();
  const granted = state?.granted ?? new Set();
  const fresh = [];
  const suppressed = [];
  const conflicts = [];
  for (const rule of proposed) {
    if (denied.has(rule)) suppressed.push(rule);
    else fresh.push(rule);
    if (granted.has(rule)) conflicts.push(rule);
  }
  return { fresh, suppressed, suppressedCount: suppressed.length, conflicts };
}

/**
 * Render the scope read (FR2.2).
 *
 * The limit is appended unconditionally — including when every scope read
 * cleanly, which is precisely the case where a reader would otherwise conclude
 * the picture is complete.
 *
 * @param {ReturnType<typeof readPermissionScopes>} state
 * @returns {string}
 */
export function formatScopeReport(state) {
  const lines = ['Permission rules on disk:'];

  for (const s of state.scopes) {
    if (s.status === SCOPE_STATUS.CANNOT_CHECK) {
      // Never "0 allow" — that is the sentence this whole module exists to
      // avoid printing about a file it could not read.
      lines.push(`  ${s.name.padEnd(8)} cannot-check — ${s.reason}`);
    } else if (s.status === SCOPE_STATUS.ABSENT) {
      lines.push(`  ${s.name.padEnd(8)} absent (${s.path})`);
    } else {
      const { allow, deny, ask } = s.rules;
      lines.push(`  ${s.name.padEnd(8)} ${allow.length} allow · ${deny.length} deny · ${ask.length} ask`);
    }
  }

  lines.push(
    `  ${'total'.padEnd(8)} ${state.totals.allow} allow · ${state.totals.deny} deny · ` +
      `${state.totals.ask} ask · defaultMode: ${state.defaultMode ?? 'unset'}`
  );

  // ⚠ Only claim "zero deny" when EVERY scope was actually read. `totals`
  // accumulates from OK scopes alone, so with an unreadable scope this note
  // asserted a fact about a file nobody parsed — the exact B39 collapse this
  // module is built to avoid, in the module that avoids it everywhere else.
  // (PR #211 review.)
  if (state.totals.deny === 0 && state.totals.allow > 0 && state.unreadable.length === 0) {
    lines.push(
      '',
      '  Note: zero deny rules. "Yes, and don\'t ask again" only ever adds to `allow`, ' +
        'so the protective half is empty by construction and cannot fill itself.'
    );
  } else if (state.totals.deny === 0 && state.unreadable.length > 0) {
    lines.push(
      '',
      `  Note: no deny rules were found, but ${state.unreadable.length} scope(s) could not be read ` +
        `(${state.unreadable.join(', ')}) — so this is NOT a claim that none exist.`
    );
  }

  lines.push('', `⚠ ${APPROXIMATION_LIMIT}`);
  return lines.join('\n');
}
