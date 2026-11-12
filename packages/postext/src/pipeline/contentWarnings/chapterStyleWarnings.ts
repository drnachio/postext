// The chapter styles a chapter names (#1521): a `chapterStyle:` in its
// front matter or a `:::part{style}` fence naming no style of the book,
// and a styled part fence that does not open its chapter.
import type { ContentBlock } from '../../parse/index.js';
import type { ParsedFrontmatter } from '../../parse/frontmatter.js';
import type { ChapterStyleConfig } from '../../types.js';
import type { ContentWarning } from '../../vdt.js';
import { CHAPTER_STYLE_KEY, openingPart } from '../../defaults/chapterStyles.js';

/**
 * The chapter-style warnings of a chapter's source: `fm` is its front
 * matter, `blocks` its body parsed (offsets from `fm.contentOffset`),
 * `styles` the book's chapter styles.
 */
export function chapterStyleWarnings(
  markdown: string,
  fm: ParsedFrontmatter,
  blocks: readonly ContentBlock[],
  styles: readonly ChapterStyleConfig[] | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const known = new Set((styles ?? []).map((s) => s.id));
  const own = fm.metadata[CHAPTER_STYLE_KEY];
  if (typeof own === 'string' && own.trim() && !known.has(own.trim())) {
    const at = fm.fieldSources?.[CHAPTER_STYLE_KEY];
    out.push({ kind: 'chapterStyleUnknown', style: own.trim(), source: 'frontmatter', ...(at ? { sourceStart: at.start, sourceEnd: at.end } : {}) });
  }
  const opens = openingPart(markdown) !== undefined;
  let first = true;
  for (const b of blocks) {
    if (b.type !== 'containerStart' || b.containerName !== 'part') continue;
    const opening = first && opens;
    first = false;
    const style = b.containerAttrs?.style?.trim();
    if (!style) continue;
    const range = { sourceStart: b.sourceStart + fm.contentOffset, sourceEnd: b.sourceEnd + fm.contentOffset };
    if (!known.has(style)) out.push({ kind: 'chapterStyleUnknown', style, source: 'part', ...range });
    if (!opening) out.push({ kind: 'partStyleMidChapter', style, ...range });
  }
  return out;
}
