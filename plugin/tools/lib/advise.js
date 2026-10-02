// `/sig:advise` — the Roadmap Advisor. `M6.E7` S3.
//
// Reads this project's own `.planning/` corpus and writes a dated advisory
// proposing what to work on next, where every claim carries a citation that
// mechanically resolves. It PROPOSES. It never selects, and it writes nothing
// except its own artifact.
//
// ⚠ SINCE `M6.E12` THE PROPOSAL IS 3–5 BIG-PICTURE PRIORITIES, NOT A RANKED FIVE.
// The ranking ordered 44 of 46 live rows by age alone (`SIG-142`). Now the agent
// running the command reads a cited digest of the project's documents
// (`advise-digest.js`) and proposes priorities; `validatePriorities`
// (`advise-priorities.js`) checks them; this module renders, gates and writes.
// The row list survives as an UNRANKED appendix — rows under the priority that
// covers them, the rest in file order — and age is not an input anywhere.
//
// ⚠ THE GATE ASSERTS A COUNT, NOT A FLAG, and that is the difference between a
// real check and a decorative one. `verifyCitations` returns `ok: true` over an
// artifact with ZERO citations — correctly, at the unit: nothing was wrong
// because nothing was claimed. So an extractor that missed the renderer's
// grammar would hand a caller `ok: true` over an artifact in which nothing was
// checked at all. AC1.2's "whole output, not sampled" is only ever as whole as
// `extractCitations` — extraction RECALL is the hole, not sampling — and a count
// is the only thing that measures it.
//
// ⚠ WHAT THE RANKING CANNOT SEE. Input 3 comes from `backlogDischargeStatus`,
// which reads the backlog at the DEFAULT `maxDepth: 3`. This module reads rows at
// depth 4. So a `####` row whose work has already closed is invisible to that
// input and will not be dropped by it. Stated rather than silently tolerated:
// this is a reach limit of a borrowed check, and the alternative — a second
// definition of "closed" living here — is the thing `M5.E19` spent a slice
// removing. It resolves when the check itself widens, not here.

import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import {
  backlogDischargeStatus,
  declaresBugDischarge,
  declaresNotLiveWork,
  declaresWorkMovedElsewhere,
} from './backlog.js';
import { EVIDENCE_MARKER, verifyCitations } from './citations.js';
import { assertRealInsidePlanning, regularFileRefusal } from './path-confine.js';
import { readCorpus, ADVISOR_SOURCES } from './advise-corpus.js';
import { nextStepFor } from './branch-work.js';
import { gatherBigPicture, formatDigest } from './advise-digest.js';
import { validatePriorities } from './advise-priorities.js';

const PLANNING_DIR = '.planning';

/** Artifact basename prefix. Constrained: `tools/doc-budgets.json` exempts exactly this pattern. */
export const ARTIFACT_PREFIX = 'BACKLOG-REVIEW-';

/**
 * The heading `recordChoice` appends. Not in `RENDER_LABELS`: the renderer never
 * writes it — only a person's pick does, after it is made. Not "Chosen" either:
 * that is one of `FORBIDDEN_VERBS`, and the heading says whose decision it was.
 */
export const PICK_HEADING = 'Picked by you';

/**
 * Whether `content` records a pick: the heading as a whole line of its own.
 *
 * Not a substring — a backlog row or a model title quoting the words read as
 * picked (REVIEW pass 1). And not a multiline regex — JavaScript's `^`/`$` also
 * break on U+2028/U+2029, which forged the heading from inside a title (pass 2).
 * Lines are split on `\n` only; a trailing `\r` or spaces are tolerated.
 */
export function hasPick(content) {
  return String(content).split('\n').some((l) => l.replace(/\s+$/, '') === `## ${PICK_HEADING}`);
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD`, and a real date — `today` becomes part of a filename (`SIG-123`). */
const STAMP_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidStamp(stamp) {
  if (typeof stamp !== 'string' || !STAMP_RE.test(stamp)) return false;
  const d = new Date(`${stamp}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === stamp;
}

/**
 * The vocabulary the renderer writes in its own voice.
 *
 * Exported so `t3.2b` can assert against a value rather than a recollection:
 * FR6 says this command proposes and never selects, and the way that becomes
 * testable is that none of these labels claims a decision was made.
 */
export const RENDER_LABELS = Object.freeze({
  priorities: 'Priorities',
  appendix: 'Appendix — every live row',
  corpus: 'Corpus read',
  citationRule: 'Citation rule',
  status:
    '**This changes nothing on its own.** It proposes; you pick. Nothing in `.planning/` was ' +
    'modified, no row was struck, and nothing was added to the decision queue.',
  judgment:
    'The priorities are a **judgment**, made by the agent that ran this command from a digest of ' +
    'this project\'s documents. Another run over the same files can propose different ones. What is ' +
    'checked is that each one cites lines that exist and covers rows and bugs that are live.',
  producer: '*Produced `via /sig:advise`.*',
});

/** Verbs that would turn a proposal into a decision. Asserted absent by `t3.2b`. */
export const FORBIDDEN_VERBS = Object.freeze(['chosen', 'selected', 'decided']);

