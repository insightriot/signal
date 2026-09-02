import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkOrphanDocs, ORPHAN_ENTRY_POINTS } from '../plugin/tools/lib/doc-hygiene.js';

const SCOPE = { dirs: ['docs'], topFiles: [] };

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-orphan-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (rel, body) => writeFile(join(dir, rel), body);

describe('checkOrphanDocs — the inbound direction', () => {
  it('is silent when every document is linked', async () => {
    await write('docs/a.md', 'see [b](b.md)');
    await write('docs/b.md', 'see [a](a.md)');
    expect(checkOrphanDocs(dir, SCOPE)).toEqual([]);
  });

  it('flags a document nothing links to or mentions', async () => {
    await write('docs/a.md', 'nothing here');
    await write('docs/lonely.md', 'nobody points at me');
    const f = checkOrphanDocs(dir, SCOPE);
    const files = f.map((x) => x.file);
    expect(files).toContain('docs/lonely.md');
    expect(f.find((x) => x.file === 'docs/lonely.md').message).toMatch(/nothing links to or mentions/);
  });

  it('DISTINGUISHES a bare-path mention from a real absence', async () => {
    // The distinction is the point: "everybody mentions it in a form nothing can
    // check" is a different problem from "nobody mentions it".
    await write('docs/a.md', 'read `docs/mentioned.md` before starting');
    await write('docs/mentioned.md', 'body');
    const f = checkOrphanDocs(dir, SCOPE);
    const hit = f.find((x) => x.file === 'docs/mentioned.md');
    expect(hit).toBeTruthy();
    expect(hit.message).toMatch(/bare path in backticks/);
    expect(hit.message).not.toMatch(/nothing links to or mentions/);
  });

  it('counts bare mentions even when stripCode is on (they live inside backticks)', async () => {
    // Regression: stripCodeSpans removes exactly the backticks this scan needs,
    // so mentions must be collected BEFORE the strip. Collected after, this
    // reported every such file as a total absence.
    await write('docs/a.md', 'see `docs/m.md` and `docs/m.md`');
    await write('docs/m.md', 'body');
    const f = checkOrphanDocs(dir, { ...SCOPE, stripCode: true });
    expect(f.find((x) => x.file === 'docs/m.md').message).toMatch(/2 time\(s\)/);
  });

  it('a real link beats a bare mention — linked files are never flagged', async () => {
    await write('docs/a.md', 'both `docs/b.md` and [b](b.md)');
    await write('docs/b.md', 'body');
    expect(checkOrphanDocs(dir, SCOPE).map((x) => x.file)).not.toContain('docs/b.md');
  });

  it('resolves links relative to the LINKING file, not the project root', async () => {
    await mkdir(join(dir, 'docs/sub'), { recursive: true });
    await write('docs/sub/child.md', 'body');
    await write('docs/a.md', 'see [child](sub/child.md)');
    expect(checkOrphanDocs(dir, SCOPE).map((x) => x.file)).not.toContain('docs/sub/child.md');
  });

  it('never flags an entry point — a file opened by name is not an orphan', async () => {
    await write('docs/STATE.md', 'state');
    await write('docs/M6.E5-PLAN.md', 'plan');
    await write('docs/MILESTONE-9.md', 'milestone');
    expect(checkOrphanDocs(dir, SCOPE)).toEqual([]);
  });

  it('returns nothing on an empty scope rather than throwing', () => {
    expect(checkOrphanDocs(dir, { dirs: ['nope'], topFiles: [] })).toEqual([]);
  });

  it('reports TRUNCATION as a coverage gap, never as a clean result', async () => {
    // B39 / B15: a file over the 1 MB scan cap has its tail unread, so an inbound
    // link living in that tail is invisible and its target looks orphaned. A clean
    // orphan list computed from a partial read is a false all-clear, so the gap is
    // reported rather than swallowed.
    const filler = 'x'.repeat(1024 * 1024 + 16);
    await write('docs/huge.md', `${filler}\n[a](a.md)\n`);
    await write('docs/a.md', 'body');
    const f = checkOrphanDocs(dir, SCOPE);
    const gap = f.find((x) => x.file === '(scope)');
    expect(gap, 'a truncated file must surface as a coverage gap').toBeTruthy();
    expect(gap.message).toMatch(/INCOMPLETE/);
    // And the proof the gap is not academic: a.md's ONLY inbound link was in the
    // unread tail, so it is now reported as an orphan it is not.
    expect(f.map((x) => x.file)).toContain('docs/a.md');
  });
});

describe('the entry-point list is the honest weak point, so it is pinned', () => {
  it('covers the per-unit artifact families by pattern, not by enumeration', () => {
    const pats = ORPHAN_ENTRY_POINTS.filter((e) => e instanceof RegExp);
    expect(pats.length).toBeGreaterThan(0);
    for (const name of ['M6.E5-PLAN.md', 'M5.E10-VERIFICATION.md', 'X-RETROSPECTIVE.md']) {
      expect(pats.some((re) => re.test(name)), `${name} should be an entry point`).toBe(true);
    }
  });

  it('does NOT exempt an ordinary analysis document', () => {
    const matches = (n) =>
      ORPHAN_ENTRY_POINTS.some((e) => (e instanceof RegExp ? e.test(n) : e === n));
    expect(matches('LOOP-GOAL-DIRECTION.md')).toBe(false);
    expect(matches('OPENKB-ASSESSMENT.md')).toBe(false);
  });
});
