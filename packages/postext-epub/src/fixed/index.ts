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
  canonicalLocaleTag,
  directionOf,
  HTML_TEXT_RESET,
  renderToHtmlIndexed,
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
import { fontAssets, imageAssets, pageProgressionOf, remoteVideoItems, videoAssets } from '../shared/assets';
import { decodeEntities, escapeAttr, escapeXml, htmlToXhtml, xhtmlDocument, xmlId } from '../shared/xml';
import { videoScriptItem, VIDEO_SCRIPT_HREF, withVideoScript } from '../shared/videoScript';
import { navStrings } from '../package/strings';
import { fontUses, missingFaces, type FontUse } from './fontUse';
import { contentsRows, headingTitle, nestOutline, pageHeadings, partTitle, type OutlineEntry } from './outline';
import { comicDirectionOf, kindlePanelMarkup, regionNavItem, type ComicPagePlan } from './regions';

/** Directory of the page documents, relative to the package document. */
const PAGES_DIR = 'pages/';
const STYLESHEET_HREF = 'styles/fixed.css';

/** CSS px per inch: the viewport is the page at its CSS size. */
const CSS_DPI = 96;

/** The engine's text reset without `direction`, which EPUB style sheets
 *  must not set: the page box takes a `dir` attribute instead, the
 *  document's direction (`pageDir`). */
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
  /** The page's comic markup (`page.comic`), as the renderer gave it. */
  comicHtml?: string;
}

/** The book language of a document: its configured locale, else the
 *  hyphenation one, else the book's. */
