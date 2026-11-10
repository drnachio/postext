// The parser's flat block list as Word content (#1390): the container tree
// rebuilt from its start/end markers, lists grouped into Word lists, and
// every text block a paragraph wrapped in its fragment's bookmark.

import type { ContentBlock } from '../../parse/types.js';
import type { ResolvedCalloutStyleConfig } from '../../types.js';
import { renderContainer } from './containers.js';
import { abs, blockId, type WriterContext } from './context.js';
import { renderDirective } from './directives.js';
import { tocMark } from './fields.js';
import { renderCodeListing } from './media/code.js';
import { renderResource } from './media/figures.js';
import { renderSolutions, solutionsBeforeHeading } from './exercises/exercises.js';
import { pageKindOf, renderComicPage } from './media/pages.js';
import { startsFlush } from './prose/flush.js';
import { listItemSpacing } from './prose/listSpacing.js';
import { bodyTabs } from './prose/tabs.js';
import { renderDesignedHeading, type HeadingLook } from './design/heading.js';
import { partHeadingStyle } from './design/partColor.js';
import { headingIsListed } from '../../pipeline/sections/headingStyles.js';
import { renderScoreBlock } from './media/scores.js';
import { FragmentBuilder } from './fragments.js';
import { renderInline, type InlineSource } from './inline.js';
import { markInserts, namedBookmark } from './marks.js';
import { renderDisplayMath } from './math.js';
import type { ListLevelKind } from './numbering.js';
import { lineStart, rawSdt } from './raw.js';
import { STYLE } from './styles.js';
import { renderVerse } from './verse.js';
import { headingStart, spansPage, widenedTwips, type Piece } from './layout/pageSpan.js';
import { blockSdt, paragraph, pPr, rPr, textRuns, type ParaProps } from './wml.js';

export type Node = { block: ContentBlock } | { container: ContentBlock; end?: ContentBlock; children: Node[] };

/** Where blocks are written: the paragraph style their body text takes
 *  (a `:::paragraphs` group, a box body). */
export interface BlockEnv {
  paraStyle?: string;
  /** Width available to tables, boxes and pictures, twips (inside a box
   *  cell: the cell less its margins). Default: the text column. */
  widthTwips?: number;
  /** The box style of the box the blocks stand in: its lists' bullets
   *  and indents. */
  box?: ResolvedCalloutStyleConfig;
  /** The paragraph is set flush, without its first-line indent
   *  (`prose/flush.ts`). */
  flush?: boolean;
  /** The blocks open a `:::paragraphs` group whose first paragraph is
   *  set flush (`prose/flush.ts`). */
  leadFlush?: boolean;
  /** The blocks open a box: a heading first in it drops its space above,
   *  as the engine sets a heading at the top of a box (#1444). */
  boxTop?: boolean;
}

/** Rebuild the container tree from the flat list. */
export function buildTree(blocks: readonly ContentBlock[]): Node[] {
  const root: Node[] = [];
  const stack: { node: Extract<Node, { container: ContentBlock }>; id: number | undefined }[] = [];
  for (const b of blocks) {
    const into = stack.length ? stack[stack.length - 1]!.node.children : root;
    if (b.type === 'containerStart') {
      const node = { container: b, children: [] as Node[] };
      into.push(node);
      stack.push({ node, id: b.containerId });
    } else if (b.type === 'containerEnd') {
      const at = stack.map((s) => s.id).lastIndexOf(b.containerId);
      if (at < 0) continue;
      stack[at]!.node.end = b;
      stack.length = at;
    } else into.push({ block: b });
  }
  return root;
}

const SDT_CLOSE = '</w:sdtContent></w:sdt>';

/** Whether block XML ends with a table (possibly inside content
 *  controls). Reads only the tail (a regex anchored at `$` scans the
 *  whole string). */
export function endsWithTable(xml: string): boolean {
  let end = xml.length;
  while (xml.endsWith(SDT_CLOSE, end)) end -= SDT_CLOSE.length;
  return xml.endsWith('</w:tbl>', end);
}

const TABLE_START = /^(?:<w:sdt><w:sdtPr>(?:(?!<\/w:sdtPr>).)*<\/w:sdtPr><w:sdtContent>)*<w:tbl[ >]/;

/** Join block-level XML: Word merges two tables in a row, so an empty
 *  paragraph goes between them. */
export function joinBlocks(parts: readonly string[]): string {
  let out = '';
  // Whether the last part ended with a table: tested on the part, never on
  // `out` (a rope that each read would flatten again).
  let tableLast = false;
  for (const p of parts) {
    if (!p) continue;
    if (tableLast && TABLE_START.test(p)) out += '<w:p/>';
    out += p;
    tableLast = endsWithTable(p);
  }
  return out;
}

