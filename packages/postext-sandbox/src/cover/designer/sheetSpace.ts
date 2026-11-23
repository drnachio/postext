// The cover page's pixels and the sheet's millimetres: the page has the
// marks' room (`trimOffset`) round the sheet's trim. The designer draws in
// sheet mm over the painted page with an SVG whose view box is the page.

import type { VDTDocument } from 'postext';
import type { ProductionSheet, SheetRect } from 'postext/production';

const MM_PER_IN = 25.4;

export interface SheetSpace {
  /** The page's view box, in sheet mm. */
  viewBox: SheetRect;
  /** Page px per mm. */
  k: number;
}

export function sheetSpace(sheet: ProductionSheet, doc: Pick<VDTDocument, 'trimOffset' | 'config' | 'pages'>): SheetSpace {
  const k = (doc.config.page.dpi || 300) / MM_PER_IN;
  const off = Math.max(0, doc.trimOffset) / k;
  const page = doc.pages[0]!;
  return { k, viewBox: { x: sheet.trim.x - off, y: sheet.trim.y - off, width: page.width / k, height: page.height / k } };
}

/** A pointer's place on the sheet, mm, from where it is on the SVG. */
export function pointerMm(space: SheetSpace, box: DOMRect, clientX: number, clientY: number): { x: number; y: number } {
  const v = space.viewBox;
  return { x: v.x + ((clientX - box.left) / box.width) * v.width, y: v.y + ((clientY - box.top) / box.height) * v.height };
}
