import type {
  ColorValue,
  Dimension,
  DesignBoxElement,
  DesignElement,
  DesignImageElement,
  DesignRuleElement,
  DesignSlot,
  DesignTextElement,
  LegacyHeaderFooterSlot,
  LegacyHeaderFooterRuleElement,
  LegacyHeaderFooterTextElement,
  ResolvedDesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignImageElement,
  ResolvedDesignRuleElement,
  ResolvedDesignSlot,
  ResolvedDesignTextElement,
  TextOverflow,
} from '../types';
import { DEFAULT_MAIN_COLOR } from './shared';
import { dimensionToPx } from '../units';

export type HeaderFooterSlotKind = 'header' | 'footer';

/** Where a design slot is painted (#628): a running head or folio
 *  (`'header'`, `'footer'`, a heading style's own included), a heading
 *  design (`'heading'`: `advancedDesign.slot`, an opener or an in-column
 *  title), a part page and its verso (`'part'`), or a part row of the
 *  contents (`'tocRow'`). It sets the default `overflow` of the slot's text
 *  elements ({@link defaultTextOverflow}). */
export type DesignSlotKind = HeaderFooterSlotKind | 'heading' | 'part' | 'tocRow';

/** The `overflow` of a text element of a `kind` slot that sets none: a
 *  heading or part title wraps onto more lines, a running head, a folio
 *  and a contents part row (whose height is fixed) end in `…`. */
export function defaultTextOverflow(kind: DesignSlotKind): TextOverflow {
  return kind === 'heading' || kind === 'part' ? 'wrap' : 'ellipsis-end';
}

/** The running-head side a legacy (pre-placement) slot of `kind` is
 *  migrated as: a footer's anchors from the foot, every other from the
 *  head. */
function legacyKind(kind: DesignSlotKind): HeaderFooterSlotKind {
  return kind === 'footer' ? 'footer' : 'header';
}

const DEFAULT_MARGIN_FROM_BODY: Dimension = { value: 6, unit: 'pt' };
const EMPTY_SLOT: ResolvedDesignSlot = { elements: [] };

function mainColor(): ColorValue {
  return { ...DEFAULT_MAIN_COLOR };
}

export const DEFAULT_HEADER_FOOTER_SLOT: ResolvedDesignSlot = { elements: [] };

/** Reference defaults for a freshly-created text element. Its `overflow`
 *  is a running head's: an element that sets none takes its slot's
 *  ({@link defaultTextOverflow}). */
export const DEFAULT_TEXT_ELEMENT: ResolvedDesignTextElement = {
  kind: 'text',
  id: 'text',
  parity: 'all',
  placement: {
    anchor: { to: 'container', edge: 'bottom' },
    offset: { x: { value: 0, unit: 'pt' }, y: { value: 0, unit: 'pt' } },
    size: { width: 'auto', height: 'auto' },
  },
  content: '',
  fontFamily: 'EB Garamond',
  fontSize: { value: 8, unit: 'pt' },
  fontWeight: 400,
  italic: false,
  color: { hex: '#000000', model: 'hex' },
  align: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.2,
  overflow: 'ellipsis-end',
};

export const DEFAULT_RULE_ELEMENT: ResolvedDesignRuleElement = {
  kind: 'rule',
  id: 'rule',
  parity: 'all',
  placement: {
    anchor: { to: 'container', edge: 'bottom' },
    offset: { x: { value: 0, unit: 'pt' }, y: { value: 0, unit: 'pt' } },
    size: { width: 'fill' },
  },
  direction: 'horizontal',
  color: { hex: '#000000', model: 'hex' },
  thickness: { value: 0.5, unit: 'pt' },
};

export const DEFAULT_BOX_ELEMENT: ResolvedDesignBoxElement = {
  kind: 'box',
  id: 'box',
  parity: 'all',
  placement: {
    anchor: { to: 'container', edge: 'top-left' },
    offset: { x: { value: 0, unit: 'pt' }, y: { value: 0, unit: 'pt' } },
    size: { width: { value: 20, unit: 'pt' }, height: { value: 20, unit: 'pt' } },
  },
  style: {
    backgroundColor: mainColor(),
    borderRadius: { value: 4, unit: 'pt' },
  },
};

