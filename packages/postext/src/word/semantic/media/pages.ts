// Pages drawn from templates and panels (#1444): a composed page
// (`::::page`), a comic page (`:::page`) and a comic strip (`:::strip`).
// Word has no place for a template's frames or a panel's balloons, so the
// semantic document writes what fills them as flowing text: a composed
// page's blocks in the order the Markdown gives them (a frame's label as
// its title, a module's frames one after another), starting a new page as
// the book does; a comic's panels as pictures followed by their script
// (see comics.ts). The text stays mapped to the Markdown. A page with
// nothing to write (no panel has art or words) is a short labelled
// placeholder pointing to the PDF and the formatted .docx, generated text
// the importer leaves out. A strip's caption stays mapped and editable.

import { extractFrontmatter } from '../../../parse/frontmatter.js';
import { parseMarkdownWithIssues } from '../../../parse/index.js';
import type { ContentBlock } from '../../../parse/types.js';
import { renderNodes, type BlockEnv, type Node } from '../blocks.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { FragmentBuilder } from '../fragments.js';
import { generatedRuns } from '../generated.js';
import { attrRange } from '../marks.js';
import { STYLE } from '../styles.js';
import { blockSdt, paragraph, textRuns } from '../wml.js';
import { comicPanels, renderComic } from './comics.js';

export type PageKind = 'composedPage' | 'comicPage' | 'strip';

interface PageWords {
  composedPage: string;
  comicPage: string;
  strip: string;
  /** Where the page is: in the PDF and the formatted .docx. */
  see: string;
}

const WORDS: Record<string, PageWords> = {
  en: { composedPage: 'Composed page', comicPage: 'Comic page', strip: 'Comic strip', see: 'see the PDF or the formatted .docx' },
  es: { composedPage: 'Página compuesta', comicPage: 'Página de cómic', strip: 'Tira de cómic', see: 'véase el PDF o el .docx maquetado' },
  ca: { composedPage: 'Pàgina composta', comicPage: 'Pàgina de còmic', strip: 'Tira de còmic', see: 'vegeu el PDF o el .docx maquetat' },
  fr: { composedPage: 'Page composée', comicPage: 'Planche de bande dessinée', strip: 'Strip de bande dessinée', see: 'voir le PDF ou le .docx mis en page' },
  de: { composedPage: 'Gestaltete Seite', comicPage: 'Comicseite', strip: 'Comicstreifen', see: 'siehe das PDF oder die gesetzte .docx' },
  it: { composedPage: 'Pagina composta', comicPage: 'Tavola a fumetti', strip: 'Striscia a fumetti', see: 'vedi il PDF o il .docx impaginato' },
  pt: { composedPage: 'Página composta', comicPage: 'Página de quadrinhos', strip: 'Tirinha', see: 'veja o PDF ou o .docx diagramado' },
  zh: { composedPage: '版式页', comicPage: '漫画页', strip: '条漫', see: '见 PDF 或版式 .docx' },
  ja: { composedPage: '組版ページ', comicPage: 'マンガのページ', strip: 'コマ漫画', see: 'PDF または組版どおりの .docx を参照' },
  ar: { composedPage: 'صفحة مركّبة', comicPage: 'صفحة قصص مصوّرة', strip: 'شريط مصوّر', see: 'انظر ملف PDF أو ملف ‎.docx المُنسَّق' },
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
  if (filled) return renderComic(ctx, fence, kind, width, caption);
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
const PAGE_START = '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr></w:p>';

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

/** The nodes of a composed page (or of a frame or module in it): frames
 *  and modules opened here, everything else through the block writer. */
function pageNodes(ctx: WriterContext, nodes: readonly Node[], env: BlockEnv): string {
  let out = '';
  let run: Node[] = [];
  const flush = (): void => {
    if (run.length) out += renderNodes(ctx, run, env);
    run = [];
  };
  for (const n of nodes) {
    const name = 'container' in n ? n.container.containerName : undefined;
    if (name !== 'frame' && name !== 'module') {
      run.push(n);
      continue;
    }
    flush();
    const c = (n as ContainerNode).container;
    const body = (name === 'frame' ? frameLabel(ctx, c) : '') + pageNodes(ctx, (n as ContainerNode).children, env);
    const slot = c.containerAttrs?.slot ?? c.containerAttrs?.template ?? '';
    out += blockSdt(ctx.nextSdtId(), `ptx:${name}${slot ? `:${slot}` : ''}`, undefined, body || '<w:p/>');
  }
  flush();
  return out;
}

/** A composed page: its content in Markdown order, on a page of its own. */
export function renderComposedPage(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const body = pageNodes(ctx, node.children, env);
  if (!body) return renderPagePlaceholder(ctx, 'composedPage', Math.max(240, Math.round(env.widthTwips ?? ctx.textTwips)));
  const template = node.container.composedPage?.template ?? node.container.containerAttrs?.template ?? '';
  return blockSdt(ctx.nextSdtId(), `ptx:composedPage${template ? `:${template}` : ''}`, undefined, PAGE_START + body);
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
  const runs = ctx.log.wrap(textRuns(text, ''), f, { block: blockId(ctx), target: { kind: 'markdown', chapter: ctx.chapter.index }, range: [range.start, range.end], role: 'attr:strip:caption' });
  return paragraph({ style: STYLE.caption }, runs);
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
