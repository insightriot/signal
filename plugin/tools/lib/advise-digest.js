// The big-picture digest `/sig:advise` hands the agent — `M6.E12` S1.
//
// WHY A DIGEST AND NOT A RANKING. The priorities are a judgment about the whole
// project, and the metadata cannot carry it: of 111 open work items in this
// repository on 2026-10-01, 33 carried a priority and 2 a theme (`D-M6E12-4`).
// So code does what code is good at — finding the documents that hold the big
// picture and quoting the relevant parts with a line each — and the agent running
// the command does the reading and proposes. `validatePriorities` (advise.js)
// checks what comes back.
//
// ⚠ THE DIGEST'S REFERENCES ARE PLAIN `path:line`, NEVER `cite()`. The citation
// gate counts the evidence positions in the ARTIFACT, and the artifact's claims
// are the priorities. Digest text is reading material for the agent; if it were
// emitted through `cite()` and pasted anywhere, the gate would count claims the
// advisory never made.
//
// ⚠ ABSENT AND UNREADABLE ARE BOTH CANNOT-CHECK, with different reasons — the
// rule `advise-corpus.js` states for the same reason: a digest that silently
// lacks the milestone file reads as "this project has no milestone", which is a
// claim about the project made from a file nobody opened.
//
// ⚠ IT IS CAPPED. The digest exists to help choose work, and a digest that
// crowds the work out of the agent's context defeats itself. Every cut is said
// out loud in `cut`, so a shortened digest cannot read as a complete one.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readCorpus } from './advise-corpus.js';
import { readState, partitionCompletedPhases, compareEpicIds, EPIC_ID_STRICT_RE } from './state.js';
import { parseEpicStatusRows } from './milestones.js';
import { readRegularFile, regularFileRefusal } from './path-confine.js';
import { bugRowPriority, countInboxHeadings, listOpenQuestions } from './legacy-lists.js';

const PLANNING_DIR = '.planning';

// ⚠ EVERY READ IS A REGULAR FILE, NOT A LINK. A cloned repository can ship any of
// these files as a symlink, and digest text goes straight into the agent's context.
// Pass 1 confined reads to the project root; pass 2 showed the root holds `.env` and
// `.git/config`, which a link inside the project still reached. `readRegularFile`
// refuses any link and any non-file, and the refusal lands in cannot-check.

/** The sources the digest claims to read, enumerated so a test compares against a value. */
export const DIGEST_SOURCES = Object.freeze([
  'vision',
  'milestone',
  'open Epics',
  'bugs',
  'backlog',
  'retrospectives',
  'open questions',
  'inbox',
]);

/** Character caps. `total` bounds the formatted digest; the rest bound one entry each. */
export const DIGEST_CAPS = Object.freeze({
  excerpt: 600,
  row: 160,
  retroSection: 700,
  retroFiles: 3,
  retroAttempts: 12,
  openEpics: 20,
  questions: 10,
  total: 24000,
});

/**
 * What gives way when the digest is over `total`, in order. MEASURED, not
 * guessed: the first real run (this repository, 2026-10-01) trimmed the backlog
 * first and showed 11 of 55 rows — while the backlog is most of what a priority
 * covers. So the backlog goes LAST. Older retrospective sections go first (the
 * newest carry the current lessons), then low-priority bugs, then questions.
 */
export const TRIM_ORDER = Object.freeze([
  'retrospectives',
  'low-priority bugs',
  'open questions',
  'backlog',
  // REVIEW pass 1: these were never trimmed, so 3,000 P1 bugs made a 563,616-char
  // "capped" digest. They give way last, and the cap is now a bound.
  'high-priority bugs',
  'milestone rows',
]);

const RETRO_SECTION_RE = /^##\s+(What to feed back into Signal|What we'd do differently)\s*$/i;
const RETRO_FILE_RE = /^(.+)-RETROSPECTIVE\.md$/;
const MILESTONE_FILE_RE = /^MILESTONE-(\d+(?:\.\d+)?)\.md$/;

/** Collapse whitespace and cut to `n` characters, marking the cut. */
function clip(text, n) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}

/** The paragraph(s) after line index `i` up to the next heading, as one string. */
function sectionBody(lines, i) {
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^#{1,6}\s/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out.join('\n').trim();
}

