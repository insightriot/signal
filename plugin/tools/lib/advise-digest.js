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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readCorpus } from './advise-corpus.js';
import { readState, partitionCompletedPhases, compareEpicIds, EPIC_ID_STRICT_RE } from './state.js';
import { parseEpicStatusRows } from './milestones.js';

const PLANNING_DIR = '.planning';

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
export const TRIM_ORDER = Object.freeze(['retrospectives', 'low-priority bugs', 'open questions', 'backlog']);

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

/** BUGS.md row → its priority cell (`P1`), or null. */
function bugPriority(rowLine) {
  const cell = (rowLine ?? '').split('|')[3] ?? '';
  const m = cell.match(/\bP(\d)\b/);
  return m ? `P${m[1]}` : null;
}

/**
 * Gather the big-picture digest.
 *
 * Each `entries[source]` is an array of `{path, line, text}` (an other-branch
 * Epic carries `branch` and no path, because its evidence is not a file here).
 * Every source lands in exactly one of `checked` / `cannotCheck`.
 *
 * @param {string} baseDir
 * @param {{corpus?: object}} [opts] — a `readCorpus` result to reuse, so the
 *   advisory and its digest read the same files at the same moment
 * @returns {Promise<{entries: object, checked: string[], cannotCheck: Array<{source:string, reason:string}>,
 *   cut: string[], corpus: object}>}
 */
export async function gatherBigPicture(baseDir, { corpus = null } = {}) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const entries = Object.fromEntries(DIGEST_SOURCES.map((s) => [s, []]));
  const checked = [];
  const cannotCheck = [];
  const cut = [];
  const fail = (source, reason) => cannotCheck.push({ source, reason });
  const ok = (source) => checked.push(source);

  const c = corpus ?? (await readCorpus(baseDir));

  let state = null;
  try {
    state = await readState(baseDir);
  } catch {
    state = null;
  }

  // ── vision — PROJECT.md in .planning/, or at the root for self-managed repos.
  {
    const candidates = [`${PLANNING_DIR}/PROJECT.md`, 'PROJECT.md'];
    const rel = candidates.find((p) => existsSync(join(baseDir, p)));
    if (!rel) {
      fail('vision', 'no PROJECT.md in .planning/ or at the root — this project states no vision here');
    } else {
      try {
        const lines = (await readFile(join(baseDir, rel), 'utf-8')).split('\n');
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
      const content = await readFile(join(planningDir, file), 'utf-8');
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
          const lines = (await readFile(join(baseDir, rel), 'utf-8')).split('\n');
          const i = lines.findIndex((l) => /^current_epic:/.test(l));
          if (i !== -1) line = i + 1;
        } catch {
          // the epic is still known from readState; the line falls back to 1
        }
        entries['open Epics'].push({ path: rel, line, text: `${state.current_epic} — open here at ${state.phase ?? 'an unrecorded phase'}` });
      }
    }
    const other = c.sources?.otherBranches;
    if (other) {
      looked = true;
      for (const o of other.open) {
        entries['open Epics'].push({ branch: o.branches.join(', '), text: `${o.epic} — open at ${o.phase ?? 'an unrecorded phase'} on ${o.branches.join(', ')}` });
      }
    }
    if (looked) ok('open Epics');
    else fail('open Epics', 'neither STATE.md nor the branch scan could be read');
  }

  // ── bugs — open ones, highest priority first; the line each sits on.
  if (!c.sources?.bugs) {
    fail('bugs', c.cannotCheck.find((x) => x.source === 'BUGS.md')?.reason ?? 'BUGS.md was not read');
  } else {
    try {
      const lines = (await readFile(join(baseDir, c.sources.bugs.path), 'utf-8')).split('\n');
      const open = c.sources.bugs.entries
        .filter((e) => e.status === 'confirmed' || e.status === 'needs-triage')
        .map((e) => ({ e, p: bugPriority(lines[e.line - 1]) }));
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
    for (const r of c.sources.backlog.rows) {
      entries.backlog.push({ path: r.path, line: r.line, text: clip(r.text, DIGEST_CAPS.row) });
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
        return b.localeCompare(a);
      });
      let used = 0;
      for (const f of newestFirst) {
        if (used >= DIGEST_CAPS.retroFiles) break;
        const rel = `${PLANNING_DIR}/${f}`;
        const content = await readFile(join(planningDir, f), 'utf-8');
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
      if (used === 0) {
        fail('retrospectives', `${files.length} retrospective(s), none with a "What to feed back" or "What we'd do differently" section`);
      } else {
        if (newestFirst.length > used) cut.push(`retrospectives: the newest ${used} read, ${newestFirst.length - used} older not read`);
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
        const lines = (await readFile(join(baseDir, rel), 'utf-8')).split('\n');
        const open = [];
        lines.forEach((l, i) => {
          // Same rule as `countOpenQuestions` (status.js): every `## ` heading is
          // open, except one struck through. Matching words like "resolved" would
          // drop an open question that merely contains one ("should it fail closed?").
          if (/^##\s/.test(l) && !l.includes('~~')) open.push({ path: rel, line: i + 1, text: clip(l.replace(/^#+\s+/, ''), DIGEST_CAPS.row) });
        });
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
          const content = await readFile(join(baseDir, rel), 'utf-8');
          const n = content.split('\n').filter((l) => /^##\s/.test(l)).length;
          entries.inbox.push({ path: rel, line: 1, text: `${n} entr(y/ies) in the inbox` });
          ok('inbox');
        }
      }
    } catch (err) {
      fail('inbox', `the inbox could not be read — ${err.message}`);
    }
  }

  return { entries, checked, cannotCheck, cut, corpus: c };
}

