// M5.E2 REVIEW C1 — the migrated STATE.md must round-trip through the REAL parser.
//
// The migrate's own "conformant" verdict (senseState / checkStateFrontmatterShape)
// is regex/length-based — strictly WEAKER than "the real state.js parser can read
// it." The live consumers (/sig:resume, /sig:status, /sig:doctor) parse STATE.md
// via state.js's parseFrontmatter, which runs the actual `yaml` package and THROWS
// StateSchemaError on malformed YAML. A splice that yields a length-conformant-but-
// structurally-broken frontmatter would pass every migrate gate, be idempotent,
// then CRASH resume in the target repo.
//
// This test runs the FULL migrate --apply on every fixture SHAPE (multi-line
// completed_phases, block-scalar blockers[].text, the B12 non-standard/active
// entry, an un-sectioned big body, and a CRLF file) and asserts the resulting
// .planning/STATE.md round-trips through the REAL parser (readState, which is
// exactly what /sig:resume calls) without throwing AND yields the expected fields.
// The parser is IMPORTED from tools/lib/state.js — never re-implemented here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyMigrate } from '../tools/lib/migrate-memory.js';
// The REAL consumer path — the same parser /sig:resume|status|doctor read through.
import { parseFrontmatter, readState } from '../tools/lib/state.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']); // keep the CRLF fixture byte-exact
}

// --- the five migrate fixture SHAPES ------------------------------------------

// 1. Multi-line quoted completed_phases entry (the cmmc pollution) + a clean one.
const MULTILINE_CP =
  `---\n` +
  `schema_version: 1\n` +
  `phase: PLAN\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n` +
  `  - CALIBRATE (2026-05-13)\n` +
  `  - "DISCUSS (2026-07-01) — a multi-line narrative annotation that wraps\n` +
  `    across several source lines and carries real meaning the migrate must\n` +
  `    relocate verbatim into the body rather than drop"\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\n## Resume pointer\n\nexisting body\n`;

// 2. A block-scalar blockers[].text field (the structured-field prose pollution).
const BLOCK_SCALAR_BLOCKER =
  `---\n` +
  `schema_version: 1\n` +
  `phase: EXECUTE\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases: []\n` +
  `blockers:\n` +
  `  - id: blk-1a2b\n` +
  `    text: |\n` +
  `      first paragraph of narrative prose that should never\n` +
  `      live inside a structured blocker text field at all\n` +
  `    raisedAt: 2026-07-13T00:00:00.000Z\n` +
  `---\n` +
  `# Project State\n\nexisting body\n`;

// 3. The B12 non-standard / active-looking completed_phases entry (no PHASE (date)).
const ACTIVE_MARKER =
  `▶ Active: Slice SEC1 — Supabase Security-Advisor Hardening: DISCUSS done → ` +
  `EXECUTE in progress (PLAN landed 2026-07-16, 4-agent research + independent ` +
  `plan-checker PASS)`; // >150 chars → over-length → enters the de-prose set
const B12_ACTIVE =
  `---\n` +
  `schema_version: 1\n` +
  `phase: EXECUTE\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n` +
  `  - CALIBRATE (2026-05-13)\n` +
  `  - "${ACTIVE_MARKER}"\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\nexisting body\n`;

// 4. An un-sectioned big inlined body (> 8 KB) → vector-2 relocate to STATE-HISTORY.
const BIG_BODY =
  `---\n` +
  `schema_version: 1\n` +
  `phase: PLAN\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases:\n  - DISCUSS (2026-07-16)\n` +
  `blockers: []\n` +
  `---\n` +
  `# Project State\n\n${'an inlined narrative paragraph carrying plain words. '.repeat(300)}\n`;

