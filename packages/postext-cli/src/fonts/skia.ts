// Faces registered with Skia: the face a request matches, the font
// shorthand, style flags of a file, restyled faces, feature families and
// stand-ins (#1276: split out of fonts.ts).
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { cssWeightOrder, type FontVariantUse, parseFontString, registerFontCoverage, featureFamilyParts, freezeFontFeatures } from 'postext';
import { noteSvgFont } from '../svgImage';
import type { Face } from '../fonts';

/**
 * The face of `faces` (one family's) that answers a weight and a style: of
 * the style asked when the family has it, else of the other, and among
 * those the weight CSS font matching settles on (`cssWeightOrder`, CSS
 * Fonts 4 §5.2). Skia matches the same way when it measures, so the face
 * the PDF embeds is the one the lines were measured with: the 700 for a
 * 550 of a family with a 400 and a 700, where the nearest weight would be
 * the 400.
 */
export function matchedFace<T extends { weight: number; style: 'normal' | 'italic' }>(faces: readonly T[], weight: number, style: 'normal' | 'italic'): T | undefined {
  if (faces.length === 0) return undefined;
  const sameStyle = faces.filter((f) => f.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : faces;
  const matched = cssWeightOrder(weight, pool.map((f) => f.weight))[0];
  return pool.find((f) => f.weight === matched);
}

// ---------------------------------------------------------------------------
// Registering with Skia
// ---------------------------------------------------------------------------

const registered = new Set<string>();
/** The weights and slants Skia holds of each family (lower case): the
 *  faces registered and the copies that stand in for the ones a family
 *  lacks. */
const skiaFaces = new Map<string, FontVariantUse[]>();

function noteSkiaFace(family: string, weight: number, style: 'normal' | 'italic'): void {
  const key = family.toLowerCase();
  const list = skiaFaces.get(key);
  if (!list) skiaFaces.set(key, [{ weight, style }]);
  else if (!list.some((f) => f.weight === weight && f.style === style)) list.push({ weight, style });
}

const HUNDREDS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/**
 * The font shorthand Skia is given for `font`, as the engine writes it
 * (`italic 550 12px "Open Sans"`). The canvas reads a weight only when it
 * is a whole hundred: any other (a 450, a 550) it takes for the size, and
 * the text was measured hundreds of pixels tall. Such a weight is written
 * as the hundred that brings Skia to the face CSS font matching settles on
 * among the faces it holds of the family ({@link matchedFace}): the 700
 * for a 550 of a family with a 400 and a 700, the face `FontSet.pick`
 * hands the PDF. A shorthand with a whole hundred, or with no weight, is
 * left as it is: Skia matches those as CSS does.
 */
export function skiaFontShorthand(font: string): string {
  const face = parseFontString(font);
  if (!face || HUNDREDS.includes(face.weight)) return font;
  const token = new RegExp(`(^|\\s)${String(face.weight).replace('.', '\\.')}(?=\\s)`);
  if (!token.test(font)) return font;
  const faces = skiaFaces.get(face.family.toLowerCase()) ?? [];
  const sameStyle = faces.filter((f) => f.style === face.style);
  const weights = (sameStyle.length > 0 ? sameStyle : faces).map((f) => f.weight);
  const matched = cssWeightOrder(face.weight, weights)[0];
  const byNearness = [...HUNDREDS].sort((a, b) => Math.abs(a - face.weight) - Math.abs(b - face.weight));
  // The hundred Skia answers with that face; with no face of the family
  // (it is measured with a fallback), the hundred next to the weight.
  const hundred = (matched !== undefined ? byNearness.find((h) => cssWeightOrder(h, weights)[0] === matched) : undefined) ?? byNearness[0]!;
  return font.replace(token, `$1${hundred}`);
}

let skiaShorthandInstalled = false;

/** Put {@link skiaFontShorthand} in front of every `font` set on a canvas
 *  of this process (the engine's measuring context and the ones pages are
 *  painted on). Once. */
function installSkiaShorthand(): void {
  if (skiaShorthandInstalled) return;
  skiaShorthandInstalled = true;
  const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as object;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'font');
  const { get, set } = descriptor ?? {};
  if (!descriptor || !set || descriptor.configurable === false) return;
  Object.defineProperty(prototype, 'font', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get,
    set(this: unknown, value: unknown) {
      set.call(this, typeof value === 'string' ? skiaFontShorthand(value) : value);
    },
  });
}

export function register(face: Face): void {
  installSkiaShorthand();
  noteSkiaFace(face.family, face.weight, face.style);
  const key = `${face.family}|${face.weight}|${face.style}|${face.source}|${face.bytes.byteLength}`;
  if (registered.has(key)) return;
  registered.add(key);
  // Skia reads the weight and the slant from the file itself, where the
  // browser takes them from the @font-face descriptors: a file whose flags
  // disagree with what the book declares (an italic without the italic
  // bit) would register under the wrong face, and the first one listed
  // would answer for it. The face is registered with the declared weight
  // and slant (#940); the alias is the family the book names.
  const bytes = declaredFace(face);
  GlobalFonts.register(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), face.family);
  noteSvgFont(bytes, face.family);
  // What the face's `cmap` covers, for the characters it lacks that Skia
  // draws from another face (`glyphFallback`, #1105).
  registerFontCoverage(face.family, face.weight, face.style, bytes);
}

/** The weight class and whether the slant bits (`OS/2` fsSelection, `head`
 *  macStyle) a TrueType / OpenType file sets, as Skia reads them. Undefined
 *  for a collection or a file with no `OS/2` table. */
