// M6.E13 S4 t4.4 — `/sig:docs-sweep` on the work records (AC3.1, AC4.1, AC7.3).
//
// With the work store on, the sweep's backlog-discharge, stale-inbox and
// dangling-reference checks read the records through `listRecords` — a v2 store
// directly, a v1 store through the converter — and never a Markdown list
// parser; the store check runs `checkRecords` on v2 and the existing v1
// `checkStore` on v1; and a new advisory names items left *closing* more than
// 14 days. Every twin runs once per store version over the SAME items, with
// `SIGNAL_FORBID_LIST_PARSERS=1` (Decision 12).
//
// The decoy views prove the records were read: the stale `BUGS.md` defines
// `B99` (so a reader that parsed it would call `B99` defined), the stale
// `BACKLOG.md` leads with `M9.E9`, and the stale `ISSUES-INBOX.md` holds two
// headings where the store holds three N records.
//
// Store off is pinned, unchanged, by `tests/work-store-off.test.js`.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

import {
  checkBacklogDischarge,
  checkStaleInbox,
  checkWorkStore,
  checkClosingTooLong,
} from '../plugin/tools/lib/sweep.js';
import { checkDanglingReferences } from '../plugin/tools/lib/doc-hygiene.js';
import { listClosing, recordPath } from '../plugin/tools/lib/work-records.js';
import { checkStore } from '../plugin/tools/lib/work-store.js';
import {
  ITEMS,
  NOW,
  storeProject,
  cleanupStoreProjects,
  put,
  putBroken,
  withParserBan,
} from './helpers/work-store-fixture.js';

withParserBan({ beforeAll, afterAll });
afterEach(cleanupStoreProjects);

const VERSIONS = [2, 1];
const WORK_MD = '.planning/work/WORK.md';
const BROKEN_WORK_MD = '---\nschema_version: 2\n---\n'; // no key
const broken = (base) => put(base, WORK_MD, BROKEN_WORK_MD);

describe.each(VERSIONS)('t4.4 — checkStaleInbox on a v%i store counts status-N records', (version) => {
  it('three N records, not the decoy file\'s two headings', async () => {
    expect(await checkStaleInbox(storeProject(version))).toEqual([
      { check: 'stale-inbox', severity: 'advisory', file: WORK_MD, message: 'inbox has 3 undrained entries — consider draining' },
    ]);
  });

  it('no N record → no finding', async () => {
    const base = storeProject(version, { items: ITEMS.filter((i) => i.status !== 'N') });
    expect(await checkStaleInbox(base)).toEqual([]);
  });
});

describe('t4.4 — checkStaleInbox with a broken WORK.md', () => {
  it('says it could not check — no finding would read as an empty inbox', async () => {
    const base = storeProject(2);
    broken(base);
    const f = await checkStaleInbox(base);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: 'stale-inbox', severity: 'advisory', file: WORK_MD });
    expect(f[0].message).toMatch(/could not be checked — .*work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.4 — checkBacklogDischarge on a v%i store reads the records', (version) => {
  it('names a live item sitting in an archived Epic, and never the decoy BACKLOG.md row', async () => {
    const f = await checkBacklogDischarge(storeProject(version));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: 'backlog-discharge', severity: 'advisory', file: WORK_MD });
    expect(f[0].message).toMatch(/^1 item\(s\) read as open while the Epic they are in is recorded closed — SIG-13 \(Q in M5\.E1: "Leftover in a closed Epic"; M5\.E1 is archived\)/);
    expect(f[0].message).not.toContain('M9.E9');
  });

  it('a store whose open items sit in no closed Epic → no finding', async () => {
    const base = storeProject(version, { items: ITEMS.filter((i) => i.id !== 'SIG-13') });
    expect(await checkBacklogDischarge(base)).toEqual([]);
  });

  it('a record that does not read is reported beside the result, never dropped', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-15');
    const f = await checkBacklogDischarge(base);
    expect(f.map((x) => x.message).join('\n')).toMatch(/SIG-13/);
    expect(f.map((x) => x.message).join('\n')).toMatch(/1 work item\(s\) could not be read — SIG-15 — their Epic is UNKNOWN, not clean/);
  });

  it('when unit closure cannot be read, items in an Epic that is not archived are blind, not clean', async () => {
    const base = storeProject(version);
    put(base, '.planning/STATE.md', '---\nschema_version: [unclosed\n---\n');
    const msgs = (await checkBacklogDischarge(base)).map((x) => x.message).join('\n');
    expect(msgs).toMatch(/SIG-13/); // archived: known without STATE.md
    expect(msgs).toMatch(/1 item\(s\) sit in an Epic whose closure could not be read \(SIG-3 in M6\.E3\)/);
  });
});

