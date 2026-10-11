// M6.E11 FR-10 — housekeeping (t7.1), AC-10.2.
// See .planning/M6.E11-REQUIREMENTS.md AC-10.2 and D-M6E11-14.
//
// The release notes, not only memory, carry the reminder that other projects
// move over through /sig:docs-migrate (step 5, not yet built).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('AC-10.2 — the 0.1.49 CHANGELOG entry named /sig:docs-migrate as the path for other projects', () => {
  // Written when 0.1.49 was the newest entry. 0.1.50 (M6.E15) built that path,
  // so the claim is pinned to the release that made it, not to "the newest".
  it('the 0.1.49 section mentions /sig:docs-migrate and that it was not built yet', () => {
    const text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const start = text.search(/^## \[0\.1\.49\]/m);
    expect(start).toBeGreaterThan(-1);
    const rest = text.slice(start + 1);
    const next = rest.search(/^## \[/m);
    const section = next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
    expect(section).toContain('/sig:docs-migrate');
    expect(section).toMatch(/not built yet/);
    expect(existsSync(join(ROOT, 'plugin', 'commands', 'docs-migrate.md'))).toBe(true);
  });
});
