/**
 * Pure helpers used by `buildDocument`. Extracted here purely to keep the
 * main pipeline function readable; no behavior changes.
 */

import type { ContentBlock } from '../parse';
import { spaceDirectiveLines } from '../parse/attrs';
import { dimensionToPx } from '../units';
import {
  createBoundingBox,
  type VDTBlock,
  type BoundingBox,
  type ResolvedConfig,
} from '../vdt';
import type { BlockStyle } from './styles';
import type { MeasuredBlock } from '../measure';
import { NO_BREAK_SPACES } from '../measure/spaces';
import { renderMath, isMathReady, noteMathWithoutEngine } from '../math';

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

export interface PageMetrics {
  trimWidthPx: number;
  trimHeightPx: number;
  pageWidthPx: number;
  pageHeightPx: number;
  trimOffset: number;
  /** Content area of an odd (recto) page — the trim box inset by the
   *  margins as written. Use `contentAreaForPage` for a specific page so
   *  mirrored margins swap on even pages. */
  contentArea: BoundingBox;
  /** The trim box (the final page after cutting) in page px. */
  trimBox: BoundingBox;
  /** The trim box expanded by `cutLines.bleed` on every side when cut lines
   *  are enabled; equals `trimBox` otherwise. Design elements anchored to
   *  `'bleed'` run to this frame. */
  bleedBox: BoundingBox;
}

export function computePageMetrics(resolved: ResolvedConfig): PageMetrics {
  const dpi = resolved.page.dpi;
  const trimWidthPx = dimensionToPx(resolved.page.width, dpi);
  const trimHeightPx = dimensionToPx(resolved.page.height, dpi);

  // Cut lines expansion: canvas grows to fit bleed + mark offset + mark length
  let trimOffset = 0;
  let bleedPx = 0;
  if (resolved.page.cutLines.enabled) {
    bleedPx = dimensionToPx(resolved.page.cutLines.bleed, dpi);
    const markOffsetPx = dimensionToPx(resolved.page.cutLines.markOffset, dpi);
    const markLengthPx = dimensionToPx(resolved.page.cutLines.markLength, dpi);
    trimOffset = bleedPx + markOffsetPx + markLengthPx;
  }

  const pageWidthPx = trimWidthPx + trimOffset * 2;
  const pageHeightPx = trimHeightPx + trimOffset * 2;

  const marginTop = dimensionToPx(resolved.page.margins.top, dpi);
  const marginBottom = dimensionToPx(resolved.page.margins.bottom, dpi);
  const marginLeft = dimensionToPx(resolved.page.margins.left, dpi);
  const marginRight = dimensionToPx(resolved.page.margins.right, dpi);

  const contentArea = createBoundingBox(
    marginLeft + trimOffset,
    marginTop + trimOffset,
    trimWidthPx - marginLeft - marginRight,
    trimHeightPx - marginTop - marginBottom,
  );

  const trimBox = createBoundingBox(trimOffset, trimOffset, trimWidthPx, trimHeightPx);
  const bleedBox = createBoundingBox(
    trimOffset - bleedPx,
    trimOffset - bleedPx,
    trimWidthPx + bleedPx * 2,
    trimHeightPx + bleedPx * 2,
  );

  return { trimWidthPx, trimHeightPx, pageWidthPx, pageHeightPx, trimOffset, contentArea, trimBox, bleedBox };
}

/** Mirror a content area horizontally about the page's vertical centre line:
 *  the inner margin becomes the outer one and vice versa. Vertical extent is
 *  unchanged. */
export function mirrorContentArea(area: BoundingBox, pageWidthPx: number): BoundingBox {
  return createBoundingBox(
    pageWidthPx - (area.x + area.width),
    area.y,
    area.width,
    area.height,
  );
}

/** Content area for the page at `pageIndex` (position in `doc.pages`). With
 *  `margins.mirror`, even pages (page number = index + 1) swap the inner and
 *  outer margins so the inner margin always faces the spine. */
export function contentAreaForPage(
  metrics: Pick<PageMetrics, 'contentArea' | 'pageWidthPx'>,
  resolved: ResolvedConfig,
  pageIndex: number,
  pageIndexOffset = 0,
): BoundingBox {
  const isEvenPage = (pageIndex + pageIndexOffset + 1) % 2 === 0;
  if (resolved.page.margins.mirror && isEvenPage) {
    return mirrorContentArea(metrics.contentArea, metrics.pageWidthPx);
  }
  return createBoundingBox(
    metrics.contentArea.x,
    metrics.contentArea.y,
    metrics.contentArea.width,
    metrics.contentArea.height,
  );
}

