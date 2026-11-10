// Pages drawn from templates and panels (#1444): a composed page
// (`::::page`), a comic page (`:::page`) and a comic strip (`:::strip`).
// Word has no place for a template's frames or a panel's balloons, so the
// semantic document writes what fills them as flowing text: a composed
// page's blocks in the order the Markdown gives them (a frame its template
// draws as a box as a box in that style, else with its label as a title; a
// module's frames one after another, then the answer lines of its empty
// ruled frames; a picture set over a frame inside it, see frames.ts),
// starting a new page as the book does; a comic page's panels as pictures
// followed by their script (see comics.ts); a strip as a row of bordered
// panels, each with its picture and script, the caption in a row under
// them (see strip.ts). The text stays mapped to the Markdown. A page with
// nothing to write (no panel has art or words) is a short labelled
// placeholder pointing to the PDF, generated text the importer leaves
// out. A strip's caption stays mapped and editable. The plain design
// (#1458) writes the same, without the page starts.

import { extractFrontmatter } from '../../../parse/frontmatter.js';
import { parseMarkdownWithIssues } from '../../../parse/index.js';
import type { ResolvedPageTemplate } from '../../../composed/types/resolved.js';
import type { ContentBlock } from '../../../parse/types.js';
import { headingParagraph, renderNodes, type BlockEnv, type Node } from '../blocks.js';
import { renderBox } from '../containers.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { attrRange } from '../marks.js';
import { STYLE } from '../styles.js';
import { blockSdt, paragraph, textRuns } from '../wml.js';
import { stripCaptionParagraph } from './captions.js';
import { comicPanels, renderComic } from './comics.js';
import { renderStrip } from './strip.js';
import { pageOpener } from './pageOpener.js';
import { frameBoxStyle, numberTemplateHeading, overFrame, ruledLines, templateOf } from './frames.js';

export type PageKind = 'composedPage' | 'comicPage' | 'strip';

interface PageWords {
  composedPage: string;
  comicPage: string;
  strip: string;
  /** Where the page is: in the PDF. */
  see: string;
}

const WORDS: Record<string, PageWords> = {
  en: { composedPage: 'Composed page', comicPage: 'Comic page', strip: 'Comic strip', see: 'see the PDF' },
  es: { composedPage: 'Página compuesta', comicPage: 'Página de cómic', strip: 'Tira de cómic', see: 'véase el PDF' },
  ca: { composedPage: 'Pàgina composta', comicPage: 'Pàgina de còmic', strip: 'Tira de còmic', see: 'vegeu el PDF' },
  fr: { composedPage: 'Page composée', comicPage: 'Planche de bande dessinée', strip: 'Strip de bande dessinée', see: 'voir le PDF' },
  de: { composedPage: 'Gestaltete Seite', comicPage: 'Comicseite', strip: 'Comicstreifen', see: 'siehe das PDF' },
  it: { composedPage: 'Pagina composta', comicPage: 'Tavola a fumetti', strip: 'Striscia a fumetti', see: 'vedi il PDF' },
  pt: { composedPage: 'Página composta', comicPage: 'Página de quadrinhos', strip: 'Tirinha', see: 'veja o PDF' },
  zh: { composedPage: '版式页', comicPage: '漫画页', strip: '条漫', see: '见 PDF' },
  ja: { composedPage: '組版ページ', comicPage: 'マンガのページ', strip: 'コマ漫画', see: 'PDF を参照' },
  ar: { composedPage: 'صفحة مركّبة', comicPage: 'صفحة قصص مصوّرة', strip: 'شريط مصوّر', see: 'انظر ملف PDF' },
};

/** The placeholder's words in the book's language (English for one the
 *  table lacks). */
export function pageWords(locale: string | undefined): PageWords {
  return WORDS[(locale ?? 'en').toLowerCase().split(/[-_]/)[0]!] ?? WORDS.en!;
}

/** The kind of page a block opens, if it is one. */
export function pageKindOf(b: ContentBlock): PageKind | undefined {
  if (b.type === 'containerStart' && b.containerName === 'composedPage') return 'composedPage';
  if (b.type === 'directive' && b.directiveName === 'page' && b.comic) return 'comicPage';
  if (b.type === 'directive' && b.directiveName === 'strip') return 'strip';
  return undefined;
}

/** A comic page or strip: its panels, or a placeholder when none has
 *  art or words. `widthTwips` is the width it stands in. */
export function renderComicPage(ctx: WriterContext, fence: ContentBlock, kind: 'comicPage' | 'strip', widthTwips?: number): string {
  const width = Math.max(240, Math.round(widthTwips ?? ctx.textTwips));
  const caption = (): string => (kind === 'strip' ? stripCaption(ctx, fence) : '');
  const filled = comicPanels(fence).some((p) => (p.art && ctx.media.has(p.art)) || p.text || p.items.some((i) => i.role !== 'note' && i.text.trim()));
  // A comic page starts a page, as in print, so one page's panels do not
  // run into the next one's.
  if (filled) return kind === 'comicPage' ? pageStart(ctx) + renderComic(ctx, fence, kind, width, caption) : renderStrip(ctx, fence, width, caption);
  return renderPagePlaceholder(ctx, kind, width, caption);
}

