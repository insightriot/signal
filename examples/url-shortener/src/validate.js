export const MAX_URL_LENGTH = 2083;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function validateUrl(input) {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'url must be a string' };
  }
  if (input.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `url length exceeds ${MAX_URL_LENGTH} chars` };
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: 'url is invalid or unparseable' };
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `scheme not allowed (only http/https)` };
  }
  return { ok: true, normalized: parsed.toString() };
}