// 5. CRLF: a multi-line completed_phases + block-scalar blocker under CRLF fences —
//    exercises the mixed-EOL relocation region against the REAL parser.
const CRLF_FIXTURE = [
  '---',
  'schema_version: 1',
  'phase: PLAN',
  'current_epic: M5.E2',
  'current_tasks: []',
  'completed_phases:',
  '  - CALIBRATE (2026-05-13)',
  '  - "DISCUSS (2026-07-01) — a multi-line narrative annotation wrapping',
  '    across several lines the migrate must relocate verbatim not drop"',
  'blockers:',
  '  - id: blk-3c4d',
  '    text: |',
  '      first paragraph of narrative prose that should never',
  '      live inside a structured blocker text field at all',
  '    raisedAt: 2026-07-13T00:00:00.000Z',
  '---',
  '# Project State',
  '',
  'existing body',
  '',
].join('\r\n');

async function setup(dir, fixture) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), fixture, 'utf-8');
  initRepo(dir);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2 REVIEW C1 — migrated STATE.md round-trips through the real state.js parser', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-roundtrip-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['multi-line completed_phases', MULTILINE_CP],
    ['block-scalar blockers[].text', BLOCK_SCALAR_BLOCKER],
    ['B12 non-standard/active entry', B12_ACTIVE],
    ['un-sectioned big body (vector-2)', BIG_BODY],
    ['CRLF file', CRLF_FIXTURE],
  ])('%s → apply → STATE.md parses via readState + parseFrontmatter without throwing', async (_label, fixture) => {
    await setup(dir, fixture);
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true); // the fixture actually triggered a migrate

    const finalState = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');

    // 1. parseFrontmatter (the narrow YAML gate) must not throw + must yield a mapping.
    const { data } = parseFrontmatter(finalState);
    expect(data).not.toBeNull();
    expect(typeof data).toBe('object');
    expect(Array.isArray(data)).toBe(false);
    expect(data.schema_version).toBe(1);

    // 2. readState (the FULL consumer path /sig:resume uses) must not throw and must
    //    return a schema_version-1 state with the expected structural fields.
    const state = await readState(dir);
    expect(state).not.toBeNull();
    expect(state._schema).toBe(1);
    expect(state.schema_version).toBe(1);
    expect(Array.isArray(state.completed_phases)).toBe(true);
    expect(Array.isArray(state.blockers)).toBe(true);
    expect(typeof state.phase).toBe('string');
  });

  // Per-shape field-VALUE assertions (not just "didn't throw"): prove the de-prosed
  // splices parse back into the RIGHT structure, not a mangled scalar.
  it('multi-line completed_phases: parses back as a 2-element string list, clean entry intact', async () => {
    await setup(dir, MULTILINE_CP);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    const state = await readState(dir);
    expect(state.completed_phases).toHaveLength(2);
    expect(state.completed_phases.every((e) => typeof e === 'string')).toBe(true);
    expect(state.completed_phases[0]).toBe('CALIBRATE (2026-05-13)');
  });

  it('block-scalar blocker: parses back as one blocker object whose id survives', async () => {
    await setup(dir, BLOCK_SCALAR_BLOCKER);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    const state = await readState(dir);
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0].id).toBe('blk-1a2b');
    expect(typeof state.blockers[0].text).toBe('string'); // block scalar → single scalar
  });

  it('B12 active entry: the de-prosed label parses back as a proper list element carrying SEC1', async () => {
    await setup(dir, B12_ACTIVE);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    const state = await readState(dir);
    expect(state.completed_phases).toHaveLength(2);
    // The label must survive as a real (parseable) scalar, not a broken splice.
    expect(state.completed_phases.some((e) => e.includes('SEC1'))).toBe(true);
  });

  it('CRLF file: readState round-trips despite the mixed-EOL relocated body region', async () => {
    await setup(dir, CRLF_FIXTURE);
    await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    // Direct proof the CRLF-frontmatter + mixed-EOL body is harmless to the real
    // consumer: the parser reads the frontmatter fine and the fields are intact.
    const state = await readState(dir);
    expect(state._schema).toBe(1);
    expect(state.phase).toBe('PLAN');
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0].id).toBe('blk-3c4d');
  });
});
