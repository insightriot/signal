// M6.E1 S1 — the geometry of the plugin root, proven before anything moves.
//
// Two shipped modules work out where the plugin is by looking at their OWN
// path on disk:
//
//   tools/lib/plugin-binding.js  boundPluginRoot()  → dirname x3
//   tools/lib/roster.js          ROOT               → join(__dirname,'..','..')
//
// Today both land on the repository root, because the repository root and the
// plugin root are the same directory. M6.E1 makes them different for the first
// time in Signal's history (`plugin/`), so both expressions change what they
// MEAN while their code stays byte-identical.
//
// `plugin-binding.js` is B52's mechanism — "which copy of Signal is actually
// running" — and its failure mode is silent: one earlier sighting silently
// discarded M5.E8's six-phase ledger. A move that quietly breaks it produces a
// Signal that misreports its own version, which is the condition under which
// every other verdict in this Epic stops being trustworthy.
//
// So these tests copy each module into a fixture tree at the POST-MOVE depth
// and assert what it derives there. Both modules import only `node:` builtins,
// which is what makes standalone relocation legitimate rather than a mock.
//
// ── On RED-first ──────────────────────────────────────────────────────────
// These assert a property that already holds, so "watch it fail first" is not
// available honestly. Discrimination is built INTO the suite instead: every
// positive case is paired with a WRONG-DEPTH case asserting the derived root
// is not the fixture root. Without those pairs, `expect(root).toBe(x)` could
// pass for a function that ignored depth entirely — which is the B81 shape
// (an assertion that cannot tell "correct" from "insensitive").

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

/** Copy one lib module to `<tmp>/<...segments>/<name>` and import it fresh. */
async function planted(tmp, segments, moduleName) {
  const dir = join(tmp, ...segments);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, moduleName);
  await copyFile(join(REPO, 'plugin', 'tools', 'lib', moduleName), dest);
  // Cache-bust: the same specifier must not resolve to a previous plant.
  return import(`${pathToFileURL(dest).href}?v=${segments.join('-')}`);
}

describe('M6.E1 — plugin-root geometry survives the move', () => {
  let tmp;

  beforeEach(async () => {
    // realpath: macOS /var is a symlink to /private/var, and boundPluginRoot
    // realpathSync's its own path. Comparing an un-realpath'd fixture root
    // against a realpath'd derivation fails for a reason that has nothing to
    // do with the property under test.
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'sig-geometry-')));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  describe('boundPluginRoot() — B52 mechanism', () => {
    it('resolves to the PLUGIN root at the post-move depth (plugin/tools/lib)', async () => {
      const mod = await planted(tmp, ['plugin', 'tools', 'lib'], 'plugin-binding.js');
      expect(mod.boundPluginRoot()).toBe(join(tmp, 'plugin'));
    });

    it('still resolves correctly at TODAY\'s depth (tools/lib), so the move is the only change', async () => {
      const mod = await planted(tmp, ['tools', 'lib'], 'plugin-binding.js');
      expect(mod.boundPluginRoot()).toBe(tmp);
    });

    // Discrimination: without this, the two assertions above could both pass
    // for a function that returned some fixed ancestor regardless of depth.
    it('is DEPTH-SENSITIVE — one level shallower does not yield the fixture root', async () => {
      const mod = await planted(tmp, ['plugin', 'tools'], 'plugin-binding.js');
      expect(mod.boundPluginRoot()).not.toBe(join(tmp, 'plugin'));
      expect(mod.boundPluginRoot()).toBe(tmp); // it lands one level UP, as the arithmetic demands
    });
  });

  describe('roster ROOT — the default baseDir for the roster counts', () => {
    it('resolves to the PLUGIN root at the post-move depth', async () => {
      const mod = await planted(tmp, ['plugin', 'tools', 'lib'], 'roster.js');
      expect(mod.ROOT).toBe(join(tmp, 'plugin'));
    });

    it('is DEPTH-SENSITIVE — one level shallower does not yield the fixture root', async () => {
      const mod = await planted(tmp, ['plugin', 'tools'], 'roster.js');
      expect(mod.ROOT).not.toBe(join(tmp, 'plugin'));
    });

    // The consequence that actually matters: post-move, the roster must read
    // commands/agents/skills from inside plugin/, because that is where they
    // will be. A correct ROOT that nothing reads from would prove nothing.
    it('reads commands/agents/skills from the plugin root it derived', async () => {
      const mod = await planted(tmp, ['plugin', 'tools', 'lib'], 'roster.js');
      await mkdir(join(tmp, 'plugin', 'commands'), { recursive: true });
      await mkdir(join(tmp, 'plugin', 'agents'), { recursive: true });
      await mkdir(join(tmp, 'plugin', 'skills', 'define', 'x'), { recursive: true });
      await writeFile(join(tmp, 'plugin', 'commands', 'demo.md'), '# demo\n');
      await writeFile(join(tmp, 'plugin', 'agents', 'demo.md'), '# demo\n');
      await writeFile(join(tmp, 'plugin', 'skills', 'define', 'x', 'SKILL.md'), '# skill\n');

      // A decoy at the OLD location: if ROOT regressed to the repo root, these
      // would be found instead, and the assertion would silently pass on the
      // wrong tree.
      await mkdir(join(tmp, 'commands'), { recursive: true });
      await writeFile(join(tmp, 'commands', 'decoy.md'), '# decoy\n');

      const commands = mod.listCommands();
      expect(commands).toContain('commands/demo.md');
      expect(commands.join('\n')).not.toContain('decoy');
      expect(mod.listAgents()).toContain('agents/demo.md');
      expect(mod.listSkills()).toContain('skills/define/x/SKILL.md');
    });
  });

  describe('the payload moves as one unit — hooks keep reaching tools/lib', () => {
    // Four hooks import '../tools/lib/*.js'. Because hooks/ and tools/lib/
    // move TOGETHER, that relative path is preserved. This pins the reason the
    // payload must move as a unit rather than directory by directory.
    it('plugin/hooks/x.js → ../tools/lib/y.js lands inside the plugin root', async () => {
      await mkdir(join(tmp, 'plugin', 'hooks'), { recursive: true });
      await mkdir(join(tmp, 'plugin', 'tools', 'lib'), { recursive: true });
      const from = join(tmp, 'plugin', 'hooks');
      const resolved = join(from, '..', 'tools', 'lib', 'y.js');
      // y.js → lib → tools → plugin: three dirnames, the same arithmetic
      // boundPluginRoot() uses. (Two was the first draft here, and it landed
      // on plugin/tools — the test caught its own author.)
      expect(await realpath(dirname(dirname(dirname(resolved))))).toBe(join(tmp, 'plugin'));
    });
  });
});
