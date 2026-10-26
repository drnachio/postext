// Pins for configurations stored under rules 12 to 20: balancing levers,
// index and note breaks, grid widows, Latin spacing, captions, references,
// balloons, shaping, task boxes, box styles, highlights, slashes and scores
// (#1276: split out of configVersion.ts).
import type { PostextConfig, HeadingsConfig, IndexConfig, BodyTextConfig, LayoutConfig, UnorderedListsConfig, Dimension, ScoreStyleConfig } from '../../types.js';
import { DEFAULT_MARK_STYLES } from '../../defaults/text/markStyles.js';
import { avoidOrphansByDefault } from '../../defaults/text/bodyText.js';
import { balancingOnByDefault, DEFAULT_COLUMN_BALANCING } from '../../defaults/structure/headings.js';
import { cjkRegionOfConfig } from '../../defaults/text/cjk.js';
import { isRecord, cjkOf, declaresParagraphStyles } from './contentChecks.js';

/** Whether `config` balances its columns: what it says, else the default
 *  of its document ({@link balancingOnByDefault}). */
function balancesColumns(config: Partial<PostextConfig>): boolean {
  const balancing = isRecord(config.headings) && isRecord(config.headings.balancing) ? config.headings.balancing : {};
  if (balancing.enabled !== undefined) return balancing.enabled === true;
  return balancingOnByDefault(config as PostextConfig);
}

/**
 * A configuration written before #707 (postext 1.27 or earlier), pinned to
 * the order its columns were balanced in: `headings.balancing.
 * maxLinesBeforeLoose` gets the configuration's own `maxLinesPerHeading`
 * (4 when it sets none), so a heading takes all its lines before the list
 * ends, the displays, the float bands and the loose paragraphs are tried,
 * where today it takes two. A configuration that does not balance its
 * columns, that sets the key, or whose headings take two lines or fewer
 * (the order then changes nothing) is returned as it is (the same object).
 */
export function pinLegacyLooseOrder<T extends Partial<PostextConfig>>(config: T): T {
  if (!balancesColumns(config)) return config;
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  const balancing = isRecord(headings.balancing) ? headings.balancing : {};
  if (balancing.maxLinesBeforeLoose !== undefined) return config;
  const cap = typeof balancing.maxLinesPerHeading === 'number' ? balancing.maxLinesPerHeading : DEFAULT_COLUMN_BALANCING.maxLinesPerHeading;
  if (cap <= DEFAULT_COLUMN_BALANCING.maxLinesBeforeLoose) return config;
  return { ...config, headings: { ...headings, balancing: { ...balancing, maxLinesBeforeLoose: cap } } };
}

/**
 * A configuration written before #708 (postext 1.27 or earlier), pinned to
 * the way 1.27 stretched a column under a float that stands over several
 * columns: `headings.balancing.stretchAfterWideFloats: 'always'`, so the
 * column takes its after-float line as under any float, where today it
 * moves only with the others under the float or to end flush. A
 * configuration that does not balance its columns, that turns
 * `stretchAfterFloats` off or that sets the key is returned as it is (the
 * same object).
 */
export function pinLegacyWideFloatStretch<T extends Partial<PostextConfig>>(config: T): T {
  if (!balancesColumns(config)) return config;
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  const balancing = isRecord(headings.balancing) ? headings.balancing : {};
  if (balancing.stretchAfterWideFloats !== undefined || balancing.stretchAfterFloats === false) return config;
  return { ...config, headings: { ...headings, balancing: { ...balancing, stretchAfterWideFloats: 'always' } } };
}

/**
 * A configuration written before #711 (postext 1.27 or earlier), pinned to
 * the way 1.27 cut a closing band level: `headings.balancing.trailingStep:
 * 'grid'`, every cut a whole number of baseline-grid lines, where today a
 * band whose text is set on a leading of its own is cut by lines of that
 * leading. A configuration that does not balance its columns, that turns
 * `trailing` and `beforeSpan` both off or that sets the key is returned as
 * it is (the same object).
 */
