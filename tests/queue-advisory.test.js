import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readQueueAdvisory } from '../plugin/tools/lib/status.js';
import { queueDecision } from '../plugin/tools/lib/drive.js';

const ROOT = join(import.meta.dirname, '..');

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-queue-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readQueueAdvisory — the read half of the decision queue', () => {
  it('is SILENT when the queue has never been used', async () => {
    // Not "0 of 0". A zero implies a run happened and parked nothing; no file
    // means the mechanism has never been reached, which is a different fact.
    expect(await readQueueAdvisory(dir)).toBeNull();
  });

  it('reports the unanswered count when entries are open', async () => {
    await queueDecision(dir, { id: 'Q1', phase: 'PLAN', question: 'A?', recommendation: 'x', date: '2026-09-01' });
    await queueDecision(dir, { id: 'Q2', phase: 'PLAN', question: 'B?', recommendation: 'y', date: '2026-09-01' });
    const out = await readQueueAdvisory(dir);
    expect(out).toMatch(/2 unanswered of 2/);
    expect(out).toMatch(/DECISION-QUEUE\.md/);
  });

  it('distinguishes all-answered from never-used', async () => {
    await queueDecision(dir, { id: 'Q1', phase: 'PLAN', question: 'A?', recommendation: 'x', date: '2026-09-01' });
    const path = join(dir, '.planning/DECISION-QUEUE.md');
    const answered = (await readFile(path, 'utf-8')).replace('_(unanswered)_', 'yes, do x');
    await writeFile(path, answered);

    const out = await readQueueAdvisory(dir);
    expect(out).toMatch(/all answered/);
    expect(out).not.toMatch(/unanswered of/);
  });

  it('fails open on an unreadable project rather than throwing', async () => {
    await expect(readQueueAdvisory(join(dir, 'does-not-exist'))).resolves.toBeNull();
  });

  it('names the attention setting as what a growing queue measures', async () => {
    await queueDecision(dir, { id: 'Q1', phase: 'PLAN', question: 'A?', recommendation: 'x', date: '2026-09-01' });
    expect(await readQueueAdvisory(dir)).toMatch(/attention setting/);
  });
});

/**
 * The wiring half. `queueDecision` shipped in v0.1.31 and its only callers were
 * tests — the `B75` / `dischargeObligation` shape, three times over in this one
 * area. A unit test of the function would have passed throughout that entire
 * period, so the test that matters is whether anything REACHES it.
 */
describe('the queue advisory is actually reached from the orientation commands', () => {
  it('both /sig:status and /sig:resume call readQueueAdvisory', async () => {
    for (const cmd of ['status.md', 'resume.md']) {
      const md = await readFile(join(ROOT, 'plugin/commands', cmd), 'utf-8');
      expect(md, `${cmd} never calls readQueueAdvisory`).toMatch(/readQueueAdvisory\(baseDir\)/);
    }
  });

  it('both name the queue file, so a reader knows where to answer', async () => {
    for (const cmd of ['status.md', 'resume.md']) {
      const md = await readFile(join(ROOT, 'plugin/commands', cmd), 'utf-8');
      expect(md).toMatch(/DECISION-QUEUE\.md/);
    }
  });

  it('both disclose that the write half NOW HAS A CALLER (M6.E6)', async () => {
    // INVERTED, not deleted. This test previously pinned the opposite clause —
    // "nothing writes to the queue yet" — and was correct for as long as that
    // was true: without it, `all answered` read as evidence that deferral works
    // when nothing outside tests deferred at all.
    //
    // M6.E6 gave the write half a caller, which makes the old clause FALSE. A
    // caveat that outlives its cause is `M5.E17`'s class, and a test pinning one
    // is how it survives review — this repository has shipped that exact defect
    // before (a guard's test pinned the hole as intended behaviour). So the
    // assertion flips with the fact rather than being dropped: the honesty
    // requirement is unchanged, only which sentence is honest.
    for (const cmd of ['status.md', 'resume.md']) {
      const md = await readFile(join(ROOT, 'plugin/commands', cmd), 'utf-8');
      expect(md, `${cmd} still carries the stale read-half caveat`).not.toMatch(/read half only/i);
      expect(md, `${cmd} does not say the write half has a caller`).toMatch(/write half has a caller/i);
    }
  });
});
