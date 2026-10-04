// Store-off equivalence (M6.E11 t6.1, AC-1.2).
// See .planning/M6.E11-VALIDATION.md row AC-1.2.
//
// A project without `.planning/work/WORK.md` must see exactly what it saw
// before this Epic. `golden.json` was captured by `tests/helpers/store-off-golden.js`
// and this re-runs the same script against today's code and compares every
// byte and every answer. Step by step, so a failure names the path that moved.
//
// WHICH CODE PRODUCED golden.json: commit 7f44ba1 — the last commit before
// S4 changed any writer, and before S5 changed any reader. The helper did not
// exist there (it arrived in cd179a7), so it is run against a checkout of
// 7f44ba1 with today's helper + fixture copied in:
//
//   git worktree add --detach "$TMP/wt" 7f44ba1
//   mkdir -p "$TMP/wt/tests/helpers" "$TMP/wt/tests/fixtures/work-store-off"
//   cp tests/helpers/store-off-golden.js "$TMP/wt/tests/helpers/"
//   cp -R tests/fixtures/work-store-off/project "$TMP/wt/tests/fixtures/work-store-off/"
//   ln -s "$PWD/node_modules" "$TMP/wt/node_modules"
//   ln -s "$PWD/plugin/node_modules" "$TMP/wt/plugin/node_modules"
//   (cd "$TMP/wt" && node tests/helpers/store-off-golden.js --write)
//   cp "$TMP/wt/tests/fixtures/work-store-off/golden.json" tests/fixtures/work-store-off/
//   git worktree remove --force "$TMP/wt"
//
// The helper may only call APIs 7f44ba1 already had. `readers` (added in S6)
// passes `planningDir` to artifactName, which 7f44ba1 ignores — so the baseline
// records the old call shape's answer and today's call-with-planningDir must
// equal it. Regenerating at HEAD instead would make the file move with the code,
// which is the one thing it must not do.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  captureStoreOff,
  captureStoreOffReaders,
  GOLDEN_PATH,
  READER_PLANTS,
  READERS_GOLDEN_PATH,
} from './helpers/store-off-golden.js';

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8'));
const readersGolden = JSON.parse(readFileSync(READERS_GOLDEN_PATH, 'utf-8'));

describe('store off: every touched write path is byte-identical to the pre-S4 baseline', async () => {
  const now = await captureStoreOff();

  it('ran with the same frozen clock as the baseline', () => {
    expect(now.frozenAt).toBe(golden.frozenAt);
  });

  it('the artifact resolver answers exactly as before', () => {
    expect(now.resolver).toEqual(golden.resolver);
  });

  for (const part of ['fixture', 'fresh']) {
    it(`${part}: the same steps ran, in the same order`, () => {
      expect(now[part].steps.map((s) => s.name)).toEqual(golden[part].steps.map((s) => s.name));
    });

    golden[part].steps.forEach((want, i) => {
      it(`${part}: ${want.name}`, () => {
        const got = now[part].steps[i];
        expect(got.result).toEqual(want.result);
        expect(got.changed).toEqual(want.changed);
      });
    });

    it(`${part}: the whole tree at the end is byte-identical (no stray files, no leftover locks)`, () => {
      expect(Object.keys(now[part].final)).toEqual(Object.keys(golden[part].final));
      expect(now[part].final).toEqual(golden[part].final);
    });
  }

  it('the baseline itself exercises the paths S4 changes (guards against a hollow golden)', () => {
    const names = golden.fixture.steps.map((s) => s.name).join('\n');
    for (const needle of ['add: default inbox', 'add: --bug', 'add: --question', 'checkpoint',
      'drain: defer', 'drain: evict', 'promoteToBacklog', 'promoteToBugs', 'dischargeBacklogRows',
      'rollback', 'atomicWrite', 'archive-tree: apply']) {
      expect(names).toContain(needle);
    }
    // No step silently threw in the baseline.
    for (const part of ['fixture', 'fresh']) {
      for (const s of golden[part].steps) expect(s.result).not.toHaveProperty('threw');
    }
    expect(golden.fixture.final).not.toHaveProperty(['.planning/work/WORK.md']);
  });
});

