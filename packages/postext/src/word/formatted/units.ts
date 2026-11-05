// Units and colours of the formatted Word export (#1392). Display list
// geometry is px at `config.page.dpi`; Word wants twips (page size,
// indents, line pitch), EMU (DrawingML positions), half-points (font
// sizes) and eighths of a point (table borders).

export const twips = (px: number, dpi: number): number => Math.round((px * 1440) / dpi);
export const emu = (px: number, dpi: number): number => Math.round((px * 914400) / dpi);
/** Unrounded half-points (callers round and check the error). */
export const halfPoints = (px: number, dpi: number): number => (px * 144) / dpi;
export const eighths = (px: number, dpi: number): number => Math.round((px * 576) / dpi);
export const twipsToPx = (tw: number, dpi: number): number => (tw * dpi) / 1440;
/** DrawingML angle: 60000ths of a degree, clockwise. */
export const angle = (deg: number): number => Math.round(deg * 60000);

const NAMED: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', gray: '808080', grey: '808080' };

export interface WordColor {
  /** `RRGGBB`. */
  hex: string;
  /** 0..1. */
  alpha: number;
}

const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();

/** A CSS colour (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, a few
 *  names) as Word's hex and an alpha; undefined for `transparent`, `none`
 *  and anything unreadable. */
export function wordColor(css: string | undefined): WordColor | undefined {
  if (!css) return undefined;
  const c = css.trim().toLowerCase();
  if (c === 'transparent' || c === 'none' || c === '') return undefined;
  if (NAMED[c]) return { hex: NAMED[c]!, alpha: 1 };
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (m) return { hex: m[1]!.toUpperCase(), alpha: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(c);
  if (m) return { hex: `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase(), alpha: m[4] ? parseInt(m[4] + m[4], 16) / 255 : 1 };
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(c);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return { hex: hex2(Number(m[1])) + hex2(Number(m[2])) + hex2(Number(m[3])), alpha: Math.max(0, Math.min(1, a)) };
  }
  return undefined;
}

/** `RRGGBB` for run colours (Word has no alpha on text): unreadable → black. */
export function textColorHex(css: string | undefined): string {
  return wordColor(css)?.hex ?? '000000';
}

/** A DrawingML fill: `a:solidFill` (with alpha) or `a:noFill`. */
export function solidFill(css: string | undefined): string {
  const c = wordColor(css);
  if (!c || c.alpha <= 0) return '<a:noFill/>';
  const alpha = c.alpha < 1 ? `<a:alpha val="${Math.round(c.alpha * 100000)}"/>` : '';
  return `<a:solidFill><a:srgbClr val="${c.hex}">${alpha}</a:srgbClr></a:solidFill>`;
}
