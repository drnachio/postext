// A font collection built from single fonts, for the tests of #1558. A
// table two faces hold byte for byte is written once and both faces point
// at it, as collections made by font tools do.

import { readFileSync } from 'node:fs';

/** A font of the repository's Alf Layla preset. */
export const repoFont = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../../../../apps/web/public/presets/alf-layla/fonts/${name}`, import.meta.url)));

interface Entry {
  tag: number;
  checksum: number;
  data: Uint8Array;
}

function entries(font: Uint8Array): { version: number; tables: Entry[] } {
  const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables: Entry[] = [];
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + i * 16;
    tables.push({ tag: v.getUint32(r), checksum: v.getUint32(r + 4), data: font.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12)) });
  }
  return { version: v.getUint32(0), tables };
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const pad4 = (n: number): number => (n + 3) & ~3;

/** A `ttcf` file holding `fonts` as its faces, in that order. */
export function buildCollection(fonts: Uint8Array[]): Uint8Array {
  const faces = fonts.map(entries);
  const unique: Uint8Array[] = [];
  const indexOf = (data: Uint8Array): number => {
    const at = unique.findIndex((u) => same(u, data));
    return at >= 0 ? at : unique.push(data) - 1;
  };
  const refs = faces.map((f) => f.tables.map((t) => indexOf(t.data)));
  let offset = 12 + faces.length * 4;
  const dirAt = faces.map((f) => {
    const at = offset;
    offset += 12 + f.tables.length * 16;
    return at;
  });
  const dataAt = unique.map((u) => {
    const at = offset;
    offset += pad4(u.length);
    return at;
  });
  const out = new Uint8Array(offset);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x74746366);
  v.setUint32(4, 0x00010000);
  v.setUint32(8, faces.length);
  faces.forEach((face, i) => {
    const at = dirAt[i]!;
    v.setUint32(12 + i * 4, at);
    v.setUint32(at, face.version);
    v.setUint16(at + 4, face.tables.length);
    face.tables.forEach((t, k) => {
      const r = at + 12 + k * 16;
      v.setUint32(r, t.tag);
      v.setUint32(r + 4, t.checksum);
      v.setUint32(r + 8, dataAt[refs[i]![k]!]!);
      v.setUint32(r + 12, t.data.length);
    });
  });
  unique.forEach((u, i) => out.set(u, dataAt[i]!));
  return out;
}

/** The tables of an sfnt file by tag, with the checksum each records. */
export function sfntTables(font: Uint8Array): Map<string, { checksum: number; offset: number; data: Uint8Array }> {
  const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const out = new Map<string, { checksum: number; offset: number; data: Uint8Array }>();
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(font[r]!, font[r + 1]!, font[r + 2]!, font[r + 3]!);
    const offset = v.getUint32(r + 8);
    out.set(tag, { checksum: v.getUint32(r + 4), offset, data: font.subarray(offset, offset + v.getUint32(r + 12)) });
  }
  return out;
}
