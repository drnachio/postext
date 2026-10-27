// Content warnings about markup and styles: figure labels, paper, chips,
// marks, headings, footnotes, index marks, videos and tables.

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type MarkupWarning =
  /** A `::label[…]{at="…"}` of a `:::figure` (#860) names an anchor its
   *  resource does not have: the label is not drawn (the reflowable
   *  output still lists it). `known` lists the resource's anchor ids. The
   *  source range is the label's text. With `connector` (#1057), a
   *  connector of a composed page's decoration ends at that anchor of the
   *  picture of `frame`, which lacks it: that end is left out; there is no
   *  source range, `resourceId` is the frame's first picture (empty when
   *  it holds none). */
  | { kind: 'labelAnchorUnknown'; resourceId: string; anchor: string; known: string[]; locale?: string; labelId?: string; connector?: string; frame?: string }
  /** An anchor of a figure's resource names a label `style` but no
   *  `::label` of the figure stands at it in this locale (#860): a note,
   *  the map lacks that word in this edition. The source range is the
   *  figure's. */
  | { kind: 'anchorUnlabelled'; resourceId: string; anchor: string; style: string; locale?: string }
  /** A figure label (#902) that is still wider than its anchor's `width`
   *  at its style's `minScale` (`layout.overflow`): it is drawn at that
   *  scale and runs past the measure. `anchor` is its anchor (absent for a
   *  label placed by percentages), `text` its plain text (40 characters),
   *  `widthPct` the measure it was given (percent of the picture's
   *  width) and `scale` the scale it reached. The source range is the
   *  label's. */
  | { kind: 'labelOverflow'; resourceId: string; text: string; anchor?: string; widthPct: number; scale: number; locale?: string; labelId?: string }
  /** Two labels of a figure whose boxes meet (#902): the later one, in the
   *  order written, names the first earlier label it meets (`with`, and
   *  `withAnchor`) and how many earlier labels it meets in all (`count`,
   *  at least 1). Checked per edition, so a language whose words run
   *  longer shows it. The source range is the later label's. With
   *  `withSymbol` (1-based), the label runs onto a symbol of the picture
   *  instead (#969): one of its `avoid` zones, `count` of them in all;
   *  `with` reads `symbol <n>`. */
  | { kind: 'labelOverlap'; resourceId: string; text: string; anchor?: string; with: string; withAnchor?: string; withSymbol?: number; count: number; locale?: string; labelId?: string }
  /** A `:::paper{…}` attribute the engine cannot read: an unknown key, a
   *  stock, finish or texture it does not know, a number out of range, a
   *  shade that is neither a hex colour nor a palette id, a `showThrough`
   *  other than true / false. The attribute is dropped; the pages follow
   *  the document's paper for it. */
  | { kind: 'paperAttributeInvalid'; key: string; value: string }
  /** `:chip[…]{style}` names no chip style: the chip takes the first one.
   *  `inResource` names the resource whose caption, note or cell holds it. */
  | { kind: 'unknownChipStyle'; style: string; inResource?: string }
  /** `:mark[…]{style}` (#888) names no highlight style: the mark takes the
   *  first one. `inResource` names the resource whose caption, note or
   *  cell holds it. */
  | { kind: 'unknownMarkStyle'; style: string; inResource?: string }
  /** An in-column heading whose design reserves the whole of its column
   *  (#997): the text after it starts in the next column or page. `element`
   *  is the id of the design element that reaches lowest and sets that
   *  height (give it `reserve: false` if it is decoration), absent when
   *  the design's own `minHeight` is what fills the column. A page-span
   *  opener claims its page on purpose and is not reported. The source
   *  range is the heading's. */
  | { kind: 'headingClaimsColumn'; level: number; element?: string }
  /** A `:::figure` gives words (`alt`, `caption`, `note`) to a resource
   *  that an earlier figure of the chapter already gave words to, and
   *  they differ (#986): a resource has one set of words in a chapter, the
   *  first figure's, so `words` of this figure are not shown. Give the
   *  figure a resource of its own (a second entry for the same file). The
   *  source range is the first of those words. */
  | { kind: 'figureWordsShared'; resourceId: string; words: ('alt' | 'caption' | 'note')[] }
  /** A footnote marker `[^id]` with no `[^id]: …` definition in the
   *  document: the number prints, the note is empty. Points at the first
   *  such marker. */
  | { kind: 'undefinedFootnote'; id: string }
  /** A footnote definition `[^id]: …` no marker cites: it is not set. */
  | { kind: 'unusedFootnote'; id: string }
  /** An index mark (`:index{…}`) with no term — no `term` attribute and no
   *  bracketed text: it indexes nothing. */
  | { kind: 'indexMarkInvalid' }
  /** A `see` / `seealso` of an index mark names no entry of its index: the
   *  cross-reference still prints. Points at the `:::index` line. */
  | { kind: 'indexSeeUnknown'; target: string; index: string }
  /** A page range of the index opened (`range="start"`) and never closed,
   *  or closed with no opening (`missing: 'start'`): it prints as a single
   *  page. Points at the `:::index` line. */
  | { kind: 'indexRangeUnclosed'; term: string; missing: 'start' | 'end'; index: string }
  /** An entry of a Japanese index (#425) whose text holds a kanji and that
   *  no mark gives a reading (`yomi`, a kana ruby on the marked text, or a
   *  `sort` key in kana): it files after the kana entries, by code point.
   *  `term` is the entry's levels joined with `!`. Points at the `:::index`
   *  line. */
  | { kind: 'indexReadingMissing'; term: string; index: string }
  /** A heading's `{style}` attribute names no heading style: the heading
   *  and its section keep the level's own settings. */
  | { kind: 'unknownHeadingStyle'; style: string; level: number }
  /** A video resource the text uses has no poster frame (#454): print
   *  outputs show a dark box with the play mark and the QR code. */
  | { kind: 'videoWithoutPoster'; resourceId: string }
  /** A self-hosted video the text uses has no production address
   *  (`video.url`, http or https): the printed poster gets no QR code and
   *  no link, and an HTML or EPUB output without the file cannot play it. */
  | { kind: 'videoWithoutUrl'; resourceId: string }
  /** A YouTube or Vimeo video whose address is not a link to a video of that
   *  platform: no player is embedded (the poster is shown instead), and the
   *  QR code and the link carry the address as written when it is a web
   *  address. */
  | { kind: 'videoUrlInvalid'; resourceId: string; url: string }
  /** A table resource's `table.styleId` names no `tableStyles` entry: the
   *  table is set in the document's `tableStyle`. */
  | { kind: 'unknownTableStyle'; styleId: string; resourceId: string }
  /** A table's grid is not rectangular once its merges are counted (see
   *  `tableGridIssues`): cells are laid out by their array index, so a cell
   *  left out HTML-style under a `colSpan` / `rowSpan` shifts the cells
   *  after it (`spanOverlap`: a visible cell sits under a merge instead of
   *  carrying `hiddenBy`), or a row ends short and leaves a hole
   *  (`missingCells`). `row` / `col` locate the first issue; `count` is
   *  how many the table has. */
  | { kind: 'raggedTableGrid'; resourceId: string; reason: 'spanOverlap' | 'missingCells'; row: number; col: number; count: number };
