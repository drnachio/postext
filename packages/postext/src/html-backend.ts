import { featureFontCss } from './fonts/figureStyle.js';
import { footnoteRuleSegments } from './columnRule.js';
import type {
  VDTDocument,
  VDTPage,
  VDTComicPage,
  VDTComicPanel,
  VDTBlock,
  VDTDropCap,
  VDTLine,
  VDTLineSegment,
  VDTAnchor,
  VDTAnnotationRun,
  VDTChip,
  VDTChipRun,
  VDTDesignSlot,
  VDTFrame,
  VDTDesignBlock,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignPathBlock,
  VDTDesignImageBlock,
  VDTDesignBoxStyle,
  BoundingBox,
  ResolvedResourceBlock,
  RoundedOutline,
  RenderWarning,
} from './vdt.js';
import { markerSvgElement, pathSvgData } from './design/pathBlock.js';
import { leaderRuleGeometry, lineTextAlign, tableCellFillRects, tableFrameOutline } from './vdt.js';
import { dimensionToPx } from './units.js';
import { documentInkHex, isSingleInkSvgUrl, singleInkColorMatrix } from './svg/singleInk.js';
import { inlineSvgFontsDetailedSync, type SvgFontSyncProvider } from './svg/fonts.js';
import { registeredFontSyncProvider } from './svg/fontRegistry.js';
import { svgPictureFontWarning } from './svg/image.js';
import { lineInkExtent, lineTrailingTracking } from './lineInk.js';
import { CHARACTER_GRID_COLOR, cjkGridCells, type CjkGridCells } from './pipeline/cjkGrid.js';
import { isJapaneseLanguage, renderLangOf, shapingLanguageOf, shapingTagOf } from './locale.js';
import { hasCJK } from './measure/cjk.js';
import { arabicMarkNeeded, needsBidi } from './bidi.js';
import { joiningScriptIn } from './measure/joining.js';
import { faceReadsScript, isLetterless, rtlTextWidth, scriptContextUntracked, scriptMark, scriptTextWidth, type ScriptContext } from './measure/script.js';
import { DEFAULT_CENTRAL_BASELINE, verticalFlowOf } from './vdt.js';
import type { CjkRegion, ResourceSafeArea } from './types.js';
import { holdsTurnedMark, segmentOrientation, verticalRuns, type ForcedOrientation, type VerticalRun } from './writingMode.js';
import { graphemeCount, graphemesOf } from './measure/graphemes.js';
import { measureFontBox, measureSpacedWidth, measureTextWidth, measuresOwnFace, withMeasureLanguage } from './measure/canvas.js';
import { trackedLigaturePieces, type LigaturePiece } from './measure/trackedLigatures.js';
import { cellsOf, lineWordSegmentsInOrder, sameSetWidth, type SetLine } from './wordPieces.js';
import { fontFamilyOf } from './measure/vertical.js';
import { chipReadingsHtml, lineHighlightsHtml, lineMarksHtml, rubyHtml, verticalLineMarksHtml, warichuHtml, sideMarkerHtml, RT_OPEN, RUBY_OPEN, rubyGroupOf, kuntenHtml, verticalKuntenTateHtml } from './htmlAnnotations.js';
import { playMarkTriangle, qrModuleRuns } from './pipeline/videoOverlay.js';
import { isHlsMimeType, mediaFragment, videoElementAttributes, videoEmbedAllow } from './video/url.js';
import type { VDTDesignTextRun, VDTInlineIcon, VDTResourceVideo, VDTSwatch, VDTTextDots } from './vdt.js';
import { hasSwatchShape, swatchGeometry, type SwatchGeometry } from './swatchShape.js';
import { iconLineDash, inlineIconBox } from './measure/inlineIcon.js';
import { textDots } from './textDots.js';
import type { ComicCastMember } from './types.js';
import { renderComicHtml } from './htmlComic.js';
import { comicBlockOnSheet, pageComics } from './comics/transform.js';
import { altWithLabels } from './composed/labelText.js';
import { figureLabelLeaderPaths, figureLabelMatrix, undrawnLabels, unmirrorLabelLayout } from './composed/labels.js';
import { comicFramePaintOrder, composedFrameBlockIds, composedPaintOrder, composedReadingOrder, composedSheetClip, composedSheetClipOnSheet, decorationOver, decorationUnder, frameClips, frameContentRect, frameMatrix } from './composed/paint.js';
import { taskBoxSvgBody, taskBoxText } from './taskBox.js';
import { exerciseDataJson, exerciseDataOf, type ExerciseData } from './exercises/digital.js';

/**
 * Declarations of every box of CJK text measured with no punctuation
 * trimming: the browser adds and removes nothing. Chrome's
 * `text-spacing-trim: normal` (and fonts' `chws`) would set the first of
 * two marks that meet half width (`）》`, `”“`), and `text-autospace` would
 * add space between Han and Latin, where the layout measured them apart
 * (`measureTextWidth`, `markCuts`) and the CJK composer adjusted the marks
 * itself; the renderers position what it set. Set on a line of the CJK
 * composer (`VDTLine.cjkComposed`), on each word of another line that holds
 * CJK text (each was measured alone), on a design text line or run and a
 * list marker that holds CJK text. Absent from any other box, so the
 * output of other documents is unchanged.
 */
const CJK_TEXT_DECL = "text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;";
/** The part of {@link CJK_TEXT_DECL} a `font` shorthand resets: repeated
 *  after it on an inner box in another face. */
const CJK_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0;";
/** A dash of a 破折号 stretched over its em (`VDTLineSegment.inkScale`):
 *  scaled from its start, with the glyph the layout measured. Under
 *  `lang="zh-Hans"` a face may swap its own Chinese form in (`locl`: Noto
 *  Serif SC's full-width dash), which the scale was not computed for. */
const DASH_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'locl' 0;";
const inkScaleDecl = (scale: number): string =>
  `transform:scaleX(${scale.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}`;

/** The ligatures of a tracked line (#663). A tracked word was measured at
 *  its natural width, ligatures counted, plus its tracking; under a
 *  `letter-spacing` other than zero browsers turn the common ligatures off
 *  and the word comes out wider than its place (fi in Newsreader: 4.5 px at
 *  40 px). Asked for as features they stay (`font-variant-ligatures` does
 *  not bring them back). After the `font` shorthand, which resets them: on
 *  the line's box and on each run in another face. Design text (running
 *  heads, openers, callout titles, balloon lettering) and the lines of a
 *  vertical page carry it too (#703). A box that also takes
 *  {@link CJK_TEXT_DECL} takes {@link CJK_TRACKED_TEXT_DECL} in its place. */
const TRACKED_LIGATURES_DECL = "font-feature-settings:'liga' 1,'clig' 1;";
/** The box of a script mark (see {@link scriptTextHtml}): no size, so it
 *  advances nothing, and no part of a selection or a copy. */
const SCRIPT_MARK_DECL = 'font-size:0;-webkit-user-select:none;user-select:none;';
/** {@link CJK_TEXT_DECL} for a box of a tracked text (#703): one
 *  `font-feature-settings` with the ligatures of
 *  {@link TRACKED_LIGATURES_DECL} beside its own features. The property
 *  does not merge: of two declarations the last one stands alone, and a
 *  tracked CJK line lost the ligatures of its Latin words. */
const CJK_TRACKED_TEXT_DECL = "text-spacing-trim:space-all;text-autospace:no-autospace;font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;";
/** {@link CJK_FEATURES_DECL} for a box of a tracked text. */
const CJK_TRACKED_FEATURES_DECL = "font-feature-settings:'chws' 0,'halt' 0,'vchw' 0,'liga' 1,'clig' 1;";
/**
 * Whether the document being written is shaped in its own language
 * (`bodyText.shapingLanguage: 'document'`, #770) and something measures:
 * the rules below that follow its measure apply, and a document that
 * keeps its host's language is written as it was. Set by
 * {@link renderToHtmlIndexed} while it writes its pages.
 *
 * The first of them: a ligature of a tracked text takes the tracking of
 * each of its letters. The layout counts the tracking once a letter. With
 * the ligatures asked for as features ({@link TRACKED_LIGATURES_DECL}) the
 * browser gives a ligature one tracking, as one glyph, and the word ends
 * a tracking short of its box for each letter joined; in a face whose
 * ligature is as wide as its letters the canvas sets the letters apart,
 * each tracked, and the box asked for the ligature. Chrome 154 at 40 px
 * with 0.4 px a letter, against the width measured: `office` in Source
 * Serif 4 −0.8 px, `first` in Geist −0.4 px (on the canvas 0). So such a
 * document asks for no feature: its tracked text is shaped as the canvas
 * shapes it under the letter-spacing, and a word that would lose a
 * ligature to it is written in the canvas's pieces
 * ({@link trackedWordHtml}): −0.003 and +0.007 px for the same two words,
 * 0.063 px at most over 154 words of seven faces.
 */
let ownShaping = false;

/** {@link TRACKED_LIGATURES_DECL} where a tracked box asks for its
 *  ligatures, nothing where its words are written in pieces
 *  ({@link ownShaping}). */
const ligaturesDecl = (): string => (ownShaping ? '' : TRACKED_LIGATURES_DECL);
/** {@link CJK_TEXT_DECL} of a box, with its ligatures when it is `tracked`. */
const cjkTextDecl = (tracked: boolean): string => (tracked && !ownShaping ? CJK_TRACKED_TEXT_DECL : CJK_TEXT_DECL);
/** {@link CJK_FEATURES_DECL} of a box in another face, with its ligatures
 *  when it is `tracked`. */
const cjkFeaturesDecl = (tracked: boolean): string => (tracked && !ownShaping ? CJK_TRACKED_FEATURES_DECL : CJK_FEATURES_DECL);
/**
 * The box of the cells of a line of the CJK composer (#770). The composer
 * measures each Chinese or Japanese character alone and a line carries
 * the cells of one style as one segment (`cellsOf`); set in one box, the
 * browser kerns inside it: a kana against the mark after it, a kana
 * against a kana. Chrome 154, thousandths of the em under `lang="ja"`:
 * Noto Sans JP `す。` −100, `れ、` +11; Noto Serif JP `す。` −130; and
 * it kerns more pairs than the canvas (21 of 41 texts against 13 in Noto
 * Sans JP). With the kerning off the box is as wide as its cells (41 texts,
 * the two faces, two languages, at 7.5 and 10 px: none differs), and its
 * text stays one run for a selection, a ruby or a link. After the `font`
 * shorthand, which resets it. A Western run was measured with its kerning
 * and keeps it.
 */
const CELLS_DECL = 'font-kerning:none;';

/** Whether a line box carries {@link CJK_TEXT_DECL}: a line of the CJK
 *  composer, which it measured character by character, or a line with no
 *  segments (one span) holding CJK text. A word-by-word line holding CJK
 *  text sets it on the words that hold some (`segmentCjk`). */
function lineCjkDecl(line: VDTLine): boolean {
  return line.cjkComposed === true || ((!line.segments || line.segments.length === 0) && hasCJK(line.text));
}

/** How a text segment's box takes {@link CJK_TEXT_DECL}: from its line
 *  (`'line'`), on its own box (`'own'`), or not at all. */
type SegmentCjk = 'line' | 'own' | false;

function segmentCjk(seg: VDTLineSegment, lineDecl: boolean): SegmentCjk {
  return lineDecl ? 'line' : hasCJK(seg.text) ? 'own' : false;
}

export interface RenderHtmlOptions {
  /** Layout mode: single vertical column or many columns laid out horizontally. */
  mode?: 'single' | 'multi';
  /** Horizontal gap between pages/columns in multi mode. Default: 24 */
  columnGap?: number;
  /** Outer padding around the document. Default: 24 */
  padding?: number;
  /** Background color for each page (overrides config). */
  background?: string;
  /** Resolver from a resource `fileId` to a displayable image URL (object
   *  URL, data URI, …). Image payloads live out-of-band (IndexedDB in the
   *  sandbox), so the host supplies them. When omitted, or when it returns
   *  undefined for a fileId, bitmap/SVG resources render as a neutral
   *  placeholder box so layout stays stable. */
  resourceImageUrl?: ((fileId: string) => string | undefined) & {
    /** The default of {@link RenderHtmlOptions.singleInk} for this
     *  resolver's URLs: `false` on one whose SVG URLs are already recoloured
     *  for single ink (`bundleImageUrl` does), `true` on one that serves the
     *  raw markup. */
    singleInk?: boolean;
  };
  /** Whether `diagramStyle.singleInk` recolours SVG pictures here: each
   *  SVG `<img>` gets a CSS filter (an `feColorMatrix` on its page) that
   *  maps its pixels to tints of the document's ink — the mapping
   *  `applySingleInkToSvg` applies to the markup, and the PDF backend to
   *  SVG bytes. Bitmaps are never tinted, and neither is an SVG data URI
   *  whose markup `applySingleInkToSvg` marked. (A design image of a VDT built
   *  before design images carried `imageKind` is tinted when its URL is an
   *  SVG data URI or ends in `.svg`.) Every page then carries the filter
   *  definition. Defaults to the resolver's own `singleInk`, else false in
   *  postext 1.x: hosts written for 1.4 serve SVGs recoloured with
   *  `applySingleInkToSvg`, as the Sandbox does, and a picture tinted twice
   *  comes out lighter. Pass `true` when `resourceImageUrl` returns the raw
   *  markup. The next major release turns it on by default. */
  singleInk?: boolean;
  /** Resolver from a self-hosted video's `fileId` to a playable URL (an
   *  object URL, the file's address in a package…). When it is omitted or
   *  returns nothing, the video plays from its production address
   *  (`video.url`); with neither, the poster is shown. */
  resourceVideoUrl?: (fileId: string) => string | undefined;
  /** What a video resource is set as (#454): its player, or the printed
   *  poster with its play mark and QR code (linked to the video when
   *  `videoStyle.linkPoster`). `files` covers self-hosted videos, `streams`
   *  YouTube and Vimeo, `hls` a self-hosted video played from an HLS
   *  address (#476; default: as `files`). Each defaults to
   *  `videoStyle.html`. An HLS `<video>` carries `data-pt-hls`: Safari
   *  plays it natively, other browsers need the host to attach a player
   *  such as hls.js (see `attachHls` in the Sandbox). */
  videos?: { files?: 'player' | 'poster'; streams?: 'player' | 'poster'; hls?: 'player' | 'poster' };
  /** Told of what the render could not produce as asked: an image with no
   *  URL (no `resourceImageUrl`, or one that returns nothing for its
   *  `fileId`) is emitted as a placeholder and reported once per `fileId`
   *  and render call, as a `missingImage` warning. */
  onWarning?: (warning: RenderWarning) => void;
  /** Resources anchored elsewhere on the page that shows this document's
   *  HTML (`id="pt-res-<id>"`). A `:ref` links to its resource's anchor
   *  when this document places that resource or the id is listed here;
   *  otherwise it is set as plain text in its link colour, since nothing on
   *  the page would take the link. A host that joins several documents'
   *  HTML on one page — a book's chapters, each rendered on its own — lists
   *  the resources all of them place ({@link anchoredResourceIds}), so a
   *  reference to a figure an earlier chapter placed links to it. */
  refTargets?: Iterable<string>;
  /** Embed the document's fonts in the SVG pictures `resourceImageUrl`
   *  serves as `data:image/svg+xml` URIs (#630): the faces their text
   *  names, as `@font-face` data URIs, so an `<img>` sets the labels in
   *  them. `true` takes the faces held in memory by the registry
   *  (`registerFontBytes`, `loadBundleFonts`); an object names another
   *  provider, the size cap per SVG and families to leave out. Skipped
   *  under `diagramStyle.inlineFonts: false` and for a resource with
   *  `svg.inlineFonts: false`. A family with no face is reported as
   *  `svgFontUnavailable`, the cap as `svgFontsTooLarge`. Default off
   *  (object URLs cannot be read synchronously; `bundleImageUrl` inlines
   *  on its own). */
  inlineSvgFonts?: boolean | {
    fonts?: SvgFontSyncProvider;
    maxBytes?: number;
    withhold?: (family: string) => boolean;
    /** The open family set under the name of a family `withhold` names
     *  (#993): see `InlineSvgFontsOptions.standIn`. */
    standIn?: (family: string) => string | undefined;
  };
}

/** The single-ink filter of one page: its element id and the colour
 *  matrix. Every page carries the `<filter>` definition while single ink
 *  applies, used or not, so a block patched in later resolves it. */
interface InkFilter {
  id: string;
  matrix: number[];
}

/** Render options as the painters see them: the caller's, plus the page's
 *  single-ink filter when single ink applies and the reporter of the images
 *  emitted as placeholders on the page in progress. */
interface HtmlPaint extends RenderHtmlOptions {
  ink?: InkFilter;
  /** The pictures of the page in progress painted in a colour of their own
   *  (`VDTDesignImageBlock.tint`, #995): colour → the id of the `<filter>`
   *  the page defines for it, filled in as they are rendered. */
  tints?: { page: number; filters: Map<string, string> };
  missingImage?: (fileId: string, resourceId?: string) => void;
  /** The URL as served, SVG data URIs with their fonts inlined
   *  ({@link RenderHtmlOptions.inlineSvgFonts}). */
  svgUrl?: (url: string, fileId: string, resourceId?: string) => string;
  /** Resources a `:ref` links to: those this document anchors (see
   *  {@link anchoredResourceIds}) and the caller's `refTargets`. A `:ref`
   *  to any other one — a figure an earlier chapter placed, in a chapter
   *  rendered on its own — is set as plain text in its link colour, not as
   *  a link to nowhere (the PDF backend drops such a link the same way). */
  linkTargets?: ReadonlySet<string>;
  /** The document's anchors (#264): each page sets an element with its id
   *  where it landed. */
  anchors?: readonly VDTAnchor[];
  /** Physical pages before the document's first page: a page's element id
   *  is its book index. */
  pageIndexOffset?: number;
  /** Set while a vertical page's flow is rendered: its text lines are
   *  set down the column (see {@link renderVerticalLine}). */
  vertical?: VerticalHtml;
  /** The direction the document's root declares (`dir`, #379): a box of
   *  text running the other way declares its own. */
  dir?: TextDirection;
  /** The language the pages of a right-to-left or a Japanese document
   *  declare, as its root does (`renderLangOf`). */
  lang?: string;
  /** The language the document's root declares, whatever its direction: a
   *  word in another one named by the author (`VDTLineSegment.lang`)
   *  declares its own. */
  rootLang?: string;
  /** `comics.cast`: the names a comic page's speakers are announced
   *  under. */
  comicCast?: readonly ComicCastMember[];
  /** The boxes of the document's exercises (#1230), by their own container
   *  id: the exercise each belongs to, and whether it is the exercise's
   *  outer box (else a drawn area or grid). */
  exerciseBoxes?: ReadonlyMap<number, { ex: number; outer: boolean }>;
}

/** A direction of text, as a `dir` attribute names it. */
type TextDirection = 'ltr' | 'rtl';

/** The `dir` attribute of a box of text running `own`, inside boxes that
 *  run `inherited` (#379): only where the two differ, so the markup of a
 *  left-to-right document, whose text never runs right to left, carries
 *  none. A box with `dir` is also a bidi isolate (the HTML default), so its
 *  neutrals — a full stop, a bracket — resolve inside it, as the engine
 *  resolved them in the run it measured. */
function dirAttr(own: TextDirection, inherited: TextDirection): string {
  return own === inherited ? '' : ` dir="${own}"`;
}

/** What a text segment's box adds to the markup of an unmarked one (#379):
 *  attributes — its `dir` (see {@link dirAttr}) and `lang` —, declarations (no tracking on a word of
 *  a joining script, which the engine measured untracked) and, for a word
 *  whose letters change style inside it (`VDTLineSegment.runs`), the inner
 *  markup that replaces its plain text. */
interface SegmentBox {
  attrs: string;
  decl: string;
  html?: string;
  /** The font and tracking of a tracked word whose ligatures take the
   *  tracking of each letter (see {@link trackedWordHtml}). */
  tracked?: TrackedText;
}
const PLAIN_BOX: SegmentBox = { attrs: '', decl: '' };

/** The font and colour (CSS values) a run of text in a style is painted
 *  in where a word's letters change style (see {@link wordRunsHtml}). */
type RunPaint = (probe: VDTLineSegment) => { font: string; color: string };

/**
 * The box of a word segment of a line (#379): its direction against the
 * one it inherits, the language the author named for its text
 * (`VDTLineSegment.lang`) where it is not the root's (`rootLang`), its
 * letters untracked when they are of a joining script on a tracked line
 * (`tracking`), and its styled runs (`VDTLineSegment.runs`) painted by
 * `paint` around the segment's own `font` / `color`.
 */
function segmentBox(seg: VDTLineSegment, inherited: TextDirection, rootLang: string | undefined, tracking: number, font: string, color: string, paint: RunPaint): SegmentBox {
  const attrs = dirAttr(seg.rtl ? 'rtl' : 'ltr', inherited) + (seg.lang !== undefined && seg.lang !== rootLang ? ` lang="${esc(seg.lang)}"` : '');
  // A word of a joining script takes no tracking, nor does a word with no
  // letter shaped in the Arabic script (#725).
  const decl = tracking !== 0 && (joiningScriptIn(seg.text) || scriptContextUntracked(seg.scriptContext)) ? 'letter-spacing:0;' : '';
  const html = seg.runs && seg.runs.length > 0 ? wordRunsHtml(seg, font, color, paint)
    : seg.kashida && seg.kashida.length > 0 ? kashidaTextHtml(seg.text, seg.kashida)
    : seg.scriptContext !== undefined && !setsAlone(seg, font, tracking) ? scriptTextHtml(seg.text, seg.scriptContext, seg.rtl === true) : undefined;
  // A tracked word is written in the canvas's pieces where it holds a
  // ligature (#770); `font` is the CSS value, which the canvas takes too.
  const tracked = ownShaping && tracking !== 0 && !decl && html === undefined ? { font, tracking, ...(seg.lang !== undefined ? { lang: seg.lang } : {}) } : undefined;
  if (!attrs && !decl && html === undefined && !tracked) return PLAIN_BOX;
  return { attrs, decl, ...(html !== undefined ? { html } : {}), ...(tracked ? { tracked } : {}) };
}

/**
 * A word with no letter set in the script the layout measured it in
 * (`VDTLineSegment.scriptContext`, #725): its text, and beside it the mark
 * of the script (`scriptMark`, a character of the script glued with a
 * no-break space) in a box of no size. The browser reads the script of
 * digits and punctuation from the text they stand in, across the box, so
 * the word takes the forms and the width of that script, where alone it
 * would take the ones the browser picks for a text with no letter. The
 * mark comes after a left-to-right word and before a right-to-left one,
 * as on the canvas; it has no size, is hidden from assistive technology
 * and is left out of a selection, so the page reads and copies as written.
 */
function scriptTextHtml(text: string, script: ScriptContext, rtl: boolean): string {
  const { lead, trail } = scriptMark(script, rtl);
  const hidden = (mark: string): string => (mark === '' ? '' : `<span aria-hidden="true" style="${SCRIPT_MARK_DECL}">${esc(mark)}</span>`);
  return hidden(lead) + esc(text) + hidden(trail);
}

/**
 * Whether a doubled dash or ellipsis given the forms of Han text
 * (`scriptContext: 'Hani'`) is set with no mark beside it (#770): where
 * the canvas that measured it set it alone as wide as its place.
 *
 * The mark of the Han script is an ideograph, and Chrome's canvas cuts a
 * string before a Han character that follows another one: the word
 * beside the mark is shaped alone there, in no script, and the mark
 * changes nothing. The browser's layout shapes the two as one run of Han
 * text, where the face may answer with the form of the document's
 * language. Chrome 154, Noto Serif TC at 14.58 px under `zh-Hant`: `——`
 * is 24.67 px on the canvas with the mark or without, 24.67 px alone in a
 * box, and 29.17 px in a box with the mark (the full-width dash of the
 * face's `locl`). So the box takes the word alone whenever the measurer
 * says that is what the layout holds; asked in the language the text is
 * shaped in ({@link shapedText}), and the mark stays where that is not
 * known.
 */
function setsAlone(seg: VDTLineSegment, font: string, tracking: number): boolean {
  const shaped = shapedText;
  if (!shaped || seg.scriptContext !== 'Hani') return false;
  const alone = withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => measureTextWidth(seg.text, font));
  return sameSetWidth(alone + (tracking === 0 ? 0 : tracking * graphemeCount(seg.text)), seg.width);
}

/**
 * A run of design text with no letter, set in the forms the canvas
 * painted it in (#770), or undefined when it is written as it is.
 *
 * A word of body text with no letter carries the script it was measured
 * in (`scriptContext`, #725). A design text carries none: its runs are
 * measured as the canvas paints them, each alone, and a current Chrome
 * gives such a run the face's Latin forms there, while the browser's
 * layout gives a run with no letter the default ones. Chrome 154, Amiri
 * at 25 px: the `(` that opens a date set right to left is 6.38 px on the
 * canvas and 11.45 px in a box, alone or beside the Arabic text; with a
 * Latin mark of no size after it the box is 6.38 px wide. So where the
 * face draws such characters by script and the run is as wide as the
 * canvas sets it in Latin forms (`width` px, `tracking` after each
 * character), it is written beside that mark, in a box of its own
 * direction so the mark's letter orders nothing around it. One word
 * only: in a text of several the mark would reach the others. Asked in
 * the language the text is shaped in ({@link shapedText}); nothing
 * changes where that is not known.
 */
function letterlessRunHtml(text: string, font: string, rtl: boolean, width: number, tracking: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') >= 0 || !isLetterless(text)) return undefined;
  return withMeasureLanguage(shaped.lang, () => {
    if (!faceReadsScript(font)) return undefined;
    const set = scriptTextWidth(text, font, 'Latn', rtl) + (tracking === 0 ? 0 : tracking * graphemeCount(text));
    return sameSetWidth(set, width) ? scriptTextHtml(text, 'Latn', rtl) : undefined;
  });
}

/**
 * {@link CELLS_DECL} for a line or a run of design text set at the
 * glyphs' own advances (#770): when its characters are cells and spaces
 * and the layout holds it `width` px wide, the sum of their advances
 * (`tracking` after each). The canvas, which measured it, kerns fewer
 * pairs of kana than the browser's layout does: the running head
 * `日本語テキスト処理` in Noto Sans JP at 15.6 px is 140.58 px on the
 * canvas, its nine cells, and 140.13 px in a box. Asked in the language
 * the text is shaped in ({@link shapedText}); nothing where that is not
 * known, or where the canvas kerned the text itself.
 */
