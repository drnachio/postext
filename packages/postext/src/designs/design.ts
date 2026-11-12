/**
 * Designs (#1523): the design of a book, kept apart from its text, to set
 * another book with. A design holds the chosen parts of a configuration
 * (see `parts.ts`), never what is the book's own (its language, direction,
 * resource types, checks), plus what travels with those parts: the custom
 * font families they set text in and the chapter styles, each cut down to
 * the same parts.
 *
 * Applying a design replaces its parts in the book: a setting the design
 * leaves unset goes back to its default, so the book looks like the design
 * and not like a blend. Lists of named entries (paragraph, heading, box
 * styles, palette colours, page templates…) merge on their `id` instead:
 * the design's entries replace the book's of the same id and the book's
 * other entries stay, so the names its text uses keep working.
 */

import type { ChapterStyleConfig, ColorPaletteEntry, CustomFontFamily, PostextConfig } from '../types.js';
import { stripConfigDefaults } from '../defaults/index.js';
import { sameConfig } from '../defaults/configLayers.js';
import { DESIGN_PARTS, DESIGN_PART_SLOTS, designPartSlots, isDesignPart, readDesignSlot, writeDesignSlot, type DesignPart, type DesignPartSlot } from './parts.js';
import { slotsPaintBlankPages, withPageBreaksOf } from './pageBreaks.js';

