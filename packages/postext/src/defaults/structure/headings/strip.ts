// stripHeadingsDefaults: drops the heading fields that match the defaults
// (#1278: split out of headings.ts).
import type { HeadingsConfig, ColumnBalancingConfig, HeadingLevelConfig, ResolvedHeadingBreakBeforeConfig } from '../../../types.js';
import { dimensionsEqual, colorsEqual } from '../../shared.js';
import { DEFAULT_COLUMN_BALANCING, DEFAULT_HEADINGS_CONFIG, DEFAULT_HEADING_LEVELS, DEFAULT_BREAK_BEFORE } from './defaults.js';
import { headingPlacementFields } from './resolve.js';

/** `headings` without the fields at their default. `balancingOn` is
 *  whether the document balances its columns when it does not say
 *  (`balancingOnByDefault(config)`, #651): `balancing.enabled` is dropped
 *  when it restates that, so `true` is kept on a character grid and in
 *  vertical text, where balancing is off by default, and `false` is
 *  dropped there. */
export function stripHeadingsDefaults(
  headings?: HeadingsConfig,
  balancingOn: boolean = DEFAULT_COLUMN_BALANCING.enabled,
): HeadingsConfig | undefined {
  if (!headings) return undefined;

  const result: HeadingsConfig = {};
  let hasOverride = false;

  if (headings.fontFamily !== undefined && headings.fontFamily !== DEFAULT_HEADINGS_CONFIG.fontFamily) {
    result.fontFamily = headings.fontFamily;
    hasOverride = true;
  }
  if (headings.figureStyle !== undefined) {
    result.figureStyle = headings.figureStyle;
    hasOverride = true;
  }
  if (headings.lineHeight !== undefined && !dimensionsEqual(headings.lineHeight, DEFAULT_HEADINGS_CONFIG.lineHeight)) {
    result.lineHeight = headings.lineHeight;
    hasOverride = true;
  }
  if (headings.color !== undefined && !colorsEqual(headings.color, DEFAULT_HEADINGS_CONFIG.color)) {
    result.color = headings.color;
    hasOverride = true;
  }
  if (headings.textAlign !== undefined && headings.textAlign !== DEFAULT_HEADINGS_CONFIG.textAlign) {
    result.textAlign = headings.textAlign;
    hasOverride = true;
  }
  if (headings.fontWeight !== undefined && headings.fontWeight !== DEFAULT_HEADINGS_CONFIG.fontWeight) {
    result.fontWeight = headings.fontWeight;
    hasOverride = true;
  }
  if (headings.marginTop !== undefined && !dimensionsEqual(headings.marginTop, DEFAULT_HEADINGS_CONFIG.marginTop)) {
    result.marginTop = headings.marginTop;
    hasOverride = true;
  }
  if (headings.marginBottom !== undefined && !dimensionsEqual(headings.marginBottom, DEFAULT_HEADINGS_CONFIG.marginBottom)) {
    result.marginBottom = headings.marginBottom;
    hasOverride = true;
  }
  if (headings.keepWithNext !== undefined && headings.keepWithNext !== DEFAULT_HEADINGS_CONFIG.keepWithNext) {
    result.keepWithNext = headings.keepWithNext;
    hasOverride = true;
  }
  if (headings.keepWithNextSpread === true) {
    result.keepWithNextSpread = true;
    hasOverride = true;
  }
  if (headings.keepWithNextSplit !== undefined && headings.keepWithNextSplit !== DEFAULT_HEADINGS_CONFIG.keepWithNextSplit) {
    result.keepWithNextSplit = headings.keepWithNextSplit;
    hasOverride = true;
  }
  if (headings.snapToGrid !== undefined && headings.snapToGrid !== DEFAULT_HEADINGS_CONFIG.snapToGrid) {
    result.snapToGrid = headings.snapToGrid;
    hasOverride = true;
  }
  // `'none'` is the default; any other value resolves like it.
  if (headings.columnHeadSpace === 'remainder') {
    result.columnHeadSpace = 'remainder';
    hasOverride = true;
  }
  if (headings.inlineMarks !== undefined && headings.inlineMarks !== DEFAULT_HEADINGS_CONFIG.inlineMarks) {
    result.inlineMarks = headings.inlineMarks;
    hasOverride = true;
  }
  if (headings.balancing) {
    const b: ColumnBalancingConfig = {};
    let hasBOverride = false;
    if (headings.balancing.enabled !== undefined && headings.balancing.enabled !== balancingOn) {
      b.enabled = headings.balancing.enabled;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxLinesPerHeading !== undefined
      && headings.balancing.maxLinesPerHeading !== DEFAULT_COLUMN_BALANCING.maxLinesPerHeading
    ) {
      b.maxLinesPerHeading = headings.balancing.maxLinesPerHeading;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxLinesBeforeLoose !== undefined
      && headings.balancing.maxLinesBeforeLoose !== DEFAULT_COLUMN_BALANCING.maxLinesBeforeLoose
    ) {
      b.maxLinesBeforeLoose = headings.balancing.maxLinesBeforeLoose;
      hasBOverride = true;
    }
    if (
      headings.balancing.stretchAfterLists !== undefined
      && headings.balancing.stretchAfterLists !== DEFAULT_COLUMN_BALANCING.stretchAfterLists
    ) {
      b.stretchAfterLists = headings.balancing.stretchAfterLists;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxLinesAfterList !== undefined
      && headings.balancing.maxLinesAfterList !== DEFAULT_COLUMN_BALANCING.maxLinesAfterList
    ) {
      b.maxLinesAfterList = headings.balancing.maxLinesAfterList;
      hasBOverride = true;
    }
    if (
      headings.balancing.stretchAfterDisplays !== undefined
      && headings.balancing.stretchAfterDisplays !== DEFAULT_COLUMN_BALANCING.stretchAfterDisplays
    ) {
      b.stretchAfterDisplays = headings.balancing.stretchAfterDisplays;
      hasBOverride = true;
    }
    if (
      headings.balancing.stretchAfterFloats !== undefined
      && headings.balancing.stretchAfterFloats !== DEFAULT_COLUMN_BALANCING.stretchAfterFloats
    ) {
      b.stretchAfterFloats = headings.balancing.stretchAfterFloats;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxLinesAfterFloat !== undefined
      && headings.balancing.maxLinesAfterFloat !== DEFAULT_COLUMN_BALANCING.maxLinesAfterFloat
    ) {
      b.maxLinesAfterFloat = headings.balancing.maxLinesAfterFloat;
      hasBOverride = true;
    }
    // `'flush'` is the default; any other value resolves like it.
    if (headings.balancing.stretchAfterWideFloats === 'always') {
      b.stretchAfterWideFloats = 'always';
      hasBOverride = true;
    }
    if (
      headings.balancing.looseParagraphs !== undefined
      && headings.balancing.looseParagraphs !== DEFAULT_COLUMN_BALANCING.looseParagraphs
    ) {
      b.looseParagraphs = headings.balancing.looseParagraphs;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxLooseParagraphs !== undefined
      && headings.balancing.maxLooseParagraphs !== DEFAULT_COLUMN_BALANCING.maxLooseParagraphs
    ) {
      b.maxLooseParagraphs = headings.balancing.maxLooseParagraphs;
      hasBOverride = true;
    }
    if (
      headings.balancing.trackParagraphs !== undefined
      && headings.balancing.trackParagraphs !== DEFAULT_COLUMN_BALANCING.trackParagraphs
    ) {
      b.trackParagraphs = headings.balancing.trackParagraphs;
      hasBOverride = true;
    }
    if (
      headings.balancing.maxTracking !== undefined
      && headings.balancing.maxTracking !== DEFAULT_COLUMN_BALANCING.maxTracking
    ) {
      b.maxTracking = headings.balancing.maxTracking;
      hasBOverride = true;
    }
    if (
      headings.balancing.fillShortColumns !== undefined
      && headings.balancing.fillShortColumns !== DEFAULT_COLUMN_BALANCING.fillShortColumns
    ) {
      b.fillShortColumns = headings.balancing.fillShortColumns;
      hasBOverride = true;
    }
    if (
      headings.balancing.trailing !== undefined
      && headings.balancing.trailing !== DEFAULT_COLUMN_BALANCING.trailing
    ) {
      b.trailing = headings.balancing.trailing;
      hasBOverride = true;
    }
    // `'lines'` is the default; any other value resolves like it.
    if (headings.balancing.trailingStep === 'grid') {
      b.trailingStep = 'grid';
      hasBOverride = true;
    }
    if (
      headings.balancing.beforeSpan !== undefined
      && headings.balancing.beforeSpan !== DEFAULT_COLUMN_BALANCING.beforeSpan
    ) {
      b.beforeSpan = headings.balancing.beforeSpan;
      hasBOverride = true;
    }
    if (
      headings.balancing.closingBox !== undefined
      && headings.balancing.closingBox !== DEFAULT_COLUMN_BALANCING.closingBox
    ) {
      b.closingBox = headings.balancing.closingBox;
      hasBOverride = true;
    }
    // `'allow'` is the default; any other value resolves like it.
    if (headings.balancing.gridLines === 'off') {
      b.gridLines = 'off';
      hasBOverride = true;
    }
    if (hasBOverride) {
      result.balancing = b;
      hasOverride = true;
    }
  }
  if (headings.levels && headings.levels.length > 0) {
    // A level's `snapToGrid` inherits the headings-wide value, so it is
    // only an override where it differs from that one.
    const generalSnapToGrid = headings.snapToGrid ?? DEFAULT_HEADINGS_CONFIG.snapToGrid;
    // So do its face, colour, leading, weight and margins (#691): a level
    // set back to the level default under headings that say otherwise (a
    // 700 under 800 headings) is an override, and dropping it left the
    // level reading the headings' value. A value is dropped only when it
    // restates both, so every configuration stripped before strips (and
    // hashes) as it did.
    const generalFontFamily = headings.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
    const generalLineHeight = headings.lineHeight ?? DEFAULT_HEADINGS_CONFIG.lineHeight;
    const generalColor = headings.color ?? DEFAULT_HEADINGS_CONFIG.color;
    const generalFontWeight = headings.fontWeight ?? DEFAULT_HEADINGS_CONFIG.fontWeight;
    const generalMarginTop = headings.marginTop ?? DEFAULT_HEADINGS_CONFIG.marginTop;
    const generalMarginBottom = headings.marginBottom ?? DEFAULT_HEADINGS_CONFIG.marginBottom;
    const strippedLevels: HeadingLevelConfig[] = [];
    for (const level of headings.levels) {
      const def = DEFAULT_HEADING_LEVELS.find((d) => d.level === level.level);
      if (!def) { strippedLevels.push(level); continue; }
      const entry: HeadingLevelConfig = { level: level.level };
      let levelHasOverride = false;
      if (level.fontSize !== undefined && !dimensionsEqual(level.fontSize, def.fontSize)) {
        entry.fontSize = level.fontSize;
        levelHasOverride = true;
      }
      if (level.lineHeight !== undefined && !(dimensionsEqual(level.lineHeight, def.lineHeight) && dimensionsEqual(level.lineHeight, generalLineHeight))) {
        entry.lineHeight = level.lineHeight;
        levelHasOverride = true;
      }
      if (level.fontFamily !== undefined && !(level.fontFamily === def.fontFamily && level.fontFamily === generalFontFamily)) {
        entry.fontFamily = level.fontFamily;
        levelHasOverride = true;
      }
      if (level.figureStyle !== undefined) {
        entry.figureStyle = level.figureStyle;
        levelHasOverride = true;
      }
      if (level.color !== undefined && !(colorsEqual(level.color, def.color) && colorsEqual(level.color, generalColor))) {
        entry.color = level.color;
        levelHasOverride = true;
      }
      if (level.fontWeight !== undefined && !(level.fontWeight === def.fontWeight && level.fontWeight === generalFontWeight)) {
        entry.fontWeight = level.fontWeight;
        levelHasOverride = true;
      }
      if (level.marginTop !== undefined && !(dimensionsEqual(level.marginTop, def.marginTop) && dimensionsEqual(level.marginTop, generalMarginTop))) {
        entry.marginTop = level.marginTop;
        levelHasOverride = true;
      }
      if (level.marginBottom !== undefined && !(dimensionsEqual(level.marginBottom, def.marginBottom) && dimensionsEqual(level.marginBottom, generalMarginBottom))) {
        entry.marginBottom = level.marginBottom;
        levelHasOverride = true;
      }
      if (level.numberingTemplate !== undefined && level.numberingTemplate !== def.numberingTemplate) {
        entry.numberingTemplate = level.numberingTemplate;
        levelHasOverride = true;
      }
      if (level.numberSeparator !== undefined && level.numberSeparator !== def.numberSeparator) {
        entry.numberSeparator = level.numberSeparator;
        levelHasOverride = true;
      }
      if (level.numberPosition === 'replace') {
        entry.numberPosition = level.numberPosition;
        levelHasOverride = true;
      }
      if (level.italic !== undefined && level.italic !== def.italic) {
        entry.italic = level.italic;
        levelHasOverride = true;
      }
      if (level.letterSpacing !== undefined && level.letterSpacing.value !== 0) {
        entry.letterSpacing = level.letterSpacing;
        levelHasOverride = true;
      }
      if (level.span !== undefined && level.span !== 'column') {
        entry.span = level.span;
        levelHasOverride = true;
      }
      if (level.spanBreak === false) {
        entry.spanBreak = false;
        levelHasOverride = true;
      }
      if (level.textTransform !== undefined && level.textTransform !== 'none') {
        entry.textTransform = level.textTransform;
        levelHasOverride = true;
      }
      if (level.hidden !== undefined && level.hidden !== def.hidden) {
        entry.hidden = level.hidden;
        levelHasOverride = true;
      }
      if (level.snapToGrid !== undefined && level.snapToGrid !== generalSnapToGrid) {
        entry.snapToGrid = level.snapToGrid;
        levelHasOverride = true;
      }
      const grid = headingPlacementFields(level);
      if (grid.lineSpan !== undefined) { entry.lineSpan = grid.lineSpan; levelHasOverride = true; }
      if (grid.indent !== undefined) { entry.indent = grid.indent; levelHasOverride = true; }
      if (grid.firstLineIndent !== undefined) { entry.firstLineIndent = grid.firstLineIndent; levelHasOverride = true; }
      if (grid.jidori !== undefined) { entry.jidori = grid.jidori; levelHasOverride = true; }
      if (grid.dropCap !== undefined) { entry.dropCap = grid.dropCap; levelHasOverride = true; }
      if (level.advancedDesign && (level.advancedDesign.enabled || (level.advancedDesign.slot?.elements?.length ?? 0) > 0)) {
        entry.advancedDesign = level.advancedDesign;
        levelHasOverride = true;
      }
      if (level.breakBefore) {
        // A field is dropped only when it restates both the level's default
        // and the no-break default: H1's own default (always-odd) differs
        // from the others', so an H1 `enabled: false` survives, and a value
        // restating it is kept, so configs saved before overrides merged
        // onto the level default strip (and hash) exactly as they did.
        const restates = <K extends keyof ResolvedHeadingBreakBeforeConfig>(key: K) =>
          level.breakBefore![key] === def.breakBefore[key] && level.breakBefore![key] === DEFAULT_BREAK_BEFORE[key];
        const enabledOverride = level.breakBefore.enabled !== undefined && !restates('enabled');
        const parityOverride = level.breakBefore.parity !== undefined && !restates('parity');
        if (enabledOverride || parityOverride) {
          entry.breakBefore = {
            ...(enabledOverride ? { enabled: level.breakBefore.enabled } : {}),
            ...(parityOverride ? { parity: level.breakBefore.parity } : {}),
          };
          levelHasOverride = true;
        }
      }
      if (levelHasOverride) strippedLevels.push(entry);
    }
    if (strippedLevels.length > 0) {
      result.levels = strippedLevels;
      hasOverride = true;
    }
  }

  return hasOverride ? result : undefined;
}
