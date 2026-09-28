/**
 * Chinese annotations on the canvas (#193, #194, #195): the marks the
 * layout set on a line (`VDTLine.marks`: emphasis dots, proper-name and
 * book-title lines), a ruby base's reading and a warichu note's rows. All
 * of it is placed by the layout in the flow frame of the line, so on a
 * vertical page it is painted inside the page's flow transform as the text
 * is, and text runs go through {@link fillFlowText} (cells upright, Latin
 * sideways).
 */

import type { VDTAnnotationRun, VDTLine, VDTLineMark, VDTRuby, VDTWarichu } from '../vdt';
import { fillFlowText, type TextPaintMode } from './verticalText';
import type { MarkCutRule } from '../measure/markCuts';

type Ctx = CanvasRenderingContext2D;

/** A sesame dot (﹅): a lens `size` long, a little over half as wide,
 *  leaning a third of a right angle, centred on the origin. */
export function sesamePath(size: number): { x: number; y: number }[][] {
  const l = size / 2;
  const w = size * 0.28;
  const a = -Math.PI / 6;
  const rot = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  // Two quadratic curves: [start, control, end] each.
  return [
    [rot(0, -l), rot(w, 0), rot(0, l)],
    [rot(0, l), rot(-w, 0), rot(0, -l)],
  ];
}

/** The points of a wave along a line mark, `step` px apart. */
export function wavePoints(mark: Pick<VDTLineMark, 'x' | 'y' | 'length' | 'amplitude' | 'wavelength'>, x0 = 0, y0 = 0): { x: number; y: number }[] {
  const length = mark.length ?? 0;
  const wl = mark.wavelength ?? 4;
  const amp = (mark.amplitude ?? 1) / 2;
  const steps = Math.max(2, Math.ceil((length / wl) * 12));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (length * i) / steps;
    out.push({ x: x0 + mark.x + s, y: y0 + mark.y + amp * Math.sin((2 * Math.PI * s) / wl) });
  }
  return out;
}

/** Paint the marks of a line (`VDTLine.marks`) in `color` unless a mark
 *  has its own. */
export function paintLineMarks(ctx: Ctx, line: VDTLine, color: string): void {
  const marks = line.marks;
  if (!marks || marks.length === 0) return;
  const x0 = line.bbox.x;
  const y0 = line.baseline;
  ctx.save();
  for (const m of marks) {
    const ink = m.color ?? color;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = m.thickness;
    const cx = x0 + m.x;
    const cy = y0 + m.y;
    switch (m.kind) {
      case 'dot':
      case 'circle': {
        const r = (m.size ?? 0) / 2;
        ctx.beginPath();
        if (m.open) {
          ctx.arc(cx, cy, Math.max(0, r - m.thickness / 2), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'sesame': {
        ctx.beginPath();
        const [a, b] = sesamePath(m.size ?? 0);
        ctx.moveTo(cx + a![0]!.x, cy + a![0]!.y);
        ctx.quadraticCurveTo(cx + a![1]!.x, cy + a![1]!.y, cx + a![2]!.x, cy + a![2]!.y);
        ctx.quadraticCurveTo(cx + b![1]!.x, cy + b![1]!.y, cx + b![2]!.x, cy + b![2]!.y);
        ctx.closePath();
        if (m.open) ctx.stroke();
        else ctx.fill();
        break;
      }
      case 'line':
        ctx.fillRect(cx, cy - m.thickness / 2, m.length ?? 0, m.thickness);
        break;
      case 'wavy': {
        const pts = wavePoints(m, x0, y0);
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}

function paintRuns(ctx: Ctx, runs: readonly VDTAnnotationRun[], x: number, baseline: number, color: string, cuts: MarkCutRule, mode: TextPaintMode = 'fill'): void {
  ctx.save();
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const run of runs) {
    ctx.font = run.fontString;
    ctx.fillStyle = run.color ?? color;
    fillFlowText(ctx, run.text, x + run.dx, baseline + run.dy, mode, 0, cuts);
  }
  ctx.restore();
}

/** Paint a ruby base's reading; `x` is where the base's segment starts. */
export function paintRuby(ctx: Ctx, ruby: VDTRuby, x: number, baseline: number, textColor: string): void {
  paintRuns(ctx, ruby.runs, x, baseline, ruby.color ?? textColor, 'text');
}

/** Paint a warichu note's rows; `x` is where the note's segment starts. */
export function paintWarichu(ctx: Ctx, warichu: VDTWarichu, x: number, baseline: number, textColor: string): void {
  paintRuns(ctx, warichu.runs, x, baseline, warichu.color ?? textColor, 'composed');
}
