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
// ⚠ THIS IS A REPO-FILE PIN, AND IT IS NOT `B120`'s SHAPE. `drain-standing`
// AC2.2c fires whenever the inbox is USED as intended (a capture lands). These
// fire when a row starts or stops matching a predicate — which is exactly the
// moment a human should re-read the hit and decide whether the vocabulary is
// still precise. The failure message says so and names the remedy; it is a
// re-measurement step, not a mystery red.
import { describe, expect, it } from 'vitest';
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

/** The message a red pin prints. It is the whole point of the pin, so it is not terse. */
export function remedy(name, measured, now) {
  return (
    `${name} was measured at ${measured.hits} on ${measured.on} (over ${measured.rows} rows); ` +
    `this repository's BACKLOG.md now yields ${now}. Re-measure: read every new or vanished hit ` +
    `by hand, decide whether the vocabulary is still precise, then update the constant beside the pattern.`
  );
}

/** One scoring of the live file, the way `runAdvise` does it. Exported for the S2/S3 pins. */
export async function scoreRepo() {
  const corpus = await readCorpus(repoRoot);
  const discharge = await backlogDischargeStatus(repoRoot);
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
    const now = live.filter((s) => s.blocked).length;
    expect(now, remedy('BLOCKED_MEASURED', BLOCKED_MEASURED, now)).toBe(BLOCKED_MEASURED.hits);
  });

  it('TRIGGER_MET_MEASURED — input 2 fires on exactly the recorded number of live rows', async () => {
    const { live } = await scoreRepo();
    const now = live.filter((s) => s.triggerMet).length;
    expect(now, remedy('TRIGGER_MET_MEASURED', TRIGGER_MET_MEASURED, now)).toBe(TRIGGER_MET_MEASURED.hits);
  });

  it('NOT_LIVE_MEASURED — input 5 drops exactly the recorded number of rows', async () => {
    const { all } = await scoreRepo();
    const now = all.filter((s) => s.notLive.notLive).length;
    expect(now, remedy('NOT_LIVE_MEASURED', NOT_LIVE_MEASURED, now)).toBe(NOT_LIVE_MEASURED.hits);
  });
});

describe('M6.E8 t2.2 — the fold input and the KEPT override, measured on this repository (AC4.3)', () => {
  const headings = (list) => list.map((s) => `\n    · ${s.row.text}`).join('');

  it('FOLD_MEASURED — exactly the recorded number of live rows drop by fold', async () => {
    const { all } = await scoreRepo();
    const dropped = all.filter((s) => s.moved.moved);
    expect(dropped.length, `${remedy('FOLD_MEASURED', FOLD_MEASURED, dropped.length)}\n  Dropped now:${headings(dropped)}`).toBe(FOLD_MEASURED.hits);
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
    expect(
      hits.length,
      `${remedy('BUG_DISCHARGE_MEASURED', BUG_DISCHARGE_MEASURED, hits.length)}\n  Hits now:${hits.map((s) => `\n    · ${s.row.text}`).join('')}`
    ).toBe(BUG_DISCHARGE_MEASURED.hits);
  });
});
