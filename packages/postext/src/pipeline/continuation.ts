// What a document laid out after another one inherits from it — the
// counter half of `PostextContent.continuation`, plus the part left open.
// Pure over the parsed
// markdown: no layout is involved, so the page half (`pageIndexOffset`,
// `pageNumbering`) is left to the caller, which knows how many pages the
// preceding content produced and how its last page was numbered.

import { extractFrontmatter } from '../frontmatter';
import { parseMarkdownMemo } from '../parse';
import { defaultResourceTypes } from '../defaults';
import type { HeadingCounters, LayoutContinuation, OutlineEntry, PartState, PostextConfig, PostextContent } from '../types';
import { computeHeadingContext, computeResourceNumberingState } from './resourceNumbering';
import { planParts } from './parts';
import { resolveAllConfig } from './config';
import { headingIsNumbered } from './headingStyles';
import { computeOutline, hasTocDirective } from './outline';

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
  const resolved = resolveAllConfig(config);
  const headingContext = computeHeadingContext(blocks, before?.headings, (b) => headingIsNumbered(b, resolved));
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
  // The last part opened in `content` (its fence may well have closed —
  // a part stays in effect until the next one), else the inherited one.
  let part: PartState | undefined = before?.part;
  for (const planned of planParts(blocks).byStart.values()) {
    part = {
      number: planned.number,
      title: planned.title,
      ...(Object.keys(planned.palette).length > 0 ? { palette: planned.palette } : {}),
    };
  }
  return { headings, resourceCounters: counters, resourceNumbers: map, ...(part ? { part } : {}) };
}

/** The outline of `content` on its own — every heading and part, numbered
 *  after the counters `before` — without page labels, plus whether it
 *  prints a table of contents. Chain it chapter by chapter, like
 *  `continuationAfter`, to assemble a book's outline before any page is
 *  laid out. */
export function contentOutline(
  content: Pick<PostextContent, 'markdown'>,
  config?: PostextConfig,
  before?: LayoutContinuation,
): { outline: OutlineEntry[]; hasToc: boolean } {
  const body = extractFrontmatter(content.markdown).content;
  const blocks = parseMarkdownMemo(body);
  const resolved = resolveAllConfig(config);
  return { outline: computeOutline(blocks, resolved, before?.headings), hasToc: hasTocDirective(blocks) };
}
