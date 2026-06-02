import { describe, it, expect } from 'vitest';
import { generateCode, ALPHABET, CODE_LENGTH } from '../src/codegen.js';

describe('codegen', () => {
  it('returns a 7-char string', () => {
    expect(generateCode()).toHaveLength(CODE_LENGTH);
    expect(CODE_LENGTH).toBe(7);
  });

  it('uses only alphabet characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      for (const ch of code) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  it('produces near-unique values across 1000 calls', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) {
      set.add(generateCode());
    }
    // 1000 codes from a 62^7 keyspace — collisions are vanishingly unlikely
    expect(set.size).toBeGreaterThanOrEqual(999);
  });
});
