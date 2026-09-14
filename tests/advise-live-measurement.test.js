// M6.E8 S1 t1.1 — the live-measurement test (NFR6).
//
// Every vocabulary the advisor ranks on records the count it produced on THIS
// repository's own BACKLOG.md, beside the pattern, as a frozen `*_MEASURED`
// constant. This file is what turns those numbers from comments into claims: it
// runs the real file through the real readers — `readCorpus` at depth 4, the
// real discharge status, the real `rankRows` — and asserts each count.
//
// Why it exists: `declaresNotLiveWork`'s docblock recorded "50 live rows: parked
// ×2, not sprint material ×1, reconciliation ×2" on 2026-09-06 and nothing ever
// re-ran it. By 2026-09-14 the file had 48 live rows. A count in a comment is a
// claim written from memory the moment the file moves.
//
// ⚠ ONE OF THESE PINS BREAKS AT THIS EPIC'S OWN SHIP, BY CONSTRUCTION.
// `TRIGGER_MET_MEASURED` is 3, and one of the three is this Epic's own backlog
// row. `readCorpus` filters struck rows, so discharging that row at SHIP — which
// `NFR1` itself calls a one-time human SHIP edit — drops the count to 2 and turns
// this file red unless the constant is bumped in the SAME commit. Found in REVIEW
// by a fresh-context test reviewer, before it happened rather than after.
// **Bumping it is the correct response, not a workaround**: the vocabulary's
// reach genuinely changed by one row and a human genuinely looked at that row.
// It is recorded here so the SHIP commit does not read as a mystery red.
//
// ⚠ THIS IS A REPO-FILE PIN, AND IT IS NOT `B120`'s SHAPE. `drain-standing`
// AC2.2c fires whenever the inbox is USED as intended (a capture lands). These
// fire when a row starts or stops matching a predicate — which is exactly the
// moment a human should re-read the hit and decide whether the vocabulary is
// still precise. The failure message says so and names the remedy; it is a
// re-measurement step, not a mystery red.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCKED_MEASURED, TRIGGER_MET_MEASURED, rankRows } from '../plugin/tools/lib/advise.js';
import {
  BUG_DISCHARGE_MEASURED,
  FOLD_MEASURED,
  KEPT_MEASURED,
  NOT_LIVE_MEASURED,
  backlogDischargeStatus,
} from '../plugin/tools/lib/backlog.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The message a red pin prints. It is the whole point of the pin, so it is not terse.
 *
 * ⚠ IT NAMES THE HEADINGS. Three of the six pins printed counts only, so a red
 * told the reader a number had moved and not which row moved it — forcing a
 * manual re-run to find out, which is how a remedy message stops being followed.
 * Found in REVIEW by a fresh-context test reviewer.
 */
export function remedy(name, measured, now, hits = []) {
  const listed = hits.length > 0 ? `\n  Matching now:${hits.map((s) => `\n    · ${s.row.text}`).join('')}` : '';
  return (
    `${name} was measured at ${measured.hits} on ${measured.on} (over ${measured.rows} rows); ` +
    `this repository's BACKLOG.md now yields ${now}. Re-measure: read every new or vanished hit ` +
    `by hand, decide whether the vocabulary is still precise, then update the constant beside the pattern.` +
    listed
  );
}

/**
 * One scoring of the live file, the way `runAdvise` does it. Exported for the S2/S3 pins.
 *
 * ⚠ IT ASSERTS ITS OWN INPUTS FIRST, and that assertion is the point of the
 * helper rather than defensive tidying. Found in REVIEW by a fresh-context
 * security audit: two pins below expect **zero** hits, and an unreadable source
 * also yields zero. `BUGS.md` replaced by a directory makes `corpus.sources.bugs`
 * null, so the confirmed-bug set is empty, so `BUG_DISCHARGE_MEASURED` passes
 * having checked nothing; an unreadable `STATE.md` empties `stale` and AC3.3
 * passes the same way. Reproduced, not reasoned about: with `BUGS.md` a
 * directory, `discharge` still reports `outcome: 'clean'` while
 * `sources: {units: true, bugs: false}`.
 *
 * That is the exact trap `sources` was added to close for the ARTIFACT — an
 * outcome that reads clean over a source nobody opened — reproduced one level
 * down in the tests that measure it. So the guard is the same shape: check that
 * every source was readable before believing any count taken from it.
 */