function docLanguage(doc: VDTDocument, fallback: string): string {
  const c = doc.config as { locale?: string; bodyText?: { hyphenation?: { tag?: string; locale?: string } } };
  return canonicalLocaleTag(c.locale) ?? canonicalLocaleTag(c.bodyText?.hyphenation?.tag) ?? fallback;
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

/** The direction of a page box: the one the renderer's root declares
 *  (#379). The word boxes of a right-to-left line resolve their neutrals —
 *  a comma, a bracket, a full stop — in it, so the page must not run left
 *  to right whatever its language. */
const pageDir = (doc: VDTDocument): 'ltr' | 'rtl' => (doc.config.direction === 'rtl' ? 'rtl' : 'ltr');

const num = (v: number): string => String(Math.round(v * 10000) / 10000);

/** A link over a row of the printed contents to the page it lists (the
 *  row's text stays as the page prints it; the link is named after it). */
const rowLink = (href: string, label: string, b: { x: number; y: number; width: number; height: number }): string =>
  `<a class="pt-toc-link" href="${escapeAttr(href)}" aria-label="${escapeAttr(label)}" ` +
  `style="position:absolute;left:${num(b.x)}px;top:${num(b.y)}px;width:${num(b.width)}px;height:${num(b.height)}px;z-index:1;"></a>`;

/** A zero-size anchor at a point of the page (an outline target). */
const anchorAt = (id: string, x: number, y: number): string =>
  `<span id="${escapeAttr(id)}" style="position:absolute;left:${num(x)}px;top:${num(y)}px;width:0;height:0;"></span>`;

/** Markup with every id it sets (and every `url(#…)` reference to one)
 *  suffixed: a copy of a page's comic that lives on the same page. */
function withIdSuffix(html: string, suffix: string): string {
  return html
    .replace(/\sid="([^"]*)"/g, (_, id: string) => ` id="${id}${suffix}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${id}${suffix})`);
}

/** The HTML player attributes no EPUB schema knows (`controlslist`, the
 *  Remote Playback and Picture-in-Picture switches) dropped: EPUBCheck
 *  rejects them, and reading systems offer their own controls. */
export function epubVideoMarkup(html: string): string {
  if (!html.includes('<video')) return html;
  return html.replace(/<video\b[^>]*>/g, (tag) => tag.replace(/\s(?:controlslist|disablepictureinpicture|disableremoteplayback)="[^"]*"/g, ''));
}

export async function buildFixedPublication(docs: EpubSource, options: RenderToEpubOptions): Promise<EpubPublication> {
  const { metadata, onWarning, onProgress, signal } = options;
  const strings = navStrings(metadata.language);
  // A book of comic pages turns its pages the way they read (a manga
  // right to left in any language); other books follow their binding.
  const progression = comicDirectionOf(docs) ?? pageProgressionOf(docs);

  // Fonts and pictures first: the pages link to their files.
  const fonts = fontAssets(options.fonts ?? []);
  const images = await imageAssets(docs, options.resourceBytes, onWarning);
  const videos = await videoAssets(docs, options.resourceBytes);
  signal?.throwIfAborted();
  const imageItems = [...images.items, ...videos.items, ...remoteVideoItems(docs, videos)];
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
  const videoUrl = (fileId: string) => {
    const href = videos.hrefOf(fileId);
    return href ? `../${href}` : undefined;
  };
  const plans: PagePlan[] = [];
  const fileOfId = new Map<string, string>();
  let bookIndex = 0;
  for (const doc of docs) {
    const lang = docLanguage(doc, metadata.language);
    // Videos (#454): a self-hosted file plays in the reader's player; a
    // YouTube or Vimeo one is its poster linked to the video (an EPUB may
    // not embed a web page's player: EPUBCheck RSC-006).
    const rendered = renderToHtmlIndexed(doc, {
      resourceImageUrl: imageUrl,
      resourceVideoUrl: videoUrl,
      videos: { files: 'player', streams: 'poster', hls: 'poster' },
      singleInk: false,
      refTargets: [...refTargets],
    });
    for (const [i, page] of doc.pages.entries()) {
      const file = `page-${String(bookIndex + 1).padStart(pad, '0')}.xhtml`;
      let html = epubVideoMarkup(rendered.pages[i]?.innerHtml ?? '');
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
      // The rows of the printed contents link to their pages, as in the PDF.
      for (const row of contentsRows(page)) {
        const wrapper = `<div class="pt-block" data-block-id="${escapeAttr(row.block.id)}" style="display:contents;">`;
        const at = html.indexOf(wrapper);
        if (at < 0 || !row.label) continue;
        const end = at + wrapper.length;
        html = html.slice(0, end) + rowLink(`#pt-p-${row.pageIndex}`, row.label, row.block.bbox) + html.slice(end);
      }
      const pageId = `pt-p-${(doc.pageIndexOffset ?? 0) + page.index}`;
      const ids = [pageId, ...[...html.matchAll(/\sid="([^"]*)"/g)].map((m) => xmlId(decodeEntities(m[1]!)))];
      for (const id of ids) if (!fileOfId.has(id)) fileOfId.set(id, file);
      const comicHtml = rendered.pages[i]?.comicHtml;
      plans.push({ doc, page, bookIndex, file, html, ids, outline, lang, ...(comicHtml ? { comicHtml } : {}) });
      bookIndex++;
    }
    signal?.throwIfAborted();
  }

  // Kindle Panel View (opt-in): tap targets over the panels of comic pages.
  const kindle = options.kindlePanelView === true && plans.some((p) => p.page.comic);
  const comicPlans: ComicPagePlan[] = [];
  let ordinal = 1;

  // Pass 2: the content documents.
  const css =
    `@charset "UTF-8";\n` +
    fonts.css +
    `html, body { margin: 0; padding: 0; }\n` +
    `body { position: relative; overflow: hidden; }\n` +
    `.pt-page { position: absolute; left: 0; top: 0; overflow: hidden; transform-origin: 0 0; ${TEXT_RESET} }\n` +
    `.pt-cover { display: block; width: 100%; height: 100%; object-fit: contain; }\n` +
    (kindle ? `.target-mag-parent { display: none; }\n` : '');
  const pageItems: EpubItem[] = [];
  const spine: EpubSpineEntry[] = [];
  const pageList: EpubPageTarget[] = [];
  const uses: FontUse[] = [];
  let describedImages = true;
  let scripted = false;
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
    let magnify = '';
    if (page.comic) {
      comicPlans.push({ href: `${PAGES_DIR}${file}`, comic: page.comic, geo });
      if (kindle && plan.comicHtml) {
        const comicHtml = plan.comicHtml;
        const raw = kindlePanelMarkup(page, geo, (suffix) => withIdSuffix(comicHtml, suffix), ordinal);
        ordinal += page.comic.panels.length;
        magnify = htmlToXhtml(raw, { ids, hoistStyle: (s) => styles.push(s) });
      }
    }
    const label = page.pageLabel || String(plan.bookIndex + 1);
    // A page with videos to coordinate links the playback script (#507).
    const xhtml = withVideoScript(xhtmlDocument({
      lang: plan.lang,
      dir: directionOf(plan.lang),
      title: `${metadata.title} (${label})`,
      head:
        `<meta name="viewport" content="width=${geo.width}, height=${geo.height}"/>\n` +
        `<link rel="stylesheet" type="text/css" href="../${STYLESHEET_HREF}"/>\n` +
        (styles.length ? `<style>${escapeXml(styles.join('\n'))}</style>\n` : ''),
      bodyAttrs: ` style="width:${geo.width}px;height:${geo.height}px;${bg}"`,
      body: `<div class="pt-page" id="${escapeAttr(plan.ids[0]!)}" dir="${pageDir(doc)}" style="${pageStyle}">${body}</div>${magnify}`,
    }), `../${VIDEO_SCRIPT_HREF}`);
    if (xhtml.includes('<script')) scripted = true;
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

  // The cover: the given picture on a page of its own, else the first page
  // (a picture of that page is kept as the cover image only).
  const items: EpubItem[] = [];
  const landmarks: EpubLandmark[] = [];
  const first = plans[0];
  const firstGeo = first ? pageGeometry(first.doc, first.page) : { width: 600, height: 800 };
  const coverExt = options.cover && { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[options.cover.mediaType];
  if (options.cover) {
    items.push({ id: 'cover-image', href: `images/cover.${coverExt}`, mediaType: options.cover.mediaType, data: options.cover.bytes, properties: ['cover-image'] });
  }
  if (options.cover && !options.cover.showsFirstPage) {
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

  // Region-based navigation of the comic pages: panels in reading order,
  // their balloons in them.
  const regions = regionNavItem(comicPlans, metadata.language, metadata.title);
  if (regions) items.push(regions);

  items.push({ id: 'style', href: STYLESHEET_HREF, mediaType: 'text/css', data: css });
  items.push(...fonts.items, ...imageItems, ...pageItems);
  if (scripted) items.push(videoScriptItem());
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
    // Manga: Kindle reads the page progression from the writing mode.
    ...(comicPlans.length > 0 && progression === 'rtl' && !docs.some((d) => d.config.layout.writingMode === 'vertical-rl') ? { writingMode: 'horizontal-rl' as const } : {}),
    ...(kindle ? { kindle: { comic: true as const, originalResolution: { width: firstGeo.width, height: firstGeo.height }, regionMagnification: true } } : {}),
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
