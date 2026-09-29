/**
 * The Chinese interlinear marks of a laid-out document (#193): emphasis dots
 * (着重号), the proper-name line (专名号) and the wavy book-title line
 * (书名号甲式), as `VDTLine.marks` — primitives the renderers draw as they
 * are — and the leading checks of marks and ruby (#194).
 *
 * The measurer flags the segments (`VDTLineSegment.cjkMarks`); the marks are
 * placed once the document is laid out, where the renderers paint each
 * segment ({@link segmentPositions}: alignment and the justified word
 * spaces of a line included), in the flow frame of the line. Dots are
 * centred on each character, spacing after it left out, and skip
 * punctuation and spaces; a line spans its run's characters, and where two
 * runs meet each end gives up an eighth of an em (clreq §5.6.1). Marks sit
 * against the characters' em box, centred on the font's central axis:
 * under in horizontal text (left in vertical text), emphasis dots over in
 * vertical text (right); when dots and a line mark the same text on one
 * side, the line is nearer the text.
 */

import type { ContentWarning, VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from './vdt';
import type { ResolvedCjkConfig } from './types';
import { lineInkExtent, lineTrailingTracking } from './lineInk';
import { measureTextWidth } from './measure/canvas';
import { graphemesOf } from './measure/graphemes';
import { isCjkGrapheme } from './measure/cjkClasses';
import { CENTRAL, ZHUYIN_SIZE_RATIO, isZhuyin } from './measure/cjkAnnotate';
import { fontEm } from './measure/vertical';

/** What a block contributes to its lines' painting. */
type BlockLike = Pick<VDTBlock, 'bbox' | 'textAlign' | 'letterSpacing' | 'fontString' | 'boldFontString' | 'italicFontString' | 'boldItalicFontString'>;

/**
 * Where the renderers paint each segment of a line: its x (absolute, in
 * the flow frame) and the advance they give it — a word space of a
 * justified line its share of the slack, a centred or right-aligned line
 * shifted by its slack. Mirrors the line painters of the canvas, PDF and
 * HTML backends.
 */
export function segmentPositions(line: VDTLine, block: BlockLike): { xs: number[]; widths: number[] } {
  const segments = line.segments ?? [];
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;
  let start = line.bbox.x;
  let justified: number | undefined;
  if (block.textAlign === 'justify') {
    let wordWidth = 0;
    let natural = 0;
    let spaces = 0;
    for (const seg of segments) {
      if (seg.hangs) continue;
      if (seg.kind === 'space' && !seg.autospace) spaces++;
      else wordWidth += seg.width;
      natural += seg.width;
    }
    if (spaces > 0 && ((!line.isLastLine && !line.ragged) || natural > effectiveWidth)) justified = (effectiveWidth - wordWidth) / spaces;
  } else if (block.textAlign === 'center' || block.textAlign === 'right') {
    const trailing = lineTrailingTracking(line, tracking);
    const slack = Math.max(0, effectiveWidth - (lineInkExtent(line, 0).width - trailing));
    start += block.textAlign === 'center' ? slack / 2 : slack;
  }
  const xs: number[] = [];
  const widths: number[] = [];
  let x = start;
  for (const seg of segments) {
    xs.push(x);
    const w = seg.kind === 'space' && !seg.autospace && justified !== undefined ? justified : seg.width;
    widths.push(w);
    x += w;
  }
  return { xs, widths };
}

/** The font a segment is painted in. */
export function segmentFont(seg: VDTLineSegment, block: BlockLike): string {
  if (seg.fontString) return seg.fontString;
  if (seg.bold && seg.italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (seg.bold && block.boldFontString) return block.boldFontString;
  if (seg.italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

/** Characters that take no emphasis dot: punctuation, spaces, controls. */
const NO_DOT_RE = /^[\p{P}\p{Z}\p{Cc}\p{Cf}]/u;

/** Mark sizes, in em of the text they mark. */
const DOT = { dot: 0.16, circle: 0.2, sesame: 0.3 } as const;
const GAP = 0.06;
const STROKE = 0.05;
const OUTLINE = 0.035;
const LINE_AT = 0.08;
const WAVE_AT = 0.1;
const WAVE_HEIGHT = 0.08;
const WAVE_LENGTH = 0.25;
/** How far dots move out when a line marks the same text on their side. */
const PAST_LINE = 0.16;

/** Where each grapheme of a segment starts and how far it advances, px
 *  from the segment's start: CJK characters share the segment's width
 *  evenly (the composer only puts characters that advance alike in one
 *  segment); anything else is measured and scaled to the segment. */
function graphemeAdvances(seg: VDTLineSegment, width: number, font: string): { g: string; at: number; adv: number }[] {
  const graphemes = graphemesOf(seg.text);
  if (graphemes.length === 0) return [];
  const out: { g: string; at: number; adv: number }[] = [];
  if (graphemes.every(isCjkGrapheme)) {
    const adv = width / graphemes.length;
    graphemes.forEach((g, i) => out.push({ g, at: i * adv, adv }));
    return out;
  }
  const natural = graphemes.map((g) => measureTextWidth(g, font));
  const sum = natural.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? width / sum : 1;
  let at = 0;
  graphemes.forEach((g, i) => {
    const adv = natural[i]! * scale;
    out.push({ g, at, adv });
    at += adv;
  });
  return out;
}

/** The marks of one line (see the module comment), relative to it; empty
 *  when it has none. `color` is `cjk.annotationColor` (hex), if set. */
export function lineMarks(line: VDTLine, block: BlockLike, color?: string): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.cjkMarks)) return [];
  const { xs, widths } = segmentPositions(line, block);
  const x0 = line.bbox.x;
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const out: VDTLineMark[] = [];
  const paint = color !== undefined ? { color } : {};

  // Lines first: they decide where dots under the same text go.
  type Run = { kind: 'line' | 'wavy'; key: string; from: number; to: number; em: number; axis: number; startSeg: number; endSeg: number };
  const runs: Run[] = [];
  const lined = new Set<number>();
  for (const kind of ['line', 'wavy'] as const) {
    let open: Run | undefined;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const id = kind === 'line' ? seg.cjkMarks?.properName : seg.cjkMarks?.bookTitle;
      if (seg.kind === 'space' && id === undefined && open) {
        // A space inside a run: the line goes on when the run does.
        let j = i + 1;
        while (j < segments.length && segments[j]!.kind === 'space') j++;
        const nextId = kind === 'line' ? segments[j]?.cjkMarks?.properName : segments[j]?.cjkMarks?.bookTitle;
        if (nextId !== undefined && `${kind}:${nextId}` === open.key) continue;
      }
      if (id === undefined || seg.warichu || seg.inserted) {
        open = undefined;
        continue;
      }
      const key = `${kind}:${id}`;
      const font = segmentFont(seg, block);
      const em = fontEm(font);
      const end = xs[i]! + widths[i]! - (seg.kind === 'text' ? tracking + (seg.tracking ?? 0) : 0);
      if (open && open.key === key) {
        open.to = Math.max(open.to, end);
        open.endSeg = i;
        lined.add(i);
        continue;
      }
      open = { kind, key, from: xs[i]!, to: end, em, axis: -CENTRAL * em + (seg.baselineShift ?? 0), startSeg: i, endSeg: i };
      runs.push(open);
      lined.add(i);
    }
  }
  // Two runs that meet each give up an eighth of an em.
  for (const a of runs) {
    for (const b of runs) {
      if (a === b || a.kind !== b.kind || b.startSeg !== a.endSeg + 1) continue;
      a.to -= a.em / 8;
      b.from += b.em / 8;
    }
  }
  for (const r of runs) {
    const length = r.to - r.from;
    if (length <= 0) continue;
    const edge = r.axis + r.em / 2;
    if (r.kind === 'line') {
      out.push({ kind: 'line', x: r.from - x0, y: edge + LINE_AT * r.em, length, thickness: Math.max(0.5, STROKE * r.em), ...paint });
    } else {
      out.push({
        kind: 'wavy',
        x: r.from - x0,
        y: edge + WAVE_AT * r.em,
        length,
        thickness: Math.max(0.5, STROKE * r.em * 0.9),
        amplitude: WAVE_HEIGHT * r.em,
        wavelength: WAVE_LENGTH * r.em,
        ...paint,
      });
    }
  }

  // Emphasis dots, one per character.
  segments.forEach((seg, i) => {
    const dots = seg.cjkMarks?.dots;
    if (!dots || seg.kind !== 'text' || seg.warichu || seg.inserted) return;
    const font = segmentFont(seg, block);
    const em = fontEm(font);
    const axis = -CENTRAL * em + (seg.baselineShift ?? 0);
    const size = DOT[dots.style] * em;
    const under = dots.position === 'under';
    const past = under && lined.has(i) ? PAST_LINE * em : 0;
    const y = under ? axis + em / 2 + GAP * em + past + size / 2 : axis - em / 2 - GAP * em - size / 2;
    const t = tracking + (seg.tracking ?? 0);
    const inset = seg.ruby ? seg.inkOffset ?? 0 : 0;
    const box = seg.ruby ? Math.max(0, widths[i]! - 2 * inset) : widths[i]!;
    for (const { g, at, adv } of graphemeAdvances(seg, box, font)) {
      if (NO_DOT_RE.test(g)) continue;
      out.push({
        kind: dots.style === 'dot' ? 'dot' : dots.style,
        x: xs[i]! + inset + at + (adv - t) / 2 - x0,
        y,
        size,
        thickness: Math.max(0.4, OUTLINE * em),
        ...(dots.fill === 'open' ? { open: true } : {}),
        ...paint,
      });
    }
  });
  return out;
}