// A row that names its own gate. Read from the vocabulary the maintainer already
// writes: BACKLOG.md carries "Trigger: …", "blocked on", "gated on", "NOT met".
//
// ⚠ REACH DECLARATION (`B81`) — measured on this repository's own BACKLOG.md,
// not assumed. These two patterns are TOKEN MATCHES over a row's heading AND its
// whole body, and the body is everything up to the next row. So:
//
//   - They cannot tell a row's OWN trigger from a trigger it merely mentions. A
//     row that is *about* triggers matches. Measured 2026-09-05: 6 of 50 live
//     rows match `TRIGGER_MET_RE`, and **5 of those 6 are false positives**
//     (re-read 2026-09-25 against each row's own `Trigger:` line; this comment
//     said 2 until then). *"Parked — the trigger watchlist (not sprint
//     material)"* matches on a watchlist entry belonging to a different item
//     (`Trigger:* first live external tester — **FIRED`); two dated
//     reconciliation notes match on prose describing a past state (`trigger has
//     therefore read **satisfied`); and two rows whose own line reads
//     `Trigger: NONE` matched on text absorbed from the entry below them — the
//     row-body defect `M6.E7`'s PR review later fixed. Only "Trajectory scoring"
//     states its own trigger fired. Labels and evidence:
//     `analysis/TYPESAFE-JEV-ASSESSMENT.md` §6, set 2.
//   - They read no state. "Fired" means the row SAYS so; nothing here checks
//     whether the named condition actually holds today.
//   - `\b…met\b` is case-insensitive, so ordinary English "met" counts.
//
// ⚠ THE PATTERN IS UNCHANGED AND ITS REACH LIMIT STANDS. The two measured false
// positives are caught UPSTREAM by ranking input 5 (`declaresNotLiveWork`, which
// reads the heading only), not by narrowing this. That was a deliberate call:
// tightening a body-scanning heuristic makes it miss rows that state a trigger
// informally, whereas a heading-level self-declaration is a different signal
// entirely and cannot be confused with somebody else's trigger. So this can still
// promote a row on a mention that is not its own — a row about triggers that does
// NOT declare itself parked or a record would still slip through.
//
// ⚠ NOT WIDENED BY `M6.E8`, AND THE REASON IS A MEASUREMENT (FR2 / `D-M6E8-7`).
// DISCUSS proposed adding "entry price for" so that four rows "gated on `B75`"
// would read blocked. Measured 2026-09-14 on the then-48 live rows of this
// repository's own BACKLOG.md:
//   - "entry price for" occurs in ONE live row — *"The entry price for any
//     Phase A autonomy work: B73–B76"* — which is the gate itself. Adding the
//     phrase demotes the row that says *do these first*.
//   - the rows cite `B75` as a MEASUREMENT ("B75 measured that ceiling",
//     "a fourth knob … is B75"); none states a gate. One was already blocked
//     for an unrelated phrase.
//   - twelve sibling phrases (precondition, prerequisite, blocked by, gated by,
//     waiting on, needs … first, until|after … ships, stuck behind, sequenced
//     behind, can't … until): ZERO correct hits. `precondition` hits the gate
//     row again and one prose use; `needs … first` hits "needs the
//     measure-first treatment" and a row already blocked.
// The only mechanism that flips those rows is "body names a confirmed bug",
// which `D-M6E8-2` rejected and which would demote nine rows including the
// row for this Epic. So the pattern is byte-identical to what `M6.E7` shipped,
// `BLOCKED_MEASURED` below pins its two hits, and `tests/advise-live-measurement.test.js`
// asserts that no blocked row is blocked BY that phrase. A DISCUSS claim written
// from the shape of the argument rather than from the rows, caught at PLAN.
const BLOCKED_RE = /\b(?:blocked on|gated on|depends on|trigger[^.\n]{0,60}\b(?:is\s+)?NOT met|unmet trigger)\b/i;
const TRIGGER_MET_RE = /\btrigger[^.\n]{0,60}\b(?:FIRED|met|satisfied)\b/i;

/**
 * What each pattern above hits on THIS repository's own `BACKLOG.md`, measured
 * through the real readers and pinned by `tests/advise-live-measurement.test.js`.
 *
 * `M6.E8` NFR6: a vocabulary's count is recorded in the source beside the
 * pattern — and a count in a comment is a claim written from memory the moment
 * the file moves (`declaresNotLiveWork`'s docblock said "50 live rows" for a
 * week while the file was at 48). These are frozen values a test compares, so
 * the number is checked on every run rather than trusted.
 *
 * ⚠ A red pin is a RE-MEASUREMENT STEP, not a nuisance: a row started or stopped
 * matching, and that is the moment to re-read the hit and decide whether the
 * vocabulary is still precise. This is not `B120`'s shape (a test that fires
 * when a ledger is merely used); the test's failure message says which.
 *
 * ⚠ THERE IS NO `rows` FIELD, AND ITS REMOVAL IS A FINDING. It recorded the
 * POPULATION a count was taken over, and it went through both wrong states in one
 * Epic. First it was recorded and unasserted — five of six said `48` while the
 * real populations were 45 and 52, a number beside the pattern that nothing
 * verified, which is what `NFR6` exists to forbid. Then it was asserted, and that
 * was worse: a population assertion fires when a row is ADDED OR STRUCK, so a
 * single ordinary `####` row carrying none of the vocabulary turned **5 of 15
 * tests red** (measured, not argued). That is `B120`'s shape exactly — a check
 * that fires when the ledger is merely used — and this Epic's own REQUIREMENTS
 * said so in advance: *"an AC pinned to a total fails on an ordinary backlog
 * edit. Prefer ACs pinned to named rows over ACs pinned to counts."* Found by a
 * fresh-context test reviewer who mutated the file instead of reading it.
 *
 * `hits` stays. A hit count firing when a vocabulary's REACH changes is the
 * documented trade: that is a row starting or stopping matching, which is exactly
 * when a person should re-read it. A population is not a measurement of a
 * vocabulary, and pinning one bought nothing this file needed.
 */
