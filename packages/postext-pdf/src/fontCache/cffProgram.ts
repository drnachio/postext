// A CFF OpenType face (`.otf`, `OTTO`) embedded whole is declared as what
// it is (#1436). pdf-lib takes such a face for TrueType when it embeds it
// whole (its `isCFF()` reads a fontkit property that is not there), so the
// file said `CIDFontType2` with the whole OpenType file in `FontFile2`:
// Acrobat lists the face as "TrueType (CID)" and a print preflight may
// reject it. Here the descendant font becomes `CIDFontType0`, and the bare
// `CFF ` table goes into `FontFile3` with `Subtype /CIDFontType0C`, valid
// from PDF 1.3 and in PDF/X-1a.
//
// pdf-lib writes glyph ids as CIDs (`Identity-H`). A name-keyed CFF program
// reads CIDs as glyph ids, so the text is unchanged. A CID-keyed program
// (`ROS` in its Top DICT, as in Source Han and Noto CJK) maps CIDs through
// its charset instead, which would pick other glyphs: such a face keeps
// pdf-lib's declaration.

import { PDFName, type PDFDict, type PDFFont, type PDFRef } from 'pdf-lib';

/** The `CFF ` table of an OpenType file, or `undefined` when it has none
 *  (a TrueType file, or a CFF2 variable font). */
export function cffTableOf(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.length < 12) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) return undefined;
    const tag = String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
    if (tag !== 'CFF ') continue;
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    if (offset + length > bytes.length || length < 4) return undefined;
    return bytes.subarray(offset, offset + length);
  }
  return undefined;
}

interface CffIndex { items: Array<[number, number]>; end: number }

/** A CFF INDEX at `at`: the [start, end) of each item, and where it ends. */
function readIndex(cff: Uint8Array, at: number): CffIndex | undefined {
  if (at + 2 > cff.length) return undefined;
  const count = (cff[at]! << 8) | cff[at + 1]!;
  if (count === 0) return { items: [], end: at + 2 };
  const offSize = cff[at + 2]!;
  if (offSize < 1 || offSize > 4) return undefined;
  const offsetAt = at + 3;
  const dataStart = offsetAt + (count + 1) * offSize - 1;
  const offset = (i: number): number => {
    let v = 0;
    for (let b = 0; b < offSize; b++) v = v * 256 + cff[offsetAt + i * offSize + b]!;
    return v;
  };
  const items: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) items.push([dataStart + offset(i), dataStart + offset(i + 1)]);
  const end = dataStart + offset(count);
  return end <= cff.length ? { items, end } : undefined;
}

/** Whether a CFF program is CID-keyed: its Top DICT holds `ROS` (12 30).
 *  `undefined` when the table cannot be read. */
export function isCidKeyedCff(cff: Uint8Array): boolean | undefined {
  const headerSize = cff[2];
  if (cff[0] !== 1 || headerSize === undefined) return undefined;
  const names = readIndex(cff, headerSize);
  const topDicts = names && readIndex(cff, names.end);
  const top = topDicts?.items[0];
  if (!top) return undefined;
  let i = top[0];
  while (i < top[1]) {
    const b0 = cff[i]!;
    if (b0 === 12) {
      if (cff[i + 1] === 30) return true;
      i += 2;
    } else if (b0 <= 21) i += 1; // an operator
    else if (b0 === 28) i += 3;
    else if (b0 === 29) i += 5;
    else if (b0 === 30) { // a real: nibbles up to an 0xf
      i += 1;
      while (i < top[1] && (cff[i]! & 0x0f) !== 0x0f && (cff[i]! & 0xf0) !== 0xf0) i += 1;
      i += 1;
    } else if (b0 >= 32 && b0 <= 246) i += 1;
    else if (b0 >= 247 && b0 <= 254) i += 2;
    else return undefined;
  }
  return false;
}

interface CffEmbedder {
  isCFF: () => boolean;
  serializeFont: () => Promise<Uint8Array>;
  embedCIDFontDict: (context: { lookup: (ref: PDFRef) => unknown }) => Promise<PDFRef>;
}

/** Make a font embedded whole from CFF OpenType `bytes` declare its CFF
 *  program: `CIDFontType0`, `FontFile3` / `CIDFontType0C`, no
 *  `CIDToGIDMap`. Returns whether it did; a CID-keyed or unreadable
 *  program keeps pdf-lib's declaration. */
export function declareCffProgram(font: PDFFont, bytes: Uint8Array): boolean {
  const cff = cffTableOf(bytes);
  if (!cff || isCidKeyedCff(cff) !== false) return false;
  const embedder = (font as unknown as { embedder?: CffEmbedder }).embedder;
  if (!embedder || typeof embedder.embedCIDFontDict !== 'function') return false;
  const program = cff.slice();
  embedder.isCFF = () => true;
  embedder.serializeFont = async () => program;
  const embedCIDFontDict = embedder.embedCIDFontDict.bind(embedder);
  embedder.embedCIDFontDict = async (context) => {
    const ref = await embedCIDFontDict(context);
    // CIDToGIDMap belongs to CIDFontType2 only (ISO 32000-1, 9.7.4.2).
    const dict = context.lookup(ref) as PDFDict | undefined;
    dict?.delete(PDFName.of('CIDToGIDMap'));
    return ref;
  };
  return true;
}