/** The placeholder of a page with nothing Word can hold. */
function renderPagePlaceholder(ctx: WriterContext, kind: PageKind, width: number, caption = (): string => ''): string {
  const w = pageWords(ctx.config.locale);
  const text = `${w[kind]} \u2014 ${w.see}`;
  const note = paragraph({ style: STYLE.normal, jc: 'center', ind: { firstLine: 0 }, before: 60, after: 60 }, generatedRuns(ctx, [{ text, i: true, color: '595959' }], `placeholder:${kind}`));
  // A one-cell table, not a bordered paragraph: Word and LibreOffice join
  // the borders of paragraphs in a row into one box.
  return blockSdt(ctx.nextSdtId(), `ptx:${kind}`, w[kind], framed(note, width) + caption());
}

type ContainerNode = Extract<Node, { container: unknown }>;

/** A paragraph that starts a new page and takes no room (a page break
 *  before it at the top of a page adds none). */
const PAGE_START_XML = '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr></w:p>';

/** The start of a composed or comic page: a new page, as the book sets
 *  it; in the plain design the text runs on. */
const pageStart = (ctx: WriterContext): string => (ctx.plain ? '' : PAGE_START_XML);

/** A frame's `label`, mapped to the attribute's value (generated text
 *  when the value cannot be found as written). */
function frameLabel(ctx: WriterContext, c: ContentBlock): string {
  const md = ctx.chapter.markdown;
  const label = c.containerAttrs?.label;
  if (!label) return '';
  const own = c.containerAttrSources?.label;
  // The parser's range first, else the fence line read again (a range
  // that does not hold the value is not used).
  const range = [own ? { start: abs(ctx, own.sourceStart), end: abs(ctx, own.sourceEnd) } : undefined, attrRange(md, abs(ctx, c.sourceStart), 'label')].find(
    (r) => r && r.end > r.start && md.slice(r.start, r.end) === label,
  );
  if (!range) return paragraph({ style: STYLE.boxTitle }, generatedRuns(ctx, [{ text: label }], 'frame:label'));
  const text = md.slice(range.start, range.end);
  const f = new FragmentBuilder();
  f.push(text, Array.from({ length: text.length }, (_, k) => range.start + k));
  const runs = ctx.log.wrap(textRuns(text, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [range.start, range.end], role: 'attr:frame:label' });
  return paragraph({ style: STYLE.boxTitle }, runs);
}

/** The slot a block or a frame fills. */
const slotOf = (n: Node): string | undefined => ('container' in n ? n.container.containerAttrs?.slot : n.block.slot?.name);

/** The nodes of a composed page (or of a frame or module in it): frames
 *  and modules opened here, everything else through the block writer.
 *  `templates` are the page's template and, inside a module, its own. */
function pageNodes(ctx: WriterContext, nodes: readonly Node[], env: BlockEnv, templates: readonly (ResolvedPageTemplate | undefined)[], title?: { block: ContentBlock; xml: () => string }): string {
  const template = templates[templates.length - 1];
  // A picture set over a frame (a photo in a box's corner) goes into it.
  const frames = new Map<string, ContainerNode>();
  for (const n of nodes) if ('container' in n && n.container.containerName === 'frame' && slotOf(n)) frames.set(slotOf(n)!, n);
  const moved = new Map<ContainerNode, Node[]>();
  const rest = nodes.filter((n) => {
    const host = 'block' in n ? frames.get(overFrame(template, slotOf(n)) ?? '') : undefined;
    if (host) moved.set(host, [...(moved.get(host) ?? []), n]);
    return !host;
  });
  let out = '';
  let run: Node[] = [];
  const flush = (): void => {
    if (run.length) out += renderNodes(ctx, run, env);
    run = [];
  };
  for (const n of rest) {
    // The page's title, with what its template draws round it.
    if (title && 'block' in n && n.block === title.block) {
      flush();
      out += title.xml();
      continue;
    }
    const name = 'container' in n ? n.container.containerName : undefined;
    if (name !== 'frame' && name !== 'module') {
      run.push(n);
      continue;
    }
    flush();
    const node = n as ContainerNode;
    const c = node.container;
    const slot = c.containerAttrs?.slot ?? c.containerAttrs?.template ?? '';
    const tag = `ptx:${name}${slot ? `:${slot}` : ''}`;
    const children = [...node.children, ...(moved.get(node) ?? [])];
    if (name === 'module') {
      // A module's frames, then the answer lines of its empty ruled ones.
      const own = templateOf(ctx, c.containerAttrs?.template);
      const inner = [...templates, own];
      const body = pageNodes(ctx, children, env, inner) + ruledLines(ctx, own, new Set(children.map(slotOf).filter((s): s is string => !!s)));
      out += blockSdt(ctx.nextSdtId(), tag, undefined, body || '<w:p/>');
      continue;
    }
    // A frame drawn as a box in print is a box here too, in its style.
    const style = frameBoxStyle(ctx, templates, c.containerAttrs?.slot);
    if (style) {
      out += renderBox(ctx, { ...node, children }, env, { style, head: () => frameLabel(ctx, c), tag });
      continue;
    }
    const body = frameLabel(ctx, c) + pageNodes(ctx, children, env, templates);
    out += blockSdt(ctx.nextSdtId(), tag, undefined, body || '<w:p/>');
  }
  flush();
  return out;
}

