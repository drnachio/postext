// Values the engine replaces: numbering formats, font stacks, the side
// column of a one-and-a-half layout, column counts and a character grid
// too large for the page (#1276: split out of configWarnings.ts).
import type { PostextConfig, ResolvedLayoutConfig } from '../../types.js';
import type { ConfigWarning, ResolvedConfig } from '../../vdt.js';
import { parseNumberFormat } from '../../numerals/numbering.js';
import { isFontStack, primaryFontFamily } from '../../measure/font.js';
import { dimensionToPx } from '../../units.js';
import { resolveAllConfig, sideColumnPercentUsed, columnCountUsed } from '../../pipeline/config.js';
import { computePageMetrics } from '../../pipeline/blocks/buildHelpers.js';
import { deriveSectionGeometryConfig } from '../../pipeline/sections/headingStyles.js';
import { cjkGridGeometry } from '../../pipeline/text/cjkGrid.js';
import { parseFootnoteNumberFormat } from '../../defaults/structure/footnotes.js';

/** The format fields and the decimal spelling each falls back to. A
 *  `format` is a format field only under `pageNumbering`. */
function numberFormatFallback(key: string, parentKey: string | undefined): string | undefined {
  if (key === 'numberFormat') return 'arabic';
  if (key === 'counterFormat') return 'decimal';
  if (key === 'format' && (parentKey === 'pageNumbering' || parentKey === 'lineNumbers')) return 'decimal';
  return undefined;
}

function isFontFamilyKey(key: string): boolean {
  return key === 'fontFamily' || key.endsWith('FontFamily');
}

/** A percentage as a warning prints it: at most two decimals. */
function percentText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The format and font-family values of `config`, walked field by field. */
export function collectValueWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  // The objects on the current path: a shared object is walked at every
  // path it sits at, a cycle only once.
  const ancestors = new Set<object>();
  const walk = (node: unknown, path: string, parentKey: string | undefined): void => {
    if (!node || typeof node !== 'object' || ancestors.has(node)) return;
    // Font binaries (`customFonts`) and other buffers hold no settings.
    if (node instanceof ArrayBuffer || ArrayBuffer.isView(node)) return;
    ancestors.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, parentKey));
      ancestors.delete(node);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === 'string') {
        const fallback = numberFormatFallback(key, parentKey);
        // Footnotes take reference symbols too (`'symbols'`, #538).
        const known = key === 'numberFormat' && parentKey === 'footnotes' ? parseFootnoteNumberFormat(value) : parseNumberFormat(value);
        if (fallback !== undefined && known === undefined) {
          out.push({ kind: 'unknownNumberFormat', path: at, value, used: fallback });
        } else if (isFontFamilyKey(key) && isFontStack(value)) {
          out.push({ kind: 'fontFamilyStack', path: at, value, used: primaryFontFamily(value) });
        }
        continue;
      }
      walk(value, at, key);
    }
    ancestors.delete(node);
  };
  walk(config, '', undefined);
  return out;
}

/** The side columns of the one-and-a-half layouts, measured on the page the
 *  layout is cut on (a heading style's margins included). A layout of
 *  another type never reads the value and is not reported. */
export function collectSideColumnWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const resolved = resolveAllConfig(config);
  const check = (geometry: ResolvedConfig, layout: ResolvedLayoutConfig, path: string): void => {
    if (layout.layoutType !== 'oneAndHalf') return;
    const contentWidth = computePageMetrics(geometry).contentArea.width;
    const gutter = dimensionToPx(layout.gutterWidth, geometry.page.dpi);
    const used = sideColumnPercentUsed(layout.sideColumnPercent, contentWidth, gutter);
    if (used === Number(layout.sideColumnPercent)) return;
    out.push({ kind: 'sideColumnPercentClamped', path, value: String(layout.sideColumnPercent), used: percentText(used) });
  };
  check(resolved, resolved.layout, 'layout.sideColumnPercent');
  resolved.headingStyles.forEach((style, i) => {
    if (style.layout) check(deriveSectionGeometryConfig(resolved, style), style.layout, `headingStyles[${i}].layout.sideColumnPercent`);
  });
  return out;
}

/** The column counts of the `multiple` layouts (the document's and each
 *  heading style's own) that are not a whole number from 3 to 8. A layout
 *  of another type never reads the value and is not reported. */
export function collectColumnCountWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const check = (layout: { layoutType?: string; columnCount?: number } | undefined, path: string): void => {
    if (layout?.layoutType !== 'multiple' || layout.columnCount === undefined) return;
    const used = columnCountUsed(layout.columnCount);
    if (used === layout.columnCount) return;
    out.push({ kind: 'columnCountClamped', path, value: String(layout.columnCount), used: String(used) });
  };
  check(config.layout, 'layout.columnCount');
  // A heading style's own `multiple` layout (its count is the document's
  // when it sets none, reported there).
  (config.headingStyles ?? []).forEach((style, i) => {
    if (style.layout?.columnCount === undefined) return;
    check(style.layout, `headingStyles[${i}].layout.columnCount`);
  });
  return out;
}

/** A character grid (`cjk.grid`) with more characters per line or lines
 *  per page than the page's margins leave room for: the grid is reduced to
 *  what fits (`cjkGridClamped`, `used` the number set). */
export function collectCjkGridWarnings(config: PostextConfig): ConfigWarning[] {
  const g = cjkGridGeometry(config);
  if (!g) return [];
  const out: ConfigWarning[] = [];
  if (g.clamped.charsPerLine !== undefined) out.push({ kind: 'cjkGridClamped', path: 'cjk.grid.charsPerLine', value: String(g.clamped.charsPerLine), used: String(g.charsPerLine) });
  if (g.clamped.linesPerPage !== undefined) out.push({ kind: 'cjkGridClamped', path: 'cjk.grid.linesPerPage', value: String(g.clamped.linesPerPage), used: String(g.linesPerPage) });
  return out;
}
