import { describe, it, expect } from "vitest";
import * as postext from "../index";
import type {
  Resource,
  ResourceType,
  ResourceKind,
  TableModel,
  TableCell,
} from "../index";

// Compile-time assertion that the resources/table public types are exported
// from the package root (issue #49). These are type-only exports, so they do
// not appear in `Object.keys(postext)`; this block fails the build (not the
// runtime test) if any export is removed or renamed.
const _resourceTypeChecks = () => {
  const kind: ResourceKind = "table";
  const cell: TableCell = { content: "x" };
  const model: TableModel = { rows: [[cell]] };
  const type: ResourceType = {
    id: "figure",
    name: "Figure",
    shortLabel: "Fig.",
    numberingTemplate: "{n}",
    resetOn: "never",
    counterFormat: "decimal",
    captionPrefix: "Figure",
  };
  const resource: Resource = {
    id: "r",
    typeId: type.id,
    kind,
    createdAt: 0,
    updatedAt: 0,
    table: { model },
  };
  return resource;
};
void _resourceTypeChecks;

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
      "BuildCancelledError",
      "renderToCanvas",
      "renderPage",
      "renderPageToCanvas",
      "registerResourceImage",
      "unregisterResourceImage",
      "clearResourceImages",
      "getResourceImage",
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
      "addRow",
      "addColumn",
      "removeRow",
      "removeColumn",
      "mergeCells",
      "unmergeCell",
      "setCellContent",
      "setAlignment",
      "parseTSV",
      "extractFrontmatter",
      "DEFAULT_PAGE_CONFIG",
      "DEFAULT_CUT_LINES",
      "DEFAULT_PAGE_NUMBERING",
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
      "DEFAULT_MATH_CONFIG",
      "resolveMathConfig",
      "stripMathDefaults",
      "dimensionsEqual",
      "colorsEqual",
      "resolveColorValue",
      "applyPaletteToConfig",
      "applyPaletteToResolvedConfig",
      "DEFAULT_COLOR_PALETTE",
      "DEFAULT_MAIN_COLOR",
      "DEFAULT_MAIN_COLOR_ID",
      "DEFAULT_MAIN_COLOR_NAME",
      "DEFAULT_MAIN_COLOR_HEX",
      "cloneDefaultColorPalette",
      "isDefaultColorPalette",
      "stripPageDefaults",
      "stripConfigDefaults",
      "DEFAULT_DEBUG_CONFIG",
      "resolveDebugConfig",
      "stripDebugDefaults",
      "DEFAULT_HTML_VIEWER_CONFIG",
      "resolveHtmlViewerConfig",
      "stripHtmlViewerDefaults",
      "DEFAULT_PDF_GENERATION_CONFIG",
      "resolvePdfGenerationConfig",
      "stripPdfGenerationDefaults",
      "DEFAULT_HEADER_FOOTER_SLOT",
      "DEFAULT_HEADER_SLOT",
      "DEFAULT_FOOTER_SLOT",
      "DEFAULT_TEXT_ELEMENT",
      "DEFAULT_RULE_ELEMENT",
      "resolveHeaderFooterConfig",
      "stripHeaderFooterDefaults",
      "defaultResourceTypes",
      "resolvePlaceholders",
      "computeChapterTitles",
      "collectPlaceholderNames",
      "isKnownPlaceholder",
      "isMetadataPlaceholder",
      "resolveDesignPlaceholders",
      "allowedPlaceholdersFor",
      "layoutDesignSlot",
      "migrateLegacyHeaderFooterConfig",
      "isLegacyHeaderFooterSlot",
      "resolveDesignSlot",
      "stripDesignSlotDefaults",
      "DEFAULT_BOX_ELEMENT",
      "parseMarkdownWithIssues",
      "MATH_PLACEHOLDER",
      "buildPageLabels",
      "collectPageLabelRuns",
      "formatNumeral",
      "initMathEngine",
      "isMathReady",
      "onMathReady",
      "renderMath",
      "placeholderRender",
      "clearMathCache",
    ]);
  });
});
