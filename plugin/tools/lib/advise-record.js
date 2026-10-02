// Recording the user's pick — `M6.E12` S3 (`D-M6E12-2`, `D-M6E12-8`, AC4.2).
//
// `/sig:advise` proposes; the user picks. This appends the pick to the dated
// advisory the user picked FROM, and writes nothing else. It is the only code
// that writes `## Picked by you`, and it runs only after a person answered.
//
// ⚠ A RECORDED PICK IS NEVER OVERWRITTEN. A second pick on the same file is
// refused, and a same-day re-run of the advisory writes `-N` instead of
// replacing a picked file (`nextArtifactName`). The record of what was picked,
// from what, is the outcome oracle's evidence (`D-M6E12-12`): if it could be
// silently replaced, two "Other"s in three runs could never be counted.

import { existsSync, lstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { ARTIFACT_PREFIX, PICK_HEADING, PICK_RE, isValidStamp, quoteSafe } from './advise.js';

const PLANNING_DIR = '.planning';
const ADVISORY_RE = new RegExp(`^${PLANNING_DIR}/${ARTIFACT_PREFIX}\\d{4}-\\d{2}-\\d{2}(?:-\\d+)?\\.md$`);
const PRIORITY_HEADING_RE = /^### (\d+)\. (.+)$/;

/** The numbered priorities in an advisory, in order: `[{n, title}]`. */
export function readPriorityTitles(content) {
  const out = [];
  let inPriorities = false;
  for (const line of content.split('\n')) {
    if (/^## /.test(line)) inPriorities = /^## Priorities\b/.test(line);
    else if (inPriorities) {
      const m = line.match(PRIORITY_HEADING_RE);
      if (m) out.push({ n: Number(m[1]), title: m[2] });
    }
  }
  return out;
}

/**
 * Append the user's pick to the advisory.
 *
 * @param {string} baseDir
 * @param {string} artifactRel — `.planning/BACKLOG-REVIEW-YYYY-MM-DD[-N].md`
 * @param {{pick: number|'other', words?: string, by?: string, at?: string, title?: string}} choice
 *   `pick` is a priority number, or `'other'` with the user's own `words`. `title`,
 *   when given, must match that priority's title in the file — so a re-run while
 *   the user was being asked cannot attach their answer to a different list.
 * @returns {Promise<{status: 'recorded'|'refused', path: string, reason: string|null, title?: string}>}
 */
export async function recordChoice(baseDir, artifactRel, { pick, words, by = 'the user', at, title: expectedTitle } = {}) {
  const refuse = (reason) => ({ status: 'refused', path: artifactRel, reason });
  if (typeof artifactRel !== 'string' || !ADVISORY_RE.test(artifactRel)) {
    return refuse(`${JSON.stringify(artifactRel)} is not a /sig:advise advisory (${PLANNING_DIR}/${ARTIFACT_PREFIX}YYYY-MM-DD[-N].md)`);
  }
  const abs = join(baseDir, artifactRel);
  if (!existsSync(abs)) return refuse(`${artifactRel} does not exist`);
  // A symlinked advisory is refused outright. `assertRealInsidePlanning` confines
  // the DIRECTORY; a link at the file itself could point anywhere, and the run
  // never writes one, so there is no legitimate case to support.
  if (lstatSync(abs).isSymbolicLink()) return refuse(`${artifactRel} is a symbolic link — the advisory is written as a regular file, so this is not one`);
  assertRealInsidePlanning(baseDir, abs, 'recordChoice');

  // Every field written is validated here, not trusted: this append happens after
  // the run's citation gate, and nothing checks the file again (REVIEW pass 1: a
  // newline in `at` forged a Priorities heading).
  if (at !== undefined && !isValidStamp(at)) return refuse(`at must be a real YYYY-MM-DD date, got ${JSON.stringify(at)}`);
  const content = await readFile(abs, 'utf-8');
  if (PICK_RE.test(content)) {
    return refuse(`${artifactRel} already records a pick — run /sig:advise again to pick from a fresh advisory`);
  }
  const titles = readPriorityTitles(content);
  const date = at ?? new Date().toISOString().slice(0, 10);
  const who = quoteSafe(String(by));

  let line;
  let title;
  if (pick === 'other') {
    const said = quoteSafe(String(words ?? '').trim());
    if (!said) return refuse('a pick of "other" needs the user\'s own words');
    title = said;
    line = `**Something else**, in your words: *"${said}"* — picked on ${date} by ${who}.`;
  } else {
    const p = titles.find((t) => t.n === pick);
    if (!Number.isInteger(pick) || !p) {
      return refuse(`pick ${JSON.stringify(pick)} is not one of the ${titles.length} priorities in ${artifactRel}`);
    }
    if (expectedTitle !== undefined && expectedTitle !== p.title) {
      return refuse(`priority ${p.n} in ${artifactRel} is ${JSON.stringify(p.title)}, not ${JSON.stringify(expectedTitle)} — the advisory changed after the question was asked`);
    }
    title = p.title;
    line = `**Priority ${p.n} — ${p.title}**, picked on ${date} by ${who}.`;
  }

  const appended = `${content.replace(/\n*$/, '\n')}\n## ${PICK_HEADING}\n\n${line}\n`;
  await atomicWrite(abs, appended);
  return { status: 'recorded', path: artifactRel, reason: null, title };
}
