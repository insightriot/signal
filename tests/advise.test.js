// `/sig:advise` — the advisor, the artifact, and the gate. `M6.E7` S3.
//
// The two tests that carry this slice:
//
//   t3.5 — the RUN BOUNDARY. Not "a bad citation is found" (a unit test proves
//   that, and `citations.test.js` already does) but "the run REFUSES and the file
//   does not appear". A finding that is computed and then ignored is `B39`/`B75`
//   verbatim, and it is the failure this Epic keeps naming.
//
//   The vacuous case. `verifyCitations` returns ok over zero citations, so the
//   gate asserts a COUNT. A renderer that emitted no citations at all would pass
//   a flag check, and the artifact would claim to be checked while nothing was.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_PREFIX,
  formatAdviseSummary,
  FORBIDDEN_VERBS,
  RECOMMENDATION_LIMIT,
  RENDER_LABELS,
  cite,
  quoteSafe,
  rankRows,
  renderArtifact,
  runAdvise,
  writeArtifact,
} from '../plugin/tools/lib/advise.js';
import { EVIDENCE_MARKER, extractCitations, verifyCitations } from '../plugin/tools/lib/citations.js';

const TODAY = '2026-09-05';

// Eight live rows, so the top-5 cut leaves a non-empty declined pool: one gated,
// one with a fired trigger, and a spread of filing dates.
const BACKLOG = `# Backlog

## Queue

### R1 — an ungated row filed early

Filed 2026-01-02. Nothing gates it.

### R2 — a row whose trigger FIRED

Trigger: met 2026-02-02.

### R3 — a row blocked on something else

Filed 2026-03-03. This one is blocked on the parser landing first.

### R4 — a plain row

Filed 2026-04-04.

### R5 — another plain row

Filed 2026-05-05.

### R6 — a later plain row

Filed 2026-06-06.

### R7 — the newest plain row

Filed 2026-07-07.

### R8 — a row that quotes a path that does not resolve

Filed 2026-08-08. It mentions \`../analysis/NOPE.md\` and \`wiki/AGENTS.md\`, neither of which exists.

### R9 — Parked — the watchlist *(not sprint material)*

Filed 2026-01-01, older than every other row, and its body mentions a Trigger: FIRED belonging to
something else entirely. Both of those would put it FIRST without input 5.
`;

const STATE = `---
schema_version: 1
phase: PLAN
current_epic: M6.E1
current_wave: null
current_tasks: []
completed_phases: []
blockers: []
last_updated: 2026-09-05T00:00:00.000Z
---
# Project State
`;

function project({ backlog = BACKLOG, omit = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-advise-'));
  const p = join(base, '.planning');
  mkdirSync(p, { recursive: true });
  const write = (n, b) => {
    if (!omit.includes(n)) writeFileSync(join(p, n), b);
  };
  write('BACKLOG.md', backlog);
  write('BUGS.md', '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P2 | **Open.** |\n');
  write('STATE.md', STATE);
  write('MILESTONE-6.md', '# M6\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M6.E1` | **in flight** | A thing. |\n');
  return base;
}

const artifactsIn = (base) => readdirSync(join(base, '.planning')).filter((f) => f.startsWith(ARTIFACT_PREFIX));

describe('t3.1 — ranking, and its stable tiebreak', () => {
  it('ranks ungated above gated, and recommends at most the stated limit', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    expect(r.ranked.recommended.length).toBe(RECOMMENDATION_LIMIT);
    // The blocked row is not in the top five; it was demoted by input 1.
    expect(r.ranked.recommended.map((s) => s.row.text)).not.toContain('R3 — a row blocked on something else');
    expect(r.ranked.declined.map((s) => s.row.text)).toContain('R3 — a row blocked on something else');
  });

  it('the declined pool is EVERY live row not recommended, not a curated subset', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const total = r.corpus.sources.backlog.rows.length;
    expect(r.ranked.recommended.length + r.ranked.declined.length).toBe(total);
  });

  it('equal-rank rows break on source line number, so runs do not reorder', () => {
    const rows = [
      { text: 'B', line: 20, path: '.planning/BACKLOG.md', body: '' },
      { text: 'A', line: 10, path: '.planning/BACKLOG.md', body: '' },
      { text: 'C', line: 30, path: '.planning/BACKLOG.md', body: '' },
    ];
    const once = rankRows(rows, { today: TODAY });
    const twice = rankRows([...rows].reverse(), { today: TODAY });
    expect(once.recommended.map((s) => s.row.text)).toEqual(['A', 'B', 'C']);
    expect(twice.recommended.map((s) => s.row.text)).toEqual(['A', 'B', 'C']);
  });
});

