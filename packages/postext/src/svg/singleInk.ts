// Single-ink recolouring of SVG markup (diagramStyle.singleInk).
//
// Maps every colour literal in an SVG to a tint of one ink so the figure
// reproduces faithfully when printed with a single spot colour. The mapping
// preserves perceived value: a colour's relative luminance picks the tint
// strength (white → paper, black → full ink), so light fills stay light and
// dark strokes/text stay dark regardless of their original hue.
//
// Operates on the markup as text (DOM-free): hex literals and rgb()/rgba()
// functions are rewritten wherever they appear — presentation attributes,
// inline `style`, gradients, `<defs>`. `none`, `transparent`, and
// `currentColor` are left untouched; alpha channels are preserved.

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

/** Relative luminance in [0, 1] (Rec. 709 coefficients on gamma-encoded
 *  channels — a perceptual approximation that is plenty for tint mapping). */
function luminance(c: Rgb): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/** Mix `ink` over white at the strength implied by the source colour's
 *  darkness: white maps to white, black maps to the full ink. */
function tint(source: Rgb, ink: Rgb): Rgb {
  const strength = 1 - luminance(source);
  return {
    r: Math.round(255 + (ink.r - 255) * strength),
    g: Math.round(255 + (ink.g - 255) * strength),
    b: Math.round(255 + (ink.b - 255) * strength),
  };
}

function toHex(c: Rgb): string {
  const ch = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)/g;

/**
 * Recolour an SVG document to tints of a single ink.
 *
 * @param svgText The SVG markup.
 * @param inkHex  The ink colour as a hex string (e.g. `'#295AA3'`).
 * @returns The recoloured markup; returns the input unchanged when `inkHex`
 *          cannot be parsed.
 */
export function applySingleInkToSvg(svgText: string, inkHex: string): string {
  const ink = parseHex(inkHex);
  if (!ink) return svgText;

  return svgText
    .replace(HEX_RE, (match, digits: string) => {
      const rgb = parseHex(digits);
      if (!rgb) return match;
      // Preserve a trailing alpha nibble/byte (#rgba / #rrggbbaa).
      const alpha = digits.length === 4 ? digits[3]! + digits[3]! : digits.length === 8 ? digits.slice(6) : '';
      return toHex(tint(rgb, ink)) + alpha;
    })
    .replace(RGB_RE, (match, r: string, g: string, b: string, a: string | undefined) => {
      const rgb: Rgb = { r: Number(r), g: Number(g), b: Number(b) };
      if (rgb.r > 255 || rgb.g > 255 || rgb.b > 255) return match;
      const t = tint(rgb, ink);
      return a !== undefined ? `rgba(${t.r}, ${t.g}, ${t.b}, ${a})` : `rgb(${t.r}, ${t.g}, ${t.b})`;
    })
    // Keyword colours only where they appear as a paint value (attribute or
    // inline-style property) — never inside text content or labels.
    .replace(
      /(fill|stroke|stop-color|flood-color|color)(="|:\s*)(white|black)\b/g,
      (_m, prop: string, sep: string, kw: string) => `${prop}${sep}${kw === 'black' ? toHex(ink) : '#ffffff'}`,
    );
}