export const BLOCKED_MEASURED = Object.freeze({ on: '2026-09-14', hits: 2 });
export const TRIGGER_MET_MEASURED = Object.freeze({ on: '2026-09-27', hits: 2 }); // 3 → 2 at M6.E8 SHIP: its own row was struck. 2 → 3 at M6.E3 VERIFY: the in-flight M6.E3 row (own line `Trigger: met`, genuine) had been hidden as DISCHARGED because its heading read "EXECUTE done" (B127). 3 → 2 at M6.E3 SHIP: its row was struck

/**
 * The one helper that emits a citation, so the marker has a single home.
 *
 * Callers never write the marker themselves — `citations.js` exports it and this
 * is the only thing that formats it. Two literal copies of that string is how the
 * `B89` class starts.
 */
export function cite(...targets) {
  const tokens = targets.filter(Boolean).map((t) => `\`${t}\``);
  return `${EVIDENCE_MARKER} ${tokens.join(', ')}`;
}

/**
 * Strip the evidence marker out of text quoted from the corpus.
 *
 * The extractor reads the FIRST marker on a line and takes the rest of the line
 * as evidence, so a quoted row carrying the literal marker would pull its own
 * backticked tokens into the citation position. That fails the run loudly rather
 * than silently, which is the right direction — but it is this function's job to
 * make sure it never happens. The two halves of that contract live in two files;
 * `citations.js` states the other one.
 */
export function quoteSafe(text) {
  // ⚠ NEWLINES ARE NEUTRALIZED TOO, and that half was missing until the final
  // review round. Stripping only the marker stops a quoted row from forging a
  // CITATION; it does nothing about forging document STRUCTURE. Every string
  // that reaches the artifact is rendered as one line, so a value carrying a
  // newline breaks out of its bullet and the rest is read as Markdown at the top
  // level. Reproduced: a `schema_version` written as a YAML block scalar puts its
  // own lines into the schema error, which `resolveClosures` wraps as a reason,
  // which the Corpus section renders — and the artifact then carries a second
  // `## Recommended — 1` heading and a `- **forged row**` bullet that no ranking
  // produced and no citation covers. The count gate cannot see it, because claims
  // are counted from `ranked` and never from the text.
  //
  // Fixed HERE rather than at that one source, because this is the choke point
  // every interpolation already passes through: the same shape was reachable from
  // a caller-supplied `projectName`, from a malformed-YAML parser error, and from
  // a `.planning/` filename embedded in closure evidence.
  return String(text)
    .split(EVIDENCE_MARKER)
    .join('— evidence(quoted):')
    .replace(/[\r\n\u0085\u2028\u2029]+/g, ' ');
}

/**
 * Sort the backlog rows into LIVE and DROPPED, and annotate each. No ranking.
 *
 * Until `M6.E12` this was `rankRows`, and its sort ended in **age**: measured on
 * this repository, 44 of 46 live rows were ordered by nothing but how long they
 * had sat there (`SIG-142`). The priorities now carry the judgment; this only
 * says which rows are live, why the others are not, and what each row says about
 * itself. Live rows stay in FILE ORDER.
 *
 * Inputs, each independently citable:
 *   - **discharge** — a row whose work already closed is dropped.
 *   - **self-declared not-live** — a row whose own HEADING says it is not
 *     actionable work is dropped.
 *   - **fold** (`M6.E8` FR4) — a row whose own HEADING says its work moved
 *     elsewhere is dropped, unless the heading also says `KEPT`.
 *   - **blocked-by**, **trigger-met**, **bug-discharge** — annotations on a live
 *     row, not ranks. Bug-discharge fires only when a `confirmedBugs` Set is given.
 *
 * **`consulted`**: which `ADVISOR_SOURCES` any input above actually read on THIS
 * run, derived from what this function was GIVEN (`D-M6E8-9`). `BACKLOG.md`
 * always; `STATE/closure` and `BUGS.md` when discharge's `sources` says it could
 * open each; `BUGS.md` also when `confirmedBugs` was supplied.
 *
 * ⚠ Not-live, fold and bug-discharge read the HEADING, never the body: body-scanning
 * is how the first real run promoted a row using a trigger belonging to a
 * different item inside it (`M6.E7-PLAN.md`).
 */
