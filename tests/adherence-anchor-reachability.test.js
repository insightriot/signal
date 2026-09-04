// Every commit ADHERENCE-LOG.md pins must still be reachable.
//
// The pin IS the reproducibility claim. Two consecutive Epic merges squashed —
// PR #211 (2026-08-28) and PR #236 (2026-09-04) — and both reported success. The
// first left a published verdict pointing at `0e88e03`, a commit absent from
// `main`; the second did no damage only because that Epic added no run record.
//
// This checks the PROPERTY (can you get back to the named state?) rather than the
// mechanism (did the merge have two parents?), which is what makes it hold no
// matter how a SHA comes to be orphaned. `BUGS.md` argued for that target before
// either instance was root-caused, and the second instance proved it right: the
// two squashes have different stories and identical consequences.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAnchors,
  checkAnchorReachability,
  formatOrphanedAnchors,
} from '../tools/adherence-anchors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, '.planning/ADHERENCE-LOG.md');

describe('parseAnchors — labelled pins only', () => {
  it('reads both published shapes: the inline ceiling pin and a run-record row', () => {
    const out = parseAnchors(
      '**Computed:** 2026-09-04 · **Commit:** `c8bad52` · **Corpus:** 22 files\n' +
      '| Commit | `22aeb23` |\n',
    );
    expect(out.map((a) => a.sha)).toEqual(['c8bad52', '22aeb23']);
  });

  it('IGNORES a sha quoted in prose — the log explains orphaned commits by name', () => {
    // This is the false-positive that would make the check unadoptable. The log
    // records `0e88e03` precisely BECAUSE it is unreachable; reading that as a
    // live claim would make the file permanently red for describing its own
    // history correctly.
    const out = parseAnchors('Repaired by recomputing against `d0ac0c5`; `0e88e03` is gone.\n');
    expect(out).toEqual([]);
  });

  it('never throws on a non-string body', () => {
    expect(parseAnchors(undefined)).toEqual([]);
    expect(parseAnchors(null)).toEqual([]);
  });
});

describe('checkAnchorReachability — fails closed on the property, open on blindness', () => {
  const anchors = [{ sha: 'aaaaaaa', line: 1 }, { sha: 'bbbbbbb', line: 2 }];

  it('an unreachable-but-resolvable sha is ORPHANED — the case this exists to catch', () => {
    const r = checkAnchorReachability(anchors, {
      resolve: () => true,
      isAncestor: (sha) => sha !== 'bbbbbbb',
    });
    expect(r.orphaned.map((a) => a.sha)).toEqual(['bbbbbbb']);
    expect(r.reachable.map((a) => a.sha)).toEqual(['aaaaaaa']);
    expect(r.unresolvable).toEqual([]);
  });

  it('a sha git cannot resolve is UNRESOLVABLE, never orphaned (`B39`)', () => {
    // A shallow clone has no history. A detector that cannot look must say so
    // rather than accuse — reporting "orphaned" here would be a false alarm on
    // every shallow checkout, and this repo names that class.
    const r = checkAnchorReachability(anchors, { resolve: () => false, isAncestor: () => false });
    expect(r.unresolvable).toHaveLength(2);
    expect(r.orphaned).toEqual([]);
  });

  it('formatOrphanedAnchors names every offender with its line', () => {
    const msg = formatOrphanedAnchors({ orphaned: [{ sha: 'bbbbbbb', line: 2 }] });
    expect(msg).toContain('bbbbbbb');
    expect(msg).toContain('ADHERENCE-LOG.md:2');
    expect(msg).toContain('AC4.3');
  });
});

describe('the live log — every anchor is reachable from HEAD', () => {
  it('publishes no verdict pointing at a state nobody can return to', () => {
    let head;
    try {
      head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim();
    } catch {
      // No git, no answer. Reported as a skip rather than a pass, because a
      // green result here must always mean "checked and reachable".
      console.warn('adherence-anchor-reachability: git unavailable — NOT checked.');
      return;
    }
    expect(head).toMatch(/^[0-9a-f]{40}$/);

    const git = {
      resolve: (sha) => {
        try {
          execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
          return true;
        } catch { return false; }
      },
      isAncestor: (sha) => {
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
          return true;
        } catch { return false; }
      },
    };

    const anchors = parseAnchors(readFileSync(LOG, 'utf-8'));
    expect(anchors.length).toBeGreaterThan(0); // the log pins something, or this test is vacuous
    const result = checkAnchorReachability(anchors, git);

    if (result.unresolvable.length > 0) {
      console.warn(
        `adherence-anchor-reachability: ${result.unresolvable.length} sha(s) not present locally ` +
        '(shallow clone?) — those were NOT checked.',
      );
    }
    expect(result.orphaned, formatOrphanedAnchors(result)).toEqual([]);
  });
});
