// Pages Word cannot hold as text (#1444): a composed page (`::::page`), a
// comic page (`:::page`) and a comic strip (`:::strip`) are drawn from
// templates, frames and panels the semantic document has no place for.
// Each is written as a short labelled placeholder pointing to the PDF and
// the formatted .docx, generated text that never maps to the source: the
// fence stays in the Markdown as it is on the way back. A strip's caption,
// which the reader sees in the text, stays mapped and editable.

import { extractFrontmatter } from '../../parse/frontmatter.js';
import { parseMarkdownWithIssues } from '../../parse/index.js';
import type { ContentBlock } from '../../parse/types.js';
import { abs, blockId, type WriterContext } from './context.js';
import { FragmentBuilder } from './fragments.js';
import { generatedRuns } from './generated.js';
import { attrRange } from './marks.js';
import { STYLE } from './styles.js';
import { blockSdt, paragraph, textRuns } from './wml.js';

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

/** The placeholder of a page. `fence` is the block that opens it. */
export function renderPagePlaceholder(ctx: WriterContext, fence: ContentBlock, kind: PageKind): string {
  const w = pageWords(ctx.config.locale);
  const text = `${w[kind]} \u2014 ${w.see}`;
  const note = paragraph({ style: STYLE.normal, jc: 'center', ind: { firstLine: 0 }, before: 60, after: 60 }, generatedRuns(ctx, [{ text, i: true, color: '595959' }], `placeholder:${kind}`));
  // A one-cell table, not a bordered paragraph: Word and LibreOffice join
  // the borders of paragraphs in a row into one box.
  let xml = framed(note, ctx.textTwips);
  if (kind === 'strip') xml += stripCaption(ctx, fence);
  return blockSdt(ctx.nextSdtId(), `ptx:${kind}`, w[kind], xml);
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
 * text is in composed or comic pages, which the semantic document can only
 * stand in for with placeholders; `semantic` otherwise. A book with a
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
