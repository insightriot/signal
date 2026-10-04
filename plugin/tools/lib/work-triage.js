// Triage proposals — the deterministic half of `/sig:item triage` (M6.E11
// t3.2, AC-5.3). Pure: keyword rules and title overlap, no model, no I/O, so
// the same items always propose the same thing. The command tells the agent
// to refine the proposal; nothing here pretends to have judged.
//
// Moved out of `work-ops.js` (M6.E13 t7.3 prep) so the v1 reader
// (`work-ops.js` `triageNext`) and the v2 reader (`work-records.js`
// `triageNext`) share one implementation — the arithmetic cannot drift
// between them. `work-ops.js` re-exports `proposeTriage` unchanged.
//
// An item here is the v1 shape: `{id, type, status, title?, theme?,
// priority?, source?}`, status a letter, `C` for closed. The v2 reader passes
// a *closing* record as `C`, as its v1 file was.

import { itemNumber } from './work-item.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'not', 'but', 'its',
  'has', 'have', 'when', 'what', 'why', 'how', 'should', 'does', 'can', 'all', 'any', 'one', 'our',
]);
const BUG_RE = /\b(bug|broken|breaks?|fails?|failing|failure|errors?|crash(?:es|ed)?|regression|wrong|incorrect|doesn['’]?t work)\b/i;
const QUESTION_START_RE = /^(should|how|what|why|which|when|where|do|does|can|is|are)\b/i;
const CHORE_RE = /\b(refactor|clean ?up|rename|typo|docs?|documentation|hygiene|chore|bump|upgrade|lint)\b/i;
const DUP_MIN = 0.5;
const THEME_MIN = 0.3;
const TITLE_MAX = 80;

function tokens(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

function titleFromBody(body) {
  const line = String(body ?? '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
    .find((l) => l !== '');
  if (!line) return undefined;
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function guessType(item, title, body) {
  if (item.type && item.type !== 'NEW') return { type: item.type, why: `already ${item.type}` };
  const source = String(item.source ?? '');
  if (/bug/i.test(source)) return { type: 'BUG', why: `source ${source}` };
  if (/question/i.test(source)) return { type: 'Q', why: `source ${source}` };
  const text = `${title ?? ''}\n${String(body ?? '').slice(0, 500)}`;
  const bug = text.match(BUG_RE);
  if (bug) return { type: 'BUG', why: `the word "${bug[1]}"` };
  const t = String(title ?? '').trim();
  if (t.endsWith('?') || QUESTION_START_RE.test(t)) return { type: 'Q', why: 'the title is a question' };
  const chore = text.match(CHORE_RE);
  if (chore) return { type: 'CHORE', why: `the word "${chore[1]}"` };
  return { type: 'FEAT', why: 'no bug, question or chore wording — the default' };
}

/**
 * The lib's proposal for one item. Pure and deterministic: a starting point
 * for the agent to refine, never a decision.
 *
 * @param {object} item
 * @param {string} body
 * @param {Array<{item: object}>} others — the store's items (closed ones and the item itself are ignored)
 * @returns {{type: string, title?: string, theme?: string, priority?: string|number,
 *   duplicates: Array<{id: string, title?: string, score: number}>, why: {type: string, theme?: string}}}
 */
export function proposeTriage(item, body, others = []) {
  const title = item.title ?? titleFromBody(body);
  const { type, why } = guessType(item, title, body);
  const mine = tokens(title);
  const scored = others
    .filter((o) => o.item.id !== item.id && o.item.status !== 'C')
    .map((o) => ({ id: o.item.id, title: o.item.title, theme: o.item.theme, score: jaccard(mine, tokens(o.item.title)) }))
    .filter((o) => o.score >= THEME_MIN)
    .sort((a, b) => b.score - a.score || itemNumber(a.id) - itemNumber(b.id));
  const duplicates = scored
    .filter((o) => o.score >= DUP_MIN)
    .slice(0, 5)
    .map(({ id, title: t, score }) => ({ id, title: t, score: Math.round(score * 100) / 100 }));
  const proposal = { type, duplicates, why: { type: why } };
  if (title !== undefined) proposal.title = title;
  if (item.theme !== undefined) {
    proposal.theme = item.theme;
  } else {
    const near = scored.find((o) => typeof o.theme === 'string');
    if (near) {
      proposal.theme = near.theme;
      proposal.why.theme = `the theme of ${near.id}, the closest open title`;
    }
  }
  if (item.priority !== undefined) proposal.priority = item.priority;
  return proposal;
}

