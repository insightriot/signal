import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugin');
const HOOK = join(PLUGIN, 'hooks', 'session-start.sh');

// The hook's command list was hand-kept and named 9 of 24 commands by v0.1.53.
describe('session-start hook — the command list', () => {
  it('names every command in plugin/commands, and nothing else', () => {
    const r = spawnSync('bash', [HOOK], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN },
    });
    expect(r.status).toBe(0);
    const line = r.stdout.split('\n').find((l) => l.startsWith('[signal] Plugin loaded. Commands: '));
    const listed = line.replace('[signal] Plugin loaded. Commands: ', '').split(', ').sort();
    const onDisk = readdirSync(join(PLUGIN, 'commands'))
      .filter((n) => n.endsWith('.md'))
      .map((n) => `/sig:${n.slice(0, -3)}`)
      .sort();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(listed).toEqual(onDisk);
  });
});
