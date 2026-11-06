// Lines as Word paragraphs (#1392). A text item's lines are cut into
// groups Word can set as one paragraph (same alignment, same exact pitch,
// same measure but for a first-line indent) and the groups into chunks,
// one text box each. Every engine line ends in `<w:br/>` but a
// paragraph's real last line; Word stretches a justified line that ends
// in a manual break (no `doNotExpandShiftReturn`), so a fragment that
// continues elsewhere ends with one too. The empty line such a break
// opens falls below the box (exact height, no autofit) and is hidden, so
// a justified group that is not the item's last starts a new chunk.

import type { DisplayItem, DisplayLine } from '../../paint/displayList/types.js';
import type { MapFormat, MapFragment } from '../anchors/types.js';
import { escapeXml } from '../xml.js';
import { baselineOffset } from './metrics.js';
import { emitRun, formatFlags, joinWordRuns, linkTarget, runProps, unpadded, wordText, type EmittedRun, type InlineDrawing } from './runs.js';
import type { Annotation } from './eastAsian.js';
import { styleIdOf } from './styles.js';
import { twips, twipsToPx } from './units.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** Measure edges equal within this many px. */
const EPS = 0.05;
/** A gap between two runs kept as room, px. */
const GAP_MIN = 0.5;
/** Room on a box's free side so a ragged line Word sets a hair wider
 *  than the engine does not wrap (pt). */
export const SLACK_PT = 2;
/** Word's exact line spacing runs from 1 pt to 1584 pt (twips). */
export const MIN_PITCH = 20;
export const MAX_PITCH = 31680;
/** Room under a box's last line, at most this many twips (and never half
 *  a line, so the empty line a closing break opens still falls outside):
 *  renderers that round line heights on their own grid (LibreOffice's
 *  1/100 mm) must not push the last line out of an exact-height box. */
export const BOTTOM_ROOM = 60;

type Jc = 'both' | 'left' | 'center' | 'right';

export interface LinePlan {
  /** Exact line pitch, twips. */
  h: number;
  /** The line cannot follow the one before at an exact pitch Word takes
   *  (past 1584 pt, or not below it): it starts a new box. */
  start?: boolean;
}

export interface Group {
  jc: Jc;
  from: number;
  to: number;
  pitch: number;
  rtl: boolean;
  firstL: number;
  firstR: number;
  restL: number;
  restR: number;
  /** The last line ends with `<w:br/>` (a justified line). */
  endsWithBreak: boolean;
}

export interface Chunk {
  from: number;
  to: number;
  groups: Group[];
}

/** Room before the next run of the same direction, per run (px; runs
 *  set apart, a number flush right). Vertical runs go by x too, along
 *  the line in the item's unturned frame. */
export function runGaps(line: DisplayLine): number[] {
  const gaps = line.runs.map(() => 0);
  const rtl = line.rtl === true;
  let prev = -1;
  line.runs.forEach((r, i) => {
    if (r.text.length === 0) return;
    const p = line.runs[prev];
    if (p && (p.rtl === true) === rtl && (r.rtl === true) === rtl) {
      const gap = rtl ? p.x - (r.x + r.width) : r.x - (p.x + p.width);
      if (gap > GAP_MIN) gaps[prev] = gap;
    }
    prev = i;
  });
  return gaps;
}

/** A line's measure, its end side taken out to its runs where they
 *  hang past it (CJK punctuation hung at the line end): Word, without
 *  kinsoku, would move what hangs to the next line. */
function edges(l: DisplayLine): { L: number; R: number } {
  let L = l.x;
  let R = l.x + l.width;
  for (const r of l.runs) {
    if (r.text.length === 0) continue;
    if (l.rtl) L = Math.min(L, r.x);
    else R = Math.max(R, r.x + r.width);
  }
  return { L: L < l.x - EPS ? L : l.x, R: R > l.x + l.width + EPS ? R : l.x + l.width };
}

