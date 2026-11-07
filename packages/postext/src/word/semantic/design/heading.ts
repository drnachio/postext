// A heading drawn by its design (#1444): the texts, pictures and rules the
// heading style's `advancedDesign` prints are written around the heading
// paragraph in reading order (top to bottom, then from the side lines
// start on), so a kicker comes above the title and a lead, byline or
// credit below it (see write.ts). A design that never prints the heading's
// own text (a cover that prints the book's title, a back cover, the page
// of an endpaper) leaves the heading paragraph hidden: still mapped to its
// source, out of the outline, and a line of one point. So does a heading
// the book marks `hidden`. A filled box shades what is printed on it;
// other boxes and paths are decoration and are not drawn.

import type { ContentBlock } from '../../../parse/types.js';
import { headingIsHidden, headingIsListed } from '../../../pipeline/sections/headingStyles.js';
import { resolveDesignText } from '../../../design/placeholders.js';
import { plainDesignText } from '../../../design/richText.js';
import type { ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { generatedRuns } from '../generated.js';
import { hex, type ParaProps } from '../wml.js';
import { hideRuns } from './hide.js';
import { designImageId, designPictures, printed } from './pictures.js';
import { inPartColors } from './partColor.js';
import { designTextLook, designTextParagraphs, fittedSize } from './text.js';
import { designPlaceholders, headingLevelOf } from './values.js';
import { writeDesign } from './write.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';

/** How the heading paragraph itself is written under a design. */
export interface HeadingLook {
  /** Its paragraph style, when the design gives the title its own look. */
  style?: string;
  /** Leave the number prefix out: a design prints the number it shows. */
  noNumber?: boolean;
  /** Generated runs the title element prints before and after the title
   *  ("{number}. " in front, a closing ornament after). Functions, called
   *  as the paragraph is written, so the map lists them in document order. */
  before?: () => string;
  after?: () => string;
  /** Paragraph properties over the style's. */
  props?: Partial<ParaProps>;
}

/** A hidden heading paragraph: no visible text, no outline level, one
 *  point high, but its text kept (mapped) for the way back. */
const HIDDEN: Partial<ParaProps> = { outlineLvl: 9, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, keepNext: true };


/** Whether a text element prints the heading's own title. */
function printsTitle(el: ResolvedDesignTextElement, level: number): boolean {
  const c = el.content ?? '';
  return c.includes('{titleText}') || (level === 1 && c.includes('{chapterTitle}'));
}

/**
 * Heading `b` as its design prints it, or undefined when it has no design
 * and is not hidden (the caller writes it as usual). `heading` writes the
 * heading paragraph with a look.
 */
export function renderDesignedHeading(ctx: WriterContext, b: ContentBlock, heading: (look: HeadingLook) => string): string | undefined {
  const level = headingLevelOf(ctx.resolved, b);
  if (!level) return undefined;
  if (headingIsHidden(b, level)) return hideRuns(heading({ props: HIDDEN }));
  const design = level.advancedDesign;
  if (!design.enabled || !design.slot.elements.length) return undefined;
  const placeholders = designPlaceholders(ctx, b);
  const elements = inPartColors(ctx, b, printed(design.slot.elements));
  const texts = new Map<string, string>();
  for (const el of elements) {
    if (el.kind !== 'text') continue;
    const t = resolveDesignText(el.content ?? '', placeholders, !!el.inlineMarks);
    texts.set(el.id, (el.inlineMarks ? plainDesignText(t) : t).trim());
  }
  const slot = b.attrs?.style ?? `L${b.level ?? 1}`;
  const listed = headingIsListed(b, ctx.resolved);
  return writeDesign(ctx, {
    elements,
    texts,
    minHeight: design.minHeight,
    slot,
    imageId: (el) => designImageId(el.resourceId, b.attrs),
    pictures: new Map(designPictures(b, elements, ctx.resources).map((p) => [p.elementId, p.id])),
    isTitle: (el) => printsTitle(el, b.level ?? 1),
    textParagraphs: (el, text, style, first) => designTextParagraphs(ctx, b, el, text, style, first),
    breakBefore: level.breakBefore.enabled,
    title: (el, band, props, shown) => {
      const look: HeadingLook = { noNumber: true, props };
      if (el) {
        look.style = titleStyle(ctx, slot, b, el, band, listed);
        Object.assign(look, aroundTitle(ctx, b, el, placeholders));
      }
      // A design title the contents leave out stays out of Word's outline.
      if (!listed) look.props = { ...look.props, outlineLvl: 9 };
      return shown ? heading(look) : hideRuns(heading({ ...look, props: { ...look.props, ...HIDDEN } }));
    },
  });
}

/** A character no title holds, put where the title stands to find what the
 *  element prints around it. */
const MARK = '\uE000';

/** What the title element prints before and after the title (its number,
 *  a separator, a fixed word, an ornament), as generated runs: the
 *  heading paragraph keeps only the title mapped to the source. */
function aroundTitle(ctx: WriterContext, b: ContentBlock, el: ResolvedDesignTextElement, placeholders: DesignPlaceholderContext): Pick<HeadingLook, 'before' | 'after'> {
  const h = placeholders.heading!;
  const marked = { ...placeholders, heading: { ...h, titleText: MARK, chapterTitle: (b.level ?? 1) === 1 ? MARK : h.chapterTitle, ...(h.titleMarked !== undefined ? { titleMarked: MARK } : {}) } };
  const raw = resolveDesignText(el.content ?? '', marked, !!el.inlineMarks);
  const all = el.inlineMarks ? plainDesignText(raw) : raw;
  const at = all.indexOf(MARK);
  if (at < 0) return {};
  const head = all.slice(0, at).replace(/^\s+/, '');
  const tail = all.slice(at + MARK.length).split(MARK).join('').replace(/\s+$/, '');
  const runs = (t: string): (() => string) | undefined => (/[^\s]/u.test(t) ? () => generatedRuns(ctx, [{ text: t }], `design:${el.id}`) : undefined);
  return { before: runs(head), after: runs(tail) };
}

/** The heading paragraph's style under a design: its level's (or style's)
 *  Word heading style with the title element's look over it. A title the
 *  contents leave out has no outline level. */
function titleStyle(ctx: WriterContext, slot: string, b: ContentBlock, el: ResolvedDesignTextElement, band: string | undefined, listed: boolean): string {
  const base = ctx.styles.heading(b.level ?? 1, b.attrs?.style);
  const size = fittedSize(ctx, el, b.text);
  return ctx.styles.custom(`title:${slot}:${b.level ?? 1}:${band ?? ''}:${hex(el.color) ?? ''}:${Math.round(size)}:${listed ? '' : 'x'}`, `Design ${slot} title`, () => {
    const look = designTextLook(ctx, el, band, true, size);
    return { basedOn: base, pPr: { ...look.pPr, outlineLvl: listed ? Math.min(8, (b.level ?? 1) - 1) : 9 }, rPr: look.rPr };
  });
}
