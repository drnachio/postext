// The font plan of a Word export (#1393): which of the book's faces are
// embedded, as what Word family and style slot, and how a VDT font string
// maps to `w:rFonts` + bold/italic. Word knows four slots per family
// (regular, bold, italic, bold italic), so weights 400 and 700 share the
// CSS family and every other weight becomes a family of its own
// (`Lora SemiBold`) with regular and italic slots.

import { parseFontString } from '../../measure/fontString.js';
import type { EmbeddedFontFace } from '../ooxml/types.js';
import { readCmap } from './cmap.js';
import { mergeSlices } from './merge.js';
import {
  FS_TYPE_BITMAP_ONLY,
  FS_TYPE_NO_SUBSETTING,
  fsType,
  isPreviewPrint,
  isRestricted,
  styleTables,
  wordFontMeta,
  writeNames,
  type WordSlot,
} from './meta.js';
import { readSfnt, type Sfnt, SFNT_OTTO, SFNT_TRUE, SFNT_TRUETYPE, toSfntBytes, writeSfnt } from './sfnt.js';
import type { FontWarning, PlanWordFontsOptions, SourceFace, WordFontPlan, WordFontRef } from './types.js';

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  500: 'Medium',
  600: 'SemiBold',
  800: 'ExtraBold',
  900: 'Black',
};

/** The key a face (and a font string) is filed under in the plan's map. */
export function faceKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}

/** GDI selects a face by a family name of at most 31 UTF-16 units
 *  (LF_FACESIZE); a longer `w:rFonts` name never reaches the embedded
 *  copy in Word for Windows. */
export const MAX_WORD_FAMILY = 31;

/** A short, stable tag of a name (FNV-1a, base 36). */
function nameTag(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36).slice(0, 4).toUpperCase();
}

/** `family + suffix`, cut to {@link MAX_WORD_FAMILY} with a tag of the
 *  whole name so two long families cut alike stay apart. */
export function fitWordFamily(family: string, suffix: string): string {
  const full = `${family}${suffix}`;
  if (full.length <= MAX_WORD_FAMILY) return full;
  const tag = ` ${nameTag(full)}`;
  let head = family.slice(0, Math.max(1, MAX_WORD_FAMILY - suffix.length - tag.length));
  // Never end on half a surrogate pair.
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
  return `${head.trimEnd()}${tag}${suffix}`.slice(0, MAX_WORD_FAMILY);
}

function roundWeight(weight: number): number {
  return Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
}