const clampPitch = (h: number): number => Math.min(MAX_PITCH, Math.max(MIN_PITCH, h));

/** Pitches of an item's lines. Word sets a line's baseline 4/5 of the way
 *  down its box (`baselineOffset`), so each pitch depends on the one
 *  before: line i's box is as tall as lands its baseline where the engine
 *  set it, reckoned from the first line of its run so twips never drift.
 *  A run's first line takes the gap to the next line (the two then share
 *  a paragraph), else its own line height. A line no exact pitch reaches
 *  starts a new run: a new box (`start`), or in a table cell (`boxes`
 *  false), its clamped pitch, the lines after it keeping their spacing. */
export function planLines(ctx: WriterContext, lines: readonly DisplayLine[], boxes = true): LinePlan[] {
  const plans: LinePlan[] = lines.map((l) => ({ h: twips(l.lineHeight, ctx.dpi) }));
  const rising = (i: number): boolean => lines[i]!.baseline > lines[i - 1]!.baseline;
  const opening = (i: number): number => {
    const next = i + 1 < lines.length && rising(i + 1) ? twips(lines[i + 1]!.baseline - lines[i]!.baseline, ctx.dpi) : 0;
    return clampPitch(next >= MIN_PITCH && next <= MAX_PITCH ? next : plans[i]!.h);
  };
  if (plans.length === 0) return plans;
  plans[0]!.h = opening(0);
  let origin = 0;
  let top = -(plans[0]!.h * 4) / 5;
  for (let i = 1; i < lines.length; i++) {
    top += plans[i - 1]!.h;
    const h = Math.round(((twips(lines[i]!.baseline - lines[origin]!.baseline, ctx.dpi) - top) * 5) / 4);
    if (rising(i) && h >= MIN_PITCH && h <= MAX_PITCH) {
      plans[i]!.h = h;
      continue;
    }
    plans[i]!.start = true;
    plans[i]!.h = boxes ? opening(i) : clampPitch(h);
    origin = i;
    top = -(plans[i]!.h * 4) / 5;
  }
  return plans;
}

/** The measure edges a paragraph of this alignment pins; the others only
 *  give Word room (logical start and end). */
function pinned(jc: Jc, rtl: boolean): { start: boolean; end: boolean } {
  if (jc === 'both' || jc === 'center') return { start: true, end: true };
  const startSide = rtl ? 'right' : 'left';
  return jc === startSide ? { start: true, end: false } : { start: false, end: true };
}

function jcOf(line: DisplayLine): Jc {
  return line.align === 'justify' ? 'both' : line.align;
}

/** Cut lines into paragraphs and boxes. `boxes` false (table cells): one
 *  chunk whatever the breaks. */
export function planChunks(lines: readonly DisplayLine[], plans: LinePlan[], boxes = true): Chunk[] {
  const chunks: Chunk[] = [];
  let chunk: Chunk | undefined;
  let g: Group | undefined;
  const startChunk = (i: number): void => {
    chunk = { from: i, to: i, groups: [] };
    chunks.push(chunk);
    g = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const { L, R } = edges(line);
    const rtl = line.rtl === true;
    if (!chunk || (boxes && plans[i]!.start)) startChunk(i);
    let join = false;
    if (g && g.pitch === plans[i]!.h && g.rtl === rtl) {
      const pins = pinned(g.jc, rtl);
      const start = rtl ? R : L;
      const end = rtl ? L : R;
      const endOk = !pins.end || Math.abs(end - (rtl ? g.firstL : g.firstR)) < EPS;
      const startOk = !pins.start || g.to === g.from || Math.abs(start - (rtl ? g.restR : g.restL)) < EPS;
      // A ragged line closes a justified paragraph (it is its last line).
      const closed = g.jc === 'both' && lines[g.to]!.align !== 'justify';
      const ragged = rtl ? 'right' : 'left';
      const alignOk = g.jc === 'both' ? line.align === 'justify' || line.align === ragged : jcOf(line) === g.jc;
      join = endOk && startOk && !closed && alignOk;
    }
    // A justified paragraph ended by a break: the empty line it opens must
    // fall outside a box, so what follows takes a box of its own.
    if (!join && g && boxes && g.endsWithBreak) startChunk(i);
    if (join && g) {
      if (g.to === g.from) {
        g.restL = L;
        g.restR = R;
      }
      g.to = i;
    } else {
      g = { jc: jcOf(line), from: i, to: i, pitch: plans[i]!.h, rtl, firstL: L, firstR: R, restL: L, restR: R, endsWithBreak: false };
      chunk!.groups.push(g);
    }
    g.endsWithBreak = line.align === 'justify';
    chunk!.to = i;
  }
  return chunks;
}

