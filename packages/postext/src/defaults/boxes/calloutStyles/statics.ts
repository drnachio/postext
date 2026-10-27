// The static default box style, label icon helpers and the default style list
// (#1278: split out of calloutStyles.ts).
import { DEFAULT_MAIN_COLOR } from '../../shared.js';
import type { Dimension, ElementAnchor, ColorValue, CalloutStyleConfig, ResolvedCalloutStyleConfig, BorderSide, CalloutLabelIconConfig, CalloutLabelIconKind, CalloutIconShape } from '../../../types.js';

const EM = (value: number): Dimension => ({ value, unit: 'em' });
export const PT0: Dimension = { value: 0, unit: 'pt' };

/** Static defaults shared by every callout style. Fields that inherit from
 *  another config section (`titleStyle.fontFamily`, `body.*`, `lists.*`)
 *  are resolved at resolve time and have no static default. */
export const DEFAULT_CALLOUT_STYLE_STATIC = {
  title: '',
  span: 'column' as const,
  columns: 1,
  placement: 'here' as const,
  sideAtColumnEnd: 'before' as const,
  fixed: {
    anchor: { to: 'container', edge: 'bottom-left' } as ElementAnchor,
    offset: { x: PT0, y: PT0 },
  },
  floatBarrier: false,
  width: 'fill' as const,
  backgroundEnabled: true,
  background: { hex: '#f4f4f4', model: 'hex' } as ColorValue,
  border: {
    enabled: false,
    color: { hex: '#cccccc', model: 'hex' } as ColorValue,
    width: { value: 0.5, unit: 'pt' } as Dimension,
  },
  borderRadius: EM(0),
  padding: { top: EM(0.75), right: EM(0.75), bottom: EM(0.75), left: EM(0.75) },
  stripe: {
    enabled: false,
    side: 'left' as const,
    width: EM(1.5),
    color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
  },
  icon: {
    kind: 'none' as const,
    glyph: '',
    resourceId: '',
    fontWeight: 400,
    size: EM(1.5),
    color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
    align: 'top' as const,
    position: 'inline' as const,
    cornerSide: 'right' as const,
  },
  label: {
    fontWeight: 700,
    color: { hex: '#ffffff', model: 'hex' } as ColorValue,
    background: { ...DEFAULT_MAIN_COLOR } as ColorValue,
    position: 'top-right' as const,
    height: EM(1.4),
    paddingX: EM(0.6),
    offset: PT0,
    inset: PT0,
    icon: { resourceId: '', width: EM(1), gap: EM(0.3), placement: 'beside' as const, tint: false, glyph: '', scale: 1 },
    rule: { enabled: false, color: { ...DEFAULT_MAIN_COLOR } as ColorValue, width: { value: 0.5, unit: 'pt' } as Dimension },
  },
  columnGap: EM(1.5),
  marker: {
    kind: 'none' as const,
    glyph: '',
    resourceId: '',
    fontWeight: 400,
    size: EM(1.5),
    color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
    align: 'center' as const,
    gap: EM(0.5),
    rule: {
      enabled: false,
      color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
      width: { value: 0.5, unit: 'pt' } as Dimension,
      length: PT0,
    },
  },
  titleStyle: {
    fontWeight: 700,
    italic: false,
    color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
    textTransform: 'none' as const,
    gap: EM(0.5),
    lineHeight: EM(1.2),
  },
  marginTop: EM(0.75),
  marginBottom: EM(0.75),
  snapToGrid: true,
  keepTogether: true,
  splitMinLines: 2,
  repeatTitle: false,
  continuesMarkerEnabled: false,
  continuesMarkerAlign: 'right' as const,
  continuesMarkerItalic: true,
};

/** A box style's border: the whole border, and each side over it when
 *  the style sets `sides` (#1059). */
export function resolveBorder(border: CalloutStyleConfig['border']): ResolvedCalloutStyleConfig['border'] {
  const d = DEFAULT_CALLOUT_STYLE_STATIC.border;
  const enabled = border?.enabled ?? d.enabled;
  const color = border?.color ?? d.color;
  const width = border?.width ?? d.width;
  const sides = border?.sides;
  if (!sides || typeof sides !== 'object') return { enabled, color, width };
  const side = (s: BorderSide | undefined) => {
    const o = s && typeof s === 'object' ? s : undefined;
    return { enabled: o?.enabled ?? enabled, color: o?.color ?? color, width: o?.width ?? width };
  };
  return { enabled, color, width, sides: { top: side(sides.top), right: side(sides.right), bottom: side(sides.bottom), left: side(sides.left) } };
}

/** What a label tab's icon is (#1054): the `kind` it names, else a
 *  picture when it names one and a glyph when it sets only a character.
 *  Any other word reads as the default (reported, `unknownConfigValue`). */
export function labelIconKind(icon: CalloutLabelIconConfig | undefined): CalloutLabelIconKind {
  const kind = icon?.kind as unknown;
  if (kind === 'glyph' || kind === 'resource' || kind === 'shape') return kind;
  return !icon?.resourceId && typeof icon?.glyph === 'string' && icon.glyph.length > 0 ? 'glyph' : 'resource';
}

/** A picture's tint as it resolves (#1120): `true` or a colour, absent
 *  for `false` and anything else. */
export function iconTint(tint: unknown): true | ColorValue | undefined {
  if (tint === true) return true;
  return tint !== null && typeof tint === 'object' && typeof (tint as ColorValue).hex === 'string' ? tint as ColorValue : undefined;
}

/** The drawn icon's fields (#1120), present for `kind: 'shape'` only. */
export function shapeFields(icon: { kind?: unknown; shape?: unknown; strokeWidth?: Dimension } | undefined, kind: unknown): { shape?: CalloutIconShape; strokeWidth?: Dimension } {
  if (kind !== 'shape') return {};
  return { shape: icon?.shape === 'dot' ? 'dot' : 'ring', ...(icon?.strokeWidth ? { strokeWidth: icon.strokeWidth } : {}) };
}

/** The size of a label tab's glyph against the tab's words (#1054): a
 *  positive finite factor, else `1`. */
export function labelIconScale(scale: unknown): number {
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_CALLOUT_STYLE_STATIC.label.icon.scale;
}

/** One neutral style ships by default so `:::callout` works out of the box:
 *  light grey background, no stripe, no icon, no title. */
export const DEFAULT_CALLOUT_STYLES: CalloutStyleConfig[] = [{ id: 'note', name: 'Note' }];