// ---------------------------------------------------------------------------
// Style attribute copy: every VDTBlock mirrors a subset of BlockStyle fields.
// ---------------------------------------------------------------------------

export function applyStyleAttrs(blk: VDTBlock, style: BlockStyle): void {
  if (style.boldFontString) blk.boldFontString = style.boldFontString;
  if (style.italicFontString) blk.italicFontString = style.italicFontString;
  if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
  if (style.boldColor) blk.boldColor = style.boldColor;
  if (style.italicColor) blk.italicColor = style.italicColor;
  if (style.referenceColor) blk.refColor = style.referenceColor;
}

// ---------------------------------------------------------------------------
// Math-span enrichment
// ---------------------------------------------------------------------------

/**
 * Resolve inline math in a parsed block: calls `renderMath` on every `span.math`
 * and attaches `mathRender` metadata. When math is disabled, drops the math
 * metadata so spans fall back to the raw TeX (visible as literal `$...$`).
 */
export function enrichMathSpans(
  contentBlock: ContentBlock,
  style: BlockStyle,
  resolved: ResolvedConfig,
): ContentBlock {
  if (!contentBlock.spans.some((s) => s.math)) return contentBlock;

  const mathEnabled = resolved.math.enabled;
  const mathFontSizePx = style.fontSizePx * resolved.math.fontSizeScale;
  const mathColor = resolved.math.color?.hex ?? style.color;

  const mathReady = isMathReady();
  if (mathEnabled && !mathReady) noteMathWithoutEngine();
  const enrichedSpans = contentBlock.spans.map((s) => {
    if (!s.math) return s;
    if (!mathEnabled) {
      return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
    }
    const render = mathReady
      ? renderMath(s.math.tex, false, mathFontSizePx, { lineBoxPx: style.lineHeightPx, color: mathColor })
      : undefined;
    return { ...s, mathRender: render };
  });

  return { ...contentBlock, spans: enrichedSpans };
}

// ---------------------------------------------------------------------------
// Measurement-viewport adjustments for list items
// ---------------------------------------------------------------------------

export interface MeasureViewport {
  measureMaxWidth: number;
  lineXShift: number;
  measureFirstLineIndent: number;
  measureHangingIndent: boolean;
}

/** Compute measurement viewport: list items reserve horizontal space for indent + bullet + gap. */
export function computeMeasureViewport(
  columnWidth: number,
  style: BlockStyle,
  listBullet: import('./lists').ListBulletStyle | undefined,
): MeasureViewport {
  let measureMaxWidth = columnWidth;
  let lineXShift = 0;
  let measureFirstLineIndent = style.firstLineIndentPx;
  let measureHangingIndent = style.hangingIndent;

  // A paragraph style's `indent`: every line shifts right and the measure
  // narrows by it; the first-line or hanging indent counts from there.
  if (!listBullet && style.indentPx !== undefined && style.indentPx > 0) {
    const indentPx = Math.min(style.indentPx, Math.max(0, columnWidth - 1));
    measureMaxWidth = Math.max(1, columnWidth - indentPx);
    lineXShift = indentPx;
  }

  if (listBullet) {
    const textGap = listBullet.bulletWidthPx + listBullet.gapPx;
    if (listBullet.hangingIndent) {
      measureMaxWidth = Math.max(1, columnWidth - listBullet.indentPx - textGap);
      lineXShift = listBullet.indentPx + textGap;
      measureFirstLineIndent = 0;
      measureHangingIndent = false;
    } else {
      measureMaxWidth = Math.max(1, columnWidth - listBullet.indentPx);
      lineXShift = listBullet.indentPx;
      measureFirstLineIndent = textGap;
      measureHangingIndent = false;
    }
  }

  return { measureMaxWidth, lineXShift, measureFirstLineIndent, measureHangingIndent };
}

// ---------------------------------------------------------------------------
// Per-line source-range mapping
// ---------------------------------------------------------------------------

