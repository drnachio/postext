// The number the book counts each chapter by, as the layout counts it: the
// level-1 counter at the chapter's first numbered level-1 heading, carried
// from chapter to chapter, from the bundle's `start` on. A heading whose
// style says `numbered: false` (a prologue, an appendix set apart) counts
// for nothing, and `{startAt=N}` sets the counter.

import { extractFrontmatter } from '../../parse/frontmatter.js';
import { parseMarkdownMemo, type ContentBlock } from '../../parse/index.js';
import { chapterConfigOf } from '../../defaults/chapterStyles.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { codeParseOptions } from '../../pipeline/code/codeBlocks.js';
import { headingIsNumbered } from '../../pipeline/sections/headingStyles.js';
import { computeHeadingContext } from '../../pipeline/resources/resourceNumbering.js';
import type { HeadingCounters, PostextConfig } from '../../types.js';

/** A chapter's parsed body: its blocks, with `offset` the index in the
 *  chapter's text where the body (after any front matter) starts. */
export interface ChapterBody {
  blocks: ContentBlock[];
  offset: number;
  numbered: (b: ContentBlock) => boolean;
}

/** `markdown` parsed as the layout parses a chapter under `config`. */
export function chapterBody(markdown: string, config: PostextConfig = {}): ChapterBody {
  const own = chapterConfigOf(config, markdown);
  const resolved = resolveAllConfig(own);
  const body = extractFrontmatter(markdown).content;
  const offset = markdown.endsWith(body) ? markdown.length - body.length : 0;
  return { blocks: parseMarkdownMemo(body, codeParseOptions(resolved)), offset, numbered: (b) => headingIsNumbered(b, resolved) };
}

/** The chapter's first level-1 heading that the layout numbers. */
export function numberedChapterHeading(body: ChapterBody): ContentBlock | undefined {
  return body.blocks.find((b) => b.type === 'heading' && b.level === 1 && body.numbered(b));
}

/**
 * Each chapter's number as the layout counts it, or `null` for a chapter
 * with no numbered level-1 heading (a cover, a prologue): such a chapter
 * has no number and leaves the count where it was. `start` is the bundle's
 * `start.headings`, for a bundle that holds part of a longer book.
 */
export function chapterNumbers(
  chapters: readonly { markdown: string }[],
  config?: PostextConfig,
  start?: Partial<HeadingCounters>,
): (number | null)[] {
  let before: HeadingCounters | undefined = start ? { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, ...start } : undefined;
  return chapters.map((c) => {
    const body = chapterBody(c.markdown, config);
    const context = computeHeadingContext(body.blocks, before, body.numbered);
    const at = body.blocks.findIndex((b) => b.type === 'heading' && b.level === 1 && body.numbered(b));
    if (context.length > 0) before = context[context.length - 1];
    return at >= 0 ? context[at]!.h1 : null;
  });
}

/** The numbers chapter files are named after: a chapter's own number, or,
 *  for one with none, the number of the chapter before it (0 before the
 *  first), so that `00-cover.md`, `01-…`, `09-…` read in book order. */
export function chapterFileNumbers(numbers: readonly (number | null)[]): number[] {
  let last = 0;
  return numbers.map((n) => (last = n ?? last));
}
