// Tests for the BACKLOG.md discharge path — M5.E10.S7 / FR9 (`B94`).
//
// The bug: `.planning/BACKLOG.md` is append-only. `backlog.js` had exactly two
// write paths (create-if-missing, promote-append) and NO discharge function, and
// `commands/ship.md` reconciles five document surfaces at Epic close while
// touching the backlog in none of them. So the one document a user treats as the
// queue is the one with no closing mechanism, and it asserts `pending` about
// shipped work indefinitely.
//
// HARD constraint (inherited from backlog.test.js): every behavioral test uses a
// temp dir. None of these may write to Signal's real .planning/BACKLOG.md. The
// one test that reads the real file is explicitly read-only and says so.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseBacklogRows,
  dischargeBacklogRows,
  backlogDischargeStatus,
  BACKLOG_DISCHARGE,
  ROW_DISCHARGE,
} from '../plugin/tools/lib/backlog.js';
import { checkBacklogDischarge } from '../plugin/tools/lib/sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BACKLOG_REL = '.planning/BACKLOG.md';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-backlog-discharge-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (rel, body) => writeFile(join(dir, rel), body, 'utf-8');
const read = (rel) => readFile(join(dir, rel), 'utf-8');

// A backlog in the shape Signal's own file actually has: `##` sprint containers
// owning `###` rows, a struck row, and a `<details>` block preserving the
// original entry underneath a discharged one.
const HAND_GROOMED = [
  '# Backlog',
  '',
  'Groomed, sequenced roadmap.',
  '',
  '## Next work — the agreed sequence',
  '',
  '### 1. ~~`B52` — the session binds to a stale plugin cache~~ · **DONE, v0.1.20 (2026-08-06)**',
  '',
  'Shipped in the fix lane.',
  '',
  '<details><summary>Original entry (kept for the reasoning that set the order)</summary>',
  '',
  '### `B52` — the session binds to a stale plugin cache · **fix lane** · small',
  '',
  'Trigger satisfied — three sightings in six days.',
  '',
  '</details>',
  '',
  '### M5.E9 — Overdue enforcement + the bug pile',
  '',
  'The enforcement half of the re-audit.',
  '',
  '### Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**',
  '',
  'Re-homed rather than cut.',
  '',
  '### `/sig:docs-sweep --docs` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11)**',
  '',
  'Half of it landed.',
  '',
  '### `/sig:docs-sweep --code` — the code half of the same sweep',
  '',
  'Not started.',
  '',
  '*Last updated: 2026-08-01*',
  '',
].join('\n');

describe('parseBacklogRows — one definition of "which heading is a row" (AC S7.1)', () => {
  it('a heading that owns deeper headings is a CONTAINER, not a row', () => {
    const rows = parseBacklogRows(HAND_GROOMED);
    const headings = rows.map((r) => r.text);
    expect(headings.some((h) => h.includes('Next work'))).toBe(false);
    expect(headings.some((h) => h.includes('M5.E9'))).toBe(true);
  });

  it('a machine-promoted backlog writes rows at `##`, and those ARE rows', () => {
    // promoteToBacklog appends `## {title}` with no `###` beneath it. A rule that
    // simply said "rows are `###`" would see zero rows in every command-driven
    // project — Signal's own file is the minority shape here, exactly as M5.E16
    // measured for its own checks.
    const machine = [
      '# Backlog',
      '',
      '## Ship the thing',
      '',
      '**Tag:** roadmap',
      '<!-- backlog-key: abc123 -->',
      '',
      'Body.',
      '',
      '---',
      '',
      '*Last updated: 2026-08-01*',
      '',
    ].join('\n');
    const rows = parseBacklogRows(machine);
    expect(rows.map((r) => r.text)).toEqual(['Ship the thing']);
  });

  it('rows inside a <details> block are preserved history, not live rows', () => {
    const rows = parseBacklogRows(HAND_GROOMED);
    const live = rows.filter((r) => !r.inDetails);
    expect(rows.filter((r) => r.inDetails)).toHaveLength(1);
    expect(live.some((r) => r.text.includes('fix lane'))).toBe(false);
  });

  it('reads the hand vocabulary as discharged — struck, DONE, SHIPPED, ABANDONED', () => {
    const rows = parseBacklogRows(HAND_GROOMED);
    const b52 = rows.find((r) => r.text.includes('~~'));
    expect(b52.discharged).toBe(true);
    expect(b52.dischargedBy).toBe('v0.1.20');
    expect(b52.dischargedAt).toBe('2026-08-06');
  });

  it('PARTIALLY SHIPPED is NOT discharged — the qualifier asserts open work', () => {
    const rows = parseBacklogRows(HAND_GROOMED);
    const partial = rows.find((r) => r.text.includes('PARTIALLY'));
    expect(partial.discharged).toBe(false);
  });

  it('the normalized shape is obligations.js\'s, field for field', () => {
    const rows = parseBacklogRows(HAND_GROOMED);
    for (const r of rows) {
      expect(r).toHaveProperty('discharged');
      expect(r).toHaveProperty('dischargedBy');
      expect(r).toHaveProperty('dischargedAt');
    }
  });
});

