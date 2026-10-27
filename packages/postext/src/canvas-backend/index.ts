import type { RenderWarning, VDTDocument, VDTPage } from '../vdt.js';
import { computePageTextExtent, verticalFlowOf } from '../vdt.js';
import { dimensionToPx } from '../units.js';
import { columnClipRect } from '../paint/columnClip.js';
import { pageColumnRule } from '../paint/columnRule.js';
import { renderBaselineGrid, renderCharacterGrid, renderColumnRule, renderCutLines, renderFootnoteRules, computeContentArea } from './decorations.js';
import { cjkGridCells } from '../pipeline/text/cjkGrid.js';
import { renderBlock } from './blockRender.js';
import { renderHeaderFooterSlot } from './headerFooter.js';
import { documentInkHex } from '../svg/singleInk.js';
import { shapingLanguageOf } from '../hyphenation/locale.js';
import { setSegmentLanguages } from './wordRuns.js';
import { setMissingImageSink, setTintUnflagged } from './renderResourceBlock.js';
import { setVerticalPaint } from './verticalText.js';
import { beginMirroredFlow } from './mirrorFrame.js';
import { renderComicBalloons, renderComicPage, renderComicPanels } from './comic.js';
import { renderComicTextFrames, renderComposedDecoration, renderComposedFrames } from './composed.js';
import { comicHoldsText, comicPaintsUnderText, composedFrameBlockIds, paintsOverFrames } from '../composed/paint.js';
import { pageComics } from '../comics/transform.js';
import { proofPixels, type PrintPreview } from '../color/softProof.js';
import { resetContextState, restoreContext, saveContext } from './contextState.js';
import { resetWordSpacing } from './contextText.js';
export {
  registerResourceImage,
  unregisterResourceImage,
  clearResourceImages,
  getResourceImage,
} from './renderResourceBlock.js';
export type { ResourceImageSource, RegisterResourceImageOptions } from './renderResourceBlock.js';
export { registerVerticalAlternates, unregisterVerticalAlternates, loadVerticalAlternates, verticalTwinName, VERTICAL_ALTERNATE_SAMPLE } from './verticalText.js';
export type { VerticalAlternatesFace } from './verticalText.js';

export interface RenderPageOptions {
  pageNegative?: boolean;
  /** Bitmap pixels per page pixel (1 = the page's own resolution, the
   *  document's dpi). A page shown smaller than its size is painted at the
   *  size it is shown, times the device pixel ratio: fewer pixels to fill
   *  and to keep. The drawing itself stays in page pixels. Above 1 the
   *  page is painted larger than its resolution: text, rules and vector
   *  pictures (a registered SVG `<img>`, a formula) are drawn at the
   *  bitmap's resolution (#674); a bitmap picture has no more pixels to
   *  give. */
  scale?: number;
  /** Told of what the render could not paint as asked: an image with
   *  nothing registered for its `fileId` (see `registerResourceImage`) is
   *  painted as a placeholder and reported once per `fileId` and render
   *  call, as a `missingImage` warning. */
  onWarning?: (warning: RenderWarning) => void;
  /** Whether `diagramStyle.singleInk` tints the SVG pictures registered
   *  without a `singleInk` flag of their own (see
   *  `RegisterResourceImageOptions.singleInk`) to the document's ink.
   *  Defaults to false in postext 1.x: hosts written for 1.4 recolour the
   *  markup with `applySingleInkToSvg` before decoding it, and a picture
   *  tinted twice comes out lighter. A picture decoded from an SVG data URI
   *  `applySingleInkToSvg` marked, or registered with `singleInk: false`,
   *  is never tinted. The next major release turns it on. */
  singleInk?: boolean;
  /** Paints the trimmed page only: with `page.cutLines` on, the bitmap
   *  covers the trim box (the page as it comes out of the guillotine),
   *  leaving out the bleed, the slug and the crop marks. `scale` still
   *  counts bitmap pixels per page pixel. No effect without cut lines. */
  trim?: boolean;
  /** Paint the page as it will print (#606): the finished page goes
   *  through the soft proof of the output profile (`createPrintPreview`),
   *  large black areas in rich black; then the trim, bleed and safe-zone
   *  guides and the preflight marks it carries are drawn over it. */
  printPreview?: PrintPreview;
}

