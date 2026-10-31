// A page as markup: its blocks, strip captions, exercise boxes, composed
// frames, comic pages, the mirrored-flow style and character grids
// (#1276: split out of html-backend.ts).
import { footnoteRuleSegments } from '../paint/columnRule.js';
import { type VDTBlock, type VDTPage, verticalFlowOf, type VDTComicPage, type VDTFrame, type VDTComicPanel } from '../vdt.js';
import { type CjkGridCells, CHARACTER_GRID_COLOR } from '../pipeline/text/cjkGrid.js';
import type { CjkRegion } from '../types.js';
import { renderComicHtml } from './htmlComic.js';
import { pageComics, comicBlockOnSheet } from '../comics/transform.js';
import { comicFramePaintOrder, composedFrameBlockIds, composedSheetClip, composedSheetClipOnSheet, decorationUnder, decorationOver, composedPaintOrder, composedReadingOrder, frameMatrix, frameClips, frameContentRect } from '../composed/paint.js';
import type { ExerciseData } from '../exercises/digital.js';
import { renderDesignSlot, renderDesignTextBlock } from './design.js';
import { inkFilterDefs, imageUrl, inkFilterDecl } from './images.js';
import { renderBullet, dropCapHtml, renderLine } from './lines.js';
import { lineQrHtml } from './lineQr.js';
import type { HtmlPaint } from './render.js';
import { renderResourceBlockHtml } from './resources.js';
import { resourceAnchorId, footnoteElementId, anchorElementId, pageElementId } from './segmentText.js';
import { quoteFontString } from './styles.js';
import { esc } from './textRuns.js';
import { renderVerticalBullet, renderVerticalLine } from './vertical.js';

function renderBlockInner(block: VDTBlock, options: HtmlPaint): string {
  if (block.hidden) return '';
  // An exercise's drawn box (a grid, an operation, a writing area) keeps
  // its paths mirrored with a mirrored flow, as the canvas and the PDF
  // paint it (#1244).
  if (block.designOverlay) return renderDesignSlot(block.designOverlay, options, !!block.callout?.styleId?.startsWith('__postext-ex'));
  // Resource embeds carry their own measured geometry (image/table + caption);
  // the block's single placeholder line renders nothing useful.
  if (block.resourceBlock) return renderResourceBlockHtml(block, options);
  // A strip: its picture is the page's comic markup; the block holds its
  // caption (#590).
  if (block.comic) return renderStripCaptionHtml(block, options);
  const parts: string[] = [];
  const v = options.vertical;
  parts.push(v ? renderVerticalBullet(block, v) : renderBullet(block, options.dir));
  block.lines.forEach((line, i) => {
    const next = block.lines[i + 1];
    const lead = i === 0 && block.dropCap && !v ? dropCapHtml(block.dropCap, line, quoteFontString(block.fontString), (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0)) : '';
    parts.push(v ? renderVerticalLine(line, block, v, options.linkTargets, next, options) : renderLine(line, block, options.linkTargets, options.dir, options.rootLang, next, lead, options));
    // A link note's QR code (#1302).
    if (line.qr && !v) parts.push(lineQrHtml(line as typeof line & { qr: NonNullable<typeof line.qr> }, block.color));
  });
  return parts.join('');
}

/** A strip's caption (`VDTBlock.stripCaption`, #590): the bar behind it,
 *  then its lines, set as the lines of a paragraph (in the flow: turned on
 *  a vertical page, mirrored on a right-to-left one). Empty without one. */
function renderStripCaptionHtml(block: VDTBlock, options: HtmlPaint): string {
  const caption = block.stripCaption;
  if (!caption) return '';
  const parts: string[] = [];
  if (caption.id) parts.push(zeroSizeAnchor(resourceAnchorId(caption.id), block.bbox.x, block.bbox.y));
  if (caption.bar) {
    const { rect, background } = caption.bar;
    parts.push(
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${block.bbox.x + rect.x}px;top:${block.bbox.y + rect.y}px;width:${rect.width}px;height:${rect.height}px;` +
      `background:${background};"></div>`,
    );
  }
  const v = options.vertical;
  const lines = block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount);
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    parts.push(v ? renderVerticalLine(line, block, v, options.linkTargets, next, options) : renderLine(line, block, options.linkTargets, options.dir, options.rootLang, next, '', options));
  });
  return parts.join('');
}

