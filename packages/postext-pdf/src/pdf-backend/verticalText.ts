/**
 * Vertical text in the PDF (issue #191).
 *
 * A vertical page's flow is drawn through the page's frame (a quarter turn
 * clockwise, `renderPage`), where text drawn as it is comes out turned:
 * right for Latin words and long numbers (sideways), wrong for Chinese
 * characters, which stand upright, each in a cell of one em down the
 * column. The painter here cuts the text into the runs the layout measured
 * (`verticalRuns`, with the document's `cjk.uprightDigits`, or the runs an
 * author forced with `:tcy` / `:upright` / `:sideways`) and draws:
 *
 * - sideways runs with the horizontal font, as they are;
 * - upright characters with the font's vertical twin (`Identity-V`, see
 *   `verticalFonts.ts`): one text object per run of cells, its text matrix
 *   turned back (`0 1 −1 0`), the glyphs shaped with `vert` and advancing
 *   one em down the column by themselves, tracking as `TJ` numbers (in
 *   WMode 1 a positive number moves the pen down); the pen is placed so
 *   each glyph's em box is centred on the column's central axis
 *   (`VDTFlowFrame.centralBaselines`);
 * - marks with no vertical form in the font as the canvas draws them:
 *   brackets and quotes turned about their em box, a mainland pause mark
 *   moved to the top right of its cell;
 * - dashes, ellipses and the interpunct turned about their em box (a dash
 *   stretched to its cell);
 * - a number set in one cell (tate-chu-yoko) upright, squeezed across to
 *   one em when wider.
 *
 * Every cell is placed where the layout measured it, one em (or its cell)
 * apart plus the tracking, so the PDF matches the canvas and the HTML.
 */
import {
  beginText,
  endText,
  PDFArray,
  PDFHexString,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  setLineWidth,
  setStrokingColor,
  setTextMatrix,
  setTextRenderingMode,
  TextRenderingMode,
  type Color,
  type PDFFont,
  type PDFName,
  type PDFPage,
} from 'pdf-lib';
import {
  CORNER_OFFSET_EM,
  DEFAULT_CENTRAL_BASELINE,
  forcedVerticalRuns,
  graphemesOf,
  verticalRuns,
  type ForcedOrientation,
  type VerticalGlyph,
} from 'postext';
import {
  alphaOf,
  alphaStateOp,
  fontKeyOn,
  opt,
  registerVerticalPainter,
  showTextShaped,
  textAdvancePx,
  withActualText,
  type PageCtx,
  type TextOutline,
} from './primitives';
import { fileRuns, noteMissingGlyphs } from '../faceFiles';
import { fontFamilyOf } from '../fontFamilies';
import { VERTICAL_ORIGIN, verticalTwinOf, type VerticalTwin } from '../verticalFonts';

const twinKeys = new WeakMap<PDFPage, Map<PDFFont, PDFName>>();

/** The resource name of `font`'s vertical twin on `page`. */
function twinKeyOn(page: PDFPage, font: PDFFont, twin: VerticalTwin): PDFName {
  let keys = twinKeys.get(page);
  if (!keys) {
    keys = new Map();
    twinKeys.set(page, keys);
  }
  let key = keys.get(font);
  if (!key) {
    key = page.node.newFontDictionary(`${font.name}V`, twin.ref);
    keys.set(font, key);
  }
  return key;
}

/** One show of a run of upright cells in one file: its twin, its text,
 *  and whether it takes the font's vertical forms (`vert`). */
interface UprightShow {
  file: PDFFont;
  twin: VerticalTwin;
  text: string;
  /** Shaped in the font's vertical forms (else as it is). */
  vertical: boolean;
}

/**
 * Paint `text` down a vertical line from `xPx` (along the line) on
 * `baselinePx` (the line's alphabetic baseline across the column), in the
 * frame of the page's flow. The tracking set on the context
 * (`ctx.trackingPx`) follows every cell and every glyph of a sideways run;
 * a number set in one cell takes it once. `actualText` is what the glyphs
 * read as.
 */
