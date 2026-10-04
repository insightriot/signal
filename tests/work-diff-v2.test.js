// M6.E13 t7.1b — the differential read (`tools/work-diff-v2.mjs`, AC8.1): the
// same readers over a store-off copy (the v1 views), the v1 store (through the
// converter) and the migrated v2 store; every difference classified, and any
// difference no rule explains is a MIGRATION ERROR that fails the run.
// See .planning/M6.E13-VALIDATION.md row AC8.1 and .planning/M6.E13-MIGRATION-DIFF.md.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CLASSES,
  RULES,
  classify,
  compare,
  diffEntries,
  differentialRead,
  idNormalizer,
  parseView,
  recordEntries,
  renderTables,
  spliceReport,
  summarize,
} from '../tools/work-diff-v2.mjs';
import { stringifyItem } from '../plugin/tools/lib/work-item.js';
import { generateAll } from '../plugin/tools/lib/work-generate.js';

const rec = (id, fields = {}, events = [{ type: 'created', at: '2026-09-01', by: 'b' }]) => ({
  id,
  path: `.planning/work/items/00/${id}.json`,
  status: 'T',
  epic: null,
  body: 'Body.\n',
  record: { id, type: 'BUG', title: `t ${id}`, ...fields, events },
});

describe('idNormalizer — B{n} → SIG-n', () => {
  it('maps a legacy_id and a BUG record\'s own number; leaves an unknown B{n}', () => {
    const norm = idNormalizer([rec('SIG-7', { legacy_id: 'B3' }), rec('SIG-9'), rec('SIG-4', { type: 'FEAT' })]);
    expect(norm('B3 and B9 and B4 and B300')).toBe('SIG-7 and SIG-9 and B4 and B300');
  });

  it('a legacy_id wins over another record\'s own-number alias', () => {
    const norm = idNormalizer([rec('SIG-3'), rec('SIG-7', { legacy_id: 'B3' })]);
    expect(norm('B3')).toBe('SIG-7');
  });
});

describe('diffEntries', () => {
  it('reports only-left, only-right and changed, by key', () => {
    expect(diffEntries([['a', '1'], ['b', '2']], [['b', '3'], ['c', '4']])).toEqual([
      { key: 'a', kind: 'only-left', left: '1', right: null },
      { key: 'b', kind: 'changed', left: '2', right: '3' },
      { key: 'c', kind: 'only-right', left: null, right: '4' },
    ]);
  });

  it('identical entries give no difference', () => {
    expect(diffEntries([['a', '1']], [['a', '1']])).toEqual([]);
  });
});

describe('classify — a difference no rule explains is a migration error', () => {
  const ctx = { manifest: { closes: { requested: [] } }, v2ById: new Map(), viewOnlyCites: new Set() };

  it('an unexplained difference is a migration error, with no rule', () => {
    const [d] = classify([{ comparison: 'v1', reader: 'records', key: 'SIG-1 · fields', kind: 'changed', left: 'a', right: 'b' }], RULES, ctx);
    expect(d.class).toBe(CLASSES.ERROR);
    expect(d.rule).toBeNull();
  });

  it('the first matching rule classifies, and a rule is scoped to its comparison', () => {
    const rules = [
      { name: 'only-off', reader: 'r', comparison: 'off', when: () => true, class: CLASSES.CORRECTION, reason: 'x' },
    ];
    const out = classify([
      { comparison: 'off', reader: 'r', key: 'k', kind: 'changed' },
      { comparison: 'v1', reader: 'r', key: 'k', kind: 'changed' },
    ], rules, ctx);
    expect(out.map((d) => d.class)).toEqual([CLASSES.CORRECTION, CLASSES.ERROR]);
  });

  it('a migrated record whose title changed is a migration error (compare over records)', () => {
    const v1 = { records: { records: [rec('SIG-1')], broken: [] }, views: {} };
    const v2 = { records: { records: [rec('SIG-1', { title: 'changed' })], broken: [] }, views: {} };
    const out = compare({ off: { views: {} }, v1, v2 }, { ...ctx, norm: (s) => s }).filter((d) => d.reader === 'records');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ comparison: 'v1', key: 'SIG-1 · fields', class: CLASSES.ERROR });
  });

  it('a created date the migration took from the first commit is an expected correction; any other event change is not', () => {
    const synth = (at) => [{ type: 'created', at, by: 'migration (v2)' }, { type: 'closed', at: '2026-10-01', by: 'b', reason: 'fixed', legacy: true }];
    const v1 = { records: { records: [rec('SIG-1', {}, synth('2026-10-01')), rec('SIG-2', {}, synth('2026-10-01'))], broken: [] }, views: {} };
    const changed = synth('2026-09-29');
    changed[1] = { ...changed[1], reason: 'wontdo' };
    const v2 = { records: { records: [rec('SIG-1', {}, synth('2026-09-29')), rec('SIG-2', {}, changed)], broken: [] }, views: {} };
    const out = compare({ off: { views: {} }, v1, v2 }, { ...ctx, norm: (s) => s }).filter((d) => d.reader === 'records');
    expect(out.map((d) => [d.key, d.class])).toEqual([
      ['SIG-1 · events', CLASSES.CORRECTION],
      ['SIG-2 · events', CLASSES.ERROR],
    ]);
  });

  it('event key order is not a difference (Decision 8: the serialiser orders keys)', () => {
    const a = rec('SIG-1', {}, [{ type: 'closed', at: 'x', by: 'b', reason: 'dup', legacy: true, dup_of: 'SIG-2' }]);
    const b = rec('SIG-1', {}, [{ type: 'closed', at: 'x', by: 'b', reason: 'dup', dup_of: 'SIG-2', legacy: true }]);
    expect(diffEntries(recordEntries({ records: { records: [a], broken: [] } }), recordEntries({ records: { records: [b], broken: [] } }))).toEqual([]);
  });

  it('a summary that differs only by escaped pipes is an expected correction', () => {
    const [d] = classify([{ comparison: 'off', reader: 'views', key: 'BUGS.md · SIG-1 · summary', kind: 'changed', left: 'a | b \\| c', right: 'a \\| b \\| c' }], RULES, ctx);
    expect(d.rule).toBe('view-pipe-escaped');
  });
});

