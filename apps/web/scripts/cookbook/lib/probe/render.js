// Painting the pages to images and comparing them with committed ones (C39).
import { bytesOfBase64 } from './bundle.js';
import { canvasOf } from './card.js';
import { parseFont, hexOf } from './fonts.js';
import { pageBlocks } from './paint.js';
import { pick, engineOf, pagesOf } from './record.js';
import { round } from './settle.js';

/** Share of a page that is colour fields, images or display type (C26). */
export function legibility(page, doc, blocks, resolved) {
  const dpi = resolved.page.dpi;
  const pageArea = page.width * page.height;
  let sum = 0;
  const box = (b) => (b ? Math.max(0, b.width) * Math.max(0, b.height) : 0);
  const display = (font) => {
    const face = font ? parseFont(font) : null;
    return !!face && (face.px * 72) / dpi >= 14;
  };
  const filled = (color) => {
    const hex = hexOf(color);
    return !!hex && hex !== 'TRANSPARENT' && hex !== '#FFFFFF' && hex !== '#FFF';
  };
  if (filled(resolved.page.backgroundColor)) return 1;
  const slot = (design) => {
    for (const el of design?.blocks ?? []) {
      if (el.kind === 'image') sum += box(el.bbox);
      else if (el.kind === 'box' && el.box?.backgroundColor) sum += box(el.bbox);
      else if (el.kind === 'text' && (el.box?.backgroundColor || display(el.fontString))) sum += box(el.bbox);
    }
  };
  slot(page.openerBand);
  slot(page.header);
  slot(page.footer);
  // A composed page's decoration (its grounds, cards and pictures, #846).
  slot(page.composed?.decoration);
  // Comic panels (a :::page, a :::strip in the flow): their pictures and fills.
  const comicPanels = (comic) => {
    for (const panel of comic?.panels ?? []) if (panel.art || filled(panel.background)) sum += box(panel.bbox);
  };
  comicPanels(page.comic);
  for (const block of blocks) {
    comicPanels(block.comic);
    const rb = block.resourceBlock;
    if (rb && (rb.kind === 'bitmap' || rb.kind === 'svg')) sum += box(rb.bodyRect);
    if (rb?.captionBar) sum += box(rb.captionBar.rect);
    // Table fills (header, body, per-cell) and cell pictures read at card size too.
    for (const cell of rb?.table?.cells ?? []) {
      const fill = cell.background ?? (cell.isHeader ? rb.table.headerBackground : rb.table.bodyBackground);
      if (filled(fill)) sum += box(cell.rect);
      else if (cell.image) sum += box(cell.image.rect);
    }
    if (block.designOverlay) slot(block.designOverlay);
    if (block.callout) {
      const style = (resolved.calloutStyles ?? []).find((s) => s.id === block.callout.styleId);
      if (style?.backgroundEnabled) sum += box(block.bbox);
    }
    if (block.type === 'heading' && !block.hidden && display(block.fontString)) {
      for (const line of block.lines ?? []) sum += box(line.bbox);
    }
  }
  return Math.min(1, sum / pageArea);
}

/** The text the VDT hash covers: pages → blocks → lines (text + bbox
 *  rounded to 0.5 px), plus the design slots' text. OS-independent.
 *  Without `boxes`: what is set and in what order, and nothing measured
 *  ({@link linesHash}). */
export function vdtText(docs, { own = false, boxes = true } = {}) {
  const r = (v) => round(Number(v) || 0, 0.5);
  const box = (b) => (!boxes ? '' : b ? `${r(b.x)},${r(b.y)},${r(b.width)},${r(b.height)}` : '-');
  const out = [];
  const lines = (list) => { for (const l of list ?? []) out.push(`L${box(l.bbox)}|${l.text}`); };
  const slot = (tag, design) => {
    for (const el of design?.blocks ?? []) {
      out.push(`${tag}${el.kind}|${box(el.bbox)}|${el.kind === 'text' ? (el.lines ?? []).map((l) => l.text).join('/') : ''}`);
    }
  };
  for (const doc of docs) {
    for (const page of doc.pages) {
      // `own`: pages counted from the document's first, wherever the book puts it.
      out.push(`P${(own ? 0 : doc.pageIndexOffset ?? 0) + page.index}|${r(page.width)}x${r(page.height)}|${page.pageLabel}|${page.role ?? ''}`);
      for (const block of pageBlocks(page)) {
        out.push(`B${block.type}|${box(block.bbox)}${block.hidden ? '|h' : ''}`);
        lines(block.lines);
        const rb = block.resourceBlock;
        if (rb) {
          lines(rb.captionLines);
          lines(rb.noteLines);
          for (const cell of rb.table?.cells ?? []) { out.push(`C${cell.row},${cell.col}`); lines(cell.lines); }
        }
        if (block.designOverlay) slot('O', block.designOverlay);
      }
      slot('H', page.header);
      slot('F', page.footer);
      slot('D', page.openerBand);
    }
  }
  return out.join('\n');
}

// ─── Pictures ───────────────────────────────────────────────────────────────

/** Paints one page at `scale` with the pen's engine, then the overlay hook
 *  (harness need H2: loose-line marks, reading-order numbers). The hook
 *  gets the context in canvas pixels (the renderer leaves it scaled), so it
 *  maps page px with `scale` itself: window.__postextOverlay(ctx, page, doc, scale). */
