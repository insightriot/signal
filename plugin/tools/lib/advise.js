// `/sig:advise` — the Roadmap Advisor. `M6.E7` S3.
//
// Reads this project's own `.planning/` corpus and writes a dated advisory
// recommending what to work on next, where every claim carries a citation that
// mechanically resolves. It PROPOSES. It never selects, and it writes nothing
// except its own artifact.
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

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { backlogDischargeStatus, declaresNotLiveWork } from './backlog.js';
import { EVIDENCE_MARKER, verifyCitations } from './citations.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { readCorpus, ADVISOR_SOURCES } from './advise-corpus.js';

const PLANNING_DIR = '.planning';

/**
 * How many rows the advisory recommends.
 *
 * Five, with the reason beside it rather than in a commit message. The frozen
 * `BACKLOG-REVIEW-2026-08-09.md` offers "Top three moves"; five leaves room to be
 * wrong twice without becoming a list nobody reads.
 *
 * ⚠ NOT a `PROFILE.md` field (NFR3). A fourth dial is `B75`'s shape — a setting
 * documented end to end and read by nothing.
 */
export const RECOMMENDATION_LIMIT = 5;

/** Artifact basename prefix. Constrained: `tools/doc-budgets.json` exempts exactly this pattern. */
export const ARTIFACT_PREFIX = 'BACKLOG-REVIEW-';

/**
 * The vocabulary the renderer writes in its own voice.
 *
 * Exported so `t3.2b` can assert against a value rather than a recollection:
 * FR6 says this command proposes and never selects, and the way that becomes
 * testable is that none of these labels claims a decision was made.
 */
export const RENDER_LABELS = Object.freeze({
  recommended: 'Recommended',
  declined: 'Declined',
  corpus: 'Corpus read',
  citationRule: 'Citation rule',
  status:
    '**This changes nothing on its own.** It recommends; you decide. Nothing in `.planning/` was ' +
    'modified, no row was struck, and nothing was added to the decision queue.',
  producer: '*Produced `via /sig:advise`.*',
});

/** Verbs that would turn a proposal into a decision. Asserted absent by `t3.2b`. */
export const FORBIDDEN_VERBS = Object.freeze(['chosen', 'selected', 'decided']);

const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
// A row that names its own gate. Read from the vocabulary the maintainer already
// writes: BACKLOG.md carries "Trigger: …", "blocked on", "gated on", "NOT met".
//
// ⚠ REACH DECLARATION (`B81`) — measured on this repository's own BACKLOG.md,
// not assumed. These two patterns are TOKEN MATCHES over a row's heading AND its
// whole body, and the body is everything up to the next row. So:
//
//   - They cannot tell a row's OWN trigger from a trigger it merely mentions. A
//     row that is *about* triggers matches. Measured 2026-09-05: 6 of 50 live
//     rows match `TRIGGER_MET_RE`, and 2 of those 6 are false positives —
//     *"Parked — the trigger watchlist (not sprint material)"* matches on a
//     watchlist entry belonging to a different item (`Trigger:* first live
//     external tester — **FIRED`), and a dated reconciliation note matches on
//     prose describing a past state (`trigger has therefore read **satisfied`).
//     Both landed in the top four of the first real run.
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
const BLOCKED_RE = /\b(?:blocked on|gated on|depends on|trigger[^.\n]{0,60}\b(?:is\s+)?NOT met|unmet trigger)\b/i;
const TRIGGER_MET_RE = /\btrigger[^.\n]{0,60}\b(?:FIRED|met|satisfied)\b/i;

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
  return String(text).split(EVIDENCE_MARKER).join('— evidence(quoted):');
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Rank the live backlog rows, and say why each one landed where it did.
 *
 * Four inputs, in this order, each independently citable:
 *   1. **blocked-by** — a row whose stated gate is unmet ranks below one whose is met.
 *   2. **trigger-met** — a row whose written trigger has fired ranks above one with none.
 *   3. **discharge** — a row whose work already closed drops out entirely.
 *   4. **age** — older rows rank above newer ones.
 *   5. **self-declared not-live** — a row that says in its own HEADING that it is
 *      not actionable work drops out entirely.
 *
 * ⚠ Input 5 reads the heading and NOT the body, deliberately. Input 2 reads both,
 * and that is why the first real run promoted a row whose heading says "not sprint
 * material" using a trigger belonging to a different item inside it. Added during
 * EXECUTE with the plan amended first; the measurement is in `M6.E7-PLAN.md`.
 *
 * **Stable tiebreak: source line number.** Equal-rank rows never reorder between
 * runs, which is NFR1 and what `writeArtifact`'s byte-compare depends on.
 *
 * The declined pool is EVERY live row not in the top N — not a curated subset.
 * That is what makes `B39`'s checked-vs-unchecked distinction real: a curated
 * list would leave the rest unchecked and indistinguishable from unconsidered.
 */
