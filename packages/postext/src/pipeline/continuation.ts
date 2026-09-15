// What a document laid out after another one inherits from it — the
// counter half of `PostextContent.continuation`. Pure over the parsed
// markdown: no layout is involved, so the page half (`pageIndexOffset`,
// `pageNumbering`) is left to the caller, which knows how many pages the
// preceding content produced and how its last page was numbered.

import { extractFrontmatter } from '../frontmatter';
import { parseMarkdownMemo } from '../parse';
import { defaultResourceTypes } from '../defaults';
import type { HeadingCounters, LayoutContinuation, PostextConfig, PostextContent } from '../types';
import { computeHeadingContext, computeResourceNumberingState } from './resourceNumbering';

const NO_HEADINGS: HeadingCounters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

/** The counters a document laid out after `content` continues from: what
 *  `content` itself inherited (`before`) advanced by its headings and
 *  resource references. Chain it chapter by chapter to number a book that
 *  is laid out one chapter at a time. */
export function continuationAfter(
  content: Pick<PostextContent, 'markdown' | 'resources'>,
  config?: PostextConfig,
  before?: LayoutContinuation,
): LayoutContinuation {
  const body = extractFrontmatter(content.markdown).content;
  const blocks = parseMarkdownMemo(body);
  const headingContext = computeHeadingContext(blocks, before?.headings);
  const headings = headingContext.length > 0
    ? headingContext[headingContext.length - 1]!
    : before?.headings ?? NO_HEADINGS;
  const resourceTypes = config?.resourceTypes ?? defaultResourceTypes();
  const { map, counters } = computeResourceNumberingState(
    blocks,
    resourceTypes,
    content.resources ?? [],
    headingContext,
    before ? { counters: before.resourceCounters, numbered: before.resourceNumbers } : undefined,
  );
  return { headings, resourceCounters: counters, resourceNumbers: map };
}
