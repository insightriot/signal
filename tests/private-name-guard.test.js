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
 * THE WORKING TREE IS CLEAN — AND THE FIRST VERSION OF THIS PARAGRAPH WAS WRONG.
 *
 * It read: *"the inventory is EMPTY … any failure here is a genuinely NEW
 * mention."* That was false the day it was written (2026-08-12). The scrub it
 * describes replaced 521 mentions across 95 files and covered **5 of the 13**
 * corpus projects; the denylist then locked in exactly those five, so the other
 * eight stayed named in ~30 tracked files and the suite stayed green over them.
 * `M5.E10` added one more mention for the same reason.
 *
 * A completeness claim written from the shape of the work rather than from the
 * artifact — the defect `M5.E10` exists to kill — inside the guard for the rule
 * it misstated. Found by an independent review (`B97`), not by this test.
 *
 * All thirteen are now denied, in the two modes below, and the corpus was
 * re-scrubbed: 113 replacements across 30 files.
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

// sha256(name)[0..16) for every private project whose name must not spread.
//
// ALL THIRTEEN, not five (`B97`). The list held 5 for a day while 8 corpus
// projects were still named in ~30 tracked files — and this Epic ADDED one,
// because the guard passed. The docstring above claimed the inventory was empty
// and any failure would be "a genuinely NEW mention"; `references/eval-corpus.md`
// published "a file naming a corpus project fails the suite". Both were false,
// and a published rule nobody could rely on is worse than no rule.
//
// TWO MATCH MODES, because a name's SHAPE decides what can be checked safely.
export const DENIED_TOKEN = new Set([
  // Hyphenated or long: cannot occur in ordinary English, so ANY appearance is
  // a mention — including as a segment inside a longer token, which the old
  // greedy tokeniser missed entirely (`name-codex-review` hashed as one word
  // and matched nothing).
  'b1785dc8b4c98350',
  '4b3e37e57f00dcdc',
  '5709cb590880d6d6',
  '089f4667dcc1924d',
  '733aee8b43e1f22f',
  'b984b04187721cbc',
  '38dfd52ec35ea8b8',
  'ae0162a32c456b36',
]);

const DENIED_SHAPED = new Set([
  // Two and three characters long. These ARE ordinary English substrings — one
  // of them matches 107 tracked files as a bare token and is a real reference in
  // 3. Hashing them as tokens would turn the guard red on every commit, which is
  // how a guard gets deleted. They are caught only in PROJECT shape: a path
  // prefix (`name/FILE.md`) or a backticked identifier.
  //
  // STATED, NOT CLAIMED AWAY: a bare prose mention of one of these three is NOT
  // caught, and cannot be without false positives on English. That is a real
  // hole and it is why this comment exists instead of a cleaner assertion.
  'bee98bf120e89063',
  'aafd6a4c64386852',
  '26eab90d2b0be7cd',
  // Nine letters and no hyphen — measured at REVIEW to be ordinary English too.
  // Token-matching them turned 17 files red, almost all of it prose in
  // `README.md`, `CHANGELOG.md` and the ecosystem analyses. One of the two is a
  // word this repository uses constantly to describe a PLANNING PATTERN, which
  // has nothing to do with the project that shares its name.
  '1a6ed3839eed3172',
  'c983c585ac3c40d9',
]);

// This file necessarily contains the hashes; the allowlist necessarily contains
// the paths. Neither is a mention.
const SELF = ['tests/private-name-guard.test.js', 'tests/fixtures/private-name-allowlist.json'];

// Generated lockfiles are excluded, and the reason is a real match rather than a
// precaution: a base64 integrity digest in `package-lock.json` contained one of
// the short names followed by `/`, which is indistinguishable from a path. Every
// name in a lockfile is a public npm package or a random digest; none of them is
// a mention. Kept as a narrow, named exclusion rather than a blanket one.
const GENERATED = ['package-lock.json'];

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * Every hyphen-delimited sub-run of a token, longest first.
 *
 * `a-b-c` yields `a-b-c`, `a-b`, `b-c`, `a`, `b`, `c`. This is what lets the
 * guard find a denied name EMBEDDED in a longer token without ever knowing the
 * name — the old tokeniser took the longest run only, so a name inside a
 * compound was invisible.
 */
function subRuns(token) {
  const parts = token.split('-');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j <= parts.length; j++) out.push(parts.slice(i, j).join('-'));
  }
  return out;
}

/** Denied hashes found in `text`, by either mode. */
function deniedTokensIn(text) {
  const found = new Set();
  const lower = text.toLowerCase();

  // Mode 1 — token and embedded-segment matching for the safe names.
  for (const m of lower.matchAll(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g)) {
    for (const run of subRuns(m[0])) {
      const h = hash(run);
      if (DENIED_TOKEN.has(h)) found.add(h);
    }
  }

  // Mode 2 — project SHAPE only, for names that are also English words.
  for (const re of [/([a-z0-9][a-z0-9-]*)\/[A-Za-z0-9._-]/g, /`([a-z0-9][a-z0-9-]*)`/g]) {
    for (const m of lower.matchAll(re)) {
      const h = hash(m[1]);
      if (DENIED_SHAPED.has(h)) found.add(h);
    }
  }
  return found;
}

describe('private project names do not spread to new files', () => {
  it('no file outside the recorded inventory names a private project', async () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((p) => !SELF.includes(p) && !GENERATED.includes(p));

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

describe('the guard actually catches things (B97)', () => {
  // Written because the previous version passed while eight projects were named
  // in the tree. A guard whose only evidence is a green suite has none.
  it('catches a denied name EMBEDDED in a longer hyphenated token', () => {
    // The old tokeniser took the longest hyphen run, so a name inside a compound
    // hashed as one unfamiliar word and matched nothing.
    const runs = subRuns('alpha-beta-gamma');
    expect(runs).toContain('beta');
    expect(runs).toContain('alpha-beta');
    expect(runs).toContain('beta-gamma');
    expect(runs).toContain('alpha-beta-gamma');
  });

  it('every denied hash is in exactly one mode', () => {
    for (const h of DENIED_TOKEN) expect(DENIED_SHAPED.has(h), `${h} is in both modes`).toBe(false);
    expect(DENIED_TOKEN.size + DENIED_SHAPED.size).toBe(13);
  });

  it('a shaped-mode name is caught as a path prefix and as a backticked id', () => {
    const [h] = [...DENIED_SHAPED];
    // Reconstructing the name is impossible from the hash — so this asserts the
    // MECHANISM on a synthetic denied entry instead.
    const probe = (text) => {
      const found = new Set();
      for (const re of [/([a-z0-9][a-z0-9-]*)\/[A-Za-z0-9._-]/g, /`([a-z0-9][a-z0-9-]*)`/g]) {
        for (const m of text.toLowerCase().matchAll(re)) found.add(hash(m[1]));
      }
      return found;
    };
    expect(probe('see widget/PLAN.md for detail')).toContain(hash('widget'));
    expect(probe('the `widget` project')).toContain(hash('widget'));
    expect(probe('a widget is a thing')).not.toContain(hash('widget'));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
