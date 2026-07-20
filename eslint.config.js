// Flat ESLint config (ESLint 9). Restores `npm run lint` (B5/B20): ESLint 9 dropped
// `.eslintrc.*` and the repo had no flat config, so `eslint tools/` exited 2.
// Scope (M5.E4/D-M5E4-4): make the linter RUN — recommended rules + node globals.
// @eslint/js is already present (transitive devDep); no new runtime dependency.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // node globals — without these, no-undef flags every process/console/Buffer/…
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        structuredClone: 'readonly',
        globalThis: 'readonly',
        fetch: 'readonly',
      },
    },
  },
];
