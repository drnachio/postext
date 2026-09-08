import type { CaptionStyleConfig, ColorValue, ColorPaletteEntry, Dimension, OrderedListsConfig, PartsBodyStyleConfig, PostextConfig, UnorderedListsConfig } from '../types';
import type { ResolvedConfig } from '../vdt';

export const DEFAULT_MAIN_COLOR_ID = 'main-color';
export const DEFAULT_MAIN_COLOR_NAME = 'Main Color';
export const DEFAULT_MAIN_COLOR_HEX = '#295AA3';

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

function resolveRequired(value: ColorValue, palette: ColorPaletteEntry[] | undefined): ColorValue {
  if (!value.paletteId) return value;
  const entry = palette?.find((e) => e.id === value.paletteId);
  if (!entry) return { hex: value.hex, model: value.model };
  return { hex: entry.value.hex, model: entry.value.model };
}

export function applyPaletteToResolvedConfig(
  resolved: ResolvedConfig,
  palette: ColorPaletteEntry[] | undefined,
): ResolvedConfig {
  if (!palette || palette.length === 0) return resolved;
  return {
    ...resolved,
    bodyText: {
      ...resolved.bodyText,
      color: resolveRequired(resolved.bodyText.color, palette),
      boldColor: resolved.bodyText.boldColor ? resolveRequired(resolved.bodyText.boldColor, palette) : undefined,
      italicColor: resolved.bodyText.italicColor ? resolveRequired(resolved.bodyText.italicColor, palette) : undefined,
    },
    headings: {
      ...resolved.headings,
      color: resolveRequired(resolved.headings.color, palette),
      levels: resolved.headings.levels.map((l) => ({ ...l, color: resolveRequired(l.color, palette) })),
    },
    unorderedLists: {
      ...resolved.unorderedLists,
      color: resolveRequired(resolved.unorderedLists.color, palette),
      taskCompletedColor: resolved.unorderedLists.taskCompletedColor
        ? resolveRequired(resolved.unorderedLists.taskCompletedColor, palette)
        : undefined,
      levels: resolved.unorderedLists.levels.map((l) => ({ ...l, color: resolveRequired(l.color, palette) })),
    },
    orderedLists: {
      ...resolved.orderedLists,
      color: resolveRequired(resolved.orderedLists.color, palette),
      separatorColor: resolveRequired(resolved.orderedLists.separatorColor, palette),
      levels: resolved.orderedLists.levels.map((l) => ({
        ...l,
        color: resolveRequired(l.color, palette),
        separatorColor: resolveRequired(l.separatorColor, palette),
      })),
    },
    tableStyle: {
      ...resolved.tableStyle,
      bodyColor: resolveRequired(resolved.tableStyle.bodyColor, palette),
      headerColor: resolveRequired(resolved.tableStyle.headerColor, palette),
      headerBackground: resolveRequired(resolved.tableStyle.headerBackground, palette),
      bodyBackground: resolveRequired(resolved.tableStyle.bodyBackground, palette),
      borderColor: resolveRequired(resolved.tableStyle.borderColor, palette),
    },
    captionStyle: {
      ...resolved.captionStyle,
      color: resolveRequired(resolved.captionStyle.color, palette),
      labelColor: resolveRequired(resolved.captionStyle.labelColor, palette),
      background: resolveRequired(resolved.captionStyle.background, palette),
      note: {
        ...resolved.captionStyle.note,
        color: resolveRequired(resolved.captionStyle.note.color, palette),
      },
    },
    diagramStyle: {
      ...resolved.diagramStyle,
      inkColor: resolveRequired(resolved.diagramStyle.inkColor, palette),
    },
    paragraphStyles: resolved.paragraphStyles.map((s) => ({ ...s, color: resolveRequired(s.color, palette) })),
    calloutStyles: resolved.calloutStyles.map((s) => ({
      ...s,
      background: resolveRequired(s.background, palette),
      border: { ...s.border, color: resolveRequired(s.border.color, palette) },
      stripe: { ...s.stripe, color: resolveRequired(s.stripe.color, palette) },
      icon: { ...s.icon, color: resolveRequired(s.icon.color, palette) },
      titleStyle: { ...s.titleStyle, color: resolveRequired(s.titleStyle.color, palette) },
      body: { ...s.body, color: resolveRequired(s.body.color, palette) },
      lists: { ...s.lists, color: resolveRequired(s.lists.color, palette) },
    })),
    parts: {
      ...resolved.parts,
      bodyStyle: {
        ...resolved.parts.bodyStyle,
        color: resolveRequired(resolved.parts.bodyStyle.color, palette),
        bulletColor: resolveRequired(resolved.parts.bodyStyle.bulletColor, palette),
        numberColor: resolveRequired(resolved.parts.bodyStyle.numberColor, palette),
        ...applyPaletteToPartListOverrides(resolved.parts.bodyStyle, palette),
      },
    },
  };
}

