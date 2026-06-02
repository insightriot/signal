import { validateUrl } from './validate.js';

export const MAX_RETRIES = 5;

export class ValidationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ValidationError';
    this.reason = reason;
  }
}

export function mintCode(longUrl, { storage, generateCode }) {
  const validation = validateUrl(longUrl);
  if (!validation.ok) {
    throw new ValidationError(validation.reason);
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateCode();
    const { inserted } = storage.put(code, validation.normalized);
    if (inserted) {
      return { code, longUrl: validation.normalized };
    }
  }
  throw new Error(`codegen exhausted retries (${MAX_RETRIES})`);
}
