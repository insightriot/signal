import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RIGOR_OVERRIDE_SCHEMA } from '../plugin/tools/lib/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA_DOC = join(ROOT, 'plugin/references/profile-schema.md');

/**
 * `references/profile-schema.md` must document every `rigor_overrides` key the
 * loader accepts.
 *
 * ⚠ THIS IS A PROMOTION, AND THE TRIGGER IS ON THE RECORD. "Keep the schema doc
 * current" was a convention, honoured by judgement, and it stopped being
 * honoured: `attention` was added to `RIGOR_OVERRIDE_SCHEMA` in `v0.1.31`, is
 * read by `attentionFor`, is spent by `/sig:drive` — and the reference document
 * went four releases still saying "all ten keys are required" while listing ten
 * that did not include it. The document every phase command points at for the
 * profile contract did not know the dial existed.
 *
 * The cost was not theoretical. Signal's own PROFILE.md therefore had no
 * `attention`, derived `attended` from `gate_strictness: strict`, and
 * `/sig:drive` stopped at every gate on this repository — which is
 * indistinguishable from the loop not working. Four consecutive Epics wrote a
 * per-Epic PROFILE.md at `light` to escape it rather than setting the dial,
 * because the dial was not in the document they were reading.
 *
 * Per CLAUDE.md § *House rules*: promote a rule when the advisory stops changing
 * behaviour. There was no advisory here at all — only a convention — and it
 * failed silently for four releases. That is the trigger, met.
 */
describe('profile-schema.md documents the rigor_overrides contract it claims to', () => {
  const doc = readFileSync(SCHEMA_DOC, 'utf8');
  const keys = Object.keys(RIGOR_OVERRIDE_SCHEMA);

  it('has keys to check (the export did not silently become empty)', () => {
    expect(keys.length).toBeGreaterThan(5);
    expect(keys).toContain('attention');
  });

  it.each(keys)('documents `%s` in a table row', (key) => {
    // A table row, not a passing mention: the key in backticks at the start of a
    // cell. A key named only in prose is how `gate_strictness` kept a
    // description that had been wrong since the attention split.
    const row = new RegExp(`^\\|\\s*\`${key}\`\\s*\\|`, 'm');
    expect(
      row.test(doc),
      `references/profile-schema.md has no table row for \`${key}\`.\n` +
        `Every key in RIGOR_OVERRIDE_SCHEMA must be documented there — the file is what ` +
        `/sig:calibrate and every phase command point at for the profile contract.`,
    ).toBe(true);
  });

  it('marks the optional keys optional, so a reader can tell required from not', () => {
    const optional = keys.filter((k) => RIGOR_OVERRIDE_SCHEMA[k].optional);
    // Currently exactly one; asserted as a count so adding a second without
    // documenting its optionality fails here rather than misleading a reader.
    expect(optional).toEqual(['attention']);
    expect(doc).toMatch(/`attention`[^\n]*\boptional\b|\boptional\b[^\n]*`attention`/i);
  });

  it('no longer claims a key count that excludes the optional key', () => {
    // The literal sentence that was wrong for four releases.
    expect(doc).not.toMatch(/All ten keys are required\./);
  });
});
