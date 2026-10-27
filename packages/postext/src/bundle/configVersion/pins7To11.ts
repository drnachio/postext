// Pins for configurations stored under rules 7 to 11: dash, hyphen and
// forced breaks, ragged breaking, verse, paragraph styles, code fences,
// design overflow, grid balancing, inline tables, columns and CJK titles
// (#1276: split out of configVersion.ts).
import type { PostextConfig, BodyTextConfig, HeadingsConfig, TableStyleConfig, LayoutConfig, CodeStyleConfig } from '../../types.js';
import { isRecord, declaresParagraphStyles, cjkOf } from './contentChecks.js';

/**
 * A configuration written before postext 1.5, pinned to the line breaks it
 * made at a dash: `bodyText.breakAfterDashes: false`, where 1.4's
 * Knuth–Plass never ended a line after an em or en dash set closed between
 * words ("say—that’s"), and its line-by-line breaker for formatted text
 * only between two letters. A configuration that names the setting already
 * is returned as it is (the same object).
 */
export function pinLegacyDashBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.breakAfterDashes !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, breakAfterDashes: false } };
}

/**
 * A configuration written before postext 1.5, pinned to the way it broke
 * ragged text: `bodyText.optimalRagged: false`, where 1.4 set every ragged
 * paragraph line by line, filling each line before the next, whatever
 * `optimalLineBreaking` said. A configuration that names the setting
 * already, that sets no running text ragged (the body, a paragraph style,
 * a box body, the body of a part or of a section style, in the
 * configuration or in its HTML viewer's overrides), or that turns
 * `optimalLineBreaking` off (the setting then changes nothing) is returned
 * as it is (the same object).
 */
export function pinLegacyRaggedBreaking<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.optimalRagged !== undefined || bodyText.optimalLineBreaking === false) return config;
  if (!setsRaggedText(config)) return config;
  return { ...config, bodyText: { ...bodyText, optimalRagged: false } };
}

/**
 * A configuration written before postext 1.5, pinned to the way it split a
 * paragraph kept with the heading above it at a column's foot:
 * `headings.keepWithNextSplit: 'fill'`, where 1.4 kept as many lines as fit
 * under the heading (at least `bodyText.widowMinLines`) however few went on
 * to the next column. A configuration that names the setting already, that
 * turns `headings.keepWithNext` off, or that turns `bodyText.avoidOrphans`
 * off (the setting then changes nothing) is returned as it is (the same
 * object).
 */
export function pinLegacyHeadingSplit<T extends Partial<PostextConfig>>(config: T): T {
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  if (headings.keepWithNextSplit !== undefined || headings.keepWithNext === false) return config;
  if (isRecord(config.bodyText) && config.bodyText.avoidOrphans === false) return config;
  return { ...config, headings: { ...headings, keepWithNextSplit: 'fill' } };
}

/**
 * A configuration written before postext 1.5, pinned to the space it left
 * under a `:::paragraphs` container: `bodyText.paragraphContainerSpacing:
 * 'add'`, where 1.4 set the style's space (the larger of `spaceBetween` and
 * `marginBottom`) under the last paragraph before the grid snap, added the
 * next block's own space above (a heading's `marginTop`, the next
 * container's) under it, and left the paragraph spacing of the text around
 * the container out. A configuration that names the setting already, or
 * declares no paragraph style (in the configuration or in its HTML
 * viewer's overrides; a container naming no style is set as body text), is
 * returned as it is (the same object).
 */
export function pinLegacyParagraphContainerSpacing<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.paragraphContainerSpacing !== undefined) return config;
  if (!declaresParagraphStyles(config)) return config;
  return { ...config, bodyText: { ...bodyText, paragraphContainerSpacing: 'add' } };
}

/**
 * A configuration written before postext 1.5, pinned to the line breaks it
 * made at the hyphen of a compound: `bodyText.breakAfterHyphens: false`,
 * where 1.4's Knuth–Plass ended a justified line after a hyphen between two
 * letters ("well-" | "known") only in a paragraph with inline formatting.
 * A configuration that names the setting already, or turns
 * `optimalLineBreaking` off (the setting then changes nothing), is returned
 * as it is (the same object).
 */
export function pinLegacyHyphenBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.breakAfterHyphens !== undefined || bodyText.optimalLineBreaking === false) return config;
  return { ...config, bodyText: { ...bodyText, breakAfterHyphens: false } };
}

/**
 * A configuration written before #620 (postext 1.22 or earlier), pinned to
 * the way it set a `:::verse` poem with no hemistich separator:
 * `bodyText.verse.layout: 'bayt'`, every line a single hemistich centred in
 * the measure, where today such a poem is set line by line. A
 * configuration that names the setting already is returned as it is (the
 * same object).
 */
