import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEffectiveProfile, readProfile } from '../tools/lib/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLANNING = join(ROOT, '.planning');

/**
 * Signal's own PROFILE.md files must parse with the loader that reads them.
 *
 * Epic-scoped `{EpicID}-PROFILE.md` files are written by hand (`created_by:
 * hand`), and nothing had ever run them through `readProfileFromPath`.
 * `M5.E16-PROFILE.md` shipped in the same commit as M5.E16's DISCUSS carrying
 * TWO values outside their enums — `stakes: moderate` (valid only for
 * `reversibility`) and `reversibility: easy` (not valid anywhere). Both are
 * plain-English words a person writes without opening the schema.
 *
 * The consequence was silent: `readEffectiveProfile` throws, `/sig:resume`
 * fails open to the project PROFILE, and the Epic that declared FEATURE ran
 * at the project's FULL. The declared tier and the loadable tier disagreed
 * for the whole of DISCUSS and nothing said so.
 *
 * Validation short-circuits on the first bad field, so a fix that reads only
 * the error message fixes one of two. This walks every profile and asserts
 * the whole file loads.
 */

const profileFiles = readdirSync(PLANNING)
  .filter((f) => f.endsWith('PROFILE.md'))
  .sort();

describe("Signal's own .planning/*PROFILE.md files parse", () => {
  it('finds at least the project PROFILE.md plus one Epic-scoped profile', () => {
    expect(profileFiles).toContain('PROFILE.md');
    expect(profileFiles.filter((f) => f !== 'PROFILE.md').length).toBeGreaterThan(0);
  });

  it('the project PROFILE.md loads', async () => {
    const profile = await readProfile(ROOT);
    expect(profile.tier).toBeTruthy();
  });

  for (const file of profileFiles.filter((f) => f !== 'PROFILE.md')) {
    const epicId = file.replace(/-PROFILE\.md$/, '');

    it(`${file} loads through readEffectiveProfile as ${epicId}`, async () => {
      const profile = await readEffectiveProfile(ROOT, { currentEpic: epicId });
      expect(profile.tier).toBeTruthy();
    });

    it(`${file} is actually reached (not silently falling back to the project PROFILE)`, async () => {
      // readEffectiveProfile falls back to the project PROFILE whenever the
      // Epic id fails EPIC_ID_STRICT_RE or the file is absent. A profile that
      // parses but is never selected is the same invisible failure one step
      // over, so pin selection as well as validity.
      const effective = await readEffectiveProfile(ROOT, { currentEpic: epicId });
      const project = await readProfile(ROOT);
      const differs =
        effective.tier !== project.tier ||
        JSON.stringify(effective.calibration) !== JSON.stringify(project.calibration) ||
        JSON.stringify(effective.rigor_overrides) !== JSON.stringify(project.rigor_overrides);
      expect(differs).toBe(true);
    });
  }
});
