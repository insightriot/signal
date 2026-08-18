// Published-fact checks — a document states something about the project and
// nothing derives it from the artifact it summarises (`M6.E2`).
//
// SEPARATE HOME, DELIBERATELY (`D-M6E2-3`). These do not go in
// `state-drift.js`: that module is named for STATE and its eight checks are
// about STATE. They reuse its `defineCheck` harness — which is general, taking
// `applicability(ctx)` and `run(ctx)` over a ctx carrying `baseDir` — but they
// export their own registry, and the call sites compose the two.
//
// This module is also the first caller of `bugs-tally.js` that is not a test.
// That module has derived-then-compared correctly since `B77` and has **never
// run outside vitest**, so it fired only in this repository and only after a
// write had already gone in. That is the defect, not a detail.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineCheck, HEAL, APPLICABILITY, STATE_DRIFT_CHECKS } from './state-drift.js';
import { compareBugTally, readPublishedTally, formatTallySegment, walkBugEntries } from './bugs-tally.js';
import { retroStatusFromContent, RETRO_STATUS } from './retro-index.js';

/**
 * Measured reach per check — `evaluable` of `total` projects, from
 * `tools/measure-published-facts.js` (see `M6.E2-CORPUS-MEASUREMENT.md`).
 *
 * ⚠ **What is derived and what is not.** Every *rendering* of a reach figure
 * comes from here through `describeReach`, so the number cannot disagree with
 * itself across the codebase. The figure itself is **recorded from a
 * measurement run and is not re-measured in CI** — measuring requires the
 * corpus, which CI does not have. Stated rather than implied: this makes the
 * number single-homed, not self-verifying.
 */
export const REACH = Object.freeze({
  'published-bug-tally': Object.freeze({ evaluable: 1, total: 12, measured: '2026-08-18' }),
  'bug-status-vs-changelog': Object.freeze({ evaluable: 1, total: 12, measured: '2026-08-18' }),
  'changelog-unreleased-dated': Object.freeze({ evaluable: 5, total: 12, measured: '2026-08-18' }),
  'milestone-status-vs-state': Object.freeze({ evaluable: 1, total: 12, measured: '2026-08-18' }),
  'facts-attribution': Object.freeze({ evaluable: 1, total: 12, measured: '2026-08-18' }),
});

/**
 * The one place a reach figure becomes prose. Anything that wants to say how
 * far a check reaches calls this; nothing types the numbers.
 *
 * @param {{evaluable:number, total:number}} reach
 * @returns {string}
 */
export function describeReach({ evaluable, total }) {
  return `evaluates ${evaluable} of ${total} measured projects`;
}

function bugsPath(baseDir) {
  return join(baseDir, '.planning', 'BUGS.md');
}

/**
 * `BUGS.md` publishes a tally of its own contents. Nothing re-derives it, so a
 * capture or a status edit silently falsifies the file's own summary.
 *
 * THREE OUTCOMES, AND THE MIDDLE ONE IS THE POINT. A `BUGS.md` that publishes
 * no tally is **not** "not applicable" — it is a file that could carry a claim
 * and does not, which is an unknown. `compareBugTally` already refuses to pass
 * it (`reason: 'no-tally'`) on the stated grounds that silence must not read as
 * clean; mapping that to `NOT_APPLICABLE` would undo a correct refusal. It is
 * also the only non-Signal case this check can see: all three non-Signal corpus
 * projects with a `BUGS.md` publish no tally.
 *
 * Heal category 3. The derived value is authoritative and the check prints it,
 * but nothing here writes — sweep runs nothing itself (`D-M5E16-1`), and
 * declaring a heal nobody performs is the failure that requirement exists to
 * stop.
 */