/** The inline source of a text block (offsets made absolute). */
export function inlineSourceOf(ctx: WriterContext, block: ContentBlock, notes = true): InlineSource {
  const sourceMap = block.sourceMap.map((o) => abs(ctx, o));
  return {
    text: block.text,
    spans: block.spans,
    sourceMap,
    src: ctx.chapter.markdown,
    toSrc: (o) => abs(ctx, o),
    end: abs(ctx, block.sourceEnd),
    inlineCode: block.inlineCode?.map((r) => ({ start: abs(ctx, r.start), end: abs(ctx, r.end) })),
    inserts: markInserts(ctx, block, sourceMap),
    noteRef: notes ? (id) => footnote(ctx, id) : undefined,
    citationNote: notes ? (text) => citationNote(ctx, text) : undefined,
    linkFields: !notes,
  };
}

/** A text block as one paragraph holding one fragment. */
export function textParagraph(ctx: WriterContext, block: ContentBlock, props: ParaProps, role: string, lead = '', tail?: () => string): string {
  const { xml, frag } = renderInline(ctx, { ...inlineSourceOf(ctx, block), ...(props.style ? { style: props.style } : {}) });
  const wrapped = ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, block.sourceStart), abs(ctx, block.sourceEnd)],
    role,
  });
  return paragraph(props, lead + wrapped + (tail?.() ?? ''));
}

/** The number the engine prints before a numbered heading ("1.2 "), in a
 *  fragment of generated text (edits to it are rejected). A number that
 *  stands for the title (`numberPosition: 'replace'`) is left out: the
 *  title's own text is what the source holds. */
function headingNumber(ctx: WriterContext, b: ContentBlock): string {
  const prefix = ctx.chapter.headingNumbers.get(b);
  if (!prefix || b.numberIsTitle) return '';
  const level = ctx.resolved.headings.levels.find((l) => l.level === (b.level ?? 1));
  const text = prefix + (level?.numberSeparator ?? ' ');
  const frag = new FragmentBuilder();
  frag.push(text, new Array<number>(text.length).fill(-1));
  return ctx.log.wrap(textRuns(text, ''), frag, { block: blockId(ctx), target: { kind: 'generated' }, range: [0, 0], role: 'number' });
}

/** A heading paragraph, its anchor and number first. */
export function headingParagraph(ctx: WriterContext, b: ContentBlock, look?: HeadingLook): string {
  const level = b.level ?? 1;
  const style = look?.style ?? partHeadingStyle(ctx, b, ctx.styles.heading(level, b.attrs?.style));
  const anchor = tocMark(ctx, b) + (b.attrs?.id ? namedBookmark(ctx, b.attrs.id) : '') + (look?.noNumber ? '' : headingNumber(ctx, b)) + (look?.before?.() ?? '');
  // A heading the contents leave out (`toc=false`) stays out of Word's
  // outline too, so an updated contents field leaves it out as well.
  const outlineLvl = headingIsListed(b, ctx.resolved) ? Math.min(8, level - 1) : 9;
  return textParagraph(ctx, b, { style, outlineLvl, ...look?.props }, `heading:${level}${b.attrs?.style ? `:${b.attrs.style}` : ''}`, anchor, look?.after);
}

/** Set footnote `id`'s definition as a Word footnote; its Word id, or
 *  undefined when there is no definition or it is already set. */
function footnote(ctx: WriterContext, id: string): number | undefined {
  const def = ctx.chapter.defs.get(id);
  if (!def || ctx.chapter.usedDefs.has(id)) return undefined;
  ctx.chapter.usedDefs.add(id);
  const wordId = ctx.nextFootnoteId();
  const { xml, frag } = renderInline(ctx, inlineSourceOf(ctx, def, false));
  const wrapped = ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, def.sourceStart), abs(ctx, def.sourceEnd)],
    role: 'footnote',
    note: true,
  });
  const mark = `<w:r>${rPr({ style: STYLE.footnoteRef })}<w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`;
  ctx.footnotes.push(`<w:footnote w:id="${wordId}"><w:p>${pPr({ style: STYLE.footnoteText })}${mark}${wrapped}</w:p></w:footnote>`);
  return wordId;
}

/** A Word footnote holding a citation (a note style): generated text. */
function citationNote(ctx: WriterContext, text: string): number {
  const wordId = ctx.nextFootnoteId();
  const mark = `<w:r>${rPr({ style: STYLE.footnoteRef })}<w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>`;
  ctx.footnotes.push(`<w:footnote w:id="${wordId}"><w:p>${pPr({ style: STYLE.footnoteText })}${mark}${textRuns(text, '')}</w:p></w:footnote>`);
  return wordId;
}