// The readers S5 changed, in a project that has `.planning/work/` and
// `.planning/archive/epics/` directories but no WORK.md (store off).
describe('store off: the readers S5 changed answer exactly as before (work/ and archive/epics/ present, no WORK.md)', async () => {
  const now = await captureStoreOff();

  it('resolveArtifactPath and artifactName (with and without planningDir) answer as the baseline', () => {
    expect(now.readers.resolver).toEqual(golden.readers.resolver);
  });

  it('artifactName given planningDir equals the pre-Epic call shape for every input', () => {
    for (const r of now.readers.resolver) expect(r.nameWithPlanningDir).toBe(r.name);
  });

  for (const epic of Object.keys(golden.readers.preflight)) {
    it(`drive collectPreflight({epic: ${epic}}) — the REQUIREMENTS check reads the same file`, () => {
      expect(now.readers.preflight[epic]).toEqual(golden.readers.preflight[epic]);
    });
  }

  it('isStateStale asks git the same question (same pathspec, same result)', () => {
    expect(now.readers.isStateStale).toEqual(golden.readers.isStateStale);
  });

  it('the readers baseline is not hollow', () => {
    const plants = Object.keys(READER_PLANTS);
    expect(plants.some((p) => p.startsWith('.planning/work/epics/'))).toBe(true);
    expect(plants.some((p) => p.startsWith('.planning/archive/epics/'))).toBe(true);
    expect(plants).not.toContain('.planning/work/WORK.md');
    // Folder-only files exist, so a leak would show as a non-null answer.
    expect(golden.readers.resolver.find((r) => r.currentEpic === 'M6.E2' && r.artifact === 'RESEARCH').resolved).toBeNull();
    expect(golden.readers.preflight['M6.E3'].cannotCheck.length).toBe(1);
    const call = golden.readers.isStateStale.calls[0];
    expect(call).toContain(':(glob).planning/STATE.md');
    expect(call).toContain('abc1234..HEAD');
  });
});

// M6.E13 t1.6 (AC4.1 pin): every AC3.1 reader, on a store-off project, answers
// exactly what it answered before S4 converted any of them.
//
// WHICH CODE PRODUCED readers-ac31.json: plugin/tools/lib as at 33ed19f (the
// commit before t1.6), generated with
// `node tests/helpers/store-off-golden.js --write-readers`. That IS v0.1.47
// (4a7f416) behaviour for every module pinned here: `git diff 4a7f416 33ed19f --
// plugin/tools/lib` lists only two ADDED files (work-convert.js,
// work-record.js), which no reader imports. Regenerating after
// S4 starts would make the file move with the code — the one thing it must not do.
//
// Fixture: tests/fixtures/work-store-off/readers/ (no `.planning/work/` at all).
// Each reader runs on its own fresh copy, with the clock frozen.
describe('store off: every AC3.1 reader answers exactly as at v0.1.47 (M6.E13 t1.6)', async () => {
  const now = await captureStoreOffReaders();

  it('ran with the same frozen clock as the baseline', () => {
    expect(now.frozenAt).toBe(readersGolden.frozenAt);
  });

  it('the same readers ran, in the same order', () => {
    expect(now.steps.map((s) => s.name)).toEqual(readersGolden.steps.map((s) => s.name));
  });

  readersGolden.steps.forEach((want, i) => {
    it(`${want.name} — ${want.site}`, () => {
      const got = now.steps[i];
      expect(got.result).toEqual(want.result);
      expect(got.changed).toEqual(want.changed);
    });
  });

  it('the readers baseline is not hollow', () => {
    const by = Object.fromEntries(readersGolden.steps.map((s) => [s.name, s.result]));
    for (const s of readersGolden.steps) expect(s.result).not.toHaveProperty('threw');
    for (const s of readersGolden.steps) {
      expect(Object.keys(s.changed).some((k) => k.startsWith('.planning/work/'))).toBe(false);
    }
    // Discharge: one closed Epic row and one fixed-bug row read stale; an unfiled bug id is blind.
    const discharge = by['backlog: backlogDischargeStatus (+ readClosureSources)'].ok;
    expect(discharge.stale.map((r) => r.id)).toEqual(['M6.E1', 'B1']);
    expect(discharge.blind.map((r) => r.id)).toEqual(['B4']);
    // Advise: the struck, DONE, held-open and Fixes-B2 rows are not all live; both proposals were judged.
    expect(by['advise: validatePriorities (valid)'].ok.ok).toBe(true);
    expect(by['advise: validatePriorities (invalid)'].ok.ok).toBe(false);
    expect(by['advise: runAdvise (valid proposal — stale-read guard passes, artifact written)'].ok.status).toBe('written');
    expect(by['advise: runAdvise (invalid proposal — refused, nothing written)'].ok.status).toBe('skipped');
    // Drive: the inbox is drainable; the Epic's open question and markers block.
    expect(by['drive: inboxHasDrainableEntries (via FLOOR_CONDITIONS)'].ok).toEqual({ preview: true, destructive: true });
    expect(by['drive: collectPreflight (M6.E3)'].ok.blocking.length).toBe(3);
    // Sweep / hygiene / published facts each produced findings to pin.
    // Standing, promoted and deferred entries are not drainable; the entry under the dangling fence is recovered.
    expect(by['sweep: checkStaleInbox'].ok.map((f) => f.message)).toEqual(['inbox has 3 undrained entries — consider draining']);
    expect(by['doc-hygiene: checkDanglingReferences'].ok.map((f) => f.message.split(' ')[0])).toEqual(['B4', 'B99', 'D-M6E3-9']);
    expect(by['published-facts: bug tally + bug status vs changelog'].ok.results.every((r) => r.status === 'findings')).toBe(true);
    expect(by['jev: bug-fixed-jev with no key (blind)'].ok.results[0].status).toBe('cannot-evaluate');
    expect(by['jev: bug-fixed-jev with a stubbed ask'].ok.report.results[0].findings.length).toBe(1);
  });
});