/** Built-in default header: book title (right, odd) + chapter title (left,
 *  even) + full-width rule. Applied when `config.header` is `undefined`. */
export const DEFAULT_HEADER_SLOT: ResolvedDesignSlot = {
  elements: [
    {
      kind: 'text',
      id: 'titleOdd',
      parity: 'odd',
      placement: {
        anchor: { to: 'container', edge: 'bottom-right' },
        offset: { x: { value: 0, unit: 'pt' }, y: { value: -16, unit: 'pt' } },
        size: { width: 'auto', height: 'auto' },
      },
      content: '{title}',
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
      align: 'right',
      verticalAlign: 'middle',
      lineHeight: 1.2,
      overflow: 'ellipsis-end',
    },
    {
      kind: 'text',
      id: 'chapterEven',
      parity: 'even',
      placement: {
        anchor: { to: 'container', edge: 'bottom-left' },
        offset: { x: { value: 0, unit: 'pt' }, y: { value: -16, unit: 'pt' } },
        size: { width: 'auto', height: 'auto' },
      },
      content: '{chapterTitle}',
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
      align: 'left',
      verticalAlign: 'middle',
      lineHeight: 1.2,
      overflow: 'ellipsis-end',
    },
    {
      kind: 'rule',
      id: 'rule',
      parity: 'all',
      placement: {
        anchor: { to: 'container', edge: 'bottom' },
        offset: { x: { value: 0, unit: 'pt' }, y: { value: -13, unit: 'pt' } },
        size: { width: 'fill' },
      },
      direction: 'horizontal',
      color: mainColor(),
      thickness: { value: 1, unit: 'pt' },
    },
  ],
};

/** Built-in default footer: centered page number on every page. */
export const DEFAULT_FOOTER_SLOT: ResolvedDesignSlot = {
  elements: [
    {
      kind: 'text',
      id: 'pageNumber',
      parity: 'all',
      placement: {
        anchor: { to: 'container', edge: 'top' },
        offset: { x: { value: 0, unit: 'pt' }, y: { value: 16, unit: 'pt' } },
        size: { width: 'auto', height: 'auto' },
      },
      content: '{pageNumber}',
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.2,
      overflow: 'ellipsis-end',
    },
  ],
};

function defaultSlotFor(kind: DesignSlotKind): ResolvedDesignSlot {
  if (kind === 'header') return DEFAULT_HEADER_SLOT;
  if (kind === 'footer') return DEFAULT_FOOTER_SLOT;
  return EMPTY_SLOT;
}

// ---------------------------------------------------------------------------
// Legacy detection + migration
// ---------------------------------------------------------------------------

function isLegacyTextElement(el: unknown): el is LegacyHeaderFooterTextElement {
  if (!el || typeof el !== 'object') return false;
  const o = el as Record<string, unknown>;
  if (o.kind !== 'text') return false;
  // Legacy has `align` at the top level and no `placement`.
  return 'align' in o && !('placement' in o);
}

function isLegacyRuleElement(el: unknown): el is LegacyHeaderFooterRuleElement {
  if (!el || typeof el !== 'object') return false;
  const o = el as Record<string, unknown>;
  if (o.kind !== 'rule') return false;
  return 'align' in o && !('placement' in o);
}

/** Returns true when the slot uses the legacy `align`/`marginFromBody` shape. */
export function isLegacyHeaderFooterSlot(slot: unknown): slot is LegacyHeaderFooterSlot {
  if (!slot || typeof slot !== 'object') return false;
  const elements = (slot as { elements?: unknown[] }).elements;
  if (!Array.isArray(elements)) return false;
  return elements.some((e) => isLegacyTextElement(e) || isLegacyRuleElement(e));
}

