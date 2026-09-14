// Front-matter detection that mirrors gray-matter's rule (used by the engine)
// and the editor highlighter: the very first line is exactly `---`, and the
// block closes at the next line that is exactly `---`.

export interface FrontmatterRange {
  /** Offset just past the closing `---` line (its newline included). */
  end: number;
}

const OPEN_RE = /^---[ \t]*(?:\r?\n|$)/;

export function frontmatterRange(markdown: string): FrontmatterRange | null {
  const open = OPEN_RE.exec(markdown);
  if (!open) return null;
  let pos = open[0].length;
  if (pos >= markdown.length && !open[0].endsWith('\n')) return null;
  while (pos <= markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const lineEnd = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, lineEnd).replace(/\r$/, '');
    if (line === '---') {
      return { end: nl === -1 ? markdown.length : nl + 1 };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return null;
}

/** Same length and newline positions as `markdown`, with every other
 *  character of a leading front-matter block replaced by a space — the
 *  block becomes blank lines and offsets stay 1:1. */
export function blankFrontmatter(markdown: string): string {
  const range = frontmatterRange(markdown);
  if (!range) return markdown;
  const head = markdown.slice(0, range.end).replace(/[^\n\r]/g, ' ');
  return head + markdown.slice(range.end);
}
