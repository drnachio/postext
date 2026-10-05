/**
 * The Chinese and Japanese interlinear marks of a laid-out document (#193,
 * #421): emphasis dots (着重号, 傍点), the proper-name line (专名号), the
 * wavy book-title line (书名号甲式) and side lines (傍線), as
 * `VDTLine.marks` — primitives the renderers draw as they are — and the
 * leading checks of marks and ruby (#194).
 *
 * The measurer flags the segments (`VDTLineSegment.cjkMarks`); the marks are
 * placed once the document is laid out, where the renderers paint each
 * segment ({@link segmentPositions}: alignment and the justified word
 * spaces of a line included), in the flow frame of the line. Dots are
 * centred on each character, spacing after it left out, and skip
 * punctuation and spaces; a line spans its run's characters, and where two
 * runs meet each end gives up an eighth of an em (clreq §5.6.1). A side
 * line runs on across every character of its run, punctuation and spaces
 * included. Marks sit against the characters' em box, centred on the
 * font's central axis, on the side they were given (`over`: above
 * horizontal text, right of vertical text): when dots and a line mark the
 * same text on one side, the line is nearer the text, and dots on the side
 * of a ruby reading go outside it (as CSS Text Decoration 3 sets them).
 */

import type { ContentWarning, VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment, VDTRuby, VDTSegmentMarks } from './vdt';
import type { CjkRegion, ResolvedCjkConfig } from './types';
import { lineInkExtent, lineTrailingTracking } from './lineInk';
import { measureTextWidth } from './measure/canvas';
import { graphemesOf } from './measure/graphemes';
import { isCjkGrapheme } from './measure/cjkClasses';
import { CENTRAL, ZHUYIN_SIZE_RATIO, isZhuyin } from './measure/cjkAnnotate';
import { fontEm } from './measure/vertical';
import { latinReadingLift } from './measure/rubyLift';
import { verticalRuns } from './writingMode';

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
/** A double side line: its two rules' centres this far apart. */
const DOUBLE_GAP = 0.08;
/** A dotted side line: its dots' diameter and the pitch they come near. */
const DOTTED_SIZE = 0.08;
const DOTTED_PITCH = 0.16;
/** How far dots move out when a line marks the same text on their side. */
const PAST_LINE = 0.16;

/** Where each grapheme of a segment starts and how far it advances, px
 *  from the segment's start: CJK characters share the segment's width
 *  evenly (the composer only puts characters that advance alike in one
 *  segment); anything else is measured and scaled to the segment. Down a
 *  vertical line a number set in one upright cell (`:tcy[…]`, or up to
 *  `cjk.uprightDigits` digits) is one character: it takes one dot; the
 *  letters of an `:upright[…]` run stand one to a cell, whatever their
 *  horizontal widths. */
