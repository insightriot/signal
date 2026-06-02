import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../src/storage.js';
import { buildServer } from '../src/server.js';

let dir;
let dbPath;
let storage;
let server;
let baseUrl;

async function startListening(s) {
  return new Promise((resolve) => {
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function stopListening(s) {
  return new Promise((resolve) => s.close(resolve));
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'url-shortener-server-'));
  dbPath = join(dir, 'test.db');
  storage = openStorage(dbPath);
  server = buildServer({ storage, baseUrl: 'http://shortener.test', version: '0.1.0', log: () => {} });
  baseUrl = await startListening(server);
});

afterEach(async () => {
  await stopListening(server);
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

async function postShorten(body, headers = { 'content-type': 'application/json' }) {
  return fetch(`${baseUrl}/shorten`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /shorten (F1, F5)', () => {
  it('F1: returns 201 + JSON body with 7-char code and shortUrl', async () => {
    const res = await postShorten({ url: 'https://example.com/path' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(body.shortUrl).toBe(`http://shortener.test/${body.code}`);
  });

  it('F5a: empty body → 400', async () => {
    const res = await postShorten('');
    expect(res.status).toBe(400);
  });

  it('F5b: missing url field → 400', async () => {
    const res = await postShorten({});
    expect(res.status).toBe(400);
  });

  it('F5c: url not a string → 400', async () => {
    const res = await postShorten({ url: 123 });
    expect(res.status).toBe(400);
  });

  it('F5d: javascript: scheme → 400', async () => {
    const res = await postShorten({ url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('F5e: file: scheme → 400', async () => {
    const res = await postShorten({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('F5f: unparseable url → 400', async () => {
    const res = await postShorten({ url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('F5g: url longer than 2,083 chars → 400', async () => {
    const long = 'https://example.com/' + 'a'.repeat(2100);
    const res = await postShorten({ url: long });
    expect(res.status).toBe(400);
  });

  it('rejects non-JSON content-type → 400', async () => {
    const res = await fetch(`${baseUrl}/shorten`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'plain text',
    });
    expect(res.status).toBe(400);
  });

  it('400 response sets X-Content-Type-Options + Cache-Control (N1d)', async () => {
    const res = await postShorten({ url: 'not-a-url' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects oversized body — either 413 or socket-destroy (REVIEW hardening)', async () => {
    // Send a 5 KB body. Either the pre-check (Content-Length > 4 KB) or the
    // streaming cap rejects it. Both paths call req.destroy(), which can
    // surface to fetch as either a 413 response or a SocketError, depending
    // on timing. The test accepts either: what matters is that the server
    // does NOT process the request.
    const big = JSON.stringify({ url: 'https://example.com/' + 'a'.repeat(5000) });
    let status = null;
    let threw = false;
    try {
      const res = await fetch(`${baseUrl}/shorten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: big,
      });
      status = res.status;
    } catch {
      threw = true;
    }
    expect(threw || status === 413).toBe(true);
  });
});

describe('GET /:code (F2)', () => {
  it('F2: returns 302 with Location for known code', async () => {
    const create = await postShorten({ url: 'https://target.example/page' });
    const { code } = await create.json();
    const res = await fetch(`${baseUrl}/${code}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://target.example/page');
  });

  it('F2: returns 404 for unknown code', async () => {
    const res = await fetch(`${baseUrl}/zzzzzzz`, { redirect: 'manual' });
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 404 for paths that do not match the 7-char code shape', async () => {
    const res = await fetch(`${baseUrl}/short`, { redirect: 'manual' });
    expect(res.status).toBe(404);
  });
});

describe('GET /healthz (F6)', () => {
  it('F6: returns 200 + JSON {status, version}', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', version: '0.1.0' });
  });
});