function anchorFromLegacy(
  kind: HeaderFooterSlotKind,
  align: 'left' | 'center' | 'right',
): { edge: 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right' } {
  const side = kind === 'header' ? 'bottom' : 'top';
  if (align === 'left') return { edge: `${side}-left` as const };
  if (align === 'right') return { edge: `${side}-right` as const };
  return { edge: side as 'top' | 'bottom' };
}

function migrateTextElement(
  el: LegacyHeaderFooterTextElement,
  kind: HeaderFooterSlotKind,
  idx: number,
): DesignTextElement {
  const anchor = anchorFromLegacy(kind, el.align);
  const yOffsetVal = el.marginFromBody?.value ?? DEFAULT_MARGIN_FROM_BODY.value;
  const yUnit = el.marginFromBody?.unit ?? DEFAULT_MARGIN_FROM_BODY.unit;
  // Header anchors to bottom and moves UP (negative y); footer anchors to top
  // and moves DOWN (positive y).
  const y: Dimension = {
    value: kind === 'header' ? -yOffsetVal : yOffsetVal,
    unit: yUnit,
  };
  const edgeInset = el.marginFromEdge;
  let x: Dimension | undefined;
  if (el.align === 'left' && edgeInset) x = edgeInset;
  else if (el.align === 'right' && edgeInset)
    x = { value: -edgeInset.value, unit: edgeInset.unit };
  else x = undefined;

  return {
    kind: 'text',
    id: `text-${idx + 1}`,
    parity: el.parity,
    placement: {
      anchor: { to: 'container', edge: anchor.edge },
      offset: { x, y },
      size: { width: 'auto', height: 'auto' },
    },
    content: el.content,
    fontFamily: el.fontFamily,
    fontSize: el.fontSize ?? DEFAULT_TEXT_ELEMENT.fontSize,
    fontWeight: el.fontWeight,
    italic: el.italic,
    color: el.color,
    align: el.align,
    verticalAlign: 'middle',
    lineHeight: 1.2,
    overflow: 'ellipsis-end',
  };
}

function migrateRuleElement(
  el: LegacyHeaderFooterRuleElement,
  kind: HeaderFooterSlotKind,
  idx: number,
): DesignRuleElement {
  const anchor = anchorFromLegacy(kind, el.align);
  const yOffsetVal = el.marginFromBody?.value ?? DEFAULT_MARGIN_FROM_BODY.value;
  const yUnit = el.marginFromBody?.unit ?? DEFAULT_MARGIN_FROM_BODY.unit;
  const y: Dimension = {
    value: kind === 'header' ? -yOffsetVal : yOffsetVal,
    unit: yUnit,
  };
  const widthSize = el.width === 'full' ? 'fill' : el.width;
  const edgeInset = el.align !== 'center' && el.width !== 'full' ? el.marginFromEdge : undefined;
  let x: Dimension | undefined;
  if (el.align === 'left' && edgeInset) x = edgeInset;
  else if (el.align === 'right' && edgeInset)
    x = { value: -edgeInset.value, unit: edgeInset.unit };

  return {
    kind: 'rule',
    id: `rule-${idx + 1}`,
    parity: el.parity,
    placement: {
      anchor: { to: 'container', edge: anchor.edge },
      offset: { x, y },
      size: { width: widthSize },
    },
    direction: 'horizontal',
    color: el.color,
    thickness: el.thickness,
  };
}

/** Convert a legacy-shaped header/footer slot to a `DesignSlot`. Safe to
 *  call on already-migrated slots (returns them unchanged). */
export function migrateLegacyHeaderFooterConfig(
  slot: unknown,
  kind: HeaderFooterSlotKind,
): DesignSlot | undefined {
  if (!slot || typeof slot !== 'object') return undefined;
  const elements = (slot as { elements?: unknown[] }).elements;
  if (!Array.isArray(elements)) return { elements: [] };
  const migrated: DesignElement[] = elements.map((raw, i) => {
    if (isLegacyTextElement(raw)) return migrateTextElement(raw, kind, i);
    if (isLegacyRuleElement(raw)) return migrateRuleElement(raw, kind, i);
    return raw as DesignElement;
  });
  return { elements: migrated };
}

