// Sections of the semantic .docx (#1390): page size and margins from the
// config, the column layout (`w:cols`, unequal widths for column-and-a-
// half), one section per chapter starting on a new (or odd) page, and a
// running head and page number when the book's design has them.

import type { ResolvedConfig } from '../../vdt.js';
import { layoutColumnCount } from '../../defaults/layout.js';
import type { WriterContext } from './context.js';
import { resolvedLocale } from '../../pipeline/config.js';
import { pageNumberFormat, pageNumberType } from './directives.js';
import { STYLE } from './styles.js';
import { fieldRuns, pPr, px, textRuns, type Units } from './wml.js';

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
}

/** One column across the text area, for page-spanning content. */
const ONE_COLUMN = '<w:cols w:space="720"/>';

/** The `w:sectPr` that closes a section of chapter `index` (its headers
 *  and footers registered in the context). */
export function sectionXml(ctx: WriterContext, geo: PageGeometry, index: number, title: string | undefined, part: SectionPart = { start: 'chapter', first: true }): string {
  const r = ctx.resolved;
  const level1 = r.headings.levels.find((l) => l.level === 1);
  // A section that opens a page (a chapter, a heading's page break) shows
  // the first-page header and footer; one that goes on down the page
  // keeps the running ones.
  const titlePg = !!level1?.breakBefore.enabled && part.start !== 'continuous';
  let refs = '';
  if (r.header.elements.length) {
    const id = `h${index}`;
    ctx.headers[id] = `<w:p>${pPr({ style: STYLE.header })}${textRuns(title ?? '', '')}</w:p>`;
    refs += `<w:headerReference w:type="default" r:id="${ctx.pkg.headerRel(id)}"/>`;
    if (titlePg) {
      ctx.headers.first = `<w:p>${pPr({ style: STYLE.header })}</w:p>`;
      refs += `<w:headerReference w:type="first" r:id="${ctx.pkg.headerRel('first')}"/>`;
    }
  }
  if (r.footer.elements.length) {
    ctx.footers.page = `<w:p>${pPr({ style: STYLE.footer })}${fieldRuns('PAGE', '1')}</w:p>`;
    refs += `<w:footerReference w:type="default" r:id="${ctx.pkg.footerRel('page')}"/>`;
    if (titlePg) {
      ctx.footers.first = `<w:p>${pPr({ style: STYLE.footer })}</w:p>`;
      refs += `<w:footerReference w:type="first" r:id="${ctx.pkg.footerRel('first')}"/>`;
    }
  }
  // A chapter starts on a new page; on a right-hand one only when the book
  // asks for recto starts. A verso start (a spread opener whose artwork
  // the document does not carry) would only leave a blank page, and
  // LibreOffice skips the folio of every blank page a section break makes.
  const parity = level1?.breakBefore.parity ?? 'any';
  const type = part.start !== 'chapter' ? part.start : index === 0 ? undefined : parity === 'odd' || parity === 'always-odd' ? 'oddPage' : 'nextPage';
  const start = type ? `<w:type w:val="${type}"/>` : '';
  const orient = geo.widthTw > geo.heightTw ? ' w:orient="landscape"' : '';
  const m = geo.margins;
  const header = Math.round(m.top / 2);
  const footer = Math.round(m.bottom / 2);
  return (
    `<w:sectPr>${refs}${start}` +
    `<w:pgSz w:w="${geo.widthTw}" w:h="${geo.heightTw}"${orient}/>` +
    `<w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="${header}" w:footer="${footer}" w:gutter="0"/>` +
    pageNumberType(ctx, !!part.first) +
    (part.oneColumn ? ONE_COLUMN : geo.cols) +
    (titlePg && refs ? '<w:titlePg/>' : '') +
    (r.layout.writingMode === 'vertical-rl' ? '<w:textDirection w:val="tbRl"/>' : '') +
    (r.direction === 'rtl' ? '<w:bidi/>' : '') +
    '<w:docGrid w:linePitch="360"/></w:sectPr>'
  );
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
