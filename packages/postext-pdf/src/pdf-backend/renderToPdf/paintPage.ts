// renderPage and paintPage: one page of the document painted, its
// blocks, decorations, rules and print pass (#1276: split out of
// pdf-backend/index.ts).
import { PDFDocument, BlendMode } from 'pdf-lib';
import { shapingLanguageOf, type VDTPage, type VDTDocument, dimensionToPx, comicPaintsUnderText, verticalFlowOf, computePageTextExtent, cjkGridCells, pageColumnRule, type VDTBlock, columnClipRect, composedFrameBlockIds, composedSheetClipOnSheet, decorationUnder, decorationOver, comicBlockOnSheet, comicHoldsText } from 'postext';
import type { ColorMode } from '../../print/colorMode.js';
import { FontCache } from '../../fontCache.js';
import { type PageCtx, makeScale, fillRectPx, whiteColor, colorFromHex, pushClipRect, type PdfMatrix, quarterTurnMatrix, mirrorMatrix, pushFrame, popFrame, popClip } from '../primitives.js';
import { computeContentArea, renderBaselineGrid, renderCharacterGrid, renderColumnRule, renderFootnoteRules, renderCutLines } from '../page/pageDecorations.js';
import { type ResourceRenderContext, renderStripCaption, renderBlock } from '../blocks/blockRender.js';
import { renderHeaderFooterSlot, type SlotMark } from '../page/headerFooter.js';
import { type ComicPanelTags, renderComicPanelsPdf, renderComicLetteringPdf, renderComicPage } from '../page/comic.js';
import { anchorDestination } from '../structure/links.js';
import { StructTree, tagArtifact, type StructElem } from '../structure/tagging.js';
import { withDocumentLanguage } from '../../shapingLanguage.js';
import { paintComposedFrames, paintComicTextFrames } from './composedFrames.js';
import { languageTag, openerTextElem } from './metadata.js';

/** Paint one page, its text shaped in its document's language, the one
 *  the layout measured it in (`shapingLanguage.ts`, #764). A document that
 *  keeps the host's language (`bodyText.shapingLanguage: 'host'`) is
 *  shaped as it always was: `JAN ` for Japanese, the font's default for
 *  any other. */
export function renderPage(...args: Parameters<typeof paintPage>): void {
  const config = args[2].config;
  withDocumentLanguage(shapingLanguageOf(config), languageTag(config), () => paintPage(...args));
}

