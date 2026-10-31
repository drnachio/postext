import { pushGraphicsState, concatTransformationMatrix, popGraphicsState } from 'pdf-lib';
import type { VDTBlock } from 'postext';
import { FontCache } from '../../fontCache.js';
import { type PageCtx, fillRectPx, colorFromHex } from '../primitives.js';
import { renderHeaderFooterSlot } from '../page/headerFooter.js';
import { type ResourceImageMap, renderResourceBlock } from './renderResourceBlock.js';
import { LinkRegistry } from '../structure/links.js';
import { type StructElem, tagArtifact } from '../structure/tagging.js';
import type { StructureFlow } from '../structure/structureFlow.js';
import { paintLineHighlights, paintLineMarks } from '../text/annotations.js';
import { renderLine } from './blockRender/lineText.js';
import { renderBullet, dropCapLead, renderDropCap, renderStrikethrough } from './blockRender/markers.js';
import { sheetRect, footnoteDestination } from './blockRender/segments.js';
import { paintLineQr } from './blockRender/lineQr.js';

export { renderMathSegment } from './blockRender/segments.js';

/** Per-document context for resource rendering, threaded through `renderBlock`. */
export interface ResourceRenderContext {
  images: ResourceImageMap;
  linkRegistry: LinkRegistry;
  /** Structure mapping of an accessible (tagged) render; absent otherwise. */
  structure?: StructureFlow;
}

/** Annotation rectangle of a block's box, in PDF points, on the sheet. */
function rectOfBlock(ctx: PageCtx, block: VDTBlock): [number, number, number, number] {
  const { scale, pageHeightPt } = ctx;
  const { x, y, width, height } = block.bbox;
  return sheetRect(ctx, [x * scale, pageHeightPt - (y + height) * scale, (x + width) * scale, pageHeightPt - y * scale]);
}

/**
 * A strip's caption (`VDTBlock.stripCaption`, #590), in the flow: the bar
 * behind it (layout), the target of a `:ref` naming the strip, then its
 * lines, painted as a paragraph's (turned on a vertical page) and tagged
 * into `elem` — the `Caption` of the strip's `Div`. The strip's picture is
 * painted on the sheet later (`renderComicPage`).
 */
export function renderStripCaption(
  ctx: PageCtx,
  block: VDTBlock,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
): void {
  const caption = block.stripCaption;
  if (!caption || block.hidden) return;
  if (caption.id && linkRegistry) {
    const [left, , , top] = rectOfBlock(ctx, block);
    linkRegistry.addDestination(caption.id, ctx.page, left, top);
  }
  if (caption.bar) {
    tagArtifact(ctx, { type: 'Layout' });
    const { rect, background } = caption.bar;
    fillRectPx(ctx, block.bbox.x + rect.x, block.bbox.y + rect.y, rect.width, rect.height, colorFromHex(background, ctx.colorSpace));
  }
  for (const line of block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount)) {
    if (line.highlights) paintLineHighlights(ctx, line);
    renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, elem);
    if (line.marks) paintLineMarks(ctx, line, colorFromHex(block.color, ctx.colorSpace));
  }
}

export function renderBlock(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  resourceCtx?: ResourceRenderContext,
): void {
  if (block.hidden) return;
  // A box printed upside down (#1229): drawn turned about its centre, a
  // point (x, y) of the page landing at (2cx − x, 2cy − y).
  if (block.turn) {
    const { scale, pageHeightPt } = ctx;
    ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, -1, 2 * block.turn.cx * scale, 2 * (pageHeightPt - block.turn.cy * scale)));
    try {
      renderBlockUpright(ctx, block, columnWidth, columnX, fontCache, resourceCtx);
    } finally {
      ctx.page.pushOperators(popGraphicsState());
    }
    return;
  }
  renderBlockUpright(ctx, block, columnWidth, columnX, fontCache, resourceCtx);
}

