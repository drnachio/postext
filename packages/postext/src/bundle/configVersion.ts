// Which rules a stored configuration was written for, and how one written
// for older rules is read in today's terms. A `.postext` manifest carries
// the number as `configVersion` (every writer since postext 1.5 sets it);
// the Sandbox numbers its stored projects the same way.

import type { BodyTextConfig, CjkConfig, CodeStyleConfig, Dimension, DimensionUnit, HeadingBreakBeforeConfig, HeadingsConfig, LayoutConfig, MathConfig, PostextConfig, TableStyleConfig } from '../types';
import { DEFAULT_MATH_CONFIG } from '../defaults/math';
import { dimensionsEqual } from '../defaults/shared';
import { DEFAULT_TEXT_ELEMENT, resolveDesignLineHeight } from '../defaults/headerFooter';
import { DEFAULT_PAGE_CONFIG } from '../defaults/page';
import { dimensionToPx } from '../units';
import { KNOWN_CONTAINERS } from '../parse/blockParser';
import { codeFenceOpen } from '../parse/codeFence';
import { hasCJK } from '../measure/cjk';

/**
 * The configuration rules this engine writes: 11 since #632 (10 from
 * postext 1.24, 9 from 1.23, 8 from 1.5). Thirteen rules changed in 1.5 and
 * more since, and a configuration
 * stored under an older
 * number (or none) is read through {@link migrateConfig}:
 * - 3: a heading level's `breakBefore` (and a heading style's) merges field
 *   by field onto the level's default — H1's being `always-odd`
 *   ({@link pinLegacyHeadingBreaks});
 * - 4: one em of a formula is the surrounding text's size ×
 *   `math.fontSizeScale`, where up to 1.4 formulas came out
 *   {@link LEGACY_MATH_SIZE}× larger ({@link pinLegacyMathSize});
 * - 5: an inline resource keeps the float gap below it as well as above
 *   (`layout.inlineResourceGap: 'around'`), where up to 1.4 the text after
 *   it resumed at the next grid line ({@link pinLegacyInlineGap});
 * - 6, five rules:
 *   - a heading reads its inline marks (`headings.inlineMarks: true`),
 *     where up to 1.4 it printed them as plain text ({@link
 *     pinLegacyHeadingMarks});
 *   - a design text's drop cap that names no size is set at the size that
 *     brings its top level with the first line's capitals, where up to 1.4
 *     it was as tall as all the line boxes it spans ({@link
 *     pinLegacyDropCapSize});
 *   - `bodyText.keepColonWithList` leaves room under the colon line for
 *     the list's first item to start by its orphan and widow rules
 *     (`bodyText.colonListRoom: 'item'`), where up to 1.4 one line was
 *     enough ({@link pinLegacyColonListRoom});
 *   - an inline resource inside a box keeps the float gap too
 *     (`layout.inlineResourceGapInBoxes`), where up to 1.4 it sat right
 *     against the text around it ({@link pinLegacyBoxResourceGap});
 *   - a box that splits inside a paragraph or list item leaves at least two
 *     lines of it on each side (`layout.boxChildSplitMinLines: 2`), where
 *     up to 1.4 a cut could leave one ({@link pinLegacyBoxChildCut});
 * - 7, two rules:
 *   - a line may end after an em or en dash set closed between words
 *     (`bodyText.breakAfterDashes`), where up to 1.4 Knuth–Plass never
 *     broke there ({@link pinLegacyDashBreaks});
 *   - ragged running text is broken with Knuth–Plass too
 *     (`bodyText.optimalRagged`), where up to 1.4 it was set line by line
 *     ({@link pinLegacyRaggedBreaking});
 * - 8, three rules:
 *   - a paragraph kept with the heading above it at a column's foot
 *     splits by the orphan rule too (`headings.keepWithNextSplit:
 *     'rules'`), where up to 1.4 it kept as many lines as fit under the
 *     heading ({@link pinLegacyHeadingSplit});
 *   - the space under a `:::paragraphs` container merges with the next
 *     block's own and is at least the paragraph spacing of the text around
 *     it (`bodyText.paragraphContainerSpacing: 'collapse'`), where up to
 *     1.4 the style's space was baked into the grid snap and the next
 *     block's space above added under it ({@link
 *     pinLegacyParagraphContainerSpacing});
 *   - Knuth–Plass may end a line after the hyphen of a compound in every
 *     paragraph (`bodyText.breakAfterHyphens`), where up to 1.4 a justified
 *     paragraph with no inline formatting never broke there ({@link
 *     pinLegacyHyphenBreaks}).
 * - 9 (#620, #624), four rules:
 *   - a `:::verse` poem whose fence names no layout and whose lines carry
 *     no hemistich separator is set line by line (`bodyText.verse.layout:
 *     'auto'`), where up to 1.22 its lines were single hemistichs centred
 *     in the measure ({@link pinLegacyVerseLayout});
 *   - a paragraph style that sets `firstLineIndent` itself and a non-zero
 *     `hangingIndent` indents its first line by the one and its turnovers
 *     by the other, where up to 1.22 the hanging indent replaced the
 *     first-line indent ({@link pinLegacyPairedIndents});
 *   - a backslash that ends a line of a paragraph, a quotation or a list
 *     item, and `\\` in one, is a forced line break
 *     (`bodyText.hardLineBreaks`), where up to 1.22 it printed ({@link
 *     pinLegacyHardBreaks});
 *   - a ```` ``` ```` or `~~~` fence opens a code block (#624,
 *     `codeStyle.blocks`), where up to 1.22 its lines were read as
 *     Markdown ({@link pinLegacyCodeBlocks}).
 * - 10, two rules:
 *   - a line of a poem set line by line that is a little wider than the
 *     measure tightens its word spaces, down to `bodyText.minWordSpacing`,
 *     and stays on one line (`bodyText.verse.tighten`, #620 follow-up),
 *     where 1.23 turned it over ({@link pinLegacyVerseTightening});
 *   - a text element of a heading design or a part page that sets no
 *     `overflow` wraps onto more lines (#628), where up to 1.23 it was cut
 *     with an ellipsis ({@link pinLegacyDesignOverflow}).
 * - 11, five rules:
 *   - a horizontal page on a character grid (`cjk.grid.enabled`) is not
 *     balanced unless `headings.balancing.enabled` says so (#632), where
 *     up to 1.24 it was ({@link pinLegacyGridBalancing});
 *   - a table placed `here` follows its style's `overflow`
 *     (`tableStyle.splitInline`, #634): one that does not fit the room
 *     left in its column is cut between rows, where up to 1.24 it moved
 *     whole to the next column ({@link pinLegacyInlineTableSplit});
 *   - a line breaks inside a book title only where two of its characters
 *     stand on either side (`cjk.titleMinChars: 2`, #637), where up to
 *     1.24 it could leave one ({@link pinLegacyTitleBreaks});
 *   - the circled numbers ①–⑳ and their kin are Chinese characters in CJK
 *     text (`cjk.circledNumbers: 'cjk'`, #637), where up to 1.24 they were
 *     Western letters ({@link pinLegacyCircledNumbers});
 *   - a design text in Chinese or Japanese takes the body's CJK rules
 *     (`cjk.composeDesignText`, #637), where up to 1.24 it was wrapped at
 *     spaces with every mark at its own advance ({@link
 *     pinLegacyDesignText}).
 *
 * A configuration stored without a version was written for postext 1.4 or
 * earlier. One stored under 3 to 7 was written by a 1.5 prerelease, and
 * gets the pins of the rules after its number: under 3 the maths,
 * inline-gap, version-6, version-7 and version-8 pins, under 4 the
 * inline-gap, version-6, version-7 and version-8 pins, under 5 the
 * version-6, version-7 and version-8 pins, under 6 the version-7 and
 * version-8 pins, under 7 the version-8 pins. One stored under 8 was
 * written by postext 1.5 to 1.22 and gets the version-9 pins (which every
 * older one gets too); one stored under 9 was written by postext 1.23 and
 * gets the version-10 pins (which every older one gets too); one stored
 * under 10 was written by postext 1.24 and gets the version-11 pin (which
 * every older one gets too).
 */
