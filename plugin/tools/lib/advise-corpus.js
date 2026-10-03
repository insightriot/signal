// What `/sig:advise` reads, and what it could not read — `M6.E7` S2.
//
// FIVE sources since `B118` (four after `M6.E8` dropped retrospectives; `other
// branches` joined). The second
// half of that sentence is the load-bearing one. This returns
// `{sources, cannotCheck, checked}` — the shape `collectPreflight` already uses —
// because the failure this module exists to avoid is an advisory that reads three
// sources, silently misses the fourth, and presents the result as a complete
// picture. An empty result is a claim ("nothing here"); a null plus a
// reason is the truth ("I could not look"). `closure.js` puts it best in its own
// source: *"an empty map says 'nothing is closed', which is a result; a null says
// 'I could not look', which is not."*
//
// ⚠ ABSENT IS ALSO CANNOT-CHECK, and that is a decision. A missing `BUGS.md`
// could be reported as "no bugs" — but for an advisor that is a claim about the
// project, made from a file that was never opened. So absence and unreadability
// both land in `cannotCheck`, with DIFFERENT reasons, so a reader can tell a
// greenfield project from a broken one.
//
// ⚠ THE BACKLOG IS READ AT `maxDepth: 4`, and that is the single most likely way
// this command ships something confidently blind. The default is 3; Signal's own
// promoted rows sit at `####`. A default-depth read looks like a working command
// and cannot see them. `backlog.js` says so in its own source — *"a READER that
// must not mistake 'nested deeper' for 'no work' passes maxDepth: 4"* — and this
// is that reader. The cost is real and is asserted in `t2.7`: widening also moves
// a row that grew children into the container fold, so a row visible at depth 3
// can disappear at depth 4.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { parseBacklogRows } from './backlog.js';
import { walkBugEntries } from './bugs-tally.js';
import { resolveClosures } from './closure.js';
import { parseEpicStatusRows } from './milestones.js';
import { readRegularFile, regularFileRefusal } from './path-confine.js';
import { relative } from 'node:path';
import { findWorkOnOtherBranches } from './branch-work.js';
import { readState } from './state.js';

const PLANNING_DIR = '.planning';

/**
 * The sources this command claims to read, enumerated rather than implied.
 *
 * `t2.6` tests "each source unreadable in turn", and an unenumerated list makes
 * that test only as complete as whatever the executor remembered. Frozen so the
 * test compares against a value rather than a recollection.
 */
export const ADVISOR_SOURCES = Object.freeze([
  'BACKLOG.md',
  'BUGS.md',
  'STATE/closure',
  'milestone rows',
  'other branches',
]);
// ⚠ `other branches` is the fifth (`B118`). Every other source is read from the
// checked-out branch, so an Epic open on an unmerged branch was invisible and an
// advisory recommended new work ahead of it. It is not ranked — it is listed above
// the ranking, because an open Epic is a different kind of answer from a row.
// ⚠ FOUR, NOT FIVE (`M6.E8` FR5). `retrospectives` was the fifth: 32 files
// enumerated and parsed for section headings on every run, consulted by no
// ranking input and cited by nothing. A source read and never used is a
// completeness claim written from the shape of the work — the artifact's
// "Read: …" line implied retrospectives were weighed, and they were not. Deleted
// rather than kept "for a future input": the `M6.E7` REVIEW fix for that
// over-claim was a sentence; the fix for its cause is not reading the files.

const MILESTONE_FILE_RE = /^MILESTONE-(\d+(?:\.\d+)?)\.md$/;

/** The 4th cell of a BUGS.md row — the headline a reader actually recognises. */
function bugHeadline(rowLine) {
  const cells = rowLine.split('|');
  const what = cells[4] ?? '';
  return what.trim();
}

/**
 * Read every source the advisor reasons over.
 *
 * Each entry in `sources` is either the source's content or **null**, and every
 * null has a matching `{source, reason}` in `cannotCheck`. `checked` names only
 * the sources that were actually read, so `checked.length + cannotCheck.length`
 * is always `ADVISOR_SOURCES.length`.
 *
 * @param {string} baseDir — project root
 * @returns {Promise<{sources: object, cannotCheck: Array<{source:string, reason:string}>, checked: string[]}>}
 */
