// M6.E13 S4 t4.5a — the bug facts and the backlog discharge status on the work
// records (AC3.1, AC4.1).
//
// With the work store on, `published-facts.js` (`published-bug-tally`,
// `bug-status-vs-changelog`), `bug-fixed-jev.js`, `bugs-tally.js` and
// `backlog.js` `backlogDischargeStatus` read the records through `listRecords` —
// a v2 store directly, a v1 store through the converter — and never a Markdown
// list parser. Every twin runs once per store version over the SAME items, with
// `SIGNAL_FORBID_LIST_PARSERS=1` (Decision 12), so a call to `walkBugEntries`,
// `readPublishedTally` or `parseBacklogRows` throws.
//
// The decoy views prove the records were read: the stale `BUGS.md` holds `B99`
// as `confirmed` and publishes no tally, and the stale `BACKLOG.md` leads with
// `M9.E9`.
//
// Store off is pinned, unchanged, by `tests/work-store-off.test.js`.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { checkPublishedBugTally, checkBugStatusVsChangelog } from '../plugin/tools/lib/published-facts.js';
import { makeBugFixedJevCheck } from '../plugin/tools/lib/bug-fixed-jev.js';
import { deriveBugCountsFromRecords, formatTallySegment, bugRecordIds } from '../plugin/tools/lib/bugs-tally.js';
import { backlogDischargeStatus, BACKLOG_DISCHARGE } from '../plugin/tools/lib/backlog.js';
import { checkBacklogDischarge } from '../plugin/tools/lib/sweep.js';
import { listRecords, recordPath } from '../plugin/tools/lib/work-records.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';
import { isReceipt } from '../plugin/tools/lib/receipt.js';
import {
  ITEMS,
  storeProject,
  cleanupStoreProjects,
  put,
  putBroken,
  withParserBan,
} from './helpers/work-store-fixture.js';

withParserBan({ beforeAll, afterAll });
afterEach(cleanupStoreProjects);

const VERSIONS = [2, 1];

// One more bug, closed as wontdo, so every count bucket is non-empty.
const DISMISSED = { id: 'SIG-15', type: 'BUG', title: 'A bug closed as wontdo', status: 'C', v1: 'work/done/2026-09' };
const BUG_ITEMS = [...ITEMS, DISMISSED];

// SIG-5 N, SIG-4 T, SIG-6 closing (a fix waiting for its commit), SIG-15 closed wontdo.
const COUNTS = { needsTriage: 1, capturedUntriaged: 0, confirmed: 1, dismissed: 1, fixed: 1, tableRows: 4, total: 4, unreadable: [] };

// The tally line each store version's BUGS.md view publishes for those counts.
const TALLY = {
  1: '*1 needs-triage · **0 captured-untriaged** · 1 confirmed · 1 dismissed · 1 fixed (**4 total**)*',
  2: '*1 needs-triage · 1 confirmed · 1 closing · 1 closed (4 total) · closes more than 30 days before the newest event are in `work/history/`*',
};

const CHANGELOG = [
  '# Changelog',                                           // 1
  '',                                                      // 2
  '## [Unreleased]',                                       // 3
  '',                                                      // 4
  '- SIG-5 is being worked on.',                           // 5
  '',                                                      // 6
  '## [0.1.40] — 2026-09-10',                              // 7
  '',                                                      // 8
  '**`B117`, fix lane. The doctor reads the key.**',       // 9
  'Corrected the read.',                                   // 10
  '',                                                      // 11
  '## [0.1.39] — 2026-09-01',                              // 12
  '',                                                      // 13
  '**`B99` fixed, and `SIG-6` too.**',                     // 14
].join('\n');

const WORK_MD = '.planning/work/WORK.md';
const brokenWorkMd = (base) => put(base, WORK_MD, '---\nschema_version: 2\n---\n'); // no key