export const CONFIG_VERSION = 11;

/** The rules that merge a partial heading break onto its level's. */
const HEADING_BREAK_RULES = 3;
/** The rules that set a formula's em at the documented size. */
const MATH_SIZE_RULES = 4;
/** The rules that keep the float gap under an inline resource. */
const INLINE_GAP_RULES = 5;
/** The rules that read a heading's inline marks, and size a drop cap to
 *  the first line's capitals. */
const HEADING_MARKS_RULES = 6;
const DROP_CAP_SIZE_RULES = 6;
/** The rules that leave room for a list's first item under its colon line. */
const COLON_LIST_ROOM_RULES = 6;
/** The rules that keep the gap around an inline resource inside a box. */
const BOX_GAP_RULES = 6;
/** The rules that keep two lines of a paragraph or list item on each side
 *  of a box cut. */
const BOX_CHILD_CUT_RULES = 6;
/** The rules that let a line end after a closed dash. */
const DASH_BREAK_RULES = 7;
/** The rules that break ragged running text with Knuth–Plass. */
const RAGGED_BREAKING_RULES = 7;
/** The rules that keep the orphan minimum when a paragraph splits under a
 *  heading. */
const HEADING_SPLIT_RULES = 8;
/** The rules that merge the space under a `:::paragraphs` container with
 *  the next block's. */
const PARAGRAPH_CONTAINER_RULES = 8;
/** The rules that let Knuth–Plass break after a compound's hyphen in every
 *  paragraph. */
const HYPHEN_BREAK_RULES = 8;
/** The rules that set a poem with no hemistich separator line by line. */
const VERSE_LAYOUT_RULES = 9;
/** The rules that pair a paragraph style's own first-line indent with its
 *  hanging one. */
const PAIRED_INDENT_RULES = 9;
/** The rules that read a backslash ending a line, or `\\`, as a forced line
 *  break. */
const HARD_BREAK_RULES = 9;
/** The rules that read a code fence as a code block. */
const CODE_BLOCK_RULES = 9;
/** The rules that tighten a line of verse a little too wide for the
 *  measure instead of turning it over. */
const VERSE_TIGHTEN_RULES = 10;
/** The rules that wrap a heading or part design text that sets no
 *  `overflow`. */
const DESIGN_OVERFLOW_RULES = 10;
/** The rules that leave a horizontal page on a character grid unbalanced
 *  by default. */
const GRID_BALANCING_RULES = 11;
/** The rules that keep two characters of a book title on either side of a
 *  line break, set circled numbers as Chinese characters and compose CJK
 *  design text (#637). */
const TITLE_BREAK_RULES = 11;
const CIRCLED_NUMBER_RULES = 11;
const DESIGN_TEXT_RULES = 11;
/** The rules that cut an inline table between rows. */
const INLINE_TABLE_SPLIT_RULES = 11;

/** Up to 1.4 a drop cap with no `fontSize` was as tall as the line boxes it
 *  spans divided by this, the share of a letter's size its capitals take. */
const CAP_HEIGHT = 0.72;

/**
 * How much larger postext 1.4 set maths than the size it documents:
 * MathJax gives a formula's box in `ex`, one `ex` of its TeX font is
 * 0.442 em (the font's `x_height`), and 1.4 took it as half an em. So
 * 0.5 ÷ 0.442 ≈ 1.1312; a configuration whose `math.fontSizeScale` is
 * multiplied by it sets every formula at the size 1.4 did.
 */
export const LEGACY_MATH_SIZE = 0.5 / 0.442;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A stored `configVersion`: a finite number, anything else counting as
 *  none (written by postext 1.4 or earlier). */
function rulesOf(configVersion: unknown): number {
  return typeof configVersion === 'number' && Number.isFinite(configVersion) ? configVersion : 0;
}

/** A partial `breakBefore` as postext 1.4 resolved it where the default
 *  it filled from was the no-break one, written out in full; undefined
 *  when it already says all it lays out. */
function pinnedBreak(raw: HeadingBreakBeforeConfig | undefined): HeadingBreakBeforeConfig | undefined {
  const enabled = raw?.enabled ?? false;
  if (raw?.enabled !== undefined && (!enabled || raw.parity !== undefined)) return undefined;
  return { ...raw, enabled, ...(enabled && raw?.parity === undefined ? { parity: 'any' as const } : {}) };
}

/**
 * A configuration written for postext 1.4 or earlier, pinned to the heading
 * breaks it laid out then. Up to 1.4 a `headings` object turned the H1 page
 * break off unless it set `levels[0].breakBefore.enabled` (and stripping the
 * defaults dropped an H1 `enabled: false`, so saved and exported
 * configurations never carried one), a partial H1 break took its missing
 * field from the no-break default, and a heading style's `breakBefore`
 * replaced its level's with the same fill. The engine now merges each onto
 * the level's break — H1's being `always-odd` — so those breaks are written
 * out: `enabled: false` on H1, or `parity: 'any'` beside an `enabled: true`.
 * A configuration with no `headings` object, or one that spells every break
 * out in full, is returned as it is (the same object).
 */
