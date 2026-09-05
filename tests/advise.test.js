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

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_PREFIX,
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
import { EVIDENCE_MARKER, verifyCitations } from '../plugin/tools/lib/citations.js';

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

describe('t3.2 / t3.2b — it proposes, and never selects (FR6)', () => {
  it('every declined row carries a reason naming the input that demoted it', async () => {
    const base = project();
    const r = await runAdvise(base, { today: TODAY });
    const body = readFileSync(join(base, r.path), 'utf8');
    for (const s of r.ranked.declined) {
      const line = body.split('\n').find((l) => l.includes(s.row.text));
      expect(line).toBeTruthy();
      expect(line).toMatch(/\*\*(blocked-by|trigger-met|age|discharge)\*\*/);
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
