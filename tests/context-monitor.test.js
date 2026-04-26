import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estimateTokens,
  checkContextBudget,
  findSkillPath,
  estimatePhaseSkillCost,
} from '../tools/lib/context-monitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

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

  describe('findSkillPath', () => {
    it('finds a skill in its native directory', () => {
      const path = findSkillPath(PLUGIN_ROOT, 'planning-and-task-breakdown');
      expect(path).toMatch(/skills\/plan\/planning-and-task-breakdown\/SKILL\.md$/);
    });

    it('finds a skill that lives in a directory other than its bound phase', () => {
      // api-and-interface-design is bound to `plan` but lives in `skills/build/`.
      const path = findSkillPath(PLUGIN_ROOT, 'api-and-interface-design');
      expect(path).toMatch(/skills\/build\/api-and-interface-design\/SKILL\.md$/);
    });

    it('returns null for unknown skills', () => {
      expect(findSkillPath(PLUGIN_ROOT, 'no-such-skill-xyz')).toBeNull();
    });
  });

  describe('estimatePhaseSkillCost', () => {
    it('finds cross-directory skills (plan binding includes a build/-resident skill)', async () => {
      const bindings = {
        plan: ['planning-and-task-breakdown', 'api-and-interface-design'],
      };
      const result = await estimatePhaseSkillCost(PLUGIN_ROOT, 'plan', bindings);
      expect(result.skills).toHaveLength(2);
      for (const s of result.skills) {
        expect(s.found).toBe(true);
        expect(s.tokens).toBeGreaterThan(0);
      }
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('marks unfound skills with found: false', async () => {
      const bindings = { plan: ['no-such-skill-xyz'] };
      const result = await estimatePhaseSkillCost(PLUGIN_ROOT, 'plan', bindings);
      expect(result.skills[0].found).toBe(false);
      expect(result.skills[0].tokens).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('returns empty result for unknown phase', async () => {
      const result = await estimatePhaseSkillCost(PLUGIN_ROOT, 'no-such-phase', {});
      expect(result.skills).toEqual([]);
      expect(result.totalTokens).toBe(0);
    });
  });
});