describe('t3.1 input 5 — the wiring, not just the predicate', () => {
  // ⚠ THIS TEST EXISTS BECAUSE ITS ABSENCE WAS MEASURED. With the five predicate
  // tests in place and `declaresNotLiveWork` fully covered, deleting
  // `&& !s.notLive.notLive` from rankRows left the ENTIRE SUITE GREEN — 3279
  // passing over an input that was computed and then dropped. That is `B39`'s
  // shape, and the plan flagged the same gap one input over ("computed in S2 and
  // dropped by the renderer"). A predicate test is not a wiring test.
  //
  // The fixture row is built to win without input 5: oldest filing date, and a
  // body carrying someone else's fired trigger. If the input is unwired it ranks
  // FIRST, so this fails loudly rather than subtly.
  it('a self-declared parked row is dropped from recommended and appears in declined', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const parked = 'R9 — Parked — the watchlist *(not sprint material)*';

    expect(r.ranked.recommended.map((s) => s.row.text)).not.toContain(parked);
    expect(r.ranked.declined.map((s) => s.row.text)).toContain(parked);

    const body = readFileSync(join(base, r.path), 'utf8');
    const line = body.split('\n').find((l) => l.includes(parked));
    expect(line).toMatch(/\*\*self-declared\*\*/);
    expect(line).toContain('Parked');

    // And it is still COUNTED — dropped from the ranking is not dropped from the
    // corpus, or the declined pool stops being complete.
    expect(r.ranked.recommended.length + r.ranked.declined.length).toBe(
      r.corpus.sources.backlog.rows.length
    );
  });
});

describe('t3.2 / t3.2b — it proposes, and never selects (FR6)', () => {
  it('every declined row carries a reason naming the input that demoted it', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    for (const s of r.ranked.declined) {
      // Anchored on the bullet, NOT `includes`: the contrast row's FIRST mention
      // is the Recommended section's contrast sentence, which also matches the
      // input-name regex — so `includes` passed against a declined bullet with its
      // reason deleted. A test that could not fail, found at REVIEW.
      const line = body.split('\n').find((l) => l.startsWith(`- **${s.row.text}`));
      expect(line).toBeTruthy();
      expect(line).toMatch(/\*\*(blocked-by|trigger-met|age|discharge|self-declared)\*\*/);
    }
  });

  it('carries the status line, and none of the forbidden verbs', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain(RENDER_LABELS.status);
    expect(body).toContain(`## ${RENDER_LABELS.recommended}`);
    for (const verb of FORBIDDEN_VERBS) expect(body.toLowerCase()).not.toContain(verb);
  });

  it("the renderer's own labels never claim a decision was made", () => {
    const vocabulary = Object.values(RENDER_LABELS).join(' ').toLowerCase();
    for (const verb of FORBIDDEN_VERBS) expect(vocabulary).not.toContain(verb);
  });

  it('AC1.1 — every recommendation has a reason and a citation, and the top one says what it outranked', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    for (const s of r.ranked.recommended) {
      expect(body).toContain(quoteSafe(s.row.text));
    }
    expect(r.ranked.recommended.length).toBeGreaterThanOrEqual(1);
    expect(r.ranked.declined.length).toBeGreaterThanOrEqual(1);
    // "and not that", rather than "why this".
    expect(body).toMatch(/Ranked above \*/);
  });
});

