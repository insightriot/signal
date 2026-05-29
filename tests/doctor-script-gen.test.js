// Tests for /sig:doctor S2 — script generation.
// See .planning/M4.5.E8-PLAN.md § S2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildFixScript,
  buildReinstallScript,
  writeDoctorScript,
} from '../tools/lib/doctor.js';

// ---- buildFixScript — script-content lint ----

describe('buildFixScript (script-content lint)', () => {
  const FINDINGS_P2_P3 = [
    {
      code: 'P2',
      evidence: ['/Users/x/.claude/plugins/cache/signal/sig/0.1.0', '/Users/x/.claude/plugins/cache/signal/sig/0.1.1'],
      recommendation: '--fix',
    },
    { code: 'P3', evidence: ['sig@signal'], recommendation: '--fix' },
  ];

  it('emits #!/usr/bin/env bash shebang (D-E8-8)', () => {
    const script = buildFixScript(FINDINGS_P2_P3, { homeDir: '/Users/x' });
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
  });

  it('emits `set -u -o pipefail` but does NOT enable `set -e` (D-E8-8)', () => {
    const script = buildFixScript(FINDINGS_P2_P3, { homeDir: '/Users/x' });
    expect(script).toMatch(/set\s+-u\s+-o\s+pipefail/);
    const setLine = script.split('\n').find((l) => /^set\s/.test(l));
    expect(setLine).toBeTruthy();
    expect(setLine).not.toMatch(/-e\b/); // no `-e` flag in the set line
  });

  it('wraps every mutating step in `read -p "Execute: ... [y/N]"` (FR5)', () => {
    const script = buildFixScript(FINDINGS_P2_P3, { homeDir: '/Users/x' });
    const promptCount = (script.match(/read -p "Execute: .*\[y\/N\]/g) || []).length;
    // Two P-states (P2 has 2 orphans + P3 has 1 entry = 3 mutating steps)
    expect(promptCount).toBeGreaterThanOrEqual(3);
  });

  it('contains only resolved absolute paths — no literal ~/.claude/ (D-E8-10)', () => {
    const script = buildFixScript(FINDINGS_P2_P3, { homeDir: '/Users/x' });
    expect(script).not.toMatch(/~\/\.claude/);
    expect(script).toMatch(/\/Users\/x\/\.claude/); // homeDir was resolved
  });

  it('ends with a /reload-plugins instruction block (no auto-execution)', () => {
    const script = buildFixScript(FINDINGS_P2_P3, { homeDir: '/Users/x' });
    expect(script).toMatch(/\/reload-plugins/);
    expect(script).toMatch(/\/sig:doctor/); // recommend re-running to verify
  });
});

// ---- buildReinstallScript — identical regardless of state ----

describe('buildReinstallScript (always-full canonical sequence)', () => {
  it('generates identical body for healthy vs broken starting state (FR4)', () => {
    const healthy = buildReinstallScript({ homeDir: '/Users/x' });
    const alsoHealthy = buildReinstallScript({ homeDir: '/Users/x' });
    expect(healthy).toBe(alsoHealthy);
    // And no `findings` parameter — the function is state-independent.
    expect(buildReinstallScript.length).toBe(1); // arity = 1 (the opts object)
  });

  it('invokes claude plugin uninstall + install CLI subcommands (OQ3 option b)', () => {
    const script = buildReinstallScript({ homeDir: '/Users/x' });
    expect(script).toMatch(/claude plugin uninstall sig\b/);
    expect(script).toMatch(/claude plugin install sig@signal/);
  });

  it('emits the same safety preamble as --fix (D-E8-8)', () => {
    const script = buildReinstallScript({ homeDir: '/Users/x' });
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(script).toMatch(/set\s+-u\s+-o\s+pipefail/);
    const setLine = script.split('\n').find((l) => /^set\s/.test(l));
    expect(setLine).not.toMatch(/-e\b/);
  });
});

// ---- Inline node -e correctness (S2.t4 — PLAN deviation review point) ----

describe('inline node -e commands are well-formed JavaScript', () => {
  it('every node -e payload in --fix scripts parses as valid JS', () => {
    const script = buildFixScript(
      [
        { code: 'P3', evidence: ['sig@signal', 'signal@old'], recommendation: '--fix' },
      ],
      { homeDir: '/Users/x' }
    );
    const payloads = [...script.matchAll(/node -e "([^"]*)"/g)].map((m) => m[1]);
    expect(payloads.length).toBeGreaterThan(0);
    for (const code of payloads) {
      // new Function throws on syntax errors; parses fine on valid JS.
      expect(() => new Function(code)).not.toThrow();
    }
  });

  it('the --reinstall combined-key node -e payload parses', () => {
    const script = buildReinstallScript({ homeDir: '/Users/x' });
    const payloads = [...script.matchAll(/node -e "([^"]*)"/g)].map((m) => m[1]);
    expect(payloads.length).toBeGreaterThan(0);
    for (const code of payloads) {
      expect(() => new Function(code)).not.toThrow();
    }
  });
});

// ---- writeDoctorScript — atomic write delegate ----

describe('writeDoctorScript (atomic write)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-doctor-write-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes content atomically to the target path', async () => {
    const target = join(tempDir, 'sig-doctor.sh');
    const content = '#!/usr/bin/env bash\necho hello\n';
    await writeDoctorScript(target, content);
    expect(existsSync(target)).toBe(true);
    const written = await readFile(target, 'utf8');
    expect(written).toBe(content);
  });

  it('does not leak the tmp sidecar after successful write', async () => {
    const target = join(tempDir, 'sig-doctor.sh');
    await writeDoctorScript(target, 'x');
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(tempDir);
    expect(entries).toEqual(['sig-doctor.sh']);
  });
});
