import type { DesignElement, DesignRuleElement, DesignSlot, DesignTextElement, ResolvedDesignElement, ResolvedDesignRuleElement, ResolvedDesignSlot, ResolvedDesignTextElement } from '../designElements.js';
import type { HeaderFooterHAlign, PageParity } from '../designPlacement.js';
import type { ColorValue, Dimension } from '../page.js';

// ---------------------------------------------------------------------------
// Header/footer — the unified model. `HeaderFooterSlot` and friends are
// type aliases on top of the design primitives, kept for naming
// back-compat.
// ---------------------------------------------------------------------------

/** An element of a running head or foot. */
export type HeaderFooterElement = DesignElement;
/** What a running head or foot draws. */
export type HeaderFooterSlot = DesignSlot;

/** `HeaderFooterElement` with every default filled in. */
export type ResolvedHeaderFooterElement = ResolvedDesignElement;
/** `HeaderFooterSlot` with every default filled in. */
export type ResolvedHeaderFooterSlot = ResolvedDesignSlot;

// ---------------------------------------------------------------------------
// Legacy header/footer types — retained solely so the migrator can
// recognize pre-migration configs and convert them to DesignSlot.
// ---------------------------------------------------------------------------

/** A text element in the older form of running heads, which saved
 *  configurations can still hold. */
export interface LegacyHeaderFooterTextElement {
  kind: 'text';
  align: HeaderFooterHAlign;
  content: string;
  parity: PageParity;
  /** Absolute distance between the element's body-facing edge and the body
   *  edge. Elements are independent — two with the same `marginFromBody`
   *  overlap rather than stacking. In a header, gap from element bottom to
   *  body top; in a footer, gap from element top to body bottom. */
  marginFromBody?: Dimension;
  /** Horizontal inset from the aligned content edge. When `align` is
   *  `'left'`, offset from the left content edge; when `'right'`, from the
   *  right. Ignored when `align` is `'center'`. */
  marginFromEdge?: Dimension;
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
}

/** A rule in the older form of running heads, which saved configurations can
 *  still hold. */
export interface LegacyHeaderFooterRuleElement {
  kind: 'rule';
  color: ColorValue;
  thickness: Dimension;
  width: Dimension | 'full';
  align: HeaderFooterHAlign;
  marginFromBody?: Dimension;
  marginFromEdge?: Dimension;
  parity: PageParity;
}

/** An element in the older form of running heads. */
export type LegacyHeaderFooterElement = LegacyHeaderFooterTextElement | LegacyHeaderFooterRuleElement;

/** A running head in its older form. */
export interface LegacyHeaderFooterSlot {
  elements: LegacyHeaderFooterElement[];
}

/** @deprecated Use `DesignTextElement`. Kept as alias for legacy API exports. */
export type HeaderFooterTextElement = DesignTextElement;
/** @deprecated Use `DesignRuleElement`. */
export type HeaderFooterRuleElement = DesignRuleElement;
/** @deprecated Use `ResolvedDesignTextElement`. */
export type ResolvedHeaderFooterTextElement = ResolvedDesignTextElement;
/** @deprecated Use `ResolvedDesignRuleElement`. */
export type ResolvedHeaderFooterRuleElement = ResolvedDesignRuleElement;
