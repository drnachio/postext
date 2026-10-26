// The frames of composed and comic pages painted with their items and
// blocks (#1276: split out of pdf-backend/index.ts).
import { type VDTPage, type ComposedPaintPart, composedSheetClip, composedPaintOrder, decorationOver, decorationUnder, type VDTComicPage, comicFramePaintOrder, frameMatrix, frameClips, frameContentRect } from 'postext';
import { FontCache } from '../../fontCache.js';
import { type PageCtx, pushClipRect, popClip, pushFrame, popFrame } from '../primitives.js';
import { type ResourceRenderContext, renderBlock } from '../blocks/blockRender.js';
import { type SlotMark, renderHeaderFooterSlot } from '../page/headerFooter.js';
import { type ComicPanelTags, pushClipPolygon, sheetMatrixToPdf } from '../page/comic.js';
import { type StructElem, tagArtifact } from '../structure/tagging.js';

/**
 * Paint a composed page's frames (#855) in layer order, the template's
 * decoration at layer 0 (when `withDecoration`): each frame's blocks as
 * floats are painted, turned by the frame's matrix and clipped to its box
 * when its content overflows. Tagged, each frame is read in Markdown order
 * (the lowest content index of its blocks), not in the order the layers
 * paint it: `readFloat`'s `readAt`.
 */
export function paintComposedFrames(
  ctx: PageCtx,
  vdtPage: VDTPage,
  fontCache: FontCache,
  resourceCtx: ResourceRenderContext,
  mark: SlotMark | undefined,
  withDecoration: boolean,
  part?: ComposedPaintPart,
): void {
  const structure = resourceCtx.structure;
  // On a page of a spread (#861) the frames and the decoration show the
  // page's share of the sheet only.
  const sheet = composedSheetClip(vdtPage);
  if (sheet) pushClipRect(ctx, sheet.x, sheet.y, sheet.width, sheet.height);
  try {
    paintComposedItems(ctx, vdtPage, fontCache, resourceCtx, mark, withDecoration, structure, part);
  } finally {
    if (sheet) popClip(ctx);
  }
}

function paintComposedItems(
  ctx: PageCtx,
  vdtPage: VDTPage,
  fontCache: FontCache,
  resourceCtx: ResourceRenderContext,
  mark: SlotMark | undefined,
  withDecoration: boolean,
  structure: ResourceRenderContext['structure'],
  part?: ComposedPaintPart,
): void {
  for (const item of composedPaintOrder(vdtPage, part)) {
    if (item.kind === 'decoration' || item.kind === 'over') {
      // The decoration at layer 0, and its connectors over the frames
      // (#1076) after them.
      const decoration = item.kind === 'over' ? decorationOver(vdtPage.composed?.decoration) : decorationUnder(vdtPage.composed?.decoration);
      if (withDecoration && decoration) renderHeaderFooterSlot(ctx, decoration, fontCache, resourceCtx.images, mark);
      continue;
    }
    paintFrameItem(ctx, item, fontCache, resourceCtx, structure);
  }
}

/** The text frames of a comic page (`::panel{text}`, #885), over its
 *  panels: each read as one float, as a composed page's frame is. */
export function paintComicTextFrames(ctx: PageCtx, vdtPage: VDTPage, fontCache: FontCache, resourceCtx: ResourceRenderContext, tags: ComicPanelTags, comic: VDTComicPage | undefined = vdtPage.comic): void {
  for (const item of comicFramePaintOrder(vdtPage, comic)) {
    if (item.kind !== 'frame') continue;
    // Read in the comic's `Div`, in its panel's place (#909).
    const panel = item.frame.panel !== undefined ? comic?.panels.find((q) => q.index === item.frame.panel)?.index : undefined;
    const into = panel !== undefined ? tags?.texts[panel] : undefined;
    paintFrameItem(ctx, item, fontCache, resourceCtx, resourceCtx.structure, into);
  }
}

/** One frame of a paint order: its blocks, turned (and scaled) by its
 *  matrix, clipped to its box when its content overflows and to its
 *  outline when it has one (a comic panel cut by a slanted line, #885). */