/** How far the painted area sits inside the sheet: the trim offset when
 *  the render is trimmed, else 0. */
function trimInset(doc: VDTDocument, options?: RenderPageOptions): number {
  return options?.trim ? Math.max(0, doc.trimOffset) : 0;
}

export function renderPageToCanvas(
  page: VDTPage,
  doc: VDTDocument,
  canvas: HTMLCanvasElement,
  options?: RenderPageOptions,
): void {
  const previousTint = setTintUnflagged(options?.singleInk === true);
  try {
    const onWarning = options?.onWarning;
    if (!onWarning) {
      paintPage(page, doc, canvas, options);
      return;
    }
    const reported = new Set<string>();
    const previous = setMissingImageSink((fileId, resourceId) => {
      if (reported.has(fileId)) return;
      reported.add(fileId);
      onWarning({ kind: 'missingImage', fileId, ...(resourceId !== undefined ? { resourceId } : {}), pageIndex: page.index });
    });
    try {
      paintPage(page, doc, canvas, options);
    } finally {
      setMissingImageSink(previous);
    }
  } finally {
    setTintUnflagged(previousTint);
  }
}

function paintPage(
  page: VDTPage,
  doc: VDTDocument,
  canvas: HTMLCanvasElement,
  options?: RenderPageOptions,
): void {
  const scale = options?.scale && options.scale > 0 ? options.scale : 1;
  const inset = trimInset(doc, options);
  canvas.width = Math.max(1, Math.round((page.width - 2 * inset) * scale));
  canvas.height = Math.max(1, Math.round((page.height - 2 * inset) * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Text is painted from where the layout measured it, left to right. A
  // canvas inside a right-to-left container inherits `rtl`, which would
  // set a line's 'start' at its right end and reorder mixed runs: the page
  // paints with `ltr`, and the context gets its own direction back.
  const direction = 'direction' in ctx ? ctx.direction : undefined;
  if (direction !== undefined) ctx.direction = 'ltr';
  // The page sets the language it paints in (`paintContext`); what the
  // host draws over it afterwards is the host's, in the context's own.
  const language = 'lang' in ctx ? (ctx as CanvasRenderingContext2D & { lang: string }).lang : undefined;
  try {
    paintContext(ctx, canvas, page, doc, options);
  } finally {
    if (direction !== undefined) ctx.direction = direction;
    // Every text of the page set the word spacing that keys its word
    // cache (`contextText.ts`): the canvas is left at the one it had when
    // it was given its size.
    resetWordSpacing(ctx);
    if (language !== undefined && (ctx as CanvasRenderingContext2D & { lang: string }).lang !== language) (ctx as CanvasRenderingContext2D & { lang: string }).lang = language;
  }
}

/** {@link shapingLanguageOf} of each resolved config: every page of a
 *  document asks for it. */
const langByConfig = new WeakMap<object, string | undefined>();
function langOf(config: VDTDocument['config']): string | undefined {
  if (langByConfig.has(config)) return langByConfig.get(config);
  const lang = shapingLanguageOf(config);
  langByConfig.set(config, lang);
  return lang;
}

function paintContext(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  page: VDTPage,
  doc: VDTDocument,
  options?: RenderPageOptions,
): void {
  // The canvas was just given its size: its state is new.
  resetContextState(ctx);
  // The page is painted in the language it was measured in (`ctx.lang`,
  // Chrome 136+; #764): the document's own (the default of
  // `bodyText.shapingLanguage` since postext 1.30, #770), so the browser
  // picks the glyph forms the layout measured, and a run's own where it
  // names one. The language holds through every `save()` of the page
  // (`saveContext`): a context loses it there.
  //
  // A document shaped in the host's language (`'host'`) was measured in
  // the host's, and is painted in it: the context is left as it comes. Up
  // to postext 1.29.1 a Chinese, Japanese, Korean or right-to-left
  // document had its own language set here all the same, and lost it at
  // the first `save()`, so its columns, its design text and its captions
  // were painted in the host's, as they still are; only what was painted
  // in no saved state at all (a floated text box on a page with no cut
  // lines, not vertical and not mirrored) took the document's language,
  // against its measure.
  const lang = langOf(doc.config);
  if (lang !== undefined && 'lang' in ctx) (ctx as CanvasRenderingContext2D & { lang: string }).lang = lang;
  setSegmentLanguages(doc.config.bodyText?.shapingLanguage !== 'host');
  // The bitmap is a whole number of pixels; the page rarely is. Drawing at
  // `scale` would leave the last column (and row) of pixels only partly
  // covered — a light hairline at the edge of a dark or coloured page — so
  // the page is stretched to the bitmap's exact size instead (the two
  // factors differ from `scale` by well under a pixel's worth).
  // A trimmed render paints the trim box alone, shifted to the bitmap's
  // origin; the slug and the marks fall outside it.
  const inset = trimInset(doc, options);
  const sx = canvas.width / (page.width - 2 * inset);
  const sy = canvas.height / (page.height - 2 * inset);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (inset > 0) ctx.translate(-inset, -inset);

  if (options?.pageNegative) {
    ctx.filter = 'invert(1)';
  }

  // A part's or a styled section's palette may give the page its own paper.
  const bgColor = page.background ?? doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;
  // Single-ink diagrams: SVG pictures are tinted to this ink as they paint
  // (those the host flags, or every unflagged one when the render asks).
  const inkHex = documentInkHex(doc.config);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);

  const bleedPx = trimOff > 0 ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi) : 0;
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(
      trimOff - bleedPx,
      trimOff - bleedPx,
      page.width - (trimOff - bleedPx) * 2,
      page.height - (trimOff - bleedPx) * 2,
    );
  }

  // With cut lines the sheet also carries the slug, where only the marks
  // print: everything the page paints is clipped to the bleed box, as a
  // DTP export clips it (EF-133). A design element anchored to the page or
  // the bleed may run past it; that part would be cut off with the slug.
  const bleedClip = trimOff > 0;
  if (bleedClip) {
    const bleedInset = Math.max(0, trimOff - bleedPx);
    saveContext(ctx);
    ctx.beginPath();
    ctx.rect(bleedInset, bleedInset, page.width - bleedInset * 2, page.height - bleedInset * 2);
    ctx.clip();
  }

  // A vertical page paints its flow through the page's frame — a quarter
  // turn clockwise — with the vertical text painter on; a right-to-left
  // page through its mirror, text and pictures turned back about their
  // boxes (`beginMirroredFlow`). The running heads, folios, background and
  // crop marks stay on the sheet.
  // A comic page with text panels (#885): its panels first, the text over
  // them with the floats, its lettering after the flow.
  const comicUnder = comicPaintsUnderText(page) ? page.comic : undefined;
  if (comicUnder) renderComicPanels(ctx, comicUnder, inkHex);

  const flow = verticalFlowOf(page);
  let outerVertical: ReturnType<typeof setVerticalPaint> = null;
  let endMirror: (() => void) | undefined;
  const enterFlow = (): void => {
    if (flow) {
      saveContext(ctx);
      ctx.transform(0, 1, -1, 0, page.width, 0);
      outerVertical = setVerticalPaint({
        region: doc.config.cjk?.region ?? 'mainland',
        uprightDigits: doc.config.cjk?.uprightDigits ?? 2,
        ...(flow.centralBaselines ? { axes: flow.centralBaselines } : {}),
      });
    }
    if (page.flow?.writingMode === 'horizontal-tb') endMirror = beginMirroredFlow(ctx, page.flow.mirror.originX);
  };
  const leaveFlow = (): void => {
    if (flow) {
      setVerticalPaint(outerVertical);
      restoreContext(ctx);
    }
    endMirror?.();
  };
  enterFlow();
  const throughFlow = !!flow || endMirror !== undefined;

  if (doc.config.page.baselineGrid.enabled) {
    // Bound the grid to the page's actual text: from the first text line to
    // the last. Pages with no text (blank parity pages) draw no grid, and
    // float bands at the top show no phantom baselines.
    const textExtent = computePageTextExtent(page);
    if (textExtent) {
      const contentArea = computeContentArea(page, doc);
      const gridLineWidthPx = dimensionToPx(doc.config.page.baselineGrid.lineWidth, doc.config.page.dpi);
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

  // The character grid (稿纸), a screen aid (`cjk.grid.show`).
  const gridCells = doc.config.cjk?.grid?.show && !page.comic ? cjkGridCells(doc.config, page.contentArea ?? computeContentArea(page, doc), doc.baselineGrid, page.columns, page.flow) : undefined;
  if (gridCells) renderCharacterGrid(ctx, gridCells);

  // The page's own rule on a styled section's pages, else the document's.
  const columnRule = pageColumnRule(page, doc);
  if (columnRule.enabled && page.columns.length > 1) {
    renderColumnRule(ctx, page.columns, columnRule.color, columnRule.lineWidthPx, page.footnoteAreas);
  }

  // Opener / part bands are painted before the columns so their backgrounds
  // sit under the body text rather than over it.
  if (page.openerBand) renderHeaderFooterSlot(ctx, page.openerBand, inkHex);

  // Clip to column bounds, widened for glyph ink and for design overlays
  // that hang past the column on purpose (see `columnClipRect`).
  // Only a document that hangs marks (`cjk.hangingPunctuation`) has lines
  // whose marks reach past the column.
  const hanging = doc.config.cjk?.hangingPunctuation !== 'none';
  for (const col of page.columns) {
    const clip = columnClipRect(col, doc.config.page.dpi, hanging);
    saveContext(ctx);
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) continue;
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, inkHex);
    }
    restoreContext(ctx);
    // A part row of the contents carries a design of its own, which may
    // run past the column (a band reaching beyond the page numbers): it
    // is drawn outside the column clip, like a float.
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) renderBlock(ctx, block, col.bbox.width, col.bbox.x, inkHex);
    }
  }

  // Out-of-flow blocks — floated resources and fixed-position callouts —
  // live outside the column clip (a `span: 'page'` float crosses the
  // gutter). They were positioned at build time, so they render straight
  // from their absolute bbox.
  // A composed page's frames (#855) are floats too, painted with their
  // frames: in layer order, each turned and clipped as its frame says,
  // the template's decoration at layer 0. A page painted through a flow
  // frame paints its decoration on the sheet, after the flow.
  const frameIds = composedFrameBlockIds(page);
  // A vertical frame's text (#944) is set in the document's CJK region.
  const frameCjk = { region: doc.config.cjk?.region ?? 'mainland', uprightDigits: doc.config.cjk?.uprightDigits ?? 2 };
  if (page.floats) {
    for (const fb of page.floats) {
      if (frameIds.has(fb.id)) continue;
      renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, inkHex);
    }
  }
  if (page.composed && throughFlow) {
    // The decoration stands on the sheet, so the flow frame is left for
    // it, between the frames under layer 0 and the others: a title frame
    // on a band reads over the band on a right-to-left or vertical page
    // as on any other.
    renderComposedFrames(ctx, page, inkHex, undefined, 'below', frameCjk);
    leaveFlow();
    renderComposedDecoration(ctx, page, inkHex);
    enterFlow();
    renderComposedFrames(ctx, page, inkHex, undefined, 'above', frameCjk);
    // Connectors painted over the frames (#1076), on the sheet too.
    if (page.composed.decoration?.blocks.some(paintsOverFrames)) {
      leaveFlow();
      renderComposedDecoration(ctx, page, inkHex, 'over');
      enterFlow();
    }
  } else if (page.composed) renderComposedFrames(ctx, page, inkHex, page.composed.decoration, undefined, frameCjk);
  if (comicUnder) renderComicTextFrames(ctx, page, inkHex);
  renderFootnoteRules(ctx, page);

  leaveFlow();

  // A comic page's panels and lettering (or its half of a spread), and the
  // strips set in its flow, on the sheet (never through the flow frame).
  for (const comic of pageComics(page)) {
    if (comic === comicUnder) renderComicBalloons(ctx, comic);
    else if (comicHoldsText(comic)) {
      // A strip with text panels (#959): its panels, the text in the flow
      // frame over them, then its lettering.
      renderComicPanels(ctx, comic, inkHex);
      enterFlow();
      renderComicTextFrames(ctx, page, inkHex, comic);
      leaveFlow();
      renderComicBalloons(ctx, comic);
    } else renderComicPage(ctx, comic, inkHex);
  }

  // Line numbers (#621) stand on the sheet beside the lines they number.
  if (page.lineNumbers) renderHeaderFooterSlot(ctx, page.lineNumbers, inkHex);
  if (page.header) renderHeaderFooterSlot(ctx, page.header, inkHex);
  if (page.footer) renderHeaderFooterSlot(ctx, page.footer, inkHex);

  if (bleedClip) restoreContext(ctx);

  if (options?.pageNegative) {
    ctx.filter = 'none';
  }

  if (options?.printPreview) paintPrintPreview(ctx, canvas, page, doc, options.printPreview, sx, inset);

  if (inset === 0) renderCutLines(ctx, page, doc);
}

