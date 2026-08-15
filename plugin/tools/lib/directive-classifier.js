// tools/lib/directive-classifier.js — the FR5 coverage-ceiling classifier (M5.E8.S1).
//
// PURPOSE
//   Answer one question over Signal's own `commands/*.md`: of the instructions
//   Signal gives an agent, how many leave a trace that a harness could observe?
//   The answer bounds everything M5.E8 can ever measure. It is computed BEFORE the
//   harness exists, deliberately, so the figure cannot be accused of having been
//   fitted to the tool that reports it.
//
//   This module is deterministic and offline. It lives IN the test suite (NFR1),
//   unlike the harness itself.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SPLIT RULE, WRITTEN DOWN (AC5.1)
//
//   It is a judgement call. It is written here in full so a reader can disagree
//   with it line by line rather than having to reverse-engineer a regex.
//
// STAGE 0 — lines excluded before anything else
//   YAML frontmatter, fenced code blocks (wholesale), ATX headings, blank lines,
//   horizontal rules, table separator rows, block quotes, and standalone HTML
//   comments. A trailing `<!-- ... -->` comment is stripped from an otherwise
//   normal line (this is what lets the test fixture carry inline hand-labels
//   without the label leaking into the classification).
//
// STAGE A — is the line a DIRECTIVE (does it instruct the agent to do something)?
//   After stripping list markers (`- `, `* `, `N. `), table cell pipes, and
//   emphasis markers, a line is a directive if EITHER:
//     A1. its first word is an imperative verb from the closed set below —
//         OR, when the line opens with a subordinate clause closed by a comma
//         ("Before any Workflow step, call ...", "If the tier skips it, exit"),
//         the first word after that comma is. Only the FIRST comma is tried, so
//         the extension cannot walk into the middle of a sentence.
//     A2. it contains an obligation marker: must, must not, never, always,
//         do not, don't, shall, required, refuse.
//
//   A1's clause extension exists because Signal's command files overwhelmingly
//   phrase instructions with a leading condition or timing clause. Without it the
//   rule silently drops the most common directive shape in the corpus — including
//   `execute.md`'s own "Before any Workflow step, call `transitionPhase(...)`",
//   which is this Epic's canary instruction. It was found by the hand-labelled
//   fixture disagreeing with the first implementation.
//
//   A2 is deliberately broad. An obligation stated in a command file IS an
//   instruction, whether or not it is phrased as a command ("You must never
//   rationalize a skipped test"). The cost of A2 is that prose *about* an
//   obligation gets counted too; that inflates the DENOMINATOR, which is the
//   conservative direction — it makes the measurable fraction look smaller, not
//   larger.
//
// STAGE B — is the directive TRACE-MEASURABLE?
//   B1. LIBRARY CALL — the line contains a backticked identifier followed by `(`
//       whose name is an ACTUAL export of `tools/lib/*.js`. Resolved against the
//       real export set at classify time, never against the shape: a line that
//       reads like a call but names a function that does not exist is NOT
//       measurable, because there is nothing to observe.
//   B2. ARTIFACT WRITE — a write verb (write/append/create/emit/record/stamp/
//       rewrite/generate/regenerate/update/save) that PRECEDES a named markdown
//       artifact (`FOO.md`, or a backticked path ending in `.md`) by at most
//       ARTIFACT_PROXIMITY_CHARS, with no sentence boundary between them.
//
//       The order-and-proximity requirement is not decoration. Mere
//       co-occurrence on the same line — the first implementation of this rule —
//       is close to meaningless in this corpus, where single lines run 600–950
//       characters. It produced nine false positives out of twenty-five hits,
//       every one of them the noun "record" or the phrase "write-only file"
//       sitting hundreds of characters from an artifact named for an unrelated
//       reason. They were found by hand-auditing all twenty-five, and they
//       inflated the MEASURABLE count — the dishonest direction, since this
//       classifier's output is a claim about how much Signal can see.
//
//   Anything else is NOT measurable. Not "probably fine", not "passing" —
//   unmeasured. That distinction is FR5's whole point and is stated again in the
//   published log (AC5.3).
//
// KNOWN LIMITS OF THIS RULE — stated, not hidden
//   • It is line-shaped. An instruction spanning three sentences across two lines
//     counts as one, two, or zero depending on where the author broke the line.
//   • B1 counts the NAMING of a call, not its execution. A command file that says
//     "call `readState`" is measurable in principle; whether any agent does it is
//     exactly what the harness is for.
//   • It cannot see conditional instructions ("if X, then call Y") as distinct
//     from unconditional ones. Both count as one directive.
//   • Prose-shaped guidance — "surface ambiguity", "don't rationalize", "gate at
//     product altitude" — is unmeasurable BY CONSTRUCTION here. That is the
//     finding, not a defect of the classifier.
//   • CHECKLIST ITEMS PHRASED AS COMPLETED STATES ARE NOT COUNTED. `ship.md`'s
//     "- [ ] README updated if the public API changed", "- [ ] All tests pass"
//     and the FR6 adherence line are conditions to verify, written as past
//     participles, so neither A1 nor A2 fires. Whether they are "directives" is
//     genuinely arguable; they are excluded here because the rule keys on
//     imperative form, and the exclusion is recorded rather than left for a
//     reader to discover by diffing the corpus. Noticed when FR6's own checklist
//     line was added and the published ceiling did not move.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Closed imperative-verb set (Stage A1). Extending it changes the number; that is
// why it is a listed constant and not an open-ended heuristic.
export const IMPERATIVE_VERBS = new Set([
  'add', 'append', 'apply', 'archive', 'ask', 'assert', 'avoid', 'begin', 'call',
  'capture', 'check', 'choose', 'classify', 'clear', 'close', 'commit', 'compare',
  'compute', 'confirm', 'continue', 'copy', 'count', 'create', 'delete', 'do',
  'emit', 'ensure', 'enumerate', 'exit', 'fail', 'flag', 'follow', 'gate',
  'generate', 'give', 'group', 'halt', 'include', 'keep', 'list', 'load', 'make',
  'mark', 'merge', 'move', 'name', 'open', 'parse', 'pass', 'pick', 'prefer',
  'print', 'proceed', 'publish', 'push', 'read', 'record', 'regenerate', 'reject',
  'release', 'remove', 'render', 'repeat', 'replace', 'report', 'require',
  'resolve', 'restore', 'return', 'reuse', 'rewrite', 'route', 'run', 'save',
  'scan', 'select', 'set', 'skip', 'spawn', 'split', 'stamp', 'start', 'stop',
  'store', 'substitute', 'surface', 'tag', 'track', 'treat', 'update', 'use',
  'validate', 'verify', 'walk', 'warn', 'write',
]);

