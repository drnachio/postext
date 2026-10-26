import type { FrameLookEntry, LabelStyle, PageTemplate } from '../composed/types.js';
import type { BodyTextConfig } from './bodyText.js';
import type { IndexConfig } from './bookIndex.js';
import type { CalloutStyleConfig } from './callouts.js';
import type { CitationsConfig, CrossRefsConfig } from './citations.js';
import type { CjkConfig } from './cjk.js';
import type { CodeStyleConfig } from './code.js';
import type { ComicsConfig, ComposedViewerLeafConfig } from './comics.js';
import type { DebugConfig } from './debug.js';
import type { DiagramStyleConfig } from './diagramStyles.js';
import type { ExerciseStyleConfig, ExercisesConfig } from './exercises.js';
import type { FolioConfig } from './folio.js';
import type { CustomFontFamily } from './fonts.js';
import type { FootnotesConfig } from './footnotes.js';
import type { HeaderFooterSlot } from './headerFooter.js';
import type { HeadingsConfig } from './headings.js';
import type { HeadingStyleConfig } from './headingStyles.js';
import type { ChipStyleConfig, MarkStyleConfig } from './inlineStyles.js';
import type { LayoutConfig } from './layout.js';
import type { OrderedListsConfig, UnorderedListsConfig } from './lists.js';
import type { DocumentDirection, LocaleTag, NumeralsSetting } from './locale.js';
import type { MathConfig } from './math.js';
import type { ColorPaletteEntry, PageConfig } from './page.js';
import type { ParagraphStyleConfig } from './paragraphStyles.js';
import type { PartsConfig } from './parts.js';
import type { ChecksConfig, ContrastConfig, PdfGenerationConfig, PrintConfig } from './print.js';
import type { ResourceType } from './resourceTypes.js';
import type { NamedScoreStyleConfig, ScoreStyleConfig } from './scoreStyles.js';
import type { CaptionStyleConfig, NamedTableStyleConfig, TableStyleConfig } from './tableStyles.js';
import type { TocConfig } from './toc.js';
import type { LineNumbersConfig } from './verse.js';
import type { VideoStyleConfig } from './video.js';
import type { CanvasViewerConfig, HtmlViewerConfig } from './viewers.js';

