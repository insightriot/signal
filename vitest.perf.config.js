import { defineConfig, configDefaults } from 'vitest/config';

import baseConfig, { PERF_TESTS } from './vitest.config.js';

// M6.E17 S3 (SIG-303): the wall-clock tests, one file at a time, so a budget
// measures the code and not whatever else the machine is running. Budgets are
// unchanged. Run with `npm run test:perf`; CI runs it as its own step.
export default defineConfig({
  test: {
    ...baseConfig.test,
    include: PERF_TESTS,
    exclude: configDefaults.exclude,
    fileParallelism: false,
    maxWorkers: 1,
    // The harness's own limits, not the budgets under test (those are asserted
    // inside each test and are unchanged). Building 10,000+ records took 14-17 s
    // locally against the main suite's 15 s / 10 s limits, and CI runners are slower.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