// ---------------------------------------------------------------------------
// Resolve / strip
// ---------------------------------------------------------------------------

const ABSOLUTE_UNITS = new Set(['cm', 'mm', 'in', 'pt', 'px']);
/** The DPI an absolute leading is compared to the font size at when the two
 *  mix `px` with physical units (the default page DPI): only the editor's
 *  equivalent multiplier depends on it, never the layout. */
const EQUIVALENT_MULTIPLIER_DPI = 300;

/** A design text's leading as written (`DesignTextElement.lineHeight`: a
 *  multiplier, or a {@link Dimension}) as the resolved element carries it:
 *  a multiplier, plus the absolute length when one was given. A numeric
 *  string counts as the number it spells; anything unusable — not a
 *  positive finite number, a dimension of an unknown unit — is the default
 *  multiplier. Never NaN. */
export function resolveDesignLineHeight(
  value: unknown,
  fontSize: Dimension | undefined,
): { lineHeight: number; lineHeightLength?: Dimension } {
  const fallback = { lineHeight: DEFAULT_TEXT_ELEMENT.lineHeight };
  const positive = (n: unknown): number | undefined => {
    const v = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const n = positive(value);
  if (n !== undefined) return { lineHeight: n };
  if (!value || typeof value !== 'object') return fallback;
  const { value: raw, unit } = value as { value?: unknown; unit?: unknown };
  const v = positive(raw);
  if (v === undefined || typeof unit !== 'string') return fallback;
  if (unit === 'em' || unit === 'rem') return { lineHeight: v };
  if (!ABSOLUTE_UNITS.has(unit)) return fallback;
  const length = { value: v, unit } as Dimension;
  const size = fontSize && ABSOLUTE_UNITS.has(fontSize.unit)
    ? dimensionToPx(fontSize, EQUIVALENT_MULTIPLIER_DPI)
    : 0;
  const equivalent = size > 0 ? dimensionToPx(length, EQUIVALENT_MULTIPLIER_DPI) / size : DEFAULT_TEXT_ELEMENT.lineHeight;
  return { lineHeight: equivalent, lineHeightLength: length };
}

function resolveTextElement(el: DesignTextElement, idx: number, kind: DesignSlotKind): ResolvedDesignTextElement {
  return {
    kind: 'text',
    id: el.id ?? `text-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? { width: 'auto', height: 'auto' },
    },
    content: el.content,
    fontFamily: el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily,
    // Typed as required, but a JSON config may leave it out: the documented
    // 8 pt, not a zero-size (invisible) text.
    fontSize: el.fontSize ?? DEFAULT_TEXT_ELEMENT.fontSize,
    fontWeight: el.fontWeight ?? DEFAULT_TEXT_ELEMENT.fontWeight,
    italic: el.italic ?? DEFAULT_TEXT_ELEMENT.italic,
    color: el.color ?? DEFAULT_TEXT_ELEMENT.color,
    align: el.align ?? DEFAULT_TEXT_ELEMENT.align,
    verticalAlign: el.verticalAlign ?? DEFAULT_TEXT_ELEMENT.verticalAlign,
    ...resolveDesignLineHeight(el.lineHeight, el.fontSize ?? DEFAULT_TEXT_ELEMENT.fontSize),
    letterSpacing: el.letterSpacing,
    overflow: el.overflow ?? defaultTextOverflow(kind),
    hyphenate: el.hyphenate,
    ...(el.textTransform ? { textTransform: el.textTransform } : {}),
    ...(el.dropCap ? { dropCap: el.dropCap } : {}),
    ...(el.paragraphIndent ? { paragraphIndent: el.paragraphIndent } : {}),
    ...(el.inlineMarks ? { inlineMarks: true } : {}),
    ...(el.stroke ? { stroke: el.stroke } : {}),
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.writingMode === 'vertical-rl' ? { writingMode: 'vertical-rl' as const } : {}),
    ...(el.direction === 'ltr' || el.direction === 'rtl' || el.direction === 'auto' ? { direction: el.direction } : {}),
    box: el.box,
  };
}

function resolveRuleElement(el: DesignRuleElement, idx: number): ResolvedDesignRuleElement {
  return {
    kind: 'rule',
    id: el.id ?? `rule-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    direction: el.direction ?? 'horizontal',
    // The documented defaults (EF-136): a rule that leaves them out is a
    // black 0.5 pt line, not an invisible one.
    color: el.color ?? { ...DEFAULT_RULE_ELEMENT.color },
    thickness: el.thickness ?? { ...DEFAULT_RULE_ELEMENT.thickness },
    ...(el.reserve === false ? { reserve: false } : {}),
  };
}

function resolveBoxElement(el: DesignBoxElement, idx: number): ResolvedDesignBoxElement {
  return {
    kind: 'box',
    id: el.id ?? `box-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    style: el.style,
    ...(el.reserve === false ? { reserve: false } : {}),
  };
}

function resolveImageElement(el: DesignImageElement, idx: number): ResolvedDesignImageElement {
  return {
    kind: 'image',
    id: el.id ?? `image-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? { width: 'auto', height: 'auto' },
    },
    resourceId: el.resourceId,
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.decorative ? { decorative: true } : {}),
  };
}

