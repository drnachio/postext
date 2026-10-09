// The faces a configuration and its text ask for, before anything is laid
// out: which families (and which weights and slants of each) a build will
// measure with. The Sandbox loads them into the page, the CLI registers
// them with its canvas.

import type { PostextConfig } from '../types';
import type { ContentBlock } from '../parse';
import { DEFAULT_TEXT_ELEMENT, defaultCjkEmphasis, resolveBodyTextConfig, resolveHeaderFooterConfig, resolveHeadingsConfig, resolveOrderedListsConfig, resolveUnorderedListsConfig } from '../defaults';
import { primaryFontFamily } from '../measure/font';
import { comicFontFamilies } from '../comics/fonts';

/** The text of the document (one string, or the chapters of a book): the
 *  families a config names are not all the families a build uses — comic
 *  pages (`:::page`) letter in faces of their own (`Comic Neue`, `Bangers`,
 *  `Zen Antique`…) even when the config has no `comics` section. */
export type FontContentText = string | readonly string[] | undefined;

/** Config keys naming a font family: `fontFamily`, `bodyFontFamily`,
 *  `headerFontFamily`, `separatorFontFamily`, `numberFontFamily`… */
const FONT_FAMILY_KEY = /^(?:f|[a-z]\w*F)ontFamily$/;

/**
 * Adds every family `node` names, at any depth. A design-slot text element
 * that names none is set in the element default. A subtree switched off
 * with `enabled: false` (a heading's advanced design, a contents part row)
 * draws nothing, so its families are skipped.
 */
function collectNamedFamilies(node: unknown, families: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectNamedFamilies(item, families);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec.enabled === false) return;
  if (rec.kind === 'text' && typeof rec.content === 'string' && rec.fontFamily === undefined) {
    families.add(DEFAULT_TEXT_ELEMENT.fontFamily);
  }
  for (const [key, value] of Object.entries(rec)) {
    if (typeof value === 'string') {
      if (FONT_FAMILY_KEY.test(key) && value.trim()) families.add(value);
    } else {
      collectNamedFamilies(value, families);
    }
  }
}

/**
 * Every font family a configuration sets text in (the first family of a
 * CSS stack): body, headings, lists, callouts, tables, chips, paragraph
 * styles, running heads, design elements and comic lettering.
 */
export function configFontFamilies(config: PostextConfig, markdown?: FontContentText): string[] {
  const body = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const lists = resolveUnorderedListsConfig(config.unorderedLists, body);
  const ordered = resolveOrderedListsConfig(config.orderedLists, body);
  const families = new Set<string>();
  families.add(body.fontFamily);
  families.add(headings.fontFamily);
  for (const level of headings.levels) families.add(level.fontFamily);
  families.add(lists.fontFamily);
  for (const level of lists.levels) families.add(level.fontFamily);
  families.add(ordered.fontFamily);
  families.add(ordered.separatorFontFamily);
  for (const level of ordered.levels) {
    families.add(level.fontFamily);
    families.add(level.separatorFontFamily);
  }
  // Callout styles: title, glyph icon / marker and body fonts. Unset fields
  // inherit the headings / body families collected above.
  for (const style of config.calloutStyles ?? []) {
    for (const family of [style.titleStyle?.fontFamily, style.icon?.fontFamily, style.marker?.fontFamily, style.body?.fontFamily]) {
      if (family) families.add(family);
    }
  }
  // Table styles: body and header cell fonts of the document's table style
  // and of every named one. Unset fields inherit the body family.
  for (const style of [config.tableStyle, ...(config.tableStyles ?? [])]) {
    for (const family of [style?.bodyFontFamily, style?.headerFontFamily]) {
      if (family) families.add(family);
    }
  }
  // Chip styles: a chip may set its text in a family of its own; unset, it
  // inherits the text around it.
  for (const style of config.chipStyles ?? []) {
    if (style.fontFamily) families.add(style.fontFamily);
  }
  // Line numbers (#621): a face of their own; unset, the body family.
  if (config.lineNumbers?.fontFamily) families.add(config.lineNumbers.fontFamily);
  // Paragraph styles (`:::paragraphs`): a face of their own; unset, the
  // body family.
  for (const style of config.paragraphStyles ?? []) {
    if (style.fontFamily) families.add(style.fontFamily);
  }
  // Part list overrides (partial configs applied inside `:::part`).
  const partLists = [config.parts?.bodyStyle?.unorderedLists, config.parts?.bodyStyle?.orderedLists];
  for (const lists of partLists) {
    if (!lists) continue;
    if (lists.fontFamily) families.add(lists.fontFamily);
    if ('separatorFontFamily' in lists && lists.separatorFontFamily) families.add(lists.separatorFontFamily);
    for (const level of lists.levels ?? []) {
      if (level.fontFamily) families.add(level.fontFamily);
      if ('separatorFontFamily' in level && level.separatorFontFamily) families.add(level.separatorFontFamily);
    }
  }
  // Running heads and folios: with no `header` / `footer`, the built-in
  // ones are drawn, in families of their own.
  for (const slot of [resolveHeaderFooterConfig(config.header, 'header'), resolveHeaderFooterConfig(config.footer, 'footer')]) {
    for (const el of slot.elements) if (el.kind === 'text') families.add(el.fontFamily);
  }
  // Every other family the configuration names: design-slot elements
  // (openers, section running heads, part and contents designs), heading
  // styles, captions, paragraph styles, contents entries…
  collectNamedFamilies(config, families);
  // Comic pages: the lettering, balloon-style and sound-effect faces, by
  // default those of the document language.
  for (const family of comicFontFamilies(config, markdown)) families.add(family);
  // A CSS font stack sets its text in the first family (the engine's
  // `primaryFontFamily`): load that one.
  return [...new Set(Array.from(families, primaryFontFamily))];
}

