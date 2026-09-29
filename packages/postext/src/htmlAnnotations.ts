/**
 * Chinese annotations in the HTML backend (#193, #194, #195): the marks of
 * a line (`VDTLine.marks`) as positioned `aria-hidden` boxes and small SVG
 * paths, a ruby base's reading as positioned `aria-hidden` text, and a
 * warichu note's rows as two positioned runs inside a `role="note"` box
 * that reads the note once. Everything sits in the line's box (its left
 * edge and top are the line's `bbox.x` / `bbox.y`), at the geometry the
 * layout gave it: the same the canvas and PDF backends draw.
 */

import type { VDTAnnotationRun, VDTLine, VDTLineMark, VDTRuby, VDTWarichu } from './vdt';
import { sesamePath, wavePoints } from './canvas-backend/annotations';

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]!);
const n = (v: number): string => v.toFixed(3);

/** A mark as markup, placed from a point `baseline` px above the line's
 *  text baseline (0: on it). */
function markHtml(m: VDTLineMark, baseline: number, color: string): string {
  const ink = m.color ?? color;
  const cx = m.x;
  const cy = baseline + m.y;
  switch (m.kind) {
    case 'dot':
    case 'circle': {
      const d = m.size ?? 0;
      const fill = m.open ? `border:${n(m.thickness)}px solid ${ink};` : `background:${ink};`;
      return `<span aria-hidden="true" style="position:absolute;left:${n(cx - d / 2)}px;top:${n(cy - d / 2)}px;width:${n(d)}px;height:${n(d)}px;box-sizing:border-box;border-radius:50%;${fill}"></span>`;
    }
    case 'sesame': {
      const d = m.size ?? 0;
      const [a, b] = sesamePath(d);
      const p = (q: { x: number; y: number }) => `${n(q.x + d)} ${n(q.y + d)}`;
      const path = `M${p(a![0]!)}Q${p(a![1]!)} ${p(a![2]!)}Q${p(b![1]!)} ${p(b![2]!)}Z`;
      const paint = m.open ? `fill="none" stroke="${ink}" stroke-width="${n(m.thickness)}"` : `fill="${ink}"`;
      return `<svg aria-hidden="true" width="${n(2 * d)}" height="${n(2 * d)}" style="position:absolute;left:${n(cx - d)}px;top:${n(cy - d)}px;overflow:visible;"><path d="${path}" ${paint}/></svg>`;
    }
    case 'line':
      return `<span aria-hidden="true" style="position:absolute;left:${n(cx)}px;top:${n(cy - m.thickness / 2)}px;width:${n(m.length ?? 0)}px;height:${n(m.thickness)}px;background:${ink};"></span>`;
    case 'wavy': {
      const amp = (m.amplitude ?? 0) / 2 + m.thickness;
      const pts = wavePoints({ ...m, x: 0, y: amp });
      const d = pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${n(q.x)} ${n(q.y)}`).join('');
      return `<svg aria-hidden="true" width="${n(m.length ?? 0)}" height="${n(2 * amp)}" style="position:absolute;left:${n(cx)}px;top:${n(cy - amp)}px;overflow:visible;"><path d="${d}" fill="none" stroke="${ink}" stroke-width="${n(m.thickness)}"/></svg>`;
    }
  }
}

/** The marks of a line as markup inside its box; '' when it has none.
 *  They hang from a box of no size set on the line's text baseline (a box
 *  in the line's font, as the text spans are), so they follow the text
 *  wherever the browser puts its baseline. */
export function lineMarksHtml(line: VDTLine, color: string): string {
  if (!line.marks || line.marks.length === 0) return '';
  const marks = line.marks.map((m) => markHtml(m, 0, color)).join('');
  return `<span aria-hidden="true" style="position:absolute;left:0;top:0;white-space:pre;">`
    + `<span style="display:inline-block;position:relative;width:0;height:0;vertical-align:baseline;">${marks}</span></span>`;
}

/** Quotes the family of a CSS font shorthand for a `style` attribute (the
 *  backend's own `quoteFontString`). */
export type FontQuoter = (font: string) => string;

/** A run of annotation text at its place from `x` (px in the line box), on
 *  the line's baseline moved by the run's `dy`: an outer box that takes
 *  the line's baseline, an inner one in the run's face with no line height
 *  (as a segment in another face is set). */
function runHtml(run: VDTAnnotationRun, x: number, color: string, quote: FontQuoter): string {
  const ink = run.color ?? color;
  return `<span aria-hidden="true" style="position:absolute;left:${n(x + run.dx)}px;top:${n(run.dy)}px;white-space:pre;">`
    + `<span style="font:${quote(run.fontString)};line-height:0;color:${ink};">${esc(run.text)}</span></span>`;
}

/** A ruby base's reading, from the base segment's `x`. */
export function rubyHtml(ruby: VDTRuby, x: number, color: string, quote: FontQuoter): string {
  return ruby.runs.map((r) => runHtml(r, x, ruby.color ?? color, quote)).join('');
}

/** A warichu note's part: its rows, in a box that reads the note once. */
export function warichuHtml(warichu: VDTWarichu, x: number, color: string, quote: FontQuoter): string {
  const note = warichu.upper + warichu.lower;
  return `<span role="note" aria-label="${esc(note)}">${warichu.runs.map((r) => runHtml(r, x, warichu.color ?? color, quote)).join('')}</span>`;
}
