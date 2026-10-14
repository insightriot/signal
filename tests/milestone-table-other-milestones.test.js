// A confirm, a reopen or a hold rewrites the Epic table of the unit's own
// milestone, not only the current one's.
//
// Only the current milestone's file was written. So once the next
// milestone's first Epic was opened before the last close of a milestone was
// confirmed, that milestone's table said "closing" for good, and no check
// reported it. Now a regeneration also writes the marked table of any other
// milestone file whose table no longer matches the records, under the same
// rules as the current one's: only between the markers, never over a row or a
// line a person typed there. A milestone file without markers is still never
// touched, and the store check reports a marked table that is stale.
//
// Temp folders, real git for the confirm; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { closeEpic, openEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { stateText } from './helpers/units-store-fixture.js';

const AT = '2026-10-12T10:00:00.000Z';
const NOW = '2026-10-13T10:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const M5 = '.planning/MILESTONE-5.md';
const M6 = '.planning/MILESTONE-6.md';
const M7 = '.planning/MILESTONE-7.md';
const BEGIN = '<!-- signal:epics:begin -->';
const END = '<!-- signal:epics:end -->';
const SHA = 'a'.repeat(40);
const opened = { type: 'opened', at: AT, by };
const closing = { type: 'close_requested', at: AT, by, proof: SHA };
const shipped = { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA };
const RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n';
// A milestone file nobody marked: its table is a person's.
const UNMARKED = '# Milestone 5\n\n| Epic | Status |\n|---|---|\n| **E1 — the old way** | shipped long ago |\n| `M5.E2` | closing, says the table |\n';
const marked = (n, between = '') => `# Milestone ${n}\n\nWritten by hand, above.\n\n${BEGIN}\n${between}${END}\n\nWritten by hand, below.\n`;

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = (rel) => readFile(join(base, rel), 'utf-8');
const plant = (id, events) => put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const outside = (text) => [text.slice(0, text.indexOf(BEGIN)), text.slice(text.indexOf(END))];
const rowOf = (text, id) => text.split('\n').find((l) => l.startsWith(`| \`${id}\` |`));