describe('REVIEW findings — the artifact must not contradict itself', () => {
  // ⚠ FOUND BY A FRESH-CONTEXT REVIEWER, and reproduced in the artifact this repo
  // had already generated: the recommended section said "1 rows scored above it"
  // about `Passive OBSERVATIONS.md capture` while the declined section said "5
  // rows scored above it" about the same row. The contrast clause passed the
  // RECOMMENDED index (always 1) where it needed the row's rank in the declined
  // pool. A self-contradicting count, in a document whose entire claim is that
  // its claims are checkable.
  it('states ONE count for the contrast row — the recommended and declined sections must agree', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');

    const contrast = r.ranked.declined[0].row.text;
    const inRecommended = body.split('\n').find((l) => l.includes('Ranked above'));
    const inDeclined = body.split('\n').find((l) => l.startsWith(`- **${contrast}`));
    expect(inRecommended).toBeTruthy();
    expect(inDeclined).toBeTruthy();

    const countIn = (line) => line.match(/(\d+) rows? (?:scored above|were filed)/)?.[1] ?? null;
    expect(countIn(inRecommended)).toBe(countIn(inDeclined));
    // And it is the rank in the DECLINED pool, not the recommended index.
    expect(countIn(inDeclined)).toBe(String(r.ranked.recommended.length));
  });

  it('never writes "1 rows", and never "which demoted by"', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).not.toMatch(/\b1 rows\b/);
    expect(body).not.toMatch(/which (demoted|dropped) by/);
    expect(body).not.toMatch(/Ranked on its\b/);
  });

  it('says which source the RANKING used, not just which were read', async () => {
    // "Read: BACKLOG.md · BUGS.md · retrospectives · STATE/closure · milestone
    // rows" above a ranked list reads as "all five were weighed". One was.
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('**Consulted by the ranking:**');
    expect(body).toMatch(/no \*\*current ranking input reads them\.\*\*|no current ranking input reads them/i);
  });
});

describe('t3.4 — the producer attribution the outcome oracle depends on', () => {
  it('names itself, because this Epic had to label its own provenance unverified', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    expect(readFileSync(join(base, r.path), 'utf8')).toContain('via /sig:advise');
  });
});

describe('t3.5 — the run boundary: a count, not a flag', () => {
  it('writes when every claim resolves', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('written');
    expect(r.verification.unresolved).toEqual([]);
    expect(r.verification.resolved.length).toBeGreaterThanOrEqual(
      r.ranked.recommended.length + r.ranked.declined.length
    );
  });

  it('REFUSES TO WRITE when one citation does not resolve', async () => {
    const base = project();
    const bad = (args) => `${renderArtifact(args)}\n\nA claim with a bad citation. ${cite('.planning/NOPE.md:1')}\n`;
    const r = await runAdvise(base, { today: TODAY, render: bad });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/citation check failed/);
    // The whole point: not merely that the finding was computed.
    expect(artifactsIn(base)).toEqual([]);
  });

  it('REFUSES TO WRITE when the artifact carries no citations at all — the vacuous case', async () => {
    // An extractor that missed the renderer's grammar produces exactly this:
    // `ok: true`, zero resolved, and an artifact claiming to be checked.
    const base = project();
    const empty = () => '# Backlog review\n\nA confident claim with nothing behind it.\n';
    const r = await runAdvise(base, { today: TODAY, render: empty });
    expect(r.verification.ok).toBe(true);
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/resolved 0 citations/);
    expect(artifactsIn(base)).toEqual([]);
  });

  it('a quoted non-resolving path in a row does NOT fail the run', async () => {
    // R8 quotes two paths that do not exist. If the extractor read free text, the
    // artifact could never be written on a real corpus — AC1.1 unsatisfiable
    // while AC1.3 holds. This is the assertion that both are true at once.
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('R8 — a row that quotes a path that does not resolve');
    expect(r.status).toBe('written');
  });

  it('the marker is stripped from quoted text, so a row cannot forge a citation', async () => {
    const hostile = BACKLOG.replace(
      '### R1 — an ungated row filed early',
      `### R1 — a row that writes ${EVIDENCE_MARKER} \`.planning/NOPE.md:9\` in its own heading`
    );
    const base = project({ backlog: hostile });
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('written');
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('evidence(quoted):');
    const check = await verifyCitations(base, body);
    expect(check.unresolved).toEqual([]);
  });
});

