import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCommands, listAgents, listSkills } from '../tools/lib/roster.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MAP_PATH = join(ROOT, 'docs/map/index.html');

/**
 * `B32` — the guard checked the number, nobody checked the list.
 *
 * `docs/map/index.html` renders a hardcoded command count in its `<h2>`, and
 * `checkRosterCounts` pinned THAT NUMBER to `roster.js`. But the `COMMANDS`
 * array — the thing that actually renders the list — was never checked by
 * anything, and drifted to 17 entries while the heading said 19. The two
 * missing commands (`/sig:index`, `/sig:migrate-memory`) had been absent since
 * v0.1.8.
 *
 * The map's per-item prose (`group`, `blurb`, `summary`, `tags`, `flags`) is
 * deliberately editorial — friendlier than the source frontmatter `description`
 * — so nothing here generates it. This reconciles the SET OF NAMES only, the
 * way `/sig:index` reconciles mechanical rows against curated notes.
 *
 * Checks BOTH directions. One-directional checking is how `B32` survived: the
 * heading count was verified against disk while the list underneath it was not.
 */

/** Every marked block on the page — all must be extractable. */
const MARKERS = ['COMMANDS', 'AGENTS', 'SKILLS', 'QUESTIONS', 'TIERS'];
/** The subset shaped `[{group, items: [{name}]}]` — the roster arrays. */
const ROSTER_ARRAYS = ['COMMANDS', 'AGENTS', 'SKILLS'];

function readMap() {
  return readFileSync(MAP_PATH, 'utf8');
}

/**
 * Pull one `// map-roster:begin X` … `// map-roster:end X` block out of the
 * page and evaluate JUST that block. The page is a single 79 KB document with
 * a ~940-line inline script; evaluating the whole thing would need a DOM and
 * would couple this test to unrelated code.
 */