function designCellsDecl(text: string, font: string, width: number, tracking: number): string {
  const shaped = shapedText;
  if (!shaped || !hasCJK(text)) return '';
  const cells = cellsOf(text.replace(/[ \u3000]+/g, ''));
  if (!cells) return '';
  const graphemes = graphemesOf(text);
  const sum = withMeasureLanguage(shaped.lang, () => graphemes.reduce((w, g) => w + measureTextWidth(g, font), 0));
  return sameSetWidth(sum + tracking * graphemes.length, width) ? CELLS_DECL : '';
}

/**
 * A line of design text that carries directions (`VDTDesignTextLine.order`),
 * as the markup inside its line box (#770): each run in a box of its own,
 * at the place the layout gave it along the line and in its own direction.
 *
 * The canvas paints such a line run by run, each run a text of its own
 * shaped right to left or left to right, and since #770 the layout
 * measures each run so. Set inline in one line box, the browser shapes
 * across the runs: a bracket takes the script of the run beside it and of
 * the bracket it closes (the date `(٧٣٢–٨٠٨هـ)` in Amiri at 25 px is 122.5
 * px run by run and 127.6 px as one line), and the browser orders the
 * runs itself. A box per run is shaped alone, as the canvas shapes it;
 * the markup stays in logical order, so the text copies as written. The
 * boxes carry `white-space:pre` and their line box does not: a mirrored
 * flow turns each of them back about itself (`MIRRORED_FLOW_STYLE`).
 */
function directedDesignRunsHtml(line: VDTDesignTextBlock['lines'][number], block: VDTDesignTextBlock, font: string, tracked: boolean): string {
  const runs = line.runs!;
  const at = new Array<number>(runs.length).fill(0);
  let x = 0;
  // The order the canvas advances in: the line's when it lists every run,
  // else the runs' own (a mirrored flow may leave it out).
  const order = line.order && line.order.length === runs.length ? line.order : runs.map((_, i) => i);
  for (const i of order) {
    at[i] = x;
    x += runs[i]!.width;
  }
  return runs.map((run, i) => {
    const runFont = quoteFontString(run.fontString);
    const cjkDecl = hasCJK(run.text) ? cjkTextDecl(tracked) : '';
    // A run of several words in the line's font: a box per word, in a run
    // box as wide as the run (see `runWordBoxesHtml`).
    const words = runFont === font && !cjkDecl && !tracked ? runWordBoxesHtml(run.text, run.fontString, run.rtl === true, run.width) : undefined;
    const text = words ?? letterlessRunHtml(run.text, run.fontString, run.rtl === true, run.width, block.letterSpacingPx ?? 0) ?? wordsHtml(run.text, trackedIn(run.fontString, block.letterSpacingPx));
    const top = run.baselineShift ? `${run.baselineShift.toFixed(3)}px` : '0';
    // A run in a colour of its own (a part row's leader, #1121).
    const colorDecl = run.color ? `color:${run.color};` : '';
    const pos = `position:absolute;left:${at[i]!.toFixed(3)}px;top:${top};white-space:pre;${words !== undefined ? `width:${run.width.toFixed(3)}px;` : ''}${cjkDecl}${colorDecl}`;
    // A run in another face sits on the baseline of the line's own.
    const inner = runFont !== font
      ? `<span style="font:${runFont};line-height:0;${cjkDecl ? cjkFeaturesDecl(tracked) : tracked ? ligaturesDecl() : ''}">${text}</span>`
      : text;
    return `<span dir="${run.rtl ? 'rtl' : 'ltr'}" style="${pos}">${inner}</span>`;
  }).join('');
}

/**
 * A run of a directed design line as a box per word and per run of
 * spaces, each at the place the canvas gives it (#770), or undefined
 * where {@link wordsHtml} sets it.
 *
 * {@link wordsHtml} puts each run of spaces in an inline box, and a box
 * in a line is as wide as a whole number of layout units: the opener
 * `الإخراج مجموعة صفحات، …` of the Arabic guide, 17 words in Amiri at
 * 47.92 px, has 16 spaces of 13.98 px, each 14 px in its box, and the
 * run ended 0.30 px past its 1699.42 px. With every word at its own
 * place nothing adds up ({@link wordBoxesHtml}, which sets a line with no
 * runs so). The places are the canvas's, which shapes a run word by
 * word: each word alone in the run's direction, each run of spaces
 * alone, from the run's start side (its right for a right-to-left run);
 * the caller gives the run's box its width. Only where the words set so
 * add up to the run as the layout measured it (0.01 px), so a run
 * measured otherwise (a document that keeps its host's language, a
 * tracked text) is written as it was; not for a run with a word with no
 * letter, which alone takes other forms than in its text, nor where the
 * language is not known.
 */
function runWordBoxesHtml(text: string, font: string, rtl: boolean, width: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') < 0 || text.trim() === '') return undefined;
  const parts = text.split(/( +)/).filter((part) => part !== '');
  if (parts.some((part) => part[0] !== ' ' && isLetterless(part))) return undefined;
  return withMeasureLanguage(shaped.lang, () => {
    const side = rtl ? 'right' : 'left';
    let x = 0;
    let out = '';
    for (const part of parts) {
      out += `<span style="position:absolute;${side}:${x.toFixed(3)}px;top:0;">${esc(part)}</span>`;
      x += part[0] !== ' ' && rtl ? rtlTextWidth(part, font) : measureTextWidth(part, font);
    }
    return Math.abs(x - width) <= 0.01 ? out : undefined;
  });
}

/**
 * A word whose letters change style inside it (`VDTLineSegment.runs`: a
 * bold letter, a coloured haraka) as one run of text with inline spans for
 * the styled parts. The browser shapes the word whole across the spans, so
 * the letters of a joining script stay joined, where boxes positioned one
 * by one would break them apart. A run in the segment's own font and colour
 * is plain text; one in another face takes no line height, so it sits on
 * the segment's baseline without growing its box.
 */
function wordRunsHtml(seg: VDTLineSegment, font: string, color: string, paint: RunPaint): string {
  // Where each run starts in the segment's text, for its inserted
  // tatweels (`VDTLineSegment.kashida`).
  let at = 0;
  return seg.runs!.map((run) => {
    const start = at;
    at += run.text.length;
    const text = kashidaTextHtml(run.text, seg.kashida, start);
    const probe: VDTLineSegment = {
      kind: 'text', text: run.text, width: 0,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(seg.fontString ? { fontString: seg.fontString } : {}),
    };
    const own = paint(probe);
    const runColor = run.color ?? own.color;
    const decl = (own.font !== font ? `font:${own.font};line-height:0;` : '') + (runColor !== color ? `color:${runColor};` : '');
    return decl ? `<span style="${decl}">${text}</span>` : text;
  }).join('');
}

/**
 * `text` escaped, with the tatweels kashida justification inserted into it
 * (#375; `offsets` into the segment's text, of which `text` starts at
 * `base`) in spans that cannot be selected: they are painted, joined to
 * the letters around them (the browser shapes one font's text whole
 * across spans), but a copy of the page reads the words as written, as
 * the PDF's text does. A tatweel the author typed is not among the
 * offsets and copies. Plain `esc(text)` when none falls in it.
 */
function kashidaTextHtml(text: string, offsets: readonly number[] | undefined, base = 0): string {
  if (!offsets || offsets.length === 0) return esc(text);
  let out = '';
  let last = 0;
  for (let k = 0; k < offsets.length; k++) {
    const i = offsets[k]! - base;
    if (i < last || i >= text.length) continue;
    // Consecutive tatweels (a longer elongation) share one span.
    let j = i + 1;
    while (k + 1 < offsets.length && offsets[k + 1]! - base === j && j < text.length) { j++; k++; }
    out += `${esc(text.slice(last, i))}<span style="${KASHIDA_DECL}">${esc(text.slice(i, j))}</span>`;
    last = j;
  }
  return out + esc(text.slice(last));
}

/** Inserted tatweels: painted, never selected or copied. */
const KASHIDA_DECL = '-webkit-user-select:none;user-select:none;';

/** What vertical lines need: the CJK region, the central axis of each
 *  family (`VDTFlowFrame.centralBaselines`), `cjk.uprightDigits`, and the
 *  advance of each dash stretched to its cell (`VDTFlowFrame.dashAdvances`). */
interface VerticalHtml {
  region: CjkRegion;
  axes?: Record<string, number>;
  uprightDigits: number;
  dashes?: Record<string, Record<string, number>>;
}

/**
 * The resources this document anchors in its HTML (`id="pt-res-<id>"`):
 * those whose embed (a first slice, for a split table) is on one of its
 * pages. A host that renders a book's chapters one by one onto a single page
 * passes the union over the chapters as `RenderHtmlOptions.refTargets`:
 *
 * ```ts
 * const docs = buildBundle(bundle);
 * const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
 * const html = docs.map((d) => renderToHtml(d, { refTargets })).join('');
 * ```
 */
export function anchoredResourceIds(doc: VDTDocument): Set<string> {
  const ids = new Set<string>();
  // Anchors (#264) under a key no resource id takes the same way.
  for (const a of doc.anchors ?? []) ids.add(`${ANCHOR_KEY}${a.id}`);
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (rb?.resource.id && !rb.slice?.continued) ids.add(rb.resource.id);
      // A numbered strip with an id (#590).
      if (block.stripCaption?.id) ids.add(block.stripCaption.id);
    }
  }
  return ids;
}

/** Whether a `:ref` segment links anywhere in the document being rendered. */
function refLinks(resourceId: string, targets: ReadonlySet<string> | undefined): boolean {
  return !targets || targets.has(resourceId);
}

/** Whether an image URL names an SVG: a data URI of that type, or a path
 *  ending in `.svg` (query and fragment aside). Blob URLs cannot tell. */
