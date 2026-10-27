// The colours, numerals, page cards, text-line bars and discs the guide's
// page-structure figures share (#1276: split out of guideFigures.ts).
import { arabicDigits, P, bar, text, FS } from '../svgKit.js';
import type { GuideLang } from '../lang.js';

export const NIGHT = '#15171c';
export const GILT = '#d8a21a';
export const VERMILION = '#c0452f';

/** A number as an edition prints it: Arabic-Indic digits in the Arabic one. */
export const num = (lang: GuideLang, n: string | number): string => (lang === 'ar' ? arabicDigits(String(n)) : String(n));

/** A page card. */
export function card(x: number, y: number, w: number, h: number, fill: string = P.paper, stroke: string = P.edgeSoft): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.1" />`;
}

/** Text-line bars filling a column from `top` to `bottom`, the last line of
 *  every `every`-line paragraph ending short. */
export function lines(x: number, top: number, bottom: number, w: number, pitch = 8, color: string = '#c8d3e0', every = 5, h = 3.6): string {
  let out = '';
  let i = 0;
  for (let y = top; y + h <= bottom; y += pitch, i++) {
    const short = i % every === every - 1;
    out += bar(x, y, short ? w * 0.6 : w, color, h);
  }
  return out;
}

/** A numbered disc. */
export function disc(cx: number, cy: number, n: string, fill: string, color = '#ffffff', r = 8.5): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />${text(cx, cy + 3.6, n, { size: FS.small, color, weight: 700 })}`;
}
