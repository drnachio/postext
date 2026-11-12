/**
 * Design templates: the design of a book, kept apart from its text, to
 * set another book with. A template holds the parts of a configuration
 * that make the design — the page, the typography, the colours, the
 * running heads, the print settings, the composition rules — and never
 * what belongs to the book (its language, writing system, resource types,
 * viewer settings).
 *
 * Applying a template replaces the chosen parts of the book's design: a
 * key the template leaves unset goes back to its default, so the result
 * looks like the template and not like a blend.
 */

import { stripConfigDefaults, type ColorPaletteEntry, type CustomFontFamily, type PostextConfig } from 'postext';
import { chapterStyleView, newChapterStyle, writeChapterStyle } from '../../editions/chapterStyleEdit.js';
import { holdsComposition, withCompositionOf, withoutComposition } from './compositionPaths.js';

/** The parts a template is saved and applied by. `composition` is a
 *  language's typesetting rules: settings inside `bodyText`
 *  (`COMPOSITION_PATHS`), which the typography leaves alone. */
export type DesignPart = 'page' | 'typography' | 'composition' | 'colors' | 'headerFooter' | 'print';

export const DESIGN_PARTS: readonly DesignPart[] = ['page', 'typography', 'composition', 'colors', 'headerFooter', 'print'];

/** The configuration keys of each part. `customFonts` travels with the
 *  typography (and is merged, not replaced: see {@link applyDesign}). The
 *  composition is made of paths inside `bodyText`, so it has no keys of
 *  its own. */
export const PART_KEYS: Record<DesignPart, readonly (keyof PostextConfig)[]> = {
  page: ['page', 'layout'],
  typography: [
    'bodyText', 'headings', 'headingStyles', 'paragraphStyles', 'calloutStyles', 'chipStyles',
    'unorderedLists', 'orderedLists', 'math', 'footnotes', 'tableStyle', 'tableStyles',
    'captionStyle', 'diagramStyle', 'videoStyle', 'toc', 'index', 'crossRefs', 'citations', 'parts',
  ],
  composition: [],
  colors: ['colorPalette'],
  headerFooter: ['header', 'footer'],
  print: ['print', 'pdfGeneration'],
};

/** A design as saved: the configuration of its parts, and which parts it
 *  holds. */
export interface DesignSnapshot {
  parts: DesignPart[];
  config: PostextConfig;
}

/** The design of `config`, limited to `parts`, without the values that are
 *  the defaults anyway. The custom font families the design names come
 *  along (and only those). */
export function extractDesign(config: PostextConfig, parts: readonly DesignPart[] = DESIGN_PARTS): DesignSnapshot {
  // Some defaults depend on the language (captions, quotes): strip against
  // the book's own, then leave the language with the book.
  const out: Record<string, unknown> = config.locale !== undefined ? { locale: config.locale } : {};
  for (const part of parts) {
    for (const key of PART_KEYS[part]) {
      if (config[key] !== undefined) out[key] = structuredClone(config[key]);
    }
  }
  // The type does not carry the composition rules: they are a part of
  // their own.
  let picked = withoutComposition(out as PostextConfig);
  if (parts.includes('composition')) picked = withCompositionOf(picked, config);
  const stripped = stripConfigDefaults(picked);
  delete stripped.locale;
  const families = usedFontFamilies(stripped, config.customFonts ?? []);
  if (families.length > 0) stripped.customFonts = structuredClone(families);
  return { parts: [...parts], config: stripped };
}

/** Every string a configuration holds, for the families it names. */
function strings(node: unknown, out: Set<string>): Set<string> {
  if (typeof node === 'string') out.add(node);
  else if (Array.isArray(node)) for (const v of node) strings(v, out);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out);
  return out;
}

/** The custom families a design sets text in: named as a font family
 *  anywhere in it (a stack counts each of its names). */