/**
 * Gather the big-picture digest.
 *
 * Each `entries[source]` is an array of `{path, line, text}` (an other-branch
 * Epic carries `branch` and no path, because its evidence is not a file here).
 * Every source lands in exactly one of `checked` / `cannotCheck`.
 *
 * @param {string} baseDir
 * @param {{corpus?: object, classified?: object}} [opts] — a `readCorpus` result to
 *   reuse, so the advisory and its digest read the same files at the same moment;
 *   and the `classifyRows` result, so the digest offers exactly the rows the gate
 *   will accept (REVIEW pass 2: it offered 55 while the gate accepted 51)
 * @returns {Promise<{entries: object, checked: string[], cannotCheck: Array<{source:string, reason:string}>,
 *   cut: string[], corpus: object}>}
 */
export async function gatherBigPicture(baseDir, { corpus = null, classified = null } = {}) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const entries = Object.fromEntries(DIGEST_SOURCES.map((s) => [s, []]));
  const checked = [];
  const cannotCheck = [];
  const cut = [];
  const notes = [];
  const fail = (source, reason) => cannotCheck.push({ source, reason });
  const ok = (source) => checked.push(source);

  const c = corpus ?? (await readCorpus(baseDir));

  // STATE.md is read only as a regular file (REVIEW pass 2: `readState` followed a
  // link and put an outside `phase` into the digest).
  const stateRefusal = regularFileRefusal(baseDir, `${PLANNING_DIR}/STATE.md`);
  let state = null;
  if (!stateRefusal) {
    try {
      state = await readState(baseDir);
    } catch {
      state = null;
    }
  }

  // ── vision — PROJECT.md in .planning/, or at the root for self-managed repos.
  {
    const candidates = [`${PLANNING_DIR}/PROJECT.md`, 'PROJECT.md'];
    const rel = candidates.find((p) => existsSync(join(baseDir, p)));
    if (!rel) {
      fail('vision', 'no PROJECT.md in .planning/ or at the root — this project states no vision here');
    } else {
      try {
        const lines = readRegularFile(baseDir, rel).split('\n');
        const i = lines.findIndex((l) => /^##\s+(Vision|Problem Statement|Problem)\b/i.test(l));
        if (i === -1) {
          fail('vision', `${rel} has no "## Vision" or "## Problem" heading`);
        } else {
          entries.vision.push({ path: rel, line: i + 1, text: clip(sectionBody(lines, i), DIGEST_CAPS.excerpt) });
          ok('vision');
        }
      } catch (err) {
        fail('vision', `${rel} could not be read — ${err.message}`);
      }
    }
  }

  // ── milestone — the current one: from current_epic, else the highest number.
  try {
    const files = existsSync(planningDir) ? readdirSync(planningDir).filter((f) => MILESTONE_FILE_RE.test(f)) : null;
    if (files === null) {
      fail('milestone', `${PLANNING_DIR}/ is not present`);
    } else if (files.length === 0) {
      fail('milestone', 'no MILESTONE-*.md — this project tracks no milestones here');
    } else {
      const fromEpic = typeof state?.current_epic === 'string' ? state.current_epic.match(/^M(\d+(?:\.\d+)?)\.E\d+$/) : null;
      const byNumber = [...files].sort((a, b) => Number(b.match(MILESTONE_FILE_RE)[1]) - Number(a.match(MILESTONE_FILE_RE)[1]));
      const file = (fromEpic && files.find((f) => f === `MILESTONE-${fromEpic[1]}.md`)) || byNumber[0];
      const rel = `${PLANNING_DIR}/${file}`;
      const content = readRegularFile(baseDir, rel);
      const lines = content.split('\n');
      const h1 = lines.findIndex((l) => /^#\s/.test(l));
      const at = h1 === -1 ? 0 : h1;
      entries.milestone.push({ path: rel, line: at + 1, text: clip(`${lines[at] ?? ''} ${sectionBody(lines, at)}`, DIGEST_CAPS.excerpt) });
      for (const row of parseEpicStatusRows(content, { milestone: file.match(MILESTONE_FILE_RE)[1] })) {
        entries.milestone.push({ path: rel, line: row.line, text: clip(`${row.id ?? ''} ${row.title ?? ''} — ${row.status ?? ''}`, DIGEST_CAPS.row) });
      }
      ok('milestone');
    }
  } catch (err) {
    fail('milestone', `milestone file could not be read — ${err.message}`);
  }

  // ── open Epics — local (from STATE.md) and on other branches (B118).
  {
    let looked = false;
    if (state) {
      looked = true;
      const { valid } = partitionCompletedPhases(state.completed_phases ?? []);
      if (state.current_epic && !valid.some((e) => e.startsWith('SHIP '))) {
        const rel = `${PLANNING_DIR}/STATE.md`;
        let line = 1;
        try {
          const lines = readRegularFile(baseDir, rel).split('\n');
          const i = lines.findIndex((l) => /^current_epic:/.test(l));
          if (i !== -1) line = i + 1;
        } catch {
          // the epic is still known from readState; the line falls back to 1
        }
        entries['open Epics'].push({ path: rel, line, text: clip(`${state.current_epic} — open here at ${state.phase ?? 'an unrecorded phase'}`, DIGEST_CAPS.row) });
      }
    }
    const other = c.sources?.otherBranches;
    if (other) {
      looked = true;
      // Capped: the list grows with the branch count (801 branches gave 134,346
      // chars — REVIEW pass 3). The local Epic, pushed first above, always stays.
      if (other.open.length > DIGEST_CAPS.openEpics) {
        cut.push(`open Epics on other branches: ${DIGEST_CAPS.openEpics} of ${other.open.length} shown`);
      }
      for (const o of other.open.slice(0, DIGEST_CAPS.openEpics)) {
        // Clipped: another branch's STATE.md is anyone-who-can-push input (REVIEW pass 2:
        // a 100 KB `phase` produced a 100,942-char digest).
        entries['open Epics'].push({ branch: clip(o.branches.join(', '), DIGEST_CAPS.row), text: clip(`${o.epic} — open at ${o.phase ?? 'an unrecorded phase'} on ${o.branches.join(', ')}`, DIGEST_CAPS.row) });
      }
    }
    if (stateRefusal) fail('open Epics', stateRefusal);
    else if (looked) ok('open Epics');
    else fail('open Epics', 'neither STATE.md nor the branch scan could be read');
  }

  // ── bugs — open ones, highest priority first; the line each sits on.
  if (!c.sources?.bugs) {
    fail('bugs', c.cannotCheck.find((x) => x.source === 'BUGS.md')?.reason ?? 'BUGS.md was not read');
  } else {
    try {
      const lines = readRegularFile(baseDir, c.sources.bugs.path).split('\n');
      const open = c.sources.bugs.entries
        .filter((e) => e.status === 'confirmed' || e.status === 'needs-triage')
        .map((e) => ({ e, p: bugRowPriority(lines[e.line - 1]) }));
      const order = (p) => (p ? Number(p.slice(1)) : 9);
      open.sort((a, b) => order(a.p) - order(b.p) || a.e.line - b.e.line);
      for (const { e, p } of open) {
        entries.bugs.push({ path: e.path, line: e.line, priority: p, text: clip(`${e.id} ${p ?? 'unprioritised'} ${e.status} — ${e.headline.replace(/\*\*/g, '')}`, DIGEST_CAPS.row) });
      }
      ok('bugs');
    } catch (err) {
      fail('bugs', `${c.sources.bugs.path} could not be re-read — ${err.message}`);
    }
  }

  // ── backlog — every live row, headline only.
  if (!c.sources?.backlog) {
    fail('backlog', c.cannotCheck.find((x) => x.source === 'BACKLOG.md')?.reason ?? 'BACKLOG.md was not read');
  } else {
    const live = classified ? classified.live.map((x) => x.row) : c.sources.backlog.rows;
    for (const r of live) {
      entries.backlog.push({ path: r.path, line: r.line, text: clip(r.text, DIGEST_CAPS.row) });
    }
    if (classified && classified.dropped.length > 0) {
      notes.push(
        `${classified.dropped.length} backlog row(s) dropped (discharged, self-declared not live, or folded) are not offered here — they cannot be covered, and the advisory lists them under Dropped`
      );
    }
    ok('backlog');
  }

  // ── retrospectives — the newest few, and only the sections that look forward.
  try {
    const files = existsSync(planningDir)
      ? readdirSync(planningDir).filter((f) => RETRO_FILE_RE.test(f) && f !== 'RETROSPECTIVES.md')
      : null;
    if (files === null) {
      fail('retrospectives', `${PLANNING_DIR}/ is not present`);
    } else if (files.length === 0) {
      fail('retrospectives', 'no *-RETROSPECTIVE.md yet — nothing has been looked back on');
    } else {
      const unit = (f) => f.match(RETRO_FILE_RE)[1];
      const newestFirst = [...files].sort((a, b) => {
        const ea = EPIC_ID_STRICT_RE.test(unit(a));
        const eb = EPIC_ID_STRICT_RE.test(unit(b));
        if (ea && eb) return compareEpicIds(unit(b), unit(a));
        if (ea !== eb) return ea ? -1 : 1;
        // Numeric: `phase-11` is newer than `phase-9` (REVIEW pass 2 — text order picked 9, 8, 11).
        return b.localeCompare(a, undefined, { numeric: true });
      });
      let used = 0;
      let attempts = 0;
      const skipped = [];
      for (const f of newestFirst) {
        if (used >= DIGEST_CAPS.retroFiles) break;
        // Attempts are bounded, not only successes: 400 unreadable retros were each
        // walked and each added a cut line (REVIEW pass 3).
        if (attempts >= DIGEST_CAPS.retroAttempts) break;
        attempts += 1;
        const rel = `${PLANNING_DIR}/${f}`;
        let content;
        try {
          content = readRegularFile(baseDir, rel);
        } catch (err) {
          // One unreadable or linked retro is named and skipped; the rest still count
          // (REVIEW pass 2: one bad file used to blank the whole source).
          skipped.push({ f, why: clip(err.message, DIGEST_CAPS.row) });
          continue;
        }
        if (content.includes('[FILL IN')) continue; // a stub looks back on nothing
        const lines = content.split('\n');
        let found = false;
        lines.forEach((l, i) => {
          if (RETRO_SECTION_RE.test(l)) {
            found = true;
            entries.retrospectives.push({ path: rel, line: i + 1, text: clip(`${unit(f)} · ${l.replace(/^##\s+/, '')}: ${sectionBody(lines, i)}`, DIGEST_CAPS.retroSection) });
          }
        });
        if (found) used += 1;
      }
      if (skipped.length > 0) {
        cut.push(`retrospectives: ${skipped.length} not read — ${skipped.slice(0, 3).map((x) => `${x.f} not read — ${x.why}`).join('; ')}${skipped.length > 3 ? '; …' : ''}`);
      }
      if (used === 0) {
        fail('retrospectives', `${files.length} retrospective(s), none with a "What to feed back" or "What we'd do differently" section`);
      } else {
        const unread = newestFirst.length - attempts;
        if (unread > 0) cut.push(`retrospectives: the newest ${used} read, ${unread} older not opened`);
        ok('retrospectives');
      }
    }
  } catch (err) {
    fail('retrospectives', `retrospectives could not be read — ${err.message}`);
  }

  // ── open questions — headings, not struck through.
  {
    const rel = `${PLANNING_DIR}/OPEN-QUESTIONS.md`;
    if (!existsSync(join(baseDir, rel))) {
      fail('open questions', `${rel} is not present — this project files no questions here`);
    } else {
      try {
        // Same rule as `countOpenQuestions`: every `## ` heading is open, except one
        // struck through (see `listOpenQuestions`).
        const open = listOpenQuestions(readRegularFile(baseDir, rel)).map((q) => ({ path: rel, line: q.line, text: clip(q.text, DIGEST_CAPS.row) }));
        entries['open questions'].push(...open.slice(0, DIGEST_CAPS.questions));
        if (open.length > DIGEST_CAPS.questions) cut.push(`open questions: ${DIGEST_CAPS.questions} of ${open.length} shown`);
        ok('open questions');
      } catch (err) {
        fail('open questions', `${rel} could not be read — ${err.message}`);
      }
    }
  }

  // ── inbox — how much is waiting to be sorted. A count, not the entries.
  {
    const storeInbox = join(planningDir, 'work', 'inbox');
    const storeOn = existsSync(join(planningDir, 'work', 'WORK.md'));
    try {
      if (storeOn) {
        const n = existsSync(storeInbox) ? readdirSync(storeInbox).filter((f) => f.endsWith('.md')).length : 0;
        entries.inbox.push({ path: `${PLANNING_DIR}/work/WORK.md`, line: 1, text: `${n} item(s) in the inbox, not yet triaged` });
        ok('inbox');
      } else {
        const rel = ['ISSUES-INBOX.md', 'FUTURE-IDEAS.md'].map((f) => `${PLANNING_DIR}/${f}`).find((p) => existsSync(join(baseDir, p)));
        if (!rel) {
          fail('inbox', 'no ISSUES-INBOX.md — this project keeps no capture inbox here');
        } else {
          const content = readRegularFile(baseDir, rel);
          const n = countInboxHeadings(content);
          entries.inbox.push({ path: rel, line: 1, text: `${n} entr(y/ies) in the inbox` });
          ok('inbox');
        }
      }
    } catch (err) {
      fail('inbox', `the inbox could not be read — ${err.message}`);
    }
  }

  return { entries, checked, cannotCheck, cut, notes, corpus: c };
}

/** `path:line`, or the branch for an entry that has no file here. */
function ref(e) {
  return e.path ? `${e.path}:${e.line}` : `branch ${e.branch}`;
}

/**
 * The digest as the agent reads it. What could not be read comes FIRST, so a gap
 * is the first thing seen rather than the last.
 *
 * Bounded by `DIGEST_CAPS.total`: entries give way in `TRIM_ORDER`, from the end of
 * each list, and every cut is stated. Lengths are computed per line and the text is
 * built ONCE — the first version rebuilt the whole digest per trimmed entry, which
 * was quadratic (1.3 s at 4,000 rows; REVIEW pass 1). If even the untrimmable part
 * (vision, the milestone's own heading, open Epics) is over the cap, the output
 * says so rather than claiming to fit.
 *
 * @param {{entries: object, checked: string[], cannotCheck: Array, cut: string[]}} digest
 * @returns {string}
 */
export function formatDigest(digest) {
  const isLow = (e) => !e.priority || Number(e.priority.slice(1)) >= 3;
  const line = (e) => `- ${e.text} (${ref(e)})`;

  // Each trimmable group, as the entries it would show in order.
  const groups = {
    retrospectives: digest.entries.retrospectives,
    'low-priority bugs': digest.entries.bugs.filter(isLow),
    'open questions': digest.entries['open questions'],
    backlog: digest.entries.backlog,
    'high-priority bugs': digest.entries.bugs.filter((e) => !isLow(e)),
    'milestone rows': digest.entries.milestone.slice(1), // [0] is the milestone's own heading
  };
  const shown = Object.fromEntries(Object.entries(groups).map(([g, list]) => [g, list.length]));

  const listFor = (source) => {
    if (source === 'bugs') {
      return [...groups['high-priority bugs'].slice(0, shown['high-priority bugs']), ...groups['low-priority bugs'].slice(0, shown['low-priority bugs'])];
    }
    if (source === 'milestone') return [...digest.entries.milestone.slice(0, 1), ...groups['milestone rows'].slice(0, shown['milestone rows'])];
    if (source in groups) return groups[source].slice(0, shown[source]);
    return digest.entries[source];
  };

  // Reasons are clipped: a cannot-check reason can carry a parser error or a
  // path, and an unclipped one blew the cap on its own (REVIEW pass 2).
  const render = (stillOver = false) => {
    const out = ['# Big-picture digest', ''];
    if (digest.cannotCheck.length > 0) {
      out.push('## Could not read — the picture below is missing these', '');
      for (const c of digest.cannotCheck) out.push(`- **${c.source}** — ${clip(c.reason, DIGEST_CAPS.row * 2)}`);
      out.push('');
    }
    for (const n of digest.notes ?? []) out.push(`> ${clip(n, DIGEST_CAPS.row * 2)}`, '');
    for (const source of DIGEST_SOURCES) {
      if (!digest.checked.includes(source)) continue;
      const list = listFor(source);
      out.push(`## ${source} (${digest.entries[source].length})`, '');
      if (list.length === 0) out.push('- (none)');
      for (const e of list) out.push(line(e));
      out.push('');
    }
    const cut = [...digest.cut.map((c) => clip(c, DIGEST_CAPS.row * 2))];
    for (const g of TRIM_ORDER) {
      if (shown[g] < groups[g].length) cut.push(`${g}: ${shown[g]} of ${groups[g].length} shown (digest cap ${DIGEST_CAPS.total} chars)`);
    }
    if (stillOver) cut.push('still over the cap after every trim — the parts that cannot be cut (vision, the milestone heading, open Epics, the notes above) are what remain');
    if (cut.length > 0) {
      out.push('## Cut to fit — not shown above', '');
      for (const c of cut) out.push(`- ${c}`);
      out.push('');
    }
    return out.join('\n');
  };

  // First pass by arithmetic, so a large digest is not rebuilt per entry (the first
  // version was quadratic: 1.3 s at 4,000 rows). Then correct against the REAL
  // length — the estimate cannot see every `(none)` line, and the first bound
  // reported "still over" for a digest that fit (REVIEW pass 2).
  const size = (list) => list.reduce((n, e) => n + line(e).length + 1, 0);
  let estimate = render().length;
  for (const g of TRIM_ORDER) {
    while (estimate > DIGEST_CAPS.total && shown[g] > 0) {
      shown[g] -= 1;
      estimate -= size([groups[g][shown[g]]]);
    }
  }
  let text = render();
  const nextTrimmable = () => TRIM_ORDER.find((g) => shown[g] > 0);
  while (text.length > DIGEST_CAPS.total && nextTrimmable()) {
    shown[nextTrimmable()] -= 1;
    text = render();
  }
  // "Still over" is said only when it is TRUE: every trimmable group is empty and
  // the text still exceeds the cap.
  if (text.length > DIGEST_CAPS.total) text = render(true);
  return text;
}