describe.each(VERSIONS)('t4.5a — bugs-tally deriveBugCountsFromRecords on a v%i store', (version) => {
  it('counts BUG records by folded status: N, T/Q/P, closing and closed-fixed as fixed, other closes dismissed', () => {
    const { records } = listRecords(storeProject(version, { items: BUG_ITEMS }));
    expect(deriveBugCountsFromRecords(records)).toEqual(COUNTS);
  });

  it('renders through formatTallySegment unchanged', () => {
    const { records } = listRecords(storeProject(version, { items: BUG_ITEMS }));
    expect(`*${formatTallySegment(deriveBugCountsFromRecords(records))}*`).toBe(TALLY[1]);
  });
});

describe('t4.5a — bugRecordIds: the ids text written about a bug record uses', () => {
  it('SIG-n, a B{n} legacy id, and the B{n} of its own number; a BUGS.md:LINE capture reference is not an id', () => {
    expect(bugRecordIds({ id: 'SIG-4', legacy_id: 'B117' })).toEqual({ ids: ['SIG-4', 'B117', 'B4'], label: 'SIG-4 (B117, B4)' });
    expect(bugRecordIds({ id: 'SIG-12', legacy_id: 'B12' })).toEqual({ ids: ['SIG-12', 'B12'], label: 'SIG-12 (B12)' });
    expect(bugRecordIds({ id: 'SIG-128', legacy_id: 'BUGS.md:209' })).toEqual({ ids: ['SIG-128', 'B128'], label: 'SIG-128 (B128)' });
    expect(bugRecordIds({ id: 'SIG-130' })).toEqual({ ids: ['SIG-130', 'B130'], label: 'SIG-130 (B130)' });
  });
});

describe.each(VERSIONS)('t4.5a — published-bug-tally on a v%i store', (version) => {
  const run = async (base) => (await runDriftChecks(base, [checkPublishedBugTally])).results[0];

  it('the view publishes the tally the records derive → clean', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, '.planning/BUGS.md', `# Bugs\n\n| ID | Status | Pri | Summary |\n\n${TALLY[version]}\n`);
    const row = await run(base);
    expect(row.status).toBe(STATUS.CLEAN);
    expect(row.findings).toEqual([]);
  });

  it('the decoy view (no tally, a B99 row) → a finding naming the tally the records derive, never B99', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    const row = await run(base);
    expect(row.status).toBe(STATUS.FINDINGS);
    expect(row.findings).toHaveLength(1);
    expect(row.findings[0].file).toBe(join(base, '.planning', 'BUGS.md'));
    expect(row.findings[0].message).toContain(TALLY[version]);
    expect(row.findings[0].message).toMatch(/work records/);
    expect(row.findings[0].message).not.toContain('B99');
  });

  it('a record that does not read → cannot evaluate, naming it', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    putBroken(base, version, 'SIG-16');
    const row = await run(base);
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).toMatch(/SIG-16/);
  });

  it('no BUGS.md → not applicable, as with the store off', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    rmSync(join(base, '.planning', 'BUGS.md'));
    expect((await run(base)).status).toBe(STATUS.NOT_APPLICABLE);
  });
});

