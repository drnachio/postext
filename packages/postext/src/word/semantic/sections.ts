// Sections of the semantic .docx (#1390): page size and margins from the
// config, the column layout (`w:cols`, unequal widths for column-and-a-
// half), one section per chapter starting on a new (or odd) page, and the
// running heads and folios of the book's design (page/furniture.ts).

import type { ContentBlock } from '../../parse/types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { layoutColumnCount } from '../../defaults/layout.js';
import type { WriterContext } from './context.js';
import { documentNumerals, resolvedLocale } from '../../pipeline/config.js';
import { pageNumberFormat } from './directives.js';
import { deriveSectionGeometryConfig, headingStyleOf } from '../../pipeline/sections/headingStyles.js';
import { sectionFurniture, sectionStyleAt } from './page/furniture.js';
import { sectionFootnotePr } from './page/notes.js';
import { px, type Units } from './wml.js';

export interface PageGeometry {
  widthTw: number;
  heightTw: number;
  margins: { top: number; right: number; bottom: number; left: number };
  /** `w:cols` element. */
  cols: string;
  /** Text area width, twips. */
  textTwips: number;
  /** Width of one (the main) column, px. */
  columnPx: number;
  mirror: boolean;
}

export function pageGeometry(r: ResolvedConfig, u: Units): PageGeometry {
  const tw = (v: number): number => Math.round((v * 1440) / u.dpi);
  const page = r.page;
  const W = px(u, page.width);
  const H = px(u, page.height);
  const m = { top: px(u, page.margins.top), right: px(u, page.margins.right), bottom: px(u, page.margins.bottom), left: px(u, page.margins.left) };
  const text = Math.max(1, W - m.left - m.right);
  const gutter = px(u, r.layout.gutterWidth);
  let cols = '<w:cols w:space="720"/>';
  let columnPx = text;
  const type = r.layout.layoutType;
  if (type === 'double' || type === 'multiple') {
    const n = type === 'double' ? 2 : Math.max(1, layoutColumnCount(r.layout));
    if (n > 1) {
      columnPx = (text - gutter * (n - 1)) / n;
      cols = `<w:cols w:num="${n}" w:space="${tw(gutter)}"/>`;
    }
  } else if (type === 'oneAndHalf' && r.layout.sideColumnRole === 'floats') {
    // A side column that holds only floats takes no running text: Word
    // would pour the text into it as a second column. The text keeps the
    // main column's width, the side column's room going to the margin on
    // its side. With mirrored margins Word's right margin is the outer one
    // and its left the inner one, so 'outer' and 'inner' follow the page;
    // an absolute 'right' or 'left' column cannot (Word mirrors every
    // margin or none) and its room lands on the outer or inner side. The
    // text keeps its width either way, and the side column is empty in Word.
    const side = Math.max(1, ((text - gutter) * Math.min(99, Math.max(1, r.layout.sideColumnPercent))) / 100);
    columnPx = Math.max(1, text - gutter - side);
    const sideLeft = r.layout.sideColumnSide === 'left' || r.layout.sideColumnSide === 'inner';
    if (sideLeft) m.left += side + gutter;
    else m.right += side + gutter;
  } else if (type === 'oneAndHalf') {
    const side = Math.max(1, ((text - gutter) * Math.min(99, Math.max(1, r.layout.sideColumnPercent))) / 100);
    const main = Math.max(1, text - gutter - side);
    columnPx = main;
    const sideFirst = r.layout.sideColumnSide === 'left' || r.layout.sideColumnSide === 'inner';
    const [a, b] = sideFirst ? [side, main] : [main, side];
    cols = `<w:cols w:num="2" w:equalWidth="0" w:space="${tw(gutter)}"><w:col w:w="${tw(a)}" w:space="${tw(gutter)}"/><w:col w:w="${tw(b)}"/></w:cols>`;
  }
  return {
    widthTw: tw(W),
    heightTw: tw(H),
    margins: { top: tw(m.top), right: tw(m.right), bottom: tw(m.bottom), left: tw(m.left) },
    cols,
    textTwips: tw(Math.max(1, W - m.left - m.right)),
    columnPx,
    mirror: !!page.margins.mirror,
  };
}

/** How a section starts: `chapter` is a chapter's first section (a new
 *  page, or a right-hand one when the book asks for recto starts), the
 *  others the section breaks inside a chapter (#1444). */
export type SectionStart = 'chapter' | 'continuous' | 'nextPage' | 'oddPage';

/** One section of a chapter: how it starts, whether it is set in one
 *  column (page-spanning content in a book of columns), and whether it is
 *  the chapter's first (the page numbering a chapter sets goes there). */