/** An author's soft hyphen or zero-width space: plain text (and source) a
 *  line may leave unprinted. `\s` matches neither. */
function isUnprinted(c: string | undefined): boolean {
  return c === '\u00AD' || c === '\u200B';
}

/** ASCII punctuation: what a backslash may escape (CommonMark). */
const ESCAPABLE_RE = /[!-/:-@[-`{-~]/;

/**
 * Stamps `plainStart` / `plainEnd` / `sourceStart` / `sourceEnd` on every line
 * of `measured`, accounting for any heading-number prefix that prepends chars
 * with no source. `source` is the markdown the block's offsets index (the
 * body, before `bodyOffset`): with it, a line that opens with a backslash
 * escape (`\$40`) starts at the backslash, which the plain text does not
 * print (EF-178). A block's `sourceMap` maps the escaped character itself.
 */
export function stampSourceRanges(
  measured: MeasuredBlock,
  rawBlock: ContentBlock,
  contentBlock: ContentBlock,
  bodyOffset: number,
  source?: string,
): { prefixLen: number; absoluteSourceMap: number[] } {
  const blockSrcStart = rawBlock.sourceStart + bodyOffset;
  const blockSrcEnd = rawBlock.sourceEnd + bodyOffset;
  const srcMap = rawBlock.sourceMap;
  const prefixLen = contentBlock.text.length - rawBlock.text.length;

  const plainToSrc = (p: number): number => {
    const idx = p - prefixLen;
    if (idx <= 0) return blockSrcStart;
    if (idx >= srcMap.length) return blockSrcEnd;
    return srcMap[idx]! + bodyOffset;
  };
  /** Where plain character `p` starts in the source: at the backslash of an
   *  escape (`\$`), which the plain text skips, unless the character before
   *  it is written with that backslash. Line boundaries fall there, so a
   *  line that opens with an escape covers its backslash and the line before
   *  it stops short of it. */
  const plainToSrcStart = (p: number): number => {
    const idx = p - prefixLen;
    if (source === undefined || idx <= 0 || idx >= srcMap.length) return plainToSrc(p);
    const at = srcMap[idx]!;
    const escaped = at > 0 && source[at - 1] === '\\' && srcMap[idx - 1]! < at - 1 && ESCAPABLE_RE.test(source[at] ?? '');
    return (escaped ? at - 1 : at) + bodyOffset;
  };

  // The block's plain text (heading prefix included): what the lines' plain
  // offsets index, and what tells a hyphen or a separator the break added
  // from one the source carries.
  const plain = contentBlock.text;
  let cumPlain = 0;
  const lastLineIdx = measured.lines.length - 1;
  // The line's characters as plain text counts them. An inline `:ref`
  // segment renders a multi-char label but occupies a single placeholder
  // char in the block's plain text / `sourceMap` (mirrors the math
  // placeholder); the later runs of a reference painted in pieces (small
  // capitals) count 0.
  const unitsOf = (line: MeasuredBlock['lines'][number]): (string | null)[] => {
    const units: (string | null)[] = [];
    if (line.segments && line.segments.length > 0) {
      for (const seg of line.segments) {
        if (seg.refContinues) continue;
        if (seg.refResourceId !== undefined) units.push(null);
        else for (let k = 0; k < seg.text.length; k++) units.push(seg.text[k]!);
      }
    } else {
      for (let k = 0; k < line.text.length; k++) units.push(line.text[k]!);
    }
    return units;
  };
  let nextUnits = measured.lines.length > 0 ? unitsOf(measured.lines[0]!) : [];
  for (let li = 0; li < measured.lines.length; li++) {
    const line = measured.lines[li]!;
    const units = nextUnits;
    nextUnits = li < lastLineIdx ? unitsOf(measured.lines[li + 1]!) : [];
    // Walk the plain text along the line. An author's soft hyphen or
    // zero-width space inside the line is plain text the line may not print
    // (the plain path drops every U+200B); a hyphenated line's final hyphen
    // is the break's own (a dictionary syllable, a word cut for being wider
    // than the line) unless the source carries it there (a hard hyphen), and
    // only then plain text.
    let i = cumPlain;
    // The hyphen a line opens with when it repeats the one of the compound
    // the line before broke at (`repeatHyphen`) is not in the plain text.
    for (let u = line.repeatedHyphen && units[0] === '-' ? 1 : 0; u < units.length; u++) {
      const c = units[u];
      // A zero-width character the line holds and the plain text does not
      // (a break opportunity a measurer inserted) is no source character.
      if (isUnprinted(c ?? undefined) && c !== plain[i]) continue;
      while (isUnprinted(plain[i]) && c !== plain[i]) i++;
      if (u === units.length - 1 && line.hyphenated && c === '-' && plain[i] !== '-') break;
      i++;
    }
    line.plainStart = cumPlain;
    line.plainEnd = i;
    // Advance past the separator the break consumed: the space (or an
    // author's soft hyphen or zero-width space) right after the line in the
    // plain text. A break that consumed nothing — at a syllable or a hard
    // hyphen, between two ideographs, inside a word cut for being wider than
    // the line — skips nothing, and neither does the last line. Nor does a
    // no-break space the next line opens on: two runs glued by one (an
    // italic word and the number after it) part where they meet when the
    // group is wider than the line, and the second line keeps the space.
    const after = plain[line.plainEnd];
    const opensNext = after !== undefined && NO_BREAK_SPACES.includes(after) && nextUnits[0] === after;
    const skipSeparator = li !== lastLineIdx && after !== undefined && (/\s/.test(after) || isUnprinted(after)) && !opensNext ? 1 : 0;
    cumPlain = line.plainEnd + skipSeparator;
    line.sourceStart = plainToSrcStart(line.plainStart);
    line.sourceEnd = plainToSrcStart(line.plainEnd);
  }

  const absoluteSourceMap = srcMap.map((o) => o + bodyOffset);
  return { prefixLen, absoluteSourceMap };
}

// ---------------------------------------------------------------------------
// Column rollback helper: remove the tail of `curCol.blocks` and also drop
// them from `doc.blocks`, refunding `availableHeight`. Returns the popped
// blocks (in column order) so callers can rewind `blockIdx` to the first
// one's `contentIndex`.
// ---------------------------------------------------------------------------

export function rollbackTrailingBlocks(
  curCol: { blocks: VDTBlock[]; availableHeight: number; bbox: BoundingBox },
  docBlocks: VDTBlock[],
  predicate: (b: VDTBlock) => boolean,
): VDTBlock[] {
  let count = 0;
  for (let j = curCol.blocks.length - 1; j >= 0; j--) {
    if (predicate(curCol.blocks[j]!)) count++;
    else break;
  }
  if (count === 0) return [];
  const popped = curCol.blocks.splice(curCol.blocks.length - count);
  for (const p of popped) {
    const idx = docBlocks.indexOf(p);
    if (idx !== -1) docBlocks.splice(idx, 1);
    curCol.availableHeight += p.bbox.height;
  }
  return popped;
}

// ---------------------------------------------------------------------------
// Neighbour lookups that see through container markers. `containerStart` /
// `containerEnd` carry no text and must not break heading runs, list runs,
// keep-with-next, or the "first paragraph after a heading" rule.
// ---------------------------------------------------------------------------

export function isMarkerBlock(block: ContentBlock | undefined): boolean {
  return block?.type === 'containerStart' || block?.type === 'containerEnd';
}

/** The next non-marker block after `idx`, or `undefined` at the end. */
export function nextNonMarkerBlock(blocks: readonly ContentBlock[], idx: number): ContentBlock | undefined {
  for (let i = idx + 1; i < blocks.length; i++) {
    if (!isMarkerBlock(blocks[i])) return blocks[i];
  }
  return undefined;
}

/** Body lines of the `:::space` directives right after `idx` (through
 *  container markers and other directives, up to the next content block) —
 *  the room keep-with-next must leave between a heading and its text. */
export function spaceLinesAfter(blocks: readonly ContentBlock[], idx: number): number {
  let lines = 0;
  for (let i = idx + 1; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (isMarkerBlock(b)) continue;
    if (b.type !== 'directive') break;
    if (b.directiveName === 'space') lines += spaceDirectiveLines(b.directiveAttrs) ?? 1;
  }
  return lines;
}

/** The previous non-marker block before `idx`, or `undefined` at the start. */
export function prevNonMarkerBlock(blocks: readonly ContentBlock[], idx: number): ContentBlock | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    if (!isMarkerBlock(blocks[i])) return blocks[i];
  }
  return undefined;
}

