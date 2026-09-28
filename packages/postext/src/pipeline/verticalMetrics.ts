/**
 * The axis vertical text is centred on, measured once per font family and
 * stored on each vertical page (`VDTFlowFrame.centralBaselines`), so every
 * renderer turns an upright character about the same point.
 */

import type { VDTBlock, VDTDesignSlot, VDTDocument, VDTLine, VDTPage } from '../vdt';
import { fontFamilyOf, measureCentralBaseline } from '../measure/vertical';

function addLines(lines: readonly VDTLine[] | undefined, fonts: Set<string>): void {
  for (const line of lines ?? []) {
    for (const seg of line.segments ?? []) {
      if (seg.fontString) fonts.add(seg.fontString);
      for (const run of seg.chip?.runs ?? []) if (run.fontString) fonts.add(run.fontString);
    }
  }
}

function addSlot(slot: VDTDesignSlot | undefined, fonts: Set<string>): void {
  for (const b of slot?.blocks ?? []) {
    if (b.kind !== 'text') continue;
    fonts.add(b.fontString);
    for (const line of b.lines) for (const run of line.runs ?? []) fonts.add(run.fontString);
  }
}

function addBlock(b: VDTBlock, fonts: Set<string>): void {
  if (b.hidden) return;
  // A resource block stands upright: its text is horizontal.
  if (b.resourceBlock) return;
  if (b.designOverlay) addSlot(b.designOverlay, fonts);
  fonts.add(b.fontString);
  if (b.boldFontString) fonts.add(b.boldFontString);
  if (b.italicFontString) fonts.add(b.italicFontString);
  if (b.boldItalicFontString) fonts.add(b.boldItalicFontString);
  if (b.bulletFontString) fonts.add(b.bulletFontString);
  if (b.separatorFontString) fonts.add(b.separatorFontString);
  addLines(b.lines, fonts);
}

/** The families whose text a vertical page sets in its flow. */
function flowFamilies(page: VDTPage): string[] {
  const fonts = new Set<string>();
  for (const col of page.columns) for (const b of col.blocks) addBlock(b, fonts);
  for (const b of page.floats ?? []) addBlock(b, fonts);
  for (const b of page.marginNotes) addBlock(b, fonts);
  addSlot(page.openerBand, fonts);
  const families = new Set<string>();
  for (const f of fonts) {
    const family = fontFamilyOf(f);
    if (family) families.add(family);
  }
  return [...families].sort();
}

/** Measure and store the central baseline of every family set in the flow
 *  of each vertical page. Horizontal pages are left alone. */
export function stampCentralBaselines(doc: VDTDocument): void {
  for (const page of doc.pages) {
    if (!page.flow) continue;
    const out: Record<string, number> = {};
    for (const family of flowFamilies(page)) out[family] = measureCentralBaseline(family);
    if (Object.keys(out).length > 0) page.flow.centralBaselines = out;
    else delete page.flow.centralBaselines;
  }
}