export function pinLegacyVerseLayout<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  const verse = isRecord(bodyText.verse) ? bodyText.verse : {};
  if (verse.layout !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, verse: { ...verse, layout: 'bayt' } } };
}

/**
 * A configuration written before the #620 follow-up (postext 1.23 or
 * earlier), pinned to the way 1.23 set a line of a poem in the line layout
 * that is wider than the measure: `bodyText.verse.tighten: false`, the line
 * turned over at its natural word spacing, where today one that fits with
 * its word spaces tightened down to `bodyText.minWordSpacing` stays on one
 * line. A configuration that names the setting already is returned as it
 * is (the same object).
 */
export function pinLegacyVerseTightening<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  const verse = isRecord(bodyText.verse) ? bodyText.verse : {};
  if (verse.tighten !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, verse: { ...verse, tighten: false } } };
}

/** `slot` (a design slot as stored) with `overflow: 'ellipsis-end'` written
 *  on every text element that sets none; undefined when there is none. A
 *  legacy-shaped element (no `placement`) is left alone: its migration
 *  writes the ellipsis already. */
function pinSlotOverflow(slot: unknown): Record<string, unknown> | undefined {
  if (!isRecord(slot) || !Array.isArray(slot.elements)) return undefined;
  let changed = false;
  const elements = slot.elements.map((el: unknown) => {
    if (!isRecord(el) || el.kind !== 'text' || el.overflow !== undefined || !isRecord(el.placement)) return el;
    changed = true;
    return { ...el, overflow: 'ellipsis-end' };
  });
  return changed ? { ...slot, elements } : undefined;
}

/** `entries` (heading levels or heading styles) with their
 *  `advancedDesign.slot` pinned by {@link pinSlotOverflow}; undefined when
 *  none changed. */
function pinAdvancedDesigns(entries: unknown): unknown[] | undefined {
  if (!Array.isArray(entries)) return undefined;
  let changed = false;
  const out = entries.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.advancedDesign)) return entry;
    const slot = pinSlotOverflow(entry.advancedDesign.slot);
    if (!slot) return entry;
    changed = true;
    return { ...entry, advancedDesign: { ...entry.advancedDesign, slot } };
  });
  return changed ? out : undefined;
}

/** The heading and part designs of `config` (a configuration, or the
 *  overrides of its HTML viewer) pinned by {@link pinSlotOverflow}; the
 *  same object when nothing changed. */
function pinDesignOverflows(config: Record<string, unknown>): Record<string, unknown> {
  let out = config;
  const headings = config.headings;
  if (isRecord(headings)) {
    const levels = pinAdvancedDesigns(headings.levels);
    if (levels) out = { ...out, headings: { ...headings, levels } };
  }
  const styles = pinAdvancedDesigns(config.headingStyles);
  if (styles) out = { ...out, headingStyles: styles };
  const parts = config.parts;
  if (isRecord(parts)) {
    const design = pinSlotOverflow(parts.design);
    const versoDesign = pinSlotOverflow(parts.versoDesign);
    if (design || versoDesign) {
      out = { ...out, parts: { ...parts, ...(design ? { design } : {}), ...(versoDesign ? { versoDesign } : {}) } };
    }
  }
  return out;
}

/**
 * A configuration written before #628 (postext 1.23 or earlier), pinned to
 * the way its heading designs and part pages set a text too wide for its
 * room: every text element of `headings.levels[].advancedDesign.slot`,
 * `headingStyles[].advancedDesign.slot`, `parts.design` and
 * `parts.versoDesign` that sets no `overflow` gets `'ellipsis-end'`, the
 * default up to 1.23, where today such an element wraps. The same designs
 * in its HTML viewer's overrides are pinned too. Running heads, folios and
 * the contents' part rows keep the ellipsis by default, so they are left
 * alone. A configuration with no such element is returned as it is (the
 * same object).
 */
export function pinLegacyDesignOverflow<T extends Partial<PostextConfig>>(config: T): T {
  let out = pinDesignOverflows(config as Record<string, unknown>);
  const viewer = out.htmlViewer;
  if (isRecord(viewer) && isRecord(viewer.overrides)) {
    const overrides = pinDesignOverflows(viewer.overrides);
    if (overrides !== viewer.overrides) out = { ...out, htmlViewer: { ...viewer, overrides } };
  }
  return out as T;
}

