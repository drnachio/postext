import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // citeproc-js parses a whole CSL style per processor (Chicago's is
    // 240 KB): a few seconds each on a slow CI runner, more while it runs
    // every package's suite at once.
    testTimeout: process.env.CI ? 120_000 : 30_000,
  },
});
