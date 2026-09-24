import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { FEATURE_KEYS, featureDocPath } from "./featureDocs";

describe("featureDocPath", () => {
  it("resolves every capability card to a docs section in every locale", () => {
    for (const locale of routing.locales) {
      for (const key of FEATURE_KEYS) {
        expect(featureDocPath(key, locale)).toMatch(/^\/docs\/[a-z-]+#.+/);
      }
    }
  });

  it("derives the anchor the doc page renders", () => {
    expect(featureDocPath("tables", "en")).toBe("/docs/configuration#table-style");
    expect(featureDocPath("math", "es")).toBe("/docs/document-format#fórmulas-matemáticas");
  });
});
