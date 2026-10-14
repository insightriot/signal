import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tools/**/*.test.js', 'tests/**/*.test.js'],
    // B17: 19 suites do real `git init`/execFileSync; under the parallel forks pool
    // a few intermittently hit the 5s default. Raise the ceiling so they stop flaking
    // (only raises the ceiling — fast tests unaffected; a genuine hang fails at 15s).
    testTimeout: 15000,
    // M6.E3 AC8.7: clear TYPESAFE_API_KEY before any test loads, so no test can
    // reach the Jev API by omission on a machine where the key is set.
    // M6.E16 r6.2: and no git process the suite starts repacks a fixture
    // repository in the background while a test compares its files.
    setupFiles: ['tests/helpers/no-network-keys.js', 'tests/helpers/quiet-git.js'],
  },
});