export function classifyRows(rows, { stale = [], discharge = null, confirmedBugs = null } = {}) {
  const consultedSet = new Set(['BACKLOG.md']);
  if (discharge?.sources?.units) consultedSet.add('STATE/closure');
  if (discharge?.sources?.bugs) consultedSet.add('BUGS.md');
  if (confirmedBugs instanceof Set) consultedSet.add('BUGS.md');
  const consulted = ADVISOR_SOURCES.filter((s) => consultedSet.has(s));

  // The ENTRY is kept, not just its id: the drop reason names the source that
  // closed the row and quotes its evidence (`D-M6E8-8`).
  const staleById = new Map(stale.filter((s) => s.id).map((s) => [s.id, s]));
  // `.filter(...)` is load-bearing: a stale entry with no `line` keyed
  // `undefined`, and any row also lacking one read as discharged and vanished.
  const staleByLine = new Map(stale.filter((s) => s.line).map((s) => [s.line, s]));

  const classified = rows.map((row) => {
    const text = `${row.text}\n${row.body ?? ''}`;
    const staleEntry = staleById.get(row.leadingId) ?? staleByLine.get(row.line) ?? null;
    const dischargedElsewhere = staleEntry !== null;
    const notLive = declaresNotLiveWork(row.text);
    const moved = declaresWorkMovedElsewhere(row.text);
    let dischargesBug = null;
    if (confirmedBugs instanceof Set) {
      const d = declaresBugDischarge(row.text);
      if (d.id && confirmedBugs.has(d.id)) dischargesBug = d;
    }
    const blocked = BLOCKED_RE.test(text);
    const triggerMet = TRIGGER_MET_RE.test(text);
    return { row, dischargedElsewhere, staleEntry, notLive, moved, dischargesBug, blocked, triggerMet };
  });

  const isDropped = (s) => s.dischargedElsewhere || s.notLive.notLive || s.moved.moved;
  const byLine = (a, b) => a.row.line - b.row.line;
  return {
    live: classified.filter((s) => !isDropped(s)).sort(byLine),
    dropped: classified.filter(isDropped).sort(byLine),
    consulted,
  };
}

/** What a live row says about itself. An empty string when it says nothing the inputs read. */
function annotate(s) {
  const parts = [];
  if (s.triggerMet) parts.push('its written trigger has fired');
  if (s.dischargesBug) {
    parts.push(`its heading says it discharges \`${s.dischargesBug.id}\`, which \`BUGS.md\` still records as confirmed`);
  }
  if (s.blocked) parts.push('it names a gate that has not fired');
  return parts.length > 0 ? `${parts.join('; ')}.` : '';
}

/** Why a row was dropped, naming the input that dropped it. */
function dropReason(s) {
  if (s.notLive.notLive) {
    return (
      `Dropped by the **self-declared** input — the row's own heading says \`${s.notLive.declaration}\`, ` +
      'so it is not actionable work.'
    );
  }
  if (s.dischargedElsewhere) {
    const e = s.staleEntry;
    if (e?.id && e?.evidence) {
      const source = /^B\d+$/.test(e.id) ? '**`BUGS.md`**' : '**unit closure**';
      return (
        `Dropped by the **discharge** input — \`${e.id}\` reads closed in ${source} ` +
        `(${quoteSafe(e.evidence)}), so it is not live work.`
      );
    }
    return 'Dropped by the **discharge** input — its work already reads as closed, so it is not live work.';
  }
  return (
    `Dropped by the **fold** input — the row's own heading says \`${s.moved.declaration}\`, ` +
    'so its work lives elsewhere.'
  );
}

/**
 * Render the advisory. Pure, file-facing, and separate from the terminal formatter.
 *
 * Order (AC3.1): header + status + judgment line; corpus read (the ranking's
 * sources and the digest's); open on other branches; citation rule;
 * **Priorities**; **Appendix — every live row**.
 *
 * ⚠ EVERY MODEL-WRITTEN STRING GOES THROUGH `quoteSafe`. `validatePriorities`
 * already refuses a title or `why` carrying the evidence marker or a newline;
 * this is the second, independent guard, because the renderer must not trust
 * that its caller validated.
 *
 * @param {{today: string, classified: {live: Array, dropped: Array, consulted: string[]},
 *   priorities: Array, corpus: object, digest?: object, projectName?: string}} args
 */