/** How much line gap (em of the text) a line's marks need: half an em on
 *  one side, five eighths on both (clreq §5.6.1). 0 when it has none. */
function marksNeed(line: VDTLine): number {
  const sides = new Set<string>();
  for (const seg of line.segments ?? []) {
    const m = seg.cjkMarks;
    if (!m) continue;
    if (m.dots) sides.add(m.dots.position);
    if (m.properName !== undefined || m.bookTitle !== undefined) sides.add('under');
  }
  return sides.size === 0 ? 0 : sides.size > 1 ? 0.625 : 0.5;
}

/** How much line gap (em of the text) a line's ruby readings over or under
 *  it need: the reading's size (a zhuyin column's, with its tone mark). */
function rubyNeed(line: VDTLine, em: number): number {
  let need = 0;
  for (const seg of line.segments ?? []) {
    const r = seg.ruby;
    if (!r || r.position === 'right') continue;
    const rtEm = fontEm(r.fontString);
    const size = isZhuyin(r.text) ? rtEm * ZHUYIN_SIZE_RATIO * (/[ˊˇˋˉ]/.test(r.text) ? 1.75 : 1) : rtEm;
    need = Math.max(need, size / em);
  }
  return need;
}

/** How far a line's marks and readings reach out of its em box, px: over
 *  it (`head`: above in horizontal text, right in vertical text) and
 *  under it (`foot`), and whether readings reach that far on each side. */
