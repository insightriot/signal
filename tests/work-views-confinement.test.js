// M6.E13 REVIEW I1 — `regenerateViews` confines every view target.
//
// git tracks symlinks, so a cloned repository can ship `.planning/work/history`
// (or a view file, or `.planning/work`) as a link. Before this fix the views
// were written through it: a linked `history/` put `YYYY.md` outside the
// project. Every target is now checked before anything is written; a linked
// directory or a linked view file refuses with a clear error, and nothing is
// written anywhere.
//
// Attack fixtures live under mkdtemp only.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const by = 'b';
let base;
let outside;

function put(rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// A v2 store with one open item and one close old enough for history/2025.md.
function v2Store() {
  put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  put(recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'BUG', title: 'open', events: [{ type: 'created', at: '2026-10-01T00:00:00.000Z', by }] }));
  put(recordPath('SIG-2'), serializeRecord({
    id: 'SIG-2',
    type: 'FEAT',
    title: 'old close',
    events: [
      { type: 'created', at: '2025-01-01T00:00:00.000Z', by },
      { type: 'closed', at: '2025-02-01T00:00:00.000Z', by, reason: 'wontdo', proof: 'no' },
    ],
  }));
}

const VIEWS = ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md', 'work/EPICS.md'];
const noViewWritten = () => VIEWS.every((v) => !existsSync(join(base, '.planning', v)));

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'sig-views-confine-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'sig-views-escape-')));
  v2Store();
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('regenerateViews — write confinement (REVIEW I1)', () => {
  it('a symlinked work/history/ is refused: nothing is written outside, and no view is written', async () => {
    symlinkSync(outside, join(base, '.planning/work/history'));
    await expect(regenerateViews(base)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/work\/history.*(symbolic link|link)/s),
    });
    expect(readdirSync(outside)).toEqual([]);
    expect(noViewWritten()).toBe(true);
  });

  it('a symlinked BUGS.md file is refused: the file it points at is not read or replaced, and no view is written', async () => {
    const target = join(outside, 'secret.md');
    writeFileSync(target, 'outside\n');
    symlinkSync(target, join(base, '.planning/BUGS.md'));
    await expect(regenerateViews(base)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/BUGS\.md.*symbolic link/s),
    });
    expect(readFileSync(target, 'utf-8')).toBe('outside\n');
    expect(readdirSync(outside)).toEqual(['secret.md']);
    for (const v of VIEWS.slice(1)) expect(existsSync(join(base, '.planning', v)), v).toBe(false);
  });

  it('a symlinked .planning/work/ is refused, even when it points inside the project', async () => {
    // Inside the repository but outside .planning/: the read side (items/
    // inside the project) passes, so the write confinement is what refuses.
    const elsewhere = join(base, 'elsewhere');
    mkdirSync(elsewhere);
    const { renameSync } = await import('node:fs');
    renameSync(join(base, '.planning/work'), join(elsewhere, 'work'));
    symlinkSync(join(elsewhere, 'work'), join(base, '.planning/work'));
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/work/) });
    expect(existsSync(join(elsewhere, 'work', 'EPICS.md'))).toBe(false);
    expect(existsSync(join(elsewhere, 'work', 'history'))).toBe(false);
    expect(noViewWritten()).toBe(true);
  });

  it('with no links, every view is still written (no false refusal)', async () => {
    const { written } = await regenerateViews(base);
    expect(written).toContain('.planning/work/history/2025.md');
    expect(existsSync(join(base, '.planning/work/history/2025.md'))).toBe(true);
  });
});
