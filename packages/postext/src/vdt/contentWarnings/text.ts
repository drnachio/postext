// Content warnings of text setting: loose and ragged lines, divided words,
// marks past the leading and vertical text.

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type TextSettingWarning =
  /** A justified line of CJK text that would need more space between its
   *  characters than the cap (½ em, or `bodyText.maxJustifyTracking` when
   *  set) to reach the measure: it is set with the cap and ends short
   *  (`VDTLine.cjkLoose`). Usually the line before a long Latin word or web
   *  address that cannot break. `text` is the line's text. Found by the
   *  layout, so `collectContentWarnings` never returns it. */
  | { kind: 'cjkLooseLine'; text: string }
  /** A line of a justified paragraph set ragged because its word spaces
   *  would have stretched past 3× their width to reach the measure
   *  (`VDTLine.raggedSpaceRatio`, #732): the first line of a story in a
   *  narrow column that cannot take the next word, the line before a web
   *  address that breaks only at its joints. `text` is the line's text and
   *  `ratio` the stretch it would have needed. Reword the copy or give the
   *  line a break it can take. Found by the layout, so
   *  `collectContentWarnings` never returns it. */
  | { kind: 'raggedLine'; text: string; ratio: number }
  /** A word of a joining script (Arabic, Syriac, N'Ko…) wider than its
   *  line: such a word is never divided (its letters connect, and a piece
   *  would lose its joining forms), so it runs past the measure
   *  (`VDTLine.wordOverflow`). `text` is the line's text. Found by the
   *  layout, so `collectContentWarnings` never returns it. */
  | { kind: 'unbreakableWordOverflow'; text: string }
  /** A word wider than its whole line (a narrow frame, a running head, a
   *  table cell), cut to fit between two of its characters, with no
   *  hyphen (`VDTLine.wordDivided`, #1150): "CL" | "IMA". `text` is the
   *  line's text. A warning: give the text more room or a smaller size.
   *  Found by the layout, so `collectContentWarnings` never returns it. */
  | { kind: 'wordDividedByCharacter'; text: string }
  /** A word wider than its whole line, cut at one of its syllables with a
   *  hyphen (`VDTLine.wordDivided`, #1150). A note: the cut is a
   *  dictionary one, but the word was too long for the measure. */
  | { kind: 'wordDividedBySyllable'; text: string }
  /** A paragraph or heading whose style sets letter-spacing
   *  (`letterSpacing`) on words of a joining script: they are set without
   *  it, since spacing their letters apart breaks the joins, and only the
   *  other words and the spaces take it. `text` is the block's first
   *  line. Found by the layout. */
  | { kind: 'joiningScriptLetterSpacing'; text: string }
  /** A paragraph with Chinese marks (emphasis dots, proper-name or
   *  book-title lines, #193) whose line gap is narrower than the marks
   *  need: half an em for marks on one side of the text, five eighths for
   *  marks on both sides (clreq §5.6.1). The line pitch never changes for
   *  them, so they crowd the next line: give the paragraph more leading.
   *  `gapEm` is the gap (line height less the text size) and `neededEm`
   *  what the marks need, in em of the text. */
  | { kind: 'cjkMarksExceedLeading'; text: string; gapEm: number; neededEm: number }
  /** A paragraph with ruby readings over or under its text (#194) whose
   *  line gap is narrower than the readings: they overlap the next line.
   *  `gapEm` and `neededEm` in em of the text. */
  | { kind: 'rubyExceedsLeading'; text: string; gapEm: number; neededEm: number }
  /** A paragraph of kanbun with 送り仮名 (or 返り点 set in the line gap,
   *  `cjk.kunten.placement: 'interlinear'`) whose line gap is narrower than
   *  the marks (#430): they overlap the next line. `gapEm` and `neededEm`
   *  in em of the text. */
  | { kind: 'kuntenExceedsLeading'; text: string; gapEm: number; neededEm: number }
  /** A paragraph of vocalised Arabic (#376) whose vowel marks meet the
   *  ink of the line above or below it in its column: a mark over a word
   *  reaches down-hanging letters or marks of the line above, or a kasra
   *  under a word the marks of the line below. Only words standing over
   *  each other are compared. The line pitch never changes for the marks:
   *  give the paragraph more leading (1.7–1.85 em for partly vocalised
   *  text, 1.9–2.1 for fully vocalised verse). `lineHeightEm` is the
   *  distance between the two baselines and `neededEm` the height the two
   *  lines' ink takes there, in em of the text; `text` is the lower line.
   *  Found by the layout, so `collectContentWarnings` never returns it. */
  | { kind: 'arabicMarksExceedLeading'; text: string; lineHeightEm: number; neededEm: number }
  /** Markup typed with fullwidth characters, as a Chinese or Japanese
   *  input method types it: a `：：：` fence, a `＃` heading, a `［＾…］`
   *  footnote marker, `｛…｝` attributes after a fence or heading, or
   *  `＊＊…＊＊` bold. The parser reads only the ASCII forms, so the line
   *  is set as text. `typed` is the markup as written, `ascii` the form
   *  to type (#181). One per line. */
  | { kind: 'fullwidthMarkup'; typed: string; ascii: string }
  /** An attribute key with letters outside ASCII (`作者=曹雪芹`): keys are
   *  ASCII, so the attribute is not read. Points at the key (#181). */
  | { kind: 'attributeKeyInvalid'; key: string }
  /** A resource whose `placement.rotate` asks for a quarter turn, in a
   *  document set vertically (`layout.writingMode: 'vertical-rl'`): every
   *  figure and table of a vertical flow stands upright, so the turn is
   *  not applied, and the resource floats in its own `span` (#188). Points
   *  at its first use. */
  | { kind: 'rotateIgnoredVertical'; resourceId: string }
  /** A `:tab` in a block set in vertical text (#622): tab stops are set in
   *  horizontal text only, so the tab is a word space. */
  | { kind: 'tabInVerticalText' };
