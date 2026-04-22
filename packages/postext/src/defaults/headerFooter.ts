import type {
  HeaderFooterSlot,
  ResolvedHeaderFooterSlot,
  HeaderFooterElement,
  ResolvedHeaderFooterElement,
  HeaderFooterTextElement,
  HeaderFooterRuleElement,
  ResolvedHeaderFooterTextElement,
  ResolvedHeaderFooterRuleElement,
  Dimension,
  ColorValue,
} from '../types';
import { dimensionsEqual, colorsEqual, DEFAULT_MAIN_COLOR } from './shared';

export type HeaderFooterSlotKind = 'header' | 'footer';

const DEFAULT_MARGIN_FROM_BODY: Dimension = { value: 6, unit: 'pt' };
const DEFAULT_MARGIN_FROM_EDGE: Dimension = { value: 0, unit: 'pt' };

function mainColor(): ColorValue {
  return { ...DEFAULT_MAIN_COLOR };
}

export const DEFAULT_HEADER_FOOTER_SLOT: ResolvedHeaderFooterSlot = {
  elements: [],
};

export const DEFAULT_TEXT_ELEMENT: ResolvedHeaderFooterTextElement = {
  kind: 'text',
  align: 'center',
  content: '',
  parity: 'all',
  marginFromBody: { ...DEFAULT_MARGIN_FROM_BODY },
  marginFromEdge: { ...DEFAULT_MARGIN_FROM_EDGE },
  fontFamily: 'EB Garamond',
  fontSize: { value: 8, unit: 'pt' },
  fontWeight: 400,
  italic: false,
  color: { hex: '#000000', model: 'hex' },
};

export const DEFAULT_RULE_ELEMENT: ResolvedHeaderFooterRuleElement = {
  kind: 'rule',
  color: { hex: '#000000', model: 'hex' },
  thickness: { value: 0.5, unit: 'pt' },
  width: 'full',
  align: 'center',
  marginFromBody: { ...DEFAULT_MARGIN_FROM_BODY },
  marginFromEdge: { ...DEFAULT_MARGIN_FROM_EDGE },
  parity: 'all',
};

/** Built-in default header: book title (right, odd) + chapter title (left,
 *  even) + full-width rule. Applied when `config.header` is `undefined`. */
export const DEFAULT_HEADER_SLOT: ResolvedHeaderFooterSlot = {
  elements: [
    {
      kind: 'text',
      align: 'right',
      content: '{title}',
      parity: 'odd',
      marginFromBody: { value: 16, unit: 'pt' },
      marginFromEdge: { value: 0, unit: 'pt' },
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
    },
    {
      kind: 'text',
      align: 'left',
      content: '{chapterTitle}',
      parity: 'even',
      marginFromBody: { value: 16, unit: 'pt' },
      marginFromEdge: { value: 0, unit: 'pt' },
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
    },
    {
      kind: 'rule',
      color: mainColor(),
      thickness: { value: 1, unit: 'pt' },
      width: 'full',
      align: 'center',
      marginFromBody: { value: 13, unit: 'pt' },
      marginFromEdge: { value: 0, unit: 'pt' },
      parity: 'all',
    },
  ],
};

/** Built-in default footer: centered page number on every page. Applied when
 *  `config.footer` is `undefined`. */
export const DEFAULT_FOOTER_SLOT: ResolvedHeaderFooterSlot = {
  elements: [
    {
      kind: 'text',
      align: 'center',
      content: '{pageNumber}',
      parity: 'all',
      marginFromBody: { value: 16, unit: 'pt' },
      marginFromEdge: { value: 0, unit: 'pt' },
      fontFamily: 'Open Sans',
      fontSize: { value: 8, unit: 'pt' },
      fontWeight: 600,
      italic: false,
      color: mainColor(),
    },
  ],
};

function defaultSlotFor(kind: HeaderFooterSlotKind): ResolvedHeaderFooterSlot {
  return kind === 'header' ? DEFAULT_HEADER_SLOT : DEFAULT_FOOTER_SLOT;
}