describe('dischargeBacklogRows — four outcomes, and ambiguity refuses (AC9.1/AC9.2)', () => {
  beforeEach(() => write(BACKLOG_REL, HAND_GROOMED));

  it('discharges a live row and the change is READER-VISIBLE (AC9.1)', async () => {
    const res = await dischargeBacklogRows(dir, {
      rows: ['M5.E9 — Overdue enforcement'],
      by: 'M5.E10',
      at: '2026-08-13',
    });
    expect(res.results[0].status).toBe(ROW_DISCHARGE.DISCHARGED);
    expect(res.written).toBe(true);

    const after = await read(BACKLOG_REL);
    // Struck through and labelled — an HTML comment alone would leave the
    // rendered document asserting exactly the same false status.
    expect(after).toMatch(/### ~~M5\.E9 — Overdue enforcement \+ the bug pile~~ · \*\*DONE — M5\.E10, 2026-08-13\*\*/);
  });

  it('bumps the *Last updated:* footer — a stale footer is a second false claim', async () => {
    await dischargeBacklogRows(dir, { rows: ['M5.E9'], by: 'M5.E10', at: '2026-08-13', today: '2026-08-13' });
    expect(await read(BACKLOG_REL)).toContain('*Last updated: 2026-08-13*');
  });

  it('a second run reports already-discharged, DISTINCT from not-found', async () => {
    await dischargeBacklogRows(dir, { rows: ['M5.E9'], by: 'M5.E10', at: '2026-08-13' });
    const again = await dischargeBacklogRows(dir, { rows: ['M5.E9'], by: 'M5.E10', at: '2026-08-13' });
    expect(again.results[0].status).toBe(ROW_DISCHARGE.ALREADY_DISCHARGED);
    expect(again.written).toBe(false);

    const missing = await dischargeBacklogRows(dir, { rows: ['nothing named this'], by: 'M5.E10' });
    expect(missing.results[0].status).toBe(ROW_DISCHARGE.NOT_FOUND);
  });

  it('an ambiguous match REFUSES rather than taking the first row', async () => {
    const res = await dischargeBacklogRows(dir, { rows: ['sweep'], by: 'M5.E10' });
    expect(res.results[0].status).toBe(ROW_DISCHARGE.AMBIGUOUS);
    expect(res.results[0].reason).toMatch(/2 rows/);
    // and nothing was written
    expect(await read(BACKLOG_REL)).toBe(HAND_GROOMED);
  });

  it('never rewrites a row inside <details> — that is preserved history', async () => {
    const res = await dischargeBacklogRows(dir, { rows: ['B52'], by: 'M5.E10' });
    // The only LIVE `B52` row is already struck; the <details> copy is invisible
    // to matching, so this is already-discharged rather than ambiguous.
    expect(res.results[0].status).toBe(ROW_DISCHARGE.ALREADY_DISCHARGED);
  });

  it('a missing BACKLOG.md is reported, not created', async () => {
    await rm(join(dir, BACKLOG_REL));
    const res = await dischargeBacklogRows(dir, { rows: ['anything'], by: 'M5.E10' });
    expect(res.written).toBe(false);
    expect(res.reason).toMatch(/BACKLOG\.md/);
  });
});

// Closure evidence in the shape `resolveClosures` actually reads: a STATE.md so
// the current unit is known, and a terminal artifact stating a verdict on its
// own line. Writing a bare retrospective would NOT do — `B64` made a stub
// retrospective explicitly not closure, at five decision sites.
const STATE_MD = ['---', 'schema_version: 1', 'phase: EXECUTE', 'current_epic: M5.E10', '---', '', '# State', ''].join('\n');
const VERIFICATION_PASS = ['# M5.E9 — VERIFICATION', '', '## Verdict: **PASS**', '', 'All criteria met.', ''].join('\n');

describe('backlogDischargeStatus — three outcomes (AC9.4, NFR4)', () => {
  const withEvidence = async () => {
    await write('.planning/STATE.md', STATE_MD);
    await write('.planning/M5.E9-VERIFICATION.md', VERIFICATION_PASS);
    await write(BACKLOG_REL, HAND_GROOMED);
  };

  it('flags a live row whose named unit is provably closed', async () => {
    await withEvidence();
    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.STALE);
    expect(res.stale).toHaveLength(1);
    expect(res.stale[0].id).toBe('M5.E9');
  });

  it('reports CLEAN, not stale, once the row is discharged', async () => {
    await withEvidence();
    await dischargeBacklogRows(dir, { rows: ['M5.E9'], by: 'M5.E10', at: '2026-08-13' });
    expect((await backlogDischargeStatus(dir)).outcome).toBe(BACKLOG_DISCHARGE.CLEAN);
  });

  it('a backlog whose rows name nothing resolvable is CANNOT-EVALUATE, never clean', async () => {
    // This is the field shape B94 was filed from: a real backlog with ~15 stale
    // rows, none of which name a unit id, in a project whose BUGS.md carries no
    // ids either. The check cannot see the case that motivated it, and must say
    // so rather than return a clean bill of health.
    await write(BACKLOG_REL, ['# Backlog', '', '### Make the thing faster', '', 'Body.', ''].join('\n'));
    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.reason).toMatch(/no .*row/i);
  });

  it('a backlog naming units, in a project whose closure records are unreadable, is CANNOT-EVALUATE', async () => {
    await write(BACKLOG_REL, HAND_GROOMED); // no STATE.md, no BUGS.md
    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.reason).toMatch(/closure could not be read/i);
  });

  it('no BACKLOG.md at all is CANNOT-EVALUATE with its own reason', async () => {
    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.reason).toMatch(/no BACKLOG\.md/);
  });
});

