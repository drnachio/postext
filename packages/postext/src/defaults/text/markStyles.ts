import type { ColorValue, Dimension, MarkDecorationBreak, MarkLineConfig, MarkLinePosition, MarkLineStyle, MarkStyleConfig, ResolvedMarkLineConfig, ResolvedMarkStyleConfig } from '../../types.js';
import { colorsEqual, dimensionsEqual } from '../shared.js';
import { clampPercent, oneOf, safeColor, safeDimension } from './safeValues.js';

const EM = (value: number): Dimension => ({ value, unit: 'em' });

/** Static defaults shared by every highlight style (#888): a pale yellow
 *  band reaching a little past the phrase, its ends square (the print norm;
 *  up to postext 1.51 they were rounded at 0.2 em, which a configuration
 *  stored then keeps through `pinLegacyMarkRadius`, #1149). The text keeps
 *  its own colour. */
export const DEFAULT_MARK_STYLE_STATIC = {
  background: { hex: '#fff0a0', model: 'hex' } as ColorValue,
  borderRadius: EM(0),
  paddingX: EM(0.15),
  paddingY: EM(0.05),
  decorationBreak: 'slice' as MarkDecorationBreak,
  backgroundEnabled: true,
  opacity: 100,
  rough: 0,
};

const BREAKS: ReadonlySet<MarkDecorationBreak> = new Set<MarkDecorationBreak>(['slice', 'clone']);
const LINE_POSITIONS: ReadonlySet<MarkLinePosition> = new Set<MarkLinePosition>(['under', 'through']);
const LINE_STYLES: ReadonlySet<MarkLineStyle> = new Set<MarkLineStyle>(['solid', 'double', 'dotted', 'dashed', 'wavy']);

/** A mark's line with its defaults filled in and its values checked. */
function resolveMarkLine(line: MarkLineConfig | undefined): ResolvedMarkLineConfig | undefined {
  if (!line || typeof line !== 'object') return undefined;
  const color = safeColor(line.color);
  const thickness = safeDimension(line.thickness);
  return {
    position: oneOf(line.position, LINE_POSITIONS, 'under'),
    style: oneOf(line.style, LINE_STYLES, 'solid'),
    ...(color ? { color } : {}),
    ...(thickness && thickness.value > 0 ? { thickness } : {}),
  };
}

/** One style ships by default so `:mark[…]` works out of the box. */
export const DEFAULT_MARK_STYLES: MarkStyleConfig[] = [{ id: 'mark', name: 'Mark' }];

function resolveMarkStyleConfig(partial: MarkStyleConfig): ResolvedMarkStyleConfig {
  const d = DEFAULT_MARK_STYLE_STATIC;
  const color = safeColor(partial.color);
  const line = resolveMarkLine(partial.line);
  const paddingTop = safeDimension(partial.paddingTop);
  const paddingBottom = safeDimension(partial.paddingBottom);
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    background: safeColor(partial.background) ?? d.background,
    ...(color ? { color } : {}),
    borderRadius: safeDimension(partial.borderRadius) ?? d.borderRadius,
    paddingX: safeDimension(partial.paddingX) ?? d.paddingX,
    paddingY: safeDimension(partial.paddingY) ?? d.paddingY,
    ...(paddingTop ? { paddingTop } : {}),
    ...(paddingBottom ? { paddingBottom } : {}),
    decorationBreak: oneOf(partial.decorationBreak, BREAKS, d.decorationBreak),
    backgroundEnabled: partial.backgroundEnabled !== false,
    opacity: clampPercent(partial.opacity, d.opacity),
    rough: clampPercent(partial.rough, d.rough),
    ...(line ? { line } : {}),
  };
}

export function resolveMarkStylesConfig(partial: MarkStyleConfig[] | undefined): ResolvedMarkStyleConfig[] {
  return (partial ?? DEFAULT_MARK_STYLES).map(resolveMarkStyleConfig);
}

/** The style a `:mark[…]{style="…"}` selects: the matching id, else the
 *  first configured style (`collectContentWarnings` reports an unknown
 *  id). */
export function pickMarkStyle(
  styles: readonly ResolvedMarkStyleConfig[],
  id: string | undefined,
): ResolvedMarkStyleConfig | undefined {
  if (id) {
    const match = styles.find((s) => s.id === id);
    if (match) return match;
  }
  return styles[0];
}

/** Drop every field equal to its static default (and `name` equal to
 *  `id`); `color`, `paddingTop` and `paddingBottom` are kept whenever set.
 *  Returns `undefined` for the built-in default (a single bare `mark`
 *  style); an empty list stays empty. */
export function stripMarkStylesDefaults(styles: MarkStyleConfig[] | undefined): MarkStyleConfig[] | undefined {
  if (!styles) return undefined;
  if (styles.length === 0) return [];
  const d = DEFAULT_MARK_STYLE_STATIC;
  const stripped = styles.map((s) => {
    const r: MarkStyleConfig = { id: s.id };
    if (s.name !== undefined && s.name !== s.id) r.name = s.name;
    if (s.background !== undefined && !colorsEqual(s.background, d.background)) r.background = s.background;
    if (s.color !== undefined) r.color = s.color;
    if (s.borderRadius !== undefined && !dimensionsEqual(s.borderRadius, d.borderRadius)) r.borderRadius = s.borderRadius;
    if (s.paddingX !== undefined && !dimensionsEqual(s.paddingX, d.paddingX)) r.paddingX = s.paddingX;
    if (s.paddingY !== undefined && !dimensionsEqual(s.paddingY, d.paddingY)) r.paddingY = s.paddingY;
    if (s.paddingTop !== undefined) r.paddingTop = s.paddingTop;
    if (s.paddingBottom !== undefined) r.paddingBottom = s.paddingBottom;
    if (s.decorationBreak !== undefined && s.decorationBreak !== d.decorationBreak) r.decorationBreak = s.decorationBreak;
    if (s.backgroundEnabled !== undefined && s.backgroundEnabled !== d.backgroundEnabled) r.backgroundEnabled = s.backgroundEnabled;
    if (s.opacity !== undefined && s.opacity !== d.opacity) r.opacity = s.opacity;
    if (s.rough !== undefined && s.rough !== d.rough) r.rough = s.rough;
    if (s.line !== undefined) r.line = s.line;
    return r;
  });
  if (stripped.length === 1) {
    const only = stripped[0]!;
    const bare = Object.keys(only).every((k) => k === 'id' || k === 'name');
    if (only.id === 'mark' && bare && (only.name === undefined || only.name === 'Mark')) return undefined;
  }
  return stripped;
}