/** Footnote ids a list of blocks cites (to tell set notes from orphans). */
export function citedNotes(blocks: readonly ContentBlock[]): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.footnoteDef !== undefined) continue;
    for (const s of b.spans) if (s.footnote) out.add(s.footnote.id);
  }
  return out;
}

interface ListRun {
  numId: number;
  checkedId?: number;
  kinds: ListLevelKind[];
}

function levelKind(b: ContentBlock): ListLevelKind {
  return b.listKind === 'ordered' ? 'ordered' : b.listKind === 'task' ? 'task' : 'bullet';
}

/** Group consecutive list items into runs (a new run when the first
 *  level changes kind) and render them with Word numbering. */
function renderList(ctx: WriterContext, items: ContentBlock[], env: BlockEnv): string[] {
  // A list in a box takes the alignment of the box's text (a list
  // paragraph is based on Normal, which may be justified).
  const jc = env.paraStyle ? ctx.styles.jcOf(env.paraStyle) : undefined;
  // Its items take the box's face, size and leading too (#1444).
  const style = env.box && env.paraStyle ? ctx.styles.boxList(env.paraStyle) : STYLE.list;
  const out: string[] = [];
  let firstKind: ListLevelKind | undefined;
  const pending: ContentBlock[] = [];
  const flush = (): void => {
    if (!pending.length) return;
    const kinds: ListLevelKind[] = [];
    for (const b of pending) {
      const d = Math.min(9, Math.max(1, b.depth ?? 1)) - 1;
      if (kinds[d] === undefined) kinds[d] = levelKind(b);
    }
    for (let d = 0; d < kinds.length; d++) kinds[d] ??= kinds[d - 1] ?? 'bullet';
    const run: ListRun = { numId: ctx.numbering.list(kinds, pending[0]!.startNumber, env.box), kinds };
    const spacing = listItemSpacing(ctx, pending, env.box);
    // A list first in a box keeps no space above, as the engine sets it.
    if (env.boxTop && !out.length) spacing[0]!.before = 0;
    // A display number larger than the text holds the item's first line
    // to the leading of the rest (#1444); an item with maths keeps its own.
    const leading = kinds[0] === 'ordered' && ctx.numbering.numberOutgrows(env.box) ? ctx.styles.lineOf(style) : undefined;
    const line = leading ? { twips: leading, rule: 'exact' as const } : undefined;
    pending.forEach((b, k) => {
      const ilvl = Math.min(9, Math.max(1, b.depth ?? 1)) - 1;
      let numId = run.numId;
      if (b.listKind === 'task' && b.checked) {
        run.checkedId ??= ctx.numbering.list(run.kinds.map((kind) => (kind === 'task' ? 'checked' : kind)), undefined, env.box);
        numId = run.checkedId;
      }
      const exact = line && ilvl === 0 && !b.spans.some((s) => s.math) ? { line } : {};
      out.push(textParagraph(ctx, b, { style, numPr: { numId, ilvl }, ...spacing[k], ...exact, tabs: bodyTabs(ctx, b, env.widthTwips ?? ctx.textTwips), jc }, `list:${b.listKind ?? 'unordered'}:${ilvl + 1}`));
    });
    pending.length = 0;
  };
  for (const b of items) {
    const kind = levelKind(b);
    if ((b.depth ?? 1) <= 1) {
      if (firstKind !== undefined && kind !== firstKind) flush();
      firstKind = kind;
    }
    pending.push(b);
  }
  flush();
  return out;
}

/** Render sibling nodes. */
export function renderNodes(ctx: WriterContext, nodes: readonly Node[], env: BlockEnv): string {
  return joinBlocks(renderPieces(ctx, nodes, env).map((p) => p.xml));
}

/** Render sibling nodes as pieces. `after` (the chapter's top level only)
 *  gives what follows each block, list or box: the figures its `:ref`s
 *  float; there each piece also says whether it spans the page and
 *  whether it opens a page (see `layout/pageSpan.ts`). */
