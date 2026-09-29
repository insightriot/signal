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
