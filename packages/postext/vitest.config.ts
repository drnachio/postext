import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Whole-book layouts take seconds on a workstation and ten to twenty times
    // as long on CI, which runs every package's suite at once on a small runner.
    testTimeout: process.env.CI ? 120_000 : 30_000,
  },
});