export async function readCorpus(baseDir) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const sources = { backlog: null, bugs: null, closure: null, milestones: null, otherBranches: null };
  const cannotCheck = [];
  const checked = [];

  const fail = (source, reason) => cannotCheck.push({ source, reason });

  // ── 1. BACKLOG.md — the live queue, read at depth 4 (see the header note).
  const backlogRel = `${PLANNING_DIR}/BACKLOG.md`;
  const backlogPath = join(planningDir, 'BACKLOG.md');
  if (!existsSync(backlogPath)) {
    fail('BACKLOG.md', `${backlogRel} is not present — this project keeps no queue here`);
  } else {
    try {
      // A regular file, not a link (REVIEW passes 1 and 2): a linked BACKLOG.md must not
      // pull outside text in — nor `.env`, which is inside the project root.
      const content = readRegularFile(baseDir, backlogRel);
      const all = parseBacklogRows(content, { maxDepth: 4 });
      const ordered = [...all].sort((a, b) => a.line - b.line);
      const live = ordered.filter((r) => !r.inDetails && !r.discharged);
      const lines = content.split(/\r?\n/);
      // Bodies come from CONSECUTIVE `line` values — no second heading walk.
      //
      // ⚠ THE BOUNDARY WALKS `ordered` — EVERY row — NOT `live`, and the
      // difference is a defect this shipped with. Walking `live` skips exactly
      // the rows the boundary must stop at, so a live row ABSORBED the heading
      // and body of any discharged or `<details>`-folded row between it and the
      // next surviving live row. Measured on this repo's own BACKLOG.md before
      // the fix: 22 of 51 live rows absorbed another row's text, one of them
      // 2443 characters including a struck row's entire entry.
      //
      // Not cosmetic, because `rankRows` SCANS `row.body` with `BLOCKED_RE`,
      // `TRIGGER_MET_RE` and the filed-date regex. Absorbed text can demote a
      // live row as blocked, promote it as trigger-met, or backdate it — and
      // then render a reason citing the wrong row. Found by the PR reviewer,
      // who also found it reproducing inside this module's own test fixture.
      const indexOfRow = new Map(ordered.map((r, i) => [r, i]));
      const rows = live.map((r) => {
        const next = ordered[indexOfRow.get(r) + 1];
        const end = next ? next.line - 1 : lines.length;
        return { ...r, path: backlogRel, body: lines.slice(r.line, end).join('\n').trim() };
      });
      // `B121`: section headings with zero rows parsed from them is a file this
      // reader could not read, not an empty queue — otherwise the advisory says
      // "nothing to do". A title and prose alone is a queue that is empty.
      if (all.length === 0 && /^#{2,6}[ \t]/m.test(content)) {
        fail('BACKLOG.md', `${backlogRel} has headings but no rows this reader recognises (rows sit at ## to ####)`);
      } else {
        sources.backlog = { path: backlogRel, rows, totalRows: all.length };
        checked.push('BACKLOG.md');
      }
    } catch (err) {
      fail('BACKLOG.md', `${backlogRel} could not be read — ${err.message}`);
    }
  }

  // ── 2. BUGS.md — open defects, with the line each row sits on.
  const bugsRel = `${PLANNING_DIR}/BUGS.md`;
  const bugsPath = join(planningDir, 'BUGS.md');
  if (!existsSync(bugsPath)) {
    fail('BUGS.md', `${bugsRel} is not present — this project files no bugs here`);
  } else {
    try {
      const content = readRegularFile(baseDir, bugsRel);
      const lines = content.split('\n');
      const entries = walkBugEntries(content)
        .filter((e) => e.kind === 'row')
        .map((e) => ({
          id: e.id,
          status: e.status,
          cell: e.cell,
          line: e.line,
          path: bugsRel,
          headline: bugHeadline(lines[e.line - 1] ?? ''),
        }));
      sources.bugs = { path: bugsRel, entries };
      checked.push('BUGS.md');
    } catch (err) {
      fail('BUGS.md', `${bugsRel} could not be read — ${err.message}`);
    }
  }

  // ── 3. (Retrospectives lived here until `M6.E8` FR5. See `ADVISOR_SOURCES`.)

