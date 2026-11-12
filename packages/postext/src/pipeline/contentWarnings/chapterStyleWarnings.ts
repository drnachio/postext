// The chapter styles a chapter names (#1521): a `chapterStyle:` in its
// front matter or a `:::part{style}` fence naming no style of the book,
// a styled part fence that does not open its chapter, and a
// `::section{style}` line of postext 1.78, no longer read (#1532).
import type { ContentBlock } from '../../parse/index.js';
import { extractFrontmatter, type ParsedFrontmatter } from '../../parse/frontmatter.js';
import type { BookChapterRange, ChapterStyleConfig } from '../../types.js';
import type { ContentWarning } from '../../vdt.js';
import { CHAPTER_STYLE_KEY, openingPart } from '../../defaults/chapterStyles.js';
import { sectionBreakLines } from '../../parse/blockParser/sectionBreaks.js';

/**
 * The chapter-style warnings of a chapter's source: `fm` is its front
 * matter, `blocks` its body parsed (offsets from `fm.contentOffset`),
 * `styles` the book's chapter styles. `chapters`, for a whole book laid out
 * as one document, says where each chapter lies: a part fence opens the
 * chapter it starts, and a later chapter's `chapterStyle:` is read too.
 */
export function chapterStyleWarnings(
  markdown: string,
  fm: ParsedFrontmatter,
  blocks: readonly ContentBlock[],
  styles: readonly ChapterStyleConfig[] | undefined,
  chapters?: readonly BookChapterRange[],
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const known = new Set((styles ?? []).map((s) => s.id));
  const ranges = chapters?.length ? chapters : [{ start: 0, end: markdown.length }];
  ranges.forEach((range, i) => {
    // The first chapter's front matter is the document's own.
    const meta = i === 0 && range.start === 0 ? fm : chapterFrontmatter(markdown.slice(range.start, range.end));
    const own = meta?.metadata[CHAPTER_STYLE_KEY];
    if (typeof own === 'string' && own.trim() && !known.has(own.trim())) {
      const at = meta!.fieldSources?.[CHAPTER_STYLE_KEY];
      const shift = meta === fm ? 0 : range.start;
      out.push({ kind: 'chapterStyleUnknown', style: own.trim(), source: 'frontmatter', ...(at ? { sourceStart: at.start + shift, sourceEnd: at.end + shift } : {}) });
    }
  });
  // A fence opens its chapter when the chapter's text starts with it and
  // no other fence of the chapter came first.
  const opens = ranges.map((r) => openingPart(markdown.slice(r.start, r.end)) !== undefined);
  const seen = new Set<number>();
  for (const b of blocks) {
    if (b.type !== 'containerStart' || b.containerName !== 'part') continue;
    const at = b.sourceStart + fm.contentOffset;
    const chapter = Math.max(0, ranges.findIndex((r) => at >= r.start && at < r.end));
    const opening = !seen.has(chapter) && opens[chapter]!;
    seen.add(chapter);
    const style = b.containerAttrs?.style?.trim();
    if (!style) continue;
    const range = { sourceStart: at, sourceEnd: b.sourceEnd + fm.contentOffset };
    if (!known.has(style)) out.push({ kind: 'chapterStyleUnknown', style, source: 'part', ...range });
    if (!opening) out.push({ kind: 'partStyleMidChapter', style, ...range });
  }
  // 1.78 switched style mid-chapter with `::section{style="…"}`: the parser
  // reads the line as blank, so its text stays in the chapter, set in the
  // chapter's settings.
  for (const line of sectionBreakLines(markdown.slice(fm.contentOffset))) {
    out.push({ kind: 'partStyleMidChapter', style: line.style ?? '', source: 'section', sourceStart: line.start + fm.contentOffset, sourceEnd: line.end + fm.contentOffset });
  }
  return out;
}

/** The front matter a later chapter's text opens with, if any. */
function chapterFrontmatter(text: string): ParsedFrontmatter | undefined {
  if (!text.startsWith('---')) return undefined;
  try {
    return extractFrontmatter(text);
  } catch {
    return undefined;
  }
}
