import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../src/storage.js';

let dir;
let dbPath;
let storage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'url-shortener-storage-'));
  dbPath = join(dir, 'test.db');
  storage = openStorage(dbPath);
});

afterEach(() => {
  storage?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('storage', () => {
  it('put new code returns inserted=true', () => {
    expect(storage.put('aBcDeF1', 'https://example.com')).toEqual({ inserted: true });
  });

  it('put existing code returns inserted=false (no overwrite)', () => {
    storage.put('aBcDeF1', 'https://example.com');
    expect(storage.put('aBcDeF1', 'https://other.com')).toEqual({ inserted: false });
    expect(storage.get('aBcDeF1')).toEqual({ longUrl: 'https://example.com' });
  });

  it('get returns the stored long URL', () => {
    storage.put('xYz1234', 'https://example.com/path?q=1');
    expect(storage.get('xYz1234')).toEqual({ longUrl: 'https://example.com/path?q=1' });
  });

  it('get returns null for unknown code', () => {
    expect(storage.get('zzzzzzz')).toBeNull();
  });

  it('persists across close + reopen (F3)', () => {
    storage.put('persist', 'https://persist.example');
    storage.close();
    storage = openStorage(dbPath);
    expect(storage.get('persist')).toEqual({ longUrl: 'https://persist.example' });
  });
});