// A store with unit records: `current` is the current Epic; milestone 5's
// file has no markers, 6's and 7's have them.
async function store({ current, unitsOf }) {
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put('.planning/STATE.md', stateText(current));
  await put(`${UNITS}/.keep`, '');
  for (const [id, events] of Object.entries(unitsOf)) await plant(id, events);
  await put(M5, UNMARKED);
  await put(M6, marked(6));
  await put(M7, marked(7));
  await regenerateViews(base);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-other-milestones-'));
  base = join(root, 'work');
  await mkdir(base, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the last close of a milestone, confirmed after the next milestone\'s Epic was opened', () => {
  it('close requested and pushed → openEpic(M7.E1) → runConfirmCloses: MILESTONE-6.md reads shipped, nothing outside its markers moved, MILESTONE-5.md untouched', async () => {
    g(base, 'init', '-q', '-b', 'main');
    await store({ current: 'M6.E20', unitsOf: { 'M5.E2': [opened, closing], 'M6.E20': [opened] } });
    await put('.planning/M6.E20-RETROSPECTIVE.md', RETRO);
    g(base, 'add', '-A');
    g(base, 'commit', '-q', '-m', 'the Epic');
    const bare = join(root, 'remote.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(base, 'remote', 'add', 'origin', bare);
    g(base, 'push', '-q', '-u', 'origin', 'main');
    g(base, 'remote', 'set-head', 'origin', 'main');

    expect(await closeEpic(base, 'M6.E20', { by, at: AT })).toMatchObject({ status: 'close-requested' });
    expect(rowOf(await read(M6), 'M6.E20')).toMatch(/\*\*closing\*\*/);
    g(base, 'add', '-A');
    g(base, 'commit', '-q', '-m', 'SHIP');
    g(base, 'push', '-q', 'origin', 'main');

    // The next milestone starts before the close is confirmed.
    await openEpic(base, 'M7.E1', { by });
    const before6 = await read(M6);
    const before5 = await read(M5);
    expect(rowOf(before6, 'M6.E20')).toMatch(/\*\*closing\*\*/);

    const out = await runConfirmCloses(base, { now: NOW });
    expect(out.units.confirmed).toEqual(['M6.E20']);
    const after6 = await read(M6);
    expect(rowOf(after6, 'M6.E20')).toMatch(/^\| `M6\.E20` \| \*\*shipped\*\* — 2026-10-13 \|/);
    expect(outside(after6)).toEqual(outside(before6));
    expect(await read(M5)).toBe(before5);
    expect(rowOf(await read(M7), 'M7.E1')).toMatch(/\*\*in flight\*\*/);
    expect(records.checkRecords(base)).toEqual([]);
  }, 60_000);
});

describe('a unit write for an Epic of another milestone than the current one', () => {
  beforeEach(() => store({ current: 'M7.E1', unitsOf: { 'M6.E20': [opened, closing, shipped], 'M7.E1': [opened] } }));

  it('a hold and a reopen each rewrite that milestone\'s table, and only between its markers', async () => {
    const before = await read(M6);
    expect(rowOf(before, 'M6.E20')).toMatch(/\*\*shipped\*\*/);
    await units.holdUnit(base, 'M6.E20', { reason: 'still read daily', by, at: AT });
    expect(rowOf(await read(M6), 'M6.E20')).toMatch(/\*\*shipped\*\*.* · held: still read daily/);
    await units.reopenUnit(base, 'M6.E20', { reason: 'it came back', by, at: AT });
    const after = await read(M6);
    expect(rowOf(after, 'M6.E20')).toMatch(/\*\*in flight\*\*/);
    expect(outside(after)).toEqual(outside(before));
    expect(await read(M5)).toBe(UNMARKED);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a marked table of another milestone that does not match the records is reported by the store check', async () => {
    const text = await read(M6);
    await put(M6, text.replace('**shipped**', '**closing**'));
    const findings = records.checkRecords(base);
    expect(findings).toEqual([expect.objectContaining({ code: 'view-stale', path: M6 })]);
    expect(findings[0].message).toMatch(/its Epic table \(between the signal:epics markers\) differs/);
  });

  it('a milestone file without markers is never read as a table: its rows stay, and the check says nothing about it', async () => {
    await units.holdUnit(base, 'M6.E20', { reason: 'keep', by, at: AT });
    expect(await read(M5)).toBe(UNMARKED);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a row or a line typed between the markers of that file refuses the write, and the file is unchanged', async () => {
    for (const typed of ['| a note to myself | | remember the demo |', 'A line that is not a row.']) {
      const text = (await read(M6)).replace(END, `${typed}\n${END}`);
      await put(M6, text);
      const err = await units.holdUnit(base, 'M6.E20', { reason: 'keep', by, at: AT }).catch((e) => e);
      expect(err, typed).toMatchObject({ name: 'WorkStoreError', code: 'CONFIG' });
      expect(err.message).toContain(M6);
      expect(units.getUnit(base, 'M6.E20').held).toBe(false);
      await expect(regenerateViews(base)).rejects.toMatchObject({ handRows: [{ line: expect.any(Number), id: null }] });
      // The caller that has shown a person the current file's rows may replace those, not this file's.
      await expect(regenerateViews(base, { replaceHandRows: true })).rejects.toMatchObject({ handRows: [{ line: expect.any(Number), id: null }] });
      expect(await read(M6)).toBe(text);
      await put(M6, text.replace(`${typed}\n`, ''));
    }
  });

  it('broken markers in that file refuse nothing: it is left as it is, with a note', async () => {
    const broken = (await read(M6)).replace(`${END}\n`, '');
    await put(M6, broken);
    await units.holdUnit(base, 'M6.E20', { reason: 'keep', by, at: AT });
    expect(await read(M6)).toBe(broken);
    const out = await regenerateViews(base);
    expect(out.notes.join('\n')).toMatch(/MILESTONE-6\.md.*its Epic table was not written/s);
  });

  it('that file as a symbolic link is not read through or written', async () => {
    const elsewhere = join(root, 'elsewhere.md');
    await writeFile(elsewhere, marked(6), 'utf-8');
    await rm(join(base, M6));
    await symlink(elsewhere, join(base, M6));
    await units.holdUnit(base, 'M6.E20', { reason: 'keep', by, at: AT });
    expect(await readFile(elsewhere, 'utf-8')).toBe(marked(6));
  });
});
