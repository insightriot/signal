// The v2 views, generated from records (M6.E13.S3.t3.1, AC6.1, AC6.2).
// See .planning/M6.E13-VALIDATION.md rows AC6.1 and AC6.2.
//
// `renderViews` is pure: records in, `{repo-root-relative path: text}` out.
// `regenerateViews` writes them; `regenerateToMemory` renders them for
// `checkRecords` without writing. Mutations regenerate through it by default.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { renderViews, regenerateViews, regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';

const by = 'claude';
const NEWEST = '2026-10-04T10:00:00.000Z';
const ev = {
  created: (at = '2026-01-01') => ({ type: 'created', at, by }),
  triaged: (at = '2026-01-02') => ({ type: 'triaged', at, by }),
  queued: (epic, at = '2026-01-03') => ({ type: 'queued', at, by, epic }),
  started: (epic, at = '2026-01-04') => ({ type: 'started', at, by, epic }),
  closing: (at = '2026-01-05') => ({ type: 'close_requested', at, by, reason: 'fixed', proof: '0123abc' }),
  wontdo: (at) => ({ type: 'closed', at, by, reason: 'wontdo', proof: 'not worth it' }),
  reopened: (at) => ({ type: 'reopened', at, by, reason: 'back again' }),
};
const entry = (id, type, events, extra = {}, body = null) => ({
  record: { id, type, title: `title of ${id}`, ...extra, events },
  body,
});

const P = {
  bugs: '.planning/BUGS.md',
  backlog: '.planning/BACKLOG.md',
  inbox: '.planning/ISSUES-INBOX.md',
  questions: '.planning/OPEN-QUESTIONS.md',
  epics: '.planning/work/EPICS.md',
  history: (y) => `.planning/work/history/${y}.md`,
};
const LISTS = [P.bugs, P.backlog, P.inbox, P.questions];

// One record in every routing case. The newest event in the store is NEWEST
// (SIG-20's edit), so the window is the 30 days before 2026-10-04T10:00Z.
function fixture() {
  return [
    entry('SIG-1', 'BUG', [ev.created()], { legacy_id: 'B62', priority: 'P2' }),
    entry('SIG-2', 'BUG', [ev.created(), ev.triaged()]),
    entry('SIG-3', 'BUG', [ev.created(), ev.triaged(), ev.closing()]),
    entry('SIG-4', 'BUG', [ev.created(), ev.triaged(), ev.wontdo('2026-09-20')]),
    entry('SIG-5', 'BUG', [ev.created('2025-01-01'), ev.wontdo('2025-06-01')]),
    entry('SIG-6', 'FEAT', [ev.created()]),
    entry('SIG-7', 'NEW', [ev.created()]),
    entry('SIG-8', 'FEAT', [ev.created(), ev.triaged()]),
    entry('SIG-9', 'CHORE', [ev.created(), ev.triaged(), ev.queued('M6.E13')]),
    entry('SIG-10', 'FEAT', [ev.created(), ev.triaged(), ev.started('M6.E13')]),
    entry('SIG-11', 'FEAT', [ev.created(), ev.triaged(), ev.closing()]),
    entry('SIG-12', 'NEW', [ev.created(), ev.wontdo('2026-09-30')]),
    entry('SIG-13', 'Q', [ev.created()]),
    entry('SIG-14', 'Q', [ev.created(), ev.triaged(), ev.wontdo('2026-09-10')]),
    entry('SIG-15', 'Q', [ev.created(), ev.triaged(), ev.wontdo('2026-02-01')]),
    entry('SIG-16', 'FEAT', [ev.created(), ev.triaged(), ev.wontdo('2026-03-01'), ev.reopened('2026-03-02')]),
    entry('SIG-20', 'FEAT', [ev.created(), ev.triaged(), { type: 'edited', at: NEWEST, by, changes: { title: { from: 'old', to: 'title of SIG-20' } } }]),
  ];
}

const has = (text, id) => new RegExp(`\\b${id}\\b`).test(text);

