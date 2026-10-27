// Layout, config and render warnings, and the frame-fit proposals a
// composed page reports (#1276: split out of vdt.ts).
import type { Dimension } from '../types.js';

/** Something the layout could not set as asked and placed anyway — a box
 *  taller than any column it could go to. Hosts surface these as warnings;
 *  the geometry still describes what was painted. */
export interface CalloutOverflowWarning {
  /** `calloutOverflow`: a `:::callout` box that fits no column was placed
   *  overflowing its column (by `overflowPx`). A `span: 'side'` box taller
   *  than an empty side column is one too (#639), `columnIndex` then
   *  naming the side column. */
  kind: 'calloutOverflow';
  pageIndex: number;
  columnIndex: number;
  /** Absolute source range of the offending construct in the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** How far past the column's free room the content reaches (px). */
  overflowPx: number;
}

/** A configuration value the engine could not use as written, and what it
 *  used instead. Produced by `collectConfigWarnings` (also on
 *  {@link VDTDocument.configWarnings}); hosts surface these as warnings.
 *  Unlike a {@link LayoutWarning} or a {@link ContentWarning} it belongs to
 *  no page. */
export interface ConfigWarning {
  /** `unknownNumberFormat`: a list `numberFormat`, a page-numbering
   *  `format` or a resource type's `counterFormat` in no spelling the
   *  engine knows; it numbers in decimal.
   *  `fontFamilyStack`: a `fontFamily` (or `…FontFamily`) holding a CSS font
   *  stack; the text is set in the stack's first family.
   *  `sideColumnPercentClamped`: a `oneAndHalf` layout's
   *  `sideColumnPercent` that would leave one of its columns with no width
   *  (or is not a number); the columns are cut at `used` percent instead.
   *  `columnCountClamped`: a `multiple` layout's `columnCount` outside 3 … 8
   *  or not a whole number (or not a number); the page is cut into `used`
   *  columns instead (#505).
   *  `cjkGridClamped`: a character grid (`cjk.grid`) with more characters
   *  per line or lines per page than the margins leave room for; the grid
   *  is reduced to `used`.
   *  `unknownConfigKey`: a key the heading settings or a paragraph style do
   *  not have (`headings`, `headings.balancing`, a heading level, a heading
   *  style, a paragraph style — and the same under
   *  `htmlViewer.overrides`; the `comics` section and its frame, gutters,
   *  panel styles, lettering, balloon styles and cast), such as a misspelt
   *  `letterSpacng`; the
   *  engine ignores it. `value` is the key, `used` is empty, and
   *  `suggestion` names the key it is closest to, when one is close.
   *  `unknownConfigValue`: a setting that takes one of a few words holding
   *  another (`direction: 'right'`); the engine reads its default, and
   *  `used` is what that came to (`direction`: `ltr` or `rtl`, from the
   *  document language; `bodyText.emphasis`: `italic` or `bold`, from it
   *  too; `bodyText.tashkil`: `keep`; a comics setting — `readingDirection`,
   *  `artDirection`, a panel style's `borderStyle` and `fit`, the
   *  lettering's `writingMode`, `textTransform`, `dropFinalStop` and
   *  `joinSameSpeaker`, a balloon style's `shape`, `tail`, `target`,
   *  `position`, `align` and `textTransform` — the value it resolved to:
   *  the default, or that of the style it is laid over; a box style's
   *  `label.icon.kind`, `placement` and `scale`, #1054 — the kind, `beside`,
   *  `1`), and `suggestion` the word it is closest to, when one is close.
   *  A key a box style's `label.icon` does not have is an
   *  `unknownConfigKey` too.
   *  `unknownNumerals`: a `numerals` value that is not `'auto'`,
   *  `'latn'`, `'arab'` or `'arabext'`; the digits follow the document
   *  language, and `used` is the digit system that gives.
   *  `lineNumbersUnsupported`: `lineNumbers.enabled` on a vertical
   *  document (#621), which gets no line numbers; `used` is `false`.
   *  `wrapUnsupported`: a resource type's `defaultPlacement.wrap` in a
   *  vertical document (#627), whose figures keep their bands whole;
   *  `used` is `none`.
   *  `calloutStyleExtendsUnknown` (#905): a box style's `extends` names no
   *  style of `calloutStyles` (`path` `calloutStyles[i].extends`, `value`
   *  the id, `suggestion` the closest id); the style stands alone, from
   *  that parent up. `calloutStyleExtendsCycle`: its `extends` chain comes
   *  back to itself (`value` the chain, `a → b → a`); the style stands
   *  alone. `used` is empty for both.
   *
   *  Page templates (`pageTemplates`, #853; see `validatePageTemplates`),
   *  whose `path` is a JSON pointer (`/pageTemplates/3/frames/2/style`):
   *  `templateDuplicate`: a second template with an id already taken; it
   *  is ignored. `templateExtendsCycle`: a template whose `extends` chain
   *  comes back to itself (`value` the chain, `a → b → a`); it is dropped.
   *  `templateExtendsUnknown`: `extends` names no template; the template
   *  stands alone. `frameDuplicate`: a second frame or group of one list
   *  with a name already taken (or a group named like a frame); it is
   *  ignored. `frameStyleUnknown`: a frame `style` no callout style has;
   *  the frame is frameless. `frameAnchorUnknown`: a frame or group
   *  anchored (`placement.anchor.to: '#x'`) to a frame or group the
   *  template does not have, or a decoration element anchored to nothing
   *  the template has, or anchors that form a loop (`value` the loop);
   *  the anchor reads as `'container'`. `frameMinMax`: a minimum above its
   *  maximum, or a fixed size outside them (`value` says which); the
   *  minimum wins over the maximum and a fixed size is clamped between
   *  them. `groupFrameUnknown`: a group lists a frame the template does
   *  not have; it is skipped. `groupFrameTwice`: a frame listed in a
   *  second group, or twice in one; the later listing is skipped.
   *  `frameChainLoop`: frames whose `next` (or `overflow.continueIn:
   *  '#frame'`) come back round (`value` the loop); the link that closes
   *  it is dropped. `overflowTargetUnknown`: a `next`, an
   *  `overflow.continueIn` or an `overflowTemplate` that names no frame or
   *  template, or a `continueIn` in no form the engine knows; the content
   *  does not continue there. `labelStyleUnknown`: a resource anchor's
   *  `style` that no `labelStyles` entry has (`resourceId` names the
   *  resource); the label takes the default look.
   *
   *  `contentInConfig`: design text elements of one owner (a heading
   *  style, a heading level, the page header or footer, a part design, the
   *  contents part rows) whose text beyond its placeholders is the book's
   *  content (#849): more than `checks.contentInConfig.maxWords` words or
   *  `maxChars` letters and digits, not counting the phrases of its `allow`
   *  list. Nothing is replaced: the text is set as written. `path` is the
   *  owner, `value` the start of the first text (40 characters at most),
   *  `used` is empty, and `count`, `chars` and `elements` say how many
   *  texts, how many letters and where. The fix is to move the text into
   *  the Markdown and keep only placeholders in the design. */
  kind: 'unknownNumberFormat' | 'fontFamilyStack' | 'sideColumnPercentClamped' | 'columnCountClamped' | 'unknownConfigKey' | 'cjkGridClamped' | 'unknownConfigValue' | 'unknownNumerals' | 'lineNumbersUnsupported' | 'wrapUnsupported' | 'contentInConfig'
    | 'calloutStyleExtendsUnknown' | 'calloutStyleExtendsCycle'
    | PageTemplateWarningKind;
  /** Where the value sits in the config, e.g.
   *  `orderedLists.levels[1].numberFormat`, `header.elements[0].fontFamily`,
   *  `headingStyles[2].layout.sideColumnPercent`. */
  path: string;
  /** The value as written (the key itself, for `unknownConfigKey`). */
  value: string;
  /** The value the engine used instead (`arabic` / `decimal`, the first
   *  family of the stack, the side column's percent); empty for an
   *  `unknownConfigKey`, which is ignored. */
  used: string;
  /** `unknownConfigKey`: the known key the unknown one is closest to
   *  (another case, a letter or two apart), when there is one. Also on an
   *  `unknownConfigValue` of a comics setting: the closest of its words,
   *  and on a page-template warning that names an id or a name (a style,
   *  a parent, a frame): the closest one that exists. */
  suggestion?: string;
  /** `labelStyleUnknown`: the resource whose anchor names the style. */
  resourceId?: string;
  /** `contentInConfig`: the design texts of the owner that hold content. */
  count?: number;
  /** `contentInConfig`: the letters and digits those texts hold beyond
   *  their placeholders and allowed phrases. */
  chars?: number;
  /** `contentInConfig`: the path of each of those texts
   *  (`headingStyles[3].header.elements[12]`), the first 20. */
  elements?: string[];
  /** `contentInConfig`: the `id` of the heading style the warning is
   *  about, when its owner is one. */
  ownerId?: string;
}

