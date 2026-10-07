/** Which design slot a warning points at. `level` tags heading slots;
 *  the part opener is a single slot. */
export type WarningSlotKind = 'header' | 'footer' | 'heading' | 'part';

export type WarningKind =
  | 'missingFont'
  | 'missingFontFamily'
  | 'missingFontVariant'
  | 'duplicateFontVariant'
  | 'looseLine'
  | 'cjkLooseLine'
  | 'unbreakableWordOverflow'
  | 'joiningScriptLetterSpacing'
  | 'cjkMarksExceedLeading'
  | 'rubyExceedsLeading'
  | 'kuntenExceedsLeading'
  | 'arabicMarksExceedLeading'
  | 'headingHierarchy'
  | 'consecutiveHeadings'
  | 'listAfterHeading'
  | 'invalidMath'
  | 'unclosedMath'
  | 'headerFooterUnknownPlaceholder'
  | 'headerFooterMetadataMissing'
  | 'unknownDirective'
  | 'malformedEmbed'
  | 'fullwidthMarkup'
  | 'attributeKeyInvalid'
  | 'unclosedContainer'
  | 'unknownParagraphStyle'
  | 'unknownCalloutType'
  | 'unknownChipStyle'
  | 'duplicateAnchor'
  | 'unknownCitationKey'
  | 'citationsUnavailable'
  | 'referencesUnreadable'
  | 'undefinedFootnote'
  | 'unusedFootnote'
  | 'indexMarkInvalid'
  | 'indexSeeUnknown'
  | 'indexRangeUnclosed'
  | 'indexReadingMissing'
  | 'unknownHeadingStyle'
  | 'chipOverlap'
  | 'numberingInvalidFormat'
  | 'numberingInvalidStartAt'
  | 'pagebreakInvalidParity'
  | 'spaceInvalidLines'
  | 'paperAttributeInvalid'
  | 'headingBreakInvalidParity'
  | 'parityCascade'
  | 'alphaPdfOverflow'
  | 'calloutOverflow'
  | 'headingDesignCut'
  | 'sideColumnPercentClamped'
  | 'columnCountClamped'
  | 'cjkGridClamped'
  | 'designCyclicAnchor'
  | 'designDanglingAnchor'
  | 'designTextClipAlwaysTruncates'
  | 'headingSpanWithoutBreak'
  | 'headingAdvancedWithoutTitleText'
  | 'unknownResourceId'
  | 'duplicateResourceId'
  | 'danglingTypeRef'
  | 'bitmapTooSmall'
  | 'unknownTableStyle'
  | 'raggedTableGrid'
  | 'videoWithoutPoster'
  | 'videoWithoutUrl'
  | 'videoUrlInvalid'
  | 'missingImage'
  | 'storageUnavailable'
  | 'chapterFrontmatterIgnored'
  | 'fontFamilyStack'
  | 'unknownNumberFormat'
  | 'unknownNumerals'
  | 'unknownConfigKey'
  | 'unknownConfigValue'
  | 'unsupportedHyphenationLocale'
  | 'missingGlyph'
  | 'variableFontDefaultInstance'
  | 'cffEmbeddedWhole'
  | 'comicSplitSyntax'
  | 'comicSplitOverflow'
  | 'comicPanelCount'
  | 'comicStrayText'
  | 'comicUnknownBalloonStyle'
  | 'comicUnknownArt'
  | 'comicPanelLetterbox'
  | 'comicAnchorOutsideSafeArea'
  | 'comicBalloonOverflow'
  | 'comicUnknownSpeaker';

export type WarningPayload =
  | { kind: 'missingFont'; family: string }
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
  | { kind: 'unbreakableWordOverflow'; text: string }
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
      /** Set when the slot belongs to a heading style: its design
       *  (`slot: 'heading'`) or its section's running heads. */
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
  /** A `:::name` container fence was still open at the end of the document;
   *  the parser auto-closed it. Points at the opening fence. */
  | { kind: 'unclosedContainer'; name: string }
  /** A `:::paragraphs{style="…"}` container names a style id that is not in
   *  `config.paragraphStyles`; the paragraphs render as body text. */
  | { kind: 'unknownParagraphStyle'; style: string }
  /** A `:::callout{type="…"}` container names a type that is not in
   *  `config.calloutStyles`. */
  | { kind: 'unknownCalloutType'; type: string }
  /** A `:chip[…]{style="…"}` names a style that is not in
   *  `config.chipStyles`; the chip takes the first style. `inResource`
   *  names the resource whose caption, note or cell holds the chip. */
  | { kind: 'unknownChipStyle'; style: string; inResource?: string }
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
  /** A key the heading settings do not have (`headings`, its `balancing`
   *  and `levels`, `headingStyles`): the engine ignores it. `value` is the
   *  key; `suggestion` names the setting it is closest to, when one is. */
  | { kind: 'unknownConfigKey'; path: string; value: string; used: string; suggestion?: string }
  /** A setting that takes one of a few words holding another
   *  (`direction: 'right'`): the engine reads its default, `used`;
   *  `suggestion` names the word it is closest to, when one is (the
   *  comics settings, #590). */
  | { kind: 'unknownConfigValue'; path: string; value: string; used: string; suggestion?: string }
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
  | { kind: 'comicUnknownSpeaker'; speaker: string };

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
