/**
 * Highlight marks (`:mark[text]{style="…"}`, #888): the coloured band
 * behind a phrase, as a textbook highlights its key words. The parser keeps
 * the phrase as ordinary text (its range rides on `InlineSpan.links`, so
 * the layout is the one without the mark) and the measurer stamps it on
 * the segments of its words (`VDTLineSegment.mark`). Once the document is
 * laid out, each line gets the bands of the marks on it
 * (`VDTLine.highlights`), placed where the renderers paint the segments
 * ({@link segmentPositions}: alignment, justified word spaces and the
 * line's paint order included), which every renderer paints under the
 * line's text.
 *
 * A band covers the marked words of a line and the spaces between them,
 * from 0.8 em above the baseline to 0.25 em below it, grown by the style's
 * vertical padding. At the phrase's true start and end it reaches
 * `paddingX` past the letters and its corners are rounded; where the phrase
 * breaks onto the next line the band stops square at the last letter, and
 * the next line's band starts square at the first. A style with
 * `decorationBreak: 'clone'` gives every line piece the padding and the
 * corners of both ends instead (CSS `box-decoration-break: clone`); the
 * band is painted, not measured, so the layout is the same.
 */

import type { ResolvedMarkStyleConfig } from '../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineHighlight, VDTLineSegment } from '../vdt.js';
import { segmentFont, segmentPositions } from './cjkMarks.js';
import { pickMarkStyle } from '../defaults/text/markStyles.js';
import { measureTextWidth } from '../measure/canvas.js';
import { fontEm } from '../measure/vertical.js';
import { dimensionToPx } from '../units.js';

type BlockLike = Parameters<typeof segmentPositions>[1];

/** The text band of a mark around the baseline, in em of the marked text
 *  (the chips' band). */
const ASCENT = 0.8;
const DESCENT = 0.25;

/** Where the marked characters of a segment start and end, px from its
 *  start: all of it, or the part `from`–`to` of a left-to-right segment
 *  (a full stop glued to the phrase stays out). */
function markedExtent(seg: VDTLineSegment, width: number, font: string): [number, number] {
  const m = seg.mark!;
  if (m.from === undefined || m.to === undefined || seg.rtl || seg.kind !== 'text') return [0, width];
  const whole = measureTextWidth(seg.text, font);
  if (!(whole > 0)) return [0, width];
  const k = width / whole;
  return [measureTextWidth(seg.text.slice(0, m.from), font) * k, measureTextWidth(seg.text.slice(0, m.to), font) * k];
}

/** One piece of a mark on a line: the marked words of one `:mark[…]` that
 *  follow each other along it, with the spaces between them. `left` /
 *  `right` are its edges in the frame; `leftI` / `rightI` the segments
 *  there and `firstI` / `lastI` its first and last segments in reading
 *  order (the line's own array order). */
export interface MarkPiece {
  id: number;
  style: string;
  left: number;
  right: number;
  /** The largest em of its segments. */
  em: number;
  leftI: number;
  rightI: number;
  firstI: number;
  lastI: number;
}

/** The pieces of the marks on a line, in paint order; empty when it holds
 *  no mark. */