export function renderArtifact({ today, classified, priorities, corpus, digest = null, projectName }) {
  const L = RENDER_LABELS;
  const out = [];

  out.push(`# Backlog review — ${today}`);
  out.push('');
  out.push(
    // ⚠ `quoteSafe` HERE IS NOT COSMETIC: `projectName` is caller-supplied, and an
    // unescaped one could write the evidence marker into the header and inject a
    // citation into the extractor's own position (verified in `M6.E7`).
    `What to work on next in ${quoteSafe(projectName ?? 'this project')}, read from its own \`${PLANNING_DIR}/\` corpus.`
  );
  out.push('');
  out.push(L.status);
  out.push('');
  out.push(L.judgment);
  out.push('');
  out.push(L.producer);
  out.push('');

  out.push(`## ${L.corpus}`);
  out.push('');
  out.push(`**Read:** ${corpus.checked.length > 0 ? corpus.checked.join(' · ') : 'nothing'}.`);
  out.push('');
  // ⚠ SAYING WHICH SOURCES THE RANKING ACTUALLY USED, because "Read: …" does not
  // say it and a reader infers it. This used to be a LITERAL — "`BACKLOG.md`
  // only" — written by `M6.E7` REVIEW to stop an over-claim, and it was wrong
  // in the other direction from the day it shipped: input 3 reads BUGS.md and
  // STATE/closure through its own path. An under-claim and an over-claim are
  // the same defect (`D-M6E8-9`). So the renderer carries no source list; it
  // prints what `classifyRows` was given, and a source it could not name is stated
  // as not recorded rather than guessed.
  if (Array.isArray(classified.consulted)) {
    out.push(`**Consulted by the row inputs:** ${classified.consulted.map((s) => `\`${s}\``).join(' · ')}.`);
    // Read by the corpus, consulted by nothing. `milestone rows` is always here
    // when readable, with the reason it is kept (FR6). Any other source lands
    // here when the corpus could open it and input 3 did not — either it could
    // not, or it had no id-led row to look up and never tried; the wording is
    // neutral because `sources` cannot tell those apart and guessing is worse.
    const readNotConsulted = ADVISOR_SOURCES.filter(
      (s) => !classified.consulted.includes(s) && corpus.checked.includes(s)
    );
    if (readNotConsulted.length > 0) {
      const why = (s) =>
        s === 'milestone rows'
          ? 'kept because it is cheap and is the natural home for a future "already sequenced into an ' +
            'open Epic" input; no ranking input reads it'
          : s === 'other branches'
            ? (corpus.sources?.otherBranches?.open?.length ?? 0) > 0
              ? 'not ranked — an Epic open on another branch is listed in *Open on other branches*, because ' +
                'finishing it comes before any priority'
              : 'not ranked — no Epic is open on another branch'
            : 'the discharge input did not open it on this run';
      out.push('');
      out.push(`**Read, not consulted:** ${readNotConsulted.map((s) => `\`${s}\` — ${why(s)}`).join('; ')}.`);
    }
  } else {
    out.push(
      '**Consulted by the row inputs:** not recorded — the ranking result carried no `consulted` list, ' +
        'so this section cannot say which sources were weighed.'
    );
  }
  if (corpus.cannotCheck.length === 0) {
    out.push('');
    out.push(`**Could not read:** nothing — all ${ADVISOR_SOURCES.length} sources were readable.`);
  } else {
    out.push('');
    out.push('**Could not read:**');
    out.push('');
    for (const c of corpus.cannotCheck) out.push(`- **${c.source}** — ${quoteSafe(c.reason)}`);
    out.push('');
    out.push(
      'Everything below is read from the sources that WERE readable. It is not a complete picture ' +
        'of this project, and the list above is why.'
    );
  }
  out.push('');

  if (digest) {
    out.push(`**Digest read** (re-read when this file was written): ${digest.checked.length > 0 ? digest.checked.join(' · ') : 'nothing'}.`);
    out.push('');
    if (digest.cannotCheck.length > 0) {
      out.push('**Digest could not read:**');
      out.push('');
      for (const c of digest.cannotCheck) out.push(`- **${quoteSafe(c.source)}** — ${quoteSafe(c.reason)}`);
      out.push('');
    }
    if (digest.cut.length > 0) {
      out.push(`**Digest cut to fit:** ${digest.cut.map((c) => quoteSafe(c)).join('; ')}.`);
      out.push('');
    }
  }

  // `B118`. Rendered before the ranking and outside the citation position on
  // purpose: the evidence is a STATE.md on another branch, which is not a file on
  // disk here, so it cannot carry a disk-resolved citation — and must not pretend to.
  const elsewhere = corpus.sources?.otherBranches;
  const unreadableBranches = elsewhere?.unreadable ?? [];
  if (elsewhere && (elsewhere.open.length > 0 || elsewhere.unclassified.length > 0 || unreadableBranches.length > 0)) {
    out.push('## Open on other branches');
    out.push('');
    if (elsewhere.open.length > 0) {
      out.push(
        'Finish these before starting any priority below. Each was read from that branch\'s ' +
          '`STATE.md`, so it cannot be cited against a file on this branch.'
      );
      out.push('');
      for (const o of elsewhere.open) {
        out.push(
          `- **${quoteSafe(o.epic)}** — at ${quoteSafe(o.phase ?? 'an unrecorded phase')} on ` +
            `${o.branches.map((b) => `\`${quoteSafe(b)}\``).join(', ')}; ${quoteSafe(nextStepFor(o))}`
        );
      }
      out.push('');
    }
    const names = (xs) => xs.map((b) => `\`${quoteSafe(b)}\``).join(', ');
    if (elsewhere.unclassified.length > 0) {
      out.push(
        `${elsewhere.unclassified.length} unmerged branch(es) carry a \`STATE.md\` with no Epic id, so they ` +
          `could not be compared: ${names(elsewhere.unclassified)}.`
      );
      out.push('');
    }
    if (unreadableBranches.length > 0) {
      out.push(
        `${unreadableBranches.length} branch(es) carry a \`STATE.md\` that could not be parsed, so anything ` +
          `open there is not listed: ${names(unreadableBranches)}.`
      );
      out.push('');
    }
  }

  out.push(`## ${L.citationRule}`);
  out.push('');
  out.push(
    'Every claim below ends with a citation naming a repo-root-relative path and line. Each one was ' +
      'resolved against disk before this file was written: the path had to exist and the line had to ' +
      'be inside it. A citation that did not resolve fails the run, and this file would not exist. ' +
      'What that does NOT check is whether the cited line says what the claim says it says.'
  );
  out.push('');

  // ── Priorities.
  out.push(`## ${L.priorities} — ${priorities.length}`);
  out.push('');
  priorities.forEach((p, i) => {
    out.push(`### ${i + 1}. ${quoteSafe(p.title)}`);
    out.push('');
    out.push(`${quoteSafe(p.why)} ${cite(...p.evidence)}`);
    out.push('');
    if (p.dependsOn?.length > 0) {
      const names = p.dependsOn.map((d) => `priority ${d} (${quoteSafe(priorities[d - 1]?.title ?? '?')})`);
      out.push(`**Comes after:** ${names.join(', ')}.`);
      out.push('');
    }
    out.push('Covers:');
    out.push('');
    // Covered labels are clipped and unbolded: a bug's headline can run to
    // several hundred characters, and a row heading can carry its own `**`, which
    // nests inside the bold below and renders as `****` (seen on the first run).
    const label = (c) => {
      const flat = String(c.label ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      return quoteSafe(flat.length > 160 ? `${flat.slice(0, 159)}…` : flat);
    };
    for (const c of p.covers) {
      if (c.kind === 'new') {
        out.push(`- **${label(c)}** — unfiled: not in the corpus yet, so there is no line to cite.`);
      } else if (c.kind === 'bug') {
        out.push(`- **\`${c.id}\`** ${label(c)} — open bug. ${cite(`${c.path}:${c.line}`)}`);
      } else {
        out.push(`- **${label(c)}** — backlog row. ${cite(`${c.path}:${c.line}`)}`);
      }
    }
    out.push('');
  });

  // ── Appendix: every live row exactly once, then every dropped row (AC3.4).
  const coveredAt = new Map();
  priorities.forEach((p, i) => {
    for (const c of p.covers) if (c.kind === 'row') coveredAt.set(`${c.path}:${c.line}`, i);
  });
  const rowLine = (s, extra = '') => {
    const note = extra || annotate(s);
    return `- **${quoteSafe(s.row.text)}**${note ? ` — ${note}` : ''} ${cite(`${s.row.path}:${s.row.line}`)}`;
  };
  out.push(`## ${L.appendix} — ${classified.live.length}`);
  out.push('');
  out.push(
    '**Not ranked.** Every live row appears exactly once: under the priority that covers it, or in ' +
      'the list after, in file order. Age is not an input. A row here was looked at, which is a ' +
      'different thing from a row nobody considered — the list is complete, not curated.'
  );
  out.push('');
  priorities.forEach((p, i) => {
    const under = classified.live.filter((s) => coveredAt.get(`${s.row.path}:${s.row.line}`) === i);
    if (under.length === 0) return;
    out.push(`### Under priority ${i + 1} — ${quoteSafe(p.title)}`);
    out.push('');
    for (const s of under) out.push(rowLine(s));
    out.push('');
  });
  const rest = classified.live.filter((s) => !coveredAt.has(`${s.row.path}:${s.row.line}`));
  out.push(`### Not covered by a priority — ${rest.length}, in file order`);
  out.push('');
  if (rest.length === 0) out.push('None.');
  for (const s of rest) out.push(rowLine(s));
  out.push('');
  if (classified.dropped.length > 0) {
    out.push(`### Dropped — ${classified.dropped.length}`);
    out.push('');
    for (const s of classified.dropped) out.push(rowLine(s, dropReason(s)));
    out.push('');
  }

  return out.join('\n');
}