function renderBlockUpright(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  resourceCtx?: ResourceRenderContext,
): void {
  const structure = resourceCtx?.structure;
  const linkRegistry = resourceCtx?.linkRegistry;
  // The head row of a cut contents block repeated at the top of the column
  // it goes on in (#850): pagination furniture, as a split box's repeated
  // title is. A tagged render reads it as an artifact, not as a second
  // `TOCI`, and it carries no link (the head row it repeats has one).
  const repeatedTocHead = block.tocEntry?.continued === true || block.tocPart?.continued === true;
  // A row of the contents links to the page it lists: the whole row is
  // the annotation, its text the `Link` element in a tagged render.
  const targetPage = repeatedTocHead ? undefined : block.tocEntry?.pageIndex ?? block.tocPart?.pageIndex;
  if (block.designOverlay && repeatedTocHead) {
    renderHeaderFooterSlot(ctx, block.designOverlay, fontCache, resourceCtx?.images, structure ? { artifact: { type: 'Pagination' } } : undefined);
    return;
  }
  if (repeatedTocHead) {
    if (structure) tagArtifact(ctx, { type: 'Pagination' });
    if (block.type === 'listItem') renderBullet(ctx, block, fontCache, undefined);
    for (const line of block.lines) renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, undefined);
    return;
  }
  if (block.designOverlay) {
    // A heading's advanced design or a callout frame: the overlay's text is
    // the heading / the callout title, its boxes and icons are decoration.
    let link: StructElem | undefined;
    const textElem = structure
      ? () => link ?? (targetPage !== undefined ? (link = structure.blockElem(block).child('Link')) : structure.blockElem(block))
      : undefined;
    renderHeaderFooterSlot(
      ctx,
      block.designOverlay,
      fontCache,
      resourceCtx?.images,
      textElem && structure
        ? { text: textElem, artifact: { type: 'Layout' }, figure: (alt, attributes, after) => structure.designFigure(alt, attributes, after) }
        : undefined,
    );
    if (targetPage !== undefined && linkRegistry) {
      const contents = block.tocPart ? `${block.tocPart.number} ${block.tocPart.title}`.trim() : block.lines.map((l) => l.text).join(' ');
      linkRegistry.addPageLink(ctx.page, rectOfBlock(ctx, block), targetPage, link ? { elem: link, contents } : undefined);
    }
    return;
  }
  if (block.type === 'resource') {
    renderResourceBlock(
      ctx,
      block,
      fontCache,
      resourceCtx?.images ?? new Map(),
      resourceCtx?.linkRegistry,
      structure,
    );
    return;
  }
  const blockElem = structure && (block.lines.length > 0 || block.bulletText) ? structure.blockElem(block) : undefined;
  const link = targetPage !== undefined && blockElem ? blockElem.child('Link') : undefined;
  const elem = link ?? blockElem;
  if (block.type === 'listItem') {
    renderBullet(ctx, block, fontCache, structure?.bulletElem(block) ?? elem);
  }
  // A drop cap (#623): the initial and the rest of its word are one `Span`
  // whose `/ActualText` is the word.
  const cap = block.dropCap;
  const capLead = cap ? dropCapLead(cap, elem) : undefined;
  if (cap) renderDropCap(ctx, cap, fontCache, capLead?.elem ?? elem);
  // A note is where its markers link to.
  if (block.footnoteNote !== undefined && linkRegistry) {
    // The top left of the note's box on the sheet.
    const [left, , , top] = rectOfBlock(ctx, block);
    linkRegistry.addDestination(footnoteDestination(linkRegistry, block.footnoteNote), ctx.page, left, top);
  }
  // Justify against the block's own measure (see the canvas backend): blocks
  // inside callouts are narrower than their column.
  void columnWidth;
  void columnX;
  block.lines.forEach((line, i) => {
    // Highlight bands (`:mark[…]`, #888), under the text.
    if (line.highlights) paintLineHighlights(ctx, line);
    renderLine(ctx, line, block, block.bbox.width, block.bbox.x, fontCache, linkRegistry, elem, i === 0 ? capLead : undefined);
    // Emphasis dots, proper-name and book-title lines (#193).
    if (line.marks) paintLineMarks(ctx, line, colorFromHex(block.color, ctx.colorSpace));
    // A link note's QR code (#1302).
    if (line.qr) paintLineQr(ctx, line as typeof line & { qr: NonNullable<typeof line.qr> }, block.color, linkRegistry, elem);
  });
  if (targetPage !== undefined && linkRegistry) {
    const contents = block.lines.map((l) => l.text).join(' ');
    linkRegistry.addPageLink(ctx.page, rectOfBlock(ctx, block), targetPage, link ? { elem: link, contents } : undefined);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
