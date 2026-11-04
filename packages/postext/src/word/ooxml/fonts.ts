// Embedded fonts (ECMA-376 Part 4 §2.8.1): each face is stored as an
// obfuscated `.odttf` whose first 32 bytes are XORed with the 16 bytes of
// its GUID font key read in reverse order. The operation is symmetric.

import { escapeAttr } from '../xml.js';
import { guidFrom, hashBytes } from '../anchors/hash.js';
import { W_NAMESPACES, XML_DECL } from './constants.js';
import type { EmbeddedFontFace } from './types.js';

/** The key bytes of a `{XXXXXXXX-…}` font key: hex pairs from last to first. */
function keyBytes(fontKey: string): Uint8Array {
  const hex = fontKey.replace(/[{}-]/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`obfuscateFont: bad font key ${fontKey}`);
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) key[i] = parseInt(hex.substr(30 - i * 2, 2), 16);
  return key;
}

/** Obfuscate (or de-obfuscate) font bytes with a GUID font key. Returns a copy. */
export function obfuscateFont(bytes: Uint8Array, fontKey: string): Uint8Array {
  const key = keyBytes(fontKey);
  const out = bytes.slice();
  const n = Math.min(32, out.length);
  for (let i = 0; i < n; i++) out[i] = out[i]! ^ key[i % 16]!;
  return out;
}

/** A deterministic font key for a face (same font, same key). */
export function fontKeyFor(face: EmbeddedFontFace): string {
  return guidFrom(`${face.family}\u0000${face.slot}\u0000${hashBytes(face.bytes)}`);
}

export interface FontPart {
  path: string;
  relId: string;
  bytes: Uint8Array;
}

const SLOT_ORDER = ['regular', 'bold', 'italic', 'boldItalic'] as const;
const EMBED_ELEMENT = { regular: 'embedRegular', bold: 'embedBold', italic: 'embedItalic', boldItalic: 'embedBoldItalic' } as const;

/** `word/fontTable.xml`, its font parts and the relationships between them. */
export function fontTable(faces: readonly EmbeddedFontFace[]): { xml: string; parts: FontPart[] } {
  const families = new Map<string, EmbeddedFontFace[]>();
  for (const f of faces) {
    const list = families.get(f.family) ?? [];
    if (list.some((g) => g.slot === f.slot)) throw new Error(`fontTable: ${f.family} has two ${f.slot} faces`);
    list.push(f);
    families.set(f.family, list);
  }
  const parts: FontPart[] = [];
  let body = '';
  for (const [family, list] of families) {
    const meta = list.find((f) => f.slot === 'regular') ?? list[0]!;
    let el = `<w:font w:name="${escapeAttr(family)}">`;
    if (meta.panose) el += `<w:panose1 w:val="${escapeAttr(meta.panose)}"/>`;
    if (meta.charset) el += `<w:charset w:val="${escapeAttr(meta.charset)}"/>`;
    el += `<w:family w:val="${meta.familyClass ?? 'auto'}"/>`;
    el += `<w:pitch w:val="${meta.pitch ?? 'variable'}"/>`;
    if (meta.sig) {
      const s = meta.sig;
      el += `<w:sig w:usb0="${s.usb0}" w:usb1="${s.usb1}" w:usb2="${s.usb2}" w:usb3="${s.usb3}" w:csb0="${s.csb0}" w:csb1="${s.csb1}"/>`;
    }
    for (const slot of SLOT_ORDER) {
      const face = list.find((f) => f.slot === slot);
      if (!face) continue;
      const n = parts.length + 1;
      const key = fontKeyFor(face);
      const part: FontPart = { path: `word/fonts/font${n}.odttf`, relId: `rId${n}`, bytes: obfuscateFont(face.bytes, key) };
      parts.push(part);
      el += `<w:${EMBED_ELEMENT[slot]} r:id="${part.relId}" w:fontKey="${key}"/>`;
    }
    body += `${el}</w:font>`;
  }
  return { xml: `${XML_DECL}<w:fonts ${W_NAMESPACES}>${body}</w:fonts>`, parts };
}
