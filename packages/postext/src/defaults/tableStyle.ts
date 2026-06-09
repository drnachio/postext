import type {
  TableStyleConfig,
  ResolvedTableStyleConfig,
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
} satisfies Partial<ResolvedTableStyleConfig>;

/** Resolve a partial table-style config into a fully-specified one. Font
 *  family, size, and colour inherit the resolved body text when unset, so a
 *  document with no table config renders exactly as before. */
export function resolveTableStyleConfig(
  partial: TableStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedTableStyleConfig {
  const p = partial ?? {};
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

  return has ? r : undefined;
}
