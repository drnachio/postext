// Test harness of the semantic writer: export, unzip, and check every part
// (package structure, well-formed XML, property order, bookmark texts
// against the map, map offsets against the Markdown).

import { strFromU8, unzipSync } from 'fflate';
import { readExportMap } from '../../anchors/exportMap.js';
import type { ExportMap, MapFragment } from '../../anchors/types.js';
import { validateDocxPackage } from '../../ooxml/validate.js';
import { xmlProblems } from '../../ooxml/wellFormed.js';
import { semanticDocx, type SemanticDocxOptions, type SemanticWarning } from '../index.js';
import { bookmarkTexts, orderProblems } from '../inspect.js';

export interface Exported {
  bytes: Uint8Array;
  files: Record<string, Uint8Array>;
  part(path: string): string;
  doc: string;
  map: ExportMap;
  warnings: SemanticWarning[];
  /** Fragment whose text is `text` (first match). */
  frag(text: string): MapFragment;
}

export const FIXED_DATE = '2026-11-04T00:00:00Z';

export async function exportDocx(markdown: string | string[], options: Partial<SemanticDocxOptions> = {}): Promise<Exported> {
  const warnings: SemanticWarning[] = [];
  const chapters = (Array.isArray(markdown) ? markdown : [markdown]).map((md, i) => ({ id: `ch${i + 1}`, title: `Chapter ${i + 1}`, markdown: md }));
  const bytes = await semanticDocx({ chapters, config: {}, date: FIXED_DATE, onWarning: (w) => warnings.push(w), ...options });
  const files = unzipSync(bytes);
  const part = (path: string): string => (files[path] ? strFromU8(files[path]!) : '');
  const map = readExportMap(files)!;
  return {
    bytes,
    files,
    part,
    doc: part('word/document.xml'),
    map,
    warnings,
    frag(text) {
      const f = map.fragments.find((x) => x.text === text);
      if (!f) throw new Error(`no fragment "${text}" in ${JSON.stringify(map.fragments.map((x) => x.text))}`);
      return f;
    },
  };
}

/** Every problem found in an export (empty = sound). `markdown` gives the
 *  chapters' text for the offset checks; `fields` resource field texts. */
export function exportProblems(e: Exported, markdown: string[], fields?: (f: MapFragment) => string | undefined): string[] {
  const out: string[] = [];
  out.push(...validateDocxPackage(e.files));
  for (const [path, bytes] of Object.entries(e.files)) {
    if (!/\.(xml|rels)$/.test(path)) continue;
    const xml = strFromU8(bytes);
    out.push(...xmlProblems(xml).map((p) => `${path}: ${p}`));
    if (path.startsWith('word/')) out.push(...orderProblems(xml).map((p) => `${path}: ${p}`));
  }
  const texts = new Map([...bookmarkTexts(e.doc), ...bookmarkTexts(e.part('word/footnotes.xml'))]);
  // The map lists fragments in the order the importer reads them: the
  // body's bookmarks, then the notes'.
  const read = [...texts.keys()].join(',');
  const listed = e.map.fragments.map((f) => f.id).join(',');
  if (read !== listed) out.push(`fragment order: document has ${read}, map lists ${listed}`);
  for (const f of e.map.fragments) {
    if (f.map.length !== f.text.length) out.push(`fragment ${f.id}: map length ${f.map.length} \u2260 text length ${f.text.length}`);
    const read = texts.get(f.id);
    if (read !== f.text) out.push(`fragment ${f.id}: bookmark holds ${JSON.stringify(read)}, map says ${JSON.stringify(f.text)}`);
    const src = f.target.kind === 'markdown' ? markdown[f.target.chapter] : fields?.(f);
    if (src === undefined) continue;
    let last = -1;
    for (let i = 0; i < f.text.length; i++) {
      const m = f.map[i]!;
      if (m < 0) continue;
      const a = src[m];
      const b = f.text[i]!;
      if (a !== b && !(a !== undefined && /\s/.test(a) && /\s/.test(b))) out.push(`fragment ${f.id} (${f.role}): text[${i}] ${JSON.stringify(b)} \u2260 source[${m}] ${JSON.stringify(a)}`);
      if (m <= last) out.push(`fragment ${f.id}: map not increasing at ${i}`);
      last = m;
    }
    for (const a of f.atoms ?? []) if (a.start < f.range[0] || a.end > f.range[1] || a.end <= a.start) out.push(`fragment ${f.id}: atom ${a.kind} [${a.start}, ${a.end}) outside [${f.range}]`);
  }
  return out;
}

/** The empty one-column section after columns that close before a new
 *  page, which lets Word end them level (see `chapterSections`). */
const LEVEL_SECTION = /(?<=<\/w:sectPr><\/w:pPr><\/w:p>)<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"\/><w:ind w:firstLine="0"\/><w:rPr><w:sz w:val="2"\/><w:szCs w:val="2"\/><\/w:rPr>(?:<w:sectPr>(?:(?!<\/w:sectPr>).)*<\/w:sectPr><\/w:pPr><\/w:p>|<\/w:pPr><\/w:p><w:sectPr>(?:(?!<\/w:sectPr>).)*<\/w:sectPr>(?=<\/w:body>))/g;

/** The document's sections, in order, leaving out those that only level
 *  the columns above them. */
export function sectionsOf(doc: string): string[] {
  return doc.replace(LEVEL_SECTION, '').match(/<w:sectPr>.*?<\/w:sectPr>/g) ?? [];
}

/** How many sections only level the columns above them. */
export const levelSections = (doc: string): number => doc.match(LEVEL_SECTION)?.length ?? 0;

/** `w:t` text containing `:::` outside raw content controls and code. */
export function looseMarkup(doc: string): string[] {
  const stripped = doc
    .replace(/<w:sdt><w:sdtPr>(?:(?!<\/w:sdtPr>).)*ptx:raw(?:(?!<\/w:sdt>).)*<\/w:sdt>/g, '')
    .replace(/<w:p><w:pPr><w:pStyle w:val="PostextCode"\/>(?:(?!<\/w:p>).)*<\/w:p>/g, '')
    .replace(/<w:r><w:rPr><w:rStyle w:val="PostextCodeChar"\/>(?:(?!<\/w:r>).)*<\/w:r>/g, '');
  return stripped.match(/<w:t[^>]*>[^<]*:::[^<]*/g) ?? [];
}
