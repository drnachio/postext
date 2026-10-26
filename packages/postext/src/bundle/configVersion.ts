// Which rules a stored configuration was written for, and how one written
// for older rules is read in today's terms. A `.postext` manifest carries
// the number as `configVersion` (every writer since postext 1.5 sets it);
// the Sandbox numbers its stored projects the same way.



export { CONFIG_VERSION, COMPOSED_PAGES_RULES, CONNECTOR_RULES, LOCALE_LAYER_RULES } from './configVersion/rules.js';
export { LEGACY_MATH_SIZE, pinLegacyHeadingBreaks, pinLegacyMathSize, pinLegacyInlineGap, pinLegacyColonListRoom, pinLegacyBoxResourceGap, pinLegacyBoxChildCut, pinLegacyHeadingMarks, pinLegacyDropCapSize } from './configVersion/pins3To6.js';
export { pinLegacyDashBreaks, pinLegacyRaggedBreaking, pinLegacyHeadingSplit, pinLegacyParagraphContainerSpacing, pinLegacyHyphenBreaks, pinLegacyVerseLayout, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats, pinLegacyPairedIndents, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyTitleBreaks, pinLegacyCircledNumbers, pinLegacyDesignText } from './configVersion/pins7To11.js';
export { pinLegacyLooseOrder, pinLegacyWideFloatStretch, pinLegacyTrailingStep, pinLegacyIndexGroupSplit, pinLegacyGridBreakRules, pinLegacyInlineCaptionSide, pinLegacyNoteBreaks, pinLegacyLatinSpacingEdge, pinLegacyRefLabelBreaks, pinLegacyBalloonPlacement, pinLegacyScriptContext, pinLegacyShapingLanguage, pinLegacyBoxParagraphStyles, pinLegacyTaskBox, pinLegacyMarkRadius, pinLegacySlashBreaks, pinLegacyScoreFences } from './configVersion/pins12To20.js';
export { migrateConfig, migrateBundleConfig } from './configVersion/migrate.js';
export type { MigrateConfigOptions } from './configVersion/migrate.js';
