// Tests for /sig:add Slice 1 — hardened hot path (M4.5.E2.S1).
// See .planning/M4.5.E2-PLAN.md § Slice 1 and .planning/M4.5.E2-VALIDATION.md § Slice 1.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import * as addModule from '../tools/lib/add.js';
import {
  parseInput,
  resolveOnboardingMode,
  onboardedFlagPath,
  isOnboarded,
  markOnboarded,
  detectProjectKind,
  buildMissingPlanningError,
  scrubSensitive,
  buildFutureIdeasEntry,
  buildOpenQuestionsEntry,
  buildMilestoneEntry,
  insertAboveFooter,
  insertFutureIdeasEntry,
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
  assertSafeFilePath,
  insertRawAboveLastSeparator,
  captureToFile,
  isBlank,
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

  // S3.t2: trailing-anchored footer detection. A fenced `*Last updated:*`
  // SAMPLE earlier in the file must not be treated as THE footer (the old
  // first-match findIndex corrupted the entry containing the sample).
  it('ignores a fenced *Last updated:* sample and inserts above the real trailing footer', () => {
    const before = [
      '# FUTURE-IDEAS',
      '',
      '## Idea with a footer sample',
      '',
      'A footer looks like:',
      '',
      '```',
      '*Last updated: 2099-09-09*',
      '```',
      '',
      '---',
      '',
      '*Last updated: 2020-01-01*',
      '',
    ].join('\n');
    const after = insertAboveFooter(before, '## new entry\n\nbody\n\n---');
    // Inserted above the REAL (trailing) footer, i.e. AFTER the fenced sample.
    expect(after.indexOf('## new entry')).toBeGreaterThan(after.indexOf('2099-09-09'));
    expect(after.indexOf('## new entry')).toBeLessThan(after.lastIndexOf('*Last updated:'));
    // The fenced sample is untouched.
    expect(after).toContain('*Last updated: 2099-09-09*');
  });
});

