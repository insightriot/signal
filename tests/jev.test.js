import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { askChoice, JEV_DEFAULT_MODEL, JEV_REASON, parseChoiceAnswer, resolveJevKey } from '../plugin/tools/lib/jev.js';

/**
 * M6.E3 t1.3 — the Jev client. Every test injects `fetchFn`; none touches the
 * network (AC8.7). The client never throws: it returns {ok:true, …} or
 * {ok:false, reason}, and the key never appears in anything it returns (AC8.4).
 */

const KEY = 'ts_live_SECRET_do_not_leak_123';
const QUESTION = {
  type: 'choice',
  instructions: 'How does this paragraph relate to the facts?',
  criteria: { supports: 'a', contradicts: 'b', says_nothing: 'c' },
};
const STATE = { paragraph: '**Nothing is in flight.**', facts: { phase: 'SHIP' } };

const ok = (body) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
const status = (code) => vi.fn().mockResolvedValue({ ok: false, status: code, json: async () => ({}) });

const DOC_SHAPE = {
  model: 'jev-1.13.0',
  answers: { q: { type: 'choice', choice: 'contradicts', probabilities: { contradicts: 1, supports: 0, says_nothing: 0 }, confidence: 0.99 } },
  usage: { input_tokens: 900, output_tokens: 0 },
};

function everyString(obj) {
  return JSON.stringify(obj);
}

describe('askChoice — the request (AC8.1)', () => {
  it('with no key it makes NO call and says why', async () => {
    const fetchFn = vi.fn();
    const r = await askChoice({ state: STATE, question: QUESTION, key: '', fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, reason: JEV_REASON.NO_KEY });
  });

  it('POSTs the documented shape with a bearer key and the pinned model', async () => {
    const fetchFn = ok(DOC_SHAPE);
    await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body);
    expect(body).toEqual({ state: STATE, model: JEV_DEFAULT_MODEL, questions: { q: QUESTION } });
    expect(init.signal).toBeDefined();
  });

  it('JEV default model is the measured one', () => {
    expect(JEV_DEFAULT_MODEL).toBe('jev-1.13.0');
  });
});

describe('askChoice — the answer', () => {
  it('parses the documented response shape', async () => {
    const r = await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: ok(DOC_SHAPE) });
    expect(r).toEqual({
      ok: true, choice: 'contradicts', confidence: 0.99,
      probabilities: { contradicts: 1, supports: 0, says_nothing: 0 }, model: 'jev-1.13.0',
    });
  });

  it('parses every stored answer in the spike dataset (fixture honesty — both shapes)', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const data = JSON.parse(readFileSync(join(root, 'analysis/jev-spike/labels-and-results.json'), 'utf8'));
    const choiceCases = data.cases.filter((c) => c.question?.type === 'choice');
    expect(choiceCases.length).toBeGreaterThan(0);
    for (const c of choiceCases) {
      for (const run of [c.run1, c.run2]) {
        const parsed = parseChoiceAnswer({ type: 'choice', ...run }, Object.keys(c.question.criteria));
        expect(parsed, `${c.set} ${c.id}`).not.toBeNull();
      }
    }
  });

  it.each([
    ['a choice outside the criteria', { ...DOC_SHAPE.answers.q, choice: 'maybe' }],
    ['a confidence outside 0..1', { ...DOC_SHAPE.answers.q, confidence: 7 }],
    ['a noul answer to a choice question', { type: 'noul', noul: 0.4 }],
  ])('rejects %s as bad-response', async (_l, answer) => {
    const r = await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: ok({ ...DOC_SHAPE, answers: { q: answer } }) });
    expect(r).toEqual({ ok: false, reason: JEV_REASON.BAD_RESPONSE });
  });
});

