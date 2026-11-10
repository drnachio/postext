// One chapter of the semantic .docx (#1390): the front matter left out
// (#1444), the body parsed by the engine parser and written block by block, and the
// section break that ends it.

import { extractFrontmatter } from '../../parse/frontmatter.js';
import { parseMarkdownWithIssues } from '../../parse/index.js';
import type { ContentBlock, ParseIssue, ParseOptions } from '../../parse/types.js';
import { buildTree, citedNotes, renderPieces } from './blocks.js';
import type { WriterContext } from './context.js';
import { chapterSolutions } from './exercises/exercises.js';
import { floatedAfter } from './media/floated.js';
import { bottomBoxesLast } from './media/bottomBoxes.js';
import { namedBookmark } from './marks.js';
import { renderWorksList } from './prose/citations.js';
import { blockSdt } from './wml.js';
import { lineStart, rawSdt } from './raw.js';
import { bookPageNumbers, type PageGeometry } from './sections.js';
import { chapterSections, type Piece } from './layout/pageSpan.js';
import type { WordChapterInput } from './types.js';

export interface ParsedChapter {
  input: WordChapterInput;
  /** Offset of the body (after the front matter). */
  offset: number;
  blocks: ContentBlock[];
  issues: ParseIssue[];
}

export function parseChapter(input: WordChapterInput, options: ParseOptions): ParsedChapter {
  const fm = extractFrontmatter(input.markdown);
  const offset = fm.contentOffset;
  const { blocks, issues } = parseMarkdownWithIssues(input.markdown.slice(offset), options);
  return { input, offset, blocks, issues };
}

/** The chapter's body XML, ending with its section (a paragraph carrying
 *  the `w:sectPr`, or, for the last chapter, the bare `w:sectPr` the body
 *  ends with). */
export function renderChapter(ctx: WriterContext, pc: ParsedChapter, index: number, geo: PageGeometry, last: boolean): string {
  const defs = new Map<string, ContentBlock>();
  const headingNumbers = new Map<ContentBlock, string>();
  const prefixes = ctx.numbers.headings[index] ?? [];
  pc.blocks.forEach((b, i) => {
    if (prefixes[i] !== undefined) headingNumbers.set(b, prefixes[i]!);
  });
  for (const b of pc.blocks) if (b.footnoteDef !== undefined && !defs.has(b.footnoteDef)) defs.set(b.footnoteDef, b);
  // The number format goes on from the chapter before (the engine keeps
  // the current format until a `:::numbering` changes it); a start does not.
  const carried = index > 0 ? ctx.chapter?.pageNumbers?.format : undefined;
  ctx.chapter = {
    index,
    input: pc.input,
    markdown: pc.input.markdown,
    offset: pc.offset,
    defs,
    cited: citedNotes(pc.blocks),
    usedDefs: new Set(),
    headingNumbers,
    blockCounter: 0,
  };
  for (const issue of pc.issues) ctx.warn(`parse:${issue.kind}`, `Unclosed or stray ${issue.delimiter} at offset ${issue.sourceStart + pc.offset}.`);
  ctx.chapter.pageNumbers = index === 0 ? bookPageNumbers(ctx) : carried ? { format: carried } : undefined;
  const mark = namedBookmark(ctx, `chapter_${pc.input.id}`);
  // The front matter is not shown: its title and author go to the
  // document properties, and source no fragment covers is kept as it is
  // on re-import.
  const pieces: Piece[] = renderPieces(ctx, bottomBoxesLast(buildTree(pc.blocks), ctx.resolved.calloutStyles), {}, (nodes) => floatedAfter(ctx, nodes));
  pieces.push({ xml: chapterSolutions(ctx) });
  // A list of works nothing places goes after the text.
  for (const list of ctx.citations?.unplaced(index) ?? []) pieces.push({ xml: blockSdt(ctx.nextSdtId(), 'ptx:bibliography', undefined, renderWorksList(ctx, list)) });
  // Notes cited only from text kept as source: their definitions too.
  for (const [id, def] of defs) {
    if (ctx.chapter.cited.has(id) && !ctx.chapter.usedDefs.has(id)) pieces.push({ xml: rawSdt(ctx, lineStart(pc.input.markdown, def.sourceStart + pc.offset), def.sourceEnd + pc.offset, 'footnote') });
  }
  const first = pieces.find((p) => p.xml);
  if (first) first.xml = mark + first.xml;
  else pieces.push({ xml: mark });
  return chapterSections(ctx, geo, index, pieces, last);
}