describe('REVIEW findings — the gate at zero, and throws that escaped the contract', () => {
  // ⚠ ALL THREE FOUND BY A FRESH-CONTEXT REVIEWER, AFTER I MEASURED THE OPPOSITE
  // AND WROTE IT INTO THE VERIFY ARTIFACT. My claim was that the symlink throw is
  // unreachable because "every citation points into .planning/, so the citation
  // gate refuses first". Sound — and it presumes at least one citation exists.
  // An empty backlog produces none.

  it('rankRows PARTITIONS, which is why the zero-claims vacuity is benign', () => {
    // The reviewer flagged the gate as doing no work at zero claims. The guard I
    // first wrote for it — refuse when rows exist and nothing is claimed — turned
    // out to be UNREACHABLE, and this is the assertion that says so. Every scored
    // row lands in recommended, rest or dropped, and declined is rest + dropped,
    // so claims === 0 implies there were no live rows and nothing to cite.
    // Pinned so a future change to rankRows that DROPS a row makes the vacuity
    // reachable and turns this red, rather than silently reopening the hole.
    const shapes = [
      [{ text: 'Parked — a row', line: 1, path: 'p', body: '' }],
      [{ text: 'R', line: 1, path: 'p', body: 'blocked on x' }, { text: 'S', line: 2, path: 'p', body: '' }],
      [{ text: 'a reconciliation note', line: 1, path: 'p', body: '' }, { text: 'live', line: 2, path: 'p', body: '' }],
      [],
    ];
    for (const rows of shapes) {
      const r = rankRows(rows, { today: TODAY, stale: [{ id: null, line: 2 }] });
      expect(r.recommended.length + r.declined.length).toBe(rows.length);
    }
  });

  it('still writes when every row is STRUCK — the case that must not be refused', async () => {
    // Reviewer's ask. `readCorpus` filters discharged rows before rankRows sees
    // them, so an all-struck backlog reads as zero live rows. That is a real
    // corpus with real history and nothing outstanding — the advisory should say
    // so, not refuse.
    const struck = `# Backlog

## Queue

### ~~R1 — done~~ · **DONE — v0.1.1, 2026-01-01**

### ~~R2 — also done~~ · **SHIPPED — v0.1.2, 2026-02-02**
`;
    const base = project({ backlog: struck });
    const r = await runAdvise(base, { today: TODAY });
    expect(r.corpus.sources.backlog.rows).toEqual([]);
    expect(r.status).toBe('written');
    expect(readFileSync(join(base, r.path), 'utf8')).toContain('No live row survived');
  });

  it('still writes when there were genuinely no live rows to claim about', async () => {
    // The other side of that line. Zero claims is legitimate only when the corpus
    // had nothing to claim about; collapsing the two in either direction is wrong.
    const base = project({ backlog: '# Backlog\n\nNothing live here yet.\n' });
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('written');
    expect(r.ranked.recommended).toEqual([]);
    expect(r.ranked.declined).toEqual([]);
  });

  it('returns a reason instead of throwing when .planning/ is a symlink out of the repo', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-advise-outside-'));
    writeFileSync(join(outside, 'BACKLOG.md'), '# Backlog\n');
    writeFileSync(join(outside, 'STATE.md'), STATE);
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-symlink-'));
    symlinkSync(outside, join(base, '.planning'));
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBeTruthy();
  });

  it('returns a reason instead of throwing when .planning/ is not writable', async () => {
    // Needs no symlink and no unusual corpus — a read-only mount or a full disk
    // reaches this on an ordinary run.
    const base = project();
    const planning = join(base, '.planning');
    chmodSync(planning, 0o555);
    try {
      const r = await runAdvise(base, { today: TODAY });
      expect(r.status).toBe('skipped');
      expect(r.reason).toMatch(/could not be written/);
    } finally {
      chmodSync(planning, 0o755);
    }
  });
});