export function pinLegacyHeadingBreaks<T extends Partial<PostextConfig>>(config: T): T {
  let out = config;
  const headings = config.headings;
  if (isRecord(headings)) {
    const levels = Array.isArray(headings.levels) ? headings.levels : [];
    const i = levels.findIndex((l) => isRecord(l) && l.level === 1);
    const pin = pinnedBreak(i >= 0 && isRecord(levels[i]!.breakBefore) ? levels[i]!.breakBefore : undefined);
    if (pin) {
      const nextLevels = i >= 0
        ? levels.map((l, k) => (k === i ? { ...l, breakBefore: pin } : l))
        : [...levels, { level: 1, breakBefore: pin }];
      out = { ...out, headings: { ...headings, levels: nextLevels } };
    }
  }
  if (Array.isArray(config.headingStyles)) {
    let changed = false;
    const styles = config.headingStyles.map((style) => {
      if (!isRecord(style) || !isRecord(style.breakBefore)) return style;
      const pin = pinnedBreak(style.breakBefore);
      if (!pin) return style;
      changed = true;
      return { ...style, breakBefore: pin };
    });
    if (changed) out = { ...out, headingStyles: styles };
  }
  return out;
}

function isDimension(v: unknown): v is Dimension {
  return isRecord(v) && typeof v.value === 'number' && typeof v.unit === 'string';
}

/**
 * A configuration written before postext 1.5, pinned to the maths size it
 * laid out then: `math.fontSizeScale` (1 when unset) × {@link
 * LEGACY_MATH_SIZE}. A display formula's margins in `em` or `rem` are
 * lengths of the formula's own size, so they are divided by the same
 * factor and keep the space 1.4 left around the formula. A value that
 * lands on its default is left out (a scale of 0.884 becomes the default
 * 1), and a configuration with maths switched off (`math.enabled: false`,
 * whose formulas are set as their TeX source at the body size) is
 * returned as it is (the same object).
 */
export function pinLegacyMathSize<T extends Partial<PostextConfig>>(config: T): T {
  const math: MathConfig = isRecord(config.math) ? config.math : {};
  if (math.enabled === false) return config;
  const next: MathConfig = { ...math };
  const scale = typeof math.fontSizeScale === 'number' && Number.isFinite(math.fontSizeScale)
    ? math.fontSizeScale
    : DEFAULT_MATH_CONFIG.fontSizeScale;
  const pinnedScale = scale * LEGACY_MATH_SIZE;
  if (pinnedScale === DEFAULT_MATH_CONFIG.fontSizeScale) delete next.fontSizeScale;
  else next.fontSizeScale = pinnedScale;
  for (const key of ['marginTop', 'marginBottom'] as const) {
    const margin = isDimension(math[key]) ? math[key] : DEFAULT_MATH_CONFIG[key];
    if (margin.unit !== 'em' && margin.unit !== 'rem') continue;
    const pinned: Dimension = { ...margin, value: margin.value / LEGACY_MATH_SIZE };
    if (dimensionsEqual(pinned, DEFAULT_MATH_CONFIG[key])) delete next[key];
    else next[key] = pinned;
  }
  return { ...config, math: next };
}

/**
 * A configuration written before postext 1.5, pinned to the space it left
 * under an inline resource: `layout.inlineResourceGap: 'above'`, where 1.4
 * kept the float gap above the resource only and set the text after it at
 * the next grid line. A configuration that names a gap already is returned
 * as it is (the same object).
 */
export function pinLegacyInlineGap<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.inlineResourceGap !== undefined) return config;
  return { ...config, layout: { ...layout, inlineResourceGap: 'above' } };
}

/**
 * A configuration written before postext 1.5, pinned to the room it left
 * for a list under the colon line that introduces it:
 * `bodyText.colonListRoom: 'line'`, where 1.4 took one line of room as
 * enough and a first item the orphan and widow rules keep whole went on
 * to the next column without the colon line. A configuration that names a
 * room already, or turns `keepColonWithList` off, is returned as it is
 * (the same object).
 */
export function pinLegacyColonListRoom<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.colonListRoom !== undefined || bodyText.keepColonWithList === false) return config;
  return { ...config, bodyText: { ...bodyText, colonListRoom: 'line' } };
}

/** A paragraph line ending in a colon (emphasis markers may close after
 *  it) with a list item next, blank lines between them allowed: the lead-in
 *  `keepColonWithList` keeps with its list. */
const COLON_LIST_RE = /:[*_]*[^\S\n]*\n(?:[^\S\n]*\n)*[^\S\n]*(?:[-*+]|\d+[.)])[^\S\n]/;

/**
 * A configuration written before postext 1.5, pinned to the space it left
 * around an inline resource inside a box: `layout.inlineResourceGapInBoxes:
 * false`, where 1.4 set the resource right under the text before it and
 * the text after it right under the resource. A configuration that already
 * says whether boxes keep the gap is returned as it is (the same object).
 */
export function pinLegacyBoxResourceGap<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.inlineResourceGapInBoxes !== undefined) return config;
  return { ...config, layout: { ...layout, inlineResourceGapInBoxes: false } };
}

/**
 * A configuration written before postext 1.5, pinned to the cuts it made in
 * a box that splits: `layout.boxChildSplitMinLines: 1`, where 1.4 cut
 * inside a paragraph or list item wherever each side of the box held its
 * `splitMinLines` lines in all, even when that left one line of the
 * paragraph or item on a side. A configuration that names the setting
 * already is returned as it is (the same object).
 */
export function pinLegacyBoxChildCut<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.boxChildSplitMinLines !== undefined) return config;
  return { ...config, layout: { ...layout, boxChildSplitMinLines: 1 } };
}

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

/** Whether `config` (or the screen overrides of its HTML viewer) declares
 *  a paragraph style, which is all a `:::paragraphs` container is laid out
 *  with. */
function declaresParagraphStyles(config: Partial<PostextConfig>): boolean {
  const has = (c: Record<string, unknown>): boolean => Array.isArray(c.paragraphStyles) && c.paragraphStyles.length > 0;
  if (has(config as Record<string, unknown>)) return true;
  const viewer = (config as Record<string, unknown>).htmlViewer;
  return isRecord(viewer) && isRecord(viewer.overrides) && has(viewer.overrides);
}

/** A `:::paragraphs` opening fence on a line of its own, as the block
 *  parser reads one (the line trimmed). */