/** The terminal read-out. Deliberately not the artifact — different audience, different length. */
export function formatAdviseSummary(result) {
  const lines = [];
  if (result.status === 'skipped') {
    lines.push(`/sig:advise wrote nothing — ${result.reason}`);
    for (const r of result.reasons ?? []) lines.push(`  - ${r}`);
    return lines.join('\n');
  }
  lines.push(`Backlog review — ${result.today}`);
  lines.push('');
  for (const o of result.corpus.sources?.otherBranches?.open ?? []) {
    lines.push(`  ⚠ ${o.epic} is open on ${o.branches.join(', ')} — finish it first: ${nextStepFor(o)}.`);
  }
  result.priorities.forEach((p, i) =>
    lines.push(`  ${i + 1}. ${p.title}${p.dependsOn?.length ? ` (after ${p.dependsOn.join(', ')})` : ''}`)
  );
  lines.push('');
  lines.push(
    `  ${result.classified.live.length} live row(s) in the appendix, unranked; ${result.classified.dropped.length} dropped, each with its reason.`
  );
  if (result.corpus.cannotCheck.length > 0) {
    lines.push(
      `  ⚠ ${result.corpus.cannotCheck.length} source(s) could not be read: ${result.corpus.cannotCheck
        .map((c) => c.source)
        .join(', ')}.`
    );
  }
  lines.push('');
  lines.push(`  ${result.status === 'written' ? 'Written to' : 'Unchanged at'} ${result.path}`);
  lines.push('  It changes nothing on its own.');
  return lines.join('\n');
}

/**
 * Write the advisory, idempotently.
 *
 * Byte-compare first: an unchanged artifact is `unchanged`, not a rewrite with a
 * new mtime. Uses `atomicWrite` + `assertRealInsidePlanning` — note that
 * `permissions-report.js` reaches for raw `writeFileSync` and is the OUTLIER
 * here, not the convention.
 */
export async function writeArtifact(baseDir, { name, content }) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const path = join(planningDir, name);
  const rel = `${PLANNING_DIR}/${name}`;

  if (!existsSync(planningDir)) {
    return { status: 'skipped', path: rel, reason: `${PLANNING_DIR}/ is not present — nothing to write into` };
  }
  assertRealInsidePlanning(baseDir, path, 'writeArtifact');
  const refusal = regularFileRefusal(baseDir, rel);
  if (refusal) return { status: 'skipped', path: rel, reason: refusal };

  if (existsSync(path)) {
    try {
      if ((await readFile(path, 'utf-8')) === content) {
        return { status: 'unchanged', path: rel, reason: null };
      }
    } catch {
      // Unreadable existing file — fall through and overwrite it.
    }
  }
  await atomicWrite(path, content);
  return { status: 'written', path: rel, reason: null };
}

