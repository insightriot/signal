// `M6.E12` — the half of the flow that lives in command prose (AC4.1, AC4.4, AC5.2, AC6.1).
//
// Asking, recording and offering to start are instructions an agent follows, not
// code a unit test can call. What CAN be checked is that the instructions say what
// the requirements promised, and that every function they name exists — a command
// file that names a symbol nothing exports is an instruction nobody can follow.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as advise from '../plugin/tools/lib/advise.js';
import * as priorities from '../plugin/tools/lib/advise-priorities.js';
import * as record from '../plugin/tools/lib/advise-record.js';
import * as digest from '../plugin/tools/lib/advise-digest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adviseMd = readFileSync(join(root, 'plugin/commands/advise.md'), 'utf8');
const driveMd = readFileSync(join(root, 'plugin/commands/drive.md'), 'utf8');

describe('advise.md — AC4.1 and AC4.4', () => {
  it('asks with AskUserQuestion for 3–4, and a numbered prompt for 5, because the picker takes four', () => {
    expect(adviseMd).toMatch(/3 or 4 priorities:\*\* one `AskUserQuestion`/);
    expect(adviseMd).toMatch(/at most four options/);
    expect(adviseMd).toMatch(/5 priorities:\*\* a plain numbered list/);
  });

  it('records the pick with recordChoice, and offers the three ways to start — nothing starts without a yes', () => {
    expect(adviseMd).toContain('recordChoice(baseDir, result.path, { pick, words, by, title })');
    expect(adviseMd).toMatch(/Start it with `\/sig:drive`/);
    expect(adviseMd).toMatch(/Open an Epic with `\/sig:discuss --epic`/);
    expect(adviseMd).toMatch(/\*\*Not now\.\*\*/);
    expect(adviseMd).toContain('Nothing starts without a yes.');
  });

  it('every function its references name is exported by the module it names', () => {
    const modules = { 'advise.js': advise, 'advise-priorities.js': priorities, 'advise-record.js': record, 'advise-digest.js': digest };
    const refs = adviseMd.split('## Workflow')[1].split('### 1.')[0].replace(/\s+/g, ' ');
    let checked = 0;
    for (const [, file, names] of refs.matchAll(/`tools\/lib\/([a-z-]+\.js)` — ((?:`\w+`(?:, )?)+)/g)) {
      for (const [, name] of names.matchAll(/`(\w+)`/g)) {
        expect(modules[file], file).toBeDefined();
        expect(name in modules[file], `${file} exports ${name}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(7);
  });

  it('does not describe the command as ranking by age', () => {
    expect(adviseMd).toMatch(/Age is not an input/);
    expect(adviseMd).not.toMatch(/\bage\b[^.]*\binput\b[^.]*\branks?\b/i);
  });
});

describe('drive.md step 0a — AC5.1–AC5.3', () => {
  const step0a = driveMd.split('### 0a. Choose the work')[1].split('### 0a-ii.')[0];

  it('an already-open Epic comes first', () => {
    expect(step0a).toMatch(/An already-open Epic comes first/);
  });

  it('otherwise runs the priorities flow, and the pick becomes a new Epic at DISCUSS', () => {
    expect(step0a).toMatch(/priorities flow/);
    for (const fn of ['prepareAdvise', 'runAdvise', 'recordChoice']) expect(step0a).toContain(fn);
    expect(step0a).toMatch(/a new Epic, starting at DISCUSS/);
  });

  it('the backlog stays behind "something else"', () => {
    expect(step0a).toMatch(/behind "something else"/);
  });

  it('the pick is a human stop at EVERY attention setting, unattended included', () => {
    expect(step0a).toMatch(/human stop at EVERY attention setting, `unattended` included/);
  });
});

describe('AC6.1 — the ranking constants are gone', () => {
  it('advise.js exports neither RECOMMENDATION_LIMIT nor rankRows', () => {
    expect('RECOMMENDATION_LIMIT' in advise).toBe(false);
    expect('rankRows' in advise).toBe(false);
  });
});
