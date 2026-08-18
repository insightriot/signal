/**
 * tests/published-facts-s3.test.js — M6.E2 S3.
 *
 * The four remaining published-fact checks. Each declares what it can and
 * cannot derive; `AC3.2` in particular reports a SUSPICION, never a verdict —
 * a CHANGELOG naming a bug id is not proof the bug was fixed, and a
 * false-positive generator gets muted, which is the defect this Epic is about.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  checkBugStatusVsChangelog,
  checkChangelogUnreleasedDated,
  checkMilestoneStatusVsState,
  checkFactsAttribution,
  PUBLISHED_FACT_CHECKS,
  REACH,
} from '../plugin/tools/lib/published-facts.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';

const STATE_MD = (epic) => `---
schema_version: 1
phase: EXECUTE
current_epic: ${epic}
completed_phases: []
---
# State
`;

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'm6e2-s3-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), STATE_MD('M9.E2'));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

const planning = (f, c) => writeFile(join(dir, '.planning', f), c);
const root = (f, c) => writeFile(join(dir, f), c);
const run = (check) => runDriftChecks(dir, [check]);
const only = async (check) => (await run(check)).results[0];

// ─────────────────────────── AC3.2 ───────────────────────────

describe('AC3.2 — a bug row reading `confirmed` while the CHANGELOG says it shipped', () => {
  const BUGS = [
    '| ID | Status | Pri | Summary |',
    '|---|---|---|---|',
    '| B10 | `confirmed` | P1 | still open |',
    '| B11 | `fixed` | P2 | done |',
  ].join('\n');

  it('is NOT_APPLICABLE without a BUGS.md', async () => {
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n');
    expect((await only(checkBugStatusVsChangelog)).status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('is CANNOT_EVALUATE with a BUGS.md but no CHANGELOG to derive from', async () => {
    await planning('BUGS.md', BUGS);
    const r = await only(checkBugStatusVsChangelog);
    expect(r.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(r.reason).toMatch(/CHANGELOG/i);
  });

  it('flags a `confirmed` row named in a RELEASED changelog section', async () => {
    await planning('BUGS.md', BUGS);
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n\nFixed `B10`, at last.\n');
    const r = await only(checkBugStatusVsChangelog);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings[0].message).toContain('B10');
  });

  it('reports a SUSPICION, not a verdict — the wording must not assert the bug is fixed', async () => {
    await planning('BUGS.md', BUGS);
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n\nFixed `B10`.\n');
    const msg = (await only(checkBugStatusVsChangelog)).findings[0].message;
    expect(msg).toMatch(/may|might|check|suspect|worth/i);
    expect(msg).not.toMatch(/\bis fixed\b|\bwas fixed\b/);
  });

  it('does NOT flag a mention that appears only under [Unreleased]', async () => {
    await planning('BUGS.md', BUGS);
    await root('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\nWorking on `B10`.\n');
    expect((await only(checkBugStatusVsChangelog)).status).toBe(STATUS.CLEAN);
  });

  it('does not flag rows that are already `fixed`', async () => {
    await planning('BUGS.md', BUGS);
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n\nShipped `B11`.\n');
    expect((await only(checkBugStatusVsChangelog)).status).toBe(STATUS.CLEAN);
  });
});

// ─────────────────────────── AC3.3 ───────────────────────────

describe('AC3.3 — a DATED [Unreleased] heading is a contradiction', () => {
  it('is NOT_APPLICABLE without a CHANGELOG', async () => {
    expect((await only(checkChangelogUnreleasedDated)).status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('flags `## [Unreleased] — 2026-07-26 — …`', async () => {
    await root('CHANGELOG.md', '# Changelog\n\n## [Unreleased] — 2026-07-26 — The v2 direction audit\n');
    const r = await only(checkChangelogUnreleasedDated);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings[0].message).toMatch(/2026-07-26/);
  });

  it('accepts an undated [Unreleased] heading', async () => {
    await root('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n- a thing\n');
    expect((await only(checkChangelogUnreleasedDated)).status).toBe(STATUS.CLEAN);
  });

  it('accepts a CHANGELOG with no [Unreleased] section at all', async () => {
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n');
    expect((await only(checkChangelogUnreleasedDated)).status).toBe(STATUS.CLEAN);
  });
});

// ─────────────────────────── AC3.4 ───────────────────────────

describe('AC3.4 — a milestone Epic-status row against STATE and the retro on disk', () => {
  const MS = (rows) =>
    ['# Milestone 9', '', '| Epic | Status | Summary |', '|---|---|---|', ...rows].join('\n');

  it('is NOT_APPLICABLE when no milestone file carries Epic-status rows', async () => {
    expect((await only(checkMilestoneStatusVsState)).status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('flags a row reading "in flight" for an Epic whose retrospective is complete', async () => {
    await planning('MILESTONE-9.md', MS(['| `M9.E1` | **in flight** — opened 2026-01-01 | a thing |']));
    await planning('M9.E1-RETROSPECTIVE.md', '# M9.E1 retro\n\n## What happened\n\nIt shipped.\n');
    const r = await only(checkMilestoneStatusVsState);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings[0].message).toContain('M9.E1');
  });

  it('flags a row reading "shipped" for the Epic STATE says is current', async () => {
    await planning('MILESTONE-9.md', MS(['| `M9.E2` | **shipped** — v9.9.9 | the live one |']));
    const r = await only(checkMilestoneStatusVsState);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings[0].message).toContain('M9.E2');
  });

  // Found at this Epic's own SHIP: current_epic stays at the Epic just shipped
  // until the next one opens, so "shipped row + current Epic" is the normal
  // post-ship state once a complete retro exists. Without the retro clause the
  // check fires on every Epic close, forever.
  it('does NOT flag a shipped row for the current Epic when its retrospective is complete', async () => {
    await planning('MILESTONE-9.md', MS(['| `M9.E2` | **shipped** — v9.9.9 | just closed |']));
    await planning('M9.E2-RETROSPECTIVE.md', '# M9.E2 retro\n\n## What happened\n\nIt shipped.\n');
    expect((await only(checkMilestoneStatusVsState)).status).toBe(STATUS.CLEAN);
  });

  it('is CLEAN when the rows agree with STATE and the retros on disk', async () => {
    await planning(
      'MILESTONE-9.md',
      MS([
        '| `M9.E1` | **shipped** — v9.0.0 | done |',
        '| `M9.E2` | **in flight** — opened 2026-01-02 | the live one |',
      ])
    );
    await planning('M9.E1-RETROSPECTIVE.md', '# M9.E1 retro\n\n## What happened\n\nIt shipped.\n');
    expect((await only(checkMilestoneStatusVsState)).status).toBe(STATUS.CLEAN);
  });
});

// ─────────────────────────── AC3.5 ───────────────────────────

describe('AC3.5 — facts.md figures attributed to a release that is not the current one', () => {
  const FACTS = (v) =>
    `# Facts\n\n- **Test count:** 2664\n\nSet at each release by \`tools/cut-release.js\` — most recently **v${v} (2026-01-01)**.\n`;
  const PKG = (v) => JSON.stringify({ name: 'sig', version: v }, null, 2);

  it('is NOT_APPLICABLE without a facts.md', async () => {
    expect((await only(checkFactsAttribution)).status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('is CANNOT_EVALUATE when facts.md names no release', async () => {
    await mkdir(join(dir, 'plugin', 'references'), { recursive: true });
    await root('plugin/references/facts.md', '# Facts\n\n- **Test count:** 2664\n');
    await mkdir(join(dir, 'plugin', '.claude-plugin'), { recursive: true });
    await root('plugin/.claude-plugin/plugin.json', PKG('0.1.28'));
    const r = await only(checkFactsAttribution);
    expect(r.status).toBe(STATUS.CANNOT_EVALUATE);
  });

  it('flags figures attributed to an older release than the one installed', async () => {
    await mkdir(join(dir, 'plugin', 'references'), { recursive: true });
    await mkdir(join(dir, 'plugin', '.claude-plugin'), { recursive: true });
    await root('plugin/references/facts.md', FACTS('0.1.25'));
    await root('plugin/.claude-plugin/plugin.json', PKG('0.1.28'));
    const r = await only(checkFactsAttribution);
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings[0].message).toContain('0.1.25');
    expect(r.findings[0].message).toContain('0.1.28');
  });

  it('says what it CANNOT establish — it does not claim the number itself is wrong', async () => {
    await mkdir(join(dir, 'plugin', 'references'), { recursive: true });
    await mkdir(join(dir, 'plugin', '.claude-plugin'), { recursive: true });
    await root('plugin/references/facts.md', FACTS('0.1.25'));
    await root('plugin/.claude-plugin/plugin.json', PKG('0.1.28'));
    const msg = (await only(checkFactsAttribution)).findings[0].message;
    expect(msg).toMatch(/cannot|does not tell|not whether/i);
  });

  it('is CLEAN when the attribution matches the current version', async () => {
    await mkdir(join(dir, 'plugin', 'references'), { recursive: true });
    await mkdir(join(dir, 'plugin', '.claude-plugin'), { recursive: true });
    await root('plugin/references/facts.md', FACTS('0.1.28'));
    await root('plugin/.claude-plugin/plugin.json', PKG('0.1.28'));
    expect((await only(checkFactsAttribution)).status).toBe(STATUS.CLEAN);
  });
});

describe('registry + reach', () => {
  it('all five checks are registered', () => {
    expect(PUBLISHED_FACT_CHECKS.length).toBe(5);
  });

  it('every registered check declares a measured reach', () => {
    for (const c of PUBLISHED_FACT_CHECKS) {
      expect(REACH[c.id], `no REACH entry for ${c.id}`).toBeDefined();
      expect(REACH[c.id].total).toBeGreaterThan(0);
      expect(c.describe).toContain('Reach:');
    }
  });
});

describe('AC3.2 — the rule is scoped to the headline, and its weakness is published', () => {
  const BUGS = [
    '| ID | Status | Pri | Summary |',
    '|---|---|---|---|',
    '| B10 | `confirmed` | P1 | still open |',
  ].join('\n');

  it('does NOT flag an id buried in the body of a released entry', async () => {
    await planning('BUGS.md', BUGS);
    await root(
      'CHANGELOG.md',
      [
        '# Changelog',
        '',
        '## [0.2.0] — 2026-01-01 — something else entirely',
        '',
        'The headline is about another thing.',
        'A second line, also unrelated.',
        '',
        'Much further down, prose that merely mentions `B10` in passing.',
        '',
      ].join('\n')
    );
    expect((await only(checkBugStatusVsChangelog)).status).toBe(STATUS.CLEAN);
  });

  // ⚠ A KNOWN FALSE POSITIVE, PINNED RATHER THAN HIDDEN.
  //
  // The rule is POSITIONAL: it reads the heading plus the first two non-empty
  // lines. A sentence saying the opposite of "fixed" — the real one is
  // "`B81` remains open (P2, filed not fixed)" — is flagged whenever it lands
  // inside that window. On this repository it lands further down and is missed,
  // which is luck, not design.
  //
  // The obvious repair (require fix-language near the id) is WORSE, measured:
  // it flagged 3 rows to the headline rule's 2, with the same single real hit,
  // because the sentence contains the word and means its negation. No token
  // rule decides this; that is `D-M6E2-7`'s boundary showing up inside the
  // Epic. This test exists so nobody "improves" the rule back into the worse
  // one, and so the limitation is executable rather than a footnote.
  it('IS fooled when a "remains open" line sits inside the headline window — known limit', async () => {
    await planning('BUGS.md', BUGS);
    await root(
      'CHANGELOG.md',
      [
        '# Changelog',
        '',
        '## [0.2.0] — 2026-01-01 — a release about other work',
        '',
        '- **`B10` remains open** (P2, filed not fixed): still needs a decision.',
        '',
      ].join('\n')
    );
    const r = await only(checkBugStatusVsChangelog);
    expect(r.status).toBe(STATUS.FINDINGS);
    // The saving grace is the wording: the finding never asserts it is fixed.
    expect(r.findings[0].message).toMatch(/may already be fixed/);
    expect(r.findings[0].message).toMatch(/tokens, not meaning/);
  });

  it('states its measured precision where a reader sees it, not only in the docs', () => {
    expect(checkBugStatusVsChangelog.describe).toMatch(/2 rows.*1 was real/);
  });

  it('the finding itself admits it matches tokens, not meaning', async () => {
    await planning('BUGS.md', BUGS);
    await root('CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-01-01\n\n**`B10`**, fix lane.\n');
    const msg = (await only(checkBugStatusVsChangelog)).findings[0].message;
    expect(msg).toMatch(/tokens, not meaning/);
  });
});
