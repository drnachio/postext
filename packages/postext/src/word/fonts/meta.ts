// What Word's font table wants to know about a face (#1393), read from
// `OS/2` and `post`, and the naming a renamed face carries: `name` IDs
// 1/2/3/4/6/16/17, `OS/2.fsSelection` and `head.macStyle` set to the
// face's Word style slot.

import type { EmbeddedFontFace } from '../ooxml/types.js';
import { isSymbolCmap } from './cmap.js';
import { ByteWriter, type Sfnt, view } from './sfnt.js';

export type WordSlot = EmbeddedFontFace['slot'];

/** OS/2.fsType bits. */
export const FS_TYPE_RESTRICTED = 0x0002;
export const FS_TYPE_PREVIEW_PRINT = 0x0004;

/** The embedding bits of a face (0 when it has no OS/2). */
export function fsType(font: Sfnt): number {
  const os2 = font.tables.get('OS/2');
  return os2 && os2.byteLength >= 10 ? view(os2).getUint16(8) : 0;
}

export const FS_TYPE_EDITABLE = 0x0008;
/** The face may not be subset: every slice is kept whatever the book sets. */
export const FS_TYPE_NO_SUBSETTING = 0x0100;
/** Only bitmaps may be embedded; Word embeds outlines, so this refuses. */
export const FS_TYPE_BITMAP_ONLY = 0x0200;

/** Restricted licence embedding: bit 1, unless a less restrictive bit
 *  (preview & print, editable) is also set; or bitmap embedding only. */
export function isRestricted(type: number): boolean {
  return (type & 0x000f) === FS_TYPE_RESTRICTED || (type & FS_TYPE_BITMAP_ONLY) !== 0;
}

/** Preview & print embedding: bit 2 without the editable bit 3 (older
 *  fonts may set it beside the restricted bit, which it then overrides). */
export function isPreviewPrint(type: number): boolean {
  return !isRestricted(type) && (type & FS_TYPE_PREVIEW_PRINT) !== 0 && (type & FS_TYPE_EDITABLE) === 0;
}

const hex8 = (n: number): string => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');

function familyClass(os2: Uint8Array | undefined, fixed: boolean): EmbeddedFontFace['familyClass'] {
  if (fixed) return 'modern';
  if (!os2 || os2.byteLength < 42) return 'auto';
  const cls = os2[30]!;
  if ([1, 2, 3, 4, 5, 7].includes(cls)) return 'roman';
  if (cls === 8) return 'swiss';
  if (cls === 10) return 'script';
  if (cls === 9 || cls === 12) return 'decorative';
  const familyType = os2[32]!;
  const serif = os2[33]!;
  if (familyType === 3) return 'script';
  if (familyType === 4 || familyType === 5) return 'decorative';
  if (familyType === 2) return serif >= 11 && serif <= 15 ? 'swiss' : serif >= 2 ? 'roman' : 'auto';
  return 'auto';
}

/** `w:font` metadata: panose, charset, family class, pitch, signature. */
export function wordFontMeta(font: Sfnt): Pick<EmbeddedFontFace, 'panose' | 'charset' | 'familyClass' | 'pitch' | 'sig'> {
  const os2 = font.tables.get('OS/2');
  const post = font.tables.get('post');
  const fixed = !!post && post.byteLength >= 16 && view(post).getUint32(12) !== 0;
  const out: Pick<EmbeddedFontFace, 'panose' | 'charset' | 'familyClass' | 'pitch' | 'sig'> = {
    charset: isSymbolCmap(font.tables.get('cmap')) ? '02' : '00',
    familyClass: familyClass(os2, fixed),
    pitch: fixed ? 'fixed' : 'variable',
  };
  if (os2 && os2.byteLength >= 58) {
    const v = view(os2);
    let panose = '';
    for (let i = 0; i < 10; i++) panose += os2[32 + i]!.toString(16).toUpperCase().padStart(2, '0');
    out.panose = panose;
    const hasCodePages = v.getUint16(0) >= 1 && os2.byteLength >= 86;
    out.sig = {
      usb0: hex8(v.getUint32(42)),
      usb1: hex8(v.getUint32(46)),
      usb2: hex8(v.getUint32(50)),
      usb3: hex8(v.getUint32(54)),
      csb0: hex8(hasCodePages ? v.getUint32(78) : 1),
      csb1: hex8(hasCodePages ? v.getUint32(82) : 0),
    };
  }
  return out;
}

const SUBFAMILY: Record<WordSlot, string> = {
  regular: 'Regular',
  bold: 'Bold',
  italic: 'Italic',
  boldItalic: 'Bold Italic',
};