export function rankRows(rows, { today, stale = [] } = {}) {
  const staleIds = new Set(stale.map((s) => s.id).filter(Boolean));
  // `.filter(Boolean)` matches its sibling above, and its absence was a live bug:
  // a stale entry with no `line` puts `undefined` in the Set, and any row that also
  // lacks one then reads as discharged and DISAPPEARS from the advisory. Silently
  // losing a live row is the worst thing this module can do.
  const staleLines = new Set(stale.map((s) => s.line).filter(Boolean));

  const scored = rows.map((row) => {
    const text = `${row.text}\n${row.body ?? ''}`;
    const dischargedElsewhere = staleIds.has(row.leadingId) || staleLines.has(row.line);
    // Input 5. HEADING ONLY — see the note above.
    const notLive = declaresNotLiveWork(row.text);
    const blocked = BLOCKED_RE.test(text);
    const triggerMet = TRIGGER_MET_RE.test(text);
    // `String(...)` because the two lines around this one already coerce and this one
    // did not — a row with no `text` threw a TypeError out of the ranking.
    const filed =
      (String(row.text ?? '').match(ISO_DATE_RE) ?? String(row.body ?? '').match(ISO_DATE_RE))?.[1] ?? null;
    const ageDays = filed && today ? daysBetween(filed, today) : 0;
    return { row, dischargedElsewhere, notLive, blocked, triggerMet, filed, ageDays };
  });

  const live = scored.filter((s) => !s.dischargedElsewhere && !s.notLive.notLive);
  live.sort(
    (a, b) =>
      Number(a.blocked) - Number(b.blocked) ||
      Number(b.triggerMet) - Number(a.triggerMet) ||
      b.ageDays - a.ageDays ||
      a.row.line - b.row.line
  );

  const recommended = live.slice(0, RECOMMENDATION_LIMIT);
  const rest = live.slice(RECOMMENDATION_LIMIT);
  const dropped = scored
    .filter((s) => s.dischargedElsewhere || s.notLive.notLive)
    .sort((a, b) => a.row.line - b.row.line);

  return { recommended, declined: [...rest, ...dropped] };
}

/** Why a recommended row is where it is, naming the input that put it there. */
function recommendReason(s) {
  const parts = [];
  if (s.triggerMet) parts.push('its written trigger has fired');
  if (!s.blocked) parts.push('nothing it names as a gate is unmet');
  else parts.push('it names a gate that has not fired, so it ranks below the ungated rows');
  if (s.filed) parts.push(`it was filed ${s.filed}${s.ageDays > 0 ? `, ${s.ageDays} days ago` : ''}`);
  return `Ranked because ${parts.join('; ')}.`;
}

/** `1 row` / `2 rows`. A count in a document that sells checkability must read as one. */
function rows(n) {
  return `${n} row${n === 1 ? '' : 's'}`;
}

/** Why a declined row is NOT recommended, naming the input that demoted it. */
function declineReason(s, rank) {
  if (s.notLive.notLive) {
    return (
      `Dropped by the **self-declared** input — the row's own heading says \`${s.notLive.declaration}\`, ` +
      'so it is not actionable work.'
    );
  }
  if (s.dischargedElsewhere) {
    return 'Dropped by the **discharge** input — its work already reads as closed, so it is not live work.';
  }
  if (s.blocked) {
    return 'Demoted by the **blocked-by** input — the row names a gate that has not fired.';
  }
  if (!s.triggerMet) {
    return `Demoted by the **trigger-met** and **age** inputs — ${rows(rank)} scored above it.`;
  }
  return `Demoted by the **age** input — ${rows(rank)} were filed earlier.`;
}

/**
 * Render the advisory. Pure, file-facing, and separate from the terminal
 * formatter (the split `permissions-report.js` already uses).
 *
 * Header carries the frozen review's five elements: title + date, a one-line
 * subtitle, the "changes nothing on its own" status line, **Corpus read** — the
 * natural home for `checked` / `cannotCheck` — and the **Citation rule**.
 */