export function markPieces(line: VDTLine, block: BlockLike): MarkPiece[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.mark)) return [];
  const { xs, widths } = segmentPositions(line, block);
  const order = line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i);
  // Each segment's x in the line's paint order.
  const at = xs.slice();
  let x = xs[0] ?? line.bbox.x;
  for (const i of order) {
    at[i] = x;
    x += widths[i]!;
  }
  const out: MarkPiece[] = [];
  let piece: MarkPiece | undefined;
  const flush = (): void => {
    if (piece && piece.right > piece.left) out.push(piece);
    piece = undefined;
  };
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const seg = segments[i]!;
    const mark = seg.mark;
    if (!mark) {
      // A space between two words of one mark carries the band on.
      if (piece && seg.kind === 'space') {
        let j = k + 1;
        while (j < order.length && segments[order[j]!]!.kind === 'space' && !segments[order[j]!]!.mark) j++;
        const next = j < order.length ? segments[order[j]!] : undefined;
        if (next?.mark?.id === piece.id) continue;
      }
      flush();
      continue;
    }
    const font = segmentFont(seg, block);
    const [from, to] = markedExtent(seg, widths[i]!, font);
    const left = at[i]! + from;
    const right = at[i]! + to;
    const em = fontEm(font);
    if (piece && piece.id === mark.id) {
      if (left < piece.left) {
        piece.left = left;
        piece.leftI = i;
      }
      if (right >= piece.right) {
        piece.right = right;
        piece.rightI = i;
      }
      piece.firstI = Math.min(piece.firstI, i);
      piece.lastI = Math.max(piece.lastI, i);
      piece.em = Math.max(piece.em, em);
      continue;
    }
    flush();
    piece = { id: mark.id, style: mark.style, left, right, em, leftI: i, rightI: i, firstI: i, lastI: i };
  }
  flush();
  return out;
}

/** The highlight bands of a line, relative to it; empty when it holds no
 *  mark. A style with `backgroundEnabled: false` paints none. */
export function lineHighlights(line: VDTLine, block: BlockLike, styles: readonly ResolvedMarkStyleConfig[], dpi: number, pieces: readonly MarkPiece[] = markPieces(line, block)): VDTLineHighlight[] {
  const segments = line.segments ?? [];
  const out: VDTLineHighlight[] = [];
  for (const p of pieces) {
    const style = pickMarkStyle(styles, p.style || undefined);
    if (!style || style.backgroundEnabled === false) continue;
    const px = (d: Parameters<typeof dimensionToPx>[0]): number => Math.max(0, dimensionToPx(d, dpi, p.em));
    // The top and bottom padding may be negative: a band narrower than
    // the text, as a highlighter stroke under the lower half of the words.
    const signed = (d: Parameters<typeof dimensionToPx>[0]): number => dimensionToPx(d, dpi, p.em);
    const padTop = style.paddingTop ? signed(style.paddingTop) : px(style.paddingY);
    const padBottom = style.paddingBottom ? signed(style.paddingBottom) : px(style.paddingY);
    const padX = px(style.paddingX);
    // The phrase's true start and end, on whichever side of the piece its
    // first and last segments in reading order are painted: the start on
    // the right of a right-to-left line, on the left of one in a mirrored
    // flow.
    const isStart = (i: number) => i === p.firstI && segments[i]!.mark!.start === true;
    const isEnd = (i: number) => i === p.lastI && segments[i]!.mark!.end === true;
    // `decorationBreak: 'clone'`: every line piece is a whole band.
    const clone = style.decorationBreak === 'clone';
    const capLeft = clone || isStart(p.leftI) || isEnd(p.leftI);
    const capRight = clone || isStart(p.rightI) || isEnd(p.rightI);
    const left = p.left - (capLeft ? padX : 0);
    const right = p.right + (capRight ? padX : 0);
    const top = -(ASCENT * p.em + padTop);
    const height = (ASCENT + DESCENT) * p.em + padTop + padBottom;
    if (!(height > 0)) continue;
    const radius = Math.min(px(style.borderRadius), height / 2);
    const opacity = (style.opacity ?? 100) / 100;
    const rough = (style.rough ?? 0) / 100;
    out.push({
      x: left - line.bbox.x,
      y: top,
      width: right - left,
      height,
      color: style.background.hex,
      radiusLeft: capLeft ? radius : 0,
      radiusRight: capRight ? radius : 0,
      ...(opacity < 1 ? { opacity } : {}),
      // The wobble follows the mark and where the piece starts: the same
      // on every render of the same page.
      ...(rough > 0 ? { rough, seed: (p.id * 7919 + Math.round(left)) >>> 0 } : {}),
    });
  }
  return out;
}

