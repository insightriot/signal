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

/** Claude Code saves a hook's output to a file instead of showing it when it is larger than about 10 KB. */
const MAX_CHARS = 9000;
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

/**
 * The context printed into the session before the build starts, short enough to be shown inline:
 * each open item's opening lines and each bullet's lead, with its line number; done items as their
 * limit lines only. The full text stays in the file, at the line given.
 */
export function renderBeforeBuild(target, { open, done, bugs }) {
  const shape = shapeOf(target.body);
  const compact = (e, file) => {
    const lines = e.body.split('\n');
    const out = [`#### ${e.heading}  (${file}, line ${e.line})`];
    const intro = [];
    lines.forEach((l, i) => {
      if (!BULLET_RE.test(l)) {
        if (out.length === 1 && l.trim()) intro.push(l.trim());
        return;
      }
      const bullet = l.replace(BULLET_RE, '');
      const names = codeTokens(bullet).slice(0, 4);
      out.push(`- ${clip(leadOf(bullet), 160)}${names.length ? ` [${names.join(', ')}]` : ''}  (line ${e.line + 1 + i})`);
    });
    if (intro.length) out.splice(1, 0, clip(intro.join(' '), 300));
    return out.join('\n') + '\n';
  };
  const withLimits = done.filter((e) => limitLines(e.body).length > 0);
  const doneBlock = (e) => `#### ${e.heading}  (BACKLOG.md, line ${e.line})\n${limitLines(e.body).map((l) => `- ${clip(l, 200)}`).join('\n')}\n`;
  const parts = [
    `Signal: before you build "${target.title}", here are the project's records that sit beside it. Full text is in the file at the line given.`,
    `Open items in the same backlog section ("${target.section}"):`,
    ...(open.length ? open.map((e) => compact(e, 'BACKLOG.md')) : ['(none)\n']),
    `Limits named in done items in that section (${done.length - withLimits.length} other done items name none):`,
    ...(withLimits.length ? withLimits.map(doneBlock) : ['(none)\n']),
  ];
  if (bugs.length) parts.push('Open bugs that name a file this section names:', ...bugs.map((e) => compact(e, 'BUGS.md')));
  const closing = [
    'Before you edit any code, decide for each item or limit above: fix it in this build, or leave it with a reason. ' +
      'In your final message, give every item above its own line: its words (or the code name it mentions), then "fixed", or "left, because" and a reason about that item ' +
      '("unrelated, because" and what it is about counts). A line that names several items counts for none of them, and a name with no reason does not count.',
    'When you finish, file every limit or follow-up you name as its own open entry in .planning/BACKLOG.md ' +
      '(or BUGS.md for a bug), or as bullets under one new open "<feature> follow-ups" entry. ' +
      'Not as sentences inside the entry you mark done.',
  ].join('\n');
  const head = shapingText(target.title, shape);
  let text = parts.join('\n');
  const room = MAX_CHARS - closing.length - head.length - 80;
  if (text.length > room) text = text.slice(0, room) + '\n…(cut to fit; read the rest of the section in .planning/BACKLOG.md)';
  return head + '\n' + text + '\n' + closing;
}

/**
 * What the item says it will touch and must pass (`.planning/SLIM-SIGNAL.md`, piece 1): a `Files:` line
 * of backticked paths, and `Checks:` followed by bullets. Either label may be bold or a bullet itself.
 * @returns {{files:string[], checks:string[]}}
 */
