// Tests for resolveArtifactPath (M4.5.E10.S2.t1, FR1 Epic-prefix resolver).
//
// /sig:resume Step 3 tries a small precedence ladder to locate a phase's
// artifact. This adds pattern 0 — the Epic-prefixed name (`M4.5.E10-PLAN.md`)
// — above the legacy numeric/no-prefix/phase-literal patterns, so hand-managed
// Epic-prefixed projects (Signal-on-Signal) stop reporting "artifact not found".
//
// The resolver is pure over an injectable `existsFn`, so most cases run in
// memory; one case uses the real fixture to prove the existsSync default.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { resolveArtifactPath, artifactName } from '../tools/lib/resume.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build an existsFn over an explicit allow-list of absolute paths.
const existsOver = (planningDir, names) => {
  const set = new Set(names.map((n) => join(planningDir, n)));
  return (p) => set.has(p);
};

const P = '/proj/.planning';

describe('resolveArtifactPath', () => {
  // AC1.1 — Epic-prefixed resolves when current_epic is set and the file exists.
  it('AC1.1: resolves the Epic-prefixed artifact when current_epic is set', () => {
    const existsFn = existsOver(P, ['M4.5.E10-PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-PLAN.md'));
  });

  // AC1.2 — legacy numeric resolves; pattern-0 is skipped when current_epic null.
  it('AC1.2: resolves a legacy numeric artifact and skips pattern-0 when current_epic is null', () => {
    const existsFn = existsOver(P, ['1-PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: null, existsFn });
    expect(out).toBe(join(P, '1-PLAN.md'));
  });

  // AC1.3 — precedence: Epic-prefixed (0) wins over a legacy match (1).
  it('AC1.3: Epic-prefixed wins precedence over a co-existing legacy artifact', () => {
    const existsFn = existsOver(P, ['M4.5.E10-PLAN.md', '1-PLAN.md', 'PLAN.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', phase: 'PLAN', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-PLAN.md'));
  });

  // AC1.4 — no match returns null (no crash, no false match).
  it('AC1.4: returns null when no pattern matches', () => {
    const existsFn = existsOver(P, ['UNRELATED.md']);
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M4.5.E10', phase: 'PLAN', existsFn });
    expect(out).toBeNull();
  });

  // Pattern 2 (no-prefix) and pattern 3 (phase-literal) still resolve.
  it('resolves the no-prefix artifact (pattern 2)', () => {
    const existsFn = existsOver(P, ['REQUIREMENTS.md']);
    expect(resolveArtifactPath(P, 'REQUIREMENTS', { existsFn })).toBe(join(P, 'REQUIREMENTS.md'));
  });

  it('resolves the phase-literal artifact (pattern 3, e.g. PLAN-PLAN.md)', () => {
    const existsFn = existsOver(P, ['PLAN-PLAN.md']);
    expect(resolveArtifactPath(P, 'PLAN', { phase: 'PLAN', existsFn })).toBe(join(P, 'PLAN-PLAN.md'));
  });

  // Legacy ascending-N tie-break: the lowest N wins.
  it('breaks legacy ties by ascending N (1 before 2)', () => {
    const existsFn = existsOver(P, ['1-PLAN.md', '2-PLAN.md']);
    expect(resolveArtifactPath(P, 'PLAN', { existsFn })).toBe(join(P, '1-PLAN.md'));
  });

  // Traversal reject: a malicious current_epic must NOT produce a pattern-0
  // match, even when everything "exists". It must fall through to the first
  // legacy candidate instead.
  it('rejects a traversal current_epic and falls through to legacy (../etc)', () => {
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: '../etc', existsFn: () => true });
    // pattern-0 skipped -> first tried candidate is the numeric 1-PLAN.md.
    expect(out).toBe(join(P, '1-PLAN.md'));
    expect(out).not.toContain('..');
  });

  it('rejects a mid-path traversal current_epic and falls through (E1/../..)', () => {
    const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'E1/../..', existsFn: () => true });
    expect(out).toBe(join(P, '1-PLAN.md'));
    expect(out).not.toContain('..');
  });

  // A sanitized Epic id containing dots/dashes (the real shape) is accepted.
  it('accepts the real Epic id shape (dots + dashes)', () => {
    const existsFn = existsOver(P, ['M4.5.E10-REQUIREMENTS.md']);
    const out = resolveArtifactPath(P, 'REQUIREMENTS', { currentEpic: 'M4.5.E10', existsFn });
    expect(out).toBe(join(P, 'M4.5.E10-REQUIREMENTS.md'));
  });

  // On-disk fixture: the real existsSync default finds the Epic-prefixed file.
  it('resolves against the real filesystem (existsSync default)', () => {
    const planningDir = join(__dirname, 'fixtures', 'resume', 'epic-prefixed', '.planning');
    const out = resolveArtifactPath(planningDir, 'PLAN', { currentEpic: 'M4.5.E99' });
    expect(out).toBe(join(planningDir, 'M4.5.E99-PLAN.md'));
  });
});

