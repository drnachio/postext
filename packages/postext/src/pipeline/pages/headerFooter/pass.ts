// The header/footer pass around layoutHeadersAndFooters: its inputs, the
// folio and connector warnings it records per document, the page
// backgrounds of palette overrides, the blocks running marks read (#1276: split out of headerFooter.ts).
import { getMeasureWritingMode, setMeasureWritingMode } from '../../../measure/vertical.js';
import type { PartPageInfo } from '../placeholders.js';
import type { FlowColorValues } from '../../sections/partPalette.js';
import type { Resource, ResolvedDesignSlot, ColorValue, ColorPaletteEntry } from '../../../types.js';
import type { VDTDocument, VDTFrame, ContentWarning, VDTBlock } from '../../../vdt.js';
import { partMarkPages } from '../../sections/parts.js';
import { type PageFurniture, folioMissingWarnings } from '../../../composed/furniture.js';
import type { DesignFrames } from '../../../design/layout.js';
import { layoutHeadersAndFooters } from './layoutHeadersAndFooters.js';

/**
 * After body placement finishes, attach header/footer slots to every page.
 * `resourceById` resolves the `kind: 'image'` elements of the designs.
 */
/** The pages as `computePartValues` reads them, with the parts set without
 *  a divider page (`doc.partMarks`) standing on the page of the first block
 *  placed after their fence. */
export function pagesWithPartMarks(doc: VDTDocument): PartPageInfo[] {
  if (!doc.partMarks || doc.partMarks.length === 0) return doc.pages;
  const marked = new Map<number, NonNullable<PartPageInfo['partInfo']>>();
  const pages = partMarkPages(doc);
  doc.partMarks.forEach((mark, i) => {
    const page = pages[i];
    if (page !== undefined) marked.set(page, { number: mark.number, title: mark.title, ...(mark.palette ? { palette: mark.palette } : {}) });
  });
  return doc.pages.map((p, i) => (marked.has(i) && !p.partInfo ? { ...p, partInfo: marked.get(i) } : p));
}

/** What the header/footer pass needs from the content beyond the laid-out
 *  document. */
export interface HeaderFooterInputs {
  /** For a paragraph content block inside a `:::paragraphs{style=…}`
   *  container: the style id and the paragraph's leading bold text, which
   *  `{firstMark.<style>}` / `{lastMark.<style>}` print. */
  paragraphMark?: (contentIndex: number) => { styleId: string; text: string } | undefined;
  /** What each kind of flow colour takes under a page's palette overrides
   *  where two palette entries share a base value (see
   *  `flowColorValues`). Without it such a value takes the last override
   *  that changes it. */
  flowColorValues?: (overrides: Readonly<Record<string, string>>) => FlowColorValues;
}

/**
 * The page frames a heading design inside a composed-page frame is laid out
 * with (#906): in the frame's blocks' own coordinates, where a frame whose
 * text the reflow ladder scaled (#858) lays its content out `1 / scale` as
 * large from its top-left, so a design element anchored to the page lands
 * on the page once the frame is painted scaled. A turned frame's
 * (`rotate`) are left upright: what is anchored to the page turns with the
 * frame.
 */
export function framesInFrame(frames: DesignFrames | undefined, frame: Pick<VDTFrame, 'rect' | 'scale'>): DesignFrames | undefined {
  const s = frame.scale;
  if (!frames || !(s > 0) || Math.abs(s - 1) < 1e-9) return frames;
  const o = frame.rect;
  const back = (r: { x: number; y: number; width: number; height: number }) => ({ x: o.x + (r.x - o.x) / s, y: o.y + (r.y - o.y) / s, width: r.width / s, height: r.height / s });
  return { ...frames, page: back(frames.page), bleed: back(frames.bleed), ...(frames.outer ? { outer: back(frames.outer) } : {}) };
}

/** The ends of connectors at an anchor no picture of their frame has
 *  (#1057), per document, as `labelAnchorUnknown` warnings with the
 *  connector's id (read by {@link connectorAnchorUnknownWarnings}). */
export const connectorAnchorWarnings = new WeakMap<VDTDocument, ContentWarning[]>();

/** Per document, the furniture each composed page's running heads and
 *  decoration meant to draw (#1163), read by {@link pageFurnitureWarnings}. */
export const pageFurnitureByDoc = new WeakMap<VDTDocument, PageFurniture[]>();

/** The `folioMissing` warnings of `doc` (#1163): a composed page that draws
 *  no folio or running head most pages of its template and side draw. */
