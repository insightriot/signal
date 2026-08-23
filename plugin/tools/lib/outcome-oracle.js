// "How will we know this worked?" — the outcome oracle, asked at DISCUSS.
//
// WHY IT IS NOT THE ACCEPTANCE CRITERIA WE ALREADY HAVE. Signal's REQUIREMENTS
// carry stranger-verifiable acceptance criteria, and those are a **completion**
// oracle: they say when the thing is BUILT. This asks a different question —
// how you would know it WORKED, once built and in use. A feature can satisfy
// every acceptance criterion and change nothing anyone cares about. Without the
// question, the agent makes that product call by default, which is the standing
// "gate at product altitude" norm arriving as an input rather than an interrupt.
//
// ⚠ THE DESIGN CONSTRAINT IS THE WHOLE DIFFICULTY, and it is stated in the
// backlog item that commissioned this: for infrastructure and tooling work an
// outcome metric FREQUENTLY DOES NOT EXIST. So *"no outcome metric, and here is
// why"* must be a **valid, recorded answer** — a first-class outcome, not a
// loophole. A gate that cannot be satisfied honestly is a gate that gets
// rationalized past, which would be the anti-rationalization failure arriving
// by way of the mechanism built to prevent it.
//
// What stops the escape hatch swallowing the gate is not refusing it — it is
// requiring the REASON to be substantive. That is `M5.E10`'s rule applied one
// artifact over: present-but-vacuous fails, not merely present-but-empty. The
// byte floor below is the same instrument `verification-template.js` uses on
// its "what this could not establish" section, and for the same reason: it is
// the section most likely to be answered with a single word, and the one whose
// emptiness is least visible to a reader.
//
// ⚠ WHAT THIS DOES NOT DO. It reads TOKENS. A section that names a metric
// nobody will ever look at, or gives a fluent reason that is untrue, passes.
// This is the same limit `M5.E10` published for its seven checks and the same
// one `B75`'s ask-record carries — the semantic half is not built here either.

/** Tiers that ask. SPIKE and SKETCH do not — exploratory and one-shot work. */
const REQUIRED_TIERS = new Set(['FULL', 'FEATURE']);
const KNOWN_TIERS = new Set(['FULL', 'FEATURE', 'SPIKE', 'SKETCH']);

/**
 * Minimum bytes for a "no metric" justification.
 *
 * Calibrated against the shortest HONEST refusal this repo could produce for
 * its own work — e.g. "Internal tooling with no user-facing surface; the only
 * observable outcome is whether the check fires on real projects, measured at
 * the next corpus run." That is ~150 bytes. Set at 80 so a genuine one-sentence
 * reason passes and a bare "N/A", "none", or "not applicable" cannot.
 */
export const REASON_MIN_BYTES = 80;

/** Headings accepted for the section, in the order a writer is likely to reach for. */
export const OUTCOME_HEADINGS = [
  'Outcome',
  'Outcome oracle',
  'How we will know this worked',
  "How we'll know this worked",
  'Measurable outcome',
];

/**
 * Phrases that DECLINE a metric. Matched case-insensitively at the section
 * level. Deliberately explicit rather than clever: an agent asked to write "no
 * metric, and why" should be able to read this list and know it will be
 * understood, instead of guessing at a parser.
 */
const DECLINE_RE =
  /\b(no (outcome )?metric|not measurable|no measurable outcome|cannot be measured|no outcome oracle)\b/i;

/** Bare non-answers — a decline with nothing after it. */
const BARE_NON_ANSWER_RE = /^(n\/?a|none|nothing|tbd|unknown|-|—|\[FILL IN[^\]]*\])\.?$/i;

/** True when this tier asks the question at all. */
export function outcomeOracleRequired(tier) {
  if (!KNOWN_TIERS.has(tier)) {
    throw new Error(
      `outcomeOracleRequired: unknown tier "${tier}" (expected one of FULL, FEATURE, SPIKE, SKETCH)`
    );
  }
  return REQUIRED_TIERS.has(tier);
}

/** Split markdown into `{heading: body}` for `##`-level headings and deeper. */
function sectionsOf(content) {
  const out = {};
  let current = null;
  for (const line of String(content ?? '').split('\n')) {
    const m = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (m) {
      current = m[1].replace(/[*_`]/g, '').trim();
      out[current] = '';
      continue;
    }
    if (current !== null) out[current] += line + '\n';
  }
  return out;
}

function findOutcomeSection(content) {
  const sections = sectionsOf(content);
  const wanted = new Set(OUTCOME_HEADINGS.map((h) => h.toLowerCase()));
  for (const [heading, body] of Object.entries(sections)) {
    if (wanted.has(heading.toLowerCase())) return { heading, body };
  }
  return null;
}

/**
 * Check a REQUIREMENTS artifact for its outcome oracle.
 *
 * @param {string|null|undefined} content - the REQUIREMENTS body
 * @param {string} tier
 * @returns {{
 *   status: 'not-required'|'metric'|'declined-with-reason'|'missing'|'empty'|'vacuous',
 *   ok: boolean,
 *   heading: string|null,
 *   reason: string|null,
 * }}
 */
export function checkOutcomeOracle(content, tier) {
  if (!outcomeOracleRequired(tier)) {
    return { status: 'not-required', ok: true, heading: null, reason: null };
  }

  const found = findOutcomeSection(content);
  if (!found) {
    return {
      status: 'missing',
      ok: false,
      heading: null,
      reason:
        `${tier} asks how we will know this worked, and REQUIREMENTS has no outcome section. ` +
        `Add one headed "${OUTCOME_HEADINGS[0]}". **"No outcome metric, and here is why" is a ` +
        `valid answer** — infrastructure and tooling work frequently has none — but it has to be ` +
        `written down, because the alternative is the agent deciding by default.`,
    };
  }

  const body = found.body.trim();
  if (body.length === 0) {
    return {
      status: 'empty',
      ok: false,
      heading: found.heading,
      reason: `"${found.heading}" is present but empty. Either state the outcome measure, or say there is none and why.`,
    };
  }

  const declines = DECLINE_RE.test(body) || BARE_NON_ANSWER_RE.test(body);
  if (!declines) {
    // A stated measure. Not judged further — see the header's note on tokens.
    return { status: 'metric', ok: true, heading: found.heading, reason: null };
  }

  const bytes = Buffer.byteLength(body, 'utf-8');
  if (BARE_NON_ANSWER_RE.test(body) || bytes < REASON_MIN_BYTES) {
    return {
      status: 'vacuous',
      ok: false,
      heading: found.heading,
      reason:
        `"${found.heading}" declines to give a measure but does not say why ` +
        `(${bytes} bytes, minimum ${REASON_MIN_BYTES}). Declining is legitimate and common — ` +
        `for tooling it is usually the honest answer — but an unexplained decline is ` +
        `indistinguishable from not having thought about it, and that is what turns this ` +
        `question into one everybody types "N/A" into.`,
    };
  }

  return { status: 'declined-with-reason', ok: true, heading: found.heading, reason: null };
}
