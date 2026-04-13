import { describe, it, expect } from "vitest";
import * as postext from "../index";

describe("package exports", () => {
  it("exports createLayout function", () => {
    expect(postext.createLayout).toBeDefined();
    expect(typeof postext.createLayout).toBe("function");
  });

  it("does not export unexpected values", () => {
    const exportedKeys = Object.keys(postext);
    expect(exportedKeys).toEqual([
      "createLayout",
      "DEFAULT_PAGE_CONFIG",
      "PAGE_SIZE_PRESETS",
      "resolvePageConfig",
      "DEFAULT_LAYOUT_CONFIG",
      "resolveLayoutConfig",
      "stripLayoutDefaults",
      "DEFAULT_BODY_TEXT_CONFIG",
      "resolveBodyTextConfig",
      "stripBodyTextDefaults",
      "DEFAULT_HEADINGS_CONFIG",
      "resolveHeadingsConfig",
      "stripHeadingsDefaults",
      "dimensionsEqual",
      "colorsEqual",
      "stripPageDefaults",
      "stripConfigDefaults",
    ]);
  });
});
