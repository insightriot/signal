// End-to-end spawn harness for the B75 pair: the PostToolUse hook that records
// an ask, and the PreToolUse hook that reports on a phase closing without one.
//
// WHY SPAWN AND NOT JUST THE HELPERS. `ask-record.test.js` exercises the logic;
// this drives both PROCESSES with real event JSON. That gap is where this
// project's most-repeated defect lives — a mechanism that is built, documented,
// and reached by nothing (`analysis/UNREACHED-MECHANISM-ANALYSIS.md`). `B75`
// itself is an instance: `confirm_in_phase` was written by the profile expander
// and read by one test and nothing else. A unit test on this module would have
// passed in exactly that world, so it is not the test that keeps it honest.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECORD_HOOK = join(__dirname, '..', 'plugin', 'hooks', 'record-ask.js');
const CHECK_HOOK = join(__dirname, '..', 'plugin', 'hooks', 'check-state-write.js');
const MANIFEST = join(__dirname, '..', 'plugin', 'hooks', 'hooks.json');

function run(hook, event) {
  const r = spawnSync('node', [hook], { encoding: 'utf-8', input: JSON.stringify(event) });
  return { status: r.status, stderr: (r.stderr ?? '').toString() };
}

function stateWith(completed) {
  return `---
schema_version: 1
phase: PLAN
current_epic: null
current_wave: null
current_tasks: []
completed_phases:
${completed.map((p) => `  - ${p}`).join('\n')}
blockers: []
---
body
`;
}

const ATTENDED_PROFILE = `---
tier: FULL
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  attention: attended
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-08-22T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---
`;
// NB: a PROFILE.md fixture must be COMPLETE — every `rigor_overrides` key plus
// a `metadata` object. Miss either and `readEffectiveProfile` throws
// `ProfileSchemaError`, the hook fails open, and the check silently does
// nothing while the test reports only an empty stderr. That is `B59`'s shape
// (a profile that throws, and the work runs at a setting nobody chose); it cost
// two debugging rounds here, and the only reason it was caught is that this
// test asserts on the message rather than on the exit code.

let dir;
let statePath;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sig-b75-'));
  mkdirSync(join(dir, '.planning'), { recursive: true });
  statePath = join(dir, '.planning', 'STATE.md');
  writeFileSync(statePath, stateWith(['DISCUSS (2026-08-19)']), 'utf-8');
  writeFileSync(join(dir, '.planning', 'PROFILE.md'), ATTENDED_PROFILE, 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the manifest actually wires the recorder', () => {
  it('declares a PostToolUse hook matching AskUserQuestion', () => {
    // Reads the shipped manifest from disk rather than restating it, so
    // deleting the entry fails this test instead of passing quietly.
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
    const entries = manifest.hooks?.PostToolUse ?? [];
    const match = entries.find((e) => e.matcher === 'AskUserQuestion');
    expect(match, 'no PostToolUse entry matches AskUserQuestion').toBeTruthy();
    expect(match.hooks[0].command).toContain('record-ask.js');
  });
});

describe('record-ask.js', () => {
  it('records the ask with the phase that was running', () => {
    const r = run(RECORD_HOOK, {
      tool_name: 'AskUserQuestion',
      cwd: dir,
      tool_input: { questions: [] },
    });
    expect(r.status).toBe(0);
    const written = JSON.parse(readFileSync(join(dir, '.signal', 'asks.jsonl'), 'utf-8').trim());
    expect(written.phase).toBe('PLAN');
  });

  it('ignores any other tool', () => {
    run(RECORD_HOOK, { tool_name: 'Read', cwd: dir, tool_input: {} });
    expect(existsSync(join(dir, '.signal', 'asks.jsonl'))).toBe(false);
  });

  it('exits 0 on garbage stdin rather than breaking the tool call', () => {
    const r = spawnSync('node', [RECORD_HOOK], { encoding: 'utf-8', input: 'not json' });
    expect(r.status).toBe(0);
  });

  it('exits 0 outside a Signal project and writes nothing', () => {
    const bare = mkdtempSync(join(tmpdir(), 'sig-bare-'));
    try {
      const r = run(RECORD_HOOK, { tool_name: 'AskUserQuestion', cwd: bare, tool_input: {} });
      expect(r.status).toBe(0);
      expect(existsSync(join(bare, '.signal'))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('still records when STATE.md carries an unreadable schema version', () => {
    // A hook must not be the thing that breaks during a schema migration, so it
    // parses the frontmatter directly instead of going through readState, which
    // throws on an ahead schema.
    writeFileSync(statePath, stateWith(['DISCUSS (2026-08-19)']).replace('schema_version: 1', 'schema_version: 99'), 'utf-8');
    const r = run(RECORD_HOOK, { tool_name: 'AskUserQuestion', cwd: dir, tool_input: {} });
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.signal', 'asks.jsonl'))).toBe(true);
  });
});

describe('check-state-write.js — the phase-close report', () => {
  const closeEdit = () => ({
    tool_name: 'Edit',
    tool_input: {
      file_path: statePath,
      old_string: '  - DISCUSS (2026-08-19)',
      new_string: '  - DISCUSS (2026-08-19)\n  - PLAN (2026-08-22)',
    },
  });

  it('says it could not check when no ask has ever been recorded', () => {
    const r = run(CHECK_HOOK, closeEdit());
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/no ask record exists/i);
  });

  it('warns — and does NOT block — when the phase closed with no ask', () => {
    // The decision of 2026-08-22: report, do not refuse. Exit 0 is the whole
    // point; a 2 here would silently convert B75 into a gate nobody agreed to.
    run(RECORD_HOOK, { tool_name: 'AskUserQuestion', cwd: dir, tool_input: {} });
    writeFileSync(join(dir, '.signal', 'asks.jsonl'), JSON.stringify({ at: 'T', phase: 'DISCUSS', epic: null }) + '\n', 'utf-8');
    const r = run(CHECK_HOOK, closeEdit());
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/no question to you\s+was observed|no question to you was observed/i);
    expect(r.stderr).toMatch(/report, not a refusal/i);
  });

  it('stays quiet when the phase was closed with an ask on the record', () => {
    run(RECORD_HOOK, { tool_name: 'AskUserQuestion', cwd: dir, tool_input: {} });
    const r = run(CHECK_HOOK, closeEdit());
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/no question to you/i);
    expect(r.stderr).not.toMatch(/no ask record exists/i);
  });

  it('stays quiet when the dial is not set to ask-as-you-go', () => {
    writeFileSync(
      join(dir, '.planning', 'PROFILE.md'),
      ATTENDED_PROFILE.replace('attention: attended', 'attention: checkpointed'),
      'utf-8'
    );
    const r = run(CHECK_HOOK, closeEdit());
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/no ask record exists/i);
  });

  it('stays quiet on an ordinary STATE edit that closes no phase', () => {
    const r = run(CHECK_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: statePath, old_string: 'body', new_string: 'body edited' },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/no ask record exists/i);
  });

  it('fails open with no PROFILE.md at all', () => {
    rmSync(join(dir, '.planning', 'PROFILE.md'));
    const r = run(CHECK_HOOK, closeEdit());
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/no ask record exists/i);
  });
});