export function usedFontFamilies(design: PostextConfig, families: readonly CustomFontFamily[]): CustomFontFamily[] {
  if (families.length === 0) return [];
  const names = new Set<string>();
  for (const s of strings(design, new Set())) {
    for (const part of s.split(',')) names.add(part.trim().replace(/^["']|["']$/g, ''));
  }
  return families.filter((f) => names.has(f.name));
}

/** Palette ids a configuration links to (`ColorValue.paletteId`). */
function paletteIds(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) for (const v of node) paletteIds(v, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.paletteId === 'string' && typeof o.hex === 'string') out.add(o.paletteId);
    for (const v of Object.values(o)) paletteIds(v, out);
  }
  return out;
}

/**
 * `current` with the chosen `parts` of a template's design: each key of a
 * part takes the template's value, or goes back to the default when the
 * template leaves it unset. Custom font families are added (a family of
 * the same name is replaced), never removed: the book's other settings may
 * still use them. Palette entries the applied parts link to and the book
 * lacks are added when the colours themselves are not applied, so linked
 * colours keep the template's look.
 *
 * The typography leaves the book's composition rules as they are; a
 * template saved before the composition was a part of its own, whose
 * typography still holds some of those settings, sets them all as it did
 * then (its values, the others back to their defaults). The composition,
 * applied, sets the template's rules and nothing else.
 */
export function applyDesign(current: PostextConfig, design: DesignSnapshot, parts: readonly DesignPart[]): PostextConfig {
  let next: Record<string, unknown> = { ...current };
  const applied = parts.filter((p) => design.parts.includes(p));
  for (const part of applied) {
    for (const key of PART_KEYS[part]) {
      const value = design.config[key];
      if (value === undefined) delete next[key];
      else next[key] = structuredClone(value);
    }
  }
  const legacy = !design.parts.includes('composition') && holdsComposition(design.config);
  if (applied.includes('typography') && !legacy) {
    next = withCompositionOf(next as PostextConfig, current) as Record<string, unknown>;
  }
  if (applied.includes('composition')) next = withCompositionOf(next as PostextConfig, design.config) as Record<string, unknown>;
  if (applied.includes('typography') || applied.includes('headerFooter')) {
    const fonts = design.config.customFonts ?? [];
    if (fonts.length > 0) {
      const byName = new Map((current.customFonts ?? []).map((f) => [f.name, f] as const));
      for (const f of fonts) byName.set(f.name, structuredClone(f));
      next.customFonts = [...byName.values()];
    }
  }
  if (!applied.includes('colors') && design.config.colorPalette) {
    const linked = new Set<string>();
    for (const part of applied) for (const key of PART_KEYS[part]) paletteIds(design.config[key], linked);
    const palette: ColorPaletteEntry[] = [...((next.colorPalette as ColorPaletteEntry[] | undefined) ?? [])];
    const have = new Set(palette.map((e) => e.id));
    for (const entry of design.config.colorPalette) {
      if (linked.has(entry.id) && !have.has(entry.id)) palette.push(structuredClone(entry));
    }
    if (palette.length > 0) next.colorPalette = palette;
  }
  return next as PostextConfig;
}

/** The font files and blobs a design needs carried with it. */
export function designFileIds(design: PostextConfig): { fontIds: string[]; blobIds: string[] } {
  const fontIds = (design.customFonts ?? []).flatMap((f) => f.variants.map((v) => v.fileId));
  const blobIds = design.print?.customProfile ? [design.print.customProfile.fileId] : [];
  return { fontIds, blobIds };
}

/** The parts a chapter style can take : the print settings are
 *  the book's, whatever chapter is printed. The composition rules are a
 *  chapter's like its type: an appendix in another language can be set by
 *  that language's rules. */
export const CHAPTER_STYLE_PARTS: readonly DesignPart[] = ['page', 'typography', 'composition', 'colors', 'headerFooter'];

/**
 * `book` with the chosen `parts` of a template kept as a chapter style
 * : style `target.id` when it names one the book has, else a
 * new style called `target.name`. The style holds what the template
 * changes over the book (as the Design panel keeps a style's edits), so a
 * chapter or a section that names it (`chapterStyle:`, `::section{style}`)
 * is set in the template's design and the rest of the book is not. The
 * book's page size and binding stay the book's; the template's custom
 * families join the book's, where every style reads them.
 */
export function templateAsChapterStyle(
  book: PostextConfig,
  design: DesignSnapshot,
  parts: readonly DesignPart[],
  target: { id: string } | { name: string },
): { config: PostextConfig; id: string; created: boolean } {
  const styles = book.chapterStyles ?? [];
  const existing = 'id' in target ? styles.find((s) => s.id === target.id) : undefined;
  const made = existing ? undefined : newChapterStyle(styles, 'name' in target ? target.name : design.parts.join(' '));
  const id = existing?.id ?? made!.id;
  const withStyle: PostextConfig = made ? { ...book, chapterStyles: [...styles, made] } : book;
  const chosen = parts.filter((p) => CHAPTER_STYLE_PARTS.includes(p));
  const after = applyDesign(chapterStyleView(withStyle, id), design, chosen);
  // The families go to the book, so the style does not carry them.
  const withFonts: PostextConfig = after.customFonts ? { ...withStyle, customFonts: after.customFonts } : withStyle;
  return { config: writeChapterStyle(withFonts, id, { ...after, customFonts: withFonts.customFonts }), id, created: !existing };
}
