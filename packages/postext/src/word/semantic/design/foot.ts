// The band a design sets across the foot of a page it fills (#1458): a
// part page's dark strip with the book's name on it. Its texts go to the
// footer of the page's section, the band's colour drawn behind them from
// the footer too, at the band's place on the sheet. A footer stands at the
// foot of the page in Word, LibreOffice and Google Docs alike, whatever
// the text above it measures; a table placed on the page (`w:tblpPr`) is
// set there by Word and LibreOffice only, and falls into the flow, on a
// page of its own, in Google Docs. The fill is drawn from the footer and
// not with the page's ground because Word paints a picture of the body
// over everything a header or footer holds.
//
// The footer is not part of the export map (the importer never reads
// headers and footers), so these texts are written without fragments: a
// value they print stays as it is in the source.

import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedDesignRuleElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { paragraph, textRuns } from '../wml.js';
import { ruleParagraph } from './bands.js';
import type { Box } from './geometry.js';
import { groundRun } from './ground.js';
import { designTextStyle } from './text.js';

/** What a page's section prints at its foot in place of its footer. */
export interface PageFoot {
  /** The footer's paragraphs. */
  xml: string;
  /** From the page's bottom edge up to the foot of the last line, twips. */
  distance: number;
}

/** A piece printed on the foot band. */
export type FootPiece = { box: Box; kind: 'text'; el: ResolvedDesignTextElement; text: string } | { box: Box; kind: 'rule'; el: ResolvedDesignRuleElement };

const feet = new WeakMap<object, Map<ContentBlock, PageFoot>>();

/** The foot of the page block `b` opens (a part, a heading with a design
 *  that fills its page), when its design sets one. */
export function pageFootOf(ctx: WriterContext, b: ContentBlock | undefined): PageFoot | undefined {
  return b ? feet.get(ctx.pkg)?.get(b) : undefined;
}

const THIN = '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>';

/**
 * Files the foot of the page `owner` opens: the band (`fill`, `box`, px on
 * the sheet) drawn behind `pieces`, the texts and rules the design prints
 * on it, in reading order. `container` is the text area, `widthTw` its
 * width in Word; `slot` names the design's styles.
 */
export function setPageFoot(ctx: WriterContext, owner: ContentBlock, band: { fill: string; box: Box }, pieces: readonly FootPiece[], page: Box, container: Box, widthTw: number, slot: string, rtl: boolean): void {
  const tw = (v: number): number => Math.round((v * 1440) / ctx.units.dpi);
  // The fill in a paragraph one point tall: a picture needs a paragraph
  // to hang from, and a rule's paragraph holds no run.
  let xml = paragraph({ keepNext: true, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: THIN }, groundRun(ctx, band));
  pieces.forEach((piece, i) => {
    const last = i === pieces.length - 1;
    if (piece.kind === 'rule') {
      xml += ruleParagraph(ctx, piece.el, piece.box, container, widthTw, rtl, !last);
      return;
    }
    const style = designTextStyle(ctx, slot, piece.el, band.fill, false, piece.text);
    const lines = piece.text.split('\n').filter((line) => /[\p{L}\p{N}\p{So}]/u.test(line));
    lines.forEach((line, k) => {
      // The last line stands on the footer's foot: no room under it.
      xml += paragraph({ style, ...(last && k === lines.length - 1 ? { after: 0 } : {}) }, textRuns(line.trim(), ''));
    });
  });
  const bottom = Math.max(...pieces.map((p) => p.box.y + p.box.height));
  let byOwner = feet.get(ctx.pkg);
  if (!byOwner) feet.set(ctx.pkg, (byOwner = new Map()));
  byOwner.set(owner, { xml, distance: Math.max(0, tw(page.height - bottom)) });
}