describe('three latent bugs the reviewer filed as suggestions (they were not)', () => {
  it('a stale entry with no line does NOT silently discharge a live row', async () => {
    // `staleLines` lacked the `.filter(Boolean)` its sibling has, so `undefined`
    // entered the Set and any row also lacking a line read as discharged and
    // VANISHED. Silently losing a live row is the worst thing this module can do.
    const r = rankRows([{ text: 'a live row', path: 'p', body: '' }], {
      today: TODAY,
      stale: [{ id: null, line: undefined }],
    });
    expect(r.recommended.map((s) => s.row.text)).toEqual(['a live row']);
    expect(r.declined).toEqual([]);
  });

  it('a row with no text is ranked, not thrown on', () => {
    expect(() => rankRows([{ line: 1, path: 'p' }], { today: TODAY })).not.toThrow();
  });

  it('a caller cannot inject a citation through projectName', async () => {
    // `projectName` is caller-supplied and was the one interpolation skipping
    // `quoteSafe`, so a caller could write the evidence marker into the header
    // and put a citation into the extractor's own position. Verified before the
    // fix: an injected name yielded `nope/missing.md:1` as a real extracted
    // citation.
    const hostile = 'Acme ' + EVIDENCE_MARKER + ' `nope/missing.md:1`';
    const art = renderArtifact({
      today: TODAY,
      ranked: { recommended: [], declined: [] },
      corpus: { checked: [], cannotCheck: [] },
      projectName: hostile,
    });
    expect(extractCitations(art)).toEqual([]);
    expect(art).toContain('evidence(quoted):');
  });
});

describe('formatAdviseSummary — the only thing the user actually sees (reviewer-found)', () => {
  // ⚠ `commands/advise.md` says "Print formatAdviseSummary(result)". It had ZERO
  // tests and no other caller — the untested user-facing renderer in an Epic whose
  // thesis is that a computed-then-unread value is `B39`'s shape. Every branch is
  // exercised here, and the `skipped` branch matters most: the two new reasons
  // added at REVIEW flow straight into it.
  it('names the recommendations, the declined count, and where it wrote', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const out = formatAdviseSummary(r);
    expect(out).toContain(`Backlog review — ${TODAY}`);
    expect(out).toContain(`1. ${r.ranked.recommended[0].row.text}`);
    expect(out).toContain(`${r.ranked.declined.length} row(s) looked at and declined`);
    expect(out).toContain('Written to');
    expect(out).toContain('It changes nothing on its own.');
  });

  it('says "Unchanged at" on an idempotent re-run rather than claiming a write', async () => {
    const base = project();
    await runAdvise(base, { today: TODAY });
    const again = await runAdvise(base, { today: TODAY });
    expect(again.status).toBe('unchanged');
    expect(formatAdviseSummary(again)).toContain('Unchanged at');
    expect(formatAdviseSummary(again)).not.toContain('Written to');
  });

  it('the skipped branch reports the reason and claims nothing else', async () => {
    const base = project({ omit: ['BACKLOG.md'] });
    const r = await runAdvise(base, { today: TODAY });
    const out = formatAdviseSummary(r);
    expect(out).toMatch(/wrote nothing —/);
    expect(out).toContain(r.reason);
    expect(out).not.toContain('Written to');
    expect(out).not.toContain('row(s) looked at and declined');
  });

  it('warns in the terminal about sources it could not read', async () => {
    const base = project({ omit: ['BUGS.md'] });
    const r = await runAdvise(base, { today: TODAY });
    const out = formatAdviseSummary(r);
    expect(out).toMatch(/⚠ 1 source\(s\) could not be read: BUGS\.md\./);
  });
});

