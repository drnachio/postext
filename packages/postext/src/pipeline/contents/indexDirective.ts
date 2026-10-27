/**
 * `:::index` — the back-of-book index (#165). The directive expands, before
 * layout, into ordinary content blocks, one per entry, that flow through
 * the column machinery like paragraphs (the contents do the same, see
 * `toc.ts`). The entries come from the index marks of the book's outline
 * (`OutlineEntry.indexMark`), each with the page it landed on: grouped by
 * term and sub-term, sorted in the document language's alphabetical order,
 * their pages merged into ranges. An entry that opens a new letter carries
 * the letter head in its own block, so a head never ends a column alone.
 */

import type { ContentBlock, InlineSpan } from '../../parse/index.js';
import type { OutlineEntry } from '../../types.js';
import type { ResolvedConfig, ContentWarning, VDTLine, VDTLineSegment, VDTDocument, VDTBlock } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { buildFontString, measureRichBlock } from '../../measure/index.js';
import { linkSegments } from '../../measure/links.js';
import type { BlockStyle } from '../styles.js';
import type { BlockMeasureContext, MeasuredContentBlock } from '../blocks/measureContentBlock.js';
import { stampSourceRanges } from '../blocks/buildHelpers.js';
import { bookTitlesAsConfigured } from '../text/annotations.js';
import { indexBlocksFor } from './indexDirective/blocks.js';
import { PAGE_HREF } from './indexDirective/tree.js';

export { indexLocale, rangeEnd } from './indexDirective/tree.js';

/** The content blocks with every `:::index` directive replaced by the
 *  entries it prints, and the warnings the index raised. Without an
 *  outline (no directive) the input is returned as is. */
export function expandIndexDirectives(
  blocks: readonly ContentBlock[],
  outline: readonly OutlineEntry[] | undefined,
  resolved: ResolvedConfig,
): { blocks: ContentBlock[]; warnings: ContentWarning[] } {
  if (!outline || !blocks.some((b) => b.type === 'directive' && b.directiveName === 'index')) {
    return { blocks: blocks as ContentBlock[], warnings: [] };
  }
  const out: ContentBlock[] = [];
  const warnings: ContentWarning[] = [];
  for (const b of blocks) {
    if (b.type !== 'directive' || b.directiveName !== 'index') { out.push(b); continue; }
    const expanded = indexBlocksFor(b, outline, resolved);
    out.push(...expanded.blocks);
    for (const w of expanded.warnings) warnings.push({ ...w, sourceStart: b.sourceStart, sourceEnd: b.sourceEnd });
  }
  return { blocks: out, warnings };
}

function lineHeightPxOf(lineHeight: { value: number; unit: string }, fontSizePx: number, dpi: number): number {
  if (lineHeight.unit === 'em' || lineHeight.unit === 'rem') return fontSizePx * lineHeight.value;
  return dimensionToPx(lineHeight as Parameters<typeof dimensionToPx>[0], dpi, fontSizePx);
}

/** The segments of a line, made from its text when it has none. */
function segmentsOf(line: VDTLine): VDTLineSegment[] {
  if (line.segments && line.segments.length > 0) return line.segments;
  const segs: VDTLineSegment[] = [{ kind: 'text', text: line.text, width: line.bbox.width }];
  line.segments = segs;
  return segs;
}

/** Page links: the page numbers' link targets become `pageLink`. */
function pageLinks(lines: VDTLine[]): VDTLine[] {
  return lines.map((line) => {
    if (!line.segments?.some((s) => s.href?.startsWith(PAGE_HREF))) return line;
    return {
      ...line,
      segments: line.segments.map((seg) => {
        if (!seg.href?.startsWith(PAGE_HREF)) return seg;
        const { href, ...rest } = seg;
        return { ...rest, pageLink: Number(href.slice(PAGE_HREF.length)) };
      }),
    };
  });
}

