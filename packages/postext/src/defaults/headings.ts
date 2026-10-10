import type { HeadingsConfig, HeadingLevelConfig, HeadingBreakBeforeConfig, ResolvedHeadingsConfig, ResolvedHeadingLevelConfig, ResolvedHeadingBreakBeforeConfig, HeadingAdvancedDesignConfig, ResolvedHeadingAdvancedDesignConfig, ColumnBalancingConfig, ClosingBoxLever, KeepWithNextSplit, ColorValue, Dimension } from '../types';
import { dimensionsEqual, colorsEqual, DEFAULT_MAIN_COLOR, startEndAsLeftRight } from './shared';
import { resolveDesignSlot } from './headerFooter';
import { isDropCap } from './dropCap';

const DEFAULT_BREAK_BEFORE: ResolvedHeadingBreakBeforeConfig = { enabled: false, parity: 'any' };

const DEFAULT_ADVANCED_DESIGN: ResolvedHeadingAdvancedDesignConfig = {
  enabled: false,
  slot: { elements: [] },
};

function resolveAdvancedDesign(raw?: HeadingAdvancedDesignConfig): ResolvedHeadingAdvancedDesignConfig {
  if (!raw) return { enabled: false, slot: { elements: [] } };
  return {
    enabled: raw.enabled ?? false,
    // A design text wraps unless it says otherwise (#628). A design with no
    // slot has always resolved to the running head's default slot.
    slot: raw.slot === undefined ? resolveDesignSlot(undefined, 'header') : resolveDesignSlot(raw.slot, 'heading'),
    ...(raw.minHeight ? { minHeight: raw.minHeight } : {}),
  };
}

/** A partial `breakBefore` merged field by field over `base` (the level's
 *  default, or the level a heading style applies to): setting only
 *  `parity` keeps the base's `enabled`, and vice versa. */
export function resolveBreakBefore(
  raw?: HeadingBreakBeforeConfig,
  base: ResolvedHeadingBreakBeforeConfig = DEFAULT_BREAK_BEFORE,
): ResolvedHeadingBreakBeforeConfig {
  return {
    enabled: raw?.enabled ?? base.enabled,
    parity: raw?.parity ?? base.parity,
  };
}

const DEFAULT_HEADING_FONT = 'Open Sans';
const DEFAULT_HEADING_LINE_HEIGHT: Dimension = { value: 1.2, unit: 'em' };
const DEFAULT_HEADING_COLOR: ColorValue = { ...DEFAULT_MAIN_COLOR };
const DEFAULT_HEADING_FONT_WEIGHT = 700;
const CLOSING_BOX_LEVERS: readonly ClosingBoxLever[] = ['first', 'last', 'off'];
const KEEP_WITH_NEXT_SPLITS: readonly KeepWithNextSplit[] = ['rules', 'fill'];

export const DEFAULT_COLUMN_BALANCING = {
  enabled: true,
  maxLinesPerHeading: 4,
  stretchAfterLists: true,
  maxLinesAfterList: 1,
  stretchAfterFloats: true,
  maxLinesAfterFloat: 1,
  looseParagraphs: true,
  maxLooseParagraphs: 2,
  trackParagraphs: true,
  maxTracking: 10,
  trailing: true,
  beforeSpan: true,
  closingBox: 'first' as ClosingBoxLever,
};

const DEFAULT_HEADING_MARGIN_TOP: Dimension = { value: 1.5, unit: 'em' };
const DEFAULT_HEADING_MARGIN_BOTTOM: Dimension = { value: 0.5, unit: 'em' };
/** No tracking: the heading's letters at their natural spacing. */
const DEFAULT_HEADING_LETTER_SPACING: Dimension = { value: 0, unit: 'pt' };