export interface SectionPart {
  start: SectionStart;
  oneColumn?: boolean;
  first?: boolean;
  /** The section's first block: the running heads in force there, and,
   *  when it is written first (`leads`), whether the section's first page
   *  is an opener. */
  block?: ContentBlock;
  leads?: boolean;
  /** Left and right page margins of the section, when its styled section
   *  widens the book's measure (see `sideMargins`, layout/pageSpan.ts). */
  sides?: { left: number; right: number };
  /** The style name of the chapter's later titles, when the running heads
   *  read the chapter title with a STYLEREF field. */
  titleStyle?: string;
  /** The first block of the continuous section that follows this one. */
  follow?: ContentBlock;
}

/** One column across the text area, for page-spanning content. */
const ONE_COLUMN = '<w:cols w:space="720"/>';

/** The `w:sectPr` that closes a section of chapter `index` (its headers
 *  and footers registered in the context). */
export function sectionXml(ctx: WriterContext, geo: PageGeometry, index: number, part: SectionPart = { start: 'chapter', first: true }): string {
  const r = ctx.resolved;
  const level1 = r.headings.levels.find((l) => l.level === 1);
  // The running heads the section's pages print, the opener's on its
  // first page when it opens with a heading that breaks the page.
  const firstFolio = part.first ? (ctx.chapter.pageNumbers?.start ?? (index === 0 && !ctx.start ? 1 : undefined)) : undefined;
  const { refs, titlePg, footer: footDistance } = sectionFurniture(ctx, geo, { chapter: index, ...(part.block ? { first: part.block, leads: !!part.leads } : {}), ...(part.titleStyle ? { titleStyle: part.titleStyle } : {}), ...(part.follow ? { follow: part.follow } : {}), ...(firstFolio !== undefined ? { firstFolio } : {}), start: part.start });
  // A chapter starts on a new page; on a right-hand one only when the book
  // asks for recto starts. A verso start (a spread opener whose artwork
  // the document does not carry) would only leave a blank page, and
  // LibreOffice skips the folio of every blank page a section break makes.
  const parity = level1?.breakBefore.parity ?? 'any';
  const type = part.start !== 'chapter' ? part.start : index === 0 ? undefined : parity === 'odd' || parity === 'always-odd' ? 'oddPage' : 'nextPage';
  const start = type ? `<w:type w:val="${type}"/>` : '';
  const orient = geo.widthTw > geo.heightTw ? ' w:orient="landscape"' : '';
  // The running heads keep the book's distances from the page edge.
  const header = Math.round(geo.margins.top / 2);
  // A page whose design sets a band at its foot keeps the band's text at
  // its height on the sheet (design/foot.ts).
  const footer = footDistance ?? Math.round(geo.margins.bottom / 2);
  const own = part.oneColumn ? undefined : styledGeometry(ctx, geo, index, part.block, pageOfStyle(part));
  // A styled page whose text stands low (a colophon under a cover's top
  // margin) gets twice the room the design gives it, its text set at the
  // foot of the page: Word's fonts need not fit the engine's measure, and
  // an overflowing line would add a page. Word honours the alignment;
  // LibreOffice and Google Docs start the text at the top margin.
  const low = !!own && own !== geo && own.margins.top > Math.max(geo.margins.top, own.heightTw / 2);
  const room = low ? own.heightTw - own.margins.top - own.margins.bottom : 0;
  const base = low ? { ...own.margins, top: Math.max(geo.margins.top, own.margins.top - room) } : (own?.margins ?? geo.margins);
  const m = part.sides && !low ? { ...base, ...part.sides } : base;
  return (
    `<w:sectPr>${refs}${bookHasNotes(ctx) ? sectionFootnotePr(r, !!part.first || opensChapter(part)) : ''}${start}` +
    `<w:pgSz w:w="${geo.widthTw}" w:h="${geo.heightTw}"${orient}/>` +
    `<w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="${header}" w:footer="${footer}" w:gutter="0"/>` +
    pageNumberType(ctx, !!part.first) +
    (own ? own.cols : ONE_COLUMN) +
    (low ? '<w:vAlign w:val="bottom"/>' : '') +
    (titlePg && refs ? '<w:titlePg/>' : '') +
    (r.layout.writingMode === 'vertical-rl' ? '<w:textDirection w:val="tbRl"/>' : '') +
    (r.direction === 'rtl' ? '<w:bidi/>' : '') +
    '<w:docGrid w:linePitch="360"/></w:sectPr>'
  );
}

