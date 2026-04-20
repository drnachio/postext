import type { ResolvedBodyTextConfig, UnorderedListsConfig, UnorderedListLevelConfig, ResolvedUnorderedListsConfig, ResolvedUnorderedListLevelConfig, ColorValue } from '../types';
import { dimensionsEqual, DEFAULT_MAIN_COLOR } from './shared';
import {
  DEFAULT_LIST_BULLET_CHAR,
  DEFAULT_LIST_BULLET_FONT_SIZE,
  DEFAULT_LIST_GAP,
  DEFAULT_LIST_INDENT,
  DEFAULT_LIST_VERTICAL_OFFSET,
  DEFAULT_LIST_MARGIN_TOP,
  DEFAULT_LIST_MARGIN_BOTTOM,
  DEFAULT_LIST_ITEM_SPACING,
  DEFAULT_LIST_HANGING_INDENT,
  DEFAULT_TASK_CHECKBOX_CHAR,
  DEFAULT_TASK_CHECKED_CHAR,
  DEFAULT_TASK_COMPLETED_STRIKETHROUGH,
} from './lists-shared';

const DEFAULT_UNORDERED_LIST_FONT_WEIGHT = 700;
const DEFAULT_UNORDERED_LIST_COLOR: ColorValue = { ...DEFAULT_MAIN_COLOR };

