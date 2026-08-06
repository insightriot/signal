import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DESCRIPTIVE_ALLOWLIST,
  walkResidue,
  classifyResidue,
  checkLeak,
} from '../tools/lib/adherence-leak.js';
import { PLUGIN_COPY_DIRS } from '../tools/lib/adherence-harness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * FR2 — the leak check walks the copied tree INDEPENDENTLY, and fails closed.
 *
 * THE POINT OF THIS FILE. `B55` happened because the only check on the control
 * arm asked the canary what it had deleted and then confirmed those same files
 * were clean. A check that consults the deletion list can only ever find sites
 * the list already knows about — it is the mutation restating itself, not an
 * independent measurement. It reported clean while four command files still
 * ordered the instruction.
 *
 * So this walk never reads `canary.deletions`. It greps every copied file for the
 * residue token and classifies what survives against an allowlist of known
 * DESCRIPTIVE sites. Anything not on that list is directive, and directive
 * residue means the arm is not a control.
 */

const scratch = [];
afterEach(() => {
  while (scratch.length) rmSync(scratch.pop(), { recursive: true, force: true });
});

function fixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'leak-'));
  scratch.push(root);
  for (const d of PLUGIN_COPY_DIRS) mkdirSync(join(root, d), { recursive: true });
  return root;
}

const TOKEN = 'transitionPhase';

describe('walkResidue covers the whole copied tree (AC2.5)', () => {
  it('finds the token in every PLUGIN_COPY_DIRS directory, not just commands/', () => {
    const root = fixtureTree();
    for (const d of ['commands', 'skills', 'agents', 'hooks', 'state']) {
      writeFileSync(join(root, d, 'planted.md'), `line one\ncall ${TOKEN} here\n`);
    }
    const hits = walkResidue(root, TOKEN);
    const dirs = new Set(hits.map(h => h.file.split('/')[0]));
    for (const d of ['commands', 'skills', 'agents', 'hooks', 'state']) {
      expect(dirs.has(d), `${d}/ was not walked`).toBe(true);
    }
  });

  it('reports file, line number and the matching text', () => {
    const root = fixtureTree();
    writeFileSync(join(root, 'commands', 'x.md'), `alpha\nbeta\ncall ${TOKEN}\n`);
    const hits = walkResidue(root, TOKEN);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe('commands/x.md');
    expect(hits[0].line).toBe(3);
    expect(hits[0].text).toContain(TOKEN);
  });

  it('reports every occurrence in a file, not just the first', () => {
    const root = fixtureTree();
    writeFileSync(join(root, 'commands', 'x.md'), `${TOKEN}\nmid\n${TOKEN}\n`);
    expect(walkResidue(root, TOKEN)).toHaveLength(2);
  });

  it('returns nothing for a tree that never names the token', () => {
    const root = fixtureTree();
    writeFileSync(join(root, 'commands', 'x.md'), 'nothing to see\n');
    expect(walkResidue(root, TOKEN)).toEqual([]);
  });
});

describe('the descriptive allowlist is pinned, not inferred (AC2.3, AC2.4)', () => {
  it('AC2.3 — enumerates exactly the seven reviewed entries', () => {
    // Adding a file here must be a visible, reviewed edit — never a side effect
    // of some other change. If this test goes red, someone widened what the
    // harness is willing to call "descriptive", and that decision belongs in a
    // diff a human reads.
    expect([...DESCRIPTIVE_ALLOWLIST.keys()].sort()).toEqual([
      'commands/calibrate.md',
      'commands/discuss.md',
      'commands/index.md',
      'references/state-schema.md',
      'tools/lib/adherence-verdict.js',
      'tools/lib/directive-classifier.js',
      'tools/lib/state.js',
    ]);
  });

  it('AC2.4 — tools/lib/state.js is allowlisted as THE CAPABILITY, with the reason stated', () => {
    const why = DESCRIPTIVE_ALLOWLIST.get('tools/lib/state.js');
    expect(why).toMatch(/capability/i);
    expect(why).toMatch(/could not|was not told/i);
  });

  it('every allowlist entry carries a reason a reader can audit', () => {
    for (const [file, why] of DESCRIPTIVE_ALLOWLIST) {
      expect(typeof why, `${file} has no reason`).toBe('string');
      expect(why.length, `${file}'s reason is too thin to audit`).toBeGreaterThan(40);
    }
  });
});

/**
 * Closing the gap between AC2.3 and S1.t7, which pull against each other.
 *
 * S1.t7 scrubbed the measured instruction out of `adherence-verdict.js` BECAUSE
 * its presence there was a leak: `tools/` ships inside the tree the control agent
 * reads. AC2.3 then requires that same file on the descriptive allowlist — so if
 * a mention ever came back, the walk would classify it descriptive and let the
 * run proceed. Written at different times, and both are defensible in isolation.
 *
 * Resolved by keeping the allowlist entry exactly as AC2.3 specifies AND pinning
 * the scrub here. A reacquired mention now fails at commit time, which is
 * strictly earlier and cheaper than refusing a run that costs money.
 *
 * `directive-classifier.js` is excluded deliberately: it names the token as DATA
 * while classifying instruction kinds, which is its job.
 */
