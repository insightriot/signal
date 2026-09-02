import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  checkDanglingReferences,
  DANGLING_REF_EXEMPTIONS,
} from '../plugin/tools/lib/doc-hygiene.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-refs-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (rel, body) => writeFile(join(dir, rel), body);
const BUGS_HEAD = '# Bugs\n\n| ID | Status | Sev | Detail |\n|---|---|---|---|\n';

describe('checkDanglingReferences — an id that resolves to nothing', () => {
  it('says nothing when every cited id is defined', async () => {
    await write('.planning/BUGS.md', `${BUGS_HEAD}| B1 | \`fixed\` | P2 | a thing |\n`);
    await write('.planning/NOTES.md', 'see B1 for detail');
    expect(await checkDanglingReferences(dir)).toEqual([]);
  });

  it('flags a cited bug id that BUGS.md never defines — the B112 case', async () => {
    await write('.planning/BUGS.md', `${BUGS_HEAD}| B1 | \`fixed\` | P2 | a thing |\n`);
    await write('.planning/NOTES.md', 'filed as B99, see also B99');
    await write('.planning/PLAN.md', 'B99 is filed');
    const f = await checkDanglingReferences(dir);
    expect(f).toHaveLength(1);
    expect(f[0].message).toMatch(/B99 is cited in 2 file\(s\)/);
  });

  it('counts a heading-captured bug as defined, not only a table row', async () => {
    // captureToBugs writes heading-style entries with no table row (B77).
    await write('.planning/BUGS.md', `${BUGS_HEAD}#### Something broke (B42)\n\n**Status:** needs-triage\n`);
    await write('.planning/NOTES.md', 'see B42');
    expect(await checkDanglingReferences(dir)).toEqual([]);
  });

  it('honours an exemption, and every exemption carries a reason', async () => {
    await write('.planning/BUGS.md', `${BUGS_HEAD}| B1 | \`fixed\` | P2 | x |\n`);
    await write('.planning/NOTES.md', 'B77 does not exist and that is the point');
    const exempt = { B77: 'Cited only in the note recording that it never existed.' };
    expect(await checkDanglingReferences(dir, { exemptIds: exempt })).toEqual([]);
    for (const [id, reason] of Object.entries(DANGLING_REF_EXEMPTIONS)) {
      expect(reason.length, `${id} is exempt with no reason`).toBeGreaterThan(20);
    }
  });

  it('is silent in a project that uses no ids at all (portable)', async () => {
    await write('.planning/NOTES.md', 'no ids here, just prose about B-something? no.');
    expect(await checkDanglingReferences(dir)).toEqual([]);
  });

  it('is silent with no .planning/ directory', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'sig-noplanning-'));
    expect(await checkDanglingReferences(empty)).toEqual([]);
    await rm(empty, { recursive: true, force: true });
  });
});

/**
 * The regression that matters most. The first implementation read
 * `.planning/DECISIONS.md` directly and reported 31 dangling ids where 2 existed:
 * closed-milestone decisions are EVICTED to the archive, so 29 good ids resolved
 * to a home this module did not know about. B82's shape — a second implementation
 * of "where does this live" that cannot express the first's knowledge — and it
 * failed in the direction that looks like a finding.
 */
describe('D-ids resolve through the real resolver, including archived homes', () => {
  it('does not flag a decision that lives in the archive rather than the live file', async () => {
    // The archive source must be a file named exactly DECISIONS.md under
    // archive/ — buildDecisionIdMap keys on the basename, at any depth.
    await mkdir(join(dir, '.planning/archive/M1'), { recursive: true });
    await write('.planning/DECISIONS.md', '# Decisions\n\n## 2026-09-01 — recent\n\n**D-E99-1 — a live one.**\n');
    await write('.planning/archive/M1/DECISIONS.md', '# Archived\n\n**D-E1-1 — an evicted one.**\n');
    await write('.planning/NOTES.md', 'per D-E1-1 and D-E99-1');

    const f = await checkDanglingReferences(dir);
    const flagged = f.map((x) => x.message).join(' ');
    expect(flagged, 'an archived decision must not read as dangling').not.toMatch(/D-E1-1/);
  });

  it('still flags a decision id that exists nowhere', async () => {
    await write('.planning/DECISIONS.md', '# Decisions\n\n**D-E99-1 — a real one.**\n');
    await write('.planning/NOTES.md', 'per D-NOPE-7');
    const f = await checkDanglingReferences(dir);
    expect(f.map((x) => x.message).join(' ')).toMatch(/D-NOPE-7/);
  });
});
