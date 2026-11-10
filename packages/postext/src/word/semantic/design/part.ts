// A part's opening page drawn by the book's part design (#1444): the
// `parts.design` elements (a kicker, the big number, a rule, the title, a
// band in the part's colour) written as a heading design is, in reading
// order and in the part's palette. The number and the title stay the
// fence's attributes: a text that prints exactly `{number}` or the title
// is mapped to the attribute, so an edit in Word lands in the fence.

import type { ContentBlock } from '../../../parse/types.js';
import { resolveDesignText } from '../../../design/placeholders.js';
import { plainDesignText } from '../../../design/richText.js';
import type { ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { STYLE } from '../styles.js';
import { hex, px, type ParaProps } from '../wml.js';
import { hideRuns } from './hide.js';
import { inPartColors, recolored } from './partColor.js';
import { designImageId, designPictures, printed } from './pictures.js';
import { designTextLook, designTextParagraphs, fittedSize } from './text.js';
import { plainDesign } from '../plain/design.js';
import { partPaletteAt, partPlaceholders } from './values.js';
import { writeDesign } from './write.js';

/** Writes one of the fence's attributes (`number`, `title`) as a mapped
 *  paragraph in `style`; '' when the fence does not set it. */
export type PartAttrParagraph = (key: 'number' | 'title', style: string, props?: Partial<ParaProps>) => string;

const isTitle = (el: ResolvedDesignTextElement): boolean => (el.content ?? '').includes('{titleText}');
const isNumber = (el: ResolvedDesignTextElement): boolean => /^\s*\{number\}\s*$/.test(el.content ?? '');

/**
 * The opening of part `part` as the book's part design prints it, or
 * undefined when the book has no part design (the caller writes the
 * number and title plainly).
 */
export function renderPartDesign(ctx: WriterContext, part: ContentBlock, attr: PartAttrParagraph, body?: () => string): string | undefined {
  const design = (ctx.plain?.book ?? ctx.resolved).parts.design;
  if (!design.elements.length) return undefined;
  const placeholders = partPlaceholders(ctx, part);
  if (ctx.plain) {
    // The number, when the design prints it, and the title in the part
    // style, then the words of the fence the design prints.
    const numbered = design.elements.some((el) => el.kind === 'text' && /\{(?:number|partNumber)/.test(el.content ?? ''));
    const head = (props: Partial<ParaProps>): string => {
      const number = numbered ? attr('number', STYLE.part, props) : '';
      return number + attr('title', STYLE.part, number ? { ...props, pageBreakBefore: false } : props);
    };
    return plainDesign(ctx, { owner: part, elements: printed(design.elements).filter((el) => el.kind !== 'text' || !isNumber(el)), attrs: part.containerAttrs, placeholders, slot: 'part', isTitle, breakBefore: true, title: head });
  }
  const elements = inPartColors(ctx, part, printed(design.elements));
  const texts = new Map<string, string>();
  for (const el of elements) {
    if (el.kind !== 'text') continue;
    const t = resolveDesignText(el.content ?? '', placeholders, !!el.inlineMarks);
    texts.set(el.id, (el.inlineMarks ? plainDesignText(t) : t).trim());
  }
  const title = part.containerAttrs?.title ?? '';
  return writeDesign(ctx, {
    owner: part,
    elements,
    texts,
    slot: 'part',
    imageId: (el) => designImageId(el.resourceId, part.containerAttrs),
    pictures: new Map(designPictures(part, elements, ctx.resources).map((p) => [p.elementId, p.id])),
    isTitle,
    textParagraphs: (el, text, style, first) => {
      if (isNumber(el)) {
        const xml = attr('number', style, first);
        return xml ? [xml] : [];
      }
      return designTextParagraphs(ctx, part, el, text, style, first);
    },
    breakBefore: true,
    ...(body ? { body: { write: body, top: px(ctx.units, ctx.resolved.parts.margins.top), ink: hex(recolored(ctx.resolved.parts.bodyStyle.color, partPaletteAt(ctx, part), ctx.resolved.colorPalette ?? [])) } } : {}),
    title: (el, band, props, shown) => {
      const style = el ? titleStyle(ctx, el, band, title) : STYLE.part;
      const xml = attr('title', style, shown ? props : { ...props, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, outlineLvl: 9 });
      return shown ? xml : hideRuns(xml);
    },
  });
}

/** The part title's style: the part style with the title element's look. */
function titleStyle(ctx: WriterContext, el: ResolvedDesignTextElement, band: string | undefined, title: string): string {
  const size = fittedSize(ctx, el, title);
  return ctx.styles.custom(`partTitle:${el.id}:${band ?? ''}:${hex(el.color) ?? ''}:${Math.round(size)}`, 'Design part title', () => {
    const look = designTextLook(ctx, el, band, true, size);
    return { basedOn: STYLE.part, pPr: { ...look.pPr, outlineLvl: 0 }, rPr: look.rPr };
  });
}
