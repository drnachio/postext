// What a font file says about itself: the names a face goes by (family,
// style, PostScript name, full name), its weight and slant, and whether
// its licence lets it be embedded. Read from the `name`, `OS/2` and
// `head` tables of a TrueType or OpenType file. A WOFF2 file keeps its
// tables compressed with Brotli, so only its file name is known; the
// formats a Postext book cannot carry are named as such.

/** The format of a font file a book can carry. */
export type FontFileFormat = 'ttf' | 'otf' | 'woff2';

/** A face read from its file. */
export interface FontFace {
  format: FontFileFormat;
  /** Typographic family (`name` ID 16, else 1). */
  family?: string;
  /** Typographic style (`name` ID 17, else 2). */
  style?: string;
  /** Legacy family (`name` ID 1), which may carry the weight (`Minion Pro Semibold`). */
  legacyFamily?: string;
  postScriptName?: string;
  fullName?: string;
  /** `OS/2.usWeightClass`, 400 when the file has no `OS/2`. */
  weight: number;
  italic: boolean;
  /** The licence bits forbid embedding the face (`OS/2.fsType`). */
  restricted: boolean;
}

/** Why a font file cannot be carried: a collection of faces, a Type 1
 *  font, a Mac suitcase, a WOFF 1 file, bytes that are no font. A
 *  collection is read here as one file; the importer splits it into
 *  single faces first (`splitFontCollection`). */
export type UnusableFont = { unusable: 'collection' | 'type1' | 'suitcase' | 'woff' | 'unknown' };

/** Extensions of font files, usable or not. A file of `Document fonts`
 *  with none is a Mac suitcase. */
export const FONT_EXTENSIONS = /\.(otf|ttf|woff2?|ttc|otc|dfont|pfb|pfm|pfa|afm|lwfn|suit|fon|fnt)$/i;

const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

function tables(b: Uint8Array): Map<string, Uint8Array> | undefined {
  if (b.length < 12) return undefined;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = v.getUint16(4);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const r = 12 + i * 16;
    if (r + 16 > b.length) return undefined;
    const offset = v.getUint32(r + 8);
    const length = v.getUint32(r + 12);
    if (offset + length > b.length) continue;
    out.set(tag(b, r), b.subarray(offset, offset + length));
  }
  return out;
}

/** Name ID → string: Windows Unicode, US English first, then Mac Roman. */
function names(t: Uint8Array | undefined): Map<number, string> {
  const out = new Map<number, string>();
  if (!t || t.length < 6) return out;
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const count = v.getUint16(2);
  const strings = v.getUint16(4);
  const rank = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > t.length) break;
    const platform = v.getUint16(r);
    const encoding = v.getUint16(r + 2);
    const language = v.getUint16(r + 4);
    const id = v.getUint16(r + 6);
    const length = v.getUint16(r + 8);
    const start = strings + v.getUint16(r + 10);
    if (start + length > t.length) continue;
    let score: number;
    let s = '';
    if (platform === 3 && (encoding === 1 || encoding === 10 || encoding === 0)) {
      score = language === 0x409 ? 3 : 2;
      for (let k = 0; k + 1 < length; k += 2) s += String.fromCharCode((t[start + k]! << 8) | t[start + k + 1]!);
    } else if (platform === 1 && encoding === 0) {
      score = language === 0 ? 1 : 0;
      for (let k = 0; k < length; k++) s += String.fromCharCode(t[start + k]!);
    } else continue;
    if ((rank.get(id) ?? -1) >= score || !s.trim()) continue;
    rank.set(id, score);
    out.set(id, s.trim());
  }
  return out;
}

/** What `bytes` (a font file called `name`) says about its face. */
export function readFontFace(name: string, bytes: Uint8Array): FontFace | UnusableFont {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (bytes.length >= 4) {
    const head = tag(bytes, 0);
    if (head === 'ttcf') return { unusable: 'collection' };
    if (head === 'wOF2') return { format: 'woff2', weight: 400, italic: false, restricted: false };
    if (head === 'wOFF') return { unusable: 'woff' };
    const sfnt = head === 'OTTO' || head === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
    if (sfnt) {
      const t = tables(bytes);
      if (!t) return { unusable: 'unknown' };
      const n = names(t.get('name'));
      const os2 = t.get('OS/2');
      const hd = t.get('head');
      const os2v = os2 && os2.length >= 64 ? new DataView(os2.buffer, os2.byteOffset, os2.byteLength) : undefined;
      const weight = os2v ? os2v.getUint16(4) : 400;
      const fsType = os2v ? os2v.getUint16(8) : 0;
      const fsSelection = os2v ? os2v.getUint16(62) : 0;
      const macStyle = hd && hd.length >= 46 ? new DataView(hd.buffer, hd.byteOffset, hd.byteLength).getUint16(44) : 0;
      const family = n.get(16) ?? n.get(1);
      const style = n.get(17) ?? n.get(2);
      return {
        format: head === 'OTTO' ? 'otf' : 'ttf',
        ...(family ? { family } : {}),
        ...(style ? { style } : {}),
        ...(n.get(1) ? { legacyFamily: n.get(1)! } : {}),
        ...(n.get(6) ? { postScriptName: n.get(6)! } : {}),
        ...(n.get(4) ? { fullName: n.get(4)! } : {}),
        weight: weight >= 1 && weight <= 1000 ? weight : 400,
        italic: (fsSelection & 0x0201) !== 0 || (macStyle & 0x0002) !== 0,
        // Restricted licence embedding, unless a laxer bit is also set; or bitmaps only.
        restricted: ((fsType & 0x000f) === 0x0002) || (fsType & 0x0200) !== 0,
      };
    }
  }
  if (ext === 'pfb' || ext === 'pfm' || ext === 'pfa' || ext === 'afm' || ext === 'lwfn') return { unusable: 'type1' };
  if (ext === 'dfont' || ext === 'suit' || ext === '') return { unusable: 'suitcase' };
  if (ext === 'ttc' || ext === 'otc') return { unusable: 'collection' };
  if (bytes.length >= 2 && bytes[0] === 0x80 && bytes[1] === 0x01) return { unusable: 'type1' };
  return { unusable: 'unknown' };
}
