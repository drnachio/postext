// Design text in Chinese or Japanese (#637): a heading design or an opener,
// a running head, a page design or a part page whose text composes as CJK
// is broken and spaced by the body's composer (`measure/cjkCompose.ts`):
// the line-start and line-end rules of `cjk.lineBreak`, the mark widths of
// `cjk.punctuationWidth` and `compressAdjacent`, the Han–Latin space,
// hanging punctuation and the book-title rule. Its lines come back as
// design runs: a mark that gave up blank, or a space whose width is not
// its glyph's, is a run of its own whose `width` is its box and whose
// `inkOffset` places the glyph in it, as on a body segment; a dash of a
// 破折号 keeps the stretch that joins the pair into one rule (`inkScale`,
// #652).

import type { InlineSpan } from '../parse/types';
import type { VDTLine } from '../vdt';
import { composeCjkParagraph, composesAsCjk } from '../measure/cjkCompose';
import { getCjkComposition } from '../measure/cjkPunctuation';
import type { DesignTextRun } from './richText';

/** The fonts a CJK design text is set in: the element's, and the ones its
 *  inline marks pick (bold, italic). */
export interface CjkDesignFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** A line of CJK design text: its text, width (a hung mark left out),
 *  runs (absent when the line is one run in the element's font at the
 *  glyphs' own advances) and where it starts in its room. */
export interface CjkDesignLine {
  text: string;
  width: number;
  runs?: DesignTextRun[];
  xOffset: number;
}

/** Whether a design text (one paragraph or line of it) is set by the CJK
 *  composer: the document composes design text (`cjk.composeDesignText`,
 *  on unless a configuration stored before #637 pins it off) and the text
 *  composes as CJK, as a body paragraph would. */
export function composesDesignAsCjk(text: string): boolean {
  return getCjkComposition().plainDesignText !== true && composesAsCjk(text);
}

/** Room for one line when a text is laid out on its natural width. */
const UNBOUNDED_PX = 1e7;

/**
 * Compose one paragraph of design text (no newline in it) with the CJK
 * composer: `spans` in `fonts`, lines `maxWidth` wide less `indents[i]`
 * (the last repeating; the line starts that far in), or one line when
 * `maxWidth` is undefined. `measureIn` measures a run's text as the
 * renderers paint it (tracking included), so a run whose box is its
 * glyphs' advance carries no `inkOffset`.
 */
export function composeCjkDesignParagraph(
  spans: InlineSpan[],
  fonts: CjkDesignFonts,
  maxWidth: number | undefined,
  lineHeightPx: number,
  letterSpacingPx: number,
  measureIn: (text: string, font: string) => number,
  indents: readonly number[] = [],
): CjkDesignLine[] {
  const measured = composeCjkParagraph(spans, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, maxWidth ?? UNBOUNDED_PX, lineHeightPx, {
    textAlign: 'left',
    ...(letterSpacingPx !== 0 ? { letterSpacingPx } : {}),
    ...(indents.some((x) => x > 0) ? { lineIndentsPx: indents } : {}),
  });
  return measured.lines.map((line) => designLineOf(line, fonts, measureIn));
}

/** A composed line as design runs (see the module comment). */
function designLineOf(line: VDTLine, fonts: CjkDesignFonts, measureIn: (text: string, font: string) => number): CjkDesignLine {
  const runs: DesignTextRun[] = [];
  // Room a Han–Latin space (no text) left before the first run.
  let lead = 0;
  for (const seg of line.segments ?? []) {
    if (seg.text === '') {
      if (!(seg.width > 0)) continue;
      const prev = runs[runs.length - 1];
      if (prev) {
        prev.width += seg.width;
        prev.inkOffset ??= 0;
      } else lead += seg.width;
      continue;
    }
    const font = seg.fontString ?? (seg.bold ? (seg.italic ? fonts.boldItalic : fonts.bold) : seg.italic ? fonts.italic : fonts.normal);
    const run: DesignTextRun = { text: seg.text, fontString: font, width: seg.width };
    if (seg.baselineShift) run.baselineShift = seg.baselineShift;
    if (seg.stacked) run.stacked = true;
    if (seg.tcy) run.tcy = true;
    else if (seg.orientation) run.orientation = seg.orientation;
    if (seg.inkOffset !== undefined) run.inkOffset = seg.inkOffset;
    else if (!seg.stacked && Math.abs(measureIn(seg.text, font) - seg.width) > 0.01) run.inkOffset = 0;
    // A dash of a 破折号: its offset is where the stretched glyph starts
    // (`dashRule`), so the run keeps the stretch too (#652).
    if (seg.inkScale !== undefined) run.inkScale = seg.inkScale;
    if (lead > 0) {
      run.width += lead;
      run.inkOffset = (run.inkOffset ?? 0) + lead;
      lead = 0;
    }
    runs.push(run);
  }
  const text = runs.map((r) => r.text).join('');
  const width = line.bbox.width;
  const plain = runs.length === 1 && runs[0]!.fontString === fonts.normal && runs[0]!.inkOffset === undefined && runs[0]!.inkScale === undefined
    && !runs[0]!.baselineShift && !runs[0]!.tcy && !runs[0]!.orientation;
  return { text, width, ...(plain || runs.length === 0 ? {} : { runs }), xOffset: line.bbox.x };
}