const PARAGRAPHS_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*paragraphs[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may hold a `:::paragraphs` container. Unknown content
 *  (undefined) may. */
function mayHaveParagraphContainers(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return PARAGRAPHS_FENCE_LINE_RE.test(content);
  return content.some((text) => PARAGRAPHS_FENCE_LINE_RE.test(text));
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

/** A compound a line may end in: a hyphen between two letters. The
 *  Markdown is read raw; only a paragraph with no inline mark is broken
 *  differently, and there the compound is written as it prints. */
const COMPOUND_RE = /\p{L}-\p{L}/u;

/** Whether markdown may set a compound. Unknown content (undefined) may. */
function mayHaveCompounds(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return COMPOUND_RE.test(content);
  return content.some((text) => COMPOUND_RE.test(text));
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

/** A `:::verse` fence on a line of its own, its attributes, and the poem's
 *  lines up to its closing `:::` (or the end of the text). */
const VERSE_POEM_RE = /^[^\S\n]*:::[^\S\n]*verse[^\S\n]*(\{[^}\n]*\})?[^\S\n]*\n([\s\S]*?)(?:^[^\S\n]*:::[^\S\n]*$|(?![\s\S]))/gm;

/** Whether markdown holds a poem the line layout changes: a `:::verse`
 *  fence naming no layout over lines with no hemistich separator. */
function hasPlainPoem(text: string): boolean {
  if (!text.includes(':::')) return false;
  for (const m of text.matchAll(VERSE_POEM_RE)) {
    if (m[1] && /\blayout\s*=/.test(m[1])) continue;
    const body = m[2] ?? '';
    if (body.trim() !== '' && !body.includes('||') && !/\s\\\\\s/.test(body)) return true;
  }
  return false;
}

/** Whether markdown may hold such a poem. Unknown content (undefined)
 *  may. */
function mayHavePlainPoems(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasPlainPoem(content);
  return content.some(hasPlainPoem);
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

/** Whether markdown holds a poem set line by line: a `:::verse` fence
 *  naming `layout=lines`, or naming no layout over lines with no
 *  hemistich separator, unless the configuration sets such poems as
 *  bayts (`bayt`, `bodyText.verse.layout: 'bayt'`). */
function hasLinePoem(text: string, bayt: boolean): boolean {
  if (!text.includes(':::')) return false;
  for (const m of text.matchAll(VERSE_POEM_RE)) {
    const layout = m[1] ? /\blayout\s*=\s*"?([a-z]*)/.exec(m[1])?.[1] : undefined;
    if (layout === 'lines') return true;
    if (layout && layout !== 'auto') continue;
    const body = m[2] ?? '';
    if (!bayt && body.trim() !== '' && !body.includes('||') && !/\s\\\\\s/.test(body)) return true;
  }
  return false;
}

/** Whether markdown may hold a poem set line by line under `config` (see
 *  {@link hasLinePoem}). Unknown content (undefined) may. */
function mayHaveLinePoems(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  const verse = isRecord(config.bodyText) && isRecord(config.bodyText.verse) ? config.bodyText.verse : {};
  const bayt = verse.layout === 'bayt';
  if (typeof content === 'string') return hasLinePoem(content, bayt);
  return content.some((text) => hasLinePoem(text, bayt));
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

/** Whether markdown holds a line that opens a code fence. */
function hasCodeFence(text: string): boolean {
  if (!text.includes('```') && !text.includes('~~~')) return false;
  return text.split('\n').some((line) => codeFenceOpen(line) !== undefined);
}

/** Whether markdown may hold a code fence. Unknown content (undefined)
 *  may. */
function mayHaveCodeFences(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasCodeFence(content);
  return content.some(hasCodeFence);
}

/** A line that opens a block of its own, which a paragraph's lines never
 *  run into: a heading, a fence, a display formula, a list item, a
 *  resource embed. */
const BLOCK_LINE_RE = /^(?:#{1,6}\s|:::|::resource\b|\$\$|(?:[-*+]|\d+[.)]|[\u0660-\u0669]+[.)]|[\u06f0-\u06f9]+[.)])\s)/;
const LIST_LINE_RE = /^(?:[-*+]|\d+[.)]|[\u0660-\u0669]+[.)]|[\u06f0-\u06f9]+[.)])\s/;

/** Whether markdown holds a forced line break as #620 reads one: in a
 *  paragraph, a quotation or a list item, `\\` before a space and more
 *  text, or a backslash ending a line the block goes on after (a list item
 *  is one line). Inline code and maths, display formulas, headings (whose
 *  `\\` always broke the title) and `:::verse` poems (whose spaced `\\`
 *  cuts a bayt) are passed over. */
function hasForcedBreak(text: string): boolean {
  if (!text.includes('\\')) return false;
  const lines = text.split('\n').map((l) => l.trim());
  let verse = false;
  let display = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (display) {
      if (line.endsWith('$$')) display = false;
      continue;
    }
    if (verse) {
      if (FENCE_CLOSE_RE.test(line)) verse = false;
      continue;
    }
    if (/^:::\s*verse\b/.test(line)) {
      verse = true;
      continue;
    }
    if (line.startsWith('$$')) {
      display = !(line.length > 2 && line.endsWith('$$'));
      continue;
    }
    if (!line.includes('\\') || /^#{1,6}\s/.test(line)) continue;
    const body = line.replace(/^>\s?/, '').replace(/`[^`\n]+?`/g, '').replace(/\$[^$\n]*\$/g, '');
    if (/\\\\[ \t]+\S/.test(body)) return true;
    if (!body.endsWith('\\') || LIST_LINE_RE.test(body)) continue;
    const next = lines[i + 1] ?? '';
    if (next !== '' && !BLOCK_LINE_RE.test(next) && (next.startsWith('>') === line.startsWith('>'))) return true;
  }
  return false;
}

/** Whether markdown may hold a forced line break. Unknown content
 *  (undefined) may. */
function mayHaveForcedBreaks(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return hasForcedBreak(content);
  return content.some(hasForcedBreak);
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

/** A dash a line may end after (see `breaksAfterDash` in
 *  `measure/breakRules.ts`): an em or en dash set closed, a letter, a digit
 *  or closing punctuation before it, and a letter or a digit after it. A
 *  quotation mark before the dash counts only when something that may close
 *  a word stands before it (`"no"—and`, `„nein“—und`, `« non »—et`), not
 *  after a space (`said "—Hola`), where no rule breaks. The Markdown is read
 *  raw, so the inline marks that may touch the dash or the quote count on
 *  either side (`**riddles.**—I`, `*riddles*—and`, `*no*"—and`, a code
 *  span, a `:ref[…]`, an escape). An en dash between two digits, and a
 *  bracket or quote after the dash, which never break, are let through: the
 *  check only has to be safe. */
const CLOSED_DASH_RE = /(?:[\p{L}\p{N}.,;:!?)\]}…*_`~^\\]|[\p{L}\p{N}.,;:!?)\]}…*_`~^\\\u00A0\u202F]["'»”’“«])[\u2013\u2014][\p{L}\p{N}([{¿¡«“‘„"'*_`~^:\\<]/u;

/** Whether markdown may set a dash a line can now end after. Unknown
 *  content (undefined) may. */
function mayHaveClosedDashes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CLOSED_DASH_RE.test(content);
  return content.some((text) => CLOSED_DASH_RE.test(text));
}

/**
 * A configuration written before postext 1.5, pinned to the headings it
 * laid out then: `headings.inlineMarks: false`, where 1.4 printed the text
 * of a heading's `*italic*`, `**bold**` and other marks in the heading's
 * plain style. A configuration that names the setting already is returned
 * as it is (the same object).
 */
export function pinLegacyHeadingMarks<T extends Partial<PostextConfig>>(config: T): T {
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  if (headings.inlineMarks !== undefined) return config;
  return { ...config, headings: { ...headings, inlineMarks: false } };
}

/** The double next to `v`, one step towards `+∞` (`dir` 1) or `−∞`. */
function nextDouble(v: number, dir: 1 | -1): number {
  if (v === 0) return dir * Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, v);
  view.setBigInt64(0, view.getBigInt64(0) + ((v > 0) === (dir > 0) ? 1n : -1n));
  return view.getFloat64(0);
}

/** A length in `unit` that `dimensionToPx` reads back as `px` at `dpi`
 *  (em against `basePx`): the plain conversion, or one of the doubles next
 *  to it when rounding leaves that a hair off. Most sizes read back
 *  exactly; for some unit, dpi and leading combinations no double does, and
 *  the plain conversion is kept, a rounding step or two (1e-14 px) away. */
function lengthOf(px: number, unit: DimensionUnit, dpi: number, basePx: number): Dimension {
  const toPx = (value: number) => dimensionToPx({ value, unit }, dpi, basePx);
  const first = px / toPx(1);
  let up = first;
  let down = first;
  for (let step = 0; step < 16; step++) {
    if (toPx(up) === px) return { value: up, unit };
    if (toPx(down) === px) return { value: down, unit };
    up = nextDouble(up, 1);
    down = nextDouble(down, -1);
  }
  return { value: first, unit };
}

/** The size postext 1.4 set the drop cap of the design text `el` at, when
 *  the cap names none, `dpi` being the document's: the line boxes it spans
 *  over {@link CAP_HEIGHT}, worked out as 1.4 did and written in the unit of
 *  the element's leading (a length) or of its font size (a multiplier of
 *  it). Undefined when that cannot be written out. */
function legacyDropCapSize(el: Record<string, unknown>, dropCap: Record<string, unknown>, dpi: number): Dimension | undefined {
  const lines = Math.max(1, Math.round(Number(dropCap.lines ?? 2)));
  if (!Number.isFinite(lines)) return undefined;
  const fontSize = isDimension(el.fontSize) ? el.fontSize : DEFAULT_TEXT_ELEMENT.fontSize;
  // A design text's size is a length; one in em has nothing to read against.
  if (fontSize.unit === 'em' || fontSize.unit === 'rem') return undefined;
  const fontSizePx = dimensionToPx(fontSize, dpi);
  const leading = resolveDesignLineHeight(el.lineHeight, fontSize);
  const lineHeightPx = leading.lineHeightLength ? dimensionToPx(leading.lineHeightLength, dpi) : fontSizePx * leading.lineHeight;
  const capPx = (lines * lineHeightPx) / CAP_HEIGHT;
  if (!Number.isFinite(capPx) || capPx <= 0) return undefined;
  return lengthOf(capPx, leading.lineHeightLength?.unit ?? fontSize.unit, dpi, fontSizePx);
}

/** `value` with every design text in it — a `kind: 'text'` object whose
 *  `dropCap` names no `fontSize` — given its 1.4 size, wherever it sits;
 *  the same object where nothing changed. */
function pinDropCaps(value: unknown, dpi: number): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const out = pinDropCaps(v, dpi);
      if (out !== v) changed = true;
      return out;
    });
    return changed ? next : value;
  }
  if (!isRecord(value)) return value;
  let out: Record<string, unknown> = value;
  for (const [key, v] of Object.entries(value)) {
    const next = pinDropCaps(v, dpi);
    if (next === v) continue;
    if (out === value) out = { ...value };
    out[key] = next;
  }
  const dropCap = out.dropCap;
  if (out.kind === 'text' && isRecord(dropCap) && dropCap.fontSize === undefined) {
    const size = legacyDropCapSize(out, dropCap, dpi);
    if (size) out = { ...out, dropCap: { ...dropCap, fontSize: size } };
  }
  return out;
}

