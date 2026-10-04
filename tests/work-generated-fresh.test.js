// The committed generated files equal a regeneration (M6.E11 VERIFY loop 1, L2).
//
// BUGS.md, BACKLOG.md, ISSUES-INBOX.md, OPEN-QUESTIONS.md and work/EPICS.md are
// generated from the item files. If an item file changes and the lists are not
// regenerated, the committed list is stale — and a reader of it gets the old
// state with nothing to say so. Found at VERIFY: b6060b7 rewrote SIG-161's
// links after `moveItem` had already regenerated, so the committed BACKLOG.md
// still linked to the old path.
//
// Reads THIS repository's .planning/, on a copy: generateAll writes into the
// copy and the repo is never touched. It compares against the files on disk
// (what a commit would carry), not `git show HEAD:`, so regenerating before
// committing is not a failure. Not skipped when the store is off: this repo
// runs the store, and a check that skips itself would read clean over nothing.
// On a v2 store (after the M6.E13 cutover) the views come from the records.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EPICS_INDEX_REL, GENERATED_FILES, generateAll } from '../plugin/tools/lib/work-generate.js';
import { storeVersion } from '../plugin/tools/lib/work-records.js';
import { regenerateToMemory, VIEW_PATHS } from '../plugin/tools/lib/work-views.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNING = join(ROOT, '.planning');
const FILES = [...GENERATED_FILES, EPICS_INDEX_REL];

// M6.E13 t7.3 prep: the same guard on either store version, so the cutover
// commit needs no edit here. v1: `generateAll` into a copy. v2: the views are
// regenerated in memory from the records (`regenerateToMemory` writes nothing)
// and compared with the files on disk.
const LIVE_V2 = storeVersion(ROOT) === 2;

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

if (!LIVE_V2) {
  let tmp;
  let written;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'sig-gen-fresh-'));
    cpSync(PLANNING, join(tmp, '.planning'), { recursive: true });
    ({ written } = await generateAll(tmp));
  });
  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  describe("this repo's generated lists equal a regeneration from its item files", () => {
    // With the store off generateAll writes nothing, the copies stay copies, and
    // every comparison below would pass over files nobody regenerated.
    it('generateAll actually wrote every generated file in the copy', () => {
      expect(written).toEqual(FILES);
    });

    it.each(FILES)('.planning/%s', (name) => {
      const committed = readFileSync(join(PLANNING, name), 'utf-8');
      const regenerated = readFileSync(join(tmp, '.planning', name), 'utf-8');
      const diff = firstDifference(committed, regenerated);
      expect(diff, `.planning/${name} is stale — regenerate with generateAll(repoRoot): ${diff}`).toBeNull();
    });
  });
} else {
  const views = regenerateToMemory(ROOT);
  const HISTORY = join(PLANNING, 'work', 'history');

  describe("this repo's views equal a regeneration from its records (v2)", () => {
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
}