/** The px box of a chunk: its lines' measures plus slack on both sides. */
export function chunkBox(ctx: WriterContext, lines: readonly DisplayLine[], chunk: Chunk, plans: LinePlan[]): { x: number; y: number; width: number; height: number } {
  let L = Infinity;
  let R = -Infinity;
  let height = 0;
  let minPitch = Infinity;
  for (let i = chunk.from; i <= chunk.to; i++) {
    const e = edges(lines[i]!);
    L = Math.min(L, e.L);
    R = Math.max(R, e.R);
    height += plans[i]!.h;
    minPitch = Math.min(minPitch, plans[i]!.h);
  }
  height += Math.min(BOTTOM_ROOM, Math.floor(minPitch / 2) - 1);
  // Slack on both sides: a pinned side keeps it as indent, so the line
  // stays where the engine set it, and the free side keeps it as room
  // (an end-aligned folio's free side is its start, #1444).
  const slack = (SLACK_PT * ctx.dpi) / 72;
  L -= slack;
  R += slack;
  const first = lines[chunk.from]!;
  const p = plans[chunk.from]!;
  const top = first.baseline - baselineOffset(twipsToPx(p.h, ctx.dpi));
  return { x: L, y: top, width: R - L, height: twipsToPx(height, ctx.dpi) };
}

/** What a run of paragraphs writes. */
export interface TextOut {
  xml: string;
  text: string;
  map: number[];
  formats: MapFormat[];
  /** Item text offset → chunk text offset, per line start. */
  lineStarts: { item: number; out: number; length: number }[];
  drawings: (InlineDrawing & { baseline: number })[];
  /** Marks beside runs (kanbun) and their rules, item's unturned frame. */
  annotations: Annotation[];
  rules: NonNullable<EmittedRun['rules']>;
  /** Atoms the writer adds (forced breaks), at offsets of `text`. */
  atoms: NonNullable<MapFragment['atoms']>;
}

export interface EmitOptions {
  /** Spacing before the first paragraph, twips (table cells). */
  spaceBefore?: number;
  bookmarkStart?: string;
  bookmarkEnd?: string;
  /** Item text offset of each line. */
  offsets: number[];
}

