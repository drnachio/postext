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
//
// The same faces give the natural advances of a run's characters (cmap →
// GSUB figure substitutions → hmtx, no kerning or shaping), so runs.ts can
// space every run out to the width the engine set it at (#1406).

import { readSfnt, type Sfnt } from '../fonts/sfnt.js';
import { readCmap } from '../fonts/cmap.js';
import { readHmtx } from '../fonts/glyf.js';
import { gsubSingles } from '../fonts/gsub.js';
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

/** Horizontal advances of a face, by code point. */
export interface FaceAdvances {
  unitsPerEm: number;
  cmap: Map<number, number>;
  advances: number[];
  /** The face's GSUB table, for a feature family's figures. */
  gsub?: Uint8Array;
}

/** cmap and hmtx of an sfnt, when it has both. */
export function faceAdvancesOf(font: Sfnt): FaceAdvances | undefined {
  const head = font.tables.get('head');
  const hhea = font.tables.get('hhea');
  const maxp = font.tables.get('maxp');
  const hmtx = font.tables.get('hmtx');
  if (!head || head.length < 20 || !hhea || hhea.length < 36 || !maxp || maxp.length < 6 || !hmtx) return undefined;
  const unitsPerEm = u16(head, 18);
  const cmap = readCmap(font.tables.get('cmap'));
  if (!unitsPerEm || cmap.size === 0) return undefined;
  const advances = readHmtx(hmtx, u16(hhea, 34), u16(maxp, 4)).map((m) => m[0]);
  const gsub = font.tables.get('GSUB');
  return { unitsPerEm, cmap, advances, ...(gsub ? { gsub } : {}) };
}

const singlesCache = new WeakMap<FaceAdvances, Map<string, Map<number, number>>>();

/** Glyph substitutions of `features` in a face, cached per face. */
function singlesOf(face: FaceAdvances, features: readonly string[]): Map<number, number> | undefined {
  if (!face.gsub || features.length === 0) return undefined;
  let byKey = singlesCache.get(face);
  if (!byKey) singlesCache.set(face, (byKey = new Map()));
  const key = features.join(',');
  let map = byKey.get(key);
  if (!map) byKey.set(key, (map = gsubSingles(face.gsub, features)));
  return map;
}

/** Advance in ems of the characters of `text` the face has, and how many
 *  it lacks (a renderer draws those from a fallback face). `features`
 *  (onum, tnum, …) swap figures as Word's numForm/numSpacing do. */
export function measureEms(face: FaceAdvances, text: string, features: readonly string[] = []): { ems: number; missing: number } {
  const subs = singlesOf(face, features);
  let units = 0;
  let missing = 0;
  for (const ch of text) {
    const g = face.cmap.get(ch.codePointAt(0)!);
    if (g === undefined || g === 0) {
      missing++;
      continue;
    }
    units += face.advances[subs?.get(g) ?? g] ?? 0;
  }
  return { ems: units / face.unitsPerEm, missing };
}

/** Natural advance of `text` in ems; undefined when the face lacks a
 *  character (the renderer would fall back to another face). */
export function naturalEms(face: FaceAdvances, text: string, features: readonly string[] = []): number | undefined {
  const m = measureEms(face, text, features);
  return m.missing ? undefined : m.ems;
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

interface ParsedFace {
  metrics?: FaceMetrics;
  advances?: FaceAdvances;
}

/** Font descents and advances per font string, from the embedded faces of
 *  the plan (a feature family `Lora@onum` reads its base family's face). */
export class MetricsCache {
  private readonly byFont = new Map<string, number>();
  private readonly byFace = new Map<string, ParsedFace | undefined>();

  constructor(private readonly plan: WordFontPlan | undefined) {}

  private face(fontString: string): ParsedFace | undefined {
    if (!this.plan) return undefined;
    const ref = wordFontFor(this.plan, fontString);
    const slot = ref.bold ? (ref.italic ? 'boldItalic' : 'bold') : ref.italic ? 'italic' : 'regular';
    const key = `${ref.family}|${slot}`;
    if (!this.byFace.has(key)) {
      const face = this.plan.faces.find((f) => f.family === ref.family && f.slot === slot) ?? this.plan.faces.find((f) => f.family === ref.family);
      const font = face ? readSfnt(face.bytes) : undefined;
      this.byFace.set(key, font ? { metrics: faceMetricsOf(font), advances: faceAdvancesOf(font) } : undefined);
    }
    return this.byFace.get(key);
  }

  /** The face metrics a font string resolves to in the plan, if embedded. */
  faceMetrics(fontString: string): FaceMetrics | undefined {
    return this.face(fontString)?.metrics;
  }

  /** The advances of the face a font string resolves to, if embedded. */
  faceAdvances(fontString: string): FaceAdvances | undefined {
    return this.face(fontString)?.advances;
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