/**
 * A configuration written before postext 1.5, pinned to the drop caps it
 * laid out then. Up to 1.4 a design text's `dropCap` that named no
 * `fontSize` was as tall as the line boxes it spans over 0.72 (the share of
 * the size its capitals take), so its top stood above the capitals of the
 * first line; today's default brings the two level. Every such drop cap,
 * in whatever design it sits (running heads, heading designs and styles,
 * part pages, the contents' part rows), gets that size written out: in the
 * unit of the element's leading when that is a length, else in the unit of
 * its font size, at the size 1.4 set at the document's `page.dpi` (to the
 * last digit in most cases, and never more than a rounding step or two
 * away). A configuration with none is returned as it is (the same object).
 */
export function pinLegacyDropCapSize<T extends Partial<PostextConfig>>(config: T): T {
  const dpi = isRecord(config.page) && typeof config.page.dpi === 'number' && config.page.dpi > 0
    ? config.page.dpi
    : DEFAULT_PAGE_CONFIG.dpi;
  return pinDropCaps(config, dpi) as T;
}

/** A heading line of markdown, its title in group 1. The block parser
 *  trims a line before it reads a heading, so any indent will do. */
const HEADING_LINE_RE = /^[^\S\n]*#{1,6}[^\S\n]+(.*)$/gm;
/** A mark a heading's title may carry: `*`, `_`, `^`, `~`, `:smallcaps[`
 *  or the `](` of a link. */
