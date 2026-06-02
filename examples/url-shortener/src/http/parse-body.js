export const MAX_BODY_BYTES = 4096;

export class BodyTooLargeError extends Error {
  constructor() {
    super('request body exceeds 4 KB');
    this.name = 'BodyTooLargeError';
  }
}

export class BodyParseError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BodyParseError';
    this.reason = reason;
  }
}

export async function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    req.destroy();
    throw new BodyTooLargeError();
  }
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      req.destroy();
      throw new BodyTooLargeError();
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length === 0) {
    throw new BodyParseError('empty body');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new BodyParseError('body is not valid JSON');
  }
}
