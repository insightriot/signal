import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * README content smoke tests — guard against stale install instructions
 * (M4.5.E1.S1 patches the install section after the M4.t19 slug rename).
 */

describe('README.md — install section content', () => {
  it('contains marketplace add command line', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toMatch(/\/plugin\s+marketplace\s+add\s+insightriot\/signal/i);
  });

  it('contains /plugin install sig@signal command (post-M4.t19 form)', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toMatch(/\/plugin\s+install\s+sig@signal/);
  });

  it('contains CLAUDE_CODE_PLUGIN_PREFER_HTTPS troubleshooting reference', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toContain('CLAUDE_CODE_PLUGIN_PREFER_HTTPS');
  });

  it('does not contain stale bare-slug "/plugin install signal" line (pre-M4.t19)', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf-8');
    // The bare-slug form (`/plugin install signal` followed by whitespace/EOL,
    // NOT `signal@signal` or `signal/...`) was the pre-rename pattern.
    expect(readme).not.toMatch(/\/plugin\s+install\s+signal\s*$/m);
  });
});
