import { describe, it, expect } from 'vitest';
import { estimateTokens, checkContextBudget } from '../tools/lib/context-monitor.js';

describe('Context Monitor', () => {
  describe('estimateTokens', () => {
    it('estimates ~1 token per 4 characters', () => {
      const text = 'a'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });

    it('rounds up for partial tokens', () => {
      const text = 'a'.repeat(5);
      expect(estimateTokens(text)).toBe(2);
    });

    it('handles empty strings', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('checkContextBudget', () => {
    const MAX_TOKENS = 200_000;

    it('returns ok when plenty of context remains', () => {
      const result = checkContextBudget(50_000, MAX_TOKENS);
      expect(result.status).toBe('ok');
      expect(result.percentRemaining).toBe(75);
    });

    it('warns at 35% remaining', () => {
      const used = MAX_TOKENS * 0.66; // 34% remaining
      const result = checkContextBudget(used, MAX_TOKENS);
      expect(result.status).toBe('warn');
    });

    it('goes critical at 25% remaining', () => {
      const used = MAX_TOKENS * 0.76; // 24% remaining
      const result = checkContextBudget(used, MAX_TOKENS);
      expect(result.status).toBe('critical');
    });

    it('supports custom thresholds', () => {
      const result = checkContextBudget(90_000, MAX_TOKENS, { warn: 0.50, critical: 0.40 });
      // 55% remaining, custom warn at 50% → should be ok
      expect(result.status).toBe('ok');
    });

    it('reports remaining tokens', () => {
      const result = checkContextBudget(50_000, MAX_TOKENS);
      expect(result.remaining).toBe(150_000);
    });
  });
});