export function drawVerticalTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
  orient?: ForcedOrientation,
): void {
  const v = ctx.vertical;
  if (!v || !text) return;
  const { scale, pageHeightPt } = ctx;
  const em = sizePx;
  const family = fontFamilyOf(font);
  const central = (family !== undefined ? v.axes?.[family] : undefined) ?? DEFAULT_CENTRAL_BASELINE;
  const centralPx = central * em;
  const axis = baselinePx - centralPx;
  const tracking = ctx.trackingPx ?? 0;
  const X = (px: number): number => px * scale;
  const Y = (py: number): number => pageHeightPt - py * scale;
  const sizePt = sizePx * scale;
  const graphemes = graphemesOf(text);
  const runs = orient ? forcedVerticalRuns(graphemes, orient) : verticalRuns(graphemes, v.region, v.uprightDigits);

  const body: PDFOperator[] = [];
  let currentKey: PDFName | undefined;
  let currentTc = Number.NaN;
  const useFont = (key: PDFName): void => {
    if (key !== currentKey) {
      body.push(setFontAndSize(key, sizePt));
      currentKey = key;
    }
  };
  const useTc = (px: number): void => {
    if (px !== currentTc) {
      body.push(setCharacterSpacing(px * scale));
      currentTc = px;
    }
  };

  // Consecutive upright cells of one em: one show per file of the face.
  let pending: UprightShow[] = [];
  let pendingStart = 0;
  const flushUpright = (): void => {
    if (pending.length === 0) return;
    let cellStart = pendingStart;
    // In WMode 1 the pen stands at the glyph's vertical origin, `VERTICAL_ORIGIN`
    // above its baseline: the em box's centre sits on the cell's centre
    // when the pen is that far above the axis's own height.
    const penOffset = em * (0.5 - (VERTICAL_ORIGIN / 1000 - central));
    const trackTj = tracking === 0 ? 0 : Math.round((tracking / em) * 1000 * 100) / 100;
    for (const show of pending) {
      useFont(twinKeyOn(ctx.page, show.file, show.twin));
      useTc(0);
      noteMissingGlyphs(show.file, show.text);
      const { hex } = show.twin.encode(show.text, show.vertical);
      body.push(setTextMatrix(0, 1, -1, 0, X(cellStart + penOffset), Y(axis)));
      const count = hex.length / 4;
      if (trackTj === 0 || count === 1) {
        body.push(PDFOperator.of(PDFOperatorNames.ShowText, [PDFHexString.of(hex)]));
      } else {
        const array = PDFArray.withContext(ctx.page.doc.context);
        for (let i = 0; i < count; i++) {
          array.push(PDFHexString.of(hex.slice(i * 4, i * 4 + 4)));
          if (i < count - 1) array.push(PDFNumber.of(trackTj));
        }
        body.push(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]));
      }
      cellStart += graphemesOf(show.text).length * (em + tracking);
    }
    pending = [];
  };
  const queueUpright = (g: string, at: number, vertical: boolean): void => {
    if (pending.length === 0) pendingStart = at;
    for (const { font: file, text: part } of fileRuns(font, g)) {
      const twin = verticalTwinOf(file);
      if (!twin) continue;
      const last = pending[pending.length - 1];
      if (last && last.file === file && last.vertical === vertical) last.text += part;
      else pending.push({ file, twin, text: part, vertical });
    }
  };

  /** A glyph drawn with the horizontal font under its own text matrix. */
  const drawHorizontal = (t: string, m: [number, number, number, number, number, number], spacingPx: number): void => {
    let first = true;
    for (const { font: file, text: part } of fileRuns(font, t)) {
      useFont(fontKeyOn(ctx.page, file));
      if (first) {
        useTc(spacingPx);
        body.push(setTextMatrix(...m));
        first = false;
      }
      body.push(showTextShaped(file, part));
    }
  };

  let cx = xPx;
  for (const run of runs) {
    if (run.cell === undefined) {
      // Sideways: the frame turns it; painted as it is.
      flushUpright();
      drawHorizontal(run.text, [1, 0, 0, 1, X(cx), Y(baselinePx)], tracking);
      cx += textAdvancePx(font, run.text, sizePx, tracking).advance;
      continue;
    }
    const cell = em * run.cell;
    const kind = cellKind(run.glyph, run.text, font);
    if ((kind === 'upright' || kind === 'alternate' || kind === 'dash') && shapesApart(font, run.text, kind !== 'upright')) {
      // A cluster of several glyphs (a combining mark the font does not
      // compose, an emoji sequence it does not ligate): in a show each
      // glyph would advance one em down the column. Set as the canvas sets
      // it: the cluster shaped horizontally, stood upright, centred on its
      // cell.
      flushUpright();
      const w = textAdvancePx(font, run.text, sizePx).advance;
      drawHorizontal(run.text, [0, 1, -1, 0, X(cx + cell / 2) + centralPx * scale, Y(axis) - (w * scale) / 2], 0);
      cx += cell + tracking;
      continue;
    }
    if (kind === 'upright' || kind === 'alternate' || kind === 'dash') {
      // A character that stands upright as it is keeps its horizontal
      // glyph, as on the canvas; a vertical form comes from `vert` (with
      // `fwid` for a dash whose form Noto keys to both).
      // A dash is shaped alone: `fwid` with `vert` would join two of them
      // into one long glyph where the canvas sets one per cell.
      if (kind === 'dash') flushUpright();
      queueUpright(run.text, cx, kind !== 'upright');
      if (kind === 'dash') flushUpright();
      cx += cell + tracking;
      continue;
    }
    flushUpright();
    if (kind === 'tcy') {
      // Upright, side by side, squeezed across to the em.
      const w = textAdvancePx(font, run.text, sizePx).advance;
      const k = w > em ? em / w : 1;
      drawHorizontal(run.text, [0, k, -1, 0, X(cx + em / 2) + centralPx * scale, Y(axis) - (k * w * scale) / 2], 0);
    } else if (kind === 'rotate') {
      // Turned with the frame; a dash stretched to fill its cell. A bracket
      // or a quote turns about the em box's centre, so it hugs the character
      // it belongs to; a dash, an ellipsis, an interpunct is centred on the
      // axis by its ink, as on the canvas.
      const char = run.glyph.orient === 'alternate' && run.glyph.substitute ? run.glyph.substitute : run.text;
      const w = textAdvancePx(font, char, sizePx).advance;
      const k = run.glyph.stretch && w > 0 && w < cell ? cell / w : 1;
      const lift = run.glyph.orient === 'rotate' ? inkLiftPx(font, char, sizePx) ?? centralPx : centralPx;
      drawHorizontal(char, [k, 0, 0, 1, X(cx + cell / 2 - (k * w) / 2), Y(axis + lift)], 0);
    } else {
      // A mainland pause mark the font has no vertical form for: the
      // upright glyph moved to the top right of its cell.
      const offset = run.glyph.offset ?? CORNER_OFFSET_EM;
      const penOffset = em * (0.5 - (VERTICAL_ORIGIN / 1000 - central));
      for (const { font: file, text: part } of fileRuns(font, run.text)) {
        const twin = verticalTwinOf(file);
        if (!twin) continue;
        useFont(twinKeyOn(ctx.page, file, twin));
        useTc(0);
        noteMissingGlyphs(file, part);
        body.push(setTextMatrix(0, 1, -1, 0, X(cx + penOffset + offset.y * em), Y(axis) + offset.x * em * scale));
        body.push(PDFOperator.of(PDFOperatorNames.ShowText, [PDFHexString.of(twin.encode(part, false).hex)]));
      }
    }
    cx += cell + tracking;
  }
  flushUpright();
  if (body.length === 0) return;

  const outlineOps = outline && outline.widthPx > 0
    ? [
        setStrokingColor(outline.color),
        setLineWidth(outline.widthPx * scale),
        setTextRenderingMode(outline.hollow ? TextRenderingMode.Outline : TextRenderingMode.FillAndOutline),
      ]
    : [];
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, alphaOf(color), outlineOps.length > 0 ? alphaOf(outline!.color) : 1)),
    ...outlineOps,
    beginText(),
    setFillingColor(color),
    ...(actualText === undefined ? body : withActualText(ctx, actualText, body)),
    endText(),
    popGraphicsState(),
  );
}

