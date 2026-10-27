/**
 * PDF rendering of resource blocks (issue #49 §7).
 *
 * Draws an embedded `Resource` (bitmap / svg / table) plus its caption into a
 * pdf-lib page. Image payloads live out-of-band (IndexedDB in the sandbox); the
 * host supplies their raw bytes via {@link RenderToPdfOptions.resourceBytes},
 * which {@link preloadResourceImages} embeds into the document up front (PDF
 * embedding is async; page rendering is sync).
 *
 * The bytes are sniffed, so the host never has to say what it hands over:
 *   - `%PDF`  → the first page is embedded as a form XObject and drawn
 *               verbatim (vector print masters: an SVG's
 *               `Resource.svg.pdfFileId`, named on every use of the SVG in
 *               the VDT, is asked for first, outside single-ink mode);
 *   - SVG     → single-ink recolouring when `diagramStyle.singleInk` is on,
 *               then vector emission through {@link svgToVectorDrawing}, with
 *               `text` set in fonts loaded through the document's
 *               {@link FontCache} (same provider as the body text); SVGs
 *               outside the supported subset are rasterised (browser only) at
 *               {@link RASTER_DPI} for their largest placement;
 *   - PNG / JPEG / WebP / GIF → `embedPng` / `embedJpg` (WebP is decoded to
 *               PNG via a canvas first; browser only).
 * A missing or undecodable payload leaves the map entry absent and the
 * renderer draws a neutral placeholder.
 *
 * Inline `:ref` segments render in the link colour and, via {@link LinkRegistry},
 * become clickable link annotations targeting the resource embed's destination.
 */

import { paintScoreBody } from './scoreRender.js';
import { type PDFImage, type PDFEmbeddedPage, PDFHexString } from 'pdf-lib';
import { type VDTBlock, uncroppedPictureBox } from 'postext';
import { LinkRegistry, pdfUri, refTarget } from '../structure/links.js';
import { FontCache } from '../../fontCache.js';
import { type PageCtx, type PdfMatrix, quarterTurnMatrix, pushFrame, colorFromHex, pushClipRect, popClip, outerRectMap, fillRectPx, popFrame } from '../primitives.js';
import { type StructElem, tagContent, tagArtifact } from '../structure/tagging.js';
import type { StructureFlow } from '../structure/structureFlow.js';
import type { VectorDrawing } from '../vector/svgVector.js';
import type { AlphaStencil } from '../vector/tint.js';
import { drawEmbeddedResource, type PaintFonts, paintLine } from './renderResourceBlock/lines.js';
import { drawPlaceholder, drawVideoOverlays, paintFigureLabels } from './renderResourceBlock/overlays.js';
import { figureAlt, figureLayout, renderTable } from './renderResourceBlock/table.js';

export { RASTER_DPI, sniffBytes, rasterizeSvgWithDom, svgCodePoints, collectSvgFontStrings, fontResolverFor, inlineSvgFontsForRaster } from './renderResourceBlock/rasterize.js';
export type { SvgRasterizer } from './renderResourceBlock/rasterize.js';
export { preloadResourceImages } from './renderResourceBlock/preload.js';
export { drawEmbeddedResource } from './renderResourceBlock/lines.js';
export { figureLayout } from './renderResourceBlock/table.js';

/** Raw bytes of a resource binary, keyed by `fileId`. */
export type ResourceBytesProvider = (fileId: string) => Uint8Array | undefined;

/** One embedded resource payload, ready to draw on any page. */
export type EmbeddedResource =
  | { kind: 'image'; image: PDFImage; stencil?: AlphaStencil }
  | { kind: 'page'; page: PDFEmbeddedPage }
  | { kind: 'vector'; drawing: VectorDrawing };

/** Embedded resources keyed by `fileId`, shared across pages. */
export type ResourceImageMap = Map<string, EmbeddedResource>;

