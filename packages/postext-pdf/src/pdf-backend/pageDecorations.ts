import {
  PDFDict,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setLineWidth,
  stroke,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import type { VDTDocument, VDTPage, VDTColumn, BoundingBox } from 'postext';
import { dimensionToPx, columnRuleSegments, cropMarkSegments } from 'postext';
import { type PageCtx, drawLinePx, colorFromHex } from './primitives';

export function renderBaselineGrid(
  ctx: PageCtx,
  contentArea: BoundingBox,
  baselineIncrement: number,
  colorHex: string,
  lineWidthPx: number,
  textExtent: { top: number; bottom: number },
): void {
  const color = colorFromHex(colorHex, ctx.colorSpace);
  // Mirrors the canvas backend: baselines on the global grid anchored at the
  // content-area top, drawn only across the page's actual text extent. `k0`
  // may be negative when column 0 carries a top float band (its bbox-derived
  // contentArea.y sits below the global top); band heights are grid
  // multiples, so those earlier baselines still lie on the global grid.
  const eps = 0.5;
  const firstBaseline = contentArea.y + baselineIncrement * 0.8;
  const k0 = Math.ceil((textExtent.top - eps - firstBaseline) / baselineIncrement);
  let y = firstBaseline + k0 * baselineIncrement;
  const right = contentArea.x + contentArea.width;
  while (y <= textExtent.bottom + eps) {
    drawLinePx(ctx, contentArea.x, y, right, y, color, lineWidthPx);
    y += baselineIncrement;
  }
}

export function renderColumnRule(
  ctx: PageCtx,
  columns: VDTColumn[],
  colorHex: string,
  lineWidthPx: number,
): void {
  if (columns.length < 2) return;
  // One segment per gutter of each column band; span columns interrupt the
  // rule (mirrors the canvas backend via `columnRuleSegments`).
  const segments = columnRuleSegments(columns);
  if (segments.length === 0) return;
  const color = colorFromHex(colorHex, ctx.colorSpace);
  for (const seg of segments) {
    drawLinePx(ctx, seg.x, seg.top, seg.x, seg.bottom, color, lineWidthPx);
  }
}

export function renderCutLines(ctx: PageCtx, page: VDTPage, doc: VDTDocument): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;
  const markWidthPx = dimensionToPx(cutLines.markWidth, dpi);
  // Round the trim box the `TrimBox` of the page is written from.
  const segments = cropMarkSegments(page, doc.config.page, doc.trimOffset);
  if (ctx.colorSpace === 'cmyk') {
    // A CMYK file goes to separations: crop marks belong on every plate.
    const { scale, pageHeightPt } = ctx;
    const space = registrationSpaceName(ctx.page);
    for (const seg of segments) {
      ctx.page.pushOperators(
        pushGraphicsState(),
        PDFOperator.of(PDFOperatorNames.StrokingColorspace, [space]),
        PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]),
        setLineWidth(Math.max(0.01, markWidthPx * scale)),
        moveTo(seg.x1 * scale, pageHeightPt - seg.y1 * scale),
        lineTo(seg.x2 * scale, pageHeightPt - seg.y2 * scale),
        stroke(),
        popGraphicsState(),
      );
    }
    return;
  }
  const color = colorFromHex(cutLines.color.hex, ctx.colorSpace);
  for (const seg of segments) drawLinePx(ctx, seg.x1, seg.y1, seg.x2, seg.y2, color, markWidthPx);
}

/** The registration colour space, `[/Separation /All /DeviceCMYK f]` with a
 *  tint of 1 mapping to C1 M1 Y1 K1 on screen: a colour that paints on
 *  every separation. One object per document. */
const registrationSpaces = new WeakMap<PDFDocument, PDFRef>();
/** Its resource name on each page that draws with it. */
const registrationNames = new WeakMap<PDFPage, PDFName>();

function registrationSpaceName(page: PDFPage): PDFName {
  const known = registrationNames.get(page);
  if (known) return known;
  const context = page.doc.context;
  let ref = registrationSpaces.get(page.doc);
  if (!ref) {
    const tint = context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 1, 1, 1], N: 1 });
    ref = context.register(context.obj([PDFName.of('Separation'), PDFName.of('All'), PDFName.of('DeviceCMYK'), tint]));
    registrationSpaces.set(page.doc, ref);
  }
  const { Resources } = page.node.normalizedEntries();
  let spaces = Resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
  if (!spaces) {
    spaces = context.obj({});
    Resources.set(PDFName.of('ColorSpace'), spaces);
  }
  const name = spaces.uniqueKey('CSAll');
  spaces.set(name, ref);
  registrationNames.set(page, name);
  return name;
}

/** The page's content area: `page.contentArea` when the pipeline set it
 *  (per page, so mirrored margins are honoured), else inferred from the
 *  column bboxes (hand-built pages). */
export function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  if (page.contentArea) return page.contentArea;
  const { dpi, margins } = doc.config.page;
  const pxPerCm = dpi / 2.54;
  const marginTop = margins.top.unit === 'cm' ? margins.top.value * pxPerCm : margins.top.value;
  const marginLeft = margins.left.unit === 'cm' ? margins.left.value * pxPerCm : margins.left.value;
  if (page.columns.length > 0) {
    const firstCol = page.columns[0]!;
    const lastCol = page.columns[page.columns.length - 1]!;
    return {
      x: firstCol.bbox.x,
      y: firstCol.bbox.y,
      width: (lastCol.bbox.x + lastCol.bbox.width) - firstCol.bbox.x,
      height: firstCol.bbox.height,
    };
  }
  return { x: marginLeft, y: marginTop, width: 0, height: 0 };
}
