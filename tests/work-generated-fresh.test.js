// The committed generated files equal a regeneration (M6.E11 VERIFY loop 1, L2).
//
// BUGS.md, BACKLOG.md, ISSUES-INBOX.md, OPEN-QUESTIONS.md, work/EPICS.md and
// the history views are generated from the work records. If a record changes
// and the views are not regenerated, the committed view is stale — and a reader of it gets the old
// state with nothing to say so. Found at VERIFY: b6060b7 rewrote SIG-161's
// links after `moveItem` had already regenerated, so the committed BACKLOG.md
// still linked to the old path.
//
// Reads THIS repository's records and regenerates the views in memory
// (`regenerateToMemory` writes nothing). It compares against the files on disk
// (what a commit would carry), not `git show HEAD:`, so regenerating before
// committing is not a failure. Not skipped when the store is off: this repo
// runs the store, and a check that skips itself would read clean over nothing.
// The v1 half (the v1 `generateAll` into a copy) was removed at M6.E13 t7.4.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { regenerateToMemory, VIEW_PATHS } from '../plugin/tools/lib/work-views.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNING = join(ROOT, '.planning');

// The first line that differs, 1-based, with both sides — so a failure names
// where to look instead of dumping two whole files.
function firstDifference(committed, regenerated) {
  const a = committed.split('\n');
  const b = regenerated.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n  committed:   ${JSON.stringify(a[i] ?? '<end of file>')}\n`
        + `  regenerated: ${JSON.stringify(b[i] ?? '<end of file>')}`;
    }
  }
  return null;
}

const views = regenerateToMemory(ROOT);
const HISTORY = join(PLANNING, 'work', 'history');

describe("this repo's views equal a regeneration from its records", () => {
  // A regeneration that produced nothing would compare nothing.
  it('the regeneration produced every view', () => {
    for (const rel of Object.values(VIEW_PATHS)) expect(Object.keys(views), rel).toContain(rel);
  });

  it.each(Object.keys(views).sort())('%s', (rel) => {
    const abs = join(ROOT, rel);
    expect(existsSync(abs), `${rel} is missing — regenerate with regenerateViews(repoRoot)`).toBe(true);
    const diff = firstDifference(readFileSync(abs, 'utf-8'), views[rel]);
    expect(diff, `${rel} is stale — regenerate with regenerateViews(repoRoot): ${diff}`).toBeNull();
  });

  it('no history year on disk that the records no longer produce', () => {
    const onDisk = existsSync(HISTORY) ? readdirSync(HISTORY).map((n) => `.planning/work/history/${n}`) : [];
    for (const rel of onDisk) expect(Object.keys(views), rel).toContain(rel);
  });
});
