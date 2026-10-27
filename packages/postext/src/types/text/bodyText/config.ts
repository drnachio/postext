// BodyTextConfig: the body text settings a config sets
// (#1278: split out of bodyText.ts).
import type { FigureStyle, TextAlignKeyword, HyphenationConfig, KashidaSetting, KashidaPatterns } from '../locale.js';
import type { Dimension, ColorValue } from '../../page.js';
import type { TabStop } from '../paragraphStyles.js';
import type { VerseConfig } from '../verse.js';
import type { BlockquoteConfig, CompositionRule, ColonListRoom, ParagraphContainerSpacing, ParagraphStylesInBoxes, EmphasisStyle, TashkilMode } from './options.js';

export interface BodyTextConfig {
  /** One family, as every `fontFamily` field: a CSS font stack is set in
   *  its first family (see `primaryFontFamily`) and reported by
   *  `collectConfigWarnings`. */
  fontFamily?: string;
  /** The figures of the running text (see {@link FigureStyle}): `'oldstyle'`
   *  for a book's prose. The styles that take the body's family take them
   *  too. Default: the font's own. */
  figureStyle?: FigureStyle;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  /** The space between two paragraphs (#1115). `true` adds one
   *  baseline-grid line (the body's line height), `false` (default) none,
   *  and a length (`2mm`, `0.33em` of the font size, `4pt`) exactly that
   *  much, in the main flow, in boxes and in composed frames. A length that
   *  is not a whole number of lines takes the paragraphs off the baseline
   *  grid, as `paragraphStyles[].spaceBetween` does in a `:::paragraphs`
   *  container (the same slot of the paragraph's style): the next block
   *  that snaps (a heading, the last item of a list, display maths, the
   *  last paragraph of a container) brings the flow back onto the grid.
   *  Inside a `:::paragraphs` container the style's `spaceBetween` sets
   *  the space instead. */
  paragraphSpacing?: boolean | Dimension;
  color?: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Colour of inline `:ref` reference labels (e.g. "Fig. 1.7"). Defaults to
   *  {@link boldColor} (the emphasis colour). */
  referenceColor?: ColorValue;
  /** Whether reference labels are rendered in the bold font. Default `true`. */
  referenceBold?: boolean;
  /** Whether reference labels are rendered italic. Default `false`. */
  referenceItalic?: boolean;
  textAlign?: TextAlignKeyword;
  fontWeight?: number;
  boldFontWeight?: number;
  hyphenation?: HyphenationConfig;
  firstLineIndent?: Dimension;
  hangingIndent?: boolean;
  /** When `false`, the first paragraph immediately following a heading (or
   *  a `:::space` line) is rendered without first-line indent. A common typographic convention in
   *  scientific publications and many book styles ("indent run-in" style).
   *  Default `true` — every paragraph receives the indent. */
  indentAfterHeading?: boolean;
  /** Max word-spacing when justifying, as a multiplier of the normal space width.
   *  Knuth–Plass keeps every line within it that the paragraph allows,
   *  hyphenating or spreading the slack over neighbouring lines first; a
   *  line no break sequence can set within it stretches past it at a cost
   *  that jumps past the bound and grows with the square of the adjustment
   *  ratio, and one past 3× the normal
   *  space is set ragged. `maxJustifyTracking` lets such a line take a
   *  little tracking instead. Default 2. */
  maxWordSpacing?: number;
  /** Min word-spacing when justifying, as a multiplier of the normal space width. */
  minWordSpacing?: number;
  /** Most tracking a justified line may take, in thousandths of an em
   *  either way (the InDesign unit: 10 = 0.01 em per character), when its
   *  word spaces alone would set it past `maxWordSpacing` or
   *  `minWordSpacing`: the part of the adjustment beyond the limit goes into
   *  the letters, so a loose line's spaces come back to `maxWordSpacing` and
   *  a tight one fits at `minWordSpacing`. Lines within the limits, a
   *  paragraph's last line (unless it runs over) and a line of one word
   *  take none, nor does a line holding a chip. Knuth–Plass weighs it (it
   *  is taken only where word spacing alone would pass its limits), so it
   *  needs `optimalLineBreaking`. 0 (the default) turns it off. */
  maxJustifyTracking?: number;
  /** Kashida justification (#375): a justified line of Arabic-script text
   *  takes part of its slack by elongating letter joins with tatweels
   *  (U+0640), the rest in its word spaces. Each word gets at most
   *  {@link kashidaPerWord} elongations, at the joins the pattern set
   *  ({@link kashidaPatterns}) ranks best, never after a letter that does
   *  not join onward (ا د ذ ر ز و ة), never at the end of a word, never
   *  inside lām-alif; a word that holds a tatweel the author typed is
   *  lengthened there. Never in Latin text, digits, a heading, a ragged
   *  line or a paragraph's last line, and never as letter-spacing.
   *  Knuth–Plass counts each word's elongation as stretch, so lines with
   *  Arabic words choose their breaks knowing they can stretch there.
   *  The tatweels are painted as text; copied and extracted text leaves
   *  them out (see `VDTLineSegment.kashida`).
   *  `'auto'` elongates; `'none'` justifies with the spaces alone. Unset:
   *  `'auto'` in a document whose language is written in the Arabic
   *  script (`ar`, `fa`, `ur`…), `'none'` otherwise. */
  kashida?: KashidaSetting;
  /** Which joins take a kashida, and in what order (#375): `'naskh'`, the
   *  classical Naskh rules (Benatia's matrix with Afifi's prohibitions, as
   *  in raqim-kashida), for Amiri, Noto Naskh, Scheherazade and their
   *  kind; `'simple'`, the Microsoft priorities, for simple modern faces;
   *  `'nastaliq'`, the Naskh rules tailored for Nastaʿlīq. `'auto'` (the
   *  default) reads the body font's family: no kashida at all in a Ruqʿa
   *  or Dīwānī face (`Aref Ruqaa`), whose letters do not elongate,
   *  `'nastaliq'` in a Nastaʿlīq one, else `'naskh'`. */
  kashidaPatterns?: KashidaPatterns;
  /** Most elongations in one word (#375). Default 1, the rule of book
   *  typography; a classical verse line (`:::verse`) may take more. */
  kashidaPerWord?: number;
  /** Longest elongation at one join, in ems (#375): the tatweels inserted
   *  there are whole ones, as many as fit in this. Default 0.6 (three
   *  tatweels of Amiri, two of Noto Naskh Arabic). */
  kashidaMaxLength?: number;
  /** Use Knuth-Plass optimal line breaking instead of greedy first-fit. Default true. */
  optimalLineBreaking?: boolean;
  /** Break ragged paragraphs with Knuth–Plass too: body text, blockquotes
   *  and list items set left, right or centred, and ragged paragraph styles,
   *  box bodies and the bodies of parts and section styles. Word spaces keep
   *  their width; the breaker weighs how far each line falls short of the
   *  measure (3 em short costs what a justified line at `maxWordSpacing`
   *  does), so the edge comes out more even, and the runt rules
   *  (`avoidRunts`, `tightenRunts`) and `hyphenateAcrossColumns` work as on
   *  justified text. A line may end after a hyphen the text carries between
   *  two letters, as line by line. With `hyphenation.ragged` the zone still
   *  decides which syllables may end a line; two syllable ends in a row are
   *  discouraged rather than refused.
   *  Ragged headings, captions, table cells and the contents are still set
   *  line by line. Needs `optimalLineBreaking`. Default `true`; `false` sets ragged text
   *  line by line, as up to postext 1.4 (configurations stored before
   *  `configVersion` 7 whose text can be ragged read with it, see
   *  `pinLegacyRaggedBreaking` in `postext/bundle`). */
  optimalRagged?: boolean;
  /** Let a line end after an em or en dash set closed between words
   *  ("say—that’s", "riddles.—I", "Hamburg–Berlin"), in Knuth–Plass as well
   *  as line by line. Never after a dash that opens an aside or a line of
   *  dialogue ("—dijo", `said "—Hola`: a space, or a space and a quotation
   *  mark, before the dash; a quote that closes a word still lets the line
   *  end, "\"no\"—and", German "„nein“—und", French "« non »—et"), before
   *  punctuation ("él—,"), before a quotation
   *  mark or a bracket ("thinking—\" and", "says—“no”"), inside a run of
   *  dashes, or inside a range of numbers set with an en dash
   *  ("1914–1918"). A dash that ends a run before a word in another style
   *  ("see—*and*") counts too. The line ends on the dash and nothing is
   *  added. Default
   *  `true`; `false` keeps postext 1.4's breaks: Knuth–Plass never breaks
   *  there, and the line-by-line breaker of formatted or hyphenated ragged
   *  text only between two letters (configurations stored before
   *  `configVersion` 7 whose text sets such a dash read with it, see
   *  `pinLegacyDashBreaks`). Applies to the running text, headings, lists,
   *  blockquotes and boxes; captions, table cells and the contents keep the
   *  1.4 breaks, and a plain ragged paragraph set line by line follows
   *  pretext's own rules either way. */
  breakAfterDashes?: boolean;
  /** Let a line end after the hyphen of a compound, a hyphen between two
   *  letters ("well-" | "known", "vencer-" | "se"), in every paragraph
   *  broken with Knuth–Plass. The line ends on the hyphen and nothing is
   *  added. Never after a hyphen next to a digit or a sign ("COVID-19",
   *  "-5 °C"). A justified paragraph without inline formatting breaks there
   *  only with two letters on each side of the hyphen, so no line ends on
   *  "e-" of "e-mail". Default `true`. `false` keeps postext 1.4's breaks: a
   *  justified paragraph with no inline formatting never breaks there,
   *  while one with a bold or italic word anywhere, a ragged paragraph and
   *  one set line by line do (configurations stored before `configVersion`
   *  8 whose text sets a compound read with it, see
   *  `pinLegacyHyphenBreaks`). Applies to the running text, headings, lists,
   *  blockquotes and boxes. */
  breakAfterHyphens?: boolean;
  /** Let a line of formatted text end after a slash between two words
   *  ("entrada/" | "salida", "ACC/" | "AHA/" | "AAPA", #1164): each side
   *  a run of at least three letters or digits, not two digits, so a unit
   *  ("km/h", "kg/m³", "mg/dL"), a short pair ("and/or"), a fraction or a
   *  date ("1/2", "10/03/2026") stays whole. The line ends on the slash and
   *  nothing is added. A word wider than its whole line is divided after a
   *  slash before a syllable or a letter. Default `true`; `false` keeps
   *  the breaks of postext 1.51, which broke there only inside a web
   *  address (configurations stored before `configVersion` 19 read with
   *  it, see `pinLegacySlashBreaks`). Applies to every text the rich
   *  breaker sets: paragraphs with inline formatting, captions, table
   *  cells, notes, bibliographies; a plain paragraph breaks after any
   *  slash, as the hyphenation dictionary marks it, either way. */
  breakAfterSlashes?: boolean;
  /** Read a backslash at the end of a source line, and `\\` before a space,
   *  as a forced line break inside a paragraph, a quotation or a list item
   *  (CommonMark's hard break, #620): the next words start a new line
   *  of the same paragraph, and the line before the break is set at its
   *  natural width, as a paragraph's last line is. A backslash that ends
   *  the paragraph prints. Two trailing spaces are no break (they are
   *  invisible, and editors leave them behind). Default `true`. `false`
   *  keeps postext 1.22's reading: the backslashes print and the lines
   *  join with a space (configurations stored before `configVersion` 9
   *  whose text has such a backslash read with it, see
   *  `pinLegacyHardBreaks`). Titles (`\\` in a heading), captions, notes
   *  and table cells break at `\\` either way. */
  hardLineBreaks?: boolean;
  /** Shape a word with no letter (`46.`, `1367)`, `».`: digits,
   *  punctuation or symbols alone) in the script of the text around it
   *  (#725). Such a word has no script of its own, and a face may draw its
   *  marks by script: Amiri sets a Latin full stop, brackets and guillemets
   *  under Latin and Arabic ones otherwise, of other widths. Left alone,
   *  each shaper picks a script by its own rule (one version of a browser
   *  the font's default, the next Latin, the PDF the default), so a
   *  document broke its lines otherwise from one browser to another and
   *  its PDF set glyphs of another width in the measured places. With
   *  this on, a word painted left to right takes the script of the nearest
   *  letter before it in its isolate, else after it; one painted right to
   *  left (a bracket or a full stop at a right-to-left level) the script
   *  of the nearest right-to-left letter; with no letter near, the script
   *  of the document's language. A piece with no letter of a word that
   *  has one (`10.1006/` and `.2001` of a DOI that ends a line at its
   *  joints, what a cut leaves of a word wider than its line) takes the
   *  script it has inside the word. In a Chinese or Japanese document a
   *  doubled ellipsis or dash (`……`, `——`) in a word with no letter is
   *  the document's own mark, set in the forms of Han text whatever
   *  sentence cites it. The layout measures it in that script
   *  and says so on its segment (`VDTLineSegment.scriptContext`), and the
   *  canvas, the HTML, the fixed-layout EPUB and the PDF paint those
   *  forms at that width. It acts on Latin, Greek, Cyrillic, Arabic and
   *  Hebrew contexts, and only in a face whose punctuation or digits
   *  change with the script (asked once a face): every other face is laid
   *  out and painted as before. It governs the running text, headings,
   *  lists, captions, notes and table cells, and the leader of dots of a
   *  contents entry (in the script of the document's language); in such a
   *  face a right-to-left word is also measured as it is painted, right to
   *  left, so a bracket or a stop at its edge takes one width in every
   *  browser. Design text (running heads, openers), list markers, comic
   *  lettering and paragraphs set by the CJK composer are not touched. Default `true`. `false` shapes such a word alone, as up
   *  to postext 1.27 (configurations stored before `configVersion` 12
   *  read with it, see `pinLegacyScriptContext` in `postext/bundle`). */
  scriptContext?: boolean;
  /** The language the document's text is shaped in (#764): measured,
   *  painted and embedded. A font answers with other glyphs under a
   *  language (OpenType `locl`): Noto Serif SC sets its digits otherwise
   *  in Chinese, a face with a Catalan form draws `l·l` otherwise, one
   *  with the Turkish rule keeps `fi` apart. `'document'` (the default
   *  since postext 1.30, #770): the document's own
   *  ({@link PostextConfig.locale}), and a run's own where it names one
   *  (`{lang=en}`), on every context the layout measures with (the
   *  engine's, a layout worker's, the plain-paragraph breaker's), so the
   *  same document has the same lines on a page in any language and in a
   *  worker; the canvas paints in it through every `save()`
   *  (`canvas-backend/contextState.ts`), the HTML viewer and the EPUB
   *  declare it and the PDF shapes with the OpenType language system of
   *  the language. Under it the text is measured as it is painted: a
   *  string has one width whatever was measured before it, a
   *  right-to-left word is measured right to left, the two parts of a
   *  word broken at a line end and the runs of a design text are measured
   *  as the texts that are painted, and the PDF shapes word by word as the
   *  canvas does and takes each character from the font file the browser
   *  took it from. `'host'`: as up to postext 1.28, the measuring contexts
   *  take the language of the page that hosts the layout (none in a
   *  worker) and the canvas paints in that same language; the HTML viewer
   *  declares the language of a Chinese, Japanese, Korean or right-to-left
   *  document; the widths and the PDF are the ones such a document had.
   *  Under `'host'` the part of a broken word that opens the next line is
   *  measured as the whole word less its first part, so a face whose form
   *  for the language needs the letters on both sides of the break (the
   *  Catalan `l·l` of Crimson Pro, a wide dot set only between two `l`)
   *  leaves a gap after it on a page in that language. `'host'` was the
   *  default of postext 1.29.1 and 1.29.2; `'document'` was the default of
   *  1.29.0 alone, whose canvas and PDF did not follow the measure (#764).
   *  A configuration stored before `configVersion` 14 that does not name
   *  the setting reads with `'host'` written out
   *  (`pinLegacyShapingLanguage` in `postext/bundle`), so a stored
   *  document keeps its lines. A browser whose canvas has no `lang`
   *  (Chrome before 136, Firefox and Safari where it is missing) is given
   *  no language and keeps the forms it always measured. */
  shapingLanguage?: 'document' | 'host';
  /** Tab stops of every paragraph, list item and quotation (#622): where a
   *  tab (`:tab`, or a tab character in the text) sends the words after
   *  it. A paragraph style or a callout body that sets its own replaces
   *  them. Unset: none; a tab character is then a word space, as before. */
  tabStops?: TabStop[];
  /** Default stops every `tabInterval` past the last of {@link tabStops}
   *  (#622), from the start of the measure. Unset: a tab past the last stop
   *  is a word space. */
  tabInterval?: Dimension;
  /** Start the line after a break at a compound's hyphen with a hyphen too:
   *  "vencer-" | "-se", as Portuguese spelling and the Spanish Academy's
   *  2010 rules ask ("léxico-" | "-semántico"), so the reader knows the
   *  hyphen is part of the word. The repeated hyphen is measured with its
   *  line and painted, and left out of the line's source range (see
   *  `VDTLine.repeatedHyphen`); the PDF paints it under an `/ActualText`
   *  that leaves it out, so extracted text reads the word once. A web
   *  address never gets one. Default
   *  `false`. Applies to the running text, headings, lists, blockquotes and
   *  boxes; with it on, a paragraph without formatting that holds a
   *  compound is broken the way a formatted one is. */
  repeatHyphen?: boolean;
  /** How Markdown blockquotes (`> …`) are set. Unset fields keep the look
   *  postext 1.4 gave them: grey (`#666666`), italic, the body's first-line
   *  indent and no side indent. */
  blockquote?: BlockquoteConfig;
  /** How `:::verse` poems in the line layout are set (#620): each fence
   *  attribute of the same name overrides the setting for its poem. */
  verse?: VerseConfig;
  /** When true, discourage a paragraph from ending with fewer than `orphanMinLines`
   *  lines at the top of the next column. Soft (penalty-based). Default true;
   *  false on a character grid (`cjk.grid`) in the Japan region, where a
   *  page holds the lines its grid counts (#717, `avoidOrphansByDefault`). */
  avoidOrphans?: boolean;
  /** Minimum lines required at the top of the next column when a paragraph is split.
   *  Only effective when `avoidOrphans` is true. Default 2. */
  orphanMinLines?: number;
  /** Demerit added when an orphan constraint is violated. Higher = stronger
   *  avoidance. 0 effectively disables the penalty. Default 1000 — chosen so
   *  orphan avoidance normally wins over slack (slackWeight·slack²) unless
   *  pushing the paragraph would leave ≳10 lines of whitespace. */
  orphanPenalty?: number;
  /** When true, list items also receive orphan protection (not just paragraphs).
   *  Only effective when `avoidOrphans` is true. Default true. */
  avoidOrphansInLists?: boolean;
  /** When true, discourage a paragraph from starting with fewer than `widowMinLines`
   *  lines at the bottom of the current column. Soft (penalty-based). Default true;
   *  false on a character grid (`cjk.grid`, #717, `avoidWidowsByDefault`). */
  avoidWidows?: boolean;
  /** Minimum lines required at the bottom of the current column when a paragraph is
   *  split. Only effective when `avoidWidows` is true. Default 2. */
  widowMinLines?: number;
  /** Demerit added when a widow constraint is violated. Default 1000 (same
   *  scale as `orphanPenalty`). */
  widowPenalty?: number;
  /** When true, list items also receive widow protection (not just paragraphs).
   *  Only effective when `avoidWidows` is true. Default true. */
  avoidWidowsInLists?: boolean;
  /** A short list cut between two columns or pages (#749): one of up to
   *  `shortListMaxItems` items, in the running text. `avoidOrphansInLists`
   *  and `avoidWidowsInLists` keep the lines of one item together; this
   *  rule keeps the items of one list together. `'allow'` (the default)
   *  cuts such a list wherever the column ends, as any other. `'warn'`
   *  lays it out the same and reports each list cut (a `shortListSplit`
   *  content warning). `'avoid'` sets the list whole: when it does not fit
   *  under what the column holds it opens the next column, the headings
   *  right above it and the colon line that introduces it
   *  (`keepColonWithList`) going with it. A float offered the foot of the
   *  column the list stands whole in takes its next slot instead, and the
   *  colon line counts the room a figure it cites will take there. A list
   *  taller than an empty column is cut as any other, and reported. Lists inside a `:::callout`
   *  follow the box's own cut rules, and the entries of `:::toc` and
   *  `:::index` are not lists. */
  shortListSplit?: CompositionRule;
  /** The most items a list has to count as short for `shortListSplit`,
   *  the items of its nested lists included. Default 3. */
  shortListMaxItems?: number;
  /** Weight applied to the squared "unused column space" cost. Higher values make
   *  the layout prefer filling columns tightly; 0 disables the slack pressure.
   *  Default 10. */
  slackWeight?: number;
  /** When true, discourage paragraphs from ending with a very short last line
   *  (a "runt" — e.g. a single short word alone). Soft (Knuth-Plass penalty),
   *  so ragged text takes it only when `optimalRagged` breaks it with
   *  Knuth–Plass. A Chinese, Japanese or Korean paragraph does not end on a
   *  line holding one character, alone or with its closing marks (孤字): the
   *  line above gives it its last character when that line can still be
   *  justified within the tracking cap; a line set left, right or centred
   *  gives it up too and stands one character short. On manuscript paper
   *  (`cjk.grid.fullLines`, #718) only a justified line gives it up: the
   *  others keep every cell and the paragraph may end on one character.
   *  Default true. */
  avoidRunts?: boolean;
  /** Approximate minimum character count for the last line of a paragraph.
   *  Interpreted internally as `runtMinCharacters * normalSpaceWidth` pixels, so
   *  the real test is "is the last line visually shorter than N characters'
   *  worth of space-width content". Default 20. */
  runtMinCharacters?: number;
  /** Equivalent-badness added to the last line when it is shorter than the
   *  runt threshold. Feeds into the Knuth–Plass squared demerit on the same
   *  scale as line `badness` (which saturates at 10000). Default 1000 —
   *  dominates alternatives up to roughly r≈2.15 word-spacing stretch. */
  runtPenalty?: number;
  /** Scale the runt penalty by how short the last line falls: a last line
   *  of width `w` under the threshold `t` costs `runtPenalty × (1 − w / t)`
   *  instead of the whole `runtPenalty`, so a two-word ending costs less
   *  than a one-word one and the breaker takes it when a line above can
   *  give a word up. Off by default (every runt costs the same). */
  gradedRuntPenalty?: boolean;
  /** When true, list items also receive the runt penalty (not just paragraphs).
   *  Only effective when `avoidRunts` is true. Default true. */
  avoidRuntsInLists?: boolean;
  /** When the penalty above could not keep a paragraph from ending in a
   *  runt, set the paragraph one line shorter instead — the compositor's
   *  fix: the spaces of every line tighten (never past `minWordSpacing`)
   *  and, when that alone does not carry the line, a little negative
   *  tracking joins in, up to `maxRuntTracking`. A shorter setting is no
   *  fix, and the runt stays, when it would stretch a justified line past
   *  `maxWordSpacing` or, when the paragraph already has a looser
   *  justified line, past that line; or when it would set more lines
   *  ragged (past 3× the normal space) than the paragraph had. The word
   *  spaces of ragged text keep their width, so there only the tracking
   *  takes part. Needs `optimalLineBreaking` and `avoidRunts` (and
   *  `optimalRagged` for ragged text). Default true. */
  tightenRunts?: boolean;
  /** Most tracking a runt fix may take, in thousandths of an em (the
   *  InDesign unit: 10 = 0.01 em per character), applied as a tightening.
   *  0 leaves the fix to word spacing alone. Default 10. */
  maxRuntTracking?: number;
  /** When true, a paragraph ending with a colon that directly introduces a
   *  list is kept joined to the list: if placing the paragraph would leave no
   *  room for the first list item in the same column/page, the colon-bearing
   *  last line is moved to the next column together with the list (or the
   *  whole paragraph, if it is a single line). How much room counts as
   *  enough is `colonListRoom`. Default true. */
  keepColonWithList?: boolean;
  /** The room `keepColonWithList` asks for under the colon line:
   *  - `'item'` (default): what the orphan and widow rules for lists would
   *    leave of the first item there, a line when it may split, all of it
   *    when they keep it whole (a two-line item, say);
   *  - `'line'`: one line, as up to postext 1.4. A first item those rules
   *    keep whole then goes on to the next column alone and leaves the
   *    colon line at the foot. Configurations stored before
   *    `configVersion` 6 read with it (see `pinLegacyColonListRoom` in
   *    `postext/bundle`). */
  colonListRoom?: ColonListRoom;
  /** Let a column or a page end on a hyphenated word (InDesign's "Hyphenate
   *  Across Column"). Default `true`. `false` re-breaks a paragraph whose
   *  last line in a column would end on a hyphen, so that line ends on a
   *  whole word instead — the word spaces of the lines above take the
   *  difference, within `maxWordSpacing` and `minWordSpacing`; when no
   *  break inside those limits avoids it, the hyphen stays. It covers the
   *  first column break of a paragraph and the later ones that fall where
   *  a full column ends; a later one that falls elsewhere (a widow kept, a
   *  band cut level) gets a second re-break from its column, which keeps
   *  the lines already placed at their breaks and breaks only the rest.
   *  A ragged paragraph set with `optimalRagged` is broken again the same
   *  way; its word spaces keep their width, so only its line ends move.
   *  Needs `optimalLineBreaking` (and `optimalRagged` for ragged text).
   *  Running text only (not box bodies).
   *
   *  `'withinPage'` (#701) guards the lines that close a page and no
   *  other: a word may be divided between two columns of one page, and the
   *  last line of a page ends on a whole word wherever the word-spacing
   *  limits allow it. A column closes its page when the text that leaves it
   *  goes on to another page (no later column of the page takes text: a
   *  float-only side column does not, nor does a column the floats have
   *  filled). It moves fewer lines than
   *  `false`; in a single-column layout the two give the same lines. */
  hyphenateAcrossColumns?: boolean | 'withinPage';
  /** The space under a `:::paragraphs` container that closes on a
   *  paragraph, between that paragraph and the block after it:
   *  - `'collapse'` (default): the larger of the style's `spaceBetween` and
   *    `marginBottom` and the paragraph spacing of the text around the
   *    container (a line with `paragraphSpacing`, in a box its body's),
   *    merged with the space the next block keeps above itself (a
   *    heading's `marginTop`, a list's), as between two paragraphs of
   *    running text. The flow still snaps back to the baseline grid under
   *    the container, the space being a minimum;
   *  - `'add'`: as up to postext 1.4, the style's space alone is set under
   *    the last line before the grid snap, the next block's own space above
   *    is added under it, and the paragraph spacing is left out.
   *    Configurations stored before `configVersion` 8 read with it (see
   *    `pinLegacyParagraphContainerSpacing` in `postext/bundle`).
   *  A negative `marginBottom` pulls the next block up either way. A
   *  container that closes on a list is set as in 1.4 under both rules: the
   *  list keeps its own space in its snap, and `marginBottom` follows. */
  paragraphContainerSpacing?: ParagraphContainerSpacing;
  /** What the fields a paragraph style leaves unset (face, size, leading,
   *  weights, colour) inherit inside a box (#1119):
   *  - `'box'` (default): the box's body, so one style that sets only
   *    `textAlign` serves a serif box and a sans one alike;
   *  - `'document'`: the document's body text, as up to postext 1.51.
   *    Configurations stored before `configVersion` 17 read with it (see
   *    `pinLegacyBoxParagraphStyles` in `postext/bundle`). */
  paragraphStylesInBoxes?: ParagraphStylesInBoxes;
  /** How Markdown emphasis (`*…*`) is set (see {@link EmphasisStyle}).
   *  `'auto'` (the default): `'bold'` in a document whose language is
   *  written in Arabic script (`ar`, `fa`, `ur`…), whose type has no
   *  italics, and `'italic'` in any other. Whatever is chosen, the engine
   *  never slants Arabic letters: an italic run sets its Arabic words
   *  upright (#376). */
  emphasis?: 'auto' | EmphasisStyle;
  /** Arabic vowel marks (tashkīl) in the text (see {@link TashkilMode}).
   *  Default `'keep'`. */
  tashkil?: TashkilMode;
}
