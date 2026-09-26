import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { splitParagraphs, buildFactList } from '../plugin/tools/lib/state-facts.js';

/**
 * M6.E3 t1.4 — what the Jev check reads and what it judges against.
 *
 * Paragraphs carry their 1-based FILE line, so a receipt can cite
 * `STATE.md:<line>` (a line number relative to the body would cite the wrong
 * line by exactly the frontmatter's length — `M6.E7`'s off-by-five, again).
 *
 * The fact list is text for SAMENESS judgments only (AC9.5, RESEARCH
 * Finding 9): names, ids and a version string, never dates or counts — Jev's
 * documented weaknesses are counting and ordering.
 */

const RAW = [
  '---',                       // 1
  'schema_version: 1',         // 2
  'phase: SHIP',               // 3
  'current_epic: M6.E8',       // 4
  '---',                       // 5
  '# Project State',           // 6
  '',                          // 7
  '**Nothing is in flight.**', // 8
  '',                          // 9
  '`phase: PLAN` above is',    // 10
  'accurate.',                 // 11
  '',                          // 12
  '',                          // 13
  '## Blockers',               // 14
  '',                          // 15
  'None.',                     // 16
].join('\n');

describe('splitParagraphs', () => {
  it('splits the body on blank lines, excluding frontmatter, with 1-based FILE lines', () => {
    const ps = splitParagraphs(RAW);
    expect(ps.map((p) => [p.line, p.text])).toEqual([
      [6, '# Project State'],
      [8, '**Nothing is in flight.**'],
      [10, '`phase: PLAN` above is\naccurate.'],
      [14, '## Blockers'],
      [16, 'None.'],
    ]);
  });

  it('works with no frontmatter (lines count from 1)', () => {
    expect(splitParagraphs('a\n\nb')).toEqual([{ line: 1, text: 'a' }, { line: 3, text: 'b' }]);
  });

  it('handles CRLF', () => {
    expect(splitParagraphs('---\nx: 1\n---\r\none\r\n\r\ntwo').map((p) => p.line)).toEqual([4, 6]);
  });

  it('does not treat a --- rule inside the body as frontmatter', () => {
    const ps = splitParagraphs('---\nphase: X\n---\nbefore\n\n---\n\nafter');
    expect(ps.map((p) => p.text)).toEqual(['before', '---', 'after']);
  });
});

async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-facts-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}

describe('buildFactList (AC9.1, AC9.5)', () => {
  const state = {
    phase: 'SHIP',
    current_epic: 'M6.E8',
    current_tasks: [{ id: 't3.4', status: 'in_progress', startedAt: '2026-09-14T12:00:00Z' }],
    completed_phases: ['DISCUSS (2026-09-14)', 'PLAN (2026-09-14)', 'EXECUTE (2026-09-14)'],
    blockers: [],
    last_updated: '2026-09-24T20:12:29.670Z',
  };

  it('builds the text facts, each with the file:line it came from', async () => {
    const dir = await project({
      '.planning/STATE.md': RAW,
      '.claude-plugin/plugin.json': '{\n  "name": "sig",\n  "version": "0.1.40"\n}\n',
    });
    try {
      const { facts, sources, unavailable } = await buildFactList(dir, state);
      expect(facts).toMatchObject({
        phase: 'SHIP',
        current_epic: 'M6.E8',
        in_flight: 'M6.E8, at its SHIP phase (an Epic at SHIP is in flight until it closes)',
        current_tasks: 't3.4',
        completed_phases: 'DISCUSS, PLAN, EXECUTE',
        version: '0.1.40',
      });
      expect(sources.phase).toEqual({ source: '.planning/STATE.md frontmatter', line: 3 });
      expect(sources.version).toEqual({ source: '.claude-plugin/plugin.json', line: 3 });
      expect(unavailable).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('never passes a date or a count (AC9.5)', async () => {
    const dir = await project({ '.planning/STATE.md': RAW });
    try {
      const { facts } = await buildFactList(dir, state);
      const text = JSON.stringify(facts);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(text).not.toMatch(/last_updated|blockers/);
      expect(Object.values(facts).every((v) => typeof v === 'string')).toBe(true);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('with no manifest there is no version fact, and it says so (NFR4)', async () => {
    const dir = await project({ '.planning/STATE.md': RAW });
    try {
      const { facts, unavailable } = await buildFactList(dir, state);
      expect(facts.version).toBeUndefined();
      expect(unavailable).toContain('version (no plugin.json or package.json)');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('finds a plugin manifest one level down (Signal\'s own layout) before package.json', async () => {
    const dir = await project({
      '.planning/STATE.md': RAW,
      'plugin/.claude-plugin/plugin.json': '{"version":"0.1.30"}',
      'package.json': '{"version":"9.9.9"}',
    });
    try {
      const { facts, sources } = await buildFactList(dir, state);
      expect(facts.version).toBe('0.1.30');
      expect(sources.version.source).toBe('plugin/.claude-plugin/plugin.json');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('falls back to package.json for the version', async () => {
    const dir = await project({ '.planning/STATE.md': RAW, 'package.json': '{"name":"x","version":"2.3.4"}' });
    try {
      const { facts, sources } = await buildFactList(dir, state);
      expect(facts.version).toBe('2.3.4');
      expect(sources.version.source).toBe('package.json');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('linear mode (no current_epic): in-flight names the phase alone, and nothing is invented', async () => {
    const dir = await project({ '.planning/STATE.md': '---\nphase: EXECUTE\n---\nbody\n' });
    try {
      const { facts, unavailable } = await buildFactList(dir, { phase: 'EXECUTE', current_tasks: [], completed_phases: [] });
      expect(facts.current_epic).toBeUndefined();
      expect(facts.in_flight).toBe('work at its EXECUTE phase');
      expect(facts.current_tasks).toBe('none');
      expect(unavailable).toContain('current_epic (linear mode)');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