describe('parseView — items and their state, per view', () => {
  it('BUGS.md rows: status and summary, by ID (B{n} or SIG-n)', () => {
    const text = '| ID | Status | Pri | Summary |\n|---|---|---|---|\n| B2 | `fixed` | P2 | **A** text |\n| SIG-3 | `closing` | — | b \\| c |\n';
    expect(parseView('BUGS.md', text)).toEqual([
      ['B2 · status', '`fixed` P2'],
      ['B2 · summary', '**A** text'],
      ['SIG-3 · status', '`closing` —'],
      ['SIG-3 · summary', 'b \\| c'],
    ]);
  });

  it('heading views: the ID from the heading, an **Item:** line or the inbox status line; the watchlist is skipped', () => {
    expect(parseView('BACKLOG.md', '### A row · SIG-4\n\n### Old · SIG-5 · closed (fixed)\n')).toEqual([['SIG-4', 'open'], ['SIG-5', 'closed (fixed)']]);
    expect(parseView('OPEN-QUESTIONS.md', '## Q? · closing\n\n**Item:** SIG-6\n')).toEqual([['SIG-6', 'closing']]);
    expect(parseView('ISSUES-INBOX.md', '## Trigger watchlist\n\n## A capture\n\n**Status:** untriaged (N) · SIG-7\n')).toEqual([['SIG-7', 'open']]);
  });

  it('EPICS.md: both the v1 and the v2 line forms', () => {
    expect(parseView('EPICS.md', '- SIG-161-FEAT-C — x\n- SIG-162 · BUG · T — y\n')).toEqual([['SIG-161', 'FEAT C'], ['SIG-162', 'BUG T']]);
  });
});