/** The soft proof over the painted page, then its screen guides. */
function paintPrintPreview(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  page: VDTPage,
  doc: VDTDocument,
  preview: PrintPreview,
  pxPerPagePx: number,
  inset: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    // A tainted canvas (a cross-origin picture) cannot be read back.
    return;
  }
  proofPixels(image.data, w, h, preview, pxPerPagePx);
  ctx.putImageData(image, 0, 0);

  const guides = preview.guides;
  const marks = preview.marksFor?.(page.index) ?? [];
  if (!guides && marks.length === 0) return;
  saveContext(ctx);
  const line = 1 / pxPerPagePx;
  ctx.lineWidth = line;
  if (guides) {
    const trim = doc.trimOffset;
    const bleed = trim > 0 ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi) : 0;
    const box = (d: number) => [trim + d, trim + d, page.width - 2 * (trim + d), page.height - 2 * (trim + d)] as const;
    ctx.setLineDash([]);
    ctx.strokeStyle = PREVIEW_TRIM_COLOR;
    if (trim > inset) ctx.strokeRect(...box(0));
    if (bleed > 0 && inset === 0) {
      ctx.strokeStyle = PREVIEW_BLEED_COLOR;
      ctx.strokeRect(...box(-bleed));
    }
    if (guides.safeZonePx > 0) {
      ctx.strokeStyle = PREVIEW_SAFE_COLOR;
      ctx.setLineDash([4 * line, 3 * line]);
      ctx.strokeRect(...box(guides.safeZonePx));
    }
  }
  if (marks.length > 0) {
    ctx.setLineDash([]);
    ctx.lineWidth = 2 * line;
    ctx.strokeStyle = PREVIEW_MARK_COLOR;
    ctx.fillStyle = PREVIEW_MARK_FILL;
    for (const m of marks) {
      ctx.fillRect(m.x, m.y, m.width, m.height);
      ctx.strokeRect(m.x, m.y, m.width, m.height);
    }
  }
  restoreContext(ctx);
}

/** Screen-only colours of the print preview's guides. */
const PREVIEW_TRIM_COLOR = '#00a3d9';
const PREVIEW_BLEED_COLOR = '#d9008f';
const PREVIEW_SAFE_COLOR = '#2fa84f';
const PREVIEW_MARK_COLOR = '#e5484d';
const PREVIEW_MARK_FILL = 'rgba(229, 72, 77, 0.12)';

export function renderPage(page: VDTPage, doc: VDTDocument, options?: RenderPageOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderPageToCanvas(page, doc, canvas, options);
  return canvas;
}

export function renderToCanvas(doc: VDTDocument, options?: RenderPageOptions): HTMLCanvasElement[] {
  // One report per `fileId` for the whole document, not per page.
  const onWarning = options?.onWarning;
  const reported = new Set<string>();
  const pageOptions: RenderPageOptions | undefined = onWarning
    ? {
        ...options,
        onWarning: (w) => {
          if (reported.has(w.fileId)) return;
          reported.add(w.fileId);
          onWarning(w);
        },
      }
    : options;
  return doc.pages.map((page) => renderPage(page, doc, pageOptions));
}
