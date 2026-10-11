// M6.E16.S4.t4.3 — SHIP's Epic-close decision on a project with unit records
// (AC4.6, `D-M6E16-10`). See .planning/M6.E16-VALIDATION.md rows AC4.6, AC6.3
// and AC6.4.
//
// With unit records, whether a SHIP closes the Epic is read from STATE.md
// alone (`isEpicCloseByState`). No milestone row is read, so a row can neither
// win nor be stale. The `warn-dirty-execute` hook's trigger becomes the unit's
// record reading closing or closed. Each case here has a twin on a project
// with NO unit records, showing the old path gives a different answer for the
// same input — otherwise the test would pass without the change.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { shipFR1Check, detectDirtyExecute } from '../plugin/tools/lib/retrospective.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks', 'warn-dirty-execute.js');
const UNITS = '.planning/work/units';
const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M5.E4';
const RETRO = `.planning/${EPIC}-RETROSPECTIVE.md`;
const FULL = { tier: 'FULL', phases_skipped: [] };

const section = (h, body) => `## ${h}\n\n${body.repeat(10)}\n\n`;
const VALID_FULL_RETRO = `# ${EPIC} Retrospective\n\n${[
  'Timeline', 'What changed mid-flight', 'What assumptions broke', 'What surprised us',
  "What we'd do differently", 'What to feed back into Signal', 'Anti-rationalization moment',
].map((h) => section(h, 'Substantive content here. ')).join('')}## Links\n\n- Plan: foo.md\n`;

const PRE_SHIP = ['DISCUSS (2026-07-20)', 'PLAN (2026-07-20)', 'EXECUTE (2026-07-20)', 'VERIFY (2026-07-21)'];
const AT_REVIEW = { current_epic: EPIC, phase: 'REVIEW', completed_phases: PRE_SHIP };
const AT_SHIP = { current_epic: EPIC, phase: 'SHIP', completed_phases: [...PRE_SHIP, 'REVIEW (2026-07-21)'] };
const MID_EXECUTE = { current_epic: EPIC, phase: 'EXECUTE', completed_phases: PRE_SHIP.slice(0, 2) };

const row = (status) => `# Milestone 5\n\n| Epic | Status | Notes |\n|---|---|---|\n| **E4** | ${status} | |\n`;
const ROW_STALE = row('🔨 DISCUSS');
const ROW_PENDING = row('S1 shipped; S2-S5 pending');
const ROW_SHIPPED = row('**✓ shipped 2026-07-21**');

// Arguments whose milestone content cannot be read: any access throws.
const unreadableMilestone = (args) => Object.defineProperty({ ...args }, 'milestoneContent', {
  enumerable: true,
  get() {
    throw new Error('the milestone file was read');
  },
});

let withUnits;
let without;
async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const plantUnit = (dir, id, events) => put(dir, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
const U = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: '0123abc' },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: '0123abc' },
};

beforeEach(async () => {
  withUnits = await mkdtemp(join(tmpdir(), 'sig-ship-units-on-'));
  without = await mkdtemp(join(tmpdir(), 'sig-ship-units-off-'));
  for (const dir of [withUnits, without]) await mkdir(join(dir, '.planning'), { recursive: true });
  // The folder is the switch (D-M6E16-16): no record is needed for it to be on.
  await put(withUnits, `${UNITS}/.keep`, '');
});
afterEach(async () => {
  await rm(withUnits, { recursive: true, force: true });
  await rm(without, { recursive: true, force: true });
});

