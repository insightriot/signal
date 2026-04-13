import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tools/**/*.test.js', 'tests/**/*.test.js'],
  },
});
