import type {
  TableStyleConfig,
  ResolvedTableStyleConfig,
  NamedTableStyleConfig,
  ResolvedNamedTableStyleConfig,
  ResolvedBodyTextConfig,
  ColorValue,
} from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

/** Default header fill — a neutral light grey. */
const DEFAULT_HEADER_BACKGROUND: ColorValue = { hex: '#f0f0f0', model: 'hex' };
/** Default body fill — white (only painted when explicitly enabled). */
const DEFAULT_BODY_BACKGROUND: ColorValue = { hex: '#ffffff', model: 'hex' };

/** Static defaults independent of the body text (fonts/colours inherit body
 *  text and are filled in {@link resolveTableStyleConfig}). */
const STATIC_DEFAULTS = {
  headerBold: true,
  headerItalic: false,
  headerBackgroundEnabled: true,
  headerBackground: DEFAULT_HEADER_BACKGROUND,
  bodyBackgroundEnabled: false,
  bodyBackground: DEFAULT_BODY_BACKGROUND,
  borders: true,
  // 0.75pt ≈ 1px at 96dpi, and scales with the page dpi (preserving the
  // previous `Math.max(1, round(dpi/96))` behaviour).
  borderWidth: { value: 0.75, unit: 'pt' as const },
  // 0.375em ≈ 0.25 × the 1.5em line height — matches the previous padding.
  cellPadding: { value: 0.375, unit: 'em' as const },
  rules: 'grid' as const,
  borderRadius: { value: 0, unit: 'pt' as const },
  overflow: 'split' as const,
  continuesMarkerEnabled: true,
} satisfies Partial<ResolvedTableStyleConfig>;

/** Localised continuation strings: the caption suffix of a continued slice
 *  and the marker under a slice that continues. English is the fallback for
 *  any locale not listed here. Add a language by adding a key. */
const CONTINUATION_STRINGS: Record<string, { continuedSuffix: string; continuesMarker: string }> = {
  en: { continuedSuffix: '(cont.)', continuesMarker: 'Continued' },
  es: { continuedSuffix: '(cont.)', continuesMarker: 'Continúa' },
};

/** Default continuation strings for a (possibly regional) locale tag such
 *  as `es-ES`, falling back to English. */
export function defaultTableContinuationStrings(locale = 'en'): { continuedSuffix: string; continuesMarker: string } {
  const lang = locale.toLowerCase().split('-')[0] ?? 'en';
  return CONTINUATION_STRINGS[lang] ?? CONTINUATION_STRINGS.en!;
}

/** Resolve a partial table-style config into a fully-specified one. Font
 *  family, size, and colour inherit the resolved body text when unset, so a
 *  document with no table config renders exactly as before. */
export function resolveTableStyleConfig(
  partial: TableStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
  locale?: string,
): ResolvedTableStyleConfig {
  const p = partial ?? {};
  // Continuation strings follow the document language: the explicit
  // `locale`, else the hyphenation locale (which the sandbox derives from
  // the app language when unset).
  const strings = defaultTableContinuationStrings(locale ?? bodyText.hyphenation.locale);
  return {
    bodyFontFamily: p.bodyFontFamily ?? bodyText.fontFamily,
    bodyFontSize: p.bodyFontSize ?? bodyText.fontSize,
    bodyColor: p.bodyColor ?? bodyText.color,
    headerFontFamily: p.headerFontFamily ?? bodyText.fontFamily,
    headerFontSize: p.headerFontSize ?? bodyText.fontSize,
    headerColor: p.headerColor ?? bodyText.color,
    headerBold: p.headerBold ?? STATIC_DEFAULTS.headerBold,
    headerItalic: p.headerItalic ?? STATIC_DEFAULTS.headerItalic,
    headerBackgroundEnabled: p.headerBackgroundEnabled ?? STATIC_DEFAULTS.headerBackgroundEnabled,
    headerBackground: p.headerBackground ?? STATIC_DEFAULTS.headerBackground,
    bodyBackgroundEnabled: p.bodyBackgroundEnabled ?? STATIC_DEFAULTS.bodyBackgroundEnabled,
    bodyBackground: p.bodyBackground ?? STATIC_DEFAULTS.bodyBackground,
    borders: p.borders ?? STATIC_DEFAULTS.borders,
    borderColor: p.borderColor ?? bodyText.color,
    borderWidth: p.borderWidth ?? STATIC_DEFAULTS.borderWidth,
    cellPadding: p.cellPadding ?? STATIC_DEFAULTS.cellPadding,
    rules: p.rules ?? STATIC_DEFAULTS.rules,
    borderRadius: p.borderRadius ?? STATIC_DEFAULTS.borderRadius,
    overflow: p.overflow ?? STATIC_DEFAULTS.overflow,
    continuedSuffix: p.continuedSuffix ?? strings.continuedSuffix,
    continuesMarkerEnabled: p.continuesMarkerEnabled ?? STATIC_DEFAULTS.continuesMarkerEnabled,
    continuesMarker: p.continuesMarker ?? strings.continuesMarker,
  };
}

/** Drop fields equal to their static default. Font/colour fields inherit the
 *  body text (no static default to compare against), so they are kept whenever
 *  explicitly set — that is the intended override. Returns `undefined` when
 *  nothing remains. */
