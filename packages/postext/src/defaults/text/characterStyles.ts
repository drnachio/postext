import type {
  CharacterStyleConfig,
  CharacterStyleHighlightConfig,
  CharacterStyleLineConfig,
  ColorValue,
  Dimension,
  ResolvedCharacterStyleConfig,
  ResolvedCharacterStyleHighlight,
  ResolvedCharacterStyleLine,
} from '../../types.js';
import { colorsEqual, dimensionsEqual } from '../shared.js';
import { STRIKE_AT, STRIKE_STROKE, UNDERLINE_AT, UNDERLINE_STROKE } from '../../marks/strikeGeometry.js';

const EM = (value: number): Dimension => ({ value, unit: 'em' });

/** Static defaults of a character style's decorations. A line's colour,
 *  unset, is the run's text colour. The underline and the strike-through
 *  sit where those of `:underline[…]` and `~~…~~` sit in a face whose own
 *  metrics are not known (`marks/strikeGeometry.ts`), and are as thick. */
export const DEFAULT_CHARACTER_UNDERLINE = {
  enabled: false,
  opacity: 100,
  thickness: EM(UNDERLINE_STROKE),
  offset: EM(-UNDERLINE_AT),
  style: 'solid' as const,
  skipSpaces: false,
};
export const DEFAULT_CHARACTER_STRIKE = { ...DEFAULT_CHARACTER_UNDERLINE, thickness: EM(STRIKE_STROKE), offset: EM(STRIKE_AT) };
export const DEFAULT_CHARACTER_HIGHLIGHT = {
  enabled: false,
  color: { hex: '#ffe14d', model: 'hex' } as ColorValue,
  opacity: 70,
  bottom: EM(-0.2),
  top: EM(0.8),
  overhang: EM(0.08),
  radius: EM(0.08),
  rough: 0,
  skipSpaces: false,
};
export const DEFAULT_CHARACTER_STYLE_STATIC = {
  italic: false,
  textTransform: 'none' as const,
  smallCaps: false,
};

/** One style ships by default so `[…]|marker|` works out of the box: a
 *  yellow highlighter over the lower part of the words, its edges drawn by
 *  hand. A plain underline is `:underline[…]`, and a plain highlight
 *  `:mark[…]`: no character style repeats them. */
export const DEFAULT_CHARACTER_STYLES: CharacterStyleConfig[] = [
  { id: 'marker', name: 'Marker', highlight: { enabled: true, bottom: EM(-0.12), top: EM(0.45), rough: 30 } },
];

function resolveLine(partial: CharacterStyleLineConfig | undefined, d: typeof DEFAULT_CHARACTER_UNDERLINE): ResolvedCharacterStyleLine {
  return {
    enabled: partial?.enabled ?? d.enabled,
    ...(partial?.color ? { color: partial.color } : {}),
    opacity: clampPercent(partial?.opacity, d.opacity),
    thickness: partial?.thickness ?? d.thickness,
    offset: partial?.offset ?? d.offset,
    style: partial?.style ?? d.style,
    skipSpaces: partial?.skipSpaces ?? d.skipSpaces,
  };
}

function resolveHighlight(partial: CharacterStyleHighlightConfig | undefined): ResolvedCharacterStyleHighlight {
  const d = DEFAULT_CHARACTER_HIGHLIGHT;
  return {
    enabled: partial?.enabled ?? d.enabled,
    color: partial?.color ?? d.color,
    opacity: clampPercent(partial?.opacity, d.opacity),
    bottom: partial?.bottom ?? d.bottom,
    top: partial?.top ?? d.top,
    overhang: partial?.overhang ?? d.overhang,
    radius: partial?.radius ?? d.radius,
    rough: clampPercent(partial?.rough, d.rough),
    skipSpaces: partial?.skipSpaces ?? d.skipSpaces,
  };
}

function clampPercent(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function resolveCharacterStyleConfig(partial: CharacterStyleConfig): ResolvedCharacterStyleConfig {
  const d = DEFAULT_CHARACTER_STYLE_STATIC;
  const weight = typeof partial.fontWeight === 'number' && Number.isFinite(partial.fontWeight)
    ? Math.max(100, Math.min(900, Math.round(partial.fontWeight / 100) * 100))
    : undefined;
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    ...(partial.fontFamily ? { fontFamily: partial.fontFamily } : {}),
    ...(partial.fontSize ? { fontSize: partial.fontSize } : {}),
    ...(weight !== undefined ? { fontWeight: weight } : {}),
    italic: partial.italic ?? d.italic,
    ...(partial.color ? { color: partial.color } : {}),
    ...(partial.letterSpacing ? { letterSpacing: partial.letterSpacing } : {}),
    textTransform: partial.textTransform === 'uppercase' ? 'uppercase' : 'none',
    smallCaps: partial.smallCaps ?? d.smallCaps,
    underline: resolveLine(partial.underline, DEFAULT_CHARACTER_UNDERLINE),
    highlight: resolveHighlight(partial.highlight),
    strike: resolveLine(partial.strike, DEFAULT_CHARACTER_STRIKE),
  };
}

