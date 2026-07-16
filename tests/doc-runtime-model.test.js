import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODEL_DOC = join(ROOT, 'references', 'doc-runtime-model.md');

/**
 * Section-presence lint for the FR1 canonical doc-runtime model. The doc is the
 * provisional-canonical decision every downstream FR (FR2–FR7) references, so
 * the AC is that it *covers* the load-bearing concepts. This guards against the
 * doc silently losing a section, not against prose quality (that's a REVIEW job).
 */
describe('references/doc-runtime-model.md — section presence (FR1)', () => {
  let content;

  it('exists', () => {
    expect(existsSync(MODEL_DOC)).toBe(true);
  });

  it('is marked provisional-canonical', async () => {
    content = await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/provisional-canonical/i);
  });

  it('documents the two axes (load-frequency × growth-policy)', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/two axes/i);
    expect(content).toMatch(/load-frequency/i);
    expect(content).toMatch(/growth-policy/i);
    // the four growth-policy classes
    for (const cls of ['working-set', 'inbox', 'append-log', 'spine']) {
      expect(content).toContain(cls);
    }
  });

  it('states the unit-homed single-home destination rule', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/unit-homed single-home/i);
    // STATE-HISTORY.md is NOT a general destination
    expect(content).toContain('STATE-HISTORY.md');
  });

  it('documents the three bloat vectors', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/three bloat vectors/i);
    expect(content).toMatch(/frontmatter-list prose/i);
    expect(content).toMatch(/inlined legacy body/i);
    expect(content).toMatch(/body accretion/i);
  });

  it('specifies the ordered distill → verify-against-source → evict gate', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/distill/i);
    expect(content).toMatch(/verify-against-source/i);
    expect(content).toMatch(/coverage backstop/i);
    // the known blind spot must be named, not papered over
    expect(content).toMatch(/paraphrase distortion/i);
  });

  it('records the RETROSPECTIVE-as-SUMMARY-card decision', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/RETROSPECTIVE/);
    expect(content).toMatch(/single-home/i);
  });

  it('defers the tiered-index build and derived-vs-hand-curated INDEX call to E2', async () => {
    content ??= await readFile(MODEL_DOC, 'utf-8');
    expect(content).toMatch(/tiered/i);
    expect(content).toMatch(/hand-curated/i);
    expect(content).toMatch(/E2/);
  });
});
