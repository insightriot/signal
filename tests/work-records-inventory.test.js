// Write-path inventory for work-records.js (M6.E13.S2.t2.4, AC2.2, PLAN Decision 9).
// See .planning/M6.E13-VALIDATION.md row AC2.2.
//
// Two checks, both enforced:
//
// 1. RUNTIME — every exported function of work-records.js is classified in the
//    tables below, and the classification is checked by RUNNING it against a
//    temp v2 store and diffing every file:
//      READERS  must change no file at all.
//      WRITERS  every record file it changed gained exactly one event, the old
//               events are an unchanged prefix, no record moved or vanished, and a
//               new record sits at its recordPath. A writer that changes no record
//               fails too: its scenario is not exercising it.
//      EXEMPT   a reviewed reason, written here.
//    An unclassified export fails, so a writer added later (t2.2) cannot ship
//    without a scenario here. Why runtime and not a registry exported by the
//    module: a registry is the module's own claim about itself; running it
//    is a check of that claim.
//
// 2. STATIC — no lock-taking export reaches another lock-taking export, and no
//    internal function takes the lock except the one that calls `acquireLock`
//    (Decision 9: only public entry points take the `work` lock; internal
//    functions receive a handle). A call graph over work-records.js's top-level
//    functions, comments stripped; a function is lock-taking when it reaches
//    `acquireLock(`.
//
// Work-records.js has no writer yet (t2.2 adds them), so each check is also
// run against deliberately bad fixtures, to prove it catches what it claims.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { lockNesting, classify, checkReaders, checkWriter } from './helpers/write-inventory.js';

const SOURCE = readFileSync(new URL('../plugin/tools/lib/work-records.js', import.meta.url), 'utf-8');

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: 'M6.E13' },
  started: { type: 'started', at: AT, by, epic: 'M6.E13' },
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: '0123abc' },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
};
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with one record in every derived state, and a body.
async function makeStore() {
  const base = await mkdtemp(join(tmpdir(), 'sig-inventory-'));
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const fixtures = [
    rec('SIG-1', [E.created]),
    rec('SIG-2', [E.created, E.triaged]),
    rec('SIG-3', [E.created, E.triaged, E.queued]),
    rec('SIG-4', [E.created, E.triaged, E.started]),
    rec('SIG-5', [E.created, E.closing]),
    rec('SIG-1006', [E.created, E.wontdo]),
  ];
  for (const r of fixtures) await put(base, records.recordPath(r.id), serializeRecord(r));
  await put(base, records.bodyPath('SIG-2'), 'body\n');
  return base;
}

// ── The classification of work-records.js ───────────────────────────────────
//
// READERS: name → how to call it on the store. WRITERS: name → {run, newEvents?}
// (`newEvents`: events a NEW record may be written with; default 1). EXEMPT:
// name → the reviewed reason it neither reads-only nor appends an event.

const READERS = {
  recordPath: () => records.recordPath('SIG-2'),
  bodyPath: () => records.bodyPath('SIG-2'),
  parseIdFileName: () => records.parseIdFileName('SIG-2.json'),
  storeVersion: (base) => records.storeVersion(base),
  assertWritable: (base) => records.assertWritable(base),
  listRecords: (base) => records.listRecords(base, { bodies: true }),
  getRecord: (base) => records.getRecord(base, 'SIG-2'),
  nextIdV2: (base) => records.nextIdV2(base),
  findDuplicateIds: (base) => records.findDuplicateIds(base),
  isEpicArchived: (base) => records.isEpicArchived(base, 'M6.E13'),
  checkRecords: (base) => records.checkRecords(base),
  closeEpicCheck: (base) => {
    try {
      records.closeEpicCheck(base, 'M6.E13'); // refuses: SIG-3 and SIG-4 are open in it
    } catch (err) {
      if (err.code !== 'OPEN_ITEMS') throw err;
    }
  },
};

