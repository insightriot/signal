// Tests for convertV1Item, frontmatter → record + events (M6.E13.S1.t1.4a).
// See .planning/M6.E13-PLAN.md Decisions 3 (transition table), 4 (Epic derived),
// 8 (key order) and 11 (closes that are not legacy); DECISIONS.md D-M6E13-14, D-M6E13-20.
//
// Fixtures are small excerpts copied from real v1 items under .planning/work/ (read-only, at
// the time of writing). The live files are never read here: t1.5 is the live run.

import { describe, it, expect } from 'vitest';

import { convertV1Item, bodyDirFor } from '../plugin/tools/lib/work-convert.js';
import { validateRecord, checkEvents, deriveStatus, epicOf } from '../plugin/tools/lib/work-record.js';

// A v1 item file from a frontmatter block (YAML lines) and a body.
const v1 = (front, body = 'Body.\n') => `---\n${front.trim()}\n---\n${body}`;

function sound(record) {
  expect(validateRecord(record)).toEqual([]);
  expect(checkEvents(record)).toEqual([]);
}

// SIG-255, backlog, with a created record.
const BACKLOG_WITH_CREATED = v1(`
id: SIG-255
type: BUG
status: T
title: Archiving ignores a project's explicit keep-live list
theme: archive
priority: P2
source: /sig:item
created:
  at: 2026-10-01T23:34:30.044Z
  by: claude
`);

// SIG-62, backlog, migrated from BUGS.md, no created record and no date anywhere.
const BACKLOG_NO_CREATED_FRONT = `
id: SIG-62
type: BUG
status: T
title: The claim is squash-merge specific
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:101
legacy_id: B62
`;
const BACKLOG_NO_CREATED = v1(BACKLOG_NO_CREATED_FRONT);

// SIG-52, one of the 142 legacy closes.
const LEGACY_FIXED = v1(`
id: SIG-52
type: BUG
status: C
title: A Claude Code session binds to ONE plugin-cache version
priority: P1
source: migration:BUGS.md
source_ref: BUGS.md:89
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B52
`);

// SIG-127, fixed with a commit in its proof (Decision 11).
const FIXED_WITH_COMMIT = v1(`
id: SIG-127
type: BUG
status: C
title: A live BACKLOG row whose heading says a PHASE is done
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:182
close:
  reason: fixed
  by: claude
  at: 2026-10-03
  proof: commit 3c0b504, tests/backlog-reader-fixes.test.js (v0.1.46)
legacy_id: B127
`);

// SIG-137, dup, with an existing migration_note.
const DUP = v1(`
id: SIG-137
type: BUG
status: C
title: "\`detectProjectKind\` calls every non-git directory \`greenfield\`"
source: migration:BUGS.md
source_ref: BUGS.md:326
close:
  reason: dup
  by: brett (M6.E12 PLAN drain)
  at: 2026-10-01T23:42:56.961Z
  dup_of: SIG-112
legacy_id: BUGS.md:326
migration_note: Possibly the same defect as B112; not re-judged by the migration.
`);

// SIG-131, rejected.
const REJECTED = v1(`
id: SIG-131
type: BUG
status: C
title: attention is missing from profile-schema.md
source: migration:BUGS.md
close:
  reason: rejected
  by: brett (M6.E12 PLAN drain)
  at: 2026-10-01T23:42:57.089Z
  proof: "No longer true: plugin/references/profile-schema.md documents attention, checked 2026-10-01."
`);

// SIG-161, fixed with no commit, in an archived Epic folder (D-M6E13-20).
const NO_COMMIT_ARCHIVED = v1(`
id: SIG-161
type: FEAT
status: C
title: Structural status — make done-vs-live readable without inference
source: migration:BACKLOG.md
source_ref: BACKLOG.md:527
close:
  reason: fixed
  by: M6.E11
  at: 2026-09-30
  proof: DONE — M6.E11, 2026-09-30
legacy_id: BACKLOG.md:527
`);

