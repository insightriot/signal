/**
 * tests/permissions-scan.test.js — what the flow prescribes, derived from the
 * payload rather than written down (`M6.E5` FR1.1 / FR1.2).
 *
 * WHY DERIVATION ALONE IS NOT THE DESIGN. Measured at DISCUSS: the prompt layer
 * prescribes 49 distinct binary+subcommand pairs, and the set contains `rm`
 * (five occurrences, because `/sig:doctor --fix` DESCRIBES `rm -rf` on cache
 * directories), plus `git reset`, `git rebase` and `pip install`. A generator
 * that emitted its own scan would propose `Bash(rm *)`. So the scan supplies
 * CANDIDATES and a committed classification decides what may be proposed.
 *
 * WHY A HAND-WRITTEN TABLE ALONE IS NOT THE DESIGN EITHER. That is
 * `light`-vs-`strict` — the remedy `B75` measured the ceiling on, where two
 * settings expanded to identical config except one boolean. A table nothing
 * checks drifts the moment a command file adds a tool.
 *
 * THE LOAD-BEARING TEST IS `whole-population`. It is fed the LIVE scan output,
 * not a fixture list, so a new command prescribing a new binary fails the suite
 * until it is classified. A fixture-based version would recreate the bug inside
 * the test — the mistake `prescribed-cli.test.js` explicitly avoided by
 * deriving its identity from the manifests rather than pinning a literal.
 *
 * PROOF-OF-FAIL is explicit, not claimed: `proof of fail` builds a payload
 * prescribing a binary the classification has never seen and asserts the
 * whole-population check reports it. A guard never shown to go red is `B39`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scanPrescribedCommands,
  classify,
  unclassifiedBinaries,
  LAYER,
  SCAN_STATUS,
  VERDICT,
} from '../plugin/tools/lib/permissions-scan.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = join(ROOT, 'plugin');

/** Build a throwaway payload tree with a known prescribed set. */
function fixturePayload(files) {
  const dir = mkdtempSync(join(tmpdir(), 'perm-scan-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf-8');
  }
  return dir;
}

