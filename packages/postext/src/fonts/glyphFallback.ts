// Characters a face has no glyph for (#1105). When a character the text
// sets in a face is missing from it, the browser (or Skia) quietly takes it
// from the next family of the font list, or from a face the system picks:
// an arrow drawn in a fallback serif beside a sans text face. The build
// reports it as a `glyphFallback` warning per face, naming the characters
// and, when one family of the list has them all, the family that drew
// them.
//
// Whether a face has a character is asked of one of two sources:
//
// - the glyph probe, in a browser or a worker: a face (`Postext Glyph
//   Probe`) whose `cmap` maps all of Unicode to one glyph of an advance no
//   text face has, declared in the font set the engine measures with. A
//   character measured in `"Face", "Postext Glyph Probe"` comes out at the
//   probe's advance exactly when the face lacks it, so the face's `cmap` is
//   read by the browser itself, with the slices (`unicode-range`) it
//   loaded. `installGlyphProbe` declares it (`prepareFonts` and the layout
//   worker do);
// - the `cmap` of the face's files, registered with
//   `registerFontCoverage` (the command line registers every face it
//   loads), where there is no font set to probe.
//
// A face neither source knows of is not checked.

import type { VDTDocument, VDTLine } from '../vdt.js';
import { quoteFamily } from '../measure/font.js';
import { measureTextWidth } from '../measure/canvas.js';
import { fontStringFamilies, parseFontString, type FontFaceRequest } from '../measure/fontString.js';
import { parseUnicodeRange } from '../svg/fontRegistry.js';
import { defaultFontSet, isGenericFamily, faceRequestKey, GLYPH_PROBE_FAMILY, type FontFaceLike, type FontFaceSetLike } from './faces.js';
import { intersectRanges, rangesHave, sfntCodePointRanges, unionRanges, type CodePointRanges } from './cmap.js';
import { minimalFont } from './minimalFont.js';
import { baseFontFamily, isFeatureFamily } from './figureStyle.js';

/** Characters of one face that another face drew. */
export interface GlyphFallback extends FontFaceRequest {
  /** The characters, each once, in the order the text first sets them;
   *  at most {@link GLYPH_FALLBACK_LISTED} of them. */
  characters: string[];
  /** How many characters in all. */
  count: number;
  /** The family of the font list that has every one of them (the next
   *  family after the face, or a generic family such as `serif`), or
   *  undefined when none has them all: a face the system picks draws them. */
  supplier?: string;
}

/** How many characters a warning lists. */
export const GLYPH_FALLBACK_LISTED = 24;

// --- The glyph probe -------------------------------------------------------

/** The family of the glyph probe face. */
export { GLYPH_PROBE_FAMILY };
/** The probe's advance, in em: no text face has a glyph this wide. */
const PROBE_ADVANCE_EM = 7.31;
const PROBE_SIZE_PX = 100;

/** The font sets the probe was declared in. */
const probed = new WeakSet<object>();
let probeBytes: Uint8Array | undefined;

type FontFaceConstructor = new (family: string, source: ArrayBuffer | ArrayBufferView, descriptors?: FontFaceDescriptors) => FontFaceLike;

/**
 * Declare the glyph probe in `fontSet` (by default the one the engine
 * measures with: `document.fonts`, a worker's `self.fonts`), once. Resolves
 * true when it is there. Where there is no `FontFace` (Node) it does
 * nothing and resolves false.
 */
export async function installGlyphProbe(fontSet?: FontFaceSetLike | null, FontFaceCtor?: FontFaceConstructor): Promise<boolean> {
  const set = fontSet === undefined ? defaultFontSet() : fontSet;
  if (!set) return false;
  if (probed.has(set)) return true;
  const Ctor = FontFaceCtor ?? (globalThis as { FontFace?: FontFaceConstructor }).FontFace;
  if (!Ctor) return false;
  probeBytes ??= minimalFont({ family: GLYPH_PROBE_FAMILY, ranges: [[0, 0x10ffff]], advanceEm: PROBE_ADVANCE_EM });
  try {
    const face = new Ctor(GLYPH_PROBE_FAMILY, probeBytes.slice(), { weight: '1 1000', style: 'normal' });
    if (face.load) await face.load();
    if (face.status !== undefined && face.status !== 'loaded') return false;
    set.add(face);
    probed.add(set);
    return true;
  } catch {
    return false;
  }
}

