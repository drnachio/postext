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
      "buildDocument",
      "renderToCanvas",
      "renderPage",
      "renderPageToCanvas",
      "dimensionToPx",
      "buildFontString",
      "measureBlock",
      "measureRichBlock",
      "initHyphenator",
      "clearMeasurementCache",
      "hyphenateText",
      "setHyphenationLocale",
      "parseMarkdown",
      "DEFAULT_PAGE_CONFIG",
      "PAGE_SIZE_PRESETS",
      "resolvePageConfig",
      "DEFAULT_LAYOUT_CONFIG",
      "DEFAULT_COLUMN_RULE",
      "resolveLayoutConfig",
      "stripLayoutDefaults",
      "DEFAULT_BODY_TEXT_CONFIG",
      "DEFAULT_HYPHENATION_CONFIG",
      "resolveBodyTextConfig",
      "stripBodyTextDefaults",
      "hyphenationEqual",
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