describe('t4.5a — published-bug-tally with a broken WORK.md', () => {
  it('cannot evaluate — and BUGS.md is not read instead', async () => {
    const base = storeProject(2, { items: BUG_ITEMS });
    brokenWorkMd(base);
    const row = (await runDriftChecks(base, [checkPublishedBugTally])).results[0];
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).toMatch(/work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.5a — bug-status-vs-changelog on a v%i store', (version) => {
  const run = async (base) => (await runDriftChecks(base, [checkBugStatusVsChangelog])).results[0];

  it('an open bug whose legacy id a released headline names is flagged by its record; closing, N and the decoy are not', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    const row = await run(base);
    expect(row.status).toBe(STATUS.FINDINGS);
    expect(row.findings).toHaveLength(1);
    const [f] = row.findings;
    const { records } = listRecords(base);
    expect(f.file).toBe(join(base, records.find((r) => r.id === 'SIG-4').path));
    expect(f.message).toMatch(/^SIG-4 \(B117, B4\) is open/);
    expect(f.message).toMatch(/headline names it/);
    // SIG-6 is closing (its fix is requested), SIG-5 is only in [Unreleased], B99 is the decoy view's.
    expect(f.message).not.toMatch(/SIG-6|SIG-5|B99/);
  });

  it('the record\'s own SIG-n in a headline is matched too', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-10-01\n\nFixed SIG-4 at last.\n');
    const row = await run(base);
    expect(row.findings.map((f) => f.message.split(' ')[0])).toEqual(['SIG-4']);
  });

  it('the B{n} the v1 view showed for the record (D-M6E11-20) is matched too', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-10-01\n\n`B4` fixed.\n');
    const row = await run(base);
    expect(row.findings.map((f) => f.message.split(' ')[0])).toEqual(['SIG-4']);
  });

  it('SIG-4 does not match SIG-40', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', '# Changelog\n\n## [0.2.0] — 2026-10-01\n\nFixed SIG-40 and B1170.\n');
    expect((await run(base)).findings).toEqual([]);
  });

  it('a record that does not read → cannot evaluate, naming it', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    putBroken(base, version, 'SIG-16');
    const row = await run(base);
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).toMatch(/SIG-16/);
  });

  it('no BUGS.md view is no reason to skip: the records are the bugs', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    rmSync(join(base, '.planning', 'BUGS.md'));
    expect((await run(base)).findings).toHaveLength(1);
  });
});

const fakeAsk = (byId) => vi.fn(async ({ question }) => {
  const id = question.instructions.match(/^Bug (\S+)/)[1];
  return { ok: true, noul: byId[id] ?? 0.05, model: 'jev-1.13.0' };
});

