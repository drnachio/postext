import type { VDTLine } from '../vdt';

/** Word-space ratio (justified over natural) past which a justified line
 *  is set ragged instead of stretched. Matches the sandbox's loose-line
 *  threshold, so such a line is fixed rather than flagged. */
export const LINE_MAX_SPACE_RATIO = 3;

/**
 * A justified line the breaker could not fill — a long link that breaks
 * only at its own joints, a list item whose last word cannot come up and
 * whose every hyphenation leaves a runt — would have its few word spaces
 * stretched to several times their width. Rather than flag the paragraph,
 * set such lines ragged (like a paragraph's last line): the text keeps its
 * natural spacing and the right edge gives instead. Lines within the
 * threshold are left as measured.
 */
export function raggedLooseLines(lines: VDTLine[], textAlign: string | undefined): VDTLine[] {
  if (textAlign !== 'justify') return lines;
  let changed = false;
  const out = lines.map((line) => {
    if (line.isLastLine || line.justifiedSpaceRatio === undefined || line.justifiedSpaceRatio <= LINE_MAX_SPACE_RATIO) return line;
    changed = true;
    const { justifiedSpaceRatio: _loose, ...rest } = line;
    void _loose;
    return { ...rest, ragged: true };
  });
  return changed ? out : lines;
}
