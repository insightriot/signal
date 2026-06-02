import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readProfile } from '../tools/lib/profile.js';
import { readState } from '../tools/lib/state.js';

// Currency guard for the committed worked example (M4.5.E4).
//
// The example's .planning/ must stay on Signal's CURRENT schema so it never
// silently rots the way the gitignored .dogfood/ copy did (it missed the E6
// schema_version migration precisely because it was never tracked).
//
// Critically: readState does NOT throw on a legacy (pre-frontmatter) STATE.md —
// it returns { _schema: 'legacy' }. So a guard that only asserts "doesn't throw"
// would pass against a stale file and defeat its own purpose. Asserting
// `_schema === 1` is what actually catches schema drift.
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, '..', 'examples', 'url-shortener');

describe('examples/url-shortener stays on current Signal conventions', () => {
  it('PROFILE.md validates against the current profile schema', async () => {
    // readProfile throws ProfileSchemaError on any schema drift (bad tier,
    // schema_version !== 1, missing rigor_overrides, etc.).
    const profile = await readProfile(EXAMPLE_DIR);
    expect(profile.tier).toBe('FULL');
  });

  it('STATE.md is on schema_version 1 (not the legacy format)', async () => {
    const state = await readState(EXAMPLE_DIR);
    expect(state._schema).toBe(1); // legacy files return _schema: 'legacy' — would fail here
    expect(state.phase).toBe('SHIP');
  });
});
