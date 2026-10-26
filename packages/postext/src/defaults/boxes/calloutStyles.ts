import { floatColumnCount } from '../shared.js';
import type {
  BorderSide,
  CalloutDesignConfig,
  CalloutFixedConfig,
  CalloutIconShape,
  CalloutLabelIconConfig,
  CalloutLabelIconKind,
  CalloutNumberingConfig,
  CalloutStyleConfig,
  ColorValue,
  Dimension,
  ElementAnchor,
  ResolvedBodyTextConfig,
  ResolvedCalloutDesignConfig,
  ResolvedCalloutNumberingConfig,
  ResolvedCalloutStyleConfig,
  ResolvedHeadingsConfig,
  ResolvedUnorderedListsConfig,
} from '../../types.js';
import { colorsEqual, dimensionsEqual, DEFAULT_MAIN_COLOR } from '../shared.js';
import { defaultTableContinuationStrings } from '../resources/tableStyle.js';
import { presentTag } from '../../hyphenation/locale.js';
import { resolveDesignSlot } from '../structure/headerFooter.js';
import { isCornerRadii } from '../../design/boxShape.js';

const EM = (value: number): Dimension => ({ value, unit: 'em' });
const PT0: Dimension = { value: 0, unit: 'pt' };

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
function resolveBorder(border: CalloutStyleConfig['border']): ResolvedCalloutStyleConfig['border'] {
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
function shapeFields(icon: { kind?: unknown; shape?: unknown; strokeWidth?: Dimension } | undefined, kind: unknown): { shape?: CalloutIconShape; strokeWidth?: Dimension } {
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

function resolveCalloutStyleConfig(
  partial: CalloutStyleConfig,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  locale: string | undefined,
): ResolvedCalloutStyleConfig {
  const d = DEFAULT_CALLOUT_STYLE_STATIC;
  // Continuation strings follow the document language, as a table's do
  // (a blank `locale` is unset).
  const strings = defaultTableContinuationStrings(presentTag(locale) ?? bodyText.hyphenation.tag ?? bodyText.hyphenation.locale);
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    title: partial.title ?? d.title,
    span: partial.span ?? d.span,
    columns: floatColumnCount(partial.columns),
    placement: partial.placement ?? d.placement,
    // Any other value reads as the default.
    sideAtColumnEnd: partial.sideAtColumnEnd === 'after' ? 'after' : d.sideAtColumnEnd,
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
    border: resolveBorder(partial.border),
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
      position: partial.icon?.position ?? d.icon.position,
      cornerSide: partial.icon?.cornerSide ?? d.icon.cornerSide,
      ...(partial.icon?.width ? { width: partial.icon.width } : {}),
      ...shapeFields(partial.icon, partial.icon?.kind ?? d.icon.kind),
      ...(iconTint(partial.icon?.tint) ? { tint: iconTint(partial.icon?.tint)! } : {}),
    },
    ...(partial.label
      ? {
          label: {
            fontFamily: partial.label.fontFamily ?? headings.fontFamily,
            fontSize: partial.label.fontSize ?? bodyText.fontSize,
            fontWeight: partial.label.fontWeight ?? d.label.fontWeight,
            color: partial.label.color ?? d.label.color,
            background: partial.label.background ?? d.label.background,
            position: partial.label.position ?? d.label.position,
            height: partial.label.height ?? d.label.height,
            paddingX: partial.label.paddingX ?? d.label.paddingX,
            offset: partial.label.offset ?? d.label.offset,
            inset: partial.label.inset ?? d.label.inset,
            icon: {
              kind: labelIconKind(partial.label.icon),
              resourceId: partial.label.icon?.resourceId ?? d.label.icon.resourceId,
              width: partial.label.icon?.width ?? d.label.icon.width,
              gap: partial.label.icon?.gap ?? d.label.icon.gap,
              placement: partial.label.icon?.placement === 'inside' ? 'inside' : d.label.icon.placement,
              tint: iconTint(partial.label.icon?.tint) ?? d.label.icon.tint,
              ...shapeFields(partial.label.icon, labelIconKind(partial.label.icon)),
              // The glyph (#1054): in the label's face and weight unless
              // set, its colour the label's when the tab is laid out.
              glyph: typeof partial.label.icon?.glyph === 'string' ? partial.label.icon.glyph : d.label.icon.glyph,
              fontFamily: partial.label.icon?.fontFamily ?? partial.label.fontFamily ?? headings.fontFamily,
              fontWeight: partial.label.icon?.fontWeight ?? partial.label.fontWeight ?? d.label.fontWeight,
              scale: labelIconScale(partial.label.icon?.scale),
              ...(partial.label.icon?.color ? { color: partial.label.icon.color } : {}),
            },
            rule: {
              enabled: partial.label.rule?.enabled ?? d.label.rule.enabled,
              color: partial.label.rule?.color ?? d.label.rule.color,
              width: partial.label.rule?.width ?? d.label.rule.width,
            },
            joined: partial.label.joined === true,
            ...(partial.label.fillet ? { fillet: partial.label.fillet } : {}),
            ...(partial.label.borderRadius !== undefined ? { borderRadius: partial.label.borderRadius } : {}),
            ...(partial.label.ownBackground === true ? { ownBackground: true as const } : {}),
          },
        }
      : {}),
    columnGap: partial.columnGap ?? d.columnGap,
    marker: {
      kind: partial.marker?.kind ?? d.marker.kind,
      glyph: partial.marker?.glyph ?? d.marker.glyph,
      resourceId: partial.marker?.resourceId ?? d.marker.resourceId,
      fontFamily: partial.marker?.fontFamily ?? headings.fontFamily,
      fontWeight: partial.marker?.fontWeight ?? d.marker.fontWeight,
      size: partial.marker?.size ?? d.marker.size,
      color: partial.marker?.color ?? d.marker.color,
      align: partial.marker?.align ?? d.marker.align,
      gap: partial.marker?.gap ?? d.marker.gap,
      rule: {
        enabled: partial.marker?.rule?.enabled ?? d.marker.rule.enabled,
        color: partial.marker?.rule?.color ?? d.marker.rule.color,
        width: partial.marker?.rule?.width ?? d.marker.rule.width,
        length: partial.marker?.rule?.length ?? d.marker.rule.length,
      },
      ...shapeFields(partial.marker, partial.marker?.kind ?? d.marker.kind),
      ...(iconTint(partial.marker?.tint) ? { tint: iconTint(partial.marker?.tint)! } : {}),
    },
    titleStyle: {
      fontFamily: partial.titleStyle?.fontFamily ?? headings.fontFamily,
      fontSize: partial.titleStyle?.fontSize ?? bodyText.fontSize,
      fontWeight: partial.titleStyle?.fontWeight ?? d.titleStyle.fontWeight,
      italic: partial.titleStyle?.italic ?? d.titleStyle.italic,
      color: partial.titleStyle?.color ?? d.titleStyle.color,
      textTransform: partial.titleStyle?.textTransform ?? d.titleStyle.textTransform,
      gap: partial.titleStyle?.gap ?? d.titleStyle.gap,
      letterSpacing: partial.titleStyle?.letterSpacing ?? PT0,
      indent: partial.titleStyle?.indent ?? PT0,
      lineHeight: partial.titleStyle?.lineHeight ?? d.titleStyle.lineHeight,
    },
    body: {
      fontFamily: partial.body?.fontFamily ?? bodyText.fontFamily,
      fontSize: partial.body?.fontSize ?? bodyText.fontSize,
      lineHeight: partial.body?.lineHeight ?? bodyText.lineHeight,
      color: partial.body?.color ?? bodyText.color,
      ...(partial.body?.boldColor ?? bodyText.boldColor ? { boldColor: partial.body?.boldColor ?? bodyText.boldColor } : {}),
      ...(partial.body?.italicColor ? { italicColor: partial.body.italicColor } : {}),
      fontWeight: partial.body?.fontWeight ?? bodyText.fontWeight,
      boldFontWeight: partial.body?.boldFontWeight ?? bodyText.boldFontWeight,
      italic: partial.body?.italic ?? false,
      smallCaps: partial.body?.smallCaps ?? false,
      // Absent unless set to something other than zero (#974).
      ...(partial.body?.letterSpacing && partial.body.letterSpacing.value !== 0 ? { letterSpacing: partial.body.letterSpacing } : {}),
      textAlign: partial.body?.textAlign === 'start' ? 'left' : partial.body?.textAlign ?? (bodyText.textAlign === 'justify' ? 'justify' : 'left'),
      hyphenation: partial.body?.hyphenation ?? bodyText.hyphenation.enabled,
      paragraphSpacing: partial.body?.paragraphSpacing ?? bodyText.paragraphSpacing,
      firstLineIndent: partial.body?.firstLineIndent ?? bodyText.firstLineIndent,
      // Absent unless set: the box takes the body's tab stops (#622).
      ...(Array.isArray(partial.body?.tabStops) ? { tabStops: partial.body.tabStops } : {}),
      ...(partial.body?.tabInterval ? { tabInterval: partial.body.tabInterval } : {}),
    },
    lists: {
      bulletChar: partial.lists?.bulletChar ?? unorderedLists.bulletChar,
      color: partial.lists?.color ?? unorderedLists.color,
      indent: partial.lists?.indent ?? unorderedLists.indent,
      gap: partial.lists?.gap ?? unorderedLists.gap,
      itemSpacing: partial.lists?.itemSpacing ?? unorderedLists.itemSpacing,
      ...(partial.lists?.bulletFontSize ? { bulletFontSize: partial.lists.bulletFontSize } : {}),
      ...(partial.lists?.bulletFontWeight !== undefined ? { bulletFontWeight: partial.lists.bulletFontWeight } : {}),
      ...(partial.lists?.bulletFontFamily ? { bulletFontFamily: partial.lists.bulletFontFamily } : {}),
      ...(partial.lists?.marginTop ? { marginTop: partial.lists.marginTop } : {}),
      ...(partial.lists?.marginBottom ? { marginBottom: partial.lists.marginBottom } : {}),
      // Set, not merely equal to the inherited value: the box's colour then
      // reaches its ordered-list numbers (EF-92).
      ...(partial.lists?.color ? { colorSet: true } : {}),
    },
    marginTop: partial.marginTop ?? d.marginTop,
    marginBottom: partial.marginBottom ?? d.marginBottom,
    snapToGrid: partial.snapToGrid ?? d.snapToGrid,
    keepTogether: partial.keepTogether ?? d.keepTogether,
    splitMinLines: Number.isInteger(partial.splitMinLines) && partial.splitMinLines! >= 1
      ? partial.splitMinLines!
      : d.splitMinLines,
    repeatTitle: partial.repeatTitle ?? d.repeatTitle,
    continuedSuffix: partial.continuedSuffix ?? strings.continuedSuffix,
    continuesMarkerEnabled: partial.continuesMarkerEnabled ?? d.continuesMarkerEnabled,
    continuesMarker: partial.continuesMarker ?? strings.continuesMarker,
    continuesMarkerAlign: partial.continuesMarkerAlign ?? d.continuesMarkerAlign,
    continuesMarkerItalic: partial.continuesMarkerItalic ?? d.continuesMarkerItalic,
    ...(partial.numbering ? { numbering: resolveCalloutNumbering(partial.numbering, partial.id) } : {}),
    endMark: partial.endMark ?? '',
    ...(partial.design ? { design: resolveCalloutDesign(partial.design) } : {}),
  };
}

