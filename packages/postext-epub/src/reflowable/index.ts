// Reflowable rendition (#396): the book as semantic XHTML, one content
// document per chapter (and per part opener), styled by a stylesheet
// derived from the configuration, with print page equivalence.
//
//   walk.ts   the laid-out pages back to a semantic model, in reading order
//   inline.ts lines back to running text (joined, de-hyphenated)
//   xhtml.ts  the model as EPUB 3 content documents
//   css.ts    the stylesheet

import type {
  EpubAccessibility,
  EpubItem,
  EpubLandmark,
  EpubNavPoint,
  EpubPublication,
  EpubSource,
  EpubSpineEntry,
  EpubWarning,
  RenderToEpubOptions,
} from '../types';
import { fontAssets, imageAssets, pageProgressionOf } from '../shared/assets';
import { bookStylesheet } from './css';
import { xmlAttr, xmlText } from './inline';
import type { FileModel, HeadingEntry } from './model';
import { docLanguage, walkBook } from './walk';
import { relativeHref, writeContentDocument } from './xhtml';
import { isRtlLanguage, navStrings } from '../package/strings';

export const STYLESHEET_HREF = 'styles/book.css';
const TEXT_DIR = 'text/';

/** The accessible name of a footnote's link back to its marker. */
const BACK_LABELS: Record<string, string> = {
  en: 'Back to text',
  es: 'Volver al texto',
  ca: 'Torna al text',
  fr: 'Retour au texte',
  de: 'Zurück zum Text',
  it: 'Torna al testo',
  pt: 'Voltar ao texto',
  zh: '返回正文',
  ja: '本文に戻る',
  ar: 'العودة إلى النص',
};

const SUMMARIES: Record<string, string> = {
  en: 'Reflowable text with structured headings, a navigable table of contents, page numbers of the printed edition, text alternatives for pictures and formulas, and footnotes linked both ways.',
};

function backLabel(lang: string): string {
  return BACK_LABELS[lang.toLowerCase().split('-')[0]!] ?? BACK_LABELS.en!;
}

/** Hrefs and manifest ids of the content documents: `chapter-001.xhtml`
 *  for a chapter's first document, `chapter-001-2.xhtml` for the next
 *  ones of the same chapter (after a part), `part-001.xhtml` for parts. */
function nameFiles(files: FileModel[]): void {
  let parts = 0;
  const perDoc = new Map<number, number>();
  for (const file of files) {
    let name: string;
    if (file.kind === 'part') {
      name = `part-${String(++parts).padStart(3, '0')}`;
    } else {
      const n = (perDoc.get(file.doc) ?? 0) + 1;
      perDoc.set(file.doc, n);
      name = `chapter-${String(file.doc + 1).padStart(3, '0')}${n > 1 ? `-${n}` : ''}`;
    }
    file.href = `${TEXT_DIR}${name}.xhtml`;
    file.itemId = name;
  }
}

/** The navigation tree: headings nested by level (parts at the top). */
function navTree(headings: readonly HeadingEntry[]): EpubNavPoint[] {
  const root: EpubNavPoint[] = [];
  const stack: { level: number; children: EpubNavPoint[] }[] = [{ level: -1, children: root }];
  for (const h of headings) {
    if (!h.listed || !h.label) continue;
    while (stack.length > 1 && stack[stack.length - 1]!.level >= h.level) stack.pop();
    const point: EpubNavPoint = { label: h.label, href: `${h.file.href}#${h.id}` };
    stack[stack.length - 1]!.children.push(point);
    point.children = [];
    stack.push({ level: h.level, children: point.children });
  }
  const prune = (points: EpubNavPoint[]): EpubNavPoint[] =>
    points.map((p) => (p.children && p.children.length > 0 ? { ...p, children: prune(p.children) } : { label: p.label, href: p.href }));
  return prune(root);
}

