import { describe, it, expect } from 'vitest';
import { mintCode, ValidationError } from '../src/service.js';

function makeStubStorage(seenCodes = new Set()) {
  return {
    put(code, longUrl) {
      if (seenCodes.has(code)) return { inserted: false };
      seenCodes.add(code);
      return { inserted: true };
    },
    get(code) {
      return seenCodes.has(code) ? { longUrl: 'stub' } : null;
    },
  };
}

describe('mintCode', () => {
  it('happy path: validates URL, generates code, persists, returns shape', () => {
    const storage = makeStubStorage();
    const result = mintCode('https://example.com', {
      storage,
      generateCode: () => 'aBcDeF1',
    });
    expect(result).toEqual({ code: 'aBcDeF1', longUrl: 'https://example.com/' });
  });

  it('retries on collision and returns the unique code', () => {
    const seen = new Set(['COLLIDE']);
    const storage = makeStubStorage(seen);
    let calls = 0;
    const generateCode = () => {
      calls += 1;
      return calls === 1 ? 'COLLIDE' : 'UNIQUE1';
    };
    const result = mintCode('https://example.com', { storage, generateCode });
    expect(result.code).toBe('UNIQUE1');
    expect(calls).toBe(2);
  });

  it('throws after 5 retries if codegen never returns a unique code', () => {
    const seen = new Set(['STUCK']);
    const storage = makeStubStorage(seen);
    expect(() => {
      mintCode('https://example.com', { storage, generateCode: () => 'STUCK' });
    }).toThrow(/exhausted/);
  });

  it('throws ValidationError on invalid URL', () => {
    const storage = makeStubStorage();
    expect(() => {
      mintCode('javascript:alert(1)', { storage, generateCode: () => 'aBcDeF1' });
    }).toThrow(ValidationError);
  });
});
