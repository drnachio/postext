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

import { flowTextWidth, measuringVertically } from '../../measure/vertical.js';
import { getMeasureArabicNumbers } from '../../measure/bidiLines.js';
import { onTextWidthCacheClear, measureLanguageKey } from '../../measure/canvas.js';
import { fitLeader } from '../../measure/leader.js';
import { faceReadsScript, getMeasureScriptContext, isLetterless, scriptTextWidth, type ScriptContext } from '../../measure/script.js';
import { measuresRunsAsPainted } from '../../design/bidiText.js';
import type { ContentBlock, InlineSpan, TocBlockInfo, TocGroupInfo } from '../../parse/index.js';
import { suffixJoiner } from '../../parse/inlineFormatting.js';
import { parseTocGroupHead } from '../../defaults/toc.js';
import type { OutlineEntry, ResolvedTocEntryStyleConfig, TocGroupHead } from '../../types.js';
import type { VDTBlock, VDTLine, VDTLineSegment } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { buildFontString, measureRichBlock } from '../../measure/index.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { BlockStyle } from '../styles.js';
import type { BlockMeasureContext, MeasuredContentBlock } from '../blocks/measureContentBlock.js';
import { markerTextWidth, type ListBulletStyle } from '../text/lists.js';
import { stampSourceRanges } from '../blocks/buildHelpers.js';
import { resolvedDirection } from '../config.js';

/** The content blocks with every `:::toc` directive replaced by the blocks
 *  of the contents it prints. Without an outline (no directive) the input
 *  is returned as is. */
/** The script a leader of `char` is set in (#725): the document's
 *  language's, when the leader has no letter and `font` draws its marks by
 *  script; undefined for every other leader, set as it always was. */
function leaderScriptOf(char: string, font: string): ScriptContext | undefined {
  const state = getMeasureScriptContext();
  // A leader with spaces in it is several words to the browser, each
  // shaped alone: left as it was.
  if (!state.enabled || state.script === undefined || /\s/u.test(char) || !isLetterless(char)) return undefined;
  return faceReadsScript(font) ? state.script : undefined;
}

export function expandTocDirectives(
  blocks: readonly ContentBlock[],
  outline: readonly OutlineEntry[] | undefined,
  resolved: ResolvedConfig,
): ContentBlock[] {
  if (!outline || !blocks.some((b) => b.type === 'directive' && b.directiveName === 'toc')) {
    return blocks as ContentBlock[];
  }
  const out: ContentBlock[] = [];
  // Block numbers run on across the contents of the document (#850).
  const groupIds = { next: 0 };
  for (const b of blocks) {
    if (b.type !== 'directive' || b.directiveName !== 'toc') { out.push(b); continue; }
    out.push(...tocBlocksFor(b, outline, resolved, groupIds));
  }
  return out;
}

/** What a placed block of the contents carries for the backends and the
 *  design pass: the page its entry links to, or its part row's values
 *  (the row's design is laid out from `toc.parts.design`). The flow
 *  (`build.ts`) and a frame that holds the contents (`calloutLayout.ts`,
 *  #983) stamp the same fields. */
export function tocBlockStamps(raw: ContentBlock): Pick<VDTBlock, 'tocEntry' | 'tocPart'> {
  const info = raw.toc;
  if (!info) return {};
  const continued = info.group?.role === 'continuation' ? { continued: true as const } : {};
  if (info.kind === 'entry') {
    return { tocEntry: { ...(info.pageIndex !== undefined ? { pageIndex: info.pageIndex } : {}), ...(info.headingSource !== undefined ? { headingSource: info.headingSource } : {}), ...continued } };
  }
  return {
    tocPart: {
      ...continued,
      number: info.number,
      title: info.title ?? '',
      pageLabel: info.pageLabel ?? '',
      ...(info.palette ? { palette: info.palette } : {}),
      ...(info.pageIndex !== undefined ? { pageIndex: info.pageIndex } : {}),
    },
  };
}

/** The heading levels a `:::toc{levels="…"}` lists (#850): a range
 *  (`"1-2"`), a single level (`"2"`) or a list of either (`"1,3"`), levels
 *  1 to 6. Undefined when the attribute is absent or names no level: the
 *  levels of `toc.levels` are listed. */
