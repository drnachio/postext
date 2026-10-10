// The faces a laid-out document set its text in, and which of them the
// font set could not give (#629): a family no face answers for, or a weight
// or slant the browser makes up from another face (bold drawn heavier,
// italic slanted). Shared by the main thread and the layout worker.

import type { VDTDocument, VDTLine } from '../vdt';
import { quoteFamily } from '../measure/font';
import { measureTextWidth } from '../measure/canvas';
import { parseFontString, type FontFaceRequest } from '../measure/fontString';

export type { FontFaceRequest } from '../measure/fontString';

/** The part of a `FontFace` the engine reads. */
export interface FontFaceLike {
  family: string;
  /** `'400'`, `'bold'`, or a variable range `'100 900'`. */
  weight: string;
  /** `'normal'`, `'italic'` or `'oblique …'`. */
  style: string;
  status: 'unloaded' | 'loading' | 'loaded' | 'error' | string;
  unicodeRange?: string;
  load?(): Promise<FontFaceLike>;
}

/** The part of a `FontFaceSet` (`document.fonts`, a worker's `self.fonts`)
 *  the engine uses. Tests pass a fake. */
export interface FontFaceSetLike extends Iterable<FontFaceLike> {
  readonly size?: number;
  load(font: string, text?: string): Promise<FontFaceLike[]>;
  add(face: FontFaceLike): unknown;
  addEventListener?(type: 'loadingdone', listener: (event: { fontfaces?: readonly FontFaceLike[] }) => void): void;
  removeEventListener?(type: 'loadingdone', listener: (event: { fontfaces?: readonly FontFaceLike[] }) => void): void;
}

/** The page's font set (`document.fonts`), a worker's (`self.fonts`), or
 *  undefined where there is none (Node). */
export function defaultFontSet(): FontFaceSetLike | undefined {
  const g = globalThis as { document?: { fonts?: FontFaceSetLike }; fonts?: FontFaceSetLike };
  return g.document?.fonts ?? g.fonts;
}

/** CSS generic families: always there, never reported. */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system',
]);

export function isGenericFamily(family: string): boolean {
  return GENERIC_FAMILIES.has(family.trim().toLowerCase());
}

/** A face of the font set, read once. */
export interface IndexedFace {
  weight: [number, number];
  style: 'normal' | 'italic';
  status: string;
}

