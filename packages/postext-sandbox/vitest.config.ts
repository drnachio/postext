import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Whole-book layouts take several seconds on the CI runner.
    testTimeout: 30_000,
  },
});