describe('convertV1Item — record fields (Decision 8)', () => {
  it('carries the record fields and lists the dropped v1 fields', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED });
    sound(record);
    expect(record).toMatchObject({
      id: 'SIG-255',
      type: 'BUG',
      title: "Archiving ignores a project's explicit keep-live list",
      theme: 'archive',
      priority: 'P2',
      source: '/sig:item',
    });
    expect(record).not.toHaveProperty('status');
    expect(record).not.toHaveProperty('created');
    expect(manifest.id).toBe('SIG-255');
    expect(manifest.source).toBe('work/backlog/SIG-255.md');
    expect(manifest.fieldsDropped).toEqual(['status', 'created']);
    expect(manifest.errors).toEqual([]);
    for (const f of ['id', 'type', 'title', 'theme', 'priority', 'source']) {
      expect(manifest.fieldsMapped.some((m) => m.from === f && m.to === f)).toBe(true);
    }
  });

  it('carries source_ref, legacy_id, keep_because and migration_note', () => {
    const text = v1(`
id: SIG-9
type: FEAT
status: T
title: Something
source: migration:BACKLOG.md
source_ref: BACKLOG.md:12
legacy_id: BACKLOG.md:12
keep_because: still the plan
migration_note: merged from two rows
created:
  at: 2026-09-01
  by: claude
`);
    const { record } = convertV1Item({ relPath: 'work/backlog/SIG-9.md', text });
    sound(record);
    expect(record).toMatchObject({
      source_ref: 'BACKLOG.md:12',
      legacy_id: 'BACKLOG.md:12',
      keep_because: 'still the plan',
      migration_note: 'merged from two rows',
    });
  });

  it('returns the body', () => {
    const { body } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED });
    expect(body).toBe('Body.\n');
  });
});

describe('convertV1Item — created', () => {
  it('uses the v1 created at/by', () => {
    const { record } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED });
    expect(record.events[0]).toEqual({ type: 'created', at: '2026-10-01T23:34:30.044Z', by: 'claude' });
  });

  it('without created, uses the earliest date the frontmatter records, and says so', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text: LEGACY_FIXED });
    sound(record);
    expect(record.events[0].at).toBe('2026-09-29');
    const m = manifest.fieldsMapped.find((x) => x.to === 'events[0].at');
    expect(m.from).toBe('close.at');
    expect(m.note).toMatch(/no created record/);
  });

  it('without created, takes the earliest of the known dates, fallbackAt included', () => {
    const { record, manifest } = convertV1Item({
      relPath: 'work/done/2026-09/SIG-52.md',
      text: LEGACY_FIXED,
      fallbackAt: '2026-08-02',
    });
    expect(record.events[0].at).toBe('2026-08-02');
    expect(manifest.fieldsMapped.find((x) => x.to === 'events[0].at').from).toBe('fallbackAt');
  });

  it('with no date anywhere and no fallbackAt, refuses — never guesses (body dates are not read)', () => {
    const { record, manifest } = convertV1Item({
      relPath: 'work/backlog/SIG-62.md',
      text: BACKLOG_NO_CREATED.replace('Body.', 'Found 2026-08-02.'),
    });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/no created date/);
  });

  it('with no date but a fallbackAt, uses it', () => {
    const { record } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: BACKLOG_NO_CREATED, fallbackAt: '2026-09-29' });
    sound(record);
    expect(record.events[0].at).toBe('2026-09-29');
  });

  it('refuses a malformed fallbackAt', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: BACKLOG_NO_CREATED, fallbackAt: 'yesterday' });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/fallbackAt/);
  });
});