function paintFrameItem(
  ctx: PageCtx,
  item: Extract<ReturnType<typeof composedPaintOrder>[number], { kind: 'frame' }>,
  fontCache: FontCache,
  resourceCtx: ResourceRenderContext,
  structure: ResourceRenderContext['structure'],
  into?: StructElem,
): void {
  // A vertical frame of a right-to-left page (#960) is placed by a matrix
  // that includes the page's mirror: its text is not turned back again.
  if (item.frame.unmirrorX === undefined || !ctx.mirror) {
    paintFrameItemIn(ctx, item, fontCache, resourceCtx, structure, into);
    return;
  }
  delete ctx.mirror;
  try {
    paintFrameItemIn(ctx, item, fontCache, resourceCtx, structure, into);
  } finally {
    ctx.mirror = true;
  }
}

function paintFrameItemIn(
  ctx: PageCtx,
  item: Extract<ReturnType<typeof composedPaintOrder>[number], { kind: 'frame' }>,
  fontCache: FontCache,
  resourceCtx: ResourceRenderContext,
  structure: ResourceRenderContext['structure'],
  into?: StructElem,
): void {
  const { frame, blocks } = item;
  if (blocks.length === 0) return;
  // A frame set in its own writing mode (#944): its text is painted as a
  // page of that mode paints its flow, set vertically (or not).
  if (frame.writingMode) {
    const outer = ctx.vertical;
    if (frame.writingMode === 'vertical-rl') {
      const cjk = ctx.frameCjk ?? { region: 'mainland' as const, uprightDigits: 2 };
      ctx.vertical = { region: cjk.region, uprightDigits: cjk.uprightDigits, ...(frame.centralBaselines ? { axes: frame.centralBaselines } : {}) };
    } else delete ctx.vertical;
    try {
      paintFrameBlocks(ctx, item, fontCache, resourceCtx, structure, into);
    } finally {
      if (outer) ctx.vertical = outer;
      else delete ctx.vertical;
    }
    return;
  }
  paintFrameBlocks(ctx, item, fontCache, resourceCtx, structure, into);
}

function paintFrameBlocks(
  ctx: PageCtx,
  item: Extract<ReturnType<typeof composedPaintOrder>[number], { kind: 'frame' }>,
  fontCache: FontCache,
  resourceCtx: ResourceRenderContext,
  structure: ResourceRenderContext['structure'],
  into?: StructElem,
): void {
  const { frame, blocks } = item;
  let readAt: number | undefined;
  for (const b of blocks) if (b.contentIndex !== undefined && (readAt === undefined || b.contentIndex < readAt)) readAt = b.contentIndex;
  // Text carried in from another chapter (#943) is read at its page.
  if (frame.readIndex !== undefined) readAt = frame.readIndex;
  const m = frameMatrix(frame);
  const clips = frameClips(frame);
  const outline = frame.polygon && frame.polygon.length >= 3 ? frame.polygon : undefined;
  if (outline) pushClipPolygon(ctx, outline);
  if (m) pushFrame(ctx, sheetMatrixToPdf(m, ctx.scale, ctx.pageHeightPt));
  // The clip is in the blocks' own frame (larger than the box when the
  // frame's text is scaled, #858).
  const box = frameContentRect(frame);
  if (clips) pushClipRect(ctx, box.x, box.y, box.width, box.height);
  try {
    if (item.facing) {
      // The facing page's half of a frame across a spread's spine: its
      // text is read on the other page, so here it is an artifact.
      tagArtifact(ctx, { type: 'Layout' });
      const untagged: ResourceRenderContext = { ...resourceCtx, structure: undefined };
      for (const fb of blocks) renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, fontCache, untagged);
    } else {
      // A frame's blocks are read as one float (#862), so a list in it
      // stays one list.
      const paint = () => {
        for (const fb of blocks) renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, fontCache, resourceCtx);
      };
      if (structure && into) structure.readInto(into, paint);
      else if (structure) structure.readFloat(blocks[0]!, paint, readAt);
      else paint();
    }
  } finally {
    if (clips) popClip(ctx);
    if (m) popFrame(ctx);
    if (outline) popClip(ctx);
  }
}
