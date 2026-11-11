// Test kit of the reader: the reference package InDesign wrote, and small
// packages built by hand.
//
// `__fixtures__/reference.idml` was saved by InDesign 2026 (21.6) from a
// script that puts one of everything the reader knows on four pages. Its
// links were rewritten to a neutral path; nothing else was touched.

import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { IdmlDocument, IdmlPageItem, IdmlTable, Inline } from '../model/document.js';
import { IDML_MIMETYPE } from '../package/open.js';
import { readIdml } from './index.js';

let bytes: Uint8Array | undefined;
let parsed: IdmlDocument | undefined;

export function referenceBytes(): Uint8Array {
  return (bytes ??= new Uint8Array(readFileSync(new URL('../__fixtures__/reference.idml', import.meta.url))));
}

/** The reference document, read once. Tests read it, they do not change it. */
export function reference(): IdmlDocument {
  return (parsed ??= readIdml(referenceBytes()));
}

/** The reference package's entries, to rebuild it with some changed. */
export function referenceFiles(): Record<string, Uint8Array> {
  return unzipSync(referenceBytes());
}

/** A zip with `mimetype` first and stored, as an IDML package is. */
export function pack(files: Record<string, string | Uint8Array>, mimetype: string | null = IDML_MIMETYPE): Uint8Array {
  const entries: Zippable = {};
  if (mimetype !== null) entries.mimetype = [strToU8(mimetype), { level: 0 }];
  for (const [name, data] of Object.entries(files)) entries[name] = typeof data === 'string' ? strToU8(data) : data;
  return zipSync(entries);
}

const NS = 'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"';

export const storyXml = (self: string, body: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:Story ${NS} DOMVersion="21.5"><Story Self="${self}"><StoryPreference StoryDirection="LeftToRightDirection" StoryOrientation="Horizontal"/>${body}</Story></idPkg:Story>`;

export const paragraph = (text: string, style = 'ParagraphStyle/$ID/NormalParagraphStyle'): string =>
  `<ParagraphStyleRange AppliedParagraphStyle="${style}"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>${text}</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;

/** A text frame of a 612 × 792 page whose spread has its origin at the
 *  page's top left. */
export const frameXml = (self: string, story: string, box: [number, number, number, number], extra = ''): string => {
  const [l, t, r, b] = box;
  const pt = (x: number, y: number): string => `<PathPointType Anchor="${x} ${y}" LeftDirection="${x} ${y}" RightDirection="${x} ${y}"/>`;
  return `<TextFrame Self="${self}" ParentStory="${story}" ItemTransform="1 0 0 1 0 0" ${extra}><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${pt(l, t)}${pt(l, b)}${pt(r, b)}${pt(r, t)}</PathPointArray></GeometryPathType></PathGeometry></Properties></TextFrame>`;
};

export const spreadXml = (self: string, items: string, pages = 1): string => {
  let p = '';
  for (let i = 0; i < pages; i++) p += `<Page Self="${self}p${i}" Name="${i + 1}" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 ${i * 612} 0" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" OverrideList=""><MarginPreference Top="36" Bottom="36" Left="36" Right="36" ColumnCount="1" ColumnGutter="12"/></Page>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<idPkg:Spread ${NS} DOMVersion="21.5"><Spread Self="${self}" PageCount="${pages}" BindingLocation="0" ItemTransform="1 0 0 1 0 0">${p}${items}</Spread></idPkg:Spread>`;
};

export interface MiniOptions {
  /** Story parts by `Self` (the XML of each part). */
  stories?: Record<string, string>;
  /** Items of the one spread. */
  items?: string;
  /** Inserted in the designmap's `<Document>`. */
  designmap?: string;
  /** More entries, or replacements of the built ones. */
  files?: Record<string, string | Uint8Array>;
  /** Story parts the designmap names beside the ones given. */
  alsoNamed?: string[];
}

/** A small package with one page: enough of an IDML for the reader. */
export function mini(options: MiniOptions = {}): Uint8Array {
  const stories = options.stories ?? {};
  const named = [...Object.keys(stories).map((s) => `Stories/Story_${s}.xml`), ...(options.alsoNamed ?? [])];
  const files: Record<string, string | Uint8Array> = {
    'designmap.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="21.6(57)" ?>\n<Document ${NS} DOMVersion="21.5" Self="d">${options.designmap ?? ''}<Layer Self="ul" Name="Layer 1"/><idPkg:Spread src="Spreads/Spread_us.xml"/>${named.map((n) => `<idPkg:Story src="${n}"/>`).join('')}</Document>`,
    'Spreads/Spread_us.xml': spreadXml('us', options.items ?? ''),
  };
  for (const [self, xml] of Object.entries(stories)) files[`Stories/Story_${self}.xml`] = xml;
  return pack({ ...files, ...(options.files ?? {}) });
}

/** The text of inlines, specials shown by name. */
export const inlineText = (content: readonly Inline[]): string => content.map((i) => (i.kind === 'text' ? i.text : i.kind === 'special' ? `{${i.char}}` : `<${i.kind}>`)).join('');

export function tablesOf(doc: IdmlDocument, story: string): IdmlTable[] {
  const out: IdmlTable[] = [];
  for (const p of doc.stories.get(story)?.paragraphs ?? []) for (const r of p.runs) for (const i of r.content) if (i.kind === 'table') out.push(i.table);
  return out;
}

export function inlineItems(doc: IdmlDocument, story: string): IdmlPageItem[] {
  const out: IdmlPageItem[] = [];
  for (const p of doc.stories.get(story)?.paragraphs ?? []) for (const r of p.runs) for (const i of r.content) if (i.kind === 'item') out.push(i.item);
  return out;
}