// ── 4. STATE / closure — what is open, via `resolveClosures` and never raw
//      `readState`, which THROWS on a missing or unknown `schema_version`.
//      Uncaught, that is a crash where FR7 promises a `cannot-check` line.
// STATE.md and every unit file are read only as regular files (REVIEW pass 2:
// a linked STATE.md put outside text into the committed advisory, on `main` too).
const stateRefusal = regularFileRefusal(baseDir, `${PLANNING_DIR}/STATE.md`);
if (stateRefusal) {
  fail('STATE/closure', stateRefusal);
} else try {
  const closure = await resolveClosures(baseDir, {
    readFileFn: async (abs) => readRegularFile(baseDir, relative(baseDir, abs)),
  });
  if (!closure.stateReadable) {
    fail('STATE/closure', closure.reason ?? 'STATE.md could not be read');
  } else {
    sources.closure = closure;
    checked.push('STATE/closure');
  }
} catch (err) {
  fail('STATE/closure', `closure could not be resolved — ${err.message}`);
}

// ── 5. Milestone Epic-status rows, through the one shared reader (t2.5).
//
// ⚠ KEPT WITH A REASON, NOT BY INERTIA (`M6.E8` FR6 / `D-M6E8-5`). After FR5
// deleted the retrospective read, this is the one source `readCorpus` reads
// that no ranking input reads — and "read, unused" is the completeness claim
// the artifact's *Consulted* line exists to stop. It stays because:
//   - it is cheap: one `readdir` and a parse of two small files, against the
//     32-file walk the retrospective read cost; and
//   - it is the natural home for a future "this row is already sequenced into
//     an open Epic" input — an Epic-status row is the only place that fact
//     lives, and dropping the read would mean re-learning this branch's
//     failure modes (an unreadable file blinds the SOURCE) when it is built.
// Today **no ranking input reads it**, and the rendered artifact says so in
// the same words rather than letting "Read: … milestone rows" imply otherwise.
try {
  const files = (await readdir(planningDir)).filter((f) => MILESTONE_FILE_RE.test(f)).sort();
  const read = [];
  const unreadable = [];
  for (const file of files) {
    try {
      const content = readRegularFile(baseDir, `${PLANNING_DIR}/${file}`);
      const milestone = file.match(MILESTONE_FILE_RE)[1];
      read.push({
        file,
        path: `${PLANNING_DIR}/${file}`,
        rows: parseEpicStatusRows(content, { milestone }),
      });
    } catch (err) {
      unreadable.push(`${file} (${err.message})`);
    }
  }
  // A milestone file that could not be read blinds the SOURCE, rather than
  // being dropped so the rest looks complete. That is the whole rule here.
  if (unreadable.length > 0) {
    fail('milestone rows', `milestone file(s) could not be read — ${unreadable.join('; ')}`);
  } else {
    sources.milestones = { files: read };
    checked.push('milestone rows');
  }
} catch (err) {
  fail('milestone rows', `${PLANNING_DIR}/ could not be listed — ${err.message}`);
}

  // ── 6. Epics open on other branches (`B118`). `localEpic` is read here rather
  //      than taken from `closure`, which does not expose it; a throwing read only
  //      loses the "same as the local Epic" filter, never the scan.
  try {
    let localEpic = null;
    try {
      localEpic = (await readState(baseDir))?.current_epic ?? null;
    } catch {
      localEpic = null;
    }
    const found = await findWorkOnOtherBranches(baseDir, { localEpic });
    // Only a scan that read NOTHING is cannot-check. One unparseable branch is
    // named inside the source (`unreadable`) and every other branch's answer
    // stands — discarding them for it would hide open Epics over an unrelated file.
    if (found.failed) {
      fail('other branches', found.cannotCheck.map((c) => c.reason).join('; '));
    } else {
      sources.otherBranches = { open: found.open, unclassified: found.unclassified, unreadable: found.unreadable };
      checked.push('other branches');
    }
  } catch (err) {
    fail('other branches', `branches could not be scanned — ${err.message}`);
  }

  return { sources, cannotCheck, checked };
}
