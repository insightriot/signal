// tests/doc-hygiene-scope.test.js — M5.E6.T1 (FR1/FR2).
//
// The additive-parameterization surface of doc-hygiene.js that `/sig:sweep`
// consumes: scan-scope opts on listDocFiles/checkInternalLinks/checkFillInStubs
// plus a `stripCode` opt that removes code spans/fences before dead-link
// scanning. New file — the standing guard's own suite (docs-hygiene.test.js)
// stays byte-identical and is NOT touched here (AD2).
//
// RED-first (strict Nyquist): the discriminating assertions — a `.planning/`
// dead link surfacing under a widened scope (AC1.2) and a code-quoted
// `](path.md)` NOT surfacing under `stripCode` (AC2.7) — fail against `main`,
// where the new opts are ignored.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { checkInternalLinks, checkFillInStubs } from '../tools/lib/doc-hygiene.js';

// WALK_IGNORE with `.planning` removed but `archive` retained — the exact set
// `/sig:sweep` passes so its scan includes `.planning/` yet still exempts
// `.planning/archive/**` (mirrors migrate's R7 historical exemption).
const SWEEP_WALK_IGNORE = new Set(['.claude', 'node_modules', 'examples', 'archive', '.git']);

async function writeDoc(dir, rel, body) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body, 'utf-8');
}

const hard = (findings) => findings.filter((f) => f.severity === 'hard');

describe('M5.E6.T1 doc-hygiene scope + stripCode', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-sweep-scope-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC1.2 — with .planning in scope, a dead link there is flagged; archive/ is exempt', async () => {
    await writeDoc(dir, 'CLAUDE.md', '# ok\n');
    await writeDoc(dir, '.planning/CONTEXT.md', 'A [dead](nope.md) link.\n');
    // A dead link inside .planning/archive/ must NOT surface (R7 historical).
    await writeDoc(dir, '.planning/archive/OLD.md', 'A [dead](gone.md) link.\n');

    const h = hard(
      checkInternalLinks(dir, { dirs: ['docs', 'analysis', '.planning'], walkIgnore: SWEEP_WALK_IGNORE }),
    );
    expect(h).toHaveLength(1);
    expect(h[0].file).toBe('.planning/CONTEXT.md');
    expect(h[0].message).toMatch(/nope\.md/);
  });

  it('default scope is unchanged: a .planning dead link is NOT scanned without opts', async () => {
    await writeDoc(dir, 'README.md', 'clean.\n');
    await writeDoc(dir, '.planning/CONTEXT.md', '[dead](nope.md)\n');
    expect(hard(checkInternalLinks(dir))).toHaveLength(0);
  });

  it('AC2.7 — stripCode: real dead link outside code is HARD; ](path.md) inside code is not', async () => {
    await writeDoc(
      dir,
      'README.md',
      [
        'A real [dead](reallygone.md) link on its own line.',
        '',
        'Use `[label](inline-sample.md)` to link. That is a code span.',
        '',
        '```',
        '[fenced](fenced-sample.md)',
        '```',
      ].join('\n') + '\n',
    );

    const h = hard(checkInternalLinks(dir, { stripCode: true }));
    expect(h).toHaveLength(1);
    expect(h[0].message).toMatch(/reallygone\.md/);
    // The code-quoted link syntax must NOT be mistaken for a live link.
    expect(h.some((f) => /inline-sample|fenced-sample/.test(f.message))).toBe(false);
  });

  it('AC2.7 baseline — without stripCode, code-quoted link syntax IS flagged (default unchanged)', async () => {
    await writeDoc(dir, 'README.md', 'Use `[label](inline-sample.md)` in prose.\n');
    const h = hard(checkInternalLinks(dir)); // default: stripCode off
    expect(h).toHaveLength(1);
    expect(h[0].message).toMatch(/inline-sample\.md/);
  });

  it('checkFillInStubs threads a widened dirs scope', async () => {
    await writeDoc(dir, 'guides/EXTRA.md', '# G\n\n[FILL IN — value]\n');
    // Default scope (docs only) does not see guides/.
    expect(hard(checkFillInStubs(dir))).toHaveLength(0);
    // Widened scope does.
    const h = hard(checkFillInStubs(dir, { dirs: ['docs', 'guides'] }));
    expect(h).toHaveLength(1);
    expect(h[0].file).toBe('guides/EXTRA.md');
  });
});