export function parseTocLevelsAttr(value: string | undefined): Set<number> | undefined {
  if (value === undefined) return undefined;
  const out = new Set<number>();
  for (const piece of value.split(/[,\s]+/u)) {
    const m = /^([1-6])(?:\s*[-–]\s*([1-6]))?$/u.exec(piece.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    for (let l = Math.min(a, b); l <= Math.max(a, b); l++) out.add(l);
  }
  return out.size > 0 ? out : undefined;
}

/** What heads the blocks a contents keeps together (#850): its
 *  directive's `keep` (`"part"`, `"1"`…`"6"`, `"none"`), else
 *  `toc.groups.head` when `toc.groups.keepTogether` is on. Undefined: the
 *  contents keeps nothing together. */
export function tocKeepOf(attrs: Readonly<Record<string, string>> | undefined, resolved: ResolvedConfig): TocGroupHead | undefined {
  const groups = resolved.toc.groups;
  const keep = attrs?.keep?.trim().toLowerCase();
  if (keep !== undefined && keep.length > 0) {
    if (keep === 'none' || keep === 'false' || keep === 'off') return undefined;
    return parseTocGroupHead(keep) ?? (groups.keepTogether ? groups.head : undefined);
  }
  return groups.keepTogether ? groups.head : undefined;
}

/** One row of an expanded contents, before its blocks are grouped. */
interface TocRow {
  block: ContentBlock;
  /** `0` for a part row, the heading level for an entry; undefined for a
   *  page break between parts. */
  rank?: number;
}

function tocBlocksFor(
  directive: ContentBlock,
  outline: readonly OutlineEntry[],
  resolved: ResolvedConfig,
  groupIds: { next: number },
): ContentBlock[] {
  const toc = resolved.toc;
  const attrs = directive.directiveAttrs;
  // `levels="1-2"` lists those heading levels, each in its own style when
  // `toc.levels` gives one (the nearest level above it otherwise).
  const listedLevels = parseTocLevelsAttr(attrs?.levels) ?? new Set(toc.levels.map((l) => l.level));
  const rows: TocRow[] = [];
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
      const breaks = toc.parts.breakBefore && partRows > 0;
      if (breaks) {
        rows.push({ block: { ...base, type: 'directive', text: '', spans: [], sourceMap: [], directiveName: 'pagebreak', directiveAttrs: {} } });
      }
      partRows++;
      const info: TocBlockInfo = {
        kind: 'part', level: 0, number: entry.number, numbered: entry.numbered, title: entry.title,
        ...(entry.pageLabel !== undefined ? { pageLabel: entry.pageLabel } : {}),
        ...(entry.pageIndex !== undefined ? { pageIndex: entry.pageIndex } : {}),
        ...(entry.palette ? { palette: entry.palette } : {}),
        ...(breaks ? { breakBefore: true as const } : {}),
      };
      rows.push({ block: { ...base, type: 'paragraph', text: '', spans: [], sourceMap: [], toc: info }, rank: 0 });
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
      ...(entry.headingSource !== undefined ? { headingSource: entry.headingSource } : {}),
    };
    // Every character maps to the directive line, so a click on the
    // contents lands on `:::toc`.
    rows.push({ block: { ...base, type: 'paragraph', text, spans, sourceMap: new Array<number>(text.length).fill(directive.sourceStart), toc: info }, rank: entry.level });
  }
  const keep = tocKeepOf(attrs, resolved);
  return keep === undefined ? rows.map((r) => r.block) : groupTocRows(rows, keep === 'part' ? 0 : keep, resolved, groupIds);
}

/**
 * The rows of a contents with its blocks marked (#850): a head row (rank
 * `head`: `0` a part row, else an entry of that level) and every row under
 * it down to the next row of the same or a higher rank. A part row right
 * above a heading head goes with its block, as its first row. With
 * `toc.groups.continuation.enabled`, a repeat of the head row with the
 * continuation mark stands before every entry under it: the layout sets
 * it only where a cut block goes on in a fresh column, and skips it
 * everywhere else. A head with nothing under it makes no block.
 */
