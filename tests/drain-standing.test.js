// M6.E4 S2 — standing inbox entries (FR2.1 / FR2.2).
//
// The defect: an entry meant to stay open forever is indistinguishable from an
// unanswered one, so it is counted as a live drain candidate every time. On this
// repo the trigger-watchlist entry ("never promote, merge, or delete") is the
// ONLY live candidate, so the live count is structurally pinned at >= 1 and
// commands/plan.md Step 1b's "no candidates" branch can never run.
//
// Same can't-tell-checked-from-unchecked shape as B39 and B90.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseEntries,
  listDrainCandidates,
  listDrainCandidatesWithRecovery,
  listStandingEntries,
  parseTriggerWatchlist,
} from '../plugin/tools/lib/drain.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const MARKED = `# Inbox

## Trigger watchlist — standing entry
<!-- standing -->

**Status:** Added 2026-07-04. **Standing entry — never promote, merge, or delete.**

## An ordinary live idea

**Status:** Logged 2026-08-01 via \`/sig:add\`.
`;

const UNMARKED = `# Inbox

## Trigger watchlist — standing entry

**Status:** Added 2026-07-04.

## An ordinary live idea

**Status:** Logged 2026-08-01 via \`/sig:add\`.
`;

describe('M6.E4 S2 — the standing marker (FR2.1)', () => {
  it('AC2.1a — a marked entry parses as standing', () => {
    const entries = parseEntries(MARKED);
    const watchlist = entries.find((e) => /Trigger watchlist/.test(e.heading));
    expect(watchlist.standing).toBe(true);
  });

  it('AC2.1a — an unmarked entry is not standing', () => {
    const entries = parseEntries(MARKED);
    const ordinary = entries.find((e) => /ordinary live idea/.test(e.heading));
    expect(ordinary.standing).toBe(false);
  });

  it('AC2.1b — a marker inside a fenced block does NOT mark the entry', () => {
    const fenced = `# Inbox

## An entry that documents the marker

**Status:** Logged 2026-08-01.

\`\`\`markdown
<!-- standing -->
\`\`\`
`;
    const [entry] = parseEntries(fenced);
    expect(entry.standing).toBe(false);
  });

  it('AC2.1b — a marker deep in the body, past the header region, does NOT mark', () => {
    const deep = `# Inbox

## An entry that mentions the marker much later

**Status:** Logged 2026-08-01.

Some prose.

More prose that goes on a while.

Even more prose, well past the header region.

<!-- standing -->
`;
    const [entry] = parseEntries(deep);
    expect(entry.standing).toBe(false);
  });

  it('AC2.1c — parseTriggerWatchlist is untouched: it still reads the real inbox', () => {
    const inbox = readFileSync(join(repoRoot, '.planning/ISSUES-INBOX.md'), 'utf8');
    const w = parseTriggerWatchlist(inbox);
    expect(w).not.toBeNull();
    expect(w.rows.length).toBeGreaterThan(0);
  });
});

describe('M6.E4 S2 — standing entries leave the live count (FR2.2)', () => {
  it('AC2.2a — a standing entry is excluded from drain candidates', () => {
    const candidates = listDrainCandidates(MARKED);
    expect(candidates.some((e) => /Trigger watchlist/.test(e.heading))).toBe(false);
  });

  it('AC2.2a — a non-standing live entry still surfaces', () => {
    const candidates = listDrainCandidates(MARKED);
    expect(candidates.some((e) => /ordinary live idea/.test(e.heading))).toBe(true);
  });

  it('AC2.2b — standing entries are retrievable as their own category', () => {
    const standing = listStandingEntries(MARKED);
    expect(standing).toHaveLength(1);
    expect(standing[0].heading).toMatch(/Trigger watchlist/);
  });

  it('AC2.2d — a project with NO markers behaves byte-identically to today', () => {
    // The regression guard for every other project in the corpus.
    const candidates = listDrainCandidates(UNMARKED);
    expect(candidates).toHaveLength(2);
    expect(listStandingEntries(UNMARKED)).toHaveLength(0);
  });

  it('AC2.2c — THIS repo: the inbox reports 0 live candidates and 1 standing', () => {
    // The measurable outcome from M6.E4-REQUIREMENTS.md. Before this slice the
    // live count was 1 and could never reach 0.
    const inbox = readFileSync(join(repoRoot, '.planning/ISSUES-INBOX.md'), 'utf8');
    expect(listDrainCandidates(inbox)).toHaveLength(0);
    expect(listStandingEntries(inbox)).toHaveLength(1);
  });
});