/** A strip's block: its picture (`comic`, the strip's comic markup when it
 *  is read in its block) and its caption, as one `<figure>` with the
 *  caption its `<figcaption>`, in reading order (#590). On a page whose
 *  comics lie over the sheet the caption stands alone. */
function renderStripBlockHtml(block: VDTBlock, options: HtmlPaint, comic: string): string {
  const caption = renderStripCaptionHtml(block, options);
  if (!caption) return comic;
  if (!comic) return `<div class="pt-strip-caption" style="display:contents;">${caption}</div>`;
  const figcaption = `<figcaption class="pt-strip-caption" style="display:contents;">${caption}</figcaption>`;
  const above = block.stripCaption?.position === 'above';
  return `<figure class="pt-strip" style="display:contents;">${above ? figcaption + comic : comic + figcaption}</figure>`;
}

/**
 * Render a block wrapped in a `<div class="pt-block" data-block-id="...">`
 * container with `display:contents` so lines keep their absolute positioning
 * against the page wrapper. The wrapper exists solely as a stable anchor for
 * per-block DOM patching — consumers can replace a single block's outerHTML
 * without touching the rest of the page.
 */
function renderBlock(block: VDTBlock, options: HtmlPaint, extra = ''): string {
  // A note is where its markers link to (#264).
  const note = block.footnoteNote !== undefined && !block.hidden
    ? zeroSizeAnchor(footnoteElementId(block.footnoteNote), block.bbox.x, block.bbox.y)
    : '';
  // A box printed upside down (#1229): a positioned layer at the page's
  // origin, turned about the box's centre.
  const style = block.turn
    ? `position:absolute;left:0;top:0;width:0;height:0;transform-origin:${block.turn.cx.toFixed(3)}px ${block.turn.cy.toFixed(3)}px;transform:rotate(180deg);`
    : 'display:contents;';
  return (
    `<div class="pt-block" data-block-id="${esc(block.id)}" style="${style}">` +
    note +
    (block.comic && block.stripCaption && !block.hidden ? renderStripBlockHtml(block, options, extra) : renderBlockInner(block, options) + extra) +
    exerciseBoxHtml(block, options) +
    `</div>`
  );
}

/** The boxes of the document's exercises by their own container id (see
 *  {@link HtmlPaint.exerciseBoxes}); `undefined` when it has none. */
export function exerciseBoxesOf(data: ExerciseData | undefined): Map<number, { ex: number; outer: boolean }> | undefined {
  if (!data) return undefined;
  const out = new Map<number, { ex: number; outer: boolean }>();
  for (const r of data.exercises) {
    out.set(r.id, { ex: r.id, outer: true });
    for (const s of r.slots) if (s.box !== undefined && !out.has(s.box)) out.set(s.box, { ex: r.id, outer: false });
    for (const g of r.grids ?? []) if (!out.has(g.box)) out.set(g.box, { ex: r.id, outer: false });
  }
  return out;
}

/** Where an exercise's box lies (#1230): an empty element over a callout
 *  frame of an exercise — its outer box, a writing area, a grid — that the
 *  exercise script finds by `data-pt-box` and lays its inputs, lines and
 *  bar in. Not on a vertical page, whose flow is turned. */
function exerciseBoxHtml(block: VDTBlock, options: HtmlPaint): string {
  const boxes = options.exerciseBoxes;
  if (!boxes || block.type !== 'callout' || !block.callout || block.hidden || options.vertical) return '';
  const own = block.calloutPath && block.calloutPath.length > 0 ? block.calloutPath[block.calloutPath.length - 1]! : block.containerId;
  const box = own !== undefined ? boxes.get(own) : undefined;
  if (!box) return '';
  const { x, y, width, height } = block.bbox;
  const part = block.callout.part !== undefined ? ` data-pt-part="${block.callout.part}"${block.callout.continued ? ' data-pt-continued=""' : ''}` : '';
  return `<div class="pt-ex-box" data-pt-box="${own}" data-pt-ex="${box.ex}"${box.outer ? ` data-pt-exercise="${box.ex}"` : ''}${part} ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;pointer-events:none;"></div>`;
}

