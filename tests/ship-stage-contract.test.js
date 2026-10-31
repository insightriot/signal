// M6.E18 S6 (SIG-342, AC6.2): ship.md § 5 writes STATE.md, and in a linear
// project STATE-HISTORY.md and the REVIEW report's "## Run ended" line too, but
// no step staged them for § 9's commit — so following the file as written left
// them uncommitted. § 5 now names all three, and § 9's list of stagers counts it.
//
// Its own file rather than review-loop-doc-contract.test.js (the row VALIDATION
// names), because another worker is editing that file in this wave.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ship = readFileSync(join(ROOT, 'plugin/commands/ship.md'), 'utf-8').replace(/\s+/g, ' ');
// ship.md rewrite (2026-10-31): § 5 is step 6, "Record the phase"; § 9 is step 8.
const s5 = ship.slice(ship.search(/## 6\. Record the phase/), ship.search(/## 7\. /));
const s9 = ship.slice(ship.search(/## 8\. /), ship.search(/## 9\. /));

describe('AC6.2 — ship.md § 5 stages what it wrote, for § 9\'s commit', () => {
  it('§ 5 stages STATE.md, STATE-HISTORY.md and the REVIEW report it appended to', () => {
    const stage = s5.slice(s5.search(/\*\*Stage what/));
    expect(stage).toMatch(/^\*\*Stage what[^*]*for step 8's commit:\*\*/);
    expect(stage).toMatch(/`\.planning\/STATE\.md`/);
    expect(stage).toMatch(/`\.planning\/STATE-HISTORY\.md`/);
    expect(stage).toMatch(/REVIEW report at `runEnded\.path` when `runEnded\?\.ok === true`/);
  });

  it('a report markRunEnded refused is not staged', () => {
    expect(s5).toMatch(/A report it could not write is not staged\./);
  });

  it('§ 9 counts § 5 among the steps that stage into the SHIP commit', () => {
    expect(s9).toMatch(/Commit everything steps 6 and 7 staged as one commit/);
  });
});
