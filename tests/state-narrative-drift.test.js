/**
 * tests/state-narrative-drift.test.js — FR8 (M5.E10 S4.t2).
 *
 * The fixtures are REAL STATES this file actually held, frozen from git
 * history, not invented ones. Their frontmatter is verbatim; their bodies are
 * trimmed to the phase-claim lines the check reads, with the source commit
 * recorded in each file.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  checkNarrativePhaseContradiction,
  runDriftChecks,
  STATE_DRIFT_CHECKS,
  HEAL,
  APPLICABILITY,
} from '../tools/lib/state-drift.js';
import { parseFrontmatter } from '../tools/lib/state.js';

const FIXTURES = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures',
  'state-narrative'
);

async function loadInstances() {
  const names = (await readdir(FIXTURES)).filter((f) => f.endsWith('.md')).sort();
  const out = [];
  for (const name of names) {
    const content = await readFile(join(FIXTURES, name), 'utf8');
    const { data, body } = parseFrontmatter(content);
    out.push({ name, state: data, stateBody: body, content });
  }
  return out;
}

/** A project dir carrying one fixture as its STATE.md, for the sibling checks. */
async function projectFrom(content) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-narr-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), content, 'utf8');
  return dir;
}

describe('AC8.2 — it fires on every recorded instance', () => {
  it('finds five instances, and every one is a real state from this file’s history', async () => {
    const instances = await loadInstances();
    expect(instances.length).toBe(5);
    for (const inst of instances) {
      expect(inst.content, `${inst.name} must record its provenance`).toMatch(
        /Frozen from \.planning\/STATE\.md at [0-9a-f]{8}/
      );
    }
  });

  it('every instance produces a finding', async () => {
    for (const inst of await loadInstances()) {
      const findings = checkNarrativePhaseContradiction.run(inst);
      expect(findings.length, `${inst.name} must fire`).toBeGreaterThan(0);
      // Named, not counted: the message carries both phases and the sentence.
      expect(findings[0].message).toContain(`phase: ${inst.state.phase}`);
      expect(findings[0].message).toContain(String(inst.state.current_epic));
    }
  });
});

describe('AC8.3 — it fails where the two existing checks pass', () => {
  it('body-omits-current-epic and phase-behind-artifacts both report nothing on these states', async () => {
    // Run through the real registry path, not by hand-calling internals: if
    // either sibling fired, FR8 would be a second reading of a check Signal
    // already has, and the requirement says such a check is rejected at review.
    for (const inst of await loadInstances()) {
      const dir = await projectFrom(inst.content);
      try {
        const { results } = await runDriftChecks(dir);
        const byId = Object.fromEntries(results.map((r) => [r.id, r]));

        for (const sibling of ['body-omits-current-epic', 'phase-behind-artifacts']) {
          expect(
            byId[sibling]?.findings ?? [],
            `${inst.name}: ${sibling} must stay silent`
          ).toEqual([]);
        }
        expect(
          byId['narrative-phase-contradicts-frontmatter'].findings.length,
          `${inst.name}: FR8 must fire through the registry`
        ).toBeGreaterThan(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('reads a different thing: the prose NAMES the epic here, and is wrong about it', async () => {
    for (const inst of await loadInstances()) {
      expect(inst.stateBody).toContain(String(inst.state.current_epic));
    }
  });
});

describe('AC8.1 — narrow by construction', () => {
  const state = { current_epic: 'M5.E10', phase: 'EXECUTE' };

  it('ignores a line that mentions the Epic near an unrelated phase word', () => {
    // The rule this replaced — "nearest phase-name token" — flagged 62 episodes
    // in this file's history, most of them lines like the one below.
    const stateBody = '**▶ OPEN: `M5.E10`** — queued behind the DISCUSS work from last week.\n';
    expect(checkNarrativePhaseContradiction.run({ state, stateBody })).toEqual([]);
  });

  it('fires only when the prose echoes `phase:` beside the Epic', () => {
    const stateBody = '> **`phase: PLAN` / `current_epic: M5.E10` are correct.**\n';
    expect(checkNarrativePhaseContradiction.run({ state, stateBody })).toHaveLength(1);
  });

  it('stays silent when the prose agrees with the frontmatter', () => {
    const stateBody = '> **`phase: EXECUTE` / `current_epic: M5.E10` are correct.**\n';
    expect(checkNarrativePhaseContradiction.run({ state, stateBody })).toEqual([]);
  });

  it('ignores a phase claim on a line that names a DIFFERENT epic', () => {
    const stateBody = '`M5.E19` closed at `phase: SHIP` last week.\n';
    expect(checkNarrativePhaseContradiction.run({ state, stateBody })).toEqual([]);
  });
});

describe('AC S4.3 — the heal category is declared and honest', () => {
  it('is registered in the registry', () => {
    expect(STATE_DRIFT_CHECKS).toContain(checkNarrativePhaseContradiction);
  });

  it('claims NEEDS_A_PERSON — a sentence rewrite is not derivable', () => {
    expect(checkNarrativePhaseContradiction.healCategory).toBe(HEAL.NEEDS_A_PERSON);
  });

  it('is not applicable in linear mode, and blind when no phase is set', () => {
    expect(checkNarrativePhaseContradiction.applicability({ state: { current_epic: null } }).status).toBe(
      APPLICABILITY.NA
    );
    expect(
      checkNarrativePhaseContradiction.applicability({
        state: { current_epic: 'M5.E10', phase: null },
      }).status
    ).toBe(APPLICABILITY.BLIND);
  });
});
