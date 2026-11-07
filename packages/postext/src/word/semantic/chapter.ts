// One chapter of the semantic .docx (#1390): front matter kept as source,
// the body parsed by the engine parser and written block by block, and the
// section break that ends it.

import { extractFrontmatter } from '../../parse/frontmatter.js';
import { parseMarkdownWithIssues } from '../../parse/index.js';
import type { ContentBlock, ParseIssue, ParseOptions } from '../../parse/types.js';
import { buildTree, citedNotes, renderNodes } from './blocks.js';
import type { WriterContext } from './context.js';
import { chapterSolutions } from './exercises.js';
import { namedBookmark } from './marks.js';
import { lineStart, rawSdt } from './raw.js';
import { sectionXml, type PageGeometry } from './sections.js';
import type { WordChapterInput } from './types.js';
import { pPr } from './wml.js';

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
  let xml = namedBookmark(ctx, `chapter_${pc.input.id}`);
  if (pc.offset > 0) xml += rawSdt(ctx, 0, pc.offset, 'frontmatter');
  xml += renderNodes(ctx, buildTree(pc.blocks), {});
  xml += chapterSolutions(ctx);
  // Notes cited only from text kept as source: their definitions too.
  for (const [id, def] of defs) {
    if (ctx.chapter.cited.has(id) && !ctx.chapter.usedDefs.has(id)) xml += rawSdt(ctx, lineStart(pc.input.markdown, def.sourceStart + pc.offset), def.sourceEnd + pc.offset, 'footnote');
  }
  const sect = sectionXml(ctx, geo, index, pc.input.title);
  return last ? xml + sect : `${xml}<w:p>${pPr({ sectPr: sect })}</w:p>`;
}
