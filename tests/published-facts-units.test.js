// M6.E16.S5.t5.3 — with unit records, the milestone-row check does not apply
// (AC7.3, `D-M6E16-4`). See .planning/M6.E16-VALIDATION.md row AC7.3.
//
// `checkMilestoneStatusVsState` (`published-facts.js`) parses a milestone
// file's Epic rows and compares them with STATE.md and the retrospectives.
// With unit records those rows are generated from the records and no code
// reads them back; a stale table is the view-freshness check's finding
// (`checkRecords`, t5.4). So the check answers NOT_APPLICABLE and opens no
// milestone file. Without unit records it is what it was.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkMilestoneStatusVsState } from '../plugin/tools/lib/published-facts.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';

const STATE_MD = '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M9.E2\ncompleted_phases: []\n---\n# State\n';
// Both contradictions the check reports: an in-flight row with a complete retrospective, and a shipped row for the current Epic.
const ROWS = '# Milestone 9\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M9.E1` | **in flight** | a thing |\n| `M9.E2` | **shipped** — v9.9.9 | the live one |\n';
const RETRO = '# M9.E1 retro\n\n## What happened\n\nIt shipped.\n';

let dir;
const planning = (f, c) => writeFile(join(dir, '.planning', f), c);
const only = async () => (await runDriftChecks(dir, [checkMilestoneStatusVsState])).results[0];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-facts-units-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await planning('STATE.md', STATE_MD);
  await planning('MILESTONE-9.md', ROWS);
  await planning('M9.E1-RETROSPECTIVE.md', RETRO);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('checkMilestoneStatusVsState — with unit records it does not apply (AC7.3)', () => {
  it('without a units folder it reports both contradictions, as before (AC6.4)', async () => {
    const r = await only();
    expect(r.status).toBe(STATUS.FINDINGS);
    expect(r.findings.map((f) => f.message.match(/^M9\.E\d/)[0])).toEqual(['M9.E1', 'M9.E2']);
  });

  it('with a units folder, even empty: NOT_APPLICABLE, saying what replaces it, and no finding', async () => {
    await mkdir(join(dir, '.planning/work/units'), { recursive: true });
    const r = await only();
    expect(r.status).toBe(STATUS.NOT_APPLICABLE);
    expect(r.reason).toMatch(/unit records/);
    expect(r.reason).toMatch(/view-stale/);
    expect(r.findings ?? []).toEqual([]);
  });

  it('with unit records no milestone file is opened: one that cannot be read changes nothing', async () => {
    await mkdir(join(dir, '.planning/work/units'), { recursive: true });
    await rm(join(dir, '.planning/MILESTONE-9.md'));
    await symlink(join(dir, 'nowhere.md'), join(dir, '.planning/MILESTONE-9.md'));
    expect((await only()).status).toBe(STATUS.NOT_APPLICABLE);
  });

  it('a units path that is not a real folder is not unit records: the check runs as before', async () => {
    await mkdir(join(dir, '.planning/work'), { recursive: true });
    await writeFile(join(dir, '.planning/work/units'), 'a file, not a folder\n');
    expect((await only()).status).toBe(STATUS.FINDINGS);
  });
});
