/**
 * tests/permissions-report.test.js — the deliverable (`M6.E5` FR4.1 / FR5.x).
 *
 * THE ONE GUARANTEE THE WHOLE DESIGN RESTS ON is `AC5.1a`: no code path writes
 * to `.claude/` or `~/.claude/`. `D-BR0826-1` settled that authority stays where
 * the platform put it — Signal proposes, a human installs. That may not rest on
 * a reviewer's reading of the source, so it is asserted against real filesystem
 * state after a full render.
 *
 * `AC5.3` IS THE PATH THE S1.t0 PROBE RE-PLANNED. FR5.3 originally leaned on
 * `detectProjectKind`, which the probe found calls every non-git directory
 * `greenfield` (B112). It now turns on `.planning/` presence, which is one
 * existsSync and has no ambiguity.
 */

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProposal, formatReport, renderArtifact, writeArtifact,
  DENY_PROPOSALS, DENY_CAP, PLATFORM_MODES, parseFlags, ARTIFACT_REL,
} from '../plugin/tools/lib/permissions-report.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = join(ROOT, 'plugin');

/** A throwaway world: a home, a repo, and whatever files the case needs. */
function world(files = {}, { planning = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'perm-report-'));
  const home = join(root, 'home');
  const base = join(root, 'repo');
  mkdirSync(join(home, '.claude'), { recursive: true });
  mkdirSync(base, { recursive: true });
  if (planning) mkdirSync(join(base, '.planning'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf-8');
  }
  return { root, home, base };
}
const build = (w) => buildProposal({ pluginRoot: PAYLOAD, baseDir: w.base, homeDir: w.home });

