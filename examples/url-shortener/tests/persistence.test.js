import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../src/storage.js';
import { buildServer } from '../src/server.js';

async function startListening(s) {
  return new Promise((resolve) => {
    s.listen(0, '127.0.0.1', () => resolve(s.address().port));
  });
}

async function stopListening(s) {
  return new Promise((resolve) => s.close(resolve));
}

describe('persistence across restart (F3 full HTTP round-trip)', () => {
  it('a code minted before close + reopen still resolves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'url-shortener-persist-'));
    const dbPath = join(dir, 'persist.db');

    // Round 1 — start, mint, stop.
    const storage1 = openStorage(dbPath);
    const server1 = buildServer({ storage: storage1, baseUrl: 'http://shortener.test', version: '0.1.0', log: () => {} });
    const port1 = await startListening(server1);
    const create = await fetch(`http://127.0.0.1:${port1}/shorten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://restart-survives.example/p' }),
    });
    expect(create.status).toBe(201);
    const { code } = await create.json();
    await stopListening(server1);
    storage1.close();

    // Round 2 — open same DB, start fresh server, GET /:code → 302.
    const storage2 = openStorage(dbPath);
    const server2 = buildServer({ storage: storage2, baseUrl: 'http://shortener.test', version: '0.1.0', log: () => {} });
    const port2 = await startListening(server2);
    const res = await fetch(`http://127.0.0.1:${port2}/${code}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://restart-survives.example/p');
    await stopListening(server2);
    storage2.close();

    rmSync(dir, { recursive: true, force: true });
  });
});