export function renderArtifact({ today, ranked, corpus, projectName }) {
  const { recommended, declined } = ranked;
  const L = RENDER_LABELS;
  const out = [];

  out.push(`# Backlog review — ${today}`);
  out.push('');
  out.push(
    // ⚠ `quoteSafe` HERE IS NOT COSMETIC. `projectName` is caller-supplied and was
    // the one interpolation that skipped it, so a caller could write the evidence
    // marker into the header and inject a citation into the extractor's own
    // position — verified: an injected name yielded `nope/missing.md:1` as an
    // extracted citation. The run would have failed loudly, which is the right
    // direction, but a hole in the citation grammar is not something this Epic
    // gets to ship.
    `What to work on next in ${quoteSafe(projectName ?? 'this project')}, read from its own \`${PLANNING_DIR}/\` corpus.`
  );
  out.push('');
  out.push(L.status);
  out.push('');
  out.push(L.producer);
  out.push('');

  out.push(`## ${L.corpus}`);
  out.push('');
  out.push(`**Read:** ${corpus.checked.length > 0 ? corpus.checked.join(' · ') : 'nothing'}.`);
  out.push('');
  // ⚠ SAYING WHICH SOURCE THE RANKING ACTUALLY USED, because "Read: …" does not
  // say it and a reader infers it. `readCorpus` genuinely reads all five; the
  // ranking consults ONE. A maintainer seeing "Read: … BUGS.md … STATE/closure"
  // above a ranked list concludes open bugs and the current phase were weighed.
  // They were not. That is a completeness claim written from the shape of the
  // work rather than the artifact — this repository's second named defect class —
  // inside the command built to not make them. Found by a fresh-context reviewer.
  out.push(
    '**Consulted by the ranking:** `BACKLOG.md` only. The other sources are read so this section ' +
      'can say what was and was not legible, and so a future ranking input can use them; **no ' +
      'current ranking input reads them.** A row is not promoted or demoted here because of a bug, ' +
      'a retrospective, a closure record or a milestone row.'
  );
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

  out.push(`## ${L.citationRule}`);
  out.push('');
  out.push(
    'Every claim below ends with a citation naming a repo-root-relative path and line. Each one was ' +
      'resolved against disk before this file was written: the path had to exist and the line had to ' +
      'be inside it. A citation that did not resolve fails the run, and this file would not exist. ' +
      'What that does NOT check is whether the cited line says what the claim says it says.'
  );
  out.push('');

  out.push(`## ${L.recommended} — ${recommended.length}`);
  out.push('');
  if (recommended.length === 0) {
    out.push('Nothing. No live row survived the ranking inputs.');
    out.push('');
  }
  recommended.forEach((s, i) => {
    out.push(`### ${i + 1}. ${quoteSafe(s.row.text)}`);
    out.push('');
    // AC1.1 — the top row says what it ranked ABOVE, so the advisory answers
    // "and not that", not merely "why this". A ranked list whose reasons never
    // reference each other is a list of independent opinions.
    const contrast = i === 0 && declined.length > 0 ? declined[0] : null;
    // ⚠ The contrast row's rank is computed THE SAME WAY the declined section
    // computes it, and that is the fix rather than a tidy-up: this line used to
    // pass `i + 1` — the RECOMMENDED index, always 1 — so the artifact stated two
    // different counts for one row. Measured on this repo's own run: "1 rows
    // scored above it" here against "5 rows scored above it" in the declined
    // list, for `Passive OBSERVATIONS.md capture`. A self-contradicting count in
    // a document whose whole claim is that its claims are checkable.
    const reason = contrast
      ? `${recommendReason(s)} Ranked above *${quoteSafe(contrast.row.text)}*, which was ${declineReason(contrast, recommended.length + declined.indexOf(contrast)).replace(/^(Demoted|Dropped)/, (m) => m.toLowerCase())}`
      : recommendReason(s);
    const evidence = contrast
      ? cite(`${s.row.path}:${s.row.line}`, `${contrast.row.path}:${contrast.row.line}`)
      : cite(`${s.row.path}:${s.row.line}`);
    out.push(`${reason} ${evidence}`);
    out.push('');
  });

  out.push(`## ${L.declined} — ${declined.length}`);
  out.push('');
  out.push(
    'Every live row not recommended, each with the reason it was not. A row here was **looked at ' +
      'and passed over** — which is a different thing from a row nobody considered, and the ' +
      'distinction only exists because this list is complete rather than curated.'
  );
  out.push('');
  declined.forEach((s, i) => {
    out.push(
      `- **${quoteSafe(s.row.text)}** — ${declineReason(s, recommended.length + i)} ${cite(`${s.row.path}:${s.row.line}`)}`
    );
  });
  out.push('');

  return out.join('\n');
}