/** A step of the reflow ladder (#858, DESIGN §5.4), in ladder order:
 *  `free` (the frame grows into free space up to its `maxHeight`), `push`
 *  (its group moves the frames after it and the ones that `shrink` yield),
 *  `scaleImages` (pictures of the frame and its group, down to
 *  `fit.imageMinScale`), `redistribute` (the other frames of its group go
 *  down to their minimum or their content, a row's give width),
 *  `shrinkText` (down to `fit.minScale`), `continue` (`overflow.continueIn`
 *  to another page, #859). */
export type FrameFitStep = 'free' | 'push' | 'scaleImages' | 'redistribute' | 'shrinkText' | 'continue';

/** A change that would make a frame's content fit (#858): data, so the
 *  Sandbox can offer it as a confirmed edit. `path` is the JSON pointer of
 *  the config value to set to `value`; a Markdown change carries the
 *  source range it is about instead. Values are worked out from the
 *  shortfall: `allowShrink` the largest text scale (in 2.5 % steps) at
 *  which the content fits (`also`: the switch to turn on with it; when
 *  that scale divides a word wider than the frame's measure, the largest
 *  smaller one that sets every word whole, `word: 'whole'`, or, none
 *  doing so, `word: 'divided'`, #1090),
 *  `raiseMax` / `lowerMin` the height in whole millimetres, `useTemplate`
 *  another template of the book with a frame of this name in which the
 *  content fits, `shortenText` about how many characters to cut. */