function resolveElement(el: DesignElement, idx: number, kind: DesignSlotKind): ResolvedDesignElement {
  if (el.kind === 'text') return resolveTextElement(el, idx, kind);
  if (el.kind === 'rule') return resolveRuleElement(el, idx);
  if (el.kind === 'image') return resolveImageElement(el, idx);
  return resolveBoxElement(el, idx);
}

/** Resolve a design slot painted as `kind` (see {@link DesignSlotKind}),
 *  which sets the default `overflow` of its text elements. `undefined`
 *  returns the built-in default for `kind` (empty but for a running head
 *  and a folio). Legacy slots are migrated on the fly. */
export function resolveDesignSlot(
  slot: DesignSlot | undefined,
  kind: DesignSlotKind = 'header',
): ResolvedDesignSlot {
  if (slot === undefined) return cloneResolvedSlot(defaultSlotFor(kind));
  const maybeMigrated = isLegacyHeaderFooterSlot(slot)
    ? migrateLegacyHeaderFooterConfig(slot, legacyKind(kind)) ?? slot
    : slot;
  return {
    elements: (maybeMigrated.elements ?? []).map((el, i) => resolveElement(el, i, kind)),
  };
}

export const resolveHeaderFooterConfig = resolveDesignSlot;

function cloneResolvedSlot(slot: ResolvedDesignSlot): ResolvedDesignSlot {
  return { elements: slot.elements.map((el) => deepClone(el)) };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// Strip is intentionally minimal: only returns `undefined` when the slot
// deep-equals the default (so persisted configs omit it entirely). Per-field
// stripping across the new union is not worth the complexity — the slot is
// stored as-is otherwise. A heading, part or contents row slot has no
// default to compare with, so it is never stripped.
export function stripDesignSlotDefaults(
  slot: DesignSlot | undefined,
  kind: DesignSlotKind = 'header',
): DesignSlot | undefined {
  if (!slot) return undefined;
  const migrated = isLegacyHeaderFooterSlot(slot)
    ? migrateLegacyHeaderFooterConfig(slot, legacyKind(kind)) ?? slot
    : slot;
  if (kind !== 'header' && kind !== 'footer') return migrated;
  if (JSON.stringify(migrated) === JSON.stringify(defaultSlotFor(kind))) return undefined;
  return migrated;
}

export const stripHeaderFooterDefaults = stripDesignSlotDefaults;