describe('the apparatus stays scrubbed (S1.t7 regression)', () => {
  const APPARATUS = [
    'tools/lib/adherence-verdict.js',
    'tools/lib/adherence-leak.js',
    'tools/lib/adherence-caveats.js',
    'tools/lib/adherence-harness.js',
    'tools/lib/adherence-log.js',
    'tools/adherence-run.js',
  ];

  it.each(APPARATUS)('%s does not restate the measured instruction', file => {
    const src = readFileSync(join(ROOT, file), 'utf-8');
    expect(src).not.toContain(TOKEN);
  });

  it('the allowlist entry for adherence-verdict.js says why it is retained', () => {
    const why = DESCRIPTIVE_ALLOWLIST.get('tools/lib/adherence-verdict.js');
    expect(why).toMatch(/S1\.t7|scrub/i);
  });
});

describe('classification fails closed (AC2.2)', () => {
  it('AC2.2 — an unrecognised file naming the token is DIRECTIVE, not ignored', () => {
    const hits = [{ file: 'commands/sixth-command.md', line: 12, text: `call ${TOKEN}` }];
    const { directive, descriptive } = classifyResidue(hits);
    expect(directive).toHaveLength(1);
    expect(descriptive).toHaveLength(0);
  });

  it('allowlisted files are descriptive', () => {
    const hits = [{ file: 'references/state-schema.md', line: 3, text: TOKEN }];
    const { directive, descriptive } = classifyResidue(hits);
    expect(descriptive).toHaveLength(1);
    expect(directive).toHaveLength(0);
  });

  it('a new file in a NON-command directory is directive too — the walk is not commands-only', () => {
    const hits = [{ file: 'skills/build/some-skill/SKILL.md', line: 2, text: TOKEN }];
    expect(classifyResidue(hits).directive).toHaveLength(1);
  });
});

describe('checkLeak against a real copied tree (AC2.1)', () => {
  function realCopy() {
    const root = fixtureTree();
    for (const d of PLUGIN_COPY_DIRS) {
      try { cpSync(join(ROOT, d), join(root, d), { recursive: true }); } catch { /* absent dir */ }
    }
    return root;
  }

  it('AC2.1 — an undeleted declared directive site fails, naming file and line', () => {
    const root = realCopy();
    // Nothing deleted at all: every directive site is still present.
    const res = checkLeak(root, TOKEN);
    expect(res.ok).toBe(false);
    const files = res.directive.map(h => h.file);
    expect(files).toContain('commands/execute.md');
    expect(res.directive[0]).toHaveProperty('line');
    expect(typeof res.directive[0].line).toBe('number');
  });

  it('AC2.5 — the walk reaches references/ and tools/ in a real copy', () => {
    const root = realCopy();
    const files = new Set(walkResidue(root, TOKEN).map(h => h.file));
    expect(files.has('tools/lib/state.js')).toBe(true);
    expect(files.has('references/state-schema.md')).toBe(true);
  });

  /**
   * S3.t5 — THE COUPLING GUARD.
   *
   * This is the assertion that the walk never consults what the canary declared,
   * and it is the property that stops this becoming `B55` a second time. Handed a
   * canary with an EMPTY deletions list, the check must still find the residue —
   * because it never asked the canary anything. A check that passed here would be
   * reading the mutation's own homework.
   */
  it('S3.t5 — the check still fires with deletions: [] (it never consults the canary)', () => {
    const root = realCopy();
    const res = checkLeak(root, TOKEN, { canary: { deletions: [] } });
    expect(res.ok).toBe(false);
    expect(res.directive.length).toBeGreaterThan(0);
  });

  it('S3.t5 — checkLeak accepts no canary at all and behaves identically', () => {
    const root = realCopy();
    const withCanary = checkLeak(root, TOKEN, { canary: { deletions: [] } });
    const without = checkLeak(root, TOKEN);
    expect(without.directive.map(h => h.file)).toEqual(withCanary.directive.map(h => h.file));
  });

  it('a tree with every directive site removed passes, leaving only descriptive residue', () => {
    const root = realCopy();
    for (const f of ['execute', 'plan', 'verify', 'review', 'ship']) {
      writeFileSync(join(root, 'commands', `${f}.md`), 'stripped for this fixture\n');
    }
    rmSync(join(root, 'references', 'adherence-canaries.json'), { force: true });
    const res = checkLeak(root, TOKEN);
    expect(res.directive).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.descriptive.length).toBeGreaterThan(0);
  });
});
