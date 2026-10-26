// What a block carries beside its text: verse, score and code listings,
// composed-page fences and slots, figures and their labels, contents and
// index blocks, index marks and anchors (#1276: split out of types.ts).
import type { ScoreFormat, ScoreSystem } from '../../music/types.js';
import type { SourceRange, FigureLabelNode } from '../../composed/types.js';
import type { DirectiveAttrs } from './contentBlock.js';
import type { InlineSpan } from './inlineSpan.js';

/** A `:::verse` poem. The bayt layout (#378): one bayt per source line,
 *  its hemistichs (the ṣadr, then the ʿajuz) split at `||` (or a spaced
 *  `\\`, the Wikisource convention); a line without one is a single
 *  hemistich, centred. The line layout (#620): one line of verse per
 *  source line, a stanza per run of lines between blank lines, each stanza
 *  a block of its own (see {@link VerseStanza}). */
export interface VerseInfo {
  /** The fence's attributes as written (`gap`, `width`, `align`,
   *  `ornament`, `style`, `dir`, `layout`, `indentStep`, `turnover`,
   *  `stanzaSpace`, `keepStanzas`, …); `pipeline/text/verse.ts` and
   *  `pipeline/text/verseLines.ts` read them. */
  attrs: DirectiveAttrs;
  /** Set on the blocks of a poem in the line layout (#620): which stanza
   *  of which poem the block sets. Unset: the bayt layout, one block. */
  stanza?: VerseStanza;
}

/** One stanza of a poem in the line layout (#620). Its block's text holds
 *  the lines of verse, a line feed (`\n`) between two, mapped to the
 *  source's line end; leading whitespace is not in the text but in
 *  {@link lines}. */
export interface VerseStanza {
  /** The poem, numbered from 0 in the document's order: the stanzas of a
   *  poem share it. */
  poem: number;
  /** The stanza's index in its poem, from 0. */
  index: number;
  /** Whether it is the poem's last stanza. */
  last: boolean;
  /** Poem-wide index of the stanza's first line of verse, from 0. */
  firstLine: number;
  /** The stanza's lines, in order. */
  lines: VerseLineInfo[];
  /** The fence named no layout and the poem has no hemistich separator:
   *  the line layout was picked by `layout="auto"`. A configuration
   *  stored before #620 (`bodyText.verse.layout: 'bayt'`) sets such a
   *  stanza as single hemistichs, as postext 1.22 did. */
  auto?: true;
}

/** A line of verse in the line layout (#620). */
export interface VerseLineInfo {
  /** Its indent in spaces as written: each leading space counts 1, a tab
   *  4, an ideographic space (U+3000) 2. Multiplied by the poem's
   *  `indentStep`. */
  indent: number;
  /** The line was written `+ …`: a stepped line (a line of dramatic verse
   *  shared between speakers), set to start where the line above ended. */
  stepped?: true;
}

/** A code listing (#624): the lines between a ```` ``` ```` or `~~~`
 *  fence and its closing fence (or a run of indented lines), kept as
 *  written: no inline Markdown, no directives, every space and tab. The
 *  block's `text` joins the lines with a line feed, mapped to the source
 *  line end, so the plain text and the source map read the listing as
 *  written. */
/** A music score (#1172): the notation as written in its fence. */
export interface ScoreBlockInfo {
  format: ScoreFormat;
  /** The notation, the fence's indentation taken off. */
  source: string;
  /** The fence's attributes (`{#id style=… alt="…"}`). */
  attrs: DirectiveAttrs;
  /** Present once the build has engraved the score: the system this
   *  block sets, out of `count`. */
  system?: ScoreSystem;
  index?: number;
  count?: number;
  /** The engraver's message when the notation did not load. */
  error?: string;
  /** Read from the notation, for alt text. */
  title?: string;
  composer?: string;
}

