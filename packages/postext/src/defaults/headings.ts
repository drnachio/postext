import type { HeadingsConfig, HeadingLevelConfig, HeadingBreakBeforeConfig, ResolvedHeadingsConfig, ResolvedHeadingLevelConfig, ResolvedHeadingBreakBeforeConfig, HeadingAdvancedDesignConfig, ResolvedHeadingAdvancedDesignConfig, ColorValue, Dimension } from '../types';
import { dimensionsEqual, colorsEqual, DEFAULT_MAIN_COLOR } from './shared';
import { resolveDesignSlot } from './headerFooter';

const DEFAULT_BREAK_BEFORE: ResolvedHeadingBreakBeforeConfig = { enabled: false, parity: 'any' };

const DEFAULT_ADVANCED_DESIGN: ResolvedHeadingAdvancedDesignConfig = {
  enabled: false,
  slot: { elements: [] },
};

function resolveAdvancedDesign(raw?: HeadingAdvancedDesignConfig): ResolvedHeadingAdvancedDesignConfig {
  if (!raw) return { enabled: false, slot: { elements: [] } };
  return {
    enabled: raw.enabled ?? false,
    slot: resolveDesignSlot(raw.slot, 'header'),
  };
}

function resolveBreakBefore(raw?: HeadingBreakBeforeConfig): ResolvedHeadingBreakBeforeConfig {
  if (!raw) return { ...DEFAULT_BREAK_BEFORE };
  return {
    enabled: raw.enabled ?? DEFAULT_BREAK_BEFORE.enabled,
    parity: raw.parity ?? DEFAULT_BREAK_BEFORE.parity,
  };
}

const DEFAULT_HEADING_FONT = 'Open Sans';
const DEFAULT_HEADING_LINE_HEIGHT: Dimension = { value: 1.2, unit: 'em' };
const DEFAULT_HEADING_COLOR: ColorValue = { ...DEFAULT_MAIN_COLOR };
const DEFAULT_HEADING_FONT_WEIGHT = 700;
const DEFAULT_HEADING_MARGIN_TOP: Dimension = { value: 1.5, unit: 'em' };
const DEFAULT_HEADING_MARGIN_BOTTOM: Dimension = { value: 0.5, unit: 'em' };

const DEFAULT_HEADING_LEVELS: ResolvedHeadingLevelConfig[] = [
  { level: 1, fontSize: { value: 18, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { enabled: true, parity: 'always-odd' }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
  { level: 2, fontSize: { value: 15, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
  { level: 3, fontSize: { value: 12, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
  { level: 4, fontSize: { value: 10, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
  { level: 5, fontSize: { value: 9, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
  { level: 6, fontSize: { value: 8, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', italic: false, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } } },
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
  levels: DEFAULT_HEADING_LEVELS,
};

export function resolveHeadingsConfig(partial?: HeadingsConfig): ResolvedHeadingsConfig {
  if (!partial) return { ...DEFAULT_HEADINGS_CONFIG, levels: DEFAULT_HEADING_LEVELS.map((l) => ({ ...l })) };

  const generalFont = partial.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const generalLineHeight = partial.lineHeight ?? DEFAULT_HEADINGS_CONFIG.lineHeight;
  const generalColor = partial.color ?? DEFAULT_HEADINGS_CONFIG.color;
  const generalTextAlign = partial.textAlign ?? DEFAULT_HEADINGS_CONFIG.textAlign;
  const generalFontWeight = partial.fontWeight ?? DEFAULT_HEADINGS_CONFIG.fontWeight;
  const generalMarginTop = partial.marginTop ?? DEFAULT_HEADINGS_CONFIG.marginTop;
  const generalMarginBottom = partial.marginBottom ?? DEFAULT_HEADINGS_CONFIG.marginBottom;
  const generalKeepWithNext = partial.keepWithNext ?? DEFAULT_HEADINGS_CONFIG.keepWithNext;

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
      italic: override?.italic ?? def.italic,
      breakBefore: resolveBreakBefore(override?.breakBefore),
      span: override?.span ?? def.span,
      advancedDesign: resolveAdvancedDesign(override?.advancedDesign),
    };
  });

  return { fontFamily: generalFont, lineHeight: generalLineHeight, color: generalColor, textAlign: generalTextAlign, fontWeight: generalFontWeight, marginTop: generalMarginTop, marginBottom: generalMarginBottom, keepWithNext: generalKeepWithNext, levels };
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
  if (headings.levels && headings.levels.length > 0) {
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
      if (level.italic !== undefined && level.italic !== def.italic) {
        entry.italic = level.italic;
        levelHasOverride = true;
      }
      if (level.span !== undefined && level.span !== 'column') {
        entry.span = level.span;
        levelHasOverride = true;
      }
      if (level.advancedDesign && (level.advancedDesign.enabled || (level.advancedDesign.slot?.elements?.length ?? 0) > 0)) {
        entry.advancedDesign = level.advancedDesign;
        levelHasOverride = true;
      }
      if (level.breakBefore) {
        const enabledOverride = level.breakBefore.enabled !== undefined && level.breakBefore.enabled !== DEFAULT_BREAK_BEFORE.enabled;
        const parityOverride = level.breakBefore.parity !== undefined && level.breakBefore.parity !== DEFAULT_BREAK_BEFORE.parity;
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
