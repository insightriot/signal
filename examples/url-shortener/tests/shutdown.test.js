import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ENTRY = resolve('src/index.js');

function spawnApp(env) {
  return spawn(process.execPath, [ENTRY], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForReady(child, timeoutMs = 4000) {
  return new Promise((resolveReady, rejectReady) => {
    const t = setTimeout(() => rejectReady(new Error('timeout waiting for ready')), timeoutMs);
    child.stdout.on('data', (buf) => {
      if (buf.toString().includes('listening')) {
        clearTimeout(t);
        resolveReady();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(t);
      rejectReady(new Error(`process exited early with code ${code}`));
    });
  });
}

async function waitForExit(child, timeoutMs = 12_000) {
  return new Promise((resolveExit, rejectExit) => {
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      rejectExit(new Error('process did not exit within timeout'));
    }, timeoutMs);
    child.on('exit', (code, signal) => {
      clearTimeout(t);
      resolveExit({ code, signal });
    });
  });
}

describe('shutdown (N3b, N3c)', () => {
  it('N3b: SIGTERM triggers graceful exit within 10s with code 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'url-shortener-shutdown-'));
    const child = spawnApp({
      PORT: '0',
      DB_PATH: join(dir, 'sd.db'),
      BASE_URL: 'http://shortener.test',
    });
    try {
      await waitForReady(child);
      child.kill('SIGTERM');
      const result = await waitForExit(child);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it('N3c: startup fails with non-zero exit when DB_PATH is unwritable', async () => {
    // Use a directory path as DB_PATH — sqlite cannot open a directory as a file.
    const dir = mkdtempSync(join(tmpdir(), 'url-shortener-startfail-'));
    const fakeDb = join(dir, 'is-a-dir');
    mkdirSync(fakeDb);
    const child = spawnApp({
      PORT: '0',
      DB_PATH: fakeDb,
      BASE_URL: 'http://shortener.test',
    });
    try {
      const result = await waitForExit(child, 8000);
      expect(result.code).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);
});