function unquote(family: string): string {
  const f = family.trim();
  return /^(["']).*\1$/.test(f) ? f.slice(1, -1) : f;
}

function weightRange(weight: string | undefined): [number, number] {
  const parts = (weight ?? '400').trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The faces of `fontSet`, by family (lower case); only the families in
 *  `families` when given. */
export function indexFontSet(fontSet: Iterable<FontFaceLike>, families?: ReadonlySet<string>): Map<string, IndexedFace[]> {
  const out = new Map<string, IndexedFace[]>();
  for (const face of fontSet) {
    const family = unquote(face.family).toLowerCase();
    if (families && !families.has(family)) continue;
    let list = out.get(family);
    if (!list) out.set(family, (list = []));
    list.push({ weight: weightRange(face.weight), style: /italic|oblique/i.test(face.style ?? '') ? 'italic' : 'normal', status: face.status });
  }
  return out;
}

function distance(range: [number, number], target: number): number {
  return target < range[0] ? range[0] - target : target > range[1] ? target - range[1] : 0;
}

/** The weight CSS font matching settles on among `faces` for `target`
 *  (CSS Fonts 4, §5.2): between 400 and 500 the weights up to 500 first,
 *  then lighter, then heavier; below 400 lighter first; above 500 heavier
 *  first. */
function matchWeight(faces: readonly IndexedFace[], target: number): IndexedFace | undefined {
  const exact = faces.find((f) => distance(f.weight, target) === 0);
  if (exact) return exact;
  const lighter = faces.filter((f) => f.weight[1] < target).sort((a, b) => b.weight[1] - a.weight[1]);
  const heavier = faces.filter((f) => f.weight[0] > target).sort((a, b) => a.weight[0] - b.weight[0]);
  if (target >= 400 && target <= 500) {
    const upTo500 = heavier.filter((f) => f.weight[0] <= 500);
    return upTo500[0] ?? lighter[0] ?? heavier[0];
  }
  return target < 400 ? lighter[0] ?? heavier[0] : heavier[0] ?? lighter[0];
}

/** How `faces` (loaded ones) answer for a weight and slant: the face CSS
 *  matching picks, and whether the browser draws it bolder or slanted
 *  (a bold of 600 or more set from a face of 500 or less; an italic set
 *  from an upright face). Undefined when `faces` is empty. */
export function matchFace(faces: readonly IndexedFace[], weight: number, style: 'normal' | 'italic'): { face: IndexedFace; synthesized: boolean } | undefined {
  if (faces.length === 0) return undefined;
  const sameStyle = faces.filter((f) => f.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : faces;
  const face = matchWeight(pool, weight)!;
  const syntheticBold = weight >= 600 && face.weight[1] <= 500;
  const syntheticItalic = style === 'italic' && face.style !== 'italic';
  return { face, synthesized: syntheticBold || syntheticItalic };
}

/** A key per face request. */
export function faceRequestKey(f: FontFaceRequest): string {
  return `${f.family.toLowerCase()}|${f.weight}|${f.style}`;
}

/** The faces of a group of lines, as the renderers pick them: a segment's
 *  own font, else the variant of its bold and italic flags. */
function addLines(lines: readonly VDTLine[] | undefined, normal: string | undefined, bold: string | undefined, italic: string | undefined, boldItalic: string | undefined, add: (font: string | undefined) => void): void {
  if (!lines || lines.length === 0) return;
  for (const line of lines) {
    const segments = line.segments;
    if (!segments || segments.length === 0) {
      add(normal);
      continue;
    }
    for (const seg of segments) {
      add(seg.fontString ?? (seg.bold ? (seg.italic ? boldItalic ?? bold ?? italic ?? normal : bold ?? normal) : seg.italic ? italic ?? normal : normal));
      // Annotations set in faces of their own (ruby, warichu, kunten, chips).
      if (seg.ruby !== undefined) walkFonts(seg.ruby, add);
      if (seg.warichu !== undefined) walkFonts(seg.warichu, add);
      if (seg.kunten !== undefined) walkFonts(seg.kunten, add);
      if (seg.chip !== undefined) walkFonts(seg.chip, add);
    }
  }
}

/** Keys whose object holds no font of its own (geometry, raw data,
 *  pictures), skipped by the walk. */
const SKIP_KEYS = new Set(['sourceMap', 'attrSources', 'bbox', 'rect', 'resource', 'config', 'svg', 'mathRender', 'math', 'path', 'paths', 'columns', 'floats', 'palette']);

/** Every `fontString`, `bulletFontString`, `separatorFontString`… under
 *  `node` (the variant sets `boldFontString`, `italicFontString`… are
 *  what a renderer may pick, not what was set: lines say which). */
function walkFonts(node: unknown, add: (font: string | undefined) => void, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    // Arrays of numbers (source maps, break lists) hold no font.
    if (node.length > 0 && (node[0] === null || typeof node[0] !== 'object')) return;
    for (const item of node) walkFonts(item, add, depth + 1);
    return;
  }
  const rec = node as Record<string, unknown>;
  for (const key in rec) {
    const value = rec[key];
    if (typeof value === 'string') {
      if (key === 'fontString' || ((key.endsWith('FontString')) && !/(?:bold|italic|Bold|Italic)FontString$/.test(key))) add(value);
    } else if (value && typeof value === 'object' && !SKIP_KEYS.has(key)) {
      walkFonts(value, add, depth + 1);
    }
  }
}

/** The faces (family, weight, slant) the text of a laid-out document is
 *  set in: its blocks' lines and segments, list markers, drop caps,
 *  captions, notes and table cells, running heads, folios and design
 *  texts, line numbers and the lettering of comic pages. */
export function documentFontFaces(doc: VDTDocument): FontFaceRequest[] {
  const fonts = new Set<string>();
  let last: string | undefined;
  const add = (font: string | undefined): void => {
    if (font === last || !font) return;
    last = font;
    fonts.add(font);
  };
  // The blocks of the flow, and floats a page holds outside it.
  const blocks = new Set(doc.blocks);
  for (const page of doc.pages) for (const b of page.floats ?? []) blocks.add(b);
  for (const block of blocks) {
    addLines(block.lines, block.fontString, block.boldFontString, block.italicFontString, block.boldItalicFontString, add);
    const rb = block.resourceBlock;
    if (rb) {
      addLines(rb.captionLines, rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString, add);
      addLines(rb.noteLines, rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString, add);
      const t = rb.table;
      if (t) {
        for (const cell of t.cells) {
          if (cell.isHeader) addLines(cell.lines, t.headerFontString, t.headerBoldFontString, t.headerItalicFontString, t.headerBoldItalicFontString, add);
          else addLines(cell.lines, t.fontString, t.boldFontString, t.italicFontString, t.boldItalicFontString, add);
        }
      }
      walkFonts(rb, add);
    }
    // Markers, drop caps, heading designs and whatever else the block
    // sets beside its lines (its own `fontString` only when it has lines).
    for (const key in block) {
      if (key === 'fontString' || key === 'lines' || key === 'resourceBlock' || SKIP_KEYS.has(key)) continue;
      const value = (block as unknown as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        if (key.endsWith('FontString') && !/(?:bold|italic|Bold|Italic)FontString$/.test(key) && block.lines.length > 0) add(value);
      } else if (value && typeof value === 'object') {
        walkFonts(value, add);
      }
    }
  }
  // Running heads, folios, opener bands, line numbers, comic lettering.
  for (const page of doc.pages) walkFonts(page, add);
  const out = new Map<string, FontFaceRequest>();
  for (const font of fonts) {
    const face = parseFontString(font);
    if (!face || isGenericFamily(face.family)) continue;
    const key = faceRequestKey(face);
    if (!out.has(key)) out.set(key, face);
  }
  return [...out.values()];
}

/** The font families the text of a laid-out document is set in. */
export function documentFontFamilies(doc: VDTDocument): string[] {
  return [...new Set(documentFontFaces(doc).map((f) => f.family))];
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

/** Why a face fell back: no face of the family answered (`missing`), or
 *  the browser drew the weight or slant from another face
 *  (`synthesized`). */
export type FontFallbackReason = 'missing' | 'synthesized';

export interface FontFallback extends FontFaceRequest {
  reason: FontFallbackReason;
}

export interface FontFallbackOptions {
  /** Width of `text` in `font`, for the probe that tells an installed
   *  family from a missing one. Default: the engine's measuring canvas,
   *  when there is one. Null: no probe (a family with no face in the set
   *  is missing). */
  measureWidth?: ((font: string, text: string) => number) | null;
}

function canMeasure(): boolean {
  const g = globalThis as { OffscreenCanvas?: unknown; document?: { createElement?: unknown } };
  return typeof g.OffscreenCanvas !== 'undefined' || typeof g.document?.createElement === 'function';
}

/** Whether an installed family answered the probe, per family (lower
 *  case); reset when the font set changes (`fontSetChanged`). */
const installed = new Map<string, boolean>();

/** Forget the probe's answers (the faces changed). */
export function forgetInstalledFamilies(): void {
  installed.clear();
}

/**
 * The faces of `faces` that `fontSet` could not give: a family with no
 * loaded face (and not installed, by the width probe) is `missing`; a
 * weight or slant matched by a face the browser has to draw bolder or
 * slanted is `synthesized`. Generic families are never reported.
 */
export function fontFallbacks(faces: readonly FontFaceRequest[], fontSet: Iterable<FontFaceLike>, options?: FontFallbackOptions): FontFallback[] {
  const wanted = faces.filter((f) => !isGenericFamily(f.family));
  if (wanted.length === 0) return [];
  const index = indexFontSet(fontSet, new Set(wanted.map((f) => f.family.toLowerCase())));
  const measure = options?.measureWidth === undefined ? (canMeasure() ? (font: string, text: string) => measureTextWidth(text, font) : null) : options.measureWidth;
  const out: FontFallback[] = [];
  for (const f of wanted) {
    const lower = f.family.toLowerCase();
    const declared = index.get(lower) ?? [];
    const loaded = declared.filter((d) => d.status === 'loaded');
    if (loaded.length === 0) {
      // A family nobody declared may be installed on the system.
      if (declared.length === 0 && measure) {
        let there = installed.get(lower);
        if (there === undefined) {
          there = unavailableFontFamilies([f.family], measure).length === 0;
          installed.set(lower, there);
        }
        if (there) continue;
      }
      out.push({ ...f, reason: 'missing' });
      continue;
    }
    if (matchFace(loaded, f.weight, f.style)?.synthesized) out.push({ ...f, reason: 'synthesized' });
  }
  return out;
}