// M5.E4.T1.2 (B14 / FR2) — Site C: the read-side filter must not hand back an
// artifact path that resolves OUT of the planning root. Candidates here are flat
// (`resolve(planningRoot, name)`, no separators) so `dirname === planningRoot`
// always — the only escape is a LEAF symlink, which a caller WOULD follow on
// read. So this anchors on the leaf (unlike the write sites, which rename over
// the leaf and anchor on dirname). Real FS symlink fixtures; no injected
// realpathFn, so the default realpathSync path is exercised.
describe('resolveArtifactPath — realpath confinement against a leaf-symlink escape (Site C)', () => {
  let planningDir;
  let outside;
  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), 'signal-resolve-symlink-'));
    planningDir = join(base, '.planning');
    await mkdir(planningDir, { recursive: true });
    outside = await mkdtemp(join(tmpdir(), 'signal-resolve-escape-target-'));
  });
  afterEach(async () => {
    await rm(dirname(planningDir), { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('REFUSES a candidate whose leaf is a symlink resolving OUT of the tree (returns null)', async () => {
    // A real out-of-tree file, and a checked-in .planning/ leaf symlink to it.
    const leaked = join(outside, 'leaked.md');
    await writeFile(leaked, 'secret', 'utf-8');
    await symlink(leaked, join(planningDir, 'M5.E1-PLAN.md'));

    // RED (lexical guard only): existsSync(symlink) is true + the lexical guard
    // passes → the escaped path is returned. GREEN: realpath the leaf, see it
    // leaves the planning root, skip it → no other candidate exists → null.
    const out = resolveArtifactPath(planningDir, 'PLAN', { currentEpic: 'M5.E1' });
    expect(out).toBeNull();
  });

  it('still resolves a real (non-symlink) in-.planning artifact — no false refusal', async () => {
    await writeFile(join(planningDir, 'M5.E1-PLAN.md'), '# plan\n', 'utf-8');
    const out = resolveArtifactPath(planningDir, 'PLAN', { currentEpic: 'M5.E1' });
    expect(out).toBe(join(planningDir, 'M5.E1-PLAN.md'));
  });
});

// ---------------------------------------------------------------------------
// M5.E13 S1.t1 — `B53`: the write seam and the read seam must agree.
//
// `references/epic-native-flow.md:31` states a guarantee:
//   "They are symmetric — whatever `artifactName` emits, `resolveArtifactPath`
//    with the same opts resolves back."
//
// That was true only for a STRICT Epic ID. The two seams read `current_epic`
// with DIFFERENT regexes — `artifactName` uses EPIC_ID_STRICT_RE and fails open
// to linear naming, while `resolveArtifactPath` used the lenient
// `EPIC_ID_RE = /^[A-Za-z0-9._-]+$/` and placed the Epic-prefixed candidate
// FIRST. So for `current_epic: PHASE11` the command WRITES `1-PLAN.md` while
// the next command READS `PHASE11-PLAN.md` — a silent stale-read path, with a
// live field case (`eval-project-C`).
//
// A second divergence axis the requirements did not name: LINEAR_UNPREFIXED
// makes REQUIREMENTS diverge on a different rule than PLAN, so both are covered.
// ---------------------------------------------------------------------------

describe('M5.E13 S1.t1 — artifactName/resolveArtifactPath symmetry (`B53`)', () => {
  // AC53.1 — round-trip: what the write seam emits, the read seam finds.
  describe('AC53.1 — round-trip for every current_epic shape × artifact kind', () => {
    const EPICS = [
      ['strict Epic ID', 'M5.E13'],
      ['non-strict token (eval-project-C\'s live value)', 'PHASE11'],
      ['non-strict version-shaped', 'v0.1.6'],
      ['null', null],
      ['empty string', ''],
    ];
    const KINDS = ['PLAN', 'REQUIREMENTS', 'PROGRESS', 'VERIFICATION'];

    for (const [label, currentEpic] of EPICS) {
      for (const kind of KINDS) {
        it(`${label} × ${kind}: resolves the name artifactName emits`, () => {
          const written = artifactName(kind, { currentEpic });
          // The written file is the ONLY one on disk.
          const existsFn = existsOver(P, [written]);
          const out = resolveArtifactPath(P, kind, { currentEpic, existsFn });
          expect(out).toBe(join(P, written));
        });
      }
    }
  });

  // AC53.2 — the actual bug: a stale Epic-prefixed file must not shadow the
  // fresh write. Proof-of-fail: RED before the fix (pattern 0 was tried first).
  describe('AC53.2 — a stale Epic-prefixed artifact does not shadow the fresh write', () => {
    it('PHASE11: both PHASE11-PLAN.md (stale) and 1-PLAN.md (fresh) exist → resolves the fresh one', () => {
      const currentEpic = 'PHASE11';
      const written = artifactName('PLAN', { currentEpic }); // '1-PLAN.md'
      const existsFn = existsOver(P, ['PHASE11-PLAN.md', written]);
      const out = resolveArtifactPath(P, 'PLAN', { currentEpic, existsFn });
      expect(out).toBe(join(P, written));
    });

    it('PHASE11 × REQUIREMENTS (the LINEAR_UNPREFIXED axis) → resolves REQUIREMENTS.md, not PHASE11-REQUIREMENTS.md', () => {
      const currentEpic = 'PHASE11';
      const written = artifactName('REQUIREMENTS', { currentEpic }); // 'REQUIREMENTS.md'
      const existsFn = existsOver(P, ['PHASE11-REQUIREMENTS.md', written]);
      const out = resolveArtifactPath(P, 'REQUIREMENTS', { currentEpic, existsFn });
      expect(out).toBe(join(P, written));
    });

    it('v0.1.6: a version-shaped current_epic behaves the same way', () => {
      const currentEpic = 'v0.1.6';
      const written = artifactName('PLAN', { currentEpic }); // '1-PLAN.md'
      const existsFn = existsOver(P, ['v0.1.6-PLAN.md', written]);
      const out = resolveArtifactPath(P, 'PLAN', { currentEpic, existsFn });
      expect(out).toBe(join(P, written));
    });
  });

  // AC53.3 — no regression. The lenient pattern stays REACHABLE as a fallback,
  // because live non-strict projects (eval-project-C) have only the
  // Epic-prefixed files on disk and their reads must keep working.
  describe('AC53.3 — no regression for existing projects', () => {
    it('strict Epic mode is unchanged (Signal-on-Signal)', () => {
      const existsFn = existsOver(P, ['M5.E13-PLAN.md']);
      const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'M5.E13', existsFn });
      expect(out).toBe(join(P, 'M5.E13-PLAN.md'));
    });

    it('a non-strict project with ONLY Epic-prefixed files still resolves them (eval-project-C today)', () => {
      const existsFn = existsOver(P, ['PHASE11-PLAN.md']);
      const out = resolveArtifactPath(P, 'PLAN', { currentEpic: 'PHASE11', existsFn });
      expect(out).toBe(join(P, 'PHASE11-PLAN.md'));
    });

    it('the numeric and no-prefix ladder still works with no current_epic', () => {
      expect(
        resolveArtifactPath(P, 'PLAN', { currentEpic: null, existsFn: existsOver(P, ['3-PLAN.md']) })
      ).toBe(join(P, '3-PLAN.md'));
      expect(
        resolveArtifactPath(P, 'PLAN', { currentEpic: null, existsFn: existsOver(P, ['PLAN.md']) })
      ).toBe(join(P, 'PLAN.md'));
    });

    it('the phase-literal pattern still works', () => {
      const existsFn = existsOver(P, ['PLAN-PLAN.md']);
      expect(
        resolveArtifactPath(P, 'PLAN', { currentEpic: null, phase: 'PLAN', existsFn })
      ).toBe(join(P, 'PLAN-PLAN.md'));
    });
  });
});