/** `w:pPr` of a group inside the box [boxL, boxR]. */
function groupProps(ctx: WriterContext, item: TextItem, g: Group, boxL: number, boxR: number, spaceBefore: number): string {
  const p: string[] = [`<w:pStyle w:val="${styleIdOf(item)}"/>`, '<w:widowControl w:val="0"/>', '<w:suppressAutoHyphens/>', '<w:kinsoku w:val="0"/>', '<w:overflowPunct w:val="0"/>', '<w:autoSpaceDE w:val="0"/>', '<w:autoSpaceDN w:val="0"/>'];
  if (g.rtl) p.push('<w:bidi/>');
  p.push('<w:adjustRightInd w:val="0"/>', '<w:snapToGrid w:val="0"/>');
  p.push(`<w:spacing w:before="${Math.max(0, spaceBefore)}" w:after="0" w:line="${g.pitch}" w:lineRule="exact"/>`);
  // Indents are logical: start/end of the paragraph (Word reads left and
  // right of a bidi paragraph as its start and end).
  const pins = pinned(g.jc, g.rtl);
  let start: number, end: number, first: number, jc: Jc = g.jc;
  if (g.rtl) {
    start = pins.start ? twips(boxR - g.restR, ctx.dpi) : 0;
    first = pins.start ? twips(g.restR - g.firstR, ctx.dpi) : 0;
    end = pins.end ? twips(g.firstL - boxL, ctx.dpi) : 0;
    if (jc === 'left') jc = 'right';
    else if (jc === 'right') jc = 'left';
  } else {
    start = pins.start ? twips(g.restL - boxL, ctx.dpi) : 0;
    first = pins.start ? twips(g.firstL - g.restL, ctx.dpi) : 0;
    end = pins.end ? twips(boxR - g.firstR, ctx.dpi) : 0;
  }
  // A centred group is pinned on both sides; equal room off both indents
  // keeps its axis and lets a line Word sets a hair wider fit (#1444).
  if (jc === 'center') {
    const room = Math.max(0, Math.min(start, start + first, end));
    start -= room;
    end -= room;
  }
  const firstAttr = first >= 0 ? `w:firstLine="${first}"` : `w:hanging="${-first}"`;
  p.push(`<w:ind w:left="${start}" w:right="${end}" ${firstAttr}/>`);
  p.push(`<w:jc w:val="${jc}"/>`);
  return `<w:pPr>${p.join('')}</w:pPr>`;
}

/** The source of a forced break between `line` and the next: from after
 *  the line's last mapped character through the source line end. */
function forcedBreakAtom(line: DisplayLine, next: DisplayLine | undefined): { start: number; end: number; kind: string } | undefined {
  if (!next) return undefined;
  let last = -1;
  for (const m of line.map) if (m >= 0) last = m;
  const first = next.map.find((m) => m >= 0);
  if (last < 0 || first === undefined || first <= last + 1) return undefined;
  return { start: last + 1, end: first, kind: 'break' };
}