describe('convertV1Item — triaged, queued, started', () => {
  it('N in the inbox: created only', () => {
    const text = BACKLOG_WITH_CREATED.replace('status: T', 'status: N');
    const { record } = convertV1Item({ relPath: 'work/inbox/SIG-255.md', text });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created']);
    expect(deriveStatus(record)).toBe('N');
  });

  it('T in the backlog: a triaged event is synthesized at the created date and listed', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED });
    expect(record.events.map((e) => e.type)).toEqual(['created', 'triaged']);
    expect(record.events[1].at).toBe('2026-10-01T23:34:30.044Z');
    expect(deriveStatus(record)).toBe('T');
    expect(manifest.fieldsMapped.find((x) => x.to === 'events[1]')).toMatchObject({ from: 'status', note: expect.stringMatching(/synthesized/) });
  });

  it('a closed item from done/ gets no triaged event (v1 recorded no triage)', () => {
    const { record } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text: LEGACY_FIXED });
    expect(record.events.map((e) => e.type)).toEqual(['created', 'closed']);
  });

  it('Q in an Epic folder: triaged, then queued with the folder as the Epic', () => {
    const text = BACKLOG_WITH_CREATED.replace('status: T', 'status: Q');
    const { record } = convertV1Item({ relPath: 'work/epics/M6.E13/SIG-255.md', text });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created', 'triaged', 'queued']);
    expect(record.events[2].epic).toBe('M6.E13');
    expect(deriveStatus(record)).toBe('Q');
    expect(epicOf(record)).toBe('M6.E13');
  });

  it('P in an Epic folder: triaged, then started with the folder as the Epic', () => {
    const text = BACKLOG_WITH_CREATED.replace('status: T', 'status: P');
    const { record } = convertV1Item({ relPath: 'work/epics/M6.E13/SIG-255.md', text });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created', 'triaged', 'started']);
    expect(deriveStatus(record)).toBe('P');
    expect(epicOf(record)).toBe('M6.E13');
  });

  it('a closed item in an archived Epic folder keeps its Epic (queued before the close)', () => {
    const { record } = convertV1Item({ relPath: 'archive/epics/M6.E11/SIG-161.md', text: NO_COMMIT_ARCHIVED });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created', 'triaged', 'queued', 'closed']);
    expect(epicOf(record)).toBe('M6.E11');
    expect(deriveStatus(record)).toBe('C');
  });

  it('refuses an Epic folder whose name is not an Epic ID', () => {
    const text = BACKLOG_WITH_CREATED.replace('status: T', 'status: Q');
    const { record, manifest } = convertV1Item({ relPath: 'work/epics/notes/SIG-255.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/Epic/);
  });

  it('refuses a status that disagrees with its folder', () => {
    const text = BACKLOG_WITH_CREATED.replace('status: T', 'status: Q');
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/status Q.*work\/backlog/);
  });

  it('refuses a path outside the known v1 folders', () => {
    const { record, manifest } = convertV1Item({ relPath: 'elsewhere/SIG-255.md', text: BACKLOG_WITH_CREATED });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/not a v1 item folder/);
  });

  it('refuses a file name that is not the item ID', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-256.md', text: BACKLOG_WITH_CREATED });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/SIG-256/);
  });

  it('refuses an invalid v1 item, with its errors', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED.replace('type: BUG', 'type: BUGS') });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/type/);
  });
});