describe('renderViews — the files, and the marker (AC6.1)', () => {
  it('returns the four lists, EPICS.md, and one history file per year with an old close', () => {
    const views = renderViews(fixture());
    expect(Object.keys(views).sort()).toEqual(
      [...LISTS, P.epics, P.history(2025), P.history(2026)].sort(),
    );
  });

  it('every view starts with the generated marker and ends with one newline', () => {
    for (const [path, text] of Object.entries(renderViews(fixture()))) {
      expect(text.split('\n')[0], path).toBe(GENERATED_MARKER);
      expect(text.endsWith('\n') && !text.endsWith('\n\n'), path).toBe(true);
    }
  });

  it('an empty store still renders the five views, and no history', () => {
    const views = renderViews([]);
    expect(Object.keys(views).sort()).toEqual([...LISTS, P.epics].sort());
  });
});

describe('renderViews — SIG-n only (AC6.1)', () => {
  it('a legacy B-number is never printed: the BUGS ID cell is SIG-n', () => {
    const views = renderViews(fixture());
    expect(views[P.bugs]).toMatch(/^\| SIG-1 \| `needs-triage` \| P2 \| /m);
    for (const [path, text] of Object.entries(views)) {
      expect(text, path).not.toMatch(/B62/);
      expect(text, path).not.toMatch(/^\|\s*B\d+\s*\|/m);
    }
  });

  it('every structural ID position names SIG-n', () => {
    const views = renderViews(fixture());
    for (const row of views[P.bugs].split('\n').filter((l) => /^\| (?!ID|-)/.test(l))) {
      expect(row).toMatch(/^\| SIG-\d+ \|/);
    }
    for (const h of views[P.backlog].split('\n').filter((l) => l.startsWith('### '))) expect(h).toMatch(/· SIG-\d+/);
    for (const b of views[P.epics].split('\n').filter((l) => l.startsWith('- '))) expect(b).toMatch(/^- SIG-\d+ /);
  });
});

