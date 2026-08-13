import { describe, it, expect } from 'vitest';
import { currentUnit } from '../tools/lib/work-units.js';
import { parseVerdict, rankTerminalArtifacts } from '../tools/lib/verdict.js';

/**
 * M5.E18 wave 2 — S2 (FR3, the raw current-unit guard) + S3 (FR2, verdicts).
 *
 * Every content fixture below is transcribed from a REAL file in the 12-project
 * corpus, cited inline. M5.E18 PLAN research measured 11 of 31 terminal
 * artifacts (35%) as carrying no parseable verdict — so `unreadable` is the
 * majority path here, not a defensive branch.
 */

describe('S2 / FR3 — currentUnit reads the RAW field', () => {
  it('AC3.1 — a non-strict value survives: PHASE12 comes back as PHASE12', () => {
    // RED against any implementation routed through EPIC_ID_STRICT_RE,
    // detectMode, or isEpicDone — all of which answer null/false/'linear' here.
    expect(currentUnit({ current_epic: 'PHASE12' })).toBe('PHASE12');
  });

  it('AC3.3 — byte-equal to the field, with no normalisation', () => {
    for (const raw of ['PHASE12', 'M1', 'phase-12', 'Slice SSO', 'M5.E18']) {
      expect(currentUnit({ current_epic: raw })).toBe(raw);
    }
  });

  describe('AC3.4 — the four shapes measured on the real corpus', () => {
    // 4 of 12 projects have no STATE frontmatter at all, 1 has frontmatter
    // without the field, 3 hold null, 4 hold a value. AC3.2 covered null;
    // ABSENT arrives by a different path and is asserted separately.
    it('a value (4 projects: eval-project-I, eval-project-F, signal, eval-project-C)', () => {
      expect(currentUnit({ current_epic: 'M1' })).toBe('M1');
    });

    it('AC3.2 — null (3 projects: eval-project-D, eval-project-A, eval-project-K)', () => {
      expect(currentUnit({ current_epic: null })).toBe(null);
    });

    it('field absent from frontmatter (1 project: eval-project-B)', () => {
      expect(currentUnit({})).toBe(null);
    });

    it('no state at all — readState threw or returned null (4 projects have no frontmatter)', () => {
      expect(currentUnit(null)).toBe(null);
      expect(currentUnit(undefined)).toBe(null);
    });

    it('the collapse of absent/null/no-state to one behaviour is DELIBERATE, not accidental', () => {
      // They arrive by different paths and mean slightly different things, but
      // all three answer "no unit is current". Asserted so a future change that
      // splits them has to do so on purpose.
      expect(currentUnit({ current_epic: null })).toBe(currentUnit({}));
      expect(currentUnit({})).toBe(currentUnit(null));
    });
  });

  it('an empty or whitespace-only value is not a unit', () => {
    expect(currentUnit({ current_epic: '' })).toBe(null);
    expect(currentUnit({ current_epic: '   ' })).toBe(null);
  });

  it('a non-string value does not leak through as a unit name', () => {
    expect(currentUnit({ current_epic: 12 })).toBe(null);
    expect(currentUnit({ current_epic: ['M1'] })).toBe(null);
  });
});