/** Resolve palette references inside a (partial) unordered lists config. */
function applyPaletteToUnorderedLists(
  lists: UnorderedListsConfig,
  palette: ColorPaletteEntry[] | undefined,
): UnorderedListsConfig {
  return {
    ...lists,
    color: resolveColor(lists.color, palette),
    taskCompletedColor: resolveColor(lists.taskCompletedColor, palette),
    levels: lists.levels?.map((l) => ({ ...l, color: resolveColor(l.color, palette) })),
  };
}

/** Resolve palette references inside a (partial) ordered lists config. */
function applyPaletteToOrderedLists(
  lists: OrderedListsConfig,
  palette: ColorPaletteEntry[] | undefined,
): OrderedListsConfig {
  return {
    ...lists,
    color: resolveColor(lists.color, palette),
    separatorColor: resolveColor(lists.separatorColor, palette),
    levels: lists.levels?.map((l) => ({
      ...l,
      color: resolveColor(l.color, palette),
      separatorColor: resolveColor(l.separatorColor, palette),
    })),
  };
}

/** Palette pass over the list overrides of a part body style. Only the
 *  overrides present are returned, so spreading the result never adds keys. */
function applyPaletteToPartListOverrides(
  bodyStyle: PartsBodyStyleConfig,
  palette: ColorPaletteEntry[] | undefined,
): Pick<PartsBodyStyleConfig, 'unorderedLists' | 'orderedLists'> {
  const out: Pick<PartsBodyStyleConfig, 'unorderedLists' | 'orderedLists'> = {};
  if (bodyStyle.unorderedLists) out.unorderedLists = applyPaletteToUnorderedLists(bodyStyle.unorderedLists, palette);
  if (bodyStyle.orderedLists) out.orderedLists = applyPaletteToOrderedLists(bodyStyle.orderedLists, palette);
  return out;
}

/** Resolve palette references inside a (partial) caption style — used for the
 *  global `captionStyle` and for per-resource-type overrides alike. */
function applyPaletteToCaptionStyle(
  captionStyle: CaptionStyleConfig,
  palette: ColorPaletteEntry[],
): CaptionStyleConfig {
  return {
    ...captionStyle,
    color: resolveColor(captionStyle.color, palette),
    labelColor: resolveColor(captionStyle.labelColor, palette),
    background: resolveColor(captionStyle.background, palette),
    note: captionStyle.note
      ? { ...captionStyle.note, color: resolveColor(captionStyle.note.color, palette) }
      : captionStyle.note,
  };
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
    next.unorderedLists = applyPaletteToUnorderedLists(config.unorderedLists, palette);
  }

  if (config.orderedLists) {
    next.orderedLists = applyPaletteToOrderedLists(config.orderedLists, palette);
  }

  if (config.tableStyle) {
    next.tableStyle = {
      ...config.tableStyle,
      bodyColor: resolveColor(config.tableStyle.bodyColor, palette),
      headerColor: resolveColor(config.tableStyle.headerColor, palette),
      headerBackground: resolveColor(config.tableStyle.headerBackground, palette),
      bodyBackground: resolveColor(config.tableStyle.bodyBackground, palette),
      borderColor: resolveColor(config.tableStyle.borderColor, palette),
    };
  }

  if (config.captionStyle) {
    next.captionStyle = applyPaletteToCaptionStyle(config.captionStyle, palette);
  }

  if (config.resourceTypes) {
    next.resourceTypes = config.resourceTypes.map((t) =>
      t.captionStyle ? { ...t, captionStyle: applyPaletteToCaptionStyle(t.captionStyle, palette) } : t,
    );
  }

  if (config.diagramStyle) {
    next.diagramStyle = {
      ...config.diagramStyle,
      inkColor: resolveColor(config.diagramStyle.inkColor, palette),
    };
  }

  if (config.paragraphStyles) {
    next.paragraphStyles = config.paragraphStyles.map((s) => ({ ...s, color: resolveColor(s.color, palette) }));
  }

  if (config.calloutStyles) {
    next.calloutStyles = config.calloutStyles.map((s) => ({
      ...s,
      background: resolveColor(s.background, palette),
      border: s.border ? { ...s.border, color: resolveColor(s.border.color, palette) } : s.border,
      stripe: s.stripe ? { ...s.stripe, color: resolveColor(s.stripe.color, palette) } : s.stripe,
      icon: s.icon ? { ...s.icon, color: resolveColor(s.icon.color, palette) } : s.icon,
      titleStyle: s.titleStyle ? { ...s.titleStyle, color: resolveColor(s.titleStyle.color, palette) } : s.titleStyle,
      body: s.body ? { ...s.body, color: resolveColor(s.body.color, palette) } : s.body,
      lists: s.lists ? { ...s.lists, color: resolveColor(s.lists.color, palette) } : s.lists,
    }));
  }

  if (config.parts?.bodyStyle) {
    next.parts = {
      ...config.parts,
      bodyStyle: {
        ...config.parts.bodyStyle,
        color: resolveColor(config.parts.bodyStyle.color, palette),
        bulletColor: resolveColor(config.parts.bodyStyle.bulletColor, palette),
        numberColor: resolveColor(config.parts.bodyStyle.numberColor, palette),
        ...applyPaletteToPartListOverrides(config.parts.bodyStyle, palette),
      },
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
