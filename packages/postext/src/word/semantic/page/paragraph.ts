// A running head or a folio line as one Word paragraph (#1444): the texts
// of the design at the start, the middle and the end of the text area (a
// centre tab and an end tab between them), each in its element's face,
// size, colour, case and tracking, `{pageNumber}` as a PAGE field; a
// horizontal rule of the design under the header (or over the footer) as
// the paragraph's border.

import type { ResolvedDesignRuleElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { paleOnWhite } from '../design/ink.js';
import { STYLE } from '../styles.js';
import { eighths, fieldRuns, hex, paragraph, px, rPr, textRuns, twips, type ParaProps, type RunProps } from '../wml.js';
import type { Target, Zone } from './place.js';

/** A text of the design and where it goes. */
export interface Item {
  el: ResolvedDesignTextElement;
  /** Resolved text, its fields as marks. */
  text: string;
  zone: Zone;
  x: number;
  /** The chapter title's mark is a STYLEREF field to this style, its
   *  result `text`. */
  title?: { style: string; text: string };
}

export interface Rule {
  el: ResolvedDesignRuleElement;
}

/** Marks that stand for the PAGE and NUMPAGES fields in a resolved
 *  template (private-use characters no text holds). */
export const PAGE_MARK = '\uE0F1';
export const PAGES_MARK = '\uE0F2';
/** The mark of a chapter title read by a STYLEREF field. */
export const TITLE_MARK = '\uE0F3';
const RTL_TEXT = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;

/** Whether a face is a small-caps cut (its name says so). */
const smallCapsFace = (family: string | undefined): boolean => !!family && /\bS(?:C|mall ?Caps)\b/i.test(family.split(',')[0]!);

/** The runs of one text: its words and its fields, in its look. */
function itemRuns(ctx: WriterContext, item: Item): string {
  const el = item.el;
  const u = ctx.units;
  const size = px(u, el.fontSize) || u.basePx;
  const color = hex(el.color);
  const look: RunProps = {
    ...ctx.styles.font(el.fontFamily, el.fontWeight, el.italic),
    ...(el.fontWeight >= 600 ? { b: true } : {}),
    ...(el.italic ? { i: true } : {}),
    ...(el.textTransform === 'uppercase' ? { caps: true } : {}),
    ...(smallCapsFace(el.fontFamily) ? { smallCaps: true } : {}),
    // Pale ink is drawn on a badge or band the export leaves out.
    ...(color && !paleOnWhite(color) ? { color } : {}),
    ...(el.letterSpacing ? { spacing: twips(u, el.letterSpacing, size) || undefined } : {}),
    sz: Math.max(2, Math.round((size * 144) / u.dpi)),
  };
  let out = '';
  for (const piece of item.text.split(/([\uE0F1-\uE0F3])/u)) {
    if (!piece) continue;
    if (piece === PAGE_MARK) out += fieldRuns('PAGE', '1', rPr(look));
    else if (piece === PAGES_MARK) out += fieldRuns('NUMPAGES', '1', rPr(look));
    // The last chapter title on the page (`\l`), as the engine's
    // `{chapterTitle}` reads the last level-1 heading at or before it.
    else if (piece === TITLE_MARK && item.title) out += fieldRuns(`STYLEREF "${item.title.style.replace(/"/g, '')}" \\l`, item.title.text, rPr(look));
    else out += textRuns(piece, rPr({ ...look, ...(RTL_TEXT.test(piece) ? { rtl: true } : {}) }));
  }
  return out;
}

/**
 * The paragraph of a header or footer: `items` laid out in their zones,
 * `rules` as its border. `rtl`: the paragraph runs right to left (its start
 * is the right-hand zone). `width` is the text area's, twips.
 */
export function furnitureParagraph(ctx: WriterContext, kind: Target, items: readonly Item[], rules: readonly Rule[], rtl: boolean, width: number): string {
  const style = kind === 'header' ? STYLE.header : STYLE.footer;
  const props: ParaProps = { style, before: 0, after: 0, ind: { left: 0, right: 0, firstLine: 0 } };
  const rule = rules[0]?.el;
  if (rule) {
    const border = { color: hex(rule.color) ?? '000000', sz: eighths(ctx.units, rule.thickness), space: 4 };
    props.border = kind === 'header' ? { bottom: border } : { top: border };
  }
  // The zones in reading order: start, middle, end.
  const order: Zone[] = rtl ? ['right', 'center', 'left'] : ['left', 'center', 'right'];
  const sep = textRuns(' ', '');
  const zones = order.map((z) =>
    items
      .filter((i) => i.zone === z)
      .sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
      .map((i) => itemRuns(ctx, i))
      .join(sep),
  );
  const used = zones.map((z) => z !== '');
  const count = used.filter(Boolean).length;
  if (count === 0) return paragraph(props, '');
  if (count === 1) {
    // One place: the paragraph aligned there (start and end as `left` and
    // `right`, which a right-to-left paragraph reads as its start and end).
    const at = used.indexOf(true);
    return paragraph({ ...props, jc: at === 0 ? 'left' : at === 1 ? 'center' : 'right' }, zones[at]!);
  }
  // A tab stop only for a place that holds text: a long start text then
  // runs past the middle and still reaches the end on its line.
  const tab = '<w:r><w:tab/></w:r>';
  const content = zones[0]! + (used[1] ? tab + zones[1]! : '') + (used[2] ? tab + zones[2]! : '');
  const tabs: NonNullable<ParaProps['tabs']> = [];
  if (used[1]) tabs.push({ val: 'center', pos: Math.round(width / 2) });
  if (used[2]) tabs.push({ val: 'right', pos: width });
  return paragraph({ ...props, jc: 'left', tabs }, content);
}