export function stripTableStyleDefaults(
  tableStyle: TableStyleConfig | undefined,
): TableStyleConfig | undefined {
  if (!tableStyle) return undefined;
  const r: TableStyleConfig = {};
  let has = false;
  const keep = <K extends keyof TableStyleConfig>(k: K) => {
    if (tableStyle[k] !== undefined) {
      r[k] = tableStyle[k];
      has = true;
    }
  };

  // Inherited (body-text) fields: keep when present.
  keep('bodyFontFamily');
  keep('bodyColor');
  keep('headerFontFamily');
  keep('headerColor');
  keep('borderColor');
  // Continuation strings default per document locale: keep whenever set.
  keep('continuedSuffix');
  keep('continuesMarker');
  if (tableStyle.bodyFontSize !== undefined) { r.bodyFontSize = tableStyle.bodyFontSize; has = true; }
  if (tableStyle.headerFontSize !== undefined) { r.headerFontSize = tableStyle.headerFontSize; has = true; }

  // Statically-defaulted fields: keep only when different from the default.
  if (tableStyle.headerBold !== undefined && tableStyle.headerBold !== STATIC_DEFAULTS.headerBold) { r.headerBold = tableStyle.headerBold; has = true; }
  if (tableStyle.headerItalic !== undefined && tableStyle.headerItalic !== STATIC_DEFAULTS.headerItalic) { r.headerItalic = tableStyle.headerItalic; has = true; }
  if (tableStyle.headerBackgroundEnabled !== undefined && tableStyle.headerBackgroundEnabled !== STATIC_DEFAULTS.headerBackgroundEnabled) { r.headerBackgroundEnabled = tableStyle.headerBackgroundEnabled; has = true; }
  if (tableStyle.headerBackground !== undefined && !colorsEqual(tableStyle.headerBackground, STATIC_DEFAULTS.headerBackground)) { r.headerBackground = tableStyle.headerBackground; has = true; }
  if (tableStyle.bodyBackgroundEnabled !== undefined && tableStyle.bodyBackgroundEnabled !== STATIC_DEFAULTS.bodyBackgroundEnabled) { r.bodyBackgroundEnabled = tableStyle.bodyBackgroundEnabled; has = true; }
  if (tableStyle.bodyBackground !== undefined && !colorsEqual(tableStyle.bodyBackground, STATIC_DEFAULTS.bodyBackground)) { r.bodyBackground = tableStyle.bodyBackground; has = true; }
  if (tableStyle.borders !== undefined && tableStyle.borders !== STATIC_DEFAULTS.borders) { r.borders = tableStyle.borders; has = true; }
  if (tableStyle.borderWidth !== undefined && !dimensionsEqual(tableStyle.borderWidth, STATIC_DEFAULTS.borderWidth)) { r.borderWidth = tableStyle.borderWidth; has = true; }
  if (tableStyle.cellPadding !== undefined && !dimensionsEqual(tableStyle.cellPadding, STATIC_DEFAULTS.cellPadding)) { r.cellPadding = tableStyle.cellPadding; has = true; }
  if (tableStyle.rules !== undefined && tableStyle.rules !== STATIC_DEFAULTS.rules) { r.rules = tableStyle.rules; has = true; }
  if (tableStyle.borderRadius !== undefined && tableStyle.borderRadius.value !== 0) { r.borderRadius = tableStyle.borderRadius; has = true; }
  if (tableStyle.overflow !== undefined && tableStyle.overflow !== STATIC_DEFAULTS.overflow) { r.overflow = tableStyle.overflow; has = true; }
  if (tableStyle.continuesMarkerEnabled !== undefined && tableStyle.continuesMarkerEnabled !== STATIC_DEFAULTS.continuesMarkerEnabled) { r.continuesMarkerEnabled = tableStyle.continuesMarkerEnabled; has = true; }

  return has ? r : undefined;
}

/** The fields of a partial style that are actually set (an explicit
 *  `undefined` must not mask the value it would inherit). */
function definedFields(style: TableStyleConfig): TableStyleConfig {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
  return out as TableStyleConfig;
}

/** Resolve the named table styles: each one is laid over the document's
 *  `tableStyle` partial and resolved like it, so an unset field reads the
 *  global table style first and the body text after that. */
export function resolveTableStylesConfig(
  styles: NamedTableStyleConfig[] | undefined,
  base: TableStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
  locale?: string,
): ResolvedNamedTableStyleConfig[] {
  return (styles ?? []).map(({ id, name, ...fields }) => ({
    id,
    name: name ?? id,
    ...resolveTableStyleConfig({ ...definedFields(base ?? {}), ...definedFields(fields) }, bodyText, locale),
  }));
}

/** Drop unset fields and a `name` equal to the `id`. Unlike
 *  {@link stripTableStyleDefaults}, a field equal to its static default is
 *  kept: a named style inherits the global `tableStyle`, so `borders: true`
 *  still matters when the global style turns borders off. Returns
 *  `undefined` when no styles remain. */
export function stripTableStylesDefaults(
  styles: NamedTableStyleConfig[] | undefined,
): NamedTableStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map(({ id, name, ...fields }) => ({
    id,
    ...(name !== undefined && name !== id ? { name } : {}),
    ...definedFields(fields),
  }));
}

/** The resolved style a table resource is set in: the named style its
 *  `table.styleId` selects, else the document's `tableStyle`. */
export function pickTableStyle(
  resolved: { tableStyle: ResolvedTableStyleConfig; tableStyles?: readonly ResolvedNamedTableStyleConfig[] },
  styleId: string | undefined,
): ResolvedTableStyleConfig {
  if (!styleId) return resolved.tableStyle;
  return resolved.tableStyles?.find((s) => s.id === styleId) ?? resolved.tableStyle;
}
