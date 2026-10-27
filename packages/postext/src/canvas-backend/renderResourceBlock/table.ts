// Painting a table resource: pixel-snapped fills, cells and frame.
import { type ResolvedResourceBlock, tableFrameOutline, tableCellFill } from '../../vdt.js';
import { saveContext, restoreContext } from '../contextState.js';
import { drawResourceImage } from './images.js';
import { roundedOutlinePath, drawPlaceholder } from './overlays.js';
import { paintLine } from './text.js';

/** Tolerance for "the transform has no shear" (a quarter turn made with
 *  `rotate(±π/2)` leaves cosines of ~1e-17). */
const AXIS_EPS = 1e-9;

type RectFiller = (x: number, y: number, w: number, h: number) => void;

/**
 * A `fillRect` that moves the rectangle's edges to the nearest device-pixel
 * boundaries under the context's current transform. Each fill is
 * anti-aliased on its own, so two fills meeting on a fractional device
 * pixel both cover it partly and the page shows through: a faint seam
 * between table cells of the same colour. Snapped, neighbours meet on a
 * pixel boundary. Works for scale + translate and quarter turns; under any
 * other transform (or on a context without `getTransform`) it fills as
 * given. Read the transform once: it must not change while filling.
 */
function pixelSnappedFill(ctx: CanvasRenderingContext2D): RectFiller {
  const plain: RectFiller = (x, y, w, h) => ctx.fillRect(x, y, w, h);
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined;
  if (!m) return plain;
  const { a, b, c, d, e, f } = m;
  // Device x from user x (and y from y) — or, turned, device y from x.
  const straight = Math.abs(b) < AXIS_EPS && Math.abs(c) < AXIS_EPS && Math.abs(a) > AXIS_EPS && Math.abs(d) > AXIS_EPS;
  const turned = Math.abs(a) < AXIS_EPS && Math.abs(d) < AXIS_EPS && Math.abs(b) > AXIS_EPS && Math.abs(c) > AXIS_EPS;
  if (!straight && !turned) return plain;
  const [sx, ox, sy, oy] = straight ? [a, e, d, f] : [b, f, c, e];
  const snap = (v: number, s: number, o: number) => (Math.round(s * v + o) - o) / s;
  return (x, y, w, h) => {
    const x0 = snap(x, sx, ox);
    const x1 = snap(x + w, sx, ox);
    const y0 = snap(y, sy, oy);
    const y1 = snap(y + h, sy, oy);
    // A cell thinner than a device pixel keeps its own edges.
    if (x0 === x1 || y0 === y1) ctx.fillRect(x, y, w, h);
    else ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  };
}

export function renderTable(
  ctx: CanvasRenderingContext2D,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
  inkHex: string | null,
): void {
  const t = rb.table;
  if (!t) return;
  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is stroked round on top.
  const rounded = t.frameRadii !== undefined;
  const clipTo = (outset: number) => {
    saveContext(ctx);
    roundedOutlinePath(ctx, tableFrameOutline(t, bx, by, rb.bodyRect.width, outset));
    ctx.clip();
  };
  // Cell backgrounds first (the cell's own fill, else the header tint / the
  // body or zebra fill), then borders, then text. Fills sit on device
  // pixels so neighbouring cells show no seam.
  if (rounded) clipTo(0);
  const fillCell = pixelSnappedFill(ctx);
  for (const cell of t.cells) {
    const fill = tableCellFill(t, cell);
    if (fill) {
      ctx.fillStyle = fill;
      fillCell(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
    }
  }
  if (rounded) restoreContext(ctx);
  if (t.strokes) {
    // Booktabs (#625): the layout's strokes, straight, each its own width.
    saveContext(ctx);
    ctx.strokeStyle = t.borderColor;
    ctx.lineCap = 'butt';
    for (const s of t.strokes) {
      ctx.lineWidth = s.widthPx;
      ctx.beginPath();
      ctx.moveTo(bx + s.x1, by + s.y1);
      ctx.lineTo(bx + s.x2, by + s.y2);
      ctx.stroke();
    }
    restoreContext(ctx);
  } else if (t.borderWidthPx > 0) {
    saveContext(ctx);
    ctx.strokeStyle = t.borderColor;
    ctx.lineWidth = t.borderWidthPx;
    const rules = t.rules ?? 'grid';
    if (rounded && rules !== 'outer') clipTo(t.borderWidthPx / 2);
    if (rules === 'grid') {
      for (const cell of t.cells) {
        ctx.strokeRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
      }
    } else if (rules === 'horizontal') {
      // Top + bottom edge of every cell — i.e. of every row — no verticals.
      ctx.beginPath();
      for (const cell of t.cells) {
        const { x, y, width, height } = cell.rect;
        ctx.moveTo(x, y); ctx.lineTo(x + width, y);
        ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height);
      }
      ctx.stroke();
    } else if (rules === 'outer' && !rounded) {
      const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
      ctx.strokeRect(bx, by, rb.bodyRect.width, tableHeight);
    }
    if (rounded && rules !== 'outer') restoreContext(ctx);
    if (rounded && (rules === 'grid' || rules === 'outer')) {
      roundedOutlinePath(ctx, tableFrameOutline(t, bx, by, rb.bodyRect.width));
      ctx.stroke();
    }
    restoreContext(ctx);
  }
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const { x, y, width, height } = img.rect;
    if (!drawResourceImage(ctx, img.fileId, x, y, width, height, { inkHex, svg: img.kind === 'svg' }, img.resourceId)) {
      drawPlaceholder(ctx, x, y, width, height, img.kind === 'svg' ? 'SVG' : 'Image');
    }
  }
  for (const cell of t.cells) {
    const font = cell.isHeader ? t.headerFontString : t.fontString;
    const bold = cell.isHeader ? t.headerBoldFontString : t.boldFontString;
    const italic = cell.isHeader ? t.headerItalicFontString : t.italicFontString;
    const boldItalic = cell.isHeader ? t.headerBoldItalicFontString : t.boldItalicFontString;
    const color = cell.isHeader ? t.headerColor : t.color;
    for (const line of cell.lines) {
      paintLine(ctx, line, font, bold, italic, boldItalic, color, rb.linkColor);
    }
  }
}
