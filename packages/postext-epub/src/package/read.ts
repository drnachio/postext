// Reading an EPUB back, for viewers: the container, the package document,
// the navigation document and the fixed-layout viewport. Reads what this
// package writes and ordinary EPUB 3 (and EPUB 2 NCX-only) files.

import { unzipSync } from 'fflate';
import type { EpubLayout, EpubNavPoint, EpubPageTarget, ReadEpubResult } from '../types';
import { childElements, descendants, localName, parseXml, textOf, type XmlElement } from '../shared/xmlRead';

const dec = new TextDecoder();

/** The directory part of a zip path, with its trailing slash (`''` at the
 *  root). */
export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

/** Resolve an href (relative to the directory `base`) to a zip path,
 *  keeping its fragment. Percent-escapes are decoded; `..` segments
 *  climb. */
export function resolveHref(base: string, href: string): string {
  const hash = href.indexOf('#');
  const path = hash < 0 ? href : href.slice(0, hash);
  const fragment = hash < 0 ? '' : href.slice(hash);
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return href; // absolute URL
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep a malformed escape as written.
  }
  const segments = (decoded.startsWith('/') ? decoded.slice(1) : base + decoded).split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/') + fragment;
}

function fileText(files: Map<string, Uint8Array>, path: string): string {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`readEpub: missing ${path}`);
  return dec.decode(bytes);
}

/** The links of an `<ol>` of a nav element, nested. */
function navPoints(ol: XmlElement, base: string): EpubNavPoint[] {
  const out: EpubNavPoint[] = [];
  for (const li of childElements(ol, 'li')) {
    const a = childElements(li, 'a')[0] ?? childElements(li, 'span')[0];
    const sub = childElements(li, 'ol')[0];
    const href = a?.attrs.href;
    const children = sub ? navPoints(sub, base) : [];
    out.push({
      label: a ? textOf(a) : '',
      href: href ? resolveHref(base, href) : '',
      ...(children.length ? { children } : {}),
    });
  }
  return out;
}

/** The NCX nav map, for an EPUB without a navigation document. */
function ncxPoints(parent: XmlElement, base: string): EpubNavPoint[] {
  return childElements(parent, 'navPoint').map((np) => {
    const label = descendants(childElements(np, 'navLabel')[0] ?? np, 'text')[0];
    const src = childElements(np, 'content')[0]?.attrs.src ?? '';
    const children = ncxPoints(np, base);
    return { label: label ? textOf(label) : '', href: src ? resolveHref(base, src) : '', ...(children.length ? { children } : {}) };
  });
}

/** `width=…, height=…` of a viewport meta. */
export function parseViewport(content: string): { width: number; height: number } | undefined {
  const w = /(?:^|[,;\s])width\s*=\s*([\d.]+)/i.exec(content);
  const h = /(?:^|[,;\s])height\s*=\s*([\d.]+)/i.exec(content);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : undefined;
}

