import type {
  ColorValue,
  Dimension,
  DesignBoxElement,
  DesignElement,
  DesignRuleElement,
  DesignSlot,
  DesignTextElement,
  LegacyHeaderFooterSlot,
  LegacyHeaderFooterRuleElement,
  LegacyHeaderFooterTextElement,
  ResolvedDesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignRuleElement,
  ResolvedDesignSlot,
  ResolvedDesignTextElement,
} from '../types';
import { DEFAULT_MAIN_COLOR } from './shared';

export type HeaderFooterSlotKind = 'header' | 'footer';

const DEFAULT_MARGIN_FROM_BODY: Dimension = { value: 6, unit: 'pt' };

function mainColor(): ColorValue {
  return { ...DEFAULT_MAIN_COLOR };
}

export const DEFAULT_HEADER_FOOTER_SLOT: ResolvedDesignSlot = { elements: [] };

/** Reference defaults for a freshly-created text element. */
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

function defaultSlotFor(kind: HeaderFooterSlotKind): ResolvedDesignSlot {
  return kind === 'header' ? DEFAULT_HEADER_SLOT : DEFAULT_FOOTER_SLOT;
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

function resolveTextElement(el: DesignTextElement, idx: number): ResolvedDesignTextElement {
  return {
    kind: 'text',
    id: el.id ?? `text-${idx + 1}`,
    parity: el.parity ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? { width: 'auto', height: 'auto' },
    },
    content: el.content,
    fontFamily: el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight ?? DEFAULT_TEXT_ELEMENT.fontWeight,
    italic: el.italic ?? DEFAULT_TEXT_ELEMENT.italic,
    color: el.color ?? DEFAULT_TEXT_ELEMENT.color,
    align: el.align ?? DEFAULT_TEXT_ELEMENT.align,
    verticalAlign: el.verticalAlign ?? DEFAULT_TEXT_ELEMENT.verticalAlign,
    lineHeight: el.lineHeight ?? DEFAULT_TEXT_ELEMENT.lineHeight,
    letterSpacing: el.letterSpacing,
    overflow: el.overflow ?? DEFAULT_TEXT_ELEMENT.overflow,
    hyphenate: el.hyphenate,
    box: el.box,
  };
}

function resolveRuleElement(el: DesignRuleElement, idx: number): ResolvedDesignRuleElement {
  return {
    kind: 'rule',
    id: el.id ?? `rule-${idx + 1}`,
    parity: el.parity ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    direction: el.direction ?? 'horizontal',
    color: el.color,
    thickness: el.thickness,
  };
}

function resolveBoxElement(el: DesignBoxElement, idx: number): ResolvedDesignBoxElement {
  return {
    kind: 'box',
    id: el.id ?? `box-${idx + 1}`,
    parity: el.parity ?? 'all',
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    style: el.style,
  };
}

function resolveElement(el: DesignElement, idx: number): ResolvedDesignElement {
  if (el.kind === 'text') return resolveTextElement(el, idx);
  if (el.kind === 'rule') return resolveRuleElement(el, idx);
  return resolveBoxElement(el, idx);
}

/** Resolve a design slot used for header/footer. `undefined` returns the
 *  built-in default for `kind`. Legacy slots are migrated on the fly. */
export function resolveDesignSlot(
  slot: DesignSlot | undefined,
  kind: HeaderFooterSlotKind = 'header',
): ResolvedDesignSlot {
  if (slot === undefined) return cloneResolvedSlot(defaultSlotFor(kind));
  const maybeMigrated = isLegacyHeaderFooterSlot(slot)
    ? migrateLegacyHeaderFooterConfig(slot, kind) ?? slot
    : slot;
  return {
    elements: (maybeMigrated.elements ?? []).map(resolveElement),
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
// stored as-is otherwise.
export function stripDesignSlotDefaults(
  slot: DesignSlot | undefined,
  kind: HeaderFooterSlotKind = 'header',
): DesignSlot | undefined {
  if (!slot) return undefined;
  const def = defaultSlotFor(kind);
  const migrated = isLegacyHeaderFooterSlot(slot)
    ? migrateLegacyHeaderFooterConfig(slot, kind) ?? slot
    : slot;
  if (JSON.stringify(migrated) === JSON.stringify(def)) return undefined;
  return migrated;
}

export const stripHeaderFooterDefaults = stripDesignSlotDefaults;
