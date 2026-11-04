/**
 * The underlines of the links (`links.style.underline`, #1402). A link's
 * words are ordinary text (`VDTLineSegment.href`), so the layout is the
 * one without the style; once the document is laid out, each line holding
 * a link gets the lines under its runs (`VDTLine.linkUnderlines`), placed
 * where the renderers paint the segments ({@link segmentPositions}). Every
 * line gets them, whatever outputs the style lists: the canvas and the PDF
 * draw them only in an output the style lists, the HTML outputs set the
 * underline as CSS instead.
 *
 * A run is the words of one link that follow each other along the line
 * (the flow order `VDTLine.order` followed), with the spaces between
 * them. A citation linked to its entry is not a link here. Vertical text
 * gets no underline.
 */

import type { VDTDocument, VDTLine, VDTLineSegment, VDTLinkUnderline } from '../vdt.js';
import { segmentFont, segmentPositions } from './cjkMarks.js';
import { fontEm } from '../measure/vertical.js';
import { textLineGroups } from './highlightMarks.js';
import { BIBLIOGRAPHY_ANCHOR_PREFIX } from '../pipeline/references/citations/process.js';

/** Where the underline sits under the baseline and how thick it is, in em
 *  of the text. */
const UNDER = 0.13;
const STROKE = 0.06;

type BlockLike = Parameters<typeof segmentPositions>[1];

/** The link a segment is styled as: its target, unless it is a reference,
 *  a page link or a citation linked to its entry. */
export function styledLinkOf(seg: VDTLineSegment): string | undefined {
  const href = seg.href;
  if (href === undefined || seg.refResourceId !== undefined || seg.pageLink !== undefined) return undefined;
  return href.startsWith(`#${BIBLIOGRAPHY_ANCHOR_PREFIX}`) ? undefined : href;
}

/** The underlines of a line's links, relative to it; empty when it holds
 *  none. */
export function lineLinkUnderlines(line: VDTLine, block: BlockLike): VDTLinkUnderline[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => styledLinkOf(s) !== undefined)) return [];
  const { xs, widths } = segmentPositions(line, block);
  const order = line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i);
  const at = xs.slice();
  let x = xs[0] ?? line.bbox.x;
  for (const i of order) {
    at[i] = x;
    x += widths[i]!;
  }
  const out: VDTLinkUnderline[] = [];
  let run: { href: string; from: number; to: number; em: number } | undefined;
  const flush = (): void => {
    if (run && run.to > run.from) {
      out.push({
        x: run.from - line.bbox.x,
        y: UNDER * run.em,
        length: run.to - run.from,
        thickness: Math.max(0.5, STROKE * run.em),
      });
    }
    run = undefined;
  };
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const seg = segments[i]!;
    const href = styledLinkOf(seg);
    if (href === undefined) {
      // A space between two words of one link carries the line on.
      if (run && seg.kind === 'space') {
        let j = k + 1;
        while (j < order.length && segments[order[j]!]!.kind === 'space' && styledLinkOf(segments[order[j]!]!) === undefined) j++;
        const next = j < order.length ? segments[order[j]!] : undefined;
        if (next && styledLinkOf(next) === run.href) continue;
      }
      flush();
      continue;
    }
    if (seg.kind === 'space') {
      if (run && run.href === href) continue;
      flush();
      continue;
    }
    const em = fontEm(segmentFont(seg, block));
    if (run && run.href === href) {
      run.from = Math.min(run.from, at[i]!);
      run.to = Math.max(run.to, at[i]! + widths[i]!);
      run.em = Math.max(run.em, em);
      continue;
    }
    flush();
    run = { href, from: at[i]!, to: at[i]! + widths[i]!, em };
  }
  flush();
  return out;
}

/** Set `VDTLine.linkUnderlines` on every line holding a link of a
 *  document that underlines its links (see the module comment). A line
 *  object shared with another build keeps the underlines it was given. */
export function underlineDocumentLinks(doc: VDTDocument): void {
  const style = doc.config?.links?.style;
  if (!style || style.underline === 'none' || doc.config.layout.writingMode === 'vertical-rl') return;
  for (const { lines, like } of textLineGroups(doc)) {
    for (const line of lines) {
      const runs = lineLinkUnderlines(line, like);
      if (runs.length > 0) line.linkUnderlines = runs;
    }
  }
}