describe('the report', () => {
  const classified = [
    { comparison: 'off', reader: 'views', key: 'BUGS.md · SIG-1 · status', kind: 'changed', left: 'a', right: 'b', class: CLASSES.CORRECTION, rule: 'r1', reason: 'why' },
    { comparison: 'off', reader: 'views', key: 'BUGS.md · SIG-2 · status', kind: 'changed', left: 'a', right: 'b', class: CLASSES.CORRECTION, rule: 'r1', reason: 'why' },
    { comparison: 'v1', reader: 'records', key: 'SIG-3 · fields', kind: 'changed', left: 'x', right: 'y', class: CLASSES.ERROR, rule: null, reason: 'no rule' },
  ];
  const manifest = { summary: { v1Files: 3, records: 3 }, verification: { errors: [] }, closes: { requested: [] } };

  it('counts by comparison and class; one row per rule, with the items it covers', () => {
    expect(summarize(classified)).toEqual({
      off: { [CLASSES.CORRECTION]: 2, [CLASSES.CONTRADICTION]: 0, [CLASSES.ERROR]: 0 },
      v1: { [CLASSES.CORRECTION]: 0, [CLASSES.CONTRADICTION]: 0, [CLASSES.ERROR]: 1 },
    });
    const t = renderTables(classified, { manifest });
    expect(t).toMatch(/\| store-off \(views\) → v2 \| 2 \| 0 \| \*\*0\*\* \|/);
    expect(t).toMatch(/\| v1 \(converter\) → v2 \| 0 \| 0 \| \*\*1\*\* \|/);
    expect(t).toMatch(/\| 1 \| off → v2 \| views \| expected correction \| 2 \| SIG-1, SIG-2 \|/);
  });

  it('spliceReport replaces only the generated block, keeping the hand-written text', () => {
    const first = spliceReport('# Report\n\nHand text.\n', 'TABLE 1');
    expect(first).toMatch(/^# Report\n\nHand text\.\n\n<!-- diff:begin[^\n]*-->\nTABLE 1\n<!-- diff:end -->\n$/);
    const again = spliceReport(`${first}\n## After\n`, 'TABLE 2');
    expect(again).toContain('Hand text.');
    expect(again).toContain('## After');
    expect(again).toContain('TABLE 2');
    expect(again).not.toContain('TABLE 1');
  });
});

// End to end on a fixture repository with one item of every v1 shape and its
// v1-generated views: the run completes, builds all three projects, and finds
// no migration error.
describe('differentialRead — end to end on a fixture repository', () => {
  let root;
  let res;
  const AT = '2026-09-01T00:00:00.000Z';
  const by = 'b';
  const put = (base, rel, content) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), content);
  };
  const g = (cwd, ...args) => {
    const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const item = (f, body = 'Body.\n') => stringifyItem({ created: { at: AT, by }, ...f }, body);

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sig-work-diff-')));
    const repo = join(root, 'repo');
    put(repo, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 1\n---\n');
    put(repo, '.planning/work/WATCHLIST.md', '## Trigger watchlist\n\n<!-- standing -->\n');
    put(repo, '.planning/PROJECT.md', '# Project\n');
    put(repo, '.planning/STATE.md', '---\nschema_version: 1\nphase: EXECUTE\n---\n# State\n');
    put(repo, 'CHANGELOG.md', '# Changelog\n\n## [0.1.1] — 2026-09-10\n\n- Fixed SIG-3.\n');
    put(repo, '.planning/work/inbox/SIG-1.md', item({ id: 'SIG-1', type: 'NEW', status: 'N', title: 'Raw capture' }));
    put(repo, '.planning/work/backlog/SIG-2.md', item({ id: 'SIG-2', type: 'FEAT', status: 'T', title: 'Export the report · **roadmap**' }));
    put(repo, '.planning/work/backlog/SIG-3.md', item({ id: 'SIG-3', type: 'BUG', status: 'T', title: 'A bug', legacy_id: 'B3', priority: 'P2' }, '| B3 | `confirmed` | P2 | **A bug.** Details. |\n'));
    put(repo, '.planning/work/backlog/SIG-4.md', item({ id: 'SIG-4', type: 'Q', status: 'T', title: 'A question?' }));
    put(repo, '.planning/work/done/2026-09/SIG-5.md', item({ id: 'SIG-5', type: 'FEAT', status: 'C', title: 'Old', close: { reason: 'wontdo', by, at: '2026-09-02', proof: 'legacy — not re-verified' } }));
    await generateAll(repo);
    g(repo, 'init', '-q', '-b', 'main');
    g(repo, 'add', '-A');
    g(repo, 'commit', '-q', '-m', 'v1');
    res = await differentialRead(repo, { workDir: join(root, 'work') });
  }, 60_000);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('builds the three projects and reads all of them; the v2 store reads as v2 with every record', () => {
    expect(res.manifest ?? res.projects.manifest).toBeTruthy();
    expect(res.outputs.v2.records.version).toBe(2);
    expect(res.outputs.v2.records.records.map((r) => r.id)).toEqual(['SIG-1', 'SIG-2', 'SIG-3', 'SIG-4', 'SIG-5']);
    expect(res.outputs.off.records).toBeNull();
    expect(res.outputs.v1.records.version).toBe(1);
  });

  it('finds no migration error', () => {
    const errors = res.classified.filter((d) => d.class === CLASSES.ERROR);
    expect(errors.map((d) => `${d.comparison} ${d.reader} ${d.key}: ${d.left} → ${d.right}`)).toEqual([]);
  });

  it('the v1 converter read and the migrated records agree record for record', () => {
    expect(res.classified.filter((d) => d.comparison === 'v1' && d.reader === 'records')).toEqual([]);
  });
});