function isSvgUrl(url: string): boolean {
  return /^data:image\/svg\+xml[;,]/i.test(url) || /\.svg(?:[?#]|$)/i.test(url);
}

/** The `filter` declaration tinting an image to the page's ink: an SVG
 *  (`svg: true`) or, of unknown kind, an SVG-looking URL; never a bitmap,
 *  and never an SVG data URI `applySingleInkToSvg` recoloured already (it
 *  carries `SINGLE_INK_MARK`). Empty when single ink does not apply. */
function inkFilterDecl(paint: HtmlPaint, svg: boolean | undefined, url: string): string {
  const ink = paint.ink;
  if (!ink || svg === false || (svg === undefined && !isSvgUrl(url)) || isSingleInkSvgUrl(url)) return '';
  return `filter:url(#${ink.id});`;
}

/** The `filter` declaration painting an image's silhouette in `tint` (#995):
 *  a flood of the colour kept where the picture has alpha, defined once per
 *  page and colour (see {@link tintFilterDefs}). A reading system without
 *  CSS filters shows the picture in its own colours. Empty when the colour
 *  is not a `#rrggbb` one. */
function tintFilterDecl(paint: HtmlPaint, tint: string | undefined): string {
  if (!tint || !paint.tints || !/^#[0-9a-f]{6}$/i.test(tint)) return '';
  const hex = tint.toLowerCase();
  let id = paint.tints.filters.get(hex);
  if (!id) {
    id = `pt-tint-${hex.slice(1)}-${paint.tints.page}`;
    paint.tints.filters.set(hex, id);
  }
  return `filter:url(#${id});`;
}

/** The page's `<filter>` definitions (single ink, then the tints of its
 *  pictures): a zero-size inline SVG, first in the page so every `url(#…)`
 *  on it resolves. Empty when there is none. */
function inkFilterDefs(ink: InkFilter | undefined, tints?: ReadonlyMap<string, string>): string {
  const filters: string[] = [];
  if (ink) {
    const values = ink.matrix.map((v) => +v.toFixed(6)).join(' ');
    filters.push(`<filter id="${ink.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`);
  }
  for (const [hex, id] of tints ?? []) {
    filters.push(`<filter id="${id}" color-interpolation-filters="sRGB"><feFlood flood-color="${hex}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
  }
  if (filters.length === 0) return '';
  return (
    `<svg aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;">` +
    filters.join('') +
    `</svg>`
  );
}

/** The URL of an image payload, reporting a miss (the caller then emits the
 *  placeholder). */
function imageUrl(options: HtmlPaint | undefined, fileId: string, resourceId?: string): string | undefined {
  const url = options?.resourceImageUrl?.(fileId);
  if (!url) options?.missingImage?.(fileId, resourceId);
  if (url && options?.svgUrl) return options.svgUrl(url, fileId, resourceId);
  return url || undefined;
}

/** The markup of an SVG `data:` URI; null for any other URL. */
function svgDataUriText(url: string): string | null {
  const head = /^data:image\/svg\+xml(;[^,]*)?,/i.exec(url);
  if (!head) return null;
  const body = url.slice(head[0].length);
  try {
    if (/;base64/i.test(head[1] ?? '')) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/** The `svgUrl` of a render (#630): SVG data URIs re-encoded with the
 *  faces their text names, once per URL; null when inlining is off. */
function svgFontInliner(doc: VDTDocument, options: RenderHtmlOptions): HtmlPaint['svgUrl'] | null {
  const opt = options.inlineSvgFonts;
  if (!opt || doc.config.diagramStyle?.inlineFonts === false) return null;
  const settings = typeof opt === 'object' ? opt : {};
  const provider = settings.fonts ?? registeredFontSyncProvider();
  // Pictures whose resource opts out.
  const keep = new Set<string>();
  const note = (block: VDTBlock) => {
    const r = block.resourceBlock?.resource;
    if (r?.svg?.inlineFonts === false && r.svg.fileId) keep.add(r.svg.fileId);
  };
  for (const b of doc.blocks) note(b);
  for (const p of doc.pages) for (const b of p.floats ?? []) note(b);
  const done = new Map<string, string>();
  const reported = new Set<string>();
  return (url, fileId, resourceId) => {
    if (keep.has(fileId)) return url;
    const cached = done.get(url);
    if (cached !== undefined) return cached;
    const text = svgDataUriText(url);
    let out = url;
    if (text !== null) {
      const result = inlineSvgFontsDetailedSync(text, provider, {
        ...(settings.maxBytes !== undefined ? { maxBytes: settings.maxBytes } : {}),
        ...(settings.withhold ? { withhold: settings.withhold } : {}),
        ...(settings.standIn ? { standIn: settings.standIn } : {}),
        onWarning: (w) => {
          const key = `${fileId}|${w.kind}|${w.kind === 'svgFontUnavailable' ? `${w.family}|${w.weight}|${w.style}` : ''}`;
          if (reported.has(key)) return;
          reported.add(key);
          options.onWarning?.(svgPictureFontWarning(w, fileId, resourceId));
        },
      });
      if (result.svg !== text) out = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
    }
    done.set(url, out);
    return out;
  };
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/**
 * `text` escaped, each run of spaces inside it in a box of its own, and
 * each word with no letter of a text that holds a character past U+00FF
 * (#770).
 *
 * The canvas, which measured the text, shapes a string word by word: a
 * space is a word of its own and nothing kerns across it. The browser
 * shapes the text of a box as one run and kerns a letter against the
 * space beside it. Chrome 154, STIX Two Text at 20.83 px: `Section V` is
 * 83.72 px on the canvas and 83.31 px in one box, `To AV Ty` 80.22 px and
 * 79.39 px; in Hedvig Letters Serif at 40 px a space beside a capital is
 * 1.3 to 3.1 px narrower in a box. In Arabic text the browser also takes
 * another space: Aref Ruqaa's is 0.146 em between two words of a run and
 * 0.333 em alone, 34 px over a title of three words at 92 px. An inline
 * block is shaped apart from the text around it, so with its spaces in
 * such boxes the text is as wide as the canvas made it (83.75 and
 * 80.27 px: the boxes' edges fall on a 64th of a pixel), and it reads and
 * copies as written.
 *
 * A word with no letter (`(1332–1406),`) has no script of its own. In a
 * string with a character past U+00FF the canvas draws it by the face's
 * default rules (`canvas-backend/contextText.ts`); in a box the browser
 * gives it the script of the words beside it, across those inline blocks
 * too: Amiri's brackets are 0.255 em in Latin text and 0.458 em by
 * default, 7.5 px over that word at 18.75 px. In a box of its own it is
 * drawn by the default rules.
 *
 * For the text of one box that holds several words: a reference's label,
 * a line with no segments, a line or a run of a design text.
 */
function wordsHtml(text: string, tracked?: TrackedText): string {
  if (tracked && ownShaping && tracked.tracking !== 0) return trackedWordsHtml(text, tracked);
  const escaped = esc(text);
  if (text.indexOf(' ') < 0 || text.trim() === '') return escaped;
  if (!WIDE_TEXT_RE.test(text)) return escaped.replace(/ +/g, (spaces) => `${APART_OPEN}${spaces}</span>`);
  return text.split(/( +)/).map((part) => (part === '' ? ''
    : part[0] === ' ' || isLetterless(part) ? `${APART_OPEN}${esc(part)}</span>` : esc(part))).join('');
}

/** The font string and the tracking (px a letter) a text is set with, and
 *  the language its author named for it where it is not the document's:
 *  what {@link trackedWordHtml} asks the measurer with. */
interface TrackedText {
  font: string;
  tracking: number;
  lang?: string;
}

/** {@link TrackedText} of a text in `font` on a box tracked `tracking` px
 *  a letter, undefined for an untracked one. */
function trackedIn(font: string, tracking: number | undefined): TrackedText | undefined {
  return tracking ? { font, tracking } : undefined;
}

/**
 * A word of a tracked text, escaped, in the pieces the canvas paints it
 * in (#663, #770): each ligature in a box of its own under no
 * letter-spacing, so the browser sets it, with the tracking of each of
 * its letters after it as a margin; the letters between them as they
 * are, tracked by the box they stand in. The kerning the natural shaping
 * has across a cut, which the browser does not apply between two boxes
 * of other spacing, is a margin before the piece (`pipefitters` in Source
 * Serif 4 at 40 px: 0.39 px between `pipe` and `fi`). A word with no
 * ligature the letter-spacing dissolves, a word of a joining or a
 * right-to-left script, and any word where nothing measures, is its text.
 *
 * A letter-spacing takes the contextual alternates of a face away too
 * (see `canvas-backend/trackedText.ts`): a word whose pieces do not end
 * where the word was measured to end, or that the letter-spacing reshapes
 * with no ligature to keep, is set whole in a box at the letter-spacing
 * that ends it there, as the canvas paints it. `TEA-PARTY` in Cormorant
 * SC at 17.71 px, tracked 2.5 px: 2.66 px a letter, the 1.47 px its
 * hyphen is narrower by under a letter-spacing shared among its nine
 * letters.
 */
function trackedWordHtml(word: string, tracked: TrackedText): string {
  const shaped = shapedText;
  if (!shaped || word.length < 2) return esc(word);
  const set = withMeasureLanguage(tracked.lang !== undefined ? shapingTagOf(tracked.lang) : shaped.lang, () => {
    const cut = trackedLigaturePieces(word, tracked.font);
    if (cut && piecesFit(cut, word, tracked.font)) return { pieces: cut };
    return { pieces: cut, spacing: fittedLetterSpacing(word, tracked) };
  });
  if (set.spacing !== undefined) return `<span style="letter-spacing:${set.spacing.toFixed(4)}px;">${esc(word)}</span>`;
  const pieces = set.pieces;
  if (!pieces) return esc(word);
  let out = '';
  // Where the piece before ends in the natural shaping.
  let end = 0;
  for (const piece of pieces) {
    const kern = piece.offset - end;
    end = piece.offset + piece.width;
    const lead = Math.abs(kern) >= 0.005 ? `margin-inline-start:${kern.toFixed(3)}px;` : '';
    if (piece.ligature) out += `<span style="letter-spacing:0;${lead}margin-inline-end:${(piece.letters * tracked.tracking).toFixed(3)}px;">${esc(piece.text)}</span>`;
    else out += lead ? `<span style="${lead}">${esc(piece.text)}</span>` : esc(piece.text);
  }
  return out;
}

/** The width of `text` in `font` under a letter-spacing, that spacing
 *  taken off, and what one px of letter-spacing adds to it; undefined
 *  where the measurer takes no letter-spacing. */
function spacedTextWidth(text: string, font: string): { width: number; step: number } | undefined {
  const one = measureSpacedWidth(text, font, 1);
  const two = measureSpacedWidth(text, font, 2);
  if (one === undefined || two === undefined || !(two - one > 0.5)) return undefined;
  return { width: one - (two - one), step: two - one };
}

/** Least difference, px, that counts as another shaping
 *  (`measure/trackedLigatures.ts`). */
const RESHAPED_PX = 0.05;

/** Whether the pieces of `word`, each set as it is alone, end where the
 *  natural shaping ends the word (`TrackedWord.fits` of the canvas). */
function piecesFit(pieces: readonly LigaturePiece[], word: string, font: string): boolean {
  const last = pieces[pieces.length - 1]!;
  const width = last.ligature ? last.width : spacedTextWidth(last.text, font)?.width;
  return width !== undefined && Math.abs(last.offset + width - measureTextWidth(word, font)) <= RESHAPED_PX;
}

/** The letter-spacing, px, at which `word`, as the browser shapes it
 *  under one, is as wide as it was measured: its natural width and the
 *  tracking after each letter. Undefined for a word the letter-spacing
 *  does not reshape, a word of a joining or a right-to-left script, and
 *  where nothing measures a letter-spacing. Nor for a text with a CJK
 *  character, which is not measured so: the composer and a vertical line
 *  count cells, and two marks that meet are as wide set whole as the
 *  browser trims them, under no letter-spacing only (the lines of the
 *  Chinese guide set down the page stood 0.4 to 1.3 px off their cells). */
function fittedLetterSpacing(word: string, tracked: TrackedText): number | undefined {
  if (joiningScriptIn(word) || needsBidi(word) || hasCJK(word)) return undefined;
  const letters = graphemeCount(word);
  if (letters < 2) return undefined;
  const under = spacedTextWidth(word, tracked.font);
  if (!under) return undefined;
  const natural = measureTextWidth(word, tracked.font);
  if (Math.abs(under.width - natural) <= RESHAPED_PX) return undefined;
  const spacing = (natural + tracked.tracking * letters - under.width) / under.step;
  // At no letter-spacing the browser would shape it naturally again.
  return Math.abs(spacing) < 1e-6 ? undefined : spacing;
}

/** {@link wordsHtml} of a tracked text whose ligatures take the tracking
 *  of each letter: its spaces and its letterless words in boxes of their
 *  own as there, every other word through {@link trackedWordHtml}. */
function trackedWordsHtml(text: string, tracked: TrackedText): string {
  if (text.indexOf(' ') < 0 || text.trim() === '') return trackedWordHtml(text, tracked);
  const wide = WIDE_TEXT_RE.test(text);
  return text.split(/( +)/).map((part) => (part === '' ? ''
    : part[0] === ' ' || (wide && isLetterless(part)) ? `${APART_OPEN}${esc(part)}</span>` : trackedWordHtml(part, tracked))).join('');
}

/** A text set down a vertical line or with no box per space, escaped,
 *  each word of a tracked one through {@link trackedWordHtml}. */
function trackedTextHtml(text: string, tracked: TrackedText | undefined): string {
  if (!tracked || !ownShaping || tracked.tracking === 0) return esc(text);
  if (text.indexOf(' ') < 0) return trackedWordHtml(text, tracked);
  return text.split(/( +)/).map((part) => (part === '' ? '' : part[0] === ' ' ? part : trackedWordHtml(part, tracked))).join('');
}
/** A box shaped apart from the text around it. */
const APART_OPEN = '<span style="display:inline-block;">';

/**
 * A line of several words as a box per word and per run of spaces, each
 * at the place the canvas gives it (#770), or undefined where
 * {@link wordsHtml} sets it.
 *
 * Boxes inside a line each round their width to a 64th of a pixel, and
 * over a long line the rounding adds up: a colophon of 26 spaces set with
 * {@link wordsHtml} ends 0.14 to 0.64 px past the canvas's width (four
 * faces, three sizes), where in one box it stood 1.9 to 16 px short of
 * it. With every word at its own place, as the words of a body line
 * are, nothing adds up. The places are the canvas's: the advance of each
 * word alone, in the language the text is shaped in ({@link shapedText}),
 * `tracking` after each character and `wordSpacing` on each space. For a
 * text that reads left to right, written straight into a box that keeps
 * the line's font; the caller gives that box the line's width, since its
 * words no longer make it. Not where the language is not known. In a
 * face that draws by script, a word with no letter may take other forms
 * measured alone than in a line that holds a character past U+00FF: such
 * a line is set so only where its words alone are as wide together as
 * the line measured whole, 0.01 px apart at most (the colophon `Higuchi
 * Ichiyō, たけくらべ (Child’s Play, 1895–96), …` in Noto Sans JP at
 * 11.46 px: 578.2357 px both ways; with {@link wordsHtml} its 16 spaces
 * and its number, each in a box, end it at 578.53 px).
 */
function wordBoxesHtml(text: string, font: string, tracking: number, wordSpacing: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') < 0 || text.trim() === '' || needsBidi(text)) return undefined;
  const parts = text.split(/( +)/).filter((part) => part !== '');
  return withMeasureLanguage(shaped.lang, () => {
    const byScript = WIDE_TEXT_RE.test(text) && parts.some((part) => part[0] !== ' ' && isLetterless(part)) && faceReadsScript(font);
    let x = 0;
    // The words alone, with no tracking and no wider space.
    let alone = 0;
    let out = '';
    for (const part of parts) {
      out += `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;">${part[0] === ' ' ? esc(part) : trackedTextHtml(part, trackedIn(font, tracking))}</span>`;
      const width = measureTextWidth(part, font);
      alone += width;
      x += width + (tracking === 0 ? 0 : tracking * graphemeCount(part)) + (part[0] === ' ' ? wordSpacing * part.length : 0);
    }
    if (byScript && Math.abs(alone - measureTextWidth(text, font)) > 0.01) return undefined;
    return out;
  });
}
/** A character past Latin-1 (see `canvas-backend/contextText.ts`). */
const WIDE_TEXT_RE = /[^\u0000-\u00FF]/;

/** Element id for a resource embed's in-document anchor. `:ref` segments link
 *  to it with `#<id>` so references navigate in standalone HTML output. */
function resourceAnchorId(resourceId: string): string {
  return `pt-res-${resourceId}`;
}

/** The link key of a `:ref` segment: its resource id, or `a:<id>` for a
 *  reference to an anchor (`refAnchor`, #264) — the form
 *  {@link anchoredResourceIds} lists anchors in. */
function refKey(seg: Pick<VDTLineSegment, 'refResourceId' | 'refAnchor'>): string {
  return seg.refAnchor ? `${ANCHOR_KEY}${seg.refResourceId}` : seg.refResourceId!;
}

const ANCHOR_KEY = 'a:';

/** Element id of an anchor (a heading's `{#id}`, an inline anchor, a
 *  container, #264). */
function anchorElementId(id: string): string {
  return `pt-a-${id}`;
}

/** Element id of a footnote's note: where its markers link to (#264). */
function footnoteElementId(id: string): string {
  return `pt-fn-${id}`;
}

/** Element id of a book page (`VDTDocument.pageIndexOffset` counted in):
 *  where a contents row or an index page number links to (#264). */
function pageElementId(bookIndex: number): string {
  return `pt-p-${bookIndex}`;
}

/** A link inside the document (`#sec-intro`, a citation's `#ref-key`)
 *  goes to the anchor of that id (#264, #269); any other link as written. */
function internalHref(href: string): string {
  return href.startsWith('#') && href.length > 1 && !href.startsWith('#pt-') ? `#${encodeURIComponent(anchorElementId(decodeURIComponent(href.slice(1))))}` : href;
}

function refAnchorHref(key: string): string {
  if (key.startsWith(ANCHOR_KEY)) return `#${encodeURIComponent(anchorElementId(key.slice(ANCHOR_KEY.length)))}`;
  return `#${encodeURIComponent(resourceAnchorId(key))}`;
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isLineTerminator = (c: string): boolean => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';

/**
 * A font shorthand split at its first size followed by white space and a
 * family: what comes before the size, the size (`16px`, `12.5px`) and the
 * family. The same as `/^(.*?)(\d+(?:\.\d+)?px)\s+(.+)$/` (`.` stops at a
 * line terminator), read in one pass so that long runs of digits or
 * spaces stay linear; null when there is none.
 */
function splitFontSize(font: string): [prefix: string, size: string, family: string] | null {
  const n = font.length;
  let lastBreak = -1;
  for (let i = n - 1; i >= 0 && lastBreak < 0; i--) if (isLineTerminator(font[i]!)) lastBreak = i;
  for (let i = 0; i < n; i++) {
    const c = font[i]!;
    // The prefix holds no line terminator.
    if (isLineTerminator(c)) return null;
    // A size starts at a run's first digit: one inside the run would end
    // where the run's does.
    if (!isDigit(c) || isDigit(font[i - 1])) continue;
    let j = i;
    while (isDigit(font[j])) j++;
    if (font[j] === '.' && isDigit(font[j + 1])) {
      j++;
      while (isDigit(font[j])) j++;
    }
    if (!font.startsWith('px', j)) continue;
    const sizeEnd = j + 2;
    let spaces = sizeEnd;
    while (spaces < n && /\s/.test(font[spaces]!)) spaces++;
    // The spaces take all they can and leave the family one character
    // (the last space when nothing else follows); the family holds no
    // line terminator.
    const familyStart = spaces < n ? spaces : n - 1;
    if (familyStart <= sizeEnd || lastBreak >= familyStart) continue;
    return [font.slice(0, i), font.slice(i, sizeEnd), font.slice(familyStart)];
  }
  return null;
}

function quoteFontString(fontString: string): string {
  // Canvas accepts unquoted multi-word families; CSS is stricter. Wrap family in
  // single quotes (double quotes would collide with the outer HTML attribute
  // delimiter) if it contains a space and isn't already quoted. If the family
  // arrives already wrapped in double quotes, rewrite them to single quotes.
  const match = splitFontSize(fontString);
  if (!match) return fontString;
  const [prefix, size, family] = match;
  const trimmed = (family ?? '').trim();
  let quoted: string;
  if (trimmed.startsWith("'")) {
    quoted = trimmed;
  } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    quoted = `'${trimmed.slice(1, -1)}'`;
  } else if (/\s/.test(trimmed)) {
    quoted = `'${trimmed}'`;
  } else {
    quoted = trimmed;
  }
  return `${prefix}${size} ${quoted}`.trim();
}

function pickSegmentFont(
  seg: VDTLineSegment,
  block: VDTBlock,
): string {
  if (seg.fontString) return seg.fontString;
  const bold = !!seg.bold;
  const italic = !!seg.italic;
  if (bold && italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (bold && block.boldFontString) return block.boldFontString;
  if (italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

/**
 * The language the browser shapes the text of the document being written
 * in, as far as the writer knows it (#770): `lang` is the one its root
 * declares (the document's own, or none: the empty tag), or undefined for
 * the language of the page that writes it, which shows it too. Null where
 * nobody can tell: a document in the host's language written in a worker,
 * or where nothing measures. Set by {@link renderToHtmlIndexed} while it
 * writes its pages, null again after them.
 */
let shapedText: { lang: string | undefined } | null = null;

/** {@link shapedText} of a document whose root declares `declared`
 *  (undefined: it declares none) and whose text is set in `font`.
 *
 *  Null where the measurer does not have the book's faces
 *  ({@link measuresOwnFace}): a host that writes the pages away from the
 *  page they will be read on — the EPUB worker — may hold the faces'
 *  bytes without having registered them where it measures, and then
 *  everything measured again as the markup is written is measured in the
 *  fallback. The pages are written as they were before #770 instead: off
 *  the places the layout holds, which are the ones the canvas paints. */
function shapedTextOf(declared: string | undefined, font: string | undefined): { lang: string | undefined } | null {
  const page = typeof document !== 'undefined';
  if (!page && typeof OffscreenCanvas === 'undefined') return null;
  if (font !== undefined && !measuresOwnFace(font)) return null;
  if (declared !== undefined) return { lang: declared };
  return page ? { lang: undefined } : null;
}

/** A font string the document's text is set in, for {@link shapedTextOf}:
 *  its first block's. */
function documentFontString(doc: VDTDocument): string | undefined {
  for (const block of doc.blocks) if (block.fontString) return block.fontString;
  return undefined;
}

/**
 * The segments a line set word by word is written from (#770): the line's
 * own, the pieces of a word joined into one box where the word was
 * measured whole and the hyphen of a line end in a box of its own where
 * it was measured apart (`lineWordSegments`, the rule the canvas and the
 * PDF apply). The browser sets each box's text as one run, so a joined
 * word has the glyphs the layout measured: the `ffi` of `of|fice`, the
 * dot of a Catalan `l·l`. Asked of the engine's measurer, in the language
 * the text is shaped in ({@link shapedText}, a segment's own where it
 * names one), at the line's `tracking`; `fontOf` gives a segment's font
 * string. With them the order they advance in on a line that carries one
 * (`VDTLine.order`): the pieces of a left-to-right word are joined there
 * too, and the order is the one of the segments that result. The line's
 * own segments and order where that language is not known.
 */
function wordSegmentsOf(line: VDTLine, tracking: number, fontOf: (seg: VDTLineSegment) => string): SetLine {
  const shaped = shapedText;
  if (!shaped) return { segments: line.segments, order: line.order };
  const set = lineWordSegmentsInOrder(line, false, (seg, text) =>
    withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => measureTextWidth(text, fontOf(seg)))
    + (tracking === 0 ? 0 : tracking * graphemeCount(text)));
  // Nothing joined: the line's order as it is, whatever it counts.
  return set.segments === line.segments ? { segments: line.segments, order: line.order } : set;
}

function pickSegmentColor(
  seg: VDTLineSegment,
  block: VDTBlock,
): string {
  if (seg.color) return seg.color;
  if (seg.refResourceId !== undefined && block.refColor) return block.refColor;
  const bold = !!seg.bold;
  const italic = !!seg.italic;
  if (bold && block.boldColor) return block.boldColor;
  if (italic && block.italicColor) return block.italicColor;
  return block.color;
}

function renderMathSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, block: VDTBlock): string {
  return mathSegmentSvg(seg, xPx, line, block.color);
}

/** A score system (#1172): its plain SVG, scaled to the segment's width,
 *  with its foot on the line's baseline. Labelled for assistive technology
 *  on the first system with the score's alt text; the systems after it are
 *  hidden from it. */
function scoreSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, block: VDTBlock): string {
  const system = seg.scoreSystem;
  const k = system && system.widthPx > 0 ? seg.width / system.widthPx : 1;
  const height = (system?.heightPx ?? 0) * k;
  const top = line.baseline - line.bbox.y - height;
  if (!system || !system.svg) {
    return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${top.toFixed(3)}px;width:${seg.width.toFixed(3)}px;height:${height.toFixed(3)}px;background:rgba(160,160,160,0.15);"></span>`;
  }
  const label = block.score?.alt ? ` role="img" aria-label="${esc(block.score.alt)}"` : ' aria-hidden="true"';
  const svg = system.svg.replace(/<svg\b([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${seg.width.toFixed(3)}" height="${height.toFixed(3)}"${label} style="color:${block.color};direction:ltr;"`);
  return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${top.toFixed(3)}px;display:inline-block;line-height:0;">${svg}</span>`;
}

/** A score resource's body (#1172): its systems' SVG stacked down the
 *  body, scaled to its width, named for assistive technology by the
 *  score's alt text (else its caption). */
function renderScoreBodyHtml(rb: ResolvedResourceBlock, bx: number, by: number, bw: number, bh: number): string {
  const score = rb.score;
  if (!score || score.systems.length === 0) {
    return `<div aria-hidden="true" style="position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;background:rgba(160,160,160,0.15);"></div>`;
  }
  const k = score.systems[0]!.width > 0 ? bw / score.systems[0]!.width : 1;
  const name = score.alt || rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim() || `${rb.captionPrefix} ${rb.number}`.trim();
  const inner = score.systems.map((s) => {
    const w = s.width * k;
    const h = s.height * k;
    const svg = s.system.svg.replace(/<svg\b([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${w.toFixed(3)}" height="${h.toFixed(3)}" aria-hidden="true"`);
    return `<div style="position:absolute;left:0;top:${(s.y * k).toFixed(3)}px;line-height:0;">${svg}</div>`;
  }).join('');
  return `<div role="img" aria-label="${esc(name)}" style="position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;color:${score.color};direction:ltr;">${inner}</div>`;
}

/** An inline formula of a line, in `color` (a body line's block colour, a
 *  caption's, a note's or a cell's text colour, #541). */
function mathSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, color: string): string {
  const render = seg.mathRender;
  if (!render) return '';
  // Position the SVG with top = (line.baseline - block.bbox.y - ascent).
  // line.bbox.y is absolute; we need top relative to the line's wrapper top.
  const topOffset = line.baseline - line.bbox.y - render.ascentPx;
  // Use the pre-serialised self-contained SVG. Replace any currentColor fills
  // with the block colour so the SVG is independent of CSS inheritance.
  const svg = render.svg
    .replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${render.viewBox.minX} ${render.viewBox.minY} ${render.viewBox.width} ${render.viewBox.height}" width="${render.widthPx}" height="${render.heightPx}" style="color:${color};">`);
  return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${topOffset.toFixed(3)}px;display:inline-block;line-height:0;">${svg}</span>`;
}

/** One text segment of a line, absolutely positioned at `x` / `top` inside
 *  the line box. The wrapper inherits the line's font, so its line box —
 *  and the baseline the text sits on — is the block face's; a segment set
 *  in another face (a bold `:ref`, a superscript, an italic run whose
 *  family differs) goes in an inner inline box with `line-height: 0`,
 *  which aligns on that baseline without growing or shifting the line
 *  box. A face with other vertical metrics would otherwise float its own
 *  baseline higher or lower than the surrounding text. */
function renderTextSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  /** The tracking the line box already carries (block + line); a segment's
   *  own (a justified CJK line) is added to it. */
  tracking = 0,
  /** Whether the browser's punctuation spacing is off for the segment
   *  (see {@link CJK_TEXT_DECL}): set by its line (`'line'`) or on its own
   *  box (`'own'`); a box in another face repeats the features either way. */
  cjk: SegmentCjk = false,
  /** Its direction where it differs from its line's (see {@link segmentBox}). */
  box: SegmentBox = PLAIN_BOX,
): string {
  const spacingDecl = seg.tracking !== undefined ? `letter-spacing:${tracking + seg.tracking}px;` : '';
  // A compressed CJK mark is painted before its box (`inkOffset`).
  const left = seg.inkOffset !== undefined ? x + seg.inkOffset : x;
  const scaleDecl = seg.inkScale !== undefined ? inkScaleDecl(seg.inkScale) : '';
  // The cells of a line of the composer, each where it was measured.
  const cellsDecl = cjk === 'line' && cellsOf(seg.text) ? CELLS_DECL : '';
  const pos = `position:absolute;left:${left.toFixed(3)}px;top:${top};white-space:pre;${spacingDecl}${cjk === 'own' ? cjkTextDecl(tracking !== 0) : ''}${scaleDecl}${fontDecl ? '' : cellsDecl}${box.decl}`;
  // Text set with emphasis dots is emphasis (#193); the dots are the
  // line's marks.
  const text = seg.cjkMarks?.dots ? `<em style="font-style:inherit;">${esc(seg.text)}</em>` : box.html ?? wordsHtml(seg.text, box.tracked);
  // A run in another face of a tracked line asks for its ligatures again
  // after its `font` (#703), with the CJK features when it takes those.
  const featuresDecl = !fontDecl ? '' : (scaleDecl ? DASH_FEATURES_DECL
    : cjk ? cjkFeaturesDecl(tracking !== 0)
    : tracking !== 0 && !fontDecl.includes(TRACKED_LIGATURES_DECL) ? ligaturesDecl() : '') + cellsDecl;
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${featuresDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}${featuresDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/**
 * {@link renderTextSegment} for a segment of a line set word by word (not
 * `VDTLine.cjkComposed`), which carries none of the composer's fields
 * (`tracking`, `inkOffset`, `inkScale`): the markup every such segment had
 * before the CJK features. One that holds CJK text (`cjk`) or carries
 * Chinese marks goes to {@link renderMarkedWordSegment}: the browser's
 * punctuation spacing off on its own box (see {@link CJK_TEXT_DECL}), its
 * text in `<em>` when it is set with emphasis dots.
 */
function renderWordTextSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  cjk: boolean,
  /** Its direction, tracking and styled runs (see {@link segmentBox}). */
  box: SegmentBox = PLAIN_BOX,
): string {
  if (cjk || seg.cjkMarks) return renderMarkedWordSegment(seg, x, top, fontDecl, colorDecl, color, cjk, box);
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:${top};white-space:pre;${box.decl}`;
  const text = box.html ?? wordsHtml(seg.text, box.tracked);
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/** {@link renderWordTextSegment} for a segment that holds CJK text (`cjk`)
 *  or carries Chinese marks. */
function renderMarkedWordSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  cjk: boolean,
  box: SegmentBox = PLAIN_BOX,
): string {
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:${top};white-space:pre;${cjk ? CJK_TEXT_DECL : ''}${box.decl}`;
  // Text set with emphasis dots is emphasis (#193); the dots are the
  // line's marks.
  const text = seg.cjkMarks?.dots ? `<em style="font-style:inherit;">${esc(seg.text)}</em>` : box.html ?? wordsHtml(seg.text, box.tracked);
  const featuresDecl = fontDecl && cjk ? CJK_FEATURES_DECL : '';
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${featuresDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}${featuresDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/** A `:ref` painted as several runs (a label in small capitals: one run per
 *  case; a label of words, #702: one per word and per space) from
 *  `segs[start]` on. Every run is placed as measured, and all of them sit
 *  in one anchor, so the reference stays one link on its line. `paint`
 *  renders one run, as plain text, at its x; a space inside the label is
 *  copy text that advances by `layout.gap` (the line's justified space),
 *  and `layout.at` gives each segment's x on a line whose segments are
 *  reordered. Returns the markup, the index past the last run and the x
 *  after it. */
function renderRefRuns(
  segs: readonly VDTLineSegment[],
  start: number,
  x: number,
  color: string,
  paint: (seg: VDTLineSegment, x: number) => string,
  linked = true,
  layout?: { gap?: (space: VDTLineSegment) => number; at?: readonly number[] },
): { html: string; end: number; x: number } {
  const runs: string[] = [];
  let i = start;
  do {
    const seg = segs[i]!;
    if (layout?.at) x = layout.at[i]!;
    if (seg.kind === 'space') {
      const gap = layout?.gap ? layout.gap(seg) : seg.width;
      runs.push(copyTextHtml(seg.text, x, gap - seg.width));
      x += gap;
    } else {
      runs.push(paint(seg, x));
      x += seg.width;
    }
    i++;
  } while (segs[i]?.refContinues);
  if (!linked) return { html: runs.join(''), end: i, x };
  const href = refAnchorHref(refKey(segs[start]!));
  return { html: `<a href="${href}" style="text-decoration:none;color:${color};">${runs.join('')}</a>`, end: i, x };
}

/** Wraps each run of segments of one link (`VDTLineSegment.href`) in an
 *  `<a>`: `at` returns the markup to emit before a segment with that link
 *  (closing the previous anchor, opening its own), `space` the markup to
 *  emit before a word space, `end` the markup that closes the line. The segments stay absolutely positioned inside it; the
 *  anchor takes the text colour, so a link reads as the surrounding text. */
function linkRuns(): { at: (href: string | undefined) => string; space: (next: string | undefined) => string; end: () => string } {
  let open: string | undefined;
  const end = (): string => {
    const close = open !== undefined ? '</a>' : '';
    open = undefined;
    return close;
  };
  return {
    at(href) {
      if (href === open) return '';
      const close = open !== undefined ? '</a>' : '';
      open = href;
      return close + (href !== undefined
        ? `<a href="${esc(href)}" rel="noopener noreferrer" style="color:inherit;text-decoration:none;">`
        : '');
    },
    /** Before a word space: closes the open anchor unless the word after
     *  the space (`next`) is part of the same link, so a link's text never
     *  ends on a space (#403). */
    space: (next) => (next === open ? '' : end()),
    end,
  };
}

/**
 * The `<ruby>` elements of a line (#428, see {@link RUBY_OPEN}): `open`
 * returns the markup before a ruby base (the `<ruby>`, unless the base
 * goes on in the one already open), `after` the markup after its reading
 * (`</ruby>`, unless the base names its annotation: the next base may go
 * on in it), `before` the markup to emit before any segment (closing a
 * `<ruby>` the segment does not go on in), `end` the markup that closes
 * the line. The bases of one annotation (`rubyGroupOf`) share a `<ruby>`
 * while they follow each other with the same link, so the element never
 * straddles an `<a>` of {@link linkRuns}.
 */
function rubyRuns(): { open: (seg: VDTLineSegment) => string; after: (seg: VDTLineSegment) => string; before: (seg: VDTLineSegment) => string; end: () => string } {
  let open: { group: string | undefined; href: string | undefined } | undefined;
  const end = (): string => {
    const close = open !== undefined ? '</ruby>' : '';
    open = undefined;
    return close;
  };
  const continues = (seg: VDTLineSegment): boolean =>
    open?.group !== undefined && seg.kind === 'text' && seg.ruby !== undefined && !seg.warichu && !seg.chip
    && seg.refResourceId === undefined && rubyGroupOf(seg.ruby) === open.group && segmentHref(seg) === open.href;
  return {
    before: (seg) => (continues(seg) ? '' : end()),
    open(seg) {
      if (open !== undefined) return '';
      open = { group: seg.ruby ? rubyGroupOf(seg.ruby) : undefined, href: segmentHref(seg) };
      return RUBY_OPEN;
    },
    after: (seg) => (open?.group === undefined || seg.refResourceId !== undefined ? end() : ''),
    end,
  };
}

/** A segment's link, unless it is a `:ref` (which links to its resource):
 *  a Markdown link's URL, a footnote marker's note, an index page number's
 *  page (#264). */
function segmentHref(seg: VDTLineSegment): string | undefined {
  if (seg.refResourceId !== undefined) return undefined;
  if (seg.href !== undefined) return internalHref(seg.href);
  if (seg.footnoteId !== undefined) return `#${encodeURIComponent(footnoteElementId(seg.footnoteId))}`;
  if (seg.pageLink !== undefined) return `#${pageElementId(seg.pageLink)}`;
  return undefined;
}

/**
 * A word space of a line, or what separates it from the next, as text a
 * selection copies (#403). Every word sits in its own absolutely positioned
 * box, so without these the browser copies a line's words run together. The
 * box is placed where the space falls (`x`) and paints nothing: the layout
 * is unchanged. A space stretched by justification takes the stretch as
 * `word-spacing`, so a selection's highlight spans the gap the reader sees.
 * The markup is in logical order like the words', so a right-to-left line
 * copies as written. Empty `text` (a gap the composer added, see
 * `VDTLineSegment.autospace`) emits nothing.
 */
function copyTextHtml(text: string, x: number, stretch = 0): string {
  if (!text) return '';
  const spacing = Math.abs(stretch) >= 0.0005 ? `word-spacing:${stretch.toFixed(3)}px;` : '';
  return `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;white-space:pre;${spacing}">${esc(text)}</span>`;
}

/** {@link copyTextHtml} for what follows a line (see {@link lineEndText}):
 *  transparent, so a selection's highlight never runs past the line's end.
 *  The text still copies; clipped (`overflow:hidden` on a box of no width)
 *  it would not, Chrome leaves clipped text out of a selection's string. */
const LINE_END_DECL = 'opacity:0;';
function lineEndHtml(text: string, x: number): string {
  if (!text) return '';
  return `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;${LINE_END_DECL}white-space:pre;">${esc(text)}</span>`;
}

/**
 * What a copy puts between a line and the one after it in the same block
 * (`next`), or after a block's last line (#403): nothing after a line that
 * ends inside a word or on a hyphen or dash (`VDTLine.hyphenated`); a
 * space before the turnover of a line of verse, a blank line after a
 * stanza (#620); a newline after a line of verse, after a line that ends
 * at a forced line break (`VDTLine.hardBreak`, #620) and after the last line
 * of a paragraph (or of a heading, a caption, a cell); between two lines of a block, a space
 * where the break consumed one — the plain text skips a character between
 * them (`plainEnd` / `plainStart`) — and nothing where it did not (between
 * two ideographs). Lines without those offsets, and a block's last line
 * whose paragraph goes on in the next column or page (`isLastLine:
 * false`), take a space unless the break has a CJK character on either
 * side.
 */
function lineEndText(line: VDTLine, next: VDTLine | undefined): string {
  if (line.hyphenated) return '';
  // A line of verse in the line layout (#620): a space before its
  // turnover, a newline after it, a blank line after a stanza.
  if (line.verseLine) return next?.verseLine?.turnover ? ' ' : line.verseLine.stanzaEnd ? '\n\n' : '\n';
  // A line of a code listing (#624): nothing before its continuation (a
  // wrapped line reads whole), a newline after each source line.
  if (line.codeLine) return next?.codeLine?.continued ? '' : '\n';
  // A forced line break the author typed (#620).
  if (line.verse || line.hardBreak || (!next && line.isLastLine !== false)) return '\n';
  if (next && line.plainEnd !== undefined && next.plainStart !== undefined) return next.plainStart > line.plainEnd ? ' ' : '';
  return cjkAt(Array.from(line.text.trimEnd()).pop()) || cjkAt(next && Array.from(next.text.trimStart())[0]) ? '' : ' ';
}

/** Whether `char` is CJK; no CJK character sits below U+1100, so a Latin
 *  page never gets as far as the test. */
function cjkAt(char: string | undefined): boolean {
  return char !== undefined && char.codePointAt(0)! >= 0x1100 && hasCJK(char);
}

/**
 * The segments of a horizontal line. A line of the CJK composer goes to
 * {@link renderComposedSegments}. Any other line was set word by word and
 * carries none of the composer's fields (a segment's `tracking`,
 * `inkOffset`, `inkScale`, `hangs`, `autospace`, `ruby`, `warichu`): its
 * markup is the one every line had before the CJK features, the browser's
 * punctuation spacing turned off on each segment that holds CJK text. Only
 * a line whose text holds CJK characters has its segments looked into: the
 * line's `text` holds the text of every segment, except the leader of a
 * contents entry (`tocEntry`).
 */
function renderSegments(
  line: VDTLine,
  block: VDTBlock,
  targets?: ReadonlySet<string>,
  rootDir: TextDirection = 'ltr',
  rootLang?: string,
  /** What a copy puts after the line (see {@link lineEndText}). */
  end = '',
  /** Where the line's inline pictures come from (#1249). */
  paint?: HtmlPaint,
): string {
  if (line.cjkComposed) return renderComposedSegments(line, block, targets, rootDir, end, paint);
  // The tracking after the last glyph is advance, not ink: centring and
  // right alignment leave it out (EF-153), as the canvas does.
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, tracking);
  // A line of a block set against its frame's direction aligns in its span
  // (`VDTLine.measure`) from that span's right, its start side (#371).
  const span = line.measure;
  const align = lineTextAlign(line, block.textAlign);
  // Where the span starts inside the line's box (0 but for such a line).
  const origin = span ? span.x - line.bbox.x : 0;
  if (!line.segments || line.segments.length === 0) {
    const plainIndent = span ? span.x - block.bbox.x : line.bbox.x - block.bbox.x;
    const room = span ? span.width : block.bbox.width - plainIndent;
    const plainWidth = line.bbox.width - trailing;
    const plainLeft = origin + (align === 'right'
      ? Math.max(0, room - plainWidth)
      : align === 'center'
        ? Math.max(0, (room - plainWidth) / 2)
        : 0);
    const plainDir = dirAttr(block.direction ?? rootDir, rootDir);
    return `<span${plainDir} style="position:absolute;left:${plainLeft.toFixed(3)}px;top:0;white-space:pre;">${wordsHtml(line.text)}</span>` + lineEndHtml(end, plainLeft + plainWidth);
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = span ? span.x - block.bbox.x : line.bbox.x - block.bbox.x;
  const effectiveWidth = span ? span.width : block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    if (seg.kind === 'space') spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = line.segments.reduce((s, seg) => s + seg.width, 0);

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  const useJustify =
    block.textAlign === 'justify' && spaceCount > 0 &&
    !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred / right alignment — math display blocks, ragged-left paragraph
  // styles. Distribute the leading gap. A justified line fills its span.
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  const leadingGap = origin + (useJustify ? 0 : align === 'center' ? slack / 2 : align === 'right' ? slack : 0);

  const parts: string[] = [];
  const links = linkRuns();
  let x = leadingGap;
  // The pieces of a word the layout measured whole are one box (#770).
  const set = wordSegmentsOf(line, tracking, (seg) => pickSegmentFont(seg, block));
  const segs = set.segments!;
  // Segments advance along the line in its order when it has one (a
  // line with right-to-left runs, or any line of a mirrored page): their
  // x are taken in that order; the markup stays in logical order, so the
  // text copies as written.
  const at = set.order ? orderedOffsets(segs, set.order, leadingGap, useJustify ? justifiedSpaceWidth : undefined) : undefined;
  const cjk = block.tocEntry !== undefined || hasCJK(line.text) || (line.tabbed === true && segs.some((sg) => sg.leader === 'text'));
  const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};${tracking !== 0 ? ligaturesDecl() : ''}` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
    return renderWordTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, color, cjk && hasCJK(seg.text), segmentBox(seg, rootDir, rootLang, tracking, font, color, (probe) => ({ font: quoteFontString(pickSegmentFont(probe, block)), color: pickSegmentColor(probe, block) })));
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (at) x = at[i]!;
    if (seg.kind === 'space') {
      // The space as text, for copying (#403).
      parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
      parts.push(copyTextHtml(seg.text, x, useJustify ? justifiedSpaceWidth - seg.width : 0));
      x += useJustify ? justifiedSpaceWidth : seg.width;
      continue;
    }
    if (seg.leader) {
      // A leader (#622): painted, hidden from assistive technology and
      // left out of a selection.
      parts.push(leaderHtml(seg, x, line.baseline - line.bbox.y, block));
      x += seg.width;
      continue;
    }
    parts.push(links.at(segmentHref(seg)));
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'score') {
      parts.push(scoreSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, quoteFontString(block.fontString), block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block), rootDir));
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap (JLReq §4.2.3).
      parts.push(sideMarkerHtml(seg.sideMarker, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
      const group = renderRefRuns(segs, i, x, pickSegmentColor(seg, block), (run, runX) => paintText(run, runX, true), refLinks(refKey(seg), targets), {
        gap: (space) => (useJustify ? justifiedSpaceWidth : space.width),
        ...(at ? { at } : {}),
      });
      parts.push(group.html);
      x = group.x;
      i = group.end - 1;
      continue;
    }
    parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
    x += seg.width;
  }
  parts.push(links.end());
  parts.push(lineEndHtml(end, x));
  // Emphasis dots, proper-name and book-title lines (#193).
  if (line.marks) parts.push(lineMarksHtml(line, block.color));
  return parts.join('');
}

/** The x of each segment (by index) of a line whose segments advance in
 *  `order` from `start`, spaces taking `spaceWidth` when the line is
 *  justified. */
function orderedOffsets(segs: readonly VDTLineSegment[], order: readonly number[], start: number, spaceWidth: number | undefined): number[] {
  const out = new Array<number>(segs.length).fill(start);
  let x = start;
  for (const i of order) {
    const seg = segs[i];
    if (!seg) continue;
    out[i] = x;
    x += seg.kind === 'space' && spaceWidth !== undefined ? spaceWidth : seg.width;
  }
  return out;
}

/** {@link renderSegments} for a line of the CJK composer: hung marks and
 *  Han–Latin spaces kept out of the justification, each segment with its
 *  own tracking, ink offset and scale, warichu notes and ruby readings. */
function renderComposedSegments(line: VDTLine, block: VDTBlock, targets?: ReadonlySet<string>, rootDir: TextDirection = 'ltr', end = '', paint?: HtmlPaint): string {
  // The tracking after the last glyph is advance, not ink: centring and
  // right alignment leave it out (EF-153), as the canvas does.
  const lineTracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, lineTracking);
  // A line beside a wrapped picture (#627) fills its own span.
  const wrapRoom = line.measure?.wrap ? line.measure.width : undefined;
  if (!line.segments || line.segments.length === 0) {
    const plainIndent = line.bbox.x - block.bbox.x;
    const plainWidth = line.bbox.width - trailing;
    const plainRoom = wrapRoom ?? block.bbox.width - plainIndent;
    const plainLeft = block.textAlign === 'right'
      ? Math.max(0, plainRoom - plainWidth)
      : block.textAlign === 'center'
        ? Math.max(0, (plainRoom - plainWidth) / 2)
        : 0;
    return `<span style="position:absolute;left:${plainLeft.toFixed(3)}px;top:0;white-space:pre;">${wordsHtml(line.text)}</span>` + lineEndHtml(end, plainLeft + plainWidth);
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = wrapRoom ?? block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    // A hung mark is outside the measure; a Han–Latin space keeps its
    // width.
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = lineInkExtent(line, 0).width;

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  const useJustify =
    block.textAlign === 'justify' && spaceCount > 0 &&
    !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred / right alignment — math display blocks, ragged-left paragraph
  // styles. Distribute the leading gap.
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  const leadingGap = block.textAlign === 'center' ? slack / 2 : block.textAlign === 'right' ? slack : 0;

  const parts: string[] = [];
  const links = linkRuns();
  let x = leadingGap;
  const segs = line.segments;
  const lineDecl = lineCjkDecl(line);
  const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
    // The composer sets left-to-right text: in a right-to-left document
    // its boxes say so (#379).
    const dir = dirAttr(seg.rtl ? 'rtl' : 'ltr', rootDir);
    // A Western word of a tracked line in the canvas's pieces (#770): the
    // cells of the line hold no ligature and are asked nothing.
    const segTracking = lineTracking + (seg.tracking ?? 0);
    const tracked = ownShaping && segTracking !== 0 && !cellsOf(seg.text) && !joiningScriptIn(seg.text)
      ? { font, tracking: segTracking, ...(seg.lang !== undefined ? { lang: seg.lang } : {}) } : undefined;
    return renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, color, lineTracking, segmentCjk(seg, lineDecl), dir || tracked ? { attrs: dir, decl: '', ...(tracked ? { tracked } : {}) } : PLAIN_BOX);
  };
  // The `<ruby>` open across the bases of one annotation (#428).
  const ruby = rubyRuns();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    parts.push(ruby.before(seg));
    if (seg.kind === 'space') {
      // The space as text, for copying (#403): a Han–Latin gap only where
      // the author typed one (its `text`).
      const gap = useJustify && !seg.autospace ? justifiedSpaceWidth : seg.width;
      parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
      parts.push(copyTextHtml(seg.text, x, gap - seg.width));
      x += gap;
      continue;
    }
    if (seg.leader) {
      // A leader (#622): painted, hidden from assistive technology and
      // left out of a selection.
      parts.push(leaderHtml(seg, x, line.baseline - line.bbox.y, block));
      x += seg.width;
      continue;
    }
    parts.push(links.at(segmentHref(seg)));
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'score') {
      parts.push(scoreSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, quoteFontString(block.fontString), block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block), rootDir));
      x += seg.width;
      continue;
    }
    if (seg.warichu) {
      // A warichu note's part: its two rows (#195).
      parts.push(warichuHtml(seg.warichu, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap (JLReq §4.2.3).
      parts.push(sideMarkerHtml(seg.sideMarker, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
      const group = renderRefRuns(segs, i, x, pickSegmentColor(seg, block), (run, at) => paintText(run, at, true), refLinks(refKey(seg), targets), {
        gap: (space) => (useJustify && !space.autospace ? justifiedSpaceWidth : space.width),
      });
      parts.push(group.html);
      x = group.x;
      i = group.end - 1;
      continue;
    }
    // A ruby base and its reading (#194), in a `<ruby>` (#428).
    if (seg.ruby) parts.push(ruby.open(seg));
    parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
    if (seg.ruby) parts.push(rubyHtml(seg.ruby, x, pickSegmentColor(seg, block), quoteFontString), ruby.after(seg));
    if (seg.kunten) {
      // Kanbun marks (#430), after the character's `<ruby>`; the 送り仮名
      // read and copy after their character, as transparent text.
      parts.push(ruby.end(), kuntenHtml(seg.kunten, x, pickSegmentColor(seg, block), quoteFontString));
      if (seg.kunten.okuri) parts.push(lineEndHtml(seg.kunten.okuri, x + seg.width));
    }
    x += seg.width;
  }
  parts.push(ruby.end(), links.end());
  parts.push(lineEndHtml(end, x));
  // Emphasis dots, proper-name and book-title lines (#193).
  if (line.marks) parts.push(lineMarksHtml(line, block.color));
  return parts.join('');
}

/** A leader (#622, `VDTLineSegment.leader`): a contents row's or a tab
 *  stop's dots in the segment's font, or a rule under the baseline
 *  (`baselineOffset` from the line top), `aria-hidden` and unselectable,
 *  so neither a screen reader nor a copy reads it. */
function leaderHtml(seg: VDTLineSegment, x: number, baselineOffset: number, block: VDTBlock): string {
  const color = pickSegmentColor(seg, block);
  const hidden = 'aria-hidden="true"';
  const noSelect = 'user-select:none;-webkit-user-select:none;pointer-events:none;';
  if (seg.leader === 'rule') {
    const m = /(\d*\.?\d+)px/.exec(block.fontString);
    const { dy, thickness } = leaderRuleGeometry(m ? Number(m[1]) : 16);
    return `<span ${hidden} style="position:absolute;left:${x.toFixed(3)}px;top:${(baselineOffset + dy - thickness / 2).toFixed(3)}px;`
      + `width:${seg.width.toFixed(3)}px;height:${thickness.toFixed(3)}px;background:${color};${noSelect}"></span>`;
  }
  const font = quoteFontString(pickSegmentFont(seg, block));
  const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
  const colorDecl = color !== block.color ? `color:${color};` : '';
  // The dots are measured and painted on the canvas left to right, as a
  // text of their own. In the box of a right-to-left block the browser
  // draws them in the forms of the script around them: a contents row of
  // 66 `. ` in Amiri at 27.08 px is 441.46 px in the layout and on the
  // canvas and 544.23 px in the box, 318.34 px against 277.98 px in Noto
  // Naskh Arabic. With its own direction on the positioned box (an inline
  // one inside it changes nothing) the leader is 441.47 px and 318.34 px.
  // In a document shaped in its own language (#770); one that keeps its
  // host's measured the stop as the page had it and is written as it was.
  // The direction is the box's `dir`, not a `direction` declaration, which
  // an EPUB's pages may not carry (EPUBCheck CSS-001); Chrome sets the
  // leader the same with either (882.92 px for 66 `. ` in Amiri).
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:0;white-space:pre;${noSelect}`;
  const dir = ownShaping ? ' dir="ltr"' : '';
  if (fontDecl) return `<span ${hidden} style="${pos}"${dir}><span style="${fontDecl}line-height:0;${colorDecl}">${esc(seg.text)}</span></span>`;
  return `<span ${hidden} style="${pos}${colorDecl}"${dir}>${esc(seg.text)}</span>`;
}

/** Inline colour swatch (`:swatch{…}`): a square of `side` px on the line's
 *  baseline (`baselineOffset` from the line top), filled with `fill` when
 *  the colour resolved and outlined in the text colour. */
function renderSwatch(x: number, baselineOffset: number, side: number, fill: string | undefined, ink: string): string {
  const stroke = Math.max(0.5, side * 0.06);
  return (
    `<span aria-hidden="true" style="position:absolute;left:${x.toFixed(3)}px;top:${(baselineOffset - side).toFixed(3)}px;` +
    `width:${side.toFixed(3)}px;height:${side.toFixed(3)}px;box-sizing:border-box;` +
    `border:${stroke.toFixed(2)}px solid ${ink};${fill ? `background:${fill};` : ''}"></span>`
  );
}

/** A `'swatch'` segment: its inline symbol when it carries one (#1058),
 *  else the colour swatch. */
function renderSwatchSegment(
  swatch: VDTSwatch | undefined,
  x: number,
  baselineOffset: number,
  width: number,
  ink: string,
  paint?: HtmlPaint,
  rtl = false,
): string {
  if (swatch?.icon) return renderInlineIconHtml(swatch.icon, x, baselineOffset, ink, paint);
  if (swatch && hasSwatchShape(swatch)) return renderShapedSwatch(swatchGeometry(swatch, x, baselineOffset, width, rtl), swatch.color, swatch.borderColor ?? ink);
  return renderSwatch(x, baselineOffset, width, swatch?.color, ink);
}

/** A swatch with a shape of its own (#1104): the square of `g` (from the
 *  line top), its outline inside the edge, its corners rounded. */
function renderShapedSwatch(g: SwatchGeometry, fill: string | undefined, ink: string): string {
  const border = g.stroke > 0 ? `border:${g.stroke.toFixed(2)}px solid ${ink};` : '';
  const radius = g.radius > 0 ? `border-radius:${g.radius.toFixed(3)}px;` : '';
  return (
    `<span aria-hidden="true" style="position:absolute;left:${g.x.toFixed(3)}px;top:${g.y.toFixed(3)}px;` +
    `width:${g.side.toFixed(3)}px;height:${g.side.toFixed(3)}px;box-sizing:border-box;` +
    `${border}${radius}${fill ? `background:${fill};` : ''}"></span>`
  );
}

/**
 * An inline symbol (`:icon[alt]{…}`, #1058) on its line, its box standing
 * on the baseline (`baselineOffset` from the line top): a picture as an
 * `<img>` (a tinted one as the colour through the picture's mask), a glyph
 * and a line sample as a small SVG, so the glyph's baseline and the
 * stroke's dashes land where the canvas paints them. Named by its
 * alternative text (`role="img"`), hidden when it has none.
 */
function renderInlineIconHtml(icon: VDTInlineIcon, x: number, baselineOffset: number, ink: string, paint?: HtmlPaint): string {
  const box = inlineIconBox(icon, x, baselineOffset);
  const n = (v: number): string => String(+v.toFixed(3));
  const name = icon.alt ? `role="img" aria-label="${esc(icon.alt)}"` : 'aria-hidden="true"';
  const pos = `position:absolute;left:${n(box.x)}px;top:${n(box.y)}px;width:${n(box.width)}px;height:${n(box.height)}px;`;
  const color = icon.color ?? ink;
  if (icon.kind === 'glyph' && icon.glyph && icon.fontString) {
    return `<svg ${name} style="${pos}overflow:visible;" width="${n(box.width)}" height="${n(box.height)}"><text x="0" y="${n(box.height)}" fill="${esc(color)}" style="font:${esc(quoteFontString(icon.fontString))};">${esc(icon.glyph)}</text></svg>`;
  }
  if (icon.kind === 'line') {
    const dash = iconLineDash(icon);
    const y = n(box.height / 2);
    return `<svg ${name} style="${pos}overflow:visible;" width="${n(box.width)}" height="${n(box.height)}"><line x1="0" y1="${y}" x2="${n(box.width)}" y2="${y}" stroke="${esc(color)}" stroke-width="${n(icon.strokePx ?? 1)}"${dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : ''}${icon.line === 'dotted' ? ' stroke-linecap="round"' : ''}/></svg>`;
  }
  const url = icon.fileId ? imageUrl(paint, icon.fileId, icon.resourceId) : undefined;
  if (!url) {
    const stroke = Math.max(0.5, box.height * 0.06);
    return `<span ${name} style="${pos}box-sizing:border-box;border:${stroke.toFixed(2)}px solid ${ink};"></span>`;
  }
  if (icon.color) {
    const mask = `url(&quot;${esc(url)}&quot;) center / 100% 100% no-repeat`;
    return `<span ${name} style="${pos}background:${esc(icon.color)};-webkit-mask:${mask};mask:${mask};"></span>`;
  }
  return `<img src="${esc(url)}" alt="${esc(icon.alt)}"${icon.alt ? '' : ' aria-hidden="true"'} style="${pos}"/>`;
}

/** Inline chip (`:chip[…]`): the box — fill, outline, radius — as one
 *  decorative span (`x` is the segment's left edge; the box starts after its
 *  gap margin), then the text runs as ordinary text spans on the line's
 *  baseline (`baselineOffset` from the line top), so the words stay real,
 *  selectable text. `lineFont` / `lineColor` are the line box's own. */
/**
 * Letters to trace (#1017): the dots of `text` (its run painted at `left`
 * on the baseline `baseline`, `width` wide) in an SVG as wide as the run,
 * so that a mirrored flow turns them back about the run's box as it turns
 * every SVG; each dot a round cap of a stroke a hundredth of a pixel long.
 * `null` where there is no canvas to read the letters from.
 */
function textDotsSvg(
  text: string,
  fontString: string,
  dots: VDTTextDots,
  color: string,
  left: number,
  baseline: number,
  letterSpacingPx: number,
  rtl: boolean,
): string | null {
  const found = textDots({ text, font: fontString, spacingPx: dots.spacingPx, letterSpacingPx: joiningScriptIn(text) ? 0 : letterSpacingPx, rtl });
  if (!found) return null;
  if (found.points.length === 0) return '';
  let d = '';
  for (let i = 0; i < found.points.length; i += 2) d += `M${found.points[i]!.toFixed(2)} ${found.points[i + 1]!.toFixed(2)}h.01`;
  const w = Math.max(0.01, found.width);
  return (
    `<svg aria-hidden="true" focusable="false" width="${w.toFixed(3)}" height="1" viewBox="0 0 ${w.toFixed(3)} 1" ` +
    `style="position:absolute;left:${left.toFixed(3)}px;top:${baseline.toFixed(3)}px;overflow:visible;">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${dots.sizePx.toFixed(3)}" stroke-linecap="round"/></svg>`
  );
}

/** The dots of every run of a design text block, in its box's frame
 *  (see {@link textDotsSvg}); `null` when they cannot be drawn. */
function designTextDotsHtml(block: VDTDesignTextBlock, dots: VDTTextDots): string | null {
  const out: string[] = [];
  for (const line of block.lines) {
    const baseline = line.baselineY - block.bbox.y;
    const runs = line.runs ?? [{ text: line.text, fontString: block.fontString, width: line.width }];
    const order = line.order && line.order.length === runs.length ? line.order : runs.map((_, i) => i);
    let x = line.xOffset;
    for (const i of order) {
      const run = runs[i]! as VDTDesignTextRun;
      if (!run.leader && !run.chip) {
        const svg = textDotsSvg(run.text, run.fontString, dots, block.color, x + (run.inkOffset ?? 0), baseline + (run.baselineShift ?? 0), block.letterSpacingPx ?? 0, run.rtl === true);
        if (svg === null) return null;
        out.push(svg);
      }
      x += run.width;
    }
  }
  return out.join('');
}

function renderChip(
  chip: VDTChip,
  x: number,
  baselineOffset: number,
  lineFont: string,
  lineColor: string,
  inkFor: (run: VDTChipRun) => string,
  /** The direction the document's root declares (see {@link dirAttr}). */
  rootDir: TextDirection = 'ltr',
): string {
  const bx = x + chip.marginLeft;
  const parts: string[] = [];
  const boxGeometry = `position:absolute;left:${bx.toFixed(3)}px;top:${(baselineOffset - chip.ascent).toFixed(3)}px;` +
    `width:${chip.boxWidth.toFixed(3)}px;height:${(chip.ascent + chip.descent).toFixed(3)}px;box-sizing:border-box;`;
  if (chip.background || (chip.borderColor && chip.borderWidth > 0)) {
    // An underline (#1227) is the box's bottom border alone.
    const border = chip.borderColor && chip.borderWidth > 0
      ? `${chip.underline ? 'border-bottom' : 'border'}:${chip.borderWidth.toFixed(3)}px ${chip.underline && chip.underline !== 'solid' ? chip.underline : 'solid'} ${chip.borderColor};`
      : '';
    parts.push(
      `<span aria-hidden="true" style="${boxGeometry}` +
      (chip.background ? `background:${chip.background};` : '') +
      border +
      (chip.borderRadius > 0 && !chip.underline ? `border-radius:${chip.borderRadius.toFixed(3)}px;` : '') +
      `"></span>`,
    );
  }
  // Where an exercise is answered (#1230): a box the digital outputs find
  // by its slot. A blank reads as what it is; its answer is not written.
  if (chip.exercise || chip.blank) {
    const data = chip.exercise ? ` data-pt-ex="${chip.exercise.ex}" data-pt-slot="${esc(chip.exercise.slot)}"` : '';
    const label = chip.blank ? ` role="img" aria-label="${esc(chip.blankLabel ?? 'blank')}"` : '';
    parts.push(`<span class="pt-ex-slot${chip.blank ? ' pt-ex-blank' : ''}"${data}${label} style="${boxGeometry}"></span>`);
  }
  // The readings of its ruby words, over a blank too (#1244).
  if (chip.readings && chip.runs[0]) parts.push(chipReadingsHtml(chip.readings, bx, inkFor(chip.runs[0]), quoteFontString));
  if (chip.blank) return parts.join('');
  let tx = bx + chip.borderWidth + chip.paddingX;
  // The runs in the chip's paint order (`VDTChip.order`); a right-to-left
  // run's box reads right to left.
  const order = chip.order && chip.order.length === chip.runs.length ? chip.order : undefined;
  for (let k = 0; k < chip.runs.length; k++) {
    const run = chip.runs[order ? order[k]! : k]!;
    const font = quoteFontString(run.fontString);
    const color = chip.color ?? inkFor(run);
    const fontDecl = font !== lineFont ? `font:${font};` : '';
    // Letters to trace (#1017): the dots, the text transparent under them.
    const dots = chip.dotted ? textDotsSvg(run.text, run.fontString, chip.dotted, color, tx, baselineOffset + (run.baselineShift ?? 0), 0, run.rtl === true) : null;
    if (dots) parts.push(dots);
    const colorDecl = dots !== null ? 'color:transparent;' : color !== lineColor ? `color:${color};` : '';
    const top = run.baselineShift ? `${run.baselineShift.toFixed(3)}px` : '0';
    // A chip's runs were measured one by one, as a whole each.
    // A run whose direction differs from what it inherits says so, so its
    // neutral characters are ordered and its brackets mirrored as the
    // engine resolved them.
    const dir = dirAttr(run.rtl ? 'rtl' : 'ltr', rootDir);
    parts.push(renderTextSegment({ kind: 'text', text: run.text, width: run.width }, tx, top, fontDecl, colorDecl, color, 0, hasCJK(run.text) ? 'own' : false, dir ? { attrs: dir, decl: '' } : PLAIN_BOX));
    tx += run.width;
  }
  return parts.join('');
}

/**
 * The box of a task item (`VDTBlock.bulletBox`, #765): an inline SVG the
 * size of the box, from `bulletOffsetX` and centred on `bulletY`, in the
 * marker's colour. Its holder is an image named ☐ or ☑, which is what
 * assistive technology reads, and holds that character as text of no
 * size, so a selection copies it as it copied the character the box
 * stands for. On a vertical page the tick is drawn turned back
 * (`vertical`); on a right-to-left one the flow's own rule turns every
 * `svg` back.
 */
function renderTaskBox(block: VDTBlock, vertical = false): string {
  const box = block.bulletBox;
  const firstLine = block.lines[0];
  if (!box || block.bulletOffsetX === undefined || !firstLine) return '';
  const { side, stroke, checked } = box;
  const top = (block.bulletY ?? firstLine.baseline) - side / 2;
  const mark = esc(taskBoxText(checked));
  return (
    `<div class="pt-bullet pt-task-box" role="img" aria-label="${mark}" style="position:absolute;` +
    `left:${block.bulletOffsetX}px;top:${top}px;width:${side}px;height:${side}px;` +
    `color:${block.bulletColor ?? block.color};font-size:0;">` +
    `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" width="${side}" height="${side}" style="position:absolute;left:0;top:0;">` +
    taskBoxSvgBody(stroke / side, checked, vertical ? 'vertical' : undefined) +
    `</svg>${mark}</div>`
  );
}

function renderBullet(block: VDTBlock, rootDir: TextDirection = 'ltr'): string {
  if (block.type === 'listItem' && block.bulletBox) return renderTaskBox(block);
  if (
    block.type !== 'listItem' ||
    !block.bulletText ||
    block.bulletOffsetX === undefined
  ) {
    return '';
  }
  const firstLine = block.lines[0];
  if (!firstLine) return '';
  const bulletFont = quoteFontString(block.bulletFontString ?? block.fontString);
  const bulletColor = block.bulletColor ?? block.color;
  // Render the bullet with the same geometry as the first text line so the
  // browser aligns the bullet glyph on the same baseline as the body text.
  // Canvas uses `textBaseline='middle'` at `bulletY` to center the em square
  // on the x-height; in HTML we get the equivalent alignment naturally when
  // both bullet and line share top/height and font metrics.
  // A marker set on the line's baseline (a contents number, whatever its
  // face and size): the box takes the line's own font, so its baseline is
  // the text's, and the marker sits in an inner box of its face with no
  // line height, which aligns on that baseline without moving it — the
  // way a text segment in another face does (`renderTextSegment`).
  const onBaseline = block.bulletBaselineY !== undefined;
  const lineFont = quoteFontString(block.fontString);
  const baselineShift = onBaseline ? block.bulletBaselineY! - firstLine.baseline : 0;
  // A marker reads in its item's direction: `١.` with its full stop on the
  // left in an Arabic list (#379).
  const markerDir = dirAttr(block.direction ?? rootDir, rootDir);
  // In an Arabic-script document European digits that open the marker read
  // as Arabic numbers (`bulletDirection: 'rtl-arabic'`, #665): `3-1`, a
  // contents number, with the 3 on the right. The browser resolves the
  // marker's order itself, so where that reading changes it the text takes
  // an Arabic letter mark (U+061C) before it, which rule W2 reads as the
  // letter the number follows.
  const markerText = (text: string): string => (block.bulletDirection === 'rtl-arabic' && arabicMarkNeeded(text) ? '&#x61C;' : '') + esc(text);
  const markerDiv = (cls: string, x: number, font: string, color: string, text: string): string =>
    `<div class="${cls}" aria-hidden="true"${markerDir} style="` +
    `position:absolute;` +
    `left:${x}px;` +
    `top:${firstLine.bbox.y + baselineShift}px;` +
    `height:${firstLine.bbox.height}px;` +
    `font:${onBaseline ? lineFont : font};` +
    `color:${color};` +
    `white-space:pre;` +
    (hasCJK(text) ? CJK_TEXT_DECL : '') +
    (onBaseline
      ? `"><span style="font:${font};${hasCJK(text) ? CJK_FEATURES_DECL : ''}line-height:0;">${markerText(text)}</span></div>`
      : `">${markerText(text)}</div>`);
  let html = markerDiv('pt-bullet', block.bulletOffsetX, bulletFont, bulletColor, block.bulletText);
  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    const separatorFont = quoteFontString(block.separatorFontString ?? block.bulletFontString ?? block.fontString);
    const separatorColor = block.separatorColor ?? bulletColor;
    // The prefix run before the number, in the separator's style, first in
    // the markup so a copy reads （一）.
    if (block.prefixText && block.prefixX !== undefined) {
      html = markerDiv('pt-separator', block.prefixX, separatorFont, separatorColor, block.prefixText) + html;
    }
    html += markerDiv('pt-separator', block.separatorX, separatorFont, separatorColor, block.separatorText);
  }
  return html;
}

/**
 * The `line-height` a line box takes so the browser stands its text on the
 * line's baseline: a box of that height sets its text `(height + ascent −
 * descent) / 2` from its top, and the engine puts the baseline at
 * `line.baseline` (`lineBaselineOffset`: 0.8 of the leading), which the
 * canvas and the PDF paint on.
 *
 * Without it a line box keeps `line-height: normal`, which stands the text
 * on the face's own ascent — the leading's 0.8 only where the two happen to
 * meet — while everything else the line carries (a highlight band, an
 * emphasis mark, a formula, a chip, a swatch, a leader) is placed from
 * `line.baseline`. The two then drift apart as the leading moves away from
 * the face's natural line: a page set 1.5 em on a face whose ascent is 0.85
 * em leaves the text a third of an em above its band.
 *
 * '' where the measurer gives no face metrics (nothing measures, or the
 * faces are not loaded where the markup is written): the box keeps
 * `normal`, as it did up to postext 1.55.
 */
function baselineLineHeightDecl(line: VDTLine, fontString: string): string {
  const box = measureFontBox(fontString);
  if (!box) return '';
  const height = 2 * (line.baseline - line.bbox.y) - (box.ascent - box.descent);
  if (!Number.isFinite(height) || height < 0) return '';
  return `line-height:${height.toFixed(3)}px;`;
}

function renderLine(
  line: VDTLine,
  block: VDTBlock,
  targets?: ReadonlySet<string>,
  rootDir: TextDirection = 'ltr',
  rootLang?: string,
  /** The block's line after this one (see {@link lineEndText}). */
  next?: VDTLine,
  /** Markup set at the start of the line's box, before its text (a drop
   *  cap, #623). */
  lead = '',
  /** Where the line's inline pictures come from (#1249). */
  paint?: HtmlPaint,
): string {
  const font = quoteFontString(block.fontString);
  const strikethroughDecl = block.strikethroughText ? 'text-decoration:line-through;' : '';
  // Tracking — the block's (column balancing, a runt set short) and the
  // line's own (justification): measured into the segment widths, so the
  // glyphs must spread the same way.
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trackingDecl = tracking !== 0 ? `letter-spacing:${tracking}px;${ligaturesDecl()}` : '';
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${font};` +
    // After `font:`, which resets the line height to `normal`.
    baselineLineHeightDecl(line, block.fontString) +
    `color:${block.color};` +
    strikethroughDecl +
    trackingDecl +
    (lineCjkDecl(line) ? cjkTextDecl(tracking !== 0) : '') +
    `">${lineHighlightsHtml(line)}${lead}${renderSegments(line, block, targets, rootDir, rootLang, lineEndText(line, next), paint)}</div>`
  );
}

/**
 * A paragraph's drop cap (#623), as the first runs of its first line's box:
 * an opening mark hung before it, then the initial, each standing on its
 * baseline (a box in the line's font shifted down to it, the glyphs in an
 * inner box of their own face with no line height, as a contents number
 * sits on its line). In the markup they come right before the line's text,
 * with nothing between, so a copy and a screen reader read the first word
 * whole.
 */
function dropCapHtml(cap: VDTDropCap, line: VDTLine, lineFont: string, tracking = 0): string {
  // The cap is measured and painted on the canvas with no tracking; set
  // inside the box of a tracked line it would inherit the line's
  // (#770: `Se` at 86.25 px on a line tracked 0.25 px, 95.39 px measured,
  // 95.91 px in the box).
  const untracked = tracking !== 0 ? 'letter-spacing:normal;' : '';
  const run = (text: string, font: string, x: number, baselineY: number, width: number, cls: string): string =>
    `<span class="${cls}" style="position:absolute;left:${(x - line.bbox.x).toFixed(3)}px;top:${(baselineY - line.baseline).toFixed(3)}px;` +
    `width:${width.toFixed(3)}px;height:${line.bbox.height}px;font:${lineFont};color:${cap.color};white-space:pre;` + untracked +
    (hasCJK(text) ? CJK_TEXT_DECL : '') +
    `"><span style="font:${quoteFontString(font)};line-height:0;">${esc(text)}</span></span>`;
  const hang = cap.hang ? run(cap.hang.text, cap.hang.fontString, cap.hang.x, cap.hang.baselineY, cap.hang.width, 'pt-dropcap-hang') : '';
  return hang + run(cap.text, cap.fontString, cap.x, cap.baselineY, cap.width, 'pt-dropcap');
}

// ---------------------------------------------------------------------------
// Vertical text (`VDTPage.flow`)
//
// A vertical page's flow is rendered in a box turned a quarter turn
// clockwise (`pt-flow`, see `renderPageDetailed`), so boxes, rules,
// pictures, turned resource blocks and everything else of the flow land on
// the sheet as the canvas paints them. Each text line is turned back
// upright inside it — one box per line, the line's physical rectangle — and
// set with `writing-mode: vertical-rl`: the browser stands Chinese
// characters upright, takes the fonts' vertical forms and sets Latin words
// sideways. Every segment is placed where the layout put it along the line
// (`top`), its em boxes centred on the column's central axis; tate-chu-yoko
// cells are `text-combine-upright: all`, `:upright` and `:sideways` runs
// `text-orientation`.
// ---------------------------------------------------------------------------

/** The central axis of a font (em above the baseline). */
function centralOf(v: VerticalHtml, fontString: string): number {
  return v.axes?.[fontFamilyOf(fontString)] ?? DEFAULT_CENTRAL_BASELINE;
}

/** Characters of Japanese vertical text the HTML sets otherwise than the
 *  browser would: “ ” (set as 〝 〟) and the marks of a pair set in one
 *  cell (`isUprightMarkPair`). */
const JAPANESE_VERTICAL_RE = /[“”!?！？]/;

/** Escaped text of a vertical run, with its tate-chu-yoko cells, the
 *  orientation its author forced, and each turned mark in a box of its
 *  cell ({@link turnedCellHtml}). `font` is the run's font string (whose
 *  family's `dashes` stretch a dash) and `tracking` the letter spacing it
 *  is set with, px, which follows each cell. A Japanese “ ” is written as
 *  the 〝 〟 the canvas and the PDF paint (`VerticalGlyph.paintAs`), whose
 *  vertical form the browser takes; a pair of ！？ in one cell is combined
 *  as written, the browser fitting it to the cell. */
function verticalTextHtml(text: string, v: VerticalHtml, orient?: ForcedOrientation, font?: string, tracking = 0): string {
  if (orient === 'tcy') return `<span style="text-combine-upright:all;">${esc(text)}</span>`;
  if (orient === 'upright') return `<span style="text-orientation:upright;">${esc(text)}</span>`;
  // A sideways Latin word of a tracked line in the canvas's pieces, its
  // ligatures with the tracking of each letter (#770).
  const tracked = font !== undefined ? trackedIn(font, tracking) : undefined;
  if (orient === 'sideways') return `<span style="text-orientation:sideways;">${trackedTextHtml(text, tracked)}</span>`;
  const digits = v.uprightDigits > 0 && /[0-9]/.test(text);
  const japanese = v.region === 'japan' && JAPANESE_VERTICAL_RE.test(text);
  if (!digits && !japanese && !holdsTurnedMark(text)) return trackedTextHtml(text, tracked);
  const runs = verticalRuns(graphemesOf(text), v.region, v.uprightDigits);
  if (!runs.some((r) => r.glyph.orient === 'tcy' || r.glyph.orient === 'rotate' || r.glyph.paintAs !== undefined)) return trackedTextHtml(text, tracked);
  const advances = font !== undefined ? v.dashes?.[fontFamilyOf(font)] : undefined;
  // A number in one cell combined upright; a turned mark in its cell.
  return runs.map((r) => (r.glyph.orient === 'tcy'
    ? `<span style="text-combine-upright:all;">${esc(r.text)}</span>`
    : r.glyph.orient === 'rotate' ? turnedCellHtml(r, advances?.[r.text], tracking)
    : r.glyph.paintAs !== undefined ? esc(r.glyph.paintAs) : trackedTextHtml(r.text, tracked))).join('');
}

/**
 * A mark a vertical line turns in a cell of its own (`rotate`: a dash, an
 * ellipsis, an interpunct, a wave dash). The browser sets it sideways at
 * its horizontal advance (Noto's · is a third of an em), where the layout
 * gave it its cell (one em; half an em for the mainland interpunct), as
 * the canvas and the PDF paint it: so it stands in a box the cell's
 * length, centred in it, with the line's tracking after the box as after
 * any cell. A dash is stretched to fill its cell, as they stretch it: by
 * its advance the layout measured (`advance`, ems), with the glyph it
 * measured (the face's Chinese form off, see {@link DASH_FEATURES_DECL});
 * with no measured advance, in the font's full-width form (Noto's —).
 */
function turnedCellHtml(run: VerticalRun, advance: number | undefined, tracking: number): string {
  const cell = run.cell ?? 1;
  let inner = esc(run.text);
  if (run.glyph.stretch) {
    inner = advance !== undefined && advance > 0
      ? `<span style="${advance < cell ? `transform:scaleY(${(cell / advance).toFixed(4)});` : ''}${DASH_FEATURES_DECL}">${inner}</span>`
      : `<span style="font-variant-east-asian:full-width;">${inner}</span>`;
  }
  return `<span style="display:inline-flex;justify-content:center;inline-size:${cell}em;letter-spacing:0;${tracking !== 0 ? `margin-inline-end:${tracking}px;` : ''}">${inner}</span>`;
}

/**
 * A box of the turned flow (`left`, `top`, `width` along the line,
 * `height` across it) holding a box turned back upright, set vertically:
 * `content` is placed inside that one with physical `top` (along the line)
 * and `right` (from the box's physical right edge, the flow's top).
 */
function uprightBox(left: number, top: number, width: number, height: number, decl: string, content: string, attrs = '', sideways = ''): string {
  return (
    `<div${attrs ? ` ${attrs}` : ''} style="position:absolute;left:${left.toFixed(3)}px;top:${top.toFixed(3)}px;width:${Math.max(0, width).toFixed(3)}px;height:${height.toFixed(3)}px;">` +
    uprightInner(width, height, decl, content) +
    // What is set in the turned flow itself (a chip, #1162): sideways.
    sideways +
    `</div>`
  );
}

/** The box of {@link uprightBox} turned back upright: `height` wide on the
 *  sheet, `width` tall, set vertically. */
function uprightInner(width: number, height: number, decl: string, content: string): string {
  return (
    `<div style="position:absolute;left:0;top:0;width:${height.toFixed(3)}px;height:${Math.max(0, width).toFixed(3)}px;` +
    `transform:translate(0,${height.toFixed(3)}px) rotate(-90deg);transform-origin:0 0;` +
    `writing-mode:vertical-rl;text-orientation:mixed;${decl}">${content}</div>`
  );
}

/** A run of vertical text at `at` along its box, its em boxes centred
 *  `axis` px from the box's flow top (the physical right edge). The
 *  line height that centres them comes after `decl`: a `font` shorthand
 *  in it resets `line-height` to `normal`. */
function verticalSpan(at: number, axis: number, inner: string, decl = ''): string {
  const lh = Math.max(0, 2 * axis);
  return `<span style="position:absolute;top:${at.toFixed(3)}px;right:0;white-space:pre;${decl}line-height:${lh.toFixed(3)}px;">${inner}</span>`;
}

/** A run of vertical text whose em boxes are centred `axis` px from the
 *  box's flow top, on either side of it (a ruby reading or a warichu row
 *  sits outside the line's own box); `hidden` from assistive technology
 *  (a warichu row, which its note box reads). */
function verticalSpanAt(at: number, axis: number, size: number, inner: string, decl = '', hidden = true): string {
  const lh = Math.max(1, 2 * size);
  return `<span${hidden ? ' aria-hidden="true"' : ''} style="position:absolute;top:${at.toFixed(3)}px;right:${(axis - lh / 2).toFixed(3)}px;white-space:pre;${decl}line-height:${lh.toFixed(3)}px;">${inner}</span>`;
}

/** Annotation runs of a vertical line (a ruby reading, a warichu note's
 *  rows, #194, #195) from `x` along it: set down the column in their own
 *  face, centred across it on their baseline (`dy`) less their face's
 *  axis, a zhuyin tone mark standing upright (`VDTAnnotationRun.upright`).
 *  `hidden` from assistive technology unless they are a ruby reading's,
 *  which its `<rt>` holds (#428). */
function verticalAnnotationRuns(runs: readonly VDTAnnotationRun[], x: number, color: string, v: VerticalHtml, axisOf: (fontString: string, shift?: number) => number, hidden = true): string {
  return runs.map((run) => {
    const decl = `font:${quoteFontString(run.fontString)};color:${run.color ?? color};letter-spacing:0;`;
    return verticalSpanAt(x + run.dx, axisOf(run.fontString, run.dy), extractFontSizePx(run.fontString), verticalTextHtml(run.text, v, run.upright ? 'upright' : undefined, run.fontString), decl, hidden);
  }).join('');
}

/**
 * The advance of `text` down a vertical line, as the layout measures it
 * (`verticalTextWidth`): its sideways runs at the width the measurer
 * gives them, every cell at its length in ems, `tracking` px after each
 * character and each cell.
 */
function verticalAdvance(text: string, font: string, v: VerticalHtml, tracking: number): number {
  const em = extractFontSizePx(font);
  let width = 0;
  for (const run of verticalRuns(graphemesOf(text), v.region, v.uprightDigits)) {
    width += run.cell === undefined
      ? measureTextWidth(run.text, font) + (tracking === 0 ? 0 : tracking * graphemeCount(run.text))
      : em * run.cell + tracking;
  }
  return width;
}

/**
 * The segments a line down a vertical page is written from (#770): the
 * line's own, the pieces of a word set sideways joined into one box where
 * the word was measured whole (`lineWordSegments`, the rule of a
 * horizontal line, see {@link wordSegmentsOf}).
 *
 * A Latin word runs sideways down the column, shaped as on a horizontal
 * line, and a piece of it is as wide as the word grew by it. Chrome 154,
 * Noto Sans TC at 15.63 px under `zh-Hant`: the layout holds `BY-` 22.51
 * and `SA` 18.46 px, `BY-SA` being 40.97 px, where `SA` alone is 18.81 px
 * (the face draws the hyphen 0.34 px narrower before the capital). In a
 * box of its own `SA` ended 0.35 px past its place; the word in one box
 * is 40.98 px. A line of the CJK composer, which measures a Western run
 * whole, and a line that carries an order are written as they are; so is
 * every line where the language is not known.
 */
function verticalWordSegments(line: VDTLine, block: VDTBlock, v: VerticalHtml, tracking: number): VDTLineSegment[] | undefined {
  const shaped = shapedText;
  if (!shaped || !line.segments || line.cjkComposed || line.order !== undefined) return line.segments;
  return lineWordSegmentsInOrder(line, false, (seg, text) =>
    withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => verticalAdvance(text, pickSegmentFont(seg, block), v, tracking))).segments;
}

/** A body line of a vertical page: its text segments down an upright box,
 *  its formulas, swatches and chips sideways where the canvas paints them
 *  (see the section comment). */
function renderVerticalLine(line: VDTLine, block: VDTBlock, v: VerticalHtml, targets?: ReadonlySet<string>, next?: VDTLine, paint?: HtmlPaint): string {
  const lineTracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, lineTracking);
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;
  const baseline = line.baseline - line.bbox.y;
  const blockFont = quoteFontString(block.fontString);
  const axisOf = (fontString: string, shift = 0): number => baseline + shift - centralOf(v, fontString) * extractFontSizePx(fontString);
  const inner: string[] = [];
  const sideways: string[] = [];
  // The pieces of a sideways word in one box (see `verticalWordSegments`).
  const own = verticalWordSegments(line, block, v, lineTracking);
  const segs = own && own.length > 0
    ? own
    : [{ kind: 'text', text: line.text, width: line.bbox.width } as VDTLineSegment];
  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = line.segments && line.segments.length > 0 ? lineInkExtent(line, 0).width : line.bbox.width;
  const useJustify = block.textAlign === 'justify' && spaceCount > 0
    && !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify ? (effectiveWidth - wordWidth) / spaceCount : 0;
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  let x = block.textAlign === 'center' ? slack / 2 : block.textAlign === 'right' ? slack : 0;
  const spaceAxis = axisOf(block.fontString);
  // The `<ruby>` open across the bases of one annotation (#428).
  const ruby = rubyRuns();
  for (const seg of segs) {
    inner.push(ruby.before(seg));
    if (seg.kind === 'space') {
      // The space as text, for copying (#403).
      if (seg.text) inner.push(verticalSpan(x, spaceAxis, esc(seg.text)));
      x += useJustify && !seg.autospace ? justifiedSpaceWidth : seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      sideways.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      sideways.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      sideways.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, blockFont, block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block)));
      x += seg.width;
      continue;
    }
    if (seg.warichu) {
      // A warichu note's part: its two rows down the column, the upper
      // row the right one, read once (#195).
      const w = seg.warichu;
      inner.push(`<span role="note" aria-label="${esc(w.upper + w.lower)}">${verticalAnnotationRuns(w.runs, x, w.color ?? pickSegmentColor(seg, block), v, axisOf)}</span>`);
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap, right of the column (JLReq
      // §4.2.3), read as the marker and linked to its note.
      const runs = verticalAnnotationRuns(seg.sideMarker.runs, x, pickSegmentColor(seg, block), v, axisOf, false);
      const href = segmentHref(seg);
      inner.push(href !== undefined ? `<a href="${esc(href)}" style="color:inherit;text-decoration:none;">${runs}</a>` : runs);
      x += seg.width;
      continue;
    }
    const fontString = pickSegmentFont(seg, block);
    const font = quoteFontString(fontString);
    const color = pickSegmentColor(seg, block);
    // A dash of a 破折号 (`inkScale`): turned with the flow (sideways) and
    // stretched down the column from where the layout put its glyph, the
    // face's own Chinese form off, as the canvas and the PDF paint it.
    const stretched = seg.inkScale !== undefined;
    // A run in another face of a tracked line asks for its ligatures
    // again after its `font`, which resets them (#703).
    const decl = (font !== blockFont ? `font:${font};${lineTracking !== 0 ? ligaturesDecl() : ''}` : '')
      + (color !== block.color ? `color:${color};` : '')
      + (seg.tracking !== undefined ? `letter-spacing:${lineTracking + seg.tracking}px;` : '')
      + (stretched ? `transform:scaleY(${seg.inkScale!.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}` : '');
    const segTracking = seg.tracking !== undefined ? lineTracking + seg.tracking : lineTracking;
    let text = verticalTextHtml(seg.text, v, stretched ? 'sideways' : segmentOrientation(seg), fontString, segTracking);
    // Text set with emphasis dots is emphasis (#193); the dots are the
    // line's marks.
    if (seg.cjkMarks?.dots) text = `<em style="font-style:inherit;">${text}</em>`;
    const href = seg.refResourceId !== undefined
      ? (refLinks(refKey(seg), targets) ? refAnchorHref(refKey(seg)) : undefined)
      : segmentHref(seg);
    if (href !== undefined) text = `<a href="${esc(href)}" style="color:inherit;text-decoration:none;"${seg.href !== undefined && seg.refResourceId === undefined ? ' rel="noopener noreferrer"' : ''}>${text}</a>`;
    // A ruby base and its reading beside it (#194), in a `<ruby>` (#428).
    if (seg.ruby) inner.push(ruby.open(seg));
    inner.push(verticalSpan(x + (seg.inkOffset ?? 0), axisOf(fontString, seg.baselineShift ?? 0), text, decl));
    if (seg.ruby) inner.push(RT_OPEN, verticalAnnotationRuns(seg.ruby.runs, x, seg.ruby.color ?? color, v, axisOf, false), '</rt>', ruby.after(seg));
    if (seg.kunten) {
      // Kanbun marks beside the character (#430), after its `<ruby>`; its
      // 送り仮名 read and copy after it, as transparent text.
      inner.push(ruby.end(), verticalAnnotationRuns(seg.kunten.runs, x, seg.kunten.color ?? color, v, axisOf));
      if (seg.kunten.tate) sideways.push(verticalKuntenTateHtml(seg.kunten, x, line, color));
      if (seg.kunten.okuri) inner.push(verticalSpan(x + seg.width, spaceAxis, esc(seg.kunten.okuri), LINE_END_DECL));
    }
    x += seg.width;
  }
  inner.push(ruby.end());
  // Emphasis dots, proper-name and book-title lines (#193), in the turned
  // flow with the line's box.
  if (line.marks) sideways.push(verticalLineMarksHtml(line, block.color));
  const end = lineEndText(line, next);
  if (end) inner.push(verticalSpan(x, spaceAxis, esc(end), LINE_END_DECL));
  const width = Math.max(line.bbox.width, effectiveWidth);
  const decl = `font:${blockFont};color:${block.color};`
    + (block.strikethroughText ? 'text-decoration:line-through;' : '')
    // A tracked line keeps the ligatures of its sideways Latin runs, as
    // they were measured (#703).
    + (lineTracking !== 0 ? `letter-spacing:${lineTracking}px;${ligaturesDecl()}` : '')
    + (lineCjkDecl(line) || hasCJK(line.text) ? cjkTextDecl(lineTracking !== 0) : '');
  return (
    `<div class="pt-line" data-block="${esc(block.id)}" style="position:absolute;left:${line.bbox.x}px;top:${line.bbox.y}px;width:${width}px;height:${line.bbox.height}px;">` +
    uprightInner(width, line.bbox.height, decl, inner.join('')) +
    sideways.join('') +
    `</div>`
  );
}

/** A list marker of a vertical line (the bullet, the number, its prefix
 *  and separator), set down the column from `x`. */
function renderVerticalMarker(cls: string, x: number, block: VDTBlock, v: VerticalHtml, fontString: string, color: string, text: string): string {
  const line = block.lines[0]!;
  const size = extractFontSizePx(fontString);
  const lineTop = line.bbox.y;
  const h = line.bbox.height;
  // A marker set as text sits on its baseline; a bullet is centred on
  // `bulletY` (its axis).
  const axis = block.bulletBaselineY !== undefined
    ? block.bulletBaselineY - lineTop - centralOf(v, fontString) * size
    : (block.bulletY ?? line.baseline) - lineTop;
  const width = size * graphemesOf(text).length;
  const decl = `font:${quoteFontString(fontString)};color:${color};${hasCJK(text) ? CJK_TEXT_DECL : ''}`;
  return uprightBox(x, lineTop, width, h, decl, verticalSpan(0, axis, verticalTextHtml(text, v, undefined, fontString)), `class="${cls}" aria-hidden="true"`);
}

function renderVerticalBullet(block: VDTBlock, v: VerticalHtml): string {
  if (block.type === 'listItem' && block.bulletBox) return renderTaskBox(block, true);
  if (block.type !== 'listItem' || !block.bulletText || block.bulletOffsetX === undefined || !block.lines[0]) return '';
  const bulletFont = block.bulletFontString ?? block.fontString;
  const bulletColor = block.bulletColor ?? block.color;
  let html = renderVerticalMarker('pt-bullet', block.bulletOffsetX, block, v, bulletFont, bulletColor, block.bulletText);
  if (block.separatorText && block.separatorX !== undefined) {
    const sepFont = block.separatorFontString ?? bulletFont;
    const sepColor = block.separatorColor ?? bulletColor;
    if (block.prefixText && block.prefixX !== undefined) html = renderVerticalMarker('pt-separator', block.prefixX, block, v, sepFont, sepColor, block.prefixText) + html;
    html += renderVerticalMarker('pt-separator', block.separatorX, block, v, sepFont, sepColor, block.separatorText);
  }
  return html;
}

/** The lines of a design text set vertically: in the flow of a vertical
 *  page (an opener, a box title), or on its own (a running head set down
 *  the fore-edge, `VDTDesignTextBlock.writingMode`) inside the block's own
 *  turned frame. Each line's box runs from its baseline's line top. */
function verticalDesignLines(block: VDTDesignTextBlock, v: VerticalHtml, originX: number, originY: number): string {
  const size = extractFontSizePx(block.fontString);
  const font = quoteFontString(block.fontString);
  // A tracked text keeps its ligatures (#703): asked for after each
  // `font`, which resets them.
  const tracked = !!block.letterSpacingPx;
  const parts: string[] = [];
  const h = size * 2;
  for (const line of block.lines) {
    const top = line.baselineY - size * 1.5;
    const axisOf = (fontString: string, shift = 0): number => size * 1.5 + shift - centralOf(v, fontString) * extractFontSizePx(fontString);
    const runs = line.runs ?? [{ text: line.text, fontString: block.fontString, width: line.width }];
    let x = 0;
    const inner: string[] = [];
    const sideways: string[] = [];
    for (const run of runs) {
      // A heading title's chip (#1162): turned with the column, as the
      // canvas and the PDF paint it, its baseline the line's (0.8 of the
      // size under the top of a box one line high).
      if (run.chip) {
        sideways.push(
          `<span style="position:absolute;left:0;top:${(line.baselineY - top - size * 0.8).toFixed(3)}px;font:${font};line-height:1;color:${block.color};">`
          + renderChip(run.chip, x + (run.inkOffset ?? 0), size * 0.8, font, block.color, () => block.color)
          + '</span>',
        );
        x += run.width;
        continue;
      }
      const runFont = quoteFontString(run.fontString);
      // A dash of a 破折号 (`inkScale`, #652): turned with the flow and
      // stretched down the column, as a body segment's is.
      const stretched = run.inkScale !== undefined;
      const decl = (runFont !== font ? `font:${runFont};${tracked ? ligaturesDecl() : ''}` : '')
        + (stretched ? `transform:scaleY(${run.inkScale!.toFixed(4)});transform-origin:0 0;${DASH_FEATURES_DECL}` : '');
      // A run whose width is its box (a CJK mark that gave up blank, #637)
      // sets its glyphs `inkOffset` into it.
      inner.push(verticalSpan(x + (run.inkOffset ?? 0), axisOf(run.fontString, run.baselineShift ?? 0), verticalTextHtml(run.text, v, stretched ? 'sideways' : segmentOrientation(run), run.fontString, block.letterSpacingPx ?? 0), decl));
      x += run.width;
    }
    const width = Math.max(line.width, x);
    const decl = `font:${font};color:${block.color};${hasCJK(line.text) ? cjkTextDecl(tracked) : tracked ? ligaturesDecl() : ''}`
      + (line.wordSpacingPx ? `word-spacing:${line.wordSpacingPx.toFixed(3)}px;` : '');
    parts.push(uprightBox(originX + line.xOffset, originY + top, width, h, decl, inner.join(''), '', sideways.join('')));
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Resource blocks (image / svg / table + caption) — mirrors the canvas
// renderer: geometry is pre-measured and absolute (page coords), so cells,
// borders, and text lines emit as absolutely positioned elements.
// ---------------------------------------------------------------------------

interface ResourceLineFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

function pickResourceFont(seg: VDTLineSegment, fonts: ResourceLineFonts): string {
  if (seg.fontString) return seg.fontString;
  if (seg.bold && seg.italic) return fonts.boldItalic;
  if (seg.bold) return fonts.bold;
  if (seg.italic) return fonts.italic;
  return fonts.normal;
}

/** Render one already-positioned rich-text line (caption or table cell).
 *  Alignment and justification are baked into the measured geometry, so
 *  segments paint sequentially from the line origin — `:ref` segments in the
 *  link colour, `captionLabel` segments in the label colour — with ruby
 *  readings, warichu rows and the line's marks as on a body line (#429). */
function renderResourceLine(
  line: VDTLine,
  fonts: ResourceLineFonts,
  color: string,
  linkColor: string,
  labelColor: string = color,
  targets?: ReadonlySet<string>,
  /** The direction the document's root declares (see {@link dirAttr}). */
  rootDir: TextDirection = 'ltr',
  /** The language the document's root declares. */
  rootLang?: string,
  /** What a copy puts after the line (see {@link lineEndText}). */
  end = '',
  /** The render's options: the pictures of inline symbols (#1058). */
  paint?: HtmlPaint,
): string {
  const baseFont = quoteFontString(fonts.normal);
  const parts: string[] = [];
  const lineDecl = lineCjkDecl(line);
  if (line.segments && line.segments.length > 0) {
    const composed = line.cjkComposed === true;
    const tracking = line.letterSpacing ?? 0;
    // The pieces of a word the layout measured whole are one box (#770).
    const set = composed ? { segments: line.segments, order: line.order } : wordSegmentsOf(line, tracking, (seg) => pickResourceFont(seg, fonts));
    const segs = set.segments!;
    const cjk = !composed && hasCJK(line.text);
    // A caption or cell line with right-to-left runs, or on a mirrored
    // page, advances through its segments in `order` (#379).
    const at = set.order && set.order.length === segs.length ? orderedOffsets(segs, set.order, 0, undefined) : undefined;
    const segColorOf = (seg: VDTLineSegment): string => (seg.refResourceId !== undefined
      ? linkColor
      : seg.captionLabel
        ? labelColor
        : color);
    const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
      const font = quoteFontString(pickResourceFont(seg, fonts));
      const segColor = segColorOf(seg);
      const fontDecl = font !== baseFont ? `font:${font};${tracking !== 0 ? ligaturesDecl() : ''}` : '';
      const colorDecl = segColor !== color ? `color:${segColor};` : '';
      const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
      // Its direction, untracked joining letters and styled runs (#379).
      const box = segmentBox(seg, rootDir, rootLang, tracking, font, segColor, (probe) => ({ font: quoteFontString(pickResourceFont(probe, fonts)), color: segColor }));
      // A line set word by word as every line was before the CJK
      // features (see `renderSegments`).
      return composed
        ? renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, segColor, line.letterSpacing ?? 0, segmentCjk(seg, lineDecl), box)
        : renderWordTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, segColor, cjk && hasCJK(seg.text), box);
    };
    const links = linkRuns();
    let x = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (at) x = at[i]!;
      if (seg.kind === 'space') {
        // The space as text, for copying (#403).
        parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
        parts.push(copyTextHtml(seg.text, x));
        x += seg.width;
        continue;
      }
      parts.push(links.at(segmentHref(seg)));
      if (seg.kind === 'math') {
        parts.push(mathSegmentSvg(seg, x, line, color));
        x += seg.width;
        continue;
      }
      if (seg.kind === 'swatch') {
        parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, color, paint, seg.rtl === true));
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, baseFont, color, () => color, rootDir));
        x += seg.width;
        continue;
      }
      if (composed && seg.warichu) {
        // A warichu note's part: its two rows (#195, #429).
        parts.push(warichuHtml(seg.warichu, x, color, quoteFontString));
        x += seg.width;
        continue;
      }
      if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
        const group = renderRefRuns(segs, i, x, linkColor, (run, runX) => paintText(run, runX, true), refLinks(refKey(seg), targets), at ? { at } : undefined);
        parts.push(group.html);
        x = group.x;
        i = group.end - 1;
        continue;
      }
      parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
      // A ruby base's reading (#194, #429).
      if (seg.ruby) parts.push(rubyHtml(seg.ruby, x, segColorOf(seg), quoteFontString));
      // Kanbun marks (#430), the 送り仮名 read after their character.
      if (seg.kunten) {
        parts.push(kuntenHtml(seg.kunten, x, segColorOf(seg), quoteFontString));
        if (seg.kunten.okuri) parts.push(lineEndHtml(seg.kunten.okuri, x + seg.width));
      }
      x += seg.width;
    }
    parts.push(links.end());
    parts.push(lineEndHtml(end, x));
    // Emphasis marks, side lines, the proper-name and book-title lines
    // (#193, #421, #429).
    if (line.marks) parts.push(lineMarksHtml(line, color));
  } else {
    parts.push(`<span style="position:absolute;left:0;top:0;white-space:pre;">${wordsHtml(line.text)}</span>`);
    parts.push(lineEndHtml(end, line.bbox.width));
  }
  return (
    `<div class="pt-line" style="` +
    `position:absolute;` +
    `left:${line.bbox.x}px;` +
    `top:${line.bbox.y}px;` +
    `height:${line.bbox.height}px;` +
    `font:${baseFont};` +
    // After `font:`, which resets the line height to `normal`.
    baselineLineHeightDecl(line, fonts.normal) +
    `color:${color};` +
    // A tracked line (a table header set with `headerLetterSpacing`) was
    // measured with the tracking in its widths.
    (line.letterSpacing ? `letter-spacing:${line.letterSpacing}px;${ligaturesDecl()}` : '') +
    (lineDecl ? cjkTextDecl(!!line.letterSpacing) : '') +
    `">${lineHighlightsHtml(line)}${parts.join('')}</div>`
  );
}

