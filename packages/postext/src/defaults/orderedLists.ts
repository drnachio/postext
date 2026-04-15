import type { ResolvedBodyTextConfig, OrderedListsConfig, OrderedListLevelConfig, ResolvedOrderedListsConfig, ResolvedOrderedListLevelConfig, OrderedListNumberFormat } from '../types';
import { dimensionsEqual } from './shared';
import {
  DEFAULT_LIST_FONT_WEIGHT,
  DEFAULT_LIST_BULLET_FONT_SIZE,
  DEFAULT_LIST_GAP,
  DEFAULT_LIST_INDENT,
  DEFAULT_LIST_VERTICAL_OFFSET,
  DEFAULT_LIST_MARGIN_TOP,
  DEFAULT_LIST_MARGIN_BOTTOM,
  DEFAULT_LIST_ITEM_SPACING,
  DEFAULT_LIST_HANGING_INDENT,
} from './lists-shared';

const DEFAULT_ORDERED_NUMBER_FORMAT: OrderedListNumberFormat = 'arabic';
const DEFAULT_ORDERED_SEPARATOR = '.';

export function resolveOrderedListsConfig(
  partial: OrderedListsConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedOrderedListsConfig {
  const generalFont = partial?.fontFamily ?? bodyText.fontFamily;
  const generalColor = partial?.color ?? bodyText.color;
  const generalFontWeight = partial?.fontWeight ?? DEFAULT_LIST_FONT_WEIGHT;
  const generalItalic = partial?.italic ?? false;
  const generalNumberFormat = partial?.numberFormat ?? DEFAULT_ORDERED_NUMBER_FORMAT;
  const generalSeparator = partial?.separator ?? DEFAULT_ORDERED_SEPARATOR;
  const generalFontSize = partial?.numberFontSize ?? DEFAULT_LIST_BULLET_FONT_SIZE;
  const generalIndent = partial?.indent ?? DEFAULT_LIST_INDENT;
  const generalVerticalOffset = partial?.numberVerticalOffset ?? DEFAULT_LIST_VERTICAL_OFFSET;

  const levels: ResolvedOrderedListLevelConfig[] = [1, 2, 3, 4, 5].map((level) => {
    const override = partial?.levels?.find((l) => l.level === level);
    return {
      level,
      numberFormat: override?.numberFormat ?? generalNumberFormat,
      separator: override?.separator ?? generalSeparator,
      fontFamily: override?.fontFamily ?? generalFont,
      fontSize: override?.fontSize ?? generalFontSize,
      color: override?.color ?? generalColor,
      fontWeight: override?.fontWeight ?? generalFontWeight,
      italic: override?.italic ?? generalItalic,
      indent: override?.indent,
      verticalOffset: override?.verticalOffset ?? generalVerticalOffset,
    };
  });

  return {
    fontFamily: generalFont,
    color: generalColor,
    fontWeight: generalFontWeight,
    italic: generalItalic,
    numberFormat: generalNumberFormat,
    separator: generalSeparator,
    numberFontSize: generalFontSize,
    gap: partial?.gap ?? DEFAULT_LIST_GAP,
    indent: generalIndent,
    numberVerticalOffset: generalVerticalOffset,
    marginTop: partial?.marginTop ?? DEFAULT_LIST_MARGIN_TOP,
    marginBottom: partial?.marginBottom ?? DEFAULT_LIST_MARGIN_BOTTOM,
    itemSpacing: partial?.itemSpacing ?? DEFAULT_LIST_ITEM_SPACING,
    hangingIndent: partial?.hangingIndent ?? DEFAULT_LIST_HANGING_INDENT,
    levels,
  };
}

export const DEFAULT_ORDERED_LISTS_STATIC = {
  fontWeight: DEFAULT_LIST_FONT_WEIGHT,
  italic: false,
  numberFormat: DEFAULT_ORDERED_NUMBER_FORMAT,
  separator: DEFAULT_ORDERED_SEPARATOR,
  numberFontSize: DEFAULT_LIST_BULLET_FONT_SIZE,
  gap: DEFAULT_LIST_GAP,
  indent: DEFAULT_LIST_INDENT,
  numberVerticalOffset: DEFAULT_LIST_VERTICAL_OFFSET,
  marginTop: DEFAULT_LIST_MARGIN_TOP,
  marginBottom: DEFAULT_LIST_MARGIN_BOTTOM,
  itemSpacing: DEFAULT_LIST_ITEM_SPACING,
  hangingIndent: DEFAULT_LIST_HANGING_INDENT,
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
  if (lists.fontWeight !== undefined && lists.fontWeight !== DEFAULT_LIST_FONT_WEIGHT) {
    result.fontWeight = lists.fontWeight;
    hasOverride = true;
  }
  if (lists.italic !== undefined && lists.italic !== false) {
    result.italic = lists.italic;
    hasOverride = true;
  }
  if (lists.numberFormat !== undefined && lists.numberFormat !== DEFAULT_ORDERED_NUMBER_FORMAT) {
    result.numberFormat = lists.numberFormat;
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
  if (lists.hangingIndent !== undefined && lists.hangingIndent !== DEFAULT_LIST_HANGING_INDENT) {
    result.hangingIndent = lists.hangingIndent;
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
      if (levelHasOverride) strippedLevels.push(entry);
    }
    if (strippedLevels.length > 0) {
      result.levels = strippedLevels;
      hasOverride = true;
    }
  }

  return hasOverride ? result : undefined;
}
