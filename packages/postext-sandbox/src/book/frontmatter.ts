import { blankChapterFrontmatter } from 'postext';

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
 *  block becomes blank lines and offsets stay 1:1 — but for a
 *  `chapterStyle:` line, kept inside its `---` lines so the chapter is
 *  still laid out in its style (`blankChapterFrontmatter`). `keepStyle:
 *  false` blanks that line too, for text that stops being a chapter of its
 *  own (two chapters merged into one). */
export function blankFrontmatter(markdown: string, keepStyle = true): string {
  const range = frontmatterRange(markdown);
  if (!range) return markdown;
  const head = markdown.slice(0, range.end);
  return (keepStyle ? blankChapterFrontmatter(head) : head.replace(/[^\n\r]/g, ' ')) + markdown.slice(range.end);
}

/**
 * `markdown` with its chapter style (`chapterStyle:` in the front matter)
 * set to `id`, or taken out when `id` is undefined: the line replaced or
 * added inside the leading `---` block, a block made for it when there is
 * none, and a block left with nothing in it removed.
 */
export function setChapterStyle(markdown: string, id: string | undefined): string {
  const line = id ? `chapterStyle: ${id}` : undefined;
  const range = frontmatterRange(markdown);
  if (!range) return line ? `---\n${line}\n---\n${markdown}` : markdown;
  const head = markdown.slice(0, range.end);
  const body = markdown.slice(range.end);
  const lines = head.replace(/\n$/, '').split('\n');
  // Between the opening and the closing `---`.
  const inner = lines.slice(1, -1).filter((l) => !/^chapterStyle\s*:/.test(l.replace(/\r$/, '')));
  if (line) inner.push(line);
  if (inner.every((l) => l.trim() === '')) return body;
  return `${lines[0]}\n${inner.join('\n')}\n${lines[lines.length - 1]}\n${body}`;
}
