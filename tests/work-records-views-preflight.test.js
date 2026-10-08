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
  closeItem: () => records.closeItem(base, 'SIG-2', { reason: 'wontdo', proof: 'not needed', by, at: AT }, { execFn: noGit }),
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
        expect(err.message).not.toMatch(/SIG-\d+ (was written|is closing|was queued|was closed)/);
        expect(snapshotTree(join(base, '.planning/work/items'))).toEqual(before);
      });
    }
  }
});

describe('a failure after the write still says the record was written (AC4.2)', () => {
  // The real route (M6.E14 REVIEW): the check passes, then a view becomes a link
  // before the real regeneration runs. Its own refusal says "nothing was written
  // … then re-run", which is false once the record landed — and re-running
  // newItem would write the item twice.
  it('a real regeneration refusal after the write: says the change stands, never "nothing was written" or "re-run"', async () => {
    const { regenerateViews } = await import('../plugin/tools/lib/work-views.js');
    const err = await records
      .newItem(base, { title: 'late failure', by, at: AT }, {
        execFn: noGit,
        regenerate: async (b) => {
          await put('elsewhere.md', 'x\n');
          await rm(join(b, '.planning/BUGS.md'), { force: true });
          await symlink(join('..', 'elsewhere.md'), join(b, '.planning/BUGS.md'));
          return regenerateViews(b);
        },
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.message).toMatch(/^SIG-3 was written, and that change stands — but the views were not regenerated/);
    expect(err.message).toMatch(/BUGS\.md is a symbolic link/);
    expect(err.message).toMatch(/then make any item change/);
    expect(err.message).toMatch(/Do not repeat the command/);
    expect(err.message).not.toMatch(/nothing was written|then re-run/);
  });

  it('injecting regenerate does not turn the pre-write check off', async () => {
    await put('.planning/BUGS.md', '# Bugs kept by hand\n');
    const before = snapshotTree(join(base, '.planning/work/items'));
    const err = await records
      .newItem(base, { title: 'x', by, at: AT }, { execFn: noGit, regenerate: async () => {} })
      .catch((e) => e);
    expect(err?.message).toMatch(/^nothing was written — the views cannot be regenerated as things stand: .*hand-kept/s);
    expect(err.message).not.toMatch(/nothing was written.*nothing was written — /s);
    expect(snapshotTree(join(base, '.planning/work/items'))).toEqual(before);
  });
});

describe('message wording (REVIEW pass 2)', () => {
  it('viewsNotRegenerated rewrites only its own phrasings — a path containing "re-run" survives', async () => {
    const { viewsNotRegenerated } = await import('../plugin/tools/lib/work-views.js');
    const err = viewsNotRegenerated('SIG-3 was written', new WorkStoreError('IO', "nothing was written — open '/x/.planning/work/re-run.md'"));
    expect(err.message).toContain("'/x/.planning/work/re-run.md'.");
    expect(err.message).not.toMatch(/nothing was written/);
  });

  it('a hand-kept view after the write: no "make the change with /sig:item" next to "do not repeat"', async () => {
    const { viewsNotRegenerated } = await import('../plugin/tools/lib/work-views.js');
    const inner = new WorkStoreError('CONFIG', '.planning/BUGS.md is hand-kept, so nothing was written. If it was edited by hand, restore '
      + 'it from git (`git checkout -- <file>`) and make the change with /sig:item.');
    const msg = viewsNotRegenerated('SIG-3 was written', inner).message;
    expect(msg).not.toMatch(/make the change with/);
    expect(msg).toMatch(/so no view was written/);
  });

  it('a refused write says "nothing was written" once', async () => {
    await put('elsewhere.md', 'x\n');
    await rm(join(base, '.planning/BUGS.md'), { force: true });
    await symlink(join('..', 'elsewhere.md'), join(base, '.planning/BUGS.md'));
    const err = await records.newItem(base, { title: 'x', by, at: AT }, { execFn: noGit }).catch((e) => e);
    expect(err.message.match(/nothing was written/g)).toHaveLength(1);
  });
});