/** Measure one block of an expanded `:::index` (see the module header). */
export function measureIndexBlock(
  rawBlock: ContentBlock,
  columnWidth: number,
  ctx: BlockMeasureContext,
): MeasuredContentBlock | null {
  const info = rawBlock.index!;
  const { resolved, bodyOffset } = ctx;
  const cfg = resolved.index;
  const dpi = resolved.page.dpi;
  const body = resolved.bodyText;
  const fontSizePx = dimensionToPx(cfg.fontSize, dpi);
  const lineHeightPx = lineHeightPxOf(cfg.lineHeight, fontSizePx, dpi);
  const weight = cfg.fontWeight.toString();
  const boldWeight = Math.max(cfg.fontWeight, body.boldFontWeight).toString();
  const fontString = buildFontString(cfg.fontFamily, fontSizePx, weight);
  const boldFontString = buildFontString(cfg.fontFamily, fontSizePx, boldWeight);
  const italicFontString = buildFontString(cfg.fontFamily, fontSizePx, weight, 'italic');
  const boldItalicFontString = buildFontString(cfg.fontFamily, fontSizePx, boldWeight, 'italic');
  const color = cfg.color.hex;
  const topLevel = info.leads?.[0]?.level ?? info.level;
  const marginTop = info.groupStart ? cfg.groups.marginTop : topLevel === 0 ? cfg.entrySpacing : undefined;
  const style: BlockStyle = {
    fontString, boldFontString, italicFontString, boldItalicFontString,
    fontSizePx, lineHeightPx, color, boldColor: color, italicColor: color,
    textAlign: 'left', hyphenate: false,
    marginTopPx: marginTop ? dimensionToPx(marginTop, dpi, fontSizePx) : 0,
    marginBottomPx: 0,
    firstLineIndentPx: 0, hangingIndent: false,
  };

  const turnoverPx = dimensionToPx(cfg.turnoverIndent, dpi, fontSizePx);
  /** The lines of one entry at its level's indent, turnover lines hung. */
  const entryLines = (written: InlineSpan[], level: number): VDTLine[] => {
    // A book title in a term takes the document's book-title mark (#193).
    const spans = bookTitlesAsConfigured(written, resolved.cjk);
    const indentPx = level * dimensionToPx(cfg.indent, dpi, fontSizePx);
    const measured = measureRichBlock(
      spans, fontString, boldFontString, italicFontString, boldItalicFontString,
      Math.max(1, columnWidth - indentPx), lineHeightPx,
      { textAlign: 'left', hyphenate: false, firstLineIndentPx: turnoverPx, hangingIndent: true },
    );
    const out = pageLinks(linkSegments(measured.lines, spans));
    for (const line of out) line.bbox.x += indentPx;
    // Where the entry starts, for renditions that set it as text of its
    // own (`VDTLine.indexLevel`).
    if (out[0]) out[0].indexLevel = level;
    return out;
  };
  const own = entryLines(rawBlock.spans, info.level);
  if (own.length === 0) return null;
  // The entries this one's first line heads (see `leads`), above it.
  const lines = [...(info.leads ?? []).flatMap((lead) => entryLines(lead.spans, lead.level)), ...own];

  if (info.group) {
    // The letter head: a line of its own above the entry, in the head's
    // face, on the entry's line pitch.
    const g = cfg.groups;
    const headSizePx = dimensionToPx(g.fontSize, dpi);
    const headFont = buildFontString(g.fontFamily, headSizePx, g.fontWeight.toString(), g.italic ? 'italic' : 'normal');
    const head = measureRichBlock(
      [{ text: info.group, bold: false, italic: false }], headFont, headFont, headFont, headFont,
      Math.max(1, columnWidth), lineHeightPx, { textAlign: 'left', hyphenate: false },
    );
    const headLine = head.lines[0];
    if (headLine) {
      for (const seg of segmentsOf(headLine)) {
        if (seg.kind === 'space') continue;
        seg.fontString = headFont;
        seg.color = g.color.hex;
      }
      headLine.isLastLine = false;
      lines.unshift(headLine);
    }
  }
  // Uniform line pitch: the placement loop re-seats every line at the
  // block's line height (`resetLinePositions`).
  const finalMeasured = { lines, totalHeight: lines.length * lineHeightPx };
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(finalMeasured, rawBlock, rawBlock, bodyOffset);
  return {
    kind: { style, vdtType: 'paragraph', contentBlock: rawBlock, bulletXOffsetInColumn: 0, strikethroughText: false },
    contentBlock: rawBlock,
    measured: finalMeasured,
    prefixLen,
    absoluteSourceMap,
  };
}

/**
 * The page of each index mark of `blocks` (the parsed markdown body) in the
 * laid-out `doc`: the page of the line holding the character the mark is
 * attached to (`IndexMark.anchor`), found by the lines' source ranges.
 * When no line holds it (the character set by a design, not a line), the
 * mark takes the nearest line before it (`attach: 'before'`) or after it.
 * Undefined when the document has no marks.
 */
export function locateIndexMarks(
  doc: VDTDocument,
  blocks: readonly ContentBlock[],
  bodyOffset: number,
): { sourceStart: number; pageIndex: number }[] | undefined {
  const marks = blocks.flatMap((b) => b.indexMarks ?? []);
  if (marks.length === 0) return undefined;
  const lines: { start: number; end: number; page: number }[] = [];
  const add = (b: VDTBlock): void => {
    // The lines of a story that came from another chapter are offsets in
    // that chapter's file (#988): its marks are located by `carriedOutline`.
    if (b.pageIndex < 0 || b.hidden || b.sourceChapter !== undefined) return;
    for (const l of b.lines) {
      if (l.sourceStart !== undefined && l.sourceEnd !== undefined) lines.push({ start: l.sourceStart, end: l.sourceEnd, page: b.pageIndex });
    }
  };
  for (const b of doc.blocks) add(b);
  for (const page of doc.pages) for (const f of page.floats ?? []) add(f);
  if (lines.length === 0) return [];
  lines.sort((a, b) => a.start - b.start || a.page - b.page);
  /** Index of the last line starting at or before `at` (-1: none). */
  const lastAtOrBefore = (at: number): number => {
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid]!.start <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  };
  const out: { sourceStart: number; pageIndex: number }[] = [];
  for (const mark of marks) {
    if (mark.anchor < 0) continue;
    const at = mark.anchor + bodyOffset;
    const i = lastAtOrBefore(at);
    // A line holding the character: the first page one does.
    let page: number | undefined;
    for (let j = i; j >= 0 && j > i - 64; j--) {
      const line = lines[j]!;
      if (at >= line.start && at < line.end && (page === undefined || line.page < page)) page = line.page;
    }
    if (page === undefined) {
      const line = mark.attach === 'before' ? lines[i] ?? lines[i + 1] : lines[i + 1] ?? lines[i];
      page = line?.page;
    }
    if (page !== undefined) out.push({ sourceStart: mark.sourceStart, pageIndex: page });
  }
  return out;
}
