// lineMarks: the dots, lines and ruby of one line (#1278: split out of
// cjkMarks.ts).
import type { VDTLine, VDTLineMark, VDTSegmentMarks, VDTLineSegment, VDTRuby } from '../../vdt.js';
import { CENTRAL } from '../../measure/cjk/cjkAnnotate.js';
import { fontEm } from '../../measure/vertical.js';
import { type BlockLike, type VerticalMarks, segmentPositions, segmentFont, LINE_AT, STROKE, WAVE_AT, WAVE_HEIGHT, WAVE_LENGTH, DOT, PAST_LINE, GAP, graphemeAdvances, NO_DOT_RE, OUTLINE, DOUBLE_GAP, DOTTED_SIZE, DOTTED_PITCH } from './geometry.js';

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
