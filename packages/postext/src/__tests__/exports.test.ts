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
      "renderToHtml",
      "renderToHtmlIndexed",
      "dimensionToPx",
      "buildFontString",
      "measureBlock",
      "measureRichBlock",
      "measureGlyphWidth",
      "initHyphenator",
      "clearMeasurementCache",
      "createMeasurementCache",
      "cachedMeasureBlock",
      "cachedMeasureRichBlock",
      "hyphenateText",
      "setHyphenationLocale",
      "parseMarkdown",
      "extractFrontmatter",
      "DEFAULT_PAGE_CONFIG",
      "DEFAULT_CUT_LINES",
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
      "DEFAULT_UNORDERED_LISTS_STATIC",
      "resolveUnorderedListsConfig",
      "stripUnorderedListsDefaults",
      "DEFAULT_ORDERED_LISTS_STATIC",
      "resolveOrderedListsConfig",
      "stripOrderedListsDefaults",
      "dimensionsEqual",
      "colorsEqual",
      "resolveColorValue",
      "applyPaletteToConfig",
      "DEFAULT_COLOR_PALETTE",
      "DEFAULT_MAIN_COLOR",
      "DEFAULT_MAIN_COLOR_ID",
      "DEFAULT_MAIN_COLOR_NAME",
      "DEFAULT_MAIN_COLOR_HEX",
      "stripPageDefaults",
      "stripConfigDefaults",
      "DEFAULT_DEBUG_CONFIG",
      "resolveDebugConfig",
      "stripDebugDefaults",
      "DEFAULT_HTML_VIEWER_CONFIG",
      "resolveHtmlViewerConfig",
      "stripHtmlViewerDefaults",
    ]);
  });
});