describe('insertFutureIdeasEntry (S3.t2 — trailing-anchored + fence-aware footer repair, FR4b)', () => {
  const ENTRY = '## New idea\n\nNew body.\n\n---';

  // AC4.5 — a well-formed file: entry lands above the footer, footer date
  // bumps, everything else stays byte-identical; no spurious repair.
  it('AC4.5: well-formed file — entry above footer, date bumped, no repair', () => {
    const before =
      '# FUTURE-IDEAS\n\n## Existing idea\n\nBody of existing.\n\n---\n\n*Last updated: 2020-01-01*\n';
    const { content, repaired } = insertFutureIdeasEntry(before, ENTRY, '2026-07-05');
    expect(repaired).toBe(false);
    expect(content).toContain('## New idea');
    expect(content.indexOf('## New idea')).toBeLessThan(content.indexOf('*Last updated:'));
    expect(content).toContain('*Last updated: 2026-07-05*');
    expect(content).not.toContain('2020-01-01');
    // Pre-existing entry preserved verbatim (prefix byte-identical).
    expect(content.startsWith('# FUTURE-IDEAS\n\n## Existing idea\n\nBody of existing.')).toBe(true);
    // Exactly one footer.
    expect((content.match(/^\*Last updated:/gm) || []).length).toBe(1);
  });

  // AC4.4 — stranded content below a mid-file footer: repair to a single
  // footer at true EOF, nothing lost, entry landed above it, announced.
  it('AC4.4: stranded content below the footer — repaired to single EOF footer, nothing lost', () => {
    const before = [
      '# FUTURE-IDEAS',
      '',
      '## Idea one',
      '',
      'Body one.',
      '',
      '---',
      '',
      '*Last updated: 2020-01-01*',
      '',
      '## Stranded idea',
      '',
      'This got appended below the footer.',
      '',
    ].join('\n');
    const { content, repaired } = insertFutureIdeasEntry(before, ENTRY, '2026-07-05');
    expect(repaired).toBe(true);
    // Nothing lost — both pre-existing ideas survive.
    expect(content).toContain('## Idea one');
    expect(content).toContain('## Stranded idea');
    expect(content).toContain('## New idea');
    // Exactly one footer, at true EOF, today's date; stale date gone.
    expect((content.match(/^\*Last updated:/gm) || []).length).toBe(1);
    expect(content.trimEnd().endsWith('*Last updated: 2026-07-05*')).toBe(true);
    expect(content).not.toContain('2020-01-01');
  });

  // Fenced-sample false positive at the integration level: a well-formed file
  // whose entry contains a fenced footer sample must NOT be flagged as needing
  // repair, and the sample must survive.
  it('does not treat a fenced *Last updated:* sample as the footer (no false repair)', () => {
    const before = [
      '# FUTURE-IDEAS',
      '',
      '## Idea with a sample',
      '',
      '```',
      '*Last updated: 2099-09-09*',
      '```',
      '',
      '---',
      '',
      '*Last updated: 2020-01-01*',
      '',
    ].join('\n');
    const { content, repaired } = insertFutureIdeasEntry(before, ENTRY, '2026-07-05');
    expect(repaired).toBe(false);
    expect(content).toContain('*Last updated: 2099-09-09*'); // sample untouched
    expect(content).toContain('## New idea');
    // The real (non-fenced) footer bumped; the fenced sample date unchanged.
    expect(content).toContain('*Last updated: 2026-07-05*');
  });

  // Footerless file: append entry + a fresh footer, no repair flag.
  it('appends an entry + footer to a footerless file without flagging repair', () => {
    const before = '# FUTURE-IDEAS\n\n## Only idea\n\nBody.\n';
    const { content, repaired } = insertFutureIdeasEntry(before, ENTRY, '2026-07-05');
    expect(repaired).toBe(false);
    expect(content).toContain('## New idea');
    expect(content.trimEnd().endsWith('*Last updated: 2026-07-05*')).toBe(true);
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
    expect(result.repaired).toBe(false); // well-formed → no repair (S3.t2)
  });

  it('threads repaired:true and normalizes a stranded-footer file (S3.t2 integration)', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    const stranded = [
      '# FUTURE-IDEAS',
      '',
      '## Idea one',
      '',
      'Body one.',
      '',
      '*Last updated: 2020-01-01*',
      '',
      '## Stranded idea',
      '',
      'Appended below the footer by a bad write.',
      '',
    ].join('\n');
    await writeFile(join(tempDir, '.planning', 'FUTURE-IDEAS.md'), stranded, 'utf-8');
    const result = await captureToFutureIdeas(tempDir, {
      body: 'a fresh capture into the drifted file',
      today: '2026-07-05',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(result.repaired).toBe(true);
    const content = await readFile(result.path, 'utf-8');
    // Nothing lost; single footer at true EOF; the fresh capture present.
    expect(content).toContain('## Idea one');
    expect(content).toContain('## Stranded idea');
    expect(content).toContain('a fresh capture into the drifted file');
    expect((content.match(/^\*Last updated:/gm) || []).length).toBe(1);
    expect(content.trimEnd().endsWith('*Last updated: 2026-07-05*')).toBe(true);
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

describe('assertSafeFilePath (hard gate, pure) — S2.t6 / FR3 / R2', () => {
  // baseDir is arbitrary; the gate is pure path math + a basename check, so it
  // needs no temp dir or filesystem. Use a fixed absolute root.
  const base = '/tmp/sig-base';

  // --- REFUSALS (FR3.1 outside-.planning; FR3.2 DECISIONS/STATE denylist) ---

  it('FR3.1: refuses a parent-escape relative path (../outside.md)', () => {
    expect(() => assertSafeFilePath(base, '../outside.md')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.1: refuses an absolute path outside .planning (/etc/passwd)', () => {
    expect(() => assertSafeFilePath(base, '/etc/passwd')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.1: refuses a traversal that climbs out (.planning/../../x.md)', () => {
    expect(() => assertSafeFilePath(base, '.planning/../../x.md')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.1: refuses a traversal that lands in baseDir root (.planning/../secrets.md)', () => {
    expect(() => assertSafeFilePath(base, '.planning/../secrets.md')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.1: refuses a nested-but-sneaky traversal (.planning/sub/../../DECISIONS.md)', () => {
    // resolves to base/DECISIONS.md → OUTSIDE .planning → refused as outside.
    expect(() =>
      assertSafeFilePath(base, '.planning/sub/../../DECISIONS.md')
    ).toThrow(/inside \.planning\//);
  });

  // The classic startsWith() sibling-prefix bug: a sibling dir whose name
  // begins with ".planning" must NOT pass, because the guard appends a path
  // separator (".planning/" cannot prefix-match ".planning-evil/").
  it('FR3.1: refuses a sibling-prefix dir (.planning-evil/x.md) — startsWith bug guard', () => {
    expect(() => assertSafeFilePath(base, '.planning-evil/x.md')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.1: refuses another sibling-prefix dir (.planningX/x.md)', () => {
    expect(() => assertSafeFilePath(base, '.planningX/x.md')).toThrow(
      /inside \.planning\//
    );
  });

  it('FR3.2: refuses .planning/DECISIONS.md (managed, not a capture destination)', () => {
    expect(() => assertSafeFilePath(base, '.planning/DECISIONS.md')).toThrow(
      /DECISIONS\.md/
    );
  });

  it('FR3.2: refuses .planning/STATE.md (managed, not a capture destination)', () => {
    expect(() => assertSafeFilePath(base, '.planning/STATE.md')).toThrow(
      /STATE\.md/
    );
  });

  it('FR3.2: refuses a nested STATE.md by basename (.planning/sub/STATE.md)', () => {
    expect(() => assertSafeFilePath(base, '.planning/sub/STATE.md')).toThrow(
      /STATE\.md/
    );
  });

  // --- ALLOWED (in-.planning, non-denylisted) ---

  it('allows a plain in-.planning path (.planning/NOTES.md)', () => {
    expect(() => assertSafeFilePath(base, '.planning/NOTES.md')).not.toThrow();
  });

  it('allows a nested in-.planning path (.planning/sub/deep.md)', () => {
    expect(() => assertSafeFilePath(base, '.planning/sub/deep.md')).not.toThrow();
  });

  it('returns the original relative path on success (consumable by the spine)', () => {
    expect(assertSafeFilePath(base, '.planning/NOTES.md')).toBe('.planning/NOTES.md');
  });
});

describe('insertRawAboveLastSeparator (pure) — S2.t6 / FR3', () => {
  it('inserts the raw body above a trailing --- separator, verbatim', () => {
    const before = '# Notes\n\nintro line\n\n---\n';
    const after = insertRawAboveLastSeparator(before, 'raw verbatim note');
    expect(after).toContain('raw verbatim note');
    // The body sits ABOVE the final separator.
    expect(after.indexOf('raw verbatim note')).toBeLessThan(after.lastIndexOf('---'));
    // No template heading was added.
    expect(after).not.toMatch(/^## /m);
  });

  it('does NOT wrap the body in a heading or **Status:** line (raw)', () => {
    const before = '# Notes\n\n---\n';
    const after = insertRawAboveLastSeparator(before, 'just text');
    expect(after).not.toContain('**Status:**');
    expect(after).not.toContain('## just text');
  });

  it('appends at EOF when the file has no --- separator', () => {
    const before = '# Notes\n\nsome content\n';
    const after = insertRawAboveLastSeparator(before, 'appended body');
    expect(after).toContain('appended body');
    expect(after.indexOf('some content')).toBeLessThan(after.indexOf('appended body'));
  });

  it('inserts above the LAST --- when several are present', () => {
    const before = '# Notes\n\n---\n\nmiddle\n\n---\n';
    const after = insertRawAboveLastSeparator(before, 'NEWBODY');
    const lines = after.split('\n');
    const sepIdxs = lines
      .map((l, i) => (l.trim() === '---' ? i : -1))
      .filter((i) => i >= 0);
    const lastSep = sepIdxs[sepIdxs.length - 1];
    const bodyIdx = lines.findIndex((l) => l === 'NEWBODY');
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeLessThan(lastSep);
    // The 'middle' content (above the last ---) is preserved.
    expect(after).toContain('middle');
  });

  it('leaves content above the insertion region byte-identical (prefix equality)', () => {
    const before = '# Notes\n\nkeep me exactly\n\n---\n';
    const prefix = '# Notes\n\nkeep me exactly';
    const after = insertRawAboveLastSeparator(before, 'x');
    expect(after.startsWith(prefix)).toBe(true);
  });

  it('ends with a single trailing newline', () => {
    const before = '# Notes\n\n---\n';
    const after = insertRawAboveLastSeparator(before, 'x');
    expect(after.endsWith('\n')).toBe(true);
    expect(after.endsWith('\n\n')).toBe(false);
  });
});

describe('captureToFile (integration) — S2.t6 / FR3 / R2', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes the raw body above the trailing --- with no ## heading added', async () => {
    const notesPath = join(tempDir, '.planning', 'NOTES.md');
    const original = '# Scratch Notes\n\nexisting line\n\n---\n';
    await writeFile(notesPath, original, 'utf-8');

    const result = await captureToFile(tempDir, {
      filePath: '.planning/NOTES.md',
      body: 'raw note',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });

    expect(result.written).toBe(true);
    const content = await readFile(notesPath, 'utf-8');
    expect(content).toContain('raw note');
    // No template heading derived from the body.
    expect(content).not.toContain('## raw note');
    expect(content).not.toContain('**Status:**');
    // Pre-existing content intact.
    expect(content).toContain('# Scratch Notes');
    expect(content).toContain('existing line');
  });

  it('writes to a nested in-.planning subdir path (join math is correct)', async () => {
    await mkdir(join(tempDir, '.planning', 'sub'), { recursive: true });
    const deepPath = join(tempDir, '.planning', 'sub', 'X.md');
    await writeFile(deepPath, '# Deep\n\n---\n', 'utf-8');

    const result = await captureToFile(tempDir, {
      filePath: '.planning/sub/X.md',
      body: 'deep body',
      today: '2026-05-30',
      sensitivePrompt: async () => 'keep',
    });

    expect(result.written).toBe(true);
    expect(result.path).toBe(deepPath);
    const content = await readFile(deepPath, 'utf-8');
    expect(content).toContain('deep body');
  });

  // R2 HARD GATE — refuse BEFORE lock acquisition AND before any write.
  it('R2: refuses --file .planning/DECISIONS.md — throws, leaves no lock, file unchanged', async () => {
    const decisionsPath = join(tempDir, '.planning', 'DECISIONS.md');
    const original = '# Decisions\n\nimmutable\n\n---\n';
    await writeFile(decisionsPath, original, 'utf-8');

    await expect(
      captureToFile(tempDir, {
        filePath: '.planning/DECISIONS.md',
        body: 'should never land',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/DECISIONS\.md/);

    // Refusal happened before lock acquisition.
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
    // DECISIONS.md is byte-unchanged.
    const after = await readFile(decisionsPath, 'utf-8');
    expect(after).toBe(original);
  });

  it('R2: refuses --file .planning/STATE.md — throws, leaves no lock, file unchanged', async () => {
    const statePath = join(tempDir, '.planning', 'STATE.md');
    const original = '---\nphase: EXECUTE\n---\n\nstate body\n';
    await writeFile(statePath, original, 'utf-8');

    await expect(
      captureToFile(tempDir, {
        filePath: '.planning/STATE.md',
        body: 'should never land',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/STATE\.md/);

    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
    const after = await readFile(statePath, 'utf-8');
    expect(after).toBe(original);
  });

  it('R2: refuses an outside-.planning path (../evil.md) — throws, leaves no lock', async () => {
    await expect(
      captureToFile(tempDir, {
        filePath: '../evil.md',
        body: 'escape attempt',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/inside \.planning\//);

    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  it('R2: refuses a sibling-prefix path (.planning-evil/x.md) — throws, leaves no lock', async () => {
    await expect(
      captureToFile(tempDir, {
        filePath: '.planning-evil/x.md',
        body: 'sibling-prefix attack',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      })
    ).rejects.toThrow(/inside \.planning\//);

    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
  });

  // R7 spine reuse — scrub still fires for the --file destination.
  it('R7: scrub fires — ghp_ token + abort → not written, no lock left behind', async () => {
    const notesPath = join(tempDir, '.planning', 'NOTES.md');
    await writeFile(notesPath, '# Notes\n\n---\n', 'utf-8');

    const result = await captureToFile(tempDir, {
      filePath: '.planning/NOTES.md',
      body: 'leaking ghp_abcdefghijklmnopqrstuvwxyz0123456789 here',
      today: '2026-05-30',
      sensitivePrompt: async () => 'abort',
    });

    expect(result.written).toBe(false);
    expect(existsSync(join(tempDir, '.planning', '.add.lock'))).toBe(false);
    const content = await readFile(notesPath, 'utf-8');
    expect(content).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });
});

describe('naked invocation (FR5) — S3.t1', () => {
  // The naked-invocation interview lives in commands/add.md Step 2 (prose
  // orchestration): empty $ARGUMENTS → one open-ended "What's the idea?" → the
  // answer becomes the body. The pure, testable invariant here is the
  // empty-answer-abort GATE (`isBlank`) and the fact that capture is what
  // creates+releases the lock — so a blank answer that never reaches capture
  // can never leave `.planning/.add.lock` behind.

  it('isBlank: empty/whitespace/undefined/null/non-string → true; real text → false', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank('\t\n')).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(42)).toBe(true); // non-string
    expect(isBlank('idea')).toBe(false);
    expect(isBlank('  idea  ')).toBe(false);
  });

  describe('integration', () => {
    let tempDir;
    const lockPath = (root) => join(root, '.planning', '.add.lock');

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
    });
    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    // FR5.1 — a provided answer routes through the spine to FUTURE-IDEAS. This
    // mirrors the naked flow: empty $ARGUMENTS → ask → user types an answer →
    // the answer is passed as `body` to captureToFutureIdeas.
    it('FR5.1: a provided answer files to FUTURE-IDEAS via the spine', async () => {
      await setupFixture('future-ideas-minimal', tempDir);
      const answer = 'the answer the user typed';
      expect(isBlank(answer)).toBe(false); // the gate decides to capture
      const result = await captureToFutureIdeas(tempDir, {
        body: answer,
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      });
      expect(result.written).toBe(true);
      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain(answer);
    });

    // FR5.2 — the critical one. A blank answer is gated OUT before capture, so
    // the destination is untouched AND no `.add.lock` ever appears. We prove
    // the gate-then-call structure: the predicate decides; capture is skipped.
    it('FR5.2: blank answer → no write, and no .add.lock ever appears', async () => {
      const dest = await setupFixture('future-ideas-minimal', tempDir);
      const before = await readFile(dest, 'utf-8');

      // Naked + blank answer: isBlank(answer) gates the call; capture is NEVER
      // invoked, so the lock (acquired only inside captureToDestination) never
      // gets created.
      const answer = '   ';
      if (!isBlank(answer)) {
        await captureToFutureIdeas(tempDir, {
          body: answer,
          today: '2026-05-30',
          sensitivePrompt: async () => 'keep',
        });
      }

      expect(await readFile(dest, 'utf-8')).toBe(before); // no write
      expect(existsSync(lockPath(tempDir))).toBe(false); // no lock left behind
    });

    // FR5.2 corollary — the lock is acquired AND released inside the capture
    // spine: after a full successful capture there is no lingering lock. (So
    // the only way a lock could persist is a crash mid-capture — never a blank
    // naked invocation, which doesn't reach capture at all.)
    it('FR5.2: a successful capture releases the lock (no lingering .add.lock)', async () => {
      await setupFixture('future-ideas-minimal', tempDir);
      const result = await captureToFutureIdeas(tempDir, {
        body: 'something real',
        today: '2026-05-30',
        sensitivePrompt: async () => 'keep',
      });
      expect(result.written).toBe(true);
      expect(existsSync(lockPath(tempDir))).toBe(false);
    });
  });

  // FR5.3 — quoted input is always instant (Decision 4): a `?`-ending body and
  // a `fix`-prefixed body both parse to a NON-blank body, so the naked-
  // invocation gate (isBlank) is false and the interview is skipped. No
  // heuristic reroute — both still head to FUTURE-IDEAS via the hot path.
  it('FR5.3: quoted ?/fix-prefixed input is non-blank → interview skipped', () => {
    const q = parseInput('is this right?');
    expect(q).toEqual({ body: 'is this right?', flags: {} });
    expect(isBlank(q.body)).toBe(false);

    const f = parseInput('fix the thing');
    expect(f).toEqual({ body: 'fix the thing', flags: {} });
    expect(isBlank(f.body)).toBe(false);
  });
});

describe('resolveOnboardingMode (pure) — S4.t1 / FR6.3 / Q1', () => {
  // Q1: gate_strictness modulates the SHAPE of the one-time first-run onboarding
  // note ONLY — it never adds a destination-confirm prompt. strict → blocking
  // once; light/absent/unknown → one-line FYI once; off → silent.

  it('strict → "strict" (blocking note once)', () => {
    expect(
      resolveOnboardingMode({ rigor_overrides: { gate_strictness: 'strict' } })
    ).toBe('strict');
  });

  it('light → "fyi" (one-line FYI once)', () => {
    expect(
      resolveOnboardingMode({ rigor_overrides: { gate_strictness: 'light' } })
    ).toBe('fyi');
  });

  it('off → "silent" (no note)', () => {
    expect(
      resolveOnboardingMode({ rigor_overrides: { gate_strictness: 'off' } })
    ).toBe('silent');
  });

  it('null profile (PROFILE.md absent) → "fyi" (light default)', () => {
    expect(resolveOnboardingMode(null)).toBe('fyi');
  });

  it('undefined profile → "fyi"', () => {
    expect(resolveOnboardingMode(undefined)).toBe('fyi');
  });

  it('profile with no rigor_overrides → "fyi"', () => {
    expect(resolveOnboardingMode({})).toBe('fyi');
  });

  it('unknown gate_strictness value → "fyi" (safe default)', () => {
    expect(
      resolveOnboardingMode({ rigor_overrides: { gate_strictness: 'banana' } })
    ).toBe('fyi');
  });
});

describe('onboarded flag (I/O) — S4.t1 / FR6.1', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('onboardedFlagPath resolves to .planning/.add-onboarded', () => {
    expect(onboardedFlagPath(tempDir)).toBe(
      join(tempDir, '.planning', '.add-onboarded')
    );
  });

  it('isOnboarded is false on a fresh repo; true after markOnboarded', async () => {
    expect(isOnboarded(tempDir)).toBe(false);
    await markOnboarded(tempDir);
    expect(isOnboarded(tempDir)).toBe(true);
    expect(existsSync(onboardedFlagPath(tempDir))).toBe(true);
  });

  it('markOnboarded is idempotent (a second call does not throw)', async () => {
    await markOnboarded(tempDir);
    await expect(markOnboarded(tempDir)).resolves.not.toThrow();
    expect(isOnboarded(tempDir)).toBe(true);
  });
});

describe('detectProjectKind (I/O) — S4.t1 / FR6.2', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns "brownfield" when .git/ exists AND a source file is present', async () => {
    await mkdir(join(tempDir, '.git'), { recursive: true });
    await writeFile(join(tempDir, 'index.js'), 'console.log(1);\n', 'utf-8');
    expect(detectProjectKind(tempDir)).toBe('brownfield');
  });

  it('returns "greenfield" for a bare empty dir', async () => {
    expect(detectProjectKind(tempDir)).toBe('greenfield');
  });

  it('returns "greenfield" when .git/ exists but no non-dotfile source is present', async () => {
    await mkdir(join(tempDir, '.git'), { recursive: true });
    expect(detectProjectKind(tempDir)).toBe('greenfield');
  });
});

describe('buildMissingPlanningError (I/O) — S4.t1 / FR6.2', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-add-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('brownfield repo → message suggests /sig:init', async () => {
    await mkdir(join(tempDir, '.git'), { recursive: true });
    await writeFile(join(tempDir, 'index.js'), 'console.log(1);\n', 'utf-8');
    const msg = buildMissingPlanningError(tempDir);
    expect(msg).toMatch(/sig:init/);
    expect(msg).not.toMatch(/sig:new-project/);
  });

  it('greenfield dir → message suggests /sig:new-project', () => {
    const msg = buildMissingPlanningError(tempDir);
    expect(msg).toMatch(/sig:new-project/);
    expect(msg).not.toMatch(/sig:init/);
  });
});

describe('no-heuristics guard (FR5.4 / Decision 5)', () => {
  // The shipped design is "routing = explicit flags OR FUTURE-IDEAS, nothing in
  // between". The 2026-05-14 plan's `suggestDestination(body, state)` heuristic
  // and its reroute prompts were CUT (Decision 5). This is the long-term guard
  // against a future contributor quietly re-adding destination-guessing logic.

  // Any name a heuristic/reroute would plausibly take. The export-surface check
  // catches an exported function; the source-text check below also catches a
  // non-exported helper.
  const banned = [
    'suggestDestination',
    'rerouteDestination',
    'classifyDestination',
    'guessDestination',
    'inferDestination',
  ];

  it('exports no destination-heuristic / reroute function', () => {
    for (const name of banned) {
      expect(
        addModule[name],
        `add.js must not export ${name} — routing is flags-or-FUTURE-IDEAS (Decision 5)`
      ).toBeUndefined();
    }
  });

  it('the source contains no `suggestDestination` identifier (catches non-exported helpers)', async () => {
    const src = await readFile(join(__dirname, '..', 'tools', 'lib', 'add.js'), 'utf-8');
    // Match the bare identifier only — the prose comment that *names* the cut
    // heuristic (`suggestDestination`-style) is allowed, so require a word
    // boundary followed by `(` to flag an actual call/definition site.
    expect(
      /\bsuggestDestination\s*\(/.test(src),
      'tools/lib/add.js must not define or call suggestDestination (Decision 5: heuristics cut)'
    ).toBe(false);
  });
});