const DEFAULT_HEADING_LEVELS: ResolvedHeadingLevelConfig[] = [
  { level: 1, fontSize: { value: 18, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { enabled: true, parity: 'always-odd' }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 2, fontSize: { value: 15, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 3, fontSize: { value: 12, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 4, fontSize: { value: 10, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 5, fontSize: { value: 9, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 6, fontSize: { value: 8, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
];

export const DEFAULT_HEADINGS_CONFIG: ResolvedHeadingsConfig = {
  fontFamily: DEFAULT_HEADING_FONT,
  lineHeight: DEFAULT_HEADING_LINE_HEIGHT,
  color: DEFAULT_HEADING_COLOR,
  textAlign: 'left',
  fontWeight: DEFAULT_HEADING_FONT_WEIGHT,
  marginTop: DEFAULT_HEADING_MARGIN_TOP,
  marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM,
  keepWithNext: true,
  keepWithNextSplit: 'rules',
  snapToGrid: true,
  inlineMarks: true,
  balancing: { ...DEFAULT_COLUMN_BALANCING },
  levels: DEFAULT_HEADING_LEVELS,
};

export function resolveHeadingsConfig(partial?: HeadingsConfig): ResolvedHeadingsConfig {
  if (!partial) {
    return {
      ...DEFAULT_HEADINGS_CONFIG,
      balancing: { ...DEFAULT_COLUMN_BALANCING },
      levels: DEFAULT_HEADING_LEVELS.map((l) => ({ ...l })),
    };
  }

  const generalFont = partial.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const generalLineHeight = partial.lineHeight ?? DEFAULT_HEADINGS_CONFIG.lineHeight;
  const generalColor = partial.color ?? DEFAULT_HEADINGS_CONFIG.color;
  const generalTextAlign = startEndAsLeftRight(partial.textAlign ?? DEFAULT_HEADINGS_CONFIG.textAlign);
  const generalFontWeight = partial.fontWeight ?? DEFAULT_HEADINGS_CONFIG.fontWeight;
  const generalMarginTop = partial.marginTop ?? DEFAULT_HEADINGS_CONFIG.marginTop;
  const generalMarginBottom = partial.marginBottom ?? DEFAULT_HEADINGS_CONFIG.marginBottom;
  const generalKeepWithNext = partial.keepWithNext ?? DEFAULT_HEADINGS_CONFIG.keepWithNext;
  const keepWithNextSpread = partial.keepWithNextSpread === true;
  // Any other value reads as the default.
  const keepWithNextSplit = KEEP_WITH_NEXT_SPLITS.includes(partial.keepWithNextSplit as KeepWithNextSplit)
    ? partial.keepWithNextSplit!
    : DEFAULT_HEADINGS_CONFIG.keepWithNextSplit;
  const generalSnapToGrid = partial.snapToGrid ?? DEFAULT_HEADINGS_CONFIG.snapToGrid;
  const inlineMarks = partial.inlineMarks ?? DEFAULT_HEADINGS_CONFIG.inlineMarks;
  const balancing = partial.balancing
    ? {
        enabled: partial.balancing.enabled ?? DEFAULT_COLUMN_BALANCING.enabled,
        maxLinesPerHeading:
          partial.balancing.maxLinesPerHeading ?? DEFAULT_COLUMN_BALANCING.maxLinesPerHeading,
        stretchAfterLists:
          partial.balancing.stretchAfterLists ?? DEFAULT_COLUMN_BALANCING.stretchAfterLists,
        maxLinesAfterList:
          partial.balancing.maxLinesAfterList ?? DEFAULT_COLUMN_BALANCING.maxLinesAfterList,
        stretchAfterFloats:
          partial.balancing.stretchAfterFloats ?? DEFAULT_COLUMN_BALANCING.stretchAfterFloats,
        maxLinesAfterFloat:
          partial.balancing.maxLinesAfterFloat ?? DEFAULT_COLUMN_BALANCING.maxLinesAfterFloat,
        looseParagraphs:
          partial.balancing.looseParagraphs ?? DEFAULT_COLUMN_BALANCING.looseParagraphs,
        maxLooseParagraphs:
          partial.balancing.maxLooseParagraphs ?? DEFAULT_COLUMN_BALANCING.maxLooseParagraphs,
        trackParagraphs:
          partial.balancing.trackParagraphs ?? DEFAULT_COLUMN_BALANCING.trackParagraphs,
        maxTracking:
          partial.balancing.maxTracking ?? DEFAULT_COLUMN_BALANCING.maxTracking,
        trailing:
          partial.balancing.trailing ?? DEFAULT_COLUMN_BALANCING.trailing,
        beforeSpan:
          partial.balancing.beforeSpan ?? DEFAULT_COLUMN_BALANCING.beforeSpan,
        // Any other value reads as the default.
        closingBox: CLOSING_BOX_LEVERS.includes(partial.balancing.closingBox as ClosingBoxLever)
          ? partial.balancing.closingBox!
          : DEFAULT_COLUMN_BALANCING.closingBox,
        // Absent unless `'off'` (#632), so every other configuration
        // resolves as before.
        ...(partial.balancing.gridLines === 'off' ? { gridLines: 'off' as const } : {}),
      }
    : { ...DEFAULT_COLUMN_BALANCING };

  const levels: ResolvedHeadingLevelConfig[] = DEFAULT_HEADING_LEVELS.map((def) => {
    const override = partial.levels?.find((l) => l.level === def.level);
    return {
      level: def.level,
      fontSize: override?.fontSize ?? def.fontSize,
      lineHeight: override?.lineHeight ?? generalLineHeight,
      fontFamily: override?.fontFamily ?? generalFont,
      color: override?.color ?? generalColor,
      fontWeight: override?.fontWeight ?? generalFontWeight,
      marginTop: override?.marginTop ?? generalMarginTop,
      marginBottom: override?.marginBottom ?? generalMarginBottom,
      numberingTemplate: override?.numberingTemplate ?? def.numberingTemplate,
      numberSeparator: override?.numberSeparator ?? def.numberSeparator,
      ...(override?.numberPosition === 'replace' ? { numberPosition: 'replace' as const } : {}),
      italic: override?.italic ?? def.italic,
      letterSpacing: override?.letterSpacing ?? def.letterSpacing,
      breakBefore: resolveBreakBefore(override?.breakBefore, def.breakBefore),
      span: override?.span ?? def.span,
      // Absent unless turned off (#539): every other configuration
      // resolves as before.
      ...(override?.spanBreak === false ? { spanBreak: false } : {}),
      advancedDesign: resolveAdvancedDesign(override?.advancedDesign),
      textTransform: override?.textTransform ?? def.textTransform,
      hidden: override?.hidden ?? def.hidden,
      snapToGrid: override?.snapToGrid ?? generalSnapToGrid,
      // The Japanese heading fields (#424) stay absent unless set, so
      // every other configuration resolves as before.
      ...headingPlacementFields(override),
    };
  });

  return { fontFamily: generalFont, lineHeight: generalLineHeight, color: generalColor, textAlign: generalTextAlign, fontWeight: generalFontWeight, marginTop: generalMarginTop, marginBottom: generalMarginBottom, keepWithNext: generalKeepWithNext, ...(keepWithNextSpread ? { keepWithNextSpread } : {}), keepWithNextSplit, snapToGrid: generalSnapToGrid, inlineMarks, balancing, levels };
}

/** A level's `lineSpan`, `indent` and `jidori` (#424) and its
 *  `firstLineIndent` (#636) as they resolve: each present only when set to
 *  something that takes effect (a whole number of lines from 1, a non-zero
 *  indent, a width over one character),
 *  so a configuration without them resolves exactly as before. */
export function headingPlacementFields(
  partial: Pick<HeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> | undefined,
): Pick<ResolvedHeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> {
  const out: Pick<ResolvedHeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> = {};
  const lineSpan = partial?.lineSpan;
  if (typeof lineSpan === 'number' && Number.isFinite(lineSpan) && lineSpan >= 1) out.lineSpan = Math.round(lineSpan);
  if (partial?.indent && partial.indent.value !== 0) out.indent = partial.indent;
  if (partial?.firstLineIndent && partial.firstLineIndent.value !== 0) out.firstLineIndent = partial.firstLineIndent;
  const jidori = partial?.jidori;
  if (typeof jidori === 'number' && Number.isFinite(jidori) && jidori > 1) out.jidori = jidori;
  // The drop cap of the paragraph after the heading (#623).
  if (isDropCap(partial?.dropCap)) out.dropCap = partial.dropCap;
  return out;
}

/** The level fields a heading style (or any partial level config) sets,
 *  resolved to their final shape — `breakBefore` and `advancedDesign`
 *  normalised, everything else passed through — so they can be merged
 *  over a resolved level with a spread. `breakBefore` is resolved on its
 *  own here (unset fields as for a level without a break); a heading
 *  style's break is merged over its level's instead (see
 *  `createHeadingLevelResolver`). */
export function resolveHeadingLevelOverrides(
  partial: Omit<HeadingLevelConfig, 'level' | 'numberingTemplate'>,
): Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>> {
  const out: Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>> = {};
  if (partial.fontSize !== undefined) out.fontSize = partial.fontSize;
  if (partial.lineHeight !== undefined) out.lineHeight = partial.lineHeight;
  if (partial.fontFamily !== undefined) out.fontFamily = partial.fontFamily;
  if (partial.color !== undefined) out.color = partial.color;
  if (partial.fontWeight !== undefined) out.fontWeight = partial.fontWeight;
  if (partial.marginTop !== undefined) out.marginTop = partial.marginTop;
  if (partial.marginBottom !== undefined) out.marginBottom = partial.marginBottom;
  if (partial.numberSeparator !== undefined) out.numberSeparator = partial.numberSeparator;
  if (partial.numberPosition === 'replace' || partial.numberPosition === 'before') out.numberPosition = partial.numberPosition;
  if (partial.italic !== undefined) out.italic = partial.italic;
  if (partial.letterSpacing !== undefined) out.letterSpacing = partial.letterSpacing;
  if (partial.breakBefore !== undefined) out.breakBefore = resolveBreakBefore(partial.breakBefore);
  if (partial.span !== undefined) out.span = partial.span;
  if (partial.spanBreak !== undefined) out.spanBreak = partial.spanBreak !== false;
  if (partial.advancedDesign !== undefined) out.advancedDesign = resolveAdvancedDesign(partial.advancedDesign);
  if (partial.textTransform !== undefined) out.textTransform = partial.textTransform;
  if (partial.hidden !== undefined) out.hidden = partial.hidden;
  if (partial.snapToGrid !== undefined) out.snapToGrid = partial.snapToGrid;
  // A style that sets one of them to nothing (`lineSpan: 0`, `indent: 0`)
  // takes it off its level's.
  if (partial.lineSpan !== undefined) out.lineSpan = headingPlacementFields(partial).lineSpan;
  if (partial.indent !== undefined) out.indent = headingPlacementFields(partial).indent;
  if (partial.firstLineIndent !== undefined) out.firstLineIndent = headingPlacementFields(partial).firstLineIndent;
  if (partial.jidori !== undefined) out.jidori = headingPlacementFields(partial).jidori;
  // `dropCap: false` takes the level's off.
  if (partial.dropCap !== undefined) out.dropCap = headingPlacementFields(partial).dropCap;
  return out;
}

export function stripHeadingsDefaults(headings?: HeadingsConfig): HeadingsConfig | undefined {
  if (!headings) return undefined;

  const result: HeadingsConfig = {};
  let hasOverride = false;

  if (headings.fontFamily !== undefined && headings.fontFamily !== DEFAULT_HEADINGS_CONFIG.fontFamily) {
    result.fontFamily = headings.fontFamily;
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
  if (headings.inlineMarks !== undefined && headings.inlineMarks !== DEFAULT_HEADINGS_CONFIG.inlineMarks) {
    result.inlineMarks = headings.inlineMarks;
    hasOverride = true;
  }
  if (headings.balancing) {
    const b: ColumnBalancingConfig = {};
    let hasBOverride = false;
    if (headings.balancing.enabled !== undefined && headings.balancing.enabled !== DEFAULT_COLUMN_BALANCING.enabled) {
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
      headings.balancing.trailing !== undefined
      && headings.balancing.trailing !== DEFAULT_COLUMN_BALANCING.trailing
    ) {
      b.trailing = headings.balancing.trailing;
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
    if (hasBOverride) {
      result.balancing = b;
      hasOverride = true;
    }
  }
  if (headings.levels && headings.levels.length > 0) {
    // A level's `snapToGrid` inherits the headings-wide value, so it is
    // only an override where it differs from that one.
    const generalSnapToGrid = headings.snapToGrid ?? DEFAULT_HEADINGS_CONFIG.snapToGrid;
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
      if (level.lineHeight !== undefined && !dimensionsEqual(level.lineHeight, def.lineHeight)) {
        entry.lineHeight = level.lineHeight;
        levelHasOverride = true;
      }
      if (level.fontFamily !== undefined && level.fontFamily !== def.fontFamily) {
        entry.fontFamily = level.fontFamily;
        levelHasOverride = true;
      }
      if (level.color !== undefined && !colorsEqual(level.color, def.color)) {
        entry.color = level.color;
        levelHasOverride = true;
      }
      if (level.fontWeight !== undefined && level.fontWeight !== def.fontWeight) {
        entry.fontWeight = level.fontWeight;
        levelHasOverride = true;
      }
      if (level.marginTop !== undefined && !dimensionsEqual(level.marginTop, def.marginTop)) {
        entry.marginTop = level.marginTop;
        levelHasOverride = true;
      }
      if (level.marginBottom !== undefined && !dimensionsEqual(level.marginBottom, def.marginBottom)) {
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