export function fileStyleFlags(bytes: Uint8Array): { weight: number; italic: boolean } | undefined {
  if (bytes.byteLength < 12) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  if (12 + count * 16 > bytes.byteLength) return undefined;
  let os2: number | undefined;
  let head: number | undefined;
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(bytes[record]!, bytes[record + 1]!, bytes[record + 2]!, bytes[record + 3]!);
    if (tag === 'OS/2') os2 = view.getUint32(record + 8);
    else if (tag === 'head') head = view.getUint32(record + 8);
  }
  if (os2 === undefined || os2 + 64 > bytes.byteLength) return undefined;
  const slanted = (view.getUint16(os2 + 62) & 0x01) !== 0 || (head !== undefined && head + 46 <= bytes.byteLength && (view.getUint16(head + 44) & 0x2) !== 0);
  return { weight: view.getUint16(os2 + 4), italic: slanted };
}

/** The bytes Skia is given for a face: the file itself when its flags say
 *  what the book declares of it, else a copy that says so (#940). */
function declaredFace(face: Face): Uint8Array {
  const flags = fileStyleFlags(face.bytes);
  if (!flags || (flags.weight === face.weight && flags.italic === (face.style === 'italic'))) return face.bytes;
  return restyleFace(face.bytes, face.weight, face.style) ?? face.bytes;
}

/** How much heavier than the face it is drawn from a weight must be for
 *  Skia to draw it bold itself. */
const SKIA_FAKE_BOLD = 200;

/**
 * A copy of a TrueType / OpenType file that says it is of another weight
 * and slant (`OS/2` weight class and selection bits, `head` style bits),
 * the outlines untouched. Skia reads a face's weight and slant from its
 * file, and asked for a bold or an italic a family lacks it draws the
 * nearest face heavier or slanted: registered under the weight and slant
 * asked, the copy makes it draw the family's own letters, the ones the PDF
 * embeds (#688). Undefined for a collection, a variable font or a file
 * with no `OS/2` table.
 */
export function restyleFace(bytes: Uint8Array, weight: number, style: 'normal' | 'italic'): Uint8Array | undefined {
  if (bytes.byteLength < 12) return undefined;
  const out = bytes.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  if (12 + count * 16 > out.byteLength) return undefined;
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    tables.set(String.fromCharCode(out[record]!, out[record + 1]!, out[record + 2]!, out[record + 3]!), view.getUint32(record + 8));
  }
  const os2 = tables.get('OS/2');
  if (os2 === undefined || tables.has('fvar') || os2 + 64 > out.byteLength) return undefined;
  const bold = weight >= 600;
  const italic = style === 'italic';
  view.setUint16(os2 + 4, weight);
  // fsSelection: italic (bit 0), bold (bit 5), regular (bit 6).
  let selection = view.getUint16(os2 + 62) & ~0x61;
  if (italic) selection |= 0x01;
  if (bold) selection |= 0x20;
  if (!italic && !bold) selection |= 0x40;
  view.setUint16(os2 + 62, selection);
  const head = tables.get('head');
  if (head !== undefined && head + 46 <= out.byteLength) {
    view.setUint16(head + 44, (view.getUint16(head + 44) & ~0x3) | (bold ? 1 : 0) | (italic ? 2 : 0));
  }
  return out;
}

/**
 * Register with Skia the faces of a feature family (#1237, `Lora@onum`):
 * a copy of each face of its base family whose `cmap` maps the characters
 * to the glyphs its features give them (`freezeFontFeatures`), since Skia
 * sets no features. The copies are Skia's alone: the PDF embeds the base
 * family's files with the features, the EPUB sets them in CSS. Returns the
 * copies, as faces of the feature family.
 */
export function registerFeatureFamily(family: string, faces: readonly Face[]): Face[] {
  const parts = featureFamilyParts(family);
  const base = parts.family.toLowerCase();
  const out: Face[] = [];
  for (const face of faces) {
    if (face.family.toLowerCase() !== base) continue;
    const declared = declaredFace(face);
    const frozen = freezeFontFeatures(declared, parts.features) ?? declared;
    const copy: Face = { ...face, family, bytes: frozen };
    out.push(copy);
    const key = `${family}|${face.weight}|${face.style}|${face.source}|${face.bytes.byteLength}|figures`;
    if (registered.has(key)) continue;
    registered.add(key);
    installSkiaShorthand();
    noteSkiaFace(family, face.weight, face.style);
    GlobalFonts.register(Buffer.from(frozen.buffer, frozen.byteOffset, frozen.byteLength), family);
    registerFontCoverage(family, face.weight, face.style, frozen);
  }
  return out;
}

/** Register with Skia, for each variant `family` is asked for that it
 *  would draw heavier or slanted from another face, that face under the
 *  weight and slant asked. The copies are Skia's alone: the PDF and the
 *  EPUB embed the family's files. */
export function registerStandIns(family: string, faces: readonly Face[], variants: readonly FontVariantUse[]): void {
  if (faces.length === 0) return;
  for (const v of variants) {
    const nearest = matchedFace(faces, v.weight, v.style)!;
    if (nearest.style === v.style && v.weight - nearest.weight < SKIA_FAKE_BOLD) continue;
    const key = `${family}|${v.weight}|${v.style}|stand-in|${nearest.weight}|${nearest.style}|${nearest.bytes.byteLength}`;
    if (registered.has(key)) continue;
    const copy = restyleFace(nearest.bytes, v.weight, v.style);
    if (!copy) continue;
    registered.add(key);
    noteSkiaFace(family, v.weight, v.style);
    GlobalFonts.register(Buffer.from(copy.buffer, copy.byteOffset, copy.byteLength), family);
    noteSvgFont(copy, family);
  }
}