export function pinLegacyTrailingStep<T extends Partial<PostextConfig>>(config: T): T {
  if (!balancesColumns(config)) return config;
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  const balancing = isRecord(headings.balancing) ? headings.balancing : {};
  if (balancing.trailingStep !== undefined || (balancing.trailing === false && balancing.beforeSpan === false)) return config;
  return { ...config, headings: { ...headings, balancing: { ...balancing, trailingStep: 'grid' } } };
}

/**
 * A configuration written before #712 (postext 1.27 or earlier), pinned to
 * the way 1.27 broke an index between columns: `index.groups.
 * splitMinEntries: 1`, so a column may end between any two entries of a
 * group, where today two of them stay and two go on. A configuration that
 * sets the key is returned as it is (the same object).
 */
export function pinLegacyIndexGroupSplit<T extends Partial<PostextConfig>>(config: T): T {
  const index: IndexConfig = isRecord(config.index) ? config.index : {};
  const groups = isRecord(index.groups) ? index.groups : {};
  if (groups.splitMinEntries !== undefined) return config;
  return { ...config, index: { ...index, groups: { ...groups, splitMinEntries: 1 } } };
}

/**
 * A configuration written before #717 (postext 1.27 or earlier), pinned to
 * the break rules it laid out with on a character grid: a config with
 * `cjk.grid.enabled` gets `bodyText.avoidWidows: true`, and in the Japan
 * region `bodyText.avoidOrphans: true` too, each where it does not set the
 * key, where today the first is off by default on a grid and the second
 * in the Japan region ({@link avoidOrphansByDefault}; a Chinese grid keeps
 * it on, so nothing is written there). Any other configuration is
 * returned as it is (the same object).
 */
export function pinLegacyGridBreakRules<T extends Partial<PostextConfig>>(config: T): T {
  if (!isRecord(config.cjk) || !isRecord(config.cjk.grid) || config.cjk.grid.enabled !== true) return config;
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  const widows = bodyText.avoidWidows === undefined;
  const orphans = bodyText.avoidOrphans === undefined && !avoidOrphansByDefault(config as PostextConfig);
  if (!widows && !orphans) return config;
  return {
    ...config,
    bodyText: {
      ...bodyText,
      ...(widows ? { avoidWidows: true } : {}),
      ...(orphans ? { avoidOrphans: true } : {}),
    },
  };
}

/**
 * A configuration written before #729 (postext 1.27 or earlier), pinned to
 * the caption 1.27 gave a resource set in the text: `layout.inlineCaptionSide:
 * false` on a `oneAndHalf` layout that does not set the key, so
 * `placement.captionSide` acts on column floats only and the caption of an
 * inline embed stays under it, where today it goes to the float-only side
 * column. Any other configuration is returned as it is (the same object).
 */
export function pinLegacyInlineCaptionSide<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.layoutType !== 'oneAndHalf' || layout.inlineCaptionSide !== undefined) return config;
  return { ...config, layout: { ...layout, inlineCaptionSide: false } };
}

/**
 * A configuration written before #720 (postext 1.27 or earlier), pinned to
 * the way 1.27 broke a line inside a two-row note: `cjk.warichu.minChars:
 * 1`, so a break may leave one character of the note at the end of a line
 * or at the head of the next, where today two stand on either side. A
 * configuration that sets `warichu.minChars` is returned as it is (the
 * same object).
 */
export function pinLegacyNoteBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const cjk = cjkOf(config);
  const warichu = isRecord(cjk.warichu) ? cjk.warichu : {};
  if (warichu.minChars !== undefined) return config;
  return { ...config, cjk: { ...cjk, warichu: { ...warichu, minChars: 1 } } };
}

/**
 * A configuration written before #721 (postext 1.27 or earlier), pinned to
 * the sides of a Western word 1.27 set the Han–Latin space on:
 * `cjk.latinSpacingEdge: 'letters'` on a configuration that resolves to
 * the Japan region ({@link cjkRegionOfConfig}) and does not set the key,
 * where today such a document also sets the space on a side that ends in
 * a bracket or a sign (`normalize()関数`). A Chinese document keeps
 * `'letters'` by default, and any other configuration is returned as it is
 * (the same object).
 */