export function pageFurnitureWarnings(doc: VDTDocument): ContentWarning[] {
  const records = pageFurnitureByDoc.get(doc);
  return records && records.length > 0 ? folioMissingWarnings(doc.pages, records) : [];
}

/** The `labelAnchorUnknown` warnings of the connectors of `doc`'s composed
 *  pages (#1057): an end set at an anchor no picture of its frame has. */
export function connectorAnchorUnknownWarnings(doc: VDTDocument): ContentWarning[] {
  return connectorAnchorWarnings.get(doc) ?? [];
}

export function buildHeadersAndFooters(doc: VDTDocument, resourceById?: ReadonlyMap<string, Resource>, inputs: HeaderFooterInputs = {}): void {
  // Each page's slots measure their text in the writing mode they are set
  // in (see the loop); the mode in force before is put back.
  const measureMode = getMeasureWritingMode();
  try {
    layoutHeadersAndFooters(doc, resourceById, inputs);
  } finally {
    setMeasureWritingMode(measureMode);
  }
}

/** `slot` without the elements anchored to one of `frames` (`'#name'`),
 *  directly or through other elements: the decoration of frames that take
 *  no room on a page added by continuation (#912). */
export function withoutAnchoredTo(slot: ResolvedDesignSlot, frames: ReadonlySet<string>): ResolvedDesignSlot {
  const dropped = new Set<string>();
  const target = (el: ResolvedDesignSlot['elements'][number]): string | undefined => {
    // A connector (#1056) drops its own ends on frames the page lacks.
    if (el.kind === 'connector') return undefined;
    const to = el.placement.anchor.to;
    return to.startsWith('#') ? to.slice(1) : undefined;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const el of slot.elements) {
      const t = target(el);
      if (dropped.has(el.id) || t === undefined || (!frames.has(t) && !dropped.has(t))) continue;
      dropped.add(el.id);
      changed = true;
    }
  }
  return dropped.size > 0 ? { ...slot, elements: slot.elements.filter((el) => !dropped.has(el.id)) } : slot;
}

/** Set `page.background` on the pages whose palette overrides (part and
 *  styled section) change the colour `page.backgroundColor` follows: the
 *  entry it links to (`paletteId`), or, unlinked, an entry of the same
 *  value, as the flow's colours are matched. */
export function stampPageBackgrounds(
  doc: { pages: { index: number; background?: string }[] },
  palettes: readonly (Record<string, string> | undefined)[],
  pageColor: ColorValue,
  basePalette: readonly ColorPaletteEntry[] | undefined,
): void {
  const base = pageColor.hex?.toLowerCase();
  if (!base || base === 'transparent') return;
  const linked = pageColor.paletteId;
  const sameValue = (basePalette ?? []).filter((e) => e.value.hex.toLowerCase() === base).map((e) => e.id);
  for (const page of doc.pages) {
    const overrides = palettes[page.index];
    if (!overrides) continue;
    const id = linked && overrides[linked] !== undefined ? linked : sameValue.find((e) => overrides[e] !== undefined);
    if (!id) continue;
    const hex = overrides[id]!.startsWith('#') ? overrides[id]! : `#${overrides[id]}`;
    if (hex.toLowerCase() !== base) page.background = hex;
  }
}

/** `doc.blocks` as the running marks read them (#874): on a composed page
 *  only its headings count, in frame order, so a chapter that opens in one
 *  of its frames opens the page (`{chapterTitleAtTop}`) even though the
 *  story boxes of the frames come first. The same array when the document
 *  has no composed page. */
export function withComposedHeadings(doc: VDTDocument): VDTBlock[] {
  const composed = new Set<number>();
  for (const page of doc.pages) if (page.composed) composed.add(page.index);
  if (composed.size === 0) return doc.blocks;
  const out: VDTBlock[] = [];
  const seen = new Set<string>();
  let lastComposed = -1;
  const pushFrames = (index: number) => {
    const page = doc.pages[index];
    if (!page?.composed) return;
    const byId = new Map((page.floats ?? []).map((b) => [b.id, b]));
    for (const f of page.composed.frames) {
      for (const id of f.blockIds) {
        const b = byId.get(id);
        if (b && b.headingLevel !== undefined && !seen.has(b.id)) {
          seen.add(b.id);
          out.push(b);
        }
      }
    }
  };
  for (const b of doc.blocks) {
    if (!composed.has(b.pageIndex)) {
      out.push(b);
      continue;
    }
    if (b.pageIndex !== lastComposed) {
      lastComposed = b.pageIndex;
      pushFrames(b.pageIndex);
    }
    if (b.headingLevel !== undefined && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}
