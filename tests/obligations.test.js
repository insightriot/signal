/**
 * tests/obligations.test.js — a discharged obligation must stop reading as owed
 * (`M5.E14` first slice).
 *
 * The done-when from BACKLOG.md, stated as the test it implies: "a fixture with
 * a discharged-but-unmarked obligation produces no false 'still owed' through a
 * full VERIFY→SHIP run." Two halves, both here:
 *
 *   1. an obligation that is genuinely open still reports as open;
 *   2. the same obligation, once marked, reports as discharged — and the marking
 *      is possible at all, which it was not before this slice. The schema made
 *      the true state unrepresentable, so #2 could not be written down.
 *
 * The `blind` path is tested as hard as the happy path. `open: []` from a source
 * that could not be read is the exact shape of the bug one level up: it looks
 * identical to "nothing is owed".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

import {
  OBLIGATION_READ,
  SOURCE_PROFILE_BACKFILL,
  dischargeObligation,
  formatObligationReport,
  normalizeObligation,
  parseEscalationHistory,
  readOpenObligations,
  readProfileObligations,
} from '../plugin/tools/lib/obligations.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-oblig-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const PROFILE = (historyBlock) => `---
tier: FULL
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true

metadata:
  created_at: 2026-01-01T00:00:00Z
  created_by: sig:calibrate
${historyBlock}
---

# Calibration Summary
`;

const LEGACY_HISTORY = `  escalation_history:
    - from_tier: FEATURE
      to_tier: FULL
      timestamp: 2026-02-01T00:00:00Z
      reason: "stakes grew"
      backfill_warnings:
        - "Phase-8 security backfill — run /sig:review on prior commits"
        - "REVIEW phase was previously skipped"`;

async function writeProfile(historyBlock) {
  await writeFile(join(dir, '.planning', 'PROFILE.md'), PROFILE(historyBlock), 'utf8');
}

// --- the schema can now express "done" ---------------------------------------

describe('normalizeObligation', () => {
  it('a plain string is an OPEN obligation — every pre-slice profile is this shape', () => {
    const o = normalizeObligation('run /sig:review on prior commits');
    expect(o.discharged).toBe(false);
    expect(o.text).toBe('run /sig:review on prior commits');
  });

  it('the object form can carry its discharge', () => {
    const o = normalizeObligation({
      warning: 'security backfill',
      discharged: true,
      discharged_by: 'PHASE10-REVIEW.md',
      discharged_at: '2026-03-01',
    });
    expect(o.discharged).toBe(true);
    expect(o.dischargedBy).toBe('PHASE10-REVIEW.md');
    expect(o.dischargedAt).toBe('2026-03-01');
  });

  it('only literal true discharges — a truthy string must not', () => {
    for (const v of ['no', 'false', 'yes', 1, {}]) {
      expect(normalizeObligation({ warning: 'w', discharged: v }).discharged).toBe(false);
    }
  });
});

// --- reading ------------------------------------------------------------------

describe('readProfileObligations', () => {
  it('reads legacy string warnings as open', async () => {
    await writeProfile(LEGACY_HISTORY);
    const r = await readProfileObligations(dir);
    expect(r.status).toBe(OBLIGATION_READ.OK);
    expect(r.obligations).toHaveLength(2);
    expect(r.obligations.every((o) => !o.discharged)).toBe(true);
    expect(r.source).toBe(SOURCE_PROFILE_BACKFILL);
  });

  it('reads a mixed history — one marked, one not', async () => {
    await writeProfile(`  escalation_history:
    - from_tier: FEATURE
      to_tier: FULL
      timestamp: 2026-02-01T00:00:00Z
      reason: "stakes grew"
      backfill_warnings:
        - warning: "Phase-8 security backfill"
          discharged: true
          discharged_by: "PHASE10-REVIEW.md"
        - "REVIEW phase was previously skipped"`);
    const r = await readProfileObligations(dir);
    expect(r.status).toBe(OBLIGATION_READ.OK);
    const discharged = r.obligations.filter((o) => o.discharged);
    const open = r.obligations.filter((o) => !o.discharged);
    expect(discharged.map((o) => o.text)).toEqual(['Phase-8 security backfill']);
    expect(open.map((o) => o.text)).toEqual(['REVIEW phase was previously skipped']);
  });

  it('MULTIPLE escalations parse as separate entries, with no phantom obligations', async () => {
    // Regression. The first cut of the parser kept `inWarnings` true across the
    // end of a warnings list, so the NEXT entry's `- from_tier: FULL` matched
    // the warning-item branch. Measured output was one entry carrying a phantom
    // open obligation literally reading `from_tier: FEATURE`, with the second
    // escalation's real warnings folded into the first.
    //
    // It reported a FALSE OPEN OBLIGATION — specimen #4 inverted, inside the
    // change written to end specimen #4. Multi-escalation is the designed case:
    // escalate.md says "APPEND … never replace the array, always push."
    await writeProfile(`  escalation_history:
    - from_tier: SKETCH
      to_tier: FEATURE
      timestamp: 2026-01-01T00:00:00Z
      reason: "first"
      backfill_warnings:
        - "first warning"
    - from_tier: FEATURE
      to_tier: FULL
      timestamp: 2026-02-01T00:00:00Z
      reason: "second"
      backfill_warnings:
        - warning: "second warning"
          discharged: true
          discharged_by: "PHASE10-REVIEW.md"
        - "third warning"`);

    const parsed = parseEscalationHistory(
      await readFile(join(dir, '.planning', 'PROFILE.md'), 'utf8')
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].warnings).toEqual(['first warning']);

    const r = await readOpenObligations(dir);
    expect(r.open.map((o) => o.text).sort()).toEqual(['first warning', 'third warning']);
    expect(r.discharged.map((o) => o.text)).toEqual(['second warning']);
    // No entry-level key may ever surface as an obligation.
    for (const o of [...r.open, ...r.discharged]) {
      expect(o.text).not.toMatch(/^(from_tier|to_tier|timestamp|reason):/);
    }
  });

  it('an entry with NO backfill_warnings key does not absorb the next entry\'s', async () => {
    await writeProfile(`  escalation_history:
    - from_tier: SKETCH
      to_tier: FEATURE
      timestamp: 2026-01-01T00:00:00Z
      reason: "no warnings on this one"
    - from_tier: FEATURE
      to_tier: FULL
      timestamp: 2026-02-01T00:00:00Z
      reason: "second"
      backfill_warnings:
        - "only warning"`);
    const parsed = parseEscalationHistory(
      await readFile(join(dir, '.planning', 'PROFILE.md'), 'utf8')
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].warnings).toEqual([]);
    expect(parsed[1].warnings).toEqual(['only warning']);
  });

  it('an empty backfill_warnings list yields no obligations', async () => {
    await writeProfile(`  escalation_history:
    - from_tier: FULL
      to_tier: FEATURE
      timestamp: 2026-02-01T00:00:00Z
      reason: "smaller than expected"
      backfill_warnings: []`);
    const r = await readProfileObligations(dir);
    expect(r.status).toBe(OBLIGATION_READ.OK);
    expect(r.obligations).toEqual([]);
  });

  it('no escalation history is NOT_APPLICABLE — a project that never escalated owes nothing', async () => {
    await writeProfile('  escalation_history: []');
    const r = await readProfileObligations(dir);
    expect(r.status).toBe(OBLIGATION_READ.OK);
    expect(r.obligations).toEqual([]);
  });

  it('a missing PROFILE.md is NOT_APPLICABLE, not an error', async () => {
    const r = await readProfileObligations(dir);
    expect(r.status).toBe(OBLIGATION_READ.NOT_APPLICABLE);
  });

  it('an unreadable PROFILE.md is CANNOT_DETERMINE — never a silent zero', async () => {
    const p = join(dir, '.planning', 'PROFILE.md');
    await writeFile(p, PROFILE(LEGACY_HISTORY), 'utf8');
    await chmod(p, 0o000);
    const r = await readProfileObligations(dir);
    await chmod(p, 0o644);
    // Root can read a 000 file; skip rather than assert something false there.
    if (r.status !== OBLIGATION_READ.OK) {
      expect(r.status).toBe(OBLIGATION_READ.CANNOT_DETERMINE);
      expect(r.reason).toBeTruthy();
    }
  });

  it('does not throw on a profile readProfile would reject', async () => {
    await writeFile(
      join(dir, '.planning', 'PROFILE.md'),
      '---\ntier: NOT_A_TIER\nschema_version: 99\n---\n',
      'utf8'
    );
    const r = await readProfileObligations(dir);
    expect([OBLIGATION_READ.OK, OBLIGATION_READ.NOT_APPLICABLE]).toContain(r.status);
    expect(r.obligations).toEqual([]);
  });
});

// --- the gate's question -------------------------------------------------------

describe('readOpenObligations + formatObligationReport', () => {
  it('separates open from discharged', async () => {
    await writeProfile(`  escalation_history:
    - from_tier: FEATURE
      to_tier: FULL
      timestamp: 2026-02-01T00:00:00Z
      reason: "r"
      backfill_warnings:
        - warning: "already done"
          discharged: true
          discharged_by: "PHASE10-REVIEW.md"
        - "still owed for real"`);
    const r = await readOpenObligations(dir);
    expect(r.open.map((o) => o.text)).toEqual(['still owed for real']);
    expect(r.discharged.map((o) => o.text)).toEqual(['already done']);
    expect(r.blind).toEqual([]);
  });

  it('the report names open items and does not claim "none" when some are open', async () => {
    await writeProfile(LEGACY_HISTORY);
    const copy = formatObligationReport(await readOpenObligations(dir));
    expect(copy).toMatch(/Open obligations \(2\)/);
    expect(copy).toMatch(/reported, not blocking/);
    expect(copy).not.toMatch(/Open obligations: none/);
  });

  it('"none" is only claimed when a source actually looked', async () => {
    await writeProfile('  escalation_history: []');
    expect(formatObligationReport(await readOpenObligations(dir))).toBe('Open obligations: none.');
  });

  it('a blind source renders as UNKNOWN, never as none (B39)', async () => {
    const blindResolver = async () => ({
      source: 'profile:backfill_warnings',
      status: OBLIGATION_READ.CANNOT_DETERMINE,
      obligations: [],
      reason: 'file is unreadable',
    });
    const r = await readOpenObligations(dir, { resolvers: [blindResolver] });
    expect(r.open).toEqual([]);
    expect(r.blind).toHaveLength(1);
    const copy = formatObligationReport(r);
    expect(copy).toMatch(/UNKNOWN, not none/);
    expect(copy).not.toMatch(/Open obligations: none/);
  });

  it('a resolver that throws is recorded as blind, not swallowed', async () => {
    const boom = async () => {
      throw new Error('kaboom');
    };
    const r = await readOpenObligations(dir, { resolvers: [boom] });
    expect(r.blind).toHaveLength(1);
    expect(r.blind[0].reason).toBe('kaboom');
  });
});

// --- the mechanism is REACHED (the B87/B88/B90 lesson) -------------------------

describe('the query is wired into SHIP and the schema documents the shape', () => {
  it('ship.md asks the question and renders the answer', async () => {
    const src = await readFile(join(REPO, 'plugin', 'commands', 'ship.md'), 'utf8');
    expect(src).toContain('readOpenObligations');
    expect(src).toContain('formatObligationReport');
    expect(src).toContain('obligations.js');
  });

  it('ship.md states that this reports rather than halts', async () => {
    const src = await readFile(join(REPO, 'plugin', 'commands', 'ship.md'), 'utf8');
    // The distinction from §0.6's branch gate is a decision, not a detail: a
    // later edit that turns this into a halt should have to change this line.
    expect(src).toMatch(/never halts/i);
  });

  it('profile-schema.md documents the discharged fields it now accepts', async () => {
    const src = await readFile(join(REPO, 'plugin', 'references', 'profile-schema.md'), 'utf8');
    for (const field of ['discharged', 'discharged_by', 'discharged_at', 'warning']) {
      expect(src, `schema must document ${field}`).toContain(field);
    }
    // The legacy form must stay documented as valid — profiles in the field use
    // it, and a schema doc that only shows the new shape reads as a migration.
    expect(src).toMatch(/Plain string = an OPEN obligation/);
  });
});

// --- the done-when, end to end ------------------------------------------------

describe('done-when: a discharged-but-unmarked obligation stops reading as owed', () => {
  it('open before marking, discharged after — the specimen-#4 loop, closed', async () => {
    await writeProfile(LEGACY_HISTORY);
    const text = 'Phase-8 security backfill — run /sig:review on prior commits';

    // 1. Before: it is owed, exactly as PHASE11's VERIFY reported it.
    const before = await readOpenObligations(dir);
    expect(before.open.map((o) => o.text)).toContain(text);

    // 2. The discharge is now expressible. It was not, and that is the bug:
    //    Phase 10 discharged this and had nowhere to say so.
    const res = await dischargeObligation(dir, {
      text,
      by: 'PHASE10-REVIEW.md',
      at: '2026-03-01',
    });
    expect(res.ok).toBe(true);

    // 3. After: no false "still owed".
    const after = await readOpenObligations(dir);
    expect(after.open.map((o) => o.text)).not.toContain(text);
    expect(after.discharged.map((o) => o.text)).toContain(text);
    expect(formatObligationReport(after)).toMatch(/PHASE10-REVIEW\.md/);

    // 4. The other obligation is untouched — discharging one must not clear all.
    expect(after.open.map((o) => o.text)).toContain('REVIEW phase was previously skipped');
  });

  it('the written marker survives a re-read from disk, not just in memory', async () => {
    await writeProfile(LEGACY_HISTORY);
    const text = 'REVIEW phase was previously skipped';
    await dischargeObligation(dir, { text, by: 'M5.E14' });
    const raw = await readFile(join(dir, '.planning', 'PROFILE.md'), 'utf8');
    expect(raw).toContain('discharged: true');
    expect(raw).toContain('discharged_by: "M5.E14"');
    const parsed = parseEscalationHistory(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].warnings.some((w) => typeof w === 'object' && w.discharged === true)).toBe(true);
  });

  it('discharging something that is not there fails loudly rather than no-oping', async () => {
    await writeProfile(LEGACY_HISTORY);
    const res = await dischargeObligation(dir, { text: 'never written down', by: 'x' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no open obligation matching/);
  });
});