export type FrameOverflowProposal =
  | { kind: 'allowShrink'; path: string; value: number; also?: { path: string; value: boolean }[]; word?: 'whole' | 'divided' }
  | { kind: 'raiseMax'; path: string; value: Dimension }
  | { kind: 'lowerMin'; path: string; value: Dimension; frame: string }
  | { kind: 'continueNextPage'; path: string; value: 'next-page' }
  | { kind: 'useTemplate'; value: string; sourceStart?: number; sourceEnd?: number }
  | { kind: 'shortenText'; value: number; sourceStart?: number; sourceEnd?: number };

/** A change that would uncover a frame's ink (#1053, `frameCovered`):
 *  data, as {@link FrameOverflowProposal}. `layer` paints the covering
 *  frame (`coveredBy`) under the covered one; `exclude` makes the covering
 *  frame push the covered frame's text round it; `move` is the smallest
 *  shift of the covering frame along one axis that clears what it covers,
 *  in mm (data only: no config path says where the frame is). */
export type FrameCoverProposal =
  | { kind: 'layer'; path: string; value: number }
  | { kind: 'exclude'; path: string; value: 'push' }
  | { kind: 'move'; frame: string; dxMm: number; dyMm: number };

/** A change that would bring a frame back inside what it runs past
 *  (#1053, `frameOutsideArea`): `maxHeight` of the frame itself (the room
 *  it has there, in whole millimetres; not for a frame its placement holds
 *  by its foot), `minHeight` of the frame it is anchored inside (`frame`),
 *  for a frame of text held to a smaller height `overflow.continueIn:
 *  'next-page'`, so what no longer fits goes on instead of shrinking, and
 *  `move`, the shift that brings it in when it runs past one side of an
 *  axis (data only). */