export interface PostextConfig {
  page?: PageConfig;
  layout?: LayoutConfig;
  bodyText?: BodyTextConfig;
  headings?: HeadingsConfig;
  /** Styling for embedded table resources. */
  tableStyle?: TableStyleConfig;
  /** Named table styles a table resource selects with `table.styleId`;
   *  unset fields inherit {@link tableStyle}. Tables without a (known)
   *  style id keep `tableStyle`. */
  tableStyles?: NamedTableStyleConfig[];
  /** Styling for resource captions (numbered label + description). */
  captionStyle?: CaptionStyleConfig;
  /** Styling for embedded SVG diagrams (single-ink reproduction). */
  diagramStyle?: DiagramStyleConfig;
  /** Music scores (notation fences): staff size, music font, spacing (#1173). */
  scoreStyle?: ScoreStyleConfig;
  /** Named score styles a score picks with `{style="…"}`; unset fields
   *  inherit {@link scoreStyle}. */
  scoreStyles?: NamedScoreStyleConfig[];
  /** How video resources are printed (poster overlays: play mark, QR
   *  code) and played (player options). */
  videoStyle?: VideoStyleConfig;
  /** Named paragraph styles for `:::paragraphs{style="…"}` containers. */
  paragraphStyles?: ParagraphStyleConfig[];
  /** Named callout styles for `:::callout{type="…"}` containers. Defaults
   *  to a single neutral `note` style when unset. */
  calloutStyles?: CalloutStyleConfig[];
  /** Named exercise styles for `:::exercise{style="…"}` (#1226). One
   *  plain `exercise` style ships when unset. */
  exerciseStyles?: ExerciseStyleConfig[];
  /** The book's exercise settings: edition, solutions, shuffles, digital
   *  behaviour (#1226). */
  exercises?: ExercisesConfig;
  /** Named chip styles for the inline `:chip[text]{style="…"}`. Defaults
   *  to a single `chip` style when unset. */
  chipStyles?: ChipStyleConfig[];
  /** Named highlight styles for the inline `:mark[text]{style="…"}`
   *  (#888). Defaults to a single pale yellow `mark` style when unset. */
  markStyles?: MarkStyleConfig[];
  /** Part dividers (`:::part` containers): page breaks, body area,
   *  opener design and body typography. */
  parts?: PartsConfig;
  /** Named heading styles applied with `# Title {style="…"}`: a front
   *  matter chapter, an unnumbered appendix, a preface with its own running
   *  heads and page geometry. */
  headingStyles?: HeadingStyleConfig[];
  /** The table of contents a `:::toc` directive prints. */
  toc?: TocConfig;
  /** The back-of-book index a `:::index` directive prints from the
   *  document's `:index` marks. */
  index?: IndexConfig;
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
  math?: MathConfig;
  /** Footnotes (`[^id]` markers and `[^id]: …` definitions). */
  footnotes?: FootnotesConfig;
  /** Cross-references to headings and anchors (`:ref{id="sec-intro"}`,
   *  `@sec:intro`): their words and default style (#266). */
  crossRefs?: CrossRefsConfig;
  /** Citations (`[@key]`) and the bibliography: style, language and
   *  presentation (#270). */
  citations?: CitationsConfig;
  /** East Asian typography: line breaking and justification of Chinese,
   *  Japanese and Korean text (see {@link CjkConfig}). */
  cjk?: CjkConfig;
  /** Line numbers in the margin, for verse or for every line of the text
   *  (#621). Off by default. */
  lineNumbers?: LineNumbersConfig;
  /** Code listings (fenced and indented code blocks) and inline code
   *  (#624). */
  codeStyle?: CodeStyleConfig;
  header?: HeaderFooterSlot;
  footer?: HeaderFooterSlot;

  /** Document language, a BCP 47 tag (see {@link LocaleTag}). The fallback
   *  hyphenation locale when `bodyText.hyphenation.locale` is not explicitly
   *  set, the language of the table continuation strings
   *  (`tableStyle.continuedSuffix` / `continuesMarker`) when those are not
   *  set, and of the built-in resource types (Figure / Table) when
   *  {@link resourceTypes} is not set. Built-in strings exist for the
   *  bundled hyphenation languages; any other language gets the English
   *  ones. Defaults to `'en-us'`. */
  locale?: LocaleTag;

  /** The base direction of the document's text. `'rtl'` sets paragraphs
   *  right to left (Arabic, Hebrew, Persian, Urdu), `'ltr'` left to right;
   *  `'auto'` (the default) takes it from the script of the document
   *  language ({@link locale}, else the hyphenation locale): right to left
   *  for a language written in Arabic, Hebrew, Syriac, Thaana, N'Ko, Adlam
   *  or another right-to-left script (`directionOf`), else left to right.
   *  A right-to-left document is bound on the right when `page.binding` is
   *  `'auto'`. A block sets its own with `{dir=ltr}` / `{dir=rtl}` (a
   *  heading, a `:::` container), a run of text with `:ltr[…]` /
   *  `:rtl[…]`; inside a paragraph the order of mixed text follows the
   *  Unicode Bidirectional Algorithm (`bidi.ts`). Any other value counts
   *  as `'auto'` and is reported (`unknownConfigValue`). */
  direction?: DocumentDirection;
  /** The digits of every number the engine writes — page numbers (and the
   *  page labels of the contents, the index and page references), ordered
   *  list and footnote numbers, heading, chapter and resource counters, the
   *  `{h1}` and `{n}` of a figure number, `{totalPages}`,
   *  `{numberDecimal}`: `'latn'` 0–9, `'arab'` ٠–٩, `'arabext'` ۰–۹. Only
   *  numbers in the decimal format change (`decimal`, the lists'
   *  `arabic`, or no format at all); a format the author names —
   *  `lower-roman`, `arabic-indic`, `persian` — prints as named, and the
   *  author's own text is never rewritten. Default `'auto'`: the digits of
   *  {@link locale} (`defaultNumeralsFor`) — `'arab'` for Arabic (`ar`,
   *  `ar-EG`, `ar-SA`…) but `'latn'` in the Maghreb (`ar-MA`, `ar-DZ`,
   *  `ar-TN`, `ar-LY`, `ar-MR`, `ar-EH`), `'arabext'` for Persian, Pashto
   *  and the Urdu of India, `'latn'` for every other language; a tag that
   *  names its digits (`ar-MA-u-nu-arab`) has them. */
  numerals?: NumeralsSetting;

