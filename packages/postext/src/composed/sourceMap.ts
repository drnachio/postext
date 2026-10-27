/**
 * The source map of a laid-out document (#857, DESIGN §6): what a point of
 * a page shows and where it is written, and the reverse, what a range of
 * the Markdown became on the pages.
 *
 * Nothing here lays anything out: it reads what the layout stamped on the
 * VDT. Body text (in the flow or in a frame) carries `sourceMap` per block
 * and `plainStart`/`plainEnd` per line; a chip carries the offsets of its
 * words (`VDTChip.sourceOffsets`); a frame its template entry
 * (`VDTFrame.configPath`) and the range of its slot's content; a composed
 * page its template and its page fence; a design block (decoration, running
 * heads) its element (`elementId`, `configPath`) and, when it shows an
 * attribute, the attribute's name and value range (`attr`); a contents
 * entry the heading it lists (`tocEntry.headingSource`).
 *
 * `sourceAt` answers with the innermost element first and its ancestors
 * after it (text → paragraph → frame → group → template), each with a
 * stable id ({@link ./ids}), so a host can widen a selection level by
 * level and find the same element again after a relayout or in another
 * locale of the chapter.
 */
import { type BoundingBox, type VDTDocument, type VDTDesignSlot, pageToFlow, type VDTFrame, pageIsMirrored, type VDTPage, type VDTBlock } from '../vdt.js';
import { composedSheetClipOnSheet, composedPaintOrder, paintsOverFrames, composedFrameBlockIds, frameContentRect, frameOfBlock } from './paint.js';
import { designElementId, composedPageElementId } from './ids.js';
import { comicChainAt, comicTextAncestors, comicElementsForSource, findComicElement } from '../comics/sourceMap.js';
import { designChain, designTextSource, headingDesignChain, enclosingBoxes, textChain, blockElement, labelChain } from './sourceMap/chains.js';
import { slotElement, templateElement, frameChain, frameAncestors, unfacing, uprightRect } from './sourceMap/frames.js';
import { fileOf, inside, inFlowFrame, inQueriedChapter, flowOf, ofBlock, lineRange } from './sourceMap/text.js';

/** Where something painted comes from. Markdown offsets are absolute in
 *  the chapter file (front matter counted), as every `sourceStart` of the
 *  VDT; `file` is the host's name for that file, when it gave one. */
export type SourceRef =
  | { kind: 'markdown'; start: number; end: number; file?: string; chapter?: number }
  | { kind: 'config'; path: string }
  | { kind: 'attr'; name: string; start: number; end: number; file?: string; chapter?: number }
  | { kind: 'resource'; resourceId: string; anchor?: string };

/** The selection level of a {@link SourceElement}, innermost first:
 *  `text` a glyph (or a chip, a reference, a formula: one unit of a line),
 *  `attr` an attribute an element shows, `label` a label of a figure (at
 *  its anchor, `resourceId#anchorId`), `resource` a picture,
 *  `line` a line of text, `block` a paragraph, heading, list item, picture
 *  block…, `box` a callout around it, `frame` a frame of a composed page,
 *  `group` a group of frames, `design` an element of a design slot,
 *  `slot` that slot (decoration, header, footer), `template` the composed
 *  page and its template. */
export type SourceLevel = 'text' | 'attr' | 'label' | 'resource' | 'line' | 'block' | 'box' | 'frame' | 'group' | 'design' | 'slot' | 'template';

