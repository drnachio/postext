// CONFIG_VERSION and the rules number each change came with: a stored
// configuration older than a change's number gets that change's pin
// (#1276: split out of configVersion.ts).


/**
 * The configuration rules this engine writes: 19 since #1164 (18 from #1149, 17 from #1119, 16 from #1056, 15 from #853, 14 from
 * postext 1.30, 13 from 1.29, 12 from 1.28, 11 from 1.25, 10 from 1.24, 9 from 1.23, 8 from 1.5). Thirteen rules changed in 1.5 and
 * more since, and a configuration
 * stored under an older
 * number (or none) is read through {@link migrateConfig}:
 * - 3: a heading level's `breakBefore` (and a heading style's) merges field
 *   by field onto the level's default — H1's being `always-odd`
 *   ({@link pinLegacyHeadingBreaks});
 * - 4: one em of a formula is the surrounding text's size ×
 *   `math.fontSizeScale`, where up to 1.4 formulas came out
 *   {@link LEGACY_MATH_SIZE}× larger ({@link pinLegacyMathSize});
 * - 5: an inline resource keeps the float gap below it as well as above
 *   (`layout.inlineResourceGap: 'around'`), where up to 1.4 the text after
 *   it resumed at the next grid line ({@link pinLegacyInlineGap});
 * - 6, five rules:
 *   - a heading reads its inline marks (`headings.inlineMarks: true`),
 *     where up to 1.4 it printed them as plain text ({@link
 *     pinLegacyHeadingMarks});
 *   - a design text's drop cap that names no size is set at the size that
 *     brings its top level with the first line's capitals, where up to 1.4
 *     it was as tall as all the line boxes it spans ({@link
 *     pinLegacyDropCapSize});
 *   - `bodyText.keepColonWithList` leaves room under the colon line for
 *     the list's first item to start by its orphan and widow rules
 *     (`bodyText.colonListRoom: 'item'`), where up to 1.4 one line was
 *     enough ({@link pinLegacyColonListRoom});
 *   - an inline resource inside a box keeps the float gap too
 *     (`layout.inlineResourceGapInBoxes`), where up to 1.4 it sat right
 *     against the text around it ({@link pinLegacyBoxResourceGap});
 *   - a box that splits inside a paragraph or list item leaves at least two
 *     lines of it on each side (`layout.boxChildSplitMinLines: 2`), where
 *     up to 1.4 a cut could leave one ({@link pinLegacyBoxChildCut});
 * - 7, two rules:
 *   - a line may end after an em or en dash set closed between words
 *     (`bodyText.breakAfterDashes`), where up to 1.4 Knuth–Plass never
 *     broke there ({@link pinLegacyDashBreaks});
 *   - ragged running text is broken with Knuth–Plass too
 *     (`bodyText.optimalRagged`), where up to 1.4 it was set line by line
 *     ({@link pinLegacyRaggedBreaking});
 * - 8, three rules:
 *   - a paragraph kept with the heading above it at a column's foot
 *     splits by the orphan rule too (`headings.keepWithNextSplit:
 *     'rules'`), where up to 1.4 it kept as many lines as fit under the
 *     heading ({@link pinLegacyHeadingSplit});
 *   - the space under a `:::paragraphs` container merges with the next
 *     block's own and is at least the paragraph spacing of the text around
 *     it (`bodyText.paragraphContainerSpacing: 'collapse'`), where up to
 *     1.4 the style's space was baked into the grid snap and the next
 *     block's space above added under it ({@link
 *     pinLegacyParagraphContainerSpacing});
 *   - Knuth–Plass may end a line after the hyphen of a compound in every
 *     paragraph (`bodyText.breakAfterHyphens`), where up to 1.4 a justified
 *     paragraph with no inline formatting never broke there ({@link
 *     pinLegacyHyphenBreaks}).
 * - 9 (#620, #624), four rules:
 *   - a `:::verse` poem whose fence names no layout and whose lines carry
 *     no hemistich separator is set line by line (`bodyText.verse.layout:
 *     'auto'`), where up to 1.22 its lines were single hemistichs centred
 *     in the measure ({@link pinLegacyVerseLayout});
 *   - a paragraph style that sets `firstLineIndent` itself and a non-zero
 *     `hangingIndent` indents its first line by the one and its turnovers
 *     by the other, where up to 1.22 the hanging indent replaced the
 *     first-line indent ({@link pinLegacyPairedIndents});
 *   - a backslash that ends a line of a paragraph, a quotation or a list
 *     item, and `\\` in one, is a forced line break
 *     (`bodyText.hardLineBreaks`), where up to 1.22 it printed ({@link
 *     pinLegacyHardBreaks});
 *   - a ```` ``` ```` or `~~~` fence opens a code block (#624,
 *     `codeStyle.blocks`), where up to 1.22 its lines were read as
 *     Markdown ({@link pinLegacyCodeBlocks}).
 * - 10, two rules:
 *   - a line of a poem set line by line that is a little wider than the
 *     measure tightens its word spaces, down to `bodyText.minWordSpacing`,
 *     and stays on one line (`bodyText.verse.tighten`, #620 follow-up),
 *     where 1.23 turned it over ({@link pinLegacyVerseTightening});
 *   - a text element of a heading design or a part page that sets no
 *     `overflow` wraps onto more lines (#628), where up to 1.23 it was cut
 *     with an ellipsis ({@link pinLegacyDesignOverflow}).
 * - 11, seven rules:
 *   - a horizontal page on a character grid (`cjk.grid.enabled`) is not
 *     balanced unless `headings.balancing.enabled` says so (#632), where
 *     up to 1.24 it was ({@link pinLegacyGridBalancing});
 *   - a table placed `here` follows its style's `overflow`
 *     (`tableStyle.splitInline`, #634): one that does not fit the room
 *     left in its column is cut between rows, where up to 1.24 it moved
 *     whole to the next column ({@link pinLegacyInlineTableSplit});
 *   - a `:::columns` fence outside a box sets its blocks in sub-columns,
 *     and a box that splits may cut inside a group (`layout.flowColumns`,
 *     #634), where up to 1.24 such a fence was ignored and a box never cut
 *     inside a group ({@link pinLegacyFlowColumns});
 *   - a line breaks inside a book title only where two of its characters
 *     stand on either side (`cjk.titleMinChars: 2`, #637), where up to
 *     1.24 it could leave one ({@link pinLegacyTitleBreaks});
 *   - the circled numbers ①–⑳ and their kin are Chinese characters in CJK
 *     text (`cjk.circledNumbers: 'cjk'`, #637), where up to 1.24 they were
 *     Western letters ({@link pinLegacyCircledNumbers});
 *   - a design text in Chinese or Japanese takes the body's CJK rules
 *     (`cjk.composeDesignText`, #637), where up to 1.24 it was wrapped at
 *     spaces with every mark at its own advance ({@link
 *     pinLegacyDesignText});
 *   - under a page-span opener set over several text columns, the head of
 *     the opener's own column is a slot for a top float
 *     (`layout.floatsUnderOpener`, #639), where up to 1.24 such a float
 *     landed from the second column on ({@link pinLegacyOpenerHeadFloats}).
 * - 12 (#747), the rules of postext 1.28, each listed with its pin below.
 *   - column balancing tries the list ends, the displays, the float bands
 *     and the loose paragraphs before a heading takes a third line
 *     (`headings.balancing.maxLinesBeforeLoose: 2`, #707), where up to 1.27
 *     a heading took all its lines first ({@link pinLegacyLooseOrder});
 *   - under a float that stands over several text columns, column
 *     balancing lowers a column only with the others under it or to end it
 *     flush (`headings.balancing.stretchAfterWideFloats: 'flush'`, #708),
 *     where up to 1.27 a column took its after-float line as under any
 *     float ({@link pinLegacyWideFloatStretch});
 *   - the level cut of a closing band counts lines of the band's own text
 *     when it is off the baseline grid (`headings.balancing.trailingStep:
 *     'lines'`, #711), where up to 1.27 every cut stood on a grid line
 *     ({@link pinLegacyTrailingStep});
 *   - a group of an index divided between two columns keeps two entries
 *     on each side (`index.groups.splitMinEntries: 2`, #712), where up to
 *     1.27 a column could end between any two entries ({@link
 *     pinLegacyIndexGroupSplit});
 *   - a page on a character grid (`cjk.grid.enabled`) holds its lines:
 *     `bodyText.avoidWidows` is off by default there, and
 *     `bodyText.avoidOrphans` too in the Japan region (#717), where up to
 *     1.27 both were on ({@link pinLegacyGridBreakRules});
 *   - a line breaks inside a two-row note only where two of its characters
 *     stand on either side (`cjk.warichu.minChars: 2`, #720), where up to
 *     1.27 it could leave one ({@link pinLegacyNoteBreaks});
 *   - in the Japan region a Western word takes the Han–Latin space on a
 *     side that ends in a bracket or a sign (`cjk.latinSpacingEdge:
 *     'western'`, #721), where up to 1.27 only a side that ends in a
 *     letter or a digit did ({@link pinLegacyLatinSpacingEdge});
 *   - a resource set in the text takes `placement.captionSide` as a column
 *     float does (`layout.inlineCaptionSide`, #729), where up to 1.27 its
 *     caption stayed under it ({@link pinLegacyInlineCaptionSide});
 *   - a reference whose label is words (an anchor's text, a title, a
 *     `text="…"` override) breaks at the spaces of its label
 *     (`crossRefs.breakLabels`, #702), where up to 1.27 every label was
 *     one unbreakable word ({@link pinLegacyRefLabelBreaks});
 *   - a comic balloon reshaped to fit its panel does not part a Chinese
 *     word to do so (`comics.lettering.strictPlacement`, #728), where up
 *     to 1.27 a narrow shape that cut one could win over a balloon read
 *     out of order ({@link pinLegacyBalloonPlacement});
 *   - a word with no letter (`46.`, `1367)`) is shaped in the script of
 *     the text around it, in a face that draws its punctuation by script
 *     (`bodyText.scriptContext`, #725), where up to 1.27 it was shaped
 *     alone, in the script each browser and the PDF picked ({@link
 *     pinLegacyScriptContext});
 * - 13 (#764), the rules of postext 1.29:
 *   - the language the text is shaped in is a setting
 *     (`bodyText.shapingLanguage`, #764): the host's, as up to 1.28, or
 *     the document's own on every host; an older configuration has the
 *     host's written out ({@link pinLegacyShapingLanguage});
 *   - the box of a task item is drawn by the engine and takes a room of
 *     its own (`unorderedLists.taskBox`, #765), where up to 1.28 it was the
 *     character ☐ or ☑ in the list's face, as wide as the font the system
 *     gave for it ({@link pinLegacyTaskBox});
 * - 14 (#770), the rule of postext 1.30:
 *   - the text is shaped in the document's own language unless the
 *     configuration says otherwise (`bodyText.shapingLanguage:
 *     'document'`, the default), where 1.29.1 and 1.29.2 shaped it in the
 *     host's, as up to 1.28, and 1.29.0 in the document's with a canvas
 *     and a PDF that did not follow the measure; a configuration stored
 *     under 13 or an older number that does not name the setting has the
 *     host's written out ({@link pinLegacyShapingLanguage}). The measure
 *     rules that came with it apply only to a document shaped in its own
 *     language, so the same pin keeps them off a stored one: one width
 *     for a string whatever was measured before it, a right-to-left word
 *     measured right to left, the two parts of a word broken at a line end
 *     and the runs of a design text measured as they are painted, and in
 *     the PDF the shaping word by word and each character from the file
 *     the browser took it from.
 * - 15 (#853), composed pages: the configuration may hold page templates
 *   (`pageTemplates`) and label styles (`labelStyles`), which an engine
 *   that reads 14 or less ignores. Nothing an older configuration says
 *   changes meaning, so one stored under 14 is read as it is (no pin): the
 *   number marks a configuration that may hold templates, so an older
 *   reader can say it lays out without them.
 * - 16 (#1056), composed pages round 2: a template's decoration may hold
 *   connectors (`kind: 'connector'`), the first decoration element that is
 *   not placed by an anchor. An engine that reads 15 or less leaves them
 *   out (`unknownConfigValue`). Nothing older changes meaning: one stored
 *   under 15 is read as it is (no pin).
 * - 17 (#1119), the rule of postext 1.52: a paragraph style's unset type
 *   fields (face, size, leading, weights, colour) take the box's body
 *   inside a box (`bodyText.paragraphStylesInBoxes: 'box'`), where up to
 *   1.51 they took the document's body text ({@link
 *   pinLegacyBoxParagraphStyles}).
 * - 18 (#1149): a highlight style that names no `borderRadius` has square
 *   ends (`markStyles[].borderRadius` defaults to 0, the print norm),
 *   where up to 1.51 its band's ends were rounded at 0.2 em ({@link
 *   pinLegacyMarkRadius}).
 * - 19 (#1164): a line of formatted text (captions, cells, notes and
 *   bibliographies too) may end after a slash between two words
 *   (`bodyText.breakAfterSlashes`), and a word wider than its line is
 *   divided after a slash first, where up to 1.51 the rich breaker broke
 *   after a slash only inside a web address ({@link pinLegacySlashBreaks}).
 * - 20 (#1172): a fence in a notation language (```` ```abc ````) is a
 *   music score ({@link pinLegacyScoreFences}).
 * - 21 (#1209): a bundle's `localized[…].config` is an override merged
 *   over the shared `config` field by field ({@link mergeConfigLayers}),
 *   where up to 1.57 each of its top-level keys replaced the shared one
 *   whole. Nothing to pin: a bundle stamped 20 or less is read the old
 *   way.
 *
 * A configuration stored without a version was written for postext 1.4 or
 * earlier. One stored under 3 to 7 was written by a 1.5 prerelease, and
 * gets the pins of the rules after its number: under 3 the maths,
 * inline-gap, version-6, version-7 and version-8 pins, under 4 the
 * inline-gap, version-6, version-7 and version-8 pins, under 5 the
 * version-6, version-7 and version-8 pins, under 6 the version-7 and
 * version-8 pins, under 7 the version-8 pins. One stored under 8 was
 * written by postext 1.5 to 1.22 and gets the version-9 pins (which every
 * older one gets too); one stored under 9 was written by postext 1.23 and
 * gets the version-10 pins (which every older one gets too); one stored
 * under 10 was written by postext 1.24 and gets the version-11 pins (which
 * every older one gets too); one stored under 11 was written by postext
 * 1.25 to 1.27 and gets the version-12 pins (which every older one gets
 * too); one stored under 12 was written by postext 1.28 and gets the
 * version-13 pins (which every older one gets too); one stored under 13
 * was written by postext 1.29 and gets the version-14 pin (which every
 * older one gets too); one stored under 14 was written by postext 1.30 to
 * 1.33 and gets nothing; one stored under 15 was written by postext 1.34 to
 * 1.47 and gets nothing either; one stored under 16 was written by postext
 * 1.48 to 1.51 and gets the version-17, version-18 and version-19 pins
 * (which every older one gets too); one stored as 17 was written by a
 * development build and gets the version-18 and version-19 pins; one stored
 * as 18 was written by postext 1.52 and gets the version-19 pin; one stored
 * as 19 was written by postext 1.53 and gets the version-20 pin (which every
 * older one gets too); one stored as 20 or less has its locale layer read
 * key by key.
 */