const HEADING_MARK_RE = /[*_^~]|:smallcaps\[|\]\(/;
/** The trailing `{…}` attributes of a heading line. */
const HEADING_ATTRS_TAIL_RE = /\s*\{[^{}]*\}\s*$/;

/** Whether markdown may hold a heading whose title carries an inline mark
 *  (its attributes left out). Unknown content (undefined) may. */
function mayHaveHeadingMarks(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  const test = (text: string): boolean => {
    for (const m of text.matchAll(HEADING_LINE_RE)) {
      if (HEADING_MARK_RE.test(m[1]!.replace(HEADING_ATTRS_TAIL_RE, ''))) return true;
    }
    return false;
  };
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** Whether markdown may hold a heading, which is all a paragraph keeps
 *  with. Unknown content (undefined) may. */
function mayHaveHeadings(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  const test = (text: string): boolean => new RegExp(HEADING_LINE_RE.source, 'm').test(text);
  return typeof content === 'string' ? test(content) : content.some(test);
}

/** A `::resource{id="…"}` embed alone on its line, as the block parser
 *  reads one (the line trimmed): a mention in running text or in a code
 *  span embeds nothing. */
const RESOURCE_EMBED_LINE_RE = /^[^\S\n]*::resource[^\S\n]*\{id="[^"\n]+"\}[^\S\n]*$/m;
/** The same, for one line. */
const RESOURCE_EMBED_RE = /^[^\S\n]*::resource[^\S\n]*\{id="[^"\n]+"\}[^\S\n]*$/;
/** A container's opening fence (`:::callout{…}`) and its bare closing
 *  fence, as the block parser reads them (the line trimmed). */
const FENCE_OPEN_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{[^}]*\})?\s*$/;
const FENCE_CLOSE_RE = /^:::\s*$/;

/** A `:::callout` opening fence on a line of its own, as the block parser
 *  reads one (the line trimmed). */
const CALLOUT_FENCE_LINE_RE = /^[^\S\n]*:::[^\S\n]*callout[^\S\n]*(?:\{[^}\n]*\})?[^\S\n]*$/m;

/** Whether markdown may hold a box, which is all that splits by the box
 *  cut rules. Unknown content (undefined) may. */
function mayHaveBoxes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CALLOUT_FENCE_LINE_RE.test(content);
  return content.some((text) => CALLOUT_FENCE_LINE_RE.test(text));
}

/** Whether markdown embeds a resource inside a box: a `::resource` line
 *  while a `:::callout` fence is open. */
function embedsResourceInBox(text: string): boolean {
  if (!RESOURCE_EMBED_LINE_RE.test(text)) return false;
  const open: boolean[] = [];
  let boxes = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence && (KNOWN_CONTAINERS as ReadonlySet<string>).has(fence[1]!)) {
      const box = fence[1] === 'callout';
      open.push(box);
      if (box) boxes++;
    } else if (open.length > 0 && FENCE_CLOSE_RE.test(line)) {
      if (open.pop()) boxes--;
    } else if (boxes > 0 && RESOURCE_EMBED_RE.test(line)) {
      return true;
    }
  }
  return false;
}

/** `MigrateConfigOptions.content` as a string or an array. Both checks
 *  below read it, and an iterator (a generator, a Map's `values()`) can be
 *  walked only once, so the migrations take its texts into an array first. */
function readContent(content: string | Iterable<string> | undefined): string | readonly string[] | undefined {
  return content === undefined || typeof content === 'string' ? content : [...content];
}

/** Whether markdown may embed a resource inline: only a `::resource`
 *  directive on a line of its own does. Unknown content (undefined) may. */
function mayEmbedResources(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return RESOURCE_EMBED_LINE_RE.test(content);
  return content.some((text) => RESOURCE_EMBED_LINE_RE.test(text));
}

/** Whether markdown may embed a resource inside a box. Unknown content
 *  (undefined) may. */
function mayEmbedResourcesInBoxes(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return embedsResourceInBox(content);
  return content.some(embedsResourceInBox);
}

/** Whether markdown may introduce a list with a colon. Unknown content
 *  (undefined) may. */
function mayLeadListWithColon(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return COLON_LIST_RE.test(content);
  return content.some((text) => COLON_LIST_RE.test(text));
}

/** Whether markdown sets maths: a formula is written between `$` signs.
 *  Unknown content (undefined) may. */
function mayHaveMaths(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return content.includes('$');
  return content.some((text) => text.includes('$'));
}

