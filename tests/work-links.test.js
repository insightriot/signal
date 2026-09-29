// rewriteRelativeLinks — relative link targets follow a body to its new depth
// (M6.E11.S2 t2.2, D-M6E11-22). Dirs are relative to `.planning/`.

import { describe, it, expect } from 'vitest';

import { rewriteRelativeLinks } from '../plugin/tools/lib/work-links.js';

const DONE = 'work/done/2026-09';

describe('rewriteRelativeLinks', () => {
  it('rewrites a `../` link and a sibling link for a body moved three levels down', () => {
    const src = 'See [a](../analysis/X.md) and [b](M6.E7-RETROSPECTIVE.md#why).';
    const out = rewriteRelativeLinks(src, '', DONE);
    expect(out).toBe('See [a](../../../../analysis/X.md) and [b](../../../M6.E7-RETROSPECTIVE.md#why).');
    expect(rewriteRelativeLinks(out, DONE, '')).toBe(src);
  });

  it('is the identity when the directory does not change', () => {
    const src = 'A [x](./BACKLOG.md) link.';
    expect(rewriteRelativeLinks(src, 'work/backlog', 'work/backlog')).toBe(src);
  });

  it('leaves external, anchor-only, absolute and mailto targets alone', () => {
    const src = '[a](https://x.invalid/y.md) [b](#heading) [c](/abs/foo.md) [d](mailto:a@b.invalid)';
    expect(rewriteRelativeLinks(src, '', DONE)).toBe(src);
  });

  it('never touches a `](…)` inside an inline code span (B24/B27/B28 quote `](*.md)`)', () => {
    const src = 'A broken `](*.md)` link and ``a `](x.md)` b`` then [real](x.md).';
    expect(rewriteRelativeLinks(src, '', 'work/backlog')).toBe(
      'A broken `](*.md)` link and ``a `](x.md)` b`` then [real](../../x.md).'
    );
  });

  it('never touches a link inside a fenced block', () => {
    const src = ['```', '[x](a.md)', '```', '[y](a.md)'].join('\n');
    expect(rewriteRelativeLinks(src, '', 'work/inbox')).toBe(['```', '[x](a.md)', '```', '[y](../../a.md)'].join('\n'));
  });

  it('keeps a link title and a trailing slash', () => {
    const src = '[t](docs/ "Docs") [u](../analysis/)';
    const out = rewriteRelativeLinks(src, '', 'work/backlog');
    expect(out).toBe('[t](../../docs/ "Docs") [u](../../../analysis/)');
    expect(rewriteRelativeLinks(out, 'work/backlog', '')).toBe(src);
  });

  it('rewrites image links the same way', () => {
    expect(rewriteRelativeLinks('![p](img/a.png)', '', 'work/inbox')).toBe('![p](../../img/a.png)');
  });
});

describe('rewriteRelativeLinks — a whole folder moving together (M6.E11 t5.3)', () => {
  const MOVE = { from: 'work/epics/M6.E99', to: 'archive/epics/M6.E99' };

  it('leaves a link to a file in the same moving folder unchanged, and rewrites one leaving it', () => {
    const src = 'See [plan](M6.E99-PLAN.md), [item](SIG-5.md#x), [out](../../backlog/SIG-3.md) and [up](../../../CONTEXT.md).';
    expect(rewriteRelativeLinks(src, MOVE.from, MOVE.to, { movedTogether: MOVE })).toBe(
      'See [plan](M6.E99-PLAN.md), [item](SIG-5.md#x), [out](../../../work/backlog/SIG-3.md) and [up](../../../CONTEXT.md).'
    );
  });

  it('handles a file in a subfolder of the moving folder', () => {
    const src = '[sib](../M6.E99-PLAN.md) [out](../../../backlog/SIG-3.md)';
    expect(rewriteRelativeLinks(src, `${MOVE.from}/notes`, `${MOVE.to}/notes`, { movedTogether: MOVE })).toBe(
      '[sib](../M6.E99-PLAN.md) [out](../../../../work/backlog/SIG-3.md)'
    );
  });

  it('without the option, a sibling link points back at the old location (why the option exists)', () => {
    expect(rewriteRelativeLinks('[p](M6.E99-PLAN.md)', MOVE.from, MOVE.to))
      .toBe('[p](../../../work/epics/M6.E99/M6.E99-PLAN.md)');
  });
});