export type FrameOutsideProposal =
  | { kind: 'maxHeight'; path: string; value: Dimension }
  | { kind: 'minHeight'; path: string; value: Dimension; frame: string }
  | { kind: 'continueNextPage'; path: string; value: 'next-page' }
  | { kind: 'move'; frame: string; dxMm: number; dyMm: number };

/** The kinds of {@link ConfigWarning} a page template gives (#853). */
export type PageTemplateWarningKind =
  | 'templateDuplicate'
  | 'templateExtendsCycle'
  | 'templateExtendsUnknown'
  | 'frameDuplicate'
  | 'frameStyleUnknown'
  | 'frameAnchorUnknown'
  | 'frameMinMax'
  | 'groupFrameUnknown'
  | 'groupFrameTwice'
  | 'frameChainLoop'
  | 'overflowTargetUnknown'
  | 'labelStyleUnknown';

/** What a build reports in `VDTDocument.warnings`: a construct the layout
 *  had to force ({@link CalloutOverflowWarning}), with the shape it has had
 *  since postext 1.4. What the source names wrongly is in
 *  {@link VDTDocument.contentWarnings} instead. */
export type LayoutWarning = CalloutOverflowWarning;

/** Reported by the renderers (canvas, HTML, PDF) through their `onWarning`
 *  option while they paint — never stored in the VDT, since what a host
 *  can supply changes after the layout. */
export interface MissingImageWarning {
  /** `missingImage`: an image (figure, table-cell image, callout icon or
   *  design image) had no picture to draw — nothing registered for it
   *  (canvas), no URL (HTML), no or undecodable bytes (PDF) — and was
   *  painted as a neutral placeholder. */
  kind: 'missingImage';
  /** The payload id the host resolves (`registerResourceImage`,
   *  `resourceImageUrl`, `resourceBytes`). */
  fileId: string;
  /** The resource the image belongs to, when the painter knows it (a
   *  figure or a cell image; not a callout icon or design image). */
  resourceId?: string;
  /** Page of the first placeholder, in its document. */
  pageIndex: number;
  /** Which of the documents given to a multi-document render (a book
   *  rendered to one PDF) the page belongs to. */
  documentIndex?: number;
}

/** `svgFontUnavailable` (#630): a family an SVG picture's text names had
 *  no face to embed in it, so the image sets that text in a fallback
 *  face. Reported by the hosts that inline fonts into SVGs
 *  (`registerSvgImage`, `registerBundleImages`, `bundleImageUrl`,
 *  `renderToHtml` with `inlineSvgFonts`, postext-epub). */
export interface SvgFontUnavailableWarning {
  kind: 'svgFontUnavailable';
  fileId: string;
  resourceId?: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/** `svgFontsTooLarge` (#630): the faces an SVG picture's text names
 *  together exceed the size cap (`maxBytes`, 2 MiB by default), so none
 *  was embedded. */
export interface SvgFontsTooLargeWarning {
  kind: 'svgFontsTooLarge';
  fileId: string;
  resourceId?: string;
  /** Font bytes the faces would have added. */
  bytes: number;
  maxBytes: number;
}

/** What inlining fonts into an SVG picture can report. */
export type SvgPictureFontWarning = SvgFontUnavailableWarning | SvgFontsTooLargeWarning;

/** Warnings a renderer reports while painting, or a host while it
 *  prepares the pictures. */
export type RenderWarning = MissingImageWarning | SvgPictureFontWarning;