/** An empty element with an id at a point of the page: the target of an
 *  in-document link. */
function zeroSizeAnchor(id: string, x: number, y: number): string {
  return `<span id="${esc(id)}" style="position:absolute;left:${x}px;top:${y}px;width:0;height:0;"></span>`;
}

interface PageRenderResult {
  /** Full outer HTML including the wrapping <div class="pt-page">. */
  outerHtml: string;
  /** Inner HTML: opener band, pt-block wrappers, header and footer. */
  innerHtml: string;
  /** Per-block outer-HTML strings, in render order. */
  blocks: Array<{ id: string; html: string }>;
  /** Everything on the page that is not a block — opener / part band,
   *  header, footer. Lives outside `blocks`, so a patcher that diffs blocks
   *  must compare this separately to catch a design-only change. */
  decorationHtml: string;
  /** A comic page's markup (`page.comic`), part of `innerHtml`. */
  comicHtml?: string;
}

export function renderPageDetailed(
  page: VDTPage,
  background: string,
  pageOptions: HtmlPaint,
  ink: { hex: string; matrix: number[] } | null = null,
  /** With cut lines, how far the bleed box lies inside the sheet (px); 0
   *  without them. */
  bleedInset = 0,
  /** The character grid drawn over the type area (`cjk.grid.show`). */
  gridCells?: CjkGridCells,
  /** `cjk.region` and `cjk.uprightDigits`, for a vertical page. */
  verticalRegion?: CjkRegion,
  verticalDigits?: number,
): PageRenderResult {
  const bgDecl = background && background !== 'transparent' ? `background:${background};` : '';
  // With cut lines nothing the page paints shows past the bleed box, as on
  // the canvas and in the PDF (EF-133).
  const clipDecl = bleedInset > 0 ? `clip-path:inset(${bleedInset}px);` : '';
  // A filter id local to the page and its ink, so every page is
  // self-contained (a patcher may replace pages one by one) and two
  // documents on one page never share a filter.
  const inked: HtmlPaint = {
    ...pageOptions,
    ...(ink ? { ink: { id: `pt-ink-${ink.hex.replace(/[^0-9a-z]/gi, '')}-${page.index}`, matrix: ink.matrix } } : {}),
    // The filters of the pictures painted in a colour, defined on the page.
    tints: { page: page.index, filters: new Map<string, string>() },
  };
  // A vertical page's flow sets its text down the column.
  const vflow = verticalFlowOf(page);
  const options: HtmlPaint = vflow
    ? { ...inked, vertical: { region: verticalRegion ?? 'mainland', uprightDigits: verticalDigits ?? 2, ...(vflow.centralBaselines ? { axes: vflow.centralBaselines } : {}), ...(vflow.dashAdvances ? { dashes: vflow.dashAdvances } : {}) } }
    : inked;
  // The comics the page shows (#565–#567): its comic page (or its half of
  // a spread), then its strips, each on the sheet. A strip is read where
  // it stands in the text: on a page whose flow is the sheet its markup
  // goes in its block; on a vertical or mirrored page, whose flow box is
  // turned, it is laid over the sheet with the comic page.
  const comics = pageComics(page);
  const plainFlow = !vflow && page.flow?.writingMode !== 'horizontal-tb';
  // A comic page's text panels (#885): each frame's blocks laid over its
  // panel, before the panel's lettering, inside the comic's markup.
  // Those of a strip (#959) likewise, inside the strip's markup.
  const comicText = new Map<VDTComicPage, Map<number, string>>();
  const comicTextBlocks: Array<{ id: string; html: string }> = [];
  // On a vertical or right-to-left page the text is set in the page's flow
  // frame (#909): each frame is written in a box that turns or mirrors it
  // as the page's flow box does, over the panel on the sheet.
  const flowBox = vflow
    ? `<div class="pt-flow" style="position:absolute;left:0;top:0;width:${page.height}px;height:${page.width}px;transform:translate(${page.width}px,0) rotate(90deg);transform-origin:0 0;">`
    : page.flow?.writingMode === 'horizontal-tb'
      ? `<div class="pt-flow pt-flow-mirrored" style="position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform:scaleX(-1);transform-origin:${page.flow.mirror.originX / 2}px 0;">${MIRRORED_FLOW_STYLE}`
      : '';
  for (const comic of comics) {
    for (const item of comicFramePaintOrder(page, comic)) {
      if (item.kind !== 'frame' || item.frame.panel === undefined) continue;
      const parts = item.blocks.map((b) => ({ id: b.id, html: renderBlock(b, options) }));
      comicTextBlocks.push(...parts);
      const frameHtml = composedFrameOpen(item.frame, 'auto') + parts.map((b) => b.html).join('') + '</div>';
      const byPanel = comicText.get(comic) ?? new Map<number, string>();
      byPanel.set(item.frame.panel, flowBox ? `${flowBox}${frameHtml}</div>` : frameHtml);
      comicText.set(comic, byPanel);
    }
  }
  const comicMarkup = (comic: VDTComicPage): string => {
    const text = comicText.get(comic);
    return renderComicPageHtml(page, comic, comics.indexOf(comic), options.vertical ? { ...options, vertical: undefined } : options,
      text ? (panel) => text.get(panel.index) ?? '' : undefined);
  };
  const stripInBlock = (block: VDTBlock): string =>
    plainFlow && block.comic && !block.hidden ? comicMarkup(comicBlockOnSheet(page, block)!) : '';
  const blocks: Array<{ id: string; html: string }> = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      blocks.push({ id: block.id, html: renderBlock(block, options, stripInBlock(block)) });
    }
  }
  // Floated resources live in page bands outside the columns (a span:'page'
  // float crosses the gutter); they carry absolute geometry already. A
  // composed page's frames (#855) are floats painted with their frames.
  const frameIds = composedFrameBlockIds(page);
  for (const fb of page.floats ?? []) {
    if (frameIds.has(fb.id)) continue;
    blocks.push({ id: fb.id, html: renderBlock(fb, options, stripInBlock(fb)) });
  }
  // A comic page's text panels (#885) are written in the comic's markup;
  // their blocks are the page's to patch.
  blocks.push(...comicTextBlocks);
  // The frames, each in a box of its own that turns it and clips it, in
  // reading order (Markdown order, #862: what a screen reader and a
  // fixed-layout EPUB read), painted in layer order by their `z-index`
  // inside one stacking context, the template's decoration at layer 0;
  // through a flow frame the decoration stands on the sheet, after the flow.
  const composedFlow = page.composed !== undefined && !plainFlow;
  // On a page of a spread (#861) the frames and the decoration show the
  // page's share of the sheet only.
  const sheetClip = composedSheetClip(page);
  const sheetClipped = (html: string): string => {
    if (!sheetClip || html === '') return html;
    const [l, t, r, b] = [sheetClip.x, sheetClip.y, sheetClip.x + sheetClip.width, sheetClip.y + sheetClip.height].map(frameNum);
    return `<div class="pt-sheet-clip" style="position:absolute;left:0;top:0;width:0;height:0;overflow:visible;clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px);">${html}</div>`;
  };
  // Through a flow frame the decoration stands on the sheet: its clip
  // mapped there (#926).
  const sheetOnSheet = composedSheetClipOnSheet(page);
  const decorationClipped = (html: string): string => {
    if (!composedFlow || !sheetOnSheet || html === '') return sheetClipped(html);
    const [l, t, r, b] = [sheetOnSheet.x, sheetOnSheet.y, sheetOnSheet.x + sheetOnSheet.width, sheetOnSheet.y + sheetOnSheet.height].map(frameNum);
    return `<div class="pt-sheet-clip" style="position:absolute;left:0;top:0;width:0;height:0;overflow:visible;clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px);">${html}</div>`;
  };
  const decorationOptions: HtmlPaint = composedFlow ? { ...options, vertical: undefined } : options;
  const underSlot = decorationUnder(page.composed?.decoration);
  const composedDecorationHtml = underSlot ? decorationClipped(renderDesignSlot(underSlot, decorationOptions)) : '';
  // Connectors painted over every frame (#1076): their own box, last in
  // the paint order; through a flow frame, on the sheet after the rest.
  const overSlot = decorationOver(page.composed?.decoration);
  const composedOverHtml = overSlot ? decorationClipped(renderDesignSlot(overSlot, decorationOptions)) : '';
  const composedParts: string[] = [];
  /** The frames' boxes and the decoration: what a patcher of blocks must
   *  also compare (`decorationHtml`). */
  const composedShape: string[] = [];
  if (page.composed) {
    const paint = composedPaintOrder(page);
    for (const item of composedReadingOrder(paint)) {
      const z = paint.indexOf(item) + 1;
      if (item.kind === 'decoration' || item.kind === 'over') {
        const html = item.kind === 'over' ? composedOverHtml : composedDecorationHtml;
        if (!composedFlow && html) composedParts.push(`<div class="pt-frame-decoration${item.kind === 'over' ? ' pt-frame-decoration-over' : ''}" style="position:absolute;left:0;top:0;width:0;height:0;z-index:${z};">${html}</div>`);
        continue;
      }
      if (item.blocks.length === 0) continue;
      const open = composedFrameOpen(item.frame, z, item.facing);
      composedShape.push(open);
      composedParts.push(open);
      // A frame set in its own writing mode (#944) writes its lines as a
      // page of that mode does: set vertically, or across.
      const f = item.frame;
      const frameOptions: HtmlPaint = f.writingMode === 'vertical-rl'
        ? { ...options, vertical: { region: verticalRegion ?? 'mainland', uprightDigits: verticalDigits ?? 2, ...(f.centralBaselines ? { axes: f.centralBaselines } : {}), ...(f.dashAdvances ? { dashes: f.dashAdvances } : {}) } }
        : f.writingMode === 'horizontal-tb' ? { ...options, vertical: undefined } : options;
      for (const b of item.blocks) {
        const html = renderBlock(b, frameOptions, stripInBlock(b));
        // The facing page's half of a frame across a spread's spine is
        // painted only: no block of the page's to patch or select.
        if (item.facing) composedShape.push(html);
        else blocks.push({ id: b.id, html });
        composedParts.push(html);
      }
      composedParts.push('</div>');
    }
    if (composedParts.length > 0) {
      composedParts.unshift('<div class="pt-composed" style="position:absolute;left:0;top:0;width:0;height:0;z-index:0;">');
      composedParts.push('</div>');
    }
  }
  const blocksHtml = blocks.filter((b) => !frameIds.has(b.id)).map((b) => b.html).join('') + sheetClipped(composedParts.join(''));
  // Same paint order as the canvas backend: the opener / part band goes
  // under the body (a part page's full-bleed background must not cover its
  // chapter list); header and footer paint on top.
  const openerHtml = page.openerBand ? renderDesignSlot(page.openerBand, options) : '';
  // Running heads and folios stay on the sheet, horizontal.
  const sheetOptions: HtmlPaint = options.vertical ? { ...options, vertical: undefined } : options;
  const slotParts: string[] = [];
  // Line numbers (#621): on the sheet, hidden from assistive technology
  // (each block is an artifact) and left out of a selection, so copied
  // text runs from line to line without them.
  if (page.lineNumbers) {
    slotParts.push(`<div class="pt-line-numbers" style="user-select:none;-webkit-user-select:none;pointer-events:none;">${renderDesignSlot(page.lineNumbers, sheetOptions)}</div>`);
  }
  if (page.header) slotParts.push(renderDesignSlot(page.header, sheetOptions));
  if (page.footer) slotParts.push(renderDesignSlot(page.footer, sheetOptions));
  // Whether or not a picture on the page uses it: a host patching blocks
  // one by one may bring in an SVG image the first render did not have.
  const defsHtml = inkFilterDefs(options.ink, options.tints?.filters);
  // The separators above the footnotes of the columns.
  const footnoteRulesHtml = footnoteRuleSegments(page).map((r) =>
    `<div class="pt-footnote-rule" style="position:absolute;left:${r.x}px;top:${r.y - r.lineWidthPx / 2}px;width:${r.width}px;height:${r.lineWidthPx}px;background:${r.color};"></div>`,
  ).join('');
  const gridHtml = gridCells ? renderCharacterGridSvg(gridCells, vflow ? page.height : page.width, vflow ? page.width : page.height) : '';
  // A comic page's panels and lettering, on the sheet (never through the
  // flow frame), under the running heads, as the canvas paints them.
  const comicHtml = page.comic ? comicMarkup(page.comic) : '';
  const sheetComicsHtml = comicHtml + (plainFlow ? '' : comics.filter((c) => c !== page.comic).map(comicMarkup).join(''));
  const sheetComposedHtml = composedFlow ? composedDecorationHtml + composedOverHtml : '';
  const decorationHtml = defsHtml + gridHtml + openerHtml + footnoteRulesHtml + sheetComicsHtml + composedShape.join('') + composedDecorationHtml + composedOverHtml + slotParts.join('');
  // A vertical page's flow: one box turned a quarter turn clockwise, its
  // text lines turned back and set vertically (see `renderVerticalLine`).
  const anchorsHtml = (options.anchors ?? [])
    .filter((a) => a.pageIndex === page.index)
    .map((a) => zeroSizeAnchor(anchorElementId(a.id), a.x, a.y))
    .join('');
  const flowHtml = gridHtml + openerHtml + anchorsHtml + blocksHtml + footnoteRulesHtml;
  // A right-to-left page's flow: one box turned over the sheet's vertical
  // axis, every text run and picture in it turned back about its own box
  // (`MIRRORED_FLOW_STYLE`), so the layout lands mirrored and reads as
  // written.
  const innerHtml = defsHtml + (vflow
    ? `<div class="pt-flow" style="position:absolute;left:0;top:0;width:${page.height}px;height:${page.width}px;transform:translate(${page.width}px,0) rotate(90deg);transform-origin:0 0;">${flowHtml}</div>`
    : page.flow?.writingMode === 'horizontal-tb'
      ? `<div class="pt-flow pt-flow-mirrored" style="position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform:scaleX(-1);transform-origin:${page.flow.mirror.originX / 2}px 0;">${MIRRORED_FLOW_STYLE}${flowHtml}</div>`
      : flowHtml) + sheetComposedHtml + sheetComicsHtml + slotParts.join('');
  // A right-to-left document's pages say so, with its language, for a host
  // that mounts them apart from the document's root (#379); so do a
  // Japanese document's, whose glyph forms (a pan-CJK face's `locl`) and
  // vertical forms the browser picks by language (#428).
  const pageAttrs = (options.dir === 'rtl' ? ' dir="rtl"' : '') + (options.lang !== undefined ? ` lang="${options.lang}"` : '');
  const outerHtml =
    `<div class="pt-page" id="${pageElementId((options.pageIndexOffset ?? 0) + page.index)}" data-page="${page.index}"${pageAttrs} style="` +
    `position:relative;` +
    `width:${page.width}px;` +
    `height:${page.height}px;` +
    `flex-shrink:0;` +
    bgDecl +
    clipDecl +
    `">${innerHtml}</div>`;
  return { outerHtml, innerHtml, blocks, decorationHtml, ...(comicHtml ? { comicHtml } : {}) };
}

