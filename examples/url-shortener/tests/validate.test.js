import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/validate.js';

describe('validateUrl', () => {
  describe('accepts', () => {
    it('plain http URL', () => {
      const r = validateUrl('http://example.com');
      expect(r.ok).toBe(true);
      expect(r.normalized).toBe('http://example.com/');
    });

    it('https URL with path + query', () => {
      const r = validateUrl('https://example.com/a/b?c=1&d=2');
      expect(r.ok).toBe(true);
      expect(r.normalized).toBe('https://example.com/a/b?c=1&d=2');
    });
  });

  describe('rejects (F5 — each row maps to a test)', () => {
    it('F5c: non-string input', () => {
      expect(validateUrl(123).ok).toBe(false);
      expect(validateUrl(null).ok).toBe(false);
      expect(validateUrl(undefined).ok).toBe(false);
    });

    it('F5d: javascript: scheme', () => {
      const r = validateUrl('javascript:alert(1)');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/scheme/i);
    });

    it('F5e: file: scheme', () => {
      const r = validateUrl('file:///etc/passwd');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/scheme/i);
    });

    it('rejects data: scheme', () => {
      const r = validateUrl('data:text/plain,hello');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/scheme/i);
    });

    it('F5f: unparseable input', () => {
      const r = validateUrl('not-a-url');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/parse|invalid/i);
    });

    it('F5g: URL longer than 2,083 chars', () => {
      const long = 'https://example.com/' + 'a'.repeat(2100);
      const r = validateUrl(long);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/length|long/i);
    });
  });
});
