// stripCalloutStylesDefaults: drops the fields that match the defaults
// (#1278: split out of calloutStyles.ts).
import { dimensionsEqual, colorsEqual } from '../../shared.js';
import type { CalloutStyleConfig, CalloutFixedConfig } from '../../../types.js';
import { isCornerRadii } from '../../../design/boxShape.js';
import { DEFAULT_CALLOUT_STYLE_STATIC, PT0 } from './statics.js';

function stripObject<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

/** Drop every field equal to its static default (and `name` equal to `id`).
 *  Inherited fields (`titleStyle.fontFamily`, `titleStyle.fontSize`,
 *  `icon.fontFamily`, `marker.fontFamily`, `body.*`, `lists.*`) and the
 *  language-dependent continuation strings are kept whenever set, since
 *  their effective default depends on other config sections. Returns
 *  `undefined` when the list is the built-in default (a single bare
 *  `note` style); an empty list stays empty. */
export function stripCalloutStylesDefaults(
  styles: CalloutStyleConfig[] | undefined,
): CalloutStyleConfig[] | undefined {
  if (!styles) return undefined;
  // An empty list is a document with no box styles, which the built-in
  // `note` would otherwise come back into (#694).
  if (styles.length === 0) return [];
  const d = DEFAULT_CALLOUT_STYLE_STATIC;
  const stripped = styles.map((s) => {
    // A style based on another (#905) keeps every field it sets: one equal
    // to the default may override what the parent sets.
    if (s.extends !== undefined) {
      return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as unknown as CalloutStyleConfig;
    }
    const r: CalloutStyleConfig = { id: s.id };
    if (s.name !== undefined && s.name !== s.id) r.name = s.name;
    if (s.title !== undefined && s.title !== d.title) r.title = s.title;
    if (s.span !== undefined && s.span !== d.span) r.span = s.span;
    if (s.columns !== undefined && s.columns !== d.columns) r.columns = s.columns;
    if (s.placement !== undefined && s.placement !== d.placement) r.placement = s.placement;
    if (s.sideAtColumnEnd !== undefined && s.sideAtColumnEnd !== d.sideAtColumnEnd) r.sideAtColumnEnd = s.sideAtColumnEnd;
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
      if (s.border.sides !== undefined) b.sides = s.border.sides;
      const kept = stripObject(b);
      if (kept) r.border = kept;
    }
    if (s.borderRadius !== undefined && (isCornerRadii(s.borderRadius) || !dimensionsEqual(s.borderRadius, d.borderRadius))) r.borderRadius = s.borderRadius;
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
      if (s.icon.position !== undefined && s.icon.position !== d.icon.position) ic.position = s.icon.position;
      if (s.icon.cornerSide !== undefined && s.icon.cornerSide !== d.icon.cornerSide) ic.cornerSide = s.icon.cornerSide;
      if (s.icon.width !== undefined) ic.width = s.icon.width;
      if (s.icon.shape !== undefined) ic.shape = s.icon.shape;
      if (s.icon.strokeWidth !== undefined) ic.strokeWidth = s.icon.strokeWidth;
      if (s.icon.tint !== undefined && s.icon.tint !== false) ic.tint = s.icon.tint;
      const kept = stripObject(ic);
      if (kept) r.icon = kept;
    }
    if (s.marker) {
      const m: CalloutStyleConfig['marker'] = {};
      const dm = d.marker;
      if (s.marker.kind !== undefined && s.marker.kind !== dm.kind) m.kind = s.marker.kind;
      if (s.marker.glyph !== undefined && s.marker.glyph !== dm.glyph) m.glyph = s.marker.glyph;
      if (s.marker.resourceId !== undefined && s.marker.resourceId !== dm.resourceId) m.resourceId = s.marker.resourceId;
      if (s.marker.fontFamily !== undefined) m.fontFamily = s.marker.fontFamily;
      if (s.marker.fontWeight !== undefined && s.marker.fontWeight !== dm.fontWeight) m.fontWeight = s.marker.fontWeight;
      if (s.marker.size !== undefined && !dimensionsEqual(s.marker.size, dm.size)) m.size = s.marker.size;
      if (s.marker.color !== undefined && !colorsEqual(s.marker.color, dm.color)) m.color = s.marker.color;
      if (s.marker.align !== undefined && s.marker.align !== dm.align) m.align = s.marker.align;
      if (s.marker.gap !== undefined && !dimensionsEqual(s.marker.gap, dm.gap)) m.gap = s.marker.gap;
      if (s.marker.shape !== undefined) m.shape = s.marker.shape;
      if (s.marker.strokeWidth !== undefined) m.strokeWidth = s.marker.strokeWidth;
      if (s.marker.tint !== undefined && s.marker.tint !== false) m.tint = s.marker.tint;
      if (s.marker.rule) {
        const ru: NonNullable<CalloutStyleConfig['marker']>['rule'] = {};
        const r0 = s.marker.rule;
        if (r0.enabled !== undefined && r0.enabled !== dm.rule.enabled) ru.enabled = r0.enabled;
        if (r0.color !== undefined && !colorsEqual(r0.color, dm.rule.color)) ru.color = r0.color;
        if (r0.width !== undefined && !dimensionsEqual(r0.width, dm.rule.width)) ru.width = r0.width;
        if (r0.length !== undefined && !dimensionsEqual(r0.length, dm.rule.length)) ru.length = r0.length;
        const keptRule = stripObject(ru);
        if (keptRule) m.rule = keptRule;
      }
      const kept = stripObject(m);
      if (kept) r.marker = kept;
    }
    if (s.titleStyle) {
      const t: CalloutStyleConfig['titleStyle'] = {};
      if (s.titleStyle.fontFamily !== undefined) t.fontFamily = s.titleStyle.fontFamily;
      if (s.titleStyle.fontSize !== undefined) t.fontSize = s.titleStyle.fontSize;
      if (s.titleStyle.fontWeight !== undefined && s.titleStyle.fontWeight !== d.titleStyle.fontWeight) t.fontWeight = s.titleStyle.fontWeight;
      if (s.titleStyle.italic !== undefined && s.titleStyle.italic !== d.titleStyle.italic) t.italic = s.titleStyle.italic;
      if (s.titleStyle.color !== undefined && !colorsEqual(s.titleStyle.color, d.titleStyle.color)) t.color = s.titleStyle.color;
      if (s.titleStyle.textTransform !== undefined && s.titleStyle.textTransform !== d.titleStyle.textTransform) t.textTransform = s.titleStyle.textTransform;
      if (s.titleStyle.letterSpacing !== undefined && !dimensionsEqual(s.titleStyle.letterSpacing, PT0)) t.letterSpacing = s.titleStyle.letterSpacing;
      if (s.titleStyle.indent !== undefined && !dimensionsEqual(s.titleStyle.indent, PT0)) t.indent = s.titleStyle.indent;
      if (s.titleStyle.gap !== undefined && !dimensionsEqual(s.titleStyle.gap, d.titleStyle.gap)) t.gap = s.titleStyle.gap;
      if (s.titleStyle.lineHeight !== undefined && !dimensionsEqual(s.titleStyle.lineHeight, d.titleStyle.lineHeight)) t.lineHeight = s.titleStyle.lineHeight;
      const kept = stripObject(t);
      if (kept) r.titleStyle = kept;
    }
    if (s.body) {
      const b: CalloutStyleConfig['body'] = {};
      if (s.body.fontFamily !== undefined) b.fontFamily = s.body.fontFamily;
      if (s.body.fontSize !== undefined) b.fontSize = s.body.fontSize;
      if (s.body.lineHeight !== undefined) b.lineHeight = s.body.lineHeight;
      if (s.body.color !== undefined) b.color = s.body.color;
      if (s.body.boldColor !== undefined) b.boldColor = s.body.boldColor;
      if (s.body.italicColor !== undefined) b.italicColor = s.body.italicColor;
      if (s.body.fontWeight !== undefined) b.fontWeight = s.body.fontWeight;
      if (s.body.boldFontWeight !== undefined) b.boldFontWeight = s.body.boldFontWeight;
      if (s.body.italic) b.italic = true;
      if (s.body.smallCaps) b.smallCaps = true;
      if (s.body.letterSpacing !== undefined && !dimensionsEqual(s.body.letterSpacing, PT0)) b.letterSpacing = s.body.letterSpacing;
      if (s.body.textAlign !== undefined) b.textAlign = s.body.textAlign;
      if (s.body.hyphenation !== undefined) b.hyphenation = s.body.hyphenation;
      if (s.body.paragraphSpacing !== undefined) b.paragraphSpacing = s.body.paragraphSpacing;
      if (s.body.firstLineIndent !== undefined) b.firstLineIndent = s.body.firstLineIndent;
      if (Array.isArray(s.body.tabStops)) b.tabStops = s.body.tabStops;
      if (s.body.tabInterval !== undefined) b.tabInterval = s.body.tabInterval;
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
      if (s.lists.bulletFontSize !== undefined) l.bulletFontSize = s.lists.bulletFontSize;
      if (s.lists.bulletFontWeight !== undefined) l.bulletFontWeight = s.lists.bulletFontWeight;
      if (s.lists.bulletFontFamily) l.bulletFontFamily = s.lists.bulletFontFamily;
      if (s.lists.marginTop !== undefined) l.marginTop = s.lists.marginTop;
      if (s.lists.marginBottom !== undefined) l.marginBottom = s.lists.marginBottom;
      const kept = stripObject(l);
      if (kept) r.lists = kept;
    }
    if (s.label) r.label = s.label;
    if (s.columnGap !== undefined && !dimensionsEqual(s.columnGap, d.columnGap)) r.columnGap = s.columnGap;
    if (s.marginTop !== undefined && !dimensionsEqual(s.marginTop, d.marginTop)) r.marginTop = s.marginTop;
    if (s.marginBottom !== undefined && !dimensionsEqual(s.marginBottom, d.marginBottom)) r.marginBottom = s.marginBottom;
    if (s.snapToGrid !== undefined && s.snapToGrid !== d.snapToGrid) r.snapToGrid = s.snapToGrid;
    if (s.keepTogether !== undefined && s.keepTogether !== d.keepTogether) r.keepTogether = s.keepTogether;
    if (s.splitMinLines !== undefined && s.splitMinLines !== d.splitMinLines) r.splitMinLines = s.splitMinLines;
    if (s.repeatTitle !== undefined && s.repeatTitle !== d.repeatTitle) r.repeatTitle = s.repeatTitle;
    // Continuation strings default per document language: kept whenever set.
    if (s.continuedSuffix !== undefined) r.continuedSuffix = s.continuedSuffix;
    if (s.continuesMarkerEnabled !== undefined && s.continuesMarkerEnabled !== d.continuesMarkerEnabled) {
      r.continuesMarkerEnabled = s.continuesMarkerEnabled;
    }
    if (s.continuesMarker !== undefined) r.continuesMarker = s.continuesMarker;
    if (s.continuesMarkerAlign !== undefined && s.continuesMarkerAlign !== d.continuesMarkerAlign) {
      r.continuesMarkerAlign = s.continuesMarkerAlign;
    }
    if (s.continuesMarkerItalic !== undefined && s.continuesMarkerItalic !== d.continuesMarkerItalic) {
      r.continuesMarkerItalic = s.continuesMarkerItalic;
    }
    if (s.numbering) r.numbering = s.numbering;
    if (s.endMark) r.endMark = s.endMark;
    // A design has no default to compare with: kept as written.
    if (s.design) r.design = s.design;
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