export interface FontVariantUse { weight: number; style: 'normal' | 'italic' }

export const STANDARD_FONT_VARIANTS: readonly FontVariantUse[] = [
  { weight: 400, style: 'normal' },
  { weight: 700, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'italic' },
];

/** What a document's text asks of its faces beyond its configuration. */
export interface FontUsageDocument {
  /** Whether the text sets a letter or digit that is not Chinese in
   *  emphasis (`*…*`): the characters that keep their italics where
   *  emphasis is set as dots ({@link hasLatinEmphasis}). Unset when the
   *  text is not known. */
  latinEmphasis?: boolean;
}

/** Letters and digits outside Chinese and Japanese script. */
const NON_CJK_LETTER_RE = /(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}])[\p{L}\p{N}]/u;

/** Whether the text of `blocks` (headings aside, which are set in their
 *  own face) puts a letter or digit that is not Chinese in emphasis: a
 *  Latin word in `*…*` keeps its italics where the Chinese characters
 *  beside it take dots (`cjk.emphasis: 'dots'`). */
export function hasLatinEmphasis(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type !== 'heading' && b.spans.some((s) => s.italic && !s.math && NON_CJK_LETTER_RE.test(s.text)));
}

/**
 * The (weight, style) pairs the configuration asks of each family: every
 * config node carrying a `fontFamily` contributes its `fontWeight` (400
 * when unset) and `fontStyle` (normal when unset). The body text family
 * also needs the four standard variants, since markdown emphasis sets bold
 * and italic runs in it; so does a design text with `inlineMarks`. Where
 * emphasis is set as dots (`cjk.emphasis`, by default in a Chinese
 * document), `*…*` puts dots under Chinese characters and keeps the
 * italics of the rest: the body family is asked for its italics only when
 * `doc` does not say the text holds no Latin letter or digit in emphasis.
 * Where `bodyText.emphasis` sets `*…*` in bold, a colour or an overline
 * (an Arabic document's default), the body family is asked for no italics.
 */
export function collectFontUsage(config: PostextConfig, doc?: FontUsageDocument): Map<string, FontVariantUse[]> {
  const usage = new Map<string, FontVariantUse[]>();
  const add = (family: string, use: FontVariantUse) => {
    const list = usage.get(family) ?? [];
    list.push(use);
    usage.set(family, list);
  };
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string' && rec.fontFamily.trim()) {
      const weight = typeof rec.fontWeight === 'number' ? rec.fontWeight : 400;
      // `fontStyle: 'italic'` (headings) or `italic: true` (titles,
      // paragraph styles, callout bodies).
      const style = rec.fontStyle === 'italic' || rec.italic === true ? 'italic' : 'normal';
      const family = primaryFontFamily(rec.fontFamily);
      add(family, { weight, style });
      // A design text with inline marks sets bold runs (700, or its own
      // weight when heavier) and italic runs in the other slant.
      if (rec.inlineMarks === true) {
        const italic = rec.italic === true;
        add(family, { weight: Math.max(700, weight), style: italic ? 'italic' : 'normal' });
        add(family, { weight, style: italic ? 'normal' : 'italic' });
      }
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(config);
  const body = config.bodyText?.fontFamily;
  if (typeof body === 'string' && body.trim()) {
    const emphasis = config.cjk?.emphasis ?? 'auto';
    const dots = emphasis === 'dots' || (emphasis === 'auto' && defaultCjkEmphasis(config.locale) === 'dots');
    // `bodyText.emphasis` other than italics (bold, as Arabic documents set
    // it by default; a colour; an overline) sets `*…*` upright.
    const slanted = resolveBodyTextConfig(config.bodyText, config.locale).emphasis === undefined;
    const italics = slanted && (!dots || doc?.latinEmphasis !== false);
    for (const v of STANDARD_FONT_VARIANTS) if (italics || v.style !== 'italic') add(primaryFontFamily(body), v);
  }
  // Line numbers (#621) with no face of their own: the body family (the
  // engine's default when the config names none), in their weight and
  // slant.
  const ln = config.lineNumbers;
  if (ln?.enabled && !(typeof ln.fontFamily === 'string' && ln.fontFamily.trim())) {
    const bodyText = resolveBodyTextConfig(config.bodyText, config.locale);
    add(primaryFontFamily(bodyText.fontFamily), { weight: typeof ln.fontWeight === 'number' ? ln.fontWeight : bodyText.fontWeight, style: ln.italic === true ? 'italic' : 'normal' });
  }
  // Drop caps (#623) with no face of their own: the paragraph's family (a
  // paragraph style's, else the body's), in the cap's weight and slant.
  const capUse = (cap: unknown, family: string | undefined, weight: number | undefined): void => {
    if (!cap || typeof cap !== 'object') return;
    const c = cap as { fontFamily?: unknown; fontWeight?: unknown; italic?: unknown };
    if (typeof c.fontFamily === 'string' && c.fontFamily.trim()) return;
    const bodyText = resolveBodyTextConfig(config.bodyText, config.locale);
    add(primaryFontFamily(family ?? bodyText.fontFamily), {
      weight: typeof c.fontWeight === 'number' ? c.fontWeight : weight ?? bodyText.fontWeight,
      style: c.italic === true ? 'italic' : 'normal',
    });
  };
  for (const style of config.paragraphStyles ?? []) capUse(style.dropCap, style.fontFamily, style.fontWeight);
  for (const level of config.headings?.levels ?? []) capUse(level.dropCap, undefined, undefined);
  for (const style of config.headingStyles ?? []) capUse(style.dropCap, undefined, undefined);
  return usage;
}