export async function scoreRepo() {
  const corpus = await readCorpus(repoRoot);
  const discharge = await backlogDischargeStatus(repoRoot);
  expect(
    corpus.cannotCheck.map((c) => c.source),
    'a pin taken over an unreadable source proves nothing — fix the corpus, then re-measure'
  ).toEqual([]);
  expect(
    discharge.sources,
    'the discharge input could not open a closure source, so any zero it reports is vacuous'
  ).toEqual({ units: true, bugs: true });
  const confirmedBugs = new Set(
    (corpus.sources.bugs?.entries ?? []).filter((e) => e.status === 'confirmed').map((e) => e.id)
  );
  const ranked = rankRows(corpus.sources.backlog.rows, {
    today: '2026-09-14',
    stale: discharge.stale ?? [],
    discharge,
    confirmedBugs,
  });
  // `rankRows` PARTITIONS — every scored row is in exactly one of these.
  const all = [...ranked.recommended, ...ranked.declined];
  const live = all.filter((s) => !s.dischargedElsewhere && !s.notLive.notLive && !s.moved?.moved);
  return { corpus, discharge, ranked, all, live };
}

describe('M6.E8 t1.1 — every *_MEASURED constant has the shape the pins read', () => {
  for (const [name, m] of [
    ['BLOCKED_MEASURED', BLOCKED_MEASURED],
    ['TRIGGER_MET_MEASURED', TRIGGER_MET_MEASURED],
    ['NOT_LIVE_MEASURED', NOT_LIVE_MEASURED],
  ]) {
    it(`${name} is frozen and carries on / rows / hits`, () => {
      expect(Object.isFrozen(m)).toBe(true);
      expect(m.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(m.rows)).toBe(true);
      expect(Number.isInteger(m.hits)).toBe(true);
    });
  }
});

describe('M6.E8 t1.1 — the three existing inputs, measured on this repository', () => {
  it('BLOCKED_MEASURED — input 1 fires on exactly the recorded number of live rows', async () => {
    const { live } = await scoreRepo();
    const hits = live.filter((s) => s.blocked);
    expect(hits.length, remedy('BLOCKED_MEASURED', BLOCKED_MEASURED, hits.length, hits)).toBe(BLOCKED_MEASURED.hits);
    expect(live.length, remedy('BLOCKED_MEASURED.rows', BLOCKED_MEASURED, live.length)).toBe(BLOCKED_MEASURED.rows);
  });

  it('TRIGGER_MET_MEASURED — input 2 fires on exactly the recorded number of live rows', async () => {
    const { live } = await scoreRepo();
    const hits = live.filter((s) => s.triggerMet);
    expect(hits.length, remedy('TRIGGER_MET_MEASURED', TRIGGER_MET_MEASURED, hits.length, hits)).toBe(
      TRIGGER_MET_MEASURED.hits
    );
  });

  it('NOT_LIVE_MEASURED — input 5 drops exactly the recorded number of rows', async () => {
    const { all } = await scoreRepo();
    const hits = all.filter((s) => s.notLive.notLive);
    expect(hits.length, remedy('NOT_LIVE_MEASURED', NOT_LIVE_MEASURED, hits.length, hits)).toBe(NOT_LIVE_MEASURED.hits);
    expect(all.length, remedy('NOT_LIVE_MEASURED.rows', NOT_LIVE_MEASURED, all.length)).toBe(NOT_LIVE_MEASURED.rows);
  });
});

