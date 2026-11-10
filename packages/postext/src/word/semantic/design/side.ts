// A display figure a band prints beside its texts (#1458): a chapter
// opener's number, as tall as the kicker, the title and the lead next to
// it together. On a line of its own above them it made the band a third
// taller than the print's, and every chapter started that much lower. It
// takes a cell of its own at its side of the band's table, the texts the
// cell next to it: a table of two cells reads the same in Word,
// LibreOffice and Google Docs.

import type { ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import type { Box } from './geometry.js';
import { px } from '../wml.js';
import { fittedSize } from './text.js';

/** A piece of a band: its box, for a text its element and words, and
 *  the size a text or a title is set at in Word, px. */
export interface BandPiece {
  box: Box;
  text?: { el: ResolvedDesignTextElement; text: string };
  size?: number;
}

/** Where a side figure goes and how wide its cell is, twips. */
export interface Side {
  right: boolean;
  widthTw: number;
}

/** About how wide `text` is at `size` px: a digit or a capital of a
 *  display face takes some six tenths of an em. */
const inkWidth = (text: string, size: number): number => [...text].length * size * 0.6;

/**
 * The piece of `pieces` (all on one band, `innerTw` twips wide inside its
 * insets) that stands beside the others, and its side: a short text (a
 * number) at least twice the size of every piece level with it, of which
 * there are two or more, set at the left or right edge clear of them.
 * Undefined when the band has none, or in a vertical flow.
 */
export function sideFigure<T extends BandPiece>(ctx: WriterContext, pieces: readonly T[], innerTw: number, rtl: boolean): { piece: T; side: Side } | undefined {
  const u = ctx.units;
  const mm = u.dpi / 25.4;
  for (const piece of pieces) {
    const t = piece.text;
    if (!t || t.text.includes('\n') || [...t.text.trim()].length > 4 || !/[\p{L}\p{N}]/u.test(t.text)) continue;
    const align = t.el.align;
    const right = align === 'right' || (align === 'end' && !rtl) || (align === 'start' && rtl);
    const left = align === 'left' || (align === 'start' && !rtl) || (align === 'end' && rtl);
    if (!right && !left) continue;
    const size = piece.size ?? fittedSize(ctx, t.el, t.text);
    const top = piece.box.y;
    const bottom = piece.box.y + piece.box.height;
    const level = pieces.filter((o) => o !== piece && o.box.y + o.box.height / 2 > top && o.box.y + o.box.height / 2 < bottom);
    if (level.length < 2 || !level.every((o) => (o.size ?? 0) * 2 <= size)) continue;
    // Where its letters stand in the print (at its design size), clear
    // of the pieces level with it.
    const printed = inkWidth(t.text.trim(), px(u, t.el.fontSize) || size);
    const from = right ? piece.box.x + piece.box.width - printed : piece.box.x;
    const to = right ? piece.box.x + piece.box.width : piece.box.x + printed;
    if (level.some((o) => o.box.x < to - 5 * mm && o.box.x + o.box.width > from + 5 * mm)) continue;
    // Its cell: the figure, the band's inset at its outer side and a
    // little to spare; a third of the band at most.
    const width = Math.round(((inkWidth(t.text.trim(), size) * 1.15 + 6 * mm) * 1440) / u.dpi);
    return { piece, side: { right, widthTw: Math.min(width, Math.round(innerTw / 3)) } };
  }
  return undefined;
}
