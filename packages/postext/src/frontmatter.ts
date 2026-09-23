import matter from 'gray-matter';
import type { DocumentMetadata } from './types';

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  content: string;
  /** Character offset in the original markdown where `content` begins. */
  contentOffset: number;
  /** Source range of every top-level field's value (quotes excluded), keyed
   *  by field name — what a design element such as `{title}` maps back to.
   *  Absent when there is no frontmatter block. */
  fieldSources?: Record<string, { start: number; end: number }>;
}

/** Offsets of the `key: value` values of a frontmatter block: line 1 is the
 *  opening `---`, the block ends at the next `---` line; a value is what
 *  follows the first colon, trimmed, minus surrounding quotes. */
export function frontmatterFieldSources(markdown: string): Record<string, { start: number; end: number }> | undefined {
  if (!/^---[ \t]*\r?\n/.test(markdown)) return undefined;
  const out: Record<string, { start: number; end: number }> = {};
  let pos = markdown.indexOf('\n') + 1;
  while (pos < markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const lineEnd = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, lineEnd).replace(/\r$/, '');
    if (/^(---|\.\.\.)[ \t]*$/.test(line)) break;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m && !(m[1]! in out)) {
      let start = pos + line.indexOf(':') + 1;
      while (start < lineEnd && /[ \t]/.test(markdown[start]!)) start++;
      let end = pos + line.length;
      while (end > start && /[ \t]/.test(markdown[end - 1]!)) end--;
      if (end - start >= 2 && /^["']$/.test(markdown[start]!) && markdown[end - 1] === markdown[start]) {
        start++;
        end--;
      }
      out[m[1]!] = { start, end };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return out;
}

export function extractFrontmatter(markdown: string): ParsedFrontmatter {
  const { data, content } = matter(markdown);
  // gray-matter strips the leading frontmatter block and one trailing newline.
  // Recover the body offset by searching for the content's prefix — fall back
  // to 0 when there is no frontmatter (content === markdown).
  let contentOffset = 0;
  if (content !== markdown) {
    const idx = markdown.indexOf(content);
    if (idx >= 0) contentOffset = idx;
  }
  const fieldSources = content !== markdown ? frontmatterFieldSources(markdown) : undefined;
  return { metadata: data as DocumentMetadata, content, contentOffset, ...(fieldSources ? { fieldSources } : {}) };
}
