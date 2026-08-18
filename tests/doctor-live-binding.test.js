// Tests for the live-session binding guard (B103).
//
// The defect: `/sig:doctor --fix` proposed `rm -rf` on cache directories that
// RUNNING sessions had resolved, behind a `[y/N]` that reads as a formality.
// Observed live 2026-08-18 — two sessions bound to sig/0.1.25, which the
// generated script listed for deletion.

import { describe, it, expect } from 'vitest';

import {
  parseClaudeProcesses,
  detectLiveBindings,
  readLiveBindings,
  buildFixScript,
  buildReinstallScript,
} from '../plugin/tools/lib/doctor.js';

const PS = [
  '  694 Mon Aug 10 08:15:28 2026 chrome_crashpad_handler',
  '29938 Sun Aug 16 11:57:59 2026 claude',
  '52254 Tue Aug 18 13:03:11 2026 claude',
  '78473 Tue Aug 18 10:14:20 2026 claude',
  '11111 Sun Aug 16 09:00:00 2026 claude-companion',
  '22222 Sun Aug 16 09:00:00 2026 /usr/local/bin/claude',
].join('\n');

const dirAt = (v, iso) => ({
  path: `/Users/x/.claude/plugins/cache/signal/sig/${v}`,
  birthMs: Date.parse(iso),
});

describe('parseClaudeProcesses', () => {
  it('picks out running claude processes with their absolute start times', () => {
    const procs = parseClaudeProcesses(PS);
    expect(procs.map((p) => p.pid).sort((a, b) => a - b)).toEqual([22222, 29938, 52254, 78473]);
    expect(procs.find((p) => p.pid === 29938).startedAtMs).toBe(Date.parse('Sun Aug 16 11:57:59 2026'));
  });

  it('does not treat a command that merely contains "claude" as a session', () => {
    const pids = parseClaudeProcesses(PS).map((p) => p.pid);
    expect(pids).not.toContain(694);
    expect(pids).not.toContain(11111); // claude-companion
  });

  it('returns [] rather than throwing on absent or unparseable output', () => {
    expect(parseClaudeProcesses('')).toEqual([]);
    expect(parseClaudeProcesses(null)).toEqual([]);
    expect(parseClaudeProcesses('garbage\nmore garbage')).toEqual([]);
  });
});

describe('detectLiveBindings', () => {
  // The field observation, as a fixture. 0.1.26 was born at 10:16 on Aug 18 —
  // two minutes AFTER pid 78473 started — so both older sessions resolved
  // 0.1.25, and that is the directory --fix offered to delete.
  const CACHE = [
    dirAt('0.1.24', '2026-08-09T11:53:06'),
    dirAt('0.1.25', '2026-08-13T19:09:29'),
    dirAt('0.1.26', '2026-08-18T10:16:14'),
    dirAt('0.1.27', '2026-08-18T13:02:31'),
  ];

  it('binds each session to the newest copy that existed when it started', () => {
    const { held } = detectLiveBindings({ cacheDirs: CACHE, processes: parseClaudeProcesses(PS) });
    const byPath = Object.fromEntries(held.map((h) => [h.path, h.pids]));
    expect(byPath[dirAt('0.1.25', '2026-08-13T19:09:29').path]).toEqual([22222, 29938, 78473]);
    expect(byPath[dirAt('0.1.27', '2026-08-18T13:02:31').path]).toEqual([52254]);
    expect(byPath[dirAt('0.1.26', '2026-08-18T10:16:14').path]).toBeUndefined();
  });

  it('holds nothing when no session is running', () => {
    expect(detectLiveBindings({ cacheDirs: CACHE, processes: [] }).held).toEqual([]);
  });

  it('ignores a session older than every cached copy (its copy is already gone)', () => {
    const procs = [{ pid: 5, startedAtMs: Date.parse('2026-01-01T00:00:00') }];
    expect(detectLiveBindings({ cacheDirs: CACHE, processes: procs }).held).toEqual([]);
  });

  it('reports cannotDetermine — not an empty held set — when a dir has no birth time', () => {
    const res = detectLiveBindings({
      cacheDirs: [...CACHE, { path: '/Users/x/.claude/plugins/cache/signal/sig/0.1.5' }],
      processes: parseClaudeProcesses(PS),
    });
    expect(res.cannotDetermine).toBe(true);
    expect(res.held).toEqual([]);
    expect(res.reason).toMatch(/birth time/);
  });

  it('reports cannotDetermine on missing inputs rather than throwing', () => {
    expect(detectLiveBindings().cannotDetermine).toBe(true);
    expect(detectLiveBindings({ cacheDirs: CACHE }).cannotDetermine).toBe(true);
  });
});

