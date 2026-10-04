// What a document laid out after another one inherits from it — the
// counter half of `PostextContent.continuation`, plus the part left open
// and whether the content ended on it (`afterPartPage`). Pure over the parsed
// markdown: no layout is involved, so the page half (`pageIndexOffset`,
// `pageNumbering`) is left to the caller, which knows how many pages the
// preceding content produced and how its last page was numbered.

import { hasAnchorRefs } from './crossRefs';
import { extractFrontmatter } from '../frontmatter';
import { parseMarkdownMemo } from '../parse';
import type { ContentBlock } from '../parse';
import { defaultResourceTypes } from '../defaults';
import { documentLocale } from '../defaults/resourceTypes';
import type { HeadingCounters, LayoutContinuation, OutlineEntry, PartState, PostextConfig, PostextContent } from '../types';
import { computeHeadingContext, computeResourceNumberingState } from './resourceNumbering';
import { planParts } from './parts';
import { resolveAllConfig } from './config';
import { headingIsNumbered } from './headingStyles';
import { computeOutline, hasIndexDirective, hasTocDirective } from './outline';
import { lastFootnoteNumber, numberFootnotes, splitFootnoteDefinitions } from './footnotes';

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
  const resourceTypes = config?.resourceTypes ?? defaultResourceTypes(documentLocale(config));
  const { map, counters } = computeResourceNumberingState(
    blocks,
    resourceTypes,
    content.resources ?? [],
    headingContext,
    before ? { counters: before.resourceCounters, numbered: before.resourceNumbers } : undefined,
    resolved.numerals,
  );
  // The last part opened in `content` (its fence may well have closed —
  // a part stays in effect until the next one), else the inherited one.
  let part: PartState | undefined = before?.part;
  const parts = planParts(blocks);
  for (const planned of parts.byStart.values()) {
    part = {
      number: planned.number,
      title: planned.title,
      ...(Object.keys(planned.palette).length > 0 ? { palette: planned.palette } : {}),
    };
  }
  const afterPartPage = resolved.parts.page && endsWithPart(blocks, parts.byEnd.keys());
  // Notes numbered through the book go on from the last one printed.
  let footnoteNumber = before?.footnoteNumber ?? 0;
  if (resolved.footnotes.numbering === 'document') {
    const numbering = numberFootnotes(splitFootnoteDefinitions(blocks).blocks, 'document', footnoteNumber);
    footnoteNumber = Math.max(footnoteNumber, lastFootnoteNumber(numbering));
  }
  return {
    headings,
    resourceCounters: counters,
    resourceNumbers: map,
    ...(footnoteNumber > 0 ? { footnoteNumber } : {}),
    ...(part ? { part } : {}),
    ...(afterPartPage ? { afterPartPage } : {}),
  };
}

/** Whether a part's closing fence ends `blocks`: nothing after it but
 *  directives that neither place anything nor break a column or page
 *  (`:::numbering`, `:::space`). The part's pages are then the last of
 *  the content, and the break the part owes falls to what follows. */
function endsWithPart(blocks: readonly ContentBlock[], partEnds: Iterable<number>): boolean {
  let last = -1;
  for (const end of partEnds) last = Math.max(last, end);
  if (last < 0) return false;
  for (let i = last + 1; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'directive' || b.directiveName === 'pagebreak' || b.directiveName === 'columnbreak') return false;
    // The contents and the index expand into text.
    if (b.directiveName === 'toc' || b.directiveName === 'index') return false;
  }
  return true;
}

/** The outline of `content` on its own — every heading and part, numbered
 *  after the counters `before` — without page labels, plus whether it
 *  prints a table of contents. Chain it chapter by chapter, like
 *  `continuationAfter`, to assemble a book's outline before any page is
 *  laid out. */
export function contentOutline(
  content: Pick<PostextContent, 'markdown'> & Partial<Pick<PostextContent, 'resources'>>,
  config?: PostextConfig,
  before?: LayoutContinuation,
): { outline: OutlineEntry[]; hasToc: boolean; hasIndex: boolean; hasRefs: boolean } {
  const body = extractFrontmatter(content.markdown).content;
  const blocks = parseMarkdownMemo(body);
  const resolved = resolveAllConfig(config);
  return {
    outline: computeOutline(blocks, resolved, before?.headings),
    hasToc: hasTocDirective(blocks),
    hasIndex: hasIndexDirective(blocks),
    // A reference naming no resource may name an anchor of the book (#262).
    hasRefs: hasAnchorRefs(blocks, new Set((content.resources ?? []).map((r) => r.id))),
  };
}
