import { describe, it, expect } from 'vitest';

import {
  RESTART_NOTICE,
  parsePluginList,
  findPluginVersion,
  compareVersions,
  changelogBetween,
  renderUpdateReport,
} from '../plugin/tools/lib/update.js';

/**
 * M5.E16 S6 (FR6) — `/sig:update`.
 *
 * Exists because of `B58`. `marketplace.json` pinned a sha two releases behind
 * its ref, so every install since v0.1.14 silently delivered v0.1.13 — and the
 * user found it by chance while menu-diving. Signal, whose entire premise is
 * noticing drift, had nothing to say about its own.
 *
 * `/plugin` reports that a number changed. It cannot say WHAT YOU WOULD BE
 * GETTING, so deciding whether to update means leaving the tool and reading a
 * changelog. That gap is the whole requirement.
 */

// The real output of `claude plugin list` on this machine (2026-08-01),
// captured verbatim rather than invented. There is NO --json flag, so this
// shape is what has to be parsed — recorded in M5.E16-RESEARCH.md as a
// fragility, which is why the command prefers the installed plugin.json.
const REAL_PLUGIN_LIST = `Installed plugins:

  ❯ cloudflare@cloudflare
    Version: 1.0.0
    Scope: user
    Status: ✔ enabled

  ❯ codex@openai-codex
    Version: 1.0.1
    Scope: user
    Status: ✔ enabled

  ❯ sig@signal
    Version: 0.1.13
    Scope: user
    Status: ✔ enabled
`;

const CHANGELOG = `# Changelog

## [0.1.16] — 2026-08-02 — STATE-vs-world drift detection (M5.E16)

- Six deterministic checks comparing what \`.planning/\` asserts against disk and git.
- \`INDEX.md\` regenerates at every phase transition.

## [0.1.15] — 2026-08-01 — Instructions that contradict other instructions (M5.E17)

- \`ship.md\` referenced a commit that no step created.

## [0.1.14] — 2026-07-30 — Guards that don't guard (M5.E13)

- Four defects, one shape.

## [0.1.13] — 2026-07-28 — The measurement foundation (M5.E8)

- The adherence harness.
`;

describe('M5.E16 S6.t1 — reading the installed version (AC6.1)', () => {
  it('parses the real `claude plugin list` output, which has no --json', () => {
    const plugins = parsePluginList(REAL_PLUGIN_LIST);
    expect(plugins).toHaveLength(3);
    expect(plugins[2]).toMatchObject({
      name: 'sig',
      marketplace: 'signal',
      version: '0.1.13',
      scope: 'user',
    });
  });

  it('finds one plugin by name without tripping over its neighbours', () => {
    expect(findPluginVersion(REAL_PLUGIN_LIST, 'sig')).toBe('0.1.13');
    expect(findPluginVersion(REAL_PLUGIN_LIST, 'codex')).toBe('1.0.1');
    expect(findPluginVersion(REAL_PLUGIN_LIST, 'nope')).toBeNull();
  });

  it('returns null rather than guessing when the output shape changes', () => {
    // The text format is not a contract. If it changes, say so — do not invent
    // a version, which is how B58 stayed invisible for two releases.
    expect(findPluginVersion('some entirely different output', 'sig')).toBeNull();
    expect(parsePluginList('')).toEqual([]);
  });
});

