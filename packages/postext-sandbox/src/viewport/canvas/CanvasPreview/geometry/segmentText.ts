// The text of a line segment: its plain length, added hyphens, folded
// reference runs, grapheme starts, warichu cells and the x of an offset
// in it (#1276: split out of geometry.ts).
import type { VDTDocument } from 'postext';

export type VDTBlock = VDTDocument['blocks'][number];
export type VDTLine = VDTBlock['lines'][number];
export type VDTSegment = NonNullable<VDTLine['segments']>[number];

/**
 * Plain-text chars a rendered segment occupies in the block's `text` /
 * `sourceMap`. An inline `:ref` renders its resolved label ("tabla 1.1") but
 * is a single placeholder char in the plain text, so it must count as 1 or
 * every glyph after it on the line maps to the wrong source offset. Mirrors
 * the line-length math in `stampSourceRanges`. The hyphen a break added at
 * the end of a hyphenated line's last segment has no source char either
 * (see {@link addsHyphen}), nor the hyphen a line opens with when it repeats
 * the one of the compound the line before broke at (`dropLeadingHyphen`,
 * see {@link opensWithRepeatedHyphen}), nor the tatweels of a kashida.
 */
export function segmentPlainLength(seg: VDTSegment, dropTrailingHyphen: boolean, dropLeadingHyphen = false): number {
  // Brackets the layout added (a book title's 《》, a warichu note's) are
  // no plain text (#193, #195), nor a tab stop's leader (#622).
  if (seg.refContinues || seg.inserted || seg.leader !== undefined) return 0;
  if (seg.refResourceId !== undefined) return 1;
  if (seg.kind === 'swatch') return 1;
  // The tatweels kashida justification inserted are painted, not plain
  // text (#375).
  let len = seg.text.length - (seg.kashida?.length ?? 0);
  if (dropLeadingHyphen && seg.text.startsWith('-')) len--;
  if (dropTrailingHyphen && seg.text.endsWith('-') && len > 0) len--;
  return Math.max(0, len);
}

/** Whether segment `i` of a line opens with the hyphen the line repeats
 *  from the compound the line before broke at (`bodyText.repeatHyphen`):
 *  the line's first segment, on a line flagged `repeatedHyphen`. */
export function opensWithRepeatedHyphen(line: Pick<VDTLine, 'repeatedHyphen'>, i: number): boolean {
  return i === 0 && line.repeatedHyphen === true;
}

/** Whether the hyphen a line ends with was added by its break, and so has
 *  no plain char: a hyphenated line, unless it broke after a hyphen the text
 *  carries (`hardHyphen`, "well-" | "known"). */
export function addsHyphen(line: Pick<VDTLine, 'hyphenated' | 'hardHyphen'>): boolean {
  return line.hyphenated === true && line.hardHyphen !== true;
}

/**
 * A line's segments with the runs of one `:ref` painted in pieces (a label
 * in small capitals: one run per case, the later ones `refContinues`)
 * folded into one segment, so the caret and click math treat the whole
 * label as the reference's single plain char. Returns `segs` itself when
 * nothing folds.
 */
export function foldRefRuns(segs: readonly VDTSegment[]): VDTSegment[] {
  if (!segs.some((s) => s.refContinues)) return segs as VDTSegment[];
  const out: VDTSegment[] = [];
  for (const seg of segs) {
    const last = out[out.length - 1];
    if (seg.refContinues && last && last.refResourceId === seg.refResourceId) {
      out[out.length - 1] = { ...last, text: last.text + seg.text, width: last.width + seg.width };
    } else {
      out.push(seg);
    }
  }
  return out;
}

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : undefined;

/**
 * Where the graphemes of a segment start, as offsets into its text, with
 * the text's length last — or null when every UTF-16 unit is a grapheme and
 * the segment is not tracked, so the linear mapping over units is exact.
 * A tracked segment (a justified CJK line) spreads its characters evenly,
 * one share of its width per grapheme; a supplementary-plane ideograph (𠺕)
 * is one grapheme of two units, which the caret never lands inside.
 */
export function segmentGraphemeStarts(seg: Pick<VDTSegment, 'text' | 'tracking'>): number[] | null {
  const text = seg.text;
  const complex = /[\uD800-\uDFFF\u0300-\u036F\u200D\uFE00-\uFE0F]/.test(text);
  if (!complex && seg.tracking === undefined) return null;
  const starts: number[] = [];
  if (graphemeSegmenter && complex) {
    for (const g of graphemeSegmenter.segment(text)) starts.push(g.index);
  } else {
    for (let i = 0; i < text.length; i++) starts.push(i);
  }
  starts.push(text.length);
  return starts;
}

/** The x of plain offset `within` (UTF-16 units into the segment, up to
 *  `plainLen`) over a segment `rendered` px wide: grapheme by grapheme when
 *  {@link segmentGraphemeStarts} gives its boundaries, else linearly. */
export function xWithinSegment(seg: VDTSegment, within: number, plainLen: number, rendered: number): number {
  // A warichu note's part: the offset falls in its upper row, or past it in
  // the lower one (#195); both rows advance by the same cell.
  if (seg.warichu) {
    const w = seg.warichu;
    const cell = warichuCell(seg);
    return within <= w.upper.length ? within * cell : (within - w.upper.length) * cell;
  }
  const starts = seg.kind === 'text' ? segmentGraphemeStarts(seg) : null;
  if (!starts || starts.length < 2) return plainLen > 0 ? (within / plainLen) * rendered : 0;
  const n = starts.length - 1;
  let k = 0;
  while (k < n && starts[k + 1]! <= within) k++;
  return (k / n) * rendered;
}

/** The advance of one character of a warichu part's rows: the part's
 *  width (its tracking left out) over the longer row. */
function warichuCell(seg: VDTSegment): number {
  const w = seg.warichu!;
  const n = Math.max(1, w.upper.length, w.lower.length);
  return (seg.width - (seg.tracking ?? 0)) / n;
}

/**
 * The plain offset (UTF-16 units into the segment) of a click `dx` px along
 * a warichu note's part and `dy` px from the line's baseline (flow frame):
 * above the line's axis the upper row, below it the lower one, whose
 * characters follow the upper row's in the plain text (#195).
 */
export function warichuOffset(seg: VDTSegment, dx: number, dy: number): number {
  const w = seg.warichu!;
  const noteEm = w.lowerDy - w.upperDy;
  const axis = (w.upperDy + w.lowerDy) / 2 - 0.38 * noteEm;
  const cell = warichuCell(seg);
  const k = (n: number) => Math.max(0, Math.min(n, Math.round(dx / (cell || 1))));
  return dy < axis ? k(w.upper.length) : w.upper.length + k(w.lower.length);
}

/** The plain offset (UTF-16 units into the segment, at most `plainLen`) of
 *  the grapheme boundary nearest to `dx` px into a segment `rendered` px
 *  wide (see {@link xWithinSegment}). */
export function offsetWithinSegment(seg: VDTSegment, dx: number, plainLen: number, rendered: number): number {
  const ratio = rendered > 0 ? dx / rendered : 0;
  const starts = seg.kind === 'text' ? segmentGraphemeStarts(seg) : null;
  if (!starts || starts.length < 2) return Math.round(ratio * plainLen);
  const n = starts.length - 1;
  const k = Math.max(0, Math.min(n, Math.round(ratio * n)));
  return Math.min(plainLen, starts[k]!);
}