describe('S3 / FR2 — parseVerdict reads a VALUE, never a heading', () => {
  describe('AC2.3 + the readable formats found on the corpus', () => {
    it('eval-project-C PHASE8-VERIFICATION.md:3 — plain', () => {
      const r = parseVerdict('# PHASE8\n\n**Verdict: PASS.** All 9 acceptance criteria verified.\n');
      expect(r.status).toBe('pass');
      expect(r.evidence).toContain('Verdict: PASS');
    });

    it('eval-project-I M1-VERIFICATION.md:5 — emoji inside the bold', () => {
      const r = parseVerdict('# M1\n\n**Verdict: ✅ PASS** — all acceptance criteria met.\n');
      expect(r.status).toBe('pass');
    });

    it('eval-project-A SLICE-SSO-VERIFICATION.md:3 — qualified, multi-clause', () => {
      const r = parseVerdict(
        '# Slice SSO\n\n**Verdict:** ✅ **PASS (structural) — with the real-Entra-walk exit ' +
        'gate (NFR-SSO.5) explicitly DEFERRED as externally-gated.**\n',
      );
      expect(r.status).toBe('pass');
    });

    it('AC2.5 — a readable FAIL is a FAIL', () => {
      expect(parseVerdict('**Verdict: FAIL** — check (c) reports clean.\n').status).toBe('fail');
    });

    // Found by running the parser against the real corpus rather than the
    // fixtures: FOUR of the files it called unreadable were SIGNAL'S OWN, in
    // two formats the line-initial rule wrongly rejected.
    it('signal M5.E13-VERIFICATION.md:6 — a HEADING carrying the value inline', () => {
      const r = parseVerdict('## Verdict: **PASS-WITH-A-DOCUMENTED-GAP**\n');
      expect(r.status).toBe('pass');
    });

    it('signal M5.E9-VERIFICATION.md:7 — heading, em-dash, value inline', () => {
      expect(parseVerdict('## Verdict — **PASS WITH TWO RE-SCOPED CRITERIA**\n').status).toBe('pass');
    });

    it('signal M5.E6-VERIFICATION.md:3 — mid-line, after other metadata', () => {
      const r = parseVerdict(
        '**Tier:** FULL / strict · **Verdict:** ✅ **PASS** · Verified 2026-07-24 at HEAD `37806e7`.\n',
      );
      expect(r.status).toBe('pass');
    });

    it('the relaxation does NOT reintroduce the Nyquist trap', () => {
      // Position on the line stopped being the test, so this is the guard that
      // has to hold instead: a verdict QUALIFIED by a preceding word is not an
      // outcome, wherever it appears.
      expect(parseVerdict('**Nyquist verdict: STRICT-clean.** PASS on coverage.\n').status)
        .toBe('unreadable');
      expect(parseVerdict('Some prose · **Nyquist verdict:** PASS\n').status).toBe('unreadable');
    });
  });

  describe('AC2.6 — a heading is not a value', () => {
    // MEASURED, not assumed. Of the 6 heading-style files, 3 do have a value in
    // the body — but eval-project-E's body reads "**All 22 acceptance criteria
    // pass.**", a lowercase "pass" inside prose. A body scan cannot tell that
    // from "**Only 3 of 22 criteria pass.**", so it would produce a CONFIDENT
    // WRONG ANSWER. That is the whole defect class this Epic exists to end.
    const HEADINGS = [
      ['eval-project-E VERIFY-VERIFICATION.md', '## Verdict\n\n**All 22 acceptance criteria pass.** Test suite clean.\n'],
      ['eval-project-K R1-VERIFICATION.md', '## Verdict\n\n**PASS on all automated acceptance criteria + Nyquist compliance.**\n'],
      ['mps 3-VERIFICATION.md', '## VERIFY phase verdict\n\n**PASS** at strict gate. 44/44 ACs covered.\n'],
      ['consensus T24-VERIFICATION.md', '## 5. Verdict\n\n**Verification status: ✓ PASS — all acceptance criteria met.**\n'],
      ['consensus T26-VERIFICATION.md', '## 6. Verdict\n\n| Acceptance criterion | Status |\n'],
      ['eval-project-A SC1-VERIFICATION.md', '## Verdict — **one gate left, and it needs a browser**\n\nStill outstanding.\n'],
    ];

    for (const [name, content] of HEADINGS) {
      it(`${name} → unreadable`, () => {
        expect(parseVerdict(content).status).toBe('unreadable');
      });
    }
  });

  describe('AC2.7 — a verdict of a DIFFERENT KIND must not match first', () => {
    it('consensus T25-VERIFICATION.md — "Nyquist verdict" is a coverage verdict, not an outcome', () => {
      // The trap: a first-match parser reads STRICT-clean as the unit's result.
      const r = parseVerdict(
        '# T25\n\n**Nyquist verdict: STRICT-clean.** Every test artifact named in VALIDATION exists.\n',
      );
      expect(r.status).toBe('unreadable');
    });

    it('a qualified verdict does not mask a real one later in the file', () => {
      const r = parseVerdict(
        '**Nyquist verdict: STRICT-clean.**\n\n**Verdict: PASS.** All criteria met.\n',
      );
      expect(r.status).toBe('pass');
    });
  });

  describe('AC2.9 — multiple verdict mentions resolve by a STATED rule: first value wins', () => {
    it('eval-project-I M1-VERIFICATION.md — line 5 and line 83', () => {
      const r = parseVerdict(
        '**Verdict: ✅ PASS** — all acceptance criteria met.\n' +
        'REVIEW found 1 Critical; fixed in S9. Verdict remains **PASS** on the hardened tree.\n',
      );
      expect(r.status).toBe('pass');
      expect(r.evidence).toContain('all acceptance criteria met');
    });

    it('first-value-wins is asserted where the two DISAGREE, so the rule is visible', () => {
      const r = parseVerdict('**Verdict: FAIL** — blocked.\n\nVerdict remains **PASS** later.\n');
      expect(r.status).toBe('fail');
    });
  });

  describe('no verdict at all', () => {
    it('eval-project-C PHASE8-SHIP.md — 4 corpus files carry no verdict mention', () => {
      expect(parseVerdict('# PHASE8 — SHIP\n\nMerged and deployed.\n').status).toBe('unreadable');
    });

    it('empty / null input does not throw', () => {
      expect(parseVerdict('').status).toBe('unreadable');
      expect(parseVerdict(null).status).toBe('unreadable');
    });

    it('a lowercase verdict value is NOT read — prose is not a value', () => {
      expect(parseVerdict('Verdict: pass, probably.\n').status).toBe('unreadable');
    });
  });
});

describe('S3 / AC2.8 — VERIFICATION outranks SHIP', () => {
  // eval-project-C PHASE8 has BOTH: PHASE8-VERIFICATION.md carries
  // "Verdict: PASS", PHASE8-SHIP.md carries no verdict at all. FR2(a) accepted
  // "a VERIFICATION OR SHIP artifact" without ranking them, so PHASE8 resolved
  // closed or cannotDetermine purely by which file was read first.
  const PHASE8 = ['PHASE8-PLAN.md', 'PHASE8-SHIP.md', 'PHASE8-VERIFICATION.md'];

  it('ranks VERIFICATION ahead of SHIP', () => {
    expect(rankTerminalArtifacts(PHASE8)).toEqual(['PHASE8-VERIFICATION.md', 'PHASE8-SHIP.md']);
  });

  it('is deterministic whichever order the directory is walked', () => {
    expect(rankTerminalArtifacts([...PHASE8].reverse())).toEqual(
      ['PHASE8-VERIFICATION.md', 'PHASE8-SHIP.md'],
    );
  });

  it('drops non-terminal artifacts entirely', () => {
    expect(rankTerminalArtifacts(['X-PLAN.md', 'X-RESEARCH.md'])).toEqual([]);
  });

  it('a unit with only a SHIP artifact still offers it', () => {
    expect(rankTerminalArtifacts(['PHASE10-SHIP.md'])).toEqual(['PHASE10-SHIP.md']);
  });
});