/**
 * Cited lines that no longer carry what they were cited for.
 *
 * The advisor cites `path:line`, and a line number is only true for the file as it
 * was read. Any edit above a cited row shifts it silently, and the citation still
 * "resolves" because the line exists. This re-reads each cited file once and
 * checks each line still contains a distinctive slice of what it was cited for:
 * a row's heading, or a bug's id.
 *
 * ⚠ Deliberately NARROW. It compares the advisor's OWN claim against the line it
 * named — it is not a general "does this line say what the claim says" checker,
 * which stays unbuilt and stays documented as unbuilt. Priority `evidence` lines
 * outside these are checked for existence only, by the gate.
 */
async function findStaleCitations(baseDir, probes) {
  const byPath = new Map();
  const stale = [];
  for (const { path: rel, line, probe, probeRe } of probes) {
    if (!rel || !line || (!probe && !probeRe)) continue;
    if (!byPath.has(rel)) {
      try {
        byPath.set(rel, (await readFile(join(baseDir, rel), 'utf-8')).split('\n'));
      } catch {
        byPath.set(rel, null);
      }
    }
    const lines = byPath.get(rel);
    if (lines === null) continue; // unreadable is the citation gate's problem, not this one
    const onDisk = lines[line - 1] ?? '';
    const holds = probeRe ? probeRe.test(onDisk) : onDisk.includes(probe);
    if (!holds) stale.push({ path: rel, line, expected: probe ?? String(probeRe) });
  }
  return stale;
}