/** A box style's design (#1014): on once set unless it says otherwise, its
 *  text elements wrapping as a heading design's do. */
function resolveCalloutDesign(raw: CalloutDesignConfig): ResolvedCalloutDesignConfig {
  return {
    enabled: raw.enabled ?? true,
    slot: resolveDesignSlot(raw.slot ?? { elements: [] }, 'box'),
    ...(raw.minHeight ? { minHeight: raw.minHeight } : {}),
    setsContent: raw.setsContent === true,
  };
}

/** A style's statement numbering (#530) with its defaults: the counter
 *  named after the style, `{n}` never reset, a bold run-in label ending in
 *  a full stop. */
function resolveCalloutNumbering(partial: CalloutNumberingConfig, styleId: string): ResolvedCalloutNumberingConfig {
  return {
    label: partial.label ?? '',
    counter: partial.counter === false ? '' : (partial.counter?.trim() || styleId),
    numberingTemplate: partial.numberingTemplate ?? '{n}',
    resetOn: partial.resetOn ?? 'never',
    counterFormat: partial.counterFormat ?? 'decimal',
    placement: partial.placement === 'title' ? 'title' : 'runIn',
    bold: partial.bold ?? true,
    italic: partial.italic ?? false,
    suffix: partial.suffix ?? '.',
  };
}