export interface SourceElement {
  level: SourceLevel;
  /** Stable on a composed page (`cp<fence>:…`): the same across relayouts
   *  and in every locale of the chapter. Elsewhere the block's id. */
  id: string;
  source: SourceRef;
  /** The Markdown the element holds, when that is not its `source`: a
   *  frame's slot content, a composed page's fence, a box's fence. */
  content?: { start: number; end: number };
  /** Set when the Markdown of `source` and `content` is another chapter's
   *  (#943): text a story carried in from an earlier chapter, laid on this
   *  document's pages. The position of that chapter in the book; absent:
   *  this document's own file. */
  chapter?: number;
  /** The element's box on the page (px): upright, before its frame's turn
   *  (`rotate`). In the page's flow frame when {@link flow} is set, as the
   *  VDT has it. */
  rect?: BoundingBox;
  /** Set when `rect` is in the page's flow frame, not on the sheet: the
   *  flow text of a vertical or right-to-left page, and a composed page's
   *  frames and what they hold there (#929). `flowRectToPage` /
   *  `flowToPage` put it on the sheet, where `sourceAt` reads its point. */
  flow?: true;
  /** Degrees the element's frame is turned, clockwise about the frame's
   *  centre; absent when upright. */
  rotate?: number;
  /** A contents entry (`:::toc`): where the heading it lists starts in its
   *  chapter's Markdown body (front matter not counted, as outlines count). */
  heading?: number;
  /** Set on an element laid past its frame's foot: kept in the source map,
   *  clipped on the page (`frameOverflow`). */
  clipped?: true;
  /** Set on the half of a spread frame shown on the page facing the one
   *  that reads it (`VDTFrame.facingBlocks`, #861): its id is the read
   *  block's. */
  facing?: true;
}

export interface SourceMapOptions {
  /** The file each page's Markdown offsets belong to: the chapter's name,
   *  or one per page for a document stitched from several chapters. */
  file?: string | ((pageIndex: number) => string | undefined);
  /** The file of the chapter at a position of the book, for text a story
   *  carried in from another chapter (#943; `SourceElement.chapter`). */
  chapterFile?: (chapter: number) => string | undefined;
  /** `elementsForSource`: the chapter the offsets given are in (its
   *  position in the book), and the position of the chapter `doc` is. By
   *  default the offsets are `doc`'s own: text carried in from another
   *  chapter is not found by them. */
  chapter?: number;
  ownChapter?: number;
}

/**
 * What page `pageIndex` of `doc` shows at `(x, y)` (page px, the sheet's
 * top-left origin), innermost first, each element followed by the ones
 * that hold it: on a composed page a glyph, its line, its paragraph, the
 * boxes round it, its frame, the frame's groups and the template; a design
 * element and its slot; on any other page the flow's text, pictures and
 * boxes, the running heads. Empty when nothing is there.
 */
