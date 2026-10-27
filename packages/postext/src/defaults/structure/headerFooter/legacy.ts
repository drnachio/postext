// Migration of the legacy header and footer config to design slots
// (#1278: split out of headerFooter.ts).
import type { LegacyHeaderFooterTextElement, LegacyHeaderFooterRuleElement, LegacyHeaderFooterSlot, DesignTextElement, Dimension, DesignRuleElement, DesignSlot, DesignElement } from '../../../types.js';
import { type HeaderFooterSlotKind, DEFAULT_MARGIN_FROM_BODY, DEFAULT_TEXT_ELEMENT } from './defaults.js';

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