export const CONFIG_VERSION = 21;

/** The rules that merge a partial heading break onto its level's. */
export const HEADING_BREAK_RULES = 3;
/** The rules that set a formula's em at the documented size. */
export const MATH_SIZE_RULES = 4;
/** The rules that keep the float gap under an inline resource. */
export const INLINE_GAP_RULES = 5;
/** The rules that read a heading's inline marks, and size a drop cap to
 *  the first line's capitals. */
export const HEADING_MARKS_RULES = 6;
export const DROP_CAP_SIZE_RULES = 6;
/** The rules that leave room for a list's first item under its colon line. */
export const COLON_LIST_ROOM_RULES = 6;
/** The rules that keep the gap around an inline resource inside a box. */
export const BOX_GAP_RULES = 6;
/** The rules that keep two lines of a paragraph or list item on each side
 *  of a box cut. */
export const BOX_CHILD_CUT_RULES = 6;
/** The rules that let a line end after a closed dash. */
export const DASH_BREAK_RULES = 7;
/** The rules that break ragged running text with Knuth–Plass. */
export const RAGGED_BREAKING_RULES = 7;
/** The rules that keep the orphan minimum when a paragraph splits under a
 *  heading. */
export const HEADING_SPLIT_RULES = 8;
/** The rules that merge the space under a `:::paragraphs` container with
 *  the next block's. */