interface LineReach {
  head: number;
  foot: number;
  headRuby: boolean;
  footRuby: boolean;
}

/** The {@link LineReach} of a line whose text is `em` px (its em box
 *  centred on the central axis): marks by their drawn extent, readings by
 *  their em box (an upright tone mark by its advance across the line). */
function lineReach(line: VDTLine, em: number): LineReach {
  const top = -(CENTRAL + 0.5) * em;
  const bottom = (0.5 - CENTRAL) * em;
  const reach: LineReach = { head: 0, foot: 0, headRuby: false, footRuby: false };
  const extend = (lo: number, hi: number, ruby: boolean): void => {
    if (top - lo > reach.head + 1e-9) {
      reach.head = top - lo;
      reach.headRuby = ruby;
    } else if (ruby && top - lo > 1e-9) reach.headRuby = true;
    if (hi - bottom > reach.foot + 1e-9) {
      reach.foot = hi - bottom;
      reach.footRuby = ruby;
    } else if (ruby && hi - bottom > 1e-9) reach.footRuby = true;
  };
  for (const m of line.marks ?? []) {
    const half = m.kind === 'line' ? m.thickness / 2 : m.kind === 'wavy' ? (m.amplitude ?? 0) / 2 + m.thickness / 2 : (m.size ?? 0) / 2;
    extend(m.y - half, m.y + half, false);
  }
  for (const seg of line.segments ?? []) {
    const r = seg.ruby;
    if (!r || r.position === 'right') continue;
    for (const run of r.runs) {
      const runEm = fontEm(run.fontString);
      if (run.upright) {
        const axis = run.dy - CENTRAL * runEm;
        let w = 0;
        for (const g of graphemesOf(run.text)) w = Math.max(w, measureTextWidth(g, run.fontString));
        extend(axis - w / 2, axis + w / 2, true);
      } else {
        extend(run.dy - (CENTRAL + 0.5) * runEm, run.dy + (0.5 - CENTRAL) * runEm, true);
      }
    }
  }
  return reach;
}

