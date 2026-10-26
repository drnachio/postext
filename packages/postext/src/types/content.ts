import type { StoryJump } from '../composed/carryTypes.js';
import type { NumeralStyle } from '../numbering.js';
import type { Resource } from './resources.js';

/** A footnote, endnote or margin note passed as data. The engine does not
 *  read `PostextContent.notes` (see there): notes are written in the
 *  markdown. */
export interface PostextNote {
  id: string;
  type: 'footnote' | 'endnote' | 'marginNote';
  content: string;
  marker?: string;
}

/** Document metadata: the frontmatter merged over `PostextContent.metadata`.
 *  On a built document (`VDTDocument.metadata`) the four printed fields are
 *  always text — typed YAML values (`title: 1984`, a date, a list) are
 *  coerced by `metadataText`. */
export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  publishDate?: string;
  [key: string]: unknown;
}

export interface PostextContent {
  markdown: string;
  metadata?: DocumentMetadata;
  /** User-managed resources (issue #49) embedded via `::resource{id=…}` and
   *  referenced inline via `:ref{id=…}`. Binary payloads (bitmaps, SVGs) are
   *  resolved out-of-band by the renderer; table resources carry their model
   *  inline. */
  resources?: Resource[];
  /** Accepted, but no stage of the pipeline reads it. Notes are written in
   *  the markdown instead: a `[^id]` marker and a `[^id]: …` definition,
   *  laid out as `PostextConfig.footnotes` says (foot of the citing column
   *  by default, `placement: 'chapterEnd'` for endnotes). */
  notes?: PostextNote[];
  /** Counters carried over from content laid out before this document — a
   *  book chapter laid out on its own continues the numbering of the
   *  chapters before it. Omit for a self-contained document. */
  continuation?: LayoutContinuation;
  /** The book's outline — every heading and part the `:::toc` directive
   *  lists and every index mark `:::index` lists, with the page label each
   *  one landed on. A chapter laid out on its own gets the whole book's
   *  outline from its host; when absent, the engine derives it from the
   *  document itself, laying it out again until the page labels the
   *  contents and the index print no longer change. */
  outline?: OutlineEntry[];
  /** The document's share of its book's citations (#272): every reference
   *  and citation of the book, and where this document's sit — what
   *  `bookCitationContexts` gives a host for each chapter. When absent the
   *  document is a book of its own. */
  citations?: import('../citations/context.js').CitationContext;
  /** The `id` of every page fence (`::::page{id="…"}`) of the chapters
   *  after this one in its book, with the position of the chapter that has
   *  it (#943). A frame whose `overflow.continueIn` is `'page:<id>'` for
   *  one of them does not warn nor go on next page: the rest of its story
   *  comes back in `VDTDocument.pendingJumps`, for the host to hand to
   *  that chapter (`LayoutContinuation.jumps`). Absent: every `page:<id>`
   *  names a page of this chapter. */
  laterPageIds?: Record<string, number>;
}

/** An index mark as the book outline carries it (see
 *  {@link OutlineEntry.indexMark}). */
export interface OutlineIndexMark {
  /** Name of the index; `''` for the main one. */
  index: string;
  /** The entry's levels, main term first. */
  path: string[];
  sort?: string;
  /** The reading of the last level (`yomi="…"`), and the kana reading the
   *  ruby of the marked text gives it (see {@link IndexMark.rubyYomi}). */
  yomi?: string;
  rubyYomi?: string;
  see?: string;
  seeAlso?: string;
  main?: boolean;
  range?: 'start' | 'end';
  /** Source offset of the mark in its chapter's markdown body (front
   *  matter excluded): identifies the mark within the chapter. */
  sourceStart: number;
}

/** One line of a book's outline: a heading of a listed level, a part
 *  divider or an index mark. Produced from the parsed markdown (page labels
 *  unknown) or from a laid-out document (page labels known); consumed by
 *  `:::toc` and `:::index`. */