export function shapeOf(body) {
  const lines = String(body ?? '').split('\n');
  const label = (l, name) => new RegExp(`^\\s*(?:[-*]\\s+)?\\**${name}\\**\\s*:\\**\\s*(.*)$`, 'i').exec(l);
  const files = [];
  const checks = [];
  lines.forEach((l, i) => {
    const f = label(l, 'files');
    if (f) for (const m of f[1].matchAll(/`([^`\s]+)`/g)) files.push(m[1].replace(/^\.\//, ''));
    if (!label(l, 'checks')) return;
    const indent = l.match(/^\s*/)[0].length;
    let level = null;
    for (const next of lines.slice(i + 1)) {
      const at = next.match(/^\s*/)[0].length;
      if (!BULLET_RE.test(next) || at < indent) break;
      level ??= at;
      if (at === level) checks.push(next.replace(BULLET_RE, '').trim());
    }
  });
  return { files, checks };
}

/** The opening paragraph: shape the item first, or hold the build to the shape it has. */
function shapingText(title, { files, checks }) {
  if (files.length && checks.length)
    return (
      `Signal: "${title}" is shaped. It expects to touch ${files.map((f) => `\`${f}\``).join(', ')}, and lists ${checks.length} check${checks.length === 1 ? '' : 's'}. ` +
      'Write each check as a test before the code, and name its test file in the check. A file outside that list is allowed, but your final message must give it a line saying why.\n'
    );
  return (
    `Signal: "${title}" is not shaped yet. Before you edit any code, write two things into the item in .planning/BACKLOG.md and commit them:\n` +
    '- `Files:` the files you expect to touch, each in backticks.\n' +
    '- `Checks:` bullets, each a test the finished work must pass. For every rule this work could break or adds, a "never", "always" or "only" line in the instruction files ' +
    '(AGENTS.md, CLAUDE.md) of those folders or in the item, write a check that tests everything that leaves: every message, route and tool result, not one field.\n' +
    '  Each check names in backticks the test file that will hold it, or says "not testable by code" and why. A never, always or only check is always testable: plant a marker value and check every way out, logs and error reports included. ' +
    'If there is no way yet to run tests here, making one is the first job.\n' +
    'If this work changes one of those rules, say so in the item and rewrite that rule\'s line in its instruction file in the same commit, before any code.\n' +
    'Agree them with the person if one is available; if not, draft them yourself and say so in your final message. Then write each check as a test before the code. ' +
    'At the end, a file outside the list needs a line saying why.\n'
  );
}

/**
 * The changed files the item's `Files:` list does not cover. A listed folder (ending in `/`) covers what
 * is under it; a listed file covers its own test file (`a.test.ts`, `a.spec.ts`, `__tests__/a.test.ts`).
 * Paths may be written from the project folder when git's top level is above it.
 */
export function outsideFiles(listed, changed) {
  const covers = (l, c) => c === l || c.endsWith('/' + l) || (l.endsWith('/') && (c.startsWith(l) || c.includes('/' + l)));
  const untest = (c) => c.replace(/\/__tests__\//, '/').replace(/\.(?:test|spec)(\.[a-z]+)$/, '$1');
  return changed.filter((c) => !listed.some((l) => covers(l, c) || covers(l, untest(c))));
}

/**
 * The checks with no test behind them in this change: a check passes when it names, in backticks, a test
 * file the change touched (`a.test.ts`, `a.spec.js`, under `__tests__/` or `tests/`), or says it is not
 * testable by code and is not a never/always/only check.
 */
const RULE_WORD_RE = /\b(?:never|always|only)\b/i;
export function untestedChecks(checks, changed) {
  const isTest = (p) => /\.(?:test|spec)\.[a-z]+$/.test(p) || /(?:^|\/)(?:__tests__|tests?)\//.test(p);
  return checks.filter((c) => {
    // A never/always/only check can always be tested (run 13: both features marked "never logged" untestable).
    if (/not testable by code/i.test(c) && !RULE_WORD_RE.test(c)) return false;
    const named = [...c.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/^\.\//, '')).filter(isTest);
    return !named.some((t) => changed.some((f) => f === t || f.endsWith('/' + t)));
  });
}

/** Whether a line of the final message names the file (its path or its file name). */
export function namesFile(message, file) {
  const base = file.split('/').pop();
  return String(message ?? '')
    .split('\n')
    .some((l) => l.includes(file) || new RegExp(`(^|[^\\w.-])${escapeRe(base)}($|[^\\w-])`).test(l));
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
 * there before, is reported as `buried`. A limit line that names an item shown before the build
 * (`items`) is that item, already filed, not a new limit.
 */
export function checkFiled({ message, before, after, targetTitle, items = [] }) {
  const limits = limitLines(message).filter((l) => !items.some((it) => restatesItem(it, l)));
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

/**
 * A backticked token distinctive enough to tie an item to a change: a path, a file name, or a code
 * name (has a dot, slash, underscore, bracket or an inner capital, and is 5 or more characters).
 * A plain word such as `facts` is left out: it would tie the item to every change.
 */
export function codeTokens(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/`([^`\n]{5,80})`/g)) {
    for (const t of m[1].split(/\s+/)) {
      const tok = t.replace(/[(),;:]+$/, '').replace(/\(.*$/, '');
      if (tok.length >= 5 && /[./_[]|[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/.test(tok)) out.add(tok);
    }
  }
  return [...out];
}

/**
 * The items shown before the build, one per bullet: each bullet of an open entry (the whole body
 * when it has none), each limit line of a done entry, each open bug. An item with no code name is kept
 * too: the end check matches it by the words of its lead.
 * @returns {{where:string, text:string, lead:string, tokens:string[]}[]}
 */
export function shownItems({ open, done, bugs }) {
  const items = [];
  // With no code name an item is known by its lead, so a lead of under two words falls back to the entry title.
  const add = (where, text, lead = leadOf(text)) => {
    const tokens = codeTokens(`${lead} ${text}`);
    if (!tokens.length && words(lead).length < 2) lead = where;
    items.push({ where, text: text.trim(), lead, tokens });
  };
  for (const e of open) {
    const bullets = e.body.split(/\n(?=\s*[-*] )/).filter((b) => BULLET_RE.test(b));
    if (bullets.length) bullets.forEach((b) => add(e.title, b.replace(BULLET_RE, '')));
    else add(e.title, e.body);
  }
  // A done entry's limit is named by the words after its label ("Built. Known limits: the list…").
  for (const e of done)
    for (const l of limitLines(e.body)) {
      const rest = l.replace(/^.*?\b(?:known limits?|limitations?|limits)\s*:\s*/i, '');
      if (!/^none\b/i.test(rest)) add(e.title, l, leadOf(rest));
    }
  for (const b of bugs) add(b.title, b.body, b.title);
  return items;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, tok) => new RegExp(`(^|[^\\w])${escapeRe(tok)}($|[^\\w])`).test(text);
/** The bold lead of a bullet ("**The replay setup does not show typed answers.**"), or its first sentence. */
const leadOf = (text) => {
  const bold = text.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
  const first = (t) => t.split(/(?<=[.;])\s/)[0];
  const lead = bold ? (bold[1].split(/\s+/).length >= 3 ? bold[1] : `${bold[1]} ${first(bold[2])}`) : first(text);
  return lead.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
};
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
/**
 * Whether a limit line in the final message is a shown item restated, not a new limit: it carries the
 * item's lead words, or it names one of the item's code names and answers it ("fixed", "left, because").
 * A code name alone is not enough: a new limit in the same file names it too.
 */
const ANSWER_RE = /\b(?:left|unrelated),?\s+because\b|\bfixed\b/i;
const restatesItem = (it, line) => {
  const lw = words(it.lead ?? leadOf(it.text));
  const ws = new Set(words(line));
  if (lw.length >= 2 && lw.filter((w) => ws.has(w)).length / lw.length >= 2 / 3) return true;
  return ANSWER_RE.test(line) && it.tokens.some((t) => mentions(line, t));
};

/**
 * A sentence that states a standing rule: never, always, only when, must not. Narrow on purpose: the
 * rule lines are shown to the agent after the build, and every extra one costs reading time.
 */
const RULE_RE = /\b(?:never|always|only (?:when|if|for|to)|must not|no longer)\b/i;

/** The rule sentences of a doc, with their line numbers. A long bullet is split into its sentences. */
export function ruleSentences(md) {
  const out = [];
  let fence = false;
  String(md ?? '').split(/\r?\n/).forEach((line, i) => {
    if (FENCE_RE.test(line)) fence = !fence;
    if (fence) return;
    for (const s of line.replace(BULLET_RE, '').split(/(?<=[.;])\s+(?=[A-Z*`(])/))
      if (RULE_RE.test(s)) out.push({ line: i + 1, text: s.replace(/\*\*/g, '').trim() });
  });
  return out;
}

/**
 * The instruction files (AGENTS.md, CLAUDE.md) that govern the changed files: those in a changed
 * file's folder or a folder above it, but not the top level, which every session reads already.
 * Paths are from the git top level.
 */
export function governingDocs(files, docPaths) {
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const dirs = new Set();
  for (const f of files) for (let d = dirOf(f); d; d = dirOf(d)) dirs.add(d);
  return docPaths.filter((p) => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(p) && dirs.has(dirOf(p)));
}