/** A number of a frame's box, to four decimals. */
function frameNum(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return String(Object.is(r, -0) ? 0 : r);
}

/** The opening tag of a composed page's frame (#855): an empty box at the
 *  page's origin, so the frame's blocks keep their page coordinates, turned
 *  about the frame's centre (`frameMatrix`) and, when the frame's content
 *  overflows it, clipped to the frame's box (`frameClips`). `z`: its place
 *  in the paint order (`composedPaintOrder`), as the frames are written
 *  in reading order. The facing page's half of a frame across a spread's
 *  spine (#861) is hidden from assistive technology: the text is read on
 *  the other page. */
function composedFrameOpen(frame: VDTFrame, z: number | 'auto', facing = false): string {
  const decls = ['position:absolute', 'left:0', 'top:0', 'width:0', 'height:0', `z-index:${z}`];
  const m = frameMatrix(frame);
  if (m) decls.push('transform-origin:0 0', `transform:matrix(${m.map(frameNum).join(',')})`);
  if (frame.polygon && frame.polygon.length >= 3) {
    // A frame with an outline of its own (a comic panel cut by a slanted
    // line, #885): its content is clipped to it.
    decls.push(`clip-path:polygon(${frame.polygon.map((p) => `${frameNum(p.x)}px ${frameNum(p.y)}px`).join(',')})`);
  } else if (frameClips(frame)) {
    const { x, y, width, height } = frameContentRect(frame);
    const [l, t, r, b] = [x, y, x + width, y + height].map(frameNum);
    decls.push(`clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px)`);
  }
  return `<div class="pt-frame${frame.unmirrorX !== undefined ? ' pt-unmirrored' : ''}" data-frame-id="${esc(frame.id)}" data-layer="${frame.layer}"${facing ? ' data-facing="true" aria-hidden="true"' : ''} style="${decls.join(';')};">`;
}