/** An image fitted to a box: `<img>` from `resourceImageUrl`, or the neutral
 *  placeholder the canvas backend paints when nothing is registered. */
function renderFittedImage(
  url: string | undefined,
  alt: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint?: HtmlPaint,
  svg?: boolean,
  source?: ResourceSafeArea,
): string {
  if (url) {
    const filter = paint ? inkFilterDecl(paint, svg, url) : '';
    return (
      `<img src="${esc(url)}" alt="${esc(alt)}" style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${w}px;height:${h}px;${source ? croppedFitDecl(source) : ''}${filter}" />`
    );
  }
  const labelSize = Math.max(10, Math.min(16, h * 0.1));
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `display:flex;align-items:center;justify-content:center;` +
    `font:${labelSize}px sans-serif;color:rgba(120,120,120,0.8);` +
    `">${label}</div>`
  );
}

/** An attribute list as HTML: a boolean attribute written `name="name"`,
 *  valid in HTML and XHTML alike (the fixed-layout EPUB converts the
 *  markup). */
function htmlAttrs(attrs: Array<[string, string | true]>): string {
  return attrs.map(([name, value]) => ` ${name}="${esc(value === true ? name : value)}"`).join('');
}

/** A video resource (#454): its player — an HTML5 `<video>` for a
 *  self-hosted file, the YouTube or Vimeo `<iframe>` — or its poster with
 *  the play mark and the QR code, linked to the video. */
