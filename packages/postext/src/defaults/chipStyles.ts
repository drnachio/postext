import type { ChipStyleConfig, ColorValue, Dimension, ResolvedChipStyleConfig } from '../types';
import { colorsEqual, dimensionsEqual, DEFAULT_MAIN_COLOR } from './shared';

const EM = (value: number): Dimension => ({ value, unit: 'em' });

/** Static defaults shared by every chip style: a pale tinted box with a
 *  hairline in the main colour, slightly rounded. The text family, size and
 *  colour inherit the surrounding text and have no static default. */
export const DEFAULT_CHIP_STYLE_STATIC = {
  backgroundEnabled: true,
  background: { hex: '#e8eef7', model: 'hex' } as ColorValue,
  borderColor: { ...DEFAULT_MAIN_COLOR } as ColorValue,
  borderWidth: { value: 0.5, unit: 'pt' } as Dimension,
  borderRadius: EM(0.3),
  paddingX: EM(0.3),
  paddingY: EM(0.1),
  bold: false,
  italic: false,
  gap: EM(0.25),
};

/** One style ships by default so `:chip[…]` works out of the box. */
export const DEFAULT_CHIP_STYLES: ChipStyleConfig[] = [{ id: 'chip', name: 'Chip' }];

function resolveChipStyleConfig(partial: ChipStyleConfig): ResolvedChipStyleConfig {
  const d = DEFAULT_CHIP_STYLE_STATIC;
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    backgroundEnabled: partial.backgroundEnabled ?? d.backgroundEnabled,
    background: partial.background ?? d.background,
    borderColor: partial.borderColor ?? d.borderColor,
    borderWidth: partial.borderWidth ?? d.borderWidth,
    borderRadius: partial.borderRadius ?? d.borderRadius,
    paddingX: partial.paddingX ?? d.paddingX,
    paddingY: partial.paddingY ?? d.paddingY,
    ...(partial.fontFamily ? { fontFamily: partial.fontFamily } : {}),
    ...(partial.fontSize ? { fontSize: partial.fontSize } : {}),
    ...(partial.color ? { color: partial.color } : {}),
    bold: partial.bold ?? d.bold,
    italic: partial.italic ?? d.italic,
    gap: partial.gap ?? d.gap,
  };
}

export function resolveChipStylesConfig(partial: ChipStyleConfig[] | undefined): ResolvedChipStyleConfig[] {
  return (partial ?? DEFAULT_CHIP_STYLES).map(resolveChipStyleConfig);
}

/** The style a `:chip[…]{style="…"}` selects: the matching id, else the
 *  first configured style (the sandbox flags unknown ids as a warning). */
export function pickChipStyle(
  styles: readonly ResolvedChipStyleConfig[],
  id: string | undefined,
): ResolvedChipStyleConfig | undefined {
  if (id) {
    const match = styles.find((s) => s.id === id);
    if (match) return match;
  }
  return styles[0];
}

/** Drop every field equal to its static default (and `name` equal to `id`).
 *  Inherited fields (`fontFamily`, `fontSize`, `color`) are kept whenever
 *  set. Returns `undefined` when the list is the built-in default (a single
 *  bare `chip` style) or empty. */
export function stripChipStylesDefaults(styles: ChipStyleConfig[] | undefined): ChipStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  const d = DEFAULT_CHIP_STYLE_STATIC;
  const stripped = styles.map((s) => {
    const r: ChipStyleConfig = { id: s.id };
    if (s.name !== undefined && s.name !== s.id) r.name = s.name;
    if (s.backgroundEnabled !== undefined && s.backgroundEnabled !== d.backgroundEnabled) r.backgroundEnabled = s.backgroundEnabled;
    if (s.background !== undefined && !colorsEqual(s.background, d.background)) r.background = s.background;
    if (s.borderColor !== undefined && !colorsEqual(s.borderColor, d.borderColor)) r.borderColor = s.borderColor;
    if (s.borderWidth !== undefined && !dimensionsEqual(s.borderWidth, d.borderWidth)) r.borderWidth = s.borderWidth;
    if (s.borderRadius !== undefined && !dimensionsEqual(s.borderRadius, d.borderRadius)) r.borderRadius = s.borderRadius;
    if (s.paddingX !== undefined && !dimensionsEqual(s.paddingX, d.paddingX)) r.paddingX = s.paddingX;
    if (s.paddingY !== undefined && !dimensionsEqual(s.paddingY, d.paddingY)) r.paddingY = s.paddingY;
    if (s.fontFamily !== undefined) r.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) r.fontSize = s.fontSize;
    if (s.color !== undefined) r.color = s.color;
    if (s.bold !== undefined && s.bold !== d.bold) r.bold = s.bold;
    if (s.italic !== undefined && s.italic !== d.italic) r.italic = s.italic;
    if (s.gap !== undefined && !dimensionsEqual(s.gap, d.gap)) r.gap = s.gap;
    return r;
  });
  // The built-in default (a single bare `chip` style) needs no persisting.
  if (stripped.length === 1) {
    const only = stripped[0]!;
    const bare = Object.keys(only).every((k) => k === 'id' || k === 'name');
    if (only.id === 'chip' && bare && (only.name === undefined || only.name === 'Chip')) return undefined;
  }
  return stripped;
}