/** The markup of a comic on a page (its comic page, a half of a spread or
 *  a strip, on the sheet; #565): see `renderComicHtml`. Its pictures come
 *  from `resourceImageUrl` (a miss reported once and drawn as a
 *  placeholder), tinted to the ink when single ink applies; its lettering
 *  is design text. `k`: its place among the page's comics (`pageComics`),
 *  which keeps its ids apart from theirs. */
function renderComicPageHtml(page: VDTPage, comic: VDTComicPage, k: number, options: HtmlPaint, overPanel?: (panel: VDTComicPanel) => string): string {
  return renderComicHtml(comic, page.width, page.height, {
    artUrl: (art) => imageUrl(options, art.fileId, art.resourceId),
    artStyle: (art, url) => inkFilterDecl(options, art.kind === 'svg', url),
    text: (block) => renderDesignTextBlock(block, options),
    idBase: `pt-p-${(options.pageIndexOffset ?? 0) + page.index}${k > 0 ? `-c${k}` : ''}-panel`,
    ...(options.comicCast ? { cast: options.comicCast } : {}),
    ...(overPanel ? { overPanel } : {}),
  });
}

/** What turns the runs and pictures of a mirrored flow back (see
 *  `VDTMirroredFlowFrame`): every text run of the output is an absolutely
 *  positioned box set `white-space:pre` (line segments, plain lines, list
 *  markers, design text lines), and pictures are `<img>` or inline `<svg>`
 *  (formulas). Each turns about its own centre, so it stays where the
 *  mirrored layout put it. A box that sets a transform of its own (a
 *  stretched dash, a turned design picture) keeps it and stays mirrored. */
