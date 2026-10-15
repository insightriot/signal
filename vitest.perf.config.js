import { defineConfig } from 'vitest/config';

import baseConfig, { PERF_TESTS } from './vitest.config.js';

// M6.E17 S3 (SIG-303): the wall-clock tests, one file at a time, so a budget
// measures the code and not whatever else the machine is running. Budgets are
// unchanged. Run with `npm run test:perf`; CI runs it as its own step.
export default defineConfig({
  test: {
    ...baseConfig.test,
    include: PERF_TESTS,
    exclude: [],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
