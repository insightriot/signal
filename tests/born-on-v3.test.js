// Born-on-v3 scaffolding (M5.E3.S6b.t1 / FR6 / AC6.3).
//
// A brand-new Signal project must be born on the CURRENT doc-runtime layout — it
// stamps `docs_layout_version` into STATE.md at init, so it self-reports v3 from
// birth and never presents (to the resume/status/SessionStart layout banner) as an
// un-migrated older-layout project needing `/sig:migrate-memory`. The on-demand
// file creation (S1.t5 lazy-create → ISSUES-INBOX.md; S4.t1 createBacklogIfMissing)
// covers the rest of the v3 file set — nothing is scaffolded eagerly.
//
// The load-bearing RED here is the STAMP: `initState` previously wrote no
// `docs_layout_version`, so a fresh project fell to the structural sniff instead of
// self-reporting. The lazy-create half is already green (S1.t5) and re-asserted here
// only as the born-on-v3 end-to-end confirmation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { initState } from '../tools/lib/state.js';
import {
  readCappedPrefix,
  readLayoutStampFromPrefix,
  LAYOUT_VERSION,
} from '../tools/lib/layout-stamp.js';
import { readLayoutBanner } from '../tools/lib/status.js';
import { CURRENT_LAYOUT_VERSION } from '../tools/lib/migrate-memory.js';
import { captureToFutureIdeas } from '../tools/lib/add.js';

describe('born-on-v3 scaffolding (S6b.t1 / FR6 / AC6.3)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-born-v3-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Load-bearing RED: initState stamps the CURRENT layout version. Both entry-point
  // commands (`/sig:new-project`, `/sig:init`) write the initial STATE.md through
  // initState, so this one code path makes both born-on-v3.
  it('AC6.3: initState stamps docs_layout_version at the current layout version', async () => {
    await initState(tempDir);
    const statePath = join(tempDir, '.planning', 'STATE.md');
    const stamp = readLayoutStampFromPrefix(readCappedPrefix(statePath));
    expect(stamp).toBe(LAYOUT_VERSION);
    expect(stamp).toBe(CURRENT_LAYOUT_VERSION); // the two axes never disagree
  });

  it('AC6.3: the stamp lands inside real frontmatter, right after schema_version', async () => {
    await initState(tempDir);
    const raw = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    // Grouped with the other version axis: schema_version line immediately followed
    // by docs_layout_version (the byte-position spliceDocsLayoutVersion also targets).
    expect(raw).toMatch(/^schema_version: \d+\ndocs_layout_version: \d+/m);
  });

  // Confirmatory: born-on-v3 means the layout-drift banner is silent from birth.
  it('AC6.3: a freshly-initialized project self-reports v3 → layout banner silent', async () => {
    await initState(tempDir);
    expect(await readLayoutBanner(tempDir)).toBeNull();
  });

  // Confirmatory (S1.t5 already green): the first /sig:add on a born-on-v3 project
  // creates ISSUES-INBOX.md, never the legacy FUTURE-IDEAS.md.
  it('AC6.3: first capture on a born-on-v3 project creates ISSUES-INBOX.md, not FUTURE-IDEAS.md', async () => {
    await initState(tempDir);
    const result = await captureToFutureIdeas(tempDir, {
      body: 'first capture in a born-on-v3 project',
      today: '2026-07-19',
      sensitivePrompt: async () => 'keep',
    });
    expect(result.written).toBe(true);
    expect(existsSync(join(tempDir, '.planning', 'ISSUES-INBOX.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.planning', 'FUTURE-IDEAS.md'))).toBe(false);
  });
});
