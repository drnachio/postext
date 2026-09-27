import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.join(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // One test renders the Markdown of every docs and Cookbook page. It
    // takes well under a second, but past vitest's 5 s default when the
    // machine is busy with other suites.
    testTimeout: 30_000,
  },
});