function cloneResolvedSlot(slot: ResolvedHeaderFooterSlot): ResolvedHeaderFooterSlot {
  return {
    elements: slot.elements.map((el) =>
      el.kind === 'text'
        ? {
            ...el,
            marginFromBody: { ...el.marginFromBody },
            marginFromEdge: { ...el.marginFromEdge },
            fontSize: { ...el.fontSize },
            color: { ...el.color },
          }
        : {
            ...el,
            marginFromBody: { ...el.marginFromBody },
            marginFromEdge: { ...el.marginFromEdge },
            thickness: { ...el.thickness },
            width: typeof el.width === 'string' ? el.width : { ...el.width },
            color: { ...el.color },
          },
    ),
  };
}

function resolveTextElement(el: HeaderFooterTextElement): ResolvedHeaderFooterTextElement {
  return {
    kind: 'text',
    align: el.align ?? DEFAULT_TEXT_ELEMENT.align,
    content: el.content ?? DEFAULT_TEXT_ELEMENT.content,
    parity: el.parity ?? DEFAULT_TEXT_ELEMENT.parity,
    marginFromBody: el.marginFromBody ?? DEFAULT_TEXT_ELEMENT.marginFromBody,
    marginFromEdge: el.marginFromEdge ?? DEFAULT_TEXT_ELEMENT.marginFromEdge,
    fontFamily: el.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily,
    fontSize: el.fontSize ?? DEFAULT_TEXT_ELEMENT.fontSize,
    fontWeight: el.fontWeight ?? DEFAULT_TEXT_ELEMENT.fontWeight,
    italic: el.italic ?? DEFAULT_TEXT_ELEMENT.italic,
    color: el.color ?? DEFAULT_TEXT_ELEMENT.color,
  };
}

function resolveRuleElement(el: HeaderFooterRuleElement): ResolvedHeaderFooterRuleElement {
  return {
    kind: 'rule',
    color: el.color ?? DEFAULT_RULE_ELEMENT.color,
    thickness: el.thickness ?? DEFAULT_RULE_ELEMENT.thickness,
    width: el.width ?? DEFAULT_RULE_ELEMENT.width,
    align: el.align ?? DEFAULT_RULE_ELEMENT.align,
    marginFromBody: el.marginFromBody ?? DEFAULT_RULE_ELEMENT.marginFromBody,
    marginFromEdge: el.marginFromEdge ?? DEFAULT_RULE_ELEMENT.marginFromEdge,
    parity: el.parity ?? DEFAULT_RULE_ELEMENT.parity,
  };
}

function resolveElement(el: HeaderFooterElement): ResolvedHeaderFooterElement {
  if (el.kind === 'text') return resolveTextElement(el);
  return resolveRuleElement(el);
}

/** Resolve a header/footer slot. When `slot` is `undefined`, returns the
 *  built-in default for `kind`. An explicit empty slot (`{ elements: [] }`)
 *  stays empty — the user opted out of the default. */
export function resolveHeaderFooterConfig(
  slot: HeaderFooterSlot | undefined,
  kind: HeaderFooterSlotKind = 'header',
): ResolvedHeaderFooterSlot {
  if (slot === undefined) return cloneResolvedSlot(defaultSlotFor(kind));
  return {
    elements: (slot.elements ?? []).map(resolveElement),
  };
}

function stripTextElement(el: HeaderFooterTextElement): HeaderFooterTextElement {
  const out: HeaderFooterTextElement = {
    kind: 'text',
    align: el.align,
    content: el.content,
    parity: el.parity,
  };
  if (el.marginFromBody !== undefined && !dimensionsEqual(el.marginFromBody, DEFAULT_TEXT_ELEMENT.marginFromBody)) out.marginFromBody = el.marginFromBody;
  if (el.marginFromEdge !== undefined && !dimensionsEqual(el.marginFromEdge, DEFAULT_TEXT_ELEMENT.marginFromEdge)) out.marginFromEdge = el.marginFromEdge;
  if (el.fontFamily !== undefined && el.fontFamily !== DEFAULT_TEXT_ELEMENT.fontFamily) out.fontFamily = el.fontFamily;
  if (el.fontSize !== undefined && !dimensionsEqual(el.fontSize, DEFAULT_TEXT_ELEMENT.fontSize)) out.fontSize = el.fontSize;
  if (el.fontWeight !== undefined && el.fontWeight !== DEFAULT_TEXT_ELEMENT.fontWeight) out.fontWeight = el.fontWeight;
  if (el.italic !== undefined && el.italic !== DEFAULT_TEXT_ELEMENT.italic) out.italic = el.italic;
  if (el.color !== undefined && !colorsEqual(el.color, DEFAULT_TEXT_ELEMENT.color)) out.color = el.color;
  return out;
}