export function renderPieces(ctx: WriterContext, nodes: readonly Node[], env: BlockEnv, after?: (nodes: readonly Node[]) => Piece[]): Piece[] {
  const parts: Piece[] = [];
  const add = (xml: string | string[], span = false, block?: ContentBlock): void => {
    for (const x of Array.isArray(xml) ? xml : [xml]) parts.push({ xml: x, ...(span ? { span } : {}), ...(block ? { block } : {}) });
  };
  const follow = (ns: readonly Node[], span: boolean): void => {
    if (after) for (const p of after(ns)) parts.push(p.span === undefined && span ? { ...p, span } : p);
  };
  // Page-spanning content takes the whole text area.
  const across: BlockEnv = { ...env, widthTwips: Math.round((ctx.textAreaPx * 1440) / ctx.units.dpi) };
  const below: BlockEnv = env.boxTop ? { ...env, boxTop: undefined } : env;
  const outer = env;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    // A styled section that widens the measure gives its blocks the room.
    const widened = after ? widenedTwips(ctx, 'container' in n ? n.container : n.block) : undefined;
    env = widened ? { ...(i >= 1 ? below : outer), widthTwips: widened } : i >= 1 ? below : outer;
    const wide = widened ? { ...across, widthTwips: widened } : across;
    const span = !!after && spansPage(ctx, n);
    if ('container' in n) {
      const leadFlush = n.container.containerName === 'paragraphs' && startsFlush(ctx, nodes, i, env.leadFlush);
      add(renderContainer(ctx, n, { ...(span ? wide : env), leadFlush }), span, n.container);
      follow([n], span);
      continue;
    }
    if (n.block.type === 'listItem') {
      const items: ContentBlock[] = [];
      const from = i;
      while (i < nodes.length) {
        const m = nodes[i]!;
        if ('container' in m || m.block.type !== 'listItem') break;
        items.push(m.block);
        i++;
      }
      add(renderList(ctx, items, env));
      follow(nodes.slice(from, i), false);
      i--;
      continue;
    }
    const start = after ? headingStart(ctx, n.block) : undefined;
    const flush = n.block.type === 'paragraph' && startsFlush(ctx, nodes, i, env.leadFlush);
    const xml = renderBlock(ctx, n.block, { ...(span ? wide : env), ...(flush ? { flush } : {}) });
    parts.push({ xml, block: n.block, ...(span ? { span } : {}), ...(start ? { start } : {}) });
    follow([n], span);
  }
  return parts;
}

const BREAKS: Record<string, string> = { pagebreak: 'page', columnbreak: 'column' };

/** One block that is not a list item or a container marker. */
export function renderBlock(ctx: WriterContext, b: ContentBlock, env: BlockEnv): string {
  const start = abs(ctx, b.sourceStart);
  const end = abs(ctx, b.sourceEnd);
  switch (b.type) {
    case 'heading': {
      // A heading style's design writes what it prints around the heading
      // (#1444); `look` is the heading paragraph's under it.
      const write = (look?: HeadingLook): string => headingParagraph(ctx, b, env.boxTop ? { ...look, props: { before: 0, ...look?.props } } : look);
      return solutionsBeforeHeading(ctx, b) + (renderDesignedHeading(ctx, b, write) ?? write());
    }
    case 'paragraph': {
      if (b.footnoteDef !== undefined) return ctx.chapter.cited.has(b.footnoteDef) ? '' : rawSdt(ctx, lineStart(ctx.chapter.markdown, start), end, 'footnote');
      if (b.toc || b.index) return '';
      if (b.verse) return renderVerse(ctx, b, env);
      const style = env.paraStyle ?? STYLE.normal;
      const flush = b.continuesParagraph || (env.flush && !ctx.styles.hangs(style));
      return textParagraph(ctx, b, { style, tabs: bodyTabs(ctx, b, env.widthTwips ?? ctx.textTwips), ind: flush ? { firstLine: 0 } : undefined }, env.paraStyle ? `para:${env.paraStyle}` : 'body');
    }
    case 'blockquote':
      return textParagraph(ctx, b, { style: STYLE.quote }, 'quote');
    case 'code':
      return renderCodeListing(ctx, b) ?? textParagraph(ctx, b, { style: STYLE.code }, `code${b.code?.lang ? `:${b.code.lang}` : ''}`);
    case 'mathDisplay':
      return renderDisplayMath(ctx, b, start, end, env.widthTwips ?? ctx.textTwips);
    case 'resourceBlock':
      return renderResource(ctx, b, start, end, env.widthTwips ?? ctx.textTwips);
    case 'directive': {
      const br = b.directiveName ? BREAKS[b.directiveName] : undefined;
      if (br) return blockSdt(ctx.nextSdtId(), `ptx:${b.directiveName}`, undefined, `<w:p><w:r><w:br w:type="${br}"/></w:r></w:p>`);
      if (b.directiveName === 'solutions') return renderSolutions(ctx, b, env);
      const page = pageKindOf(b);
      if (page === 'comicPage' || page === 'strip') return renderComicPage(ctx, b, page, env.widthTwips);
      return renderDirective(ctx, b) ?? rawSdt(ctx, start, end, b.directiveName ?? 'directive');
    }
    case 'score':
      return renderScoreBlock(ctx, b, start, end, env.widthTwips ?? ctx.textTwips);
    default:
      return rawSdt(ctx, start, end, b.type);
  }
}
