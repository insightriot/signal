/**
 * tests/private-name-guard.test.js — private project names do not spread.
 *
 * This repository is public. Signal's evidence comes from a set of real private
 * projects — the eval corpus (`references/eval-corpus.md`) — and for several
 * releases those projects were named directly in requirements, decisions,
 * retrospectives and analysis. They are now referred to only by stable
 * anonymous labels: `eval-project-A`, `eval-project-B`, and so on.
 *
 * A rule that exists only as prose gets violated here — `B7` → `B58`, `B39`,
 * and `ship.md`'s self-exemption that survived thirteen releases. So the rule
 * is a test.
 *
 * THE WORKING TREE IS CLEAN, AND THE INVENTORY IS EMPTY. 521 mentions across 95
 * files were replaced on 2026-08-12; `private-name-allowlist.json` now lists
 * nothing, so any failure here is a genuinely NEW mention rather than one of the
 * historical ones.
 *
 * WHAT IT STILL CANNOT REACH: the commit history. Those mentions are in commits
 * already on `main`, and `.planning/ADHERENCE-LOG.md` pins commit shas as its
 * reproducibility anchor while `main` is protected — rewriting that history
 * would break the anchor. The names are permanent in the log, whatever the tree
 * says. Stated here rather than left to be discovered.
 *
 * WHY THE DENYLIST IS HASHED: a guard that stores the names in plaintext
 * publishes the very strings it exists to keep out of a public repository. The
 * hashes below are `sha256(name).slice(0, 16)`; no plaintext appears anywhere in
 * this repository. To add a name:
 *   node -e "console.log(require('crypto').createHash('sha256')
 *                  .update('the-name').digest('hex').slice(0,16))"
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALLOWLIST = join(ROOT, 'tests', 'fixtures', 'private-name-allowlist.json');

// sha256(name)[0..16) for each private project whose name must not spread.
const DENIED = new Set([
  'b1785dc8b4c98350',
  'ae0162a32c456b36',
  '089f4667dcc1924d',
  '4b3e37e57f00dcdc',
  '5709cb590880d6d6',
]);

// This file necessarily contains the hashes; the allowlist necessarily contains
// the paths. Neither is a mention.
const SELF = ['tests/private-name-guard.test.js', 'tests/fixtures/private-name-allowlist.json'];

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Hyphenated lowercase tokens — the shape a project directory name takes. */
function deniedTokensIn(text) {
  const found = new Set();
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g)) {
    if (DENIED.has(hash(m[0]))) found.add(hash(m[0]));
  }
  return found;
}

describe('private project names do not spread to new files', () => {
  it('no file outside the recorded inventory names a private project', async () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((p) => !SELF.includes(p));

    const allowed = new Set(JSON.parse(await readFile(ALLOWLIST, 'utf8')).files);

    const offenders = [];
    for (const path of tracked) {
      if (allowed.has(path)) continue;
      let content;
      try {
        content = await readFile(join(ROOT, path), 'utf8');
      } catch {
        continue; // binary or unreadable — nothing to read a name out of
      }
      if (deniedTokensIn(content).size > 0) offenders.push(path);
    }

    // A failure here is not "someone did something wrong" — it is a new file
    // naming a private project, in a public repo. Use the anonymous label.
    expect(offenders).toEqual([]);
  });

  it('the inventory is honest: every path in it still exists and still carries a name', async () => {
    // Vacuously true while the list is empty, and kept anyway: it is what stops
    // a future partial scrub from leaving rows that permit files they no longer
    // describe.
    // Without this, the allowlist rots into a blanket exemption — paths linger
    // after a scrub and quietly re-permit what they no longer contain.
    const { files } = JSON.parse(await readFile(ALLOWLIST, 'utf8'));
    const stale = [];
    for (const path of files) {
      let content;
      try {
        content = await readFile(join(ROOT, path), 'utf8');
      } catch {
        stale.push(`${path} (gone)`);
        continue;
      }
      if (deniedTokensIn(content).size === 0) stale.push(`${path} (already clean)`);
    }
    // Cleaning a file is the intended direction of travel: remove its row here
    // in the same commit.
    expect(stale).toEqual([]);
  });

  it('the anonymous label is what new work uses', async () => {
    const readme = await readFile(
      join(ROOT, 'tests', 'fixtures', 'claim-integrity', 'README.md'),
      'utf8'
    );
    expect(readme).toMatch(/`eval-project-[A-Z]`/);
    expect(deniedTokensIn(readme).size).toBe(0);
  });

  it('the inventory is EMPTY — the scrub is done, not merely ratcheted', async () => {
    // It was 92 files. An empty allowlist means the ratchet no longer has
    // anything to permit, so any future failure is a genuinely new mention
    // rather than one of the historical ones.
    const { files } = JSON.parse(await readFile(ALLOWLIST, 'utf8'));
    expect(files).toEqual([]);
  });

  it('the corpus convention is documented, not just enforced', async () => {
    // A rule enforced by a test nobody can find the reasoning for gets deleted
    // the first time it is inconvenient.
    const doc = await readFile(join(ROOT, 'references', 'eval-corpus.md'), 'utf8');
    expect(doc).toMatch(/eval-project-A/);
    expect(doc).toMatch(/No mapping is published/i);
  });
});
