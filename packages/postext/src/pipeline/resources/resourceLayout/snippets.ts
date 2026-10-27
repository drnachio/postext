// Measuring the short texts of a resource (captions, notes, cells): maths
// spans, cell paragraphs and item markers, the measurement cache of the
// call, justified snippet lines (#1276: split out of resourceLayout.ts).
import type { InlineSpan } from '../../../parse/index.js';
import type { ResolvedMathConfig } from '../../../types.js';
import { type VDTLine, createBoundingBox } from '../../../vdt.js';
import { type MeasurementCache, type MeasureBlockOptions, cachedMeasureRichSnippet } from '../../../measure/index.js';
import { measureRichSnippet } from '../../../measure/rich.js';
import { isBlankText } from '../../../measure/spaces.js';
import { linkSegments } from '../../../measure/links.js';
import { sliceSpan } from '../../../parse/links.js';
import { indentColumn } from '../../../parse/listNesting.js';
import { FIT_EPS } from '../../blocks/placement.js';
import { renderMath } from '../../../math/index.js';

/** Offset every line's bbox / baseline by `dy` (block-relative → block-relative
 *  shifted). Returns new line objects (FP-first). */
export function shiftLines(lines: VDTLine[], dx: number, dy: number): VDTLine[] {
  return lines.map((line) => ({
    ...line,
    bbox: createBoundingBox(line.bbox.x + dx, line.bbox.y + dy, line.bbox.width, line.bbox.height),
    baseline: line.baseline + dy,
  }));
}

/** Compute the displayed (column-fitted, aspect-preserved) size of a bitmap. */
export function fitWidth(intrinsicW: number, intrinsicH: number, columnWidth: number): { width: number; height: number } {
  if (intrinsicW <= 0 || intrinsicH <= 0) {
    // No intrinsic dims — default to a 4:3 box at column width.
    return { width: columnWidth, height: columnWidth * 0.75 };
  }
  const width = Math.min(intrinsicW, columnWidth);
  const height = (intrinsicH / intrinsicW) * width;
  return { width, height };
}

/** Share of the free room set left of a body aligned per `placement.align`. */
export function alignFactor(align: 'left' | 'center' | 'right' | 'start' | 'end' | undefined): number {
  return align === 'center' ? 0.5 : align === 'right' || align === 'end' ? 1 : 0;
}

/** The inline formulas of a caption, a note or a cell (#541), rendered at
 *  the snippet's size as the body's are at the body's: one em of the
 *  formula is `fontPx` × `math.fontSizeScale`, and a formula taller than
 *  the line is scaled down to it. With maths off the TeX prints as
 *  written, between its dollars. */
export function snippetMathSpans(spans: InlineSpan[], fontPx: number, lineHeightPx: number, math: ResolvedMathConfig | undefined): InlineSpan[] {
  if (!math || !spans.some((s) => s.math)) return spans;
  return spans.map((s) => {
    if (!s.math) return s;
    if (!math.enabled) return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
    return { ...s, mathRender: renderMath(s.math.tex, false, fontPx * math.fontSizeScale, { lineBoxPx: lineHeightPx, ...(math.color ? { color: math.color.hex } : {}) }) };
  });
}

/** A list-item marker at the head of a cell paragraph: the glyph as
 *  authored, the whitespace that follows it, and the column of its leading
 *  indentation (the cell nests its items as the parser nests a list's, see
 *  `parse/listNesting.ts`). */
interface CellItemMarker {
  text: string;
  ws: string;
  column: number;
}

/** Markers a cell paragraph may open with: bullets, dashes, a number with
 *  its dot or bracket — followed by whitespace and some text. */
const CELL_ITEM_MARKER = /^(\s*)([•·◦○▪‣\-*–—]|\d{1,3}[.)])(\s+)(?=\S)/;

/** A cell breaks its lines at a newline and at a forced break (`\\`, see
 *  `SNIPPET_BREAK_RE`); a caption or a note only at a forced break. */
const CELL_BREAK_RE = /[\n\u2028]/;
const FORCED_BREAK_RE = /\u2028/;

/** Split a cell's spans into paragraphs at hard line breaks (`\n`, and
 *  the forced breaks). The break characters are dropped; an empty paragraph
 *  (a blank line) is kept out — the measurer would skip it as whitespace
 *  anyway. A line holding a no-break space is no blank line: it sets a
 *  line of the cell, as in CommonMark (EF-154). */
export function splitCellParagraphs(spans: InlineSpan[], breakRe: RegExp = CELL_BREAK_RE): InlineSpan[][] {
  const out: InlineSpan[][] = [];
  let current: InlineSpan[] = [];
  const flush = () => {
    if (current.some((sp) => !isBlankText(sp.text))) out.push(current);
    current = [];
  };
  for (const span of spans) {
    if (span.ref || span.math || !breakRe.test(span.text)) {
      current.push(span);
      continue;
    }
    const pieces = span.text.split(breakRe);
    let at = 0;
    pieces.forEach((piece, i) => {
      if (i > 0) flush();
      if (piece.length > 0) current.push(span.links ? sliceSpan(span, at, at + piece.length) : { ...span, text: piece });
      at += piece.length + 1;
    });
  }
  flush();
  return out;
}

/** Detach a list marker from the head of a paragraph, when it opens with
 *  one. Returns the marker and the spans with it stripped. */
