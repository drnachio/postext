import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.join(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // One test renders the Markdown of every docs and Cookbook page: about
    // a second on a workstation, close to 30 s on CI, which runs every
    // package's suite at once on a small runner.
    testTimeout: process.env.CI ? 120_000 : 30_000,
  },
});
