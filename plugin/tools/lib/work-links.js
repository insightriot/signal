// Relative links follow a body when it changes directory (M6.E11, D-M6E11-22).
//
// Item bodies were written from `.planning/` — `../analysis/X.md`,
// `M6.E7-RETROSPECTIVE.md`. In `work/backlog/` they are two levels deeper and
// in `work/done/YYYY-MM/` three, so every write and move rewrites relative
// targets for the new depth, and the generator rewrites them back when it
// prints a body into a `.planning/`-level file. Pure: text in, text out.
//
// Shared by the migration (forward), the generator (back) and, from S3, the
// store's moves — which is why it is its own module rather than living in one
// of them.
//
// ⚠ CODE IS NOT PROSE. `archive-tree.js`'s `LINK_RE` (the precedent,
// `computeLinkEdits`) runs over whole files; BUGS.md quotes `](*.md)` inside
// inline code in at least seven places (B24, B27, B28 …), and rewriting those
// would corrupt the record of the bug. So fenced blocks and inline code spans
// are skipped, and only the text between them is rewritten.

import { posix } from 'node:path';

// Same shape as archive-tree.js's LINK_RE: the target is everything up to the
// first `)`. The title, if any, is kept byte-for-byte.
const LINK_RE = /\]\(([^)]+)\)/g;
const SKIP_TARGET_RE = /^(?:[a-z][a-z0-9+.-]*:|#|\/|<|~)/i;

const isFence = (line) => {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
};

function rewriteTarget(raw, fromDir, toDir) {
  const m = raw.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!m) return raw;
  const [, lead, target, rest] = m;
  if (SKIP_TARGET_RE.test(target)) return raw;
  const cut = target.search(/[#?]/);
  const pathPart = cut === -1 ? target : target.slice(0, cut);
  const suffix = cut === -1 ? '' : target.slice(cut);
  if (pathPart === '') return raw;
  const abs = posix.normalize(posix.join(fromDir || '.', pathPart));
  let rel = posix.relative(toDir || '.', abs) || '.';
  if (pathPart.endsWith('/') && !rel.endsWith('/')) rel += '/';
  return `${lead}${rel}${suffix}${rest}`;
}

// Split a line into [text, isCode] segments by CommonMark's rule: a run of N
// backticks opens a span closed by the next run of exactly N. An unmatched
// run is literal text.
function codeSegments(line) {
  const out = [];
  let i = 0;
  let textStart = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let j = i;
    while (line[j] === '`') j++;
    const n = j - i;
    let k = j;
    let close = -1;
    while (k < line.length) {
      if (line[k] !== '`') {
        k++;
        continue;
      }
      let e = k;
      while (line[e] === '`') e++;
      if (e - k === n) {
        close = e;
        break;
      }
      k = e;
    }
    if (close === -1) {
      i = j;
      continue;
    }
    if (i > textStart) out.push([line.slice(textStart, i), false]);
    out.push([line.slice(i, close), true]);
    i = close;
    textStart = close;
  }
  if (textStart < line.length) out.push([line.slice(textStart), false]);
  return out;
}

/**
 * Rewrite every relative Markdown link target in `text` from `fromDir` to
 * `toDir`. Both are directories relative to the same root (Signal uses
 * `.planning/`, so `''` is `.planning/` itself and `work/backlog` is
 * `.planning/work/backlog/`).
 *
 * @param {string} text
 * @param {string} fromDir
 * @param {string} toDir
 * @returns {string}
 */
export function rewriteRelativeLinks(text, fromDir, toDir) {
  const from = posix.normalize(fromDir || '.');
  const to = posix.normalize(toDir || '.');
  if (from === to) return String(text);
  let fence = false;
  return String(text)
    .split('\n')
    .map((line) => {
      if (isFence(line)) {
        fence = !fence;
        return line;
      }
      if (fence || !line.includes('](')) return line;
      return codeSegments(line)
        .map(([seg, code]) => (code ? seg : seg.replace(LINK_RE, (all, raw) => `](${rewriteTarget(raw, from, to)})`)))
        .join('');
    })
    .join('\n');
}