export function sourceAt(doc: VDTDocument, pageIndex: number, x: number, y: number, options?: SourceMapOptions): SourceElement[] {
  const page = doc.pages[pageIndex];
  if (!page) return [];
  const file = fileOf(options, pageIndex);
  const p = { x, y };
  const composed = page.composed;
  const furniture = (slot: VDTDesignSlot | undefined, name: 'header' | 'footer'): SourceElement[] | undefined => {
    if (!slot) return undefined;
    const idOf = (el: string) => (composed ? designElementId(composed.fenceIndex, name, el) : `p${pageIndex}:${name}:${el}`);
    for (let i = slot.blocks.length - 1; i >= 0; i--) {
      const chain = designChain(slot.blocks[i]!, i, p, idOf, composed, file);
      if (!chain) continue;
      const own = slotElement(slot, composed ? `cp${composed.fenceIndex}:${name}` : `p${pageIndex}:${name}`);
      return [...chain, ...(own ? [own] : []), ...(composed ? [templateElement(composed)] : [])];
    }
    return undefined;
  };
  // The running heads paint over everything else.
  const head = furniture(page.header, 'header') ?? furniture(page.footer, 'footer');
  if (head) return head;
  // A comic's balloons and panels (#885), on the sheet over the flow; a
  // text panel's words answer below, as the page's blocks.
  // Its blocks are in the page's flow frame (#909).
  const textPoint = page.flow ? pageToFlow(page, x, y) : p;
  const onText = (frame: VDTFrame): boolean => (page.floats ?? []).some((b) => b.type !== 'callout' && frame.blockIds.includes(b.id) && inside(b.bbox, textPoint));
  const comic = comicChainAt(page, p, file, designTextSource, onText);
  if (comic) return comic;
  if (composed) {
    // The frames are laid in the page's flow frame, mirrored on a
    // right-to-left page and turned on a vertical one (#929); the
    // decoration stands on the sheet. A page of a spread paints both
    // clipped to its part of the sheet (#861).
    const fp = page.flow ? pageToFlow(page, x, y) : p;
    const frameClip = composed.sheetClip;
    const decorationClip = composedSheetClipOnSheet(page);
    const items = composedPaintOrder(page);
    /** A frame hit with nothing of its own at the point (its box, its
     *  padding, an empty frame): a text element of the decoration under it
     *  answers in its place (#984), and the frame when there is none. */
    let bare: SourceElement[] | undefined;
    // Topmost first: the paint order read backwards.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.kind === 'frame') {
        if (bare) continue;
        if (frameClip && !inside(frameClip, fp)) continue;
        const chain = frameChain(doc, page, item.frame, item.blocks, fp, file, item.facing);
        if (!chain) continue;
        const found = inFlowFrame(page, chain);
        if (found[0]?.level !== 'frame') return found;
        bare = found;
        continue;
      }
      const deco = composed.decoration;
      if (!deco || (decorationClip && !inside(decorationClip, p))) continue;
      // The `'over'` item (#1076) holds the connectors painted over the
      // frames, the decoration item the rest; the blocks keep their
      // indices in the slot.
      const over = item.kind === 'over';
      for (let k = deco.blocks.length - 1; k >= 0; k--) {
        if (paintsOverFrames(deco.blocks[k]!) !== over) continue;
        const chain = designChain(deco.blocks[k]!, k, p, (el) => designElementId(composed.fenceIndex, 'decoration', el), composed, file);
        if (!chain) continue;
        // Under a bare frame only a text element wins (its words come from
        // the Markdown, a page attribute or the configuration alike).
        if (bare && deco.blocks[k]!.kind !== 'text') continue;
        const own = slotElement(deco, `cp${composed.fenceIndex}:decoration`);
        return [...chain, ...(own ? [own] : []), templateElement(composed)];
      }
    }
    if (bare) return bare;
    return inside({ x: 0, y: 0, width: page.width, height: page.height }, p) ? [templateElement(composed)] : [];
  }
  // The flow: blocks are in the page's flow frame.
  const fp = pageIsMirrored(page) || page.flow ? pageToFlow(page, x, y) : p;
  const onPage = doc.blocks.filter((b) => b.pageIndex === pageIndex);
  const floats = page.floats ?? [];
  const all = [...onPage, ...floats.filter((f) => !onPage.includes(f))];
  const boxes = all.filter((b) => b.type === 'callout');
  // A heading drawn by its design, in a column or a box (#906).
  const flowed = (chain: SourceElement[]): SourceElement[] => (page.flow ? chain.map((e) => ({ ...e, flow: true as const })) : chain);
  for (const b of all) {
    const chain = headingDesignChain(b, fp, file);
    if (chain) return flowed([...chain, ...enclosingBoxes(b, boxes, file)]);
  }
  // The words of a strip's text panel (#959) lie over the strip's block: they
  // answer before it does.
  const stripText = composedFrameBlockIds(page);
  const onStripText = stripText.size > 0 && floats.some((f) => f.type !== 'callout' && stripText.has(f.id) && inside(f.bbox, fp));
  for (const b of all) {
    if (b.type === 'callout' || b.hidden || b.designOverlay) continue;
    if (onStripText && b.comic) continue;
    if (!inside(b.bbox, fp)) continue;
    return [...flowed([...textChain(b, fp, file), ...enclosingBoxes(b, boxes, file)]), ...comicTextAncestors(page, b.id, file)];
  }
  for (const b of boxes) {
    if (!inside(b.bbox, fp)) continue;
    const el = blockElement(b, file);
    if (el) return flowed([el, ...enclosingBoxes(b, boxes, file)]);
  }
  return [];
}

/** An element {@link elementsForSource} found, on its page. */
export interface SourceMatch {
  pageIndex: number;
  element: SourceElement;
}