function graphemeAdvances(seg: VDTLineSegment, width: number, font: string, vertical?: VerticalMarks): { g: string; at: number; adv: number }[] {
  const graphemes = graphemesOf(seg.text);
  if (graphemes.length === 0) return [];
  const out: { g: string; at: number; adv: number }[] = [];
  if (vertical && seg.tcy) return [{ g: seg.text, at: 0, adv: width }];
  if (vertical && seg.orientation === 'upright') {
    const adv = width / graphemes.length;
    graphemes.forEach((g, i) => out.push({ g, at: i * adv, adv }));
    return out;
  }
  if (vertical && seg.orientation !== 'sideways' && vertical.uprightDigits > 0 && /[0-9]/.test(seg.text)) {
    const em = fontEm(font);
    const pieces = verticalRuns(graphemes, vertical.region, vertical.uprightDigits).flatMap((run) =>
      run.cell !== undefined ? [{ g: run.text, w: em * run.cell }] : graphemesOf(run.text).map((g) => ({ g, w: measureTextWidth(g, font) })));
    const sum = pieces.reduce((a, p) => a + p.w, 0);
    const k = sum > 0 ? width / sum : 1;
    let at = 0;
    for (const p of pieces) {
      out.push({ g: p.g, at, adv: p.w * k });
      at += p.w * k;
    }
    return out;
  }
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

/** What a vertical line's dots need to find its upright cells. */
interface VerticalMarks {
  region: CjkRegion;
  uprightDigits: number;
}

/** The marks of one line (see the module comment), relative to it; empty
 *  when it has none. `color` is `cjk.annotationColor` (hex), if set;
 *  `vertical` is set on a vertical page. */
export function lineMarks(line: VDTLine, block: BlockLike, color?: string, vertical?: VerticalMarks): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.cjkMarks)) return [];
  const { xs, widths } = segmentPositions(line, block);
  const x0 = line.bbox.x;
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const out: VDTLineMark[] = [];
  const paint = color !== undefined ? { color } : {};

  // Lines first: they decide where dots on the same side of the same text
  // go. The Chinese marks' lines (`line`, `wavy`) go under the text; side
  // lines (`side`) on their own side.
  type Sideline = NonNullable<VDTSegmentMarks['sideline']>;
  type Run = { kind: 'line' | 'wavy' | 'side'; key: string; from: number; to: number; em: number; axis: number; startSeg: number; endSeg: number; side?: Sideline };
  const runs: Run[] = [];
  const lined = new Set<number>();
  const linedOver = new Set<number>();
  const idOf = (kind: Run['kind'], seg: VDTLineSegment | undefined): number | undefined =>
    kind === 'line' ? seg?.cjkMarks?.properName : kind === 'wavy' ? seg?.cjkMarks?.bookTitle : seg?.cjkMarks?.sideline?.id;
  for (const kind of ['line', 'wavy', 'side'] as const) {
    let open: Run | undefined;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const id = idOf(kind, seg);
      // A space inside a run (for a side line, anything the layout added
      // there too: a Han–Latin space, a bracket): the line goes on when
      // the run does.
      const bridges = (s: VDTLineSegment): boolean => s.kind === 'space' || (kind === 'side' && !!s.inserted && !s.warichu);
      if (id === undefined && open && bridges(seg)) {
        let j = i + 1;
        while (j < segments.length && bridges(segments[j]!)) j++;
        const nextId = idOf(kind, segments[j]);
        if (nextId !== undefined && `${kind}:${nextId}` === open.key) continue;
      }
      if (id === undefined || seg.warichu || (seg.inserted && kind !== 'side')) {
        open = undefined;
        continue;
      }
      const key = `${kind}:${id}`;
      const font = segmentFont(seg, block);
      const em = fontEm(font);
      const end = xs[i]! + widths[i]! - (seg.kind === 'text' ? tracking + (seg.tracking ?? 0) : 0);
      const over = kind === 'side' && seg.cjkMarks!.sideline!.position === 'over';
      if (open && open.key === key) {
        open.to = Math.max(open.to, end);
        open.endSeg = i;
        (over ? linedOver : lined).add(i);
        continue;
      }
      open = {
        kind,
        key,
        from: xs[i]!,
        to: end,
        em,
        axis: -CENTRAL * em + (seg.baselineShift ?? 0),
        startSeg: i,
        endSeg: i,
        ...(kind === 'side' ? { side: seg.cjkMarks!.sideline! } : {}),
      };
      runs.push(open);
      (over ? linedOver : lined).add(i);
    }
  }
  // Two runs that meet each give up an eighth of an em.
  for (const a of runs) {
    for (const b of runs) {
      if (a === b || a.kind !== b.kind || b.startSeg !== a.endSeg + 1) continue;
      if (a.side && a.side.position !== b.side?.position) continue;
      a.to -= a.em / 8;
      b.from += b.em / 8;
    }
  }
  for (const r of runs) {
    const length = r.to - r.from;
    if (length <= 0) continue;
    if (r.side) {
      out.push(sidelineMark(r.side, r.from - x0, length, r.axis, r.em, paint));
      continue;
    }
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
    const past = (under ? lined : linedOver).has(i) ? PAST_LINE * em : 0;
    let y = under ? axis + em / 2 + GAP * em + past + size / 2 : axis - em / 2 - GAP * em - past - size / 2;
    // A reading on the same side: the dots go outside it.
    const reading = seg.ruby && seg.ruby.position === dots.position ? rubyExtent(seg.ruby) : undefined;
    if (reading) y = under ? Math.max(y, reading.foot + GAP * em + size / 2) : Math.min(y, reading.head - GAP * em - size / 2);
    const t = tracking + (seg.tracking ?? 0);
    const inset = seg.ruby ? seg.inkOffset ?? 0 : 0;
    const box = seg.ruby ? Math.max(0, widths[i]! - 2 * inset) : widths[i]!;
    for (const { g, at, adv } of graphemeAdvances(seg, box, font, vertical)) {
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

/** How far a reading reaches across its line, px from the baseline: its
 *  runs' em boxes (`head` the least, `foot` the most). */
function rubyExtent(ruby: VDTRuby): { head: number; foot: number } | undefined {
  let head = Infinity;
  let foot = -Infinity;
  for (const run of ruby.runs) {
    const runEm = fontEm(run.fontString);
    head = Math.min(head, run.dy - (CENTRAL + 0.5) * runEm);
    foot = Math.max(foot, run.dy + (0.5 - CENTRAL) * runEm);
  }
  return head <= foot ? { head, foot } : undefined;
}

/** The mark of a side line (傍線) `length` px long from `x`, against the
 *  em box of text `em` px high whose central axis is `axis`: a rule, two
 *  rules, a wave or a row of dots, on the side it was given. */
function sidelineMark(line: NonNullable<VDTSegmentMarks['sideline']>, x: number, length: number, axis: number, em: number, paint: { color?: string }): VDTLineMark {
  const sign = line.position === 'over' ? -1 : 1;
  const edge = axis + sign * (em / 2);
  switch (line.style) {
    case 'double': {
      const gap = DOUBLE_GAP * em;
      return { kind: 'double', x, y: edge + sign * (LINE_AT * em + gap / 2), length, gap, thickness: Math.max(0.4, OUTLINE * em), ...paint };
    }
    case 'wavy':
      return {
        kind: 'wavy',
        x,
        y: edge + sign * WAVE_AT * em,
        length,
        thickness: Math.max(0.5, STROKE * em * 0.9),
        amplitude: WAVE_HEIGHT * em,
        wavelength: WAVE_LENGTH * em,
        ...paint,
      };
    case 'dotted': {
      const size = DOTTED_SIZE * em;
      // The pitch that sets the dots evenly from one end to the other.
      const span = Math.max(0, length - size);
      const count = Math.max(1, Math.round(span / (DOTTED_PITCH * em)));
      return { kind: 'dotted', x, y: edge + sign * LINE_AT * em, length, size, gap: span / count, thickness: size, ...paint };
    }
    default:
      return { kind: 'line', x, y: edge + sign * LINE_AT * em, length, thickness: Math.max(0.5, STROKE * em), ...paint };
  }
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
    if (m.sideline) sides.add(m.sideline.position);
  }
  return sides.size === 0 ? 0 : sides.size > 1 ? 0.625 : 0.5;
}

/** How much line gap (em of the text) a line's ruby readings over or under
 *  it need: the reading's size (a zhuyin column's, with its tone mark; a
 *  Latin reading over the base, with the lift that clears its descenders). */
function rubyNeed(line: VDTLine, em: number): number {
  let need = 0;
  for (const seg of line.segments ?? []) {
    // A footnote marker in the line gap (JLReq §4.2.3) needs its size, as
    // a reading does.
    for (const run of seg.sideMarker?.runs ?? []) need = Math.max(need, fontEm(run.fontString) / em);
    const r = seg.ruby;
    if (!r || r.position === 'right') continue;
    const rtEm = fontEm(r.fontString);
    // A Latin reading over its base stands higher by its lift (rubyLift.ts).
    const lift = r.position === 'under' ? 0 : latinReadingLift(r.text, r.fontString, em);
    const size = isZhuyin(r.text) ? rtEm * ZHUYIN_SIZE_RATIO * (/[ˊˇˋˉ]/.test(r.text) ? 1.75 : 1) : rtEm + lift;
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
    const half = m.kind === 'line' ? m.thickness / 2
      : m.kind === 'wavy' ? (m.amplitude ?? 0) / 2 + m.thickness / 2
        : m.kind === 'double' ? (m.gap ?? 0) / 2 + m.thickness / 2
          : (m.size ?? 0) / 2;
    extend(m.y - half, m.y + half, false);
  }
  for (const seg of line.segments ?? []) {
    for (const run of seg.sideMarker?.runs ?? []) {
      const runEm = fontEm(run.fontString);
      extend(run.dy - (CENTRAL + 0.5) * runEm, run.dy + (0.5 - CENTRAL) * runEm, true);
    }
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
        const flow = block.pageIndex >= 0 ? doc.pages[block.pageIndex]?.flow : undefined;
        const vertical = flow?.writingMode === 'vertical-rl' ? { region: cjk?.region ?? 'mainland', uprightDigits: cjk?.uprightDigits ?? 2 } : undefined;
        const marks = lineMarks(line, block, color, vertical);
        if (marks.length > 0) line.marks = marks;
      }
      // Only the CJK composer sets ruby (#194). A footnote marker in the
      // line gap is checked as a reading is, in any line.
      if (line.cjkComposed && segs.some((s) => s.ruby && s.ruby.position !== 'right')) ruby = true;
      if (segs.some((s) => s.sideMarker)) ruby = true;
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