function stripRuleElement(el: HeaderFooterRuleElement): HeaderFooterRuleElement {
  const out: HeaderFooterRuleElement = {
    kind: 'rule',
    color: el.color,
    thickness: el.thickness,
    width: el.width,
    align: el.align,
    parity: el.parity,
  };
  if (el.marginFromBody !== undefined && !dimensionsEqual(el.marginFromBody, DEFAULT_RULE_ELEMENT.marginFromBody)) out.marginFromBody = el.marginFromBody;
  if (el.marginFromEdge !== undefined && !dimensionsEqual(el.marginFromEdge, DEFAULT_RULE_ELEMENT.marginFromEdge)) out.marginFromEdge = el.marginFromEdge;
  return out;
}

function textElementsEqual(
  a: HeaderFooterTextElement,
  b: ResolvedHeaderFooterTextElement,
): boolean {
  return (
    a.kind === 'text' &&
    a.align === b.align &&
    a.content === b.content &&
    a.parity === b.parity &&
    dimensionsEqual(a.marginFromBody ?? DEFAULT_TEXT_ELEMENT.marginFromBody, b.marginFromBody) &&
    dimensionsEqual(a.marginFromEdge ?? DEFAULT_TEXT_ELEMENT.marginFromEdge, b.marginFromEdge) &&
    (a.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily) === b.fontFamily &&
    dimensionsEqual(a.fontSize ?? DEFAULT_TEXT_ELEMENT.fontSize, b.fontSize) &&
    (a.fontWeight ?? DEFAULT_TEXT_ELEMENT.fontWeight) === b.fontWeight &&
    (a.italic ?? DEFAULT_TEXT_ELEMENT.italic) === b.italic &&
    colorsEqual(a.color ?? DEFAULT_TEXT_ELEMENT.color, b.color)
  );
}

function ruleElementsEqual(
  a: HeaderFooterRuleElement,
  b: ResolvedHeaderFooterRuleElement,
): boolean {
  const widthEq =
    typeof a.width === 'string' && typeof b.width === 'string'
      ? a.width === b.width
      : typeof a.width !== 'string' && typeof b.width !== 'string'
      ? dimensionsEqual(a.width, b.width)
      : false;
  return (
    a.kind === 'rule' &&
    colorsEqual(a.color, b.color) &&
    dimensionsEqual(a.thickness, b.thickness) &&
    widthEq &&
    a.align === b.align &&
    dimensionsEqual(a.marginFromBody ?? DEFAULT_RULE_ELEMENT.marginFromBody, b.marginFromBody) &&
    dimensionsEqual(a.marginFromEdge ?? DEFAULT_RULE_ELEMENT.marginFromEdge, b.marginFromEdge) &&
    a.parity === b.parity
  );
}

function slotEqualsDefault(slot: HeaderFooterSlot, def: ResolvedHeaderFooterSlot): boolean {
  const els = slot.elements ?? [];
  if (els.length !== def.elements.length) return false;
  for (let i = 0; i < els.length; i++) {
    const a = els[i]!;
    const b = def.elements[i]!;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'text' && b.kind === 'text') {
      if (!textElementsEqual(a, b)) return false;
    } else if (a.kind === 'rule' && b.kind === 'rule') {
      if (!ruleElementsEqual(a, b)) return false;
    }
  }
  return true;
}

/** Strip defaults from a header/footer slot. Returns `undefined` when the
 *  slot matches the built-in default for `kind` (so persisted configs omit
 *  it); otherwise returns the slot with per-element field defaults stripped.
 *  An explicit empty slot is preserved — the user opted out and we must not
 *  conflate that with "use the default". */
export function stripHeaderFooterDefaults(
  slot: HeaderFooterSlot | undefined,
  kind: HeaderFooterSlotKind = 'header',
): HeaderFooterSlot | undefined {
  if (!slot) return undefined;
  if (slotEqualsDefault(slot, defaultSlotFor(kind))) return undefined;
  const elements = (slot.elements ?? []).map((el) =>
    el.kind === 'text' ? stripTextElement(el) : stripRuleElement(el),
  );
  return { elements };
}