describe('the narrowing — an id MENTIONED is not an id CLAIMED (AC9.5)', () => {
  it('"absorbed into M5.E11" does not flag when M5.E11 closes', async () => {
    await write('.planning/STATE.md', STATE_MD);
    await write('.planning/M5.E11-VERIFICATION.md', VERIFICATION_PASS.replace('M5.E9', 'M5.E11'));
    await write('.planning/M5.E9-VERIFICATION.md', VERIFICATION_PASS);
    await write(BACKLOG_REL, HAND_GROOMED);
    const res = await backlogDischargeStatus(dir);
    // Both M5.E9 and M5.E11 are closed. Only the row that LEADS with its id is
    // claiming to be that work; "Cross-Epic pattern detection — KEPT, absorbed
    // into M5.E11" is naming its destination.
    expect(res.stale.map((s) => s.id)).toEqual(['M5.E9']);
  });

  it('on the real file, the literal rule sees strictly more rows than the shipped one', () => {
    // Read-only against Signal's own BACKLOG.md. The point-in-time counts that
    // SET the rule — literal 4, of which 3 were not defects; narrowed 1 — are
    // recorded in M5.E10-PROGRESS.md, because the file moves. What is pinned
    // here is the property that made the narrowing worth doing: the literal
    // reading is strictly wider. FR8 made this move first, where a literal
    // reading reported 62 episodes and the narrowed one reports 5.
    const content = readFileSync(join(ROOT, '.planning', 'BACKLOG.md'), 'utf-8');
    const rows = parseBacklogRows(content).filter((r) => !r.inDetails && !r.discharged);
    const ANY_ID = /\b(?:M\d+(?:\.\d+)?\.E\d+|B\d+)\b/;
    const mentions = rows.filter((r) => ANY_ID.test(r.text));
    const leads = rows.filter((r) => r.leadingId !== null);
    expect(mentions.length).toBeGreaterThan(leads.length);
    expect(leads.length).toBeLessThanOrEqual(6);
  });
});

