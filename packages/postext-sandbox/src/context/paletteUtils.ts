import type { ColorValue, PostextConfig } from 'postext';

function unlinkColor(value: ColorValue | undefined, paletteId: string): ColorValue | undefined {
  if (!value || value.paletteId !== paletteId) return value;
  return { hex: value.hex, model: value.model };
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
    next.bodyText = { ...config.bodyText, color: unlinkColor(config.bodyText.color, paletteId) };
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
