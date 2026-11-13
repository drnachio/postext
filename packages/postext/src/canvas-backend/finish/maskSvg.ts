/**
 * An SVG picture recoloured for one paint of the finish mask (#1564).
 *
 * The canvas paints a registered SVG as a decoded image, so the mask's
 * paint hook never sees its colours. A host that has the markup recolours
 * it here, once per paint, and hands the decoded result to
 * `renderFinishMask` (`FinishMaskOptions.images`). Each paint of the
 * markup becomes what the mask paints for it: an ink with a finish (named
 * by `icc-named-color` or the element's `data-spot`, or a colour whose hex
 * is a special ink's) its mask colour, any other paint black in the
 * first paint (it knocks the inks under it out) and nothing in the white
 * and varnish paints. `none`,
 * `currentColor`, `inherit` and `url(…)` references are left as they are.
 *
 * `data-spot` counts for the element's own paints; a child that inherits
 * its paint from a marked group is painted by its own colour.
 */

import type { VDTDocument } from '../../vdt.js';
import { finishInks, finishOfInkName, type FinishInk } from '../../color/finishInks.js';
import { finishOverprintsByDefault, finishSheen, sheenLevel } from '../../color/finishKinds.js';
import { scanSvgPaints, splitIccPaint } from '../../svg/spotPaints.js';
import { inkMaskColor, type FinishMaskPass } from './mask.js';
import { parsePaint } from './paint.js';

const rgb = (r: number, g: number, b: number): string => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** What one paint of the mask paints for an ink (none: an ordinary one). */
export function svgMaskPaint(pass: FinishMaskPass, ink: FinishInk | undefined): string {
  // An ordinary paint knocks out the first paint's inks only: the white
  // lies under it and the varnish over it.
  if (!ink) return pass === 'inks' ? '#000000' : 'transparent';
  const t = ink.tint / 100;
  if (ink.kind === 'varnish') return pass === 'varnish' ? rgb(0, 255 * sheenLevel(finishSheen(ink)) * t, 0) : 'transparent';
  if (pass === 'varnish') return 'transparent';
  if (ink.kind === 'white') return pass === 'white' ? rgb(255 * t, 255 * t, 255 * t) : ink.overprint ? 'transparent' : '#000000';
  if (pass === 'inks') return rgb(...inkMaskColor(ink));
  return 'transparent';
}

const KEEP = /^\s*(none|currentcolor|inherit|transparent|url\()/i;

/** SVG markup with its paints recoloured for the `pass` paint of the
 *  finish mask of `doc`'s pages. */
export function finishMaskSvg(svgText: string, doc: Pick<VDTDocument, 'config' | 'printColors'>, pass: FinishMaskPass): string {
  const byHex = finishInks(doc);
  const named = (name: string, tint: number | undefined): FinishInk | undefined => {
    const f = finishOfInkName(doc, name);
    return f ? { ...f, tint: tint ?? 100, name, overprint: finishOverprintsByDefault(f) } : undefined;
  };
  return scanSvgPaints(svgText, {
    paint: (raw, spot) => {
      if (KEEP.test(raw)) return undefined;
      const lead = raw.slice(0, raw.length - raw.trimStart().length);
      let ink: FinishInk | undefined;
      if (raw.toLowerCase().includes('icc-named-color')) {
        const split = splitIccPaint(raw.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"));
        if (split?.ink) ink = named(split.ink.name, split.ink.tint);
      }
      if (!ink && spot) ink = named(spot, undefined);
      if (!ink) {
        const p = parsePaint(raw.trim().split(/\s+/)[0]);
        if (p) ink = byHex.get(p.hex);
      }
      return `${lead}${svgMaskPaint(pass, ink)}`;
    },
  });
}
