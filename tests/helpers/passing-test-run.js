// A project whose tests have just passed: a git repository and a passing test record, so a VERIFY
// pass can be recorded (loop piece 3: recordPass asks checkTestRun).

import { execFileSync } from 'node:child_process';

import { gitEnv } from '../../plugin/tools/lib/git-env.js';
import { runTests } from '../../plugin/tools/lib/test-run.js';

export async function passingTestRun(baseDir) {
  execFileSync('git', ['init', '-q'], { cwd: baseDir, env: gitEnv(baseDir) });
  const r = await runTests(baseDir, { command: 'true' });
  if (!r.ok || !r.record.passed) throw new Error(`fixture test run did not pass: ${r.problem ?? r.record.exitCode}`);
}
