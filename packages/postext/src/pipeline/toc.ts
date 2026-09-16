/**
 * `:::toc` — the table of contents. The directive expands, before layout,
 * into ordinary content blocks (one per listed heading, one per part
 * divider) that flow through the column machinery like paragraphs: they
 * break across columns and pages, snap to the grid and map clicks back to
 * the directive line. Measurement is special: an entry is its title (with
 * a right-aligned number in a column of its own), a leader and the page
 * label on its last line, and an optional subtitle line (the chapter
 * authors) under it; a part row is an empty block of a fixed height whose
 * design `buildHeadersAndFooters` lays out from `toc.parts.design`.
 */

import type { ContentBlock, InlineSpan, TocBlockInfo } from '../parse';
import type { OutlineEntry, ResolvedTocEntryStyleConfig } from '../types';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { dimensionToPx } from '../units';
import { buildFontString, measureRichBlock, measureTextWidth } from '../measure';
import type { ResolvedConfig } from '../vdt';
import type { BlockStyle } from './styles';
import type { BlockMeasureContext, MeasuredContentBlock } from './measureContentBlock';
import type { ListBulletStyle } from './lists';
import { stampSourceRanges } from './buildHelpers';

/** The content blocks with every `:::toc` directive replaced by the blocks
 *  of the contents it prints. Without an outline (no directive) the input
 *  is returned as is. */
export function expandTocDirectives(
  blocks: readonly ContentBlock[],
  outline: readonly OutlineEntry[] | undefined,
  resolved: ResolvedConfig,
): ContentBlock[] {
  if (!outline || !blocks.some((b) => b.type === 'directive' && b.directiveName === 'toc')) {
    return blocks as ContentBlock[];
  }
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    if (b.type !== 'directive' || b.directiveName !== 'toc') { out.push(b); continue; }
    out.push(...tocBlocksFor(b, outline, resolved));
  }
  return out;
}

function tocBlocksFor(directive: ContentBlock, outline: readonly OutlineEntry[], resolved: ResolvedConfig): ContentBlock[] {
  const toc = resolved.toc;
  const listedLevels = new Set(toc.levels.map((l) => l.level));
  const out: ContentBlock[] = [];
  const base = { sourceStart: directive.sourceStart, sourceEnd: directive.sourceEnd };
  for (const entry of outline) {
    if (!entry.listed) continue;
    if (entry.kind === 'part') {
      if (!toc.parts.enabled) continue;
      const info: TocBlockInfo = {
        kind: 'part', level: 0, number: entry.number, numbered: entry.numbered, title: entry.title,
        ...(entry.pageLabel !== undefined ? { pageLabel: entry.pageLabel } : {}),
        ...(entry.pageIndex !== undefined ? { pageIndex: entry.pageIndex } : {}),
        ...(entry.palette ? { palette: entry.palette } : {}),
      };
      out.push({ ...base, type: 'paragraph', text: '', spans: [], sourceMap: [], toc: info });
      continue;
    }
    if (!listedLevels.has(entry.level)) continue;
    const text = entry.title;
    const spans: InlineSpan[] = entry.spans && entry.spans.length > 0
      ? entry.spans.map((s) => ({ text: s.text, bold: s.bold, italic: s.italic }))
      : [{ text, bold: false, italic: false }];
    const subtitle = toc.subtitle.enabled ? entry.attrs?.[toc.subtitle.attr]?.trim() : undefined;
    const info: TocBlockInfo = {
      kind: 'entry', level: entry.level, number: entry.number, numbered: entry.numbered,
      ...(entry.pageLabel !== undefined ? { pageLabel: entry.pageLabel } : {}),
      ...(entry.pageIndex !== undefined ? { pageIndex: entry.pageIndex } : {}),
      ...(subtitle ? { subtitle } : {}),
    };
    // Every character maps to the directive line, so a click on the
    // contents lands on `:::toc`.
    out.push({ ...base, type: 'paragraph', text, spans, sourceMap: new Array<number>(text.length).fill(directive.sourceStart), toc: info });
  }
  return out;
}

function lineHeightPxOf(lineHeight: { value: number; unit: string }, fontSizePx: number, dpi: number): number {
  if (lineHeight.unit === 'em' || lineHeight.unit === 'rem') return fontSizePx * lineHeight.value;
  return dimensionToPx(lineHeight as Parameters<typeof dimensionToPx>[0], dpi, fontSizePx);
}

function segmentsOf(line: VDTLine): VDTLineSegment[] {
  if (line.segments && line.segments.length > 0) return line.segments;
  const segs: VDTLineSegment[] = [{ kind: 'text', text: line.text, width: line.bbox.width }];
  line.segments = segs;
  return segs;
}