/** A row's distinctive slice: the renderer never rewrites a row, but a heading can carry decoration. */
function rowProbe(text) {
  return String(text ?? '').replace(/^[\s`*_~]+/, '').slice(0, 24);
}

/**
 * The artifact name for `stamp`, never replacing a file that holds a pick (AC4.3).
 *
 * `BACKLOG-REVIEW-<stamp>.md` when it is free or holds no pick (a same-day re-run
 * before anyone picked replaces it, byte-compared); otherwise the first free
 * `-N`. `tools/doc-budgets.json`'s exemption allows the suffix.
 */
export function nextArtifactName(baseDir, stamp, { readText = (p) => readFileSync(p, 'utf-8') } = {}) {
  const planningDir = join(baseDir, PLANNING_DIR);
  for (let n = 1; n < 1000; n++) {
    const name = `${ARTIFACT_PREFIX}${stamp}${n === 1 ? '' : `-${n}`}.md`;
    const path = join(planningDir, name);
    if (!existsSync(path) && !isLink(path)) return name;
    // Never read a link or a non-file at an advisory name: a link to /dev/zero ate
    // 13.9 GB before any validation ran (REVIEW pass 2). Treat it as taken.
    if (regularFileRefusal(baseDir, `${PLANNING_DIR}/${name}`)) continue;
    let text = '';
    try {
      text = readText(path);
    } catch {
      continue; // unreadable: do not overwrite what we cannot inspect
    }
    if (!hasPick(text)) return name;
  }
  throw new Error(`more than 999 advisories for ${stamp} — refusing to pick a name`);
}

/** One short reason a row was dropped, for a refusal message. */
function shortDropReason(s) {
  if (s.notLive.notLive) return `self-declared: \`${s.notLive.declaration}\``;
  if (s.dischargedElsewhere) return `discharged${s.staleEntry?.id ? ` (\`${s.staleEntry.id}\` reads closed)` : ''}`;
  return `folded: \`${s.moved.declaration}\``;
}

/**
 * Classify the corpus's rows with the discharge input. Shared by both steps, so
 * the digest offers exactly the rows the gate accepts (REVIEW pass 2).
 */
async function classifyCorpus(baseDir, corpus) {
  if (!corpus.sources.backlog) return null;
  let discharge = null;
  try {
    discharge = await backlogDischargeStatus(baseDir);
  } catch {
    discharge = null; // fail-open: an un-evaluable check narrows what can be dropped
  }
  const confirmedBugs = corpus.sources.bugs
    ? new Set(corpus.sources.bugs.entries.filter((e) => e.status === 'confirmed').map((e) => e.id))
    : null;
  return classifyRows(corpus.sources.backlog.rows, { stale: discharge?.stale ?? [], discharge, confirmedBugs });
}

/**
 * Step one of the run: read the corpus and build the digest the agent proposes
 * from. Writes nothing. The digest's backlog is the LIVE rows — the ones a
 * priority may cover.
 *
 * @returns {Promise<{corpus: object, classified: object|null, digest: object, digestText: string}>}
 */
export async function prepareAdvise(baseDir) {
  const corpus = await readCorpus(baseDir);
  const classified = await classifyCorpus(baseDir, corpus);
  const digest = await gatherBigPicture(baseDir, { corpus, classified });
  return { corpus, classified, digest, digestText: formatDigest(digest) };
}

/**
 * Step two: validate the agent's priorities, classify the rows, render, GATE, write.
 *
 * The corpus is read AGAIN here rather than reused from `prepareAdvise`, on
 * purpose: the proposal is checked against the files as they are at write time,
 * so a row that moved between proposing and writing is refused by name instead
 * of cited at the wrong line.
 *
 * `render` is injectable so the run-boundary test can feed a rendered string
 * carrying one bad citation — without that seam no natural input reaches the
 * failure (`B39`/`B75`).
 */
export async function runAdvise(baseDir, { today, priorities, render = renderArtifact, projectName } = {}) {
  const stamp = today ?? new Date().toISOString().slice(0, 10);
  const base = { today: stamp, corpus: null, classified: null, priorities: [], verification: null };
  if (!isValidStamp(stamp)) {
    return { ...base, status: 'skipped', path: null, reason: `today must be a real YYYY-MM-DD date, got ${JSON.stringify(stamp)}` };
  }
  const corpus = await readCorpus(baseDir);
  base.corpus = corpus;
  let name;
  try {
    name = nextArtifactName(baseDir, stamp);
  } catch (err) {
    return { ...base, status: 'skipped', path: null, reason: err.message };
  }
  const rel = `${PLANNING_DIR}/${name}`;

  if (corpus.sources.backlog === null) {
    const why = corpus.cannotCheck.find((c) => c.source === 'BACKLOG.md')?.reason ?? 'BACKLOG.md unreadable';
    return { ...base, status: 'skipped', path: rel, reason: why };
  }

  // Classified BEFORE validation, so a priority can only cover a row the appendix
  // will show as live (REVIEW pass 1: a covered Parked row rendered twice).
  const classified = await classifyCorpus(baseDir, corpus);
  base.classified = classified;

  const checked = await validatePriorities(baseDir, priorities, corpus, {
    liveRows: classified.live.map((s) => s.row),
    droppedRows: classified.dropped.map((s) => ({ path: s.row.path, line: s.row.line, why: shortDropReason(s) })),
  });
  if (!checked.ok) {
    return {
      ...base,
      status: 'skipped',
      path: rel,
      reason: `the proposed priorities were refused, so nothing was written (${checked.reasons.length} reason(s))`,
      reasons: checked.reasons,
    };
  }
  base.priorities = checked.priorities;

  let digest = null;
  try {
    digest = await gatherBigPicture(baseDir, { corpus, classified });
  } catch {
    digest = null; // the digest section is informational here; the gate does not depend on it
  }
  const artifact = render({ today: stamp, classified, priorities: checked.priorities, corpus, digest, projectName });

  // ── THE STALE-READ GUARD. The first artifact this command ever shipped had ~51
  // citations off by exactly 5 lines: a human edit above every cited row, after
  // the read. `verifyCitations` checks a line is WITHIN the file, never what it
  // says, so this re-reads and checks each cited row and bug line still carries it.
  const probes = [
    ...[...classified.live, ...classified.dropped].map((s) => ({ path: s.row.path, line: s.row.line, probe: rowProbe(s.row.text) })),
    ...checked.priorities.flatMap((p) =>
      p.covers.filter((c) => c.kind !== 'new').map((c) =>
        // A bug id word-bounded: `B1` must not be found inside `B12` (REVIEW pass 1).
        c.kind === 'bug'
          ? { path: c.path, line: c.line, probeRe: new RegExp(`(^|[^A-Za-z0-9])${c.id}([^0-9]|$)`) }
          : { path: c.path, line: c.line, probe: rowProbe(c.label) }
      )
    ),
  ];
  const staleCitations = await findStaleCitations(baseDir, probes);
  if (staleCitations.length > 0) {
    return {
      ...base,
      status: 'skipped',
      path: rel,
      reason:
        `${staleCitations.length} cited line(s) no longer carry what they were read for — the corpus changed ` +
        `between reading it and writing this artifact (first: ${staleCitations[0].path}:${staleCitations[0].line}). ` +
        'Re-run to regenerate against the current files',
    };
  }

  // ── THE RUN BOUNDARY. A count, not a flag (see the header note).
  //   claims = every evidence token + one per cited covered row/bug
  //            + one per appendix row (live and dropped).
  const verification = await verifyCitations(baseDir, artifact);
  base.verification = verification;
  // Counted in TOKENS on both sides, and compared for equality. The first version
  // counted one per priority against `resolved`'s one per token with `>=`, so a
  // priority's extra evidence tokens were slack that hid missing appendix
  // citations (REVIEW pass 1, reproduced with a render seam).
  const coveredCited = checked.priorities.reduce((n, p) => n + p.covers.filter((c) => c.kind !== 'new').length, 0);
  const evidenceTokens = checked.priorities.reduce((n, p) => n + p.evidence.length, 0);
  const claims = evidenceTokens + coveredCited + classified.live.length + classified.dropped.length;
  if (!verification.ok) {
    const detail = verification.truncated
      ? `the citation scan truncated at ${verification.truncated.limit} of ${verification.truncated.total}`
      : verification.unresolved.map((u) => `\`${u.raw}\` (${u.reason})`).join('; ');
    return { ...base, status: 'skipped', path: rel, reason: `citation check failed, so nothing was written — ${detail}` };
  }
  // Priorities are 3–5 and each carries at least one evidence token, so `claims`
  // is never zero here: the vacuous zero-claims pass cannot occur.
  if (verification.resolved.length !== claims) {
    return {
      ...base,
      status: 'skipped',
      path: rel,
      reason:
        `citation check resolved ${verification.resolved.length} citations for ${claims} claim(s), so nothing ` +
        'was written — every claim must carry one, and a passing check over too few is the vacuous case',
    };
  }

  // `writeArtifact` can throw on a symlinked or read-only `.planning/`; this
  // command's contract is that it reports what it could not do.
  let written;
  try {
    written = await writeArtifact(baseDir, { name, content: artifact });
  } catch (err) {
    return { ...base, status: 'skipped', path: rel, reason: `the artifact could not be written — ${err.message}`, artifact };
  }
  return { ...written, ...base, path: written.path, artifact };
}
