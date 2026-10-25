import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // The workspace packages' `dist` loads in plain Node (#1158): vitest
    // imports it as is instead of transforming its modules in each file.
    server: { deps: { external: [/\/packages\/postext[^/]*\/dist\//] } },
    // Whole-book layouts take seconds on a workstation and ten to twenty times
    // as long on a small CI runner (a shard of the suite each since #1118).
    testTimeout: process.env.CI ? 120_000 : 30_000,
  },
});