export interface OutlineEntry {
  /** `kind: 'exercise'` (#1229): an exercise's key and worked solution, and
   *  the title of the chapter it is in, for `:::solutions{scope="book"}`;
   *  `number` is the exercise's. */
  exercise?: { key: string; solution?: string[]; chapter: string };
  /** `'indexMark'`: an index mark (`:index…`), listed by `:::index`, never
   *  by `:::toc` (`listed` is false). `'anchor'`: an anchor set in the text
   *  (`:anchor{#id}`, `[text]{#id}`, `:::callout{#id}`), a target of
   *  cross-references only (#261). */
  kind: 'heading' | 'part' | 'indexMark' | 'anchor' | 'exercise';
  /** Heading level (1–6); `0` for a part. */
  level: number;
  /** Title as plain text (forced title breaks flattened to spaces). */
  title: string;
  /** Inline runs of the title (bold / italic), so a title set in italics
   *  keeps its emphasis in the contents. Absent for a part. */
  spans?: { text: string; bold: boolean; italic: boolean }[];
  /** Printed number: the level's `numberingTemplate` output, else the
   *  chapter ordinal for a level-1 heading; the part's `number` as written.
   *  Empty for an unnumbered heading. */
  number: string;
  /** A numbered heading's counter: its level's running count, restarted by
   *  a `startAt` attribute (the `3` of a third chapter, whatever `number`
   *  prints). Absent for a part and an unnumbered heading. */
  counter?: number;
  /** False for a heading whose style has `numbered: false`. */
  numbered: boolean;
  /** Id of the heading style (`{style="…"}`), when the heading has one. */
  styleId?: string;
  /** Heading attributes (`{author="…"}`), for the contents' subtitle line. */
  attrs?: Record<string, string>;
  /** Palette overrides of a part (`palette="band=#…"`), so its row in the
   *  contents takes the part's colours. */
  palette?: Record<string, string>;
  /** Label of the page the entry starts on; absent until laid out. */
  pageLabel?: string;
  /** 0-based physical index of that page in the book (the document's
   *  `pageIndexOffset` counted in); absent until laid out. What a link on
   *  the entry jumps to. */
  pageIndex?: number;
  /** Whether the entry appears in the contents (a heading style's `toc`
   *  or a `{toc="false"}` attribute may exclude it). */
  listed: boolean;
  /** The mark of an `'indexMark'` entry. */
  indexMark?: OutlineIndexMark;
  /** The identifier a cross-reference names: a heading's `{#id}`, an
   *  `'anchor'` entry's id (#261). */
  anchorId?: string;
  /** Source offset of an `'anchor'` entry's mark in its chapter's markdown
   *  body (front matter excluded): identifies it within the chapter. */
  anchorSource?: number;
  /** Source offset of a `'heading'` entry's heading line in its chapter's
   *  Markdown body (front matter excluded): what a contents entry points
   *  back to (#857). Not part of `outlineKey`: an edit that moves the
   *  heading does not lay the contents out again. */
  headingSource?: number;
  /** The page-number format of the entry's page, once laid out (an index
   *  merges consecutive pages of one format into a range). */
  pageFormat?: string;
  /** What a reference to a counted anchor prints by default (#530): a
   *  labelled equation's number in its `format` ("(3)", what `\eqref`
   *  prints), a numbered statement's label and number ("Theorem 2").
   *  `number` holds the bare number. Absent on every other entry. */
  numberLabel?: string;
}

/** Heading counters (1-indexed by level) in effect at a point in a document. */
export interface HeadingCounters {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
}

/** A numbered resource: its rendered number, type and the heading counters
 *  at its first reference. */
export interface ResourceNumberEntry {
  number: string;
  typeId: string;
  heading: HeadingCounters;
}

/** What a document laid out after other content inherits from it. Every
 *  field is optional; a missing one means "nothing precedes". Obtain it
 *  with `continuationAfter()` (counters) and the previous layout's page
 *  count (pages). */
