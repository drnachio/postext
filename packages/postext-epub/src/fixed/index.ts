// Fixed-layout (pre-paginated) rendition: every printed page of the book
// becomes one XHTML content document that reproduces it with real text,
// from the same markup the HTML renderer gives the Sandbox.
//
//   OEBPS/pages/page-0001.xhtml …   one per page, viewport = page size
//   OEBPS/pages/cover.xhtml          when a cover picture is given
//   OEBPS/styles/fixed.css           @font-face + the text reset
//   OEBPS/fonts/…, OEBPS/images/…    shared assets (shared/assets.ts)

import {
  anchoredResourceIds,
  applySingleInkToSvg,
  canonicalLocaleTag,
  directionOf,
  HTML_TEXT_RESET,
  renderToHtmlIndexed,
  resolveColorValue,
} from 'postext';
import type { VDTDocument, VDTPage } from 'postext';
import type {
  EpubItem,
  EpubLandmark,
  EpubPageTarget,
  EpubPublication,
  EpubSource,
  EpubSpineEntry,
  RenderToEpubOptions,
} from '../types';
import { defaultAccessibility } from '../shared/accessibility';
import { fontAssets, imageAssets, pageProgressionOf } from '../shared/assets';
import { decodeEntities, escapeAttr, escapeXml, htmlToXhtml, xhtmlDocument, xmlId } from '../shared/xml';
import { navStrings } from '../package/strings';
import { fontUses, missingFaces, type FontUse } from './fontUse';
import { headingTitle, nestOutline, pageHeadings, partTitle, type OutlineEntry } from './outline';

/** Directory of the page documents, relative to the package document. */
const PAGES_DIR = 'pages/';
const STYLESHEET_HREF = 'styles/fixed.css';

/** CSS px per inch: the viewport is the page at its CSS size. */
const CSS_DPI = 96;

/** The engine's text reset without `direction`, which EPUB style sheets
 *  must not set (the page box takes `dir="ltr"` instead). */
const TEXT_RESET = HTML_TEXT_RESET.replace(/(?:^|;)direction:[^;]*;?/, ';').replace(/^;/, '');

/** One printed page on its way to a content document. */
interface PagePlan {
  doc: VDTDocument;
  page: VDTPage;
  /** Physical page index in the book (0 = first page). */
  bookIndex: number;
  file: string;
  /** Renderer markup with the outline anchors added. */
  html: string;
  /** Ids the page's markup sets (as XHTML will have them). */
  ids: string[];
  /** Outline entries that start on this page. */
  outline: OutlineEntry[];
  lang: string;
}

/** The book language of a document: its configured locale, else the
 *  hyphenation one, else the book's. */
function docLanguage(doc: VDTDocument, fallback: string): string {
  const c = doc.config as { locale?: string; bodyText?: { hyphenation?: { tag?: string; locale?: string } } };
  return canonicalLocaleTag(c.locale) ?? canonicalLocaleTag(c.bodyText?.hyphenation?.tag) ?? fallback;
}

/** The ink SVG pictures are recoloured to, or null without single ink. */
function inkOf(doc: VDTDocument): string | null {
  const ds = doc.config.diagramStyle;
  return ds?.singleInk ? resolveColorValue(ds.inkColor, doc.config.colorPalette, ds.inkColor).hex : null;
}

/** Whether any line of the documents sets a formula. */
function hasMath(docs: readonly VDTDocument[]): boolean {
  return docs.some((d) => d.pages.some((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]
    .some((b) => b.lines.some((l) => l.segments?.some((s) => s.mathRender !== undefined)))));
}

/** The trimmed page in CSS px: the viewport, and the scale and offset that
 *  map the renderer's page (VDT px at the page dpi, with the cut-line
 *  margin when the layout has one) onto it. */
function pageGeometry(doc: VDTDocument, page: VDTPage): { width: number; height: number; scale: number; offset: number } {
  const offset = doc.trimOffset > 0 ? doc.trimOffset : 0;
  const trimW = page.width - 2 * offset;
  const trimH = page.height - 2 * offset;
  const dpi = doc.config.page.dpi || CSS_DPI;
  const width = Math.max(1, Math.round((trimW * CSS_DPI) / dpi));
  const scale = width / trimW;
  const height = Math.max(1, Math.round(trimH * scale));
  return { width, height, scale, offset };
}

const num = (v: number): string => String(Math.round(v * 10000) / 10000);

/** A zero-size anchor at a point of the page (an outline target). */
const anchorAt = (id: string, x: number, y: number): string =>
  `<span id="${escapeAttr(id)}" style="position:absolute;left:${num(x)}px;top:${num(y)}px;width:0;height:0;"></span>`;