export function takeCellItemMarker(spans: InlineSpan[]): { marker: CellItemMarker; spans: InlineSpan[] } | null {
  const first = spans[0];
  if (!first || first.ref || first.math) return null;
  const m = CELL_ITEM_MARKER.exec(first.text);
  if (!m) return null;
  const [whole, indent, text, ws] = m as unknown as [string, string, string, string];
  const rest = first.text.slice(whole.length);
  const stripped = rest.length > 0 ? [first.links ? sliceSpan(first, whole.length) : { ...first, text: rest }, ...spans.slice(1)] : spans.slice(1);
  return { marker: { text, ws, column: indentColumn(indent) }, spans: stripped };
}

/** The measurement cache of the resource block being laid out, if its
 *  caller gave one: captions, notes and cells are measured through it. Set
 *  for the length of a call (`withSnippetCache`), as the writing mode and
 *  the direction a block is measured in are. */
let snippetCache: MeasurementCache | undefined;

export function withSnippetCache<T>(cache: MeasurementCache | undefined, fn: () => T): T {
  if (cache === undefined || cache === snippetCache) return fn();
  const outer = snippetCache;
  snippetCache = cache;
  try {
    return fn();
  } finally {
    snippetCache = outer;
  }
}

/** {@link measureRichSnippet}, through the block's cache when it has one. */
export function measureSnippet(
  spans: InlineSpan[],
  normal: string,
  bold: string,
  italic: string,
  boldItalic: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions,
) {
  return snippetCache
    ? cachedMeasureRichSnippet(spans, normal, bold, italic, boldItalic, maxWidthPx, lineHeightPx, options, snippetCache)
    : measureRichSnippet(spans, normal, bold, italic, boldItalic, maxWidthPx, lineHeightPx, options);
}

/**
 * A caption or note line justified in its segments (#1099): its word spaces
 * take the line's slack, each as wide as the others, so every renderer,
 * which paints a caption line as measured, sets it flush on both sides. The
 * rule is the one body text is painted with (`renderLine` in the canvas
 * backend): the last line of a paragraph, a tabbed line and a line the
 * measurer set ragged keep their natural spaces unless they run past the
 * measure; a hung mark stays out of the count and a Han–Latin space
 * (`autospace`) keeps the width the CJK composer gave it. A composed CJK
 * line already spread to its measure has no slack left and comes back as
 * it was. Highlight bands are placed from the segments once the document is
 * laid out, so they follow the wider spaces. Never changes `line` in place
 * (a cached measurement may share it).
 */
export function justifySnippetLine(line: VDTLine, maxWidthPx: number): VDTLine {
  const segments = line.segments;
  if (!segments || segments.length === 0 || line.tabbed) return line;
  const measure = line.measure?.width ?? maxWidthPx - line.bbox.x;
  let wordWidth = 0;
  let natural = 0;
  let spaceCount = 0;
  for (const seg of segments) {
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
    natural += seg.width;
  }
  if (spaceCount === 0) return line;
  if ((line.isLastLine || line.ragged) && !(natural > measure + FIT_EPS)) return line;
  if (Math.abs(measure - natural) <= FIT_EPS) return line;
  const spaceWidth = Math.max(0, (measure - wordWidth) / spaceCount);
  const widened = segments.map((seg) => (seg.kind === 'space' && !seg.autospace && !seg.hangs ? { ...seg, width: spaceWidth } : seg));
  const grown = spaceWidth * spaceCount + wordWidth - natural;
  return {
    ...line,
    segments: widened,
    bbox: createBoundingBox(line.bbox.x, line.bbox.y, line.bbox.width + grown, line.bbox.height),
  };
}

/** The four faces a caption or note run is set in (normal, bold, italic,
 *  bold italic). */
export type SnippetFonts = readonly [string, string, string, string];

/**
 * Measure a caption or a note. Without a forced break it is one rich block,
 * exactly as before; with forced breaks (`\\`, or a backslash ending a line
 * — see `SNIPPET_BREAK_RE`) each piece is measured on its own and the
 * pieces are stacked, one line pitch apart. An empty piece (two breaks in a
 * row) adds no line. Lines are block-relative (y = 0 at the first line).
 */
export function measureSnippetLines(
  spans: InlineSpan[],
  fonts: SnippetFonts,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions,
): VDTLine[] {
  const [normal, bold, italic, boldItalic] = fonts;
  // The measurer sets every line flush left at its natural width: a
  // centred or right-aligned caption or note is pushed over by each line's
  // slack (EF-166), as table cells are, and a justified one has the slack
  // spread over its word spaces (#1099).
  const align = options.textAlign;
  const aligned = (lines: VDTLine[]): VDTLine[] =>
    align === 'center' || align === 'right'
      ? lines.map((line) => {
          const slack = Math.max(0, maxWidthPx - line.bbox.width);
          return shiftLines([line], align === 'center' ? slack / 2 : slack, 0)[0]!;
        })
      : align === 'justify'
        ? lines.map((line) => justifySnippetLine(line, maxWidthPx))
        : lines;
  const measure = (ps: InlineSpan[]): VDTLine[] =>
    aligned(linkSegments(measureSnippet(ps, normal, bold, italic, boldItalic, maxWidthPx, lineHeightPx, options).lines, ps));
  if (!spans.some((s) => !s.ref && !s.math && FORCED_BREAK_RE.test(s.text))) return measure(spans);
  const lines: VDTLine[] = [];
  for (const piece of splitCellParagraphs(spans, FORCED_BREAK_RE)) {
    const measured = measure(piece);
    lines.push(...shiftLines(measured, 0, lines.length * lineHeightPx));
  }
  return lines;
}