function extractArray(html, name) {
  const begin = `// map-roster:begin ${name}`;
  const end = `// map-roster:end ${name}`;
  const i = html.indexOf(begin);
  const j = html.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(
      `map-roster markers for ${name} not found in docs/map/index.html ` +
        `(begin: ${i !== -1}, end: ${j !== -1}). The reconcile test cannot run ` +
        `without them — restore the marker comments rather than deleting this test.`,
    );
  }
  const src = html.slice(i + begin.length, j);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return ${name};`)();
}

/** Flatten `[{group, items: [{name}]}]` → `['name', …]`. */
function namesOf(groups) {
  return groups.flatMap((g) => (g.items ?? []).map((it) => it.name));
}

/** `commands/sweep.md` → `/sig:sweep` */
const commandName = (p) => `/sig:${basename(p, '.md')}`;
/** `agents/verifiers/verifier.md` → `verifier` */
const agentName = (p) => basename(p, '.md');
/** `skills/build/context-engineering/SKILL.md` → `context-engineering` */
const skillName = (p) => basename(dirname(p));

/**
 * Report both directions with the offending names inline. A bare count
 * mismatch tells you something drifted but not what, and the fix then starts
 * with a manual diff — which is the work this test exists to remove.
 */
function expectSameSet(mapNames, diskNames, kind) {
  const inMap = new Set(mapNames);
  const onDisk = new Set(diskNames);
  const missingFromMap = diskNames.filter((n) => !inMap.has(n)).sort();
  const notOnDisk = mapNames.filter((n) => !onDisk.has(n)).sort();

  expect(
    missingFromMap,
    `${kind} on disk but absent from docs/map/index.html: ${missingFromMap.join(', ')}`,
  ).toEqual([]);
  expect(
    notOnDisk,
    `${kind} listed in docs/map/index.html but not on disk: ${notOnDisk.join(', ')}`,
  ).toEqual([]);
}

describe('B32 — docs/map arrays reconcile against roster.js', () => {
  describe('the markers themselves', () => {
    // Without this, deleting a marker would make extraction throw or return
    // nothing, and a future refactor could "fix" that by making the test skip.
    // This repo has been bitten by guards that quietly stopped guarding
    // (`B39`, `B54`); a missing marker must be loud.
    for (const name of MARKERS) {
      it(`map-roster:begin/end ${name} are both present`, () => {
        const html = readMap();
        expect(html).toContain(`// map-roster:begin ${name}`);
        expect(html).toContain(`// map-roster:end ${name}`);
      });
    }

    it('extraction throws (does not silently pass) when a marker is missing', () => {
      const html = readMap().replace('// map-roster:end COMMANDS', '');
      expect(() => extractArray(html, 'COMMANDS')).toThrow(/markers for COMMANDS not found/);
    });
  });

  it('COMMANDS matches commands/ on disk, in both directions', () => {
    const mapNames = namesOf(extractArray(readMap(), 'COMMANDS'));
    expectSameSet(mapNames, listCommands(ROOT).map(commandName), 'commands');
  });

  it('AGENTS matches agents/ on disk, in both directions', () => {
    const mapNames = namesOf(extractArray(readMap(), 'AGENTS'));
    expectSameSet(mapNames, listAgents(ROOT).map(agentName), 'agents');
  });

  it('SKILLS matches skills/ on disk, in both directions', () => {
    const mapNames = namesOf(extractArray(readMap(), 'SKILLS'));
    expectSameSet(mapNames, listSkills(ROOT).map(skillName), 'skills');
  });

  it('no duplicate names within an array', () => {
    for (const name of ROSTER_ARRAYS) {
      const names = namesOf(extractArray(readMap(), name));
      expect(new Set(names).size, `${name} contains duplicates`).toBe(names.length);
    }
  });

  describe('the calibrate simulator reconciles against its sources', () => {
    // The simulator is a SECOND implementation of tier routing: 5 questions in,
    // a tier out, written in inline JS. Checked 2026-08-03 and correct — but
    // nothing was comparing it to anything, which is the same position the
    // COMMANDS array was in before `B32`.
    //
    // What is guarded here is the DATA it keys on — the answer enums and the
    // rigor defaults — both of which have a single source of truth. The
    // decision LOGIC stays duplicated (prose in `calibrate.md`, JS here) and is
    // deliberately NOT asserted: pinning it would mean a third copy of the
    // rules. `tests/tier-precedence-consistency.test.js` covers the ordering,
    // which is the part of that logic that actually drifted.

    it('the simulator offers exactly the answers profile.js accepts', () => {
      const questions = extractArray(readMap(), 'QUESTIONS');
      const profileSrc = readFileSync(join(ROOT, 'tools/lib/profile.js'), 'utf8');

      for (const q of questions) {
        const m = profileSrc.match(
          new RegExp(`^\\s{2}${q.id}:\\s*\\[([^\\]]+)\\]`, 'm'),
        );
        expect(m, `profile.js declares no enum for the "${q.id}" axis`).toBeTruthy();
        const canonical = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
        expect(
          q.options.map((o) => o.val),
          `docs/map "${q.id}" options disagree with profile.js`,
        ).toEqual(canonical);
      }
    });

    it('every axis profile.js declares is asked by the simulator', () => {
      // The other direction: adding a sixth calibration axis must not leave the
      // simulator quietly asking five questions and reporting a tier anyway.
      const asked = extractArray(readMap(), 'QUESTIONS').map((q) => q.id);
      const profileSrc = readFileSync(join(ROOT, 'tools/lib/profile.js'), 'utf8');
      const block = profileSrc.match(/CALIBRATION_ENUMS?\s*=\s*\{([\s\S]*?)\n\}/);
      const declared = block
        ? [...block[1].matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1])
        : [];
      expect(declared.length, 'could not read the calibration enums from profile.js').toBeGreaterThan(0);
      expect(asked.sort()).toEqual(declared.sort());
    });

    it('the tier rigor defaults match references/tier-definitions.md', () => {
      const tiers = extractArray(readMap(), 'TIERS');
      const defs = readFileSync(join(ROOT, 'references/tier-definitions.md'), 'utf8');

      // The authoritative table: | `override` | SKETCH | FEATURE | SPIKE | FULL |
      const rows = [...defs.matchAll(/^\|\s*`([a-z_]+)`\s*\|([^\n]+)\|\s*$/gm)];
      expect(rows.length, 'tier-to-defaults table not found in tier-definitions.md').toBeGreaterThan(5);

      const order = ['SKETCH', 'FEATURE', 'SPIKE', 'FULL'];
      const parseList = (cell) =>
        cell.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);

      let checked = 0;
      for (const [, key, rest] of rows) {
        const cells = rest.split('|').map((c) => c.trim().replace(/`/g, ''));
        order.forEach((tier, i) => {
          // `phases_skipped` is a row in the same table but is NOT a rigor
          // override — on the page it sits at the top level of each tier.
          // Checked rather than skipped: it decides which phases run at all,
          // which is the most consequential row in the table.
          if (key === 'phases_skipped') {
            expect(
              tiers[tier].phases_skipped,
              `docs/map TIERS.${tier}.phases_skipped disagrees with tier-definitions.md`,
            ).toEqual(parseList(cells[i]));
          } else {
            expect(
              String(tiers[tier].rigor[key]),
              `docs/map TIERS.${tier}.rigor.${key} disagrees with tier-definitions.md`,
            ).toBe(cells[i]);
          }
          checked += 1;
        });
      }
      // 11 rows × 4 tiers. Pinned so a table-format change that silently drops
      // rows shows up as a coverage drop rather than a green run over nothing.
      expect(checked, 'expected 11 override rows × 4 tiers').toBe(44);
    });
  });

  describe('no live project state on the page', () => {
    // The vocabulary examples used to read "Currently: M4.5" and "Most recently
    // shipped: … v0.1.5", under a comment instructing maintainers to refresh
    // them every release. Nothing enforced it and they went four releases
    // stale. The fix was to make them timeless; this keeps them that way.
    it('vocabulary examples make no claim about current project state', () => {
      const vocab = readMap().match(/const VOCABULARY = \{[\s\S]*?\n\};/)?.[0] ?? '';
      expect(vocab, 'VOCABULARY block not found').not.toBe('');
      for (const m of vocab.matchAll(/example:\s*'([^']*)'/g)) {
        expect(
          m[1],
          `vocabulary example states live project state and will go stale: "${m[1]}"`,
        ).not.toMatch(/\b(currently|most recently|last (shipped|completed)|in flight)\b/i);
        expect(
          m[1],
          `vocabulary example names a version and will go stale: "${m[1]}"`,
        ).not.toMatch(/v\d+\.\d+\.\d+/);
      }
    });
  });

  describe('the version stamp', () => {
    // checkVersionConsistency skips a source whose reader returns null, so a
    // deleted stamp would DISABLE the check rather than fail it. Same shape as
    // the missing-marker case above.
    it('the header stamp exists and is machine-readable', () => {
      expect(readMap()).toMatch(/Map &middot; v\d+\.\d+\.\d+/);
    });

    it('the stamp does not claim the page is generated — nothing generates it', () => {
      const stamp = readMap().match(/Map &middot; [^<]*/)?.[0] ?? '';
      expect(stamp).not.toMatch(/generated/i);
    });
  });
});
