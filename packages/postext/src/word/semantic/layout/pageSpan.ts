// Page-spanning content and heading page breaks in the semantic .docx
// (#1444). In a book of columns a heading, box, table or picture set
// `span: 'page'` runs across the whole text area. Word users do that with
// continuous section breaks: one before the block that switches to a
// single column, one after it that brings the book's columns back (Word
// and LibreOffice balance the columns above the break, as the engine
// levels the band a page-span block leaves). A heading that opens a page
// on a given side (`breakBefore.parity: 'odd'`) needs a section break too,
// since a paragraph can only ask for a new page; one that opens any page
// gets one as well, so its page takes the first-page header and footer as
// a chapter opener does.
//
// The chapter is written as pieces, each a block's XML and what it asks
// of the section it stands in, then grouped into sections, each closed by
// an empty paragraph carrying its `w:sectPr` (the reader passes over it).

import { resolveResourcePlacement } from '../../../pipeline/floats/floatPlacement.js';
import { createHeadingLevelResolver, type HeadingLevelResolver } from '../../../pipeline/sections/headingStyles.js';
import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { WriterContext } from '../context.js';
import { joinBlocks, type Node } from '../blocks.js';
import { sectionXml, type PageGeometry, type SectionStart } from '../sections.js';
import { pPr } from '../wml.js';

/** A block's XML and what it asks of its section. */
export interface Piece {
  xml: string;
  /** Set across the text area (in one column). */
  span?: boolean;
  /** Opens a new section starting this way (a heading's page break). */
  start?: Exclude<SectionStart, 'chapter' | 'continuous'>;
}

const resolvers = new WeakMap<ResolvedConfig, HeadingLevelResolver>();

/** The heading level config a heading renders with (its style's merged in). */
function headingLevel(ctx: WriterContext, b: ContentBlock): ReturnType<HeadingLevelResolver['forBlock']> {
  let r = resolvers.get(ctx.resolved);
  if (!r) resolvers.set(ctx.resolved, (r = createHeadingLevelResolver(ctx.resolved)));
  return r.forBlock(b);
}

/** Whether resource `id` is set across the page (its placement, its
 *  type's default, or a quarter turn, which always takes the page). */
export function resourceSpansPage(ctx: WriterContext, id: string | undefined): boolean {
  const res = id ? ctx.resources.get(id) : undefined;
  if (!res) return false;
  return resolveResourcePlacement(res, ctx.resourceTypes.find((t) => t.id === res.typeId)).span === 'page';
}

/** Whether a top-level node is set across the page: a `span: 'page'`
 *  heading, box (its style's span or the fence's `span`), group or
 *  resource. */
export function spansPage(ctx: WriterContext, node: Node): boolean {
  if ('container' in node) {
    const attrs = node.container.containerAttrs ?? {};
    if (attrs.span === 'page') return true;
    if (attrs.span !== undefined || node.container.containerName !== 'callout') return false;
    return ctx.styles.callout(attrs.type)?.span === 'page';
  }
  const b = node.block;
  if (b.type === 'heading') return headingLevel(ctx, b)?.span === 'page';
  if (b.type === 'resourceBlock') return resourceSpansPage(ctx, b.resourceId);
  return false;
}

/** The section break a heading opens with: a new page, or a right-hand
 *  one (a left-hand start leaves a blank page in Word, as at a chapter's
 *  start); none when the heading does not break the page. */
export function headingStart(ctx: WriterContext, b: ContentBlock): Piece['start'] {
  if (b.type !== 'heading') return undefined;
  const bb = headingLevel(ctx, b)?.breakBefore;
  if (!bb?.enabled) return undefined;
  return bb.parity === 'odd' || bb.parity === 'always-odd' ? 'oddPage' : 'nextPage';
}

/** A paragraph that only closes a section: no room of its own to speak
 *  of, so it adds no blank line where the columns change. */
function sectionBreak(sect: string): string {
  return `<w:p>${pPr({ before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>', sectPr: sect })}</w:p>`;
}

/**
 * The chapter's body as sections: pieces grouped by the column layout they
 * ask for and the page breaks of their headings. Every section but the
 * last is closed by a section-break paragraph; the last by `w:sectPr` at
 * the end of the body (`last`) or by a paragraph carrying it.
 */
export function chapterSections(ctx: WriterContext, geo: PageGeometry, index: number, title: string | undefined, pieces: readonly Piece[], last: boolean): string {
  const columns = geo.cols.includes('w:num=');
  type Section = { start: SectionStart; oneColumn: boolean; parts: string[] };
  const sections: Section[] = [];
  for (const p of pieces) {
    if (!p.xml) continue;
    const oneColumn = columns && !!p.span;
    const cur = sections[sections.length - 1];
    if (!cur) {
      // The chapter's own start already opens the page.
      sections.push({ start: 'chapter', oneColumn, parts: [p.xml] });
      continue;
    }
    if (p.start) sections.push({ start: p.start, oneColumn, parts: [p.xml] });
    else if (cur.oneColumn !== oneColumn) sections.push({ start: 'continuous', oneColumn, parts: [p.xml] });
    else cur.parts.push(p.xml);
  }
  if (!sections.length) sections.push({ start: 'chapter', oneColumn: false, parts: [] });
  let xml = '';
  sections.forEach((s, i) => {
    const sect = sectionXml(ctx, geo, index, title, { start: s.start, oneColumn: s.oneColumn, first: i === 0 });
    const body = joinBlocks(s.parts);
    if (i < sections.length - 1) xml += body + sectionBreak(sect);
    else xml += last ? body + sect : `${body}<w:p>${pPr({ sectPr: sect })}</w:p>`;
  });
  return xml;
}
