// Helpers of the IDML import: units, the look of a style, and the small
// text and colour functions the converter shares.

import type { DesignElement, Dimension } from '../../types.js';
import { cleanText, collapseSpaces } from './markdown.js';
import { isItalic, weightOf, type Attrs, type IdmlPara } from './read.js';

export const pt = (v: number): Dimension => ({ value: Math.round(v * 100) / 100, unit: 'pt' });
export const mm = (v: number): Dimension => ({ value: Math.round((v / 72) * 25.4 * 10) / 10, unit: 'mm' });
export const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export const WEB_FORMATS: Record<string, { format: 'png' | 'jpeg' | 'webp' | 'gif'; mime: string }> = {
  png: { format: 'png', mime: 'image/png' },
  jpg: { format: 'jpeg', mime: 'image/jpeg' },
  jpeg: { format: 'jpeg', mime: 'image/jpeg' },
  webp: { format: 'webp', mime: 'image/webp' },
  gif: { format: 'gif', mime: 'image/gif' },
};

export const ALIGN: Record<string, 'left' | 'right' | 'center' | 'justify'> = {
  LeftAlign: 'left',
  RightAlign: 'right',
  CenterAlign: 'center',
  LeftJustified: 'justify',
  RightJustified: 'justify',
  CenterJustified: 'justify',
  FullyJustified: 'justify',
  ToBindingSide: 'left',
  AwayFromBindingSide: 'right',
};

/** The look a style or a run sets, in points. */
export interface Look {
  font?: string;
  weight?: number;
  italic?: boolean;
  size?: number;
  leading?: number;
  color?: string;
  align?: 'left' | 'right' | 'center' | 'justify';
  firstIndent?: number;
  leftIndent?: number;
  rightIndent?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  hyphenate?: boolean;
  smallCaps?: boolean;
  allCaps?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export function lookOf(a: Attrs): Look {
  const size = num(a.PointSize);
  const leading = a.Leading === 'Auto' || a.Leading === undefined ? (size !== undefined ? (size * (num(a.AutoLeading) ?? 120)) / 100 : undefined) : num(a.Leading);
  return {
    font: a.AppliedFont?.split('\t')[0] || undefined,
    weight: a.FontStyle !== undefined ? weightOf(a.FontStyle) : undefined,
    italic: a.FontStyle !== undefined ? isItalic(a) : undefined,
    size,
    leading,
    color: a.FillColor,
    align: a.Justification ? ALIGN[a.Justification] : undefined,
    firstIndent: num(a.FirstLineIndent),
    leftIndent: num(a.LeftIndent),
    rightIndent: num(a.RightIndent),
    spaceBefore: num(a.SpaceBefore),
    spaceAfter: num(a.SpaceAfter),
    hyphenate: a.Hyphenation !== undefined ? a.Hyphenation === 'true' : undefined,
    smallCaps: a.Capitalization === 'SmallCaps' || a.Capitalization === 'CapToSmallCap' ? true : undefined,
    allCaps: a.Capitalization === 'AllCaps' ? true : undefined,
    underline: a.Underline === 'true' ? true : undefined,
    strike: a.StrikeThru === 'true' ? true : undefined,
  };
}


/** A running head's text with its chapter's title (or the start of it,
 *  cut with an ellipsis) and number as placeholders. */
export function generalise(text: string, title: string, n: number): string {
  let out = text;
  const t = title.replace(/[{}]/g, (c) => c + c);
  if (t && out.includes(t)) out = out.replace(t, '{chapterTitle}');
  else {
    // The longest run of words before the ellipsis the title starts with.
    const end = out.indexOf('…');
    for (let i = 0; i < end; i++) {
      if (i > 0 && out[i - 1] !== ' ') continue;
      const piece = out.slice(i, end).trimEnd();
      if (piece.length >= 8 && t.startsWith(piece)) {
        out = `${out.slice(0, i)}{chapterTitle}${out.slice(end + 1)}`;
        break;
      }
    }
  }
  return out.replace(new RegExp(`(?<![\\d{])${n}(?![\\d}])`), '{chapterNumber}');
}

/** An element the verso and the recto print alike, at one place, as one
 *  element on every page. */
export function mergeSides(elements: DesignElement[]): DesignElement[] {
  const key = (e: DesignElement) => JSON.stringify({ ...e, id: '', parity: '' });
  const out: DesignElement[] = [];
  for (const e of elements) {
    const twin = out.find((o) => o.parity !== e.parity && o.parity !== 'all' && e.parity !== 'all' && key(o) === key(e));
    if (twin) twin.parity = 'all';
    else out.push(e);
  }
  return out;
}

/** A design text template from a paragraph: the page number and the
 *  section marker as placeholders, braces doubled. */
export function templateOf(p: IdmlPara): string {
  return collapseSpaces(
    p.items
      .map((i) => {
        switch (i.t) {
          case 'text':
            return cleanText(i.text).replace(/[{}]/g, (c) => c + c).replace(/[\t\u2028]/g, ' ');
          case 'pageNumber':
            return '{pageNumber}';
          case 'section':
            return '{chapterTitle}';
          case 'variable':
            if (/MatchParagraphStyle|MatchCharacterStyle|RunningHead/i.test(i.kind)) return '{chapterTitle}';
            if (/ChapterNumber/i.test(i.kind)) return '{chapterNumber}';
            if (/LastPageNumber|PageCount/i.test(i.kind)) return '{totalPages}';
            return i.text.replace(/[{}]/g, (c) => c + c);
          default:
            return '';
        }
      })
      .join(''),
  );
}

export function toRgb(space: string, v: number[]): [number, number, number] | undefined {
  if (space === 'CMYK' && v.length === 4) {
    const [c, m, y, k] = v.map((x) => x / 100) as [number, number, number, number];
    return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)].map((x) => Math.max(0, Math.min(255, Math.round(x)))) as [number, number, number];
  }
  if (space === 'RGB' && v.length === 3) return v.map((x) => Math.max(0, Math.min(255, Math.round(x)))) as [number, number, number];
  if (space === 'LAB' && v.length === 3) {
    // CIE L*a*b* (D50, as InDesign keeps it) to sRGB.
    const [L, A, B] = v as [number, number, number];
    const fy = (L + 16) / 116;
    const fx = fy + A / 500;
    const fz = fy - B / 200;
    const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const X = 0.9642 * f(fx);
    const Y = 1 * f(fy);
    const Z = 0.8251 * f(fz);
    const lin = [3.1339 * X - 1.6169 * Y - 0.4906 * Z, -0.9785 * X + 1.9160 * Y + 0.0334 * Z, 0.0720 * X - 0.2290 * Y + 1.4057 * Z];
    return lin.map((c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))) as [number, number, number];
  }
  return undefined;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;

export const REGULAR = /^(regular|roman|book|normal|plain|\$ID\/Regular)$/i;

/** Emphasis marks paired again after a label went: `Una tabla**` → `Una
 *  tabla`. */
export function balanceMarks(s: string): string {
  let out = s;
  for (const mark of ['**', '*']) {
    const count = (t: string) => (t.match(mark === '**' ? /(?<!\\)\*\*/g : /(?<![\\*])\*(?!\*)/g) ?? []).length;
    if (count(out) % 2 === 1) out = out.endsWith(mark) ? out.slice(0, -mark.length).trimEnd() : out.startsWith(mark) ? out.slice(mark.length).trimStart() : out;
  }
  return out;
}

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An object without its undefined fields. */
export function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