describe('askChoice — never throws; every failure has a named reason (AC8.2)', () => {
  it.each([
    [401, JEV_REASON.UNAUTHORIZED],
    [403, JEV_REASON.UNAUTHORIZED],
    [422, JEV_REASON.INVALID_REQUEST],
    [429, JEV_REASON.RATE_LIMITED],
    [529, JEV_REASON.OVERLOADED],
    [500, JEV_REASON.NETWORK],
  ])('HTTP %i → %s', async (code, reason) => {
    const r = await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: status(code) });
    expect(r).toEqual({ ok: false, reason });
  });

  it('a timeout → timeout', async () => {
    const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const r = await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: vi.fn().mockRejectedValue(err) });
    expect(r).toEqual({ ok: false, reason: JEV_REASON.TIMEOUT });
  });

  it('a network error → network', async () => {
    const r = await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
    expect(r).toEqual({ ok: false, reason: JEV_REASON.NETWORK });
  });

  it('a body that is not JSON → bad-response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
    expect(await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn })).toEqual({ ok: false, reason: JEV_REASON.BAD_RESPONSE });
  });
});

describe('the key never leaks (AC8.4)', () => {
  it('appears in no result, success or failure, even when the error echoes it', async () => {
    const echo = vi.fn().mockRejectedValue(new Error(`bad auth: Bearer ${KEY}`));
    const results = [
      await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: ok(DOC_SHAPE) }),
      await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: status(401) }),
      await askChoice({ state: STATE, question: QUESTION, key: KEY, fetchFn: echo }),
    ];
    for (const r of results) expect(everyString(r)).not.toContain(KEY);
  });

  it('reads TYPESAFE_API_KEY from the environment when no key is passed', async () => {
    const prev = process.env.TYPESAFE_API_KEY;
    process.env.TYPESAFE_API_KEY = KEY;
    try {
      const fetchFn = ok(DOC_SHAPE);
      await askChoice({ state: STATE, question: QUESTION, fetchFn });
      expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${KEY}`);
    } finally {
      if (prev === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = prev;
    }
  });
});

describe('resolveJevKey — the environment, then the project .env (D-M6E3-14)', () => {
  async function withEnvFile(content, fn) {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'sig-jevkey-'));
    try {
      if (content !== null) await writeFile(join(dir, '.env'), content);
      return await fn(dir);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  it('the environment wins over .env', () =>
    withEnvFile('TYPESAFE_API_KEY=from-file\n', (dir) => {
      expect(resolveJevKey(dir, { env: { TYPESAFE_API_KEY: 'from-env' } })).toBe('from-env');
    }));

  it.each([
    ['plain', 'TYPESAFE_API_KEY=apikey_abc\n', 'apikey_abc'],
    ['double-quoted', 'TYPESAFE_API_KEY="apikey_abc"\n', 'apikey_abc'],
    ['single-quoted', "TYPESAFE_API_KEY='apikey_abc'\n", 'apikey_abc'],
    ['export prefix', 'export TYPESAFE_API_KEY=apikey_abc\n', 'apikey_abc'],
    ['trailing comment', 'TYPESAFE_API_KEY=apikey_abc # mine\n', 'apikey_abc'],
    ['among other keys, CRLF', 'OTHER=1\r\nTYPESAFE_API_KEY=apikey_abc\r\n', 'apikey_abc'],
  ])('reads a %s line from .env', (_l, content, want) =>
    withEnvFile(content, (dir) => {
      expect(resolveJevKey(dir, { env: {} })).toBe(want);
    }));

  it.each([
    ['no .env', null],
    ['a commented-out line', '# TYPESAFE_API_KEY=apikey_abc\n'],
    ['an empty value', 'TYPESAFE_API_KEY=\n'],
    ['a different key', 'TYPESAFE_API_KEYS=apikey_abc\n'],
  ])('returns "" for %s', (_l, content) =>
    withEnvFile(content, (dir) => {
      expect(resolveJevKey(dir, { env: {} })).toBe('');
    }));

  it('SIGNAL_JEV_IGNORE_DOTENV skips the file (how the test suite stays off the network)', () =>
    withEnvFile('TYPESAFE_API_KEY=apikey_abc\n', (dir) => {
      expect(resolveJevKey(dir, { env: { SIGNAL_JEV_IGNORE_DOTENV: '1' } })).toBe('');
    }));
});
