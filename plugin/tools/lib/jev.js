// tools/lib/jev.js — M6.E3 t1.3: the client for TypeSafe's Jev.
//
// Jev answers narrow typed questions — here, one pick-one question — and says
// how sure it is. Signal uses it only where code cannot decide from tokens
// (M6.E3 FR9: does this STATE.md paragraph contradict the facts?).
//
// Shape copied from `doctor.js#fetchLatestTag`: `fetch` is injected, so tests
// never touch the network (AC8.7), and every failure returns a named reason
// instead of throwing — a caller must be able to say "the Jev check did not
// run, and why" (AC8.2), because a check that silently did not run reads the
// same as a check that found nothing.
//
// On when `TYPESAFE_API_KEY` is set, in the environment or the project's `.env`
// (`D-M6E3-12`, `D-M6E3-14`; see `resolveJevKey`). The key goes into one
// header and nowhere else: never into a returned object, a reason or an error
// message (AC8.4).
//
// Listed in tools/audit-network-calls.js KNOWN_CALLS and in README.md →
// *Privacy & telemetry*.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// The model the M6.E3 measurement ran on (`D-M6E3-13`). Overridable with
// TYPESAFE_MODEL; the response's own `model` is what callers display.
export const JEV_DEFAULT_MODEL = 'jev-1.13.0';

export const JEV_DEFAULT_TIMEOUT_MS = 5000;

export const JEV_REASON = Object.freeze({
  NO_KEY: 'no-key',
  UNAUTHORIZED: 'unauthorized',
  INVALID_REQUEST: 'invalid-request',
  RATE_LIMITED: 'rate-limited',
  OVERLOADED: 'overloaded',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  BAD_RESPONSE: 'bad-response',
});

const QUESTION_ID = 'q';

const DOTENV_KEY_RE = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/;

/**
 * The key: `TYPESAFE_API_KEY` from the environment, else from the project's
 * `.env` (`D-M6E3-14` — that is where Brett keeps it, and a key the CLI never
 * sees makes the check look broken rather than off). Returns '' when neither has
 * one. Reads the file and nothing else: no other variable is loaded into the
 * process.
 *
 * `SIGNAL_JEV_IGNORE_DOTENV` skips the file; the test suite sets it, so no test
 * can pick up a real key from this repository's own `.env` (AC8.7).
 */
export function resolveJevKey(baseDir, { env = process.env } = {}) {
  const fromEnv = env.TYPESAFE_API_KEY;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  if (env.SIGNAL_JEV_IGNORE_DOTENV) return '';
  let raw;
  try {
    raw = readFileSync(join(baseDir, '.env'), 'utf8');
  } catch {
    return '';
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(DOTENV_KEY_RE);
    if (!m) continue;
    let value = m[1];
    const quoted = value.match(/^(['"])(.*)\1$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
    return value.trim();
  }
  return '';
}

function reasonForStatus(status) {
  if (status === 401 || status === 403) return JEV_REASON.UNAUTHORIZED;
  if (status === 422 || status === 400) return JEV_REASON.INVALID_REQUEST;
  if (status === 429) return JEV_REASON.RATE_LIMITED;
  if (status === 529 || status === 503) return JEV_REASON.OVERLOADED;
  return JEV_REASON.NETWORK;
}

const isUnit = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * Validate one choice answer against the options that were asked. Returns
 * `{choice, confidence, probabilities}` or null. Exported so the stored spike
 * answers can be checked against the same parser the live path uses.
 */
export function parseChoiceAnswer(answer, options) {
  if (!answer || answer.type !== 'choice') return null;
  if (typeof answer.choice !== 'string' || !options.includes(answer.choice)) return null;
  if (!isUnit(answer.confidence)) return null;
  const probabilities = answer.probabilities;
  if (!probabilities || typeof probabilities !== 'object') return null;
  for (const [k, v] of Object.entries(probabilities)) {
    if (!options.includes(k) || !isUnit(v)) return null;
  }
  return { choice: answer.choice, confidence: answer.confidence, probabilities: { ...probabilities } };
}

/**
 * Ask Jev one choice question about `state`. One request, one attempt — a 429
 * is reported, not retried.
 *
 * @param {{
 *   state: unknown,
 *   question: {type: 'choice', instructions: unknown, criteria: Record<string, unknown>},
 *   key?: string,
 *   model?: string,
 *   timeoutMs?: number,
 *   fetchFn?: typeof fetch,
 * }} args
 * @returns {Promise<{ok: true, choice: string, confidence: number, probabilities: object, model: string}
 *   | {ok: false, reason: string}>}
 */
export async function askChoice({
  state,
  question,
  key = process.env.TYPESAFE_API_KEY,
  model = process.env.TYPESAFE_MODEL || JEV_DEFAULT_MODEL,
  timeoutMs = JEV_DEFAULT_TIMEOUT_MS,
  fetchFn = fetch,
} = {}) {
  if (typeof key !== 'string' || key.trim() === '') return { ok: false, reason: JEV_REASON.NO_KEY };

  let res;
  try {
    res = await fetchFn(JEV_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model, questions: { [QUESTION_ID]: question } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // The error object is dropped, never echoed: some stacks print the request.
    return { ok: false, reason: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? JEV_REASON.TIMEOUT : JEV_REASON.NETWORK };
  }

  if (!res || !res.ok) return { ok: false, reason: reasonForStatus(res?.status) };

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: JEV_REASON.BAD_RESPONSE };
  }

  const parsed = parseChoiceAnswer(body?.answers?.[QUESTION_ID], Object.keys(question?.criteria ?? {}));
  if (!parsed) return { ok: false, reason: JEV_REASON.BAD_RESPONSE };
  return { ok: true, ...parsed, model: typeof body.model === 'string' ? body.model : model };
}
