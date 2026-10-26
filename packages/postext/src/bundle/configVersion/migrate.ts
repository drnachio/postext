// migrateConfig and migrateBundleConfig: read the stored number and apply
// each pin it is older than (#1276: split out of configVersion.ts).
import type { PostextConfig } from '../../types.js';
import { mergeConfigLayers, type ConfigOverride } from '../../defaults/configLayers.js';
import { readContent, mayHaveMaths, mayEmbedResources, mayHaveHeadingMarks, mayLeadListWithColon, mayEmbedResourcesInBoxes, mayHaveBoxes, mayHaveClosedDashes, mayHaveHeadings, mayHaveParagraphContainers, mayHaveCompounds, mayHavePlainPoems, mayHaveForcedBreaks, mayHaveCodeFences, mayHaveLinePoems, mayHaveBookTitles, mayHaveCircledNumbers, mayHaveCjkDesignText, mayHaveColumnGroups, setsPageSpanHeading, mayHaveFloats, mayHaveOffGridLines, mayHaveIndexes, mayHaveNotes, mayHaveCjkText, mayHaveRefs, mayHaveComics, mayHaveTaskItems, mayHaveMarks, mayHaveScoreFences } from './contentChecks.js';
import { pinLegacyLooseOrder, pinLegacyWideFloatStretch, pinLegacyTrailingStep, pinLegacyIndexGroupSplit, pinLegacyGridBreakRules, pinLegacyNoteBreaks, pinLegacyLatinSpacingEdge, pinLegacyInlineCaptionSide, pinLegacyRefLabelBreaks, pinLegacyBalloonPlacement, pinLegacyScriptContext, pinLegacyShapingLanguage, pinLegacyTaskBox, pinLegacyBoxParagraphStyles, pinLegacyMarkRadius, pinLegacySlashBreaks, pinLegacyScoreFences } from './pins12To20.js';
import { pinLegacyHeadingBreaks, pinLegacyMathSize, pinLegacyInlineGap, pinLegacyHeadingMarks, pinLegacyDropCapSize, pinLegacyColonListRoom, pinLegacyBoxResourceGap, pinLegacyBoxChildCut } from './pins3To6.js';
import { pinLegacyDashBreaks, pinLegacyRaggedBreaking, pinLegacyHeadingSplit, pinLegacyParagraphContainerSpacing, pinLegacyHyphenBreaks, pinLegacyVerseLayout, pinLegacyPairedIndents, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyTitleBreaks, pinLegacyCircledNumbers, pinLegacyDesignText, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats } from './pins7To11.js';
import { HEADING_BREAK_RULES, CONFIG_VERSION, MATH_SIZE_RULES, INLINE_GAP_RULES, HEADING_MARKS_RULES, DROP_CAP_SIZE_RULES, COLON_LIST_ROOM_RULES, BOX_GAP_RULES, BOX_CHILD_CUT_RULES, DASH_BREAK_RULES, RAGGED_BREAKING_RULES, HEADING_SPLIT_RULES, PARAGRAPH_CONTAINER_RULES, HYPHEN_BREAK_RULES, VERSE_LAYOUT_RULES, PAIRED_INDENT_RULES, HARD_BREAK_RULES, CODE_BLOCK_RULES, VERSE_TIGHTEN_RULES, DESIGN_OVERFLOW_RULES, GRID_BALANCING_RULES, TITLE_BREAK_RULES, CIRCLED_NUMBER_RULES, DESIGN_TEXT_RULES, INLINE_TABLE_SPLIT_RULES, FLOW_COLUMNS_RULES, OPENER_HEAD_FLOAT_RULES, LOOSE_ORDER_RULES, WIDE_FLOAT_STRETCH_RULES, TRAILING_STEP_RULES, INDEX_GROUP_SPLIT_RULES, GRID_BREAK_RULES, NOTE_BREAK_RULES, LATIN_SPACING_EDGE_RULES, INLINE_CAPTION_SIDE_RULES, REF_LABEL_BREAK_RULES, BALLOON_PLACEMENT_RULES, SCRIPT_CONTEXT_RULES, SHAPING_LANGUAGE_RULES, TASK_BOX_RULES, BOX_PARAGRAPH_STYLE_RULES, MARK_RADIUS_RULES, SLASH_BREAK_RULES, SCORE_FENCE_RULES, LOCALE_LAYER_RULES } from './rules.js';

