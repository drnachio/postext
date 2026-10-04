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

import { flowTextWidth } from '../measure/vertical';
import type { ContentBlock, InlineSpan, TocBlockInfo } from '../parse';
import type { OutlineEntry, ResolvedTocEntryStyleConfig } from '../types';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { dimensionToPx } from '../units';
import { buildFontString, measureRichBlock } from '../measure';
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
  let partRows = 0;
  // The numbers of each level's numbered entries, for the number column.
  const levelNumbers = new Map<number, string[]>();
  for (const entry of outline) {
    if (!entry.listed || entry.kind === 'part' || !listedLevels.has(entry.level) || !entry.numbered || !entry.number) continue;
    const numbers = levelNumbers.get(entry.level);
    if (numbers) numbers.push(entry.number);
    else levelNumbers.set(entry.level, [entry.number]);
  }
  for (const entry of outline) {
    if (!entry.listed) continue;
    if (entry.kind === 'part') {
      if (!toc.parts.enabled) continue;
      // Every part but the first opens a fresh page of the contents.
      if (toc.parts.breakBefore && partRows > 0) {
        out.push({ ...base, type: 'directive', text: '', spans: [], sourceMap: [], directiveName: 'pagebreak', directiveAttrs: {} });
      }
      partRows++;
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
      ...(entry.numbered && entry.number ? { levelNumbers: levelNumbers.get(entry.level) } : {}),
    };
    // Every character maps to the directive line, so a click on the
    // contents lands on `:::toc`.
    out.push({ ...base, type: 'paragraph', text, spans, sourceMap: new Array<number>(text.length).fill(directive.sourceStart), toc: info });
  }
  return out;
}

/** The widest of a level's numbers in `font`, memoised per array and
 *  font (every entry of the level asks with the same array). */
const widestCache = new WeakMap<readonly string[], Map<string, number>>();
function widestNumber(numbers: readonly string[], font: string): number {
  let byFont = widestCache.get(numbers);
  if (!byFont) {
    byFont = new Map();
    widestCache.set(numbers, byFont);
  }
  let widest = byFont.get(font);
  if (widest === undefined) {
    widest = 0;
    for (const n of numbers) widest = Math.max(widest, flowTextWidth(n, font));
    byFont.set(font, widest);
  }
  return widest;
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

/**
 * The leader run for `room` px: the leader character repeated as often as
 * one character's width allows, or fewer times when the run, measured as a
 * whole, is wider than the room. A face may kern the character against
 * itself: Public Sans 700 sets one full stop 6.74 px wide at 25 px and a
 * run of thirty at 7.58 px a dot, and a leader counted from one dot then ran
 * over the gap into the page number (EF-148). Null when not one fits.
 */
function fitLeader(char: string, font: string, room: number): { text: string; width: number } | null {
  const unit = flowTextWidth(char, font);
  const most = unit > 0 ? Math.floor(room / unit) : 0;
  if (most <= 0) return null;
  // Rounding in the width sums is not an overrun.
  const fits = (width: number) => width <= room + 0.01;
  const widthOf = (n: number) => flowTextWidth(char.repeat(n), font);
  let width = widthOf(most);
  if (fits(width)) return { text: char.repeat(most), width };
  // The longest shorter run that fits (a run widens with every character).
  let lo = 0;
  let hi = most - 1;
  let loWidth = 0;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    width = widthOf(mid);
    if (fits(width)) {
      lo = mid;
      loWidth = width;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? { text: char.repeat(lo), width: loWidth } : null;
}

/**
 * The visual order (`VDTLine.order`) of a contents row: its title's
 * `titleCount` segments in their own visual order (`titleOrder`, absent for
 * 0 … n − 1), then the leader and the page label. The row is laid out in the
 * document's direction, not by bidi over its text: in a right-to-left
 * document the label stands at the row's left and the title at its right,
 * even when the title is a Latin one, whose letters alone would make the
 * whole row one left-to-right run and send the page number to the right.
 * The mirror pass (`mirrorFrame.ts`) then turns the order for the page's
 * mirrored flow. Undefined when the order is the segments' own.
 */
export function tocRowOrder(titleOrder: readonly number[] | undefined, titleCount: number, total: number, rtl: boolean): number[] | undefined {
  const title = titleOrder && titleOrder.length === titleCount ? [...titleOrder] : Array.from({ length: titleCount }, (_, i) => i);
  const tail = Array.from({ length: total - titleCount }, (_, i) => titleCount + i);
  const order = rtl ? [...tail.reverse(), ...title] : [...title, ...tail];
  return order.every((v, i) => v === i) ? undefined : order;
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

  // Number column (numbered entries): the title starts after it. A label
  // wider than the column (`الفصل {1:ordinal}` → الفصل الحادي عشر, or a
  // `Chapter {1}`) widens it to the level's widest number, so every title
  // of the level starts at one place and none is printed over; numbers
  // that fit leave the configured width as it is.
  const indentPx = dimensionToPx(entry.indent, dpi, fontSizePx);
  const hasNumber = info.numbered && info.number.length > 0;
  const numberFont = hasNumber
    ? buildFontString(entry.numberFontFamily, dimensionToPx(entry.numberFontSize, dpi), entry.numberFontWeight.toString())
    : '';
  const numberWidthPx = hasNumber
    ? Math.max(dimensionToPx(entry.numberWidth, dpi, fontSizePx), widestNumber(info.levelNumbers ?? [info.number], numberFont))
    : 0;
  const numberGapPx = hasNumber ? dimensionToPx(entry.numberGap, dpi, fontSizePx) : 0;
  const textX = indentPx + numberWidthPx + numberGapPx;
  const availableW = Math.max(1, columnWidth - textX);
  let listBullet: ListBulletStyle | undefined;
  let bulletXOffsetInColumn = 0;
  if (hasNumber) {
    const numberW = flowTextWidth(info.number, numberFont);
    listBullet = {
      indentPx, bulletText: info.number, bulletFontString: numberFont, bulletColor: entry.numberColor.hex,
      bulletWidthPx: numberWidthPx, gapPx: numberGapPx, hangingIndent: true, itemSpacingPx: 0,
      textFontSizePx: fontSizePx, verticalOffsetPx: 0,
      // The number is text beside the title: on its baseline (EF-58).
      onBaseline: true,
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
  const labelW = label.length > 0 ? flowTextWidth(label, labelFont) : 0;

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
    const titleCount = segs.length;
    const contentW = segs.reduce((s, seg) => s + seg.width, 0);
    const leaderStart = contentW + gapPx;
    const leaderEnd = availableW - reservePx;
    let x = contentW;
    const pushSpace = (w: number) => { if (w > 0) { segs.push({ kind: 'space', text: ' ', width: w }); x += w; } };
    if (toc.leader.enabled && toc.leader.char.length > 0 && leaderEnd - leaderStart > 0) {
      const leader = fitLeader(toc.leader.char, labelFont, leaderEnd - leaderStart);
      if (leader) {
        const { text: dots, width: dotsW } = leader;
        pushSpace(leaderEnd - dotsW - x);
        segs.push({ kind: 'text', text: dots, width: dotsW, fontString: labelFont, color: labelColor });
        x += dotsW;
      }
    }
    pushSpace(availableW - labelW - x);
    segs.push({ kind: 'text', text: label, width: labelW, fontString: labelFont, color: labelColor });
    last.text = `${last.text} ${label}`;
    last.bbox.width = availableW;
    const order = tocRowOrder(last.order, titleCount, segs.length, resolved.direction === 'rtl' && resolved.layout.writingMode !== 'vertical-rl');
    if (order) last.order = order;
    else delete last.order;
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