describe('t4.4 — checkBacklogDischarge with a broken WORK.md', () => {
  it('could not check — and BACKLOG.md is not read instead', async () => {
    const base = storeProject(2);
    broken(base);
    const f = await checkBacklogDischarge(base);
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/the backlog could not be checked — the work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.4 — checkWorkStore on a v%i store', (version) => {
  it(version === 2 ? 'runs checkRecords: the decoy views differ from a regeneration' : 'runs the v1 checkStore, unchanged', async () => {
    const base = storeProject(version);
    const f = checkWorkStore(base);
    expect(f.every((x) => x.check === 'work-store' && x.severity === 'advisory')).toBe(true);
    if (version === 2) {
      expect(f.map((x) => x.message).join('\n')).toMatch(/differs from a regeneration of the records/);
      expect(f.map((x) => x.file)).toContain('.planning/BUGS.md');
    } else {
      // The v1 branch is exactly the old call.
      const prev = process.env.SIGNAL_FORBID_LIST_PARSERS;
      delete process.env.SIGNAL_FORBID_LIST_PARSERS;
      try {
        expect(checkWorkStore(base)).toEqual(checkStore(base).map((x) => ({
          check: 'work-store', severity: 'advisory', file: x.path ?? x.paths?.[0] ?? WORK_MD, message: x.message,
        })));
      } finally {
        process.env.SIGNAL_FORBID_LIST_PARSERS = prev;
      }
      expect(f.map((x) => x.message).join('\n')).not.toMatch(/differs from a regeneration of the records/);
    }
  });
});

describe('t4.4 — checkWorkStore on a v2 store names a broken record by ID', () => {
  it('a record that does not parse is one finding at its path', async () => {
    const base = storeProject(2);
    putBroken(base, 2, 'SIG-15');
    const f = checkWorkStore(base);
    expect(f.map((x) => x.file)).toContain(recordPath('SIG-15'));
  });
});

const DOC = [
  '# Notes',
  '',
  'B117 is still open (SIG-4). B12 was closed as wontdo, and so was SIG-8.',
  'B5 is how the v1 BUGS.md view showed SIG-5 (D-M6E11-20); B2 was never a bug (SIG-2 is a feature).',
  'B99 was never filed in the store; nor was SIG-99. SIG-15 is a broken record.',
  '',
].join('\n');

describe.each(VERSIONS)('t4.4 — checkDanglingReferences on a v%i store: defined IDs come from the records', (version) => {
  it('SIG-n, legacy B-ids and a bug\'s B{n} resolve; B99 dangles though the stale BUGS.md defines it', async () => {
    const base = storeProject(version);
    put(base, '.planning/NOTES.md', DOC);
    const f = await checkDanglingReferences(base);
    const ids = f.map((x) => x.message.split(' ')[0]);
    expect(ids).toEqual(['B2', 'B99', 'SIG-15', 'SIG-99']);
    expect(f[0]).toMatchObject({ check: 'dangling-reference', severity: 'soft' });
    expect(f[0].message).toMatch(/the work store never defines it/);
  });

  it('a broken record is defined (it exists), and the B-ids it may carry are said to be uncheckable', async () => {
    const base = storeProject(version);
    putBroken(base, version, 'SIG-15');
    put(base, '.planning/NOTES.md', DOC);
    const f = await checkDanglingReferences(base);
    const msgs = f.map((x) => x.message);
    expect(msgs.some((m) => m.startsWith('SIG-15 '))).toBe(false);
    expect(msgs.some((m) => m.startsWith('SIG-99 '))).toBe(true);
    // A broken record's legacy_id is unknown, so a B-id is not called dangling on a guess.
    expect(msgs.some((m) => m.startsWith('B99 '))).toBe(false);
    expect(msgs.join('\n')).toMatch(/1 work item\(s\) could not be read \(SIG-15\) — bug ids \(B…\) were not checked/);
  });
});

describe('t4.4 — checkDanglingReferences with a broken WORK.md', () => {
  it('says the item ids could not be checked, and does not read BUGS.md instead', async () => {
    const base = storeProject(2);
    broken(base);
    put(base, '.planning/NOTES.md', DOC);
    const f = await checkDanglingReferences(base);
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/item and bug ids were not checked — the work store could not be read/);
  });
});

describe.each(VERSIONS)('t4.4 — listClosing on a v%i store (read-only)', (version) => {
  it('lists every closing item with when its fix was requested, and which are past 14 days', () => {
    const got = listClosing(storeProject(version), { now: NOW });
    expect(got.closing.map((c) => [c.id, c.stale])).toEqual([['SIG-6', true], ['SIG-7', false], ['SIG-14', false]]);
    expect(got.closing[0]).toMatchObject({ id: 'SIG-6', proof: 'abcdef1', days: 32 });
    expect(got.closing[0].requestedAt).toMatch(/^2026-09-02/);
    expect(got.version).toBe(version);
  });
});

describe('t4.4 — checkClosingTooLong', () => {
  it('v2: one advisory per item closing more than 14 days, at its record', () => {
    expect(checkClosingTooLong(storeProject(2), { now: NOW })).toEqual([
      {
        check: 'closing-too-long',
        severity: 'advisory',
        file: recordPath('SIG-6'),
        message: 'SIG-6 has been closing for 32 days — its fix commit abcdef1 is not confirmed on the default branch. ' +
          'Merge it, or reopen the item (`/sig:item reopen SIG-6 "<reason>"`) if the fix did not land.',
      },
    ]);
  });

  it('v1: nothing — a v1 fixed close is read as closing only through the converter, until the cutover confirms it', () => {
    expect(checkClosingTooLong(storeProject(1), { now: NOW })).toEqual([]);
  });

  it('store off: nothing', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    expect(checkClosingTooLong(mkdtempSync(join(tmpdir(), 'sig-off-')), { now: NOW })).toEqual([]);
  });

  it('a broken WORK.md: could not check', () => {
    const base = storeProject(2);
    broken(base);
    const f = checkClosingTooLong(base, { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/closing items could not be checked — /);
  });
});

describe('t4.4 — runSweep carries the closing-too-long advisory', () => {
  it('a v2 store with a stale closing item shows it in the sweep report', async () => {
    const { runSweep } = await import('../plugin/tools/lib/sweep.js');
    // The ban is lifted here: published-facts, which the sweep also runs, is t4.5a's.
    const prev = process.env.SIGNAL_FORBID_LIST_PARSERS;
    delete process.env.SIGNAL_FORBID_LIST_PARSERS;
    try {
      const { findings } = await runSweep(storeProject(2));
      expect(findings.filter((f) => f.check === 'closing-too-long').map((f) => f.file)).toEqual([recordPath('SIG-6')]);
    } finally {
      process.env.SIGNAL_FORBID_LIST_PARSERS = prev;
    }
  });
});
