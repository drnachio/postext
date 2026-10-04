// OCF container writer: the zip, the package document (OPF), the
// navigation document and the legacy NCX.

import { zipSync, type Zippable } from 'fflate';
import type { EpubItem, EpubNavPoint, EpubPublication } from '../types';
import { bookIdentifier } from '../shared/assets';
import { escapeAttr, escapeXml, stripInvalidXmlChars, xhtmlDocument } from '../shared/xml';
import { isRtlLanguage, navStrings } from './strings';

/** Where the package document lives; every item href is relative to it. */
export const PACKAGE_DIR = 'OEBPS/';
export const OPF_PATH = `${PACKAGE_DIR}content.opf`;
export const NAV_HREF = 'nav.xhtml';
export const NCX_HREF = 'toc.ncx';

const CONTAINER_XML =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
  `  <rootfiles>\n` +
  `    <rootfile full-path="${OPF_PATH}" media-type="application/oebps-package+xml"/>\n` +
  `  </rootfiles>\n` +
  `</container>\n`;

/** Media types whose bytes are compressed already: stored, not deflated. */
const STORED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'font/woff', 'font/woff2']);

/** Zip entry time: fixed, so the same book gives the same bytes (the DOS
 *  epoch, in local time as zip stores it). */
const ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0);

const enc = new TextEncoder();
const bytesOf = (data: Uint8Array | string): Uint8Array => typeof data === 'string' ? enc.encode(data) : data;

/** `dcterms:modified` form: `CCYY-MM-DDThh:mm:ssZ`. */
export function modifiedStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A `dc:date` in W3C date-time form, or undefined when it cannot be
 *  read as one (EPUBCheck warns on any other form). */
export function w3cDate(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?)?)?$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

/** Manifest properties of a content document read from its markup: `svg`
 *  and `mathml` must be declared exactly when present (EPUBCheck errors
 *  either way). Other items keep the properties they were given. */
function itemProperties(item: EpubItem): string[] {
  const given = item.properties ?? [];
  if (item.mediaType !== 'application/xhtml+xml') return given;
  const text = typeof item.data === 'string' ? item.data : new TextDecoder().decode(item.data);
  const out = given.filter((p) => p !== 'svg' && p !== 'mathml');
  if (/<(?:[a-z]+:)?svg[\s>/]/.test(text)) out.push('svg');
  if (/<(?:[a-z]+:)?math[\s>/]/.test(text)) out.push('mathml');
  return out;
}

const indent = (depth: number): string => '  '.repeat(depth);

/** The package document. */
export function buildOpf(pub: EpubPublication, identifier = bookIdentifier(pub.metadata)): string {
  const md = pub.metadata;
  const lang = md.language;
  const meta: string[] = [];
  const add = (line: string): void => {
    meta.push(`    ${line}`);
  };
  add(`<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>`);
  add(`<dc:title id="title">${escapeXml(md.title)}</dc:title>`);
  add(`<meta refines="#title" property="title-type">main</meta>`);
  if (md.subtitle) {
    add(`<dc:title id="subtitle">${escapeXml(md.subtitle)}</dc:title>`);
    add(`<meta refines="#subtitle" property="title-type">subtitle</meta>`);
  }
  add(`<dc:language>${escapeXml(lang)}</dc:language>`);
  (md.creators ?? []).filter((c) => c.trim()).forEach((c, i) => {
    add(`<dc:creator id="creator-${i + 1}">${escapeXml(c.trim())}</dc:creator>`);
    add(`<meta refines="#creator-${i + 1}" property="role" scheme="marc:relators">aut</meta>`);
    add(`<meta refines="#creator-${i + 1}" property="display-seq">${i + 1}</meta>`);
  });
  const date = w3cDate(md.date);
  if (date) add(`<dc:date>${escapeXml(date)}</dc:date>`);
  if (md.publisher) add(`<dc:publisher>${escapeXml(md.publisher)}</dc:publisher>`);
  if (md.rights) add(`<dc:rights>${escapeXml(md.rights)}</dc:rights>`);
  if (md.description) add(`<dc:description>${escapeXml(md.description)}</dc:description>`);
  add(`<meta property="dcterms:modified">${modifiedStamp(md.modified ?? new Date())}</meta>`);

  const a11y = pub.accessibility;
  for (const v of a11y.accessModes) add(`<meta property="schema:accessMode">${escapeXml(v)}</meta>`);
  for (const v of a11y.accessModesSufficient) add(`<meta property="schema:accessModeSufficient">${escapeXml(v)}</meta>`);
  for (const v of a11y.features) add(`<meta property="schema:accessibilityFeature">${escapeXml(v)}</meta>`);
  for (const v of a11y.hazards) add(`<meta property="schema:accessibilityHazard">${escapeXml(v)}</meta>`);
  add(`<meta property="schema:accessibilitySummary">${escapeXml(a11y.summary)}</meta>`);
  if (a11y.conformsTo) add(`<meta property="dcterms:conformsTo">${escapeXml(a11y.conformsTo)}</meta>`);

  if (pub.layout === 'fixed') {
    add(`<meta property="rendition:layout">pre-paginated</meta>`);
    add(`<meta property="rendition:spread">${pub.fixed?.spread ?? 'landscape'}</meta>`);
    if (pub.fixed?.orientation && pub.fixed.orientation !== 'auto') add(`<meta property="rendition:orientation">${pub.fixed.orientation}</meta>`);
  }
  const cover = pub.items.find((i) => i.properties?.includes('cover-image'));
  // EPUB 2 readers (and some current ones) look the cover picture up here.
  if (cover) add(`<meta name="cover" content="${escapeAttr(cover.id)}"/>`);

  const manifest = [
    `    <item id="nav" href="${NAV_HREF}" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="${NCX_HREF}" media-type="application/x-dtbncx+xml"/>`,
    ...pub.items.map((item) => {
      const props = itemProperties(item);
      return `    <item id="${escapeAttr(item.id)}" href="${escapeAttr(encodeHref(item.href))}" media-type="${escapeAttr(item.mediaType)}"` +
        (props.length ? ` properties="${escapeAttr(props.join(' '))}"` : '') + `/>`;
    }),
  ];
  const spine = pub.spine.map((s) =>
    `    <itemref idref="${escapeAttr(s.idref)}"` +
    (s.linear === false ? ` linear="no"` : '') +
    (s.properties?.length ? ` properties="${escapeAttr(s.properties.join(' '))}"` : '') + `/>`,
  );
  const dir = isRtlLanguage(lang) ? ` dir="rtl"` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeAttr(lang)}"${dir}>\n` +
    `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n${meta.join('\n')}\n  </metadata>\n` +
    `  <manifest>\n${manifest.join('\n')}\n  </manifest>\n` +
    `  <spine toc="ncx" page-progression-direction="${pub.pageProgression}">\n${spine.join('\n')}\n  </spine>\n` +
    `</package>\n`
  );
}