/** The `cjk` of a configuration, `{}` when it has none. */
function cjkOf(config: Partial<PostextConfig>): CjkConfig {
  return isRecord(config.cjk) ? config.cjk : {};
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

/** A book title in brackets (《》 〈〉), or a `:book[…]` title. */
const BOOK_TITLE_RE = /[《〈︽︿]|:book\[/;
/** A circled, parenthesized or full-stop number or letter (①, ⑴, ⒈, ⓐ, ❶,
 *  ➀). */
const CIRCLED_RE = /[\u2460-\u24FF\u2776-\u2793]/;

/** Whether markdown may set a book title. Unknown content (undefined)
 *  may. */
function mayHaveBookTitles(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return BOOK_TITLE_RE.test(content);
  return content.some((text) => BOOK_TITLE_RE.test(text));
}

/** Whether markdown may set a circled number. Unknown content (undefined)
 *  may. */
function mayHaveCircledNumbers(content: string | readonly string[] | undefined): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string') return CIRCLED_RE.test(content);
  return content.some((text) => CIRCLED_RE.test(text));
}

/** Whether a design text may hold CJK: the markdown it prints from (a
 *  heading, an attribute, a running head) or the configuration's own text
 *  (a literal in a design element, a label). Unknown content (undefined)
 *  may. */
function mayHaveCjkDesignText(content: string | readonly string[] | undefined, config: Partial<PostextConfig>): boolean {
  if (content === undefined) return true;
  if (typeof content === 'string' ? hasCJK(content) : content.some(hasCJK)) return true;
  return hasCJK(JSON.stringify(config));
}

export interface MigrateConfigOptions {
  /**
   * The markdown the configuration lays out (a bundle's chapters, a book's),
   * when the caller has it. Maths is written between `$` signs, so text with
   * none sets no formula and its configuration is not given a maths size
   * (see {@link pinLegacyMathSize}); an inline resource is embedded with a
   * `::resource{id="…"}` line, so text with none (a mention in running text
   * or in a code span does not count) is not given the inline gap either
   * (see {@link pinLegacyInlineGap}), nor the box gap when no such line
   * stands inside a `:::callout` (see {@link pinLegacyBoxResourceGap}); a
   * list introduced by a line ending in a colon is what the colon-list room
   * is for, so text with none is not given it (see {@link
   * pinLegacyColonListRoom}); text with no heading whose title carries an
   * inline mark (`*`, `_`, `^`, `~`, `:smallcaps[`, a link) is not given
   * `headings.inlineMarks: false` (see {@link pinLegacyHeadingMarks});
   * text with no `:::callout` is not given the box cut (see {@link
   * pinLegacyBoxChildCut}); text with no em or en dash set closed between
   * words is not given the 1.4 dash breaks (see {@link
   * pinLegacyDashBreaks}); text with no heading is not given the 1.4 split
   * under a heading (see {@link pinLegacyHeadingSplit}); text with no
   * `:::paragraphs` container is not given the 1.4 space under containers
   * (see {@link pinLegacyParagraphContainerSpacing}); and text with no
   * hyphen between two letters is not given the 1.4 compound breaks (see
   * {@link pinLegacyHyphenBreaks}); and text with no `:::verse` poem whose
   * lines carry no hemistich separator is not given the 1.22 verse layout
   * (see {@link pinLegacyVerseLayout}); and text with no backslash ending a
   * line a paragraph goes on after, and no `\\` in running text, is not
   * given the 1.22 literal backslashes (see {@link pinLegacyHardBreaks});
   * and text with no ```` ``` ```` or `~~~` fence is not given the 1.22
   * reading of fences (see {@link pinLegacyCodeBlocks}); and text with no
   * poem set line by line is not given the 1.23 turnovers (see {@link
   * pinLegacyVerseTightening}); and text with no book title is not given
   * the 1.24 title breaks (see {@link pinLegacyTitleBreaks}), text with no
   * circled number not the 1.24 Western circled numbers (see {@link
   * pinLegacyCircledNumbers}), and text with no CJK (in a configuration
   * whose own text holds none) not the 1.24 design text (see {@link
   * pinLegacyDesignText}).
   * That keeps a stored configuration as
   * short as it was. Without it the size is pinned whenever maths is on,
   * and the gaps, the room, the heading marks, the box cut, the dash
   * breaks, the split under a heading, the compound breaks, the verse
   * layout, the literal backslashes and the 1.23 verse turnovers always,
   * and
   * the container space always when the configuration declares a paragraph
   * style.
   * Any iterable of texts will do, a generator or a Map's `values()`
   * included: it is read once.
   */
  content?: string | Iterable<string>;
}

/**
 * A configuration stored under `configVersion` (see {@link CONFIG_VERSION}),
 * in today's terms. One with no version (a number is expected; anything
 * else counts as none) or one older than 3 has its heading breaks pinned by
 * {@link pinLegacyHeadingBreaks}; one older than 4 has its maths size
 * pinned by {@link pinLegacyMathSize}, unless `options.content` shows it
 * sets no maths; one older than 5 has its inline gap pinned by {@link
 * pinLegacyInlineGap}, unless `options.content` shows it embeds no
 * resource; one older than 6 has its heading marks pinned by {@link
 * pinLegacyHeadingMarks}, unless `options.content` shows no heading
 * carries one, its drop caps by {@link pinLegacyDropCapSize}, its
 * colon-list room by {@link pinLegacyColonListRoom}, unless
 * `options.content` shows no list introduced by a colon, and its box gap
 * by {@link pinLegacyBoxResourceGap}, unless `options.content` shows it
 * embeds no resource inside a box, and its box cut by {@link
 * pinLegacyBoxChildCut}, unless `options.content` shows it holds no box;
 * one older than 7 has its dash breaks pinned by {@link
 * pinLegacyDashBreaks}, unless `options.content` shows no closed dash, and
 * its ragged breaking by {@link pinLegacyRaggedBreaking}, when it sets some
 * running text ragged; one older than 8 has its split under a heading
 * pinned by {@link pinLegacyHeadingSplit}, unless `options.content` shows
 * no heading, the space under its `:::paragraphs` containers by {@link
 * pinLegacyParagraphContainerSpacing}, when it declares a paragraph style,
 * unless `options.content` shows no such container, and its compound
 * breaks by {@link pinLegacyHyphenBreaks}, unless `options.content` shows
 * no compound; one older than 9 has its poems with no hemistich separator
 * pinned by {@link pinLegacyVerseLayout}, unless `options.content` shows
 * none, its paragraph styles' indents by {@link pinLegacyPairedIndents},
 * its forced line breaks by {@link pinLegacyHardBreaks}, unless
 * `options.content` shows none, and its code fences by {@link
 * pinLegacyCodeBlocks}, unless `options.content` shows none; one older
 * than 10 has its verse turnovers pinned by {@link
 * pinLegacyVerseTightening}, unless `options.content` shows no poem set
 * line by line, the text elements of its heading and part designs
 * that set no `overflow` by {@link pinLegacyDesignOverflow}; one older
 * than 11 has the balancing of a horizontal page on a character grid
 * pinned by {@link pinLegacyGridBalancing}, and its inline tables by {@link
 * pinLegacyInlineTableSplit}, unless `options.content` shows it embeds no
 * resource, its book titles by {@link pinLegacyTitleBreaks}, unless
 * `options.content` shows none, its circled numbers by {@link
 * pinLegacyCircledNumbers}, unless `options.content` shows none, and its
 * design text by {@link pinLegacyDesignText}, unless neither
 * `options.content` nor the configuration holds CJK text. A current one is returned as it is (the same object).
 * Migrate a stored configuration once and store it again under
 * `CONFIG_VERSION`: the maths pin multiplies a scale, so a configuration
 * read twice under its old number would grow twice.
 */
export function migrateConfig<T extends Partial<PostextConfig>>(
  config: T,
  configVersion: unknown,
  options: MigrateConfigOptions = {},
): T {
  const rules = rulesOf(configVersion);
  let out = rules < HEADING_BREAK_RULES ? pinLegacyHeadingBreaks(config) : config;
  const content = rules < CONFIG_VERSION ? readContent(options.content) : undefined;
  if (rules < MATH_SIZE_RULES && mayHaveMaths(content)) out = pinLegacyMathSize(out);
  if (rules < INLINE_GAP_RULES && mayEmbedResources(content)) out = pinLegacyInlineGap(out);
  if (rules < HEADING_MARKS_RULES && mayHaveHeadingMarks(content)) out = pinLegacyHeadingMarks(out);
  if (rules < DROP_CAP_SIZE_RULES) out = pinLegacyDropCapSize(out);
  if (rules < COLON_LIST_ROOM_RULES && mayLeadListWithColon(content)) out = pinLegacyColonListRoom(out);
  if (rules < BOX_GAP_RULES && mayEmbedResourcesInBoxes(content)) out = pinLegacyBoxResourceGap(out);
  if (rules < BOX_CHILD_CUT_RULES && mayHaveBoxes(content)) out = pinLegacyBoxChildCut(out);
  if (rules < DASH_BREAK_RULES && mayHaveClosedDashes(content)) out = pinLegacyDashBreaks(out);
  if (rules < RAGGED_BREAKING_RULES) out = pinLegacyRaggedBreaking(out);
  if (rules < HEADING_SPLIT_RULES && mayHaveHeadings(content)) out = pinLegacyHeadingSplit(out);
  if (rules < PARAGRAPH_CONTAINER_RULES && mayHaveParagraphContainers(content)) out = pinLegacyParagraphContainerSpacing(out);
  if (rules < HYPHEN_BREAK_RULES && mayHaveCompounds(content)) out = pinLegacyHyphenBreaks(out);
  if (rules < VERSE_LAYOUT_RULES && mayHavePlainPoems(content)) out = pinLegacyVerseLayout(out);
  if (rules < PAIRED_INDENT_RULES) out = pinLegacyPairedIndents(out);
  if (rules < HARD_BREAK_RULES && mayHaveForcedBreaks(content)) out = pinLegacyHardBreaks(out);
  if (rules < CODE_BLOCK_RULES && mayHaveCodeFences(content)) out = pinLegacyCodeBlocks(out);
  if (rules < VERSE_TIGHTEN_RULES && mayHaveLinePoems(content, out)) out = pinLegacyVerseTightening(out);
  if (rules < DESIGN_OVERFLOW_RULES) out = pinLegacyDesignOverflow(out);
  if (rules < GRID_BALANCING_RULES) out = pinLegacyGridBalancing(out);
  if (rules < TITLE_BREAK_RULES && mayHaveBookTitles(content)) out = pinLegacyTitleBreaks(out);
  if (rules < CIRCLED_NUMBER_RULES && mayHaveCircledNumbers(content)) out = pinLegacyCircledNumbers(out);
  if (rules < DESIGN_TEXT_RULES && mayHaveCjkDesignText(content, out)) out = pinLegacyDesignText(out);
  if (rules < INLINE_TABLE_SPLIT_RULES && mayEmbedResources(content)) out = pinLegacyInlineTableSplit(out);
  return out;
}

/**
 * A bundle's configuration in today's terms: `base` (the reader's own)
 * under the manifest's `config` and the locale's overrides, both stored
 * under `configVersion`. Top-level keys replace one another wholesale, so
 * the heading breaks are pinned layer by layer (the base's are taken as
 * they are) and the maths size once, on the `math` the layers leave in
 * force — the size 1.4 set this bundle's formulas at, whichever layer
 * named it, the base included when neither the manifest nor the locale
 * names one. The inline gap, the box gap and the box cut are pinned the
 * same way, on the `layout` in force, the colon-list room, the dash
 * breaks, the compound breaks, the ragged breaking and the space under
 * `:::paragraphs` containers on the `bodyText` in force (the ragged
 * breaking when the merged configuration sets some running text ragged,
 * the container space when it declares a paragraph style), the heading
 * marks and the split under a heading on the `headings` in force, the
 * drop caps and the overflow of heading and part design texts wherever
 * they sit in the merged configuration, the balancing of a horizontal
 * character grid on the merged `cjk`, `layout` and `headings`, the
 * inline tables on the `tableStyle` in force, and the book titles, the
 * circled numbers and the design text on the `cjk` in force.
 * @internal `readBundle`'s; hosts call {@link migrateConfig}.
 */
export function migrateBundleConfig(
  base: PostextConfig,
  layers: readonly PostextConfig[],
  configVersion: unknown,
  options: MigrateConfigOptions = {},
): PostextConfig {
  const rules = rulesOf(configVersion);
  let merged: PostextConfig = { ...base };
  for (const layer of layers) {
    Object.assign(merged, rules < HEADING_BREAK_RULES ? pinLegacyHeadingBreaks(layer) : layer);
  }
  const content = rules < CONFIG_VERSION ? readContent(options.content) : undefined;
  if (rules < MATH_SIZE_RULES && mayHaveMaths(content)) merged = pinLegacyMathSize(merged);
  if (rules < INLINE_GAP_RULES && mayEmbedResources(content)) merged = pinLegacyInlineGap(merged);
  if (rules < HEADING_MARKS_RULES && mayHaveHeadingMarks(content)) merged = pinLegacyHeadingMarks(merged);
  if (rules < DROP_CAP_SIZE_RULES) merged = pinLegacyDropCapSize(merged);
  if (rules < COLON_LIST_ROOM_RULES && mayLeadListWithColon(content)) merged = pinLegacyColonListRoom(merged);
  if (rules < BOX_GAP_RULES && mayEmbedResourcesInBoxes(content)) merged = pinLegacyBoxResourceGap(merged);
  if (rules < BOX_CHILD_CUT_RULES && mayHaveBoxes(content)) merged = pinLegacyBoxChildCut(merged);
  if (rules < DASH_BREAK_RULES && mayHaveClosedDashes(content)) merged = pinLegacyDashBreaks(merged);
  if (rules < RAGGED_BREAKING_RULES) merged = pinLegacyRaggedBreaking(merged);
  if (rules < HEADING_SPLIT_RULES && mayHaveHeadings(content)) merged = pinLegacyHeadingSplit(merged);
  if (rules < PARAGRAPH_CONTAINER_RULES && mayHaveParagraphContainers(content)) merged = pinLegacyParagraphContainerSpacing(merged);
  if (rules < HYPHEN_BREAK_RULES && mayHaveCompounds(content)) merged = pinLegacyHyphenBreaks(merged);
  if (rules < VERSE_LAYOUT_RULES && mayHavePlainPoems(content)) merged = pinLegacyVerseLayout(merged);
  if (rules < PAIRED_INDENT_RULES) merged = pinLegacyPairedIndents(merged);
  if (rules < HARD_BREAK_RULES && mayHaveForcedBreaks(content)) merged = pinLegacyHardBreaks(merged);
  if (rules < CODE_BLOCK_RULES && mayHaveCodeFences(content)) merged = pinLegacyCodeBlocks(merged);
  if (rules < VERSE_TIGHTEN_RULES && mayHaveLinePoems(content, merged)) merged = pinLegacyVerseTightening(merged);
  if (rules < DESIGN_OVERFLOW_RULES) merged = pinLegacyDesignOverflow(merged);
  if (rules < GRID_BALANCING_RULES) merged = pinLegacyGridBalancing(merged);
  if (rules < TITLE_BREAK_RULES && mayHaveBookTitles(content)) merged = pinLegacyTitleBreaks(merged);
  if (rules < CIRCLED_NUMBER_RULES && mayHaveCircledNumbers(content)) merged = pinLegacyCircledNumbers(merged);
  if (rules < DESIGN_TEXT_RULES && mayHaveCjkDesignText(content, merged)) merged = pinLegacyDesignText(merged);
  if (rules < INLINE_TABLE_SPLIT_RULES && mayEmbedResources(content)) merged = pinLegacyInlineTableSplit(merged);
  return merged;
}