export const PARAGRAPH_CONTAINER_RULES = 8;
/** The rules that let Knuth–Plass break after a compound's hyphen in every
 *  paragraph. */
export const HYPHEN_BREAK_RULES = 8;
/** The rules that set a poem with no hemistich separator line by line. */
export const VERSE_LAYOUT_RULES = 9;
/** The rules that pair a paragraph style's own first-line indent with its
 *  hanging one. */
export const PAIRED_INDENT_RULES = 9;
/** The rules that read a backslash ending a line, or `\\`, as a forced line
 *  break. */
export const HARD_BREAK_RULES = 9;
/** The rules that read a code fence as a code block. */
export const CODE_BLOCK_RULES = 9;
/** The rules that tighten a line of verse a little too wide for the
 *  measure instead of turning it over. */
export const VERSE_TIGHTEN_RULES = 10;
/** The rules that wrap a heading or part design text that sets no
 *  `overflow`. */
export const DESIGN_OVERFLOW_RULES = 10;
/** The rules that leave a horizontal page on a character grid unbalanced
 *  by default. */
export const GRID_BALANCING_RULES = 11;
/** The rules that keep two characters of a book title on either side of a
 *  line break, set circled numbers as Chinese characters and compose CJK
 *  design text (#637). */
export const TITLE_BREAK_RULES = 11;
export const CIRCLED_NUMBER_RULES = 11;
export const DESIGN_TEXT_RULES = 11;
/** The rules that cut an inline table between rows. */
export const INLINE_TABLE_SPLIT_RULES = 11;
/** The rules that set `:::columns` in the running text and cut groups. */
export const FLOW_COLUMNS_RULES = 11;
/** The rules that offer a float the head of a page-span opener's own
 *  column. */
