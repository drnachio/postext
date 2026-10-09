import type { VDTDocument } from '../vdt';
import { quoteFamily } from '../measure/font';
import type { FontPayload } from './protocol';

/** The `FontFace` descriptors of a payload; a numeric weight (`700`) is
 *  accepted as well as the CSS string (`'700'`, `'bold'`). */
export function fontFaceDescriptors(face: Pick<FontPayload, 'style' | 'unicodeRange'> & { weight: string | number }): FontFaceDescriptors {
  return { weight: String(face.weight), style: face.style, unicodeRange: face.unicodeRange };
}

/** The family of a canvas font shorthand (`italic 700 12.5px "Optima 105"`
 *  → `Optima 105`). */
function familyOf(fontString: string): string | null {
  const m = /\d(?:\.\d+)?px\s+(.+)$/.exec(fontString.trim());
  if (!m) return null;
  const family = m[1]!.trim();
  return /^(["']).*\1$/.test(family) ? family.slice(1, -1).replace(/\\"/g, '"') : family;
}

/** The font families the text of a laid-out document is set in (blocks,
 *  their segments and drop caps, the header, footer and opener designs,
 *  the line numbers, and the
 *  lettering of comic pages). */
export function documentFontFamilies(doc: VDTDocument): string[] {
  const families = new Set<string>();
  const add = (fontString: string | undefined) => {
    const family = fontString ? familyOf(fontString) : null;
    if (family) families.add(family);
  };
  for (const block of doc.blocks) {
    if (block.lines.length === 0) continue;
    add(block.fontString);
    for (const line of block.lines) for (const seg of line.segments ?? []) add(seg.fontString);
    // A drop cap's face (#623), and its hung mark's.
    add(block.dropCap?.fontString);
    add(block.dropCap?.hang?.fontString);
  }
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand, page.lineNumbers]) {
      for (const el of slot?.blocks ?? []) if (el.kind === 'text') add(el.fontString);
    }
    // The lettering of a comic page: balloons, captions, sound effects.
    for (const balloon of page.comic?.balloons ?? []) {
      for (const el of balloon.text) {
        add(el.fontString);
        for (const line of el.lines) for (const run of line.runs ?? []) add(run.fontString);
      }
    }
  }
  return [...families];
}

const PROBE = 'mmmmmmmmmmlliWWQq@#0123';
const GENERICS = ['monospace', 'serif', 'sans-serif'];

/**
 * The families no font answers for — neither registered nor installed — so
 * their text was measured with a generic fallback. A family is there when
 * naming it in front of a generic family changes the width of a probe
 * string for at least one of three generics.
 */
export function unavailableFontFamilies(
  families: string[],
  measureWidth: (font: string, text: string) => number,
): string[] {
  return families.filter((family) => GENERICS.every((generic) =>
    measureWidth(`72px ${quoteFamily(family)}, ${generic}`, PROBE) === measureWidth(`72px ${generic}`, PROBE)));
}
