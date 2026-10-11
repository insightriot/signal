// M6.E16.S5.t5.0b — `openEpic` and `closeEpic` when the unit's record landed
// and only the views failed to regenerate.
//
// Both wrap a failed unit write in a message saying what did NOT happen ("no
// unit record was created", "the close was not requested"). Once unit writes
// regenerate the views, a write can land and then throw — and that wrapping
// would be false. The error a landed write throws is passed through as it is.
//
// The regeneration step is replaced for this file only, so the failure comes
// after the views check has passed, which no real fixture reaches on purpose.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const flaky = { fail: false };
// `work-write.js` is in no import cycle, so replacing its `regenerateAfter`
// reaches every unit writer.
vi.mock('../plugin/tools/lib/work-write.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    regenerateAfter: async (handle, done, regenerate, notRegenerated) => {
      if (flaky.fail) throw notRegenerated(done, new Error('the disk said no'));
      return real.regenerateAfter(handle, done, regenerate, notRegenerated);
    },
  };
});

const { openEpic, closeEpic } = await import('../plugin/tools/lib/work-ops.js');
const { getUnit } = await import('../plugin/tools/lib/unit-records.js');

const by = 'claude';
const AT = '2026-10-11T10:00:00.000Z';
const SHA = 'a'.repeat(40);
const UNITS = '.planning/work/units';
const COMPLETE_RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n\n## What surprised us\n\nNothing much.\n';

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

beforeEach(async () => {
  flaky.fail = false;
  base = await mkdtemp(join(tmpdir(), 'sig-unit-views-callers-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`${UNITS}/.keep`, '');
  await put('.planning/STATE.md', '---\nschema_version: 1\nphase: DISCUSS\ncompleted_phases: []\n---\n# State\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('a unit write that landed, with the views not regenerated', () => {
  it('openEpic: the record exists, and the error says the change stands — not that no record was created', async () => {
    flaky.fail = true;
    const err = await openEpic(base, 'M7.E9', { by }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/M7\.E9 was opened, and that change stands — but the views were not regenerated: the disk said no/);
    expect(err.message).not.toMatch(/no unit record was created/);
    expect(getUnit(base, 'M7.E9').status).toBe('open');
  });

  it('closeEpic creating the record first: the error does not say the close was not requested when it was', async () => {
    await put('.planning/M7.E9-RETROSPECTIVE.md', COMPLETE_RETRO);
    flaky.fail = true;
    const err = await closeEpic(base, 'M7.E9', { by, at: AT, commit: SHA }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/M7\.E9 is closing .*that change stands — but the views were not regenerated/s);
    expect(err.message).not.toMatch(/the close was not requested/);
    expect(getUnit(base, 'M7.E9')).toMatchObject({ status: 'closing', closing_proof: SHA });
  });
});
