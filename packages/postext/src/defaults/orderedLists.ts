import type { ResolvedBodyTextConfig, OrderedListsConfig, OrderedListLevelConfig, ResolvedOrderedListsConfig, ResolvedOrderedListLevelConfig, OrderedListNumberFormat, OrderedListNumberWidth, ColorValue, Dimension } from '../types';
import { dimensionsEqual, DEFAULT_MAIN_COLOR } from './shared';
import { parseNumberFormat, toOrderedListNumberFormat } from '../numbering';
import {
  DEFAULT_LIST_BULLET_FONT_SIZE,
  DEFAULT_LIST_GAP,
  DEFAULT_LIST_INDENT,
  DEFAULT_LIST_VERTICAL_OFFSET,
  DEFAULT_LIST_MARGIN_TOP,
  DEFAULT_LIST_MARGIN_BOTTOM,
  DEFAULT_LIST_ITEM_SPACING,
  DEFAULT_LIST_SNAP_TOP_TO_GRID,
  DEFAULT_LIST_HANGING_INDENT,
} from './lists-shared';

const DEFAULT_ORDERED_NUMBER_FORMAT: OrderedListNumberFormat = 'arabic';
const DEFAULT_ORDERED_SEPARATOR = '.';
const DEFAULT_ORDERED_PREFIX = '';
const DEFAULT_ORDERED_LIST_FONT_WEIGHT = 700;
const DEFAULT_ORDERED_LIST_COLOR: ColorValue = { ...DEFAULT_MAIN_COLOR };
const DEFAULT_ORDERED_SEPARATOR_GAP: Dimension = { value: 0, unit: 'em' };
const DEFAULT_ORDERED_NUMBER_WIDTH: OrderedListNumberWidth = 'run';

/** A list `numberFormat` in the list vocabulary, whatever vocabulary it was
 *  written in (`decimal`, `roman-lower`, `i`… — see `parseNumberFormat`);
 *  `undefined` when unset or unknown. */
export function listNumberFormat(value: unknown, locale?: string): OrderedListNumberFormat | undefined {
  const style = parseNumberFormat(value, locale);
  return style ? toOrderedListNumberFormat(style) : undefined;
}

/** The ordered lists in full. `locale` (the document language) decides the
 *  script of a format written `一` or `壹`. */
export function resolveOrderedListsConfig(
  partial: OrderedListsConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
  locale?: string,
): ResolvedOrderedListsConfig {
  const generalFont = partial?.fontFamily ?? bodyText.fontFamily;
  const generalColor = partial?.color ?? DEFAULT_ORDERED_LIST_COLOR;
  const generalFontWeight = partial?.fontWeight ?? DEFAULT_ORDERED_LIST_FONT_WEIGHT;
  const generalItalic = partial?.italic ?? false;
  // Any spelling of a format is read; an unknown one numbers in arabic
  // (`collectConfigWarnings` reports it).
  const generalNumberFormat = listNumberFormat(partial?.numberFormat, locale) ?? DEFAULT_ORDERED_NUMBER_FORMAT;
  const generalSeparator = partial?.separator ?? DEFAULT_ORDERED_SEPARATOR;
  const generalPrefix = partial?.prefix ?? DEFAULT_ORDERED_PREFIX;
  const generalFontSize = partial?.numberFontSize ?? DEFAULT_LIST_BULLET_FONT_SIZE;
  const generalIndent = partial?.indent ?? DEFAULT_LIST_INDENT;
  const generalVerticalOffset = partial?.numberVerticalOffset ?? DEFAULT_LIST_VERTICAL_OFFSET;
  // The separator run inherits the number style unless set explicitly.
  const generalSeparatorGap = partial?.separatorGap ?? DEFAULT_ORDERED_SEPARATOR_GAP;

  const levels: ResolvedOrderedListLevelConfig[] = [1, 2, 3, 4, 5].map((level) => {
    const override = partial?.levels?.find((l) => l.level === level);
    const fontFamily = override?.fontFamily ?? generalFont;
    const color = override?.color ?? generalColor;
    const fontWeight = override?.fontWeight ?? generalFontWeight;
    const italic = override?.italic ?? generalItalic;
    return {
      level,
      numberFormat: override?.numberFormat === undefined
        ? generalNumberFormat
        : listNumberFormat(override.numberFormat, locale) ?? DEFAULT_ORDERED_NUMBER_FORMAT,
      prefix: override?.prefix ?? generalPrefix,
      separator: override?.separator ?? generalSeparator,
      fontFamily,
      fontSize: override?.fontSize ?? generalFontSize,
      color,
      fontWeight,
      italic,
      indent: override?.indent,
      verticalOffset: override?.verticalOffset ?? generalVerticalOffset,
      // A list-wide separator setting wins over the level's number style;
      // otherwise the level's own number style is inherited.
      separatorFontFamily: override?.separatorFontFamily ?? partial?.separatorFontFamily ?? fontFamily,
      separatorFontWeight: override?.separatorFontWeight ?? partial?.separatorFontWeight ?? fontWeight,
      separatorItalic: override?.separatorItalic ?? partial?.separatorItalic ?? italic,
      separatorColor: override?.separatorColor ?? partial?.separatorColor ?? color,
      separatorGap: override?.separatorGap ?? generalSeparatorGap,
    };
  });

  return {
    fontFamily: generalFont,
    color: generalColor,
    fontWeight: generalFontWeight,
    italic: generalItalic,
    numberFormat: generalNumberFormat,
    prefix: generalPrefix,
    separator: generalSeparator,
    numberFontSize: generalFontSize,
    gap: partial?.gap ?? DEFAULT_LIST_GAP,
    indent: generalIndent,
    numberVerticalOffset: generalVerticalOffset,
    marginTop: partial?.marginTop ?? DEFAULT_LIST_MARGIN_TOP,
    marginBottom: partial?.marginBottom ?? DEFAULT_LIST_MARGIN_BOTTOM,
    itemSpacing: partial?.itemSpacing ?? DEFAULT_LIST_ITEM_SPACING,
    snapTopToGrid: partial?.snapTopToGrid ?? DEFAULT_LIST_SNAP_TOP_TO_GRID,
    numberWidth: partial?.numberWidth === 'level' ? 'level' : DEFAULT_ORDERED_NUMBER_WIDTH,
    hangingIndent: partial?.hangingIndent ?? DEFAULT_LIST_HANGING_INDENT,
    levels,
    separatorFontFamily: partial?.separatorFontFamily ?? generalFont,
    separatorFontWeight: partial?.separatorFontWeight ?? generalFontWeight,
    separatorItalic: partial?.separatorItalic ?? generalItalic,
    separatorColor: partial?.separatorColor ?? generalColor,
    separatorGap: generalSeparatorGap,
  };
}

