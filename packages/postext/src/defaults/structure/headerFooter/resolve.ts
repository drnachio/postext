// Resolving design slots and their elements: line heights, fences and each
// element kind (#1278: split out of headerFooter.ts).
import type { Dimension, DesignTextElement, ResolvedDesignTextElement, DesignRuleElement, ResolvedDesignRuleElement, DesignBoxElement, ResolvedDesignBoxElement, DesignImageElement, ResolvedDesignImageElement, DesignPathElement, ResolvedDesignPathElement, DesignConnectorElement, ResolvedDesignConnectorElement, DesignElement, ResolvedDesignElement, DesignSlot, ResolvedDesignSlot } from '../../../types.js';
import { DEFAULT_MAIN_COLOR } from '../../shared.js';
import { dimensionToPx } from '../../../units.js';
import { withFigureStyle } from '../../../fonts/figureStyle.js';
import { DEFAULT_TEXT_ELEMENT, type DesignSlotKind, defaultTextOverflow, DEFAULT_RULE_ELEMENT, defaultSlotFor, legacyKind } from './defaults.js';
import { isLegacyHeaderFooterSlot, migrateLegacyHeaderFooterConfig } from './legacy.js';

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

/** An element's page-fence condition (#1087) as it is read: `when` and
 *  `unless` kept when they name an attribute (a non-empty string, trimmed),
 *  left out otherwise (the validation reports a value that is not one). */
export function fenceConditionOf(el: { when?: unknown; unless?: unknown }): { when?: string; unless?: string } {
  const out: { when?: string; unless?: string } = {};
  if (typeof el.when === 'string' && el.when.trim() !== '') out.when = el.when.trim();
  if (typeof el.unless === 'string' && el.unless.trim() !== '') out.unless = el.unless.trim();
  return out;
}

function resolveTextElement(el: DesignTextElement, idx: number, kind: DesignSlotKind): ResolvedDesignTextElement {
  return {
    kind: 'text',
    id: el.id ?? `text-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    ...fenceConditionOf(el),
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? { width: 'auto', height: 'auto' },
    },
    content: el.content,
    // The element's figures (#1237) name its family.
    fontFamily: withFigureStyle(el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily, el.figureStyle),
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
    ...(el.dotted ? { dotted: el.dotted } : {}),
    ...(el.repeat ? { repeat: el.repeat } : {}),
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.pin ? { pin: true } : {}),
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
    ...fenceConditionOf(el),
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
    ...(el.pin ? { pin: true } : {}),
  };
}

function resolveBoxElement(el: DesignBoxElement, idx: number): ResolvedDesignBoxElement {
  return {
    kind: 'box',
    id: el.id ?? `box-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    ...fenceConditionOf(el),
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    style: el.style,
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.pin ? { pin: true } : {}),
  };
}

function resolveImageElement(el: DesignImageElement, idx: number): ResolvedDesignImageElement {
  return {
    kind: 'image',
    id: el.id ?? `image-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    ...fenceConditionOf(el),
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? { width: 'auto', height: 'auto' },
    },
    resourceId: el.resourceId,
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.pin ? { pin: true } : {}),
    ...(el.decorative ? { decorative: true } : {}),
    ...(el.fit === 'cover' ? { fit: 'cover' as const } : {}),
    ...(el.focus && Number.isFinite(el.focus.x) && Number.isFinite(el.focus.y)
      ? { focus: { x: Math.max(0, Math.min(1, el.focus.x)), y: Math.max(0, Math.min(1, el.focus.y)) } }
      : {}),
  };
}

function resolvePathElement(el: DesignPathElement, idx: number): ResolvedDesignPathElement {
  return {
    kind: 'path',
    id: el.id ?? `path-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    ...fenceConditionOf(el),
    placement: {
      anchor: el.placement.anchor,
      offset: el.placement.offset ?? {},
      size: el.placement.size ?? {},
    },
    d: el.d,
    ...(el.viewBox !== undefined ? { viewBox: el.viewBox } : {}),
    ...(el.fill ? { fill: el.fill } : {}),
    ...(el.stroke ? { stroke: el.stroke } : {}),
    ...(el.width ? { width: el.width } : {}),
    ...(el.dash ? { dash: el.dash } : {}),
    ...(el.preserveAspectRatio === 'meet' ? { preserveAspectRatio: 'meet' as const } : {}),
    ...(el.reserve === false ? { reserve: false } : {}),
    ...(el.pin ? { pin: true } : {}),
  };
}

/** A connector (#1056) as written, its id, parity, pages and colour
 *  filled in (the main colour, palette-linked, so a part recolours it);
 *  the geometry's defaults are read where it is laid (`design/connector.ts`). */
function resolveConnectorElement(el: DesignConnectorElement, idx: number): ResolvedDesignConnectorElement {
  const rest: DesignConnectorElement = { ...el };
  delete rest.when;
  delete rest.unless;
  return {
    ...rest,
    id: el.id ?? `connector-${idx + 1}`,
    parity: el.parity ?? 'all',
    pages: el.pages ?? 'all',
    ...fenceConditionOf(el),
    color: el.color ?? { ...DEFAULT_MAIN_COLOR },
  };
}

function resolveElement(el: DesignElement, idx: number, kind: DesignSlotKind): ResolvedDesignElement {
  if (el.kind === 'connector') return resolveConnectorElement(el, idx);
  if (el.kind === 'text') return resolveTextElement(el, idx, kind);
  if (el.kind === 'rule') return resolveRuleElement(el, idx);
  if (el.kind === 'image') return resolveImageElement(el, idx);
  if (el.kind === 'path') return resolvePathElement(el, idx);
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