describe('convertV1Item — closes (Decision 11, D-M6E13-14, D-M6E13-20)', () => {
  it('legacy — not re-verified → closed {legacy: true, reason}, the v1 at/by kept', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text: LEGACY_FIXED });
    sound(record);
    expect(record.events[1]).toEqual({ type: 'closed', at: '2026-09-29', by: 'migration', reason: 'fixed', legacy: true });
    expect(manifest.closeForm).toBe('legacy');
    expect(manifest.fieldsDropped).toContain('close');
  });

  it('a legacy dup keeps its dup_of', () => {
    const text = LEGACY_FIXED.replace('reason: fixed', 'reason: dup').replace('  proof:', '  dup_of: SIG-198\n  proof:');
    const { record } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text });
    sound(record);
    expect(record.events[1]).toMatchObject({ reason: 'dup', dup_of: 'SIG-198', legacy: true });
  });

  it('fixed with a commit → close_requested with the bare hash; status closing; the rest of the proof → migration_note', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text: FIXED_WITH_COMMIT });
    sound(record);
    expect(record.events[1]).toEqual({ type: 'close_requested', at: '2026-10-03', by: 'claude', reason: 'fixed', proof: '3c0b504' });
    expect(deriveStatus(record)).toBe('closing');
    expect(record.migration_note).toBe('tests/backlog-reader-fixes.test.js (v0.1.46)');
    expect(manifest.closeForm).toBe('close_requested');
  });

  it('the rest of the proof joins an existing migration_note with a space', () => {
    const text = FIXED_WITH_COMMIT.replace('legacy_id: B127', 'legacy_id: B127\nmigration_note: Earlier note.');
    const { record } = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text });
    expect(record.migration_note).toBe('Earlier note. tests/backlog-reader-fixes.test.js (v0.1.46)');
  });

  it('a proof that is only the commit adds no migration_note', () => {
    const text = FIXED_WITH_COMMIT.replace(/proof: .*/, 'proof: commit a6c63f2');
    const { record } = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text });
    expect(record).not.toHaveProperty('migration_note');
  });

  it('two different commits in one proof are refused, not picked between', () => {
    const text = FIXED_WITH_COMMIT.replace(/proof: .*/, 'proof: commit a6c63f2 and commit 3c0b504');
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/more than one commit/);
  });

  it('SIG-123, SIG-142 and SIG-161 (fixed, no commit) → legacy closes keeping reason and proof text', () => {
    for (const id of ['SIG-123', 'SIG-142', 'SIG-161']) {
      const text = NO_COMMIT_ARCHIVED.replace('id: SIG-161', `id: ${id}`);
      const { record, manifest } = convertV1Item({ relPath: `work/done/2026-10/${id}.md`, text });
      sound(record);
      expect(record.events.at(-1)).toEqual({
        type: 'closed',
        at: '2026-09-30',
        by: 'M6.E11',
        reason: 'fixed',
        proof: 'DONE — M6.E11, 2026-09-30',
        legacy: true,
      });
      expect(manifest.closeForm).toBe('legacy-no-commit');
    }
  });

  it('any other fixed close with no commit is reported unmapped, never guessed', () => {
    const text = NO_COMMIT_ARCHIVED.replace('id: SIG-161', 'id: SIG-170');
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-170.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/unmapped/);
  });

  it('a bare hash without the word commit is not a commit token', () => {
    const text = FIXED_WITH_COMMIT.replace(/proof: .*/, 'proof: see 3c0b504');
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/unmapped/);
  });

  it('rejected → closed directly with its proof text', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-131.md', text: REJECTED });
    sound(record);
    expect(record.events[1]).toEqual({
      type: 'closed',
      at: '2026-10-01T23:42:57.089Z',
      by: 'brett (M6.E12 PLAN drain)',
      reason: 'rejected',
      proof: 'No longer true: plugin/references/profile-schema.md documents attention, checked 2026-10-01.',
    });
    expect(manifest.closeForm).toBe('direct');
  });

  it('wontdo and stale close directly too', () => {
    for (const reason of ['wontdo', 'stale']) {
      const { record } = convertV1Item({ relPath: 'work/done/2026-10/SIG-131.md', text: REJECTED.replace('reason: rejected', `reason: ${reason}`) });
      sound(record);
      expect(record.events[1].reason).toBe(reason);
    }
  });

  it('a direct close with no proof text is refused', () => {
    const text = REJECTED.replace(/ {2}proof: .*\n/, '');
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-131.md', text });
    expect(record).toBeNull();
    expect(manifest.errors.join(' ')).toMatch(/proof/);
  });

  it('dup → closed {reason: dup, dup_of, proof}', () => {
    const text = DUP.replace('  dup_of: SIG-112', '  proof: same headline as SIG-112\n  dup_of: SIG-112');
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-137.md', text });
    sound(record);
    expect(record.events[1]).toEqual({
      type: 'closed',
      at: '2026-10-01T23:42:56.961Z',
      by: 'brett (M6.E12 PLAN drain)',
      reason: 'dup',
      proof: 'same headline as SIG-112',
      dup_of: 'SIG-112',
    });
    expect(manifest.closeForm).toBe('dup');
  });

  // The real SIG-137 has no proof text. PLAN Decision 3: a dup close needs
  // dup_of, and proof is optional — none is invented for it.
  it('a dup with no proof text converts, with no proof written (PLAN Decision 3)', () => {
    const { record, manifest } = convertV1Item({ relPath: 'work/done/2026-10/SIG-137.md', text: DUP });
    sound(record);
    expect(manifest.errors).toEqual([]);
    expect(record.events.at(-1)).toEqual({
      type: 'closed',
      at: '2026-10-01T23:42:56.961Z',
      by: 'brett (M6.E12 PLAN drain)',
      reason: 'dup',
      dup_of: 'SIG-112',
    });
    expect(manifest.closeForm).toBe('dup');
  });

  it('an open item has closeForm null', () => {
    const { manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text: BACKLOG_WITH_CREATED });
    expect(manifest.closeForm).toBeNull();
  });
});

