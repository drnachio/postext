// The contents and the index as Word fields (#1444): `:::toc` becomes a
// TOC field and `:::index` an INDEX field, each with a result listing the
// book's headings or index terms as the export knows them (without page
// numbers, which only Word's own layout can give; updating the field in
// Word fills them in). The directive's source is not written: the reader
// takes nothing from these fields' results, and source that no fragment
// covers stays as it is on re-import.

import type { ContentBlock } from '../../parse/types.js';
import { stripInlineFormatting } from '../../parse/inlineFormatting.js';
import { computeOutline } from '../../pipeline/contents/outline.js';
import { expandTocDirectives, parseTocLevelsAttr } from '../../pipeline/contents/toc.js';
import { computeHeadingContext } from '../../pipeline/resources/resourceNumbering.js';
import { headingIsNumbered } from '../../pipeline/sections/headingStyles.js';
import type { HeadingCounters, OutlineEntry } from '../../types.js';
import { seeLabels } from './marks.js';
import type { WriterContext } from './context.js';
import { blockSdt, paragraph, rPr, textRuns } from './wml.js';
import { escapeXml } from '../xml.js';

/** The book's outline, chapter after chapter with the heading counters
 *  carried on, as the engine counts a book laid out chapter by chapter. */
export function bookOutline(ctx: WriterContext): OutlineEntry[] {
  if (ctx.outline) return ctx.outline;
  const out: OutlineEntry[] = [];
  const isNumbered = (b: ContentBlock): boolean => headingIsNumbered(b, ctx.resolved);
  let before: HeadingCounters | undefined;
  for (const ch of ctx.book) {
    out.push(...computeOutline(ch.blocks, ctx.resolved, before));
    const context = computeHeadingContext(ch.blocks, before, isNumbered);
    if (context.length) before = context[context.length - 1];
  }
  ctx.outline = out;
  return out;
}

/** One line of a field result: its text runs and paragraph style. */
interface ResultLine {
  style: string;
  runs: string;
}

/** A complex field whose result spans paragraphs: the field begins in the
 *  first paragraph and ends in the last. An empty result is one paragraph
 *  holding the bare field. */
function fieldParagraphs(instr: string, lines: readonly ResultLine[], emptyStyle: string): string {
  const begin = `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${escapeXml(instr)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  if (!lines.length) return paragraph({ style: emptyStyle }, begin + end);
  return lines.map((l, i) => paragraph({ style: l.style }, (i === 0 ? begin : '') + l.runs + (i === lines.length - 1 ? end : ''))).join('');
}

/** Runs of a title with its bold and italic spans. */
function titleRuns(spans: readonly { text: string; bold?: boolean; italic?: boolean }[]): string {
  return spans.map((s) => textRuns(s.text, rPr({ ...(s.bold ? { b: true } : {}), ...(s.italic ? { i: true } : {}) }))).join('');
}

/** A `:::toc` directive as a TOC field listing the book's headings. */
export function tocField(ctx: WriterContext, directive: ContentBlock): string {
  // Groups kept together on a page would repeat their part rows ("(cont.)").
  const flat = { ...directive, directiveAttrs: { ...directive.directiveAttrs, keep: 'none' } };
  const rows = expandTocDirectives([flat], bookOutline(ctx), ctx.resolved);
  const lines: ResultLine[] = [];
  for (const row of rows) {
    const info = row.toc;
    if (!info) continue;
    if (info.kind === 'part') {
      const text = [info.number, info.title].filter(Boolean).join(' ');
      if (text) lines.push({ style: ctx.styles.listing('toc', 1), runs: textRuns(text, rPr({ b: true })) });
      continue;
    }
    const number = info.number ? textRuns(`${info.number} `, '') : '';
    lines.push({ style: ctx.styles.listing('toc', info.level), runs: number + titleRuns(row.spans.length ? row.spans : [{ text: row.text }]) });
    if (info.subtitle) lines.push({ style: ctx.styles.listing('toc', info.level + 1), runs: textRuns(info.subtitle, rPr({ i: true })) });
  }
  const levels = [...(parseTocLevelsAttr(directive.directiveAttrs?.levels) ?? new Set(ctx.resolved.toc.levels.map((l) => l.level)))];
  const lo = levels.length ? Math.min(...levels) : 1;
  const hi = levels.length ? Math.max(...levels) : 3;
  const instr = `TOC \\o "${lo}-${hi}" \\h \\z \\u`;
  return blockSdt(ctx.nextSdtId(), 'ptx:toc', 'Table of contents', fieldParagraphs(instr, lines, ctx.styles.listing('toc', 1)));
}

interface IndexEntry {
  text: string;
  see: string[];
  seeAlso: string[];
  children: Map<string, IndexEntry>;
}

/** A `:::index` directive as an INDEX field listing the book's index
 *  terms (those of its index, `index="…"`), sorted in the book's language. */
export function indexField(ctx: WriterContext, directive: ContentBlock): string {
  const name = directive.directiveAttrs?.index?.trim() ?? '';
  const root = new Map<string, IndexEntry>();
  for (const ch of ctx.book) {
    for (const b of ch.blocks) {
      for (const m of b.indexMarks ?? []) {
        if ((m.index ?? '') !== name || !m.path.length) continue;
        let level = root;
        let node: IndexEntry | undefined;
        for (const term of m.path) {
          const text = stripInlineFormatting(term).trim();
          node = level.get(text);
          if (!node) level.set(text, (node = { text, see: [], seeAlso: [], children: new Map() }));
          level = node.children;
        }
        if (m.see && !node!.see.includes(m.see)) node!.see.push(m.see);
        if (m.seeAlso && !node!.seeAlso.includes(m.seeAlso)) node!.seeAlso.push(m.seeAlso);
      }
    }
  }
  const collator = new Intl.Collator(ctx.config.locale || undefined, { sensitivity: 'base', numeric: true });
  const labels = seeLabels(ctx);
  const lines: ResultLine[] = [];
  const walk = (level: Map<string, IndexEntry>, depth: number): void => {
    for (const e of [...level.values()].sort((a, b) => collator.compare(a.text, b.text))) {
      let text = e.text;
      if (e.see.length) text += `. ${labels.see} ${e.see.join('; ')}`;
      if (e.seeAlso.length) text += `. ${labels.seeAlso} ${e.seeAlso.join('; ')}`;
      lines.push({ style: ctx.styles.listing('index', depth), runs: textRuns(text, '') });
      walk(e.children, depth + 1);
    }
  };
  walk(root, 1);
  const instr = `INDEX${name ? ` \\f "${name.replace(/[\\"]/g, '\\$&')}"` : ''}`;
  return blockSdt(ctx.nextSdtId(), 'ptx:index', 'Index', fieldParagraphs(instr, lines, ctx.styles.listing('index', 1)));
}
