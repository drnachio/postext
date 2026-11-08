// Blocks of design text the print sets side by side (#1444): a newspaper
// masthead's weather box, nameplate and price box, a journal's authors
// beside its dates, a magazine's lead beside its standfirst. Written one
// paragraph after another they would stack down the page; here each block
// is a cell of a borderless table as wide as the text area, the cells as
// wide as the print's columns. A cell holds the pieces' own paragraphs
// (mapped or generated text as anywhere else in the design), so the
// round trip reads them as it reads a band's.

import type { ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import type { Box } from './geometry.js';
import { fittedSize } from './text.js';
import { px } from '../wml.js';

/** A text of the design: its element, words and box. */
export interface ColumnText {
  el: ResolvedDesignTextElement;
  text: string;
  box: Box;
}

/** Texts set side by side: the indices (in reading order) of each
 *  column's pieces, top to bottom, columns from the left. */
export interface ColumnSet {
  columns: number[][];
}

/** The part of a text's box its words cover: a centred title in a box as
 *  wide as the page covers its middle only. */
function inkBox(ctx: WriterContext, t: ColumnText): Box {
  const size = fittedSize(ctx, t.el, t.text);
  const longest = Math.max(1, ...t.text.split('\n').map((l) => [...l].length));
  // A centred text between blocks at the sides (a nameplate) is narrower
  // than the line: its words take about half an em a letter, three fifths
  // of the line at most.
  const tracking = t.el.letterSpacing ? px(ctx.units, t.el.letterSpacing, size) : 0;
  const width = Math.min(t.box.width * (t.el.align === 'center' ? 0.6 : 1), longest * (size * 0.5 + tracking));
  const a = t.el.align;
  const x = a === 'center' ? t.box.x + (t.box.width - width) / 2 : a === 'right' || a === 'end' ? t.box.x + t.box.width - width : t.box.x;
  return { ...t.box, x, width };
}

const apartX = (a: Box, b: Box): boolean => a.x + a.width <= b.x || b.x + b.width <= a.x;

/**
 * The sets of side-by-side blocks among `texts` (by reading-order index;
 * undefined where the piece is not a text that may join one). A column is
 * a stack of texts sharing a stretch of the line, each within a few
 * millimetres of the one above; columns whose heights overlap and whose
 * words never share a stretch of the line make a set, when one of them
 * stacks two pieces or more (texts that only share a line are a row, see
 * rows.ts).
 */
export function columnSets(ctx: WriterContext, texts: readonly (ColumnText | undefined)[]): ColumnSet[] {
  const mm = ctx.units.dpi / 25.4;
  const idx = texts.flatMap((t, i) => (t ? [i] : []));
  const ink = new Map(idx.map((i) => [i, inkBox(ctx, texts[i]!)]));
  // Columns: stacks, in reading order.
  const columns: number[][] = [];
  for (const i of idx) {
    const b = ink.get(i)!;
    const col = columns.find((c) => {
      const lastBox = ink.get(c[c.length - 1]!)!;
      const gap = b.y - (lastBox.y + lastBox.height);
      return !apartX(lastBox, b) && gap <= 4 * mm && gap >= -mm;
    });
    if (col) col.push(i);
    else columns.push([i]);
  }
  const extent = (c: number[]): Box => {
    const bs = c.map((i) => ink.get(i)!);
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y };
  };
  const beside = (a: Box, b: Box): boolean => {
    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return apartX(a, b) && overlap >= 0.3 * Math.min(a.height, b.height);
  };
  const out: ColumnSet[] = [];
  const used = new Set<number[]>();
  for (const c of columns) {
    if (used.has(c)) continue;
    const set = [c];
    for (const d of columns) {
      if (d === c || used.has(d)) continue;
      const e = extent(d);
      if (set.every((s) => beside(extent(s), e))) set.push(d);
    }
    if (set.length < 2 || !set.some((s) => s.length > 1)) continue;
    for (const s of set) used.add(s);
    out.push({ columns: set.sort((a, b) => extent(a).x - extent(b).x) });
  }
  return out;
}

/**
 * A borderless table of one row, a cell per column of `set`, as wide as
 * the text area (`frame`, px; `widthTw` in Word): the cells split the
 * width halfway between the columns' words. `cells` holds each cell's
 * paragraphs.
 */
export function columnTable(ctx: WriterContext, set: ColumnSet, texts: readonly (ColumnText | undefined)[], frame: Box, widthTw: number, cells: readonly string[]): string {
  const ext = set.columns.map((c) => {
    const bs = c.map((i) => inkBox(ctx, texts[i]!));
    return { left: Math.min(...bs.map((b) => b.x)), right: Math.max(...bs.map((b) => b.x + b.width)) };
  });
  // A column printed in the margin (a chapter number beside the text
  // area) still gets its share: the table spans the columns' words.
  const cuts = [Math.min(frame.x, ext[0]!.left), ...ext.slice(1).map((e, k) => (ext[k]!.right + e.left) / 2), Math.max(frame.x + frame.width, ext[ext.length - 1]!.right)];
  const widths = set.columns.map((_, k) => Math.max(1, cuts[k + 1]! - cuts[k]!));
  const total = widths.reduce((a, b) => a + b, 0);
  const tw = widths.map((w) => Math.max(240, Math.round((w / total) * widthTw)));
  const nil = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('');
  const row = tw.map((w, k) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cells[k] || '<w:p/>'}</w:tc>`).join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${tw.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${nil}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${tw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${row}</w:tr></w:tbl>`
  );
}
