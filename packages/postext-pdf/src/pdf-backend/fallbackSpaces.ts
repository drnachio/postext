/**
 * Spaces and invisible characters a face has no glyph for (EF-66).
 *
 * The layout engine measured its text with the browser's canvas, whose
 * shaper (HarfBuzz) never shows a missing space as `.notdef`: a space
 * character the face lacks is set with the face's own space glyph, at an
 * advance that follows the kind of space (`_hb_ot_shape_fallback_spaces`), and
 * the default-ignorable characters (the word joiner, the zero-width no-break
 * space…) are hidden, with no advance. pdf-lib's fontkit does neither: it
 * draws glyph 0, the notdef box, at its own width — a visible box one em wide
 * in some faces, which also pushes the rest of the word. The PDF backend
 * paints them as the canvas did: {@link fallbackPieces} tells it where.
 */

/** How HarfBuzz sizes a space the face has no glyph for: a fraction of the
 *  em (the number is the divisor), the face's word space, a digit, a full
 *  stop, half a word space or 4/18 em. */
type SpaceKind = number | 'space' | 'figure' | 'punctuation' | 'narrow' | 'math';

/** The Unicode spaces HarfBuzz sets from the space glyph (`space_fallback_type`). */
const FALLBACK_SPACES = new Map<number, SpaceKind>([
  [0x00a0, 'space'], // no-break space
  [0x2000, 2], // en quad
  [0x2001, 1], // em quad
  [0x2002, 2], // en space
  [0x2003, 1], // em space
  [0x2004, 3], // three-per-em space
  [0x2005, 4], // four-per-em space
  [0x2006, 6], // six-per-em space
  [0x2007, 'figure'], // figure space
  [0x2008, 'punctuation'], // punctuation space
  [0x2009, 5], // thin space
  [0x200a, 16], // hair space
  [0x202f, 'narrow'], // narrow no-break space
  [0x205f, 'math'], // medium mathematical space
  [0x3000, 1], // ideographic space
]);

/** Invisible characters dropped whatever the face holds, as browsers hide
 *  them: the soft hyphen, the zero-width space, the word joiner and the
 *  zero-width no-break space (some faces give the last two a visible
 *  advance). The other default-ignorable characters (joiners, direction
 *  marks, variation selectors) take part in shaping and are dropped only
 *  when the face has no glyph for them. */
const ALWAYS_HIDDEN = new Set([0x00ad, 0x200b, 0x2060, 0xfeff]);

/** Unicode's Default_Ignorable_Code_Point, as HarfBuzz and fontkit list it. */
function isDefaultIgnorable(cp: number): boolean {
  if (cp < 0x10000) {
    return cp === 0x00ad || cp === 0x034f || cp === 0x061c
      || (cp >= 0x17b4 && cp <= 0x17b5)
      || (cp >= 0x180b && cp <= 0x180e)
      || (cp >= 0x200b && cp <= 0x200f)
      || (cp >= 0x202a && cp <= 0x202e)
      || (cp >= 0x2060 && cp <= 0x206f)
      || (cp >= 0xfe00 && cp <= 0xfe0f)
      || cp === 0xfeff
      || (cp >= 0xfff0 && cp <= 0xfff8);
  }
  return (cp >= 0x1bca0 && cp <= 0x1bca3) || (cp >= 0x1d173 && cp <= 0x1d17a) || (cp >= 0xe0000 && cp <= 0xe0fff);
}

/** Quick test for a character {@link fallbackPieces} may have to handle:
 *  most text holds none, and skips the per-character walk. */
const CANDIDATE_RE = /[ ­͏؜឴឵᠋-᠎ -‏‪-  -⁯　︀-️﻿￰-￸\uD82F\uD834\uDB40-\uDB43]/;

/** The fontkit face of an embedded font, as far as the fallbacks need it. */
export interface FallbackFace {
  unitsPerEm: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  glyphForCodePoint(codePoint: number): { advanceWidth: number };
}

/** A run of text to shape as it is, or a space the face has no glyph for,
 *  with the advance to set it at, in the face's units. */
export type TextPiece = { text: string } | { space: number };

function spaceAdvance(face: FallbackFace, kind: SpaceKind): number {
  const space = face.hasGlyphForCodePoint(0x20) ? face.glyphForCodePoint(0x20).advanceWidth : face.unitsPerEm / 4;
  if (typeof kind === 'number') return face.unitsPerEm / kind;
  switch (kind) {
    case 'space':
      return space;
    case 'narrow':
      return space / 2;
    case 'math':
      return (face.unitsPerEm * 4) / 18;
    case 'figure':
      for (let d = 0x30; d <= 0x39; d++) {
        if (face.hasGlyphForCodePoint(d)) return face.glyphForCodePoint(d).advanceWidth;
      }
      return space;
    case 'punctuation':
      for (const p of [0x2e, 0x2c]) {
        if (face.hasGlyphForCodePoint(p)) return face.glyphForCodePoint(p).advanceWidth;
      }
      return space;
  }
}

/**
 * `text` split for painting with `face`: runs of text to shape as they are,
 * and between them the spaces the face has no glyph for, each with the
 * advance the browser's shaper would give it; invisible characters are
 * dropped (see {@link ALWAYS_HIDDEN}). Undefined when the text needs none of
 * this, which is the common case.
 */
export function fallbackPieces(face: FallbackFace, text: string): TextPiece[] | undefined {
  if (!CANDIDATE_RE.test(text)) return undefined;
  const pieces: TextPiece[] = [];
  let run = '';
  let changed = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const kind = FALLBACK_SPACES.get(cp);
    if (kind !== undefined && !face.hasGlyphForCodePoint(cp)) {
      if (run) pieces.push({ text: run });
      run = '';
      pieces.push({ space: spaceAdvance(face, kind) });
      changed = true;
      continue;
    }
    if (ALWAYS_HIDDEN.has(cp) || (isDefaultIgnorable(cp) && !face.hasGlyphForCodePoint(cp))) {
      // Dropped from the run, so its neighbours still kern and ligate.
      changed = true;
      continue;
    }
    run += ch;
  }
  if (!changed) return undefined;
  if (run) pieces.push({ text: run });
  return pieces;
}