describe('readLiveBindings', () => {
  const fsImpl = {
    existsSync: () => true,
    readdirSync: () => ['0.1.25', '0.1.27'],
    statSync: (p) => ({
      birthtimeMs: p.endsWith('0.1.25')
        ? Date.parse('2026-08-13T19:09:29')
        : Date.parse('2026-08-18T13:02:31'),
    }),
    readFileSync: () => '',
  };

  it('holds the copy the older sessions resolved', () => {
    const res = readLiveBindings({ homeDir: '/Users/x', fsImpl, execImpl: () => PS });
    expect(res.held.map((h) => h.path)).toContain('/Users/x/.claude/plugins/cache/signal/sig/0.1.25');
  });

  it('never throws when ps is unavailable — it reports the unknown', () => {
    const res = readLiveBindings({
      homeDir: '/Users/x',
      fsImpl,
      execImpl: () => {
        throw new Error('ps: command not found');
      },
    });
    expect(res.cannotDetermine).toBe(true);
    expect(res.held).toEqual([]);
  });

  it('never throws when the cache cannot be stat-ed', () => {
    const broken = {
      ...fsImpl,
      statSync: () => {
        throw new Error('EACCES');
      },
    };
    const res = readLiveBindings({ homeDir: '/Users/x', fsImpl: broken, execImpl: () => PS });
    expect(res.cannotDetermine).toBe(true);
  });

  it('reports cannotDetermine on a missing homeDir instead of guessing', () => {
    expect(readLiveBindings({}).cannotDetermine).toBe(true);
    expect(readLiveBindings().cannotDetermine).toBe(true);
  });
});

describe('generated script — the guard fires where the deletion is', () => {
  const FINDINGS_P2 = [
    {
      code: 'P2',
      evidence: [
        '/Users/x/.claude/plugins/cache/signal/sig/0.1.25',
        '/Users/x/.claude/plugins/cache/signal/sig/0.1.26',
      ],
      recommendation: '--fix',
    },
  ];
  const script = buildFixScript(FINDINGS_P2, { homeDir: '/Users/x', libPath: '/live/doctor.js' });

  it('guards every P2 rm -rf behind sig_held — no unguarded prompt survives', () => {
    for (const p of FINDINGS_P2[0].evidence) {
      expect(script).toContain(`if sig_held "${p}"; then`);
    }
    // The pre-fix shape: a bare prompt immediately followed by the rm.
    expect(script).not.toMatch(/read -p "Execute: rm -rf orphan cache dir[^\n]*\nif \[\[/);
  });

  it('re-checks at run time, against the same implementation the report used', () => {
    expect(script).toContain('SIG_DOCTOR_LIB="/live/doctor.js"');
    expect(script).toContain('readLiveBindings');
  });

  it('says so loudly when the check could not run — never silently clean', () => {
    expect(script).toMatch(/Could NOT check which cached copies/);
    expect(script).toContain('SIG_WARN=" [UNVERIFIED: live-session check did not run]"');
    expect(script).toContain('${SIG_WARN}');
  });

  it('warns before the wipe in --reinstall, which cannot hold anything back', () => {
    const r = buildReinstallScript({ homeDir: '/Users/x', libPath: '/live/doctor.js' });
    expect(r).toContain('sig_held()');
    expect(r).toMatch(/The wipe below DELETES these/);
    // The warning has to precede the first prompt to be worth anything.
    expect(r.indexOf('Running Claude Code sessions resolved')).toBeLessThan(
      r.indexOf('read -p "Execute:')
    );
  });

  it('still emits no literal ~/.claude/ (D-E8-10 meta-test holds)', () => {
    expect(script).not.toMatch(/~\/\.claude/);
  });
});