describe('t3.6 / NFR1 — determinism and idempotence', () => {
  it('renders byte-identical output twice over the same corpus', async () => {
    const base = project();
    const first = await runAdvise(base, { today: TODAY });
    const second = await runAdvise(base, { today: TODAY });
    expect(second.status).toBe('unchanged');
    expect(second.artifact).toBe(first.artifact);
  });

  it('does not rewrite the file when nothing changed', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const before = statSync(join(base, r.path)).mtimeMs;
    await new Promise((res) => setTimeout(res, 10));
    await runAdvise(base, { today: TODAY });
    expect(statSync(join(base, r.path)).mtimeMs).toBe(before);
  });

  it('refuses, with a reason, when .planning/ is absent', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sig-advise-bare-'));
    const r = await writeArtifact(base, { name: 'BACKLOG-REVIEW-2026-09-05.md', content: '#\n' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/not present/);
  });
});

describe('t3.7 — the artifact name is constrained, not chosen', () => {
  it('is BACKLOG-REVIEW-YYYY-MM-DD.md, the pattern doc-budgets.json already exempts', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    expect(r.path).toBe(`.planning/${ARTIFACT_PREFIX}${TODAY}.md`);
    const budgets = JSON.parse(readFileSync(join(process.cwd(), 'tools/doc-budgets.json'), 'utf8'));
    expect(JSON.stringify(budgets)).toContain('BACKLOG-REVIEW');
  });
});

describe('AC1.4 / AC1.5 — what it says, and what it touches', () => {
  it('an unreadable BUGS.md reaches the ARTIFACT, not just the return value', async () => {
    // The half that was missing from the mapping: `cannotCheck` computed in S2
    // and dropped by the renderer is `B39`'s shape verbatim.
    const base = project({ omit: ['BUGS.md'] });
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    expect(body).toContain('Could not read:');
    expect(body).toContain('BUGS.md');
    expect(body).toMatch(/not a complete picture/i);
  });

  it('writes its artifact and nothing else', async () => {
    const base = project();
    const planning = join(base, '.planning');
    const before = Object.fromEntries(
      readdirSync(planning).map((f) => [f, readFileSync(join(planning, f), 'utf8')])
    );
    await runAdvise(base, { today: TODAY });
    for (const [name, content] of Object.entries(before)) {
      expect(readFileSync(join(planning, name), 'utf8')).toBe(content);
    }
    const after = readdirSync(planning).filter((f) => !(f in before));
    expect(after).toEqual([`${ARTIFACT_PREFIX}${TODAY}.md`]);
    // Named explicitly: the inbound BACKLOG.md link and the INDEX.md regeneration
    // are ONE-TIME HUMAN EDITS AT SHIP, not command behaviour.
    expect(existsSync(join(planning, 'INDEX.md'))).toBe(false);
  });

  it('skips with a reason when there is no backlog to advise from', async () => {
    const base = project({ omit: ['BACKLOG.md'] });
    const r = await runAdvise(base, { today: TODAY });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/not present/);
    expect(artifactsIn(base)).toEqual([]);
  });
});

describe('AC1.6 / NFR2 — no dependency on the prose plugin', () => {
  it('nothing this Epic ships imports or shells out to anything under prose', () => {
    // REACH DECLARATION (`B81`): this reads the four files M6.E7 adds or changes
    // under plugin/tools/lib, as text. It looks for the substring `prose` in any
    // import specifier, and for `prose` inside an execFile/spawn/exec argument.
    // It does NOT follow transitive imports, and it does NOT inspect the command
    // markdown. A dependency introduced through a module this does not name, or
    // through a string assembled at runtime, is outside its reach.
    const files = ['citations.js', 'advise-corpus.js', 'advise.js', 'milestones.js'];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), 'plugin/tools/lib', f), 'utf8');
      const imports = [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec).not.toMatch(/prose/i);
      expect(src).not.toMatch(/(?:execFile|spawn|execSync|exec)\s*\([^)]*prose/i);
    }
  });
});