export async function buildFixedPublication(docs: EpubSource, options: RenderToEpubOptions): Promise<EpubPublication> {
  const { metadata, onWarning, onProgress, signal } = options;
  const strings = navStrings(metadata.language);
  const progression = pageProgressionOf(docs);

  // Fonts and pictures first: the pages link to their files.
  const fonts = fontAssets(options.fonts ?? []);
  const images = await imageAssets(docs, options.resourceBytes, onWarning);
  signal?.throwIfAborted();
  // Single-ink diagrams: the SVG files are recoloured once, as the PDF
  // recolours their markup, rather than tinted by a CSS filter readers may
  // not apply.
  const ink = inkOf(docs[0]!);
  const imageItems: EpubItem[] = images.items.map((item) => item.mediaType === 'image/svg+xml' && ink
    ? { ...item, data: applySingleInkToSvg(new TextDecoder().decode(item.data as Uint8Array), ink) }
    : item);
  onProgress?.({ phase: 'resources', done: fonts.items.length + imageItems.length, total: fonts.items.length + imageItems.length });

  // Pass 1: render every page and learn where each id lives, so a link can
  // go to the page file that holds its target.
  const totalPages = docs.reduce((n, d) => n + d.pages.length, 0);
  const pad = Math.max(4, String(totalPages).length);
  const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
  const imageUrl = Object.assign((fileId: string) => {
    const href = images.hrefOf(fileId);
    return href ? `../${href}` : undefined;
  }, { singleInk: false });
  const plans: PagePlan[] = [];
  const fileOfId = new Map<string, string>();
  let bookIndex = 0;
  for (const doc of docs) {
    const lang = docLanguage(doc, metadata.language);
    const rendered = renderToHtmlIndexed(doc, { resourceImageUrl: imageUrl, singleInk: false, refTargets: [...refTargets] });
    for (const [i, page] of doc.pages.entries()) {
      const file = `page-${String(bookIndex + 1).padStart(pad, '0')}.xhtml`;
      let html = rendered.pages[i]?.innerHtml ?? '';
      const outline: OutlineEntry[] = [];
      const part = partTitle(page);
      if (part) outline.push({ title: part, level: 0, file });
      // An anchor at each listed heading, the target of its TOC entry.
      for (const [h, block] of pageHeadings(doc, page).entries()) {
        const title = headingTitle(block);
        if (!title) continue;
        const anchorId = `h-${bookIndex + 1}-${h + 1}`;
        const wrapper = `<div class="pt-block" data-block-id="${escapeAttr(block.id)}"`;
        const at = html.indexOf(wrapper);
        if (at >= 0) html = html.slice(0, at) + anchorAt(anchorId, block.bbox.x, block.bbox.y) + html.slice(at);
        outline.push({ title, level: block.headingLevel ?? 1, file, ...(at >= 0 ? { anchorId } : {}) });
      }
      const pageId = `pt-p-${(doc.pageIndexOffset ?? 0) + page.index}`;
      const ids = [pageId, ...[...html.matchAll(/\sid="([^"]*)"/g)].map((m) => xmlId(decodeEntities(m[1]!)))];
      for (const id of ids) if (!fileOfId.has(id)) fileOfId.set(id, file);
      plans.push({ doc, page, bookIndex, file, html, ids, outline, lang });
      bookIndex++;
    }
    signal?.throwIfAborted();
  }

  // Pass 2: the content documents.
  const css =
    `@charset "UTF-8";\n` +
    fonts.css +
    `html, body { margin: 0; padding: 0; }\n` +
    `body { position: relative; overflow: hidden; }\n` +
    `.pt-page { position: absolute; left: 0; top: 0; overflow: hidden; transform-origin: 0 0; ${TEXT_RESET} }\n` +
    `.pt-cover { display: block; width: 100%; height: 100%; object-fit: contain; }\n`;
  const pageItems: EpubItem[] = [];
  const spine: EpubSpineEntry[] = [];
  const pageList: EpubPageTarget[] = [];
  const uses: FontUse[] = [];
  let describedImages = true;
  for (const [n, plan] of plans.entries()) {
    const { doc, page, file } = plan;
    const geo = pageGeometry(doc, page);
    const styles: string[] = [];
    const ids = new Set<string>([plan.ids[0]!]);
    const body = htmlToXhtml(plan.html, {
      ids,
      hoistStyle: (s) => styles.push(s),
      rewriteHref: (href) => {
        if (!href.startsWith('#')) return href;
        const target = fileOfId.get(href.slice(1));
        if (!target) return undefined;
        return target === file ? href : `${target}${href}`;
      },
    });
    for (const img of body.matchAll(/<img\s[^>]*>/g)) {
      if (!/\srole="presentation"/.test(img[0]) && /\salt=""/.test(img[0])) describedImages = false;
    }
    uses.push(...fontUses(plan.html));
    const background = doc.config.page.backgroundColor?.hex;
    const bg = background && background !== 'transparent' ? `background:${background};` : '';
    const pageStyle =
      `width:${num(page.width)}px;height:${num(page.height)}px;${bg}` +
      `transform:scale(${num(geo.scale)})${geo.offset ? ` translate(-${num(geo.offset)}px,-${num(geo.offset)}px)` : ''};`;
    const label = page.pageLabel || String(plan.bookIndex + 1);
    const xhtml = xhtmlDocument({
      lang: plan.lang,
      dir: directionOf(plan.lang),
      title: `${metadata.title} (${label})`,
      head:
        `<meta name="viewport" content="width=${geo.width}, height=${geo.height}"/>\n` +
        `<link rel="stylesheet" type="text/css" href="../${STYLESHEET_HREF}"/>\n` +
        (styles.length ? `<style>${escapeXml(styles.join('\n'))}</style>\n` : ''),
      bodyAttrs: ` style="width:${geo.width}px;height:${geo.height}px;${bg}"`,
      body: `<div class="pt-page" id="${escapeAttr(plan.ids[0]!)}" dir="ltr" style="${pageStyle}">${body}</div>`,
    });
    const id = file.replace(/\.xhtml$/, '');
    pageItems.push({ id, href: `${PAGES_DIR}${file}`, mediaType: 'application/xhtml+xml', data: xhtml });
    // A left-bound book's first page is a recto on the right; a right-bound
    // book's, on the left.
    const recto = plan.bookIndex % 2 === 0;
    const right = progression === 'rtl' ? !recto : recto;
    spine.push({ idref: id, properties: [right ? 'page-spread-right' : 'page-spread-left'] });
    pageList.push({ label, href: `${PAGES_DIR}${file}` });
    onProgress?.({ phase: 'documents', done: n + 1, total: plans.length });
    if (n % 16 === 15) signal?.throwIfAborted();
  }
  for (const miss of missingFaces(uses, options.fonts ?? [])) {
    onWarning?.({ kind: 'missingFont', ...miss });
  }

  // The cover: the given picture on a page of its own, else the first page.
  const items: EpubItem[] = [];
  const landmarks: EpubLandmark[] = [];
  const first = plans[0];
  const firstGeo = first ? pageGeometry(first.doc, first.page) : { width: 600, height: 800 };
  if (options.cover) {
    const coverExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[options.cover.mediaType];
    items.push({ id: 'cover-image', href: `images/cover.${coverExt}`, mediaType: options.cover.mediaType, data: options.cover.bytes, properties: ['cover-image'] });
    const alt = options.cover.alt ?? metadata.title;
    items.push({
      id: 'cover',
      href: `${PAGES_DIR}cover.xhtml`,
      mediaType: 'application/xhtml+xml',
      data: xhtmlDocument({
        lang: metadata.language,
        dir: directionOf(metadata.language),
        title: metadata.title,
        head:
          `<meta name="viewport" content="width=${firstGeo.width}, height=${firstGeo.height}"/>\n` +
          `<link rel="stylesheet" type="text/css" href="../${STYLESHEET_HREF}"/>\n`,
        bodyAttrs: ` epub:type="cover" style="width:${firstGeo.width}px;height:${firstGeo.height}px;"`,
        body: `<img class="pt-cover" src="../images/cover.${coverExt}" alt="${escapeAttr(alt)}"/>`,
      }),
    });
    spine.unshift({ idref: 'cover', properties: ['rendition:page-spread-center'] });
    landmarks.push({ type: 'cover', label: strings.cover, href: `${PAGES_DIR}cover.xhtml` });
  } else if (first) {
    landmarks.push({ type: 'cover', label: strings.cover, href: `${PAGES_DIR}${first.file}` });
  }
  const tocPage = plans.find((p) => [...p.page.columns.flatMap((c) => c.blocks)].some((b) => b.tocEntry !== undefined || b.tocPart !== undefined));
  if (tocPage) landmarks.push({ type: 'toc', label: strings.contents, href: `${PAGES_DIR}${tocPage.file}` });
  const outline = plans.flatMap((p) => p.outline);
  const bodyStart = outline.find((e) => e.level >= 1);
  if (bodyStart || first) {
    const target = bodyStart ? `${PAGES_DIR}${bodyStart.file}${bodyStart.anchorId ? `#${bodyStart.anchorId}` : ''}` : `${PAGES_DIR}${first!.file}`;
    landmarks.push({ type: 'bodymatter', label: strings.bodymatter, href: target });
  }

  items.push({ id: 'style', href: STYLESHEET_HREF, mediaType: 'text/css', data: css });
  items.push(...fonts.items, ...imageItems, ...pageItems);
  const toc = nestOutline(outline, PAGES_DIR);
  const hasImages = imageItems.length > 0 || options.cover !== undefined;
  return {
    layout: 'fixed',
    metadata,
    items,
    spine,
    toc,
    pageList,
    landmarks,
    pageProgression: progression,
    fixed: { spread: 'landscape', orientation: 'auto', viewport: { width: firstGeo.width, height: firstGeo.height } },
    accessibility: defaultAccessibility({
      layout: 'fixed',
      hasImages,
      hasMath: hasMath(docs),
      imagesDescribed: describedImages,
      hasPageList: pageList.length > 0,
      hasToc: toc.length > 0,
      hasTables: docs.some((d) => d.blocks.some((b) => b.resourceBlock?.kind === 'table')),
    }),
  };
}
