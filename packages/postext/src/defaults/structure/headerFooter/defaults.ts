// Slot kinds and the default header, footer and element values
// (#1278: split out of headerFooter.ts).
import type { TextOverflow, Dimension, ResolvedDesignSlot, ColorValue, ResolvedDesignTextElement, ResolvedDesignRuleElement, ResolvedDesignBoxElement } from '../../../types.js';
import { DEFAULT_MAIN_COLOR } from '../../shared.js';

export type HeaderFooterSlotKind = 'header' | 'footer';

/** Where a design slot is painted (#628): a running head or folio
 *  (`'header'`, `'footer'`, a heading style's own included), a heading
 *  design (`'heading'`: `advancedDesign.slot`, an opener or an in-column
 *  title), a part page and its verso (`'part'`), a part row of the
 *  contents (`'tocRow'`) or a box style's design (`'box'`, #1014). It sets
 *  the default `overflow` of the slot's text elements
 *  ({@link defaultTextOverflow}). */
export type DesignSlotKind = HeaderFooterSlotKind | 'heading' | 'part' | 'tocRow' | 'box';

/** The `overflow` of a text element of a `kind` slot that sets none: a
 *  heading or part title and a box design's text wrap onto more lines, a
 *  running head, a folio and a contents part row (whose height is fixed)
 *  end in `…`. */
export function defaultTextOverflow(kind: DesignSlotKind): TextOverflow {
  return kind === 'heading' || kind === 'part' || kind === 'box' ? 'wrap' : 'ellipsis-end';
}

/** The running-head side a legacy (pre-placement) slot of `kind` is
 *  migrated as: a footer's anchors from the foot, every other from the
 *  head. */
export function legacyKind(kind: DesignSlotKind): HeaderFooterSlotKind {
  return kind === 'footer' ? 'footer' : 'header';
}

export const DEFAULT_MARGIN_FROM_BODY: Dimension = { value: 6, unit: 'pt' };
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

export function defaultSlotFor(kind: DesignSlotKind): ResolvedDesignSlot {
  if (kind === 'header') return DEFAULT_HEADER_SLOT;
  if (kind === 'footer') return DEFAULT_FOOTER_SLOT;
  return EMPTY_SLOT;
}