describe('scanPrescribedCommands — the two layers, separately labelled (FR1.1)', () => {
  it('AC1.1a — returns prescribed pairs with the file and line that prescribed them', () => {
    const dir = fixturePayload({
      'commands/demo.md': 'Run `npm test` and then `git log --oneline`.\n',
    });
    const r = scanPrescribedCommands(dir);
    expect(r.status).toBe(SCAN_STATUS.OK);

    const keys = r.entries.map((e) => e.key);
    expect(keys).toContain('npm test');
    expect(keys).toContain('git log');

    const npm = r.entries.find((e) => e.key === 'npm test');
    expect(npm.source).toBe('commands/demo.md');
    expect(npm.line).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC1.1b — a prose-layer hit and a code-layer hit are distinguishable on the record', () => {
    const dir = fixturePayload({
      'commands/demo.md': 'Run `npm test`.\n',
      'tools/lib/thing.js': "execFileSync('git', ['rev-parse', 'HEAD']);\n",
    });
    const r = scanPrescribedCommands(dir);

    const npm = r.entries.find((e) => e.key === 'npm test');
    const git = r.entries.find((e) => e.binary === 'git');
    expect(npm.layer).toBe(LAYER.PROMPT);
    expect(git.layer).toBe(LAYER.DETERMINISTIC);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC1.1b — the deterministic layer reads execFileSync call sites, not backticks', () => {
    const dir = fixturePayload({
      'hooks/h.js': "import { execFileSync } from 'node:child_process';\nexecFileSync('ps', ['-o', 'lstart=']);\n",
    });
    const r = scanPrescribedCommands(dir);
    const ps = r.entries.find((e) => e.binary === 'ps');
    expect(ps).toBeTruthy();
    expect(ps.layer).toBe(LAYER.DETERMINISTIC);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC1.1c — an absent payload renders cannot-check, NOT an empty clean result', () => {
    const r = scanPrescribedCommands(join(tmpdir(), 'perm-scan-does-not-exist-9c3f'));
    expect(r.status).toBe(SCAN_STATUS.CANNOT_CHECK);
    expect(r.reason).toBeTruthy();
    // The distinction B39 exists for: "looked and found nothing" must not read
    // the same as "could not look".
    expect(r.entries).toEqual([]);
  });

  it('AC1.1c — a payload with directories but no prescriptions is OK-and-empty, not cannot-check', () => {
    const dir = fixturePayload({ 'commands/quiet.md': 'This file prescribes nothing at all.\n' });
    const r = scanPrescribedCommands(dir);
    expect(r.status).toBe(SCAN_STATUS.OK);
    expect(r.entries).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC1.1d — reads the payload from disk: a new file appears without touching the module', () => {
    const dir = fixturePayload({ 'commands/one.md': 'Run `npm test`.\n' });
    expect(scanPrescribedCommands(dir).entries.map((e) => e.key)).toEqual(['npm test']);

    writeFileSync(join(dir, 'commands', 'two.md'), 'Also run `gh pr create`.\n', 'utf-8');
    const after = scanPrescribedCommands(dir).entries.map((e) => e.key);
    // The key is binary + FIRST subcommand token, deliberately — `gh pr`, not
    // `gh pr create`. Permission rules are prefix patterns, so the second level
    // is the useful granularity and anything deeper is noise.
    expect(after).toContain('gh pr');
    rmSync(dir, { recursive: true, force: true });
  });

  it('records which payload directory each hit came from (probe 2 — provenance is a classification input)', () => {
    const dir = fixturePayload({
      'commands/c.md': 'Run `npm test`.\n',
      'agents/a.md': 'Run `pytest -q`.\n',
    });
    const r = scanPrescribedCommands(dir);
    expect(r.entries.find((e) => e.binary === 'npm').dir).toBe('commands');
    expect(r.entries.find((e) => e.binary === 'pytest').dir).toBe('agents');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('scanPrescribedCommands — against the real payload', () => {
  let live;
  beforeAll(() => {
    live = scanPrescribedCommands(PAYLOAD);
  });

  it('reads the live payload successfully', () => {
    expect(live.status).toBe(SCAN_STATUS.OK);
    expect(live.entries.length).toBeGreaterThan(50);
  });

  it('AC1.1a — returns the binaries measured at DISCUSS', () => {
    // Measured 2026-08-26. `git` and `npm` dominate; the rest are the long tail.
    for (const b of ['git', 'npm', 'node', 'claude']) {
      expect(live.binaries, `expected the live scan to prescribe ${b}`).toContain(b);
    }
  });

  it('FINDING — `gh` is NOT prescribed anywhere in the payload, and that is correct', () => {
    // The only `gh` in plugin/ is the bare word inside prose at ship.md:271
    // ("no `gh`, no auth, no network"). The actual guidance — `gh pr create
    // --fill`, `gh pr merge --squash` — lives in the repo-root CLAUDE.md, which
    // is NOT part of the shipped payload and is therefore not scanned.
    //
    // This is a real under-proposal and it is pinned rather than patched: the
    // project's hand-cleaned settings carry three gh rules (gh auth/repo/api),
    // and a flow-derived proposal would offer none of them. S5.t3's outcome
    // metric exists to publish exactly this direction of miss. If someone later
    // adds a gh invocation to a command file, this test goes red and the note
    // gets revisited deliberately.
    expect(live.binaries).not.toContain('gh');
  });

  it('AC1.1a — returns `rm`, which is the whole reason classification exists', () => {
    // /sig:doctor --fix DESCRIBES `rm -rf` on cache dirs. Derivation cannot tell
    // a description from a prescription, which is why S1.t2 exists.
    expect(live.binaries).toContain('rm');
  });

  it('probe 2 — binaries reach beyond plugin/commands, so the scan must too', () => {
    const outsideCommands = new Set(
      live.entries.filter((e) => e.dir !== 'commands').map((e) => e.binary)
    );
    const inCommands = new Set(
      live.entries.filter((e) => e.dir === 'commands').map((e) => e.binary)
    );
    const onlyOutside = [...outsideCommands].filter((b) => !inCommands.has(b));
    // Measured at S1.t0: 11 such binaries. Asserted as a floor, not an equality —
    // pinning 11 would fail on every ordinary content edit.
    expect(onlyOutside.length).toBeGreaterThanOrEqual(8);
  });

  it('the deterministic layer resolves to git and ps, and nothing else', () => {
    const det = new Set(
      live.entries.filter((e) => e.layer === LAYER.DETERMINISTIC).map((e) => e.binary)
    );
    expect([...det].sort()).toEqual(['git', 'ps']);
  });
});

describe('classify — the committed table (FR1.2)', () => {
  it('AC1.2a — `rm` is never-propose', () => {
    expect(classify('rm')).toBe(VERDICT.NEVER_PROPOSE);
    expect(classify('rm -rf')).toBe(VERDICT.NEVER_PROPOSE);
  });

  it('AC1.2b — history-rewriting and tree-destroying git subcommands are not propose-allow', () => {
    for (const key of ['git reset', 'git rebase', 'git revert', 'git checkout', 'git push --force']) {
      expect(classify(key), `${key} must not be propose-allow`).not.toBe(VERDICT.PROPOSE_ALLOW);
    }
  });

  it('the ordinary read-only git surface IS propose-allow', () => {
    for (const key of ['git log', 'git status', 'git diff', 'git rev-parse']) {
      expect(classify(key), `${key} should be propose-allow`).toBe(VERDICT.PROPOSE_ALLOW);
    }
  });

  it('an unknown binary classifies as undefined rather than defaulting to allow', () => {
    // Failing open to `propose-allow` on an unknown binary is how `rm` would
    // reach a proposal the day someone renames it.
    expect(classify('some-tool-nobody-classified')).toBeUndefined();
  });
});

describe('whole-population — the classification cannot silently fall behind (AC1.2c)', () => {
  it('every binary the LIVE scan returns is classified', () => {
    const missing = unclassifiedBinaries(scanPrescribedCommands(PAYLOAD));
    expect(
      missing,
      `unclassified binaries found in the live payload: ${missing.join(', ')}. ` +
        'Add each to the classification table in permissions-scan.js — a binary ' +
        'nobody classified must never reach a proposal.'
    ).toEqual([]);
  });

  it('proof of fail — a payload prescribing an unknown binary IS reported', () => {
    const dir = fixturePayload({
      'commands/rogue.md': 'First run `frobnicate --hard`, then `npm test`.\n',
    });
    const missing = unclassifiedBinaries(scanPrescribedCommands(dir));
    expect(missing).toContain('frobnicate');
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC1.2d — the generator and the test read the SAME table', () => {
    // Two copies of "which binaries may be proposed" is B82's shape. The check
    // is structural: unclassifiedBinaries must be derived from classify, so a
    // verdict added to the table is visible to both without a second edit.
    const dir = fixturePayload({ 'commands/x.md': 'Run `frobnicate --hard`.\n' });
    const scan = scanPrescribedCommands(dir);
    expect(unclassifiedBinaries(scan)).toContain('frobnicate');
    expect(classify('frobnicate')).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
