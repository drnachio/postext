/**
 * What each finish of a special ink means (#1563), with no other module of
 * the colour code behind it: the normalised spot colours
 * (`normalizeSpotColor`), the ink table (`resolvePrintInks`) and the
 * screen painters all read a finish through here.
 */

import type { InkFinish, InkFinishKind, InkSheen } from '../types.js';

const FINISH_KINDS: readonly InkFinishKind[] = ['metallic', 'foil', 'fluorescent', 'white', 'varnish'];
const SHEENS: readonly InkSheen[] = ['gloss', 'satin', 'matte', 'softTouch'];

/** A finish as written, checked: an unknown kind is dropped (`undefined`),
 *  an unknown sheen left out; a fluorescent or white ink has no sheen, and
 *  soft-touch is a varnish's only. */
export function resolveInkFinish(f: unknown): InkFinish | undefined {
  if (!f || typeof f !== 'object') return undefined;
  const kind = (f as { kind?: unknown }).kind;
  if (!FINISH_KINDS.includes(kind as InkFinishKind)) return undefined;
  const out: InkFinish = { kind: kind as InkFinishKind };
  const sheen = (f as { sheen?: unknown }).sheen;
  if (SHEENS.includes(sheen as InkSheen) && kind !== 'fluorescent' && kind !== 'white') {
    if (sheen !== 'softTouch' || kind === 'varnish') out.sheen = sheen as InkSheen;
  }
  return out;
}

/** The sheen a finish has once its default is filled in: gloss for a
 *  varnish and a foil, satin for a metallic ink; none for a fluorescent or
 *  white ink. */
export function finishSheen(f: InkFinish): InkSheen | undefined {
  if (f.kind === 'fluorescent' || f.kind === 'white') return undefined;
  if (f.sheen) return f.sheen;
  return f.kind === 'metallic' ? 'satin' : 'gloss';
}

/** How much a sheen shines, 0..1: what the finish mask writes in its sheen
 *  channel (gloss 1, satin .7, matte .4, soft-touch .2). */
export function sheenLevel(sheen: InkSheen | undefined): number {
  switch (sheen) {
    case 'gloss': return 1;
    case 'satin': return 0.7;
    case 'matte': return 0.4;
    case 'softTouch': return 0.2;
    default: return 0;
  }
}

/** Whether an ink of this finish overprints when nothing says otherwise:
 *  a white ink and a varnish do (a white lies under the colours, a
 *  varnish over them); every other ink knocks out. */
export function finishOverprintsByDefault(f: InkFinish | undefined): boolean {
  return f?.kind === 'white' || f?.kind === 'varnish';
}

/** Whether a finish puts colour on a screen page: a varnish does not. */
export function finishPaintsOnScreen(f: InkFinish | undefined): boolean {
  return f?.kind !== 'varnish';
}

/** Two finishes the same once their defaults are filled in (both absent
 *  counts as the same). */
export function sameFinish(a: InkFinish | undefined, b: InkFinish | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.kind === b.kind && finishSheen(a) === finishSheen(b);
}
