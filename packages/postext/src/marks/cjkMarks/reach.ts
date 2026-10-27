// How far marks, ruby and kunten reach past a line (#1278: split out of
// cjkMarks.ts).
import type { VDTLine } from '../../vdt.js';
import { measureTextWidth } from '../../measure/canvas.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { isZhuyin, ZHUYIN_SIZE_RATIO, CENTRAL } from '../../measure/cjk/cjkAnnotate.js';
import { fontEm } from '../../measure/vertical.js';
import { latinReadingLift } from '../../measure/cjk/rubyLift.js';

/** How much line gap (em of the text) a line's marks need: half an em on
 *  one side, five eighths on both (clreq §5.6.1). 0 when it has none. */
export function marksNeed(line: VDTLine): number {
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
export function rubyNeed(line: VDTLine, em: number): number {
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

/** How far a line's kanbun marks (#430) reach out of its em box, in em
 *  of the text: the 送り仮名 beside it, 返り点 set in the line gap. */
export function kuntenNeed(line: VDTLine, em: number): number {
  const top = -(CENTRAL + 0.5) * em;
  const bottom = (0.5 - CENTRAL) * em;
  let need = 0;
  for (const seg of line.segments ?? []) {
    for (const run of seg.kunten?.runs ?? []) {
      const runEm = fontEm(run.fontString);
      const centre = run.dy - CENTRAL * runEm;
      need = Math.max(need, top - (centre - runEm / 2), centre + runEm / 2 - bottom);
    }
  }
  return need / em;
}

/** How far a line's marks and readings reach out of its em box, px: over
 *  it (`head`: above in horizontal text, right in vertical text) and
 *  under it (`foot`), and whether readings (or kanbun marks, #430) reach
 *  that far on each side. */
export interface LineReach {
  head: number;
  foot: number;
  headRuby: boolean;
  footRuby: boolean;
  headKunten?: boolean;
  footKunten?: boolean;
}

/** The {@link LineReach} of a line whose text is `em` px (its em box
 *  centred on the central axis): marks by their drawn extent, readings by
 *  their em box (an upright tone mark by its advance across the line). */
export function lineReach(line: VDTLine, em: number): LineReach {
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
  // Kanbun marks, by their em box: the side they reach furthest out on is
  // theirs when nothing else reaches as far.
  for (const seg of line.segments ?? []) {
    for (const run of seg.kunten?.runs ?? []) {
      const runEm = fontEm(run.fontString);
      const lo = run.dy - (CENTRAL + 0.5) * runEm;
      const hi = run.dy + (0.5 - CENTRAL) * runEm;
      if (top - lo > reach.head + 1e-9) {
        reach.head = top - lo;
        reach.headRuby = false;
        reach.headKunten = true;
      }
      if (hi - bottom > reach.foot + 1e-9) {
        reach.foot = hi - bottom;
        reach.footRuby = false;
        reach.footKunten = true;
      }
    }
  }
  return reach;
}
