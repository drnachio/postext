import type { FrameFitStep, FrameOverflowProposal, FrameCoverProposal, FrameOutsideProposal, PageTemplateWarningKind, ContrastIssue, PreflightIssue, PreflightSeverity } from 'postext';

export type { WarningKind } from './types/kind.js';

/** Which design slot a warning points at. `level` tags heading slots;
 *  the part opener is a single slot; `'box'` is a box style's design
 *  (`calloutStyles[].design`, #1014), tagged by its `styleId`. */
export type WarningSlotKind = 'header' | 'footer' | 'heading' | 'part' | 'box';

export type WarningPayload =
  | { kind: 'missingFont'; family: string }
  /** The engine's `fontFallback` (#629): a face the layout's text was set
   *  in that the font set could not give when it was built — missing, or
   *  drawn by the browser from another weight or slant. */
  | { kind: 'fontFallback'; family: string; weight: number; style: 'normal' | 'italic'; reason: 'missing' | 'synthesized' }
  /** The engine's `glyphFallback` (#1105): characters the text sets in a
   *  face that has no glyph for them, drawn from `supplier` (a family of
   *  the font list or a generic one) or, without it, from a face the
   *  system picks. `characters` are the first of them, `count` all. */
  | { kind: 'glyphFallback'; family: string; weight: number; style: 'normal' | 'italic'; characters: string[]; count: number; supplier?: string }
  /** Referenced family is neither a loaded Google Font nor a custom
   *  family in `customFonts`. Silently falls back to a system font at
   *  render time; this warning makes the fall-through visible. */
  | { kind: 'missingFontFamily'; family: string }
  /** Custom family exists but at least one required weight/style variant
   *  has no uploaded file. Names the specific missing combinations. */
  | {
      kind: 'missingFontVariant';
      family: string;
      variants: Array<{ weight: number; style: 'normal' | 'italic' }>;
    }
  /** Two or more uploaded files share the same weight/style slot within
   *  a custom family. Only one of them will actually be used at render
   *  time; the warning nudges the user to retune the variant settings. */
  | {
      kind: 'duplicateFontVariant';
      family: string;
      variants: Array<{ weight: number; style: 'normal' | 'italic'; count: number }>;
    }
  | { kind: 'looseLine'; ratio: number; threshold: number }
  | { kind: 'cjkLooseLine'; text: string }
  /** A justified line set ragged: its word spaces would have stretched to
   *  `ratio` times their width (#732). */
  | { kind: 'raggedLine'; text: string; ratio: number }
  | { kind: 'unbreakableWordOverflow'; text: string }
  /** The engine's `wordDividedByCharacter` / `wordDividedBySyllable`
   *  (#1150): a word wider than its whole line, cut between two letters
   *  or at a syllable to fit. `text` is the line's text. */
  | { kind: 'wordDividedByCharacter'; text: string }
  | { kind: 'wordDividedBySyllable'; text: string }
  | { kind: 'joiningScriptLetterSpacing'; text: string }
  | { kind: 'cjkMarksExceedLeading'; text: string; gapEm: number; neededEm: number }
  | { kind: 'rubyExceedsLeading'; text: string; gapEm: number; neededEm: number }
  | { kind: 'kuntenExceedsLeading'; text: string; gapEm: number; neededEm: number }
  | { kind: 'arabicMarksExceedLeading'; text: string; lineHeightEm: number; neededEm: number }
  | { kind: 'headingHierarchy'; from: number; to: number }
  | { kind: 'consecutiveHeadings' }
  | { kind: 'listAfterHeading' }
  | { kind: 'invalidMath'; tex: string; message: string }
  | { kind: 'unclosedMath'; delimiter: '$' | '$$'; tex: string }
  | {
      kind: 'headerFooterUnknownPlaceholder';
      slot: WarningSlotKind;
      level?: number;
      /** Set when the slot belongs to a heading style (its design,
       *  `slot: 'heading'`, or its section's running heads) or is a box
       *  style's design (`slot: 'box'`). */
      styleId?: string;
      /** Set for a part slot other than the opener: the blank verso after
       *  a part page, or the part rows of the contents. */
      configPath?: 'parts.versoDesign' | 'toc.parts.design';
      elementIndex: number;
      name: string;
    }
  | {
      kind: 'headerFooterMetadataMissing';
      slot: WarningSlotKind;
      level?: number;
      styleId?: string;
      configPath?: 'parts.versoDesign' | 'toc.parts.design';
      elementIndex: number;
      name: string;
    }
  /** The front matter is not valid YAML; the chapter is set without its
   *  metadata. `message` is the parser's reason (line:column). */
  | { kind: 'invalidFrontmatter'; message: string }
  | { kind: 'unknownDirective'; name: string }
  /** A `::name` line that is not a well-formed embed on its own (after a
   *  blank line, `::resource{id="…"}`): it prints as text. */
  | { kind: 'malformedEmbed'; name: string }
  /** Markup typed with fullwidth characters (`：：：`, `＃`, `［＾…］`,
   *  `｛…｝`, `＊＊…＊＊`): the parser reads only the ASCII forms, so the
   *  line prints as text. `typed` is what was written, `ascii` the form to
   *  type. */
  | { kind: 'fullwidthMarkup'; typed: string; ascii: string }
  /** An attribute key with letters outside ASCII (`作者=曹雪芹`): the
   *  attribute is ignored. */
  | { kind: 'attributeKeyInvalid'; key: string }
  /** A `:tab` in a block set in vertical text (#622): tab stops are set
   *  in horizontal text only, so the tab is a word space. */
  | { kind: 'tabInVerticalText' }
  /** A `:::name` container fence was still open at the end of the document;
   *  the parser auto-closed it. Points at the opening fence. */
  | { kind: 'unclosedContainer'; name: string }
  | { kind: 'unclosedCodeBlock'; delimiter: '```' | '~~~'; lang?: string }
  /** A bare `:::` after a one-line directive, with nothing to close (#1125): dropped. */
  | { kind: 'strayFence'; directive: string }
  /** A `:::paragraphs{style="…"}` container names a style id that is not in
   *  `config.paragraphStyles`; the paragraphs render as body text. */
  | { kind: 'unknownParagraphStyle'; style: string }
  /** A `:::callout{type="…"}` container names a type that is not in
   *  `config.calloutStyles`. */
  | { kind: 'unknownCalloutType'; type: string }
  /** Exercises (#1225): a `type` or `style` no kind or exercise style
   *  has, a graded exercise with no right answer, an item its kind cannot
   *  read, an exercise inside another, a word a grid could not place, a
   *  `:::solution` or `:::hint` outside an exercise. */
  | { kind: 'exerciseUnknownType'; type: string }
  | { kind: 'exerciseUnknownStyle'; style: string }
  | { kind: 'exerciseNoAnswer'; exerciseKind: string }
  | { kind: 'exerciseUnreadItem'; text: string }
  | { kind: 'exerciseNested' }
  | { kind: 'exerciseWordUnplaced'; word: string }
  | { kind: 'solutionOutside' }
  /** `:::columns{flow=…}` names neither `snake` nor `parallel` (#634): the
   *  group takes the default. */
  | { kind: 'columnsFlowUnknown'; value: string }
  /** Composed pages (#854): a `::::page` naming no template, a slot the
   *  template lacks, a template frame left empty, a composed page written
   *  with three colons. */
  | { kind: 'templateUnknown'; template: string; fenceIndex: number }
  | { kind: 'slotUnknown'; template: string; slot: string; frame?: string; fenceIndex: number }
  | { kind: 'slotEmpty'; template: string; frame: string; fenceIndex: number }
  | { kind: 'pageFenceLength' }
  /** The content poured into a frame of a composed page (#855) does not
   *  fit and has no `next` frame left: what does not fit is clipped at the
   *  frame's foot on paged output. `page` is the book page, `configPath`
   *  the JSON pointer of the template frame (`/pageTemplates/0/frames/2`).
   *  The reflow ladder (#858) tried `stepsTried` first and left the text
   *  at `scale` (pictures at `imageScale`); `proposals` are the changes
   *  that would make it fit, with their values. */
  | {
    kind: 'frameOverflow';
    template: string;
    frame: string;
    fenceIndex: number;
    overflowMm: number;
    page: number;
    configPath: string;
    locale?: string;
    stepsTried: FrameFitStep[];
    scale: number;
    imageScale?: number;
    proposals: FrameOverflowProposal[];
  }
  /** A frame's content went on to as many added pages as a composed page
   *  may add (#859) and still does not fit there. */
  | { kind: 'frameContinuationLimit'; template: string; frame: string; fenceIndex: number; pages: number; overflowMm: number; page: number; configPath: string }
  /** A frame's `overflow.continueIn: 'page:<id>'` names no later page
   *  fence (#917; `before`: that fence comes before it): the rest went on
   *  on the next page. */
  | { kind: 'continueTargetMissing'; template: string; frame: string; fenceIndex: number; target: string; before: boolean; page: number; configPath: string }
  /** A composed page that draws no folio or running head (`elementId`, of
   *  the template's `slot`) while `drawnOn` of the `siblings` other pages
   *  of its template and side draw it (#1163). `page` is the book page. */
  | { kind: 'folioMissing'; template: string; elementId: string; slot: 'header' | 'footer' | 'decoration'; folio: boolean; side: 'recto' | 'verso'; drawnOn: number; siblings: number; page: number }
  /** Ink of a frame under a frame painted over it (#1053): its lines,
   *  tab, title or pictures. `page` is the book page; `coveredBy` the
   *  covering frame (`coveredByPath` its JSON pointer); `text` the first
   *  covered words or `picture` the first covered picture; `proposals`
   *  the changes that would uncover it. */
  | {
    kind: 'frameCovered';
    template: string;
    frame: string;
    coveredBy: string;
    fenceIndex: number;
    page: number;
    configPath: string;
    coveredByPath: string;
    overlapMm2: number;
    text?: string;
    picture?: string;
    locale?: string;
    proposals: FrameCoverProposal[];
  }
  /** A frame's ink past the trim (its text), the bleed (fills, pictures)
   *  or the frame or group it is anchored inside (#1053, `target`). */
  | {
    kind: 'frameOutsideArea';
    template: string;
    frame: string;
    fenceIndex: number;
    page: number;
    configPath: string;
    past: 'trim' | 'bleed' | 'frame' | 'group';
    target?: string;
    excessMm: number;
    sides: { top?: number; right?: number; bottom?: number; left?: number };
    locale?: string;
    proposals: FrameOutsideProposal[];
  }
  /** A repeating grid (#1061) holds `max` items and the page gives it
   *  more: item `item` goes to the flow frame (`flowFrame`), or after the
   *  page. */
  | { kind: 'repeatOverflow'; template: string; group: string; frame: string; item: number; max: number; flowFrame?: string; fenceIndex: number }
  /** A :::frame piece (#1089) names a look `frameLooks` lacks: the frame
   *  wears its style and template look. */
  | { kind: 'lookUnknown'; template: string; frame: string; look: string; suggestion?: string; fenceIndex: number }
  /** A `:::module` block (#1062) whose template is unknown, no module, or
   *  that the page's template has no modules group for: not laid, its
   *  content in the flow frame. */
  | { kind: 'moduleUnknown'; template: string; module: string; name: string; reason: 'unknown' | 'notModule' | 'noGroup'; fenceIndex: number }
  /** A page fence naming a module template (#1062). */
  | { kind: 'moduleAsPage'; template: string; fenceIndex: number }
  /** A module written inside a module (#1062). */
  | { kind: 'moduleNested'; template: string; module: string; fenceIndex: number }
  /** A module `name` the page could not take (#1062): the name `used`. */
  | { kind: 'moduleNameRejected'; template: string; module: string; name: string; used: string; reason: 'taken' | 'invalid'; fenceIndex: number }
  /** A composed page's fence and its template disagree about spreads
   *  (#861): the template decides (`templateSpread`: laid over two facing
   *  pages; else on one); `fence` is the fence's own `spread`. */
  | { kind: 'spreadMismatch'; template: string; fenceIndex: number; fence: boolean; templateSpread: boolean }
  /** A `::label[…]{at="…"}` of a `:::figure` names an anchor its resource
   *  does not have (#860): the label is not drawn. `known` lists the
   *  resource's anchors; `page` is the book page the figure is on. */
  | { kind: 'labelAnchorUnknown'; resourceId: string; anchor: string; known: string[]; page: number; locale?: string }
  /** An anchor of a figure's resource names a label style and no label of
   *  the figure stands at it in this locale (#860): a note. */
  | { kind: 'anchorUnlabelled'; resourceId: string; anchor: string; style: string; page: number; locale?: string }
  /** A figure label still wider than its measure at its style's
   *  `minScale` (#902): drawn at `scale` and running past it. */
  | { kind: 'labelOverflow'; resourceId: string; text: string; anchor?: string; widthPct: number; scale: number; page: number; locale?: string }
  /** A label whose lines meet an earlier label's (#902): `count` earlier
   *  labels in all, `with` the first of them. With `withSymbol` (1-based) it
   *  runs onto a symbol of the picture, one of its avoid zones (#969). */
  | { kind: 'labelOverlap'; resourceId: string; text: string; anchor?: string; with: string; withAnchor?: string; withSymbol?: number; count: number; page: number; locale?: string }
  /** A `:::figure` gives words (`words`: alt, caption, note) to a resource
   *  an earlier figure of the chapter already worded (#986): the pages show
   *  the first figure's. */
  | { kind: 'figureWordsShared'; resourceId: string; words: ('alt' | 'caption' | 'note')[] }
  /** A `:chip[…]{style="…"}` names a style that is not in
   *  `config.chipStyles`; the chip takes the first style. `inResource`
   *  names the resource whose caption, note or cell holds the chip. */
  | { kind: 'unknownChipStyle'; style: string; inResource?: string }
  /** A `:mark[…]{style="…"}` names a style that is not in
   *  `config.markStyles` (#888); the mark takes the first style. */
  | { kind: 'unknownMarkStyle'; style: string; inResource?: string }
  /** An identifier (`{#id}`, `:anchor{#id}`) set twice (#261). */
  | { kind: 'duplicateAnchor'; anchorId: string }
  /** A citation names a key no reference defines (#268). */
  | { kind: 'unknownCitationKey'; key: string }
  /** Citations wait for the citation engine. */
  | { kind: 'citationsUnavailable' }
  /** A `:::references` block cannot be read. */
  | { kind: 'referencesUnreadable'; message: string }
  /** A footnote marker `[^id]` no `[^id]: …` paragraph defines. */
  | { kind: 'undefinedFootnote'; id: string }
  /** A footnote definition `[^id]: …` no marker cites. */
  | { kind: 'unusedFootnote'; id: string }
  /** An index mark (`:index{…}`) with no term: it indexes nothing. */
  | { kind: 'indexMarkInvalid' }
  /** A `see` / `seealso` target that is no entry of its index. */
  | { kind: 'indexSeeUnknown'; target: string; index: string }
  /** A page range of the index opened and never closed (or closed with no
   *  opening): it prints as a single page. */
  | { kind: 'indexRangeUnclosed'; term: string; missing: 'start' | 'end'; index: string }
  /** An entry of a Japanese index with a kanji and no reading: it files
   *  after the kana entries, with no head. */
  | { kind: 'indexReadingMissing'; term: string; index: string }
  /** A heading's `{style="…"}` names no heading style; the heading keeps
   *  its level's settings. */
  | { kind: 'unknownHeadingStyle'; style: string; level: number }
  /** Chips of this style are taller than the line pitch (by `overlapPt`),
   *  so chips on consecutive lines touch. */
  | { kind: 'chipOverlap'; style: string; overlapPt: number }
  | { kind: 'numberingInvalidFormat'; value: string }
  | { kind: 'numberingInvalidStartAt'; value: string }
  | { kind: 'pagebreakInvalidParity'; value: string }
  | { kind: 'spaceInvalidLines'; value: string }
  | { kind: 'paperAttributeInvalid'; key: string; value: string }
  | { kind: 'headingBreakInvalidParity'; level: number; value: string }
  | { kind: 'parityCascade'; runLength: number }
  | { kind: 'alphaPdfOverflow' }
  | { kind: 'calloutOverflow'; page: number; overflowMm: number }
  /** A heading design taller than its page can hold: text of the design
   *  laid out past the foot of the page (an opener) or of its column (an
   *  in-column design, clipped there by canvas and PDF), by `overflowMm`.
   *  The heading claims the rest of its page or column (the text after it
   *  starts on the next one), but that part of the design is cut off. */
  | { kind: 'headingDesignCut'; level: number; page: number; overflowMm: number }
  /** An in-column heading whose design reserves the whole of its column
   *  (#997): the text after it starts in the next column or page. `element`
   *  is the design element that sets that height; absent, the design's
   *  `minHeight` does. */
  | { kind: 'headingClaimsColumn'; level: number; page: number; element?: string }
  /** A one-and-a-half layout's side column that leaves a column with no
   *  width (`collectConfigWarnings`): `path` names the setting, `used`
   *  the percentage the engine cuts the columns at instead. */
  | { kind: 'sideColumnPercentClamped'; path: string; value: string; used: string }
  /** A `multiple` layout's column count that is not a whole number from 3
   *  to 8 (`collectConfigWarnings`): `path` names the setting, `used` the
   *  count the engine cuts the columns at instead. */
  | { kind: 'columnCountClamped'; path: string; value: string; used: string }
  /** A character grid (`cjk.grid`) with more characters per line or lines
   *  per page than the margins leave room for (`collectConfigWarnings`):
   *  the grid is set with `used`. */
  | { kind: 'cjkGridClamped'; path: string; value: string; used: string }
  | {
      kind: 'designCyclicAnchor';
      slot: WarningSlotKind;
      level?: number;
      /** Set when the slot belongs to a heading style, or is a part slot
       *  other than the opener (see `headerFooterUnknownPlaceholder`). */
      styleId?: string;
      configPath?: 'parts.versoDesign' | 'toc.parts.design';
      elementId: string;
    }
  | {
      kind: 'designDanglingAnchor';
      slot: WarningSlotKind;
      level?: number;
      styleId?: string;
      configPath?: 'parts.versoDesign' | 'toc.parts.design';
      elementId: string;
      referencedId: string;
    }
  | {
      kind: 'designTextClipAlwaysTruncates';
      slot: WarningSlotKind;
      level?: number;
      elementId: string;
    }
  /** A design text the layout cut to fit its width (#628): with an
   *  ellipsis (`mode` its `overflow`) or clipped with ink past its box.
   *  `slot` is where the design is painted, `page` the book page it was
   *  first cut on (a running head once a chapter), `text` the whole text. */
  | {
      kind: 'designTextTruncated';
      slot: 'header' | 'footer' | 'heading' | 'part' | 'tocRow' | 'box';
      elementId: string;
      text: string;
      mode: 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip';
      page: number;
    }
  | { kind: 'headingSpanWithoutBreak'; level: number }
  | { kind: 'headingAdvancedWithoutTitleText'; level: number }
  /** A `::resource{id=…}` block, a `:ref{id=…}` inline reference or a table
   *  cell's image points at a resource id that does not exist in the
   *  resources list. `usage` records which; `inResource` names the resource
   *  whose caption, note or cell holds the reference. */
  | { kind: 'unknownResourceId'; resourceId: string; usage: 'embed' | 'ref' | 'cellImage'; inResource?: string }
  /** Two or more resources share the same id. Only one of them resolves at
   *  render time; the warning names the colliding id and how many share it. */
  | { kind: 'duplicateResourceId'; resourceId: string; count: number }
  /** A resource's `typeId` points at a `ResourceType` that no longer exists in
   *  the config. The resource falls back to a default type at render time. */
  | { kind: 'danglingTypeRef'; resourceId: string; typeId: string }
  /** A bitmap is rendered substantially larger than its natural pixel size
   *  (rendered width > natural width × 1.5), so it will look blurry. */
  | {
      kind: 'bitmapTooSmall';
      resourceId: string;
      renderedWidth: number;
      bitmapWidth: number;
    }
  /** A table resource's `table.styleId` names no table style; the table is
   *  set in the document's table style. */
  | { kind: 'unknownTableStyle'; resourceId: string; styleId: string }
  /** A table's grid is not rectangular once its merges are counted (a cell
   *  a merge covers was left out instead of kept with `hiddenBy`, or a row
   *  ends short): the cells after it shift. Locates the first issue. */
  | { kind: 'raggedTableGrid'; resourceId: string; reason: 'spanOverlap' | 'missingCells'; row: number; col: number; count: number }
  /** A video the text uses has no poster frame (#454): print shows a dark
   *  box. */
  | { kind: 'videoWithoutPoster'; resourceId: string }
  /** A self-hosted video has no production address: no QR code or link in
   *  print. */
  | { kind: 'videoWithoutUrl'; resourceId: string }
  /** A YouTube or Vimeo video's address is no video of that platform. */
  | { kind: 'videoUrlInvalid'; resourceId: string; url: string }
  /** An image the document shows has no payload the previews can read (the
   *  file is missing from storage or does not decode): it is painted as a
   *  placeholder. */
  | { kind: 'missingImage'; resourceId: string; fileId: string }
  /** An SVG picture the document shows names a font family in its text
   *  with no face to embed in it (#630): the image sets that text in a
   *  fallback face. */
  | { kind: 'svgFontUnavailable'; resourceId: string; fileId: string; family: string; weight: number; style: 'normal' | 'italic' }
  /** The faces an SVG picture's text names exceed the size cap: none was
   *  embedded (#630). */
  | { kind: 'svgFontsTooLarge'; resourceId: string; fileId: string; bytes: number }
  /** IndexedDB is unavailable (private browsing / storage disabled), so
   *  uploaded bitmaps and SVGs cannot be persisted or resolved. */
  | { kind: 'storageUnavailable' }
  /** A chapter other than the first starts with a front-matter block; only
   *  the first chapter's front matter is the book's. */
  | { kind: 'chapterFrontmatterIgnored'; chapterTitle: string }
  /** A font-family field of the config holds a CSS font stack; the engine
   *  sets the text in its first family (`used`). `path` locates the field
   *  (`bodyText.fontFamily`). */
  | { kind: 'fontFamilyStack'; path: string; value: string; used: string }
  /** A list `numberFormat`, page-numbering `format` or resource-type
   *  `counterFormat` the engine does not know; it numbers in decimal
   *  (`used` is the decimal spelling of that field). */
  | { kind: 'unknownNumberFormat'; path: string; value: string; used: string }
  /** A `numerals` value that names no digit system: the digits follow
   *  the document language, `used` the system that gives. */
  | { kind: 'unknownNumerals'; path: string; value: string; used: string }
  /** `lineNumbers.enabled` on a vertical document (#621): it gets no line
   *  numbers. */
  | { kind: 'lineNumbersUnsupported'; path: string; value: string; used: string }
  /** A resource type's `defaultPlacement.wrap` in a vertical document
   *  (#627): ignored, the figures keep their bands whole. */
  | { kind: 'wrapUnsupported'; path: string; value: string; used: string }
  /** Design texts of one setting (a heading style, a heading level, the
   *  page header, a part design…) that hold the book's text instead of
   *  placeholders (#849). `path` is the setting, `elements` the paths of
   *  the texts (the first 20 of `count`), `sample` the start of the first. */
  | { kind: 'contentInConfig'; path: string; ownerId?: string; count: number; chars: number; elements: string[]; sample: string }
  /** A resource or a box set to wrap text round it that does not (#627):
   *  the text beside it would be too narrow, it is too short for lines
   *  beside it, it moved on to the next column, or the text is vertical. */
  | { kind: 'textWrap'; reason: 'tooNarrow' | 'fewLines' | 'moved' | 'verticalText' | 'noContour'; resourceId?: string; box?: string }
  /** The sub-columns of a `:::columns` group are narrower than six ems of
   *  their text (#634). */
  | { kind: 'columnsTooNarrow'; columns: number; widthPx: number }
  /** A side box, or a figure or table of the side column (`resourceId`),
   *  set on book page `page`, which holds no text: its chapter's text
   *  ended while it still waited for room in the side column (#639). */
  | { kind: 'afterText'; page: number; resourceId?: string }
  /** A box or a floated resource (`resourceId`) still waiting for a slot
   *  when the layout ended (#639): it is on no page. */
  | { kind: 'unplaced'; resourceId?: string }
  /** A short list of `items` items cut between two columns or pages
   *  (`bodyText.shortListSplit`, #749), its first item on book page
   *  `page`. */
  | { kind: 'shortListSplit'; page: number; items: number }
  /** A figure, a table (`resourceId`) or a floated box set on an opener
   *  page, book page `page` (`layout.openerFloats: 'warn'`, #749). */
  | { kind: 'openerFloat'; page: number; resourceId?: string }
  /** A block of the contents kept together (`toc.groups.keepTogether`,
   *  `:::toc{keep}`, #850) headed by `title`, cut between `columns` columns;
   *  it starts on book page `page`. */
  | { kind: 'tocGroupSplit'; page: number; title: string; columns: number }
  /** A line number set in the side column overlaps a side box, caption or
   *  figure (#621); both are painted. `number` as printed. */
  | { kind: 'lineNumberOverlap'; number: string }
  /** A paragraph's drop cap could not be set as configured (#623). */
  | { kind: 'codeOverflow'; mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale?: number; lang?: string }
  /** A floated picture set smaller to fit the room of its slot
   *  (`placement.shrink`, #626), at `scale` of its width; `overflowMm`:
   *  at its smallest scale it still runs that far past the text block. */
  | { kind: 'floatShrunk'; resourceId: string; scale: number; overflowMm?: number }
  /** A bitmap with a print size its column holds at under half of it, on
   *  a page whose text block is wider (#901): `scale` of its print width;
   *  the print, column and text block widths in mm. */
  | { kind: 'pictureBelowPrintSize'; resourceId: string; scale: number; printMm: number; columnMm: number; pageMm: number }
  /** A resource of a type with a caption prefix and no caption of its
   *  own: its caption line prints `label` alone (#1151). */
  | { kind: 'emptyCaption'; resourceId: string; label: string }
  /** A resource set in the text that moved on to the next column, too
   *  tall for the room left, leaving `emptyMm` empty on book page `page`
   *  (#1151). */
  | { kind: 'resourceMoved'; resourceId: string; page: number; emptyMm: number }
  | { kind: 'dropCap'; reason: 'shortParagraph' | 'split' | 'joiningScript' | 'verticalText' | 'noLetter' | 'inBox'; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number; text: string }
  /** A key the heading settings do not have (`headings`, its `balancing`
   *  and `levels`, `headingStyles`): the engine ignores it. `value` is the
   *  key; `suggestion` names the setting it is closest to, when one is. */
  | { kind: 'unknownConfigKey'; path: string; value: string; used: string; suggestion?: string }
  /** A setting that takes one of a few words holding another
   *  (`direction: 'right'`): the engine reads its default, `used`;
   *  `suggestion` names the word it is closest to, when one is (the
   *  comics settings, #590). */
  | { kind: 'unknownConfigValue'; path: string; value: string; used: string; suggestion?: string }
  /** A box style based on another (#905) whose `extends` names no style
   *  (`suggestion` the closest id), or that comes back to it (`value` the
   *  loop): the style stands alone. */
  | { kind: 'calloutStyleExtendsUnknown' | 'calloutStyleExtendsCycle'; path: string; value: string; used: string; suggestion?: string }
  /** A page template problem (#853), from the engine's
   *  `validatePageTemplates`: `path` is a JSON pointer
   *  (`/pageTemplates/3/frames/2/style`), `value` the id, name, loop or
   *  sizes at fault, `used` what the engine took instead (the size, for
   *  `frameMinMax`; `container`, for `frameAnchorUnknown`), `suggestion`
   *  the closest id or name that exists. `labelStyleUnknown` names the
   *  resource whose anchor asks for the style. */
  | { kind: PageTemplateWarningKind; path: string; value: string; used: string; suggestion?: string; resourceId?: string }
  /** The document's language (its hyphenation locale, else `locale`) has
   *  no bundled hyphenation patterns: the engine hyphenates it with en-us. */
  | { kind: 'unsupportedHyphenationLocale'; locale: string }
  /** The last PDF generated set characters no file of a face has a glyph
   *  for (postext-pdf's `missingGlyph`): they print as the font's empty
   *  box. `characters` in the order the pages first set them. `stale` (on
   *  the three PDF font kinds): the book has changed since that PDF. */
  | { kind: 'missingGlyph'; family: string; weight: number; style: 'normal' | 'italic'; characters: string[]; stale?: true }
  /** The last PDF generated set a face from a variable font at a weight
   *  other than its default instance, which is the one embedded. */
  | { kind: 'variableFontDefaultInstance'; family: string; weight: number; style: 'normal' | 'italic'; defaultWeight: number; stale?: true }
  /** The last PDF generated embedded a CFF (.otf) face over 2 MB whole. */
  | { kind: 'cffEmbeddedWhole'; family: string; weight: number; style: 'normal' | 'italic'; bytes: number; stale?: true }
  /** A comic page's `split` the grammar cannot read whole; `message` (from
   *  the engine, in English) says what is wrong. */
  | { kind: 'comicSplitSyntax'; message: string }
  /** The sizes of one list of a comic page's `split` add up past 100 %. */
  | { kind: 'comicSplitOverflow'; total: number }
  /** A comic page with more panels than its split has cells, or fewer. */
  | { kind: 'comicPanelCount'; panels: number; cells: number }
  /** Text in a comic page that is no script line (`key: text`), or sits
   *  before the first `::panel`: lettered as a caption. */
  | { kind: 'comicStrayText'; text: string }
  /** A script line names a balloon style no style defines. */
  | { kind: 'comicUnknownBalloonStyle'; style: string }
  /** A panel's `art` or `pop` names no picture resource. */
  | { kind: 'comicUnknownArt'; resourceId: string }
  /** A panel too narrow or flat to crop its picture without cutting into
   *  the safe area: the picture is letterboxed (found by the layout).
   *  `panel` is 0-based. */
  | { kind: 'comicPanelLetterbox'; resourceId: string; panel: number }
  /** A picture's speaker point lies outside its safe area. */
  | { kind: 'comicAnchorOutsideSafeArea'; resourceId: string; anchorId: string }
  /** A balloon the lettering could not place cleanly (found by the
   *  layout). `panel` / `panelIndex` are 0-based; the engine may send
   *  either. */
  | { kind: 'comicBalloonOverflow'; panel?: number; panelIndex?: number; reasons?: string[] }
  /** A speaker no picture marks and the cast does not list. */
  | { kind: 'comicUnknownSpeaker'; speaker: string }
  /** A panel's frame (#885) falls back: an unknown `box` style, a text
   *  panel's text clipped (found by the layout), or a text panel set in
   *  the flow (a strip, a spread, a vertical or right-to-left document).
   *  `panel` is 0-based, in source order. */
  | { kind: 'comicPanelFrame'; reason: 'unknownBox' | 'textOverflow' | 'strip' | 'spread' | 'flow'; panel: number; style?: string; overflowMm?: number }
  /** A print preflight finding (#605): the engine's check, or what a
   *  placed PDF brings in. `page` is the book page number to jump to. */
  | { kind: 'preflight'; check: PreflightCheck; page?: number }
  /** A contrast finding (#748): text that does not read on its ground, or
   *  reversed text too fine for the press. `page` is the book page number
   *  of its first occurrence. */
  | { kind: 'contrast'; check: ContrastCheck; page?: number };

