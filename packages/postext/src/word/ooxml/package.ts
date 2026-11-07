// The OOXML package writer (#1389): `createDocxPackage()` collects media,
// links and header/footer references while a variant writes the body, then
// `build` assembles relationships, content types, properties, fonts, notes,
// the export map and a deterministic zip (fixed timestamps, fixed order).

import { strToU8, zipSync, type Zippable } from 'fflate';
import { encodeExportMap, PROP_EXPORT_ID, PROP_VARIANT, PROP_VERSION } from '../anchors/exportMap.js';
import { guidFrom, hashBytes } from '../anchors/hash.js';
import { CONTENT_TYPE, DEFAULT_TYPES, REL, type Rel, relsXml, WORDML_NAMESPACES, W_NAMESPACES, XML_DECL } from './constants.js';
import { fontTable } from './fonts.js';
import { appPropsXml, corePropsXml, customPropsXml, itemPropsXml, notesXml, settingsXml, webSettingsXml, wordPart } from './parts.js';
import type { DocxPackageBuilder, DocxPackageInput } from './types.js';

type MediaExt = 'png' | 'jpeg' | 'gif' | 'svg' | 'emf';

interface MediaEntry {
  relId: string;
  path: string;
  bytes: Uint8Array;
}

/** Zip timestamp for every entry (local fields, so the bytes do not depend
 *  on the time zone). */
const ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0);
const STORED = new Set(['png', 'jpeg', 'gif']);
const MEDIA_EXT = new Set<string>(['png', 'jpeg', 'gif', 'svg', 'emf']);

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function docDefaultsXml(docDefaults: string | undefined): string {
  if (!docDefaults) return '';
  return docDefaults.trimStart().startsWith('<w:docDefaults') ? docDefaults : `<w:docDefaults>${docDefaults}</w:docDefaults>`;
}

/** Start a `.docx` package: add its media and parts, then write it. */
export function createDocxPackage(): DocxPackageBuilder {
  const media: MediaEntry[] = [];
  const mediaByKey = new Map<string, MediaEntry[]>();
  const links = new Map<string, string>();
  const headers = new Map<string, string>();
  const footers = new Map<string, string>();
  let drawingId = 0;
  let bookmarkId = 0;

  return {
    addMedia(bytes: Uint8Array, ext: MediaExt): string {
      if (!MEDIA_EXT.has(ext)) throw new Error(`addMedia: unsupported extension ${String(ext)}`);
      const key = `${ext}:${hashBytes(bytes)}`;
      const same = mediaByKey.get(key)?.find((m) => sameBytes(m.bytes, bytes));
      if (same) return same.relId;
      const n = media.length + 1;
      const entry: MediaEntry = { relId: `rIdImg${n}`, path: `media/image${n}.${ext}`, bytes };
      media.push(entry);
      mediaByKey.set(key, [...(mediaByKey.get(key) ?? []), entry]);
      return entry.relId;
    },
    addLink(url: string): string {
      let id = links.get(url);
      if (!id) {
        id = `rIdLink${links.size + 1}`;
        links.set(url, id);
      }
      return id;
    },
    headerRel(id: string): string {
      let rel = headers.get(id);
      if (!rel) {
        rel = `rIdHdr${headers.size + 1}`;
        headers.set(id, rel);
      }
      return rel;
    },
    footerRel(id: string): string {
      let rel = footers.get(id);
      if (!rel) {
        rel = `rIdFtr${footers.size + 1}`;
        footers.set(id, rel);
      }
      return rel;
    },
    nextDrawingId: () => ++drawingId,
    nextBookmarkId: () => ++bookmarkId,
    build(input: DocxPackageInput): Uint8Array {
      return zipParts(assemble(input, { media, links, headers: new Map(headers), footers: new Map(footers) }));
    },
  };
}

interface Collected {
  media: MediaEntry[];
  links: Map<string, string>;
  headers: Map<string, string>;
  footers: Map<string, string>;
}