export function renderResourceBlock(
  ctx: PageCtx,
  block: VDTBlock,
  fontCache: FontCache,
  images: ResourceImageMap,
  linkRegistry: LinkRegistry | undefined,
  structure?: StructureFlow,
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  const { scale, pageHeightPt } = ctx;
  // A rotated block: its geometry is in the upright frame. A quarter-turn
  // matrix lands that frame on the page — set up so the `*Px` helpers, which
  // flip y against the page height, keep working unchanged inside it — and
  // the rects that live outside the content stream (link annotations,
  // structure bounding boxes) go through the same matrix.
  const rot = rb.rotation;
  let matrix: PdfMatrix | undefined;
  // A turned block's text is horizontal in its own frame: an upright
  // figure on a vertical page sets its caption and cells across.
  const outerVertical = rot ? ctx.vertical : undefined;
  if (rot) {
    matrix = quarterTurnMatrix(rot, scale, pageHeightPt);
    // Inside a vertical page's frame the block's rects go through both.
    pushFrame(ctx, matrix);
    delete ctx.vertical;
  }
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;
  const linkColor = colorFromHex(rb.linkColor, ctx.colorSpace);
  const continued = !!rb.slice?.continued;

  // Structure: a `Figure` (alt text required) or a `Table` (its alt text as
  // the summary), shared by the slices of a split table.
  let owner: StructElem | undefined;
  if (structure) {
    if (rb.kind === 'table') {
      const alt = rb.resource.altText?.trim();
      owner = structure.resourceElem(block, 'Table', alt
        ? { attributes: [{ owner: 'Table', entries: { Summary: PDFHexString.fromText(alt) } }] }
        : {});
    } else {
      owner = structure.resourceElem(block, 'Figure', {
        alt: figureAlt(rb),
        attributes: figureLayout(ctx, bx, by, bw, bh),
      });
    }
  }

  if (rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video') {
    const embedded = rb.fileId ? images.get(rb.fileId) : undefined;
    const src = rb.bodySource;
    if (embedded && src) {
      // A picture cropped within its safe area (#442): the whole picture at
      // its uncropped box, clipped to the body (the figure's content opened
      // inside the clip, which closes marked content); on a mirrored page
      // the box is reflected about the body, as the picture is turned back
      // in it.
      let full = uncroppedPictureBox(bx, by, bw, bh, src);
      if (ctx.mirror) full = { ...full, x: 2 * bx + bw - full.x - full.width };
      pushClipRect(ctx, bx, by, bw, bh);
      tagContent(ctx, owner);
      drawEmbeddedResource(ctx, embedded, full.x, full.y, full.width, full.height);
      popClip(ctx);
      tagArtifact(ctx, { type: 'Layout' });
    } else if (embedded) {
      tagContent(ctx, owner);
      drawEmbeddedResource(ctx, embedded, bx, by, bw, bh);
    } else {
      tagContent(ctx, owner);
      if (rb.fileId) ctx.onMissingImage?.(rb.fileId, rb.resource.id);
      drawPlaceholder(ctx, rb, bx, by);
    }
    const video = rb.video;
    if (video) {
      tagContent(ctx, owner);
      drawVideoOverlays(ctx, video, bx, by, bw);
      // The poster opens the video (#454).
      const uri = video.linkPoster && video.link ? pdfUri(video.link) : undefined;
      if (uri && linkRegistry) {
        const rect: [number, number, number, number] = [bx * scale, pageHeightPt - (by + bh) * scale, (bx + bw) * scale, pageHeightPt - by * scale];
        const box = ctx.mapRectPt ? ctx.mapRectPt(rect) : rect;
        const elem = owner?.child('Link');
        linkRegistry.addUriLink(ctx.page, box, uri, elem ? { elem, contents: `${figureAlt(rb)} (${video.link})` } : undefined);
      }
    }
    // A figure's labels, over the picture (#860).
    if (rb.labels) paintFigureLabels(ctx, block, rb, bx, by, fontCache, linkColor, linkRegistry, structure);
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, bx, by, fontCache, images, linkColor, linkRegistry, owner);
  } else if (rb.kind === 'score') {
    // A music example (#1172): its systems down the body, vector.
    tagContent(ctx, owner);
    paintScoreBody(ctx, rb, bx, by, bw);
  }

  // Named destination for inline refs: top-left of the placed block (the
  // first slice of a split table; continuations are not targets).
  if (linkRegistry && rb.resource.id && !rb.slice?.continued) {
    // On the sheet: the block's box is in the page's frame, which a vertical
    // page turns (not the block's own turned frame).
    const pageMap = rot ? outerRectMap(ctx) : ctx.mapRectPt;
    const box: [number, number, number, number] = [
      block.bbox.x * scale, pageHeightPt - (block.bbox.y + block.bbox.height) * scale,
      (block.bbox.x + block.bbox.width) * scale, pageHeightPt - block.bbox.y * scale,
    ];
    const [left, , , top] = pageMap ? pageMap(box) : box;
    linkRegistry.addDestination(rb.resource.id, ctx.page, left, top);
  }

  // Caption bar (behind the caption lines).
  if (rb.captionBar) {
    tagArtifact(ctx, { type: 'Layout' });
    const { rect, background } = rb.captionBar;
    fillRectPx(ctx, rect.x, rect.y, rect.width, rect.height, colorFromHex(background, ctx.colorSpace));
  }

  // Caption — the first slice's is the `Caption` of the figure / table; the
  // repeated (continued) caption of a later slice is an artifact.
  const captionColor = colorFromHex(rb.captionColor, ctx.colorSpace);
  const captionLabelColor = colorFromHex(rb.captionLabelColor, ctx.colorSpace);
  const captionFonts: PaintFonts = {
    normal: rb.captionFontString,
    bold: rb.captionBoldFontString,
    italic: rb.captionItalicFontString,
    boldItalic: rb.captionBoldItalicFontString,
  };
  if (structure && rb.captionLines.length > 0 && continued) tagArtifact(ctx, { type: 'Layout' });
  const captionElem = structure && owner && rb.captionLines.length > 0 && !continued
    ? structure.captionElem(owner, rb.kind === 'table' && !!rb.slice?.continues)
    : undefined;
  for (const line of rb.captionLines) {
    paintLine(ctx, line, captionFonts, fontCache, captionColor, linkColor, linkRegistry, refTarget, captionLabelColor, captionElem);
  }

  // Note.
  const noteColor = colorFromHex(rb.noteColor, ctx.colorSpace);
  const noteFonts: PaintFonts = {
    normal: rb.noteFontString,
    bold: rb.noteBoldFontString,
    italic: rb.noteItalicFontString,
    boldItalic: rb.noteBoldItalicFontString,
  };
  const noteElem = structure && rb.noteLines.length > 0 ? structure.noteElem(block) : undefined;
  for (const line of rb.noteLines) {
    paintLine(ctx, line, noteFonts, fontCache, noteColor, linkColor, linkRegistry, refTarget, noteColor, noteElem);
  }
  // The "continued" marker of a table slice that goes on is a layout cue.
  if (rb.continuesLines && rb.continuesLines.length > 0) {
    tagArtifact(ctx, { type: 'Layout' });
    for (const line of rb.continuesLines) {
      paintLine(ctx, line, noteFonts, fontCache, noteColor, linkColor, linkRegistry, (seg) => seg.refResourceId);
    }
  }
  if (matrix) {
    popFrame(ctx);
    if (outerVertical) ctx.vertical = outerVertical;
  }
}