describe('convertV1Item — reopen history', () => {
  const HISTORY = `
history:
  - reason: wontdo
    by: claude
    at: 2026-09-10
    proof: not worth it then
    reopened_at: 2026-09-12
    reopened_by: brett
    reopen_reason: it came back
  - reason: fixed
    by: claude
    at: 2026-09-20
    proof: commit abcdef1
    reopened_at: 2026-09-21
    reopened_by: brett
    reopen_reason: regressed
`;

  it('each prior close and its reopen become events, in order; an open item ends at T', () => {
    const text = BACKLOG_WITH_CREATED.replace('created:', `${HISTORY.trim()}\ncreated:`).replace('2026-10-01T23:34:30.044Z', '2026-09-01');
    const { record, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-255.md', text });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created', 'closed', 'reopened', 'close_requested', 'reopened']);
    expect(record.events[1]).toEqual({ type: 'closed', at: '2026-09-10', by: 'claude', reason: 'wontdo', proof: 'not worth it then' });
    expect(record.events[2]).toEqual({ type: 'reopened', at: '2026-09-12', by: 'brett', reason: 'it came back' });
    expect(record.events[3]).toMatchObject({ type: 'close_requested', proof: 'abcdef1' });
    expect(record.events[4]).toEqual({ type: 'reopened', at: '2026-09-21', by: 'brett', reason: 'regressed' });
    expect(deriveStatus(record)).toBe('T');
    expect(manifest.fieldsDropped).toContain('history');
  });

  it('a reopened-then-closed item ends with its current close', () => {
    const text = LEGACY_FIXED.replace('legacy_id: B52', `legacy_id: B52\n${HISTORY.trim()}`).replace('at: 2026-09-29', 'at: 2026-09-29');
    const { record } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text });
    sound(record);
    expect(record.events.map((e) => e.type)).toEqual(['created', 'closed', 'reopened', 'close_requested', 'reopened', 'closed']);
    // Earliest known date: the first prior close.
    expect(record.events[0].at).toBe('2026-09-10');
    expect(deriveStatus(record)).toBe('C');
  });
});

describe('convertV1Item — purity', () => {
  it('the same input gives the same output', () => {
    const a = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text: FIXED_WITH_COMMIT });
    const b = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text: FIXED_WITH_COMMIT });
    expect(a).toEqual(b);
  });
});

// ---- t1.4b: body cleaning, links, manifest (AC8.1, AC8.3; D-M6E13-13) ----

// SIG-62's pasted BUGS.md row (excerpt), with the trailing pipe.
const ROW_BODY =
  '| B62 | `confirmed` | P2 | **⟨STALENESS RE-CHECK 2026-08-09⟩** The claim is squash-merge specific (`a | b` in code). |\n';
// SIG-52's row: a status cell with a version, a bold priority, no trailing pipe.
const ROW_NO_TRAILING = '| B52 | `fixed` (v0.1.20) | **P1** | **A Claude Code session binds to ONE version.** 2233 → **2269 tests**.\n';

describe('bodyDirFor', () => {
  it('buckets by thousands, two digits', () => {
    expect(bodyDirFor('SIG-5')).toBe('work/items/00');
    expect(bodyDirFor('SIG-999')).toBe('work/items/00');
    expect(bodyDirFor('SIG-1000')).toBe('work/items/01');
    expect(bodyDirFor('SIG-12345')).toBe('work/items/12');
  });
});

describe('convertV1Item — pasted table row (AC8.3)', () => {
  it('drops only the ID, status and priority cells; the rest stays as prose', () => {
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: v1(BACKLOG_NO_CREATED_FRONT, ROW_BODY), fallbackAt: '2026-09-29' });
    expect(body).toBe('**⟨STALENESS RE-CHECK 2026-08-09⟩** The claim is squash-merge specific (`a | b` in code).\n');
    expect(manifest.cellsRemoved).toEqual([
      { line: 1, cell: 'id', text: 'B62' },
      { line: 1, cell: 'status', text: '`confirmed`' },
      { line: 1, cell: 'priority', text: 'P2' },
    ]);
  });

  it('handles a status cell with a version, a bold priority, and no trailing pipe', () => {
    const text = v1(BACKLOG_NO_CREATED_FRONT.replace('B62', 'B52'), `Intro.\n\n${ROW_NO_TRAILING}`);
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text, fallbackAt: '2026-09-29' });
    expect(body).toBe('Intro.\n\n**A Claude Code session binds to ONE version.** 2233 → **2269 tests**.\n');
    expect(manifest.cellsRemoved.map((c) => [c.line, c.text])).toEqual([
      [3, 'B52'],
      [3, '`fixed` (v0.1.20)'],
      [3, '**P1**'],
    ]);
  });

  it('a dismissed row with a dash for priority', () => {
    const text = v1(BACKLOG_NO_CREATED_FRONT, '| B62 | `dismissed` | — | Not a bug. |\n');
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text, fallbackAt: '2026-09-29' });
    expect(body).toBe('Not a bug.\n');
    expect(manifest.cellsRemoved[2]).toEqual({ line: 1, cell: 'priority', text: '—' });
  });

  it('leaves a row for a different legacy ID alone', () => {
    const other = '| B12 | `fixed` | P3 | Another bug, quoted. |\n';
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: v1(BACKLOG_NO_CREATED_FRONT, other), fallbackAt: '2026-09-29' });
    expect(body).toBe(other);
    expect(manifest.cellsRemoved).toEqual([]);
  });

  it('leaves ordinary tables alone', () => {
    const table = '| Directory | Returns |\n|---|---|\n| B62 | greenfield |\n';
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: v1(BACKLOG_NO_CREATED_FRONT, table), fallbackAt: '2026-09-29' });
    expect(body).toBe(table);
    expect(manifest.cellsRemoved).toEqual([]);
  });

  it('leaves a row inside a fenced block alone', () => {
    const fenced = '```\n| B62 | `confirmed` | P2 | quoted |\n```\n';
    const { body } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: v1(BACKLOG_NO_CREATED_FRONT, fenced), fallbackAt: '2026-09-29' });
    expect(body).toBe(fenced);
  });
});

