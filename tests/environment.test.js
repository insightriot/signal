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

  it('ignores prose containing an equals sign', () => {
    expect(findStatedValues('Set when count = 3 or more.\n')).toEqual([]);
  });

  it('ignores prose written with a colon, which the colon form must not eat', () => {
    // `NOTE: remember to rotate this` is prose; `API_KEY: sk-live-…` is not.
    // The colon form therefore requires a whitespace-free value.
    expect(findStatedValues('NOTE: remember to rotate this key every 90 days\n')).toEqual([]);
  });

  it('treats any bracketed form as a placeholder, so documentation examples pass', () => {
    expect(findStatedValues('DATABASE_URL=<value from 1Password>\n')).toEqual([]);
    expect(findStatedValues('API_KEY=[FILL IN — where the value lives]\n')).toEqual([]);
  });
});

describe('holes found by the CI reviewer on #195, each confirmed by running it', () => {
  // ⚠ ALL SIX PASSED THE FIRST SHIPPED VERSION. A full suite, three mutation
  // tests, and my own read of the code did not find one of them; the automated
  // PR review found them in the change that introduced them, and the findings
  // sat unread until the cross-model scoping pass went looking for evidence.
  // That is the measurement recorded in analysis/CROSS-MODEL-REVIEW-SCOPE.md.
  const F = '```';

  it('catches a .env paste inside a code fence — the motivating case, first waved through', () => {
    // The original skipped fences reasoning "an example belongs in a fence".
    // That inverted the threat model: a .env paste NORMALLY lands in a fence,
    // so the one shape the guard exists for was the one shape it ignored — and
    // a test shipped pinning that as intended behaviour. This test replaces it.
    const body = `${F}\nDATABASE_URL=postgres://admin:hunter2@db.internal:5432/app\n${F}\n`;
    expect(checkEnvironmentBody(body, { scrub: scrubSensitive }).ok).toBe(false);
  });

  it('is not disabled for the rest of the file by one unterminated fence', () => {
    // `inFence = !inFence` was a bare parity toggle with no reconciliation, so
    // an odd fence count silently switched detection off and still said ok.
    const body = `${F}\nsomething\n\nAPI_KEY=sk-live-abc123\n`;
    expect(checkEnvironmentBody(body, { scrub: scrubSensitive }).ok).toBe(false);
  });

  it('catches a blockquoted assignment — the shape the template itself primes', () => {
    // renderEnvironmentTemplate's own "Names, never values" box is written in
    // `>`-prefixed style, so an edit near it lands in exactly this form.
    expect(findStatedValues('> API_KEY=sk-live-abc123\n')).toHaveLength(1);
  });

  it('catches a bold key', () => {
    expect(findStatedValues('- **API_KEY** = sk-live-abc123\n')).toHaveLength(1);
  });

  it('catches a numbered-list assignment', () => {
    // The doc comment claimed to tolerate "a leading list marker"; it tolerated
    // only bullets, so the claim was wider than the code.
    expect(findStatedValues('1. API_KEY=sk-live-abc123\n')).toHaveLength(1);
  });

  it('catches the colon form', () => {
    expect(findStatedValues('API_KEY: sk-live-abc123\n')).toHaveLength(1);
  });

  it('catches them nested together', () => {
    expect(findStatedValues('> - `STRIPE_SECRET_KEY` = sk_live_51H8\n')).toHaveLength(1);
  });
});

describe('holes the CI reviewer found in the FIX for the holes above (#197)', () => {
  // Three more, all in the repair itself, all confirmed by execution. Worth its
  // own block: the first round is a story about one careless guard, and the
  // second round is the actual finding — that a focused fix, written by someone
  // who had just read the reviewer's report, introduced a regression, a bypass,
  // and a false positive that would have made the file unusable.

  it('catches an assignment on a CRLF line ending', () => {
    // Tightening the trailing match from \s* to [ \t]* stopped it eating the
    // line ending — and left a \r that made every pattern fail on a CRLF
    // checkout. A silent fail-open in a guard whose job is refusing secrets,
    // and this module was the repo's only .planning/ reader not normalising.
    expect(checkEnvironmentBody('API_KEY=sk-live-abc123\r\n').ok).toBe(false);
    expect(checkEnvironmentBody('API_KEY: sk-live-abc123\r\n').ok).toBe(false);
  });

  it('does not treat a bracketed secret as a placeholder', () => {
    // Widening PLACEHOLDER_RE to "any bracketed content" — to let
    // <value from 1Password> through — opened a bypass in the same change that
    // closed six holes. A placeholder is a phrase; a credential is one token.
    expect(checkEnvironmentBody('API_KEY=[sk_live_51H8abc]').ok).toBe(false);
    expect(checkEnvironmentBody('API_KEY=<sk_live_51H8abc>').ok).toBe(false);
    expect(checkEnvironmentBody('DATABASE_URL=<value from 1Password>').ok).toBe(true);
  });

  it('does not refuse the ordinary content this file exists to hold', () => {
    // The expensive direction. `KEY: single-word` matched, and because the
    // guard REFUSES the write, this made the file unusable for exactly what it
    // is for — and the template's own filled-in examples invite the shape.
    for (const line of [
      'SLACK: #eng-help',
      'STATUS: active',
      'NODE_ENV: production',
      'DEPLOY: Vercel',
    ]) {
      expect(checkEnvironmentBody(line).ok, `"${line}" was refused`).toBe(true);
    }
  });

  it('still catches a credential-shaped value in the colon form', () => {
    expect(checkEnvironmentBody('API_KEY: sk-live-abc123').ok).toBe(false);
  });

  it('documents the residual: a SHORT secret in colon form is missed', () => {
    // Stated as a known gap rather than left for someone to discover. The
    // length-plus-mixed-characters rule is what keeps the false positives out,
    // and it cannot also catch `PIN: 1234`. The equals form has no such floor.
    expect(checkEnvironmentBody('PIN: 1234').ok).toBe(true);
    expect(checkEnvironmentBody('PIN=1234').ok).toBe(false);
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