// A1 clause extension — how far into a line the leading-clause comma may sit.
// Bounds the extension to an actual opening clause rather than any mid-sentence
// comma.
const CLAUSE_MAX_CHARS = 60;

// Stage A2 — obligation markers.
const OBLIGATION_RE = /\b(must not|must|never|always|do not|don't|shall|required|refuse)\b/i;

// Stage B2 — write verbs and the artifact shape they must co-occur with.
const WRITE_VERB_RE = /\b(write|writes|append|appends|create|creates|emit|emits|record|records|stamp|stamps|rewrite|rewrites|generate|generates|regenerate|regenerates|update|updates|save|saves)\b/gi;
const ARTIFACT_RE = /(`[^`]*\.md`|\b[A-Z][A-Za-z0-9._-]*\.md\b)/g;

// How far after a write verb its artifact may sit and still read as its object.
// The widest genuine pair in the corpus is 37 chars ("Append ... -log evict
// (FR5)**: closed-milestone `DECISIONS.md`"); the narrowest false positive was
// 110. 40 sits in that gap.
const ARTIFACT_PROXIMITY_CHARS = 40;

// A sentence boundary between verb and artifact breaks the object relationship
// regardless of distance.
const SENTENCE_BOUNDARY_RE = /[.!?](\s|$)/;

function namesArtifactWrite(text) {
  WRITE_VERB_RE.lastIndex = 0;
  const verbs = [...text.matchAll(WRITE_VERB_RE)];
  if (verbs.length === 0) return false;
  ARTIFACT_RE.lastIndex = 0;
  const artifacts = [...text.matchAll(ARTIFACT_RE)];
  if (artifacts.length === 0) return false;

  for (const v of verbs) {
    const verbEnd = v.index + v[0].length;
    for (const a of artifacts) {
      const gap = a.index - verbEnd;
      if (gap < 0 || gap > ARTIFACT_PROXIMITY_CHARS) continue;
      if (SENTENCE_BOUNDARY_RE.test(text.slice(verbEnd, a.index))) continue;
      return true;
    }
  }
  return false;
}

// Stage B1 — a backticked identifier immediately followed by `(`.
const CALL_RE = /`[^`]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Collect the real export names of every `tools/lib/*.js` module.
 * Regex-based on purpose: importing 263 exports to count them would execute
 * module top-level code, which this deterministic classifier must not do.
 */
export function collectLibExports(libDir) {
  const names = new Set();
  for (const file of readdirSync(libDir)) {
    if (!file.endsWith('.js')) continue;
    const src = readFileSync(join(libDir, file), 'utf-8');
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
      names.add(m[1]);
    }
    for (const m of src.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z0-9_]+)/gm)) {
      names.add(m[1]);
    }
  }
  return names;
}

