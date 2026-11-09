// The two slim-Signal checks around a build (`.planning/SLIM-SIGNAL.md`, pieces 2 and 5), as pure
// functions over a project's plain `.md` records. The hooks `show-open-items.js` and
// `check-limits-filed.js` call these.
//
// Before a build: when the prompt names a backlog entry by its heading, the agent is handed the
// other entries in the same `##` section of BACKLOG.md, open and done (a done entry's notes often
// name limits that are still open), plus open BUGS.md entries that name a file the section names.
// The rule comes from Step 3 run 3: every open item that touched a later feature sat in the same
// section, and the agents that missed them never read that section.
//
// After a build: the limits the agent names in its final message must be filed as open entries,
// not left as sentences inside the entry it just marked done.

const HEADING_RE = /^(#{2,6})\s+(.*\S)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
/** A heading whose title is struck through (`~~title~~`), or that says DONE / fixed / closed. */
const DONE_HEADING_RE = /^~~|\bDONE\b|\*\*(?:fixed|closed|resolved)\b/i;
/** A path-like token in backticks: has a slash or a file extension. */
const FILE_TOKEN_RE = /`([^`\s]*(?:\/[^`\s]*|\.[a-z]{1,5}))`/gi;

/**
 * Every heading at level 2 to 6 with the text under it, outside code fences.
 * @returns {{level:number, heading:string, title:string, done:boolean, section:string|null, body:string, line:number}[]}
 */
export function parseEntries(md) {
  const lines = String(md ?? '').split(/\r?\n/);
  const entries = [];
  let fence = false;
  let section = null;
  let cur = null;
  lines.forEach((text, i) => {
    if (FENCE_RE.test(text)) fence = !fence;
    const m = fence ? null : text.match(HEADING_RE);
    if (!m) {
      if (cur) cur.lines.push(text);
      return;
    }
    const level = m[1].length;
    if (level === 2) section = m[2];
    cur = { level, heading: m[2], title: titleOf(m[2]), done: DONE_HEADING_RE.test(m[2]), section, lines: [], line: i + 1 };
    entries.push(cur);
  });
  return entries.map(({ lines: l, ...e }) => ({ ...e, body: l.join('\n').trim() }));
}

/** The words of a heading without strike marks, tags after ` · `, or an issue number. */
export function titleOf(heading) {
  return heading
    .replace(/~~/g, '')
    .split(' · ')[0]
    .replace(/^#\d+\s+[—-]\s+/, '')
    .replace(/[*_`]/g, '')
    .trim();
}

const norm = (s) => s.toLowerCase().replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();

/**
 * The backlog entry the prompt names: an entry (level 3 or deeper) whose title appears in the
 * prompt. The longest title wins; titles shorter than 12 characters are never matched, so an
 * everyday prompt does not trip a one-word heading.
 */
export function findTarget(prompt, entries) {
  const p = norm(prompt);
  let best = null;
  for (const e of entries) {
    if (e.level < 3 || e.title.length < 12) continue;
    if (p.includes(norm(e.title)) && (!best || e.title.length > best.title.length)) best = e;
  }
  return best;
}

const filesIn = (text) => new Set([...String(text).matchAll(FILE_TOKEN_RE)].map((m) => m[1]));

/**
 * The items to show before building `target`: every other entry in its `##` section, and every
 * open BUGS.md entry that names a file the section names.
 * @returns {{open: object[], done: object[], bugs: object[]}}
 */
export function relevantItems(target, backlogEntries, bugEntries = []) {
  const same = backlogEntries.filter((e) => e !== target && e.level >= 3 && target.section !== null && e.section === target.section);
  const files = filesIn([target.body, ...same.map((e) => e.body)].join('\n'));
  const bugs = bugEntries.filter((b) => !b.done && [...filesIn(b.body + ' ' + b.heading)].some((f) => files.has(f)));
  return { open: same.filter((e) => !e.done), done: same.filter((e) => e.done), bugs };
}

const MAX_CHARS = 24000;

/** The context printed into the session before the build starts. */
export function renderBeforeBuild(target, { open, done, bugs }) {
  const block = (e, file) => `#### ${e.heading}  (${file}, line ${e.line})\n${e.body}\n`;
  const parts = [
    `Signal: before you build "${target.title}", here are the project's records that sit beside it.`,
    `Open items in the same backlog section ("${target.section}"):`,
    ...(open.length ? open.map((e) => block(e, 'BACKLOG.md')) : ['(none)\n']),
    `Done items in that section. Their notes may name limits that are still open:`,
    ...(done.length ? done.map((e) => block(e, 'BACKLOG.md')) : ['(none)\n']),
  ];
  if (bugs.length) parts.push('Open bugs that name a file this section names:', ...bugs.map((e) => block(e, 'BUGS.md')));
  parts.push(
    'Before you edit any code, decide for each item or limit above that touches what you are about to change: ' +
      'fix it in this build, or say in your final message that you are leaving it and why.',
    'When you finish, file every limit or follow-up you name as its own open entry in .planning/BACKLOG.md ' +
      '(or BUGS.md for a bug), or as bullets under one new open "<feature> follow-ups" entry. ' +
      'Not as sentences inside the entry you mark done.',
  );
  let text = parts.join('\n');
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n…(cut to fit; read the rest of the section in .planning/BACKLOG.md)';
  return text;
}

/** A line that names a limit, gap or follow-up. Narrow on purpose: a false push costs a turn. */
const LIMIT_RE =
  /\b(?:known limits?|limitations?|limits?:|not (?:yet )?(?:built|tried|tested|handled|supported|covered|remembered|done|wired|shown)|haven'?t (?:tried|tested|built|run)|hasn'?t been|still open|follow-?ups?|out of scope|left (?:out|open|for later)|later work|known (?:issues?|gaps?)|gaps?:|todo\b)/i;
const LABEL_RE = /^\s*(?:#+\s*)?\**\s*(?:known limits?|limitations?|limits|what(?:'s| is) (?:left|not done)|left open|follow-?ups?|gaps|not done)\b[^:.]{0,60}(?::\**|\**:)?\s*$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** The lines of the final message that name a limit: lines that match, and bullets under a limits label. */
export function limitLines(message) {
  const out = [];
  let under = false;
  for (const raw of String(message ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      under = false;
      continue;
    }
    if (LABEL_RE.test(line) && line.length < 90) {
      under = true;
      continue;
    }
    if ((under && BULLET_RE.test(raw)) || LIMIT_RE.test(line)) out.push(line.replace(BULLET_RE, '').slice(0, 200));
    else if (!BULLET_RE.test(raw)) under = false;
  }
  return [...new Set(out)];
}

/**
 * Whether the limits named were filed. `before` and `after` are BACKLOG.md + BUGS.md text at the
 * start and end of the build. Filed means: at least one open entry exists after that did not
 * before. The target entry, when it is now done and its body carries limit lines that were not
 * there before, is reported as `buried`.
 */
export function checkFiled({ message, before, after, targetTitle }) {
  const limits = limitLines(message);
  if (limits.length === 0) return { ok: true, limits };
  const key = (e) => norm(e.title);
  const had = new Set(parseEntries(before).filter((e) => !e.done).map(key));
  const added = parseEntries(after).filter((e) => !e.done && e.level >= 3 && !had.has(key(e)));
  const beforeTarget = parseEntries(before).find((e) => targetTitle && key(e) === norm(targetTitle));
  const afterTarget = parseEntries(after).find((e) => targetTitle && key(e) === norm(targetTitle));
  const newLimitText = afterTarget ? limitLines(afterTarget.body).filter((l) => !limitLines(beforeTarget?.body ?? '').includes(l)) : [];
  const buried = Boolean(afterTarget?.done && newLimitText.length > 0 && added.length === 0);
  // Limits written into the target while it stays open survive too: nothing deletes an open entry.
  const keptOpen = Boolean(afterTarget && !afterTarget.done && newLimitText.length > 0);
  return { ok: added.length > 0 || keptOpen, limits, added: added.map((e) => e.title), buried };
}