function renderVideoHtml(
  video: VDTResourceVideo | undefined,
  posterFileId: string | undefined,
  alt: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: HtmlPaint,
  source?: ResourceSafeArea,
): string {
  const box = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const label = alt || 'Video';
  if (video) {
    const stream = video.source !== 'file';
    const own = !stream && video.fileId ? paint.resourceVideoUrl?.(video.fileId) : undefined;
    // Played from an HLS address (no file of its own resolved).
    const hls = !stream && !own && isHlsMimeType(video.mimeType);
    const mode = (stream ? paint.videos?.streams : hls ? (paint.videos?.hls ?? paint.videos?.files) : paint.videos?.files) ?? video.html;
    if (mode === 'player') {
      if (stream && video.embedUrl) {
        return (
          `<iframe class="pt-video" src="${esc(video.embedUrl)}" title="${esc(label)}"` +
          ` allow="${esc(videoEmbedAllow(video.player))}"${video.player.fullscreen ? ' allowfullscreen="allowfullscreen"' : ''}` +
          ` loading="lazy" referrerpolicy="strict-origin-when-cross-origin"` +
          ` style="${box}border:0;background:#000;"></iframe>`
        );
      }
      const src = !stream ? own ?? video.link : undefined;
      if (src) {
        const poster = posterFileId ? paint.resourceImageUrl?.(posterFileId) : undefined;
        return (
          `<video class="pt-video" src="${esc(src + mediaFragment(video))}"${hls ? ' data-pt-hls=""' : ''}${poster ? ` poster="${esc(poster)}"` : ''}` +
          `${htmlAttrs(videoElementAttributes(video.player))} aria-label="${esc(label)}"` +
          ` style="${box}object-fit:cover;background:#000;"></video>`
        );
      }
    }
  }
  // The poster, as printed.
  const url = posterFileId ? imageUrl(paint, posterFileId) : undefined;
  const picture = url
    ? `<img src="${esc(url)}" alt="${esc(label)}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;${source ? croppedFitDecl(source) : ''}" />`
    : `<div role="img" aria-label="${esc(label)}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:#1f1f1f;"></div>`;
  const overlay = video ? videoOverlaySvg(video, w, h) : '';
  const inner = picture + overlay;
  return video?.linkPoster && video.link
    ? `<a class="pt-video-link" href="${esc(video.link)}" rel="noopener noreferrer" style="${box}display:block;">${inner}</a>`
    : `<div style="${box}">${inner}</div>`;
}