/** How far above the baseline the ink of `ch` is centred, px, as the face
 *  of `font` that has it draws it (undefined when it has no ink). */
function inkLiftPx(font: PDFFont, ch: string, sizePx: number): number | undefined {
  const file = fileRuns(font, ch)[0]?.font ?? font;
  const face = (file as unknown as { embedder?: { font?: { unitsPerEm: number; layout(t: string): { glyphs: Array<{ bbox?: { minY: number; maxY: number } }> } } } }).embedder?.font;
  const bbox = face?.layout(ch).glyphs[0]?.bbox;
  if (!face || !bbox || !Number.isFinite(bbox.minY) || !(bbox.maxY > bbox.minY)) return undefined;
  return ((bbox.minY + bbox.maxY) / 2 / face.unitsPerEm) * sizePx;
}

/** Whether the grapheme `g` cannot be shown as one glyph of a twin's run:
 *  it shapes to more than one glyph (in its vertical forms when
 *  `vertical`), or its characters come from different files of the face. */
function shapesApart(font: PDFFont, g: string, vertical: boolean): boolean {
  // A single UTF-16 unit maps to one glyph through the cmap; only a
  // cluster can shape to more (fast path for Han and the marks).
  if (g.length === 1) return false;
  const runs = fileRuns(font, g);
  if (runs.length !== 1) return runs.length > 1;
  const twin = verticalTwinOf(runs[0]!.font);
  return twin !== undefined && twin.glyphCount(g, vertical) > 1;
}

/** How a cell is drawn: upright through the vertical twin, as it is
 *  (`upright`), in the font's vertical form (`alternate`), or a dash, an
 *  ellipsis or a wave dash in its vertical form (`dash`); turned; moved to
 *  the corner of its cell (a mainland pause mark the font has no vertical
 *  form for); or as a number set in one cell. */
function cellKind(glyph: VerticalGlyph, ch: string, font: PDFFont): 'upright' | 'alternate' | 'dash' | 'rotate' | 'corner' | 'tcy' {
  if (glyph.orient === 'tcy') return 'tcy';
  if (glyph.orient === 'rotate') {
    const file = fileRuns(font, ch)[0]?.font ?? font;
    return verticalTwinOf(file)?.hasVerticalForm(ch) ? 'dash' : 'rotate';
  }
  if (glyph.orient === 'alternate') {
    const file = fileRuns(font, ch)[0]?.font ?? font;
    if (verticalTwinOf(file)?.hasVerticalForm(ch)) return 'alternate';
    return glyph.fallback === 'corner' ? 'corner' : 'rotate';
  }
  return 'upright';
}

registerVerticalPainter(drawVerticalTextPx);