export const DEFAULT_ORDERED_LISTS_STATIC = {
  fontWeight: DEFAULT_ORDERED_LIST_FONT_WEIGHT,
  italic: false,
  numberFormat: DEFAULT_ORDERED_NUMBER_FORMAT,
  prefix: DEFAULT_ORDERED_PREFIX,
  separator: DEFAULT_ORDERED_SEPARATOR,
  numberFontSize: DEFAULT_LIST_BULLET_FONT_SIZE,
  gap: DEFAULT_LIST_GAP,
  indent: DEFAULT_LIST_INDENT,
  numberVerticalOffset: DEFAULT_LIST_VERTICAL_OFFSET,
  marginTop: DEFAULT_LIST_MARGIN_TOP,
  marginBottom: DEFAULT_LIST_MARGIN_BOTTOM,
  itemSpacing: DEFAULT_LIST_ITEM_SPACING,
  snapTopToGrid: DEFAULT_LIST_SNAP_TOP_TO_GRID,
  numberWidth: DEFAULT_ORDERED_NUMBER_WIDTH,
  hangingIndent: DEFAULT_LIST_HANGING_INDENT,
  separatorGap: DEFAULT_ORDERED_SEPARATOR_GAP,
};

export function stripOrderedListsDefaults(
  lists?: OrderedListsConfig,
): OrderedListsConfig | undefined {
  if (!lists) return undefined;

  const result: OrderedListsConfig = {};
  let hasOverride = false;

  if (lists.fontFamily !== undefined) {
    result.fontFamily = lists.fontFamily;
    hasOverride = true;
  }
  if (lists.color !== undefined) {
    result.color = lists.color;
    hasOverride = true;
  }
  if (lists.fontWeight !== undefined && lists.fontWeight !== DEFAULT_ORDERED_LIST_FONT_WEIGHT) {
    result.fontWeight = lists.fontWeight;
    hasOverride = true;
  }
  if (lists.italic !== undefined && lists.italic !== false) {
    result.italic = lists.italic;
    hasOverride = true;
  }
  // Another spelling of the default (`decimal`) is the default.
  if (lists.numberFormat !== undefined && listNumberFormat(lists.numberFormat) !== DEFAULT_ORDERED_NUMBER_FORMAT) {
    result.numberFormat = lists.numberFormat;
    hasOverride = true;
  }
  if (lists.prefix !== undefined && lists.prefix !== DEFAULT_ORDERED_PREFIX) {
    result.prefix = lists.prefix;
    hasOverride = true;
  }
  if (lists.separator !== undefined && lists.separator !== DEFAULT_ORDERED_SEPARATOR) {
    result.separator = lists.separator;
    hasOverride = true;
  }
  if (lists.numberFontSize !== undefined && !dimensionsEqual(lists.numberFontSize, DEFAULT_LIST_BULLET_FONT_SIZE)) {
    result.numberFontSize = lists.numberFontSize;
    hasOverride = true;
  }
  if (lists.gap !== undefined && !dimensionsEqual(lists.gap, DEFAULT_LIST_GAP)) {
    result.gap = lists.gap;
    hasOverride = true;
  }
  if (lists.indent !== undefined && !dimensionsEqual(lists.indent, DEFAULT_LIST_INDENT)) {
    result.indent = lists.indent;
    hasOverride = true;
  }
  if (lists.numberVerticalOffset !== undefined && !dimensionsEqual(lists.numberVerticalOffset, DEFAULT_LIST_VERTICAL_OFFSET)) {
    result.numberVerticalOffset = lists.numberVerticalOffset;
    hasOverride = true;
  }
  if (lists.marginTop !== undefined && !dimensionsEqual(lists.marginTop, DEFAULT_LIST_MARGIN_TOP)) {
    result.marginTop = lists.marginTop;
    hasOverride = true;
  }
  if (lists.marginBottom !== undefined && !dimensionsEqual(lists.marginBottom, DEFAULT_LIST_MARGIN_BOTTOM)) {
    result.marginBottom = lists.marginBottom;
    hasOverride = true;
  }
  if (lists.itemSpacing !== undefined && !dimensionsEqual(lists.itemSpacing, DEFAULT_LIST_ITEM_SPACING)) {
    result.itemSpacing = lists.itemSpacing;
    hasOverride = true;
  }
  if (lists.snapTopToGrid !== undefined && lists.snapTopToGrid !== DEFAULT_LIST_SNAP_TOP_TO_GRID) {
    result.snapTopToGrid = lists.snapTopToGrid;
    hasOverride = true;
  }
  if (lists.numberWidth !== undefined && lists.numberWidth !== DEFAULT_ORDERED_NUMBER_WIDTH) {
    result.numberWidth = lists.numberWidth;
    hasOverride = true;
  }
  if (lists.hangingIndent !== undefined && lists.hangingIndent !== DEFAULT_LIST_HANGING_INDENT) {
    result.hangingIndent = lists.hangingIndent;
    hasOverride = true;
  }
  // Separator style fields inherit the number style, so any explicit value
  // is an override.
  if (lists.separatorFontFamily !== undefined) {
    result.separatorFontFamily = lists.separatorFontFamily;
    hasOverride = true;
  }
  if (lists.separatorFontWeight !== undefined) {
    result.separatorFontWeight = lists.separatorFontWeight;
    hasOverride = true;
  }
  if (lists.separatorItalic !== undefined) {
    result.separatorItalic = lists.separatorItalic;
    hasOverride = true;
  }
  if (lists.separatorColor !== undefined) {
    result.separatorColor = lists.separatorColor;
    hasOverride = true;
  }
  if (lists.separatorGap !== undefined && !dimensionsEqual(lists.separatorGap, DEFAULT_ORDERED_SEPARATOR_GAP)) {
    result.separatorGap = lists.separatorGap;
    hasOverride = true;
  }
  if (lists.levels && lists.levels.length > 0) {
    const strippedLevels: OrderedListLevelConfig[] = [];
    for (const lvl of lists.levels) {
      const entry: OrderedListLevelConfig = { level: lvl.level };
      let levelHasOverride = false;
      if (lvl.numberFormat !== undefined) {
        entry.numberFormat = lvl.numberFormat;
        levelHasOverride = true;
      }
      if (lvl.prefix !== undefined) {
        entry.prefix = lvl.prefix;
        levelHasOverride = true;
      }
      if (lvl.separator !== undefined) {
        entry.separator = lvl.separator;
        levelHasOverride = true;
      }
      if (lvl.fontFamily !== undefined) {
        entry.fontFamily = lvl.fontFamily;
        levelHasOverride = true;
      }
      if (lvl.fontSize !== undefined) {
        entry.fontSize = lvl.fontSize;
        levelHasOverride = true;
      }
      if (lvl.color !== undefined) {
        entry.color = lvl.color;
        levelHasOverride = true;
      }
      if (lvl.fontWeight !== undefined) {
        entry.fontWeight = lvl.fontWeight;
        levelHasOverride = true;
      }
      if (lvl.italic !== undefined) {
        entry.italic = lvl.italic;
        levelHasOverride = true;
      }
      if (lvl.indent !== undefined) {
        entry.indent = lvl.indent;
        levelHasOverride = true;
      }
      if (lvl.verticalOffset !== undefined) {
        entry.verticalOffset = lvl.verticalOffset;
        levelHasOverride = true;
      }
      if (lvl.separatorFontFamily !== undefined) {
        entry.separatorFontFamily = lvl.separatorFontFamily;
        levelHasOverride = true;
      }
      if (lvl.separatorFontWeight !== undefined) {
        entry.separatorFontWeight = lvl.separatorFontWeight;
        levelHasOverride = true;
      }
      if (lvl.separatorItalic !== undefined) {
        entry.separatorItalic = lvl.separatorItalic;
        levelHasOverride = true;
      }
      if (lvl.separatorColor !== undefined) {
        entry.separatorColor = lvl.separatorColor;
        levelHasOverride = true;
      }
      if (lvl.separatorGap !== undefined) {
        entry.separatorGap = lvl.separatorGap;
        levelHasOverride = true;
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