/** A stored `configVersion`: a finite number, anything else counting as
 *  none (written by postext 1.4 or earlier). */
function rulesOf(configVersion: unknown): number {
  return typeof configVersion === 'number' && Number.isFinite(configVersion) ? configVersion : 0;
}

export interface MigrateConfigOptions {
  /**
   * The markdown the configuration lays out (a bundle's chapters, a book's),
   * when the caller has it. Most pins are there for something the text
   * sets (maths for {@link pinLegacyMathSize}, a `::resource{id="…"}` line
   * for {@link pinLegacyInlineGap}, a `:::callout` for {@link
   * pinLegacyBoxChildCut}, a heading for {@link pinLegacyHeadingSplit}, a
   * task item for {@link pinLegacyTaskBox}…): a pin the content shows
   * nothing for is not given, which keeps a stored configuration as short
   * as it was. {@link migrateConfig} says what each pin looks for; a few
   * read the configuration too (CJK in its design text, a note it sets as
   * warichu, a page-span heading, a bayt verse layout), and the pins that
   * look for nothing in the text are given whatever it holds (the heading
   * breaks, the drop-cap sizes, the ragged breaking, the paired indents,
   * the design overflow, the grid balancing and break rules, the script
   * context, the shaping language). Without it every pin the stamp calls for is given, each
   * still under the conditions on the configuration it names.
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
 * resource, its `:::columns` groups by {@link pinLegacyFlowColumns},
 * unless `options.content` shows none, its book titles by {@link pinLegacyTitleBreaks}, unless
 * `options.content` shows none, its circled numbers by {@link
 * pinLegacyCircledNumbers}, unless `options.content` shows none, and its
 * design text by {@link pinLegacyDesignText}, unless neither
 * `options.content` nor the configuration holds CJK text, and the slots
 * under its page-span openers by {@link pinLegacyOpenerHeadFloats}, when
 * it sets a heading level or style with `span: 'page'`, unless
 * `options.content` shows no heading; one older than 12 has the order of
 * its balancing levers pinned by {@link pinLegacyLooseOrder}, when it
 * balances its columns and lets a heading take more than two lines, unless
 * `options.content` shows no heading, and the after-float lever under a
 * float over several columns by {@link pinLegacyWideFloatStretch}, when it
 * balances its columns, unless `options.content` shows no float, the unit
 * of the level cut of its closing bands by {@link pinLegacyTrailingStep},
 * when it balances its columns, unless `options.content` shows prose and
 * headings only, and the
 * breaks inside the groups of its indexes by {@link
 * pinLegacyIndexGroupSplit}, unless `options.content` shows no `:::index`;
 * it also has the widow and
 * orphan rules of a page on a character grid pinned by {@link
 * pinLegacyGridBreakRules}, the breaks inside its two-row notes by
 * {@link pinLegacyNoteBreaks}, unless neither `options.content` nor the
 * configuration shows a note, and the sides of a Western word that take
 * the Han–Latin space in the Japan region by {@link
 * pinLegacyLatinSpacingEdge}, unless `options.content` shows no kana or
 * kanji, and the caption of a resource set in the text of a `oneAndHalf`
 * layout by {@link pinLegacyInlineCaptionSide}, unless `options.content`
 * shows it embeds no resource, and the labels of its cross-references kept whole by {@link
 * pinLegacyRefLabelBreaks}, unless `options.content` shows no reference,
 * and its comic balloons placed as 1.27 placed them by {@link
 * pinLegacyBalloonPlacement}, unless `options.content` shows no comic page
 * or strip, and its words with no letter shaped alone by {@link
 * pinLegacyScriptContext}; one older than 13 has the box of its task items
 * set as a character by {@link pinLegacyTaskBox}, unless `options.content`
 * shows no task item; one older than 14 has its text shaped in the host's
 * language by {@link pinLegacyShapingLanguage}, unless it names the
 * language its text is shaped in; one older than 17 has the type of its
 * paragraph styles inside a box pinned by {@link
 * pinLegacyBoxParagraphStyles}, when it declares a paragraph style; one
 * older than 18 has the rounded ends of its highlight bands pinned by
 * {@link pinLegacyMarkRadius}, unless neither `options.content` nor the
 * configuration shows a `:mark[…]`; one older than 19 has its breaks at a
 * slash pinned by {@link pinLegacySlashBreaks}.
 * A current one is returned as it is (the same object).
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
  if (rules < FLOW_COLUMNS_RULES && mayHaveColumnGroups(content)) out = pinLegacyFlowColumns(out);
  if (rules < OPENER_HEAD_FLOAT_RULES && setsPageSpanHeading(out) && mayHaveHeadings(content)) out = pinLegacyOpenerHeadFloats(out);
  if (rules < LOOSE_ORDER_RULES && mayHaveHeadings(content)) out = pinLegacyLooseOrder(out);
  if (rules < WIDE_FLOAT_STRETCH_RULES && mayHaveFloats(content)) out = pinLegacyWideFloatStretch(out);
  if (rules < TRAILING_STEP_RULES && mayHaveOffGridLines(content)) out = pinLegacyTrailingStep(out);
  if (rules < INDEX_GROUP_SPLIT_RULES && mayHaveIndexes(content)) out = pinLegacyIndexGroupSplit(out);
  if (rules < GRID_BREAK_RULES) out = pinLegacyGridBreakRules(out);
  if (rules < NOTE_BREAK_RULES && mayHaveNotes(content, out)) out = pinLegacyNoteBreaks(out);
  if (rules < LATIN_SPACING_EDGE_RULES && mayHaveCjkText(content)) out = pinLegacyLatinSpacingEdge(out);
  if (rules < INLINE_CAPTION_SIDE_RULES && mayEmbedResources(content)) out = pinLegacyInlineCaptionSide(out);
  if (rules < REF_LABEL_BREAK_RULES && mayHaveRefs(content)) out = pinLegacyRefLabelBreaks(out);
  if (rules < BALLOON_PLACEMENT_RULES && mayHaveComics(content)) out = pinLegacyBalloonPlacement(out);
  if (rules < SCRIPT_CONTEXT_RULES) out = pinLegacyScriptContext(out);
  if (rules < SHAPING_LANGUAGE_RULES) out = pinLegacyShapingLanguage(out);
  if (rules < TASK_BOX_RULES && mayHaveTaskItems(content)) out = pinLegacyTaskBox(out);
  if (rules < BOX_PARAGRAPH_STYLE_RULES) out = pinLegacyBoxParagraphStyles(out);
  // COMPOSED_PAGES_RULES (15, #853) and CONNECTOR_RULES (16, #1056): new
  // keys only, nothing to pin.
  if (rules < MARK_RADIUS_RULES && mayHaveMarks(content, out)) out = pinLegacyMarkRadius(out);
  if (rules < SLASH_BREAK_RULES) out = pinLegacySlashBreaks(out);
  if (rules < SCORE_FENCE_RULES && mayHaveScoreFences(content)) out = pinLegacyScoreFences(out);
  return out;
}

/**
 * A bundle's configuration in today's terms: `base` (the reader's own)
 * under the manifest's `config` and the locale's overrides, both stored
 * under `configVersion`. The manifest's top-level keys replace the base's
 * whole; the locale's override is merged over them field by field
 * ({@link mergeConfigLayers}) when the bundle was written for rules 21 or
 * later, and replaces them key by key when it is older. So
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
 * inline tables on the `tableStyle` in force, the `:::columns` groups and
 * the slots under a page-span opener on the `layout` in force (the slots
 * when the merged configuration sets a page-span heading), and the book
 * titles, the circled numbers and the design text on the `cjk` in force,
 * the order of the balancing levers and the after-float lever under a
 * float over several columns on the `headings` in force (when the
 * merged configuration balances its columns), with the unit of the level
 * cut of a closing band, the breaks inside the groups
 * of an index on the `index` in force,
 * and the widow and orphan rules of a character grid on the merged `cjk`
 * and `bodyText`, and the breaks inside two-row notes and the sides of a
 * Western word that take the Han–Latin space (in the Japan region, read
 * from the merged `cjk`, `locale` and hyphenation locale) on the `cjk` in
 * force, the side caption of a resource set in the text on the `layout` in
 * force, and the labels of cross-references on the `crossRefs` in force,
 * and the shaping of words with no letter and the language the text is
 * shaped in on the `bodyText` in force, and the box of a task item on the
 * `unorderedLists` in force, the type of paragraph styles inside a box
 * on the `bodyText` in force (when the merged configuration declares a
 * paragraph style), the ends of the highlight bands on the
 * `markStyles` in force, and the breaks at a slash on the `bodyText` in
 * force.
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
  layers.forEach((layer, i) => {
    if (i > 0 && rules >= LOCALE_LAYER_RULES) merged = mergeConfigLayers(merged, layer as ConfigOverride);
    else Object.assign(merged, rules < HEADING_BREAK_RULES ? pinLegacyHeadingBreaks(layer) : layer);
  });
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
  if (rules < FLOW_COLUMNS_RULES && mayHaveColumnGroups(content)) merged = pinLegacyFlowColumns(merged);
  if (rules < OPENER_HEAD_FLOAT_RULES && setsPageSpanHeading(merged) && mayHaveHeadings(content)) merged = pinLegacyOpenerHeadFloats(merged);
  if (rules < LOOSE_ORDER_RULES && mayHaveHeadings(content)) merged = pinLegacyLooseOrder(merged);
  if (rules < WIDE_FLOAT_STRETCH_RULES && mayHaveFloats(content)) merged = pinLegacyWideFloatStretch(merged);
  if (rules < TRAILING_STEP_RULES && mayHaveOffGridLines(content)) merged = pinLegacyTrailingStep(merged);
  if (rules < INDEX_GROUP_SPLIT_RULES && mayHaveIndexes(content)) merged = pinLegacyIndexGroupSplit(merged);
  if (rules < GRID_BREAK_RULES) merged = pinLegacyGridBreakRules(merged);
  if (rules < NOTE_BREAK_RULES && mayHaveNotes(content, merged)) merged = pinLegacyNoteBreaks(merged);
  if (rules < LATIN_SPACING_EDGE_RULES && mayHaveCjkText(content)) merged = pinLegacyLatinSpacingEdge(merged);
  if (rules < INLINE_CAPTION_SIDE_RULES && mayEmbedResources(content)) merged = pinLegacyInlineCaptionSide(merged);
  if (rules < REF_LABEL_BREAK_RULES && mayHaveRefs(content)) merged = pinLegacyRefLabelBreaks(merged);
  if (rules < BALLOON_PLACEMENT_RULES && mayHaveComics(content)) merged = pinLegacyBalloonPlacement(merged);
  if (rules < SCRIPT_CONTEXT_RULES) merged = pinLegacyScriptContext(merged);
  if (rules < SHAPING_LANGUAGE_RULES) merged = pinLegacyShapingLanguage(merged);
  if (rules < TASK_BOX_RULES && mayHaveTaskItems(content)) merged = pinLegacyTaskBox(merged);
  if (rules < BOX_PARAGRAPH_STYLE_RULES) merged = pinLegacyBoxParagraphStyles(merged);
  // COMPOSED_PAGES_RULES (15, #853) and CONNECTOR_RULES (16, #1056): new
  // keys only, nothing to pin.
  if (rules < MARK_RADIUS_RULES && mayHaveMarks(content, merged)) merged = pinLegacyMarkRadius(merged);
  if (rules < SLASH_BREAK_RULES) merged = pinLegacySlashBreaks(merged);
  if (rules < SCORE_FENCE_RULES && mayHaveScoreFences(content)) merged = pinLegacyScoreFences(merged);
  return merged;
}
