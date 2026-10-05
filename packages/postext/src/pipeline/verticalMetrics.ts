/**
 * The axis vertical text is centred on, measured once per font family and
 * stored on each vertical page (`VDTFlowFrame.centralBaselines`), so every
 * renderer turns an upright character about the same point; and the
 * advance of each dash the flow stretches to its cell
 * (`VDTFlowFrame.dashAdvances`), for the renderers that have no font
 * metrics of their own.
 */

import { verticalFlowOf, type VDTBlock, type VDTDesignSlot, type VDTDocument, type VDTLine, type VDTPage } from '../vdt';
import { fontEm, fontFamilyOf, measureCentralBaseline } from '../measure/vertical';
import { measureTextWidth } from '../measure/canvas';
import { stretchedDashesOf } from '../writingMode';

/** What a vertical page's flow sets: the font strings of its text, and the
 *  stretched dashes set in each (by font string). */
interface FlowFonts {
  fonts: Set<string>;
  dashes: Map<string, Set<string>>;
}

/** Record the stretched dashes of `text`, set in each of `fonts`. */
function addDashes(text: string | undefined, fonts: readonly (string | undefined)[], out: FlowFonts): void {
  if (!text) return;
  const found = stretchedDashesOf(text);
  if (found.length === 0) return;
  for (const font of fonts) {
    if (!font) continue;
    let set = out.dashes.get(font);
    if (!set) out.dashes.set(font, (set = new Set()));
    for (const d of found) set.add(d);
  }
}

function addLines(lines: readonly VDTLine[] | undefined, blockFonts: readonly (string | undefined)[], out: FlowFonts): void {
  for (const line of lines ?? []) {
    if (!line.segments || line.segments.length === 0) addDashes(line.text, blockFonts, out);
    for (const seg of line.segments ?? []) {
      if (seg.fontString) out.fonts.add(seg.fontString);
      for (const run of seg.chip?.runs ?? []) if (run.fontString) out.fonts.add(run.fontString);
      addDashes(seg.text, seg.fontString ? [seg.fontString] : blockFonts, out);
      for (const run of seg.ruby?.runs ?? []) addDashes(run.text, [run.fontString], out);
      for (const run of seg.warichu?.runs ?? []) addDashes(run.text, [run.fontString], out);
      for (const run of seg.sideMarker?.runs ?? []) addDashes(run.text, [run.fontString], out);
    }
  }
}

function addSlot(slot: VDTDesignSlot | undefined, out: FlowFonts): void {
  for (const b of slot?.blocks ?? []) {
    if (b.kind !== 'text') continue;
    out.fonts.add(b.fontString);
    for (const line of b.lines) {
      if (!line.runs) addDashes(line.text, [b.fontString], out);
      for (const run of line.runs ?? []) {
        out.fonts.add(run.fontString);
        addDashes(run.text, [run.fontString], out);
      }
    }
  }
}

function addBlock(b: VDTBlock, out: FlowFonts): void {
  if (b.hidden) return;
  // A resource block stands upright: its text is horizontal.
  if (b.resourceBlock) return;
  if (b.designOverlay) addSlot(b.designOverlay, out);
  const { fonts } = out;
  fonts.add(b.fontString);
  if (b.boldFontString) fonts.add(b.boldFontString);
  if (b.italicFontString) fonts.add(b.italicFontString);
  if (b.boldItalicFontString) fonts.add(b.boldItalicFontString);
  if (b.bulletFontString) fonts.add(b.bulletFontString);
  if (b.separatorFontString) fonts.add(b.separatorFontString);
  addLines(b.lines, [b.fontString, b.boldFontString, b.italicFontString, b.boldItalicFontString], out);
  const bulletFont = b.bulletFontString ?? b.fontString;
  addDashes(b.bulletText, [bulletFont], out);
  addDashes(b.separatorText, [b.separatorFontString ?? bulletFont], out);
  addDashes(b.prefixText, [b.separatorFontString ?? bulletFont], out);
}

/** The font strings a vertical page sets in its flow, and its dashes. */
function flowFonts(page: VDTPage): FlowFonts {
  const out: FlowFonts = { fonts: new Set(), dashes: new Map() };
  for (const col of page.columns) for (const b of col.blocks) addBlock(b, out);
  for (const b of page.floats ?? []) addBlock(b, out);
  for (const b of page.marginNotes) addBlock(b, out);
  addSlot(page.openerBand, out);
  return out;
}

/** The families of `fonts`, sorted. */
function familiesOf(fonts: Iterable<string>): string[] {
  const families = new Set<string>();
  for (const f of fonts) {
    const family = fontFamilyOf(f);
    if (family) families.add(family);
  }
  return [...families].sort();
}

/** The advance of each stretched dash, in ems of its font, per family
 *  (the first font string of a family measures it); undefined when the
 *  flow sets none. */
function dashAdvances(dashes: Map<string, Set<string>>): Record<string, Record<string, number>> | undefined {
  if (dashes.size === 0) return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const font of [...dashes.keys()].sort()) {
    const family = fontFamilyOf(font);
    if (!family) continue;
    const perFamily = out[family] ?? (out[family] = {});
    for (const dash of [...dashes.get(font)!].sort()) {
      if (perFamily[dash] !== undefined) continue;
      const em = fontEm(font);
      perFamily[dash] = Math.round((measureTextWidth(dash, font) / em) * 10000) / 10000;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Measure and store the central baseline of every family set in the flow
 *  of each vertical page, and the advance of the dashes it stretches.
 *  Horizontal pages are left alone. */
export function stampCentralBaselines(doc: VDTDocument): void {
  for (const page of doc.pages) {
    const flow = verticalFlowOf(page);
    if (!flow) continue;
    const found = flowFonts(page);
    const out: Record<string, number> = {};
    for (const family of familiesOf(found.fonts)) out[family] = measureCentralBaseline(family);
    if (Object.keys(out).length > 0) flow.centralBaselines = out;
    else delete flow.centralBaselines;
    const dashes = dashAdvances(found.dashes);
    if (dashes) flow.dashAdvances = dashes;
    else delete flow.dashAdvances;
  }
}
