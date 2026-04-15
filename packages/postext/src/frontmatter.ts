import matter from 'gray-matter';
import type { DocumentMetadata } from './types';

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  content: string;
  /** Character offset in the original markdown where `content` begins. */
  contentOffset: number;
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
  return { metadata: data as DocumentMetadata, content, contentOffset };
}