/** The Word family (before the suffix) and slot a face takes. */
export function wordSlotFor(family: string, weight: number, style: 'normal' | 'italic'): { family: string; slot: WordSlot } {
  const w = roundWeight(weight);
  const italic = style === 'italic';
  if (w === 400 || w === 700) {
    const bold = w === 700;
    return { family, slot: bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular' };
  }
  return { family: `${family} ${WEIGHT_NAMES[w]}`, slot: italic ? 'italic' : 'regular' };
}

/** The face of `faces` a request resolves to: the same family and style
 *  first, then the nearest weight (CSS-like, ties to the heavier). */
function nearest<T extends { family: string; weight: number; style: string }>(
  faces: T[],
  family: string,
  weight: number,
  style: string,
): T | undefined {
  const fam = family.toLowerCase();
  let best: T | undefined;
  let bestScore = Infinity;
  for (const f of faces) {
    if (f.family.toLowerCase() !== fam) continue;
    const score = (f.style === style ? 0 : 10000) + Math.abs(f.weight - weight) * 2 + (f.weight < weight ? 1 : 0);
    if (score < bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

interface Prepared {
  face: SourceFace;
  key: string;
  wordFamily: string;
  slot: WordSlot;
  font?: Sfnt;
  meta?: ReturnType<typeof wordFontMeta>;
}

/** Why a face cannot be embedded, or its sfnt slices. */
async function loadSlices(face: SourceFace, options: PlanWordFontsOptions): Promise<Sfnt[] | FontWarning> {
  if (face.files.length === 0) return { family: face.family, reason: 'missing', detail: 'no font files' };
  const out: Sfnt[] = [];
  for (const file of face.files) {
    const bytes = await toSfntBytes(file, options.decompressWoff2);
    if (!bytes) return { family: face.family, reason: 'missing', detail: 'WOFF2 without a decompressor, or not a font file' };
    const font = readSfnt(bytes);
    if (!font) return { family: face.family, reason: 'merge-failed', detail: 'unreadable sfnt' };
    if (font.flavor === SFNT_OTTO || font.tables.has('CFF ') || font.tables.has('CFF2')) {
      return { family: face.family, reason: 'cff', detail: 'CFF outlines; Word needs TrueType (glyf)' };
    }
    if (font.tables.has('fvar')) return { family: face.family, reason: 'variable', detail: 'variable font; no static instance' };
    if (!font.tables.has('glyf')) return { family: face.family, reason: 'merge-failed', detail: 'no glyf table' };
    const type = fsType(font);
    if (isRestricted(type)) {
      const detail = type & FS_TYPE_BITMAP_ONLY ? 'OS/2 fsType allows bitmap embedding only' : 'OS/2 fsType forbids embedding';
      return { family: face.family, reason: 'restricted', detail };
    }
    out.push(font);
  }
  return out;
}

/** The slices that set any of `used` (and the Basic Latin one), all of
 *  them when none would be left. */
function usedSlices(slices: Sfnt[], used: Set<number> | undefined): Sfnt[] {
  if (!used || slices.length < 2) return slices;
  const kept = slices.filter((s) => {
    const cmap = readCmap(s.tables.get('cmap'));
    if (cmap.has(0x41)) return true;
    for (const c of used) if (cmap.has(c)) return true;
    return false;
  });
  return kept.length ? kept : slices;
}

/** A face's final bytes: named as `family` in `slot`, without a now
 *  invalid digital signature. */
function namedFace(font: Sfnt, family: string, slot: WordSlot): Uint8Array {
  const tables = new Map(font.tables);
  tables.delete('DSIG');
  tables.set('name', writeNames(font.tables.get('name'), family, slot));
  const { os2, head } = styleTables(font, slot);
  if (os2) tables.set('OS/2', os2);
  if (head) tables.set('head', head);
  // Windows loads only the 0x00010000 TrueType tag, not Apple's 'true'.
  return writeSfnt({ flavor: font.flavor === SFNT_TRUE ? SFNT_TRUETYPE : font.flavor, tables });
}

/**
 * Plan the fonts of a Word export: decompress, merge each face's
 * unicode-range slices into one TrueType font, skip faces Word cannot
 * embed (CFF, variable, restricted fsType) with a warning, and name every
 * embedded face after its Word family and slot.
 */
export async function planWordFonts(faces: SourceFace[], options: PlanWordFontsOptions = {}): Promise<WordFontPlan> {
  const suffix = options.familySuffix ?? ' PTX';
  const warnings: FontWarning[] = [];
  let wanted: Set<SourceFace> | undefined;
  if (options.fontStrings) {
    wanted = new Set();
    for (const s of options.fontStrings) {
      const req = parseFontString(s);
      const face = req && nearest(faces, req.family, req.weight, req.style);
      if (face) wanted.add(face);
    }
  }

  const prepared: Prepared[] = [];
  const taken = new Set<string>();
  const cssFamilies = new Set(faces.map((f) => f.family.toLowerCase()));
  for (const face of faces) {
    const placed = wordSlotFor(face.family, face.weight, face.style);
    const { slot } = placed;
    let wordFamily = placed.family;
    // `Lora` 600 must not land in a CSS family the book also names
    // `Lora SemiBold`: the numeric weight keeps them apart.
    if (wordFamily !== face.family && cssFamilies.has(wordFamily.toLowerCase())) {
      wordFamily = `${face.family} ${roundWeight(face.weight)}`;
    }
    const p: Prepared = { face, key: faceKey(face.family, face.weight, face.style), wordFamily, slot };
    prepared.push(p);
    const slotKey = `${wordFamily}|${slot}`;
    if ((wanted && !wanted.has(face)) || taken.has(slotKey)) continue;
    // A malformed file throws on a read past its end: that face is left
    // out with a warning, the rest of the export goes on.
    try {
      const slices = await loadSlices(face, options);
      if (!Array.isArray(slices)) {
        warnings.push(slices);
        continue;
      }
      const noSubset = slices.some((s) => fsType(s) & FS_TYPE_NO_SUBSETTING);
      const used = noSubset ? undefined : (options.usedText?.get(p.key) ?? options.usedText?.get(face.family));
      const merged = mergeSlices(usedSlices(slices, used));
      if (typeof merged === 'string') {
        warnings.push({ family: face.family, reason: 'merge-failed', detail: merged });
        continue;
      }
      p.meta = wordFontMeta(merged);
      if (slices.some((s) => isPreviewPrint(fsType(s)))) {
        warnings.push({ family: face.family, reason: 'preview-print', detail: 'embedded for preview & print only' });
      }
      p.font = merged;
      taken.add(slotKey);
    } catch (err) {
      warnings.push({ family: face.family, reason: 'merge-failed', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  // A Word family takes the suffix when any of its faces is embedded, so
  // its slots keep one name.
  const embeddedFamilies = new Set(prepared.filter((p) => p.font).map((p) => p.wordFamily));
  const nameOf = (wordFamily: string): string => (embeddedFamilies.has(wordFamily) ? fitWordFamily(wordFamily, suffix) : wordFamily);
  const out: EmbeddedFontFace[] = [];
  const map = new Map<string, WordFontRef>();
  const altNames = new Map<string, string>();
  for (const p of prepared) {
    const family = nameOf(p.wordFamily);
    map.set(p.key, {
      family,
      bold: p.slot === 'bold' || p.slot === 'boldItalic',
      italic: p.slot === 'italic' || p.slot === 'boldItalic',
    });
    if (!p.font) continue;
    if (family !== p.wordFamily) altNames.set(family, p.wordFamily);
    out.push({ family, slot: p.slot, bytes: namedFace(p.font, family, p.slot), ...p.meta });
  }
  return { faces: out, map, warnings, altNames };
}

/**
 * The Word family and slot flags for a VDT font string
 * (`'italic 700 16px "EB Garamond"'`): the planned face of the same family
 * nearest in weight and style, else the string's own family with bold and
 * italic as it asks.
 */
export function wordFontFor(plan: WordFontPlan, fontString: string): WordFontRef {
  const req = parseFontString(fontString);
  if (!req) return { family: fontString, bold: false, italic: false };
  const exact = plan.map.get(faceKey(req.family, req.weight, req.style));
  if (exact) return exact;
  const entries = [...plan.map.keys()].map((key) => {
    const [family, weight, style] = key.split('|');
    return { key, family: family!, weight: Number(weight), style: style! };
  });
  const near = nearest(entries, req.family, req.weight, req.style);
  if (near) {
    const ref = plan.map.get(near.key)!;
    // An italic asked of a family without one: Word slants the upright.
    return near.style !== req.style && req.style === 'italic' ? { ...ref, italic: true } : ref;
  }
  return { family: req.family, bold: req.weight >= 600, italic: req.style === 'italic' };
}
