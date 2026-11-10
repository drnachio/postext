// Bands and rules of a design in Word (#1444). A filled box the design
// prints text on (an opener band, a cover panel) becomes a one-cell table
// shaded in the box's colour, its cell margins the inset the print keeps
// between the band's edge and its text: paragraph shading cannot pad,
// while a shaded cell with margins reads the same in Word, Word for the
// web, Google Docs and LibreOffice. The paragraphs printed on one band
// share its table. A short horizontal rule (under a part number, above a
// section kicker, between a cover's title and its author) is an empty
// paragraph with a top border, indented to the rule's length and side;
// the importer passes over empty paragraphs.

import type { ResolvedDesignRuleElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { hex, paragraph, px, type ParaProps } from '../wml.js';
import type { Box } from './geometry.js';
import { paleOnWhite } from './ink.js';

/** A piece of a design's Word output: paragraphs (or a table) and the
 *  band they are printed on. */
export interface Chunk {
  xml: string;
  /** The band's fill and estimated box. `foot`: the band stands at the
   *  foot of a page whose ground the design draws (see ground.ts), across
   *  the sheet, and its table is placed there. */
  band?: { fill: string; box: Box; foot?: boolean };
  /** Where the piece stands on the page, px. */
  box?: Box;
}

/** A paragraph one point high that holds nothing: what keeps two tables
 *  apart (Word joins tables that touch) or carries a page break that a
 *  table cell cannot. */
export function thinParagraph(props: Partial<ParaProps> = {}): string {
  return paragraph({ ...props, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' }, '');
}

const mmTw = (mm: number): number => Math.round((mm * 1440) / 25.4);

/** Twips of `pxValue` px. */
const tw = (ctx: WriterContext, pxValue: number): number => Math.round((pxValue * 1440) / ctx.units.dpi);

/** The inset of a band's cell, twips: the gap the print leaves between
 *  the band's edge and the first and last things printed on it (within
 *  the text area), kept between a few millimetres and about a centimetre
 *  so the band neither crowds its text nor towers over it. */
function insets(ctx: WriterContext, band: Box, inner: Box[], container: Box): { top: number; bottom: number; side: number } {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const top = Math.min(...inner.map((b) => b.y));
  const bottom = Math.max(...inner.map((b) => b.y + b.height));
  const left = Math.min(...inner.map((b) => b.x));
  const sideGap = left - Math.max(band.x, container.x);
  return {
    top: clamp(tw(ctx, top - band.y), mmTw(2), mmTw(10)),
    bottom: clamp(tw(ctx, band.y + band.height - bottom), mmTw(2), mmTw(10)),
    side: clamp(tw(ctx, sideGap), mmTw(4), mmTw(8)),
  };
}

/** The width a band's cell leaves its paragraphs, twips. */
export function bandInnerTwips(ctx: WriterContext, widthTw: number): number {
  return widthTw - 2 * mmTw(4);
}

/** A thin filled strip the design draws right under a band (a dark foot
 *  rule under an opener band): its colour and Word border width. */
export interface BandFoot {
  color: string;
  sz: number;
}

/** A one-cell table shaded `fill` around `cell`, with insets, and the
 *  band's foot strip as its cell's bottom border. `gapTw` adds an unshaded
 *  row that tall under the band: the room the print leaves before the text
 *  that follows (a paragraph there instead costs the page its running
 *  head in LibreOffice). */
function bandTable(fill: string, cell: string, pad: { top: number; bottom: number; side: number }, widthTw: number, foot?: BandFoot, gapTw = 0, placed?: { x: number; y: number; width: number; height: number }): string {
  if (placed) {
    // A table at its place on the page (twips from the page's top left
    // corner), as wide and as tall as the band: Word and LibreOffice set
    // it there; an editor without placed tables sets it in the flow.
    return (
      `<w:tbl><w:tblPr><w:tblpPr w:leftFromText="0" w:rightFromText="0" w:topFromText="0" w:bottomFromText="0" w:vertAnchor="page" w:horzAnchor="page" w:tblpX="${Math.max(1, placed.x)}" w:tblpY="${placed.y}"/>` +
      `<w:tblW w:w="${placed.width}" w:type="dxa"/>` +
      '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
      '<w:tblLayout w:type="fixed"/>' +
      `<w:tblCellMar><w:top w:w="${pad.top}" w:type="dxa"/><w:left w:w="${pad.side}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${pad.side}" w:type="dxa"/></w:tblCellMar>` +
      '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
      `<w:tblGrid><w:gridCol w:w="${placed.width}"/></w:tblGrid>` +
      `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${placed.height}" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${placed.width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>${cell}</w:tc></w:tr></w:tbl>`
    );
  }
  const shd = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  const bottom = foot ? `<w:tcBorders><w:bottom w:val="single" w:sz="${foot.sz}" w:space="0" w:color="${foot.color}"/></w:tcBorders>` : '';
  const gap =
    gapTw > 0
      ? `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${gapTw}" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>${thinParagraph()}</w:tc></w:tr>`
      : '';
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '<w:tblLayout w:type="autofit"/>' +
    `<w:tblCellMar><w:top w:w="${pad.top}" w:type="dxa"/><w:left w:w="${pad.side}" w:type="dxa"/><w:bottom w:w="${pad.bottom}" w:type="dxa"/><w:right w:w="${pad.side}" w:type="dxa"/></w:tblCellMar>` +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${widthTw}"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/>${bottom}${shd}</w:tcPr>${cell}</w:tc></w:tr>${gap}</w:tbl>`
  );
}

/**
 * The chunks of a design in order, each run of chunks on one band set in
 * that band's table. `container` is the text area, px; `widthTw` the
 * width the tables take.
 */
export function withBands(ctx: WriterContext, chunks: readonly Chunk[], container: Box, widthTw: number, feet?: ReadonlyMap<Box, BandFoot>, tailGapTw = 0): string {
  let out = '';
  let lastTable = false;
  for (let i = 0; i < chunks.length; ) {
    const c = chunks[i]!;
    if (!c.band) {
      out += c.xml;
      lastTable = false;
      i++;
      continue;
    }
    let j = i;
    while (j < chunks.length && chunks[j]!.band?.fill === c.band.fill && chunks[j]!.band?.box === c.band.box) j++;
    const run = chunks.slice(i, j);
    const boxes = run.map((r) => r.box).filter((b): b is Box => !!b);
    const pad = insets(ctx, c.band.box, boxes.length ? boxes : [c.band.box], container);
    if (lastTable) out += thinParagraph({ keepNext: true });
    if (c.band.foot) {
      // At its place on the page: its text starts where the text area
      // does, as far under the band's top as the print sets it.
      const b = c.band.box;
      const first = Math.min(...(boxes.length ? boxes : [b]).map((x) => x.y));
      const side = tw(ctx, Math.max(0, container.x - b.x));
      const top = Math.max(mmTw(2), Math.min(tw(ctx, first - b.y), tw(ctx, b.height) - mmTw(12)));
      out += bandTable(c.band.fill, run.map((r) => r.xml).join(''), { top, bottom: 0, side }, widthTw, undefined, 0, { x: tw(ctx, b.x), y: tw(ctx, b.y), width: tw(ctx, b.width), height: tw(ctx, b.height) });
      // A paragraph after it for the flow to go on from.
      out += thinParagraph();
      lastTable = false;
      i = j;
      continue;
    }
    out += bandTable(c.band.fill, run.map((r) => r.xml).join(''), pad, widthTw, feet?.get(c.band.box), j === chunks.length ? tailGapTw : 0);
    lastTable = true;
    i = j;
  }
  return out;
}

/** Whether a rule element is one Word should draw: a horizontal line of
 *  some length, in an ink the page shows. */
export function drawnRule(ctx: WriterContext, el: ResolvedDesignRuleElement, box: Box, onBand: boolean): boolean {
  if (el.direction === 'vertical') return false;
  if (box.width < (ctx.units.dpi / 25.4) * 3) return false;
  if (!(px(ctx.units, el.thickness) > 0)) return false;
  const ink = hex(el.color);
  return !!ink && (onBand || !paleOnWhite(ink));
}

/** A rule as an empty paragraph with a top border: as long as the rule
 *  (the whole width at most), at its side of `frame` (start, centre or
 *  end), `widthTw` wide in Word. */
export function ruleParagraph(ctx: WriterContext, el: ResolvedDesignRuleElement, box: Box, frame: Box, widthTw: number, rtl: boolean, keepNext: boolean, first?: ParaProps): string {
  const u = ctx.units;
  const thick = px(u, el.thickness);
  const sz = Math.min(96, Math.max(2, Math.round((thick * 72 * 8) / u.dpi)));
  const length = Math.min(widthTw, tw(ctx, box.width));
  const room = Math.max(0, widthTw - length);
  const near = (u.dpi / 25.4) * 3;
  const centre = Math.abs(box.x + box.width / 2 - (frame.x + frame.width / 2)) < near;
  const endGap = frame.x + frame.width - (box.x + box.width);
  const startGap = box.x - frame.x;
  // How far from the frame's left edge the rule starts, twips.
  let left: number;
  if (length >= widthTw * 0.9) left = 0;
  else if (centre) left = room / 2;
  else if (endGap < near && startGap > near) left = room;
  else left = Math.min(room, Math.max(0, tw(ctx, startGap)));
  // A right-to-left paragraph indents from the right: mirror.
  const start = rtl ? room - left : left;
  const border = { top: { color: hex(el.color) ?? '000000', sz, space: 0 } };
  return paragraph(
    {
      keepNext: keepNext || undefined,
      ...first,
      border,
      before: 0,
      after: 0,
      line: { twips: Math.max(60, Math.round((sz / 8) * 20) + 80), rule: 'exact' },
      ind: { left: Math.round(start), right: Math.round(room - start), firstLine: 0 },
      markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>',
    },
    '',
  );
}