export function resolveCharacterStylesConfig(partial: CharacterStyleConfig[] | undefined): ResolvedCharacterStyleConfig[] {
  return (partial ?? DEFAULT_CHARACTER_STYLES).map(resolveCharacterStyleConfig);
}

/** The style a `[…]|id|` names, or `undefined` when no style has that id
 *  (the run then sets as the text around it, and `collectContentWarnings`
 *  reports it). */
export function pickCharacterStyle(
  styles: readonly ResolvedCharacterStyleConfig[],
  id: string | undefined,
): ResolvedCharacterStyleConfig | undefined {
  return id === undefined ? undefined : styles.find((s) => s.id === id);
}

function stripLine(line: CharacterStyleLineConfig | undefined, d: typeof DEFAULT_CHARACTER_UNDERLINE): CharacterStyleLineConfig | undefined {
  if (!line) return undefined;
  const r: CharacterStyleLineConfig = {};
  if (line.enabled !== undefined && line.enabled !== d.enabled) r.enabled = line.enabled;
  if (line.color !== undefined) r.color = line.color;
  if (line.opacity !== undefined && line.opacity !== d.opacity) r.opacity = line.opacity;
  if (line.thickness !== undefined && !dimensionsEqual(line.thickness, d.thickness)) r.thickness = line.thickness;
  if (line.offset !== undefined && !dimensionsEqual(line.offset, d.offset)) r.offset = line.offset;
  if (line.style !== undefined && line.style !== d.style) r.style = line.style;
  if (line.skipSpaces !== undefined && line.skipSpaces !== d.skipSpaces) r.skipSpaces = line.skipSpaces;
  return Object.keys(r).length > 0 ? r : undefined;
}

function stripHighlight(band: CharacterStyleHighlightConfig | undefined): CharacterStyleHighlightConfig | undefined {
  if (!band) return undefined;
  const d = DEFAULT_CHARACTER_HIGHLIGHT;
  const r: CharacterStyleHighlightConfig = {};
  if (band.enabled !== undefined && band.enabled !== d.enabled) r.enabled = band.enabled;
  if (band.color !== undefined && !colorsEqual(band.color, d.color)) r.color = band.color;
  if (band.opacity !== undefined && band.opacity !== d.opacity) r.opacity = band.opacity;
  if (band.bottom !== undefined && !dimensionsEqual(band.bottom, d.bottom)) r.bottom = band.bottom;
  if (band.top !== undefined && !dimensionsEqual(band.top, d.top)) r.top = band.top;
  if (band.overhang !== undefined && !dimensionsEqual(band.overhang, d.overhang)) r.overhang = band.overhang;
  if (band.radius !== undefined && !dimensionsEqual(band.radius, d.radius)) r.radius = band.radius;
  if (band.rough !== undefined && band.rough !== d.rough) r.rough = band.rough;
  if (band.skipSpaces !== undefined && band.skipSpaces !== d.skipSpaces) r.skipSpaces = band.skipSpaces;
  return Object.keys(r).length > 0 ? r : undefined;
}

/** A style with every field equal to its static default dropped (and
 *  `name` equal to `id`). */
function stripCharacterStyle(s: CharacterStyleConfig): CharacterStyleConfig {
  const d = DEFAULT_CHARACTER_STYLE_STATIC;
  const r: CharacterStyleConfig = { id: s.id };
  if (s.name !== undefined && s.name !== s.id) r.name = s.name;
  if (s.fontFamily !== undefined) r.fontFamily = s.fontFamily;
  if (s.fontSize !== undefined) r.fontSize = s.fontSize;
  if (s.fontWeight !== undefined) r.fontWeight = s.fontWeight;
  if (s.italic !== undefined && s.italic !== d.italic) r.italic = s.italic;
  if (s.color !== undefined) r.color = s.color;
  if (s.letterSpacing !== undefined) r.letterSpacing = s.letterSpacing;
  if (s.textTransform !== undefined && s.textTransform !== d.textTransform) r.textTransform = s.textTransform;
  if (s.smallCaps !== undefined && s.smallCaps !== d.smallCaps) r.smallCaps = s.smallCaps;
  const underline = stripLine(s.underline, DEFAULT_CHARACTER_UNDERLINE);
  if (underline) r.underline = underline;
  const highlight = stripHighlight(s.highlight);
  if (highlight) r.highlight = highlight;
  const strike = stripLine(s.strike, DEFAULT_CHARACTER_STRIKE);
  if (strike) r.strike = strike;
  return r;
}

/** Drop every field equal to its static default. Returns `undefined` when
 *  the list is the built-in default; an empty list stays empty (a document
 *  with no character styles). */
export function stripCharacterStylesDefaults(styles: CharacterStyleConfig[] | undefined): CharacterStyleConfig[] | undefined {
  if (!styles) return undefined;
  if (styles.length === 0) return [];
  const stripped = styles.map(stripCharacterStyle);
  const builtIn = DEFAULT_CHARACTER_STYLES.map(stripCharacterStyle);
  if (JSON.stringify(stripped) === JSON.stringify(builtIn)) return undefined;
  return stripped;
}
