// SIG-280 (6) (M6.E14 S2): a store write used to save the record and only then
// try to regenerate the views — so a cause the views refuse (a hand-kept view,
// a linked WATCHLIST.md, an archived Epic README with bad YAML, another record
// that is broken) left the record written and the views stale. Each writer now
// checks first: it refuses with the cause and writes nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-07T10:00:00.000Z';
const by = 'claude';
const noGit = () => {
  throw new Error('not a repo');
};
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-views-preflight-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(records.recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'NEW', title: 'raw', events: [created] }));
  await put(records.recordPath('SIG-2'), serializeRecord({ id: 'SIG-2', type: 'BUG', title: 'a bug', events: [created, triaged] }));
  // Start from views that regenerate cleanly, so each case adds exactly one cause.
  await records.triageItem(base, 'SIG-1', { type: 'FEAT', by, at: AT }, { execFn: noGit });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const CAUSES = {
  'a hand-kept view': {
    make: () => put('.planning/BUGS.md', '# Bugs kept by hand\n'),
    says: /hand-kept/,
  },
  'a linked WATCHLIST.md': {
    make: async () => {
      await put('elsewhere.md', 'secret-ish\n');
      await symlink(join('..', '..', 'elsewhere.md'), join(base, '.planning/work/WATCHLIST.md'));
    },
    says: /WATCHLIST\.md/,
  },
  'an archived Epic README with invalid YAML': {
    make: () => put('.planning/archive/epics/M5.E1/README.md', '---\nclose: [unclosed\n---\n'),
    says: /README\.md: its frontmatter is not valid YAML/,
  },
  'another record that is broken': {
    make: () => put(records.recordPath('SIG-9'), '{ not json'),
    says: /SIG-9/,
  },
};

const WRITERS = {
  newItem: () => records.newItem(base, { title: 'new one', by, at: AT }, { execFn: noGit }),
  queueItem: () => records.queueItem(base, 'SIG-2', { epic: 'M6.E14', by, at: AT }, { execFn: noGit }),
  requestClose: () => records.requestClose(base, 'SIG-2', { proof: 'abcdef1', by, at: AT }, { execFn: noGit }),
};

describe('a store write refuses up front when the views cannot be regenerated (AC4.1)', () => {
  for (const [cause, { make, says }] of Object.entries(CAUSES)) {
    for (const [writer, write] of Object.entries(WRITERS)) {
      it(`${writer}, with ${cause}: refuses with the cause and writes no record`, async () => {
        await make();
        const before = snapshotTree(join(base, '.planning/work/items'));
        const err = await write().catch((e) => e);
        expect(err).toBeInstanceOf(WorkStoreError);
        expect(err.message).toMatch(says);
        expect(err.message).toMatch(/^nothing was written/);
        expect(err.message).not.toMatch(/SIG-\d+ (was written|is closing|was queued)/);
        expect(snapshotTree(join(base, '.planning/work/items'))).toEqual(before);
      });
    }
  }
});

describe('a failure after the write still says the record was written (AC4.2)', () => {
  it('names the change and the recovery: fix the cause, then make any item change', async () => {
    const err = await records
      .newItem(base, { title: 'late failure', by, at: AT }, {
        execFn: noGit,
        regenerate: async () => {
          throw new WorkStoreError('CONFIG', '.planning/BACKLOG.md is hand-kept, not generated');
        },
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/SIG-3 was written, but the views were not regenerated/);
    expect(err.message).toMatch(/then make any item change/);
  });
});