export interface CodeBlockInfo {
  /** The first word of the info string (`js`, `python`, `console`),
   *  lower-cased; absent when the fence names none. */
  lang?: string;
  /** The info string as written, after the fence. */
  info: string;
  /** The rest of the info string read in the directive attribute grammar
   *  (`{title="backup.sh" lineNumbers start=12 highlight="3,5-7"}`). */
  attrs: DirectiveAttrs;
  /** The title: the `title` attribute, else a bare second word of the info
   *  string (```` ```console Terminal ````). */
  title?: string;
  /** The listing's lines, the fence's indentation (or the four columns of
   *  indented code) taken off, tabs kept. */
  lines: string[];
  /** Source offset of each line's first kept character. */
  lineStarts: number[];
  /** How the listing was written. */
  fence: '```' | '~~~' | 'indent';
}

/** The fence of a composed page (#854, DESIGN §3.1), on its
 *  `containerStart` marker: `::::page{template="…" spread …}`. The page's
 *  content is the blocks up to the matching `containerEnd`; a bare fence
 *  of the same number of colons closes it, and a bare `:::` inside never
 *  does. `composedPages()` (`composed/document.ts`) gathers the content by
 *  slot. */
export interface ComposedPageFence {
  /** The `template` attribute as written (`''` when missing). */
  template: string;
  /** The `spread` flag (any value but `false`). */
  spread: boolean;
  /** Every attribute of the fence as written (`template`, `spread`, `id`
   *  and the page's own, read by the template as `{attr.x}`). */
  attrs: DirectiveAttrs;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
  /** Ordinal of the fence in its text, from 0: the same in every locale
   *  when the chapters keep their pages in order. */
  fenceIndex: number;
  /** How many colons open (and close) the page: 4 or more. */
  colons: number;
  /** The page's `:::module` blocks (#1062), in Markdown order, a module
   *  inside a module left out. */
  modules?: ComposedModuleFence[];
}

/** A `:::module{template="…" name="…"}` block of a composed page (#1062,
 *  DESIGN §12.7), on its `containerStart`. The slots its blocks name are
 *  the module's: their `slot.name` is scoped by the instance name
 *  (`<name>.<slot>`), the source range still the value as written. */
export interface ComposedModuleFence extends SourceRange {
  /** The `template` attribute as written (`''` when missing). */
  template: string;
  /** The instance name: `name` as written, else `<template>[n]`, `n` the
   *  module's ordinal among the page's modules of that template (1-based).
   *  `''` for a module inside a module. */
  name: string;
  /** The `name` asked for, when the module could not take it (`taken`: an
   *  earlier module of the page has it; `invalid`: it holds a space, `.`,
   *  `#`, `[` or `]`). */
  rejected?: { name: string; reason: 'taken' | 'invalid' };
  /** A module written inside another module: not laid as a module
   *  (`moduleNested`); its blocks are the outer module's. */
  nested?: true;
  /** Every attribute of the fence as written (#1189): its own, besides
   *  `template` and `name`, are read first by `{attr.x}` in the module's
   *  decoration. */
  attrs: DirectiveAttrs;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
}

/** The `slot="…"` a block names (#854, DESIGN §3.2): a heading's
 *  `{slot=…}`, a `::resource{… slot=…}`, a `:::figure{slot=…}`, a code
 *  fence's or any `:::` container's (a `:::frame{slot=…}` sends its whole
 *  body). Absolute source range of the value. */
export interface BlockSlot extends SourceRange {
  name: string;
}

/** A `::label[TEXT]{at=… style=…}` line of a `:::figure` (#854, DESIGN
 *  §3.3): a short text set at an anchor of the picture (P6 lays it out).
 *  `text` is the plain text of the label's inline Markdown, `spans` its
 *  runs and `sourceMap` the absolute source offset of each character of
 *  `text`. `at` is an anchor name, or `{ x, y }` in fractions of the
 *  picture from `at="62% 48%"`. */
