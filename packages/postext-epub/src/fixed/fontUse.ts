// The faces a page's markup asks for, read from its CSS `font` shorthands
// and `font-family` declarations, so a family with no embedded face is
// reported instead of silently falling back in the reader.

import type { EpubFontFile } from '../types';
import { decodeEntities } from '../shared/xml';

/** A face as CSS names it. */
export interface FontUse {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji', 'fangsong',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'inherit', 'initial', 'unset', 'revert',
]);

const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 700 };

/** The families of a CSS font stack, unquoted, generic families left out. */
export function stackFamilies(stack: string): string[] {
  const out: string[] = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+))\s*(?:,|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stack)) && m[0] !== '') {
    const quoted = m[1] ?? m[2];
    const family = (quoted ?? m[3] ?? '').replace(/\\(.)/g, '$1').trim();
    if (family && (quoted !== undefined || !GENERIC.has(family.toLowerCase()))) out.push(family);
  }
  return out;
}

/** Every face the markup's `style` attributes ask for (`font:` shorthands
 *  give the weight and style; `font-family:` alone counts as regular). */
export function fontUses(html: string): FontUse[] {
  const out: FontUse[] = [];
  for (const attr of html.matchAll(/\sstyle="([^"]*)"/g)) {
    for (const decl of decodeEntities(attr[1]!).split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if (prop === 'font-family') {
        for (const family of stackFamilies(value)) out.push({ family, weight: 400, style: 'normal' });
        continue;
      }
      if (prop !== 'font') continue;
      // [style] [variant] [weight] [stretch] size[/line-height] family-stack
      const size = /(?:^|\s)[\d.]+(?:px|pt|em|rem|%)(?:\/\S+)?\s+/.exec(value);
      if (!size) continue;
      const head = value.slice(0, size.index).toLowerCase().split(/\s+/).filter(Boolean);
      const style = head.includes('italic') || head.includes('oblique') ? 'italic' : 'normal';
      const weightToken = head.find((t) => /^\d{3}$/.test(t) || t in WEIGHT_WORDS);
      const weight = weightToken === undefined ? 400 : WEIGHT_WORDS[weightToken] ?? Number(weightToken);
      for (const family of stackFamilies(value.slice(size.index + size[0].length))) out.push({ family, weight, style });
    }
  }
  return out;
}

/** Whether a face list covers `use`: same family (case-insensitive), same
 *  style, and the weight in the face's range. */
function covers(face: EpubFontFile, use: FontUse): boolean {
  if (face.family.toLowerCase() !== use.family.toLowerCase() || face.style !== use.style) return false;
  const [lo, hi] = String(face.weight).trim().split(/\s+/).map(Number);
  return hi === undefined || Number.isNaN(hi) ? lo === use.weight : use.weight >= lo! && use.weight <= hi;
}

/** The faces among `uses` the embedded fonts do not cover, once each:
 *  a whole family missing is reported once by name; a family with faces
 *  but not this weight or style, by face (readers synthesise it). */
export function missingFaces(uses: Iterable<FontUse>, fonts: readonly EpubFontFile[]): { family: string; weight?: number; style?: string }[] {
  const out: { family: string; weight?: number; style?: string }[] = [];
  const seen = new Set<string>();
  for (const use of uses) {
    const hasFamily = fonts.some((f) => f.family.toLowerCase() === use.family.toLowerCase());
    const key = hasFamily ? `${use.family}\u0000${use.weight}\u0000${use.style}` : use.family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasFamily) out.push({ family: use.family });
    else if (!fonts.some((f) => covers(f, use))) out.push({ family: use.family, weight: use.weight, style: use.style });
  }
  return out;
}