/** An item href as a URL path: each segment percent-encoded where XML
 *  and URLs need it (spaces, non-ASCII stay readable as IRI characters). */
function encodeHref(href: string): string {
  return href.split('/').map((seg) => seg.replace(/[\s%"<>\\^`{|}#?]/g, (c) => encodeURIComponent(c))).join('/');
}

function navList(points: readonly EpubNavPoint[], depth: number): string {
  const items = points.map((p) => {
    const kids = p.children?.length ? `\n${navList(p.children, depth + 2)}\n${indent(depth + 1)}` : '';
    return `${indent(depth + 1)}<li><a href="${escapeAttr(p.href)}">${escapeXml(stripInvalidXmlChars(p.label))}</a>${kids}</li>`;
  });
  return `${indent(depth)}<ol>\n${items.join('\n')}\n${indent(depth)}</ol>`;
}

/** The first spine document's href, the target of a fallback TOC entry. */
function firstHref(pub: EpubPublication): string {
  const id = pub.spine[0]?.idref;
  return pub.items.find((i) => i.id === id)?.href ?? NAV_HREF;
}

/** The navigation document: `toc`, `landmarks` and `page-list` (the last
 *  two hidden, as reading systems present them in their own UI). */
export function buildNav(pub: EpubPublication): string {
  const s = navStrings(pub.metadata.language);
  // An empty list is invalid: a book with no headings lists its title.
  const toc = pub.toc.length ? pub.toc : [{ label: pub.metadata.title, href: firstHref(pub) }];
  const parts = [
    `<nav epub:type="toc" id="toc" role="doc-toc">\n<h1>${escapeXml(s.contents)}</h1>\n${navList(toc, 0)}\n</nav>`,
  ];
  if (pub.landmarks.length) {
    const items = pub.landmarks.map((l) =>
      `  <li><a epub:type="${escapeAttr(l.type)}" href="${escapeAttr(l.href)}">${escapeXml(l.label)}</a></li>`);
    parts.push(`<nav epub:type="landmarks" id="landmarks" hidden="hidden">\n<h2>${escapeXml(s.landmarks)}</h2>\n<ol>\n${items.join('\n')}\n</ol>\n</nav>`);
  }
  if (pub.pageList.length) {
    const items = pub.pageList.map((p) => `  <li><a href="${escapeAttr(p.href)}">${escapeXml(p.label)}</a></li>`);
    parts.push(`<nav epub:type="page-list" id="page-list" hidden="hidden" role="doc-pagelist">\n<h2>${escapeXml(s.pages)}</h2>\n<ol>\n${items.join('\n')}\n</ol>\n</nav>`);
  }
  return xhtmlDocument({
    lang: pub.metadata.language,
    ...(isRtlLanguage(pub.metadata.language) ? { dir: 'rtl' as const } : {}),
    title: pub.metadata.title,
    body: parts.join('\n'),
  });
}

/** The legacy NCX (EPUB 2 reading systems): the TOC as a nav map and the
 *  page list. */
export function buildNcx(pub: EpubPublication, identifier = bookIdentifier(pub.metadata)): string {
  const toc = pub.toc.length ? pub.toc : [{ label: pub.metadata.title, href: firstHref(pub) }];
  // One play order per target: EPUBCheck rejects two entries that point at
  // the same place with different orders (a part's entry and its page).
  const orders = new Map<string, number>();
  const playOrder = (src: string): number => {
    let n = orders.get(src);
    if (n === undefined) orders.set(src, (n = orders.size + 1));
    return n;
  };
  let pointCount = 0;
  let maxDepth = 0;
  const points = (list: readonly EpubNavPoint[], depth: number): string => list.map((p) => {
    maxDepth = Math.max(maxDepth, depth);
    const n = ++pointCount;
    const order = playOrder(p.href);
    const kids = p.children?.length ? `\n${points(p.children, depth + 1)}` : '';
    return `${indent(depth + 1)}<navPoint id="np-${n}" playOrder="${order}">\n` +
      `${indent(depth + 2)}<navLabel><text>${escapeXml(stripInvalidXmlChars(p.label))}</text></navLabel>\n` +
      `${indent(depth + 2)}<content src="${escapeAttr(p.href)}"/>${kids}\n` +
      `${indent(depth + 1)}</navPoint>`;
  }).join('\n');
  const navMap = points(toc, 1);
  const pageTargets = pub.pageList.map((p, i) =>
    `    <pageTarget id="pt-${i + 1}" type="${/^\d+$/.test(p.label) ? 'normal' : 'front'}" value="${i + 1}" playOrder="${playOrder(p.href)}">\n` +
    `      <navLabel><text>${escapeXml(p.label)}</text></navLabel>\n` +
    `      <content src="${escapeAttr(p.href)}"/>\n` +
    `    </pageTarget>`);
  const pageList = pageTargets.length
    ? `  <pageList>\n    <navLabel><text>${escapeXml(navStrings(pub.metadata.language).pages)}</text></navLabel>\n${pageTargets.join('\n')}\n  </pageList>\n`
    : '';
  const authors = (pub.metadata.creators ?? []).filter((c) => c.trim())
    .map((c) => `  <docAuthor><text>${escapeXml(c.trim())}</text></docAuthor>\n`).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${escapeAttr(pub.metadata.language)}">\n` +
    `  <head>\n` +
    `    <meta name="dtb:uid" content="${escapeAttr(identifier)}"/>\n` +
    `    <meta name="dtb:depth" content="${maxDepth}"/>\n` +
    `    <meta name="dtb:totalPageCount" content="${pub.pageList.length}"/>\n` +
    `    <meta name="dtb:maxPageNumber" content="${pub.pageList.length}"/>\n` +
    `  </head>\n` +
    `  <docTitle><text>${escapeXml(pub.metadata.title)}</text></docTitle>\n` +
    authors +
    `  <navMap>\n${navMap}\n  </navMap>\n` +
    pageList +
    `</ncx>\n`
  );
}

/** Write a publication as an EPUB 3 file: `mimetype` first and stored,
 *  `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`,
 *  `OEBPS/toc.ncx` and every item. Deterministic for a given input (pass
 *  `metadata.modified` for identical bytes across runs). */
export function packEpub(publication: EpubPublication): Uint8Array {
  const identifier = bookIdentifier(publication.metadata);
  const ids = new Set(['nav', 'ncx']);
  const hrefs = new Set([NAV_HREF, NCX_HREF]);
  for (const item of publication.items) {
    if (ids.has(item.id)) throw new Error(`packEpub: duplicate manifest id "${item.id}"`);
    if (hrefs.has(item.href)) throw new Error(`packEpub: duplicate item href "${item.href}"`);
    ids.add(item.id);
    hrefs.add(item.href);
  }
  for (const s of publication.spine) {
    if (!ids.has(s.idref)) throw new Error(`packEpub: spine item "${s.idref}" is not in the manifest`);
  }
  const level = (mediaType: string): 0 | 9 => STORED_TYPES.has(mediaType) ? 0 : 9;
  // Insertion order is zip order: `mimetype` must come first.
  const files: Zippable = {
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [enc.encode(CONTAINER_XML), { level: 9 }],
    [OPF_PATH]: [enc.encode(buildOpf(publication, identifier)), { level: 9 }],
    [`${PACKAGE_DIR}${NAV_HREF}`]: [enc.encode(buildNav(publication)), { level: 9 }],
    [`${PACKAGE_DIR}${NCX_HREF}`]: [enc.encode(buildNcx(publication, identifier)), { level: 9 }],
  };
  for (const item of publication.items) {
    files[`${PACKAGE_DIR}${item.href}`] = [bytesOf(item.data), { level: level(item.mediaType) }];
  }
  return zipSync(files, { mtime: ZIP_TIME });
}
