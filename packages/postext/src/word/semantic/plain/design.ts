// What the plain design keeps of a design (#1458). A heading's or a part
// page's design is not drawn: no band, backdrop, rule or ornament, and
// none of the texts and pictures the config fixes. What it prints of the
// Markdown stays, in reading order around the title: a text that reads an
// attribute (`{attr.kicker}`: a kicker, a lead, a byline), mapped to the
// attribute where the book design maps it, and a picture an attribute
// names (`{attr.art}`), inline and centred. The title is the heading
// itself, in its own style, shown even when the design prints another
// text in its place.

import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import { resolveDesignText } from '../../../design/placeholders.js';
import { plainDesignText } from '../../../design/richText.js';
import type { ContentBlock } from '../../../parse/types.js';
import type { Dimension, ResolvedDesignElement, ResolvedDesignImageElement, ResolvedDesignTextElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { estimateBoxes, readingOrder, type Box } from '../design/geometry.js';
import { designImageId, fromMarkdown } from '../design/pictures.js';
import { designTextParagraphs } from '../design/text.js';
import { designFrames, titleColumnFirst } from '../design/write.js';
import { pictureRun } from '../media/figures.js';
import { pageGeometry } from '../sections.js';
import { STYLE } from '../styles.js';
import { blockSdt, fieldRuns, paragraph, px, type ParaProps, type Units } from '../wml.js';

/** What a plain design is written from. */
export interface PlainDesign {
  /** The block whose design it is (a heading, a `:::part` fence). */
  owner: ContentBlock;
  /** The book's design elements, the ones its opener prints. */
  elements: readonly ResolvedDesignElement[];
  attrs: Record<string, string> | undefined;
  placeholders: DesignPlaceholderContext;
  /** The slot's height (an opener's band), when the design sets one. */
  minHeight?: Dimension;
  /** Name for the styles of its texts (as the book design names them). */
  slot: string;
  /** Whether a text element prints the title. */
  isTitle: (el: ResolvedDesignTextElement) => boolean;
  /** Whether the title's style opens a page: the break then moves up to
   *  the first piece written, when one stands before the title. */
  breakBefore: boolean;
  /** The title, written when called, with `props` over its style. */
  title: (props: Partial<ParaProps>) => string;
}

type Item = { box: Box; kind: 'title' | 'text' | 'image'; text?: string; write: (first?: ParaProps) => string };

/** The paragraph style of a design's text, with no look of its own. */
const textStyle = (ctx: WriterContext, slot: string, el: ResolvedDesignTextElement): string => ctx.styles.custom(`design:${slot}:${el.id}`, `Design ${slot} ${el.id}`, () => ({ pPr: { ind: { firstLine: 0 } } }));

/** A design's picture inline and centred, no wider than the text nor
 *  than the book prints it, and half the page's text tall at most. */
function picture(ctx: WriterContext, id: string, box: Box, first?: ParaProps): string {
  const pic = ctx.media.get(id);
  if (!pic) return '';
  ctx.usedResources.add(id);
  const geo = pageGeometry(ctx.resolved, ctx.units);
  const maxH = (((geo.heightTw - geo.margins.top - geo.margins.bottom) * ctx.units.dpi) / 1440) * 0.5;
  let w = Math.min(ctx.columnPx, box.width > 1 ? box.width : pic.widthPx);
  if ((w * pic.heightPx) / pic.widthPx > maxH) w = (maxH * pic.widthPx) / pic.heightPx;
  const scaled = { ...pic, widthPx: w, heightPx: (w * pic.heightPx) / pic.widthPx };
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph({ style: STYLE.figure, ...first }, pictureRun(ctx, scaled, id, ctx.resources.get(id)?.altText ?? '', 0)));
}

/** A design's words and pictures of the Markdown around its title. */
export function plainDesign(ctx: WriterContext, spec: PlainDesign): string {
  const book = ctx.plain!.book;
  // Where the book's design stands on the book's page, in the book's own
  // units (an em is its body size): only to read its pieces in the order
  // the book design writes them.
  const u: Units = { dpi: ctx.units.dpi, basePx: 16 };
  u.basePx = px(u, book.bodyText.fontSize) || 16;
  const { container, frames, vertical } = designFrames(book, u, spec.minHeight);
  const texts = new Map<string, string>();
  for (const el of spec.elements) {
    if (el.kind !== 'text') continue;
    const t = resolveDesignText(el.content ?? '', spec.placeholders, !!el.inlineMarks);
    texts.set(el.id, (el.inlineMarks ? plainDesignText(t) : t).trim());
  }
  const imageId = (el: ResolvedDesignImageElement): string | undefined => designImageId(el.resourceId, spec.attrs);
  const rtl = ctx.resolved.direction === 'rtl';
  const boxes = estimateBoxes(spec.elements, frames, u, (id) => texts.get(id) ?? '', ctx.resources, imageId, rtl, vertical);
  const items: Item[] = [];
  let titled = false;
  const seen = new Set<string>();
  const near = (u.dpi / 25.4) * 2;
  for (const el of spec.elements) {
    const box = boxes.get(el.id);
    if (!box) continue;
    if (el.kind === 'text' && spec.isTitle(el)) {
      if (!titled) items.push({ box, kind: 'title', write: () => '' });
      titled = true;
    } else if (el.kind === 'text' && fromMarkdown(el.content ?? '')) {
      const text = texts.get(el.id) ?? '';
      if (!/[\p{L}\p{N}\p{So}]/u.test(text)) continue;
      // A shadow or an outline drawn under a text is the same words a
      // hair away: only the one painted last is written, as in the book
      // design.
      const twin = items.findIndex((i) => i.text === text && Math.abs(i.box.x - box.x) < near && Math.abs(i.box.y - box.y) < near);
      if (twin >= 0) items.splice(twin, 1);
      // No pill: its fill and the spaces that pad it belong to the design.
      const bare = { ...el, box: undefined } as ResolvedDesignTextElement;
      items.push({ box, kind: 'text', text, write: (first) => designTextParagraphs(ctx, spec.owner, bare, text, textStyle(ctx, spec.slot, el), first).join('') });
    } else if (el.kind === 'image' && fromMarkdown(el.resourceId)) {
      const id = imageId(el);
      if (id && ctx.media.has(id) && !seen.has(id)) {
        seen.add(id);
        items.push({ box, kind: 'image', write: (first) => picture(ctx, id, box, first) });
      }
    }
  }
  const order = titleColumnFirst(readingOrder(items, rtl, u), u.dpi);
  // A title the design does not print (a cover that prints the book's
  // title, an endpaper) names a page of the book that the plain file does
  // not have: it opens what the design prints of the Markdown, and no page
  // of its own.
  if (!titled) order.unshift({ box: container, kind: 'title', write: () => '' });
  const moves = spec.breakBefore && order[0]!.kind !== 'title';
  const own: Partial<ParaProps> = moves || (!titled && spec.breakBefore) ? { pageBreakBefore: false } : {};
  return order.map((i, k) => (i.kind === 'title' ? spec.title(own) : i.write(k === 0 && moves ? { pageBreakBefore: true } : undefined))).join('');
}

/** The footer of every page: its number, centred. */
export function plainFooter(): string {
  return paragraph({ style: STYLE.footer, jc: 'center' }, fieldRuns('PAGE', '1'));
}
