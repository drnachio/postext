/**
 * The colour of the character styles (`:span[…]{style="id"}`, #1488).
 * A style's face, size and tracking change how its words are measured;
 * its colour does not, so it is no part of the measurement (nor of its
 * cache key) and is set here, once the document is laid out, on the
 * segments of every run (`VDTLineSegment.color`): bold and italic words
 * of the run included. Runs before the highlight marks, so that a mark
 * that sets its own text colour (a style's `mark`, or a `:mark[…]` around
 * the run) has the last word.
 */

import type { VDTDocument } from '../vdt.js';
import { textLineGroups } from './highlightMarks.js';

/** Paint the words of every character style run of `doc` in its style's
 *  colour (see the module comment). */
export function colorCharacterStyles(doc: VDTDocument): void {
  const styles = doc.config?.characterStyles;
  if (!styles || !styles.some((s) => s.color)) return;
  const colors = new Map<string, string>();
  for (const s of styles) if (s.color) colors.set(s.id, s.color.hex);
  for (const { lines } of textLineGroups(doc)) {
    for (const line of lines) {
      // A coloured word is a copy: the measurement cache shares a line's
      // segments with every other copy of the paragraph (#1609).
      const segments = line.segments ?? [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        const run = seg.charStyle;
        if (!run || seg.kind === 'space') continue;
        const color = colors.get(run.style);
        if (color !== undefined && seg.color !== color) segments[i] = { ...seg, color };
      }
    }
  }
}