/** The Windows-platform English strings of a `name` table: id → text. */
export function readNames(name: Uint8Array | undefined): Map<number, string> {
  const out = new Map<number, string>();
  if (!name || name.byteLength < 6) return out;
  const v = view(name);
  const count = v.getUint16(2);
  const strings = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > name.byteLength) break;
    const platform = v.getUint16(r);
    const encoding = v.getUint16(r + 2);
    const language = v.getUint16(r + 4);
    const id = v.getUint16(r + 6);
    const length = v.getUint16(r + 8);
    const start = strings + v.getUint16(r + 10);
    if (platform !== 3 || (encoding !== 1 && encoding !== 0) || start + length > name.byteLength) continue;
    if (out.has(id) && language !== 0x409) continue;
    let s = '';
    for (let k = 0; k + 1 < length; k += 2) s += String.fromCharCode((name[start + k]! << 8) | name[start + k + 1]!);
    out.set(id, s);
  }
  return out;
}

/** IDs carried over from the source face's names (copyright, version,
 *  trademark, vendor, designer, URLs, licence). */
const KEPT_IDS = [0, 5, 7, 8, 9, 10, 11, 12, 13, 14];

/** Printable ASCII without spaces or PostScript delimiters. */
function asciiName(text: string): string {
  let s = '';
  for (const c of text) {
    const code = c.charCodeAt(0);
    if (code > 32 && code < 127 && !'[](){}<>/%'.includes(c)) s += c;
  }
  return s;
}

/** Name ID 6: the family's ASCII characters; when others had to go (a
 *  family written in another script), a hash of the whole family follows
 *  so two such faces stay apart. */
function postscriptName(family: string, sub: string): string {
  let base = asciiName(family);
  if (base.length < family.replace(/ /g, '').length) {
    let h = 0x811c9dc5;
    for (let i = 0; i < family.length; i++) h = Math.imul(h ^ family.charCodeAt(i), 0x01000193) >>> 0;
    base = `${base.slice(0, 40)}${h.toString(16).toUpperCase().padStart(8, '0')}`;
  }
  return `${base}-${asciiName(sub)}`.slice(0, 63);
}

/** A `name` table naming the face `family` in `slot`, with the source's
 *  other strings kept (Windows Unicode BMP, US English). */
export function writeNames(source: Uint8Array | undefined, family: string, slot: WordSlot): Uint8Array {
  const old = readNames(source);
  const sub = SUBFAMILY[slot];
  const full = slot === 'regular' ? family : `${family} ${sub}`;
  const records = new Map<number, string>();
  for (const id of KEPT_IDS) {
    const s = old.get(id);
    if (s) records.set(id, s);
  }
  records.set(1, family);
  records.set(2, sub);
  records.set(3, `${full};postext`);
  records.set(4, full);
  records.set(6, postscriptName(family, sub));
  records.set(16, family);
  records.set(17, sub);
  const ids = [...records.keys()].sort((a, b) => a - b);
  const w = new ByteWriter();
  w.u16(0).u16(ids.length).u16(6 + ids.length * 12);
  const strings = new ByteWriter();
  for (const id of ids) {
    const text = records.get(id)!;
    w.u16(3).u16(1).u16(0x409).u16(id).u16(text.length * 2).u16(strings.length);
    for (let i = 0; i < text.length; i++) strings.u16(text.charCodeAt(i));
  }
  w.bytes(strings.finish());
  return w.finish();
}

/** `OS/2` and `head` copies whose style bits say `slot`: fsSelection
 *  ITALIC/BOLD/REGULAR, macStyle bold/italic. */
export function styleTables(font: Sfnt, slot: WordSlot): { os2?: Uint8Array; head?: Uint8Array } {
  const bold = slot === 'bold' || slot === 'boldItalic';
  const italic = slot === 'italic' || slot === 'boldItalic';
  const out: { os2?: Uint8Array; head?: Uint8Array } = {};
  const os2 = font.tables.get('OS/2');
  if (os2 && os2.byteLength >= 64) {
    const copy = os2.slice();
    const v = view(copy);
    // Keep USE_TYPO_METRICS, WWS and OBLIQUE (bits 7–9); set 0, 5, 6.
    let sel = v.getUint16(62) & ~(0x0001 | 0x0020 | 0x0040);
    if (italic) sel |= 0x0001;
    if (bold) sel |= 0x0020;
    if (!bold && !italic) sel |= 0x0040;
    v.setUint16(62, sel);
    out.os2 = copy;
  }
  const head = font.tables.get('head');
  if (head && head.byteLength >= 46) {
    const copy = head.slice();
    const v = view(copy);
    v.setUint16(44, (v.getUint16(44) & ~0x3) | (bold ? 1 : 0) | (italic ? 2 : 0));
    out.head = copy;
  }
  return out;
}