/** The lines of a resource block's texts (table cells, caption, note) with
 *  what they are painted from: their lines carry their alignment, so they
 *  are read flush from their start. */
function resourceTexts(block: VDTBlock): { lines: VDTLine[]; like: BlockLike }[] {
  const rb = block.resourceBlock;
  if (!rb) return [];
  const out: { lines: VDTLine[]; like: BlockLike }[] = [];
  const add = (lines: VDTLine[], fonts: { fontString: string; boldFontString: string; italicFontString: string; boldItalicFontString: string }): void => {
    const first = lines[0];
    if (first) out.push({ lines, like: { bbox: first.bbox, textAlign: 'left', ...fonts } });
  };
  const t = rb.table;
  if (t) {
    for (const cell of t.cells) {
      add(cell.lines, cell.isHeader
        ? { fontString: t.headerFontString, boldFontString: t.headerBoldFontString, italicFontString: t.headerItalicFontString, boldItalicFontString: t.headerBoldItalicFontString }
        : { fontString: t.fontString, boldFontString: t.boldFontString, italicFontString: t.italicFontString, boldItalicFontString: t.boldItalicFontString });
    }
  }
  add(rb.captionLines, { fontString: rb.captionFontString, boldFontString: rb.captionBoldFontString, italicFontString: rb.captionItalicFontString, boldItalicFontString: rb.captionBoldItalicFontString });
  add(rb.noteLines, { fontString: rb.noteFontString, boldFontString: rb.noteBoldFontString, italicFontString: rb.noteItalicFontString, boldItalicFontString: rb.noteBoldItalicFontString });
  // A figure's labels drawn on its picture (#860).
  for (const label of rb.labels ?? []) {
    const l = label.layout;
    if (l) add(l.lines, { fontString: l.fontString, boldFontString: l.boldFontString, italicFontString: l.italicFontString, boldItalicFontString: l.boldItalicFontString });
  }
  return out;
}

/** Every set text line of the document with what it is painted from:
 *  paragraphs, headings, list items, notes and the texts of resource
 *  blocks (each block once). */
export function textLineGroups(doc: VDTDocument): { lines: VDTLine[]; like: BlockLike }[] {
  const groups: { lines: VDTLine[]; like: BlockLike }[] = [];
  const seen = new Set<VDTBlock>();
  const visit = (block: VDTBlock): void => {
    if (seen.has(block)) return;
    seen.add(block);
    if (block.resourceBlock) groups.push(...resourceTexts(block));
    else if (!block.designOverlay) groups.push({ lines: block.lines, like: block });
  };
  for (const block of doc.blocks) visit(block);
  for (const page of doc.pages) {
    for (const block of page.floats ?? []) visit(block);
    for (const block of page.marginNotes ?? []) visit(block);
  }
  return groups;
}

/** Set `VDTLine.highlights` on every line of the document that holds a
 *  highlight mark (see the module comment): paragraphs, headings, list
 *  items, notes and the texts of resource blocks. A style that sets the
 *  text's `color` gives it to the marked words. */
export function highlightDocument(doc: VDTDocument): void {
  const styles = doc.config?.markStyles ?? [];
  const dpi = doc.config?.page.dpi ?? 96;
  for (const { lines, like } of textLineGroups(doc)) {
    for (const line of lines) {
      if (!line.segments?.some((s) => s.mark)) {
        if (line.highlights) delete line.highlights;
        continue;
      }
      const bands = lineHighlights(line, like, styles, dpi);
      if (bands.length > 0) line.highlights = bands;
      else delete line.highlights;
      for (const seg of line.segments) {
        if (!seg.mark || seg.kind !== 'text') continue;
        const color = pickMarkStyle(styles, seg.mark.style || undefined)?.color;
        if (color) seg.color = color.hex;
      }
    }
  }
}