/** `Omit` over each member of a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** One contrast finding as the Checks panel lists it. */
export type ContrastCheck = DistributiveOmit<ContrastIssue, 'rect' | 'sourceStart' | 'sourceEnd' | 'pageIndex'>;

/** One preflight finding as the Checks panel lists it. */
export type PreflightCheck =
  | DistributiveOmit<PreflightIssue, 'rect' | 'sourceStart' | 'sourceEnd' | 'pageIndex'>
  | { kind: 'masterFonts'; severity: PreflightSeverity; name: string; fonts: string[] }
  | { kind: 'masterRgb'; severity: PreflightSeverity; name: string }
  | { kind: 'masterTransparency'; severity: PreflightSeverity; name: string; x1a: boolean };

export interface Warning {
  id: string;
  payload: WarningPayload;
  /** Absolute source offset to focus in the editor on click. Undefined for
   *  warnings that don't map to a specific markdown location (e.g. missing
   *  fonts sourced from the config). */
  sourceStart?: number;
  sourceEnd?: number;
  /** Approximate line number in the editor (1-based), when available. In a
   *  multi-chapter book this is the line in the composed document. */
  line?: number;
  /** Chapter the warning points at, with a chapter-local line, when the
   *  document was composed from several chapters. */
  chapterId?: string;
  chapterIndex?: number;
  chapterLine?: number;
  /** Chapter-local offsets (`sourceStart`/`sourceEnd` stay document-wide). */
  chapterStart?: number;
  chapterEnd?: number;
}
