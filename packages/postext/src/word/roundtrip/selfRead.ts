// The writer's own output read as the importer reads a file (#1458), for
// what a map written again from the book cannot say by itself: how each
// character of a fragment looked in the file as written (bold from its
// style, in capitals, hidden), and the text of the paragraphs the writer
// set outside every fragment (contents and index lines, labels). An
// editor that keeps no style names and no fields (Google Docs) writes the
// first on every run and turns the second into plain paragraphs; with
// these, neither reads as an edit.

import type { ExportMap } from '../anchors/types.js';
import { parseXml } from '../xml.js';
import { looseText } from './align.js';
import { styleLooks } from './looks.js';
import { assign } from './read.js';
import { OBJECT_CHAR, PARA_CHAR, walkPart, type Token } from './walk.js';

/** The XML of a written file's text parts, as `semanticExportMap` gives
 *  them: the body's content, each note, the style definitions. */
export interface WrittenParts {
  body: string;
  footnotes: readonly string[];
  styles: string;
}

export interface SelfRead {
  /** Fragment id → the look of each character of its text. */
  looks: Map<string, string[]>;
  /** Paragraphs set outside the fragments, as they are compared, with
   *  how many times each stands in the file. */
  furniture: Map<string, number>;
}

/** A paragraph set outside the fragments, as it is compared: its words,
 *  whatever objects stand among them (a page number that is a field in
 *  one file and nothing in another). */
export const furnitureKey = (text: string): string => looseText(text.replaceAll(OBJECT_CHAR, ' '));

export function selfRead(map: ExportMap, parts: WrittenParts): SelfRead {
  const out: SelfRead = { looks: new Map(), furniture: new Map() };
  let tokens: Token[] = [];
  const generated: string[] = [];
  try {
    const looks = styleLooks(parseXml(`<w:styles>${parts.styles}</w:styles>`));
    const walked = walkPart(parseXml(`<w:body>${parts.body}</w:body>`), {}, tokens, 0, 0, { looks, generated });
    let { nextPara: next, nextBox: box } = walked;
    for (const note of parts.footnotes) ({ nextPara: next, nextBox: box } = walkPart(parseXml(note), {}, tokens, next, box, { looks, generated }));
  } catch {
    tokens = [];
  }
  const read = assign(tokens, map);
  for (const f of map.fragments) {
    const got = read.fragments.get(f.id);
    if (!got) continue;
    let c0 = 0;
    let c1 = got.chars.length;
    while (c0 < c1 && got.chars[c0]!.ch === PARA_CHAR) c0++;
    while (c1 > c0 && got.chars[c1 - 1]!.ch === PARA_CHAR) c1--;
    const chars = got.chars.slice(c0, c1);
    // Only a fragment read back as it was written tells its looks.
    if (chars.map((c) => c.ch).join('') === f.text) out.looks.set(f.id, chars.map((c) => c.look ?? ''));
  }
  for (const text of [...read.strays, ...generated]) {
    const key = furnitureKey(text);
    if (key) out.furniture.set(key, (out.furniture.get(key) ?? 0) + 1);
  }
  return out;
}
