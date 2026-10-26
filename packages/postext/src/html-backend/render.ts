// The entry points renderToHtml and renderToHtmlIndexed, their options,
// and the per-render shaping state they set while pages are written
// (#1276: split out of html-backend.ts).
import { featureFontCss } from '../fonts/figureStyle.js';
import type { RenderWarning, VDTAnchor, VDTDocument } from '../vdt.js';
import { dimensionToPx } from '../units.js';
import { documentInkHex, singleInkColorMatrix } from '../svg/singleInk.js';
import type { SvgFontSyncProvider } from '../svg/fonts.js';
import { cjkGridCells } from '../pipeline/text/cjkGrid.js';
import { shapingLanguageOf, renderLangOf, isJapaneseLanguage } from '../hyphenation/locale.js';
import type { ComicCastMember } from '../types.js';
import { measuresOwnFace } from '../measure/canvas.js';
import { type ExerciseData, exerciseDataOf, exerciseDataJson } from '../exercises/digital.js';
import { svgFontInliner } from './images.js';
import { exerciseBoxesOf, renderPageDetailed } from './page.js';
import { anchoredResourceIds } from './segmentText.js';
import type { TextDirection } from './styles.js';
import { esc } from './textRuns.js';
import type { VerticalHtml } from './vertical.js';

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
export let ownShaping = false;

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
export interface InkFilter {
  id: string;
  matrix: number[];
}

/** Render options as the painters see them: the caller's, plus the page's
 *  single-ink filter when single ink applies and the reporter of the images
 *  emitted as placeholders on the page in progress. */
export interface HtmlPaint extends RenderHtmlOptions {
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

/**
 * The language the browser shapes the text of the document being written
 * in, as far as the writer knows it (#770): `lang` is the one its root
 * declares (the document's own, or none: the empty tag), or undefined for
 * the language of the page that writes it, which shows it too. Null where
 * nobody can tell: a document in the host's language written in a worker,
 * or where nothing measures. Set by {@link renderToHtmlIndexed} while it
 * writes its pages, null again after them.
 */
export let shapedText: { lang: string | undefined } | null = null;

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
