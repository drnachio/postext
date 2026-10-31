// What a document laid out after another one inherits from it — the
// counter half of `PostextContent.continuation`, plus the part left open
// and whether the content ended on it (`afterPartPage`). Pure over the parsed
// markdown: no layout is involved, so the page half (`pageIndexOffset`,
// `pageNumbering`) is left to the caller, which knows how many pages the
// preceding content produced and how its last page was numbered.

import { hasAnchorRefs } from './references/crossRefs.js';
import { applyLinkNotes } from './references/linkNotes.js';
import { extractFrontmatter } from '../parse/frontmatter.js';
import { parseMarkdownMemo } from '../parse/index.js';
import type { ContentBlock } from '../parse/index.js';
import { effectiveResourceTypes } from '../defaults/index.js';
import { documentLocale } from '../defaults/resources/resourceTypes.js';
import type { HeadingCounters, LayoutContinuation, OutlineEntry, PartState, PostextConfig, PostextContent } from '../types.js';
import { computeHeadingContext, computeResourceNumberingState } from './resources/resourceNumbering.js';
import { planParts } from './sections/parts.js';
import { resolveAllConfig } from './config.js';
import { exerciseCounterEntries, exerciseCountersAfter, exerciseOutline, hasBookSolutions, nameExerciseAnchors } from '../exercises/build.js';
import { codeParseOptions } from './code/codeBlocks.js';
import { headingIsNumbered } from './sections/headingStyles.js';
import { computeOutline, hasIndexDirective, hasTocDirective } from './contents/outline.js';
import { lastFootnoteNumber, numberFootnotes, splitFootnoteDefinitions } from './references/footnotes.js';
import { numberStatements } from './text/statementNumbering.js';
import { lastVerseLineNumber } from './text/lineNumbers.js';
import { composedPages } from '../composed/document.js';
import { isModuleTemplate, resolvePageTemplate } from '../composed/templates.js';

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
  const resolved = resolveAllConfig(config);
  const blocks = parseMarkdownMemo(body, codeParseOptions(resolved));
  const headingContext = computeHeadingContext(blocks, before?.headings, (b) => headingIsNumbered(b, resolved));
  const headings = headingContext.length > 0
    ? headingContext[headingContext.length - 1]!
    : before?.headings ?? NO_HEADINGS;
  const resourceTypes = effectiveResourceTypes(config, content.resources);
  const { map, counters } = computeResourceNumberingState(
    blocks,
    resourceTypes,
    content.resources ?? [],
    headingContext,
    before ? { counters: before.resourceCounters, numbered: before.resourceNumbers } : undefined,
    resolved.numerals,
    documentLocale(config),
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
    const numbering = numberFootnotes(splitFootnoteDefinitions(applyLinkNotes(blocks, resolved.links, resolved.layout.writingMode === 'vertical-rl', resolved.direction === 'rtl')).blocks, 'document', footnoteNumber);
    footnoteNumber = Math.max(footnoteNumber, lastFootnoteNumber(numbering));
  }
  // Labelled equations and counted boxes number on through the book (#530).
  // Exercises number on through the book too (#1227), their counters
  // carried among the statements'.
  const statementCounters = {
    ...numberStatements(blocks, resolved, {
      ...(before?.headings ? { headings: before.headings } : {}),
      ...(before?.statementCounters ? { counters: before.statementCounters } : {}),
    }).counters,
    ...exerciseCounterEntries(exerciseCountersAfter(blocks, resolved, before), headings),
  };
  // Lines of verse counted through the book (#621); a count of every line
  // is the layout's (`VDTDocument.lastLineNumber`), and the inherited
  // number is handed on as it was.
  const lineNumber = lastVerseLineNumber(blocks, resolved, before?.lineNumber) ?? before?.lineNumber;
  return {
    headings,
    resourceCounters: counters,
    resourceNumbers: map,
    ...(Object.keys(statementCounters).length > 0 ? { statementCounters } : {}),
    ...(footnoteNumber > 0 ? { footnoteNumber } : {}),
    ...(lineNumber !== undefined ? { lineNumber } : {}),
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
  const resolved = resolveAllConfig(config);
  const blocks = parseMarkdownMemo(body, codeParseOptions(resolved));
  return {
    // An exercise's key joins the outline, for the book's solutions (#1229),
    // and a reference to an exercise prints its name ("Exercise 3").
    outline: withExercises(computeOutline(blocks, resolved, before?.headings, before?.statementCounters), exerciseOutline(blocks, resolved, before)),
    hasToc: hasTocDirective(blocks),
    hasIndex: hasIndexDirective(blocks) || hasBookSolutions(blocks),
    // A reference naming no resource may name an anchor of the book (#262).
    hasRefs: hasAnchorRefs(blocks, new Set((content.resources ?? []).map((r) => r.id))),
  };
}

/** The `id` of every composed page fence (`::::page{id="…"}`) of a chapter,
 *  in order, whose template the configuration has (#943): what a story of
 *  an earlier chapter can jump to (`overflow.continueIn: 'page:<id>'`). A
 *  host collects them chapter by chapter into `PostextContent.laterPageIds`
 *  (see `laterPageIdsOf`). */
export function pageFenceIds(markdown: string, config?: PostextConfig): string[] {
  if (!markdown.includes('id=')) return [];
  const resolved = resolveAllConfig(config);
  const source = { pageTemplates: resolved.pageTemplates, calloutStyles: resolved.calloutStyles };
  const blocks = parseMarkdownMemo(extractFrontmatter(markdown).content, codeParseOptions(resolved));
  const out: string[] = [];
  for (const page of composedPages(blocks)) {
    const id = page.attrs.id;
    const t = id !== undefined && id !== '' && !out.includes(id) ? resolvePageTemplate(source, page.template) : undefined;
    if (id !== undefined && t && !isModuleTemplate(t)) out.push(id);
  }
  return out;
}

/** For each chapter of a book, the page fences of the chapters after it
 *  (`PostextContent.laterPageIds`, #943): their `id`, and the position of
 *  the nearest chapter that has it. `ids` are the chapters' own ids
 *  (`pageFenceIds`). */
export function laterPageIdsOf(ids: readonly (readonly string[])[]): Record<string, number>[] {
  const out: Record<string, number>[] = new Array(ids.length);
  // A Map, and `fromEntries`: an id may be any word, `__proto__` included.
  const running = new Map<string, number>();
  for (let i = ids.length - 1; i >= 0; i--) {
    out[i] = Object.fromEntries(running);
    for (const id of ids[i]!) running.set(id, i);
  }
  return out;
}

/** The outline with the exercises' entries after it and the anchors of
 *  exercises titled by their names. */
function withExercises(outline: OutlineEntry[], exercises: ReturnType<typeof exerciseOutline>): OutlineEntry[] {
  if (exercises.entries.length === 0) return outline;
  return [...nameExerciseAnchors(outline, exercises.records), ...exercises.entries];
}
