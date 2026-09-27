import type { VDTLine } from '../vdt';
import { trackSegments } from '../knuthPlass/tracking';
import { RAGGED_SPACE_RATIO } from '../knuthPlass/constants';

/** Word-space ratio (justified over natural) past which a justified line
 *  is set ragged instead of stretched. Matches the sandbox's loose-line
 *  threshold, so such a line is fixed rather than flagged. */
export const LINE_MAX_SPACE_RATIO = RAGGED_SPACE_RATIO;

/**
 * A justified line the breaker could not fill — a long link that breaks
 * only at its own joints, a list item whose last word cannot come up and
 * whose every hyphenation leaves a runt — would have its few word spaces
 * stretched to several times their width. Rather than flag the paragraph,
 * set such lines ragged (like a paragraph's last line): the text keeps its
 * natural spacing and the right edge gives instead. Lines within the
 * threshold are left as measured.
 *
 * A line set ragged also drops the justification tracking the breaker gave
 * it (`VDTLine.letterSpacing`, `bodyText.maxJustifyTracking`): its letters
 * go back to their natural widths too, rather than stay letter-spaced on a
 * ragged edge.
 */
export function raggedLooseLines(lines: VDTLine[], textAlign: string | undefined): VDTLine[] {
  if (textAlign !== 'justify') return lines;
  let changed = false;
  const out = lines.map((line) => {
    if (line.isLastLine || line.justifiedSpaceRatio === undefined || line.justifiedSpaceRatio <= LINE_MAX_SPACE_RATIO) return line;
    changed = true;
    const { justifiedSpaceRatio: _loose, letterSpacing, ...rest } = line;
    void _loose;
    if (!letterSpacing) return { ...rest, ragged: true };
    return { ...rest, ...untracked(line, letterSpacing), ragged: true };
  });
  return changed ? out : lines;
}

/** The segments and box of `line` without the `tracking` px a character
 *  the reconstruction added to its text segments: `trackSegments` run again
 *  with the opposite sign, so a stacked script pair (whose first run stays
 *  at width 0 and whose second took the longer run's tracking) comes back
 *  to its natural widths too. */
function untracked(line: VDTLine, tracking: number): Pick<VDTLine, 'segments' | 'bbox'> {
  if (!line.segments) return { bbox: line.bbox };
  const segments = line.segments.map((seg) => (seg.kind === 'text' ? { ...seg } : seg));
  const removed = -trackSegments(segments, -tracking);
  return { segments, bbox: { ...line.bbox, width: line.bbox.width - removed } };
}