export function readEpub(bytes: Uint8Array): ReadEpubResult {
  const files = new Map(Object.entries(unzipSync(bytes)));
  const container = parseXml(fileText(files, 'META-INF/container.xml'));
  const rootfile = descendants(container, 'rootfile').find((r) => r.attrs['media-type'] === 'application/oebps-package+xml') ??
    descendants(container, 'rootfile')[0];
  const opfPath = rootfile?.attrs['full-path'];
  if (!opfPath) throw new Error('readEpub: container.xml names no package document');
  const root = dirOf(opfPath);
  const opf = parseXml(fileText(files, opfPath));
  const metadata = childElements(opf, 'metadata')[0];
  const metaEls = metadata ? childElements(metadata) : [];
  const dc = (name: string): XmlElement[] => metaEls.filter((e) => e.name === `dc:${name}` || (localName(e.name) === name && e.name.includes(':')));
  const metaProperty = (property: string): string | undefined => {
    const el = metaEls.find((e) => localName(e.name) === 'meta' && e.attrs.property === property && !e.attrs.refines);
    return el ? textOf(el) : undefined;
  };
  const refined = (id: string | undefined, property: string): string | undefined => {
    if (!id) return undefined;
    const el = metaEls.find((e) => localName(e.name) === 'meta' && e.attrs.refines === `#${id}` && e.attrs.property === property);
    return el ? textOf(el) : undefined;
  };

  const titles = dc('title');
  const title = titles.find((t) => refined(t.attrs.id, 'title-type') === 'main') ??
    titles.find((t) => refined(t.attrs.id, 'title-type') === undefined) ?? titles[0];
  const uid = opf.attrs['unique-identifier'];
  const identifiers = dc('identifier');
  const identifier = identifiers.find((i) => i.attrs.id === uid) ?? identifiers[0];

  const manifest = new Map<string, { path: string; mediaType: string; properties: string[] }>();
  const manifestEl = childElements(opf, 'manifest')[0];
  for (const item of manifestEl ? childElements(manifestEl, 'item') : []) {
    const id = item.attrs.id;
    const href = item.attrs.href;
    if (!id || !href) continue;
    manifest.set(id, {
      path: resolveHref(root, href),
      mediaType: item.attrs['media-type'] ?? '',
      properties: (item.attrs.properties ?? '').split(/\s+/).filter(Boolean),
    });
  }

  const spineEl = childElements(opf, 'spine')[0];
  const spine = (spineEl ? childElements(spineEl, 'itemref') : []).flatMap((ref) => {
    const id = ref.attrs.idref ?? '';
    const item = manifest.get(id);
    return item ? [{
      id,
      path: item.path,
      linear: ref.attrs.linear !== 'no',
      properties: (ref.attrs.properties ?? '').split(/\s+/).filter(Boolean),
    }] : [];
  });

  // Navigation: the EPUB 3 nav document, else the NCX the spine names.
  let toc: EpubNavPoint[] = [];
  let pageList: EpubPageTarget[] = [];
  const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
  if (navItem && files.has(navItem.path)) {
    const nav = parseXml(fileText(files, navItem.path));
    const base = dirOf(navItem.path);
    for (const n of descendants(nav, 'nav')) {
      const type = (n.attrs['epub:type'] ?? '').split(/\s+/);
      const ol = childElements(n, 'ol')[0];
      if (!ol) continue;
      if (type.includes('toc') && toc.length === 0) toc = navPoints(ol, base);
      else if (type.includes('page-list') && pageList.length === 0) {
        pageList = navPoints(ol, base).map((p) => ({ label: p.label, href: p.href }));
      }
    }
  } else {
    const ncx = manifest.get(spineEl?.attrs.toc ?? '') ?? [...manifest.values()].find((i) => i.mediaType === 'application/x-dtbncx+xml');
    if (ncx && files.has(ncx.path)) {
      const doc = parseXml(fileText(files, ncx.path));
      const navMap = descendants(doc, 'navMap')[0];
      if (navMap) toc = ncxPoints(navMap, dirOf(ncx.path));
      pageList = descendants(doc, 'pageTarget').map((pt) => {
        const label = descendants(pt, 'text')[0];
        const src = childElements(pt, 'content')[0]?.attrs.src ?? '';
        return { label: label ? textOf(label) : '', href: resolveHref(dirOf(ncx.path), src) };
      });
    }
  }

  const layout: EpubLayout = metaProperty('rendition:layout') === 'pre-paginated' ? 'fixed' : 'reflowable';
  // The page size: the viewport of the first pre-paginated document.
  let viewport: { width: number; height: number } | undefined;
  if (layout === 'fixed') {
    for (const s of spine) {
      const text = files.get(s.path);
      if (!text) continue;
      const m = /<meta\s[^>]*name\s*=\s*["']viewport["'][^>]*>/i.exec(dec.decode(text.subarray(0, 4096)));
      const content = m ? /content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] : undefined;
      viewport = content ? parseViewport(content) : undefined;
      if (viewport) break;
    }
  }

  const coverItem = [...manifest.values()].find((i) => i.properties.includes('cover-image')) ??
    manifest.get(metaEls.find((e) => localName(e.name) === 'meta' && e.attrs.name === 'cover')?.attrs.content ?? '');

  return {
    layout,
    metadata: {
      title: title ? textOf(title) : '',
      language: dc('language')[0] ? textOf(dc('language')[0]!) : '',
      identifier: identifier ? textOf(identifier) : '',
      creators: dc('creator').map(textOf),
    },
    pageProgression: spineEl?.attrs['page-progression-direction'] === 'rtl' ? 'rtl' : 'ltr',
    files,
    root,
    manifest,
    spine,
    toc,
    pageList,
    ...(viewport ? { viewport } : {}),
    ...(coverItem ? { coverPath: coverItem.path } : {}),
  };
}