const MIRRORED_FLOW_STYLE =
  '<style>.pt-flow-mirrored [style*="white-space:pre"],.pt-flow-mirrored img,' +
  // An exercise's drawing is geometry, mirrored with the flow as the canvas
  // and the PDF mirror it (#1244): a crossword's cells, an operation's rules.
  '.pt-flow-mirrored svg:not(.pt-char-grid):not(.pt-path),.pt-flow-mirrored .pt-video{transform:scaleX(-1);}' +
  // A box reflected back about its body (a vertical label, #955) or a
  // vertical frame of the page placed by a matrix that includes the mirror
  // (#960): what is in it is not mirrored, so nothing is turned back.
  '.pt-flow-mirrored .pt-unmirrored [style*="white-space:pre"],.pt-flow-mirrored .pt-unmirrored img,' +
  '.pt-flow-mirrored .pt-unmirrored svg:not(.pt-char-grid):not(.pt-path),.pt-flow-mirrored .pt-unmirrored .pt-video{transform:none;}</style>';

/** The character grid (稿纸) as one SVG path over the page, under the
 *  text (see `cjkGridCells`). */
function renderCharacterGridSvg(cells: CjkGridCells, width: number, height: number): string {
  const { cell } = cells;
  const d: string[] = [];
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  cells.columns.forEach((x0, c) => {
    const chars = cells.columnChars[c] ?? cells.chars;
    const w = chars * cell;
    for (const y of cells.rows) {
      d.push(`M${n(x0)} ${n(y)}h${n(w)}M${n(x0)} ${n(y + cell)}h${n(w)}`);
      for (let i = 0; i <= chars; i++) d.push(`M${n(x0 + i * cell)} ${n(y)}v${n(cell)}`);
    }
  });
  return `<svg class="pt-char-grid" aria-hidden="true" width="${width}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none;">` +
    `<path d="${d.join('')}" fill="none" stroke="${CHARACTER_GRID_COLOR}" stroke-width="0.5"/></svg>`;
}