/** The first heading among `nodes`, frames and modules included. */
function firstHeading(nodes: readonly Node[]): ContentBlock | undefined {
  for (const n of nodes) {
    if ('block' in n) {
      if (n.block.type === 'heading') return n.block;
    } else {
      const h = firstHeading(n.children);
      if (h) return h;
    }
  }
  return undefined;
}

/** A composed page: its content in Markdown order, on a page of its own. */
export function renderComposedPage(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const id = node.container.composedPage?.template ?? node.container.containerAttrs?.template ?? '';
  const template = templateOf(ctx, id);
  numberTemplateHeading(ctx, template, firstHeading(node.children));
  // The heading set on the page itself, not in a frame of it, is the
  // title its template's head goes round.
  const top = node.children.find((n): n is { block: ContentBlock } => 'block' in n && n.block.type === 'heading')?.block;
  // Written where it stands, so the map lists its pieces in order.
  const title = top ? { block: top, xml: () => pageOpener(ctx, node.container, top, (look) => headingParagraph(ctx, top, look)) ?? renderNodes(ctx, [{ block: top }], env) } : undefined;
  const body = pageNodes(ctx, node.children, env, [template], title);
  if (!body) return renderPagePlaceholder(ctx, 'composedPage', Math.max(240, Math.round(env.widthTwips ?? ctx.textTwips)));
  return blockSdt(ctx.nextSdtId(), `ptx:composedPage${id ? `:${id}` : ''}`, undefined, pageStart(ctx) + body);
}

/** `content` in a grey framed cell `width` twips wide. */
function framed(content: string, width: number): string {
  const b = 'w:val="single" w:sz="6" w:space="0" w:color="9A9A9A"';
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>${content}</w:tc></w:tr></w:tbl>`
  );
}

/** A strip's `caption="…"`, mapped to the attribute's value. */
function stripCaption(ctx: WriterContext, fence: ContentBlock): string {
  const md = ctx.chapter.markdown;
  const range = attrRange(md, abs(ctx, fence.sourceStart), 'caption');
  if (!range || range.end <= range.start) return '';
  const text = md.slice(range.start, range.end);
  const f = new FragmentBuilder();
  f.push(text, Array.from({ length: text.length }, (_, k) => range.start + k));
  // The label and number go first, so their fragment is logged first.
  return stripCaptionParagraph(ctx, fence, () => ctx.log.wrap(textRuns(text, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [range.start, range.end], role: 'attr:strip:caption' }));
}

/**
 * The Word variant that suits a book (#1444): `formatted` when most of its
 * text is in composed or comic pages, whose design only the formatted
 * document keeps (the semantic one writes their text as flowing text);
 * `semantic` otherwise. A book with a
 * single composed page or strip among its chapters stays semantic.
 */
export function preferredWordVariant(chapters: ReadonlyArray<{ markdown: string }>): 'semantic' | 'formatted' {
  let total = 0;
  let pages = 0;
  for (const c of chapters) {
    // Cheap test first: no page fence, nothing to parse.
    if (!/^\s*:{3,}\s*(?:page|strip)\b/m.test(c.markdown)) {
      total += c.markdown.length;
      continue;
    }
    const body = c.markdown.slice(extractFrontmatter(c.markdown).contentOffset);
    total += body.length;
    const { blocks } = parseMarkdownWithIssues(body);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      const kind = pageKindOf(b);
      if (!kind) continue;
      if (kind !== 'composedPage') {
        pages += b.sourceEnd - b.sourceStart;
        continue;
      }
      const id = b.containerId;
      let end = b.sourceEnd;
      for (let k = i + 1; k < blocks.length; k++) {
        end = Math.max(end, blocks[k]!.sourceEnd);
        if (blocks[k]!.type === 'containerEnd' && blocks[k]!.containerId === id) {
          i = k;
          break;
        }
      }
      pages += end - b.sourceStart;
    }
  }
  return total > 0 && pages / total >= 0.5 ? 'formatted' : 'semantic';
}