export interface FigureLabel extends FigureLabelNode {
  spans: InlineSpan[];
  sourceMap: number[];
  /** Source range of the bracketed text (between `[` and `]`). */
  textStart: number;
  textEnd: number;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
  /** The anchor the label is set at, as `resourceId#anchorId` (#857);
   *  absent for a label placed by `at="x% y%"`. */
  anchorRef?: string;
  /** The label's stable id on a composed page (#857):
   *  `cp<fenceIndex>:<slot>:label:<anchor>` (`@<n>`, the label's ordinal in
   *  its figure, for one placed by percentages). The same in every locale.
   *  Absent outside composed pages and for a figure that names no slot. */
  id?: string;
}

/** A `:::figure{resource="…" slot="…"}` … `:::` block (#854): one
 *  resource, set as `::resource` sets it, with labels at its anchors. Its
 *  block is a `resourceBlock` whose `resourceId` is the `resource`
 *  attribute. */
export interface FigureInfo {
  /** The fence's attributes as written. */
  attrs: DirectiveAttrs;
  attrSources: Record<string, SourceRange>;
  labels: FigureLabel[];
  /** The words of this edition (#935): the `alt`, `caption` and `note` the
   *  figure gives in place of its resource's, from the fence's attributes
   *  or from `::alt[…]`, `::caption[…]` and `::note[…]` lines (a line wins
   *  over an attribute). Absent when the figure gives none. */
  words?: Partial<Record<FigureWordKind, FigureWord>>;
}

/** The resource fields a `:::figure` can say in its own words. */
export type FigureWordKind = 'alt' | 'caption' | 'note';

/** One of a figure's own words (#935): the text as written (a caption and
 *  a note keep their inline Markdown, as a resource's do) and the absolute
 *  source range of that text. `text` may be empty: `alt=""` says the
 *  picture is decorative. */
export interface FigureWord extends SourceRange {
  text: string;
}

/** What one block of an expanded `:::toc` prints. */
export interface TocBlockInfo {
  /** `'entry'`: a heading (title, number, page label, optional subtitle
   *  line); `'part'`: a part divider row. */
  kind: 'entry' | 'part';
  /** Heading level of an entry (`0` for a part). */
  level: number;
  /** Printed number (`''` when none). */
  number: string;
  numbered: boolean;
  /** Page label of the entry's page; absent while unknown. */
  pageLabel?: string;
  /** Physical index of that page in the book (see `OutlineEntry.pageIndex`). */
  pageIndex?: number;
  /** Subtitle line under the title (an entry's `{author}`), when any. */
  subtitle?: string;
  /** Where the entry's heading starts in its chapter's Markdown body
   *  (`OutlineEntry.headingSource`, #857). */
  headingSource?: number;
  /** A numbered entry: the numbers of every numbered entry of its level in
   *  the same contents (one array the entries share), so the number column
   *  takes the widest of them (`الفصل الحادي عشر`) when it is wider than
   *  the configured `numberWidth`. */
  levelNumbers?: readonly string[];
  /** A part row's title and palette overrides. */
  title?: string;
  palette?: Record<string, string>;
  /** A part row that opens a page of the contents of its own
   *  (`toc.parts.breakBefore`, every part but the first, #996). The running
   *  text takes the break from the `:::pagebreak` row before it; a box,
   *  which ignores directives, cuts there when it can go on. */
  breakBefore?: true;
  /** The block of the contents this row belongs to, when the contents
   *  keeps its blocks together (`toc.groups`, `:::toc{keep}`, #850). */
  group?: TocGroupInfo;
}

/** A row's place in a block of the contents (#850). */
export interface TocGroupInfo {
  /** The block's number, unique in the document. */
  id: number;
  /** `'head'`: the head row; `'member'`: a row under it (an entry, or a
   *  part row right above a heading head, which goes with its block);
   *  `'continuation'`: the head row repeated with the continuation mark,
   *  set only when the column it opens holds the rest of a cut block
   *  (else skipped). */
  role: 'head' | 'member' | 'continuation';
  /** The block's first row, which carries the keep: the head, or a part
   *  row right above it. */
  lead?: true;
  /** The fewest entries a cut block keeps with its head
   *  (`minEntriesAfterHead`). */
  minEntries: number;
  /** The head's title, for the `tocGroupSplit` warning. */
  title: string;
}

