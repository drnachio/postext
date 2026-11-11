/**
 * The line of a highlight mark (`markStyles[].line`, #1488): a solid,
 * double, dotted, dashed or wavy line under or through the marked words,
 * with or without the band. It is the same line `:underline[…]` and
 * `~~…~~` draw (`marks/strikethrough.ts`): where the face puts its
 * underline or its strikeout, on the central axis of the em box in Chinese
 * and Japanese text, and on the right of the characters (as a side line)
 * down a vertical page. It runs on under the word spaces of the phrase and
 * stops at its last letter where the phrase breaks onto the next line.
 *
 * The lines go into `VDTLine.marks` flagged `markLine`, beside the Chinese
 * emphasis marks and the strikethrough lines, so every output that draws
 * those (canvas, PDF, HTML, the display list for SVG, IDML and Word)
 * draws them with no code of its own: `dashed` is the only kind those
 * outputs did not draw before.
 */

import type { ResolvedMarkLineConfig, ResolvedMarkStyleConfig } from '../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineMark } from '../vdt.js';
import { segmentFont } from './cjkMarks.js';
import { DOTTED_PITCH, DOTTED_SIZE, DOUBLE_GAP, WAVE_HEIGHT, WAVE_LENGTH } from './cjkMarks/geometry.js';
import { markPieces, textLineGroups, type MarkPiece } from './highlightMarks.js';
import { colorOf, strikeGeometry, type BlockLike } from './strikethrough.js';
import { pickMarkStyle } from '../defaults/text/markStyles.js';
import { dimensionToPx } from '../units.js';

/** A dash and the gap after it, in multiples of the line's thickness. */
const DASH = 3;
const DASH_GAP = 2;

/** The mark line of one piece, relative to the line. */
function pieceLine(line: VDTLine, block: BlockLike, piece: MarkPiece, spec: ResolvedMarkLineConfig, dpi: number, vertical: boolean): VDTLineMark | undefined {
  const length = piece.right - piece.left;
  if (!(length > 0)) return undefined;
  const seg = line.segments![piece.firstI]!;
  const font = segmentFont(seg, block);
  const rule = spec.position === 'through' ? 'strike' : 'underline';
  const face = strikeGeometry(seg, font, vertical, rule);
  const em = piece.em;
  const thickness = spec.thickness ? Math.max(0.5, dimensionToPx(spec.thickness, dpi, em)) : face.thickness;
  const color = spec.color?.hex ?? colorOf(seg, block);
  const paint = color !== undefined ? { color } : {};
  // Away from the letters: down under horizontal text, to the right of
  // the characters down a vertical page (up in the line's own frame, as
  // `strikeGeometry` puts the side line there).
  const out = spec.position === 'under' ? (vertical ? -1 : 1) : 0;
  const x = piece.left - line.bbox.x;
  switch (spec.style) {
    case 'double': {
      const gap = Math.max(DOUBLE_GAP * em, thickness * 2);
      return { kind: 'double', x, y: face.y + out * gap / 2, length, gap, thickness, markLine: true, ...paint };
    }
    case 'wavy': {
      const amplitude = Math.max(WAVE_HEIGHT * em, thickness * 2);
      return { kind: 'wavy', x, y: face.y + out * amplitude / 2, length, thickness, amplitude, wavelength: WAVE_LENGTH * em, markLine: true, ...paint };
    }
    case 'dotted': {
      const size = Math.max(DOTTED_SIZE * em, thickness);
      // The pitch that sets the dots evenly from one end to the other.
      const span = Math.max(0, length - size);
      const count = Math.max(1, Math.round(span / Math.max(DOTTED_PITCH * em, size * 2)));
      return { kind: 'dotted', x, y: face.y, length, size, gap: span / count, thickness: size, markLine: true, ...paint };
    }
    case 'dashed':
      return { kind: 'dashed', x, y: face.y, length, size: thickness * DASH, gap: thickness * DASH_GAP, thickness, markLine: true, ...paint };
    default:
      return { kind: 'line', x, y: face.y, length, thickness, markLine: true, ...paint };
  }
}

/** The mark lines of a line, relative to it; empty when no mark on it has
 *  a style with a `line`. `vertical`: the line is set on a vertical page. */
export function markLines(line: VDTLine, block: BlockLike, styles: readonly ResolvedMarkStyleConfig[], dpi: number, vertical = false): VDTLineMark[] {
  const out: VDTLineMark[] = [];
  for (const piece of markPieces(line, block)) {
    const spec = pickMarkStyle(styles, piece.style || undefined)?.line;
    if (!spec) continue;
    const mark = pieceLine(line, block, piece, spec, dpi, vertical);
    if (mark) out.push(mark);
  }
  return out;
}

/** Give a line its mark lines in place of the ones a pass before gave it
 *  (a cached measurement shares its line objects between builds). */
function setMarkLines(line: VDTLine, marks: VDTLineMark[]): void {
  const kept = (line.marks ?? []).filter((m) => !m.markLine);
  if (kept.length + marks.length > 0) line.marks = [...kept, ...marks];
  else delete line.marks;
}

/** Draw the line of every highlight mark whose style has one (see the
 *  module comment). A document whose styles have no `line` is left as it
 *  was. */
export function markLineDocument(doc: VDTDocument): void {
  const styles = doc.config?.markStyles ?? [];
  const lined = styles.some((s) => s.line);
  const dpi = doc.config?.page.dpi ?? 96;
  for (const { lines, like } of textLineGroups(doc)) {
    // A flow block on a vertical page is set vertically; a resource
    // block's text never is.
    const block = 'lines' in like ? (like as VDTBlock) : undefined;
    const vertical = block !== undefined && doc.pages[block.pageIndex]?.flow?.writingMode === 'vertical-rl';
    for (const line of lines) {
      const had = line.marks?.some((m) => m.markLine) ?? false;
      if (!had && !(lined && line.segments?.some((s) => s.mark))) continue;
      setMarkLines(line, lined ? markLines(line, like, styles, dpi, vertical) : []);
    }
  }
}