function groupTocRows(rows: readonly TocRow[], head: number, resolved: ResolvedConfig, groupIds: { next: number }): ContentBlock[] {
  const groups = resolved.toc.groups;
  // Each block: the index of its first row, its head row, its last row.
  const spans: { first: number; head: number; last: number }[] = [];
  let open: { first: number; head: number; last: number } | undefined;
  for (let i = 0; i < rows.length; i++) {
    const rank = rows[i]!.rank;
    if (rank === undefined) continue;
    if (rank === head) {
      if (open && open.last > open.head) spans.push(open);
      const prev = i > 0 ? rows[i - 1] : undefined;
      // A part row right above a heading head opens the block with it.
      const lead = head > 0 && prev?.rank === 0 ? i - 1 : i;
      open = { first: lead, head: i, last: i };
    } else if (rank < head) {
      if (open && open.last > open.head) spans.push(open);
      open = undefined;
    } else if (open) {
      open.last = i;
    }
  }
  if (open && open.last > open.head) spans.push(open);
  const byRow = new Map<number, { id: number; span: { first: number; head: number; last: number } }>();
  for (const span of spans) {
    const id = groupIds.next++;
    for (let i = span.first; i <= span.last; i++) byRow.set(i, { id, span });
  }
  const mark = groups.continuation.mark.trim();
  const out: ContentBlock[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const at = byRow.get(i);
    if (!at || !row.block.toc) { out.push(row.block); continue; }
    const headBlock = rows[at.span.head]!.block;
    const title = headBlock.toc!.kind === 'part' ? (headBlock.toc!.title ?? '') : headBlock.text;
    const group: TocGroupInfo = {
      id: at.id,
      role: i === at.span.head ? 'head' : 'member',
      ...(i === at.span.first ? { lead: true as const } : {}),
      minEntries: groups.minEntriesAfterHead,
      title,
    };
    // The repeated head row, before each entry under the head.
    if (groups.continuation.enabled && i > at.span.head && row.rank !== 0) {
      out.push(continuationRow(headBlock, mark, { ...group, role: 'continuation' }));
    }
    out.push({ ...row.block, toc: { ...row.block.toc, group } });
  }
  return out;
}

/** The head row `head` repeated at the top of the column a cut block goes
 *  on in: its number and title, then `mark` (in italics, after a space or
 *  solid after a wide character), with no leader and no page label. */
function continuationRow(head: ContentBlock, mark: string, group: TocGroupInfo): ContentBlock {
  const info = head.toc!;
  const rest: TocBlockInfo = { ...info };
  delete rest.pageLabel;
  delete rest.subtitle;
  delete rest.breakBefore;
  if (info.kind === 'part') {
    const title = info.title ?? '';
    const joined = mark.length === 0 ? title : `${title}${title.length > 0 ? suffixJoiner(mark) : ''}${mark}`;
    return { ...head, toc: { ...rest, title: joined, group } };
  }
  if (mark.length === 0) return { ...head, toc: { ...rest, group } };
  const tail = `${head.text.length > 0 ? suffixJoiner(mark) : ''}${mark}`;
  return {
    ...head,
    text: head.text + tail,
    spans: [...head.spans, { text: tail, bold: false, italic: true }],
    sourceMap: [...head.sourceMap, ...new Array<number>(tail.length).fill(head.sourceStart)],
    toc: { ...rest, group },
  };
}

/**
 * The advance of a contents number in `font`. `rtl`: the entry reads right
 * to left, so its number is painted right to left
 * (`VDTBlock.bulletDirection`): the canvas sets it with its context right
 * to left, the HTML in a box of that direction.
 *
 * Measured left to right, the marks at the ends of such a number are runs
 * apart, shaped alone. `«الفصل الأول»` in Markazi Text bold at 28.125 px
 * is 126.17 px wide left to right and 120.32 px as the one right-to-left
 * run the canvas and the HTML set (Chrome 154, in `ar`): the number stood
 * 5.85 px short of the edge of its column. In a document shaped in its own
 * language it is measured in the direction it is painted in (#770,
 * `rtlTextWidth`); one shaped in its host's language keeps the width it
 * had, and so does a number of a vertical page, set in cells.
 */
