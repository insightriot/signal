// `.planning/ENVIRONMENT.md` — the template and the names-never-values guard.
//
// The load-bearing assertions here are the ones proving the guard catches what
// the APPROVED instruction would have missed. `BACKLOG.md` said to reuse
// `/sig:add`'s scrub; these tests pin that the scrub alone passes a pasted
// `.env` line, which is why the guard is value-shaped instead.

import { describe, expect, it } from 'vitest';

import { scrubSensitive } from '../plugin/tools/lib/add.js';
import {
  checkEnvironmentBody,
  environmentPath,
  findStatedValues,
  renderEnvironmentTemplate,
} from '../plugin/tools/lib/environment.js';

describe('the approved instruction was not enough', () => {
  it("/sig:add's scrub passes a pasted .env line — the realistic failure", () => {
    // Not a criticism of scrubSensitive, which is secret-shaped by design. It
    // is the evidence that reusing it unchanged here would have shipped a guard
    // that misses the one shape this file actually goes wrong in.
    const env = 'DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app\nAPI_KEY=sk-live-abc123\n';
    expect(scrubSensitive(env).hits).toEqual([]);

    const guarded = checkEnvironmentBody(env);
    expect(guarded.ok).toBe(false);
    expect(guarded.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('does not fire on a git SHA, which the scrub would have flagged', () => {
    // hex-blob-40 matches every commit sha. A commit reference is legitimate
    // content in a project note, so it is dropped from the second pass.
    const sha = 'aafd5f52e54e30a06c7a55d273a2a65dc20d84d9';
    expect(scrubSensitive(sha).hits.map((h) => h.type)).toContain('hex-blob-40');
    expect(checkEnvironmentBody(`Pinned at ${sha}.`, { scrub: scrubSensitive }).ok).toBe(true);
  });

  it('still catches a bare secret token, which is not an assignment', () => {
    // The value-shaped guard would miss this on its own — hence both passes.
    const body = 'Token for the sandbox: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';
    expect(findStatedValues(body)).toEqual([]);
    expect(checkEnvironmentBody(body, { scrub: scrubSensitive }).ok).toBe(false);
  });
});

describe('what counts as stating a value', () => {
  it('accepts a bare list of names', () => {
    const body = '## Configuration variable names\n\n- `DATABASE_URL`\n- `STRIPE_SECRET_KEY`\n';
    expect(checkEnvironmentBody(body).ok).toBe(true);
  });

  it('accepts placeholders, so the shipped template passes its own guard', () => {
    expect(checkEnvironmentBody(renderEnvironmentTemplate()).ok).toBe(true);
    expect(checkEnvironmentBody(renderEnvironmentTemplate(), { scrub: scrubSensitive }).ok).toBe(true);
  });

  it('catches an assignment written as a markdown list item', () => {
    const hits = findStatedValues('- `STRIPE_SECRET_KEY` = sk_live_51H8xyz\n');
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('assignment');
  });

  it('catches a credentialed URL written as prose', () => {
    const hits = findStatedValues('Connect with mysql://root:letmein@10.0.0.4/prod for now.\n');
    expect(hits.map((h) => h.kind)).toContain('credentialed-url');
  });

  it('ignores fenced code, where an example belongs', () => {
    expect(findStatedValues('```\nDATABASE_URL=postgres://u:p@h/db\n```\n')).toEqual([]);
  });

  it('ignores prose containing an equals sign', () => {
    expect(findStatedValues('Set when count = 3 or more.\n')).toEqual([]);
  });
});

describe('the refusal', () => {
  it('never echoes the value back', () => {
    // The error message is another surface the secret can be read from — a
    // terminal, a transcript, a CI log.
    const r = checkEnvironmentBody('AWS_SECRET=wJalrXUtnFEMIK7MDENGbPxRfiCY\n');
    expect(r.ok).toBe(false);
    expect(r.reason).not.toContain('wJalrXUtnFEMIK7MDENGbPxRfiCY');
    expect(r.reason).toContain('<redacted, 28 chars>');
  });

  it('says nothing was written, because nothing was', () => {
    const r = checkEnvironmentBody('API_KEY=abc123\n');
    expect(r.reason).toMatch(/nothing was written/i);
  });

  it('names the line so the fix is findable', () => {
    const r = checkEnvironmentBody('# Environment\n\nAPI_KEY=abc123\n');
    expect(r.violations[0].line).toBe(3);
    expect(r.reason).toMatch(/line 3/);
  });
});

describe('the template', () => {
  it('states the names-never-values rule inside the file itself', () => {
    // Not only in the command that writes it — the file is hand-edited long
    // after any command ran, and users' repos are public too.
    const t = renderEnvironmentTemplate();
    expect(t).toMatch(/names, never values/i);
    expect(t).toMatch(/this file is committed/i);
  });

  it('says the write-path check cannot see a hand-edit', () => {
    expect(renderEnvironmentTemplate()).toMatch(/cannot see a hand-edit/i);
  });

  it('leaves every section as a FILL IN stub rather than omitting it', () => {
    // An unanswered section must read as unanswered, not absent (B39), and
    // /sig:sweep already reports unfilled [FILL IN] markers.
    const t = renderEnvironmentTemplate();
    for (const heading of [
      'External services',
      'Configuration variable names',
      'Test accounts',
      'Deploy targets',
      'Support and escalation',
      'What an agent should NOT touch',
    ]) {
      expect(t).toContain(heading);
    }
    expect((t.match(/\[FILL IN/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('carries the project name and date when given them', () => {
    const t = renderEnvironmentTemplate({ projectName: 'Signal', today: '2026-08-22' });
    expect(t).toContain('**Project:** Signal');
    expect(t).toContain('**Last updated:** 2026-08-22');
  });

  it('lands at .planning/ENVIRONMENT.md', () => {
    expect(environmentPath('/tmp/proj')).toBe('/tmp/proj/.planning/ENVIRONMENT.md');
  });
});