/** Whether the probe is declared in the font set the engine measures with. */
function probeReady(): boolean {
  const set = defaultFontSet();
  return !!set && probed.has(set);
}

function probeFont(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${style === 'italic' ? 'italic ' : ''}${weight} ${PROBE_SIZE_PX}px ${quoteFamily(family)}, ${quoteFamily(GLYPH_PROBE_FAMILY)}`;
}

/** Whether `family` (a generic one too) draws `ch` itself, by the probe. */
function probeHas(family: string, weight: number, style: 'normal' | 'italic', ch: string): boolean {
  const font = isGenericFamily(family)
    ? `${style === 'italic' ? 'italic ' : ''}${weight} ${PROBE_SIZE_PX}px ${family}, ${quoteFamily(GLYPH_PROBE_FAMILY)}`
    : probeFont(family, weight, style);
  return Math.abs(measureTextWidth(ch, font) - PROBE_ADVANCE_EM * PROBE_SIZE_PX) > 0.5;
}

// --- Registered coverage ---------------------------------------------------

interface CoverageEntry {
  family: string;
  weight: [number, number];
  style: 'normal' | 'italic';
  ranges: CodePointRanges;
}

const coverage: CoverageEntry[] = [];

function weightRange(weight: number | string): [number, number] {
  if (typeof weight === 'number') return [weight, weight];
  const parts = weight.trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/**
 * Register what a file of a face covers: its bytes (TrueType or OpenType,
 * whose `cmap` is read) or the code points as intervals, and, for a slice
 * of a family, its `unicode-range`. A face's files add up. Returns false
 * when the bytes could not be read (a WOFF or WOFF2 file: pass the
 * decompressed bytes).
 */
export function registerFontCoverage(
  family: string,
  weight: number | string,
  style: 'normal' | 'italic' | string,
  file: Uint8Array | ArrayBuffer | CodePointRanges,
  unicodeRange?: string,
): boolean {
  const read = Array.isArray(file)
    ? file as CodePointRanges
    : sfntCodePointRanges(file instanceof Uint8Array ? file : new Uint8Array(file as ArrayBuffer));
  if (!read) return false;
  const slice = parseUnicodeRange(unicodeRange);
  const ranges = slice ? intersectRanges(read, slice) : read;
  // A feature family (#1237) covers what its base family's files cover.
  coverage.push({ family: baseFontFamily(family).toLowerCase(), weight: weightRange(weight), style: /italic|oblique/i.test(style) ? 'italic' : 'normal', ranges });
  return true;
}

/** Forget the coverage registered for `families` (all of it without). */
export function forgetFontCoverage(families?: Iterable<string>): void {
  if (!families) {
    coverage.length = 0;
    return;
  }
  // A feature family's files are its base family's, forgotten with it.
  const drop = new Set([...families].filter((f) => !isFeatureFamily(f)).map((f) => f.toLowerCase()));
  for (let i = coverage.length - 1; i >= 0; i--) if (drop.has(coverage[i]!.family)) coverage.splice(i, 1);
}

/** What the registered files of the cut CSS matching settles on for a
 *  face cover: its slant first, the nearest weight. Undefined when no file
 *  of the family is registered. */
function registeredCoverage(family: string, weight: number, style: 'normal' | 'italic'): CodePointRanges | undefined {
  const lower = baseFontFamily(family).toLowerCase();
  const own = coverage.filter((e) => e.family === lower);
  if (own.length === 0) return undefined;
  const sameStyle = own.filter((e) => e.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : own;
  const distance = (e: CoverageEntry) => (weight < e.weight[0] ? e.weight[0] - weight : weight > e.weight[1] ? weight - e.weight[1] : 0);
  const best = Math.min(...pool.map(distance));
  const cut = pool.filter((e) => distance(e) === best);
  // The files of the one cut (its slices), by its weight range.
  const w = cut[0]!.weight;
  return unionRanges(cut.filter((e) => e.weight[0] === w[0] && e.weight[1] === w[1]).map((e) => e.ranges));
}

// --- What the text sets in each face ---------------------------------------

/** A character no face is asked for: spaces, controls, format characters
 *  (joiners, soft hyphens, bidi marks), combining marks and variation
 *  selectors, which go with the letter before them. */
const SKIPPED = /^[\p{Z}\p{Cc}\p{Cf}\p{M}\p{Cs}]$/u;

type Add = (font: string | undefined, text: string | undefined) => void;

function addLines(lines: readonly VDTLine[] | undefined, normal: string | undefined, bold: string | undefined, italic: string | undefined, boldItalic: string | undefined, add: Add): void {
  if (!lines) return;
  for (const line of lines) {
    const segments = line.segments;
    if (!segments || segments.length === 0) {
      add(normal, line.text);
      continue;
    }
    for (const seg of segments) {
      if (seg.kind !== 'text' || seg.leader === 'rule') continue;
      add(seg.fontString ?? (seg.bold ? (seg.italic ? boldItalic ?? bold ?? italic ?? normal : bold ?? normal) : seg.italic ? italic ?? normal : normal), seg.text);
      if (seg.ruby !== undefined) walkTexts(seg.ruby, add);
      if (seg.chip !== undefined) walkTexts(seg.chip, add);
    }
  }
}

const SKIP_KEYS = new Set(['sourceMap', 'attrSources', 'bbox', 'rect', 'resource', 'config', 'svg', 'mathRender', 'math', 'path', 'paths', 'columns', 'floats', 'marginNotes', 'palette']);

/** Every object under `node` with a `fontString` and a `text` (a running
 *  head's, a folio's, a marker's, a chip's). */
function walkTexts(node: unknown, add: Add, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    if (node.length > 0 && (node[0] === null || typeof node[0] !== 'object')) return;
    for (const item of node) walkTexts(item, add, depth + 1);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (typeof rec.fontString === 'string' && typeof rec.text === 'string') add(rec.fontString, rec.text);
  for (const key in rec) {
    const value = rec[key];
    if (value && typeof value === 'object' && !SKIP_KEYS.has(key)) walkTexts(value, add, depth + 1);
  }
}

/** The characters a laid-out document sets in each font shorthand: its
 *  lines (paragraphs, headings, list items, captions, notes, table cells,
 *  figure labels) and the texts the pages set beside them. */
export function documentFontTexts(doc: VDTDocument): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add: Add = (font, text) => {
    if (!font || !text) return;
    let set = out.get(font);
    if (!set) out.set(font, (set = new Set()));
    for (const ch of text) if (!SKIPPED.test(ch)) set.add(ch);
  };
  const blocks = new Set(doc.blocks);
  for (const page of doc.pages) for (const b of [...(page.floats ?? []), ...(page.marginNotes ?? [])]) blocks.add(b);
  for (const block of blocks) {
    addLines(block.lines, block.fontString, block.boldFontString, block.italicFontString, block.boldItalicFontString, add);
    const rb = block.resourceBlock;
    if (rb) {
      addLines(rb.captionLines, rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString, add);
      addLines(rb.noteLines, rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString, add);
      for (const label of rb.labels ?? []) {
        const l = label.layout;
        if (l) addLines(l.lines, l.fontString, l.boldFontString, l.italicFontString, l.boldItalicFontString, add);
      }
      const t = rb.table;
      if (t) {
        for (const cell of t.cells) {
          if (cell.isHeader) addLines(cell.lines, t.headerFontString, t.headerBoldFontString, t.headerItalicFontString, t.headerBoldItalicFontString, add);
          else addLines(cell.lines, t.fontString, t.boldFontString, t.italicFontString, t.boldItalicFontString, add);
        }
      }
    }
  }
  for (const page of doc.pages) walkTexts(page, add);
  return out;
}

// --- The check -------------------------------------------------------------

type HasGlyph = (family: string, weight: number, style: 'normal' | 'italic', ch: string) => boolean | undefined;
type SupplierOf = (face: FontFaceRequest, ch: string) => string | undefined;

export interface GlyphFallbackOptions {
  /** Whether a family (a generic one too) draws a character itself:
   *  true, false, or undefined when it is not known. Default: the glyph
   *  probe where it is declared, else the registered coverage. */
  hasGlyph?: HasGlyph;
  /** The family that drew a character `face` lacks, when the font list
   *  names none that has it. Default, with the probe: the generic family
   *  (`serif`, `sans-serif`, `monospace`) that has the character and
   *  draws it at the width the face's text got. */
  supplierOf?: SupplierOf;
  /** Faces left out (a face the font set could not give at all is
   *  reported as a `fontFallback`, not character by character). */
  skip?: ReadonlySet<string>;
}

const GENERIC_SUPPLIERS = ['serif', 'sans-serif', 'monospace'] as const;

const faceFont = (face: FontFaceRequest, family: string): string =>
  `${face.style === 'italic' ? 'italic ' : ''}${face.weight} ${PROBE_SIZE_PX}px ${family}`;

/** The default sources (see the module comment): the probe where it is
 *  declared, else the registered files; undefined when there is neither. */
function defaultSources(): { hasGlyph: HasGlyph; supplierOf?: SupplierOf } | undefined {
  if (probeReady()) {
    return {
      hasGlyph: probeHas,
      supplierOf: (face, ch) => {
        const own = measureTextWidth(ch, faceFont(face, quoteFamily(face.family)));
        return GENERIC_SUPPLIERS.find((g) => probeHas(g, face.weight, face.style, ch)
          && Math.abs(measureTextWidth(ch, faceFont(face, g)) - own) < 0.01);
      },
    };
  }
  if (coverage.length === 0) return undefined;
  const known = new Map<string, CodePointRanges | null>();
  return {
    hasGlyph: (family, weight, style, ch) => {
      const key = `${family.toLowerCase()}|${weight}|${style}`;
      let ranges = known.get(key);
      if (ranges === undefined) {
        ranges = registeredCoverage(family, weight, style) ?? null;
        known.set(key, ranges);
      }
      return ranges ? rangesHave(ranges, ch.codePointAt(0)!) : undefined;
    },
  };
}

/**
 * The faces of `docs` some of whose characters another face drew (see the
 * module comment), one entry per face whatever document or font list set
 * them. Generic families and the faces in `options.skip` are not checked.
 */
export function glyphFallbacks(docs: VDTDocument | readonly VDTDocument[], options: GlyphFallbackOptions = {}): GlyphFallback[] {
  const sources = options.hasGlyph ? { hasGlyph: options.hasGlyph } : defaultSources();
  if (!sources) return [];
  const { hasGlyph } = sources;
  const supplierOf = options.supplierOf ?? ('supplierOf' in sources ? sources.supplierOf : undefined);
  const list = Array.isArray(docs) ? docs as readonly VDTDocument[] : [docs as VDTDocument];
  interface Found { face: FontFaceRequest; chars: string[]; seen: Set<string>; suppliers: Set<string> }
  const found = new Map<string, Found>();
  const order: string[] = [];
  for (const doc of list) {
    for (const [font, chars] of documentFontTexts(doc)) {
      const face = parseFontString(font);
      if (!face || isGenericFamily(face.family) || face.family === GLYPH_PROBE_FAMILY) continue;
      const key = faceRequestKey(face);
      if (options.skip?.has(key)) continue;
      // A shorthand that lists families after its own (a host's): the
      // first of them that has the character drew it.
      const rest = fontStringFamilies(font).slice(1).filter((f) => f.toLowerCase() !== face.family.toLowerCase());
      for (const ch of chars) {
        let e = found.get(key);
        if (e?.seen.has(ch)) continue;
        if (hasGlyph(face.family, face.weight, face.style, ch) !== false) continue;
        if (!e) {
          found.set(key, (e = { face, chars: [], seen: new Set(), suppliers: new Set() }));
          order.push(key);
        }
        e.seen.add(ch);
        e.chars.push(ch);
        e.suppliers.add(rest.find((f) => hasGlyph(f, face.weight, face.style, ch) === true) ?? supplierOf?.(face, ch) ?? '');
      }
    }
  }
  return order.map((key) => {
    const e = found.get(key)!;
    const only = e.suppliers.size === 1 ? [...e.suppliers][0] : '';
    return {
      family: e.face.family,
      weight: e.face.weight,
      style: e.face.style,
      characters: e.chars.slice(0, GLYPH_FALLBACK_LISTED),
      count: e.chars.length,
      ...(only ? { supplier: only } : {}),
    };
  });
}
