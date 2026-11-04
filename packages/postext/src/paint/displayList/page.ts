// One page as a display list (#1388), in postext-pdf's `paintPage` order:
// a comic page's panels when text frames go over them, column rules, the
// opener band, the columns' blocks (each clipped to its column), contents
// part rows, floats, a composed page's decoration and frames, footnote
// rules — all in the page's flow frame, mirrored or turned onto the sheet
// — then on the sheet a comic page's panels and lettering and the strips
// the page holds (#1394), line numbers, running header and footer.
import type { VDTDocument } from '../../vdt/document.js';
import type { VDTPage } from '../../vdt/pages.js';
import type { VDTBlock } from '../../vdt/blocks.js';
import { pageIsMirrored, pageIsVertical } from '../../vdt/flowFrames.js';
import { columnClipRect } from '../columnClip.js';
import { columnRuleSegments, footnoteRuleSegments, pageColumnRule } from '../columnRule.js';
import { comicHoldsText, comicPaintsUnderText, composedFrameBlockIds, composedPaintOrder, decorationOver, decorationUnder, frameMatrix } from '../../composed/paint.js';
import { comicBlockOnSheet } from '../../comics/transform.js';
import { comicLetteringItems, comicPanelItems } from './comic.js';
import { compose, flowFrame, IDENTITY, placeShape, type Frame } from './frame.js';
import { blockItems, stripCaptionItems, type BlockContext } from './blocks.js';
import { slotItems, type SlotContext } from './design.js';
import type { DisplayItem, DisplayListOptions, DisplayPage } from './types.js';

function slotContext(frame: Frame, vertical: boolean, role: SlotContext['role'], key: string, generated: boolean): SlotContext {
  return { frame, uprightPictures: vertical, role, generated, blockKey: key };
}

/** The floats of a page and the blocks of a floated box, in paint order. */
function floatItems(page: VDTPage, ctx: BlockContext): DisplayItem[] {
  const frameIds = composedFrameBlockIds(page);
  const items: DisplayItem[] = [];
  for (const block of page.floats ?? []) {
    if (frameIds.has(block.id)) continue;
    // A floated strip's caption in float order; its picture on the sheet.
    if (block.comic) items.push(...stripCaptionItems(block, ctx));
    else items.push(...blockItems(block, ctx));
  }
  return items;
}

/** A composed page's decoration and frames (#855), in layer order. */
function composedItems(page: VDTPage, ctx: BlockContext, vertical: boolean): DisplayItem[] {
  const composed = page.composed;
  if (!composed) return [];
  const items: DisplayItem[] = [];
  for (const item of composedPaintOrder(page)) {
    if (item.kind === 'decoration' || item.kind === 'over') {
      const slot = item.kind === 'over' ? decorationOver(composed.decoration) : decorationUnder(composed.decoration);
      // The decoration stands on the sheet of a page with a flow frame.
      if (slot) items.push(...slotItems(slot, slotContext(page.flow ? IDENTITY : ctx.frame, false, 'design', `p${page.index}:decoration`, true)));
      continue;
    }
    const m = frameMatrix(item.frame);
    const frame = m ? compose(ctx.frame, m as unknown as Frame) : ctx.frame;
    for (const block of item.blocks) items.push(...blockItems(block, { ...ctx, frame, vertical: vertical || item.frame.writingMode === 'vertical-rl' }));
  }
  return items;
}

/** The key a comic's balloons are keyed under: its stable id. */
function comicKey(comic: { id?: string; sourceStart: number }, pageIndex: number): string {
  return comic.id ?? `p${pageIndex}:comic${comic.sourceStart}`;
}

/** The display list of page `pageIndex` of `doc` (an index into
 *  `doc.pages`). */