describe('buildProposal + formatReport (S4.t1)', () => {
  it('labels flow-derived and stack-derived rules SEPARATELY (AC3.1d)', () => {
    const w = world({ 'repo/package.json': JSON.stringify({ scripts: { test: 'vitest' } }) });
    const p = build(w);
    expect(p.flow.length).toBeGreaterThan(0);
    expect(p.stack).toContain('Bash(npm run test:*)');
    expect(p.flow).not.toContain('Bash(npm run test:*)');
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC1.2a — `rm` never reaches the proposal, in either half', () => {
    const w = world();
    const p = build(w);
    const all = [...p.flow, ...p.stack].join('\n');
    expect(all).not.toMatch(/Bash\(rm/);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC2.1c — an already-granted rule is suppressed and COUNTED', () => {
    const w = world();
    const first = build(w);
    const already = first.flow[0];
    mkdirSync(join(w.base, '.claude'), { recursive: true });
    writeFileSync(
      join(w.base, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: [already] } }),
      'utf-8'
    );
    const p = build(w);
    expect(p.flow).not.toContain(already);
    expect(p.suppressedCount).toBeGreaterThan(0);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.1c — renders a report even when nothing is proposable, saying so', () => {
    const w = world();
    const p = build(w);
    const emptied = { ...p, flow: [], stack: [], deny: [] };
    const out = formatReport(emptied);
    expect(out).toBeTruthy();
    expect(out).toMatch(/nothing (new )?to propose/i);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('NFR2 — a cannot-check scope is a visible line in the report', () => {
    const w = world({ 'repo/.claude/settings.json': '{{{' });
    expect(formatReport(build(w))).toMatch(/cannot-check/);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('NFR1 — an unreadable payload does not kill the run; the report still renders', () => {
    const w = world();
    const p = buildProposal({
      pluginRoot: join(tmpdir(), 'no-such-payload-77b1'),
      baseDir: w.base,
      homeDir: w.home,
    });
    expect(p.scanStatus).toBe('cannot-check');
    expect(formatReport(p)).toMatch(/cannot-check/);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('NFR4 — two renders over an unchanged tree are BYTE-IDENTICAL', () => {
    // The ordinary causes are readdir order, Set/Object iteration and unsorted
    // merges — none of which a reviewer reliably spots.
    const w = world({ 'repo/package.json': JSON.stringify({ scripts: { b: 'x', a: 'y' } }) });
    expect(formatReport(build(w))).toBe(formatReport(build(w)));
    rmSync(w.root, { recursive: true, force: true });
  });

  it('NFR4 — no network is reachable from the render path', () => {
    const src = readFileSync(join(ROOT, 'plugin', 'tools', 'lib', 'permissions-report.js'), 'utf-8');
    expect(src).not.toMatch(/\bfetch\s*\(|node:https?|require\(['"]https?['"]\)|XMLHttpRequest/);
  });
});

describe('the deny proposal (S4.t2 / FR4.1)', () => {
  it('AC4.1a — small enough to read in one screen, and the cap is a NUMBER', () => {
    // AC4.1a says "one screen", which is not falsifiable. DEN_CAP is the real
    // criterion, written down rather than inferred (flagged at plan validation).
    expect(DENY_CAP).toBe(8);
    expect(DENY_PROPOSALS.length).toBeLessThanOrEqual(DENY_CAP);
    expect(DENY_PROPOSALS.length).toBeGreaterThan(0);
  });

  it('AC4.1a — every deny entry names why it is there', () => {
    for (const d of DENY_PROPOSALS) {
      expect(d.rule, 'a deny entry needs a rule').toBeTruthy();
      expect(d.why, `deny rule ${d.rule} must say why`).toBeTruthy();
      expect(d.why.length).toBeGreaterThan(20);
    }
  });

  it('AC4.1b — the absoluteness warning renders AT the deny list', () => {
    const w = world();
    const out = formatReport(build(w));
    const denyIdx = out.indexOf('Proposed deny');
    expect(denyIdx).toBeGreaterThan(-1);
    const section = out.slice(denyIdx, denyIdx + 1200);
    expect(section).toMatch(/cannot carry.*exception|absolute/i);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC4.1c — deny rules are PROPOSED on the same footing as allow, never installed', () => {
    // Found missing at VERIFY: every other AC4.1 criterion had a named test and
    // this one did not. The risk it guards is asymmetry — a deny list that gets
    // written somewhere allow rules would not, on the reasoning that blocking is
    // "safer". It is not: a deny rule stops work, and installing one nobody read
    // is the same category of act as installing an allow rule nobody read.
    const w = world();
    const p = build(w);

    // Proposed: it reaches the artifact's installable block, beside allow.
    const md = renderArtifact(p);
    const block = JSON.parse(md.slice(md.indexOf('{'), md.lastIndexOf('}') + 1));
    expect(Object.keys(block.permissions).sort()).toEqual(['allow', 'deny']);
    expect(block.permissions.deny.length).toBeGreaterThan(0);

    // Never installed: after a full render AND write, no settings file exists in
    // either scope — the same assertion AC5.1a makes for allow, made for deny.
    writeArtifact(w.base, md);
    expect(existsSync(join(w.base, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(w.base, '.claude', 'settings.local.json'))).toBe(false);
    expect(existsSync(join(w.home, '.claude', 'settings.json'))).toBe(false);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC4.1d — names the three platform modes and invents no fourth', () => {
    expect(PLATFORM_MODES).toEqual(['default', 'allow rule', 'dontAsk']);
    const w = world();
    const out = formatReport(build(w));
    // B75: a fourth unenforced dial beside tier/gate_strictness/attention is the
    // repository's named defect. No Signal-invented mode name may appear.
    for (const invented of ['sig-mode', 'permission tier', 'consent level', 'trust level']) {
      expect(out.toLowerCase()).not.toContain(invented);
    }
    rmSync(w.root, { recursive: true, force: true });
  });
});

describe('the artifact (S4.t3 / FR5.x)', () => {
  it('AC5.1a — NO write reaches .claude/ or ~/.claude/, asserted on disk', () => {
    const w = world();
    const before = existsSync(join(w.base, '.claude'));
    const p = build(w);
    writeArtifact(w.base, renderArtifact(p));
    expect(existsSync(join(w.base, '.claude'))).toBe(before);
    expect(existsSync(join(w.base, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(w.home, '.claude', 'settings.json'))).toBe(false);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.1a — the source contains no write path to a settings file at all', () => {
    const src = readFileSync(join(ROOT, 'plugin', 'tools', 'lib', 'permissions-report.js'), 'utf-8');
    expect(src).not.toMatch(/writeFileSync\([^)]*settings/i);
  });

  it('AC5.1b — names the install route, does NOT invoke it', () => {
    const w = world();
    const out = formatReport(build(w));
    expect(out).toMatch(/update-config/);
    const src = readFileSync(join(ROOT, 'plugin', 'tools', 'lib', 'permissions-report.js'), 'utf-8');
    expect(src).not.toMatch(/invokeSkill|runSkill|execFileSync/);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.2a — writes .planning/PERMISSIONS.md', () => {
    const w = world();
    const r = writeArtifact(w.base, renderArtifact(build(w)));
    expect(r.status).toBe('written');
    expect(existsSync(join(w.base, ARTIFACT_REL))).toBe(true);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.2b — names the TRACKED project settings file as the install target, and why', () => {
    const w = world();
    const md = renderArtifact(build(w));
    expect(md).toContain('.claude/settings.json');
    expect(md).toMatch(/gitignored|not tracked|version control/i);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.2c — idempotent: an unchanged proposal does not rewrite the file', () => {
    const w = world();
    const md = renderArtifact(build(w));
    writeArtifact(w.base, md);
    const before = statSync(join(w.base, ARTIFACT_REL)).mtimeMs;
    const second = writeArtifact(w.base, md);
    expect(second.status).toBe('unchanged');
    expect(statSync(join(w.base, ARTIFACT_REL)).mtimeMs).toBe(before);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.3a — with NO .planning/, the report still renders in full', () => {
    const w = world({ 'repo/package.json': '{"scripts":{"test":"vitest"}}' }, { planning: false });
    const p = build(w);
    const out = formatReport(p);
    expect(out).toMatch(/Proposed allow/);
    expect(p.flow.length).toBeGreaterThan(0);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.3b — the artifact step reports SKIPPED WITH ITS REASON, not silently omitted', () => {
    const w = world({}, { planning: false });
    const r = writeArtifact(w.base, renderArtifact(build(w)));
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/\.planning/);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.3c — it does NOT create .planning/ — checked on disk afterwards', () => {
    const w = world({}, { planning: false });
    writeArtifact(w.base, renderArtifact(build(w)));
    expect(existsSync(join(w.base, '.planning'))).toBe(false);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.3d — the reach is PUBLISHED: report everywhere, artifact only in Signal projects', () => {
    const w = world();
    const out = formatReport(build(w));
    expect(out).toMatch(/any repository|every repository/i);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('AC5.2d — nothing downstream reads the artifact (whole-population grep)', () => {
    const { execFileSync } = require('node:child_process');
    const hits = execFileSync(
      'grep',
      ['-rl', 'PERMISSIONS.md', join(ROOT, 'plugin', 'commands'), join(ROOT, 'plugin', 'tools', 'lib')],
      { encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(ROOT + '/', ''));
    // Only the module that writes it and the command that runs it may name it.
    const allowed = new Set(['plugin/tools/lib/permissions-report.js', 'plugin/commands/permissions.md']);
    expect(hits.filter((h) => !allowed.has(h))).toEqual([]);
  });
});

describe('flags (NFR3)', () => {
  it('accepts the documented flags', () => {
    expect(parseFlags(['--apply']).ok).toBe(true);
    expect(parseFlags([]).ok).toBe(true);
  });

  it('NFR3 — rejects an unknown flag and NAMES the valid set', () => {
    const r = parseFlags(['--wat']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('--wat');
    expect(r.error).toMatch(/--apply/);
  });
});

describe('defects found by RUNNING the report, not by a test (S4.t1, 2026-08-27)', () => {
  /**
   * Both of these survived a green 25-test file and were visible in the first
   * real render. They are pinned here so they cannot come back.
   */

  it('a bare binary rule is NOT proposed when it would re-grant a refused subcommand', () => {
    // `Bash(git:*)` grants `git reset`, `git rebase` and `git push --force` —
    // exactly what AC1.2b withholds. classify('git reset') was correct all
    // along; the PROPOSAL threw that answer away by emitting a wider rule
    // beside it. The defect lives between a correct classification and the rule
    // rendered from it, which is why no classify() test could catch it.
    const w = world();
    const p = build(w);
    expect(p.flow).not.toContain('Bash(git:*)');
    expect(p.flow.some((r) => r.startsWith('Bash(git '))).toBe(true);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('the flow half proposes NO ecosystem tools — those are the stack half’s job', () => {
    // The first render proposed cargo/go/bundle/jest/yarn for a Node project,
    // every one of them arriving from plugin/agents where command files
    // DESCRIBE other people's stacks. This is the over-proposal D-M6E5-3 and
    // probe 2 warned about.
    const w = world({ 'repo/package.json': '{"scripts":{"test":"vitest"}}' });
    const p = build(w);
    for (const tool of ['cargo', 'go test', 'bundle', 'jest', 'yarn', 'pnpm', 'pytest', 'pip']) {
      expect(p.flow.join('\n'), `flow half must not propose ${tool}`).not.toContain(tool);
    }
    rmSync(w.root, { recursive: true, force: true });
  });

  it('a Rust repo gets cargo rules from the STACK half, and still none from flow', () => {
    const w = world({ 'repo/Cargo.toml': '[package]\nname="x"\n' });
    const p = build(w);
    expect(p.stack.some((r) => r.includes('cargo'))).toBe(true);
    expect(p.flow.some((r) => r.includes('cargo'))).toBe(false);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('a repo with NO manifest gets no ecosystem rules from either half', () => {
    const w = world({ 'repo/README.md': '# docs\n' });
    const p = build(w);
    const all = [...p.flow, ...p.stack].join('\n');
    for (const tool of ['npm', 'cargo', 'pytest', 'go test', 'yarn']) {
      expect(all, `no manifest must mean no ${tool} rule`).not.toContain(tool);
    }
    rmSync(w.root, { recursive: true, force: true });
  });
});

describe('overlap resolution — one rule, one heading, one decision', () => {
  it('a bare rule is dropped when a narrower rule for the same binary is proposed', () => {
    // `Bash(claude:*)` beside `Bash(claude plugin:*)` is redundancy where the
    // redundant half is the WIDER grant. Narrower is the safe direction.
    const w = world();
    const p = build(w);
    if (p.flow.some((r) => r.startsWith('Bash(claude '))) {
      expect(p.flow).not.toContain('Bash(claude:*)');
    }
    rmSync(w.root, { recursive: true, force: true });
  });

  it('the stack half never repeats a rule the flow half already proposes', () => {
    const w = world({ 'repo/package.json': '{"scripts":{"test":"vitest"}}' });
    const p = build(w);
    expect(p.stack.filter((r) => p.flow.includes(r))).toEqual([]);
    rmSync(w.root, { recursive: true, force: true });
  });
});

describe('deny/allow conflict surfacing (REVIEW fix)', () => {
  it('a proposed deny colliding with an existing allow is a VISIBLE line', () => {
    const w = world({ 'repo/.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(curl:*)'] } }) });
    const p = build(w);
    expect(p.denyConflicts).toContain('Bash(curl:*)');
    const out = formatReport(p);
    expect(out).toMatch(/CONFLICT/);
    expect(out).toMatch(/silently overrides/i);
    rmSync(w.root, { recursive: true, force: true });
  });

  it('the deny proposal SURVIVES an existing allow — it is not suppressed', () => {
    const w = world({ 'repo/.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(curl:*)'] } }) });
    const p = build(w);
    expect(p.deny.map((d) => d.rule)).toContain('Bash(curl:*)');
    rmSync(w.root, { recursive: true, force: true });
  });
});