/**
 * Set `VDTLine.marks` on every line of the document that holds Chinese
 * marks, and report the paragraphs whose line gap is narrower than their
 * marks or readings need (`cjkMarksExceedLeading`, `rubyExceedsLeading`),
 * once per paragraph. `cjk` is the resolved configuration (its
 * `annotationColor`).
 *
 * The gap between two lines of a column is shared: what the upper line
 * sets under it and the lower one over it (dots under one line and the
 * readings over the next, in one paragraph or across two) must fit in it
 * together. Where they do not, the lower line's paragraph is reported
 * (`rubyExceedsLeading` when readings take part, else
 * `cjkMarksExceedLeading`).
 */
export function annotateDocument(doc: VDTDocument, cjk: ResolvedCjkConfig | undefined): ContentWarning[] {
  const warnings: ContentWarning[] = [];
  const color = cjk?.annotationColor?.hex;
  const reported = new Set<string>();
  const whereOf = (block: VDTBlock): string => `${block.sourceStart ?? block.lines[0]?.sourceStart ?? block.id}`;
  const atOf = (block: VDTBlock) => ({
    ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : block.lines[0]?.sourceStart !== undefined ? { sourceStart: block.lines[0].sourceStart } : {}),
    ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
    ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
  });
  /** The lines of each column's annotated paragraphs, in order, with
   *  their reach. */
  const columns = new Map<string, { line: VDTLine; block: VDTBlock; em: number; reach: LineReach }[]>();
  for (const block of doc.blocks) {
    if (block.type === 'resource' || block.designOverlay) continue;
    let marked = false;
    let ruby = false;
    for (const line of block.lines) {
      const segs = line.segments;
      if (!segs) continue;
      if (segs.some((s) => s.cjkMarks)) {
        marked = true;
        const marks = lineMarks(line, block, color);
        if (marks.length > 0) line.marks = marks;
      }
      if (segs.some((s) => s.ruby && s.ruby.position !== 'right')) ruby = true;
    }
    if (!marked && !ruby) continue;
    const em = fontEm(block.fontString);
    const first = block.lines[0];
    if (!first || em <= 0) continue;
    if (block.pageIndex >= 0) {
      // Lines of plain paragraphs between two annotated ones are left
      // out: the gap is then measured across them, and is wide.
      const key = `${block.pageIndex}:${block.columnIndex}`;
      let column = columns.get(key);
      if (!column) columns.set(key, (column = []));
      for (const line of block.lines) column.push({ line, block, em, reach: lineReach(line, em) });
    }
    const gapEm = (first.bbox.height - em) / em;
    const at = atOf(block);
    const where = whereOf(block);
    if (marked) {
      const need = Math.max(...block.lines.map(marksNeed));
      if (need > 0 && gapEm < need - 1e-6 && !reported.has(`m${where}`)) {
        reported.add(`m${where}`);
        warnings.push({ kind: 'cjkMarksExceedLeading', text: first.text, gapEm: round(gapEm), neededEm: need, ...at });
      }
    }
    if (ruby) {
      const need = Math.max(...block.lines.map((l) => rubyNeed(l, em)));
      if (need > 0 && gapEm < need - 1e-6 && !reported.has(`r${where}`)) {
        reported.add(`r${where}`);
        warnings.push({ kind: 'rubyExceedsLeading', text: first.text, gapEm: round(gapEm), neededEm: round(need), ...at });
      }
    }
  }
  // The gaps two lines of a column share.
  for (const column of columns.values()) {
    for (let i = 1; i < column.length; i++) {
      const a = column[i - 1]!;
      const b = column[i]!;
      const need = a.reach.foot + b.reach.head;
      if (need <= 0) continue;
      const gap = (b.line.baseline - (CENTRAL + 0.5) * b.em) - (a.line.baseline + (0.5 - CENTRAL) * a.em);
      if (need <= gap + 1e-6) continue;
      const ruby = a.reach.footRuby || b.reach.headRuby;
      const key = `${ruby ? 'r' : 'm'}${whereOf(b.block)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      warnings.push({
        kind: ruby ? 'rubyExceedsLeading' : 'cjkMarksExceedLeading',
        text: b.line.text,
        gapEm: round(gap / b.em),
        neededEm: round(need / b.em),
        ...atOf(b.block),
      });
    }
  }
  return warnings;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
