import type { VDTLine } from '../vdt';

/** Word-space ratio (justified over natural) past which a line holding a
 *  URL is set ragged instead of justified. Matches the sandbox's loose-line
 *  threshold, so such a line is fixed rather than flagged. */
export const URL_LINE_MAX_SPACE_RATIO = 3;

const URL_RE = /(?:https?|ftp):\/\/|www\.|\b10\.\d{4,}\//i;

/**
 * A long link breaks only at its own joints, so the lines it lands on hold
 * few word spaces — and justifying them stretches those few spaces to
 * several times their width. Rather than flag the paragraph, set those
 * lines ragged (like a paragraph's last line): the URL runs on, the text
 * around it keeps its natural spacing. Only paragraphs containing a URL
 * are touched; the measured lines are left as they are otherwise.
 */
export function raggedUrlLines(lines: VDTLine[], textAlign: string | undefined, text: string): VDTLine[] {
  if (textAlign !== 'justify' || !URL_RE.test(text)) return lines;
  let changed = false;
  const out = lines.map((line) => {
    if (line.isLastLine || line.justifiedSpaceRatio === undefined || line.justifiedSpaceRatio <= URL_LINE_MAX_SPACE_RATIO) return line;
    changed = true;
    const { justifiedSpaceRatio: _loose, ...rest } = line;
    void _loose;
    return { ...rest, ragged: true };
  });
  return changed ? out : lines;
}