export interface LayoutContinuation {
  /** Physical pages before this document's first page. Shifts page parity
   *  (recto/verso, mirrored margins, odd/even header elements) and marks the
   *  document as continued, so a leading heading's `breakBefore` pads
   *  parity as it would mid-book. */
  pageIndexOffset?: number;
  /** Page numbering in effect on the first page, overriding
   *  `page.pageNumbering` (the value the previous page would be followed
   *  by, in its format). */
  pageNumbering?: { format?: NumeralStyle; startAt?: number };
  /** Heading counters at the end of the preceding content: the next `#`
   *  becomes chapter `h1 + 1`. */
  headings?: HeadingCounters;
  /** Per resource-type counter state at the end of the preceding content
   *  (the `{n}` counter and the heading counters of the last numbered
   *  resource, which decide `resetOn`). */
  resourceCounters?: Record<string, { counter: number; heading: HeadingCounters }>;
  /** Resources already numbered by the preceding content, so a later
   *  reference keeps the number of its first mention. The preceding
   *  content placed them too: this document only refers to them — a
   *  floated resource listed here is not floated again, and a
   *  `::resource` embed of one is just another reference. */
  resourceNumbers?: Record<string, ResourceNumberEntry>;
  /** The last footnote number the preceding content printed, so notes
   *  numbered through the book (`footnotes.numbering: 'document'`) go on
   *  from it. */
  footnoteNumber?: number;
  /** The number of the last line the preceding content counted (#621), so
   *  line numbers counted through the book (`lineNumbers.restart:
   *  'document'`) go on from it. `continuationAfter` counts the lines of
   *  verse from the text; a count of every line (`count: 'all'`) depends
   *  on the layout, and the host takes it from the previous chapter's
   *  `VDTDocument.lastLineNumber`. */
  lineNumber?: number;
  /** The `:::part` in effect at the end of the preceding content — the last
   *  part opened, whether or not its fence has closed — so a chapter laid
   *  out on its own keeps `{partTitle}` / `{partNumber}` and the part's
   *  palette overrides on every page until it opens a part of its own. */
  part?: PartState;
  /** True when the preceding content ends by closing a `:::part` (nothing
   *  follows its fence) and parts open a divider page: the part's pages are
   *  the last before this document. The part's `breakAfter` is then still
   *  owed — applied before this document's first block, as it would be in
   *  one document — and a first page left blank is the back of the part
   *  page, painted with `parts.versoDesign`. `continuationAfter` sets it;
   *  it moves page breaks only when `parts.breakAfter.parity` asks for a
   *  side. */
  afterPartPage?: boolean;
  /** Physical pages of the whole book this document is part of — every
   *  chapter, blank pages included — when the host knows them: what
   *  `{bookTotalPages}` prints. Omitted, the placeholder counts the pages up
   *  to the end of this document (`pageIndexOffset` plus its own pages),
   *  which is the whole book for a self-contained document and for the
   *  last chapter. It only feeds running heads and design text, never the
   *  page breaks, so a host can take it from a layout of the same book. */
  bookPageCount?: number;
  /** The counters of labelled equations and numbered statements at the
   *  end of the preceding content (#530), by counter name — `'equation'`
   *  for the equations (`math.equationNumbering`), a callout style's
   *  `numbering.counter` for its statements — each with the heading
   *  counters of its last count, which decide `resetOn`. */
  statementCounters?: Record<string, { counter: number; heading: HeadingCounters }>;
  /** Stories of earlier chapters that jump into a page fence of this one
   *  (#943, `overflow.continueIn: 'page:<id>'` with the page in a later
   *  chapter file): what each of them returned in
   *  `VDTDocument.pendingJumps`, with `chapter` set to the position of the
   *  chapter it comes from. This chapter sets the rest of each story in the
   *  frames its page with that `id` leaves free. */
  jumps?: StoryJump[];
}

/** A part (section) as the running heads see it: number and title as
 *  written on the fence, plus the colour-palette entries the fence
 *  overrides (`palette="band=#f6c297"`), applied to every design slot laid
 *  out on the part's pages. */
export interface PartState {
  number: string;
  title: string;
  /** Palette id → hex colour. */
  palette?: Record<string, string>;
}
