// The faces a configuration and its text ask for, before anything is laid
// out: which families (and which weights and slants of each) a build will
// measure with. The Sandbox loads them into the page, the CLI registers
// them with its canvas.

import type { PostextConfig } from '../types.js';
import type { ContentBlock } from '../parse/index.js';
import { DEFAULT_TEXT_ELEMENT, defaultCjkEmphasis, resolveBodyTextConfig, resolveHeaderFooterConfig, resolveHeadingsConfig, resolveOrderedListsConfig, resolveUnorderedListsConfig } from '../defaults/index.js';
import { primaryFontFamily } from '../measure/font.js';
import { comicFontFamilies, comicFontUses } from '../comics/fonts.js';
import { DEFAULT_CODE_STYLE } from '../defaults/text/codeStyle.js';
import { codeFenceOpen } from '../parse/codeFence.js';
import { parseDirectiveAttrs } from '../parse/attrs.js';
import { resolveAllConfig } from '../pipeline/config.js';
import { baseFontFamily, isFeatureFamily, isFigureStyle, withFigureStyle } from './figureStyle.js';

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
  // Callout styles: title, glyph icon / marker, the glyph of the label tab
  // (#1054), body and bullet (#1103) fonts. Unset fields inherit the headings / body
  // families collected above.
  for (const style of config.calloutStyles ?? []) {
    for (const family of [style.titleStyle?.fontFamily, style.icon?.fontFamily, style.marker?.fontFamily, style.label?.icon?.fontFamily, style.body?.fontFamily, style.lists?.bulletFontFamily]) {
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
  // Code listings (#624): the code face (by default `Source Code Pro`)
  // when the text holds a fence, and the inline code face when the
  // configuration sets one.
  for (const family of codeFontFamilies(config, markdown)) families.add(family);
  // The glyphs of inline symbols (#1058), in the faces the text names.
  for (const family of iconFontFamilies(markdown)) families.add(family);
  // The families the styles' figures name (#1237): the base family's
  // files, declared with the features.
  for (const family of configFeatureFamilies(config)) families.add(family);
  // A CSS font stack sets its text in the first family (the engine's
  // `primaryFontFamily`): load that one.
  return [...new Set(Array.from(families, primaryFontFamily))];
}

/**
 * The feature families a configuration sets text in (#1237,
 * `withFigureStyle`): every family of the resolved configuration that
 * carries features, the family of every node that writes a `figureStyle`
 * beside its `fontFamily` (a design text, a caption override), and a
 * heading style's figures over every level's family. Each is the base
 * family's files declared with the features; a host loads the base family
 * and declares them under this name.
 */
export function configFeatureFamilies(config: PostextConfig): string[] {
  const out = new Set<string>();
  const walk = (node: unknown, depth: number, raw: boolean): void => {
    if (depth > 16 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1, raw);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (raw && isFigureStyle(rec.figureStyle)) {
      const family = typeof rec.fontFamily === 'string' && rec.fontFamily.trim()
        ? rec.fontFamily
        : rec.kind === 'text' ? DEFAULT_TEXT_ELEMENT.fontFamily : undefined;
      if (family) {
        const f = withFigureStyle(family, rec.figureStyle);
        if (isFeatureFamily(f)) out.add(f);
      }
    }
    for (const [key, value] of Object.entries(rec)) {
      if (typeof value === 'string') {
        if (!raw && FONT_FAMILY_KEY.test(key) && isFeatureFamily(value)) out.add(value);
      } else {
        walk(value, depth + 1, raw);
      }
    }
  };
  // Nothing to look for where no node sets figures; a partial config the
  // resolver cannot read gives the families its nodes name.
  if (!setsFigureStyle(config, 0)) return [];
  walk(config, 0, true);
  let resolved: ReturnType<typeof resolveAllConfig>;
  try {
    resolved = resolveAllConfig(config);
  } catch {
    return [...out];
  }
  walk(resolved, 0, false);
  // A heading style's figures apply to the family of the level it is set
  // on (`createHeadingLevelResolver`): any level.
  for (const style of config.headingStyles ?? []) {
    if (!isFigureStyle(style.figureStyle) || style.fontFamily) continue;
    for (const level of resolved.headings.levels) {
      const f = withFigureStyle(level.fontFamily, style.figureStyle);
      if (isFeatureFamily(f)) out.add(f);
    }
  }
  return [...out];
}

/** Whether any node of `node` writes a `figureStyle`. */
function setsFigureStyle(node: unknown, depth: number): boolean {
  if (depth > 16 || !node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => setsFigureStyle(item, depth + 1));
  const rec = node as Record<string, unknown>;
  if (rec.figureStyle !== undefined) return true;
  return Object.values(rec).some((value) => typeof value === 'object' && setsFigureStyle(value, depth + 1));
}

/** Each feature family the configuration sets text in asks for the
 *  weights and slants its base family is asked for. */
function addFeatureFamilyUses(config: PostextConfig, usage: Map<string, FontVariantUse[]>): void {
  const byBase = new Map<string, FontVariantUse[]>();
  for (const [family, uses] of usage) {
    const key = baseFontFamily(family).toLowerCase();
    byBase.set(key, [...(byBase.get(key) ?? []), ...uses]);
  }
  for (const family of configFeatureFamilies(config)) {
    const uses = byBase.get(baseFontFamily(family).toLowerCase()) ?? [];
    usage.set(family, [...(usage.get(family) ?? []), ...uses]);
  }
}

/** The faces the glyphs of inline symbols are set in (#1058): every
 *  `font="…"` of a `:icon[…]{glyph=… font=…}` the text writes (in a
 *  figure's labels and its `::caption` / `::note` lines). Read with a scan,
 *  not an expression: a long line is never read again from each opening. */
export function iconFontFamilies(markdown: FontContentText): string[] {
  if (markdown === undefined) return [];
  const out = new Set<string>();
  for (const text of typeof markdown === 'string' ? [markdown] : markdown) {
    for (let at = text.indexOf(':icon['); at >= 0; at = text.indexOf(':icon[', at + 1)) {
      const close = text.indexOf(']{', at);
      const lineEnd = text.indexOf('\n', at);
      if (close < 0 || (lineEnd >= 0 && close > lineEnd)) continue;
      const end = text.indexOf('}', close);
      if (end < 0 || (lineEnd >= 0 && end > lineEnd)) continue;
      const attrs = parseDirectiveAttrs(text.slice(close + 2, end));
      const font = attrs.font?.trim();
      if (font && attrs.glyph) out.add(primaryFontFamily(font));
    }
  }
  return [...out];
}

/** Whether `text` holds a line that opens a code fence. */
function hasCodeFence(text: FontContentText): boolean {
  if (text === undefined) return false;
  const texts = typeof text === 'string' ? [text] : text;
  return texts.some((t) => (t.includes('```') || t.includes('~~~')) && t.split('\n').some((line) => codeFenceOpen(line) !== undefined));
}

/** The faces code is set in (#624): the listings' when the text holds a
 *  fence (and the configuration reads fences) or the configuration has a
 *  `codeStyle` section, the inline code's when it sets inline code. */
export function codeFontFamilies(config: PostextConfig, markdown?: FontContentText): string[] {
  const cs = config.codeStyle;
  const family = cs?.fontFamily?.trim() || DEFAULT_CODE_STYLE.fontFamily;
  const out: string[] = [];
  if ((cs !== undefined && cs.blocks !== false) || (cs?.blocks !== false && hasCodeFence(markdown))) out.push(family);
  if (cs?.inline) out.push(cs.inline.fontFamily?.trim() || family);
  return out;
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
  /** The text the configuration lays out: a code fence in it asks for the
   *  code face (#624). */
  markdown?: FontContentText;
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
 * The summaries of the contents (`toc.subtitle`) are asked for in the
 * slant they are set in, italic unless the configuration says upright.
 */
export function collectFontUsage(config: PostextConfig, doc?: FontUsageDocument): Map<string, FontVariantUse[]> {
  const usage = new Map<string, FontVariantUse[]>();
  const add = (family: string, use: FontVariantUse) => {
    const list = usage.get(family) ?? [];
    list.push(use);
    usage.set(family, list);
  };
  // Nodes whose weight is not the one they write (#1047): headings, their
  // levels and heading styles (700 by default), comic lettering, balloon
  // styles and cast (bold when a `bold` resolves true, the built-in ones
  // included). Their faces are counted resolved below; their subtrees
  // (designs, elements) are still walked.
  const resolvedElsewhere = new Set<unknown>([
    config.headings,
    ...(config.headings?.levels ?? []),
    ...(config.headingStyles ?? []),
    config.comics?.lettering,
    ...(config.comics?.balloonStyles ?? []),
    ...(config.comics?.cast ?? []),
  ].filter(Boolean));
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string' && rec.fontFamily.trim() && !resolvedElsewhere.has(rec)) {
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
  for (const h of headingFontUses(config)) add(primaryFontFamily(h.family), { weight: h.weight, style: h.italic ? 'italic' : 'normal' });
  for (const c of comicFontUses(config, doc?.markdown)) add(primaryFontFamily(c.family), { weight: c.weight, style: c.style });
  // The glyphs of inline symbols (#1058): upright, regular.
  for (const family of iconFontFamilies(doc?.markdown)) add(family, { weight: 400, style: 'normal' });
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
  // The summaries of the contents (`toc.subtitle`, #770) are set slanted
  // unless `italic: false` says otherwise (`resolveTocConfig`), in their
  // own family (else the first level's, else the body's) at their own
  // weight (else the body's). Read as written, the node gave the upright
  // face: where nothing else asks the family for its italic (an Arabic
  // book, whose `*…*` is set in bold), no host had that face before the
  // first layout named it.
  const subtitle = config.toc?.subtitle;
  if (subtitle?.enabled === true) {
    const bodyText = resolveBodyTextConfig(config.bodyText, config.locale);
    const named = [subtitle.fontFamily, config.toc?.levels?.[0]?.fontFamily].find((f) => typeof f === 'string' && f.trim());
    add(primaryFontFamily(named ?? bodyText.fontFamily), {
      weight: typeof subtitle.fontWeight === 'number' ? subtitle.fontWeight : bodyText.fontWeight,
      style: subtitle.italic === false ? 'normal' : 'italic',
    });
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
  // Code (#624): the regular and bold weights of the code face, upright
  // and slanted (tokens may be bold or italic: a comment, a prompt).
  const codeFamilies = codeFontFamilies(config, doc?.markdown);
  if (codeFamilies.length > 0) {
    const cs = config.codeStyle;
    const regular = typeof cs?.fontWeight === 'number' ? cs.fontWeight : DEFAULT_CODE_STYLE.fontWeight;
    const bold = typeof cs?.boldFontWeight === 'number' ? cs.boldFontWeight : DEFAULT_CODE_STYLE.boldFontWeight;
    for (const family of codeFamilies) {
      for (const weight of [regular, bold]) for (const style of ['normal', 'italic'] as const) add(primaryFontFamily(family), { weight, style });
    }
  }
  for (const style of config.paragraphStyles ?? []) capUse(style.dropCap, style.fontFamily, style.fontWeight);
  for (const level of config.headings?.levels ?? []) capUse(level.dropCap, undefined, undefined);
  for (const style of config.headingStyles ?? []) capUse(style.dropCap, undefined, undefined);
  addBoldWeights(config, doc, add);
  addFeatureFamilyUses(config, usage);
  return usage;
}

/** The weight every host loads for bold runs without being asked
 *  ({@link STANDARD_FONT_VARIANTS}): a bold of 700 adds nothing here. */
const STANDARD_BOLD = 700;

/**
 * The bold weights the configuration decides (#741). Wherever the pipeline
 * builds a bold font string from a `boldFontWeight`, the family and that
 * weight are asked for: the body (`bodyText.boldFontWeight`), a paragraph
 * style and a box body (their own `boldFontWeight`, else the body's, in
 * their own family, else the body's), and the texts that set their bold
 * runs with the body's weight in a family of their own (table cells,
 * captions and chips; headings, contents and index entries, whose bold is
 * the heavier of their own weight and the body's). A bold of 700 is one of the standard
 * variants and adds nothing. Without this a book whose bold is 600 was
 * measured with the 700 face standing in, wider, and wrapped otherwise than
 * in a host that had the face.
 */
function addBoldWeights(
  config: PostextConfig,
  doc: FontUsageDocument | undefined,
  add: (family: string, use: FontVariantUse) => void,
): void {
  const body = resolveBodyTextConfig(config.bodyText, config.locale);
  const bodyFamily = primaryFontFamily(body.fontFamily);
  const bodyBold = body.boldFontWeight;
  const named = (family: unknown): string | undefined => (typeof family === 'string' && family.trim() ? primaryFontFamily(family) : undefined);
  const weightOf = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
  const bold = (family: string, weight: number, styles: readonly FontVariantUse['style'][]) => {
    if (weight === STANDARD_BOLD) return;
    for (const style of styles) add(family, { weight, style });
  };

  // The body: upright, and slanted under the rule its italics follow.
  const emphasis = config.cjk?.emphasis ?? 'auto';
  const dots = emphasis === 'dots' || (emphasis === 'auto' && defaultCjkEmphasis(config.locale) === 'dots');
  const italics = body.emphasis === undefined && (!dots || doc?.latinEmphasis !== false);
  bold(bodyFamily, bodyBold, italics ? ['normal', 'italic'] : ['normal']);

  // A text set slanted has its bold runs slanted, and `*…*` upright.
  const slant = (italic: unknown): FontVariantUse['style'][] => (italic === true ? ['italic', 'normal'] : ['normal', 'italic']);
  for (const style of config.paragraphStyles ?? []) {
    bold(named(style.fontFamily) ?? bodyFamily, weightOf(style.boldFontWeight, bodyBold), slant(style.italic));
  }
  for (const style of config.calloutStyles ?? []) {
    const box = style.body;
    if (box?.fontFamily === undefined && box?.boldFontWeight === undefined) continue;
    bold(named(box.fontFamily) ?? bodyFamily, weightOf(box.boldFontWeight, bodyBold), slant(box.italic));
  }

  // Families of their own whose bold runs take the body's weight.
  for (const style of [config.tableStyle, ...(config.tableStyles ?? [])]) {
    for (const family of [named(style?.bodyFontFamily), named(style?.headerFontFamily)]) {
      if (family) bold(family, bodyBold, ['normal', 'italic']);
    }
  }
  const caption = named((config.captionStyle as { fontFamily?: unknown } | undefined)?.fontFamily);
  if (caption) bold(caption, bodyBold, ['normal', 'italic']);
  for (const type of config.resourceTypes ?? []) {
    const own = named((type.captionStyle as { fontFamily?: unknown } | undefined)?.fontFamily);
    if (own) bold(own, bodyBold, ['normal', 'italic']);
  }

  // A chip with a family of its own takes the weight of the text around
  // it: inside a bold run, the body's bold.
  for (const style of config.chipStyles ?? []) {
    const family = named(style.fontFamily);
    if (family && typeof (style as { fontWeight?: unknown }).fontWeight !== 'number') bold(family, bodyBold, ['normal', 'italic']);
  }

  // Headings, contents and index entries: the heavier of their own weight
  // and the body's bold, in their own family.
  const heavier = (family: string | undefined, own: unknown, italic: unknown) => {
    if (!family) return;
    const weight = Math.max(weightOf(own, 400), bodyBold);
    if (weight !== weightOf(own, 400)) bold(family, weight, italic === true ? ['italic'] : ['normal']);
  };
  for (const h of headingFontUses(config)) heavier(primaryFontFamily(h.family), h.weight, h.italic);
  const toc = config.toc as { fontFamily?: unknown; fontWeight?: unknown; italic?: unknown; levels?: readonly { fontFamily?: unknown; fontWeight?: unknown; italic?: unknown }[]; unnumbered?: { fontFamily?: unknown; fontWeight?: unknown; italic?: unknown } } | undefined;
  for (const entry of [toc, ...(toc?.levels ?? []), toc?.unnumbered]) {
    heavier(named(entry?.fontFamily) ?? named(toc?.fontFamily), entry?.fontWeight ?? toc?.fontWeight, entry?.italic);
  }
  const index = config.index as { fontFamily?: unknown; fontWeight?: unknown } | undefined;
  heavier(named(index?.fontFamily), index?.fontWeight, false);
}

/** A heading face as the engine sets it. */
interface HeadingFontUse { family: string; weight: number; italic: boolean }

/**
 * The faces headings are set in (#1047), resolved as the engine resolves
 * them: each level with what it leaves unset taken from `headings` and the
 * defaults (700, upright), and each heading style laid over every level
 * (`createHeadingLevelResolver`), since the text may set it on any. A
 * heading family named with no weight is asked for its bold, not the 400
 * the configuration as written reads as.
 */
function headingFontUses(config: PostextConfig): HeadingFontUse[] {
  const levels = resolveHeadingsConfig(config.headings).levels;
  const out: HeadingFontUse[] = levels.map((l) => ({ family: l.fontFamily, weight: l.fontWeight, italic: l.italic }));
  for (const style of config.headingStyles ?? []) {
    if (style.fontFamily === undefined && style.fontWeight === undefined && style.italic === undefined) continue;
    for (const l of levels) {
      out.push({
        family: style.fontFamily?.trim() || l.fontFamily,
        weight: style.fontWeight ?? l.fontWeight,
        italic: style.italic ?? l.italic,
      });
    }
  }
  return out;
}