describe('the /sig:docs-sweep surface (AC9.4)', () => {
  it('a project with no BACKLOG.md stays SILENT — the mute-earning case', async () => {
    expect(await checkBacklogDischarge(dir)).toEqual([]);
  });

  it('an un-evaluable backlog reports advisory rather than nothing', async () => {
    await write(BACKLOG_REL, ['# Backlog', '', '### Make the thing faster', '', 'Body.', ''].join('\n'));
    const findings = await checkBacklogDischarge(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('advisory');
    expect(findings[0].check).toBe('backlog-discharge');
  });

  it('a stale row reports advisory and NAMES the row', async () => {
    await write('.planning/STATE.md', STATE_MD);
    await write('.planning/M5.E9-VERIFICATION.md', VERIFICATION_PASS);
    await write(BACKLOG_REL, HAND_GROOMED);
    const findings = await checkBacklogDischarge(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('M5.E9');
  });
});

describe('commands/ship.md wires the discharge (AC9.3)', () => {
  const ship = readFileSync(join(ROOT, 'plugin', 'commands', 'ship.md'), 'utf-8');

  it('names the discharge helper at an Epic-close step', () => {
    expect(ship).toContain('dischargeBacklogRows');
  });

  it('the step is Epic-close only, like the inbox sweep beside it', () => {
    const step = ship.slice(ship.indexOf('dischargeBacklogRows') - 1200, ship.indexOf('dischargeBacklogRows') + 1200);
    expect(step).toMatch(/isEpicClose/);
  });

  it('discharging nothing is REPORTED, not skipped silently', () => {
    const step = ship.slice(ship.indexOf('dischargeBacklogRows') - 1200, ship.indexOf('dischargeBacklogRows') + 2000);
    expect(step).toMatch(/no rows|nothing|none/i);
  });

  it('the staging enumeration counts this step — a stale list unstages it BY INSTRUCTION', () => {
    // ship.md §9 enumerates the steps that stage into the SHIP commit. M5.E17's
    // FR3 is exactly this defect one turn earlier: four steps staged into a
    // commit no step created. Adding a fifth stager without updating the
    // sentence leaves the new write uncommitted as written.
    const nine = ship.slice(ship.indexOf('### 9.'));
    expect(nine).toMatch(/Five steps above/);
    expect(nine).toMatch(/§6\.6/);
  });
});

describe('a row may declare itself open on purpose', () => {
  it('"STILL OPEN" in the heading exempts a row whose named unit closed', async () => {
    await writeFile(join(dir, '.planning/STATE.md'), STATE_MD, 'utf-8');
    await writeFile(join(dir, '.planning/M5.E9-VERIFICATION.md'), VERIFICATION_PASS, 'utf-8');
    await writeFile(
      join(dir, BACKLOG_REL),
      HAND_GROOMED.replace(
        '### M5.E9 — Overdue enforcement + the bug pile',
        '### M5.E9 — Overdue enforcement + the bug pile · **STILL OPEN** — the bug pile outlived the Epic'
      ),
      'utf-8'
    );
    // Without an escape valve this row is flagged on every run forever, which is
    // how a detector earns the mute that makes it useless. Found by running the
    // check against Signal's own file, not by a fixture.
    expect((await backlogDischargeStatus(dir)).outcome).toBe(BACKLOG_DISCHARGE.CLEAN);
  });
});

describe('one blind source is not the other source reporting zero', () => {
  it('an Epic-named row is CANNOT-EVALUATE when unit closure is unknowable, even with a readable BUGS.md', async () => {
    // `M5.E19`'s defect verbatim: a report taking its plan from the half that
    // cannot see an unreadable STATE.md and its refusals from the half that can.
    // With no STATE.md every unit resolves cannotDetermine, so a merged
    // "is this id closed?" map made a MISSING answer look like a NO — and a
    // readable BUGS.md kept the map non-empty, so the check said `clean`.
    await writeFile(join(dir, BACKLOG_REL), ['# Backlog', '', '### M5.E9 — Overdue enforcement', '', 'Body.', ''].join('\n'), 'utf-8');
    await writeFile(join(dir, '.planning/BUGS.md'), '# Bugs\n\n| ID | Status |\n|---|---|\n| B1 | `fixed` |\n', 'utf-8');

    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.blind).toHaveLength(1);
    expect(res.blind[0].source).toBe('unit closure');
  });

  it('a bug-named row is CANNOT-EVALUATE when there is no bug catalog, even with readable unit closure', async () => {
    await writeFile(join(dir, '.planning/STATE.md'), STATE_MD, 'utf-8');
    await writeFile(join(dir, '.planning/M5.E9-VERIFICATION.md'), VERIFICATION_PASS, 'utf-8');
    await writeFile(join(dir, BACKLOG_REL), ['# Backlog', '', '### B7 — something', '', 'Body.', ''].join('\n'), 'utf-8');

    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.blind[0].source).toBe('BUGS.md');
  });

  it('a real stale row still reports STALE while another row is blind', async () => {
    await writeFile(join(dir, '.planning/STATE.md'), STATE_MD, 'utf-8');
    await writeFile(join(dir, '.planning/M5.E9-VERIFICATION.md'), VERIFICATION_PASS, 'utf-8');
    await writeFile(join(dir, BACKLOG_REL), ['# Backlog', '', '### M5.E9 — done work', '', 'a', '', '### B7 — unknowable', '', 'b', ''].join('\n'), 'utf-8');

    const res = await backlogDischargeStatus(dir);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.STALE);
    expect(res.stale).toHaveLength(1);
    expect(res.blind).toHaveLength(1); // reported alongside, never folded into "clean"
  });
});