export function pinLegacyLatinSpacingEdge<T extends Partial<PostextConfig>>(config: T): T {
  const cjk = cjkOf(config);
  if (cjk.latinSpacingEdge !== undefined || cjkRegionOfConfig(config as PostextConfig) !== 'japan') return config;
  return { ...config, cjk: { ...cjk, latinSpacingEdge: 'letters' } };
}

/**
 * A configuration written before #702 (postext 1.27 or earlier), pinned to
 * the way it set a cross-reference: `crossRefs.breakLabels: false`, every
 * label one word no line breaks inside, where today a label of words (the
 * text of a `[words]{#id}` anchor, a title, a `text="…"` override) breaks
 * at its spaces and those spaces stretch with the line. A configuration
 * that names the setting already is returned as it is (the same object).
 */
export function pinLegacyRefLabelBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const crossRefs: NonNullable<PostextConfig['crossRefs']> = isRecord(config.crossRefs) ? config.crossRefs : {};
  if (crossRefs.breakLabels !== undefined) return config;
  return { ...config, crossRefs: { ...crossRefs, breakLabels: false } };
}

/**
 * A configuration written before #728 (postext 1.27 or earlier), pinned to
 * the way it placed its comic balloons: `comics.lettering.strictPlacement:
 * false`, so a balloon reshaped to fit its panel may part a Chinese word
 * as it did, where today such a shape pays for the cut and the placement
 * looks elsewhere first. A configuration that names the setting already is
 * returned as it is (the same object).
 */
export function pinLegacyBalloonPlacement<T extends Partial<PostextConfig>>(config: T): T {
  const comics: NonNullable<PostextConfig['comics']> = isRecord(config.comics) ? config.comics : {};
  const lettering: NonNullable<NonNullable<PostextConfig['comics']>['lettering']> = isRecord(comics.lettering) ? comics.lettering : {};
  if (lettering.strictPlacement !== undefined) return config;
  return { ...config, comics: { ...comics, lettering: { ...lettering, strictPlacement: false } } };
}

/**
 * A configuration written before #725 (postext 1.27 or earlier), pinned to
 * the way it shaped a word with no letter (`46.`, `1367)`):
 * `bodyText.scriptContext: false`, each such word shaped alone, in the
 * script the browser that measures it and the PDF's shaper pick, where
 * today it takes the script of the text around it. Every such
 * configuration gets it: the rule acts in a face that draws its
 * punctuation by script, and which faces a document loads is not known
 * here. A configuration that names the setting already is returned as it
 * is (the same object).
 */
export function pinLegacyScriptContext<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: NonNullable<PostextConfig['bodyText']> = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.scriptContext !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, scriptContext: false } };
}

/**
 * A configuration written before #770 (postext 1.29 or earlier), pinned to
 * the language its text was shaped in: `bodyText.shapingLanguage: 'host'`,
 * the measuring contexts left with the language of the page that hosts
 * the layout (none in a worker), the canvas painting in that same
 * language, and only a Chinese, Japanese, Korean or right-to-left
 * document declared and embedded in its own, where from postext 1.30 a
 * document is measured, painted and embedded in its own language. Up to
 * 1.28 there was no other way; 1.29.1 and 1.29.2 had the setting with the
 * host's as its default. Every such configuration gets it: a face answers
 * with other glyphs under a language, and which faces a document loads is
 * not known here. The rules that measure a text as it is painted (one
 * width for a string, right-to-left words, the parts of a broken word,
 * the runs of a design text, the PDF's shaping word by word and its
 * choice of file) apply only to a document shaped in its own language, so
 * a pinned one keeps every width and its PDF. A configuration that names
 * the setting already is returned as it is (the same object): `'host'`,
 * or `'document'`, which postext 1.29.1 and 1.29.2 stored for a document
 * that asked for it. One stored under 13 with no value was laid out in
 * the host's language by 1.29.1 and 1.29.2, and in the document's by
 * 1.29.0, whose canvas and PDF did not follow that measure: it reads with
 * the host's too. One stored under 14 with no value takes the default,
 * the document's.
 */
export function pinLegacyShapingLanguage<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: NonNullable<PostextConfig['bodyText']> = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.shapingLanguage !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, shapingLanguage: 'host' } };
}