function coverDocument(imageHref: string, alt: string, title: string, lang: string, dir?: 'rtl'): string {
  const l = xmlAttr(lang);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${l}" xml:lang="${l}"${dir ? ` dir="${dir}"` : ''}>
<head>
<meta charset="UTF-8"/>
<title>${xmlText(title)}</title>
<link rel="stylesheet" type="text/css" href="${relativeHref(`${TEXT_DIR}cover.xhtml`, STYLESHEET_HREF)}"/>
</head>
<body class="pt-cover">
<section epub:type="cover">
<img role="doc-cover" src="${xmlAttr(relativeHref(`${TEXT_DIR}cover.xhtml`, imageHref))}" alt="${xmlAttr(alt)}"/>
</section>
</body>
</html>
`;
}

const COVER_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export async function buildReflowablePublication(docs: EpubSource, options: RenderToEpubOptions): Promise<EpubPublication> {
  const first = docs[0];
  if (!first) throw new Error('buildReflowablePublication: no documents');
  const { signal, onProgress } = options;
  const warn = (w: EpubWarning) => options.onWarning?.(w);
  const metaTitle = typeof first.metadata.title === 'string' ? first.metadata.title : '';
  const metadata = {
    ...options.metadata,
    title: options.metadata.title || metaTitle || 'Untitled',
    language: options.metadata.language || docLanguage(first.config, 'en'),
  };

  // The book, in reading order.
  const book = walkBook(docs, { language: metadata.language });
  nameFiles(book.files);
  signal?.throwIfAborted();

  // Pictures and fonts. Only the pictures the text places are written
  // (running heads and opener designs are print furniture here).
  onProgress?.({ phase: 'resources', done: 0, total: 2 });
  const missing: EpubWarning[] = [];
  const images = await imageAssets(docs, options.resourceBytes, (w) => missing.push(w));
  for (const w of missing) if (w.kind !== 'missingImage' || book.images.has(w.fileId)) warn(w);
  const usedImages = new Set([...book.images].map((id) => images.hrefOf(id)).filter((h): h is string => h !== undefined));
  const fonts = fontAssets(options.fonts ?? []);
  onProgress?.({ phase: 'resources', done: 1, total: 2 });
  signal?.throwIfAborted();

  const vertical = first.config.layout.writingMode === 'vertical-rl';
  const sheet = bookStylesheet(first.config, fonts.css, { vertical, ...(book.verse ? { verse: true } : {}) });
  for (const family of sheet.families) {
    if (!fonts.families.has(family)) warn({ kind: 'missingFont', family });
  }
  onProgress?.({ phase: 'resources', done: 2, total: 2 });

  const items: EpubItem[] = [{ id: 'css', href: STYLESHEET_HREF, mediaType: 'text/css', data: sheet.css }];
  items.push(...fonts.items);
  items.push(...images.items.filter((i) => usedImages.has(i.href)));
  const spine: EpubSpineEntry[] = [];
  const landmarks: EpubLandmark[] = [];
  // Landmark names: in the book's language for a right-to-left book,
  // whose navigation document is set right to left in that language
  // (#402); in English otherwise, as they have always been written.
  const named = isRtlLanguage(metadata.language) ? navStrings(metadata.language) : undefined;
  const names = {
    cover: named?.cover ?? 'Cover',
    toc: named?.contents ?? 'Table of contents',
    bodymatter: named?.bodymatter ?? 'Start of content',
    bibliography: named?.bibliography ?? 'Bibliography',
    index: named?.index ?? 'Index',
  };

  // Cover.
  if (options.cover) {
    const ext = COVER_EXT[options.cover.mediaType] ?? 'img';
    const href = `images/cover.${ext}`;
    items.push({ id: 'cover-image', href, mediaType: options.cover.mediaType, data: options.cover.bytes, properties: ['cover-image'] });
    const lang = book.files[0]?.lang ?? metadata.language;
    items.push({
      id: 'cover',
      href: `${TEXT_DIR}cover.xhtml`,
      mediaType: 'application/xhtml+xml',
      data: coverDocument(href, options.cover.alt ?? metadata.title, metadata.title, lang, book.files[0]?.dir),
    });
    spine.push({ idref: 'cover' });
    landmarks.push({ type: 'cover', label: names.cover, href: `${TEXT_DIR}cover.xhtml` });
  }

  // Content documents.
  const ctx = {
    book,
    bookTitle: metadata.title,
    imageHref: (fileId: string) => images.hrefOf(fileId),
    stylesheet: STYLESHEET_HREF,
    backLabel,
  };
  let maths = book.maths;
  book.files.forEach((file, i) => {
    signal?.throwIfAborted();
    const xhtml = writeContentDocument(file, ctx);
    if (xhtml.includes('role="math"')) maths = true;
    items.push({ id: file.itemId, href: file.href, mediaType: 'application/xhtml+xml', data: xhtml });
    spine.push({ idref: file.itemId });
    onProgress?.({ phase: 'documents', done: i + 1, total: book.files.length });
  });

  // Navigation.
  const toc = navTree(book.headings);
  const pageList = [...book.pages.entries()]
    .filter(([, p]) => p.loc.id)
    .sort(([a], [b]) => a - b)
    .map(([, p]) => ({ label: p.label, href: `${p.loc.file.href}#${p.loc.id}` }));
  const at = (loc: { file: FileModel; id: string }) => `${loc.file.href}#${loc.id}`;
  // The navigation document is no spine item: the landmark names the
  // contents the book prints, when it prints them.
  if (book.contents) landmarks.push({ type: 'toc', label: names.toc, href: at(book.contents) });
  const body = book.files.find((f) => f.kind === 'chapter') ?? book.files[0];
  if (body) landmarks.push({ type: 'bodymatter', label: names.bodymatter, href: body.href });
  if (book.bibliography) landmarks.push({ type: 'bibliography', label: names.bibliography, href: at(book.bibliography) });
  if (book.index) landmarks.push({ type: 'index', label: names.index, href: at(book.index) });

  const features = ['structuralNavigation', 'tableOfContents', 'readingOrder', 'displayTransformability'];
  if (book.altText || options.cover) features.push('alternativeText');
  if (maths) features.push('describedMath');
  if (pageList.length > 0) features.push('pageNavigation', 'printPageNumbers');
  if (book.index) features.push('index');
  features.push('ARIA');
  const visual = usedImages.size > 0 || options.cover !== undefined;
  const accessibility: EpubAccessibility = {
    accessModes: visual ? ['textual', 'visual'] : ['textual'],
    accessModesSufficient: visual && book.missingAlt ? ['textual,visual', 'textual'] : ['textual'],
    features,
    hazards: ['none'],
    summary: SUMMARIES.en!,
  };

  return {
    layout: 'reflowable',
    metadata,
    items,
    spine,
    toc,
    pageList,
    landmarks,
    pageProgression: pageProgressionOf(docs),
    accessibility,
  };
}