/** The play mark and QR code of a video's poster as one SVG over the body
 *  (`w` × `h`). In a mirrored flow the SVG turns back about its own box
 *  like a picture, so the overlays land where they are printed and the code
 *  reads. */
function videoOverlaySvg(video: VDTResourceVideo, w: number, h: number): string {
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  const parts: string[] = [];
  const mark = video.playMark;
  if (mark) {
    const { x, y, width: mw, height: mh } = mark.rect;
    const tri = playMarkTriangle(mark).map(([px, py]) => `${n(x + px)},${n(y + py)}`).join(' ');
    if (mark.shape === 'triangle') {
      parts.push(`<polygon points="${tri}" fill="${mark.color}" stroke="${mark.background}" stroke-opacity="${mark.backgroundOpacity}" stroke-width="${n(mh * 0.08)}" stroke-linejoin="round"/>`);
    } else {
      parts.push(mark.shape === 'circle'
        ? `<ellipse cx="${n(x + mw / 2)}" cy="${n(y + mh / 2)}" rx="${n(mw / 2)}" ry="${n(mh / 2)}" fill="${mark.background}" fill-opacity="${mark.backgroundOpacity}"/>`
        : `<rect x="${n(x)}" y="${n(y)}" width="${n(mw)}" height="${n(mh)}" rx="${n(mh * 0.24)}" fill="${mark.background}" fill-opacity="${mark.backgroundOpacity}"/>`);
      parts.push(`<polygon points="${tri}" fill="${mark.color}"/>`);
    }
  }
  const qr = video.qr;
  if (qr) {
    const { x, y, width: qw, height: qh } = qr.rect;
    parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(qw)}" height="${n(qh)}" rx="${n(qr.radius)}" fill="${qr.background}"/>`);
    const d = qrModuleRuns(qr).map((r) => `M${n(x + r.x)} ${n(y + r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z`).join('');
    parts.push(`<path d="${d}" fill="${qr.color}" shape-rendering="crispEdges"/>`);
  }
  if (parts.length === 0) return '';
  return (
    `<svg aria-hidden="true" focusable="false" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}"` +
    ` style="position:absolute;left:0;top:0;overflow:visible;">${parts.join('')}</svg>`
  );
}

/** The `object-fit` of a picture cropped within its safe area (#442): the
 *  shown part spans the picture's whole width or whole height and has the
 *  box's ratio, so `cover` scales the picture as the crop does, and the
 *  position puts the shown part in the box. */
function croppedFitDecl(source: ResourceSafeArea): string {
  const px = source.width < 1 ? (source.x / (1 - source.width)) * 100 : 0;
  const py = source.height < 1 ? (source.y / (1 - source.height)) * 100 : 0;
  return `object-fit:cover;object-position:${+px.toFixed(3)}% ${+py.toFixed(3)}%;`;
}

/** Wrap absolutely positioned page markup in a box clipped to a rounded
 *  outline: the box sits on the outline and rounds its corners, and an inner
 *  layer shifted back by the box's offset keeps the children's page
 *  coordinates. */
function clipToOutline(html: string, o: RoundedOutline): string {
  if (!html) return '';
  const radius = o.radii.map((r) => `${r}px`).join(' ');
  return (
    `<div aria-hidden="true" style="position:absolute;left:${o.x}px;top:${o.y}px;` +
    `width:${o.width}px;height:${o.height}px;overflow:hidden;border-radius:${radius};">` +
    `<div style="position:absolute;left:${-o.x}px;top:${-o.y}px;">${html}</div></div>`
  );
}

function renderResourceTable(rb: ResolvedResourceBlock, bx: number, by: number, options: HtmlPaint): string {
  const t = rb.table;
  if (!t) return '';
  const parts: string[] = [];
  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is drawn round on top.
  const rounded = t.frameRadii !== undefined;
  const outline = (outset: number) => tableFrameOutline(t, bx, by, rb.bodyRect.width, outset);
  // Cell backgrounds first (the cell's own fill, else the header tint / the
  // body or zebra fill), then borders, then text — same paint order as the
  // canvas backend. Each opaque fill runs across the edges it shares with
  // the cells painted after it, so no seam shows between cells at a
  // fractional device-pixel ratio (see `tableCellFillRects`).
  const fills: string[] = [];
  for (const { fill, rects } of tableCellFillRects(t)) {
    for (const r of rects) {
      fills.push(
        `<div aria-hidden="true" style="position:absolute;` +
        `left:${r.x}px;top:${r.y}px;` +
        `width:${r.width}px;height:${r.height}px;` +
        `background:${fill};"></div>`,
      );
    }
  }
  parts.push(rounded ? clipToOutline(fills.join(''), outline(0)) : fills.join(''));
  if (t.strokes) {
    // Booktabs (#625): one box per stroke of the layout, centred on its
    // line (the rules are horizontal; a vertical one is drawn as tall).
    for (const s of t.strokes) {
      const x = bx + Math.min(s.x1, s.x2);
      const y = by + Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      parts.push(
        `<div aria-hidden="true" style="position:absolute;` +
        (h === 0
          ? `left:${x}px;top:${y - s.widthPx / 2}px;width:${w}px;height:${s.widthPx}px;`
          : `left:${x - s.widthPx / 2}px;top:${y}px;width:${s.widthPx}px;height:${h}px;`) +
        `background:${t.borderColor};"></div>`,
      );
    }
  } else if (t.borderWidthPx > 0) {
    // Border boxes are inflated by half the stroke so the border centres on
    // the cell edge — adjacent cells overlap exactly, like canvas strokeRect.
    const bw = t.borderWidthPx;
    const rules = t.rules ?? 'grid';
    const borderBox = (x: number, y: number, w: number, h: number, sides: string): string =>
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${x - bw / 2}px;top:${y - bw / 2}px;` +
      `width:${w + bw}px;height:${h + bw}px;` +
      `${sides}box-sizing:border-box;"></div>`;
    const lines: string[] = [];
    if (rules === 'grid') {
      for (const cell of t.cells) {
        lines.push(borderBox(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height,
          `border:${bw}px solid ${t.borderColor};`));
      }
    } else if (rules === 'horizontal') {
      for (const cell of t.cells) {
        lines.push(borderBox(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height,
          `border-top:${bw}px solid ${t.borderColor};border-bottom:${bw}px solid ${t.borderColor};`));
      }
    } else if (rules === 'outer' && !rounded) {
      const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
      lines.push(borderBox(bx, by, rb.bodyRect.width, tableHeight, `border:${bw}px solid ${t.borderColor};`));
    }
    parts.push(rounded ? clipToOutline(lines.join(''), outline(bw / 2)) : lines.join(''));
    if (rounded && (rules === 'grid' || rules === 'outer')) {
      // The frame's border box is its outer contour, so its radii are the
      // outer ones.
      const o = outline(bw / 2);
      parts.push(
        `<div aria-hidden="true" style="position:absolute;left:${o.x}px;top:${o.y}px;` +
        `width:${o.width}px;height:${o.height}px;border:${bw}px solid ${t.borderColor};` +
        `border-radius:${o.radii.map((r) => `${r}px`).join(' ')};box-sizing:border-box;"></div>`,
      );
    }
  }
  const bodyFonts: ResourceLineFonts = {
    normal: t.fontString,
    bold: t.boldFontString,
    italic: t.italicFontString,
    boldItalic: t.boldItalicFontString,
  };
  const headerFonts: ResourceLineFonts = {
    normal: t.headerFontString,
    bold: t.headerBoldFontString,
    italic: t.headerItalicFontString,
    boldItalic: t.headerBoldItalicFontString,
  };
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const url = imageUrl(options, img.fileId, img.resourceId);
    const { x, y, width, height } = img.rect;
    parts.push(renderFittedImage(url, '', img.kind === 'svg' ? 'SVG' : 'Image', x, y, width, height, options, img.kind === 'svg'));
  }
  for (const cell of t.cells) {
    const fonts = cell.isHeader ? headerFonts : bodyFonts;
    const color = cell.isHeader ? t.headerColor : t.color;
    cell.lines.forEach((line, i) => {
      parts.push(renderResourceLine(line, fonts, color, rb.linkColor, color, options.linkTargets, options.dir, options.rootLang, lineEndText(line, cell.lines[i + 1]), options));
    });
  }
  return parts.join('');
}

/**
 * The labels of a `:::figure` drawn on its picture (#860), its body's
 * top-left corner at (`bx`, `by`): one box per label, turned by its
 * matrix about the block's frame, holding its plate and its lines. The
 * labels follow the picture in the markup, in the order written, so they
 * are read after it; a halo strokes the letters under their fill.
 */
function renderFigureLabelsHtml(rb: ResolvedResourceBlock, bx: number, by: number, options: HtmlPaint): string {
  const n2 = (v: number): string => String(+v.toFixed(4));
  // Their leaders first (#1057), under every label: vector lines hidden
  // from assistive technology, as design paths are.
  const parts: string[] = figureLabelLeaderPaths(rb, bx, by).map((p) => renderDesignPathBlock(p));
  for (const label of rb.labels ?? []) {
    let layout = label.layout;
    if (!layout) continue;
    // A vertical label on a mirrored page (#955): set from its unmirrored
    // layout in a wrapper that reflects the flow's mirror back about the
    // body, so its runs and cells read as they do on any page.
    const unmirrored = layout.mirrored === true && !rb.rotation;
    if (unmirrored) layout = unmirrorLabelLayout(layout, rb.bodyRect.width);
    const m = figureLabelMatrix(layout, bx, by);
    const fonts: ResourceLineFonts = { normal: layout.fontString, bold: layout.boldFontString, italic: layout.italicFontString, boldItalic: layout.boldItalicFontString };
    const halo = layout.halo && layout.halo.widthPx > 0
      ? `-webkit-text-stroke:${n2(2 * layout.halo.widthPx)}px ${layout.halo.color};paint-order:stroke fill;stroke-linejoin:round;`
      : '';
    const inner: string[] = [];
    if (layout.background) {
      const plate = layout.background;
      const r = plate.rect;
      // A plate's outline and corners (#1058), the outline inside the box.
      const look = (plate.color ? `background:${plate.color};` : '')
        + (plate.border ? `box-sizing:border-box;border:${n2(plate.border.widthPx)}px solid ${plate.border.color};` : '')
        + (plate.radiusPx ? `border-radius:${n2(plate.radiusPx)}px;` : '');
      inner.push(`<div aria-hidden="true" style="position:absolute;left:${n2(r.x)}px;top:${n2(r.y)}px;width:${n2(r.width)}px;height:${n2(r.height)}px;${look}"></div>`);
    }
    if (layout.vertical) {
      // A vertical label (#902): its frame is turned a quarter turn by the
      // matrix, as a vertical page's flow is, and each line is set down the
      // column like a body line, from a block that stands for the label.
      const vt = layout.vertical;
      const v: VerticalHtml = { region: vt.region, uprightDigits: vt.uprightDigits, axes: vt.centralBaselines };
      const host = {
        id: label.id ?? '', fontString: layout.fontString, boldFontString: layout.boldFontString, italicFontString: layout.italicFontString,
        boldItalicFontString: layout.boldItalicFontString, color: layout.color, textAlign: 'left', bbox: layout.box,
      } as unknown as VDTBlock;
      layout.lines.forEach((line, i) => inner.push(renderVerticalLine(line, host, v, options.linkTargets, layout.lines[i + 1], options)));
    } else {
      layout.lines.forEach((line, i) => {
        inner.push(renderResourceLine(line, fonts, layout.color, rb.linkColor, layout.color, options.linkTargets, options.dir, options.rootLang, lineEndText(line, layout.lines[i + 1]) || (i + 1 < layout.lines.length ? ' ' : ''), options));
      });
    }
    const dir = layout.direction === 'rtl' ? ' dir="rtl"' : '';
    const id = label.id ? ` data-label="${esc(label.id)}"` : '';
    const box =
      `<div class="pt-figure-label"${id}${dir} style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;` +
      `transform:matrix(${m.map(n2).join(',')});${halo}">` + inner.join('') + '</div>';
    parts.push(unmirrored
      ? `<div class="pt-unmirrored" style="position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;transform:matrix(-1,0,0,1,${n2(2 * bx + rb.bodyRect.width)},0);">${box}</div>`
      : box);
  }
  return parts.join('');
}

function renderResourceBlockHtml(block: VDTBlock, paint: HtmlPaint): string {
  const rb = block.resourceBlock;
  if (!rb) return '';
  // Its caption, notes and cells are horizontal text, in its own frame
  // (upright on a vertical page).
  const options: HtmlPaint = paint.vertical ? { ...paint, vertical: undefined } : paint;
  const parts: string[] = [];
  // A rotated block: its geometry is in the upright frame, emitted inside a
  // wrapper turned a quarter turn about the frame's origin on the page.
  const rot = rb.rotation;
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;

  // Zero-size anchor at the embed's top-left — the target of `:ref` links.
  // A continued slice of a split table is not a target: links land on the
  // first slice.
  const anchor = rb.resource.id && !rb.slice?.continued
    ? `<span id="${esc(resourceAnchorId(rb.resource.id))}" style="position:absolute;` +
      `left:${block.bbox.x}px;top:${block.bbox.y}px;width:0;height:0;"></span>`
    : '';

  if (rb.kind === 'video') {
    // Named like the PDF's figure: its alt text, else its caption, else
    // its label (`Video 1.2`).
    const name = rb.resource.altText?.trim()
      || rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
      || `${rb.captionPrefix} ${rb.number}`.trim();
    parts.push(renderVideoHtml(rb.video, rb.fileId, name, bx, by, bw, bh, options, rb.bodySource));
  } else if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const url = rb.fileId ? imageUrl(options, rb.fileId, rb.resource.id) : undefined;
    // `<img>`, or a neutral placeholder matching the canvas backend's colours.
    // A `:::figure`'s labels follow its alternative text (#862) unless
    // they are drawn as text over it (#860).
    parts.push(renderFittedImage(url, altWithLabels(rb.resource.altText ?? '', undrawnLabels(rb.labels)), rb.kind === 'svg' ? 'SVG' : 'Image', bx, by, bw, bh, options, rb.kind === 'svg', rb.bodySource));
    if (rb.labels) parts.push(renderFigureLabelsHtml(rb, bx, by, options));
  } else if (rb.kind === 'table') {
    parts.push(renderResourceTable(rb, bx, by, options));
  } else if (rb.kind === 'score') {
    parts.push(renderScoreBodyHtml(rb, bx, by, bw, bh));
  }

  // Caption bar (behind the caption lines), like other absolute decorations.
  if (rb.captionBar) {
    const { rect, background } = rb.captionBar;
    parts.push(
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;` +
      `background:${background};"></div>`,
    );
  }
  const captionFonts: ResourceLineFonts = {
    normal: rb.captionFontString,
    bold: rb.captionBoldFontString,
    italic: rb.captionItalicFontString,
    boldItalic: rb.captionBoldItalicFontString,
  };
  rb.captionLines.forEach((line, i) => {
    parts.push(renderResourceLine(line, captionFonts, rb.captionColor, rb.linkColor, rb.captionLabelColor, options.linkTargets, options.dir, options.rootLang, lineEndText(line, rb.captionLines[i + 1]), options));
  });
  const noteFonts: ResourceLineFonts = {
    normal: rb.noteFontString,
    bold: rb.noteBoldFontString,
    italic: rb.noteItalicFontString,
    boldItalic: rb.noteBoldItalicFontString,
  };
  const noteLines = [...rb.noteLines, ...(rb.continuesLines ?? [])];
  noteLines.forEach((line, i) => {
    parts.push(renderResourceLine(line, noteFonts, rb.noteColor, rb.linkColor, rb.noteColor, options.linkTargets, options.dir, options.rootLang, lineEndText(line, noteLines[i + 1]), options));
  });
  if (!rot) return anchor + parts.join('');
  return (
    anchor +
    `<div style="position:absolute;left:${rot.originX}px;top:${rot.originY}px;width:0;height:0;` +
    `transform:rotate(${rot.direction === 'ccw' ? -90 : 90}deg);transform-origin:0 0;">` +
    parts.join('') +
    '</div>'
  );
}

function extractFontSizePx(fontString: string): number {
  // From a number's first digit only (`\D` before it): linear on long digit runs.
  const m = fontString.match(/(?:^|\D)(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]) : 16;
}

function boxStyleDecls(style: VDTDesignBoxStyle): string {
  const bg = style.backgroundColor ? `background:${style.backgroundColor};` : '';
  const border = style.borderColor && style.borderWidthPx > 0
    ? `border:${style.borderWidthPx}px solid ${style.borderColor};box-sizing:border-box;`
    : '';
  const radius = style.borderRadiusPx > 0 ? `border-radius:${style.borderRadiusPx}px;` : '';
  if (!style.borderRadiiPx && !style.borderSides) return `${bg}${border}${radius}`;
  // Corners of their own and a border per side (#1059), as CSS draws them.
  const radii = style.borderRadiiPx
    ? `border-radius:${style.borderRadiiPx.map((r) => `${Math.max(0, r)}px`).join(' ')};`
    : radius;
  const sides = style.borderSides;
  if (!sides) return `${bg}${border}${radii}`;
  const each = (['top', 'right', 'bottom', 'left'] as const)
    .map((side) => {
      const b = sides[side];
      return b && b.widthPx > 0 ? `border-${side}:${b.widthPx}px solid ${b.color};` : '';
    })
    .join('');
  return `${bg}${each ? `${each}box-sizing:border-box;` : ''}${radii}`;
}

function renderBoxAt(bbox: BoundingBox, style: VDTDesignBoxStyle): string {
  if (bbox.width <= 0 || bbox.height <= 0) return '';
  if (!style.backgroundColor && !style.borderColor && !style.borderSides) return '';
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${bbox.x}px;top:${bbox.y}px;` +
    `width:${bbox.width}px;height:${bbox.height}px;` +
    boxStyleDecls(style) +
    `"></div>`
  );
}

/** Whether a line of design text carries one run that is its whole text
 *  in the block's own font, set at its advance with nothing of its own (no
 *  shift, no box, no direction) and no CJK character, which the composer
 *  measures alone: a line without runs by another name. */