// Body edits are NOT a library writer (t2.2, answering t2.4's open question):
// a body is a plain file beside its record, which the guard hook allows, so a
// body-only change records no event and has no function here. `checkWriter`
// judges records only, and every writer below changes one.
const WRITERS = {
  // newItem is run WITH triage: a triaged capture is written with two events,
  // created + triaged, in one locked write (the double lock `promoteInStore`
  // took, B6). Reviewed: it is one new record, not an append to an old one.
  newItem: {
    run: (base) => records.newItem(base, { title: 'n', by, triage: { type: 'BUG' } }),
    newEvents: 2,
  },
  newItems: { run: (base) => records.newItems(base, [{ title: 'a', by }, { title: 'b', by }]) },
  triageItem: { run: (base) => records.triageItem(base, 'SIG-1', { by }) },
  queueItem: { run: (base) => records.queueItem(base, 'SIG-2', { epic: 'M6.E13', by }) },
  startItem: { run: (base) => records.startItem(base, 'SIG-2', { epic: 'M6.E13', by }) },
  requestClose: { run: (base) => records.requestClose(base, 'SIG-2', { proof: '0123abc', by }) },
  closeItem: { run: (base) => records.closeItem(base, 'SIG-2', { reason: 'wontdo', proof: 'no', by }) },
  closeItems: {
    run: (base) => records.closeItems(base, [
      { id: 'SIG-1', reason: 'stale', proof: 'old', by },
      { id: 'SIG-2', reason: 'dup', dup_of: 'SIG-3', by },
    ]),
  },
  reopenItem: { run: (base) => records.reopenItem(base, 'SIG-1006', { reason: 'back', by }) },
  editItem: { run: (base) => records.editItem(base, 'SIG-2', { changes: { title: 'edited' }, by }) },
  // The store is not a git repo, so git is stubbed: origin/main resolves and
  // SIG-5's proof (0123abc) is an ancestor of it. SIG-5 gains one `closed`.
  // Real-git scenarios are in tests/work-records-confirm.test.js.
  confirmCloses: {
    run: (base) => records.confirmCloses(base, {
      execFn: (cmd, args) => {
        if (args.includes('--is-inside-work-tree')) return 'true\n';
        if (args[0] === 'remote') return 'origin\n';
        if (args.includes('origin/HEAD')) return 'origin/main\n';
        return '';
      },
    }),
  },
};

const EXEMPT = {
  // name: 'reason, reviewed by …'
};

// Lock nesting outside this module, reviewed and out of scope (Decision 9):
// `checkpoint.js:326` and `archive-tree.js:594` take the `state` lock and then
// the `work` lock — two different locks in a fixed order, not a re-entry.
// Recorded here so the exemption is written down where the rule is enforced.
const REVIEWED_CROSS_MODULE_NESTING = ['checkpoint.js:326 state → work', 'archive-tree.js:594 state → work'];

// In-module lock findings reviewed and accepted, by the export's name, with the
// reason. The scan cannot see branches: an export that delegates to another in
// one branch and takes the lock itself in another (v1 `applyTriage` is that
// shape) reads as two takes. Prefer an internal function that receives the
// handle; list it here only when that is not possible.
const REVIEWED_LOCK_NESTING = {};