export const checkPublishedBugTally = defineCheck({
  id: 'published-bug-tally',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    'BUGS.md publishes a tally of its own entries; this compares the two. ' +
    `Reach: ${describeReach(REACH['published-bug-tally'])} — Signal's own tree is the ` +
    'only one of them, so a clean result here says nothing about anyone else.',

  applicability: (ctx) => {
    const p = bugsPath(ctx.baseDir);
    if (!existsSync(p)) {
      return { status: APPLICABILITY.NA, reason: 'this project has no .planning/BUGS.md' };
    }
    let content;
    try {
      content = readFileSync(p, 'utf8');
    } catch (err) {
      return { status: APPLICABILITY.BLIND, reason: `could not read BUGS.md — ${err.message}` };
    }
    if (!readPublishedTally(content)) {
      return {
        status: APPLICABILITY.BLIND,
        reason:
          'BUGS.md publishes no tally, so there is nothing to compare against its contents. ' +
          'This is an unknown, not an exemption.',
      };
    }
    return APPLICABILITY.EVAL;
  },

  run: (ctx) => {
    const p = bugsPath(ctx.baseDir);
    const result = compareBugTally(readFileSync(p, 'utf8'));
    if (result.ok) return [];

    const cells = result.mismatches
      .map((m) => `${m.cell}: published ${m.published ?? '—'}, file holds ${m.derived}`)
      .join('; ');

    return [
      {
        file: p,
        message:
          `BUGS.md's tally disagrees with its own contents — ${cells}. ` +
          `Re-derive it, do not increment. Correct segment: ${formatTallySegment(result.derived)}`,
      },
    ];
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// The four remaining checks (`M6.E2` S3).
// ─────────────────────────────────────────────────────────────────────────────

function readIf(p) {
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

const RELEASED_HEADING = /^##\s*\[(?!Unreleased\b)([^\]]+)\]/;
const UNRELEASED_HEADING = /^##\s*\[Unreleased\]\s*(.*)$/i;

/**
 * A bug row still reading `confirmed` while a released CHANGELOG entry's
 * HEADLINE names the id.
 *
 * ⚠ SUSPICION, NOT VERDICT, AND ITS PRECISION IS PUBLISHED. A CHANGELOG naming
 * a bug id is not proof the bug was fixed — an entry can cite a bug it merely
 * relates to, or one it filed. Three rules were **measured against this
 * repository** rather than argued about, over 28 `confirmed` rows:
 *
 *   any mention in a released section        13 flags,  1 real
 *   mention + fix-language on the same line   3 flags,  1 real
 *   mention in the entry's HEADLINE           2 flags,  1 real   ← shipped
 *
 * The fix-language rule fails on sentences like *"`B81` remains open (filed not
 * fixed)"* — the word is there and the meaning is the opposite. **That is this
 * Epic's own out-of-scope boundary showing up inside it** (`D-M6E2-7`):
 * everything here compares tokens, and no token rule decides whether prose
 * asserts a fix. The headline rule is the best of three, not a good one, and
 * the finding says so in its own words rather than in a document nobody opens.
 *
 * Heal category 3 — a person decides. Live instance at the time of writing:
 * `B102` reads `confirmed` and shipped fixed in `v0.1.27`; `B38` carried the
 * identical drift for a day.
 */
export const checkBugStatusVsChangelog = defineCheck({
  id: 'bug-status-vs-changelog',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    "A BUGS.md row reading `confirmed` while a released CHANGELOG entry's headline names the id. " +
    `Reach: ${describeReach(REACH['bug-status-vs-changelog'])}. ` +
    'Weak signal by construction — measured on this repository it flagged 2 rows, of which 1 was real.',

  applicability: (ctx) => {
    if (!existsSync(bugsPath(ctx.baseDir))) {
      return { status: APPLICABILITY.NA, reason: 'this project has no .planning/BUGS.md' };
    }
    if (!existsSync(join(ctx.baseDir, 'CHANGELOG.md'))) {
      return {
        status: APPLICABILITY.BLIND,
        reason: 'there is no CHANGELOG.md to derive shipped-ness from, so a status cell cannot be checked',
      };
    }
    return APPLICABILITY.EVAL;
  },

  run: (ctx) => {
    const bugs = readIf(bugsPath(ctx.baseDir));
    const changelog = readIf(join(ctx.baseDir, 'CHANGELOG.md'));
    if (bugs === null || changelog === null) return [];

    // Only a released entry's HEADLINE counts — its heading plus the first two
    // non-empty lines under it, which is where an entry says what it IS rather
    // than what it discusses. A mention under [Unreleased] is work in progress,
    // which is exactly what `confirmed` should say.
    const lines = changelog.split('\n');
    const headlines = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^##\s*\[/.test(lines[i]) || !RELEASED_HEADING.test(lines[i])) continue;
      const lead = [lines[i]];
      let taken = 0;
      for (let j = i + 1; j < lines.length && taken < 2; j++) {
        if (/^##\s/.test(lines[j])) break;
        if (lines[j].trim() === '') continue;
        lead.push(lines[j]);
        taken++;
      }
      headlines.push(lead.join(' '));
    }
    const headlineText = headlines.join('\n');

    const confirmed = walkBugEntries(bugs).filter((e) => e.kind === 'row' && e.status === 'confirmed');
    return confirmed
      .filter((e) => new RegExp(`\\b${e.id}\\b`).test(headlineText))
      .map((e) => ({
        file: bugsPath(ctx.baseDir),
        message:
          `${e.id} reads \`confirmed\`, but a released CHANGELOG entry's headline names it — ` +
          'it may already be fixed. Worth checking, and no more than that: this rule matches ' +
          'tokens, not meaning, and on this repository it flagged 2 rows of which 1 was real. ' +
          'A headline can name a bug it filed or merely relates to.',
      }));
  },
});

/**
 * A `## [Unreleased]` heading carrying a date. Unreleased content has no
 * release date, so the heading contradicts itself — and doc-hygiene's
 * version-consistency guard **deliberately skips** `[Unreleased]`, which is why
 * this needs its own check rather than a line in that one.
 *
 * The one check here with reach beyond this repository: 4 of 11 non-Signal
 * corpus projects carry an `[Unreleased]` heading.
 */
export const checkChangelogUnreleasedDated = defineCheck({
  id: 'changelog-unreleased-dated',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    'A CHANGELOG [Unreleased] heading carrying a release date. ' +
    `Reach: ${describeReach(REACH['changelog-unreleased-dated'])} — the only one of these ` +
    'checks that reaches projects other than Signal.',

  applicability: (ctx) =>
    existsSync(join(ctx.baseDir, 'CHANGELOG.md'))
      ? APPLICABILITY.EVAL
      : { status: APPLICABILITY.NA, reason: 'this project has no CHANGELOG.md' },

  run: (ctx) => {
    const p = join(ctx.baseDir, 'CHANGELOG.md');
    const content = readIf(p);
    if (content === null) return [];
    const out = [];
    content.split('\n').forEach((line, i) => {
      const m = line.match(UNRELEASED_HEADING);
      if (!m) return;
      const date = (m[1] || '').match(/\d{4}-\d{2}-\d{2}/);
      if (!date) return;
      out.push({
        file: p,
        message:
          `line ${i + 1}: the [Unreleased] heading carries the date ${date[0]}. ` +
          'Unreleased content has no release date — either it shipped and the heading ' +
          'should name its version, or the date should go. The version-consistency ' +
          'guard skips [Unreleased] by design, so nothing else looks at this.',
      });
    });
    return out;
  },
});

const EPIC_ROW = /^\|\s*`?(M\d+(?:\.\d+)*\.E\d+)`?\s*\|\s*([^|]*)\|/;

/**
 * A milestone file's Epic-status row against `STATE.md` and the retrospective
 * on disk. Two contradictions are decidable without a person's judgement:
 * a row saying *in flight* for an Epic whose retrospective is complete, and a
 * row saying *shipped* for the Epic STATE names as current.
 *
 * A stub retrospective is NOT closure (`B64`), so completeness is read through
 * `retroStatusFromContent` rather than by the file existing.
 */
export const checkMilestoneStatusVsState = defineCheck({
  id: 'milestone-status-vs-state',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    "A milestone file's Epic-status row against STATE.md and the retrospective on disk. " +
    `Reach: ${describeReach(REACH['milestone-status-vs-state'])}.`,

  applicability: (ctx) => {
    const rows = (ctx.files || []).filter((f) => /^MILESTONE-.*\.md$/.test(f));
    for (const f of rows) {
      const c = readIf(join(ctx.planningDir, f));
      if (c && c.split('\n').some((l) => EPIC_ROW.test(l))) return APPLICABILITY.EVAL;
    }
    return {
      status: APPLICABILITY.NA,
      reason: 'no milestone file in this project carries Epic-status rows',
    };
  },

  run: (ctx) => {
    const current = ctx.state?.current_epic ?? null;
    const out = [];
    for (const f of (ctx.files || []).filter((x) => /^MILESTONE-.*\.md$/.test(x))) {
      const p = join(ctx.planningDir, f);
      const content = readIf(p);
      if (content === null) continue;

      content.split('\n').forEach((line) => {
        const m = line.match(EPIC_ROW);
        if (!m) return;
        const [, epic, statusCell] = m;
        const cell = statusCell.toLowerCase();
        const retro = readIf(join(ctx.planningDir, `${epic}-RETROSPECTIVE.md`));
        const complete = retro !== null && retroStatusFromContent(retro) === RETRO_STATUS.COMPLETE;

        if (/in[- ]flight/.test(cell) && complete) {
          out.push({
            file: p,
            message:
              `${epic}'s row reads "in flight", but ${epic}-RETROSPECTIVE.md is complete. ` +
              'The Epic closed and the table did not.',
          });
        }
        // `current_epic` STAYS at the Epic just shipped until the next one
        // opens, so "shipped row + current Epic" is the NORMAL post-ship state
        // whenever a complete retrospective exists. Without this clause the
        // check fires on every Epic close forever — found by running it against
        // this Epic's own SHIP, one step before it would have shipped.
        if (/shipped|closed|done/.test(cell) && current && epic === current && !complete) {
          out.push({
            file: p,
            message:
              `${epic}'s row reads as finished, but STATE.md names it as the current Epic ` +
              'and no complete retrospective is on disk. One of the two is wrong.',
          });
        }
      });
    }
    return out;
  },
});

const FACTS_REL = /most recently\s+\**v?(\d+\.\d+\.\d+)/i;

/**
 * `facts.md` publishes figures — a test count above all — and names the release
 * they were set at. When that release is not the installed version, the figures
 * have not been re-derived since.
 *
 * ⚠ WHAT THIS CANNOT ESTABLISH, stated in the finding itself: it does not tell
 * you whether the published number is right. Deriving the true test count means
 * running the suite, which a read-only check cannot do. It detects only that a
 * figure is attributed to a release that is not the current one — which is
 * exactly `B56`'s structural gap (*nothing checks between releases*), and not
 * more than that.
 */
export const checkFactsAttribution = defineCheck({
  id: 'facts-attribution',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    'facts.md figures attributed to a release that is not the installed one. ' +
    `Reach: ${describeReach(REACH['facts-attribution'])}.`,

  applicability: (ctx) => {
    const facts = readIf(join(ctx.baseDir, 'plugin', 'references', 'facts.md'));
    if (facts === null) {
      return { status: APPLICABILITY.NA, reason: 'this project has no plugin/references/facts.md' };
    }
    if (!FACTS_REL.test(facts)) {
      return {
        status: APPLICABILITY.BLIND,
        reason: 'facts.md names no release for its figures, so there is nothing to compare',
      };
    }
    const pkg = readIf(join(ctx.baseDir, 'plugin', '.claude-plugin', 'plugin.json'));
    if (pkg === null) {
      return { status: APPLICABILITY.BLIND, reason: 'plugin.json is unreadable, so the current version is unknown' };
    }
    return APPLICABILITY.EVAL;
  },

  run: (ctx) => {
    const factsPath = join(ctx.baseDir, 'plugin', 'references', 'facts.md');
    const facts = readIf(factsPath);
    const pkgRaw = readIf(join(ctx.baseDir, 'plugin', '.claude-plugin', 'plugin.json'));
    if (facts === null || pkgRaw === null) return [];

    let current;
    try {
      current = JSON.parse(pkgRaw).version;
    } catch {
      return [];
    }
    const named = facts.match(FACTS_REL)?.[1];
    if (!named || named === current) return [];

    return [
      {
        file: factsPath,
        message:
          `facts.md attributes its figures to v${named}, but the plugin is at v${current}. ` +
          'They have not been re-derived since. This cannot tell you whether the published ' +
          'numbers are wrong — deriving the test count means running the suite — only that ' +
          'nothing has checked them across the releases in between.',
      },
    ];
  },
});

/** The registry. Composed with `STATE_DRIFT_CHECKS` at the call sites. */
export const PUBLISHED_FACT_CHECKS = Object.freeze([
  checkPublishedBugTally,
  checkBugStatusVsChangelog,
  checkChangelogUnreleasedDated,
  checkMilestoneStatusVsState,
  checkFactsAttribution,
]);

/**
 * Everything `runDriftChecks` should run, composed.
 *
 * It lives HERE rather than in `state-drift.js` because the dependency runs one
 * way: this module already imports that one, and the reverse would be a cycle.
 * The call sites (`/sig:sweep`, `/sig:resume`) import this instead of either
 * registry, so adding a published-fact check reaches both commands without
 * touching a call site again.
 */
export const ALL_DRIFT_CHECKS = Object.freeze([...STATE_DRIFT_CHECKS, ...PUBLISHED_FACT_CHECKS]);
