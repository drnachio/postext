// IDML export: the laid-out pages as an InDesign Markup package, for
// finishing in InDesign. Built on the page display list (#1388), as the
// formatted Word export is: every page becomes a spread of one page;
// rules, boxes, paths and pictures become native page items; the text of
// each composed-page frame becomes one text frame with one story (frames
// chained by `next` share one story), with the frame's callout style as
// paragraph style. Chips that carry a form field become InDesign form
// fields (`fields.ts`). InDesign sets the text again with its own composer:
// frames, styles, text and first baselines match, line breaks may not.
//
// The writer's parts: `writer.ts` (its state, the options), `colours.ts`
// (swatches), `geometry.ts`, `shapes.ts` (boxes, rules, paths, chips),
// `images.ts`, `paragraphs.ts` (a paragraph's runs), `story.ts`,
// `spreads.ts`, and `parts.ts` for the package's fixed parts.

import { strToU8, zipSync, type Zippable } from 'fflate';
import { pageDisplayList } from '../paint/displayList/page.js';
import { authoredCmykColors } from '../color/authored.js';
import { RESERVED_SWATCH_NAMES } from './colours.js';
import {
  BACKING_STORY_XML,
  CONTAINER_XML,
  designMapXml,
  fontsXml,
  graphicXml,
  IDML_MIMETYPE,
  masterSpreadXml,
  preferencesXml,
  stylesXml,
} from './parts.js';
import { spreadXml } from './spreads.js';
import type { IdmlOptions, IdmlResult, Writer } from './writer.js';

export type { IdmlOptions, IdmlResult, IdmlWarning } from './writer.js';

/** Write the laid-out documents as an IDML package. */
export function idmlDocument(options: IdmlOptions): IdmlResult {
  const { docs } = options;
  const first = docs[0];
  if (!first || !first.pages.length) throw new Error('idmlDocument: nothing laid out');
  let n = 0x100;
  const seen = new Set<string>();
  const palette = new Map<string, string>();
  for (const e of first.config.colorPalette ?? []) palette.set(e.value.hex.slice(0, 7).toLowerCase(), e.name);
  const w: Writer = {
    next: () => `u${(n++).toString(16)}`,
    k: 72 / first.config.page.dpi,
    ox: 0,
    oy: 0,
    pageH: 0,
    swatches: new Map(),
    swatchNames: new Set(RESERVED_SWATCH_NAMES.map((n) => n.toLowerCase())),
    cmyk: authoredCmykColors(first.config),
    palette,
    fonts: new Map(),
    paraStyles: new Map(),
    doc: first,
    blockStyles: new Map(),
    stories: [],
    media: new Map(),
    opts: options,
    warn: (code, message) => {
      const key = `${code}\u0000${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.onWarning?.({ code, message });
    },
  };

  const spreads: { id: string; xml: string }[] = [];
  let geometry = { width: 0, height: 0, bleed: 0 };
  for (const doc of docs) {
    w.k = 72 / doc.config.page.dpi;
    w.doc = doc;
    w.blockStyles.clear();
    for (let p = 0; p < doc.pages.length; p++) {
      const page = pageDisplayList(doc, p);
      const trim = page.trim ?? { x: 0, y: 0, width: page.width, height: page.height };
      w.ox = trim.x;
      w.oy = trim.y;
      w.pageH = trim.height * w.k;
      if (!spreads.length) geometry = { width: trim.width * w.k, height: trim.height * w.k, bleed: trim.x * w.k };
      else if (Math.abs(trim.width * w.k - geometry.width) > 0.5 || Math.abs(w.pageH - geometry.height) > 0.5) w.warn('page.size', `Page ${p + 1} has its own size; IDML pages keep it, the document setup shows the first page's`);
      const frames = new Map((doc.pages[p]!.composed?.frames ?? []).map((f) => [f.id, f] as const));
      const id = w.next();
      spreads.push({ id, xml: spreadXml(w, id, page, frames, spreads.length, 36) });
    }
  }

  const g = { ...geometry, pages: spreads.length };
  const parts = new Map<string, Uint8Array>();
  parts.set('mimetype', strToU8(IDML_MIMETYPE));
  parts.set('designmap.xml', strToU8(designMapXml({ title: options.title ?? 'Postext', layerId: 'ulayer', masterId: 'umaster', spreads: spreads.map((s) => s.id), stories: w.stories.map((s) => s.id) })));
  parts.set('META-INF/container.xml', strToU8(CONTAINER_XML));
  parts.set('Resources/Graphic.xml', strToU8(graphicXml([...w.swatches.values()])));
  parts.set('Resources/Fonts.xml', strToU8(fontsXml(w.fonts)));
  parts.set('Resources/Styles.xml', strToU8(stylesXml([...w.paraStyles.values()])));
  parts.set('Resources/Preferences.xml', strToU8(preferencesXml(g)));
  parts.set('MasterSpreads/MasterSpread_umaster.xml', strToU8(masterSpreadXml('umaster', g)));
  for (const s of spreads) parts.set(`Spreads/Spread_${s.id}.xml`, strToU8(s.xml));
  for (const s of w.stories) parts.set(`Stories/Story_${s.id}.xml`, strToU8(s.xml));
  parts.set('XML/BackingStory.xml', strToU8(BACKING_STORY_XML));

  // The mimetype first and stored, as for EPUB and ODF.
  const z: Zippable = {};
  for (const [path, bytes] of parts) z[path] = path === 'mimetype' ? [bytes, { level: 0 }] : bytes;
  const bytes = zipSync(z, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) });
  return { bytes, links: [...w.media.values()] };
}

// IDML into Postext: an InDesign document as a new book (`import/`).
export { importIdml, readIdml, analyzeIdml, idmlToPostext, guessParagraphRole, guessCharacterRole, linkName, PARAGRAPH_ROLES, CHARACTER_ROLES } from './import/index.js';
export type { IdmlDocument, IdmlAnalysis, ParagraphRole, CharacterRole, StyleUse, IdmlImportOptions, IdmlImportResult, IdmlNote, IdmlNoteId } from './import/index.js';