let base;
beforeEach(async () => {
  base = await makeStore();
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('work-records.js — every export is classified (AC2.2)', () => {
  it('no export is missing from the tables, and none is listed twice or stale', () => {
    expect(classify(records, { READERS, WRITERS, EXEMPT })).toEqual([]);
  });

  it('every lock-taking export is a writer or exempt', () => {
    const { lockTaking } = lockNesting(SOURCE);
    for (const name of lockTaking.filter((n) => n in records)) {
      expect(name in WRITERS || name in EXEMPT, `${name} takes the lock but is classified as a reader`).toBe(true);
    }
  });
});

describe('work-records.js — readers change nothing', () => {
  it('each reader leaves every file under the project byte-identical', async () => {
    expect(await checkReaders(base, READERS)).toEqual([]);
  });
});

describe('work-records.js — every writer appends exactly one event per record it changes', () => {
  for (const [name, spec] of Object.entries(WRITERS)) {
    it(name, async () => {
      expect(await checkWriter(base, name, spec)).toEqual([]);
    });
  }
  it('has nothing unchecked: the table is the population (t2.2 adds writers)', () => {
    expect(Object.keys(WRITERS).every((n) => typeof records[n] === 'function')).toBe(true);
  });
});

describe('work-records.js — no lock-taking export calls another (Decision 9)', () => {
  it('the module passes', () => {
    const open = lockNesting(SOURCE).violations.filter((v) => !(v.split(' ')[0].replace(/:$/, '') in REVIEWED_LOCK_NESTING));
    expect(open).toEqual([]);
  });
  it('the cross-module state → work nesting is listed as reviewed', () => {
    expect(REVIEWED_CROSS_MODULE_NESTING).toHaveLength(2);
  });
});

// ── The checks catch what they claim: deliberately bad fixtures ─────────────

describe('the inventory catches a bad writer', () => {
  const at = (id) => records.recordPath(id);
  const rewrite = async (b, id, f) => {
    const r = JSON.parse(await readFile(join(b, at(id)), 'utf-8'));
    await writeFile(join(b, at(id)), serializeRecord(f(r)));
  };

  it('a writer that changes a record without an event', async () => {
    const run = (b) => rewrite(b, 'SIG-2', (r) => ({ ...r, title: 'changed' }));
    const v = await checkWriter(base, 'noEvent', { run });
    expect(v).toEqual([expect.stringMatching(/noEvent.*SIG-2\.json.*0 events/)]);
  });

  it('a writer that appends two events', async () => {
    const run = (b) => rewrite(b, 'SIG-2', (r) => ({ ...r, events: [...r.events, E.queued, E.started] }));
    expect(await checkWriter(base, 'twoEvents', { run })).toEqual([expect.stringMatching(/twoEvents.*SIG-2\.json.*2 events/)]);
  });

  it('a writer that rewrites history instead of appending', async () => {
    const run = (b) => rewrite(b, 'SIG-4', (r) => ({ ...r, events: [r.events[0], E.queued, E.started] }));
    expect(await checkWriter(base, 'rewrite', { run })).toEqual([expect.stringMatching(/rewrite.*SIG-4\.json.*not a prefix/)]);
  });

  it('a writer that moves or deletes a record (AC1.1)', async () => {
    const move = (b) => rename(join(b, at('SIG-2')), join(b, '.planning/work/items/00/SIG-2.json.bak'));
    expect(await checkWriter(base, 'mover', { run: move })).toEqual(
      expect.arrayContaining([expect.stringMatching(/mover.*SIG-2\.json.*removed/)]),
    );
    const base2 = await makeStore();
    try {
      const del = (b) => unlink(join(b, at('SIG-1')));
      expect(await checkWriter(base2, 'deleter', { run: del })).toEqual([expect.stringMatching(/deleter.*SIG-1\.json.*removed/)]);
    } finally {
      await rm(base2, { recursive: true, force: true });
    }
  });

  it('a writer that creates a record off its path, or with two events', async () => {
    const off = (b) => put(b, '.planning/work/items/03/SIG-7.json', serializeRecord(rec('SIG-7', [E.created])));
    expect(await checkWriter(base, 'offPath', { run: off })).toEqual([expect.stringMatching(/offPath.*items\/03\/SIG-7\.json.*recordPath/)]);
    const base2 = await makeStore();
    try {
      const two = (b) => put(b, at('SIG-8'), serializeRecord(rec('SIG-8', [E.created, E.triaged])));
      expect(await checkWriter(base2, 'twoNew', { run: two })).toEqual([expect.stringMatching(/twoNew.*SIG-8\.json.*2 events/)]);
      const base3 = await makeStore();
      try {
        expect(await checkWriter(base3, 'twoNewDeclared', { run: two, newEvents: 2 })).toEqual([]);
      } finally {
        await rm(base3, { recursive: true, force: true });
      }
    } finally {
      await rm(base2, { recursive: true, force: true });
    }
  });

  it('a writer that changes no record (its scenario exercises nothing)', async () => {
    expect(await checkWriter(base, 'idle', { run: async () => {} })).toEqual([expect.stringMatching(/idle.*changed no record/)]);
  });

  it('a well-behaved writer passes', async () => {
    const run = (b) => rewrite(b, 'SIG-2', (r) => ({ ...r, events: [...r.events, E.queued] }));
    expect(await checkWriter(base, 'good', { run })).toEqual([]);
  });

  it('a reader that writes', async () => {
    const v = await checkReaders(base, { sneaky: (b) => put(b, '.planning/work/BUGS.md', 'x\n') });
    expect(v).toEqual([expect.stringMatching(/sneaky.*BUGS\.md/)]);
  });

  it('an unclassified, a doubly classified and a stale entry', () => {
    const mod = { a: () => {}, b: () => {}, c: () => {}, CONST: 'x' };
    const v = classify(mod, { READERS: { a: () => {}, b: () => {} }, WRITERS: { b: {} }, EXEMPT: { gone: 'r' } });
    expect(v).toEqual([
      expect.stringMatching(/^c: .*not classified/),
      expect.stringMatching(/^b: .*more than once/),
      expect.stringMatching(/^gone: .*not an exported function/),
    ]);
  });
});

describe('the lock check catches nesting', () => {
  const BAD = `
import { acquireLock } from './file-lock.js';
async function withLock(baseDir, fn) {
  const lock = await acquireLock(baseDir + '/.lock');
  try { return await fn(lock); } finally { await lock.released(); }
}
export async function triage(baseDir, id) {
  return withLock(baseDir, async (h) => write(h, id));
}
// export async function notReal() { triage(); }  — a comment is not a call
export async function promote(baseDir, id) {
  await triage(baseDir, id); // nested: a second take of the same lock
  return withLock(baseDir, async (h) => write(h, id));
}
export const queue = async (baseDir, id) => helper(baseDir, id);
async function helper(baseDir, id) {
  return withLock(baseDir, async (h) => write(h, id));
}
function write() {}
export function pure() { return write(); }
`;

  it('flags a lock-taking export that calls another, and an internal function that takes the lock', () => {
    const { lockTaking, violations } = lockNesting(BAD);
    expect(lockTaking.sort()).toEqual(['helper', 'promote', 'queue', 'triage', 'withLock']);
    expect(violations).toEqual([
      expect.stringMatching(/^promote .*triage/),
      expect.stringMatching(/^helper: .*internal function/),
    ]);
  });

  it('a clean module passes', () => {
    const GOOD = `
import { acquireLock } from './file-lock.js';
async function withLock(baseDir, fn) { const l = await acquireLock(baseDir); try { return await fn(l); } finally { await l.released(); } }
function apply(handle, id) { return id; }
export async function triage(baseDir, id) { return withLock(baseDir, async (h) => apply(h, id)); }
export async function queue(baseDir, id) { return withLock(baseDir, async (h) => apply(h, id)); }
export async function triageOne(baseDir, id) { return triage(baseDir, id); }
`;
    expect(lockNesting(GOOD)).toEqual({ lockTaking: ['withLock', 'triage', 'queue', 'triageOne'], violations: [] });
  });

  it('pure delegation is one take, not a nesting; reaching two lock-taking exports is two', () => {
    const TWO = `
import { acquireLock } from './file-lock.js';
async function withLock(b, fn) { const l = await acquireLock(b); try { return await fn(l); } finally { await l.released(); } }
export async function triage(b, id) { return withLock(b, async () => id); }
export async function queue(b, id) { return withLock(b, async () => id); }
export async function triageMany(b, ids) { return triage(b, ids); }
export async function promote(b, id) { await triage(b, id); return queue(b, id); }
`;
    expect(lockNesting(TWO).violations).toEqual([expect.stringMatching(/^promote .*queue.*triage|^promote .*triage.*queue/)]);
  });

  it('a namespace import of file-lock.js is refused: fl.acquireLock( would be invisible', () => {
    const NS = "import * as fl from './file-lock.js';\nexport async function x() { await fl.acquireLock('l'); }\n";
    expect(lockNesting(NS).violations).toEqual(
      expect.arrayContaining([expect.stringMatching(/namespace/)]),
    );
  });

  it('a module that imports file-lock.js but shows no take is refused (the scan saw nothing)', () => {
    const BLIND = "import { acquireLock } from './file-lock.js';\nexport const x = async () => { const take = acquireLock; await take('l'); };\n";
    expect(lockNesting(BLIND).violations).toEqual([expect.stringMatching(/file-lock\.js.*no function/)]);
  });

  it('parses the real file: a take injected into two real exports is caught', () => {
    const injected = SOURCE
      .replace('export function listRecords(baseDir, opts = {}) {', "export function listRecords(baseDir, opts = {}) {\n  acquireLock('a');")
      .replace('export function getRecord(baseDir, id, opts = {}) {', "export function getRecord(baseDir, id, opts = {}) {\n  acquireLock('b');\n  listRecords(baseDir);");
    expect(injected).not.toBe(SOURCE);
    const { lockTaking, violations } = lockNesting(injected);
    const real = lockNesting(SOURCE).lockTaking; // the writers t2.2 added
    // closeEpicCheck reads through listRecords, so the injected take reaches it too.
    expect(lockTaking.filter((n) => !real.includes(n))).toEqual(['listRecords', 'getRecord', 'closeEpicCheck']);
    // confirmCloses takes the lock AND reads through listRecords, so a take
    // injected into listRecords makes it a second entry point: caught too.
    expect(violations).toEqual([
      expect.stringMatching(/^getRecord .*listRecords/),
      expect.stringMatching(/^confirmCloses .*listRecords/),
    ]);
  });

  it('an aliased acquireLock import is refused, since the scan matches the name', () => {
    const ALIAS = "import { acquireLock as take } from './file-lock.js';\nexport async function x() { await take('l'); }\n";
    expect(lockNesting(ALIAS).violations).toEqual([expect.stringMatching(/alias/), expect.stringMatching(/no function/)]);
  });
});
