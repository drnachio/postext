import type {
  CalloutFixedConfig,
  CalloutStyleConfig,
  ColorValue,
  Dimension,
  ElementAnchor,
  ResolvedBodyTextConfig,
  ResolvedCalloutStyleConfig,
  ResolvedHeadingsConfig,
  ResolvedUnorderedListsConfig,
} from '../types';
import { colorsEqual, dimensionsEqual, DEFAULT_MAIN_COLOR } from './shared';

const EM = (value: number): Dimension => ({ value, unit: 'em' });
const PT0: Dimension = { value: 0, unit: 'pt' };

/** Static defaults shared by every callout style. Fields that inherit from
 *  another config section (`titleStyle.fontFamily`, `body.*`, `lists.*`)
 *  are resolved at resolve time and have no static default. */
export const DEFAULT_CALLOUT_STYLE_STATIC = {
  title: '',
  span: 'column' as const,
  placement: 'here' as const,
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
  },
  titleStyle: {
    fontWeight: 700,
    italic: false,
    color: { ...DEFAULT_MAIN_COLOR } as ColorValue,
    textTransform: 'none' as const,
    gap: EM(0.5),
  },
  marginTop: EM(0.75),
  marginBottom: EM(0.75),
  keepTogether: true,
};

/** One neutral style ships by default so `:::callout` works out of the box:
 *  light grey background, no stripe, no icon, no title. */
export const DEFAULT_CALLOUT_STYLES: CalloutStyleConfig[] = [{ id: 'note', name: 'Note' }];

function resolveCalloutStyleConfig(
  partial: CalloutStyleConfig,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
): ResolvedCalloutStyleConfig {
  const d = DEFAULT_CALLOUT_STYLE_STATIC;
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    title: partial.title ?? d.title,
    span: partial.span ?? d.span,
    placement: partial.placement ?? d.placement,
    fixed: {
      anchor: partial.fixed?.anchor ?? d.fixed.anchor,
      offset: {
        x: partial.fixed?.offset?.x ?? d.fixed.offset.x,
        y: partial.fixed?.offset?.y ?? d.fixed.offset.y,
      },
    },
    floatBarrier: partial.floatBarrier ?? d.floatBarrier,
    width: partial.width ?? d.width,
    backgroundEnabled: partial.backgroundEnabled ?? d.backgroundEnabled,
    background: partial.background ?? d.background,
    border: {
      enabled: partial.border?.enabled ?? d.border.enabled,
      color: partial.border?.color ?? d.border.color,
      width: partial.border?.width ?? d.border.width,
    },
    borderRadius: partial.borderRadius ?? d.borderRadius,
    padding: {
      top: partial.padding?.top ?? d.padding.top,
      right: partial.padding?.right ?? d.padding.right,
      bottom: partial.padding?.bottom ?? d.padding.bottom,
      left: partial.padding?.left ?? d.padding.left,
    },
    stripe: {
      enabled: partial.stripe?.enabled ?? d.stripe.enabled,
      side: partial.stripe?.side ?? d.stripe.side,
      width: partial.stripe?.width ?? d.stripe.width,
      color: partial.stripe?.color ?? d.stripe.color,
    },
    icon: {
      kind: partial.icon?.kind ?? d.icon.kind,
      glyph: partial.icon?.glyph ?? d.icon.glyph,
      resourceId: partial.icon?.resourceId ?? d.icon.resourceId,
      fontFamily: partial.icon?.fontFamily ?? headings.fontFamily,
      fontWeight: partial.icon?.fontWeight ?? d.icon.fontWeight,
      size: partial.icon?.size ?? d.icon.size,
      color: partial.icon?.color ?? d.icon.color,
      align: partial.icon?.align ?? d.icon.align,
    },
    titleStyle: {
      fontFamily: partial.titleStyle?.fontFamily ?? headings.fontFamily,
      fontSize: partial.titleStyle?.fontSize ?? bodyText.fontSize,
      fontWeight: partial.titleStyle?.fontWeight ?? d.titleStyle.fontWeight,
      italic: partial.titleStyle?.italic ?? d.titleStyle.italic,
      color: partial.titleStyle?.color ?? d.titleStyle.color,
      textTransform: partial.titleStyle?.textTransform ?? d.titleStyle.textTransform,
      gap: partial.titleStyle?.gap ?? d.titleStyle.gap,
    },
    body: {
      fontFamily: partial.body?.fontFamily ?? bodyText.fontFamily,
      fontSize: partial.body?.fontSize ?? bodyText.fontSize,
      lineHeight: partial.body?.lineHeight ?? bodyText.lineHeight,
      color: partial.body?.color ?? bodyText.color,
      textAlign: partial.body?.textAlign ?? (bodyText.textAlign === 'justify' ? 'justify' : 'left'),
      hyphenation: partial.body?.hyphenation ?? bodyText.hyphenation.enabled,
      paragraphSpacing: partial.body?.paragraphSpacing ?? bodyText.paragraphSpacing,
      firstLineIndent: partial.body?.firstLineIndent ?? bodyText.firstLineIndent,
    },
    lists: {
      bulletChar: partial.lists?.bulletChar ?? unorderedLists.bulletChar,
      color: partial.lists?.color ?? unorderedLists.color,
      indent: partial.lists?.indent ?? unorderedLists.indent,
      gap: partial.lists?.gap ?? unorderedLists.gap,
      itemSpacing: partial.lists?.itemSpacing ?? unorderedLists.itemSpacing,
    },
    marginTop: partial.marginTop ?? d.marginTop,
    marginBottom: partial.marginBottom ?? d.marginBottom,
    // v1: callouts are always kept together (never split).
    keepTogether: true,
  };
}