function numberTextWidth(text: string, font: string, rtl: boolean): number {
  return markerTextWidth(text, font, rtl && !measuringVertically() ? (getMeasureArabicNumbers() ? 'rtl-arabic' : 'rtl') : undefined);
}

/** The widest of a level's numbers in `font`, memoised per array, font
 *  and direction (every entry of the level asks with the same array). */
let widestCache = new WeakMap<readonly string[], Map<string, number>>();
// Widths: dropped with the engine's when faces change (#629).
onTextWidthCacheClear(() => {
  widestCache = new WeakMap();
});
function widestNumber(numbers: readonly string[], font: string, rtl: boolean): number {
  let byFont = widestCache.get(numbers);
  if (!byFont) {
    byFont = new Map();
    widestCache.set(numbers, byFont);
  }
  // The widths of a language (#764), in the direction they are painted in.
  const key = measureLanguageKey() + (rtl && measuresRunsAsPainted() ? 'rtl\x00' : '') + font;
  let widest = byFont.get(key);
  if (widest === undefined) {
    widest = 0;
    for (const n of numbers) widest = Math.max(widest, numberTextWidth(n, font, rtl));
    byFont.set(key, widest);
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
  // A level `toc.levels` does not style (one a `levels="1-3"` lists) takes
  // the style of the nearest level above it.
  const level = toc.levels.find((l) => l.level === info.level)
    ?? toc.levels.filter((l) => l.level < info.level).sort((a, b) => b.level - a.level)[0]
    ?? toc.levels[0]!;
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
  // The direction the number is painted in (`directListMarker`).
  const numberRtl = (rawBlock.direction ?? resolvedDirection(resolved)) === 'rtl';
  const numberWidthPx = hasNumber
    ? Math.max(dimensionToPx(entry.numberWidth, dpi, fontSizePx), widestNumber(info.levelNumbers ?? [info.number], numberFont, numberRtl))
    : 0;
  const numberGapPx = hasNumber ? dimensionToPx(entry.numberGap, dpi, fontSizePx) : 0;
  const textX = indentPx + numberWidthPx + numberGapPx;
  const availableW = Math.max(1, columnWidth - textX);
  let listBullet: ListBulletStyle | undefined;
  let bulletXOffsetInColumn = 0;
  if (hasNumber) {
    const numberW = numberTextWidth(info.number, numberFont, numberRtl);
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
  // The leader's own face (#1121), field by field over the page number's.
  const leaderFace = toc.leader;
  const leaderFont = leaderFace.fontFamily !== undefined || leaderFace.fontSize !== undefined || leaderFace.fontWeight !== undefined
    ? buildFontString(
      leaderFace.fontFamily ?? pn.fontFamily,
      leaderFace.fontSize ? dimensionToPx(leaderFace.fontSize, dpi, labelFontSizePx) : labelFontSizePx,
      (leaderFace.fontWeight ?? pn.fontWeight).toString(),
      pn.italic ? 'italic' : 'normal',
    )
    : labelFont;
  const leaderColor = leaderFace.color?.hex ?? labelColor;
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
      // A leader of dots has no letter: in a face that draws its stop by
      // script it is measured, and painted, in the script of the document's
      // language (#725), where each browser shaped it its own way and one
      // counted half as many dots again as another.
      const leaderScript = leaderScriptOf(toc.leader.char, leaderFont);
      const leader = fitLeader(toc.leader.char, leaderEnd - leaderStart, (run) => (leaderScript ? scriptTextWidth(run, leaderFont, leaderScript, false) : flowTextWidth(run, leaderFont)));
      if (leader) {
        const { text: dots, width: dotsW } = leader;
        pushSpace(leaderEnd - dotsW - x);
        segs.push({ kind: 'text', text: dots, width: dotsW, fontString: leaderFont, color: leaderColor, leader: 'text', ...(leaderScript ? { scriptContext: leaderScript } : {}) });
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
