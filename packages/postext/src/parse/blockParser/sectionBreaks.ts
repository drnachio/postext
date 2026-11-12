// The `::section{style="…"}` lines of postext 1.78 (#1521, #1532): a
// chapter switched chapter style there, from a new page. Since 1.79 a part
// sets its chapters' style (`:::part{style="…"}`) and the line is no longer
// read: the parser takes it as a blank line, so the text around it keeps
// flowing in the chapter and the line is not printed, and the content
// warnings report it (`partStyleMidChapter`, `source: 'section'`).

/** A `::section` line: its source offsets (its line break excluded) and
 *  the style it named. */
export interface SectionBreakLine {
  start: number;
  end: number;
  style?: string;
}

const SECTION_LINE = /^::section(?:\s*\{([^}]*)\})?\s*$/;
const STYLE_ATTR = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/;
const FENCE = /^(`{3,}|~{3,})/;

/** The `::section` lines of a text (front matter left out), in order:
 *  each alone on its line, outside code fences. */
export function sectionBreakLines(markdown: string): SectionBreakLine[] {
  if (!markdown.includes('::section')) return [];
  const out: SectionBreakLine[] = [];
  let fence: string | undefined;
  let pos = 0;
  while (pos <= markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const end = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, end).replace(/\r$/, '');
    const trimmed = line.trim();
    const f = FENCE.exec(trimmed);
    if (f) {
      if (!fence) fence = f[1]![0];
      else if (f[1]![0] === fence) fence = undefined;
    } else if (!fence) {
      const m = SECTION_LINE.exec(trimmed);
      if (m) {
        const a = m[1] !== undefined ? STYLE_ATTR.exec(m[1]) : null;
        const style = (a?.[1] ?? a?.[2] ?? a?.[3])?.trim();
        const lead = line.length - line.trimStart().length;
        out.push({ start: pos + lead, end: pos + line.trimEnd().length, ...(style ? { style } : {}) });
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return out;
}

/** `markdown` with its `::section` lines blank (spaces, so every offset
 *  stays where it was). */
export function blankSectionBreaks(markdown: string): string {
  const lines = sectionBreakLines(markdown);
  if (lines.length === 0) return markdown;
  let out = '';
  let at = 0;
  for (const l of lines) {
    out += markdown.slice(at, l.start) + ' '.repeat(l.end - l.start);
    at = l.end;
  }
  return out + markdown.slice(at);
}