  debug?: DebugConfig;

  htmlViewer?: HtmlViewerConfig;

  /** The space between the pages in the Sandbox's Canvas (#1002): between
   *  the two pages of a pair, and between one row and the next. A viewer
   *  setting, like {@link htmlViewer}: it never changes a page. */
  canvasViewer?: CanvasViewerConfig;

  /** The 3D book viewer (`postext-folio`): paper, binding, surface, light. */
  folio?: FolioConfig;

  /** Comic pages (`:::page`): panel grid, panel and balloon styles,
   *  lettering, cast. */
  comics?: ComicsConfig;
  /** Page templates (composed pages, #846): named frames, groups and
   *  decoration that a `::::page{template="…"}` fence pours its Markdown
   *  into, slot by slot. Validated (see `validatePageTemplates`): a
   *  template's warnings carry a JSON-pointer `path`. */
  pageTemplates?: PageTemplate[];
  /** Named styles of the labels set at a picture's anchors (`::label`,
   *  `ResourceAnchor.style`). */
  labelStyles?: LabelStyle[];
  /** Named frame looks (#1089): colours (and the body's tracking) a
   *  `:::frame{slot="…" look="<id>"}` piece lays over its frame's style
   *  and template look, so each item of a repeating grid can wear its own.
   *  Validated as a frame's `look`; an id no entry has is the content
   *  warning `lookUnknown`. */
  frameLooks?: FrameLookEntry[];
  /** For hosts whose page is not a leaf (the Sandbox's HTML viewer lays
   *  the book out on pages a screen wide and a scroll tall, #1045): a
   *  composed page (`::::page{template}`) is laid out on this leaf instead
   *  — the print page's size and margins —, on a page of the leaf's own
   *  size, so its frames keep the print geometry (a frame anchored to the
   *  foot sits at the leaf's foot, not a scroll further down). The host
   *  scales that page to the screen. Not saved with a document. */
  composedViewerLeaf?: ComposedViewerLeafConfig;

  pdfGeneration?: PdfGenerationConfig;

  /** Print production: PDF/X, output profile, black, preflight. */
  print?: PrintConfig;

  /** The contrast check: level, rendition, reversed text. */
  contrast?: ContrastConfig;

  /** Checks of the configuration itself (#849): the content check of the
   *  design texts (`contentInConfig`). Layout ignores them. */
  checks?: ChecksConfig;

  colorPalette?: ColorPaletteEntry[];

  /** User-provided font families. Referenced the same way as Google Fonts:
   *  set `bodyText.fontFamily` (or any other font-family field) to the
   *  family's `name`. Custom fonts take precedence over a same-named
   *  Google Font. Binary data is stored out-of-band (IndexedDB in the
   *  sandbox) and referenced by `fileId`. */
  customFonts?: CustomFontFamily[];

  /** User-definable resource categories (figures, tables, etc.) that drive
   *  typed numbering, caption prefixes, and inline references. Defaults to
   *  the built-in 'figure', 'table' and 'video' types when unset (a list
   *  with no 'video' type still numbers video resources typed `video` with
   *  the built-in one), localised to the
   *  document language (`defaultResourceTypes(locale)`, where the language is
   *  {@link locale}, else `bodyText.hyphenation.locale`, else English). */
  resourceTypes?: ResourceType[];
}