describe.each(VERSIONS)('t4.5a — bug-fixed-jev on a v%i store', (version) => {
  it('asks about each open (confirmed) bug record a released section names — by SIG-n or legacy id — and cites the record', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    const ask = fakeAsk({ 'SIG-4': 0.8 });
    const [row] = (await runDriftChecks(base, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
    expect(row.status).toBe(STATUS.FINDINGS);
    // Only SIG-4 (T): SIG-5 is N, SIG-6 closing, SIG-15 closed; B99 is the decoy view's.
    expect(ask).toHaveBeenCalledTimes(1);
    const [{ question, state }] = ask.mock.calls[0];
    expect(question.instructions).toMatch(/^Bug SIG-4 \(B117, B4\) is recorded as still open/);
    expect(state).toContain('## [0.1.40] — 2026-09-10');
    expect(row.findings).toHaveLength(1);
    const [f] = row.findings;
    expect(isReceipt(f.receipt)).toBe(true);
    const { records } = listRecords(base);
    const path = records.find((r) => r.id === 'SIG-4').path;
    expect(f.file).toBe(path);
    expect(f.receipt.claim.file).toBe(path);
    // The claim quotes the record line carrying the ID, verbatim at its line.
    const lines = readFileSync(join(base, path), 'utf-8').split('\n');
    expect(f.receipt.claim.excerpt).toBe(lines[f.receipt.claim.line - 1]);
    expect(f.receipt.claim.excerpt).toContain('SIG-4');
    expect(f.receipt.evidence).toEqual({ source: 'CHANGELOG.md', line: 7, excerpt: '## [0.1.40] — 2026-09-10' });
    expect(f.message).toMatch(/^SIG-4 \(B117, B4\) is open/);
    expect(row.coverage).toMatchObject({ checked: 1, total: 1, unchecked: [] });
  });

  it('no API key → cannot evaluate, and nothing is read or asked (inert)', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    putBroken(base, version, 'SIG-16'); // a records read would surface this; it must not happen
    const ask = vi.fn();
    const [row] = (await runDriftChecks(base, [makeBugFixedJevCheck({ ask, key: '' })])).results;
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).not.toMatch(/SIG-16/);
    expect(ask).not.toHaveBeenCalled();
  });

  it('a record that does not read → cannot evaluate, naming it, nothing asked', async () => {
    const base = storeProject(version, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    putBroken(base, version, 'SIG-16');
    const ask = vi.fn();
    const [row] = (await runDriftChecks(base, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).toMatch(/SIG-16/);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('t4.5a — bug-fixed-jev with a broken WORK.md', () => {
  it('cannot evaluate; BUGS.md is not read instead', async () => {
    const base = storeProject(2, { items: BUG_ITEMS });
    put(base, 'CHANGELOG.md', CHANGELOG);
    brokenWorkMd(base);
    const ask = vi.fn();
    const [row] = (await runDriftChecks(base, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
    expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
    expect(row.reason).toMatch(/work store could not be read/);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe.each(VERSIONS)('t4.5a — backlogDischargeStatus on a v%i store', (version) => {
  it('stale = a live item whose own Epic is closed (SIG-13 in archived M5.E1); never the decoy BACKLOG.md row', async () => {
    const res = await backlogDischargeStatus(storeProject(version));
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.STALE);
    expect(res.stale).toEqual([
      { heading: 'Leftover in a closed Epic', line: null, id: 'SIG-13', epic: 'M5.E1', status: 'Q', evidence: 'M5.E1 is archived' },
    ]);
    expect(res.blind).toEqual([]);
    expect(res.broken).toEqual([]);
    expect(JSON.stringify(res)).not.toContain('M9.E9');
  });

  it('no item in a closed Epic → clean', async () => {
    const res = await backlogDischargeStatus(storeProject(version, { items: ITEMS.filter((i) => i.id !== 'SIG-13') }));
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CLEAN);
    expect(res.stale).toEqual([]);
  });

  it('unit closure unreadable → the archived Epic is still known, the other is blind', async () => {
    const base = storeProject(version);
    put(base, '.planning/STATE.md', '---\nschema_version: [unclosed\n---\n');
    const res = await backlogDischargeStatus(base);
    expect(res.stale.map((s) => s.id)).toEqual(['SIG-13']);
    expect(res.blind).toMatchObject([{ id: 'SIG-3', epic: 'M6.E3', source: 'unit closure' }]);
    expect(res.sources.units).toBe(false);
  });

  it('a record that does not read is reported beside the result', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-16');
    const res = await backlogDischargeStatus(base);
    expect(res.stale.map((s) => s.id)).toEqual(['SIG-13']);
    expect(res.broken.map((b) => b.id ?? b.path).join(' ')).toMatch(/SIG-16/);
  });

  it('the sweep reports exactly what backlogDischargeStatus decides (one definition)', async () => {
    const base = storeProject(version);
    const res = await backlogDischargeStatus(base);
    const f = await checkBacklogDischarge(base);
    expect(f).toHaveLength(1);
    for (const s of res.stale) expect(f[0].message).toContain(`${s.id} (${s.status} in ${s.epic}`);
  });
});

describe('t4.5a — backlogDischargeStatus with a broken WORK.md', () => {
  it('cannot evaluate — BACKLOG.md is not read instead', async () => {
    const base = storeProject(2);
    brokenWorkMd(base);
    const res = await backlogDischargeStatus(base);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.reason).toMatch(/the work store could not be read/);
  });
});

describe('t4.5a — the fixture is what the twins assume', () => {
  it('SIG-4 is a BUG with legacy id B117 at its fixed record path (v2)', () => {
    const base = storeProject(2, { items: BUG_ITEMS });
    const rec = JSON.parse(readFileSync(join(base, recordPath('SIG-4')), 'utf-8'));
    expect(rec).toMatchObject({ id: 'SIG-4', type: 'BUG', legacy_id: 'B117' });
  });
});
