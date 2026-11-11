// Reading an IDML package into the typed model: the designmap first,
// then every part it names.
//
// What fails is told apart. Bytes that are no IDML, a designmap that is
// no XML or names no page that is there, and a part that leaves the
// package are errors (`IdmlError`, with a code a host has words for). A
// resource part that is missing, a story or a spread the designmap names
// and the package lacks, an identifier written twice: the document is
// still read, and the reader says what it met in `warnings`.

import { localName, parseXml, XmlError, type XmlElement, type XmlInstruction } from '../xml/read.js';
import type { IdmlDestination, IdmlDocument, IdmlSpread, IdmlWarning, Inline, IdmlParagraph } from '../model/document.js';
import { IdmlError } from '../package/errors.js';
import { openIdml, safePath, type IdmlPackage, type OpenIdmlOptions } from '../package/open.js';
import { designMapOf, metadataOf } from './designmap.js';
import { defaultPreferences, preferencesOf } from './preferences.js';
import { fontsOf, graphicOf } from './resources.js';
import { spreadOf } from './spreads.js';
import { storyOf } from './story.js';
import { emptyStyles, stylesOf } from './styles.js';

export interface ReadIdmlOptions extends OpenIdmlOptions {
  /** Deepest XML nesting read in a part (default 256). */
  maxDepth?: number;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Run a part's reader: whatever it throws that is not already a typed
 *  error becomes one, with the part's name. */
function guarded<T>(part: string, read: () => T): T {
  try {
    return read();
  } catch (e) {
    if (e instanceof IdmlError) throw e;
    if (e instanceof XmlError) throw new IdmlError('malformed', `${part} is not well-formed XML: ${e.message}`, part);
    throw new IdmlError('malformed', `${part} cannot be read: ${message(e).slice(0, 200)}`, part);
  }
}

interface Parsed {
  root: XmlElement;
  prolog: XmlInstruction[];
}

/** A part as XML; undefined when the package lacks it. */
function xmlPart(pkg: IdmlPackage, src: string, maxDepth: number | undefined): Parsed | undefined {
  const path = safePath(src);
  if (!path) throw new IdmlError('unsafePath', `The document names a part outside the package: ${src.slice(0, 120)}`, src.slice(0, 120));
  return guarded(path, () => {
    const text = pkg.text(path);
    if (text === undefined) return undefined;
    const prolog: XmlInstruction[] = [];
    const root = parseXml(text, { ...(maxDepth !== undefined ? { maxDepth } : {}), onProlog: (pi) => prolog.push(pi) });
    return { root, prolog };
  });
}

/** The endnotes of the body take their text from the story InDesign
 *  keeps for them, where each stands in an `EndnoteRange` that names it. */
function joinEndnotes(doc: IdmlDocument): void {
  const ranges = new Map<string, IdmlParagraph[]>();
  for (const story of doc.stories.values()) {
    if (!story.endnotes) continue;
    for (const p of story.paragraphs) {
      if (!p.endnoteRange) continue;
      const list = ranges.get(p.endnoteRange);
      if (list) list.push(p);
      else ranges.set(p.endnoteRange, [p]);
    }
  }
  if (!ranges.size) return;
  for (const story of doc.stories.values()) {
    if (story.endnotes) continue;
    for (const p of story.paragraphs) {
      for (const r of p.runs) {
        for (const i of r.content as Inline[]) {
          if (i.kind !== 'endnote' || !i.self || i.paragraphs.length) continue;
          const text = ranges.get(i.self);
          if (text) i.paragraphs = text;
        }
      }
    }
  }
}

/** Read an IDML package. Throws {@link IdmlError} for what is no IDML or
 *  cannot be read at all; everything else it could not read as written
 *  is in the document's `warnings`. */
export function readIdml(input: Uint8Array | ArrayBuffer, options: ReadIdmlOptions = {}): IdmlDocument {
  const pkg = openIdml(input, options);
  const warnings: IdmlWarning[] = [];
  const depth = options.maxDepth;

  const map = xmlPart(pkg, 'designmap.xml', depth);
  if (!map || localName(map.root.name) !== 'Document') throw new IdmlError('malformed', 'designmap.xml does not hold a Document', 'designmap.xml');
  const design = guarded('designmap.xml', () => designMapOf(map.root, map.prolog));
  const parts = design.parts;

  // Resources: a package without one of them is still a document.
  const resource = <T>(src: string | undefined, what: string, read: (root: XmlElement, part: string) => T, fallback: () => T): T => {
    if (src === undefined) {
      warnings.push({ code: 'missingResource', message: `The document names no ${what} part; defaults are used` });
      return fallback();
    }
    const parsed = xmlPart(pkg, src, depth);
    if (!parsed) {
      warnings.push({ code: 'missingResource', message: `${src.slice(0, 120)} is named by the document and is not in the package; defaults are used`, part: src.slice(0, 120) });
      return fallback();
    }
    return guarded(src, () => read(parsed.root, src));
  };
  const graphic = resource(parts.graphic, 'Graphic', (root, part) => graphicOf(root, warnings, part), () => ({ swatches: new Map(), strokeStyles: new Map() }));
  const fonts = resource(parts.fonts, 'Fonts', (root) => fontsOf(root), () => []);
  const styles = resource(parts.styles, 'Styles', (root, part) => stylesOf(root, warnings, part), emptyStyles);
  const preferences = resource(parts.preferences, 'Preferences', (root) => preferencesOf(root), defaultPreferences);

  const doc: IdmlDocument = {
    ...design,
    preferences,
    swatches: graphic.swatches,
    strokeStyles: graphic.strokeStyles,
    fonts,
    styles,
    masterSpreads: [],
    spreads: [],
    stories: new Map(),
    files: new Map(),
    warnings,
  };

  // Spreads. The pages are numbered in the order the designmap gives.
  const seen = new Set<string>();
  const spreads = (list: string[], master: boolean): IdmlSpread[] => {
    const out: IdmlSpread[] = [];
    for (const src of list) {
      const parsed = xmlPart(pkg, src, depth);
      if (!parsed) {
        warnings.push({ code: 'missingPart', message: `${src.slice(0, 120)} is named by the document and is not in the package`, part: src.slice(0, 120) });
        continue;
      }
      const spread = guarded(src, () => spreadOf(parsed.root, { master, facing: preferences.facingPages, part: src }));
      if (!spread) {
        warnings.push({ code: 'emptyPart', message: `${src.slice(0, 120)} holds no ${master ? 'master spread' : 'spread'}`, part: src.slice(0, 120) });
        continue;
      }
      if (seen.has(spread.self)) {
        warnings.push({ code: 'duplicateId', message: `Spread ${spread.self.slice(0, 80)} is written twice; the first one is kept`, part: src.slice(0, 120) });
        continue;
      }
      seen.add(spread.self);
      out.push(spread);
    }
    return out;
  };
  doc.masterSpreads = spreads(parts.masterSpreads, true);
  doc.spreads = spreads(parts.spreads, false);
  // A document needs a page. One whose designmap names spreads and whose
  // package holds none of them has lost its pages: that is no warning.
  if (parts.spreads.length && !doc.spreads.length) throw new IdmlError('missingPart', 'None of the spreads the document names is in the package', parts.spreads[0]!.slice(0, 120));
  let index = 0;
  for (const spread of doc.spreads) for (const page of spread.pages) page.index = index++;

  // Stories, and the destinations that stand in their text.
  const destinations: IdmlDestination[] = [];
  for (const src of parts.stories) {
    const parsed = xmlPart(pkg, src, depth);
    if (!parsed) {
      warnings.push({ code: 'missingPart', message: `${src.slice(0, 120)} is named by the document and is not in the package`, part: src.slice(0, 120) });
      continue;
    }
    const story = guarded(src, () => storyOf(parsed.root, { part: src, warnings, destinations }));
    if (!story) {
      warnings.push({ code: 'emptyPart', message: `${src.slice(0, 120)} holds no story`, part: src.slice(0, 120) });
      continue;
    }
    if (doc.stories.has(story.self)) {
      warnings.push({ code: 'duplicateId', message: `Story ${story.self.slice(0, 80)} is written twice; the first one is kept`, part: src.slice(0, 120) });
      continue;
    }
    doc.stories.set(story.self, story);
  }
  for (const d of destinations) if (d.self && !doc.destinations.has(d.self)) doc.destinations.set(d.self, d);
  joinEndnotes(doc);

  // The XMP packet: the title and the author, when the package has one.
  if (pkg.has('META-INF/metadata.xml')) {
    try {
      const meta = xmlPart(pkg, 'META-INF/metadata.xml', depth);
      if (meta) {
        const { title, author } = metadataOf(meta.root);
        if (title) doc.title = title;
        if (author) doc.author = author;
      }
    } catch {
      warnings.push({ code: 'metadata', message: 'META-INF/metadata.xml cannot be read; the document has no title from it', part: 'META-INF/metadata.xml' });
    }
  }

  // What the package carries beside its XML: linked pictures, mostly.
  for (const name of pkg.names) {
    if (name === 'mimetype' || /\.xml$/i.test(name)) continue;
    const bytes = guarded(name, () => pkg.bytes(name));
    if (bytes) doc.files.set(name, bytes);
  }
  return doc;
}


export { IdmlError } from '../package/errors.js';
export type { IdmlErrorCode } from '../package/errors.js';
export { openIdml, IDML_MIMETYPE } from '../package/open.js';
export type { IdmlPackage, OpenIdmlOptions } from '../package/open.js';
export { languageTag } from './languages.js';
export { paragraphsOf, plainText, storyOf } from './story.js';
export { cellAt, rowBand } from './tables.js';
export * from '../resolve/index.js';
export type * from '../model/document.js';
export type { Box, Decomposed, Matrix, Path, PathPoint, Point } from '../model/geometry.js';