describe('a done-word in prose is not a status marker', () => {
  it('"Get the migration done" is a LIVE row, not a discharged one', () => {
    // Measured on the real BACKLOG.md: 4 headings carry a done-word that is
    // neither bold nor struck, and all 4 are prose — "what shipped", "after
    // v0.1.19 shipped", "shipped but never run", "open/closed work". Two are
    // live rows the check was silently skipping, which is a false NEGATIVE and
    // therefore the half nobody notices.
    const rows = parseBacklogRows(['# Backlog', '', '### M5.E9 — get the migration done', '', 'a', ''].join('\n'));
    expect(rows[0].discharged).toBe(false);
    expect(rows[0].leadingId).toBe('M5.E9');
  });

  it('a bold marker still discharges', () => {
    const rows = parseBacklogRows(['# Backlog', '', '### M5.E9 — thing · **DONE, v0.1.12**', '', 'a', ''].join('\n'));
    expect(rows[0].discharged).toBe(true);
    expect(rows[0].dischargedBy).toBe('v0.1.12');
  });
});

describe('REVIEW findings — the leading-id matcher (M5.E10 REVIEW)', () => {
  it('does not backtrack catastrophically on a heavily decorated heading', () => {
    // Found at REVIEW: the first LEADING_ID_RE used two adjacent unbounded
    // decoration runs, which backtrack quadratically on a NON-matching heading.
    // Measured 3.9s on 50k backticks, inside a check /sig:docs-sweep runs over every
    // heading in the file. Bounded runs make it linear.
    const start = Date.now();
    parseBacklogRows(['# Backlog', '', '### ' + '`'.repeat(200_000) + 'x', '', 'body', ''].join('\n'));
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('still reads a real decorated heading', () => {
    const rows = parseBacklogRows(['# Backlog', '', '### 1. ~~`B52` — thing~~ · **DONE, v0.1.20**', '', 'x', ''].join('\n'));
    expect(rows[0].leadingId).toBe('B52');
  });
});

describe('/code-review findings on M5.E10 (2026-08-13)', () => {
  it('a live `##` row followed by a <details> holding a `###` is NOT swallowed as a container', () => {
    // The container fold ran over ALL headings, so the live row was folded
    // against the `###` inside <details>, and that `###` was then removed by
    // each call site's inDetails filter — the row vanished entirely. This is
    // the drain-written shape (rows at `##`), which cannot occur in Signal's
    // own file, so dogfooding was blind to it. B82's shape.
    const md = [
      '# Backlog', '',
      '## M5.E14 — obligation tracker', '',
      '**Tag:** roadmap', '', 'Body of the live row.', '',
      '<details><summary>Original entry</summary>', '',
      '### M5.E14 — the older framing', '', 'old body.', '',
      '</details>', '',
      '*Last updated: 2026-08-01*', '',
    ].join('\n');
    const rows = parseBacklogRows(md);
    const live = rows.filter((r) => !r.inDetails);
    expect(live.map((r) => r.text)).toEqual(['M5.E14 — obligation tracker']);
    expect(live[0].leadingId).toBe('M5.E14');
    expect(rows.filter((r) => r.inDetails)).toHaveLength(1);
  });

  it('a real container is still folded away', () => {
    const rows = parseBacklogRows(HAND_GROOMED).filter((r) => !r.inDetails);
    expect(rows.some((r) => r.text.includes('Next work'))).toBe(false);
  });

  it('the sweep reports blind rows ALONGSIDE a stale one, never instead of it', async () => {
    // backlogDischargeStatus returns cannot-evaluate only when nothing is
    // stale, so one stale row plus ten unreadable ones took the STALE branch
    // and the renderer printed the one and dropped the ten. B39's shape, one
    // layer above the AC9.8 fix in the library.
    await writeFile(join(dir, '.planning/STATE.md'), STATE_MD.replace('M5.E10', 'M5.E99'), 'utf-8');
    await writeFile(join(dir, '.planning/M5.E9-VERIFICATION.md'), VERIFICATION_PASS, 'utf-8');
    await writeFile(
      join(dir, BACKLOG_REL),
      ['# Backlog', '', '### M5.E9 — shipped work', '', 'a', '', '### B7 — unknowable', '', 'b', ''].join('\n'),
      'utf-8'
    );
    const findings = await checkBacklogDischarge(dir);
    expect(findings).toHaveLength(2);
    expect(findings.some((f) => /UNKNOWN, not clean/.test(f.message))).toBe(true);
  });
});