function isPlainRun(line: VDTDesignTextBlock['lines'][number], block: VDTDesignTextBlock): boolean {
  const run = line.runs?.length === 1 ? line.runs[0]! : undefined;
  return run !== undefined && line.order === undefined && run.text === line.text && run.fontString === block.fontString && !hasCJK(run.text)
    && !run.baselineShift && !run.stacked && !run.tcy && !run.orientation && !run.rtl && run.inkOffset === undefined && run.inkScale === undefined && !run.chip;
}

function renderDesignTextBlock(block: VDTDesignTextBlock, options?: HtmlPaint): string {
  const parts: string[] = [];
  if (block.box) parts.push(renderBoxAt(block.bbox, block.box));
  if (options?.vertical) return parts.join('') + renderVerticalDesignText(block, options.vertical);
  if (block.vertical) return parts.join('') + renderTurnedDesignText(block);
  const font = quoteFontString(block.fontString);
  const fontSize = extractFontSizePx(block.fontString);
  // A tracked text keeps its ligatures, as it was measured (#703): the
  // block's box asks for them after its `letter-spacing`, each run in
  // another face after its `font`, and a box that takes the CJK
  // declarations holds both sets of features.
  const tracked = !!block.letterSpacingPx;
  const lineParts: string[] = [];
  for (const line of block.lines) {
    const top = line.baselineY - block.bbox.y - fontSize * 0.8;
    // Inline marks: the runs as inline spans on the line's baseline, each
    // in its own font; a script is shifted off the baseline. Of a subscript
    // and a superscript set over each other, the first sits in a box that
    // takes no room and the second in one as wide as the pair (EF-80).
    // Each run was measured whole, and so was a line without runs: the
    // browser's punctuation trimming is off on those that hold CJK text.
    // A line of several words in the block's font: a box per word (see
    // `wordBoxesHtml`), in a line box as wide as the line. So is a line
    // of one run that is its text in the block's font (the CJK composer
    // gives every line of a design text its runs): written through
    // `wordsHtml`, the colophon `Set in Noto Serif TC, … (SIL OFL).` in
    // Source Serif 4 at 13.54 px ended 0.31 px past its 520.63 px, a 64th
    // of a pixel and more at each of its 16 spaces.
    const words = line.runs && !isPlainRun(line, block) ? undefined : wordBoxesHtml(line.text, block.fontString, block.letterSpacingPx ?? 0, line.wordSpacingPx ?? 0);
    const inner = words !== undefined ? words
      : line.runs
      ? line.runs.map((run, i) => {
          // A heading title's chip (#1162): a box as wide as its advance
          // at the top of the line, holding the chip's box and words where
          // the line's baseline is (0.8 of the size down, as the line is
          // placed).
          if (run.chip) {
            const indent = run.inkOffset ? run.inkOffset : 0;
            return `<span style="display:inline-block;vertical-align:top;position:relative;width:${run.width.toFixed(3)}px;height:1em;">`
              + renderChip(run.chip, indent, fontSize * 0.8, font, block.color, () => block.color, options?.dir ?? 'ltr')
              + '</span>';
          }
          const runFont = quoteFontString(run.fontString);
          const cjkDecl = hasCJK(run.text) ? cjkTextDecl(tracked) : '';
          // The `font` shorthand resets `line-height` to `normal`: a run in
          // another face would grow the line box and push the line's
          // baseline down. It keeps the line's own.
          const fontDecl = runFont !== font ? `font:${runFont};line-height:1;${tracked && !cjkDecl ? ligaturesDecl() : ''}` : '';
          // A run whose width is its box comes from the CJK composer,
          // which measured its characters one by one: its cells are set
          // with no kerning between them (see {@link CELLS_DECL}).
          const cellsDecl = run.inkOffset !== undefined ? (cellsOf(run.text) ? CELLS_DECL : '')
            : designCellsDecl(run.text, run.fontString, run.width, block.letterSpacingPx ?? 0);
          const stackDecl = run.stacked
            ? 'display:inline-block;width:0;'
            : line.runs![i - 1]?.stacked ? `display:inline-block;min-width:${run.width.toFixed(3)}px;` : '';
          const shiftDecl = run.baselineShift ? `position:relative;top:${run.baselineShift.toFixed(3)}px;` : '';
          // A run whose width is its box, not its glyphs' advance (a CJK
          // mark that gave up blank, a Han–Latin space, #637): a box that
          // wide, its glyphs set `inkOffset` into it.
          const boxDecl = run.inkOffset !== undefined && !run.stacked
            ? `display:inline-block;width:${run.width.toFixed(3)}px;${run.inkOffset !== 0 ? `text-indent:${run.inkOffset.toFixed(3)}px;` : ''}`
            : '';
          // A dash of a 破折号 (`inkScale`, #652): a box of its own inside
          // the run's, stretched from where the run's indent puts its
          // glyph, as a body segment's is.
          const text = run.inkScale !== undefined
            ? `<span style="display:inline-block;text-indent:0;${inkScaleDecl(run.inkScale)}">${esc(run.text)}</span>`
            // A run whose width is its box holds no word space: its box
            // indents its text, and so would a box inside it.
            : run.inkOffset !== undefined ? esc(run.text)
            : wordsHtml(run.text, trackedIn(run.fontString, block.letterSpacingPx));
          // A contents part row's leader (#889): painted, hidden from
          // assistive technology, as an entry row's is.
          const hidden = run.leader ? ' aria-hidden="true"' : '';
          // In a colour of its own when the contents give it one (#1121).
          const colorDecl = run.color ? `color:${run.color};` : '';
          return fontDecl || cjkDecl || stackDecl || shiftDecl || boxDecl || hidden || colorDecl ? `<span${hidden} style="${fontDecl}${cjkDecl}${cellsDecl}${stackDecl}${shiftDecl}${boxDecl}${colorDecl}">${text}</span>` : text;
        }).join('')
      : letterlessRunHtml(line.text, block.fontString, false, line.width, block.letterSpacingPx ?? 0) ?? wordsHtml(line.text, trackedIn(block.fontString, block.letterSpacingPx));
    // A line that carries directions (an order, a right-to-left run): a box
    // per run (see `directedDesignRunsHtml`), unless a run is set otherwise
    // than as its text at its advance (a stacked script, a box of the CJK
    // composer).
    const apartable = line.runs !== undefined
      && line.runs.every((run) => !run.stacked && run.inkOffset === undefined && run.inkScale === undefined && !run.tcy && !run.orientation && !run.chip);
    // So is a line of several runs with no CJK text, in a document shaped
    // in its own language: the canvas starts each run where the widths
    // before it end, and inline every run, every space in its box and
    // every span is as wide as a whole number of 64ths of a pixel. The
    // byline `John Jumper¹,⁴, Richard Evans¹,⁴, …` in Noto Sans at 15.42
    // px, fifteen runs and fourteen spaces, had its last run 0.32 px past
    // its place, and three more lines of it 0.30 to 0.46 px; a box per
    // run, 0.02 px at most.
    const apart = ownShaping && apartable && words === undefined && line.runs!.length > 1 && !line.runs!.some((run) => hasCJK(run.text));
    const directed = apart || (apartable && (line.order !== undefined || line.runs!.some((run) => run.rtl)));
    const lineDecl = !line.runs && hasCJK(line.text) ? cjkTextDecl(tracked) + designCellsDecl(line.text, block.fontString, line.width, block.letterSpacingPx ?? 0) : '';
    // A justified line: its word spaces widened as the canvas and the PDF
    // advance its runs (EF-109).
    const wordSpacingDecl = line.wordSpacingPx ? `word-spacing:${line.wordSpacingPx.toFixed(3)}px;` : '';
    // A right-to-left text: the line box reads at that base direction, and
    // the browser orders its runs (written in logical order) as the engine
    // did (`VDTDesignTextLine.order`), which keeps copied text logical.
    const lineDir = dirAttr(block.direction === 'rtl' ? 'rtl' : 'ltr', options?.dir ?? 'ltr');
    lineParts.push(
      `<span${lineDir} style="` +
      `position:absolute;` +
      `left:${line.xOffset.toFixed(3)}px;` +
      `top:${top.toFixed(3)}px;` +
      (directed ? 'line-height:1;' : 'line-height:1;white-space:pre;') +
      (words !== undefined ? `width:${line.width.toFixed(3)}px;` : '') +
      wordSpacingDecl +
      lineDecl +
      `">${directed ? directedDesignRunsHtml(line, block, font, tracked) : inner}</span>`,
    );
  }
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;${ligaturesDecl()}` : '';
  // Letters to trace (#1017): the dots over the text, which stays,
  // transparent, to be selected and read.
  const dots = block.dotted ? designTextDotsHtml(block, block.dotted) : null;
  if (dots !== null) lineParts.push(dots);
  // An outline over the glyphs (centred on their edges, as on canvas and in
  // the PDF); hollow letters leave the fill transparent.
  const strokeDecl = dots !== null ? '' : block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` +
      (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  // Pagination furniture (a split callout's repeated title and marker) is
  // read once: hidden from assistive technology.
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  parts.push(
    `<div${hidden} style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${block.bbox.width}px;height:${block.bbox.height}px;` +
    `font:${font};color:${dots !== null ? 'transparent' : block.color};` +
    clipDecl + trackingDecl + strokeDecl +
    `">${lineParts.join('')}</div>`,
  );
  return parts.join('');
}

/** A design text of a vertical page's flow: its lines set down the
 *  column, clipped, tracked and outlined as a horizontal one. A line's
 *  `xOffset` is from the block's own edge (as in `renderDesignTextBlock`),
 *  its `baselineY` in the flow: only the latter is taken back to the box. */
function renderVerticalDesignText(block: VDTDesignTextBlock, v: VerticalHtml): string {
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;` : '';
  const strokeDecl = block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` + (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  return (
    `<div${hidden} style="position:absolute;left:${block.bbox.x}px;top:${block.bbox.y}px;width:${block.bbox.width}px;height:${block.bbox.height}px;${clipDecl}${trackingDecl}${strokeDecl}">` +
    verticalDesignLines(block, v, 0, -block.bbox.y) +
    `</div>`
  );
}

/** A design text set vertically on a page or slot whose text is
 *  horizontal (`VDTDesignTextBlock.vertical`): its lines in the block's own
 *  frame, turned a quarter turn clockwise about the box's top right corner,
 *  each line turned back upright and set vertically. */
function renderTurnedDesignText(block: VDTDesignTextBlock): string {
  const vt = block.vertical!;
  const v: VerticalHtml = { region: vt.region, uprightDigits: vt.uprightDigits, axes: vt.centralBaselines };
  const clipDecl = block.clip ? 'overflow:hidden;' : '';
  const trackingDecl = block.letterSpacingPx ? `letter-spacing:${block.letterSpacingPx}px;` : '';
  const strokeDecl = block.stroke && block.stroke.widthPx > 0
    ? `-webkit-text-stroke:${block.stroke.widthPx}px ${block.stroke.color};` + (block.stroke.hollow ? '-webkit-text-fill-color:transparent;' : '')
    : '';
  const hidden = block.artifact ? ' aria-hidden="true"' : '';
  const { x, y, width, height } = block.bbox;
  return (
    `<div${hidden} style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;${clipDecl}${trackingDecl}${strokeDecl}">` +
    `<div style="position:absolute;left:${width}px;top:0;width:${height}px;height:${width}px;transform:rotate(90deg);transform-origin:0 0;">` +
    verticalDesignLines(block, v, 0, 0) +
    `</div></div>`
  );
}

function renderDesignRuleBlock(block: VDTDesignRuleBlock): string {
  const w = block.direction === 'vertical' ? block.thicknessPx : block.bbox.width;
  const h = block.direction === 'vertical' ? block.bbox.height : block.thicknessPx;
  return (
    `<div aria-hidden="true" style="` +
    `position:absolute;` +
    `left:${block.bbox.x}px;top:${block.bbox.y}px;` +
    `width:${w}px;height:${h}px;` +
    `background:${block.color};` +
    `"></div>`
  );
}

/** A vector shape (DESIGN §12.1, #1055): an inline `<svg>` placed on its
 *  box like a rule, its outline and markers drawn in the box's own
 *  coordinates (ink past the box, a mitre, still shows). Decoration:
 *  hidden from assistive technology. */
function renderDesignPathBlock(block: VDTDesignPathBlock, mirrored = false): string {
  const { x, y, width, height } = block.bbox;
  const parts: string[] = [];
  const stroke = block.stroke && block.stroke.widthPx > 0 ? block.stroke : undefined;
  if ((block.fill || stroke) && block.subpaths.length > 0) {
    const attrs = [`d="${pathSvgData(block.subpaths, x, y)}"`, `fill="${block.fill ? esc(block.fill) : 'none'}"`];
    if (block.fill && block.fillRule === 'evenodd') attrs.push('fill-rule="evenodd"');
    if (stroke) {
      attrs.push(`stroke="${esc(stroke.color)}"`, `stroke-width="${stroke.widthPx}"`);
      if (stroke.dash && stroke.dash.length > 0) attrs.push(`stroke-dasharray="${stroke.dash.join(' ')}"`);
      if (stroke.cap && stroke.cap !== 'butt') attrs.push(`stroke-linecap="${stroke.cap}"`);
      if (stroke.join && stroke.join !== 'miter') attrs.push(`stroke-linejoin="${stroke.join}"`);
    }
    parts.push(`<path ${attrs.join(' ')}/>`);
  }
  for (const m of block.markers ?? []) parts.push(markerSvgElement(m, x, y, esc));
  if (parts.length === 0) return '';
  return (
    `<svg${mirrored ? ' class="pt-path"' : ''} aria-hidden="true" focusable="false" width="${width}" height="${height}" ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:visible;">` +
    parts.join('') +
    `</svg>`
  );
}

function renderDesignBoxBlock(block: VDTDesignBoxBlock): string {
  const html = renderBoxAt(block.bbox, block.box);
  // A callout stripe on a rounded frame: clipped to the frame's outline.
  return block.clip ? clipToOutline(html, block.clip) : html;
}

/** Image block (a callout icon, a picture a design draws): `<img>` from
 *  `resourceImageUrl` — with its alternative text when it is content
 *  (`VDTDesignImageBlock.altText`), else `alt=""` and
 *  `role="presentation"` — or a neutral placeholder box when the host
 *  cannot supply the image. */
function renderDesignImageBlock(block: VDTDesignImageBlock, options?: HtmlPaint): string {
  const { x, y, width, height } = block.bbox;
  if (width <= 0 || height <= 0) return '';
  const url = imageUrl(options, block.fileId);
  if (url) {
    const svg = block.imageKind === undefined ? undefined : block.imageKind === 'svg';
    const tinted = options ? tintFilterDecl(options, block.tint) : '';
    const filter = tinted || (options ? inkFilterDecl(options, svg, url) : '');
    const alt = block.altText ? `alt="${esc(block.altText)}"` : 'alt="" role="presentation"';
    if (options?.vertical) {
      // A picture of a vertical page's flow stands upright on the sheet:
      // turned back inside its box, which runs `width` down the sheet and
      // `height` across it (sized for that when `upright`, else fitted
      // keeping its proportions, as the canvas draws it).
      const k = block.upright ? 1 : Math.min(height / width, width / height);
      // A cover crop (#946): the whole picture over its uncropped box in
      // the upright frame, the box clipping it.
      const c = block.upright ? block.crop : undefined;
      const dw = c ? height / c.width : block.upright ? height : width * k;
      const dh = c ? width / c.height : block.upright ? width : height * k;
      const ox = c ? -c.x * dw : block.upright ? 0 : (height - dw) / 2;
      const oy = c ? -c.y * dh : block.upright ? 0 : (width - dh) / 2;
      return (
        `<div style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;${c ? 'overflow:hidden;' : ''}">` +
        `<img src="${esc(url)}" ${alt} style="position:absolute;left:0;top:0;width:${dw}px;height:${dh}px;` +
        `transform:translate(0,${height}px) rotate(-90deg) translate(${ox}px,${oy}px);transform-origin:0 0;${filter}" /></div>`
      );
    }
    if (block.crop) {
      // A cover crop (#923): the whole picture over its uncropped box, in a
      // box that clips it to the element's.
      const c = block.crop;
      const w = width / c.width;
      const h = height / c.height;
      return (
        `<div style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:hidden;">` +
        `<img src="${esc(url)}" ${alt} style="position:absolute;left:${-c.x * w}px;top:${-c.y * h}px;width:${w}px;height:${h}px;max-width:none;${filter}" /></div>`
      );
    }
    return (
      `<img src="${esc(url)}" ${alt} style="position:absolute;` +
      `left:${x}px;top:${y}px;width:${width}px;height:${height}px;${filter}" />`
    );
  }
  return (
    `<div aria-hidden="true" style="position:absolute;` +
    `left:${x}px;top:${y}px;width:${width}px;height:${height}px;` +
    `background:rgba(160,160,160,0.12);border:1px solid rgba(160,160,160,0.5);box-sizing:border-box;` +
    `"></div>`
  );
}

function renderDesignBlock(block: VDTDesignBlock, options?: HtmlPaint, mirroredPaths = false): string {
  if (block.kind === 'text') return renderDesignTextBlock(block, options);
  if (block.kind === 'rule') return renderDesignRuleBlock(block);
  if (block.kind === 'image') return renderDesignImageBlock(block, options);
  if (block.kind === 'path') return renderDesignPathBlock(block, mirroredPaths);
  return renderDesignBoxBlock(block);
}

function renderDesignSlot(slot: VDTDesignSlot, options?: HtmlPaint, mirroredPaths = false): string {
  const parts: string[] = [];
  for (const block of slot.blocks) parts.push(renderDesignBlock(block, options, mirroredPaths));
  return parts.join('');
}

function renderBlockInner(block: VDTBlock, options: HtmlPaint): string {
  if (block.hidden) return '';
  // An exercise's drawn box (a grid, an operation, a writing area) keeps
  // its paths mirrored with a mirrored flow, as the canvas and the PDF
  // paint it (#1244).
  if (block.designOverlay) return renderDesignSlot(block.designOverlay, options, !!block.callout?.styleId?.startsWith('__postext-ex'));
  // Resource embeds carry their own measured geometry (image/table + caption);
  // the block's single placeholder line renders nothing useful.
  if (block.resourceBlock) return renderResourceBlockHtml(block, options);
  // A strip: its picture is the page's comic markup; the block holds its
  // caption (#590).
  if (block.comic) return renderStripCaptionHtml(block, options);
  const parts: string[] = [];
  const v = options.vertical;
  parts.push(v ? renderVerticalBullet(block, v) : renderBullet(block, options.dir));
  block.lines.forEach((line, i) => {
    const next = block.lines[i + 1];
    const lead = i === 0 && block.dropCap && !v ? dropCapHtml(block.dropCap, line, quoteFontString(block.fontString), (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0)) : '';
    parts.push(v ? renderVerticalLine(line, block, v, options.linkTargets, next, options) : renderLine(line, block, options.linkTargets, options.dir, options.rootLang, next, lead, options));
  });
  return parts.join('');
}

/** A strip's caption (`VDTBlock.stripCaption`, #590): the bar behind it,
 *  then its lines, set as the lines of a paragraph (in the flow: turned on
 *  a vertical page, mirrored on a right-to-left one). Empty without one. */
function renderStripCaptionHtml(block: VDTBlock, options: HtmlPaint): string {
  const caption = block.stripCaption;
  if (!caption) return '';
  const parts: string[] = [];
  if (caption.id) parts.push(zeroSizeAnchor(resourceAnchorId(caption.id), block.bbox.x, block.bbox.y));
  if (caption.bar) {
    const { rect, background } = caption.bar;
    parts.push(
      `<div aria-hidden="true" style="position:absolute;` +
      `left:${block.bbox.x + rect.x}px;top:${block.bbox.y + rect.y}px;width:${rect.width}px;height:${rect.height}px;` +
      `background:${background};"></div>`,
    );
  }
  const v = options.vertical;
  const lines = block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount);
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    parts.push(v ? renderVerticalLine(line, block, v, options.linkTargets, next, options) : renderLine(line, block, options.linkTargets, options.dir, options.rootLang, next, '', options));
  });
  return parts.join('');
}

/** A strip's block: its picture (`comic`, the strip's comic markup when it
 *  is read in its block) and its caption, as one `<figure>` with the
 *  caption its `<figcaption>`, in reading order (#590). On a page whose
 *  comics lie over the sheet the caption stands alone. */
function renderStripBlockHtml(block: VDTBlock, options: HtmlPaint, comic: string): string {
  const caption = renderStripCaptionHtml(block, options);
  if (!caption) return comic;
  if (!comic) return `<div class="pt-strip-caption" style="display:contents;">${caption}</div>`;
  const figcaption = `<figcaption class="pt-strip-caption" style="display:contents;">${caption}</figcaption>`;
  const above = block.stripCaption?.position === 'above';
  return `<figure class="pt-strip" style="display:contents;">${above ? figcaption + comic : comic + figcaption}</figure>`;
}

/**
 * Render a block wrapped in a `<div class="pt-block" data-block-id="...">`
 * container with `display:contents` so lines keep their absolute positioning
 * against the page wrapper. The wrapper exists solely as a stable anchor for
 * per-block DOM patching — consumers can replace a single block's outerHTML
 * without touching the rest of the page.
 */
function renderBlock(block: VDTBlock, options: HtmlPaint, extra = ''): string {
  // A note is where its markers link to (#264).
  const note = block.footnoteNote !== undefined && !block.hidden
    ? zeroSizeAnchor(footnoteElementId(block.footnoteNote), block.bbox.x, block.bbox.y)
    : '';
  // A box printed upside down (#1229): a positioned layer at the page's
  // origin, turned about the box's centre.
  const style = block.turn
    ? `position:absolute;left:0;top:0;width:0;height:0;transform-origin:${block.turn.cx.toFixed(3)}px ${block.turn.cy.toFixed(3)}px;transform:rotate(180deg);`
    : 'display:contents;';
  return (
    `<div class="pt-block" data-block-id="${esc(block.id)}" style="${style}">` +
    note +
    (block.comic && block.stripCaption && !block.hidden ? renderStripBlockHtml(block, options, extra) : renderBlockInner(block, options) + extra) +
    exerciseBoxHtml(block, options) +
    `</div>`
  );
}

/** The boxes of the document's exercises by their own container id (see
 *  {@link HtmlPaint.exerciseBoxes}); `undefined` when it has none. */
function exerciseBoxesOf(data: ExerciseData | undefined): Map<number, { ex: number; outer: boolean }> | undefined {
  if (!data) return undefined;
  const out = new Map<number, { ex: number; outer: boolean }>();
  for (const r of data.exercises) {
    out.set(r.id, { ex: r.id, outer: true });
    for (const s of r.slots) if (s.box !== undefined && !out.has(s.box)) out.set(s.box, { ex: r.id, outer: false });
    for (const g of r.grids ?? []) if (!out.has(g.box)) out.set(g.box, { ex: r.id, outer: false });
  }
  return out;
}

/** Where an exercise's box lies (#1230): an empty element over a callout
 *  frame of an exercise — its outer box, a writing area, a grid — that the
 *  exercise script finds by `data-pt-box` and lays its inputs, lines and
 *  bar in. Not on a vertical page, whose flow is turned. */
function exerciseBoxHtml(block: VDTBlock, options: HtmlPaint): string {
  const boxes = options.exerciseBoxes;
  if (!boxes || block.type !== 'callout' || !block.callout || block.hidden || options.vertical) return '';
  const own = block.calloutPath && block.calloutPath.length > 0 ? block.calloutPath[block.calloutPath.length - 1]! : block.containerId;
  const box = own !== undefined ? boxes.get(own) : undefined;
  if (!box) return '';
  const { x, y, width, height } = block.bbox;
  const part = block.callout.part !== undefined ? ` data-pt-part="${block.callout.part}"${block.callout.continued ? ' data-pt-continued=""' : ''}` : '';
  return `<div class="pt-ex-box" data-pt-box="${own}" data-pt-ex="${box.ex}"${box.outer ? ` data-pt-exercise="${box.ex}"` : ''}${part} ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;pointer-events:none;"></div>`;
}

/** An empty element with an id at a point of the page: the target of an
 *  in-document link. */
function zeroSizeAnchor(id: string, x: number, y: number): string {
  return `<span id="${esc(id)}" style="position:absolute;left:${x}px;top:${y}px;width:0;height:0;"></span>`;
}

interface PageRenderResult {
  /** Full outer HTML including the wrapping <div class="pt-page">. */
  outerHtml: string;
  /** Inner HTML: opener band, pt-block wrappers, header and footer. */
  innerHtml: string;
  /** Per-block outer-HTML strings, in render order. */
  blocks: Array<{ id: string; html: string }>;
  /** Everything on the page that is not a block — opener / part band,
   *  header, footer. Lives outside `blocks`, so a patcher that diffs blocks
   *  must compare this separately to catch a design-only change. */
  decorationHtml: string;
  /** A comic page's markup (`page.comic`), part of `innerHtml`. */
  comicHtml?: string;
}