export function pageDisplayList(doc: VDTDocument, pageIndex: number, options?: DisplayListOptions): DisplayPage {
  const page = doc.pages[pageIndex];
  if (!page) throw new RangeError(`pageDisplayList: no page ${pageIndex} (the document has ${doc.pages.length})`);
  const { dpi } = doc.config.page;
  const vertical = pageIsVertical(page);
  const flow = flowFrame(page);
  const ctx: BlockContext = { doc, frame: flow, vertical, options, rtl: pageIsMirrored(page) };
  const items: DisplayItem[] = [];
  // A comic page with text panels: its panels under the flow, its
  // lettering after it.
  const comicUnder = comicPaintsUnderText(page) ? page.comic : undefined;
  if (comicUnder) items.push(...comicPanelItems(comicUnder));
  const strips: VDTBlock[] = [];

  // The page's own column rule on a styled section's pages, else the
  // document's: one segment per gutter of each band.
  const rule = pageColumnRule(page, doc);
  if (rule.enabled && page.columns.length > 1) {
    for (const s of columnRuleSegments(page.columns, page.footnoteAreas)) {
      items.push(placeShape(flow, { kind: 'rule', x1: s.x, y1: s.top, x2: s.x, y2: s.bottom, color: rule.color, widthPx: rule.lineWidthPx }));
    }
  }

  // Opener and part bands go under the columns.
  if (page.openerBand) items.push(...slotItems(page.openerBand, slotContext(flow, vertical, 'opener', `p${page.index}:opener`, false)));

  // Columns: each block clipped to its column (widened for glyph ink and
  // overlays that hang past it); a contents part row's design outside it.
  const hanging = doc.config.cjk?.hangingPunctuation !== 'none';
  for (const col of page.columns) {
    const clip = columnClipRect(col, dpi, hanging);
    const colCtx: BlockContext = { ...ctx, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } };
    const parts: VDTBlock[] = [];
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) {
        parts.push(block);
        continue;
      }
      if (block.comic) {
        // Its caption in the flow, in place; the strip on the sheet below.
        if (!block.hidden) strips.push(block);
        items.push(...stripCaptionItems(block, colCtx));
        continue;
      }
      items.push(...blockItems(block, colCtx));
    }
    for (const block of parts) items.push(...blockItems(block, ctx));
  }

  // Floated resources and boxes carry absolute boxes, unclipped.
  for (const block of page.floats ?? []) if (block.comic && !block.hidden) strips.push(block);
  // A strip with text panels (#959): its panels under the floats that
  // set their text, its lettering after.
  const sheetStrips = strips.flatMap((b) => comicBlockOnSheet(page, b) ?? []);
  for (const comic of sheetStrips) if (comicHoldsText(comic)) items.push(...comicPanelItems(comic));
  items.push(...floatItems(page, ctx));
  items.push(...composedItems(page, ctx, vertical));

  for (const r of footnoteRuleSegments(page)) {
    items.push(placeShape(flow, { kind: 'rule', x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y, color: r.color, widthPx: r.lineWidthPx }));
  }

  // On the sheet: a comic page's panels and lettering, then its strips.
  if (comicUnder) items.push(...comicLetteringItems(comicUnder, comicKey(comicUnder, page.index)));
  else if (page.comic) items.push(...comicPanelItems(page.comic), ...comicLetteringItems(page.comic, comicKey(page.comic, page.index)));
  for (const comic of sheetStrips) {
    if (!comicHoldsText(comic)) items.push(...comicPanelItems(comic));
    items.push(...comicLetteringItems(comic, comicKey(comic, page.index)));
  }

  // On the sheet: line numbers, running header and footer.
  if (page.lineNumbers) items.push(...slotItems(page.lineNumbers, slotContext(IDENTITY, false, 'label', `p${page.index}:lineNumbers`, true)));
  if (page.header) items.push(...slotItems(page.header, slotContext(IDENTITY, false, 'header', `p${page.index}:header`, true)));
  if (page.footer) items.push(...slotItems(page.footer, slotContext(IDENTITY, false, 'footer', `p${page.index}:footer`, true)));

  const out: DisplayPage = { index: page.index, width: page.width, height: page.height, dpi, items };
  const bg = page.background ?? doc.config.page.backgroundColor.hex;
  if (bg && bg !== 'transparent') out.background = bg;
  if (doc.config.page.cutLines.enabled && doc.trimOffset > 0) {
    const t = doc.trimOffset;
    out.trim = { x: t, y: t, width: page.width - 2 * t, height: page.height - 2 * t };
  }
  if (page.pageLabel) out.label = page.pageLabel;
  if (pageIsMirrored(page)) out.rtl = true;
  if (vertical) out.vertical = true;
  return out;
}

/** Every page of `doc` as a display list. */
export function documentDisplayList(doc: VDTDocument, options?: DisplayListOptions): DisplayPage[] {
  return doc.pages.map((_, i) => pageDisplayList(doc, i, options));
}