export function resolveUnorderedListsConfig(
  partial: UnorderedListsConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedUnorderedListsConfig {
  const generalFont = partial?.fontFamily ?? bodyText.fontFamily;
  const generalColor = partial?.color ?? DEFAULT_UNORDERED_LIST_COLOR;
  const generalFontWeight = partial?.fontWeight ?? DEFAULT_UNORDERED_LIST_FONT_WEIGHT;
  const generalItalic = partial?.italic ?? false;
  const generalBulletChar = partial?.bulletChar ?? DEFAULT_LIST_BULLET_CHAR;
  const generalFontSize = partial?.bulletFontSize ?? DEFAULT_LIST_BULLET_FONT_SIZE;
  const generalIndent = partial?.indent ?? DEFAULT_LIST_INDENT;
  const generalVerticalOffset = partial?.bulletVerticalOffset ?? DEFAULT_LIST_VERTICAL_OFFSET;

  const levels: ResolvedUnorderedListLevelConfig[] = [1, 2, 3, 4, 5].map((level) => {
    const override = partial?.levels?.find((l) => l.level === level);
    return {
      level,
      bulletChar: override?.bulletChar ?? generalBulletChar,
      fontFamily: override?.fontFamily ?? generalFont,
      fontSize: override?.fontSize ?? generalFontSize,
      color: override?.color ?? generalColor,
      fontWeight: override?.fontWeight ?? generalFontWeight,
      italic: override?.italic ?? generalItalic,
      indent: override?.indent,
      verticalOffset: override?.verticalOffset ?? generalVerticalOffset,
    };
  });

  const resolved: ResolvedUnorderedListsConfig = {
    fontFamily: generalFont,
    color: generalColor,
    fontWeight: generalFontWeight,
    italic: generalItalic,
    bulletChar: generalBulletChar,
    bulletFontSize: generalFontSize,
    gap: partial?.gap ?? DEFAULT_LIST_GAP,
    indent: generalIndent,
    bulletVerticalOffset: generalVerticalOffset,
    marginTop: partial?.marginTop ?? DEFAULT_LIST_MARGIN_TOP,
    marginBottom: partial?.marginBottom ?? DEFAULT_LIST_MARGIN_BOTTOM,
    itemSpacing: partial?.itemSpacing ?? DEFAULT_LIST_ITEM_SPACING,
    hangingIndent: partial?.hangingIndent ?? DEFAULT_LIST_HANGING_INDENT,
    levels,
    taskCheckboxChar: partial?.taskCheckboxChar ?? DEFAULT_TASK_CHECKBOX_CHAR,
    taskCheckedChar: partial?.taskCheckedChar ?? DEFAULT_TASK_CHECKED_CHAR,
    taskCompletedStrikethrough:
      partial?.taskCompletedStrikethrough ?? DEFAULT_TASK_COMPLETED_STRIKETHROUGH,
  };
  if (partial?.taskCompletedColor !== undefined) {
    resolved.taskCompletedColor = partial.taskCompletedColor;
  }
  return resolved;
}

/** Default values for fields that have a fixed (non-inherited) default. */
export const DEFAULT_UNORDERED_LISTS_STATIC = {
  fontWeight: DEFAULT_UNORDERED_LIST_FONT_WEIGHT,
  italic: false,
  bulletChar: DEFAULT_LIST_BULLET_CHAR,
  bulletFontSize: DEFAULT_LIST_BULLET_FONT_SIZE,
  gap: DEFAULT_LIST_GAP,
  indent: DEFAULT_LIST_INDENT,
  bulletVerticalOffset: DEFAULT_LIST_VERTICAL_OFFSET,
  marginTop: DEFAULT_LIST_MARGIN_TOP,
  marginBottom: DEFAULT_LIST_MARGIN_BOTTOM,
  itemSpacing: DEFAULT_LIST_ITEM_SPACING,
  hangingIndent: DEFAULT_LIST_HANGING_INDENT,
  taskCheckboxChar: DEFAULT_TASK_CHECKBOX_CHAR,
  taskCheckedChar: DEFAULT_TASK_CHECKED_CHAR,
  taskCompletedStrikethrough: DEFAULT_TASK_COMPLETED_STRIKETHROUGH,
};

export function stripUnorderedListsDefaults(
  lists?: UnorderedListsConfig,
): UnorderedListsConfig | undefined {
  if (!lists) return undefined;

  const result: UnorderedListsConfig = {};
  let hasOverride = false;

  if (lists.fontFamily !== undefined) {
    result.fontFamily = lists.fontFamily;
    hasOverride = true;
  }
  if (lists.color !== undefined) {
    result.color = lists.color;
    hasOverride = true;
  }
  if (lists.fontWeight !== undefined && lists.fontWeight !== DEFAULT_UNORDERED_LIST_FONT_WEIGHT) {
    result.fontWeight = lists.fontWeight;
    hasOverride = true;
  }
  if (lists.italic !== undefined && lists.italic !== false) {
    result.italic = lists.italic;
    hasOverride = true;
  }
  if (lists.bulletChar !== undefined && lists.bulletChar !== DEFAULT_LIST_BULLET_CHAR) {
    result.bulletChar = lists.bulletChar;
    hasOverride = true;
  }
  if (lists.bulletFontSize !== undefined && !dimensionsEqual(lists.bulletFontSize, DEFAULT_LIST_BULLET_FONT_SIZE)) {
    result.bulletFontSize = lists.bulletFontSize;
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
  if (lists.bulletVerticalOffset !== undefined && !dimensionsEqual(lists.bulletVerticalOffset, DEFAULT_LIST_VERTICAL_OFFSET)) {
    result.bulletVerticalOffset = lists.bulletVerticalOffset;
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
    const strippedLevels: UnorderedListLevelConfig[] = [];
    for (const lvl of lists.levels) {
      const entry: UnorderedListLevelConfig = { level: lvl.level };
      let levelHasOverride = false;
      if (lvl.bulletChar !== undefined) {
        entry.bulletChar = lvl.bulletChar;
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
  if (lists.taskCheckboxChar !== undefined && lists.taskCheckboxChar !== DEFAULT_TASK_CHECKBOX_CHAR) {
    result.taskCheckboxChar = lists.taskCheckboxChar;
    hasOverride = true;
  }
  if (lists.taskCheckedChar !== undefined && lists.taskCheckedChar !== DEFAULT_TASK_CHECKED_CHAR) {
    result.taskCheckedChar = lists.taskCheckedChar;
    hasOverride = true;
  }
  if (
    lists.taskCompletedStrikethrough !== undefined &&
    lists.taskCompletedStrikethrough !== DEFAULT_TASK_COMPLETED_STRIKETHROUGH
  ) {
    result.taskCompletedStrikethrough = lists.taskCompletedStrikethrough;
    hasOverride = true;
  }
  if (lists.taskCompletedColor !== undefined) {
    result.taskCompletedColor = lists.taskCompletedColor;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}
