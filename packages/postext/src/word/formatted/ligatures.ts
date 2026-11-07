// Ligatures in fitted runs (#1444). A run spaced out to the engine's
// width carries `w:spacing`, and neither LibreOffice nor Word forms a
// ligature in a letter-spaced run: a cover title set in Cormorant lost its
// Th. At display sizes the ligature shows, so a run holding a pair keeps
// the pair unspaced and lets the other characters carry the run's spacing
// (the line after it still lands where the engine set it). The pair stays
// in one run: a run boundary inside it makes LibreOffice draw the ligature
// and the second letter again.

import type { RunPiece } from './runs.js';

/** Pairs a face may set as one ligature. */
export const LIGATURE = /^(?:f\p{L}|Th)$/u;

/** Below this size, points, a ligature is not worth a run of its own:
 *  body text keeps its spacing spread over every character. */
export const LIGATURE_MIN_PT = 14;

/** Which characters belong to a ligature pair. */
function pairMask(chars: readonly string[]): boolean[] {
  const mask = chars.map(() => false);
  for (let k = 1; k < chars.length; k++) {
    if (!mask[k - 1] && LIGATURE.test(chars[k - 1]! + chars[k]!)) {
      mask[k - 1] = true;
      mask[k] = true;
    }
  }
  return mask;
}

/** Whether `text` holds a ligature pair. */
export function hasLigature(text: string): boolean {
  return pairMask(Array.from(text)).some(Boolean);
}

/** `text` in pieces whose spacing adds up to `fitTw` plus `gapTw` (the
 *  run's fitted spacing and the room after it), none on a ligature pair:
 *  the fit spread over the other characters, the gap on the last of them.
 *  When every character is in a pair, the fit is dropped (the ligature
 *  is narrower than its letters, which is what the fit made up for) and a
 *  gap, which has nowhere to go, leaves the run to the usual pieces
 *  (undefined). */
export function ligaturePieces(text: string, fitTw: number, gapTw: number, props: (spacing: number) => string): RunPiece[] | undefined {
  const chars = Array.from(text);
  const mask = pairMask(chars);
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
  // Characters of equal spacing join one piece; a pair's two letters, both
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