/**
 * A configuration written before #632 (postext 1.24 or earlier), pinned to
 * the way 1.24 balanced a horizontal page on a character grid: a config
 * with `cjk.grid.enabled` in horizontal text that does not set
 * `headings.balancing.enabled` gets `true`, where today such a page is
 * not balanced by default. (The levers it runs keep every character in
 * its cell now, which 1.24's loose paragraphs did not.) A vertical one
 * was not balanced then either, and any other configuration is returned
 * as it is (the same object).
 */
export function pinLegacyGridBalancing<T extends Partial<PostextConfig>>(config: T): T {
  if (!isRecord(config.cjk) || !isRecord(config.cjk.grid) || config.cjk.grid.enabled !== true) return config;
  if (isRecord(config.layout) && config.layout.writingMode === 'vertical-rl') return config;
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  const balancing = isRecord(headings.balancing) ? headings.balancing : {};
  if (balancing.enabled !== undefined) return config;
  return { ...config, headings: { ...headings, balancing: { ...balancing, enabled: true } } };
}

/**
 * A configuration written before #634 (postext 1.24 or earlier), pinned to
 * the way 1.24 placed a table set `here`: `tableStyle.splitInline: false`,
 * so an inline table that does not fit the room left in its column moves
 * whole to the next one, where today it is cut between rows. The named
 * table styles inherit it. A configuration that sets `splitInline` is
 * returned as it is (the same object).
 */
export function pinLegacyInlineTableSplit<T extends Partial<PostextConfig>>(config: T): T {
  const tableStyle: TableStyleConfig = isRecord(config.tableStyle) ? config.tableStyle : {};
  if (tableStyle.splitInline !== undefined) return config;
  return { ...config, tableStyle: { ...tableStyle, splitInline: false } };
}

/**
 * A configuration written before #634 (postext 1.24 or earlier), pinned to
 * the way 1.24 read `:::columns`: `layout.flowColumns: false`, so a fence
 * outside a box is ignored (its blocks run at the full measure) and a box
 * that splits never cuts inside a group, where today the one sets its
 * blocks in sub-columns and the other cuts between them. A configuration
 * that sets `flowColumns` is returned as it is (the same object).
 */
export function pinLegacyFlowColumns<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.flowColumns !== undefined) return config;
  return { ...config, layout: { ...layout, flowColumns: false } };
}

/**
 * A configuration written before #639 (postext 1.24 or earlier), pinned to
 * the slots 1.24 offered under a page-span opener:
 * `layout.floatsUnderOpener: false`, so a float fenced or embedded right
 * after an opener set over several text columns lands from the second
 * column on, where today it takes the head of the opener's own column,
 * under its band. A configuration that sets `floatsUnderOpener` is
 * returned as it is (the same object).
 */
export function pinLegacyOpenerHeadFloats<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.floatsUnderOpener !== undefined) return config;
  return { ...config, layout: { ...layout, floatsUnderOpener: false } };
}

/**
 * A configuration written before #620 (postext 1.22 or earlier), pinned to
 * the indents of its paragraph styles: a style that sets both
 * `firstLineIndent` and a non-zero `hangingIndent` loses the
 * `firstLineIndent`, which up to 1.22 the hanging indent replaced (today
 * the first line starts at it). The styles of its HTML viewer's overrides
 * are pinned the same way. A configuration with no such style is returned
 * as it is (the same object).
 */
export function pinLegacyPairedIndents<T extends Partial<PostextConfig>>(config: T): T {
  const pinStyles = (styles: unknown): unknown[] | undefined => {
    if (!Array.isArray(styles)) return undefined;
    let changed = false;
    const out = styles.map((s: unknown) => {
      if (!isRecord(s) || s.firstLineIndent === undefined || !isRecord(s.hangingIndent)) return s;
      const hang = s.hangingIndent.value;
      if (typeof hang !== 'number' || !(hang > 0)) return s;
      changed = true;
      const { firstLineIndent: _first, ...rest } = s;
      void _first;
      return rest;
    });
    return changed ? out : undefined;
  };
  let out: T = config;
  const own = pinStyles((config as Record<string, unknown>).paragraphStyles);
  if (own) out = { ...out, paragraphStyles: own };
  const viewer = (config as Record<string, unknown>).htmlViewer;
  if (isRecord(viewer) && isRecord(viewer.overrides)) {
    const overrides = pinStyles(viewer.overrides.paragraphStyles);
    if (overrides) out = { ...out, htmlViewer: { ...viewer, overrides: { ...viewer.overrides, paragraphStyles: overrides } } };
  }
  return out;
}

/** Whether a `textAlign` value sets text ragged (anything but `'justify'`;
 *  an unset one follows the body). */
function isRaggedAlign(value: unknown): boolean {
  return typeof value === 'string' && value !== 'justify';
}

