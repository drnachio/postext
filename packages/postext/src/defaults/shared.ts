import type { ColorValue, ColorPaletteEntry, Dimension, PostextConfig } from '../types';

export const DEFAULT_MAIN_COLOR_ID = 'main-color';
export const DEFAULT_MAIN_COLOR_NAME = 'Main Color';
export const DEFAULT_MAIN_COLOR_HEX = '#3a5a87';

export const DEFAULT_MAIN_COLOR: ColorValue = {
  hex: DEFAULT_MAIN_COLOR_HEX,
  model: 'hex',
  paletteId: DEFAULT_MAIN_COLOR_ID,
};

export const DEFAULT_COLOR_PALETTE: ColorPaletteEntry[] = [
  {
    id: DEFAULT_MAIN_COLOR_ID,
    name: DEFAULT_MAIN_COLOR_NAME,
    value: { hex: DEFAULT_MAIN_COLOR_HEX, model: 'hex' },
  },
];

export function cloneDefaultColorPalette(): ColorPaletteEntry[] {
  return DEFAULT_COLOR_PALETTE.map((entry) => ({
    ...entry,
    value: { ...entry.value },
  }));
}

export function isDefaultColorPalette(palette: ColorPaletteEntry[] | undefined): boolean {
  if (!palette || palette.length !== DEFAULT_COLOR_PALETTE.length) return false;
  return palette.every((entry, i) => {
    const def = DEFAULT_COLOR_PALETTE[i]!;
    return (
      entry.id === def.id &&
      entry.name === def.name &&
      entry.value.hex === def.value.hex &&
      entry.value.model === def.value.model &&
      !entry.value.paletteId
    );
  });
}

export function dimensionsEqual(a: Dimension, b: Dimension): boolean {
  return a.value === b.value && a.unit === b.unit;
}

export function colorsEqual(a: ColorValue, b: ColorValue): boolean {
  return a.hex === b.hex && a.model === b.model && a.paletteId === b.paletteId;
}

export function resolveColorValue(
  value: ColorValue | undefined,
  palette: ColorPaletteEntry[] | undefined,
  fallback: ColorValue,
): ColorValue {
  if (!value) return fallback;
  if (value.paletteId) {
    const entry = palette?.find((e) => e.id === value.paletteId);
    if (entry) return { hex: entry.value.hex, model: entry.value.model, paletteId: value.paletteId };
    return { hex: value.hex, model: value.model };
  }
  return value;
}

export function resolveColor(value: ColorValue | undefined, palette: ColorPaletteEntry[] | undefined): ColorValue | undefined {
  if (!value || !value.paletteId) return value;
  const entry = palette?.find((e) => e.id === value.paletteId);
  if (!entry) return { hex: value.hex, model: value.model };
  return { hex: entry.value.hex, model: entry.value.model };
}

export function applyPaletteToConfig(config: PostextConfig | undefined): PostextConfig | undefined {
  if (!config) return config;
  const palette = config.colorPalette;
  if (!palette || palette.length === 0) return config;

  const next: PostextConfig = { ...config };

  if (config.page) {
    next.page = {
      ...config.page,
      backgroundColor: resolveColor(config.page.backgroundColor, palette),
      cutLines: config.page.cutLines
        ? { ...config.page.cutLines, color: resolveColor(config.page.cutLines.color, palette) }
        : config.page.cutLines,
      baselineGrid: config.page.baselineGrid
        ? { ...config.page.baselineGrid, color: resolveColor(config.page.baselineGrid.color, palette) }
        : config.page.baselineGrid,
    };
  }

  if (config.layout?.columnRule) {
    next.layout = {
      ...config.layout,
      columnRule: { ...config.layout.columnRule, color: resolveColor(config.layout.columnRule.color, palette) },
    };
  }

  if (config.bodyText) {
    next.bodyText = {
      ...config.bodyText,
      color: resolveColor(config.bodyText.color, palette),
      boldColor: resolveColor(config.bodyText.boldColor, palette),
      italicColor: resolveColor(config.bodyText.italicColor, palette),
    };
  }

  if (config.headings) {
    next.headings = {
      ...config.headings,
      color: resolveColor(config.headings.color, palette),
      levels: config.headings.levels?.map((l) => ({ ...l, color: resolveColor(l.color, palette) })),
    };
  }

  if (config.unorderedLists) {
    next.unorderedLists = {
      ...config.unorderedLists,
      color: resolveColor(config.unorderedLists.color, palette),
      taskCompletedColor: resolveColor(config.unorderedLists.taskCompletedColor, palette),
      levels: config.unorderedLists.levels?.map((l) => ({ ...l, color: resolveColor(l.color, palette) })),
    };
  }

  if (config.orderedLists) {
    next.orderedLists = {
      ...config.orderedLists,
      color: resolveColor(config.orderedLists.color, palette),
      levels: config.orderedLists.levels?.map((l) => ({ ...l, color: resolveColor(l.color, palette) })),
    };
  }

  if (config.debug) {
    next.debug = {
      ...config.debug,
      cursorSync: config.debug.cursorSync
        ? { ...config.debug.cursorSync, color: resolveColor(config.debug.cursorSync.color, palette) }
        : config.debug.cursorSync,
      selectionSync: config.debug.selectionSync
        ? { ...config.debug.selectionSync, color: resolveColor(config.debug.selectionSync.color, palette) }
        : config.debug.selectionSync,
      looseLineHighlight: config.debug.looseLineHighlight
        ? { ...config.debug.looseLineHighlight, color: resolveColor(config.debug.looseLineHighlight.color, palette) }
        : config.debug.looseLineHighlight,
    };
  }

  return next;
}