export const OPENER_HEAD_FLOAT_RULES = 11;

/** The rules that try the other balancing levers before a heading takes a
 *  third line (#707). */
export const LOOSE_ORDER_RULES = 12;
/** The rules that keep the heads level under a float over several columns
 *  (#708). */
export const WIDE_FLOAT_STRETCH_RULES = 12;
/** The rules that cut a closing band in lines of its own text (#711). */
export const TRAILING_STEP_RULES = 12;
/** The rules that keep two entries of an index group on each side of a
 *  column break (#712). */
export const INDEX_GROUP_SPLIT_RULES = 12;

/** The rules that turn the widow rule off on a character grid, and the
 *  orphan rule too in the Japan region (#717). */
export const GRID_BREAK_RULES = 12;
/** The rules that keep two characters of a two-row note on either side of
 *  a line break (#720). */
export const NOTE_BREAK_RULES = 12;
/** The rules that set the Han–Latin space next to the brackets and signs
 *  of a Western word in the Japan region (#721). */
export const LATIN_SPACING_EDGE_RULES = 12;
/** The rules that set the side caption of a resource set in the text (#729). */
export const INLINE_CAPTION_SIDE_RULES = 12;
/** The rules that break a reference's label of words at its spaces
 *  (#702). */
export const REF_LABEL_BREAK_RULES = 12;
/** The rules that keep a reshaped comic balloon from parting a Chinese
 *  word (#728). */
