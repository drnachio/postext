// Vertical font metrics and the baseline calibration of the formatted
// Word export (#1392). With exact line spacing Word gives every line a
// box of exactly the pitch and sets the baseline at
//
//     baselineOffset = pitch − descent
//
// below the line box's top, `descent` being the line's largest font
// descent at its size (Windows metrics: OS/2 usWinDescent, else hhea
// descender, over head.unitsPerEm); the extra leading goes above the
// text. A text box is therefore placed with its top at
// `firstBaseline − baselineOffset`. This is the one place to recalibrate
// against a renderer (Word, LibreOffice) if a font lands off its line.

import { readSfnt, type Sfnt } from '../fonts/sfnt.js';
import { wordFontFor } from '../fonts/plan.js';
import type { WordFontPlan } from '../fonts/types.js';
import { findPxSize } from '../../measure/fontString.js';

export interface FaceMetrics {
  unitsPerEm: number;
  /** Positive font units above the baseline. */
  ascent: number;
  /** Positive font units below the baseline. */
  descent: number;
}

/** Descent of a font of unknown metrics, as a fraction of its size. */
export const FALLBACK_DESCENT = 0.2;

function u16(t: Uint8Array, at: number): number {
  return (t[at]! << 8) | t[at + 1]!;
}
function i16(t: Uint8Array, at: number): number {
  const v = u16(t, at);
  return v & 0x8000 ? v - 0x10000 : v;
}

/** Windows vertical metrics of an sfnt (OS/2 win metrics, else hhea). */
export function faceMetricsOf(font: Sfnt): FaceMetrics | undefined {
  const head = font.tables.get('head');
  if (!head || head.length < 20) return undefined;
  const unitsPerEm = u16(head, 18);
  if (!unitsPerEm) return undefined;
  const os2 = font.tables.get('OS/2');
  if (os2 && os2.length >= 78) {
    const ascent = u16(os2, 74);
    const descent = u16(os2, 76);
    if (ascent + descent > 0) return { unitsPerEm, ascent, descent };
  }
  const hhea = font.tables.get('hhea');
  if (hhea && hhea.length >= 8) return { unitsPerEm, ascent: i16(hhea, 4), descent: Math.abs(i16(hhea, 6)) };
  return undefined;
}

export function readFaceMetrics(bytes: Uint8Array): FaceMetrics | undefined {
  const font = readSfnt(bytes);
  return font ? faceMetricsOf(font) : undefined;
}

/** The px size of a CSS font shorthand (0 when it has none). */
export function fontSizePx(fontString: string): number {
  const m = findPxSize(fontString);
  return m ? Number(m.value) : 0;
}

/** Where Word sets the baseline below the top of an exact line box. */
export function baselineOffset(pitchPx: number, descentPx: number): number {
  return pitchPx - descentPx;
}

/** Font descents per font string, from the embedded faces of the plan. */
export class MetricsCache {
  private readonly byFont = new Map<string, number>();
  private readonly byFace = new Map<string, FaceMetrics | undefined>();

  constructor(private readonly plan: WordFontPlan | undefined) {}

  /** The face metrics a font string resolves to in the plan, if embedded. */
  faceMetrics(fontString: string): FaceMetrics | undefined {
    if (!this.plan) return undefined;
    const ref = wordFontFor(this.plan, fontString);
    const slot = ref.bold ? (ref.italic ? 'boldItalic' : 'bold') : ref.italic ? 'italic' : 'regular';
    const key = `${ref.family}|${slot}`;
    if (!this.byFace.has(key)) {
      const face = this.plan.faces.find((f) => f.family === ref.family && f.slot === slot) ?? this.plan.faces.find((f) => f.family === ref.family);
      this.byFace.set(key, face ? readFaceMetrics(face.bytes) : undefined);
    }
    return this.byFace.get(key);
  }

  /** Descent in px of a font string at its size. */
  descentPx(fontString: string): number {
    let d = this.byFont.get(fontString);
    if (d === undefined) {
      const size = fontSizePx(fontString);
      const m = this.faceMetrics(fontString);
      d = m ? (m.descent / m.unitsPerEm) * size : FALLBACK_DESCENT * size;
      this.byFont.set(fontString, d);
    }
    return d;
  }
}