/** Every part of the package, `[Content_Types].xml` first. */
export function assemble(input: DocxPackageInput, c: Collected): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array>();
  const overrides: [string, string][] = [];
  const put = (path: string, data: string | Uint8Array, contentType?: string): void => {
    parts.set(path, typeof data === 'string' ? strToU8(data) : data);
    if (contentType) overrides.push([`/${path}`, contentType]);
  };
  const docRels: Rel[] = [];
  const rel = (id: string, type: string, target: string, external = false): void => void docRels.push({ id, type, target, external });

  const background = input.background ? `<w:background w:color="${input.background}"/>` : '';
  put('word/document.xml', `${XML_DECL}<w:document ${WORDML_NAMESPACES}>${background}<w:body>${input.body}</w:body></w:document>`, CONTENT_TYPE.document);

  put('word/styles.xml', input.stylesXml ?? `${XML_DECL}<w:styles ${WORDML_NAMESPACES}>${docDefaultsXml(input.docDefaults)}${input.styles}</w:styles>`, CONTENT_TYPE.styles);
  rel('rIdStyles', REL.styles, 'styles.xml');

  const hasFootnotes = input.footnotes !== undefined;
  const hasEndnotes = input.endnotes !== undefined;
  put('word/settings.xml', settingsXml(input.settings ?? {}, { hasFootnotes, hasEndnotes, hasFonts: (input.fonts?.length ?? 0) > 0 }), CONTENT_TYPE.settings);
  rel('rIdSettings', REL.settings, 'settings.xml');
  put('word/webSettings.xml', webSettingsXml(), CONTENT_TYPE.webSettings);
  rel('rIdWebSettings', REL.webSettings, 'webSettings.xml');

  const fonts = fontTable(input.fonts ?? []);
  put('word/fontTable.xml', fonts.xml, CONTENT_TYPE.fontTable);
  rel('rIdFontTable', REL.fontTable, 'fontTable.xml');
  if (fonts.parts.length) {
    for (const f of fonts.parts) put(f.path, f.bytes);
    put('word/_rels/fontTable.xml.rels', relsXml(fonts.parts.map((f) => ({ id: f.relId, type: REL.font, target: f.path.slice('word/'.length) }))));
  }

  if (input.numbering !== undefined) {
    put('word/numbering.xml', `${XML_DECL}<w:numbering ${WORDML_NAMESPACES}>${input.numbering}</w:numbering>`, CONTENT_TYPE.numbering);
    rel('rIdNumbering', REL.numbering, 'numbering.xml');
  }
  if (hasFootnotes) {
    put('word/footnotes.xml', notesXml('footnote', input.footnotes!, input.footnoteSeparator), CONTENT_TYPE.footnotes);
    rel('rIdFootnotes', REL.footnotes, 'footnotes.xml');
  }
  if (hasEndnotes) {
    put('word/endnotes.xml', notesXml('endnote', input.endnotes!), CONTENT_TYPE.endnotes);
    rel('rIdEndnotes', REL.endnotes, 'endnotes.xml');
  }
  if (input.comments !== undefined) {
    put('word/comments.xml', wordPart('comments', input.comments), CONTENT_TYPE.comments);
    rel('rIdComments', REL.comments, 'comments.xml');
  }

  const headerFooter = (kind: 'header' | 'footer', registered: Map<string, string>, content: Record<string, string> | undefined): void => {
    const prefix = kind === 'header' ? 'rIdHdr' : 'rIdFtr';
    for (const id of Object.keys(content ?? {})) if (!registered.has(id)) registered.set(id, `${prefix}${registered.size + 1}`);
    let n = 0;
    for (const [id, relId] of registered) {
      const inner = content?.[id];
      if (inner === undefined) throw new Error(`createDocxPackage: ${kind} "${id}" was referenced but has no content`);
      n++;
      put(`word/${kind}${n}.xml`, wordPart(kind === 'header' ? 'hdr' : 'ftr', inner), CONTENT_TYPE[kind]);
      rel(relId, REL[kind], `${kind}${n}.xml`);
    }
  };
  headerFooter('header', c.headers, input.headers);
  headerFooter('footer', c.footers, input.footers);

  for (const m of c.media) {
    put(`word/${m.path}`, m.bytes);
    rel(m.relId, REL.image, m.path);
  }
  for (const [url, id] of c.links) rel(id, REL.hyperlink, url, true);

  const customProps: [string, string][] = [];
  if (input.exportMap) {
    const map = input.exportMap;
    put('customXml/item1.xml', encodeExportMap(map));
    put('customXml/itemProps1.xml', itemPropsXml(guidFrom(`postext-map:${map.exportId}`)), CONTENT_TYPE.customXmlProps);
    put('customXml/_rels/item1.xml.rels', relsXml([{ id: 'rId1', type: REL.customXmlProps, target: 'itemProps1.xml' }]));
    rel('rIdMap', REL.customXml, '../customXml/item1.xml');
    customProps.push([PROP_EXPORT_ID, map.exportId], [PROP_VARIANT, map.variant], [PROP_VERSION, map.engine]);
  }
  for (const [k, v] of Object.entries(input.customProps ?? {})) {
    const at = customProps.findIndex(([name]) => name === k);
    if (at >= 0) customProps[at] = [k, v];
    else customProps.push([k, v]);
  }

  put('word/_rels/document.xml.rels', relsXml(docRels));

  const pkgRels: Rel[] = [
    { id: 'rId1', type: REL.officeDocument, target: 'word/document.xml' },
    { id: 'rId2', type: REL.coreProps, target: 'docProps/core.xml' },
    { id: 'rId3', type: REL.appProps, target: 'docProps/app.xml' },
  ];
  put('docProps/core.xml', corePropsXml(input.core ?? {}), CONTENT_TYPE.coreProps);
  put('docProps/app.xml', appPropsXml(), CONTENT_TYPE.appProps);
  if (customProps.length) {
    put('docProps/custom.xml', customPropsXml(customProps), CONTENT_TYPE.customProps);
    pkgRels.push({ id: 'rId4', type: REL.customProps, target: 'docProps/custom.xml' });
  }
  put('_rels/.rels', relsXml(pkgRels));

  const defaults = Object.entries(DEFAULT_TYPES).map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join('');
  const overrideXml = overrides.map(([p, type]) => `<Override PartName="${p}" ContentType="${type}"/>`).join('');
  const contentTypes = `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}${overrideXml}</Types>`;

  const ordered = new Map<string, Uint8Array>([['[Content_Types].xml', strToU8(contentTypes)]]);
  const first = ['_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml', 'word/document.xml', 'word/_rels/document.xml.rels'];
  for (const p of first) if (parts.has(p)) ordered.set(p, parts.get(p)!);
  for (const [p, bytes] of parts) if (!ordered.has(p)) ordered.set(p, bytes);
  return ordered;
}

/** Deterministic zip: fixed timestamps, insertion order, media stored. */
export function zipParts(parts: Map<string, Uint8Array>): Uint8Array {
  const z: Zippable = {};
  for (const [path, bytes] of parts) {
    const ext = path.slice(path.lastIndexOf('.') + 1);
    z[path] = STORED.has(ext) ? [bytes, { level: 0 }] : bytes;
  }
  return zipSync(z, { level: 6, mtime: ZIP_TIME });
}

/** For tests and callers that write `w` parts outside the package. */
export { W_NAMESPACES, WORDML_NAMESPACES };
