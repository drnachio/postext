// The paragraph look of a caption (#1444): the document's caption style
// gives Word's `Caption`, and a resource type with a caption style of its
// own (a table captioned above, in another size) a style based on it. A
// caption keeps its gap from the figure on the figure's side and a body
// line on the other, so the text after a caption set below its figure (or
// before one set above it) does not run into it; a caption and its note,
// in one style, keep no extra space between them. A caption keeps its
// words whole unless its style hyphenates (`hyphenation`, #1550): the
// document hyphenates in Word when the body does (`w:autoHyphenation`).

import type { ResolvedCaptionStyleConfig, TextAlign } from '../../../types.js';
import { halfPoints, hex, px, twips, type ParaProps, type RunProps, type Units } from '../wml.js';

const JC: Record<TextAlign, ParaProps['jc']> = { left: 'left', justify: 'both', center: 'center', right: 'right' };

/** `pPr` and `rPr` of a caption paragraph style; `lineTwips` is a body
 *  line (of text `u.basePx` high), `font` the face of the caption's
 *  family, `inherited` the caption style of the style it is based on. */
export function captionLook(u: Units, cap: ResolvedCaptionStyleConfig, lineTwips: number, font: RunProps, inherited?: ResolvedCaptionStyleConfig): { pPr: ParaProps; rPr: RunProps } {
  const sizePx = px(u, cap.fontSize);
  const gap = twips(u, cap.gap, sizePx);
  const above = cap.position === 'above';
  return {
    // A caption stays whole, and one set above its figure goes with it.
    pPr: {
      keepNext: above || undefined,
      keepLines: true,
      before: above ? lineTwips : gap,
      after: above ? gap : lineTwips,
      contextualSpacing: true,
      // Its own leading (`lineHeight`), else the body's scaled to the
      // caption's size.
      line: { twips: Math.max(1, cap.lineHeight ? twips(u, cap.lineHeight, sizePx) : Math.round((lineTwips * sizePx) / u.basePx)), rule: 'atLeast' },
      ind: { firstLine: 0 },
      jc: JC[cap.align],
      // A style based on one that keeps them whole says it hyphenates.
      suppressAutoHyphens: hyphens(cap.hyphenation, inherited?.hyphenation),
    },
    rPr: { ...font, color: hex(cap.color), sz: halfPoints(u, cap.fontSize) },
  };
}

/** `suppressAutoHyphens` of a paragraph style that hyphenates (`own`) or
 *  not, based on one that does (`inherited` true), does not (false) or on
 *  none of a caption's (undefined): set where it differs (#1550). */
export function hyphens(own: boolean, inherited?: boolean): boolean | undefined {
  if (!own) return inherited === false ? undefined : true;
  return inherited === false ? false : undefined;
}

/** Whether two caption styles set the same paragraph (the fields
 *  `captionLook` reads). */
export function sameCaptionLook(a: ResolvedCaptionStyleConfig, b: ResolvedCaptionStyleConfig): boolean {
  const key = (c: ResolvedCaptionStyleConfig): string => JSON.stringify([c.fontFamily, c.fontSize, c.color, c.align, c.gap, c.position, c.lineHeight, c.hyphenation]);
  return key(a) === key(b);
}
