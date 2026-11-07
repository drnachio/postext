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

import { layoutColumnCount } from '../../../defaults/layout.js';
import { resolveResourcePlacement } from '../../../pipeline/floats/floatPlacement.js';
import { createHeadingLevelResolver, type HeadingLevelResolver } from '../../../pipeline/sections/headingStyles.js';
import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { WriterContext } from '../context.js';
import { joinBlocks, type Node } from '../blocks.js';
import { headingFillsPage, sectionXml, type PageGeometry, type SectionStart } from '../sections.js';
import { pPr } from '../wml.js';

/** A block's XML and what it asks of its section. */
export interface Piece {
  xml: string;
  /** Set across the text area (in one column). */
  span?: boolean;
  /** Opens a new section starting this way (a heading's page break). */
  start?: Exclude<SectionStart, 'chapter' | 'continuous'>;
  /** The top-level block written (a heading tells the section's running
   *  heads and whether it opens on an opener page). */
  block?: ContentBlock;
}

const resolvers = new WeakMap<ResolvedConfig, HeadingLevelResolver>();

/** The heading level config a heading renders with (its style's merged in). */
function headingLevel(ctx: WriterContext, b: ContentBlock): ReturnType<HeadingLevelResolver['forBlock']> {
  let r = resolvers.get(ctx.resolved);
  if (!r) resolvers.set(ctx.resolved, (r = createHeadingLevelResolver(ctx.resolved)));
  return r.forBlock(b);
}

/** The text columns of the book's layout (a side column takes no text). */
function textColumns(r: ResolvedConfig): number {
  const type = r.layout.layoutType;
  return type === 'double' ? 2 : type === 'multiple' ? Math.max(1, layoutColumnCount(r.layout)) : 1;
}

/** Whether resource `id` is set across the page (its placement, its
 *  type's default, or a quarter turn, which always takes the page), or
 *  across as many columns as the text has, which the engine sets as one. */
export function resourceSpansPage(ctx: WriterContext, id: string | undefined): boolean {
  const res = id ? ctx.resources.get(id) : undefined;
  if (!res) return false;
  const placement = resolveResourcePlacement(res, ctx.resourceTypes.find((t) => t.id === res.typeId));
  if (placement.span === 'page') return true;
  const cols = textColumns(ctx.resolved);
  return placement.span === 'column' && cols > 1 && Math.min(placement.columns, cols) === cols;
}

/** Whether a top-level node is set across the page: a `span: 'page'`
 *  heading or one with an advanced design, box (its style's span or the fence's `span`), group or
 *  resource. */
export function spansPage(ctx: WriterContext, node: Node): boolean {
  if ('container' in node) {
    const attrs = node.container.containerAttrs ?? {};
    if (attrs.span === 'page') return true;
    if (attrs.span !== undefined || node.container.containerName !== 'callout') return false;
    return ctx.styles.callout(attrs.type)?.span === 'page';
  }
  const b = node.block;
  if (b.type === 'heading') {
    // A heading painted from its design takes the band across the page too.
    const lvl = headingLevel(ctx, b);
    return !!lvl && (lvl.span === 'page' || lvl.advancedDesign.enabled);
  }
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
function sectionBreak(sect?: string): string {
  return `<w:p>${pPr({ before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>', ...(sect ? { sectPr: sect } : {}) })}</w:p>`;
}

/** The paragraph style a heading's XML sets its title in: the paragraph
 *  that carries the outline level 1 (Word's Heading 1 carries it in the
 *  style). */
function titleParagraphStyle(xml: string): string | undefined {
  for (const m of xml.matchAll(/<w:pPr><w:pStyle w:val="([^"]+)"\/>(.*?)<\/w:pPr>/g)) {
    if (m[2]!.includes('<w:outlineLvl w:val="0"/>') || (m[1] === 'Heading1' && !m[2]!.includes('<w:outlineLvl'))) return m[1];
  }
  return undefined;
}