/**
 * A configuration written before #1119 (postext 1.51 or earlier), pinned to
 * the type its paragraph styles took inside a box:
 * `bodyText.paragraphStylesInBoxes: 'document'`, the face, size, leading,
 * weights and colour a style leaves unset taken from the document's body
 * text, where today they are the box's. A configuration that names the
 * setting already, or declares no paragraph style (in the configuration or
 * in its HTML viewer's overrides), is returned as it is (the same object).
 */
export function pinLegacyBoxParagraphStyles<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.paragraphStylesInBoxes !== undefined) return config;
  if (!declaresParagraphStyles(config)) return config;
  return { ...config, bodyText: { ...bodyText, paragraphStylesInBoxes: 'document' } };
}

/**
 * A configuration written before #765 (postext 1.28 or earlier), pinned to
 * the box it set before a task item: `unorderedLists.taskBox: 'character'`,
 * the character ☐ (☑ when the item is done) set as text in the list's
 * face and the item's text started after its width, where today the
 * engine draws the box and gives it a room of its own. That width was the
 * advance of the character in whatever font held it, a font of the system
 * in most documents, which is not known here: every such configuration
 * gets the pin, so no line of its task lists moves. A configuration that
 * names the setting already is returned as it is (the same object).
 */
export function pinLegacyTaskBox<T extends Partial<PostextConfig>>(config: T): T {
  const lists: UnorderedListsConfig = isRecord(config.unorderedLists) ? config.unorderedLists : {};
  if (lists.taskBox !== undefined) return config;
  return { ...config, unorderedLists: { ...lists, taskBox: 'character' } };
}

/** The corner radius every highlight style had by default up to
 *  postext 1.51. */
const LEGACY_MARK_RADIUS: Dimension = { value: 0.2, unit: 'em' };

/**
 * A configuration written for postext 1.51 or earlier, pinned to the
 * rounded ends its highlight bands had then (#1149): every mark style that
 * names no `borderRadius` gets the old default, 0.2 em, and a
 * configuration with no `markStyles` gets the built-in `mark` style with
 * it. An empty list, or one where every style names its radius, is
 * returned as it is (the same object).
 */
export function pinLegacyMarkRadius<T extends Partial<PostextConfig>>(config: T): T {
  const styles = Array.isArray(config.markStyles) ? config.markStyles : config.markStyles === undefined ? DEFAULT_MARK_STYLES : [];
  if (!styles.some((st) => isRecord(st) && st.borderRadius === undefined)) return config;
  return { ...config, markStyles: styles.map((st) => (isRecord(st) && st.borderRadius === undefined ? { ...st, borderRadius: { ...LEGACY_MARK_RADIUS } } : st)) };
}

/**
 * A configuration written for postext 1.51 or earlier, pinned to the line
 * breaks its formatted text made at a slash (#1164):
 * `bodyText.breakAfterSlashes: false`, where the rich breaker ended a line
 * after a slash only inside a web address and divided a word wider than
 * its line at a syllable or between two letters. Every such configuration
 * gets it: a slash between two words may stand in a caption, a table cell
 * or a bibliography as well as in the chapters, and only the chapters are
 * read here. A configuration that names the setting already is returned as
 * it is (the same object).
 */
export function pinLegacySlashBreaks<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.breakAfterSlashes !== undefined) return config;
  return { ...config, bodyText: { ...bodyText, breakAfterSlashes: false } };
}

/**
 * A configuration written for postext 1.53 or earlier, pinned to the way it
 * read a fence in a notation language — ```` ```abc ````, ```` ```musicxml ````,
 * ```` ```mei ````, ```` ```humdrum ````, ```` ```kern ```` — as a code
 * listing (#1172): `scoreStyle.enabled: false`. A configuration that names
 * the setting already is returned as it is (the same object).
 */
export function pinLegacyScoreFences<T extends Partial<PostextConfig>>(config: T): T {
  const scoreStyle: ScoreStyleConfig = isRecord(config.scoreStyle) ? config.scoreStyle : {};
  if (scoreStyle.enabled !== undefined) return config;
  return { ...config, scoreStyle: { ...scoreStyle, enabled: false } };
}