/** `path:line`, or the branch for an entry that has no file here. */
function ref(e) {
  return e.path ? `${e.path}:${e.line}` : `branch ${e.branch}`;
}

/**
 * The digest as the agent reads it. What could not be read comes FIRST, so a
 * gap is the first thing seen rather than the last. Bounded by `DIGEST_CAPS.total`:
 * entries give way in `TRIM_ORDER`, one at a time from the end of each list, and
 * every cut is stated.
 *
 * @param {{entries: object, checked: string[], cannotCheck: Array, cut: string[]}} digest
 * @returns {string}
 */
export function formatDigest(digest) {
  const cut = [...digest.cut];
  const isLow = (e) => !e.priority || Number(e.priority.slice(1)) >= 3;
  // How many of each trimmable group are shown; everything else is always shown.
  const full = {
    retrospectives: digest.entries.retrospectives.length,
    'low-priority bugs': digest.entries.bugs.filter(isLow).length,
    'open questions': digest.entries['open questions'].length,
    backlog: digest.entries.backlog.length,
  };
  const shown = { ...full };
  const listFor = (source) => {
    const all = digest.entries[source];
    if (source === 'bugs') {
      const high = all.filter((e) => !isLow(e));
      return [...high, ...all.filter(isLow).slice(0, shown['low-priority bugs'])];
    }
    if (source in shown) return all.slice(0, shown[source]);
    return all;
  };
  const build = () => {
    const out = ['# Big-picture digest', ''];
    if (digest.cannotCheck.length > 0) {
      out.push('## Could not read — the picture below is missing these', '');
      for (const c of digest.cannotCheck) out.push(`- **${c.source}** — ${c.reason}`);
      out.push('');
    }
    for (const source of DIGEST_SOURCES) {
      if (!digest.checked.includes(source)) continue;
      const list = listFor(source);
      out.push(`## ${source} (${digest.entries[source].length})`, '');
      if (list.length === 0) out.push('- (none)');
      for (const e of list) out.push(`- ${e.text} (${ref(e)})`);
      out.push('');
    }
    return out;
  };
  let out = build();
  for (const group of TRIM_ORDER) {
    while (out.join('\n').length > DIGEST_CAPS.total && shown[group] > 0) {
      shown[group] -= 1;
      out = build();
    }
  }
  for (const group of TRIM_ORDER) {
    if (shown[group] < full[group]) {
      cut.push(`${group}: ${shown[group]} of ${full[group]} shown (digest cap ${DIGEST_CAPS.total} chars)`);
    }
  }
  if (cut.length > 0) {
    out.push('## Cut to fit — not shown above', '');
    for (const c of cut) out.push(`- ${c}`);
    out.push('');
  }
  return out.join('\n');
}