function paintPage(
  pdfDoc: PDFDocument,
  vdtPage: VDTPage,
  doc: VDTDocument,
  fontCache: FontCache,
  pageNegative: boolean,
  colorSpace: ColorMode,
  resourceCtx: ResourceRenderContext,
  tree: StructTree | undefined,
  onMissingImage?: PageCtx['onMissingImage'],
  characterGrid = false,
): void {
  const scale = makeScale(doc.config.page.dpi);
  const pageWidthPt = vdtPage.width * scale;
  const pageHeightPt = vdtPage.height * scale;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  // With cut lines the sheet carries the bleed and the marks: say where the
  // page is trimmed and how far its art runs, for imposition and preflight.
  if (doc.config.page.cutLines.enabled) {
    const trimPt = doc.trimOffset * scale;
    const bleedPt = Math.max(0, doc.trimOffset - dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)) * scale;
    page.setTrimBox(trimPt, trimPt, pageWidthPt - 2 * trimPt, pageHeightPt - 2 * trimPt);
    page.setBleedBox(bleedPt, bleedPt, pageWidthPt - 2 * bleedPt, pageHeightPt - 2 * bleedPt);
  }
  const ctx: PageCtx = {
    page, pageHeightPt, scale, colorSpace, tags: tree?.beginPage(page), ...(onMissingImage ? { onMissingImage } : {}), images: resourceCtx.images,
    frameCjk: { region: doc.config.cjk?.region ?? 'mainland', uprightDigits: doc.config.cjk?.uprightDigits ?? 2 },
  };
  const structure = resourceCtx.structure;

  // Background: full page white first (cut-mark area stays white), then the
  // trim+bleed area filled with the configured page background colour.
  tagArtifact(ctx, { type: 'Background' });
  fillRectPx(ctx, 0, 0, vdtPage.width, vdtPage.height, whiteColor(colorSpace));

  // A part's or a styled section's palette may give the page its own paper.
  const bgHex = vdtPage.background ?? doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;
  const bleedPx = trimOff > 0
    ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
    : 0;
  if (bgHex && bgHex !== 'transparent') {
    fillRectPx(
      ctx,
      trimOff - bleedPx,
      trimOff - bleedPx,
      vdtPage.width - (trimOff - bleedPx) * 2,
      vdtPage.height - (trimOff - bleedPx) * 2,
      colorFromHex(bgHex, colorSpace),
    );
  }

  // With cut lines the sheet also carries the slug, where only the marks
  // print: everything the page paints is clipped to the bleed box, as a
  // DTP export clips it (EF-133). The marks are drawn after the clip ends.
  const bleedClip = trimOff > 0;
  if (bleedClip) {
    const inset = Math.max(0, trimOff - bleedPx);
    pushClipRect(ctx, inset, inset, vdtPage.width - inset * 2, vdtPage.height - inset * 2);
  }

  // A vertical page (`VDTPage.flow`) paints its flow through the page's
  // frame, a quarter turn clockwise (the `'cw'` resource matrix with its
  // origin at the sheet's right edge), and maps the rects that live outside
  // the content stream through it (`pushFrame`): link annotations of the
  // text, contents rows, `:ref`s and page links, the named destinations of
  // resources and notes, structure bounding boxes. Its text is set down the
  // column (`verticalText.ts`): characters upright through the fonts'
  // vertical twins, Latin words and long numbers sideways. Running heads,
  // folios and the marks stay on the sheet.
  // A right-to-left page (`VDTMirroredFlowFrame`) paints its flow through
  // its mirror the same way, with `ctx.mirror` on: each text object and
  // picture is turned back about its own box (`pushTextObject`,
  // `counterFlipPx`), so the geometry lands mirrored and the text reads as
  // written. Link and structure rects map through the frame too.
  // A comic page with text panels (#885): its panels first, the text over
  // them with the floats, its lettering after the flow.
  const comicUnder = comicPaintsUnderText(vdtPage) ? vdtPage.comic : undefined;
  const comicTags: ComicPanelTags = comicUnder ? renderComicPanelsPdf(ctx, comicUnder, resourceCtx.images, structure) : undefined;

  let flowMatrix: PdfMatrix | undefined;
  const vflow = verticalFlowOf(vdtPage);
  if (vflow) flowMatrix = quarterTurnMatrix(vflow.rotation, scale, pageHeightPt);
  else if (vdtPage.flow?.writingMode === 'horizontal-tb') flowMatrix = mirrorMatrix(vdtPage.flow.mirror.originX, scale);
  const enterFlow = (): void => {
    if (!flowMatrix) return;
    pushFrame(ctx, flowMatrix);
    if (vflow) {
      ctx.vertical = {
        region: doc.config.cjk?.region ?? 'mainland',
        uprightDigits: doc.config.cjk?.uprightDigits ?? 2,
        ...(vflow.centralBaselines ? { axes: vflow.centralBaselines } : {}),
      };
    } else ctx.mirror = true;
  };
  const leaveFlow = (): void => {
    if (!flowMatrix) return;
    popFrame(ctx);
    delete ctx.vertical;
    delete ctx.mirror;
  };
  enterFlow();

  tagArtifact(ctx, { type: 'Layout' });
  if (doc.config.page.baselineGrid.enabled) {
    // Bound the grid to the page's actual text: from the first text line to
    // the last (mirrors the canvas backend). Pages with no text draw no grid.
    const textExtent = computePageTextExtent(vdtPage);
    if (textExtent) {
      const contentArea = computeContentArea(vdtPage, doc);
      const gridLineWidthPx = dimensionToPx(
        doc.config.page.baselineGrid.lineWidth,
        doc.config.page.dpi,
      );
      renderBaselineGrid(
        ctx,
        contentArea,
        doc.baselineGrid,
        doc.config.page.baselineGrid.color.hex,
        gridLineWidthPx,
        textExtent,
      );
    }
  }

  // The character grid, only when the render asks for it.
  if (characterGrid && doc.config.cjk?.grid?.show) {
    const cells = cjkGridCells(doc.config, vdtPage.contentArea ?? computeContentArea(vdtPage, doc), doc.baselineGrid, vdtPage.columns, vdtPage.flow);
    if (cells) renderCharacterGrid(ctx, cells);
  }

  // The page's own rule on a styled section's pages, else the document's
  // (mirrors the canvas backend via `pageColumnRule`).
  const columnRule = pageColumnRule(vdtPage, doc);
  if (columnRule.enabled && vdtPage.columns.length > 1) {
    renderColumnRule(ctx, vdtPage.columns, columnRule.color, columnRule.lineWidthPx, vdtPage.footnoteAreas);
  }

  // Opener / part bands go under the columns so their backgrounds sit
  // beneath the body text (mirrors the canvas backend). Their text is the
  // chapter / part heading; the rest of the band is decoration.
  if (vdtPage.openerBand) {
    renderHeaderFooterSlot(
      ctx,
      vdtPage.openerBand,
      fontCache,
      resourceCtx.images,
      structure
        ? {
            text: openerTextElem(vdtPage, structure),
            artifact: { type: 'Layout' },
            figure: (alt, attributes, after) => structure.designFigure(alt, attributes, after),
          }
        : undefined,
    );
  }

  // The anchors of the page (#264): where cross-references jump to, and
  // named destinations (`file.pdf#nameddest=id`).
  for (const anchor of doc.anchors ?? []) {
    if (anchor.pageIndex !== vdtPage.index) continue;
    const at: [number, number, number, number] = [anchor.x * scale, pageHeightPt - anchor.y * scale, anchor.x * scale, pageHeightPt - anchor.y * scale];
    const [left, , , top] = ctx.mapRectPt ? ctx.mapRectPt(at) : at;
    resourceCtx.linkRegistry.addDestination(anchorDestination(anchor.id), ctx.page, left, top, anchor.id);
  }

  // Clip to column bounds, widened for glyph ink and for design overlays
  // that hang past the column on purpose — the same rectangle the canvas
  // backend clips to (see `columnClipRect`). Only a document that hangs
  // marks (`cjk.hangingPunctuation`) has lines whose marks reach past it.
  const hanging = doc.config.cjk?.hangingPunctuation !== 'none';
  // Strips (`:::strip`) met in the columns and floats: tagged in place,
  // painted on the sheet after the flow frame closes.
  const strips: Array<{ block: VDTBlock; div?: StructElem; caption?: StructElem }> = [];
  /** A strip's `Div` and its caption (#590), read where the strip stands:
   *  the caption is painted in the flow now, tagged as the `Div`'s
   *  `Caption`; the picture joins the `Div` when painted on the sheet. */
  const readStrip = (block: VDTBlock): (typeof strips)[number] => {
    const div = structure ? structure.comicStrip(block) : undefined;
    const caption = div && block.stripCaption ? div.child('Caption') : undefined;
    renderStripCaption(ctx, block, fontCache, resourceCtx.linkRegistry, caption);
    return { block, ...(div ? { div } : {}), ...(caption ? { caption } : {}) };
  };
  for (const col of vdtPage.columns) {
    const clip = columnClipRect(col, doc.config.page.dpi, hanging);
    pushClipRect(ctx, clip.x, clip.y, clip.width, clip.height);
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) {
        // Painted below, but read in its place among the contents rows.
        // (A repeated head row of a cut block is an artifact, #850.)
        if (structure && !block.hidden && !block.tocPart.continued && block.designOverlay.blocks.some((b) => b.kind === 'text')) {
          structure.blockElem(block);
        }
        continue;
      }
      // A strip is painted on the sheet below, but read here.
      if (block.comic) {
        if (!block.hidden) strips.push(readStrip(block));
        continue;
      }
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
    }
    popClip(ctx);
    // A part row of the contents carries a design of its own, which may
    // run past the column (a band reaching beyond the page numbers): it
    // is drawn outside the column clip, like a float.
    for (const block of col.blocks) {
      if (!block.tocPart || !block.designOverlay) continue;
      const paint = () => renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
      if (structure) structure.aside(paint);
      else paint();
    }
  }

  // Floated resources sit outside the column clip (a `span: 'page'` float can
  // cross the gutter); they carry an absolute bbox positioned at build time.
  // A tagged render reads each one after the text that cites it (EF-146).
  // A composed page's frames (#855) are floats painted with their frames.
  const frameIds = composedFrameBlockIds(vdtPage);
  if (vdtPage.floats) {
    const floats = vdtPage.floats.filter((fb) => !frameIds.has(fb.id));
    for (let i = 0; i < floats.length; i++) {
      const fb = floats[i]!;
      if (fb.comic) {
        // A floated strip: read after the text that comes before it,
        // painted on the sheet below.
        if (fb.hidden) continue;
        if (structure) structure.readFloat(fb, () => { strips.push(readStrip(fb)); });
        else strips.push(readStrip(fb));
        continue;
      }
      // The blocks a floated (or fixed) box sets on the page are read as
      // one float, anchored by its first block (#893), so a list in it
      // stays one list, as in a composed frame (#862).
      let end = i + 1;
      if (fb.containerId !== undefined) {
        while (end < floats.length && floats[end]!.containerId === fb.containerId && !floats[end]!.comic) end++;
      }
      const group = floats.slice(i, end);
      i = end - 1;
      const paint = () => {
        for (const b of group) renderBlock(ctx, b, b.bbox.width, b.bbox.x, fontCache, resourceCtx);
      };
      if (structure) structure.readFloat(fb, paint);
      else paint();
    }
  }
  // A page painted through a flow frame paints its decoration on the
  // sheet, after the flow.
  const decorationMark: SlotMark | undefined = structure
    ? { artifact: { type: 'Layout' }, figure: (alt, attributes, after) => structure.designFigure(alt, attributes, after) }
    : undefined;
  if (vdtPage.composed && flowMatrix) {
    // The decoration stands on the sheet, so the flow frame is left for
    // it, between the frames under layer 0 and the others: a title frame
    // on a band reads over the band on a right-to-left or vertical page
    // as on any other.
    paintComposedFrames(ctx, vdtPage, fontCache, resourceCtx, undefined, false, 'below');
    leaveFlow();
    if (vdtPage.composed.decoration) {
      // On a page of a spread (#861), its share of the sheet only (the
      // clip, in flow coordinates, mapped to the sheet, #926).
      const sheet = composedSheetClipOnSheet(vdtPage);
      if (sheet) pushClipRect(ctx, sheet.x, sheet.y, sheet.width, sheet.height);
      renderHeaderFooterSlot(ctx, decorationUnder(vdtPage.composed.decoration), fontCache, resourceCtx.images, decorationMark);
      if (sheet) popClip(ctx);
    }
    enterFlow();
    paintComposedFrames(ctx, vdtPage, fontCache, resourceCtx, undefined, false, 'above');
    // Connectors painted over the frames (#1076), on the sheet too: Layout
    // artifacts, as the rest of the decoration.
    const over = decorationOver(vdtPage.composed.decoration);
    if (over) {
      leaveFlow();
      const sheet = composedSheetClipOnSheet(vdtPage);
      if (sheet) pushClipRect(ctx, sheet.x, sheet.y, sheet.width, sheet.height);
      renderHeaderFooterSlot(ctx, over, fontCache, resourceCtx.images, decorationMark);
      if (sheet) popClip(ctx);
      enterFlow();
    }
  } else if (vdtPage.composed) paintComposedFrames(ctx, vdtPage, fontCache, resourceCtx, decorationMark, true);
  if (comicUnder) paintComicTextFrames(ctx, vdtPage, fontCache, resourceCtx, comicTags);

  // The footnote separators are layout.
  if (vdtPage.footnoteAreas?.some((a) => a.rule)) {
    tagArtifact(ctx, { type: 'Layout' });
    renderFootnoteRules(ctx, vdtPage);
  }

  leaveFlow();

  // A comic page's panels and lettering (or its half of a spread), then
  // the strips the page holds, on the sheet (never through the flow
  // frame), under the running heads.
  if (comicUnder) renderComicLetteringPdf(ctx, comicUnder, fontCache, comicTags);
  else if (vdtPage.comic) renderComicPage(ctx, vdtPage.comic, fontCache, resourceCtx.images, structure);
  for (const strip of strips) {
    const sheetComic = comicBlockOnSheet(vdtPage, strip.block)!;
    if (comicHoldsText(sheetComic)) {
      // A strip with text panels (#959): its panels, the text in the flow
      // frame over them (read in the panel's place), then its lettering.
      const tags = renderComicPanelsPdf(ctx, sheetComic, resourceCtx.images, structure, strip.div);
      enterFlow();
      paintComicTextFrames(ctx, vdtPage, fontCache, resourceCtx, tags, sheetComic);
      leaveFlow();
      renderComicLetteringPdf(ctx, sheetComic, fontCache, tags);
    } else renderComicPage(ctx, sheetComic, fontCache, resourceCtx.images, structure, strip.div);
    // A caption set under the strip is read after its panels.
    if (strip.div && strip.caption && strip.block.stripCaption?.position !== 'above') {
      const kids = strip.div.kids;
      const at = kids.findIndex((k) => k.kind === 'elem' && k.elem === strip.caption);
      if (at >= 0) kids.push(...kids.splice(at, 1));
    }
  }

  // Running headers and footers are pagination artifacts.
  const pagination = (subtype: 'Header' | 'Footer') =>
    structure ? { artifact: { type: 'Pagination' as const, subtype } } : undefined;
  // Line numbers (#621): layout artifacts in a tagged PDF, and each set
  // under an empty `/ActualText`, so text extraction and copying run from
  // line to line without them.
  if (vdtPage.lineNumbers) {
    renderHeaderFooterSlot(ctx, vdtPage.lineNumbers, fontCache, resourceCtx.images, structure ? { artifact: { type: 'Layout' } } : undefined, { silent: true });
  }
  if (vdtPage.header) renderHeaderFooterSlot(ctx, vdtPage.header, fontCache, resourceCtx.images, pagination('Header'));
  if (vdtPage.footer) renderHeaderFooterSlot(ctx, vdtPage.footer, fontCache, resourceCtx.images, pagination('Footer'));

  if (bleedClip) popClip(ctx);

  // Page negative: overlay white rect with Difference blend across trim+bleed.
  // Crop marks remain un-inverted (drawn afterwards).
  tagArtifact(ctx, { type: 'Page' });
  if (pageNegative) {
    const invX = trimOff - bleedPx;
    const invY = trimOff - bleedPx;
    const invW = vdtPage.width - (trimOff - bleedPx) * 2;
    const invH = vdtPage.height - (trimOff - bleedPx) * 2;
    fillRectPx(ctx, invX, invY, invW, invH, whiteColor(colorSpace), BlendMode.Difference);
  }

  renderCutLines(ctx, vdtPage, doc);
  ctx.tags?.close();
}
