import type { ColorValue, PostextConfig } from 'postext';
import type { SandboxLabels } from '../types';

function unlinkColor(value: ColorValue | undefined, paletteId: string): ColorValue | undefined {
  if (!value || value.paletteId !== paletteId) return value;
  return { hex: value.hex, model: value.model };
}

const isLinked = (value: ColorValue | undefined, paletteId: string): boolean =>
  value?.paletteId === paletteId;

export function findPaletteUsages(
  config: PostextConfig,
  paletteId: string,
  labels: SandboxLabels,
): string[] {
  const usages: string[] = [];

  if (config.page) {
    if (isLinked(config.page.backgroundColor, paletteId)) usages.push(labels.pageBackgroundColor);
    if (isLinked(config.page.cutLines?.color, paletteId)) usages.push(labels.cutLinesColor);
    if (isLinked(config.page.baselineGrid?.color, paletteId)) usages.push(labels.baselineGridColor);
  }

  if (isLinked(config.layout?.columnRule?.color, paletteId)) usages.push(labels.columnRuleColor);

  if (config.bodyText) {
    if (isLinked(config.bodyText.color, paletteId)) usages.push(labels.bodyColor);
    if (isLinked(config.bodyText.boldColor, paletteId)) usages.push(labels.bodyBoldColor);
    if (isLinked(config.bodyText.italicColor, paletteId)) usages.push(labels.bodyItalicColor);
  }

  if (config.headings) {
    if (isLinked(config.headings.color, paletteId)) usages.push(labels.headingsColor);
    config.headings.levels?.forEach((l, i) => {
      if (isLinked(l.color, paletteId)) usages.push(`${labels.headingColor} (H${i + 1})`);
    });
  }

  if (config.unorderedLists) {
    if (isLinked(config.unorderedLists.color, paletteId)) usages.push(labels.unorderedListsColor);
    if (isLinked(config.unorderedLists.taskCompletedColor, paletteId)) usages.push(labels.taskCompletedColor);
    config.unorderedLists.levels?.forEach((l, i) => {
      if (isLinked(l.color, paletteId)) usages.push(`${labels.unorderedListLevelColor} (L${i + 1})`);
    });
  }

  if (config.orderedLists) {
    if (isLinked(config.orderedLists.color, paletteId)) usages.push(labels.orderedListsColor);
    config.orderedLists.levels?.forEach((l, i) => {
      if (isLinked(l.color, paletteId)) usages.push(`${labels.orderedListLevelColor} (L${i + 1})`);
    });
  }

  if (config.debug) {
    if (isLinked(config.debug.cursorSync?.color, paletteId)) usages.push(labels.debugCursorSyncColor);
    if (isLinked(config.debug.selectionSync?.color, paletteId)) usages.push(labels.debugSelectionSyncColor);
  }

  return usages;
}

export function unlinkPaletteRefs(config: PostextConfig, paletteId: string): PostextConfig {
  const next: PostextConfig = { ...config };

  if (config.page) {
    next.page = {
      ...config.page,
      backgroundColor: unlinkColor(config.page.backgroundColor, paletteId),
      cutLines: config.page.cutLines
        ? { ...config.page.cutLines, color: unlinkColor(config.page.cutLines.color, paletteId) }
        : config.page.cutLines,
      baselineGrid: config.page.baselineGrid
        ? { ...config.page.baselineGrid, color: unlinkColor(config.page.baselineGrid.color, paletteId) }
        : config.page.baselineGrid,
    };
  }

  if (config.layout?.columnRule) {
    next.layout = {
      ...config.layout,
      columnRule: { ...config.layout.columnRule, color: unlinkColor(config.layout.columnRule.color, paletteId) },
    };
  }

  if (config.bodyText) {
    next.bodyText = {
      ...config.bodyText,
      color: unlinkColor(config.bodyText.color, paletteId),
      boldColor: unlinkColor(config.bodyText.boldColor, paletteId),
      italicColor: unlinkColor(config.bodyText.italicColor, paletteId),
    };
  }

  if (config.headings) {
    next.headings = {
      ...config.headings,
      color: unlinkColor(config.headings.color, paletteId),
      levels: config.headings.levels?.map((l) => ({ ...l, color: unlinkColor(l.color, paletteId) })),
    };
  }

  if (config.unorderedLists) {
    next.unorderedLists = {
      ...config.unorderedLists,
      color: unlinkColor(config.unorderedLists.color, paletteId),
      taskCompletedColor: unlinkColor(config.unorderedLists.taskCompletedColor, paletteId),
      levels: config.unorderedLists.levels?.map((l) => ({ ...l, color: unlinkColor(l.color, paletteId) })),
    };
  }

  if (config.orderedLists) {
    next.orderedLists = {
      ...config.orderedLists,
      color: unlinkColor(config.orderedLists.color, paletteId),
      levels: config.orderedLists.levels?.map((l) => ({ ...l, color: unlinkColor(l.color, paletteId) })),
    };
  }

  if (config.debug) {
    next.debug = {
      ...config.debug,
      cursorSync: config.debug.cursorSync
        ? { ...config.debug.cursorSync, color: unlinkColor(config.debug.cursorSync.color, paletteId) }
        : config.debug.cursorSync,
      selectionSync: config.debug.selectionSync
        ? { ...config.debug.selectionSync, color: unlinkColor(config.debug.selectionSync.color, paletteId) }
        : config.debug.selectionSync,
    };
  }

  return next;
}
