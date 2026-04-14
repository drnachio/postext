import matter from 'gray-matter';
import type { DocumentMetadata } from './types';

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  content: string;
}

export function extractFrontmatter(markdown: string): ParsedFrontmatter {
  const { data, content } = matter(markdown);
  return { metadata: data as DocumentMetadata, content };
}
