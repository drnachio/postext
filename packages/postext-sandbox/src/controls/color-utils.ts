import Color from 'colorjs.io';

export type ColorMode = 'hex' | 'rgb' | 'cmyk' | 'hsl';
export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };
export type HSV = { h: number; s: number; v: number };
export type CMYK = { c: number; m: number; y: number; k: number };

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// --- colorjs.io-based conversions ---

export function hexToRgb(hex: string): RGB {
  const c = new Color(hex);
  const [r, g, b] = c.to('srgb').coords;
  return {
    r: Math.round(clamp((r ?? 0) * 255, 0, 255)),
    g: Math.round(clamp((g ?? 0) * 255, 0, 255)),
    b: Math.round(clamp((b ?? 0) * 255, 0, 255)),
  };
}

export function rgbToHex(rgb: RGB): string {
  const r = clamp(rgb.r, 0, 255).toString(16).padStart(2, '0');
  const g = clamp(rgb.g, 0, 255).toString(16).padStart(2, '0');
  const b = clamp(rgb.b, 0, 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function rgbToHsl(rgb: RGB): HSL {
  const c = new Color('srgb', [rgb.r / 255, rgb.g / 255, rgb.b / 255]);
  const hsl = c.to('hsl');
  const [h, s, l] = hsl.coords;
  return {
    h: Math.round(h ?? 0),
    s: Math.round(clamp(s ?? 0, 0, 100)),
    l: Math.round(clamp(l ?? 0, 0, 100)),
  };
}

export function hslToRgb(hsl: HSL): RGB {
  const c = new Color('hsl', [hsl.h, hsl.s, hsl.l]);
  const [r, g, b] = c.to('srgb').coords;
  return {
    r: Math.round(clamp((r ?? 0) * 255, 0, 255)),
    g: Math.round(clamp((g ?? 0) * 255, 0, 255)),
    b: Math.round(clamp((b ?? 0) * 255, 0, 255)),
  };
}

// --- Manual HSV conversions ---

export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}

export function hsvToRgb(hsv: HSV): RGB {
  const h = hsv.h / 60;
  const s = hsv.s / 100;
  const v = hsv.v / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 1) { r = c; g = x; }
  else if (h >= 1 && h < 2) { r = x; g = c; }
  else if (h >= 2 && h < 3) { g = c; b = x; }
  else if (h >= 3 && h < 4) { g = x; b = c; }
  else if (h >= 4 && h < 5) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex));
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

// --- Manual CMYK conversions ---

export function rgbToCmyk(rgb: RGB): CMYK {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);

  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };

  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function cmykToRgb(cmyk: CMYK): RGB {
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;

  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

// --- Display formatting ---

export function formatColor(hex: string, mode: ColorMode): string {
  switch (mode) {
    case 'hex':
      return hex;
    case 'rgb': {
      const { r, g, b } = hexToRgb(hex);
      return `${r}, ${g}, ${b}`;
    }
    case 'cmyk': {
      const { c, m, y, k } = rgbToCmyk(hexToRgb(hex));
      return `${c}, ${m}, ${y}, ${k}`;
    }
    case 'hsl': {
      const { h, s, l } = rgbToHsl(hexToRgb(hex));
      return `${h}°, ${s}%, ${l}%`;
    }
  }
}
