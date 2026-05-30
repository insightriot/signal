// Tests for /sig:add Slice 1 — hardened hot path (M4.5.E2.S1).
// See .planning/M4.5.E2-PLAN.md § Slice 1 and .planning/M4.5.E2-VALIDATION.md § Slice 1.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  parseInput,
  scrubSensitive,
  buildFutureIdeasEntry,
  buildOpenQuestionsEntry,
  buildMilestoneEntry,
  insertAboveFooter,
  insertAtEnd,
  insertIntoHoldingSection,
  rewriteFooter,
  checkBodyLength,
  atomicWrite,
  acquireLock,
  releaseLock,
  captureToFutureIdeas,
  captureToOpenQuestions,
  captureToMilestone,
  captureToDestination,
  resolveDestination,
  BODY_LENGTH_SOFT_CAP,
} from '../tools/lib/add.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'add');

// Helper — clone a fixture into a temp dir so tests can mutate freely.
async function setupFixture(fixtureName, tempDir) {
  const src = join(FIXTURE_ROOT, fixtureName, '.planning', 'FUTURE-IDEAS.md');
  const dest = join(tempDir, '.planning', 'FUTURE-IDEAS.md');
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(src, dest);
  return dest;
}

// Helper — clone an OPEN-QUESTIONS fixture into a temp dir (different filename
// from setupFixture, which is FUTURE-IDEAS-specific).
async function setupOpenQuestionsFixture(fixtureName, tempDir) {
  const src = join(FIXTURE_ROOT, fixtureName, '.planning', 'OPEN-QUESTIONS.md');
  const dest = join(tempDir, '.planning', 'OPEN-QUESTIONS.md');
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(src, dest);
  return dest;
}