function renderPageDetailed(
  page: VDTPage,
  background: string,
  pageOptions: HtmlPaint,
  ink: { hex: string; matrix: number[] } | null = null,
  /** With cut lines, how far the bleed box lies inside the sheet (px); 0
   *  without them. */
  bleedInset = 0,
  /** The character grid drawn over the type area (`cjk.grid.show`). */
  gridCells?: CjkGridCells,
  /** `cjk.region` and `cjk.uprightDigits`, for a vertical page. */
  verticalRegion?: CjkRegion,
  verticalDigits?: number,
): PageRenderResult {
  const bgDecl = background && background !== 'transparent' ? `background:${background};` : '';
  // With cut lines nothing the page paints shows past the bleed box, as on
  // the canvas and in the PDF (EF-133).
  const clipDecl = bleedInset > 0 ? `clip-path:inset(${bleedInset}px);` : '';
  // A filter id local to the page and its ink, so every page is
  // self-contained (a patcher may replace pages one by one) and two
  // documents on one page never share a filter.
  const inked: HtmlPaint = {
    ...pageOptions,
    ...(ink ? { ink: { id: `pt-ink-${ink.hex.replace(/[^0-9a-z]/gi, '')}-${page.index}`, matrix: ink.matrix } } : {}),
    // The filters of the pictures painted in a colour, defined on the page.
    tints: { page: page.index, filters: new Map<string, string>() },
  };
  // A vertical page's flow sets its text down the column.
  const vflow = verticalFlowOf(page);
  const options: HtmlPaint = vflow
    ? { ...inked, vertical: { region: verticalRegion ?? 'mainland', uprightDigits: verticalDigits ?? 2, ...(vflow.centralBaselines ? { axes: vflow.centralBaselines } : {}), ...(vflow.dashAdvances ? { dashes: vflow.dashAdvances } : {}) } }
    : inked;
  // The comics the page shows (#565–#567): its comic page (or its half of
  // a spread), then its strips, each on the sheet. A strip is read where
  // it stands in the text: on a page whose flow is the sheet its markup
  // goes in its block; on a vertical or mirrored page, whose flow box is
  // turned, it is laid over the sheet with the comic page.
  const comics = pageComics(page);
  const plainFlow = !vflow && page.flow?.writingMode !== 'horizontal-tb';
  // A comic page's text panels (#885): each frame's blocks laid over its
  // panel, before the panel's lettering, inside the comic's markup.
  // Those of a strip (#959) likewise, inside the strip's markup.
  const comicText = new Map<VDTComicPage, Map<number, string>>();
  const comicTextBlocks: Array<{ id: string; html: string }> = [];
  // On a vertical or right-to-left page the text is set in the page's flow
  // frame (#909): each frame is written in a box that turns or mirrors it
  // as the page's flow box does, over the panel on the sheet.
  const flowBox = vflow
    ? `<div class="pt-flow" style="position:absolute;left:0;top:0;width:${page.height}px;height:${page.width}px;transform:translate(${page.width}px,0) rotate(90deg);transform-origin:0 0;">`
    : page.flow?.writingMode === 'horizontal-tb'
      ? `<div class="pt-flow pt-flow-mirrored" style="position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform:scaleX(-1);transform-origin:${page.flow.mirror.originX / 2}px 0;">${MIRRORED_FLOW_STYLE}`
      : '';
  for (const comic of comics) {
    for (const item of comicFramePaintOrder(page, comic)) {
      if (item.kind !== 'frame' || item.frame.panel === undefined) continue;
      const parts = item.blocks.map((b) => ({ id: b.id, html: renderBlock(b, options) }));
      comicTextBlocks.push(...parts);
      const frameHtml = composedFrameOpen(item.frame, 'auto') + parts.map((b) => b.html).join('') + '</div>';
      const byPanel = comicText.get(comic) ?? new Map<number, string>();
      byPanel.set(item.frame.panel, flowBox ? `${flowBox}${frameHtml}</div>` : frameHtml);
      comicText.set(comic, byPanel);
    }
  }
  const comicMarkup = (comic: VDTComicPage): string => {
    const text = comicText.get(comic);
    return renderComicPageHtml(page, comic, comics.indexOf(comic), options.vertical ? { ...options, vertical: undefined } : options,
      text ? (panel) => text.get(panel.index) ?? '' : undefined);
  };
  const stripInBlock = (block: VDTBlock): string =>
    plainFlow && block.comic && !block.hidden ? comicMarkup(comicBlockOnSheet(page, block)!) : '';
  const blocks: Array<{ id: string; html: string }> = [];
  for (const col of page.columns) {
    for (const block of col.blocks) {
      blocks.push({ id: block.id, html: renderBlock(block, options, stripInBlock(block)) });
    }
  }
  // Floated resources live in page bands outside the columns (a span:'page'
  // float crosses the gutter); they carry absolute geometry already. A
  // composed page's frames (#855) are floats painted with their frames.
  const frameIds = composedFrameBlockIds(page);
  for (const fb of page.floats ?? []) {
    if (frameIds.has(fb.id)) continue;
    blocks.push({ id: fb.id, html: renderBlock(fb, options, stripInBlock(fb)) });
  }
  // A comic page's text panels (#885) are written in the comic's markup;
  // their blocks are the page's to patch.
  blocks.push(...comicTextBlocks);
  // The frames, each in a box of its own that turns it and clips it, in
  // reading order (Markdown order, #862: what a screen reader and a
  // fixed-layout EPUB read), painted in layer order by their `z-index`
  // inside one stacking context, the template's decoration at layer 0;
  // through a flow frame the decoration stands on the sheet, after the flow.
  const composedFlow = page.composed !== undefined && !plainFlow;
  // On a page of a spread (#861) the frames and the decoration show the
  // page's share of the sheet only.
  const sheetClip = composedSheetClip(page);
  const sheetClipped = (html: string): string => {
    if (!sheetClip || html === '') return html;
    const [l, t, r, b] = [sheetClip.x, sheetClip.y, sheetClip.x + sheetClip.width, sheetClip.y + sheetClip.height].map(frameNum);
    return `<div class="pt-sheet-clip" style="position:absolute;left:0;top:0;width:0;height:0;overflow:visible;clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px);">${html}</div>`;
  };
  // Through a flow frame the decoration stands on the sheet: its clip
  // mapped there (#926).
  const sheetOnSheet = composedSheetClipOnSheet(page);
  const decorationClipped = (html: string): string => {
    if (!composedFlow || !sheetOnSheet || html === '') return sheetClipped(html);
    const [l, t, r, b] = [sheetOnSheet.x, sheetOnSheet.y, sheetOnSheet.x + sheetOnSheet.width, sheetOnSheet.y + sheetOnSheet.height].map(frameNum);
    return `<div class="pt-sheet-clip" style="position:absolute;left:0;top:0;width:0;height:0;overflow:visible;clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px);">${html}</div>`;
  };
  const decorationOptions: HtmlPaint = composedFlow ? { ...options, vertical: undefined } : options;
  const underSlot = decorationUnder(page.composed?.decoration);
  const composedDecorationHtml = underSlot ? decorationClipped(renderDesignSlot(underSlot, decorationOptions)) : '';
  // Connectors painted over every frame (#1076): their own box, last in
  // the paint order; through a flow frame, on the sheet after the rest.
  const overSlot = decorationOver(page.composed?.decoration);
  const composedOverHtml = overSlot ? decorationClipped(renderDesignSlot(overSlot, decorationOptions)) : '';
  const composedParts: string[] = [];
  /** The frames' boxes and the decoration: what a patcher of blocks must
   *  also compare (`decorationHtml`). */
  const composedShape: string[] = [];
  if (page.composed) {
    const paint = composedPaintOrder(page);
    for (const item of composedReadingOrder(paint)) {
      const z = paint.indexOf(item) + 1;
      if (item.kind === 'decoration' || item.kind === 'over') {
        const html = item.kind === 'over' ? composedOverHtml : composedDecorationHtml;
        if (!composedFlow && html) composedParts.push(`<div class="pt-frame-decoration${item.kind === 'over' ? ' pt-frame-decoration-over' : ''}" style="position:absolute;left:0;top:0;width:0;height:0;z-index:${z};">${html}</div>`);
        continue;
      }
      if (item.blocks.length === 0) continue;
      const open = composedFrameOpen(item.frame, z, item.facing);
      composedShape.push(open);
      composedParts.push(open);
      // A frame set in its own writing mode (#944) writes its lines as a
      // page of that mode does: set vertically, or across.
      const f = item.frame;
      const frameOptions: HtmlPaint = f.writingMode === 'vertical-rl'
        ? { ...options, vertical: { region: verticalRegion ?? 'mainland', uprightDigits: verticalDigits ?? 2, ...(f.centralBaselines ? { axes: f.centralBaselines } : {}), ...(f.dashAdvances ? { dashes: f.dashAdvances } : {}) } }
        : f.writingMode === 'horizontal-tb' ? { ...options, vertical: undefined } : options;
      for (const b of item.blocks) {
        const html = renderBlock(b, frameOptions, stripInBlock(b));
        // The facing page's half of a frame across a spread's spine is
        // painted only: no block of the page's to patch or select.
        if (item.facing) composedShape.push(html);
        else blocks.push({ id: b.id, html });
        composedParts.push(html);
      }
      composedParts.push('</div>');
    }
    if (composedParts.length > 0) {
      composedParts.unshift('<div class="pt-composed" style="position:absolute;left:0;top:0;width:0;height:0;z-index:0;">');
      composedParts.push('</div>');
    }
  }
  const blocksHtml = blocks.filter((b) => !frameIds.has(b.id)).map((b) => b.html).join('') + sheetClipped(composedParts.join(''));
  // Same paint order as the canvas backend: the opener / part band goes
  // under the body (a part page's full-bleed background must not cover its
  // chapter list); header and footer paint on top.
  const openerHtml = page.openerBand ? renderDesignSlot(page.openerBand, options) : '';
  // Running heads and folios stay on the sheet, horizontal.
  const sheetOptions: HtmlPaint = options.vertical ? { ...options, vertical: undefined } : options;
  const slotParts: string[] = [];
  // Line numbers (#621): on the sheet, hidden from assistive technology
  // (each block is an artifact) and left out of a selection, so copied
  // text runs from line to line without them.
  if (page.lineNumbers) {
    slotParts.push(`<div class="pt-line-numbers" style="user-select:none;-webkit-user-select:none;pointer-events:none;">${renderDesignSlot(page.lineNumbers, sheetOptions)}</div>`);
  }
  if (page.header) slotParts.push(renderDesignSlot(page.header, sheetOptions));
  if (page.footer) slotParts.push(renderDesignSlot(page.footer, sheetOptions));
  // Whether or not a picture on the page uses it: a host patching blocks
  // one by one may bring in an SVG image the first render did not have.
  const defsHtml = inkFilterDefs(options.ink, options.tints?.filters);
  // The separators above the footnotes of the columns.
  const footnoteRulesHtml = footnoteRuleSegments(page).map((r) =>
    `<div class="pt-footnote-rule" style="position:absolute;left:${r.x}px;top:${r.y - r.lineWidthPx / 2}px;width:${r.width}px;height:${r.lineWidthPx}px;background:${r.color};"></div>`,
  ).join('');
  const gridHtml = gridCells ? renderCharacterGridSvg(gridCells, vflow ? page.height : page.width, vflow ? page.width : page.height) : '';
  // A comic page's panels and lettering, on the sheet (never through the
  // flow frame), under the running heads, as the canvas paints them.
  const comicHtml = page.comic ? comicMarkup(page.comic) : '';
  const sheetComicsHtml = comicHtml + (plainFlow ? '' : comics.filter((c) => c !== page.comic).map(comicMarkup).join(''));
  const sheetComposedHtml = composedFlow ? composedDecorationHtml + composedOverHtml : '';
  const decorationHtml = defsHtml + gridHtml + openerHtml + footnoteRulesHtml + sheetComicsHtml + composedShape.join('') + composedDecorationHtml + composedOverHtml + slotParts.join('');
  // A vertical page's flow: one box turned a quarter turn clockwise, its
  // text lines turned back and set vertically (see `renderVerticalLine`).
  const anchorsHtml = (options.anchors ?? [])
    .filter((a) => a.pageIndex === page.index)
    .map((a) => zeroSizeAnchor(anchorElementId(a.id), a.x, a.y))
    .join('');
  const flowHtml = gridHtml + openerHtml + anchorsHtml + blocksHtml + footnoteRulesHtml;
  // A right-to-left page's flow: one box turned over the sheet's vertical
  // axis, every text run and picture in it turned back about its own box
  // (`MIRRORED_FLOW_STYLE`), so the layout lands mirrored and reads as
  // written.
  const innerHtml = defsHtml + (vflow
    ? `<div class="pt-flow" style="position:absolute;left:0;top:0;width:${page.height}px;height:${page.width}px;transform:translate(${page.width}px,0) rotate(90deg);transform-origin:0 0;">${flowHtml}</div>`
    : page.flow?.writingMode === 'horizontal-tb'
      ? `<div class="pt-flow pt-flow-mirrored" style="position:absolute;left:0;top:0;width:${page.width}px;height:${page.height}px;transform:scaleX(-1);transform-origin:${page.flow.mirror.originX / 2}px 0;">${MIRRORED_FLOW_STYLE}${flowHtml}</div>`
      : flowHtml) + sheetComposedHtml + sheetComicsHtml + slotParts.join('');
  // A right-to-left document's pages say so, with its language, for a host
  // that mounts them apart from the document's root (#379); so do a
  // Japanese document's, whose glyph forms (a pan-CJK face's `locl`) and
  // vertical forms the browser picks by language (#428).
  const pageAttrs = (options.dir === 'rtl' ? ' dir="rtl"' : '') + (options.lang !== undefined ? ` lang="${options.lang}"` : '');
  const outerHtml =
    `<div class="pt-page" id="${pageElementId((options.pageIndexOffset ?? 0) + page.index)}" data-page="${page.index}"${pageAttrs} style="` +
    `position:relative;` +
    `width:${page.width}px;` +
    `height:${page.height}px;` +
    `flex-shrink:0;` +
    bgDecl +
    clipDecl +
    `">${innerHtml}</div>`;
  return { outerHtml, innerHtml, blocks, decorationHtml, ...(comicHtml ? { comicHtml } : {}) };
}

/** A number of a frame's box, to four decimals. */
function frameNum(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return String(Object.is(r, -0) ? 0 : r);
}

/** The opening tag of a composed page's frame (#855): an empty box at the
 *  page's origin, so the frame's blocks keep their page coordinates, turned
 *  about the frame's centre (`frameMatrix`) and, when the frame's content
 *  overflows it, clipped to the frame's box (`frameClips`). `z`: its place
 *  in the paint order (`composedPaintOrder`), as the frames are written
 *  in reading order. The facing page's half of a frame across a spread's
 *  spine (#861) is hidden from assistive technology: the text is read on
 *  the other page. */
function composedFrameOpen(frame: VDTFrame, z: number | 'auto', facing = false): string {
  const decls = ['position:absolute', 'left:0', 'top:0', 'width:0', 'height:0', `z-index:${z}`];
  const m = frameMatrix(frame);
  if (m) decls.push('transform-origin:0 0', `transform:matrix(${m.map(frameNum).join(',')})`);
  if (frame.polygon && frame.polygon.length >= 3) {
    // A frame with an outline of its own (a comic panel cut by a slanted
    // line, #885): its content is clipped to it.
    decls.push(`clip-path:polygon(${frame.polygon.map((p) => `${frameNum(p.x)}px ${frameNum(p.y)}px`).join(',')})`);
  } else if (frameClips(frame)) {
    const { x, y, width, height } = frameContentRect(frame);
    const [l, t, r, b] = [x, y, x + width, y + height].map(frameNum);
    decls.push(`clip-path:polygon(${l}px ${t}px,${r}px ${t}px,${r}px ${b}px,${l}px ${b}px)`);
  }
  return `<div class="pt-frame${frame.unmirrorX !== undefined ? ' pt-unmirrored' : ''}" data-frame-id="${esc(frame.id)}" data-layer="${frame.layer}"${facing ? ' data-facing="true" aria-hidden="true"' : ''} style="${decls.join(';')};">`;
}

/** The markup of a comic on a page (its comic page, a half of a spread or
 *  a strip, on the sheet; #565): see `renderComicHtml`. Its pictures come
 *  from `resourceImageUrl` (a miss reported once and drawn as a
 *  placeholder), tinted to the ink when single ink applies; its lettering
 *  is design text. `k`: its place among the page's comics (`pageComics`),
 *  which keeps its ids apart from theirs. */
function renderComicPageHtml(page: VDTPage, comic: VDTComicPage, k: number, options: HtmlPaint, overPanel?: (panel: VDTComicPanel) => string): string {
  return renderComicHtml(comic, page.width, page.height, {
    artUrl: (art) => imageUrl(options, art.fileId, art.resourceId),
    artStyle: (art, url) => inkFilterDecl(options, art.kind === 'svg', url),
    text: (block) => renderDesignTextBlock(block, options),
    idBase: `pt-p-${(options.pageIndexOffset ?? 0) + page.index}${k > 0 ? `-c${k}` : ''}-panel`,
    ...(options.comicCast ? { cast: options.comicCast } : {}),
    ...(overPanel ? { overPanel } : {}),
  });
}

/** What turns the runs and pictures of a mirrored flow back (see
 *  `VDTMirroredFlowFrame`): every text run of the output is an absolutely
 *  positioned box set `white-space:pre` (line segments, plain lines, list
 *  markers, design text lines), and pictures are `<img>` or inline `<svg>`
 *  (formulas). Each turns about its own centre, so it stays where the
 *  mirrored layout put it. A box that sets a transform of its own (a
 *  stretched dash, a turned design picture) keeps it and stays mirrored. */
const MIRRORED_FLOW_STYLE =
  '<style>.pt-flow-mirrored [style*="white-space:pre"],.pt-flow-mirrored img,' +
  // An exercise's drawing is geometry, mirrored with the flow as the canvas
  // and the PDF mirror it (#1244): a crossword's cells, an operation's rules.
  '.pt-flow-mirrored svg:not(.pt-char-grid):not(.pt-path),.pt-flow-mirrored .pt-video{transform:scaleX(-1);}' +
  // A box reflected back about its body (a vertical label, #955) or a
  // vertical frame of the page placed by a matrix that includes the mirror
  // (#960): what is in it is not mirrored, so nothing is turned back.
  '.pt-flow-mirrored .pt-unmirrored [style*="white-space:pre"],.pt-flow-mirrored .pt-unmirrored img,' +
  '.pt-flow-mirrored .pt-unmirrored svg:not(.pt-char-grid):not(.pt-path),.pt-flow-mirrored .pt-unmirrored .pt-video{transform:none;}</style>';

/** The character grid (稿纸) as one SVG path over the page, under the
 *  text (see `cjkGridCells`). */
function renderCharacterGridSvg(cells: CjkGridCells, width: number, height: number): string {
  const { cell } = cells;
  const d: string[] = [];
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  cells.columns.forEach((x0, c) => {
    const chars = cells.columnChars[c] ?? cells.chars;
    const w = chars * cell;
    for (const y of cells.rows) {
      d.push(`M${n(x0)} ${n(y)}h${n(w)}M${n(x0)} ${n(y + cell)}h${n(w)}`);
      for (let i = 0; i <= chars; i++) d.push(`M${n(x0 + i * cell)} ${n(y)}v${n(cell)}`);
    }
  });
  return `<svg class="pt-char-grid" aria-hidden="true" width="${width}" height="${height}" style="position:absolute;left:0;top:0;pointer-events:none;">` +
    `<path d="${d.join('')}" fill="none" stroke="${CHARACTER_GRID_COLOR}" stroke-width="0.5"/></svg>`;
}

export interface HtmlRenderIndexPage {
  index: number;
  width: number;
  height: number;
  innerHtml: string;
  blocks: Array<{ id: string; html: string }>;
  /** Non-block markup (opener band, header, footer); see `PageRenderResult`. */
  decorationHtml: string;
  /** A comic page's markup (`page.comic`): its panels and lettering, laid
   *  over the page box; part of `innerHtml` (and of `decorationHtml`). */
  comicHtml?: string;
}

export interface HtmlRenderIndex {
  html: string;
  mode: 'single' | 'multi';
  pages: HtmlRenderIndexPage[];
  /** The document's exercises for the exercise script (#1230), as `html`
   *  writes them in its `<script class="pt-exercises">`: a host that
   *  patches the pages instead of setting `html` hands them to
   *  `attachExercises` itself. Absent when it has none. */
  exercises?: ExerciseData;
}

/**
 * CSS declarations (a `prop:value;` list) that reset the inherited text
 * properties to the values the engine measured with. Every line of the
 * output is positioned at the widths the canvas measured, so a host that
 * sets `letter-spacing`, `word-spacing`, `text-transform`, a `font-variant`
 * or a `line-height` on an ancestor would otherwise widen or change the
 * glyph runs and make lines overprint. The `.pt-doc` root carries them
 * before its own layout declarations; a host that mounts the pages'
 * `innerHtml` in containers of its own sets them on its root. The root of
 * a right-to-left document (`ResolvedConfig.direction`) sets
 * `direction:rtl` in their place, and `dir="rtl"`: such a host does the
 * same (#379).
 */
export const HTML_TEXT_RESET =
  'letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;' +
  'white-space:normal;word-break:normal;overflow-wrap:normal;' +
  'font-style:normal;font-variant:normal;font-weight:400;font-stretch:normal;' +
  'font-feature-settings:normal;font-variation-settings:normal;font-kerning:auto;' +
  'font-optical-sizing:auto;font-size-adjust:none;font-synthesis:initial;' +
  'line-height:normal;text-align:left;text-shadow:none;text-rendering:auto;' +
  'text-emphasis:none;hyphens:manual;direction:ltr;writing-mode:horizontal-tb;' +
  '-webkit-text-stroke:0;-webkit-text-fill-color:currentcolor;' +
  '-webkit-text-size-adjust:100%;text-size-adjust:100%;';

/**
 * Like renderToHtml, but also returns a per-page / per-block breakdown that
 * callers can use to diff against a previous render and patch only the DOM
 * subtrees whose HTML actually changed.
 */
export function renderToHtmlIndexed(
  doc: VDTDocument,
  options: RenderHtmlOptions = {},
): HtmlRenderIndex {
  const mode = options.mode ?? 'multi';
  const gap = options.columnGap ?? 24;
  const padding = options.padding ?? 24;
  const background =
    options.background ?? doc.config.page.backgroundColor.hex ?? 'transparent';

  // A right-to-left document runs right to left from its root (#379): the
  // browser resolves the text of every box in that direction unless the
  // box declares its own (see `dirAttr`).
  const rtl = doc.config.direction === 'rtl';
  // The language the document was measured in is the one its HTML
  // declares (#764): the browser shapes the text in it, on a page in any
  // other. A document with no language to name (`shapingLanguageOf` gives
  // the empty tag) says `lang=""`, no language, as it was measured; one
  // shaped in the host's declares what it did up to postext 1.28.
  const shapedIn = shapingLanguageOf(doc.config);
  const docLang = shapedIn ?? renderLangOf(doc.config);
  // A right-bound book lays its pages out right to left in a row: a row
  // already runs that way in a right-to-left root.
  const reversed = (doc.binding === 'right') !== rtl;
  const docStyle =
    mode === 'multi'
      ? `display:flex;flex-direction:${reversed ? 'row-reverse' : 'row'};gap:${gap}px;align-items:flex-start;padding:${padding}px;box-sizing:border-box;width:max-content;`
      : `display:flex;flex-direction:column;align-items:center;padding:${padding}px 0;box-sizing:border-box;`;

  // Single-ink diagrams: SVG pictures are filtered to the ink when the host
  // asks (its URLs are not recoloured already).
  const singleInk = options.singleInk ?? options.resourceImageUrl?.singleInk ?? false;
  const inkHex = singleInk ? documentInkHex(doc.config) : null;
  const inkMatrix = inkHex ? singleInkColorMatrix(inkHex) : null;
  const ink = inkHex && inkMatrix ? { hex: inkHex, matrix: inkMatrix } : null;

  const indexedPages: HtmlRenderIndexPage[] = [];
  const pageHtmlParts: string[] = [];
  const onWarning = options.onWarning;
  const reported = new Set<string>();
  const linkTargets = anchoredResourceIds(doc);
  for (const id of options.refTargets ?? []) linkTargets.add(id);
  // The exercises (#1230): their boxes are marked on the pages, their
  // records written once for the exercise script.
  const exercises = exerciseDataOf(doc);
  const exerciseBoxes = exerciseBoxesOf(exercises);
  const anchorPaint: Pick<HtmlPaint, 'anchors' | 'pageIndexOffset' | 'dir' | 'lang' | 'rootLang' | 'comicCast' | 'exerciseBoxes'> = {
    ...(exerciseBoxes ? { exerciseBoxes } : {}),
    ...(doc.config.comics?.cast.length ? { comicCast: doc.config.comics.cast } : {}),
    ...(doc.anchors ? { anchors: doc.anchors } : {}),
    pageIndexOffset: doc.pageIndexOffset ?? 0,
    ...(docLang ? { rootLang: docLang } : {}),
    // Every page says its language, for a host that mounts it apart from
    // the document's root; up to postext 1.28 only a right-to-left and a
    // Japanese one did.
    ...(rtl ? { dir: 'rtl' as const } : {}),
    ...(docLang !== undefined && (shapedIn !== undefined || rtl || isJapaneseLanguage(docLang)) ? { lang: docLang } : {}),
  };
  const bleedInset = doc.trimOffset > 0
    ? Math.max(0, doc.trimOffset - dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi))
    : 0;
  const svgUrl = svgFontInliner(doc, options);
  // The language the pages' text is shaped in, for the words set whole
  // (#770): the declared one, else the writing page's.
  shapedText = shapedTextOf(docLang, documentFontString(doc));
  // A document shaped in its own language sets a tracked ligature with
  // the tracking of each of its letters, as the layout counted it (#770).
  ownShaping = shapedIn !== undefined && shapedText !== null;
  for (const p of doc.pages) {
    const pageOptions: HtmlPaint = onWarning
      ? {
          ...options,
          ...(svgUrl ? { svgUrl } : {}),
          linkTargets,
          ...anchorPaint,
          missingImage: (fileId: string, resourceId?: string) => {
            if (reported.has(fileId)) return;
            reported.add(fileId);
            onWarning({ kind: 'missingImage', fileId, ...(resourceId !== undefined ? { resourceId } : {}), pageIndex: p.index });
          },
        }
      : { ...options, ...(svgUrl ? { svgUrl } : {}), linkTargets, ...anchorPaint };
    const gridCells = doc.config.cjk?.grid?.show && !p.comic ? cjkGridCells(doc.config, p.contentArea, doc.baselineGrid, p.columns, p.flow) : undefined;
    const detail = renderPageDetailed(p, p.background ?? background, pageOptions, ink, bleedInset, gridCells, doc.config.cjk?.region, doc.config.cjk?.uprightDigits);
    // A style's figures (#1237): its feature family is set as the base
    // family with `font-variant-numeric`.
    pageHtmlParts.push(featureFontCss(detail.outerHtml));
    indexedPages.push({
      index: p.index,
      width: p.width,
      height: p.height,
      innerHtml: featureFontCss(detail.innerHtml),
      blocks: detail.blocks.map((b) => ({ ...b, html: featureFontCss(b.html) })),
      decorationHtml: featureFontCss(detail.decorationHtml),
      ...(detail.comicHtml ? { comicHtml: featureFontCss(detail.comicHtml) } : {}),
    });
  }
  shapedText = null;
  ownShaping = false;

  // The host's inherited text properties are reset first (EF-96). A
  // Chinese, Japanese or Korean document declares its language, so the
  // browser picks the region's glyph forms, and so does a right-to-left one,
  // with its direction (see `renderLangOf`).
  const reset = rtl ? HTML_TEXT_RESET.replace('direction:ltr;', 'direction:rtl;') : HTML_TEXT_RESET;
  // The mode, gap and padding come from the caller, typed but not checked:
  // escaped, they cannot leave their attributes.
  const html =
    `<div class="pt-doc"${docLang !== undefined ? ` lang="${docLang}"` : ''}${rtl ? ' dir="rtl"' : ''} data-mode="${esc(mode)}" style="${esc(reset + docStyle)}">` +
    pageHtmlParts.join('') +
    (exercises ? `<script type="application/json" class="pt-exercises">${exerciseDataJson(exercises)}</script>` : '') +
    `</div>`;

  return { html, mode, pages: indexedPages, ...(exercises ? { exercises } : {}) };
}

export function renderToHtml(doc: VDTDocument, options: RenderHtmlOptions = {}): string {
  return renderToHtmlIndexed(doc, options).html;
}