/** An index mark (`:index[text]{…}` / `:index{…}`, #165): one term the
 *  back-of-book index lists, at the place it was marked. */
export interface IndexMark {
  /** Name of the index (`index="names"`); `''` for the main index. */
  index: string;
  /** The entry's levels, main term first (`term="Heart!valves"`). Empty
   *  for a mark without a term (it indexes nothing). */
  path: string[];
  /** Sort key of the last level (`sort="…"`), when it differs from it. */
  sort?: string;
  /** Reading of the last level in kana (`yomi="…"`, or `reading="…"`,
   *  #425): a Japanese index files the entry by it, before `sort`; any
   *  other index sorts by it as by `sort`. */
  yomi?: string;
  /** The reading the ruby of a visible mark's text gives that text, when
   *  the text is the last level, carries ruby, and every ruby reading is
   *  kana (`:index[{東京|とう|きょう}]` → とうきょう): a Japanese index's
   *  fallback when the mark has no `yomi`. Absent when a base character
   *  is left without a reading. */
  rubyYomi?: string;
  /** Cross-references: the entry prints *See* / *See also* the target
   *  instead of a page number for this mark. */
  see?: string;
  seeAlso?: string;
  /** The principal reference (`main`): its page number is set bold. */
  main?: boolean;
  /** Opens or closes a page range (`range="start"` / `range="end"`). */
  range?: 'start' | 'end';
  /** Source range of the whole mark in the original markdown. */
  sourceStart: number;
  sourceEnd: number;
  /** Source offset of the character the mark is attached to — the last
   *  one before it on its line (`attach: 'before'`), else the first one
   *  after it; `-1` when there is none. The mark lands on that character's
   *  page. */
  anchor: number;
  attach: 'before' | 'after';
}

/** An anchor set inside a block's text (#261): `:anchor{#id}` (invisible)
 *  or `[text]{#id}` (its text stays). Like an index mark it is taken out
 *  before the block parser runs, so it never changes the layout; the build
 *  finds the page and the line of the character it is attached to. */
export interface AnchorMark {
  /** The identifier a reference names (`:ref{id="…"}`). */
  anchorId: string;
  /** The text of a `[text]{#id}` span, without inline marks. */
  text?: string;
  /** Source range of the whole mark in the original markdown. */
  sourceStart: number;
  sourceEnd: number;
  /** Source offset of the character the anchor is attached to (see
   *  {@link IndexMark.anchor}); `-1` when there is none. */
  anchor: number;
  attach: 'before' | 'after';
}

/** What one block of an expanded `:::index` prints: an entry (a term with
 *  its page numbers), under the letter head of its group when it opens
 *  one. */
export interface IndexBlockInfo {
  /** Entry depth (0 = main entry). */
  level: number;
  /** The entry opens a group of the index (a new first letter) other than
   *  the first: the space above groups applies. */
  groupStart?: boolean;
  /** The letter head printed above the entry, in the same block so it
   *  never ends a column alone. */
  group?: string;
  /** Entries with no page of their own that head this one (a main entry
   *  and its sub-entry above a sub-sub-entry), printed above it in the
   *  same block for the same reason, outermost first. */
  leads?: { level: number; spans: InlineSpan[] }[];
  /** Which group of the index the entry is in (0 for the first), its place
   *  among the entry blocks of that group (0 for the one under the head)
   *  and how many they are: what the keep rule of a group divided between
   *  two columns reads (`index.groups.splitMinEntries`, #712). */
  groupIndex?: number;
  groupPlace?: number;
  groupSize?: number;
}