/** Paragraphs of `groups` (lines of `item`) inside the box [boxL, boxR]. */
export function emitGroups(ctx: WriterContext, item: TextItem, groups: Group[], boxL: number, boxR: number, opts: EmitOptions): TextOut {
  const xml: string[] = [];
  const out: TextOut = { xml: '', text: '', map: [], formats: [], lineStarts: [], drawings: [], annotations: [], rules: [], atoms: [] };
  let text = '';
  const pushFormat = (start: number, end: number, flags: string, href: string | undefined): void => {
    if (!flags && !href) return;
    const last = out.formats[out.formats.length - 1];
    if (last && last.end === start && last.flags === flags && last.href === href) last.end = end;
    else out.formats.push({ start, end, flags, ...(href ? { href } : {}) });
  };
  groups.forEach((g, gi) => {
    xml.push('<w:p>', groupProps(ctx, item, g, boxL, boxR, gi === 0 ? (opts.spaceBefore ?? 0) : 0));
    if (gi === 0 && opts.bookmarkStart) xml.push(opts.bookmarkStart);
    for (let i = g.from; i <= g.to; i++) {
      const line = item.lines[i]!;
      out.lineStarts.push({ item: opts.offsets[i]!, out: text.length, length: line.text.length });
      let link: string | undefined;
      let lineText = '';
      // The line's runs, kept apart until they are known to spell it.
      const lx: string[] = [];
      const lineFormats: MapFormat[] = [];
      const lineDrawings: TextOut['drawings'] = [];
      const lineMarks: Pick<TextOut, 'annotations' | 'rules'> = { annotations: [], rules: [] };
      let firstProps = '';
      // Consecutive runs of one style and link become one `w:r`.
      let pendingProps = '';
      let pendingText = '';
      const flush = (): void => {
        if (pendingText) lx.push(`<w:r>${pendingProps}<w:t xml:space="preserve">${escapeXml(pendingText)}</w:t></w:r>`);
        pendingText = '';
      };
      const flat = unpadded(line, runGaps(line));
      for (const { run, gap } of joinWordRuns(flat.line, flat.gaps)) {
        const emitted = emitRun(ctx, run, flat.line, gap);
        if (!emitted.text) continue;
        // The fallback line's style: the run's face and tracking, not the
        // spacing or scale fitted to that run alone.
        if (!firstProps) firstProps = runProps(ctx, run, { spacing: run.tracking ? twips(run.tracking, ctx.dpi) : 0, rtl: run.rtl === true });
        const target = linkTarget(run.href);
        if (target !== link) {
          flush();
          if (link) lx.push('</w:hyperlink>');
          if (target) lx.push(`<w:hyperlink r:id="${ctx.pkg.addLink(target)}">`);
          link = target;
        }
        if (emitted.drawing || emitted.xml) flush();
        if (emitted.xml) {
          // A run that writes its own XML (ruby, tate-chu-yoko, warichu).
          lx.push(emitted.xml);
          pendingProps = '';
        } else {
          // Pieces of equal properties (and spacing) join one `w:r`.
          for (const piece of emitted.pieces ?? [emitted]) {
            if (piece.rPr !== pendingProps) flush();
            pendingProps = piece.rPr;
            pendingText += piece.text;
          }
        }
        if (emitted.annotations) lineMarks.annotations.push(...emitted.annotations);
        if (emitted.rules) lineMarks.rules.push(...emitted.rules);
        const at = text.length + lineText.length;
        const flags = formatFlags(run);
        if (flags || run.href) lineFormats.push({ start: at, end: at + emitted.text.length, flags, ...(run.href ? { href: run.href } : {}) });
        lineText += emitted.text;
        if (emitted.drawing) lineDrawings.push({ ...emitted.drawing, baseline: line.baseline });
      }
      flush();
      if (link) lx.push('</w:hyperlink>');
      if (lineText.length === line.text.length) {
        xml.push(...lx);
        for (const f of lineFormats) pushFormat(f.start, f.end, f.flags, f.href);
        out.drawings.push(...lineDrawings);
        out.annotations.push(...lineMarks.annotations);
        out.rules.push(...lineMarks.rules);
      } else {
        // Runs that do not spell the line (or no runs): the line is written
        // whole in its first run's style, so the bookmark holds exactly
        // the fragment text and the map stays one entry per character.
        if (lineText.length > 0) ctx.warn('line-runs', `a line's runs do not spell its text (${JSON.stringify(line.text.slice(0, 40))})`);
        lineText = wordText(line.text);
        if (lineText) xml.push(`<w:r>${firstProps}<w:t xml:space="preserve">${escapeXml(lineText)}</w:t></w:r>`);
      }
      text += lineText;
      // One map entry per written character, whatever the line carries.
      if (line.map.length === lineText.length) out.map.push(...line.map);
      else for (let k = 0; k < lineText.length; k++) out.map.push(line.map[k] ?? -1);
      const lastOfGroup = i === g.to;
      if (line.hardBreak && (!lastOfGroup || g.endsWithBreak || gi < groups.length - 1)) {
        // A forced break (`\\` or two spaces before the line end) is an
        // atom over its markup, as the semantic writer maps it: deleting
        // the break in Word deletes the markup too.
        const atom = forcedBreakAtom(line, item.lines[i + 1]);
        if (atom) out.atoms.push({ at: text.length, ...atom });
      }
      if (!lastOfGroup || g.endsWithBreak) {
        xml.push('<w:r><w:br/></w:r>');
        text += '\n';
        out.map.push(-1);
      }
      if (lastOfGroup && gi < groups.length - 1) {
        // The paragraph mark between two groups of one fragment.
        text += '\n';
        out.map.push(-1);
      }
    }
    if (gi === groups.length - 1 && opts.bookmarkEnd) xml.push(opts.bookmarkEnd);
    xml.push('</w:p>');
  });
  out.xml = xml.join('');
  out.text = text;
  return out;
}
