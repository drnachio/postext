// Ligatures in fitted runs (#1444). A run spaced out to the engine's
// width carries `w:spacing`, and neither LibreOffice nor Word forms a
// ligature in a letter-spaced run: a cover title set in Cormorant lost its
// Th. At display sizes the ligature shows, so a run holding one of the
// face's ligatures (its `liga` feature, which both renderers apply) keeps
// the ligature's letters unspaced and lets the other characters carry the
// run's spacing, so the line after it still lands near where the engine
// set it. The letters stay in one run: a run boundary inside them makes
// LibreOffice draw the ligature and the second letter again.

import type { FaceAdvances } from './metrics.js';
import type { RunPiece } from './runs.js';

/** Pairs a face may set as one ligature (where no run boundary goes). */
export const LIGATURE = /^(?:f\p{L}|Th)$/u;

/** Below this size, points, a ligature is not worth a run of its own:
 *  body text keeps its spacing spread over every character. */
export const LIGATURE_MIN_PT = 14;

function u16(t: Uint8Array, at: number): number {
  return at + 1 < t.length ? (t[at]! << 8) | t[at + 1]! : 0;
}

function u32(t: Uint8Array, at: number): number {
  return at + 3 < t.length ? ((t[at]! << 24) >>> 0) + (t[at + 1]! << 16) + (t[at + 2]! << 8) + t[at + 3]! : 0;
}

/** Glyphs of a coverage table, in coverage index order. */
function coverage(t: Uint8Array, at: number): number[] {
  const out: number[] = [];
  const format = u16(t, at);
  const count = u16(t, at + 2);
  for (let i = 0; i < count; i++) {
    if (format === 1) out.push(u16(t, at + 4 + i * 2));
    else if (format === 2) {
      const r = at + 4 + i * 6;
      for (let g = u16(t, r); g <= u16(t, r + 2); g++) out[u16(t, r + 4) + g - u16(t, r)] = g;
    }
  }
  return out;
}

interface Ligature {
  /** Glyphs after the first. */
  rest: number[];
  glyph: number;
}

/** A ligature substitution subtable (lookup type 4) into `out`. */
function ligatureSubst(t: Uint8Array, at: number, out: Map<number, Ligature[]>): void {
  if (u16(t, at) !== 1) return;
  const sets = u16(t, at + 4);
  coverage(t, at + u16(t, at + 2)).forEach((first, i) => {
    if (first === undefined || i >= sets) return;
    const set = at + u16(t, at + 6 + i * 2);
    for (let k = 0; k < u16(t, set); k++) {
      const lig = set + u16(t, set + 2 + k * 2);
      const n = u16(t, lig + 2);
      const rest = Array.from({ length: Math.max(0, n - 1) }, (_, c) => u16(t, lig + 4 + c * 2));
      out.set(first, [...(out.get(first) ?? []), { rest, glyph: u16(t, lig) }]);
    }
  });
}

/** The ligatures of a GSUB table's `liga` features, by first glyph. */
function ligaLigatures(gsub: Uint8Array): Map<number, Ligature[]> {
  const out = new Map<number, Ligature[]>();
  if (gsub.length < 10) return out;
  const features = u16(gsub, 6);
  const lookups = u16(gsub, 8);
  const wanted = new Set<number>();
  for (let i = 0; i < u16(gsub, features); i++) {
    const rec = features + 2 + i * 6;
    if (String.fromCharCode(...gsub.subarray(rec, rec + 4)) !== 'liga') continue;
    const feature = features + u16(gsub, rec + 4);
    for (let k = 0; k < u16(gsub, feature + 2); k++) wanted.add(u16(gsub, feature + 4 + k * 2));
  }
  for (const li of [...wanted].sort((a, b) => a - b)) {
    if (li >= u16(gsub, lookups)) continue;
    const at = lookups + u16(gsub, lookups + 2 + li * 2);
    for (let i = 0; i < u16(gsub, at + 4); i++) {
      let sub = at + u16(gsub, at + 6 + i * 2);
      let type = u16(gsub, at);
      if (type === 7) {
        type = u16(gsub, sub + 2);
        sub += u32(gsub, sub + 4);
      }
      if (type === 4) ligatureSubst(gsub, sub, out);
    }
  }
  return out;
}

const cache = new WeakMap<FaceAdvances, Map<number, Ligature[]>>();

/** A ligature the face forms in a text: characters `start` to `end` (end
 *  excluded). */
export interface LigatureSpan {
  start: number;
  end: number;
}

/** The ligatures of the face's `liga` feature in `text`, the longest at
 *  each character, as a renderer forms them. */
export function ligatureSpans(face: FaceAdvances | undefined, text: string): LigatureSpan[] {
  if (!face?.gsub) return [];
  let ligs = cache.get(face);
  if (!ligs) cache.set(face, (ligs = ligaLigatures(face.gsub)));
  const glyphs = Array.from(text, (ch) => face.cmap.get(ch.codePointAt(0)!) ?? 0);
  const out: LigatureSpan[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    if (!glyphs[i]) continue;
    const match = (ligs.get(glyphs[i]!) ?? [])
      .filter((l) => l.rest.length > 0 && l.rest.every((g, k) => glyphs[i + 1 + k] === g))
      .sort((a, b) => b.rest.length - a.rest.length)[0];
    if (!match) continue;
    out.push({ start: i, end: i + 1 + match.rest.length });
    i += match.rest.length;
  }
  return out;
}

/** `text` in pieces whose spacing adds up to `fitTw` plus `gapTw` (the
 *  run's fitted spacing and the room after it), none on the letters of a
 *  ligature (`spans`): the fit spread over the other characters, the gap
 *  on the last of them. When every character is in a ligature, the fit is
 *  dropped and a gap, which has nowhere to go, leaves the run to the usual
 *  pieces (undefined). The room a ligature saves over its letters is left
 *  as it is: LibreOffice draws some of them as wide as their letters (an
 *  f and i its kerning already drew together), and making up for what the
 *  face's advances say they save pushed the words after them further off
 *  the engine's places than leaving it. */
export function ligaturePieces(text: string, spans: readonly LigatureSpan[], fitTw: number, gapTw: number, props: (spacing: number) => string): RunPiece[] | undefined {
  const chars = Array.from(text);
  const mask = chars.map((_, i) => spans.some((s) => i >= s.start && i < s.end));
  const carriers = chars.flatMap((_, i) => (mask[i] ? [] : [i]));
  const spacing = chars.map(() => 0);
  if (carriers.length) {
    const each = Math.floor(fitTw / carriers.length);
    const extra = fitTw - each * carriers.length;
    carriers.forEach((i, k) => {
      spacing[i] = each + (k < extra ? 1 : 0);
    });
    spacing[carriers[carriers.length - 1]!]! += gapTw;
  } else if (gapTw) {
    return undefined;
  }
  // Characters of equal spacing join one piece; a ligature's letters, all
  // unspaced, always fall in the same one.
  const out: RunPiece[] = [];
  let from = 0;
  for (let i = 1; i <= chars.length; i++) {
    if (i < chars.length && spacing[i] === spacing[from]) continue;
    out.push({ rPr: props(spacing[from]!), text: chars.slice(from, i).join('') });
    from = i;
  }
  return out;
}
