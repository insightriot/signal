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

const MARKERS = ['COMMANDS', 'AGENTS', 'SKILLS'];

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
    for (const name of MARKERS) {
      const names = namesOf(extractArray(readMap(), name));
      expect(new Set(names).size, `${name} contains duplicates`).toBe(names.length);
    }
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
