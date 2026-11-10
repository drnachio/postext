// The names of a font file, as InDesign reads them: an IDML names a face
// by its family and its style name (`Alegreya` + `Medium Italic`), which
// are the font's own (name table), not what CSS calls it. Reads TrueType
// and OpenType files (and the first face of a collection); WOFF and WOFF2
// are compressed and have to be decoded by the caller first.

export interface FontNames {
  /** Typographic family (name 16), else the family (name 1). */
  family: string;
  /** Typographic style (name 17), else the style (name 2). */
  style: string;
  postScriptName?: string;
  fullName?: string;
  /** `OpenTypeCFF` for CFF outlines, `TrueType` for glyf ones with no
   *  layout tables, else `OpenTypeTT`. */
  type: 'OpenTypeCFF' | 'OpenTypeTT' | 'TrueType';
  /** File extension of the format. */
  extension: 'otf' | 'ttf';
}

export type FontFormat = 'sfnt' | 'woff' | 'woff2' | 'unknown';

export function fontFormat(bytes: Uint8Array): FontFormat {
  if (bytes.length < 12) return 'unknown';
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'OTTO' || tag === 'true' || tag === 'ttcf' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return 'sfnt';
  return 'unknown';
}

const MAC_ROMAN_HIGH = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

/** The names of the font, or undefined when the bytes are not a font
 *  file this reader takes. */
export function fontNames(bytes: Uint8Array): FontNames | undefined {
  if (fontFormat(bytes) !== 'sfnt') return undefined;
  try {
    return readNames(bytes);
  } catch {
    // A cut or damaged file.
    return undefined;
  }
}

function readNames(bytes: Uint8Array): FontNames | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => (o + 2 <= view.byteLength ? view.getUint16(o) : 0);
  const u32 = (o: number) => (o + 4 <= view.byteLength ? view.getUint32(o) : 0);
  let base = 0;
  if (u32(0) === 0x74746366) base = u32(12); // ttcf: the first face
  const numTables = u16(base + 4);
  let name: { offset: number; length: number } | undefined;
  let cff = false;
  let layout = false;
  for (let i = 0; i < Math.min(numTables, 256); i++) {
    const rec = base + 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
    if (tag === 'name') name = { offset: u32(rec + 8), length: u32(rec + 12) };
    else if (tag === 'CFF ' || tag === 'CFF2') cff = true;
    else if (tag === 'GSUB' || tag === 'GPOS') layout = true;
  }
  if (!name || name.offset + 6 > view.byteLength) return undefined;
  const count = u16(name.offset + 2);
  const strings = name.offset + u16(name.offset + 4);
  // Windows Unicode English first, then any Windows Unicode, then Mac Roman.
  const found = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < Math.min(count, 4096); i++) {
    const rec = name.offset + 6 + i * 12;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    const language = u16(rec + 4);
    const id = u16(rec + 6);
    const length = u16(rec + 8);
    const at = strings + u16(rec + 10);
    if (![1, 2, 4, 6, 16, 17].includes(id) || at + length > view.byteLength) continue;
    let rank: number;
    let text = '';
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      rank = language === 0x409 ? 0 : 1;
      for (let k = 0; k + 1 < length; k += 2) text += String.fromCharCode(view.getUint16(at + k));
    } else if (platform === 0) {
      rank = 2;
      for (let k = 0; k + 1 < length; k += 2) text += String.fromCharCode(view.getUint16(at + k));
    } else if (platform === 1 && encoding === 0) {
      rank = 3;
      for (let k = 0; k < length; k++) {
        const c = view.getUint8(at + k);
        text += c < 128 ? String.fromCharCode(c) : (MAC_ROMAN_HIGH[c - 128] ?? '?');
      }
    } else continue;
    const had = found.get(id);
    if (text && (!had || rank < had.rank)) found.set(id, { rank, text });
  }
  const get = (id: number) => found.get(id)?.text.trim() || undefined;
  const family = get(16) ?? get(1);
  if (!family) return undefined;
  const postScriptName = get(6);
  const fullName = get(4);
  return {
    family,
    style: get(17) ?? get(2) ?? 'Regular',
    ...(postScriptName ? { postScriptName } : {}),
    ...(fullName ? { fullName } : {}),
    type: cff ? 'OpenTypeCFF' : layout ? 'OpenTypeTT' : 'TrueType',
    extension: cff ? 'otf' : 'ttf',
  };
}
