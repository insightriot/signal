// test-run.js runs the project's tests and records the result; VERIFY's recordPass needs it (loop piece 3).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runTests, checkTestRun, treeFingerprint, resolveTestCommand, formatTestRun, TEST_RUN_SUMMARY_RE, RECORD_PATH } from '../plugin/tools/lib/test-run.js';
import { testCommand } from '../plugin/tools/lib/stack-detect.js';
import { initState, transitionPhase, recordPass } from '../plugin/tools/lib/state.js';

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'test-run-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, '.planning'));
  for (const [f, s] of Object.entries({ 'a.js': 'a\n', ...files })) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), s);
  }
  return dir;
}

describe('runTests', () => {
  it('runs the command, records it passed, and the record holds for the files as they are', async () => {
    const dir = project();
    const r = await runTests(dir, { command: 'echo ok' });
    expect(r.record).toMatchObject({ command: 'echo ok', commandFrom: 'given', exitCode: 0, passed: true, changedDuringRun: false, outputTail: ['ok'] });
    expect(JSON.parse(readFileSync(join(dir, RECORD_PATH), 'utf8')).fingerprint).toBe(r.record.fingerprint);
    expect(checkTestRun(dir)).toMatchObject({ ok: true, reasons: [] });
    expect(formatTestRun(r.record)).toMatch(TEST_RUN_SUMMARY_RE);
  });

  it('a failing command is recorded as failed, and the record does not hold', async () => {
    const dir = project();
    const r = await runTests(dir, { command: 'echo broken; exit 3' });
    expect(r.record).toMatchObject({ exitCode: 3, passed: false });
    expect(checkTestRun(dir).reasons).toEqual(['The last test run failed (echo broken; exit 3, exit 3).']);
  });

  it('reuses the last record\'s command, then the manifest\'s', async () => {
    const dir = project({ 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }) });
    expect(resolveTestCommand(dir)).toEqual({ command: 'npm test', from: 'package.json scripts.test' });
    await runTests(dir, { command: 'true' });
    expect(resolveTestCommand(dir)).toEqual({ command: 'true', from: 'the last test record' });
  });

  it('with no command known, it says how to give one and writes nothing', async () => {
    const dir = project();
    const r = await runTests(dir);
    expect(r.ok).toBe(false);
    expect(r.problem).toMatch(/--command/);
    expect(checkTestRun(dir).reasons[0]).toMatch(/No test record/);
  });

  it('files changing while the tests run make the record unusable', async () => {
    const dir = project();
    await runTests(dir, { command: 'echo changed > a.js' });
    expect(checkTestRun(dir).reasons).toContain('Files changed while the tests ran, so the record cannot say which version passed. Run test-run.js again.');
  });
});

describe('checkTestRun reads the files, not the commit', () => {
  it('a change to a tracked, an untracked or a deleted file makes the record stale', async () => {
    for (const change of [
      (d) => writeFileSync(join(d, 'a.js'), 'edited\n'),
      (d) => writeFileSync(join(d, 'new.js'), 'n\n'),
      (d) => rmSync(join(d, 'a.js')),
    ]) {
      const dir = project();
      execFileSync('git', ['add', 'a.js'], { cwd: dir });
      await runTests(dir, { command: 'true' });
      change(dir);
      expect(checkTestRun(dir).reasons).toEqual(['Files outside .planning/ changed since the tests last ran. Run test-run.js again.']);
    }
  });

  it('committing, or writing under .planning/, leaves it holding; an ignored file does not count', async () => {
    const dir = project({ '.gitignore': 'build/\n' });
    await runTests(dir, { command: 'true' });
    const before = treeFingerprint(dir).fingerprint;
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'c'], { cwd: dir });
    writeFileSync(join(dir, '.planning', 'STATE.md'), 'notes\n');
    mkdirSync(join(dir, 'build'));
    writeFileSync(join(dir, 'build', 'out.js'), 'x\n');
    expect(treeFingerprint(dir).fingerprint).toBe(before);
    expect(checkTestRun(dir).ok).toBe(true);
  });
});

describe('testCommand reads the project\'s manifests', () => {
  it.each([
    [{ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) }, 'npm test'],
    [{ 'pyproject.toml': '' }, 'pytest'],
    [{ 'Cargo.toml': '' }, 'cargo test'],
    [{ 'go.mod': '' }, 'go test ./...'],
  ])('%j → %s', (files, cmd) => {
    expect(testCommand(project(files))?.command).toBe(cmd);
  });

  it('npm\'s placeholder script, a Gemfile, or no manifest gives none', () => {
    expect(testCommand(project({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }))).toBeNull();
    expect(testCommand(project({ Gemfile: '' }))).toBeNull();
    expect(testCommand(project())).toBeNull();
  });
});

describe('recordPass refuses a VERIFY pass without a passing test run', () => {
  async function atVerify() {
    const dir = project();
    await initState(dir, 'DISCUSS');
    writeFileSync(join(dir, '.planning', 'REQUIREMENTS.md'), '# r\n');
    await transitionPhase(dir, 'PLAN');
    writeFileSync(join(dir, '.planning', 'PLAN.md'), '# p\n');
    await transitionPhase(dir, 'EXECUTE');
    await transitionPhase(dir, 'VERIFY');
    return dir;
  }

  it('no record, a failed run, or a stale one: refused; FAIL needs none', async () => {
    const dir = await atVerify();
    await expect(recordPass(dir, 'VERIFY', 'PASS')).rejects.toThrow(/needs a passing test run.*No test record/);
    await runTests(dir, { command: 'false' });
    await expect(recordPass(dir, 'VERIFY', 'PASS-WITH-FIXES')).rejects.toThrow(/The last test run failed/);
    await runTests(dir, { command: 'true' });
    writeFileSync(join(dir, 'a.js'), 'fixed after the run\n');
    await expect(recordPass(dir, 'VERIFY', 'PASS')).rejects.toThrow(/changed since the tests last ran/);
    await expect(recordPass(dir, 'VERIFY', 'FAIL')).resolves.toBeDefined();
  });

  it('a passing run of the files as they are: recorded', async () => {
    const dir = await atVerify();
    await runTests(dir, { command: 'true' });
    await expect(recordPass(dir, 'VERIFY', 'PASS')).resolves.toBeDefined();
  });
});