/** A value merged whole, never key by key: a colour (`hex`) or a length
 *  (`value` + `unit`). */
const isAtom = (v: Record<string, unknown>): boolean => 'hex' in v || ('value' in v && 'unit' in v);
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `child` over `parent`: objects merged key by key, colours, lengths,
 *  arrays and scalars replaced. */
function mergeOver(parent: Record<string, unknown>, child: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) continue;
    const below = out[key];
    out[key] = isPlainObject(value) && isPlainObject(below) && !isAtom(value) && !isAtom(below) ? mergeOver(below, value) : value;
  }
  return out;
}

/** Where a style's `extends` leads (#905): the chain of style indices from
 *  `index` up, nearest first, the first style of each id; `cycle` when it
 *  comes back to a style already in it, `unknown` when a parent id names
 *  no style (the chain stops there). */
export function calloutStyleChain(styles: readonly CalloutStyleConfig[], index: number): { chain: number[]; cycle?: number[]; unknown?: string } {
  const byId = new Map<string, number>();
  styles.forEach((s, i) => {
    if (s && typeof s.id === 'string' && !byId.has(s.id)) byId.set(s.id, i);
  });
  const chain: number[] = [];
  for (let at: number | undefined = index; at !== undefined; ) {
    const loop = chain.indexOf(at);
    if (loop >= 0) return { chain, cycle: [...chain.slice(loop), at] };
    chain.push(at);
    const parent: unknown = styles[at]?.extends;
    if (typeof parent !== 'string' || parent === '') break;
    const next = byId.get(parent);
    if (next === undefined) return { chain, unknown: parent };
    at = next;
  }
  return { chain };
}