/**
 * The `w:pgNumType` of a section of the chapter ('' for none). Word keeps
 * the number format per section, a section without one counting in
 * decimal, so the format goes on every section; the first number only on
 * the chapter's first, where the count restarts. Decimal folios take the
 * document's digits, as the engine prints them: Arabic-Indic in an Arabic
 * book (Word's `hindiNumbers`), unless a `:::numbering` sets another
 * series (#1444).
 */
function pageNumberType(ctx: WriterContext, first: boolean): string {
  const p = ctx.chapter.pageNumbers;
  const start = first ? p?.start : undefined;
  const digits = documentNumerals(ctx.resolved) !== 'latn';
  const format = digits && (p?.format === undefined || p.format === 'decimal') ? 'hindiNumbers' : p?.format;
  if (format === undefined && start === undefined) return '';
  return `<w:pgNumType${format ? ` w:fmt="${format}"` : ''}${start !== undefined ? ` w:start="${start}"` : ''}/>`;
}

/** Whether a section opens a page of its styled section after the
 *  heading that starts it (what follows a cover title that fills its
 *  page). Such a page takes the styled section's margins too; the page of
 *  the heading itself keeps the book's, as its design is written in the
 *  flow (#1444). */
const pageOfStyle = (part: SectionPart): boolean => (part.start === 'nextPage' || part.start === 'oddPage') && !(part.leads && part.block?.type === 'heading');

/** The page geometry of a section of chapter `chapter` that starts with
 *  block `first`: the book's, or the one of the layout its styled section
 *  sets (a contents page in one column in a book of two, #1444), with its
 *  margins on a page of its own (`margins`). */
export function styledGeometry(ctx: WriterContext, geo: PageGeometry, chapter: number, first: ContentBlock | undefined, margins = false): PageGeometry {
  const style = first ? sectionStyleAt(ctx, chapter, first) : undefined;
  if (!style) return geo;
  const r = ctx.resolved;
  if (margins && style.margins) return pageGeometry(deriveSectionGeometryConfig(r, style), ctx.units);
  return style.layout ? pageGeometry({ ...r, layout: style.layout }, ctx.units) : geo;
}

/** Whether heading `b` fills its page: its styled section's margins leave
 *  a body area under a quarter of the page (a cover whose title stands
 *  low), which the title takes, so what follows it in the section goes to
 *  the next page, as the engine sets it (#1444). The document keeps the
 *  book's margins (the heading's design is written in the flow). */
export function headingFillsPage(ctx: WriterContext, b: ContentBlock | undefined): boolean {
  if (b?.type !== 'heading') return false;
  const m = headingStyleOf(b, ctx.resolved)?.margins;
  if (!m) return false;
  const height = px(ctx.units, ctx.resolved.page.height);
  return height - px(ctx.units, m.top) - px(ctx.units, m.bottom) < height / 4;
}

/** Whether a section opens with a chapter title on a page of its own: the
 *  notes count from 1 there, as at the start of a chapter file (the
 *  engine starts them again at each level-1 heading). */
const opensChapter = (part: SectionPart): boolean => part.start !== 'continuous' && !!part.leads && part.block?.type === 'heading' && (part.block.level ?? 1) === 1;

const notesMemo = new WeakMap<object, boolean>();

/** Whether the book has footnotes (each section then says how Word
 *  numbers them). */
function bookHasNotes(ctx: WriterContext): boolean {
  let has = notesMemo.get(ctx.book);
  if (has === undefined) notesMemo.set(ctx.book, (has = ctx.book.some((ch) => ch.blocks.some((b) => b.footnoteDef !== undefined))));
  return has;
}

/** Whether the book's text runs in two or more columns (page-spanning
 *  content then needs a section of its own). */
export const multiColumn = (geo: PageGeometry): boolean => geo.cols.includes('w:num=');

/** The page numbering the book's first chapter starts with: the format
 *  and first number of `page.pageNumbering`, or of the `start` of a book
 *  that continues a longer one; nothing for Word's own default (decimal
 *  from 1). A `:::numbering` in the chapter is read over it. */
export function bookPageNumbers(ctx: WriterContext): { format?: string; start?: number } | undefined {
  const p = { ...ctx.resolved.page.pageNumbering, ...(ctx.start?.pageNumbering ?? {}) };
  const word = p.format !== undefined ? pageNumberFormat(String(p.format), resolvedLocale(ctx.resolved)) : undefined;
  const format = word && word !== 'decimal' ? word : undefined;
  const start = p.startAt !== undefined && Number.isInteger(p.startAt) && p.startAt >= 0 && p.startAt !== 1 ? p.startAt : undefined;
  if (format === undefined && start === undefined) return undefined;
  return { ...(format ? { format } : {}), ...(start !== undefined ? { start } : {}) };
}