export function resolveCalloutStylesConfig(
  partial: CalloutStyleConfig[] | undefined,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
): ResolvedCalloutStyleConfig[] {
  return (partial ?? DEFAULT_CALLOUT_STYLES).map((s) =>
    resolveCalloutStyleConfig(s, bodyText, headings, unorderedLists),
  );
}

function stripObject<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

/** Drop every field equal to its static default (and `name` equal to `id`).
 *  Inherited fields (`titleStyle.fontFamily`, `titleStyle.fontSize`,
 *  `icon.fontFamily`, `body.*`, `lists.*`) are kept whenever set, since
 *  their effective default depends on other config sections. Returns
 *  `undefined` when the list is the built-in default (a single bare
 *  `note` style) or empty. */
export function stripCalloutStylesDefaults(
  styles: CalloutStyleConfig[] | undefined,
): CalloutStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  const d = DEFAULT_CALLOUT_STYLE_STATIC;
  const stripped = styles.map((s) => {
    const r: CalloutStyleConfig = { id: s.id };
    if (s.name !== undefined && s.name !== s.id) r.name = s.name;
    if (s.title !== undefined && s.title !== d.title) r.title = s.title;
    if (s.span !== undefined && s.span !== d.span) r.span = s.span;
    if (s.placement !== undefined && s.placement !== d.placement) r.placement = s.placement;
    if (s.fixed) {
      const f: CalloutFixedConfig = {};
      const a = s.fixed.anchor;
      if (a && (a.to !== d.fixed.anchor.to || a.edge !== d.fixed.anchor.edge)) f.anchor = a;
      if (s.fixed.offset) {
        const o: NonNullable<CalloutFixedConfig['offset']> = {};
        if (s.fixed.offset.x !== undefined && !dimensionsEqual(s.fixed.offset.x, d.fixed.offset.x)) o.x = s.fixed.offset.x;
        if (s.fixed.offset.y !== undefined && !dimensionsEqual(s.fixed.offset.y, d.fixed.offset.y)) o.y = s.fixed.offset.y;
        const kept = stripObject(o);
        if (kept) f.offset = kept;
      }
      const kept = stripObject(f);
      if (kept) r.fixed = kept;
    }
    if (s.floatBarrier !== undefined && s.floatBarrier !== d.floatBarrier) r.floatBarrier = s.floatBarrier;
    if (s.width !== undefined && s.width !== d.width) r.width = s.width;
    if (s.backgroundEnabled !== undefined && s.backgroundEnabled !== d.backgroundEnabled) {
      r.backgroundEnabled = s.backgroundEnabled;
    }
    if (s.background !== undefined && !colorsEqual(s.background, d.background)) r.background = s.background;
    if (s.border) {
      const b: CalloutStyleConfig['border'] = {};
      if (s.border.enabled !== undefined && s.border.enabled !== d.border.enabled) b.enabled = s.border.enabled;
      if (s.border.color !== undefined && !colorsEqual(s.border.color, d.border.color)) b.color = s.border.color;
      if (s.border.width !== undefined && !dimensionsEqual(s.border.width, d.border.width)) b.width = s.border.width;
      const kept = stripObject(b);
      if (kept) r.border = kept;
    }
    if (s.borderRadius !== undefined && !dimensionsEqual(s.borderRadius, d.borderRadius)) r.borderRadius = s.borderRadius;
    if (s.padding) {
      const p: CalloutStyleConfig['padding'] = {};
      if (s.padding.top !== undefined && !dimensionsEqual(s.padding.top, d.padding.top)) p.top = s.padding.top;
      if (s.padding.right !== undefined && !dimensionsEqual(s.padding.right, d.padding.right)) p.right = s.padding.right;
      if (s.padding.bottom !== undefined && !dimensionsEqual(s.padding.bottom, d.padding.bottom)) p.bottom = s.padding.bottom;
      if (s.padding.left !== undefined && !dimensionsEqual(s.padding.left, d.padding.left)) p.left = s.padding.left;
      const kept = stripObject(p);
      if (kept) r.padding = kept;
    }
    if (s.stripe) {
      const st: CalloutStyleConfig['stripe'] = {};
      if (s.stripe.enabled !== undefined && s.stripe.enabled !== d.stripe.enabled) st.enabled = s.stripe.enabled;
      if (s.stripe.side !== undefined && s.stripe.side !== d.stripe.side) st.side = s.stripe.side;
      if (s.stripe.width !== undefined && !dimensionsEqual(s.stripe.width, d.stripe.width)) st.width = s.stripe.width;
      if (s.stripe.color !== undefined && !colorsEqual(s.stripe.color, d.stripe.color)) st.color = s.stripe.color;
      const kept = stripObject(st);
      if (kept) r.stripe = kept;
    }
    if (s.icon) {
      const ic: CalloutStyleConfig['icon'] = {};
      if (s.icon.kind !== undefined && s.icon.kind !== d.icon.kind) ic.kind = s.icon.kind;
      if (s.icon.glyph !== undefined && s.icon.glyph !== d.icon.glyph) ic.glyph = s.icon.glyph;
      if (s.icon.resourceId !== undefined && s.icon.resourceId !== d.icon.resourceId) ic.resourceId = s.icon.resourceId;
      if (s.icon.fontFamily !== undefined) ic.fontFamily = s.icon.fontFamily;
      if (s.icon.fontWeight !== undefined && s.icon.fontWeight !== d.icon.fontWeight) ic.fontWeight = s.icon.fontWeight;
      if (s.icon.size !== undefined && !dimensionsEqual(s.icon.size, d.icon.size)) ic.size = s.icon.size;
      if (s.icon.color !== undefined && !colorsEqual(s.icon.color, d.icon.color)) ic.color = s.icon.color;
      if (s.icon.align !== undefined && s.icon.align !== d.icon.align) ic.align = s.icon.align;
      const kept = stripObject(ic);
      if (kept) r.icon = kept;
    }
    if (s.titleStyle) {
      const t: CalloutStyleConfig['titleStyle'] = {};
      if (s.titleStyle.fontFamily !== undefined) t.fontFamily = s.titleStyle.fontFamily;
      if (s.titleStyle.fontSize !== undefined) t.fontSize = s.titleStyle.fontSize;
      if (s.titleStyle.fontWeight !== undefined && s.titleStyle.fontWeight !== d.titleStyle.fontWeight) t.fontWeight = s.titleStyle.fontWeight;
      if (s.titleStyle.italic !== undefined && s.titleStyle.italic !== d.titleStyle.italic) t.italic = s.titleStyle.italic;
      if (s.titleStyle.color !== undefined && !colorsEqual(s.titleStyle.color, d.titleStyle.color)) t.color = s.titleStyle.color;
      if (s.titleStyle.textTransform !== undefined && s.titleStyle.textTransform !== d.titleStyle.textTransform) t.textTransform = s.titleStyle.textTransform;
      if (s.titleStyle.gap !== undefined && !dimensionsEqual(s.titleStyle.gap, d.titleStyle.gap)) t.gap = s.titleStyle.gap;
      const kept = stripObject(t);
      if (kept) r.titleStyle = kept;
    }
    if (s.body) {
      const b: CalloutStyleConfig['body'] = {};
      if (s.body.fontFamily !== undefined) b.fontFamily = s.body.fontFamily;
      if (s.body.fontSize !== undefined) b.fontSize = s.body.fontSize;
      if (s.body.lineHeight !== undefined) b.lineHeight = s.body.lineHeight;
      if (s.body.color !== undefined) b.color = s.body.color;
      if (s.body.textAlign !== undefined) b.textAlign = s.body.textAlign;
      if (s.body.hyphenation !== undefined) b.hyphenation = s.body.hyphenation;
      if (s.body.paragraphSpacing !== undefined) b.paragraphSpacing = s.body.paragraphSpacing;
      if (s.body.firstLineIndent !== undefined) b.firstLineIndent = s.body.firstLineIndent;
      const kept = stripObject(b);
      if (kept) r.body = kept;
    }
    if (s.lists) {
      const l: CalloutStyleConfig['lists'] = {};
      if (s.lists.bulletChar !== undefined) l.bulletChar = s.lists.bulletChar;
      if (s.lists.color !== undefined) l.color = s.lists.color;
      if (s.lists.indent !== undefined) l.indent = s.lists.indent;
      if (s.lists.gap !== undefined) l.gap = s.lists.gap;
      if (s.lists.itemSpacing !== undefined) l.itemSpacing = s.lists.itemSpacing;
      const kept = stripObject(l);
      if (kept) r.lists = kept;
    }
    if (s.marginTop !== undefined && !dimensionsEqual(s.marginTop, d.marginTop)) r.marginTop = s.marginTop;
    if (s.marginBottom !== undefined && !dimensionsEqual(s.marginBottom, d.marginBottom)) r.marginBottom = s.marginBottom;
    // `keepTogether` is always true in v1 — never persisted.
    return r;
  });
  // The built-in default (a single bare `note` style) needs no persisting.
  if (stripped.length === 1) {
    const only = stripped[0]!;
    const keys = Object.keys(only);
    const bare = keys.every((k) => k === 'id' || k === 'name');
    if (only.id === 'note' && bare && (only.name === undefined || only.name === 'Note')) return undefined;
  }
  return stripped;
}
