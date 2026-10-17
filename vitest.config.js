import { defineConfig, configDefaults } from 'vitest/config';

// M6.E17 S3 (SIG-303): tests that assert a wall-clock budget at scale run in
// their own serial run, `npm run test:perf` (vitest.perf.config.js), never in
// `npm test`. Measured while the rest of the suite runs in parallel, a budget
// fails for reasons other than slowness. tests/timing-budget-guard.test.js
// keeps new budgets from landing outside this list.
export const PERF_TESTS = ['tests/unit-records-perf.test.js', 'tests/work-records-perf.test.js'];

export default defineConfig({
  test: {
    globals: true,
    include: ['tools/**/*.test.js', 'tests/**/*.test.js'],
    exclude: [...configDefaults.exclude, ...PERF_TESTS],
    // B17: 19 suites do real `git init`/execFileSync; under the parallel forks pool
    // a few intermittently hit the 5s default. Raise the ceiling so they stop flaking
    // (only raises the ceiling — fast tests unaffected; a genuine hang fails at 15s).
    testTimeout: 15000,
    // M6.E17 S3 (SIG-139): on a developer machine the git-heavy files still
    // reached that 15 s ceiling with one worker per core, because the machine
    // is doing other work too. Cap local runs at half the cores. CI sets
    // CI=true and keeps vitest's default; CI=false is a local run.
    maxWorkers: /^(true|1)$/i.test(process.env.CI ?? '') ? undefined : '50%',
    // M6.E3 AC8.7: clear TYPESAFE_API_KEY before any test loads, so no test can
    // reach the Jev API by omission on a machine where the key is set.
    // M6.E16 r6.2: and no git process the suite starts repacks a fixture
    // repository in the background while a test compares its files.
    setupFiles: ['tests/helpers/no-network-keys.js', 'tests/helpers/quiet-git.js'],
  },
});