/**
 * A configuration written before #620 (postext 1.22 or earlier), pinned to
 * the way it read a backslash that ends a line of a paragraph, a quotation
 * or a list item, and `\\` in one: `bodyText.hardLineBreaks: false`, the
 * backslashes printed and the lines joined with a space, where today they
 * are forced line breaks. A configuration that names the setting already
 * is returned as it is (the same object).
 */
export function pinLegacyHardBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.hardLineBreaks !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, hardLineBreaks: false } };
}

/**
 * A configuration written before #624 (postext 1.22 or earlier), pinned to
 * the way it read a ```` ``` ```` or `~~~` fence: `codeStyle.blocks: false`,
 * the fence and the lines inside it read as Markdown (paragraphs, headings,
 * lists…), where today they are a code block set as written. A
 * configuration that names the setting already is returned as it is (the
 * same object).
 */
export function pinLegacyCodeBlocks<T extends Partial<PostextConfig>>(config: T): T {
  const codeStyle: CodeStyleConfig = isRecord(config.codeStyle) ? config.codeStyle : {};
  if (codeStyle.blocks !== undefined) return config;
  return { ...config, codeStyle: { ...codeStyle, blocks: false } };
}

/** Whether `config` (or the screen overrides of its HTML viewer) sets some
 *  running text ragged: the body text (and so its blockquotes and lists), a
 *  paragraph style, a box body, the body of a part or the body of a
 *  section style (`headingStyles[].bodyStyle`). Headings do not count: they
 *  are not broken with Knuth–Plass when ragged. */
function setsRaggedText(config: Partial<PostextConfig>): boolean {
  const raggedBody = (st: unknown): boolean => isRecord(st) && isRecord(st.bodyStyle) && isRaggedAlign(st.bodyStyle.textAlign);
  const check = (c: Record<string, unknown>): boolean => {
    if (isRecord(c.bodyText) && isRaggedAlign(c.bodyText.textAlign)) return true;
    if (Array.isArray(c.paragraphStyles) && c.paragraphStyles.some((st) => isRecord(st) && isRaggedAlign(st.textAlign))) return true;
    if (Array.isArray(c.calloutStyles) && c.calloutStyles.some((st) => isRecord(st) && isRecord(st.body) && isRaggedAlign(st.body.textAlign))) return true;
    if (Array.isArray(c.headingStyles) && c.headingStyles.some(raggedBody)) return true;
    return raggedBody(c.parts);
  };
  if (check(config as Record<string, unknown>)) return true;
  const viewer = (config as Record<string, unknown>).htmlViewer;
  return isRecord(viewer) && isRecord(viewer.overrides) && check(viewer.overrides);
}

/**
 * A configuration written before #637 (postext 1.24 or earlier), pinned to
 * the way 1.24 broke lines inside a book title: `cjk.titleMinChars: 1`, a
 * line breaking anywhere in a `《…》` or `〈…〉` title the level allows
 * (`《說|文》`), where today two characters of it stand on either side of a
 * break. A configuration that sets `titleMinChars` is returned as it is
 * (the same object).
 */
export function pinLegacyTitleBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const cjk = cjkOf(config);
  if (cjk.titleMinChars !== undefined) return config;
  return { ...config, cjk: { ...cjk, titleMinChars: 1 } };
}

/**
 * A configuration written before #637 (postext 1.24 or earlier), pinned to
 * the way 1.24 set the circled numbers ①–⑳ and their kin in CJK text:
 * `cjk.circledNumbers: 'western'`, as Western letters with the Han–Latin
 * space on both sides and a line free to end on one, where today they are
 * Chinese characters kept off a line end. A configuration that sets
 * `circledNumbers` is returned as it is (the same object).
 */
export function pinLegacyCircledNumbers<T extends Partial<PostextConfig>>(config: T): T {
  const cjk = cjkOf(config);
  if (cjk.circledNumbers !== undefined) return config;
  return { ...config, cjk: { ...cjk, circledNumbers: 'western' } };
}

/**
 * A configuration written before #637 (postext 1.24 or earlier), pinned to
 * the way 1.24 set design text in Chinese or Japanese (openers, heading
 * designs, running heads, page designs): `cjk.composeDesignText: false`,
 * wrapped at spaces with every mark at the font's own advance, where
 * today it takes the body's CJK rules. A configuration that sets
 * `composeDesignText` is returned as it is (the same object).
 */
export function pinLegacyDesignText<T extends Partial<PostextConfig>>(config: T): T {
  const cjk = cjkOf(config);
  if (cjk.composeDesignText !== undefined) return config;
  return { ...config, cjk: { ...cjk, composeDesignText: false } };
}
