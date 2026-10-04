// Which font files an EPUB embeds. A Google family comes as one file per
// script slice, each with its `unicode-range` (a Chinese face in about a
// hundred), and a book needs only the slices its text touches: the rest
// would weigh the file down for nothing.

import type { VDTDocument } from 'postext';

/** The code point ranges of a CSS `unicode-range` (`U+0000-00FF, U+0131,
 *  U+4E??`), inclusive; empty for a value it cannot read. */
export function parseUnicodeRange(value: string): [number, number][] {
  const out: [number, number][] = [];
  for (const raw of value.split(',')) {
    const token = raw.trim().toUpperCase();
    const m = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/.exec(token);
    if (!m) continue;
    const [, first, last] = m;
    if (first!.includes('?')) {
      out.push([parseInt(first!.replace(/\?/g, '0'), 16), parseInt(first!.replace(/\?/g, 'F'), 16)]);
    } else {
      const start = parseInt(first!, 16);
      out.push([start, last ? parseInt(last, 16) : start]);
    }
  }
  return out;
}

/** Whether any of `codePoints` falls in `ranges`. */
export function rangesCover(ranges: readonly [number, number][], codePoints: ReadonlySet<number>): boolean {
  for (const cp of codePoints) {
    for (const [a, b] of ranges) if (cp >= a && cp <= b) return true;
  }
  return false;
}

/** Every character the documents print: the strings of their page trees
 *  (line text, running heads, list markers, captions…). Keys that hold no
 *  printed text add a few ASCII letters at most, which every Latin slice
 *  covers anyway. */
export function documentCodePoints(docs: readonly VDTDocument[]): Set<number> {
  const out = new Set<number>();
  const visited = new Set<object>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const ch of value) out.add(ch.codePointAt(0)!);
      return;
    }
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    for (const [key, v] of Object.entries(value)) {
      // Maths arrive as SVG markup with its TeX: no font sets them.
      if (key === 'mathRender' || key === 'svg') continue;
      walk(v);
    }
  };
  for (const doc of docs) walk(doc.pages);
  return out;
}

/** A face as the host holds it (one file). */
export interface FaceFile {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
}

/** The faces to embed: every face without a `unicode-range`, and the
 *  slices whose range meets the text. A face (family, weight and style)
 *  none of whose slices the text meets keeps its first slice, so the
 *  family is still declared for the reader. */
export function facesForText<T extends FaceFile>(faces: readonly T[], codePoints: ReadonlySet<number>): T[] {
  const kept: T[] = [];
  const keptFaces = new Set<string>();
  const firstOf = new Map<string, T>();
  for (const face of faces) {
    const key = `${face.family}\u0000${face.weight}\u0000${face.style}`;
    if (!firstOf.has(key)) firstOf.set(key, face);
    if (!face.unicodeRange || rangesCover(parseUnicodeRange(face.unicodeRange), codePoints)) {
      kept.push(face);
      keptFaces.add(key);
    }
  }
  for (const [key, face] of firstOf) if (!keptFaces.has(key)) kept.push(face);
  return kept;
}

/** The format of a font file, read from its first bytes. */
export function fontFormatOf(bytes: Uint8Array): 'woff2' | 'woff' | 'ttf' | 'otf' {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  return 'ttf';
}