const overlaps = (a: BoundingBox, b: BoundingBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const meets = (a: { start: number; end: number }, start: number, end: number): boolean =>
  end > start ? a.start < end && a.end > start : a.start <= start && a.end >= start;

/**
 * Everything of `doc` laid out from the Markdown range `[start, end)`
 * (absolute offsets; an empty range finds what holds the offset): the
 * lines and blocks of text, the frames whose slot content it touches, the
 * composed pages whose fence it touches, the design text that shows an
 * attribute written there; in page order, frames and pages before their
 * content. Lines laid past their frame's foot come with `clipped`.
 */
export function elementsForSource(doc: VDTDocument, start: number, end: number, options?: SourceMapOptions): SourceMatch[] {
  const out: SourceMatch[] = [];
  const blockFrame = new Map<string, { frame: VDTFrame; page: VDTPage }>();
  for (const page of doc.pages) {
    // Comics (#885): the comic, its frames and its balloons.
    for (const element of comicElementsForSource(page, (r) => meets(r, start, end), fileOf(options, page.index))) out.push({ pageIndex: page.index, element });
    const composed = page.composed;
    if (!composed) continue;
    const file = fileOf(options, page.index);
    if (inQueriedChapter(options, undefined) && meets({ start: composed.sourceStart, end: composed.sourceEnd }, start, end)) out.push({ pageIndex: page.index, element: templateElement(composed) });
    for (const frame of composed.frames) {
      for (const id of frame.blockIds) blockFrame.set(id, { frame, page });
      if (frame.sourceStart === undefined || frame.sourceEnd === undefined) continue;
      if (!inQueriedChapter(options, frame.sourceChapter)) continue;
      if (!meets({ start: frame.sourceStart, end: frame.sourceEnd }, start, end)) continue;
      const el = frameAncestors(doc, page, frame)[0]!;
      // On a spread, the part of the frame this page paints (#877): a band
      // that crosses the spine has most of its box on the facing page.
      const shown = composed.sheetClip && el.rect && !frame.rotate ? intersect(el.rect, composed.sheetClip) : el.rect;
      if (!shown) continue;
      out.push({ pageIndex: page.index, element: { ...el, rect: shown, ...flowOf(page) } });
    }
    for (const [name, slot] of [['decoration', composed.decoration], ['header', page.header], ['footer', page.footer]] as const) {
      slot?.blocks.forEach((b, i) => {
        if (b.kind !== 'text' || b.sourceStart === undefined || b.sourceEnd === undefined) return;
        if (!inQueriedChapter(options, undefined) || !meets({ start: b.sourceStart, end: b.sourceEnd }, start, end)) return;
        out.push({
          pageIndex: page.index,
          element: {
            level: 'text',
            id: designElementId(composed.fenceIndex, name, b.elementId ?? `#${i}`),
            source: b.attr !== undefined ? { kind: 'attr', name: b.attr, start: b.sourceStart, end: b.sourceEnd, ...file } : { kind: 'markdown', start: b.sourceStart, end: b.sourceEnd, ...file },
            rect: { ...b.bbox },
          },
        });
      });
    }
  }
  /** The lines, block and labels of `block` the range touches. */
  const blockMatches = (block: VDTBlock, pageIndex: number, held: { frame: VDTFrame } | undefined, facing: boolean): void => {
    if (block.sourceStart === undefined || block.sourceEnd === undefined || block.type === 'callout') return;
    if (!inQueriedChapter(options, block.sourceChapter)) return;
    if (!meets({ start: block.sourceStart, end: block.sourceEnd }, start, end)) return;
    const file = ofBlock(fileOf(options, pageIndex), block);
    // The frame's foot in its blocks' own coordinates (larger when the
    // frame's text is scaled, #858).
    const foot = held ? frameContentRect(held.frame).y + frameContentRect(held.frame).height : Infinity;
    const extra = {
      ...(held?.frame.rotate ? { rotate: held.frame.rotate } : {}),
      ...(facing ? { facing: true as const } : {}),
      ...flowOf(doc.pages[pageIndex]),
    };
    const id = facing ? unfacing(block.id) : block.id;
    // A page of a spread shows only its part of the sheet (#861): what a
    // frame across the spine sets on the other half is the facing page's.
    const clip = doc.pages[pageIndex]?.composed?.sheetClip;
    const shown = (r: BoundingBox): boolean => !clip || overlaps(clip, r);
    block.lines.forEach((line, index) => {
      const range = lineRange(block, line);
      if (!range || !meets(range, start, end) || !shown(uprightRect(held?.frame, line.bbox))) return;
      out.push({
        pageIndex,
        element: {
          level: 'line',
          id: `${id}:l${index}`,
          source: { kind: 'markdown', ...range, ...file },
          rect: uprightRect(held?.frame, line.bbox),
          ...extra,
          ...(line.bbox.y + line.bbox.height > foot + 0.5 ? { clipped: true as const } : {}),
        },
      });
    });
    // The labels of a figure (#857), by their text.
    const rb = block.resourceBlock;
    for (const label of rb?.labels ?? []) {
      if (!meets({ start: label.sourceStart, end: label.sourceEnd }, start, end)) continue;
      const el = labelChain(label, rb!.resource.id, id, { x: 0, y: 0 }, file).find((e) => e.level === 'label')!;
      const rect = el.rect ? uprightRect(held?.frame, el.rect) : undefined;
      if (rect && !shown(rect)) continue;
      out.push({ pageIndex, element: { ...el, ...(rect ? { rect } : {}), ...extra } });
    }
    const el = blockElement(block, file);
    if (el) out.push({ pageIndex, element: { ...el, id, ...(el.rect ? { rect: uprightRect(held?.frame, el.rect) } : {}), ...extra } });
  };
  const seen = new Set<string>();
  for (const block of doc.blocks) {
    if (block.pageIndex < 0 || seen.has(block.id)) continue;
    seen.add(block.id);
    blockMatches(block, block.pageIndex, blockFrame.get(block.id), false);
  }
  // The halves of spread frames shown on the facing page (#861).
  for (const page of doc.pages) {
    for (const frame of page.composed?.frames ?? []) {
      for (const b of frame.facingBlocks ?? []) blockMatches(b, page.index, { frame }, true);
    }
  }
  return out.sort((a, b) => a.pageIndex - b.pageIndex);
}

/** The overlap of two rectangles, or undefined when they do not meet. */
function intersect(a: BoundingBox, b: BoundingBox): BoundingBox | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/** The element of `doc` with stable id `id` (a frame `cp0:dinero`, a
 *  composed page `cp0`, a block, a design element `cp0:decoration:tema`,
 *  a figure label `cp0:mapa:label:madrid`),
 *  on its page: what a host looks up again after a relayout. */
export function findElement(doc: VDTDocument, id: string, options?: SourceMapOptions): SourceMatch | undefined {
  for (const page of doc.pages) {
    // A comic, its frames and balloons (`cm<n>…`, #885).
    const comicEl = findComicElement(page, id, fileOf(options, page.index));
    if (comicEl) return { pageIndex: page.index, element: comicEl };
    const composed = page.composed;
    if (!composed) continue;
    if (composedPageElementId(composed.fenceIndex) === id) return { pageIndex: page.index, element: templateElement(composed) };
    for (const frame of composed.frames) if (frame.id === id) return { pageIndex: page.index, element: { ...frameAncestors(doc, page, frame)[0]!, ...flowOf(page) } };
    for (const [name, slot] of [['decoration', composed.decoration], ['header', page.header], ['footer', page.footer]] as const) {
      const i = slot?.blocks.findIndex((b, k) => designElementId(composed.fenceIndex, name, b.elementId ?? `#${k}`) === id) ?? -1;
      const b = i >= 0 ? slot!.blocks[i]! : undefined;
      if (b) return { pageIndex: page.index, element: { level: 'design', id, source: b.configPath !== undefined ? { kind: 'config', path: b.configPath } : { kind: 'config', path: '' }, rect: { ...b.bbox } } };
    }
  }
  for (const b of doc.blocks) {
    const label = b.pageIndex >= 0 ? b.resourceBlock?.labels?.find((l) => l.id === id) : undefined;
    if (label) {
      const el = labelChain(label, b.resourceBlock!.resource.id, b.id, { x: 0, y: 0 }, fileOf(options, b.pageIndex)).find((e) => e.level === 'label')!;
      const frame = frameOfBlock(doc.pages[b.pageIndex]?.composed, b.id);
      return { pageIndex: b.pageIndex, element: { ...(el.rect && frame ? { ...el, rect: uprightRect(frame, el.rect) } : el), ...flowOf(doc.pages[b.pageIndex]) } };
    }
  }
  const block = doc.blocks.find((b) => b.id === id && b.pageIndex >= 0);
  if (!block) return undefined;
  const el = blockElement(block, fileOf(options, block.pageIndex));
  // Upright on the page when its frame's text is scaled (#858).
  const frame = frameOfBlock(doc.pages[block.pageIndex]?.composed, block.id);
  return el ? { pageIndex: block.pageIndex, element: { ...(el.rect && frame ? { ...el, rect: uprightRect(frame, el.rect) } : el), ...flowOf(doc.pages[block.pageIndex]) } } : undefined;
}
