// REVIEW pass 2, Suggestions — every piece of free text that lands in an item
// runs through the one sensitive-data detector (`add.js#scrubSensitive`), not
// only a capture's title and body. Pass 1 (I3) gated newItem's title and body;
// these were still written unasked:
//   - `source_ref` (/sig:add's trigger context lands there),
//   - a triage retitle (`applyTriage` accept `title`) and a reject's reason,
//   - a close's `proof`,
//   - a backlog promote of a raw block with no inbox item (it made a new item
//     with the scrub acknowledged in advance).
// Each returns `{aborted: 'sensitive-data-pending', sensitiveHits}` and writes
// nothing unless the caller passes `acknowledgeSensitive: true` — newItem's
// contract. Detection only; never redacts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import { existsSync } from 'node:fs';
import { promoteToBacklog, promoteToBugs } from '../plugin/tools/lib/backlog.js';
import { captureToFutureIdeas } from '../plugin/tools/lib/add.js';
import { getRecord, listRecords, recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const SECRET = 'AKIAABCDEFGHIJKLMNOP';
const PENDING = { aborted: 'sensitive-data-pending' };
let root;

async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-scrub-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// M6.E13 t4.5b: capture and promotion write v2 records, so their describes
// run on a v2 store. t7.4 retired the v1 work-ops writers and their cases.
const v2 = () => put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n# Work store\n');

describe('backlog promote runs the scrub (v2)', () => {
  beforeEach(v2);
  const block = `## A raw block\n\nkey ${SECRET}\n`;

  it.each([
    ['promoteToBacklog', (opts) => promoteToBacklog(root, { block, tag: 'roadmap', ...opts })],
    ['promoteToBugs', (opts) => promoteToBugs(root, { block, ...opts })],
  ])('%s: a raw block with a secret → pending, no record; acknowledged → promoted', async (_name, promote) => {
    const r = await promote({});
    expect(r).toMatchObject({ written: false, ...PENDING });
    expect(listRecords(root).records).toEqual([]);
    const ok = await promote({ acknowledgeSensitive: true });
    expect(ok.written).toBe(true);
    expect(getRecord(root, ok.id).status).toBe('T');
  });

  // Was "a retitle with a secret on an existing inbox item". The promote no
  // longer looks an item up from an inbox block (M6.E13 t4.5b): the retitle is
  // the new record's title, and is scrubbed as such.
  it('a clean block with a secret only in the retitle → pending, nothing written', async () => {
    const r = await promoteToBacklog(root, { block: '## clean\n\nclean\n', tag: 'roadmap', title: `t ${SECRET}` });
    expect(r).toMatchObject({ written: false, ...PENDING });
    expect(listRecords(root).records).toEqual([]);
  });
});

describe('/sig:add with the store on asks about the trigger context too (v2)', () => {
  beforeEach(v2);

  it('a secret only in triggerContext reaches the sensitive prompt; abort writes nothing', async () => {
    const seen = [];
    const r = await captureToFutureIdeas(root, {
      body: 'clean body',
      today: '2026-09-30',
      triggerContext: `mid-EXECUTE ${SECRET}`,
      sensitivePrompt: async (hits) => {
        seen.push(...hits);
        return 'abort';
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(r.written).toBe(false);
    expect(listRecords(root).records).toEqual([]);
  });
});

// REVIEW pass 3 — an Epic close's pr/release land in the archived README.
// (The other pass-3 fields — a reopen's reason, a theme at capture and at
// triage — belonged to the v1 writers retired at M6.E13 t7.4; the v2 library
// scrubs the same fields, pinned in work-records-write/-close.)
describe('closeEpic scrubs pr and release (REVIEW pass 3)', () => {
  beforeEach(v2);
  const AT = '2026-09-01T00:00:00.000Z';
  const noGit = { execFn: () => { throw new Error('no git'); } };

  it.each([['pr', { pr: `#1 ${SECRET}` }], ['release', { release: `v1 ${SECRET}` }]])(
    'closeEpic: a secret in %s → pending, the folder not archived',
    async (_name, extra) => {
      await put(recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'FEAT', title: 'x', events: [
        { type: 'created', at: AT, by: 't' }, { type: 'triaged', at: AT, by: 't' },
        { type: 'started', at: AT, by: 't', epic: 'M6.E98' }, { type: 'closed', at: AT, by: 't', reason: 'wontdo', proof: 'p' },
      ] }));
      await put('.planning/work/epics/M6.E98/M6.E98-PLAN.md', '# plan\n');
      const r = await closeEpic(root, 'M6.E98', { by: 't', ...extra }, noGit);
      expect(r).toMatchObject(PENDING);
      expect(existsSync(join(root, '.planning/work/epics/M6.E98'))).toBe(true);
      const ok = await closeEpic(root, 'M6.E98', { by: 't', ...extra }, { ...noGit, acknowledgeSensitive: true });
      expect(ok.status).toBe('closed');
    },
  );
});