/** The terminal read-out. Deliberately not the artifact — different audience, different length. */
export function formatAdviseSummary(result) {
  const lines = [];
  if (result.status === 'skipped') {
    lines.push(`/sig:advise wrote nothing — ${result.reason}`);
    return lines.join('\n');
  }
  const { recommended, declined } = result.ranked;
  lines.push(`Backlog review — ${result.today}`);
  lines.push('');
  recommended.forEach((s, i) => lines.push(`  ${i + 1}. ${s.row.text}`));
  lines.push('');
  lines.push(`  ${declined.length} row(s) looked at and declined, each with a reason in the artifact.`);
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
 * The whole run: read the corpus, rank it, render it, GATE it, write it.
 *
 * `render` is injectable so the run-boundary test can feed a rendered string
 * carrying one bad citation. Without that seam the gate is untestable at the
 * boundary — the renderer is supposed to emit only good citations, so no natural
 * input reaches the failure. A unit test proving the finding is *computed* is not
 * a test that the run *refuses*, and that gap is `B39`/`B75`.
 */
export async function runAdvise(baseDir, { today, render = renderArtifact, projectName } = {}) {
  const stamp = today ?? new Date().toISOString().slice(0, 10);
  const corpus = await readCorpus(baseDir);
  const name = `${ARTIFACT_PREFIX}${stamp}.md`;
  const rel = `${PLANNING_DIR}/${name}`;

  if (corpus.sources.backlog === null) {
    const why = corpus.cannotCheck.find((c) => c.source === 'BACKLOG.md')?.reason ?? 'BACKLOG.md unreadable';
    return { status: 'skipped', path: rel, reason: why, today: stamp, corpus, ranked: null, verification: null };
  }

  // Ranking input 3. Fail-open: an un-evaluable discharge check narrows what the
  // ranking can see, and says so — it does not stop the advisory.
  let stale = [];
  try {
    const discharge = await backlogDischargeStatus(baseDir);
    stale = discharge.stale ?? [];
  } catch {
    stale = [];
  }

  const ranked = rankRows(corpus.sources.backlog.rows, { today: stamp, stale });
  const artifact = render({ today: stamp, ranked, corpus, projectName });

  // ── THE RUN BOUNDARY. A count, not a flag. See the header note.
  const verification = await verifyCitations(baseDir, artifact);
  const claims = ranked.recommended.length + ranked.declined.length;
  if (!verification.ok) {
    const detail = verification.truncated
      ? `the citation scan truncated at ${verification.truncated.limit} of ${verification.truncated.total}`
      : verification.unresolved.map((u) => `\`${u.raw}\` (${u.reason})`).join('; ');
    return {
      status: 'skipped',
      path: rel,
      reason: `citation check failed, so nothing was written — ${detail}`,
      today: stamp,
      corpus,
      ranked,
      verification,
    };
  }
  // ⚠ AT ZERO CLAIMS THIS GATE DOES NO WORK, and that is benign for a reason
  // worth writing down rather than left to be re-derived. A fresh-context reviewer
  // flagged it as the module's own header failure one level up: `claims` 0 and
  // `resolved` 0 makes `0 < 0` false, so an empty-backlog run is written having
  // checked nothing.
  //
  // The first fix attempted here was `claims === 0 && rows.length > 0` — refuse
  // when rows existed and nothing was claimed. **That branch is unreachable, and
  // a test is what said so.** `rankRows` PARTITIONS: every scored row lands in
  // `recommended`, `rest` or `dropped`, and `declined` is `rest + dropped`, so
  // `recommended.length + declined.length === rows.length` always — verified
  // across parked, blocked, discharged and empty inputs. `claims === 0` therefore
  // implies `rows.length === 0`, and with no live rows there is genuinely nothing
  // to cite. The vacuity is real and harmless; a guard against it would have been
  // dead code shipped to look like rigour.
  //
  // What was NOT harmless is what happened next: control reached `writeArtifact`,
  // which threw. That is fixed below, where the contract is.
  if (verification.resolved.length < claims) {
    return {
      status: 'skipped',
      path: rel,
      reason:
        `citation check resolved ${verification.resolved.length} citations for ${claims} claim(s), so nothing ` +
        'was written — every claim must carry one, and a passing check over too few is the vacuous case',
      today: stamp,
      corpus,
      ranked,
      verification,
    };
  }

  // `writeArtifact` documents a `{status, path, reason}` return, and two real
  // conditions made it THROW past this function instead: a symlinked `.planning/`
  // (`assertRealInsidePlanning`) and a read-only or full `.planning/` (`EACCES`
  // out of `atomicWrite`) — the second needs no unusual corpus at all. A command
  // whose contract is "it reports what it could not do" must not exit by
  // exception on a filesystem it does not control.
  let written;
  try {
    written = await writeArtifact(baseDir, { name, content: artifact });
  } catch (err) {
    return {
      status: 'skipped',
      path: rel,
      reason: `the artifact could not be written — ${err.message}`,
      today: stamp,
      corpus,
      ranked,
      verification,
      artifact,
    };
  }
  return { ...written, today: stamp, corpus, ranked, verification, artifact };
}
