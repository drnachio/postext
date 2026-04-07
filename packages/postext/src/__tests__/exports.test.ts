import { describe, it, expect } from "vitest";
import * as postext from "../index";

describe("package exports", () => {
  it("exports createLayout function", () => {
    expect(postext.createLayout).toBeDefined();
    expect(typeof postext.createLayout).toBe("function");
  });

  it("does not export unexpected values", () => {
    const exportedKeys = Object.keys(postext);
    // Only createLayout should be a runtime export; types are compile-time only
    expect(exportedKeys).toEqual(["createLayout"]);
  });
});