describe('convertV1Item — relative links to the items/NN depth', () => {
  it('rewrites from the v1 folder depth and lists each rewrite', () => {
    const text = v1(
      BACKLOG_NO_CREATED_FRONT,
      'See [the analysis](../../../analysis/OPENKB-ASSESSMENT.md) and [log](../../BACKLOG.md#x).\n`[code](../../keep.md)`\n[web](https://example.com)\n',
    );
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text, fallbackAt: '2026-09-29' });
    expect(body).toBe(
      'See [the analysis](../../../../analysis/OPENKB-ASSESSMENT.md) and [log](../../../BACKLOG.md#x).\n`[code](../../keep.md)`\n[web](https://example.com)\n',
    );
    expect(manifest.linksRewritten).toEqual([
      { line: 1, from: '../../../analysis/OPENKB-ASSESSMENT.md', to: '../../../../analysis/OPENKB-ASSESSMENT.md' },
      { line: 1, from: '../../BACKLOG.md#x', to: '../../../BACKLOG.md#x' },
    ]);
  });

  it('from a done/ month folder (same depth) only sibling-relative targets change', () => {
    const text = LEGACY_FIXED.replace('Body.', '[a](../../../analysis/X.md) [b](../2026-08/SIG-1.md)');
    const { body, manifest } = convertV1Item({ relPath: 'work/done/2026-09/SIG-52.md', text });
    expect(body).toBe('[a](../../../analysis/X.md) [b](../../done/2026-08/SIG-1.md)\n');
    expect(manifest.linksRewritten).toEqual([{ line: 1, from: '../2026-08/SIG-1.md', to: '../../done/2026-08/SIG-1.md' }]);
  });

  it('an Epic artifact next to an archived item keeps pointing at the Epic folder', () => {
    const text = NO_COMMIT_ARCHIVED.replace('Body.', '[req](./M6.E11-REQUIREMENTS.md)');
    const { body } = convertV1Item({ relPath: 'archive/epics/M6.E11/SIG-161.md', text });
    expect(body).toBe('[req](../../../archive/epics/M6.E11/M6.E11-REQUIREMENTS.md)\n');
  });

  it('links inside the cleaned row are rewritten too', () => {
    const row = '| B62 | `confirmed` | P2 | See [x](../../X.md). |\n';
    const { body, manifest } = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: v1(BACKLOG_NO_CREATED_FRONT, row), fallbackAt: '2026-09-29' });
    expect(body).toBe('See [x](../../../X.md).\n');
    expect(manifest.linksRewritten).toHaveLength(1);
  });
});

describe('convertV1Item — manifest shape', () => {
  it('has every key, in every outcome', () => {
    const keys = ['id', 'source', 'fieldsMapped', 'fieldsDropped', 'cellsRemoved', 'linksRewritten', 'closeForm', 'errors'];
    const ok = convertV1Item({ relPath: 'work/done/2026-10/SIG-127.md', text: FIXED_WITH_COMMIT }).manifest;
    const bad = convertV1Item({ relPath: 'work/backlog/SIG-62.md', text: BACKLOG_NO_CREATED }).manifest;
    expect(Object.keys(ok)).toEqual(keys);
    expect(Object.keys(bad)).toEqual(keys);
    expect(bad.errors).not.toEqual([]);
  });
});