describe('M6.E4 S2 — an entry with NO Status line (AC2.1b edge)', () => {
  // Hand-added entries are exactly the ones likely to be permanent, and they are
  // the shape most likely to lack the `**Status:**` line /sig:add writes. The
  // header-region window is bounded by the Status line, so this shape needs its
  // own pin: with no Status line the window closes at the FIRST non-blank line.
  it('a marker on the first non-blank line marks the entry', () => {
    const noStatus = `# Inbox

## A hand-added permanent note
<!-- standing -->

Body prose with no Status line anywhere.
`;
    const [entry] = parseEntries(noStatus);
    expect(entry.standing).toBe(true);
  });

  it('a leading CODE FENCE closes the window — marker past it does not mark (PR #200 review)', () => {
    // The fence-marker `continue` ran BEFORE the window-close check, so an entry
    // with no Status line whose first non-blank line opens a fence was scanned
    // straight through the fence and past it. The comment promised "conservative
    // by construction"; the code was the opposite — silently removing an entry
    // from the live drain count.
    const fenceFirst = `# Inbox

## No status line, fence first

\`\`\`markdown
sample content
\`\`\`

<!-- standing -->
`;
    const [entry] = parseEntries(fenceFirst);
    expect(entry.standing).toBe(false);
  });

  it('a marker AFTER the first non-blank line does not', () => {
    const noStatus = `# Inbox

## A hand-added note
Body prose comes first, with no Status line.

<!-- standing -->
`;
    const [entry] = parseEntries(noStatus);
    expect(entry.standing).toBe(false);
  });
});

describe('M6.E4 S2 — the mechanism stays single (FR2.2)', () => {
  it('AC2.2e — /sig:add gained no --standing flag', () => {
    // D-M6E4-5: one entry in the whole corpus does not justify a capture flag,
    // and a flag would make "standing" reachable as a way to dodge the drain
    // count — manufacturing the disposal workaround this slice exists to remove.
    const addMd = readFileSync(join(repoRoot, 'plugin/commands/add.md'), 'utf8');
    expect(addMd).not.toMatch(/--standing/);
  });
});

describe('M6.E4 S2 — the mechanism is REACHED, not merely exported', () => {
  // The unreached-mechanism class (analysis/UNREACHED-MECHANISM-ANALYSIS.md):
  // bugs-tally.js derived the count correctly for releases and its only caller
  // was a test, so BUGS.md's published tally went stale anyway. An exported
  // listStandingEntries that no command calls would ship the identical defect.
  // Mirrors tests/trigger-watchlist.test.js:109.
  it('commands/plan.md Step 1b calls listStandingEntries', () => {
    const planMd = readFileSync(join(repoRoot, 'plugin/commands/plan.md'), 'utf8');
    expect(planMd).toMatch(/listStandingEntries/);
  });

  it('commands/plan.md tells the reader no disposition verb applies', () => {
    const planMd = readFileSync(join(repoRoot, 'plugin/commands/plan.md'), 'utf8');
    expect(planMd).toMatch(/standing/i);
    expect(planMd).toMatch(/never promote, merge, or delete/);
  });
});

describe('M6.E4 S2 — the recovery path agrees with the normal path (REVIEW fix)', () => {
  // Found at REVIEW, not by a test. listDrainCandidates gained the standing
  // exclusion; listDrainCandidatesWithRecovery kept a bare `!e.dispositioned`.
  // So a standing entry BELOW a dangling fence was recovered straight back into
  // the live candidate set — S2's bug reintroduced by the one code path that
  // exists to handle malformed inboxes. Two filters that must agree, one updated.
  const STANDING_BELOW_FENCE = `# Inbox

## An entry with an unclosed fence

**Status:** Logged 2026-08-01.

\`\`\`js
never closed

## A standing note that the fence swallowed
<!-- standing -->

**Status:** Added 2026-07-04. Never promote, merge, or delete.
`;

  it('the dangling fence is detected and the entry is recovered', () => {
    const r = listDrainCandidatesWithRecovery(STANDING_BELOW_FENCE);
    expect(r.danglingFence).toBe(true);
  });

  it('a recovered STANDING entry does not re-enter the live candidate set', () => {
    const r = listDrainCandidatesWithRecovery(STANDING_BELOW_FENCE);
    expect(r.candidates.some((e) => /standing note/i.test(e.heading))).toBe(false);
  });

  it('a recovered NON-standing entry still surfaces — the fix is not a blanket drop', () => {
    const ordinary = `# Inbox

## An entry with an unclosed fence

**Status:** Logged 2026-08-01.

\`\`\`js
never closed

## An ordinary swallowed idea

**Status:** Logged 2026-08-02.
`;
    const r = listDrainCandidatesWithRecovery(ordinary);
    expect(r.candidates.some((e) => /ordinary swallowed/i.test(e.heading))).toBe(true);
  });
});

describe('M6.E4 S2 — robustness (NFR2)', () => {
  it('NFR2 — malformed markdown does not throw', () => {
    const malformed = `# Inbox

## Entry with a dangling fence
<!-- standing -->

\`\`\`js
never closed
`;
    expect(() => parseEntries(malformed)).not.toThrow();
    expect(() => listStandingEntries(malformed)).not.toThrow();
  });

  it('NFR2 — empty and non-string input do not throw', () => {
    expect(listStandingEntries('')).toEqual([]);
    expect(listStandingEntries(null)).toEqual([]);
  });
});