describe('renderViews — routing: every record in exactly one list', () => {
  const where = {
    'SIG-1': P.bugs, 'SIG-2': P.bugs, 'SIG-3': P.bugs, 'SIG-4': P.bugs,
    'SIG-6': P.inbox, 'SIG-7': P.inbox,
    'SIG-8': P.backlog, 'SIG-9': P.backlog, 'SIG-10': P.backlog, 'SIG-11': P.backlog, 'SIG-12': P.backlog,
    'SIG-16': P.backlog, 'SIG-20': P.backlog,
    'SIG-13': P.questions, 'SIG-14': P.questions,
  };

  it.each(Object.entries(where))('%s is in %s and no other list', (id, path) => {
    const views = renderViews(fixture());
    for (const list of LISTS) expect(has(views[list], id), `${id} in ${list}`).toBe(list === path);
  });

  it('closes older than the window are in no list, only in history', () => {
    const views = renderViews(fixture());
    for (const id of ['SIG-5', 'SIG-15']) {
      for (const list of LISTS) expect(has(views[list], id), `${id} in ${list}`).toBe(false);
    }
    expect(has(views[P.history(2025)], 'SIG-5')).toBe(true);
    expect(has(views[P.history(2026)], 'SIG-15')).toBe(true);
  });

  it('a reopened item is open: in its list, in no history', () => {
    const views = renderViews(fixture());
    expect(views[P.backlog]).toMatch(/### title of SIG-16 · SIG-16/);
    expect(has(views[P.history(2026)], 'SIG-16')).toBe(false);
  });

  it('closing and recently closed items say so', () => {
    const views = renderViews(fixture());
    expect(views[P.bugs]).toMatch(/^\| SIG-3 \| `closing` \|/m);
    expect(views[P.bugs]).toMatch(/^\| SIG-4 \| `wontdo` \|/m);
    expect(views[P.backlog]).toMatch(/### title of SIG-11 · SIG-11 · closing/);
    expect(views[P.backlog]).toMatch(/### title of SIG-12 · SIG-12 · closed \(wontdo\)/);
  });
});

describe('renderViews — the window: 30 days before the newest event in the store (AC6.2, Decision 5)', () => {
  const at = (days) => new Date(Date.parse(NEWEST) - days * 86_400_000).toISOString();
  const store = (closeAt) => [
    entry('SIG-1', 'FEAT', [ev.created('2026-01-01'), ev.wontdo(closeAt)]),
    entry('SIG-2', 'FEAT', [ev.created(NEWEST)]),
  ];

  it('a close 29 days before the newest event stays in its list', () => {
    const views = renderViews(store(at(29)));
    expect(has(views[P.backlog], 'SIG-1')).toBe(true);
    expect(Object.keys(views).some((p) => p.includes('/history/'))).toBe(false);
  });

  it('a close exactly 30 days before stays (the window is inclusive)', () => {
    expect(has(renderViews(store(at(30)))[P.backlog], 'SIG-1')).toBe(true);
  });

  it('a close 31 days before goes to history/YYYY.md, by the year of the closed event', () => {
    const views = renderViews(store(at(31)));
    expect(has(views[P.backlog], 'SIG-1')).toBe(false);
    expect(has(views[P.history(2026)], 'SIG-1')).toBe(true);
  });

  it('the newest event is any event, not only a close — and not the clock', () => {
    // Nothing newer than the close: the close is the newest event, so it is recent.
    const views = renderViews([entry('SIG-1', 'FEAT', [ev.created('2020-01-01'), ev.wontdo('2020-02-01')])]);
    expect(has(views[P.backlog], 'SIG-1')).toBe(true);
  });

  it('history lists each close with its date and reason, linking the body', () => {
    const views = renderViews([
      entry('SIG-1', 'BUG', [ev.created('2025-01-01'), ev.wontdo('2025-03-01')], {}, 'body\n'),
      entry('SIG-2', 'FEAT', [ev.created(NEWEST)]),
    ]);
    const h = views[P.history(2025)];
    expect(h).toMatch(/^\| \[SIG-1\]\(\.\.\/items\/00\/SIG-1\.md\) \| BUG \| 2025-03-01 \| wontdo \| title of SIG-1 \|$/m);
  });
});

describe('renderViews — bodies and links', () => {
  // A link written from the body's folder (work/items/00) to analysis/X.md at repo root.
  const LINK = '[X](../../../../analysis/X.md)';

  it('body links are rewritten from the item depth to the view depth', () => {
    const views = renderViews([
      entry('SIG-1', 'FEAT', [ev.created(), ev.triaged()], {}, `## Old heading\n\nSee ${LINK}.\n`),
      entry('SIG-2', 'FEAT', [ev.created()], {}, `See ${LINK}.\n`),
      entry('SIG-3', 'Q', [ev.created()], {}, `See ${LINK}.\n`),
    ]);
    for (const list of [P.backlog, P.inbox, P.questions]) expect(views[list], list).toContain('[X](../analysis/X.md)');
  });

  it('a body heading never nests under a generated row; the leading heading is dropped', () => {
    const views = renderViews([
      entry('SIG-1', 'FEAT', [ev.created(), ev.triaged()], {}, '## Old heading\n\ntext\n\n### Inner\n\nmore\n'),
    ]);
    expect(views[P.backlog]).not.toMatch(/Old heading/);
    expect(views[P.backlog]).toMatch(/^\*\*Inner\*\*$/m);
    expect(views[P.backlog].split('\n').filter((l) => /^#{1,6} /.test(l))).toEqual(['# Backlog', '### title of SIG-1 · SIG-1']);
  });

  it('a bug body that opens with its bold headline gives its first paragraph; otherwise the title is', () => {
    const views = renderViews([
      entry('SIG-1', 'BUG', [ev.created()], {}, '**Short.** A pipe \\| kept, and a | new one, [X](../../../../analysis/X.md).\n'),
      entry('SIG-2', 'BUG', [ev.created()], {}, 'one\n\ntwo\n'),
      entry('SIG-3', 'BUG', [ev.created()]),
    ]);
    expect(views[P.bugs]).toMatch(/^\| SIG-1 \| `needs-triage` \| — \| \*\*Short\.\*\* A pipe \\\| kept, and a \\\| new one, \[X\]\(\.\.\/analysis\/X\.md\)\. \|$/m);
    expect(views[P.bugs]).toMatch(/^\| SIG-2 \| `needs-triage` \| — \| \*\*title of SIG-2\*\* \|$/m);
    expect(views[P.bugs]).toMatch(/^\| SIG-3 \| `needs-triage` \| — \| \*\*title of SIG-3\*\* \|$/m);
  });

  // M6.E13 t7.1b R1: SIG-52 and SIG-99 are a migrated row followed by more
  // paragraphs. The v1 view showed the row; the summary is that first paragraph.
  it('a multi-paragraph body (a migrated row, then notes) keeps its first paragraph as the summary', () => {
    const body = '**Session binds to one cache.** Observed live, a line\nwrapped onto two.\n\n**Related hazard.** later notes\n';
    const views = renderViews([entry('SIG-52', 'BUG', [ev.created()], {}, body)]);
    expect(views[P.bugs]).toMatch(/^\| SIG-52 \| `needs-triage` \| — \| \*\*Session binds to one cache\.\*\* Observed live, a line wrapped onto two\. \|$/m);
    expect(views[P.bugs]).not.toMatch(/Related hazard/);
  });

  // ...and a bug filed in the store (SIG-258) has a prose body with no bold
  // headline. Its first paragraph would drop the title the v1 view showed, and
  // five such bugs open with the same sentence.
  it('a multi-paragraph body with no bold headline is summarised by its title', () => {
    const body = 'Found 2026-10-03 by the first run outside Signal.\n\nMore detail.\n';
    const views = renderViews([entry('SIG-258', 'BUG', [ev.created()], {}, body)]);
    expect(views[P.bugs]).toMatch(/^\| SIG-258 \| `needs-triage` \| — \| \*\*title of SIG-258\*\* \|$/m);
    expect(views[P.bugs]).not.toMatch(/Found 2026-10-03/);
  });

  it('a first paragraph that is a heading or a fence is not a summary; the title is', () => {
    const views = renderViews([
      entry('SIG-1', 'BUG', [ev.created()], {}, '## A heading\n\ntext\n'),
      entry('SIG-2', 'BUG', [ev.created()], {}, '```\ncode\n```\n\ntext\n'),
    ]);
    expect(views[P.bugs]).toMatch(/^\| SIG-1 \| `needs-triage` \| — \| \*\*title of SIG-1\*\* \|$/m);
    expect(views[P.bugs]).toMatch(/^\| SIG-2 \| `needs-triage` \| — \| \*\*title of SIG-2\*\* \|$/m);
  });

  it('the inbox gives each item the status line the promote reads back', () => {
    const views = renderViews([entry('SIG-7', 'NEW', [ev.created()])]);
    expect(views[P.inbox]).toMatch(/^\*\*Status:\*\* untriaged \(N\) · SIG-7$/m);
  });

  it('an open question names its item', () => {
    expect(renderViews([entry('SIG-13', 'Q', [ev.created()])])[P.questions]).toMatch(/^\*\*Item:\*\* SIG-13$/m);
  });

  it('the bug tally is counted from the records', () => {
    expect(renderViews(fixture())[P.bugs]).toMatch(
      /^\*1 needs-triage · 1 confirmed · 1 closing · 2 closed \(5 total\)/m,
    );
  });
});

describe('renderViews — the watchlist (ISSUES-INBOX)', () => {
  it('the watchlist comes first, verbatim, its links moved from work/ to .planning/', () => {
    const watchlistText = '## Trigger watchlist — standing entry\n<!-- standing -->\n\nSee [M](../MILESTONE-5.md).\n';
    const inbox = renderViews([entry('SIG-7', 'NEW', [ev.created()])], { watchlistText })[P.inbox];
    const lines = inbox.split('\n');
    expect(lines.slice(0, 4)).toEqual([GENERATED_MARKER, '# Issues Inbox', '', '## Trigger watchlist — standing entry']);
    expect(inbox).toContain('See [M](MILESTONE-5.md).');
    expect(inbox.indexOf('Trigger watchlist')).toBeLessThan(inbox.indexOf('SIG-7'));
  });
});

describe('renderViews — work/EPICS.md (membership from epicOf)', () => {
  it('lists open Epics, then archived ones with their close line; items by epicOf, closed members kept', () => {
    const epics = [
      { id: 'M6.E11', archived: true, close: { at: '2026-09-30T00:00:00Z', pr: '#263', release: 'v0.1.43', by: 'claude' } },
      { id: 'M6.E13', archived: false },
    ];
    const recs = [
      entry('SIG-1', 'FEAT', [ev.created(), ev.triaged(), ev.queued('M6.E13')]),
      entry('SIG-2', 'FEAT', [ev.created(), ev.triaged(), ev.started('M6.E11'), ev.wontdo('2026-09-29')]),
      entry('SIG-3', 'FEAT', [ev.created(), ev.triaged(), ev.queued('M6.E13'), ev.triaged()]),
    ];
    const text = renderViews(recs, { epics })[P.epics];
    expect(text).toBe([
      GENERATED_MARKER,
      '# Epics',
      '',
      '## M6.E13 — open',
      '',
      '- SIG-1 · FEAT · Q — title of SIG-1',
      '',
      '## M6.E11 — closed 2026-09-30 · PR #263 · v0.1.43 · by claude',
      '',
      '- SIG-2 · FEAT · C — title of SIG-2',
      '',
    ].join('\n'));
  });

  it('an Epic named by an event but with no folder is still listed', () => {
    const text = renderViews([entry('SIG-1', 'FEAT', [ev.created(), ev.triaged(), ev.queued('M7.E1')])])[P.epics];
    expect(text).toContain('## M7.E1 — no Epic folder');
    expect(text).toContain('- SIG-1 · FEAT · Q — title of SIG-1');
  });

  it('no Epics at all says so', () => {
    expect(renderViews([])[P.epics]).toContain('_no Epics_');
  });
});

describe('renderViews — deterministic (AC6.2: byte-stable)', () => {
  it('the same records in any order give the same bytes', () => {
    const a = renderViews(fixture());
    const b = renderViews([...fixture()].reverse());
    expect(b).toEqual(a);
    expect(renderViews(fixture())).toEqual(a);
  });

  it('a record with a broken history is refused, not guessed', () => {
    expect(() => renderViews([entry('SIG-1', 'FEAT', [ev.created(), ev.closing(), ev.triaged(), ev.triaged()])]))
      .toThrow(/SIG-1/);
  });
});

// ── Writing them ────────────────────────────────────────────────────────────

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const putRecord = (r) => put(records.recordPath(r.id), serializeRecord(r));
const read = (rel) => readFile(join(base, rel), 'utf-8');

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-views-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put('.planning/work/WATCHLIST.md', '## Trigger watchlist\n<!-- standing -->\n');
  for (const e of fixture()) await putRecord(e.record);
  await put('.planning/work/items/00/SIG-8.md', 'See [X](../../../../analysis/X.md).\n');
  await mkdir(join(base, '.planning/work/epics/M6.E13'), { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// REVIEW pass 1 (part A noticed): the watchlist was read with existsSync /
// readFileSync, which follow a link — a committed `WATCHLIST.md -> ~/secret`
// would be copied into the generated inbox. It is read only as a regular file.
describe('the watchlist is read only as a regular, unlinked file', () => {
  it('a linked WATCHLIST.md refuses the regeneration (CONFLICT); nothing is written, nothing leaks', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sig-views-outside-'));
    try {
      await writeFile(join(outside, 'secret.md'), 'OUTSIDE-SECRET\n');
      await rm(join(base, '.planning/work/WATCHLIST.md'));
      await symlink(join(outside, 'secret.md'), join(base, '.planning/work/WATCHLIST.md'));
      expect(() => regenerateToMemory(base)).toThrow(expect.objectContaining({ code: 'CONFLICT', message: expect.stringMatching(/WATCHLIST\.md/) }));
      await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(existsSync(join(base, P.inbox))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('no WATCHLIST.md: the inbox renders without one', async () => {
    await rm(join(base, '.planning/work/WATCHLIST.md'));
    await regenerateViews(base);
    expect(await read(P.inbox)).not.toMatch(/Trigger watchlist/);
  });
});

describe('regenerateViews / regenerateToMemory', () => {
  it('writes exactly what regenerateToMemory renders, and checkRecords then has no findings', async () => {
    const { written } = await regenerateViews(base);
    const mem = regenerateToMemory(base);
    expect(written.sort()).toEqual(Object.keys(mem).sort());
    for (const [rel, text] of Object.entries(mem)) expect(await read(rel), rel).toBe(text);
    expect(await read(P.backlog)).toContain('See [X](../analysis/X.md).');
    expect(await read(P.inbox)).toMatch(/^## Trigger watchlist$/m);
    expect(await read(P.epics)).toContain('## M6.E13 — open');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('regenerating with no new events is byte-stable', async () => {
    await regenerateViews(base);
    const first = await Promise.all(Object.keys(regenerateToMemory(base)).map(read));
    await regenerateViews(base);
    expect(await Promise.all(Object.keys(regenerateToMemory(base)).map(read))).toEqual(first);
  });

  it('without views, checkRecords reports each one missing (the default seam is wired)', () => {
    const stale = records.checkRecords(base).filter((f) => f.code === 'view-stale');
    expect(stale.map((f) => f.path).sort()).toEqual(Object.keys(regenerateToMemory(base)).sort());
  });

  it('a history file of a year with no closes left is never deleted', async () => {
    await put('.planning/work/history/2019.md', `${GENERATED_MARKER}\nold\n`);
    await regenerateViews(base);
    expect(await read('.planning/work/history/2019.md')).toBe(`${GENERATED_MARKER}\nold\n`);
  });

  it('refuses over a hand-kept list, naming it, and writes nothing', async () => {
    await put(P.backlog, '# Backlog, by hand\n');
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/BACKLOG\.md.*hand-kept/s) });
    expect(existsSync(join(base, P.bugs))).toBe(false);
    expect(await read(P.backlog)).toBe('# Backlog, by hand\n');
  });

  it('a hand-kept history file is refused too', async () => {
    await put(P.history(2025), 'by hand\n');
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(existsSync(join(base, P.bugs))).toBe(false);
  });

  it('a store with a broken record writes nothing and says which', async () => {
    await put(records.recordPath('SIG-30'), '{ nope\n');
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/SIG-30/) });
    expect(() => regenerateToMemory(base)).toThrow(/SIG-30/);
    expect(existsSync(join(base, P.bugs))).toBe(false);
  });

  it('a v1 store is refused (the live views are never overwritten by v2 code); a store that is off writes nothing', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/work-migrate-v2/) });
    await rm(join(base, '.planning/work/WORK.md'));
    expect(await regenerateViews(base)).toEqual({ written: [] });
    expect(existsSync(join(base, P.bugs))).toBe(false);
  });

  it('is the default regenerate of every v2 mutation', async () => {
    await regenerateViews(base);
    const { id } = await records.newItem(base, { type: 'NEW', title: 'fresh capture', by, at: '2026-10-05T00:00:00.000Z' });
    expect(await read(P.inbox)).toContain('## fresh capture');
    expect(await read(P.inbox)).toContain(`untriaged (N) · ${id}`);
    expect(records.checkRecords(base)).toEqual([]);
  });
});