export const BALLOON_PLACEMENT_RULES = 12;
/** The rules that shape a word with no letter in the script of its
 *  context (#725). */
export const SCRIPT_CONTEXT_RULES = 12;
/** The rules that shape the text in the document's own language on every
 *  host unless the configuration names the host's (#770). The setting
 *  came with the rules of 13 (#764), whose default was the host's from
 *  postext 1.29.1 on: a configuration stored under 13 that does not name
 *  it gets the pin as an older one does. */
export const SHAPING_LANGUAGE_RULES = 14;
/** The rules that draw the box of a task item (#765). */
export const TASK_BOX_RULES = 13;
/** The rules that read page templates and label styles (#853). They add
 *  keys and change no older one, so they pin nothing: kept to say where
 *  the number came from. */
export const COMPOSED_PAGES_RULES = 15;
/** The rules that draw connectors in a template's decoration (#1056): new
 *  keys only, nothing to pin. */
export const CONNECTOR_RULES = 16;
/** The rules that set a paragraph style's unset type fields in a box's
 *  body (#1119). */
export const BOX_PARAGRAPH_STYLE_RULES = 17;
/** The rules that give a highlight style square ends by default (#1149). */
export const MARK_RADIUS_RULES = 18;
/** The rules that let formatted text break after a slash between two
 *  words (#1164). */
export const SLASH_BREAK_RULES = 19;
/** The rules that read a fence in a notation language (```` ```abc ````) as
 *  a music score (#1172). */
export const SCORE_FENCE_RULES = 20;
/** The rules that merge a bundle's locale configuration over the shared one
 *  field by field (#1209). */
export const LOCALE_LAYER_RULES = 21;