describe('M6.E8 t2.2 — the fold input and the KEPT override, measured on this repository (AC4.3)', () => {
  const headings = (list) => list.map((s) => `\n    · ${s.row.text}`).join('');

  it('FOLD_MEASURED — exactly the recorded number of live rows drop by fold', async () => {
    const { all } = await scoreRepo();
    const dropped = all.filter((s) => s.moved.moved);
    expect(dropped.length, `${remedy('FOLD_MEASURED', FOLD_MEASURED, dropped.length)}\n  Dropped now:${headings(dropped)}`).toBe(FOLD_MEASURED.hits);
  });

  it('FOLD_MEASURED.rows / KEPT_MEASURED.rows — the population both were counted over', async () => {
    const { all } = await scoreRepo();
    expect(all.length, remedy('FOLD_MEASURED.rows', FOLD_MEASURED, all.length)).toBe(FOLD_MEASURED.rows);
    expect(all.length, remedy('KEPT_MEASURED.rows', KEPT_MEASURED, all.length)).toBe(KEPT_MEASURED.rows);
  });

  it('KEPT_MEASURED — exactly the recorded number of rows are preserved by the override, and stay live', async () => {
    const { all, live } = await scoreRepo();
    const kept = all.filter((s) => s.moved.kept);
    expect(kept.length, `${remedy('KEPT_MEASURED', KEPT_MEASURED, kept.length)}\n  Kept now:${headings(kept)}`).toBe(KEPT_MEASURED.hits);
    for (const k of kept) expect(live, `KEPT row is not live: ${k.row.text}`).toContain(k);
  });
});

describe('M6.E8 t3.1 — the bug-discharge input, measured on this repository (AC1.3)', () => {
  it('BUG_DISCHARGE_MEASURED — fires on exactly the recorded number of live rows, which is zero', async () => {
    const { live } = await scoreRepo();
    const hits = live.filter((s) => s.dischargesBug);
    expect(hits.length, remedy('BUG_DISCHARGE_MEASURED', BUG_DISCHARGE_MEASURED, hits.length, hits)).toBe(
      BUG_DISCHARGE_MEASURED.hits
    );
    expect(live.length, remedy('BUG_DISCHARGE_MEASURED.rows', BUG_DISCHARGE_MEASURED, live.length)).toBe(
      BUG_DISCHARGE_MEASURED.rows
    );
  });
});

describe('M6.E8 t3.2 (FR2 amended — D-M6E8-7) — BLOCKED_RE is not widened, and the gate row is not what blocks', () => {
  it('AC2.1′ — no blocked row is blocked BY "entry price for"; the gate row, if live, is not blocked', async () => {
    const { live } = await scoreRepo();
    const phrase = /\bentry price for\b/i;
    const blockedByPhrase = live.filter((s) => s.blocked && phrase.test(`${s.row.text}\n${s.row.body ?? ''}`));
    expect(blockedByPhrase.map((s) => s.row.text)).toEqual([]);
    // The gate row — "The entry price for any Phase A autonomy work: B73–B76" —
    // is live until its four bugs are fixed and it is struck. While it is live
    // it must rank as UNBLOCKED: it is the row that says "do these first".
    //
    // ⚠ NOT GUARDED BY `if (gate)`. It was, and a fresh-context test reviewer
    // pointed out that the assertion then vanishes in silence the moment the row
    // is struck or retitled — the whole assertion quietly becoming a no-op is the
    // failure mode this file exists to prevent. If the row is gone, that is a
    // deliberate change and the fixture should be updated, loudly.
    const gate = live.find((s) => /^The entry price for/.test(s.row.text));
    expect(gate, 'the gate-row fixture is no longer on BACKLOG.md — update or remove this assertion deliberately').toBeDefined();
    expect(gate.blocked, `the gate row reads blocked: ${gate.row.text}`).toBe(false);
  });

  it('AC2.2 — the pattern is byte-identical to what M6.E7 shipped, so nothing blocked before is unblocked after', () => {
    const src = readFileSync(join(repoRoot, 'plugin/tools/lib/advise.js'), 'utf8');
    const line = src.match(/^const BLOCKED_RE = (.+);$/m)?.[1];
    expect(line).toBe(String.raw`/\b(?:blocked on|gated on|depends on|trigger[^.\n]{0,60}\b(?:is\s+)?NOT met|unmet trigger)\b/i`);
  });
});

describe('M6.E8 t3.3 — input 3 on this repository (AC3.3)', () => {
  it('discharges zero live rows today — a non-zero here is a row /sig:docs-sweep should already be flagging as stale', async () => {
    const { all, discharge } = await scoreRepo();
    const dropped = all.filter((s) => s.dischargedElsewhere);
    expect(dropped.map((s) => s.row.text), `stale per backlogDischargeStatus: ${JSON.stringify(discharge.stale)}`).toEqual([]);
  });
});
