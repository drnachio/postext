// Content warnings: what the source names wrongly or the layout could not
// honour, one union member per kind (#1276: split out of vdt.ts).
import type { VDTDesignSlotKind } from './design.js';
import type { FrameFitStep, FrameOverflowProposal, FrameCoverProposal, FrameOutsideProposal } from './warnings.js';

/** Where a content warning points: the source range of the construct in
 *  the markdown given to the build (frontmatter included), and the page it
 *  was placed on. Both are absent when the construct has no place in the
 *  text (a style id set on a resource that is never placed) or put nothing
 *  on a page (an embed of an unknown id). */
interface ContentWarningBase {
  sourceStart?: number;
  sourceEnd?: number;
  pageIndex?: number;
}

/** A reference the build could not resolve, or markup it did not
 *  recognise and set in a fallback: the output is complete but not what the
 *  source asked for. Computed from the source before layout (see
 *  `collectContentWarnings`); the build lists them in
 *  {@link VDTDocument.contentWarnings}. Narrow on `kind` — further kinds may
 *  be added in minor releases. */
export type ContentWarning = ContentWarningBase & (
  /** A `::resource{id}` embed, an inline `:ref{id}` or a table cell's
   *  image names a resource id no resource has: the embed is left out, the
   *  reference prints `?` (or its `text=` label) with no number or link, the
   *  cell stays text-only. `inResource` names the
   *  resource whose caption, note or cell holds the reference. */
  | { kind: 'unknownResourceId'; resourceId: string; usage: 'embed' | 'ref' | 'cellImage'; inResource?: string }
  /** An identifier (`{#id}`, `:anchor{#id}`) set more than once in the
   *  document: references reach its first setting only (#261). */
  | { kind: 'duplicateAnchor'; anchorId: string }
  /** A citation (`[@key]`) names a work no reference of the book defines
   *  (#268): it prints as written, or without that work. */
  | { kind: 'unknownCitationKey'; key: string }
  /** The text cites works but no citation engine is registered
   *  (`postext-citeproc`): citations print as written. */
  | { kind: 'citationsUnavailable' }
  /** A `:::references` block could not be read (malformed JSON or YAML, or
   *  BibTeX without an engine). */
  | { kind: 'referencesUnreadable'; message: string }
  /** The front matter block is not valid YAML (an unclosed quote, text
   *  after a quoted value): the document is set without its metadata.
   *  `message` is the parser's reason, with the line and column. */
  | { kind: 'invalidFrontmatter'; message: string }
  /** A `:::name` line whose name is neither a directive nor a container:
   *  it is set as text. */
  | { kind: 'unknownDirective'; name: string }
  /** A `::name` line that is not a well-formed embed standing alone —
   *  `::resource{id="…"}` with double quotes and no other attribute, after
   *  a blank line: it is set as text. */
  | { kind: 'malformedEmbed'; name: string }
  /** `:::paragraphs{style}` names no paragraph style: the paragraphs are set
   *  as body text. */
  | { kind: 'unknownParagraphStyle'; style: string }
  /** `:::callout{type}` names none of the configured callout styles: the box
   *  takes the first one. Not raised while `calloutStyles` is unset or
   *  empty (every type is then the built-in plain box). */
  | { kind: 'unknownCalloutType'; type: string }
  /** `:::exercise{type}` names no kind of exercise (#1225): the exercise
   *  takes the kind its content tells. */
  | { kind: 'exerciseUnknownType'; type: string }
  /** `:::exercise{style}` names no exercise style: it takes the first. Not
   *  raised while `exerciseStyles` is unset. */
  | { kind: 'exerciseUnknownStyle'; style: string }
  /** A graded exercise with nothing right to check (a choice with no
   *  ticked option, gaps with no `[[…]]`…): `exerciseKind` is its kind. */
  | { kind: 'exerciseNoAnswer'; exerciseKind: string }
  /** An item of an exercise its kind cannot read (a match item with no
   *  `->`, a sort item with no `:`…): it is set as written. */
  | { kind: 'exerciseUnreadItem'; text: string }
  /** An exercise inside another: its blocks are the outer one's. */
  | { kind: 'exerciseNested' }
  /** A word a crossword or a word search could not place: it is left out
   *  of the grid (a crossword needs a letter shared with another word). */
  | { kind: 'exerciseWordUnplaced'; word: string }
  /** A `:::solution` or `:::hint` outside an exercise: it prints nothing. */
  | { kind: 'solutionOutside' }
  /** `:::columns{flow=…}` names neither `'snake'` nor `'parallel'` (#634):
   *  the group takes the default (`'parallel'` with `breaks`, `'snake'`
   *  without). */
  | { kind: 'columnsFlowUnknown'; value: string }
  /** A composed page (`::::page{template=…}`, #854) names a template no
   *  `pageTemplates` entry has (or names none). Until templates are laid
   *  out its content is set in the flow, on pages of its own. */
  | { kind: 'templateUnknown'; template: string; fenceIndex: number }
  /** Content of a composed page names a slot (`slot="…"`,
   *  `:::frame{slot=…}`) that is no frame of the page's template: it goes
   *  to the template's flow frame (`frame`, when the template has one). */
  | { kind: 'slotUnknown'; template: string; slot: string; frame?: string; fenceIndex: number }
  /** A frame of a composed page's template receives no content: nothing
   *  names its slot, it takes no heading, and (the flow frame) no content
   *  is left without a slot. A frame marked `optional` is not reported. */
  | { kind: 'slotEmpty'; template: string; frame: string; fenceIndex: number }
  /** A grid that repeats a frame set (#1061) holds `max` items, and the
   *  page gives it more: item `item` (and every one after it) goes to the
   *  flow frame (`flowFrame`, when the template has one), or after the
   *  page. Points at the item's `slot="…"`. */
  | { kind: 'repeatOverflow'; template: string; group: string; frame: string; item: number; max: number; flowFrame?: string; fenceIndex: number }
  /** A `:::frame{slot="…" look="…"}` piece of a composed page names a look
   *  (#1089) that no `frameLooks` entry has: the frame wears its style and
   *  its template look. `suggestion`: the nearest id. Points at the
   *  `look="…"` value. */
  | { kind: 'lookUnknown'; template: string; frame: string; look: string; suggestion?: string; fenceIndex: number }
  /** A `:::module{template="…"}` of a composed page (#1062) that the page
   *  does not lay: `module` names no template (`'unknown'`), a template
   *  whose `role` is not `'module'` (`'notModule'`), or the page's template
   *  has no modules group (`'noGroup'`). Its content goes to the flow
   *  frame. Points at its `template="…"`. */
  | { kind: 'moduleUnknown'; template: string; module: string; name: string; reason: 'unknown' | 'notModule' | 'noGroup'; fenceIndex: number }
  /** A page fence names a module template (#1062): a module is laid in a
   *  page's modules group, never as a page. The fence's content is set in
   *  the flow. Points at its `template="…"`. */
  | { kind: 'moduleAsPage'; template: string; fenceIndex: number }
  /** A `:::module` inside another module (#1062): not supported; its
   *  blocks are the outer module's. Points at its `template="…"`. */
  | { kind: 'moduleNested'; template: string; module: string; fenceIndex: number }
  /** A module's `name="…"` (#1062) that another module of the page took
   *  (`'taken'`), or that holds a space, `.`, `#`, `[` or `]`
   *  (`'invalid'`): the module is named `used` (`<template>[n]`). Its
   *  slots are addressed under that name. */
  | { kind: 'moduleNameRejected'; template: string; module: string; name: string; used: string; reason: 'taken' | 'invalid'; fenceIndex: number }
  /** A three-colon `:::page` carries `template=`: a composed page needs
   *  four colons (`::::page{template=…}` … `::::`). It is read as a comic
   *  page, as before. */
  | { kind: 'pageFenceLength' }
  /** The content poured into a frame of a composed page does not fit it
   *  (#855): the frame has no `next` frame left to go on in, or no more
   *  room in its chain. What does not fit is clipped at the frame's foot
   *  on paged output; it stays in the document (reflowable output, the
   *  source map, this warning). `overflowMm` is the height that is cut.
   *  Provisional: #858 adds the steps tried and the fixes. */
  | {
    kind: 'frameOverflow';
    template: string;
    frame: string;
    fenceIndex: number;
    overflowMm: number;
    configPath: string;
    /** The document's locale (`config.locale`): the same page overflows in
     *  one language and fits in another. */
    locale?: string;
    /** The steps of the reflow ladder (#858) that applied to the frame, in
     *  the order they were tried; none made the content fit. */
    stepsTried: FrameFitStep[];
    /** The text scale the frame was left at (1 = none). */
    scale: number;
    /** The scale its pictures were left at, below 1. */
    imageScale?: number;
    /** Changes that would make the content fit, with their values worked
     *  out from the shortfall (each tried on the page where it can be). */
    proposals: FrameOverflowProposal[];
  }
  /** Ink of a frame lies under another frame painted over it (#1053): a
   *  later `layer`, or the same layer later in template order. A frame
   *  covers where it is opaque: its fill (the callout style's background,
   *  `look.background`, a label tab, a stripe), its pictures and its text;
   *  a frame with no fill covers nothing between its pictures and lines. What
   *  is covered: the frame's lines (their boxes), its tab and title, its
   *  pictures (by a fill or a picture: words over a picture hide a hairline
   *  of it). `text` is the first words covered (40 characters), `picture`
   *  the resource id of the first picture covered, `overlapMm2` the area
   *  covered. One warning per pair of frames; `overlap: 'allow'` on either
   *  frame leaves the pair out. The source range is the covered frame's
   *  content. */
  | {
    kind: 'frameCovered';
    template: string;
    frame: string;
    coveredBy: string;
    fenceIndex: number;
    configPath: string;
    /** The covering frame's config path. */
    coveredByPath: string;
    overlapMm2: number;
    text?: string;
    picture?: string;
    locale?: string;
    proposals: FrameCoverProposal[];
  }
  /** A frame's ink runs past what holds it (#1053): its text past the trim,
   *  its fill or pictures past the bleed (`past: 'trim' | 'bleed'`), or
   *  any of it past the frame or group it is anchored inside (a nine-point
   *  anchor on `'#name'` whose point lies in that box: `past: 'frame' |
   *  'group'`, `target` its name). What runs past is cut at the trim, and
   *  reads as escaping its card. `excessMm` is the largest overrun, `sides`
   *  each side's. `overlap: 'allow'` on the frame leaves it out. */
  | {
    kind: 'frameOutsideArea';
    template: string;
    frame: string;
    fenceIndex: number;
    configPath: string;
    past: 'trim' | 'bleed' | 'frame' | 'group';
    target?: string;
    excessMm: number;
    sides: { top?: number; right?: number; bottom?: number; left?: number };
    locale?: string;
    proposals: FrameOutsideProposal[];
  }
  /** A frame's content went on to other pages (#859) as many times as a
   *  composed page may add (`pages`, 16) and still does not fit: what is
   *  left is cut at the foot of the frame on the last page added
   *  (`overflowMm`, `pageIndex`). */
  | {
    kind: 'frameContinuationLimit';
    template: string;
    frame: string;
    fenceIndex: number;
    pages: number;
    overflowMm: number;
    configPath: string;
  }
  /** A frame's `overflow.continueIn: 'page:<id>'` (#917) names no page
   *  fence `::::page{id=…}` after the fence the story is on (`target`, its
   *  `{attr.x}` read; `before`: the fence is there, but before or at this
   *  page): the rest goes on on the next page instead. */
  | {
    kind: 'continueTargetMissing';
    template: string;
    frame: string;
    fenceIndex: number;
    target: string;
    before?: true;
    /** The story comes from the chapter at this position of the book and
     *  this chapter has no composed page with that `id` (#943): the rest is
     *  not set; `fenceIndex` is -1. */
    fromChapter?: number;
    configPath: string;
  }
  /** A composed page's fence and its template disagree about spreads
   *  (#861): `::::page{template spread}` names a template that is a single
   *  page (`fence: true`, `templateSpread: false`; it is laid as one
   *  page), or the fence lacks `spread` and the template is a spread
   *  (`fence: false`, `templateSpread: true`; it is laid over two facing
   *  pages, as the template says). */
  | { kind: 'spreadMismatch'; template: string; fenceIndex: number; fence: boolean; templateSpread: boolean }
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
  | { kind: 'raggedTableGrid'; resourceId: string; reason: 'spanOverlap' | 'missingCells'; row: number; col: number; count: number }
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
  | { kind: 'tabInVerticalText' }
  /** A comic page's `split` attribute the grammar cannot read whole (a
   *  stray character, an unclosed `[`, `/` and `|` mixed in one list, a
   *  bracketed list on its parent's axis): the readable part is used, an
   *  unreadable value is one panel. `message` says what is wrong. */
  | { kind: 'comicSplitSyntax'; message: string }
  /** The sizes of a list of a comic page's `split` add up past 100 %: they
   *  are scaled down (a `*` keeps 5 %). */
  | { kind: 'comicSplitOverflow'; total: number }
  /** A comic page has more panels than its split has cells (`panels` >
   *  `cells`: the extra panels are not set) or fewer (the extra cells are
   *  empty panels). */
  | { kind: 'comicPanelCount'; panels: number; cells: number }
  /** Text in a comic page before its first `::panel` line, or a line of a
   *  panel that is not a script line (`key: text`): it is lettered as a
   *  caption of the panel (the first one, for text before it). */
  | { kind: 'comicStrayText'; text: string }
  /** A script line names a balloon style no style defines
   *  (`ben{wisper}: …`): it takes the default style of its key. */
  | { kind: 'comicUnknownBalloonStyle'; style: string }
  /** A panel's `art` or `pop` names no picture resource (an unknown id, or
   *  a resource that is not a bitmap or an SVG): the panel is set empty. */
  | { kind: 'comicUnknownArt'; resourceId: string }
  /** A panel's cell cannot hold the picture's safe area under a cover
   *  crop: the picture is shown with its safe area whole and the bands
   *  left in the panel background. Found by the layout. */
  | { kind: 'comicPanelLetterbox'; resourceId: string; panel: number }
  /** A picture's anchor (a speaker's mouth) lies outside its safe area: a
   *  crop may cut it off, and the tail then points off the panel. An
   *  authoring hint. Points at the panel's `art`. */
  | { kind: 'comicAnchorOutsideSafeArea'; resourceId: string; anchorId: string }
  /** A balloon of a comic panel could not be placed cleanly (#561): it
   *  still covers a speaker's face, another balloon, an avoid zone or a
   *  mouth, or runs outside its panel, after every fallback (`fallbacks`:
   *  crossing the border, covering avoid zones, reshaping the text). The
   *  lettering never shrinks; a shorter line, a bigger panel or an `at=`
   *  pin fixes it. Found by the layout; points at the script line. */
  | { kind: 'comicBalloonOverflow'; panel: number; reasons: ('face' | 'balloon' | 'outside' | 'avoid' | 'anchor')[]; fallbacks: ('breakBorder' | 'coverAvoid' | 'reshape')[] }
  /** A speaker id that no picture of its comic page marks with an anchor
   *  and no `comics.cast` entry names (a slip in the id, most often): its
   *  tails point off the panel. Only raised on pages whose pictures mark
   *  anchors. Informational. Points at the first line of that speaker. */
  | { kind: 'comicUnknownSpeaker'; speaker: string }
  /** A comic panel's frame (#885) cannot do what the panel asks. `reason`:
   *  `'unknownBox'`, its `box` names no callout style (`style`): the panel
   *  keeps its panel style; `'textOverflow'`, a text panel's Markdown does
   *  not fit its frame (`overflowMm` did not): the rest is clipped;
   *  `'strip'`, `'spread'`, `'flow'`, a text panel on a strip, on a
   *  spread, or in a document whose flow is vertical or right to left: its
   *  Markdown is set in the flow after the comic. `panel`: the panel's
   *  place in the page's source (0-based). Points at the panel. */
  | { kind: 'comicPanelFrame'; reason: 'unknownBox' | 'textOverflow' | 'strip' | 'spread' | 'flow'; panel: number; style?: string; overflowMm?: number }
  /** A line number set in the side column (`lineNumbers.position:
   *  'side'`, #621) overlaps a side box, a side caption or another float
   *  of that column: both are painted where they are. Points at the line
   *  it numbers; `number` is the number as printed. */
  | { kind: 'lineNumberOverlap'; number: string }
  /** A paragraph a drop cap opens (#623) that could not take it as
   *  configured. `reason`: `'shortParagraph'`, fewer lines than the
   *  initial sinks (`handling` says what `shortParagraph` did: kept the
   *  room, shrank the initial to `lines`, or left it out); `'split'`, the
   *  paragraph broke before the initial's last line, alone in a column
   *  too short for it; `'joiningScript'`, its first letter joins the next
   *  (Arabic, Syriac, N'Ko) and is not set apart; `'verticalText'`, drop
   *  caps are set in horizontal text only; `'noLetter'`, it opens with no
   *  letter or digit to set large (a reference, a formula, a note mark);
   *  `'inBox'` (#922), a `:::paragraphs{dropcap}` group or a paragraph
   *  style with a drop cap inside a `:::callout` box, where none is set
   *  (a composed page's frames take them).
   *  `text` is the paragraph's first line. Found by the layout. */
  | { kind: 'dropCap'; reason: 'shortParagraph' | 'split' | 'joiningScript' | 'verticalText' | 'noLetter' | 'inBox'; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number; text: string }
  /** `codeOverflow` (#624): a code listing has lines wider than its box,
   *  fitted as `codeStyle.overflow` says: turned over (`'wrap'`), set
   *  smaller (`'shrink'`, at `scale` of its size; past `minFontScale` its
   *  lines wrap too) or cut at the box's edge (`'clip'`). `lines` counts
   *  the source lines too wide. Found by the layout. */
  | { kind: 'codeOverflow'; mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale?: number; lang?: string }
  /** `floatShrunk` (#626): a floated picture was set smaller than its size
   *  to fit the room of its slot (`placement.shrink`), at `scale` of its
   *  width. `overflowPx`: at its smallest scale (`placement.minScale`) it
   *  still runs this far past the foot of the page's text block, on a page
   *  where it had nowhere else to go. Found by the layout; information
   *  more than a fault, unless it overflows. */
  | { kind: 'floatShrunk'; resourceId: string; scale: number; overflowPx?: number }
  /** `pictureBelowPrintSize` (#901): a bitmap with a print size (its own
   *  `bitmap.resolution`, or a number in `layout.bitmapResolution`) set in
   *  a column that holds it at under half of it, on a page whose text
   *  block is wider than that column: `scale` is the share of its print
   *  width it keeps, `printWidthPx` that width, `widthPx` the column's and
   *  `pageWidthPx` the text block's. A picture in the flow is never wider
   *  than its column, and the default page has two (`layout.layoutType:
   *  'double'`). Found by the layout; reported once per picture. */
  | { kind: 'pictureBelowPrintSize'; resourceId: string; scale: number; printWidthPx: number; widthPx: number; pageWidthPx: number }
  /** `emptyCaption` (#1151): a resource of a type with a caption prefix
   *  whose own caption is empty, so its caption line prints the label and
   *  number alone ("Figure 1.2."). Often meant (a numbered plate), often a
   *  caption left out; information. Reported once per resource, where it
   *  is first placed. Found by the layout. */
  | { kind: 'emptyCaption'; resourceId: string; label: string }
  /** `resourceMoved` (#1151): a resource set where its `::resource` line
   *  stands (`position: 'here'`) was too tall for the room left in its
   *  column and moved on to the next, leaving `emptyPx` (`emptyMm`) of
   *  that column empty on page `pageIndex`. Reported when the room left is at least
   *  two lines of the body grid; a wrapped picture says it with
   *  `textWrap` `'moved'`. Found by the layout. */
  | { kind: 'resourceMoved'; resourceId: string; emptyPx: number; emptyMm: number }
  /** `folioMissing` (#1163): a composed page whose running head, running
   *  foot or folio element (`elementId`, of the template's `slot`:
   *  `header`, `footer` or a decoration text reading `{pageNumber}`, a
   *  running name or `{attr.x}`) draws nothing, while `drawnOn` of the
   *  `siblings` other pages of the same `template` and `side` that mean to
   *  draw it do. `folio`: the element writes `{pageNumber}`. A page whose
   *  fence switches the element off (`when` / `unless`) or whose slot has
   *  no such element is no sibling. Found after the running heads are
   *  laid; reported once per page and element. */
  | { kind: 'folioMissing'; template: string; elementId: string; slot: 'header' | 'footer' | 'decoration'; folio: boolean; side: 'recto' | 'verso'; drawnOn: number; siblings: number }
  /** `textWrap` (#627): a resource or a box set to wrap text round it
   *  (`placement.wrap`, a box's `wrap`) that does not as asked.
   *  `'tooNarrow'`: the text beside it would be narrower than
   *  `layout.wrap.minTextWidth`, so it takes its band whole; `'fewLines'`:
   *  it is shorter than `layout.wrap.minLinesBeside` lines, so it takes
   *  its band whole; `'moved'`: an inline one was too tall for the room
   *  left in its column and moved on to the next, its anchor with it;
   *  `'verticalText'`: text wraps in horizontal text only, so in a
   *  vertical flow it takes its band whole; `'noContour'` (#883): a
   *  contour wrap (`wrap: 'contour'`, or a pushing frame's) round a
   *  picture whose shape is not known (an SVG with no
   *  `contour.points`, a bitmap with no transparency, or whose alpha
   *  channel the host did not trace), so the text runs round its box.
   *  `resourceId` names a resource, `box` a box's style. Found by the
   *  layout. */
  | { kind: 'textWrap'; reason: 'tooNarrow' | 'fewLines' | 'moved' | 'verticalText' | 'noContour'; resourceId?: string; box?: string }
  /** `columnsTooNarrow` (#634): the sub-columns of a `:::columns` group
   *  are narrower than six ems of its text, `widthPx` each, `columns` of
   *  them: few words fit a line. Found by the layout. */
  | { kind: 'columnsTooNarrow'; columns: number; widthPx: number }
  /** `afterText` (#639): a `span: 'side'` box, or a figure or table of
   *  the side column (`resourceId`), set on a page that holds no text: the
   *  text of its chapter (or of the document) ended while it still waited
   *  for room in the side column, so it took the side column of a page
   *  opened after the text. One per box or float, with the range of the
   *  box (of the block citing the float) and its page. Found by the
   *  layout. */
  | { kind: 'afterText'; resourceId?: string }
  /** `unplaced` (#639): a `span: 'side'` box, a floated box or a floated
   *  resource (`resourceId`) still waiting for a slot when the layout
   *  ended: it is on no page (the pages opened for it had no side column,
   *  say). The build reports it instead of dropping it silently. It has a
   *  source range and no page. Found by the layout. */
  | { kind: 'unplaced'; resourceId?: string }
  /** `shortListSplit` (#749): a list of `items` items, short by
   *  `bodyText.shortListMaxItems`, cut between two columns or pages. Under
   *  `bodyText.shortListSplit: 'warn'` every such list is reported; under
   *  `'avoid'` only the one no column could hold whole (a list taller than
   *  an empty column, or than the room a float left of one). One per
   *  list, with the range of the list and the page of its first item.
   *  Found by the layout. */
  | { kind: 'shortListSplit'; items: number }
  /** `tocGroupSplit` (#850): a block of the contents kept together
   *  (`toc.groups.keepTogether`, `:::toc{keep}`), headed by `title`, set in
   *  `columns` columns: taller than a full column, or in a column too short
   *  to hold it (under a page-span box, beside a float). With
   *  `toc.groups.continuation` the column it goes on in opens with its head
   *  row again. One per block, with the range of its `:::toc` and the page
   *  it starts on. Found by the layout. */
  | { kind: 'tocGroupSplit'; title: string; columns: number }
  /** `openerFloat` (#749): a float set on an opener page (the page a part
   *  or a heading's own break opens, the first page of a document that
   *  starts with a heading) under `layout.openerFloats: 'warn'`: a figure,
   *  a table or a strip (`resourceId`), or a floated box. One per float,
   *  with the range of the block citing it (of the box) and its page.
   *  Found by the layout. */
  | { kind: 'openerFloat'; resourceId?: string }
  /** `designTextTruncated` (#628): a design text element did not fit its
   *  width and lost part of a line: cut by an ellipsis (`mode`
   *  `'ellipsis-*'`, its `overflow`) or clipped with ink past its box
   *  (`'clip'`). `slot` is where the design is painted (a running head or
   *  folio, a heading design, a part page, a contents part row),
   *  `elementId` the element's id and `text` the whole text it was given.
   *  One per element and page; a running head or folio once per element
   *  and chapter (a chapter title cut on every page of its chapter is one
   *  warning). `sourceStart` / `sourceEnd` when the text mirrors a heading
   *  or a frontmatter field. Found by the layout. */
  | { kind: 'designTextTruncated'; slot: VDTDesignSlotKind; elementId: string; text: string; mode: 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip' }
  /** A face the document's text was set in that the font set could not
   *  give when the build ran (#629): no face of the family was loaded nor
   *  installed, or the one that answers for the weight and slant had not
   *  loaded (`missing`: the text was measured and drawn with a fallback
   *  face), or the family has no face of that weight or slant and the
   *  browser took it from another one, as it is (the 700 for a 600) or
   *  drawn bolder or slanted (`synthesized`, #650). Checked
   *  where there is a font set (`document.fonts`, a worker's `self.fonts`,
   *  `BuildDocumentOptions.fontSet`), behind
   *  `debug.warnings.missingFont`. No page and no source range. */
  | { kind: 'fontFallback'; family: string; weight: number; style: 'normal' | 'italic'; reason: 'missing' | 'synthesized' }
  /** Characters the text sets in a face that has no glyph for them, which
   *  another face drew (#1105): the next family of the font list that has
   *  them (`supplier`, a generic family such as `serif` too), or, without
   *  `supplier`, a face the system picks. One per face: `characters` lists
   *  the first of them (each once, at most 24), `count` says how many in
   *  all. Checked by the glyph probe where there is a font set
   *  (`installGlyphProbe`), else against the `cmap` of the files
   *  registered with `registerFontCoverage`; behind
   *  `debug.warnings.missingFont`. No page and no source range. */
  | { kind: 'glyphFallback'; family: string; weight: number; style: 'normal' | 'italic'; characters: string[]; count: number; supplier?: string }
);
