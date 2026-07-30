// tests/trigger-watchlist.test.js — M5.E13 S3.t1 (FR2.1, `B39`).
//
// `B39`: `ISSUES-INBOX.md` carries a standing entry — "Trigger watchlist
// (check conditions at every drain)", marked *never promote, merge, or delete*
// — instructing `/sig:plan`'s drain to walk its conditions. **No command
// implements that walk.** `grep -ril watchlist commands/ tools/` returned
// nothing before this task.
//
// Measured at M5.E13 PLAN: 11 rows, and the `Fired?` column read `—` on EVERY
// one. At least two had demonstrably fired — GitHub Issues adoption (first
// live external tester, 2026-07-15) and the BR-9 second dogfood project (whose
// condition says *escalate if not started by the time M5 PLAN runs*, and M5
// PLAN has run repeatedly).
//
// FR2.1 offered two branches: implement the walk, or retire the entry that
// claims one happens. PLAN chose IMPLEMENT, on evidence: one row is DATED and
// still live (synthesizer validator, expires 2026-08-23), and the entry's own
// rationale was "one dated trigger that would otherwise expire unobserved."
// Retiring it three and a half weeks early would have destroyed the thing it
// was created to protect.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTriggerWatchlist } from '../tools/lib/drain.js';
import { resolveInboxPath } from '../tools/lib/inbox-path.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FIXTURE = `# Inbox

## Something else

**Status:** Logged 2026-01-01.

## Trigger watchlist — standing entry (check conditions at every drain)

**Status:** Added 2026-07-04. **Standing entry — never promote, merge, or delete.**

| Parked item | Trigger condition | Fired? |
|---|---|---|
| Linux install matrix | A Linux tester volunteers | — |
| GitHub Issues adoption | First live external tester | ✅ 2026-07-15 |
| Dated synth check | 2+ regressions by **2026-08-23** | — |

## Another entry

**Status:** Logged 2026-02-02.
`;

describe('M5.E13 S3.t1 — parseTriggerWatchlist (B39)', () => {
  it('finds the standing entry and parses its rows', () => {
    const wl = parseTriggerWatchlist(FIXTURE);
    expect(wl).not.toBeNull();
    expect(wl.rows).toHaveLength(3);
    expect(wl.rows[0].item).toContain('Linux install matrix');
    expect(wl.rows[0].condition).toContain('Linux tester');
  });

  it('AC2.1 — separates UNEVALUATED rows from decided ones', () => {
    const wl = parseTriggerWatchlist(FIXTURE);
    // The whole bug: 11 rows all reading "—" and nothing surfacing that.
    expect(wl.unevaluated.map((r) => r.item)).toEqual([
      expect.stringContaining('Linux install matrix'),
      expect.stringContaining('Dated synth check'),
    ]);
    expect(wl.decided.map((r) => r.item)).toEqual([
      expect.stringContaining('GitHub Issues adoption'),
    ]);
  });

  it('AC2.1 — surfaces DATED conditions with their date, so one cannot expire unobserved', () => {
    const wl = parseTriggerWatchlist(FIXTURE);
    const dated = wl.dated;
    expect(dated).toHaveLength(1);
    expect(dated[0].date).toBe('2026-08-23');
    expect(dated[0].item).toContain('Dated synth check');
  });

  it('returns null when the project has no watchlist (portable, no false alarm)', () => {
    expect(parseTriggerWatchlist('# Inbox\n\n## A thing\n\ntext\n')).toBeNull();
  });

  it('a checked-and-declined row is distinguishable from an unchecked one (B39 second half)', () => {
    const wl = parseTriggerWatchlist(FIXTURE);
    const declined = wl.rows.find((r) => r.item.includes('GitHub'));
    expect(declined.evaluated).toBe(true);
    expect(wl.rows.find((r) => r.item.includes('Linux')).evaluated).toBe(false);
  });
});

describe('M5.E13 S3.t1 — the walk runs against Signal\'s real inbox', () => {
  const live = readFileSync(join(ROOT, resolveInboxPath(ROOT)), 'utf-8');

  it('finds the real standing entry (the population is not empty)', () => {
    const wl = parseTriggerWatchlist(live);
    expect(wl).not.toBeNull();
    expect(wl.rows.length).toBeGreaterThanOrEqual(10);
  });

  it('the dated synthesizer trigger is visible and carries its expiry', () => {
    const wl = parseTriggerWatchlist(live);
    expect(wl.dated.some((r) => r.date === '2026-08-23')).toBe(true);
  });
});

describe('M5.E13 S3.t1 — the walk is actually wired into /sig:plan (B39 is about a walk that never ran)', () => {
  it('plan.md instructs the drain to walk the watchlist and names the function', () => {
    const planMd = readFileSync(join(ROOT, 'commands/plan.md'), 'utf-8');
    expect(planMd).toContain('parseTriggerWatchlist');
    expect(planMd.toLowerCase()).toContain('watchlist');
  });
});