/** A design: the configuration of its parts, and which parts it holds. */
export interface Design {
  parts: DesignPart[];
  config: PostextConfig;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A list whose entries are objects with an `id`. */
function isIdList(v: unknown): v is { id: string }[] {
  return Array.isArray(v) && v.length > 0 && v.every((e) => isObject(e) && typeof e.id === 'string');
}

/** `base` with `over`'s entries: the same id replaced in place, new ids
 *  added after. */
function mergeById(base: unknown, over: { id: string }[]): { id: string }[] {
  const out = Array.isArray(base) ? (base as { id: string }[]).map((e) => e) : [];
  for (const entry of over) {
    const at = out.findIndex((e) => isObject(e) && e.id === entry.id);
    if (at >= 0) out[at] = structuredClone(entry);
    else out.push(structuredClone(entry));
  }
  return out;
}

/** `override` (a chapter style's) cut down to the slots of `parts`. */
function overrideOfParts(override: object, slots: readonly DesignPartSlot[]): Json {
  let out: Json = {};
  for (const slot of slots) {
    const v = readDesignSlot(override, slot);
    if (v !== undefined) out = writeDesignSlot(out, slot, structuredClone(v));
  }
  return out;
}

/** Every string a configuration holds, for the families it names. */
function strings(node: unknown, out: Set<string>): Set<string> {
  if (typeof node === 'string') out.add(node);
  else if (Array.isArray(node)) for (const v of node) strings(v, out);
  else if (isObject(node)) for (const v of Object.values(node)) strings(v, out);
  return out;
}

/** The custom families a configuration sets text in: named as a font
 *  family anywhere in it (a stack counts each of its names). */
export function usedFontFamilies(config: object, families: readonly CustomFontFamily[]): CustomFontFamily[] {
  if (families.length === 0) return [];
  const names = new Set<string>();
  for (const s of strings(config, new Set())) {
    for (const part of s.split(',')) names.add(part.trim().replace(/^["']|["']$/g, ''));
  }
  return families.filter((f) => names.has(f.name));
}

/** Palette ids a configuration links to (`ColorValue.paletteId`). */
function paletteIds(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) for (const v of node) paletteIds(v, out);
  else if (isObject(node)) {
    if (typeof node.paletteId === 'string' && typeof node.hex === 'string') out.add(node.paletteId);
    for (const v of Object.values(node)) paletteIds(v, out);
  }
  return out;
}

/** `parts` as given, known parts only, in panel order. */
function partsInOrder(parts: readonly string[]): DesignPart[] {
  const wanted = new Set(parts);
  return DESIGN_PARTS.filter((p) => wanted.has(p));
}

/** The design of `config`, limited to `parts`, without the values that
 *  are the defaults anyway. The custom font families the design names come
 *  along (and only those), and each chapter style cut down to the parts. */
export function extractDesign(config: PostextConfig, parts: readonly DesignPart[] = DESIGN_PARTS): Design {
  const chosen = partsInOrder(parts);
  const slots = designPartSlots(chosen);
  // Some defaults depend on the language (captions, quotes): strip against
  // the book's own, then leave the language with the book.
  let out: PostextConfig = config.locale !== undefined ? { locale: config.locale } : {};
  for (const slot of slots) {
    const v = readDesignSlot(config, slot);
    if (v !== undefined) out = writeDesignSlot(out, slot, structuredClone(v));
  }
  const design = stripConfigDefaults(out);
  delete design.locale;
  const styles: ChapterStyleConfig[] = [];
  for (const style of config.chapterStyles ?? []) {
    const own = overrideOfParts(style.config, slots);
    if (Object.keys(own).length > 0) styles.push({ id: style.id, ...(style.name ? { name: style.name } : {}), config: own });
  }
  if (styles.length > 0) design.chapterStyles = styles;
  const families = usedFontFamilies(design, config.customFonts ?? []);
  if (families.length > 0) design.customFonts = structuredClone(families);
  return { parts: chosen, config: design };
}

/**
 * `book` with the chosen `parts` of `design` (all the design holds when
 * left out). Each slot of a part takes the design's value, or goes back to
 * the default when the design leaves it unset; named lists merge on their
 * `id` (and stay as the book has them when the design sets none). Custom
 * font families are added (a family of the same name is replaced), never
 * removed. Palette entries the applied parts link to and the book lacks
 * are added when the colours themselves are not applied. Chapter styles
 * merge on their `id`: a style the book has takes the design's settings of
 * the applied parts and keeps its others. The page breaks go with the
 * elements shown on blank pages (see `pageBreaks.ts`): the book's when it
 * keeps such an element from a part the design leaves, the design's when
 * only the design brings one.
 */
export function applyDesign(book: PostextConfig, design: Design, parts: readonly DesignPart[] = design.parts): PostextConfig {
  const chosen = partsInOrder(parts.filter((p) => design.parts.includes(p)));
  const slots = designPartSlots(chosen);
  let next: PostextConfig = { ...book };
  for (const slot of slots) {
    const value = readDesignSlot(design.config, slot);
    if (isIdList(value)) next = writeDesignSlot(next, slot, mergeById(readDesignSlot(next, slot), value));
    else if (value === undefined && isIdList(readDesignSlot(next, slot))) continue;
    else next = writeDesignSlot(next, slot, value === undefined ? undefined : structuredClone(value));
  }
  const left = DESIGN_PART_SLOTS.filter((s) => !slots.includes(s));
  if (slotsPaintBlankPages(book, left)) next = withPageBreaksOf(next, book);
  else if (slotsPaintBlankPages(design.config, slots)) next = withPageBreaksOf(next, design.config);
  const applied = overrideOfParts(design.config, slots);
  const styles = design.config.chapterStyles ?? [];
  const styleParts: Json[] = [];
  if (styles.length > 0) {
    const merged = [...(next.chapterStyles ?? [])];
    for (const style of styles) {
      const own = overrideOfParts(style.config, slots);
      if (Object.keys(own).length === 0) continue;
      styleParts.push(own);
      const at = merged.findIndex((s) => s.id === style.id);
      if (at < 0) {
        merged.push({ id: style.id, ...(style.name ? { name: style.name } : {}), config: own });
        continue;
      }
      let config: Json = { ...merged[at]!.config };
      for (const slot of slots) config = writeDesignSlot(config, slot, readDesignSlot(own, slot));
      merged[at] = { ...merged[at]!, config };
    }
    if (merged.length > 0) next.chapterStyles = merged;
  }
  const fonts = usedFontFamilies([applied, ...styleParts], design.config.customFonts ?? []);
  if (fonts.length > 0) {
    const byName = new Map((next.customFonts ?? []).map((f) => [f.name, f] as const));
    for (const f of fonts) byName.set(f.name, structuredClone(f));
    next.customFonts = [...byName.values()];
  }
  if (!chosen.includes('colors') && design.config.colorPalette) {
    const linked = paletteIds([applied, ...styleParts], new Set());
    const palette: ColorPaletteEntry[] = [...(next.colorPalette ?? [])];
    const have = new Set(palette.map((e) => e.id));
    for (const entry of design.config.colorPalette) {
      if (linked.has(entry.id) && !have.has(entry.id)) palette.push(structuredClone(entry));
    }
    if (palette.length > 0) next.colorPalette = palette;
  }
  return next;
}

const CARRIED_SLOTS: readonly DesignPartSlot[] = [
  { part: 'text', key: 'customFonts' },
  { part: 'page', key: 'chapterStyles' },
];

/**
 * Take a design back off a book: `current` with every slot the design
 * changed (from `before` to `applied`) put back as it was before, as long
 * as it still holds what the design set. Every other edit stays, those
 * made since the design was applied included.
 */
export function revertDesign(current: PostextConfig, before: PostextConfig, applied: PostextConfig): PostextConfig {
  let next = current;
  for (const slot of [...DESIGN_PART_SLOTS, ...CARRIED_SLOTS]) {
    const was = readDesignSlot(before, slot);
    const set = readDesignSlot(applied, slot);
    if (sameConfig(was, set)) continue;
    if (!sameConfig(readDesignSlot(current, slot), set)) continue;
    next = writeDesignSlot(next, slot, was);
  }
  return next;
}

/** The files a design needs carried with it: its font files and colour
 *  profiles, by `fileId`. */
export function designFileIds(config: PostextConfig): { fontIds: string[]; blobIds: string[] } {
  const fontIds = (config.customFonts ?? []).flatMap((f) => f.variants.map((v) => v.fileId));
  const blobIds = [config.print?.customProfile?.fileId, config.print?.imageColor?.assignedRgbProfile?.fileId]
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { fontIds, blobIds };
}

/** The parts a design file holds, read as this version reads them: a
 *  design saved before the composition rules were a part of their own
 *  (#1540: the designs of 1.79, the templates of 1.78) keeps them in its
 *  text part, so it holds the composition part as well and applying it
 *  sets the rules it was saved with. */
export function designPartsWithComposition(parts: readonly DesignPart[], config: object): DesignPart[] {
  if (!parts.includes('text') || parts.includes('composition')) return [...parts];
  const holds = designPartSlots(['composition']).some((slot) => readDesignSlot(config, slot) !== undefined);
  return holds ? partsInOrder([...parts, 'composition']) : [...parts];
}

/** `parts` read from outside (a manifest, a tool call, a command line,
 *  `page,text`): the known ones, in panel order. */
export function readDesignParts(parts: unknown): DesignPart[] {
  const list = Array.isArray(parts) ? parts : typeof parts === 'string' ? parts.split(',').map((p) => p.trim()) : [];
  return partsInOrder(list.filter(isDesignPart));
}

/** `design` cut down to `parts` (those it holds): the settings of the
 *  other parts left out, the chapter styles cut down likewise, the font
 *  families kept as far as the parts left use them. Nothing else changes:
 *  the values are not compared with the defaults again. */
export function pickDesignParts(design: Design, parts: readonly DesignPart[]): Design {
  const chosen = partsInOrder(parts.filter((p) => design.parts.includes(p)));
  const slots = designPartSlots(chosen);
  const config = overrideOfParts(design.config, slots) as PostextConfig;
  const styles: ChapterStyleConfig[] = [];
  for (const style of design.config.chapterStyles ?? []) {
    const own = overrideOfParts(style.config, slots);
    if (Object.keys(own).length > 0) styles.push({ id: style.id, ...(style.name ? { name: style.name } : {}), config: own });
  }
  if (styles.length > 0) config.chapterStyles = styles;
  const families = usedFontFamilies(config, design.config.customFonts ?? []);
  if (families.length > 0) config.customFonts = structuredClone(families);
  return { parts: chosen, config };
}