/** Measure one block of an expanded `:::toc` (see the module header). */
export function measureTocBlock(
  rawBlock: ContentBlock,
  columnWidth: number,
  ctx: BlockMeasureContext,
): MeasuredContentBlock | null {
  const info = rawBlock.toc!;
  const { resolved, bodyOffset } = ctx;
  const toc = resolved.toc;
  const dpi = resolved.page.dpi;
  const bodyFontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const body = resolved.bodyText;

  if (info.kind === 'part') {
    const rowH = dimensionToPx(toc.parts.height, dpi, bodyFontSizePx);
    const style: BlockStyle = {
      fontString: buildFontString(body.fontFamily, bodyFontSizePx, body.fontWeight.toString()),
      fontSizePx: bodyFontSizePx,
      lineHeightPx: rowH,
      color: body.color.hex,
      textAlign: 'left',
      hyphenate: false,
      marginTopPx: dimensionToPx(toc.parts.marginTop, dpi, bodyFontSizePx),
      marginBottomPx: dimensionToPx(toc.parts.marginBottom, dpi, bodyFontSizePx),
      firstLineIndentPx: 0,
      hangingIndent: false,
    };
    const line: VDTLine = {
      text: '', bbox: { x: 0, y: 0, width: columnWidth, height: rowH }, baseline: rowH * 0.7,
      hyphenated: false, segments: [], isLastLine: true,
    };
    const measured = { lines: [line], totalHeight: rowH };
    const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, rawBlock, bodyOffset);
    return {
      kind: { style, vdtType: 'paragraph', contentBlock: rawBlock, bulletXOffsetInColumn: 0, strikethroughText: false },
      contentBlock: rawBlock,
      measured,
      prefixLen,
      absoluteSourceMap,
    };
  }

  // --- Entry -----------------------------------------------------------
  const level = toc.levels.find((l) => l.level === info.level) ?? toc.levels[0]!;
  const entry: ResolvedTocEntryStyleConfig = info.numbered ? level : { ...level, ...toc.unnumbered };
  const fontSizePx = dimensionToPx(entry.fontSize, dpi);
  const lineHeightPx = lineHeightPxOf(entry.lineHeight, fontSizePx, dpi);
  const weight = entry.fontWeight.toString();
  const boldWeight = Math.max(entry.fontWeight, body.boldFontWeight).toString();
  const upright = entry.italic ? 'italic' : 'normal';
  const flipped = entry.italic ? 'normal' : 'italic';
  const fontString = buildFontString(entry.fontFamily, fontSizePx, weight, upright);
  const boldFontString = buildFontString(entry.fontFamily, fontSizePx, boldWeight, upright);
  const italicFontString = buildFontString(entry.fontFamily, fontSizePx, weight, flipped);
  const boldItalicFontString = buildFontString(entry.fontFamily, fontSizePx, boldWeight, flipped);
  const color = entry.color.hex;
  const style: BlockStyle = {
    fontString, boldFontString, italicFontString, boldItalicFontString,
    fontSizePx, lineHeightPx, color, boldColor: color, italicColor: color,
    textAlign: 'left', hyphenate: false,
    marginTopPx: dimensionToPx(entry.marginTop, dpi, fontSizePx),
    marginBottomPx: dimensionToPx(entry.marginBottom, dpi, fontSizePx),
    firstLineIndentPx: 0, hangingIndent: false,
  };

  // Number column (numbered entries): the title starts after it.
  const indentPx = dimensionToPx(entry.indent, dpi, fontSizePx);
  const hasNumber = info.numbered && info.number.length > 0;
  const numberWidthPx = hasNumber ? dimensionToPx(entry.numberWidth, dpi, fontSizePx) : 0;
  const numberGapPx = hasNumber ? dimensionToPx(entry.numberGap, dpi, fontSizePx) : 0;
  const textX = indentPx + numberWidthPx + numberGapPx;
  const availableW = Math.max(1, columnWidth - textX);
  let listBullet: ListBulletStyle | undefined;
  let bulletXOffsetInColumn = 0;
  if (hasNumber) {
    const numberFontSizePx = dimensionToPx(entry.numberFontSize, dpi);
    const numberFont = buildFontString(entry.numberFontFamily, numberFontSizePx, entry.numberFontWeight.toString());
    const numberW = measureTextWidth(info.number, numberFont);
    listBullet = {
      indentPx, bulletText: info.number, bulletFontString: numberFont, bulletColor: entry.numberColor.hex,
      bulletWidthPx: numberWidthPx, gapPx: numberGapPx, hangingIndent: true, itemSpacingPx: 0,
      textFontSizePx: fontSizePx, verticalOffsetPx: 0,
    };
    bulletXOffsetInColumn = indentPx + Math.max(0, numberWidthPx - numberW);
  }

  // Page label + leader on the last title line.
  const label = info.pageLabel ?? '';
  const pn = toc.pageNumber;
  const labelFontSizePx = dimensionToPx(pn.fontSize, dpi);
  const labelFont = buildFontString(pn.fontFamily, labelFontSizePx, pn.fontWeight.toString(), pn.italic ? 'italic' : 'normal');
  const labelColor = pn.color.hex;
  const reservePx = label.length > 0 ? dimensionToPx(pn.width, dpi, fontSizePx) : 0;
  const gapPx = label.length > 0 ? dimensionToPx(toc.leader.gap, dpi, fontSizePx) : 0;
  const labelW = label.length > 0 ? measureTextWidth(label, labelFont) : 0;

  const measureTitle = (maxW: number) => measureRichBlock(
    rawBlock.spans, fontString, boldFontString, italicFontString, boldItalicFontString,
    maxW, lineHeightPx, { textAlign: 'left', hyphenate: false },
  );
  let measured = measureTitle(availableW);
  if (measured.lines.length === 0) return null;
  const lastOf = (lines: VDTLine[]) => lines[lines.length - 1]!;
  if (label.length > 0 && lastOf(measured.lines).bbox.width + gapPx + reservePx > availableW + 0.01) {
    // The label does not fit beside the last line: narrow the measure so
    // the title leaves it room (every line, so wrapped lines stay level).
    const narrowed = measureTitle(Math.max(1, availableW - gapPx - reservePx));
    if (narrowed.lines.length > 0) measured = narrowed;
  }
  const lines = measured.lines;
  if (label.length > 0) {
    const last = lastOf(lines);
    const segs = segmentsOf(last);
    const contentW = segs.reduce((s, seg) => s + seg.width, 0);
    const leaderStart = contentW + gapPx;
    const leaderEnd = availableW - reservePx;
    let x = contentW;
    const pushSpace = (w: number) => { if (w > 0) { segs.push({ kind: 'space', text: ' ', width: w }); x += w; } };
    if (toc.leader.enabled && toc.leader.char.length > 0 && leaderEnd - leaderStart > 0) {
      const unit = measureTextWidth(toc.leader.char, labelFont);
      const n = unit > 0 ? Math.floor((leaderEnd - leaderStart) / unit) : 0;
      if (n > 0) {
        const dots = toc.leader.char.repeat(n);
        const dotsW = measureTextWidth(dots, labelFont);
        pushSpace(leaderEnd - dotsW - x);
        segs.push({ kind: 'text', text: dots, width: dotsW, fontString: labelFont, color: labelColor });
        x += dotsW;
      }
    }
    pushSpace(availableW - labelW - x);
    segs.push({ kind: 'text', text: label, width: labelW, fontString: labelFont, color: labelColor });
    last.text = `${last.text} ${label}`;
    last.bbox.width = availableW;
  }

  // Subtitle line(s) under the title (the chapter authors).
  if (info.subtitle) {
    const sub = toc.subtitle;
    const subSizePx = dimensionToPx(sub.fontSize, dpi);
    const subFont = buildFontString(sub.fontFamily, subSizePx, sub.fontWeight.toString(), sub.italic ? 'italic' : 'normal');
    const subIndentPx = dimensionToPx(sub.indent, dpi, fontSizePx);
    const subMeasured = measureRichBlock(
      [{ text: info.subtitle, bold: false, italic: false }], subFont, subFont, subFont, subFont,
      Math.max(1, availableW - subIndentPx), lineHeightPx, { textAlign: 'left', hyphenate: false },
    );
    for (const line of subMeasured.lines) {
      for (const seg of segmentsOf(line)) {
        if (seg.kind === 'space') continue;
        seg.fontString = subFont;
        seg.color = sub.color.hex;
      }
      line.bbox.x += subIndentPx;
      line.isLastLine = true;
      lines.push(line);
    }
  }
  for (const line of lines) line.bbox.x += textX;
  // Uniform line pitch: the placement loop re-seats every line at the
  // block's line height (`resetLinePositions`).
  const total = lines.length * lineHeightPx;
  const finalMeasured = { lines, totalHeight: total };
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(finalMeasured, rawBlock, rawBlock, bodyOffset);
  return {
    kind: {
      style,
      vdtType: hasNumber ? 'listItem' : 'paragraph',
      contentBlock: rawBlock,
      ...(listBullet ? { listBullet, listDepth: 1, listKind: 'ordered' as const } : {}),
      bulletXOffsetInColumn,
      strikethroughText: false,
    },
    contentBlock: rawBlock,
    measured: finalMeasured,
    prefixLen,
    absoluteSourceMap,
  };
}
