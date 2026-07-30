// tests/helpers/phase-artifacts.js — M5.E13 S2.t2 support.
//
// `transitionPhase` now refuses to record a phase that produced no artifact
// (FR1.2, `B48`). Tests that exercise LEDGER MECHANICS — append-only ordering,
// quarantine, the trim — legitimately do not care about artifacts, but they do
// drive transitions, so their fixtures have to look like a real project's.
//
// This helper exists instead of a bypass flag on `transitionPhase`. A guard
// with an opt-out is one command away from being opted out of permanently,
// which is the failure mode this whole Epic is named for. Making the fixture
// truthful costs one line per test and leaves the guard unconditional.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const KINDS = ['REQUIREMENTS', 'PLAN', 'PROGRESS', 'VERIFICATION', 'REVIEW'];

/**
 * Write every phase artifact the FR1.2 guard can ask for.
 *
 * Names match `artifactName`'s output for the mode: Epic-prefixed under a
 * strict `currentEpic`, otherwise the linear forms (`REQUIREMENTS.md`
 * unprefixed, the rest `1-`-prefixed).
 *
 * @param {string} baseDir
 * @param {{currentEpic?: string|null}} [opts]
 */
export async function seedPhaseArtifacts(baseDir, { currentEpic = null } = {}) {
  const dir = join(baseDir, '.planning');
  await mkdir(dir, { recursive: true });
  const strict = typeof currentEpic === 'string' && /^M\d+(\.\d+)*\.E\d+$/.test(currentEpic);
  for (const kind of KINDS) {
    const name = strict
      ? `${currentEpic}-${kind}.md`
      : kind === 'REQUIREMENTS'
        ? 'REQUIREMENTS.md'
        : `1-${kind}.md`;
    await writeFile(join(dir, name), `# ${kind}\n`, 'utf-8');
  }
}