// Helper — clone the milestone fixture (MILESTONE-5.md + STATE.md) into a temp
// dir. STATE.md's current_epic (M5.E1) resolves to MILESTONE-5.md, so the
// no-N "current milestone" path writes to the file present in the fixture.
async function setupMilestoneFixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  const planning = join(FIXTURE_ROOT, 'milestone-minimal', '.planning');
  const milestonePath = join(tempDir, '.planning', 'MILESTONE-5.md');
  await copyFile(join(planning, 'MILESTONE-5.md'), milestonePath);
  await copyFile(
    join(planning, 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
  return milestonePath;
}

describe('parseInput (pure)', () => {
  it('extracts body from a single-arg string', () => {
    expect(parseInput('use semver-it for tag publish')).toEqual({
      body: 'use semver-it for tag publish',
      flags: {},
    });
  });

  it('returns empty body for empty input', () => {
    expect(parseInput('')).toEqual({ body: '', flags: {} });
    expect(parseInput('   ')).toEqual({ body: '', flags: {} });
  });

  it('trims surrounding whitespace from body but preserves internal', () => {
    expect(parseInput('  hello  world  ').body).toBe('hello  world');
  });
});

describe('parseInput (flags) — S2.t3', () => {
  // --question is a boolean flag (no value); presence → flags.question = true.
  it('parses --question as a boolean flag, body is the remainder', () => {
    expect(parseInput('--question is X right?')).toEqual({
      body: 'is X right?',
      flags: { question: true },
    });
  });

  // --milestone with no N → boolean form (current milestone).
  it('parses --milestone (no N) as the boolean (current-milestone) form', () => {
    expect(parseInput('--milestone fix the foo')).toEqual({
      body: 'fix the foo',
      flags: { milestone: true },
    });
  });

  // --milestone N where N matches /^\d+(\.\d+)?$/ → string N, N consumed.
  it('parses --milestone N (integer) and consumes N from the body', () => {
    expect(parseInput('--milestone 5 add to M5')).toEqual({
      body: 'add to M5',
      flags: { milestone: '5' },
    });
  });

  it('parses --milestone N (decimal) and consumes N from the body', () => {
    const result = parseInput('--milestone 4.5 x');
    expect(result.flags.milestone).toBe('4.5');
    expect(result.body).toBe('x');
  });

  // Token after --milestone that is NOT a number is body, not N (boolean form).
  it('treats a non-numeric token after --milestone as body (boolean form)', () => {
    expect(parseInput('--milestone fix the bug')).toEqual({
      body: 'fix the bug',
      flags: { milestone: true },
    });
  });

  // --file <path>: the token immediately after --file is always the path.
  it('parses --file <path> and consumes the path token from the body', () => {
    expect(parseInput('--file .planning/NOTES.md raw body')).toEqual({
      body: 'raw body',
      flags: { file: '.planning/NOTES.md' },
    });
  });

  // No recognized flag → behaves exactly like the bare-body form (regression).
  it('falls back to bare-body behavior when no recognized flag is present', () => {
    expect(parseInput('use semver-it for tag publish')).toEqual({
      body: 'use semver-it for tag publish',
      flags: {},
    });
  });

  it('preserves internal double-space when no flag is present (regression)', () => {
    expect(parseInput('  hello  world  ')).toEqual({
      body: 'hello  world',
      flags: {},
    });
  });
});

describe('resolveDestination (pure guard) — S2.t3 / FR4 / R4', () => {
  it('returns future-ideas default when no destination flag is present', () => {
    expect(resolveDestination({})).toEqual({ destination: 'future-ideas' });
  });

  it('classifies --question to open-questions', () => {
    expect(resolveDestination({ question: true })).toEqual({
      destination: 'open-questions',
    });
  });

  it('classifies --milestone (boolean) to milestone with null arg (current)', () => {
    expect(resolveDestination({ milestone: true })).toEqual({
      destination: 'milestone',
      milestoneArg: null,
    });
  });

  it('classifies --milestone N to milestone with the N string', () => {
    expect(resolveDestination({ milestone: '5' })).toEqual({
      destination: 'milestone',
      milestoneArg: '5',
    });
  });

  it('classifies --file to file with the supplied path', () => {
    expect(resolveDestination({ file: '.planning/X.md' })).toEqual({
      destination: 'file',
      path: '.planning/X.md',
    });
  });

  // FR4 / R4: any 2+ destination flags throw — pure call, no temp dir, no lock.
  it('throws when --question and --milestone are both present', () => {
    expect(() => resolveDestination({ question: true, milestone: true })).toThrow();
  });

  it('throws when --milestone and --file are both present', () => {
    expect(() => resolveDestination({ milestone: true, file: 'x' })).toThrow();
  });

  it('throws when --question and --file are both present', () => {
    expect(() => resolveDestination({ question: true, file: 'x' })).toThrow();
  });

  it('names the conflicting flags in the error message', () => {
    expect(() => resolveDestination({ question: true, milestone: true })).toThrow(
      /--question.*--milestone|--milestone.*--question/
    );
  });
});

describe('scrubSensitive (pure — returns hits, never auto-redacts)', () => {
  it('returns empty hits for clean input', () => {
    expect(scrubSensitive('just an idea, nothing sensitive').hits).toEqual([]);
  });

  it('detects AWS access key pattern AKIA…', () => {
    const result = scrubSensitive('use AKIAIOSFODNN7EXAMPLE for the bucket');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0].type).toBe('aws-key');
  });

  it('detects GitHub personal token ghp_…', () => {
    const result = scrubSensitive('token ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(result.hits[0].type).toBe('github-token');
  });

  it('detects Bearer token in Authorization-style strings', () => {
    const result = scrubSensitive('curl -H "Authorization: Bearer eyJhbGc.payload.sig"');
    expect(result.hits[0].type).toBe('bearer-token');
  });

  it('detects 40-char hex blob (likely SHA / private key fragment)', () => {
    const result = scrubSensitive('hash is a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
    expect(result.hits[0].type).toBe('hex-blob-40');
  });

  it('never modifies the input body (the body field equals the input)', () => {
    const input = 'Bearer abc.def.ghi this stays verbatim';
    const result = scrubSensitive(input);
    expect(result.body).toBe(input);
  });
});

describe('checkBodyLength (pure)', () => {
  it('reports tooLong=false for body under soft cap', () => {
    expect(checkBodyLength('short body').tooLong).toBe(false);
  });

  it('reports tooLong=true for body over soft cap', () => {
    const long = 'x'.repeat(BODY_LENGTH_SOFT_CAP + 1);
    const result = checkBodyLength(long);
    expect(result.tooLong).toBe(true);
    expect(result.length).toBe(BODY_LENGTH_SOFT_CAP + 1);
  });

  it('soft cap is 4000 chars (matches plan acceptance criterion 9)', () => {
    expect(BODY_LENGTH_SOFT_CAP).toBe(4000);
  });
});

describe('buildFutureIdeasEntry (pure)', () => {
  it('produces a heading from the first ~6 words of body', () => {
    const entry = buildFutureIdeasEntry({
      body: 'use semver-it for tag publish hooks',
      date: '2026-05-14',
    });
    expect(entry).toMatch(/^## /);
    expect(entry).toMatch(/use semver-it/i);
  });

  it('includes a Status line with the date and /sig:add provenance', () => {
    const entry = buildFutureIdeasEntry({
      body: 'short note',
      date: '2026-05-14',
    });
    expect(entry).toMatch(/\*\*Status:\*\* Logged 2026-05-14 via `\/sig:add`\./);
  });

  it('appends trigger context to Status when provided', () => {
    const entry = buildFutureIdeasEntry({
      body: 'short note',
      date: '2026-05-14',
      triggerContext: 'mid-EXECUTE on M4.5.E2',
    });
    expect(entry).toMatch(/mid-EXECUTE on M4\.5\.E2/);
  });

  it('ends with the --- separator', () => {
    const entry = buildFutureIdeasEntry({ body: 'foo', date: '2026-05-14' });
    expect(entry.trimEnd().endsWith('---')).toBe(true);
  });

  it('preserves the body verbatim (no LLM rewrite, no smart-quoting)', () => {
    const body = 'fix the FOO and the "bar" — with backtick `code`';
    const entry = buildFutureIdeasEntry({ body, date: '2026-05-14' });
    expect(entry).toContain(body);
  });

  it('caps heading at 60 chars to avoid wall-of-title', () => {
    const longBody = 'a '.repeat(80).trim();
    const entry = buildFutureIdeasEntry({ body: longBody, date: '2026-05-14' });
    const heading = entry.split('\n')[0];
    expect(heading.length).toBeLessThanOrEqual(63); // '## ' + ≤60 chars
  });
});

describe('buildOpenQuestionsEntry (pure) — S2.t4 / FR1', () => {
  it('starts with a ## heading derived from the first ~6 words of body', () => {
    const entry = buildOpenQuestionsEntry({
      body: 'should we cache tokens?',
      date: '2026-05-30',
    });
    expect(entry).toMatch(/^## /);
    expect(entry).toMatch(/should we cache tokens/i);
  });

  it('includes a Status line with the date and /sig:add provenance', () => {
    const entry = buildOpenQuestionsEntry({
      body: 'should we cache tokens?',
      date: '2026-05-30',
    });
    expect(entry).toMatch(/\*\*Status:\*\* Open — logged 2026-05-30 via `\/sig:add`\./);
  });

  it('contains the body verbatim (no LLM rewrite, no smart-quoting)', () => {
    const body = 'should we cache "tokens" — even the `ghp`-shaped ones?';
    const entry = buildOpenQuestionsEntry({ body, date: '2026-05-30' });
    expect(entry).toContain(body);
  });

  it('ends with the --- separator (OPEN-QUESTIONS entries are ---separated)', () => {
    const entry = buildOpenQuestionsEntry({
      body: 'should we cache tokens?',
      date: '2026-05-30',
    });
    expect(entry.trimEnd().endsWith('---')).toBe(true);
  });

  it('appends trigger context to the Status line when provided', () => {
    const entry = buildOpenQuestionsEntry({
      body: 'should we cache tokens?',
      date: '2026-05-30',
      triggerContext: 'mid-EXECUTE on M4.5.E2',
    });
    expect(entry).toMatch(/mid-EXECUTE on M4\.5\.E2/);
  });
});

describe('insertAtEnd (pure) — S2.t4', () => {
  it('appends the entry below the existing trailing --- with one blank line', () => {
    const before = '# Open Questions\n\nintro\n\n## existing\n\nbody\n\n---\n';
    const after = insertAtEnd(before, '## new\n\nnew body\n\n---');
    expect(after.indexOf('## new')).toBeGreaterThan(after.indexOf('## existing'));
    expect(after).toContain('## new');
  });

  it('leaves the pre-existing content (to its last non-whitespace char) byte-identical', () => {
    const before = '# Open Questions\n\nintro\n\n## existing\n\nbody\n\n---\n';
    const prefix = before.replace(/\s+$/, '');
    const after = insertAtEnd(before, '## new\n\nnew body\n\n---');
    expect(after.startsWith(prefix)).toBe(true);
  });

  it('ends with a single trailing newline', () => {
    const before = '# Open Questions\n\n## existing\n\n---\n';
    const after = insertAtEnd(before, '## new\n\n---');
    expect(after.endsWith('---\n')).toBe(true);
    expect(after.endsWith('---\n\n')).toBe(false);
  });
});

describe('buildMilestoneEntry (pure) — S2.t5 / FR2', () => {
  it('uses an ### (h3) heading — it lives UNDER the ## holding section', () => {
    const entry = buildMilestoneEntry({
      body: 'switch the publish hook to semver-it',
      date: '2026-05-30',
    });
    expect(entry).toMatch(/^### /);
    expect(entry).toMatch(/switch the publish hook/i);
  });

  it('includes a **Captured:** line with the date and /sig:add provenance', () => {
    const entry = buildMilestoneEntry({
      body: 'a milestone note',
      date: '2026-05-30',
    });
    expect(entry).toMatch(/\*\*Captured:\*\* 2026-05-30 via `\/sig:add`\./);
  });

  it('contains the body verbatim (no LLM rewrite, no smart-quoting)', () => {
    const body = 'keep the "quotes" and the `code` and the — em dash';
    const entry = buildMilestoneEntry({ body, date: '2026-05-30' });
    expect(entry).toContain(body);
  });

  it('appends trigger context to the Captured line when provided', () => {
    const entry = buildMilestoneEntry({
      body: 'a milestone note',
      date: '2026-05-30',
      triggerContext: 'mid-EXECUTE on M5.E1',
    });
    expect(entry).toMatch(/mid-EXECUTE on M5\.E1/);
  });
});

describe('insertIntoHoldingSection (pure) — S2.t5 / FR2 / R5', () => {
  const ENTRY = '### A new capture\n\n**Captured:** 2026-05-30 via `/sig:add`.\n\nbody text';

  // Case (a): no section + no footer → append section at EOF.
  it('(a) no section + no footer: appends the section at EOF, plan body byte-identical', () => {
    const before = '# Milestone\n\n## Goals\n\n- do the thing\n';
    const after = insertIntoHoldingSection(before, ENTRY);
    // Plan body survives byte-identical up to its last non-whitespace char.
    const prefix = before.replace(/\s+$/, '');
    expect(after.startsWith(prefix)).toBe(true);
    expect(after).toContain('## Captured via /sig:add');
    expect(after).toContain('### A new capture');
    // The holding section sits below the plan body.
    expect(after.indexOf('## Captured via /sig:add')).toBeGreaterThan(
      after.indexOf('## Goals')
    );
    expect(after.endsWith('\n')).toBe(true);
    expect(after.endsWith('\n\n')).toBe(false);
  });

  // Case (b): no section + footer → insert section ABOVE the footer.
  it('(b) no section + footer: inserts the section above the *Created* footer, footer stays last', () => {
    const before =
      '# Milestone\n\n## Goals\n\n- do the thing\n\n*Created 2026-05-01.*\n';
    const after = insertIntoHoldingSection(before, ENTRY);
    expect(after).toContain('## Captured via /sig:add');
    // Section is above the footer; footer remains the final non-empty line.
    expect(after.indexOf('## Captured via /sig:add')).toBeLessThan(
      after.indexOf('*Created 2026-05-01.*')
    );
    const lastNonEmpty = after
      .split('\n')
      .filter((l) => l.trim() !== '')
      .at(-1);
    expect(lastNonEmpty).toBe('*Created 2026-05-01.*');
    // Plan body (everything before the footer/section) untouched.
    expect(after).toContain('## Goals');
    expect(after).toContain('- do the thing');
  });

  // Case (c): section exists → append a 2nd entry to the END of that section.
  it('(c) section exists: a 2nd entry reuses the SAME section (one ##, two ###)', () => {
    const before =
      '# Milestone\n\n## Goals\n\nbody\n\n## Captured via /sig:add\n\n### First capture\n\n**Captured:** 2026-05-29 via `/sig:add`.\n\nfirst body\n';
    const after = insertIntoHoldingSection(before, ENTRY);
    // Exactly one holding-section heading; two ### entries.
    expect(after.match(/^## Captured via \/sig:add$/gm)).toHaveLength(1);
    expect(after.match(/^### /gm)).toHaveLength(2);
    // New entry sits AFTER the first one (appended to the end of the section).
    expect(after.indexOf('### A new capture')).toBeGreaterThan(
      after.indexOf('### First capture')
    );
    // First entry's content survives.
    expect(after).toContain('first body');
  });

  // Case (d): section exists followed by OTHER ## headings → entry lands at the
  // end of the section's own content, before the next ## heading.
  it('(d) section followed by other ## headings: entry lands before the next ## heading', () => {
    const before =
      '# Milestone\n\n## Captured via /sig:add\n\n### First capture\n\nfirst body\n\n## Later Section\n\nlater content\n';
    const after = insertIntoHoldingSection(before, ENTRY);
    expect(after.match(/^## Captured via \/sig:add$/gm)).toHaveLength(1);
    // New entry is inside the holding section: after First capture, before
    // the Later Section heading.
    expect(after.indexOf('### A new capture')).toBeGreaterThan(
      after.indexOf('### First capture')
    );
    expect(after.indexOf('### A new capture')).toBeLessThan(
      after.indexOf('## Later Section')
    );
    // The following plan section is preserved verbatim and stays after.
    expect(after).toContain('## Later Section');
    expect(after).toContain('later content');
  });
});

describe('rewriteFooter (pure)', () => {
  it('rewrites an existing *Last updated:* line to today', () => {
    const before = '## entry\n\nbody\n\n---\n\n*Last updated: 2020-01-01*\n';
    const after = rewriteFooter(before, '2026-05-14');
    expect(after).toContain('*Last updated: 2026-05-14*');
    expect(after).not.toContain('2020-01-01');
  });

  it('appends a footer if none exists', () => {
    const before = '## entry\n\nbody\n\n---\n';
    const after = rewriteFooter(before, '2026-05-14');
    expect(after.trimEnd().endsWith('*Last updated: 2026-05-14*')).toBe(true);
  });

  it('preserves all content above the footer', () => {
    const before = 'line 1\nline 2\n\n---\n\n*Last updated: 1999-12-31*\n';
    const after = rewriteFooter(before, '2026-05-14');
    expect(after).toContain('line 1');
    expect(after).toContain('line 2');
  });
});

describe('insertAboveFooter (pure)', () => {
  it('inserts a new entry block above the footer', () => {
    const before = '# Title\n\n## existing\n\nbody\n\n---\n\n*Last updated: 2020-01-01*\n';
    const entry = '## new entry\n\nbody\n\n---';
    const after = insertAboveFooter(before, entry);
    // Footer remains last (rewriteFooter will update its date separately)
    expect(after.indexOf('## new entry')).toBeLessThan(after.indexOf('*Last updated:'));
    expect(after.indexOf('## existing')).toBeLessThan(after.indexOf('## new entry'));
  });

  it('appends to end-of-file if no footer exists', () => {
    const before = '# Title\n\n## existing\n\nbody\n\n---\n';
    const entry = '## new entry\n\nbody\n\n---';
    const after = insertAboveFooter(before, entry);
    expect(after).toContain('## new entry');
    expect(after.indexOf('## new entry')).toBeGreaterThan(after.indexOf('## existing'));
  });

  it('preserves the existing entry separators', () => {
    const before = '# Title\n\n## first\nbody1\n\n---\n\n## second\nbody2\n\n---\n\n*Last updated: 2020-01-01*\n';
    const after = insertAboveFooter(before, '## third\nbody3\n\n---');
    // Both prior separators still present
    expect(after.match(/^---$/gm)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('atomicWrite (I/O)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes content to the target path', async () => {
    const target = join(tempDir, 'out.md');
    await atomicWrite(target, 'hello world');
    expect(await readFile(target, 'utf-8')).toBe('hello world');
  });

  it('does not leave a .tmp- file behind on success', async () => {
    const target = join(tempDir, 'out.md');
    await atomicWrite(target, 'hello');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(tempDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp-'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('leaves destination unchanged if rename throws (atomic-fail invariant)', async () => {
    const target = join(tempDir, 'out.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');
    const renameFn = async () => {
      throw new Error('simulated rename failure');
    };
    await expect(atomicWrite(target, 'NEW', { renameFn })).rejects.toThrow(/simulated rename/);
    // Destination unchanged
    expect(await readFile(target, 'utf-8')).toBe('ORIGINAL');
  });

  it('falls back to copy+unlink when rename throws EXDEV (cross-filesystem)', async () => {
    const target = join(tempDir, 'out.md');
    let callCount = 0;
    const renameFn = async (...args) => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('cross-device link');
        err.code = 'EXDEV';
        throw err;
      }
      // Subsequent calls (should not happen — fallback uses copy+unlink, not rename)
      const { rename } = await import('node:fs/promises');
      return rename(...args);
    };
    await atomicWrite(target, 'NEW', { renameFn });
    expect(await readFile(target, 'utf-8')).toBe('NEW');
  });
});

describe('acquireLock / releaseLock (I/O)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the lock file on acquire', async () => {
    await acquireLock(tempDir);
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(true);
    await releaseLock(tempDir);
  });

  it('rejects a second acquire while the first is held (and lock is fresh)', async () => {
    await acquireLock(tempDir);
    await expect(acquireLock(tempDir)).rejects.toThrow(/Another `\/sig:add` is running/);
    await releaseLock(tempDir);
  });

  it('removes the lock file on release', async () => {
    await acquireLock(tempDir);
    await releaseLock(tempDir);
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  it('treats a stale lock (older than TTL) as releasable', async () => {
    // Manually plant a stale lock with an old timestamp.
    const lockPath = join(tempDir, '.planning', '.add.lock');
    const stale = `99999\n${Date.now() - 60_000}\n`; // 60s ago, well over 30s TTL
    await writeFile(lockPath, stale, 'utf-8');
    // Acquire should succeed by overwriting the stale lock.
    await expect(acquireLock(tempDir)).resolves.toBeDefined();
    await releaseLock(tempDir);
  });
});

describe('captureToFutureIdeas (integration)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes an entry above the footer and rewrites footer date', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const result = await captureToFutureIdeas(tempDir, {
      body: 'use semver-it for tag publish',
      today: '2026-05-14',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.path).toBe(join(tempDir, '.planning', 'FUTURE-IDEAS.md'));
    const content = await readFile(result.path, 'utf-8');
    expect(content).toContain('use semver-it for tag publish');
    expect(content).toContain('*Last updated: 2026-05-14*');
    expect(content).not.toContain('*Last updated: 2026-05-12*');
  });

  it('throws when .planning/ is missing (acceptance criterion 2)', async () => {
    // tempDir has no .planning/
    await expect(
      captureToFutureIdeas(tempDir, {
        body: 'idea',
        today: '2026-05-14',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/sig:init/);
  });

  it('aborts cleanly when sensitive scrub prompt returns "abort"', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const path = join(tempDir, '.planning', 'FUTURE-IDEAS.md');
    const before = await readFile(path, 'utf-8');
    const result = await captureToFutureIdeas(tempDir, {
      body: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      today: '2026-05-14',
      sensitivePrompt: async () => 'abort',
    });
    expect(result.written).toBe(false);
    expect(result.aborted).toBe('sensitive-data');
    // File unchanged
    expect(await readFile(path, 'utf-8')).toBe(before);
  });

  it('writes verbatim when sensitive scrub prompt returns "keep"', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const result = await captureToFutureIdeas(tempDir, {
      body: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      today: '2026-05-14',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    const content = await readFile(result.path, 'utf-8');
    expect(content).toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('reports line number of the new entry in the success result', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const result = await captureToFutureIdeas(tempDir, {
      body: 'idea text here',
      today: '2026-05-14',
      sensitivePrompt: async () => 'keep',
    });
    expect(typeof result.line).toBe('number');
    expect(result.line).toBeGreaterThan(0);
  });

  it('warns and consults bodyLengthPrompt when body exceeds soft cap (criterion 9)', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const longBody = 'x'.repeat(BODY_LENGTH_SOFT_CAP + 100);
    let prompted = false;
    const result = await captureToFutureIdeas(tempDir, {
      body: longBody,
      today: '2026-05-14',
      sensitivePrompt: async () => 'keep',
      bodyLengthPrompt: async () => {
        prompted = true;
        return 'keep';
      },
    });
    expect(prompted).toBe(true);
    expect(result.written).toBe(true);
  });

  it('aborts cleanly when bodyLengthPrompt returns "abort"', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const longBody = 'x'.repeat(BODY_LENGTH_SOFT_CAP + 100);
    const result = await captureToFutureIdeas(tempDir, {
      body: longBody,
      today: '2026-05-14',
      sensitivePrompt: async () => 'keep',
      bodyLengthPrompt: async () => 'abort',
    });
    expect(result.written).toBe(false);
    expect(result.aborted).toBe('body-length');
  });

  it('refuses concurrent capture (lock held)', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    // Hold the lock manually
    await acquireLock(tempDir);
    await expect(
      captureToFutureIdeas(tempDir, {
        body: 'idea',
        today: '2026-05-14',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/Another `\/sig:add` is running/);
    await releaseLock(tempDir);
  });
});

describe('captureToOpenQuestions (integration) — S2.t4 / FR1 / R3', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes a well-formed entry and reports written:true + path + line', async () => {
    const path = await setupOpenQuestionsFixture('open-questions-minimal', tempDir);
    const result = await captureToOpenQuestions(tempDir, {
      body: 'should we cache tokens?',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.path).toBe(path);
    expect(typeof result.line).toBe('number');
    expect(result.line).toBeGreaterThan(0);

    const content = await readFile(path, 'utf-8');
    // Body present, in OPEN-QUESTIONS shape (heading + Status line, --- end).
    expect(content).toContain('should we cache tokens?');
    expect(content).toMatch(/## Should we cache tokens\?/);
    expect(content).toMatch(/\*\*Status:\*\* Open — logged 2026-05-30 via `\/sig:add`\./);
    expect(content.trimEnd().endsWith('---')).toBe(true);
  });

  it('leaves all pre-existing content byte-identical (full-file prefix equality)', async () => {
    const path = await setupOpenQuestionsFixture('open-questions-minimal', tempDir);
    const original = await readFile(path, 'utf-8');
    // The region that must survive untouched: everything up to the last
    // non-whitespace char of the original file.
    const originalPrefix = original.replace(/\s+$/, '');

    await captureToOpenQuestions(tempDir, {
      body: 'a brand new open question',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });

    const after = await readFile(path, 'utf-8');
    expect(after.startsWith(originalPrefix)).toBe(true);
    // Pre-existing entries + their separators intact.
    expect(after).toContain('## Should the cache TTL be configurable');
    expect(after).toContain('## Do we need a second log level');
    // The new entry sits below the prior content.
    expect(after.indexOf('a brand new open question')).toBeGreaterThan(
      after.indexOf('## Do we need a second log level')
    );
    // No FUTURE-IDEAS-style footer was introduced (this destination has none).
    expect(after).not.toContain('*Last updated:');
  });

  it('scrub still fires for THIS destination (R3/R7): aborts and leaves file unchanged', async () => {
    const path = await setupOpenQuestionsFixture('open-questions-minimal', tempDir);
    const before = await readFile(path, 'utf-8');
    const result = await captureToOpenQuestions(tempDir, {
      body: 'leaking ghp_abcdefghijklmnopqrstuvwxyz0123456789 here',
      today: '2026-05-30',
      sensitivePrompt: async () => 'abort',
    });
    expect(result).toEqual({ written: false, aborted: 'sensitive-data' });
    expect(await readFile(path, 'utf-8')).toBe(before);
    // No lock left behind (scrub abort precedes lock acquisition).
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  it('writes verbatim when the scrub prompt returns "keep"', async () => {
    const path = await setupOpenQuestionsFixture('open-questions-minimal', tempDir);
    const result = await captureToOpenQuestions(tempDir, {
      body: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    const content = await readFile(path, 'utf-8');
    expect(content).toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('throws a clear error when OPEN-QUESTIONS.md is missing', async () => {
    // tempDir has no .planning/OPEN-QUESTIONS.md
    await expect(
      captureToOpenQuestions(tempDir, {
        body: 'idea',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/OPEN-QUESTIONS|sig:init/);
  });
});

describe('captureToMilestone (integration) — S2.t5 / FR2 / R5', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // FR2.1: --milestone (milestoneArg:null) resolves the current milestone from
  // STATE.md (current_epic: M5.E1 → MILESTONE-5.md) and writes the holding
  // section; the rest of the file stays byte-identical, footer preserved.
  it('FR2.1: --milestone (current) creates the holding section; plan body byte-identical', async () => {
    const milestonePath = await setupMilestoneFixture(tempDir);
    const original = await readFile(milestonePath, 'utf-8');
    // Region that must survive untouched: everything up to (and excluding) the
    // trailing footer line. The section is inserted above the footer.
    const beforeFooter = original.slice(0, original.indexOf('*Created 2026-05-01.*'));

    const result = await captureToMilestone(tempDir, {
      milestoneArg: null,
      body: 'a thought to drop into the current milestone',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.path).toBe(milestonePath);
    expect(typeof result.line).toBe('number');
    expect(result.line).toBeGreaterThan(0);

    const after = await readFile(milestonePath, 'utf-8');
    // Plan body before the footer is byte-identical (the section + footer come
    // after it).
    expect(after.startsWith(beforeFooter)).toBe(true);
    expect(after).toContain('## Captured via /sig:add');
    // Heading is the first ~6 words of the body, sentence-cased.
    expect(after).toContain('### A thought to drop into the');
    expect(after).toContain('a thought to drop into the current milestone');
    // Footer preserved and still last.
    const lastNonEmpty = after
      .split('\n')
      .filter((l) => l.trim() !== '')
      .at(-1);
    expect(lastNonEmpty).toBe('*Created 2026-05-01.*');
    // Structured plan headings untouched.
    expect(after).toContain('## Goals');
    expect(after).toContain('## Epics');
  });

  // FR2.2: no current milestone (current_epic null) → throws, NO write.
  it('FR2.2: no current milestone → throws, writes nothing', async () => {
    // A temp project whose STATE.md has no current_epic.
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    const milestonePath = join(tempDir, '.planning', 'MILESTONE-5.md');
    await writeFile(milestonePath, '# Milestone 5\n\n## Goals\n\nbody\n', 'utf-8');
    const stateNoEpic =
      '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\nlast_decision_at: null\nlast_updated_commit: null\nlast_updated: 2026-05-30T00:00:00.000Z\n---\n# State\n';
    await writeFile(join(tempDir, '.planning', 'STATE.md'), stateNoEpic, 'utf-8');
    const before = await readFile(milestonePath, 'utf-8');

    await expect(
      captureToMilestone(tempDir, {
        milestoneArg: null,
        body: 'orphan thought',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/no current milestone|current milestone/i);
    // No write: the milestone file is unchanged and no holding section appeared.
    expect(await readFile(milestonePath, 'utf-8')).toBe(before);
  });

  // FR2.3: --milestone 5 (explicit N) → writes to MILESTONE-5.md.
  it('FR2.3: --milestone 5 (explicit N) writes to MILESTONE-5.md', async () => {
    const milestonePath = await setupMilestoneFixture(tempDir);
    const result = await captureToMilestone(tempDir, {
      milestoneArg: '5',
      body: 'explicit-N capture',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.path).toBe(milestonePath);
    const after = await readFile(milestonePath, 'utf-8');
    expect(after).toContain('## Captured via /sig:add');
    expect(after).toContain('explicit-N capture');
  });

  // FR2.4: --milestone 99 (MILESTONE-99.md absent) → throws scaffold-out-of-
  // scope error, NO write (no file created).
  it('FR2.4: --milestone 99 (file absent) → throws scaffolding-out-of-scope, no write', async () => {
    await setupMilestoneFixture(tempDir);
    await expect(
      captureToMilestone(tempDir, {
        milestoneArg: '99',
        body: 'capture into a non-existent milestone',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/out of scope|does not exist/i);
    // No MILESTONE-99.md was scaffolded.
    expect(existsSync(join(tempDir, '.planning', 'MILESTONE-99.md'))).toBe(false);
  });

  // FR2 AC: a 2nd capture reuses the SAME ## Captured via /sig:add section.
  it('second capture reuses the same holding section (one ##, two ###)', async () => {
    const milestonePath = await setupMilestoneFixture(tempDir);
    await captureToMilestone(tempDir, {
      milestoneArg: '5',
      body: 'first milestone capture',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    await captureToMilestone(tempDir, {
      milestoneArg: '5',
      body: 'second milestone capture',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    const after = await readFile(milestonePath, 'utf-8');
    expect(after.match(/^## Captured via \/sig:add$/gm)).toHaveLength(1);
    expect(after.match(/^### /gm)).toHaveLength(2);
    expect(after).toContain('first milestone capture');
    expect(after).toContain('second milestone capture');
    // Both entries live above the footer.
    const lastNonEmpty = after
      .split('\n')
      .filter((l) => l.trim() !== '')
      .at(-1);
    expect(lastNonEmpty).toBe('*Created 2026-05-01.*');
  });

  // R5/R7 spine reuse: scrub fires for THIS destination too.
  it('scrub fires for the milestone destination (R5/R7): aborts and leaves file unchanged', async () => {
    const milestonePath = await setupMilestoneFixture(tempDir);
    const before = await readFile(milestonePath, 'utf-8');
    const result = await captureToMilestone(tempDir, {
      milestoneArg: '5',
      body: 'leaking ghp_abcdefghijklmnopqrstuvwxyz0123456789 here',
      today: '2026-05-30',
      sensitivePrompt: async () => 'abort',
    });
    expect(result).toEqual({ written: false, aborted: 'sensitive-data' });
    expect(await readFile(milestonePath, 'utf-8')).toBe(before);
    // No lock left behind (scrub abort precedes lock acquisition).
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });
});

describe('captureToDestination (spine)', () => {
  // S2.t1 — the generalized, destination-agnostic write spine. These tests
  // prove scrub + body-length + lock + atomicWrite fire for ANY destination,
  // not just FUTURE-IDEAS (closes R7: "scrub must fire for every destination").
  let tempDir;
  const ARBITRARY = join('.planning', 'ARBITRARY.md');

  // A trivial destination contract: append the entry plus a newline. No footer
  // rewrite, no insert-above-footer — deliberately unlike FUTURE-IDEAS, so the
  // tests exercise the spine itself rather than FUTURE-IDEAS-specific behavior.
  const trivialBuildEntry = ({ body, date }) => `## entry ${date}\n\n${body}\n\n---`;
  const trivialInsert = (content, entry) => `${content}\n${entry}\n`;

  async function seedArbitrary(initial = '# Arbitrary\n\nseed content\n') {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(join(tempDir, ARBITRARY), initial, 'utf-8');
    return join(tempDir, ARBITRARY);
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('scrub fires for an arbitrary destination (R7): aborts and leaves file unchanged', async () => {
    const target = await seedArbitrary();
    const before = await readFile(target, 'utf-8');
    const result = await captureToDestination(tempDir, {
      relPath: ARBITRARY,
      buildEntry: trivialBuildEntry,
      insert: trivialInsert,
      body: 'leaking ghp_abcdefghijklmnopqrstuvwxyz0123456789 here',
      today: '2026-05-30',
      sensitivePrompt: async () => 'abort',
    });
    expect(result).toEqual({ written: false, aborted: 'sensitive-data' });
    // File untouched — abort happens before the lock and before any write.
    expect(await readFile(target, 'utf-8')).toBe(before);
    // No lock left behind (scrub abort precedes lock acquisition).
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  it('body-length prompt fires for an arbitrary destination: aborts on decline', async () => {
    const target = await seedArbitrary();
    const before = await readFile(target, 'utf-8');
    const longBody = 'x'.repeat(BODY_LENGTH_SOFT_CAP + 50);
    const result = await captureToDestination(tempDir, {
      relPath: ARBITRARY,
      buildEntry: trivialBuildEntry,
      insert: trivialInsert,
      body: longBody,
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
      bodyLengthPrompt: async () => 'abort',
    });
    expect(result).toEqual({ written: false, aborted: 'body-length' });
    expect(await readFile(target, 'utf-8')).toBe(before);
  });

  it('happy path on an arbitrary destination writes the entry and reports a positive line', async () => {
    const target = await seedArbitrary();
    const result = await captureToDestination(tempDir, {
      relPath: ARBITRARY,
      buildEntry: trivialBuildEntry,
      insert: trivialInsert,
      body: 'a destination-agnostic capture',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.path).toBe(target);
    expect(typeof result.line).toBe('number');
    expect(result.line).toBeGreaterThan(0);
    const content = await readFile(target, 'utf-8');
    expect(content).toContain('a destination-agnostic capture');
    expect(content).toContain('seed content'); // pre-existing content preserved
    // Lock released after a successful write.
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  it('throws a custom missingFileError when the destination does not exist', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await expect(
      captureToDestination(tempDir, {
        relPath: join('.planning', 'NOPE.md'),
        buildEntry: trivialBuildEntry,
        insert: trivialInsert,
        body: 'idea',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
        missingFileError: 'custom: NOPE.md is not here',
      })
    ).rejects.toThrow(/custom: NOPE\.md is not here/);
  });

  it('delegation: captureToFutureIdeas still writes above the footer and rewrites the footer date', async () => {
    await setupFixture('future-ideas-minimal', tempDir);
    const result = await captureToFutureIdeas(tempDir, {
      body: 'routed through the shared spine',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    const content = await readFile(result.path, 'utf-8');
    // FUTURE-IDEAS-specific behavior survives the refactor: the entry lands in
    // the file and the footer date is rewritten to today.
    expect(content).toContain('routed through the shared spine');
    expect(content).toContain('*Last updated: 2026-05-30*');
    expect(content).not.toContain('*Last updated: 2026-05-12*');
    // The footer line is the final non-empty line — proves the new entry was
    // inserted ABOVE it, not appended after it (FUTURE-IDEAS insert closure).
    const lastNonEmpty = content
      .split('\n')
      .filter((l) => l.trim() !== '')
      .at(-1);
    expect(lastNonEmpty).toBe('*Last updated: 2026-05-30*');
  });
});