/** The styles with what each inherits through `extends` (#905) written
 *  in, `extends` left out. A style whose chain loops stands alone, and so
 *  does the rest of a chain past an id no style has. */
export function inheritCalloutStyles(styles: readonly CalloutStyleConfig[]): CalloutStyleConfig[] {
  if (!styles.some((s) => s?.extends !== undefined)) return styles as CalloutStyleConfig[];
  return styles.map((s, i) => {
    if (!s || s.extends === undefined) return s;
    const { chain, cycle } = calloutStyleChain(styles, i);
    const without = (style: CalloutStyleConfig, keys: readonly string[]): Record<string, unknown> =>
      Object.fromEntries(Object.entries(style).filter(([k]) => !keys.includes(k)));
    const own = without(s, ['extends']);
    if (cycle) return own as unknown as CalloutStyleConfig;
    let merged: Record<string, unknown> = {};
    // From the root down: each parent's look, not its id or name.
    for (const at of chain.slice(1).reverse()) merged = mergeOver(merged, without(styles[at]!, ['id', 'name', 'extends']));
    return mergeOver(merged, own) as unknown as CalloutStyleConfig;
  });
}

/** Resolve the callout styles. `locale` is the document language of the
 *  continuation strings (`continuedSuffix` / `continuesMarker`) when a
 *  style leaves them unset — `PostextConfig.locale`, else the hyphenation
 *  locale. A style's `extends` (#905) is merged in first. */
export function resolveCalloutStylesConfig(
  partial: CalloutStyleConfig[] | undefined,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  locale?: string,
): ResolvedCalloutStyleConfig[] {
  return inheritCalloutStyles(partial ?? DEFAULT_CALLOUT_STYLES).map((s) =>
    resolveCalloutStyleConfig(s, bodyText, headings, unorderedLists, locale),
  );
}

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