describe('M5.E16 S6 — version comparison', () => {
  it('orders patch, minor and major correctly', () => {
    expect(compareVersions('0.1.13', '0.1.15')).toBe(-1);
    expect(compareVersions('0.1.15', '0.1.13')).toBe(1);
    expect(compareVersions('0.1.15', '0.1.15')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.99')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
  });

  it('compares numerically, not as strings — 0.1.9 is older than 0.1.13', () => {
    // The string comparison says the opposite, and Signal has shipped 0.1.9
    // through 0.1.16, so this is the exact range where it would be wrong.
    expect(compareVersions('0.1.9', '0.1.13')).toBe(-1);
  });
});

describe('M5.E16 S6.t2 — the CHANGELOG delta (AC6.2)', () => {
  it('returns every entry strictly between installed and available', () => {
    const entries = changelogBetween(CHANGELOG, '0.1.13', '0.1.16');
    expect(entries.map((e) => e.version)).toEqual(['0.1.16', '0.1.15', '0.1.14']);
    // NOT the version you already have.
    expect(entries.map((e) => e.version)).not.toContain('0.1.13');
  });

  it('carries the title, so the report says what you would be getting', () => {
    const [newest] = changelogBetween(CHANGELOG, '0.1.15', '0.1.16');
    expect(newest.version).toBe('0.1.16');
    expect(newest.title).toMatch(/STATE-vs-world drift detection/);
    expect(newest.body).toMatch(/Six deterministic checks/);
  });

  it('is empty when you are already current', () => {
    expect(changelogBetween(CHANGELOG, '0.1.16', '0.1.16')).toEqual([]);
  });

  it('ignores an [Unreleased] heading — it is not a version you can install', () => {
    const withUnreleased = CHANGELOG.replace(
      '## [0.1.16]',
      '## [Unreleased] — in flight\n\n- not shipped\n\n## [0.1.16]'
    );
    const entries = changelogBetween(withUnreleased, '0.1.13', '0.1.16');
    expect(entries.map((e) => e.version)).toEqual(['0.1.16', '0.1.15', '0.1.14']);
  });
});

describe('M5.E16 S6.t3 — the restart notice (AC6.3)', () => {
  it('states plainly that a restart is required, and says why', () => {
    expect(RESTART_NOTICE).toMatch(/restart/i);
    // B52: a session binds one plugin version for its whole life. The user
    // asked for the restart to be surfaced so the TIMING is theirs to choose —
    // so this is a statement, never an action.
    expect(RESTART_NOTICE).toMatch(/session/i);
  });

  it('appears on every successful update', () => {
    const out = renderUpdateReport({
      installed: '0.1.13',
      available: '0.1.16',
      entries: changelogBetween(CHANGELOG, '0.1.13', '0.1.16'),
      updated: true,
    });
    expect(out).toContain(RESTART_NOTICE);
  });

  it('does NOT appear when nothing was updated — no false instruction', () => {
    const out = renderUpdateReport({ installed: '0.1.16', available: '0.1.16' });
    expect(out).not.toContain(RESTART_NOTICE);
  });
});

describe('M5.E16 S6 — the report (AC6.1: up-to-date, behind, offline)', () => {
  it('up to date: says so in one line and offers nothing', () => {
    const out = renderUpdateReport({ installed: '0.1.16', available: '0.1.16' });
    expect(out).toMatch(/up to date/i);
    expect(out).toContain('0.1.16');
  });

  it('behind: shows both versions AND what the difference contains', () => {
    const out = renderUpdateReport({
      installed: '0.1.13',
      available: '0.1.16',
      entries: changelogBetween(CHANGELOG, '0.1.13', '0.1.16'),
    });
    expect(out).toMatch(/0\.1\.13/);
    expect(out).toMatch(/0\.1\.16/);
    // The half /plugin cannot do.
    expect(out).toMatch(/STATE-vs-world drift detection/);
    expect(out).toMatch(/Guards that don't guard/);
  });

  it('behind with an unreadable changelog: still reports the versions, and says the delta is unknown', () => {
    const out = renderUpdateReport({ installed: '0.1.13', available: '0.1.16', entries: [] });
    expect(out).toMatch(/0\.1\.13/);
    expect(out).toMatch(/0\.1\.16/);
    expect(out).toMatch(/could not|unknown|no changelog/i);
  });

  it('offline: one honest line, no update, no guess', () => {
    const out = renderUpdateReport({ installed: '0.1.13', available: null, offline: true });
    expect(out).toMatch(/offline|could not reach/i);
    expect(out).toContain('0.1.13');
    expect(out).not.toMatch(/up to date/i);
    expect(out).not.toContain(RESTART_NOTICE);
  });

  it('unknown installed version: says so rather than inventing one', () => {
    const out = renderUpdateReport({ installed: null, available: '0.1.16' });
    expect(out).toMatch(/could not determine|unknown/i);
    expect(out).not.toMatch(/up to date/i);
  });

  it('renders deterministically', () => {
    const args = {
      installed: '0.1.13',
      available: '0.1.16',
      entries: changelogBetween(CHANGELOG, '0.1.13', '0.1.16'),
    };
    expect(renderUpdateReport(args)).toBe(renderUpdateReport(args));
  });
});