// Strip a trailing HTML comment, list/step markers, table pipes, and emphasis.
function stripMarkup(line) {
  let s = line.replace(/<!--[\s\S]*?-->\s*$/, '');
  s = s.replace(/^\s*\|/, ' ').replace(/\|\s*$/, ' ').replace(/\|/g, ' ');
  s = s.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '');
  s = s.replace(/^\s*(?:\*\*|__|\*|_)+/, '');
  return s.trim();
}

function firstWord(text) {
  // Skip a leading backticked token or bracketed marker to reach the first word.
  const cleaned = text.replace(/^`[^`]*`\s*/, '').replace(/^\[[^\]]*\]\s*/, '');
  const m = cleaned.match(/^([A-Za-z']+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Classify a single line, assuming Stage-0 exclusions have already been applied
 * by the caller (classifyMarkdown does this). Safe to call directly on a bare
 * instruction line — that is how the unit tests use it.
 */
export function classifyLine(line, { libExports }) {
  const text = stripMarkup(line);
  if (!text) return { directive: false, measurable: null, reason: null };

  const fw = firstWord(text);
  let leadsWithImperative = fw !== null && IMPERATIVE_VERBS.has(fw);

  // A1's clause extension — "Before any Workflow step, call X" / "If T, exit".
  if (!leadsWithImperative) {
    const comma = text.indexOf(',');
    if (comma > 0 && comma <= CLAUSE_MAX_CHARS) {
      const after = firstWord(text.slice(comma + 1).trim());
      leadsWithImperative = after !== null && IMPERATIVE_VERBS.has(after);
    }
  }

  const isDirective = leadsWithImperative || OBLIGATION_RE.test(text);

  if (!isDirective) return { directive: false, measurable: null, reason: null };

  // Stage B1 — a named call that actually exists in tools/lib.
  CALL_RE.lastIndex = 0;
  for (const m of text.matchAll(CALL_RE)) {
    if (libExports.has(m[1])) {
      return { directive: true, measurable: true, reason: 'lib-call' };
    }
  }

  // Stage B2 — a write verb whose object is a named markdown artifact.
  if (namesArtifactWrite(text)) {
    return { directive: true, measurable: true, reason: 'artifact-write' };
  }

  return { directive: true, measurable: false, reason: 'no-trace' };
}

/**
 * Classify a whole markdown document. Applies the Stage-0 exclusions, then
 * classifyLine per surviving line. Returns per-line records (1-indexed, matching
 * an editor) plus counts.
 */
export function classifyMarkdown(content, { libExports }) {
  const rawLines = content.split('\n');
  const lines = [];
  let inFence = false;
  let inFrontmatter = false;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // Frontmatter: only when `---` opens line 1.
    if (i === 0 && trimmed === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }

    if (/^(```|~~~)/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;

    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;          // heading
    if (/^([-*_])\1{2,}$/.test(trimmed)) continue;     // horizontal rule
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;      // table separator row
    if (/^>/.test(trimmed)) continue;                  // block quote
    if (/^<!--/.test(trimmed)) continue;               // standalone HTML comment

    const verdict = classifyLine(raw, { libExports });
    if (verdict.directive) lines.push({ lineNo: i + 1, text: trimmed, ...verdict });
  }

  const measurable = lines.filter(l => l.measurable).length;
  return {
    lines,
    counts: {
      directives: lines.length,
      measurable,
      unmeasurable: lines.length - measurable,
      libCall: lines.filter(l => l.reason === 'lib-call').length,
      artifactWrite: lines.filter(l => l.reason === 'artifact-write').length,
    },
  };
}

/**
 * Classify every `commands/*.md` in the plugin root. This is the corpus that
 * produces the published ceiling.
 */
export function classifyCommandCorpus(rootDir) {
  // M6.E1: `rootDir` is the PLUGIN root — tools/lib is payload.
  const libExports = collectLibExports(join(rootDir, 'tools/lib'));
  const commandsDir = join(rootDir, 'commands');
  const files = [];

  for (const file of readdirSync(commandsDir).sort()) {
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(commandsDir, file), 'utf-8');
    const { lines, counts } = classifyMarkdown(content, { libExports });
    files.push({ file, counts, lines });
  }

  const counts = files.reduce(
    (acc, f) => ({
      directives: acc.directives + f.counts.directives,
      measurable: acc.measurable + f.counts.measurable,
      unmeasurable: acc.unmeasurable + f.counts.unmeasurable,
      libCall: acc.libCall + f.counts.libCall,
      artifactWrite: acc.artifactWrite + f.counts.artifactWrite,
    }),
    { directives: 0, measurable: 0, unmeasurable: 0, libCall: 0, artifactWrite: 0 }
  );

  return { files, counts };
}