/**
 * The name of the paragraph style a running head's `{chapterTitle}` can
 * read with a STYLEREF field (the title of the last chapter heading on the
 * page): when a level-1 heading after the chapter's first goes on down a
 * page (one that opens a section of its own has its own running heads)
 * and every one after the first is set in that same style. Undefined when
 * the sections' own titles serve, or Word could not find them by style.
 */
function chapterTitleStyle(ctx: WriterContext, pieces: readonly Piece[]): string | undefined {
  const titles = pieces.filter((p) => p.block?.type === 'heading' && (p.block.level ?? 1) === 1).slice(1);
  if (!titles.some((p) => !p.start)) return undefined;
  const styles = new Set(titles.map((p) => titleParagraphStyle(p.xml)));
  const [only] = styles;
  return styles.size === 1 && only ? ctx.styles.nameOf(only) : undefined;
}

/**
 * The chapter's body as sections: pieces grouped by the column layout they
 * ask for and the page breaks of their headings. Every section but the
 * last is closed by a section-break paragraph; the last by `w:sectPr` at
 * the end of the body (`last`) or by a paragraph carrying it.
 */
export function chapterSections(ctx: WriterContext, geo: PageGeometry, index: number, pieces: readonly Piece[], last: boolean): string {
  const columns = geo.cols.includes('w:num=');
  // `block`: the section's first block (`leads`: written first in it).
  type Section = { start: SectionStart; oneColumn: boolean; parts: string[]; block?: ContentBlock; leads?: boolean };
  const sections: Section[] = [];
  let after: Piece | undefined;
  for (const piece of pieces) {
    if (!piece.xml) continue;
    // What follows a heading that fills its page starts the next one.
    const p = !piece.start && headingFillsPage(ctx, after?.block) ? { ...piece, start: 'nextPage' as const } : piece;
    after = piece;
    const oneColumn = columns && !!p.span;
    const cur = sections[sections.length - 1];
    const block = p.block ? { block: p.block, leads: true } : {};
    if (!cur) {
      // The chapter's own start already opens the page.
      sections.push({ start: 'chapter', oneColumn, parts: [p.xml], ...block });
      continue;
    }
    if (p.start) sections.push({ start: p.start, oneColumn, parts: [p.xml], ...block });
    else if (cur.oneColumn !== oneColumn) sections.push({ start: 'continuous', oneColumn, parts: [p.xml], ...block });
    else {
      cur.parts.push(p.xml);
      if (!cur.block && p.block) cur.block = p.block;
    }
  }
  if (!sections.length) sections.push({ start: 'chapter', oneColumn: false, parts: [] });
  const titleStyle = chapterTitleStyle(ctx, pieces);
  const balancing = ctx.resolved.headings.balancing;
  const levels = columns && balancing.enabled && balancing.trailing;
  let xml = '';
  sections.forEach((s, i) => {
    const sect = sectionXml(ctx, geo, index, { start: s.start, oneColumn: s.oneColumn, first: i === 0, ...(s.block ? { block: s.block, leads: !!s.leads } : {}), ...(titleStyle ? { titleStyle } : {}) });
    let body = joinBlocks(s.parts);
    // Columns that close before a new page (the chapter's end, or a heading
    // that opens one) end level, as the engine cuts a closing band: Word
    // balances a section's columns only above a continuous break, so an
    // empty one-column section follows them on their page.
    const next = sections[i + 1];
    if (levels && !s.oneColumn && (!next || next.start !== 'continuous')) {
      body += sectionBreak(sect);
      const level = sectionXml(ctx, geo, index, { start: 'continuous', oneColumn: true, ...(titleStyle ? { titleStyle } : {}) });
      if (next || !last) xml += body + sectionBreak(level);
      else xml += body + sectionBreak() + level;
      return;
    }
    if (next) xml += body + sectionBreak(sect);
    else xml += last ? body + sect : `${body}<w:p>${pPr({ sectPr: sect })}</w:p>`;
  });
  return xml;
}