export function paint(engine, p, scale) {
  const canvas = document.createElement('canvas');
  engine.renderPageToCanvas(p.page, p.doc, canvas, { scale });
  if (typeof window.__postextOverlay === 'function') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    window.__postextOverlay(ctx, p.page, p.doc, scale);
    ctx.restore();
  }
  return canvas;
}

export function encode(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

/** The published pages: pNN.webp (width) and pNN.s.webp (strip). */
export function renderPages({ select = 'last', pages: wanted, width = 1000, strip = 240, quality = 0.8,
  stripQuality = 0.72, png = false } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const byN = new Map(pagesOf(build).map((p) => [p.n, p]));
  const out = [];
  try {
    for (const n of wanted) {
      const p = byN.get(n);
      if (!p) return { error: `page ${n} does not exist` };
      const full = paint(engine, p, width / p.page.width);
      out.push({
        n, w: full.width, h: full.height,
        full: encode(full, 'image/webp', quality),
        strip: encode(paint(engine, p, strip / p.page.width), 'image/webp', stripQuality),
        png: png ? encode(full, 'image/png') : null,
      });
    }
  } catch (error) {
    return { error: `${error?.name ?? 'Error'}: ${error?.message ?? error}`, taint: error?.name === 'SecurityError' };
  }
  return { pages: out };
}

// ─── A page against its committed image (#734) ─────────────────────────────

/**
 * How far a page image may be from the committed one and still be kept:
 * no cell of `cell` × `cell` px whose mean absolute difference, in any
 * channel, is over `max` of 255. Calibrated on pages at 1000 px wide,
 * WebP at quality 0.8 on both sides:
 *
 *   kept     the same layout painted by Chrome 131 and Chrome 154: worst
 *            cell 10.2 (product-manual-warnings), 8.0 (balloon-kinds), 0
 *            (thesis-back-matter); thesis-back-matter en p03 across
 *            d32b8fbb0 (10 bytes changed under one layout hash): 3.6
 *   written  one word painted a pixel bolder: 17 to 20; a word moved one
 *            pixel: 36 to 71; a letter missing: 51; a word in another
 *            colour: 83; vertical punctuation set higher by Chrome 154
 *            (bunko-novel-furigana): 88 to 118
 */
export const PAGE_DIFFERENCE = { cell: 8, max: 12 };

/** The worst cell of two RGBA images of one size (its mean absolute
 *  difference in the channel that differs most) and how many cells are
 *  over the threshold. */
export function pageDifference(a, b, width, height, { cell = PAGE_DIFFERENCE.cell, max = PAGE_DIFFERENCE.max } = {}) {
  let worst = 0;
  let cells = 0;
  for (let top = 0; top < height; top += cell) {
    const rows = Math.min(cell, height - top);
    for (let left = 0; left < width; left += cell) {
      const cols = Math.min(cell, width - left);
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let y = top; y < top + rows; y++) {
        let i = (y * width + left) * 4;
        for (let x = 0; x < cols; x++, i += 4) {
          r += Math.abs(a[i] - b[i]);
          g += Math.abs(a[i + 1] - b[i + 1]);
          bl += Math.abs(a[i + 2] - b[i + 2]);
        }
      }
      const mean = Math.max(r, g, bl) / (rows * cols);
      if (mean > worst) worst = mean;
      if (mean > max) cells++;
    }
  }
  return { worst, cells };
}

/** Whether a page's pixels changed beyond rendering noise: two RGBA arrays
 *  of `width` × `height`. Images of different sizes differ. */
export function pagesDiffer(a, b, width, height) {
  if (!a || !b || a.length !== b.length || a.length !== width * height * 4) return true;
  return pageDifference(a, b, width, height).cells > 0;
}

async function rgbaOf(base64) {
  const bitmap = await createImageBitmap(new Blob([bytesOfBase64(base64)], { type: 'image/webp' }));
  const canvas = canvasOf(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

/** Each pair `{ n, committed, fresh }` (two WebP files, base64) decoded and
 *  compared: `{ n, differ, worst, cells }`, or `{ n, differ: true, error }`
 *  when one does not decode. */
export async function comparePages(pairs, { max = PAGE_DIFFERENCE.max } = {}) {
  const out = [];
  for (const { n, committed, fresh } of pairs) {
    try {
      const a = await rgbaOf(committed);
      const b = await rgbaOf(fresh);
      if (a.width !== b.width || a.height !== b.height) {
        out.push({ n, differ: true, worst: 255, cells: 0, error: `${a.width} × ${a.height} px committed, ${b.width} × ${b.height} px now` });
        continue;
      }
      const d = pageDifference(a.data, b.data, a.width, a.height, { max });
      out.push({ n, differ: d.cells > 0, worst: round(d.worst, 0.1), cells: d.cells });
    } catch (error) {
      out.push({ n, differ: true, worst: 255, cells: 0, error: `${error?.message ?? error}` });
    }
  }
  return out;
}

/** Pages whose painting taints the canvas (C15), published or not: each is
 *  painted tiny and read back. */
export function taintedPages({ select = 'last' } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const tainted = [];
  for (const p of pagesOf(build)) {
    try {
      paint(engine, p, 16 / p.page.width).getContext('2d').getImageData(0, 0, 1, 1);
    } catch (error) {
      if (error?.name === 'SecurityError') tainted.push(p.n);
    }
  }
  return tainted;
}

/** The kit's state and status line (read before the PDF button is used). */
export function kitState() {
  return {
    state: document.documentElement.dataset.postext ?? null,
    status: document.getElementById('pt-status')?.textContent ?? null,
  };
}