describe('shipFR1Check with unit records — STATE.md alone decides (AC4.6)', () => {
  it('a stale row cannot defer the gate: the Epic-close is evaluated (old path: stale-milestone-row)', async () => {
    const args = { state: AT_REVIEW, profile: FULL, milestoneContent: ROW_STALE };
    expect(await shipFR1Check({ ...args, baseDir: without })).toMatchObject({ skipped: true, unevaluated: true, cause: 'stale-milestone-row' });
    const got = await shipFR1Check({ ...args, baseDir: withUnits });
    expect(got).toMatchObject({ halt: true, code: 'NO_RETRO_FILE', retroPath: RETRO });
    expect(got.cause).toBeUndefined();
  });

  it('a maintained "pending" row no longer wins over STATE (old path: skipped)', async () => {
    const args = { state: AT_SHIP, profile: FULL, milestoneContent: ROW_PENDING };
    expect(await shipFR1Check({ ...args, baseDir: without })).toMatchObject({ halt: false, skipped: true });
    expect(await shipFR1Check({ ...args, baseDir: withUnits })).toMatchObject({ halt: true, code: 'NO_RETRO_FILE' });
  });

  it('a row that says shipped does not make a mid-EXECUTE ship an Epic-close (old path: it does)', async () => {
    const args = { state: MID_EXECUTE, profile: FULL, milestoneContent: ROW_SHIPPED };
    expect(await shipFR1Check({ ...args, baseDir: without })).toMatchObject({ halt: true, code: 'NO_RETRO_FILE' });
    const got = await shipFR1Check({ ...args, baseDir: withUnits });
    expect(got).toMatchObject({ halt: false, skipped: true });
    expect(got.unevaluated).toBeUndefined();
  });

  it('the milestone content is never read: an argument that throws on read is not touched', async () => {
    const args = { state: AT_REVIEW, profile: FULL };
    const got = await shipFR1Check(unreadableMilestone({ ...args, baseDir: withUnits }));
    expect(got).toMatchObject({ halt: true, code: 'NO_RETRO_FILE' });
    for (const state of [AT_SHIP, MID_EXECUTE]) {
      await expect(shipFR1Check(unreadableMilestone({ state, profile: FULL, baseDir: withUnits }))).resolves.toBeDefined();
    }
    // The same trap on a project with no unit records is sprung: the old path reads it.
    await expect(shipFR1Check(unreadableMilestone({ ...args, baseDir: without }))).rejects.toThrow(/the milestone file was read/);
  });

  it('`stale-milestone-row` cannot be returned, whatever the row says', async () => {
    for (const state of [AT_REVIEW, AT_SHIP, MID_EXECUTE]) {
      for (const milestoneContent of [ROW_STALE, ROW_PENDING, ROW_SHIPPED, '', null, undefined]) {
        const got = await shipFR1Check({ state, profile: FULL, milestoneContent, baseDir: withUnits });
        expect(got.cause).toBeUndefined();
        expect(got.unevaluated).toBeUndefined();
      }
    }
  });

  it('with a valid retrospective the Epic-close proceeds; with a section missing it halts', async () => {
    await put(withUnits, RETRO, VALID_FULL_RETRO);
    expect(await shipFR1Check({ state: AT_REVIEW, profile: FULL, milestoneContent: ROW_STALE, baseDir: withUnits }))
      .toEqual({ halt: false, retroPath: RETRO, isEpicClose: true });
    expect(await shipFR1Check({ state: AT_SHIP, profile: FULL, milestoneContent: null, baseDir: withUnits }))
      .toEqual({ halt: false, retroPath: RETRO, isEpicClose: true });
    await put(withUnits, RETRO, VALID_FULL_RETRO.replace('## Timeline', '## Chronology'));
    expect(await shipFR1Check({ state: AT_SHIP, profile: FULL, milestoneContent: null, baseDir: withUnits }))
      .toMatchObject({ halt: true, code: 'INVALID_RETRO' });
  });

  it('linear mode and a missing STATE answer as before', async () => {
    expect(await shipFR1Check({ state: { current_epic: null, phase: 'SHIP' }, profile: FULL, baseDir: withUnits }))
      .toMatchObject({ halt: false, skipped: true, reason: expect.stringMatching(/linear mode/) });
    expect(await shipFR1Check({ state: null, profile: FULL, baseDir: withUnits })).toMatchObject({ halt: true, code: 'NO_CURRENT_EPIC' });
  });

  it('a tier that skips REVIEW closes from VERIFY, by STATE alone', async () => {
    const sketch = { tier: 'SKETCH', phases_skipped: ['REVIEW'] };
    const state = { current_epic: EPIC, phase: 'VERIFY', completed_phases: PRE_SHIP.slice(0, 3) };
    expect(await shipFR1Check({ state, profile: sketch, milestoneContent: ROW_STALE, baseDir: withUnits }))
      .toMatchObject({ halt: true, code: 'NO_RETRO_FILE' });
  });

  it('a linked units folder reads as no unit records: the old path answers', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sig-ship-units-out-'));
    try {
      await mkdir(join(without, '.planning/work'), { recursive: true });
      await symlink(outside, join(without, UNITS));
      expect(await shipFR1Check({ state: AT_REVIEW, profile: FULL, milestoneContent: ROW_STALE, baseDir: without }))
        .toMatchObject({ skipped: true, cause: 'stale-milestone-row' });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('detectDirtyExecute with unit records — the trigger is the unit\'s record (t4.3)', () => {
  const state = { phase: 'EXECUTE', current_epic: EPIC };

  it.each([['closing', [U.opened, U.closing]], ['closed', [U.opened, U.closing, U.shipped]]])(
    'the record reads %s, STATE says EXECUTE, no retro: the banner, naming the record\'s status',
    async (status, events) => {
      await plantUnit(withUnits, EPIC, events);
      const banner = detectDirtyExecute(unreadableMilestone({ state, baseDir: withUnits }));
      expect(banner).toMatch(new RegExp(`Epic ${EPIC.replace('.', '\\.')} reads ${status} in its unit record but STATE\\.md still says EXECUTE`));
      expect(banner).toMatch(/no retro file exists/);
      expect(banner).not.toMatch(/MILESTONE\.md/);
    },
  );

  it('a stub retro still warns; a complete one does not', async () => {
    await plantUnit(withUnits, EPIC, [U.opened, U.closing]);
    await put(withUnits, RETRO, '# Retro\n\n## Timeline\n\n[FILL IN]\n');
    expect(detectDirtyExecute({ state, baseDir: withUnits })).toMatch(/still a stub/);
    await put(withUnits, RETRO, '# Retro\n\n## Timeline\n\nIt shipped.\n');
    expect(detectDirtyExecute({ state, baseDir: withUnits })).toBeNull();
  });

  it('an open record: no banner, though the milestone row says shipped (old path: the banner)', async () => {
    await plantUnit(withUnits, EPIC, [U.opened]);
    expect(detectDirtyExecute({ state, milestoneContent: ROW_SHIPPED, baseDir: withUnits })).toBeNull();
    expect(detectDirtyExecute({ state, milestoneContent: ROW_SHIPPED, baseDir: without })).toMatch(/looks closed in MILESTONE\.md/);
  });

  it('never throws: no record, a broken record, an Epic name that is not an ID — each is no banner', async () => {
    expect(detectDirtyExecute({ state, baseDir: withUnits })).toBeNull();
    await put(withUnits, `${UNITS}/${EPIC}.json`, '{ not json');
    expect(detectDirtyExecute({ state, baseDir: withUnits })).toBeNull();
    for (const current_epic of ['../x', 'phase 11', 'x'.repeat(500)]) {
      expect(detectDirtyExecute({ state: { phase: 'EXECUTE', current_epic }, baseDir: withUnits })).toBeNull();
    }
    await plantUnit(withUnits, 'phase-11', [U.opened, U.closing]);
    expect(detectDirtyExecute({ state: { phase: 'EXECUTE', current_epic: 'phase-11' }, baseDir: withUnits })).toBeNull();
  });

  it('another phase, or no current Epic: no banner', async () => {
    await plantUnit(withUnits, EPIC, [U.opened, U.closing]);
    expect(detectDirtyExecute({ state: { phase: 'VERIFY', current_epic: EPIC }, baseDir: withUnits })).toBeNull();
    expect(detectDirtyExecute({ state: { phase: 'EXECUTE', current_epic: null }, baseDir: withUnits })).toBeNull();
  });
});

describe('warn-dirty-execute.js (the spawned hook) with unit records', () => {
  const STATE = `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: ${EPIC}\ncurrent_wave: S1\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-05-24)\nblockers: []\n---\n# body\n`;
  const runHook = (cwd) => execFileSync('node', [HOOK], { cwd, encoding: 'utf-8', input: '{}' });

  it('the milestone file cannot be read (it is a folder): the banner still comes, from the record', async () => {
    await put(withUnits, '.planning/STATE.md', STATE);
    await mkdir(join(withUnits, '.planning/MILESTONE-5.md'));
    await plantUnit(withUnits, EPIC, [U.opened, U.closing]);
    const payload = JSON.parse(runHook(withUnits).trim());
    expect(payload.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/reads closing in its unit record/);
  });

  it('no milestone file at all, record closed, retro complete: silent, exit 0', async () => {
    await put(withUnits, '.planning/STATE.md', STATE);
    await plantUnit(withUnits, EPIC, [U.opened, U.closing, U.shipped]);
    await put(withUnits, RETRO, '# Retro\n\nIt shipped.\n');
    expect(runHook(withUnits).trim()).toBe('');
  });

  it('a broken record, and a linked units folder: silent, exit 0', async () => {
    await put(withUnits, '.planning/STATE.md', STATE);
    await put(withUnits, `${UNITS}/${EPIC}.json`, '{ not json');
    expect(runHook(withUnits).trim()).toBe('');
    const outside = await mkdtemp(join(tmpdir(), 'sig-ship-units-out-'));
    try {
      await put(without, '.planning/STATE.md', STATE);
      await mkdir(join(without, '.planning/work'), { recursive: true });
      await symlink(outside, join(without, UNITS));
      expect(runHook(without).trim()).toBe('');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('without unit records the milestone row is still the trigger (AC6.4)', async () => {
    await put(without, '.planning/STATE.md', STATE);
    await put(without, '.planning/MILESTONE-5.md', ROW_SHIPPED);
    const payload = JSON.parse(runHook(without).trim());
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/looks closed in MILESTONE\.md/);
  });
});
