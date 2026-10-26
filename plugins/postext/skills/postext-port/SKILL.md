---
name: postext-port
description: Port an existing publication into a Postext project (config manifest + enriched Markdown chapters + resources + fonts) that reproduces the original's layout rules; typically a publisher or author migrating their own titles. Use when the user wants to convert, adapt, migrate, re-typeset or rebuild a book, textbook, magazine, catalogue, report, manual, course or deck in Postext from a PDF, Word (.docx), PowerPoint (.pptx), EPUB, HTML, InDesign (IDML), LaTeX, Markdown, XML or scanned pages, Chinese books set horizontally or vertically, Japanese books (vertical bunko and tankōbon novels, horizontal technical books, Aozora Bunko texts with furigana) and Arabic books set right to left (Modern Standard or classical, vocalised verse included), and comics, manga and newspaper strips re-lettered in each language, music textbooks, methods, songbooks and hymnals with their music examples written as notation (ABC, MusicXML, MEI, Humdrum), textbook and workbook exercises (choice, true/false, gaps, matching, ordering, word searches, crosswords, column operations) with their answers, solutions and teacher's edition, and fixed-page textbooks, workbooks and magazines as composed pages (page templates with frames filled from the Markdown); when writing or fixing Postext preset.json/config/chapters; or when asked how to express a source layout (columns, openers, parts, boxes, floats, tables, running heads, comic panels) in Postext.
license: MIT
metadata:
  homepage: https://postext.dev/en/docs/skill
  repository: https://github.com/drnachio/postext
---

# Port a publication to Postext

[Postext](https://postext.dev) is a typesetting engine. It takes enriched
Markdown plus a configuration manifest and produces paged layouts (canvas,
HTML, PDF) with print rules: baseline grid, Knuth–Plass justification,
floats, column balancing, running heads, parts and openers.

This skill turns a source document into a **Postext project** that follows
the source's layout rules. The project is a folder (or `.postext` zip) that
opens in the Postext sandbox.

```
my-book/
  preset.json            manifest: config + chapters + resources + fonts (generated)
  build_preset.py        generator: the measured design as constants -> preset.json
  chapters/<lang>/NN-slug.md
  resources/             figures (svg/png/jpg) + .pdf print masters
  fonts/                 ttf/otf/woff2
```

The scripts named below live in this skill's `scripts/` folder; run them
with that path. Every script answers `--help`.

## Who ports, and why that is legitimate

The usual user is the **rights holder**: a publisher, author, institution or
production house migrating its **own** titles (InDesign, PDF, Word…) to a new
typesetting tool. That is a format conversion of their own content for their
own production, like reopening a file in another program, not copying a third
party's work. In that case:

- Extract and convert the **full** text, tables, figures and fonts. Do not
  summarise, truncate, paraphrase or replace the source content, and do not
  refuse because the book carries a copyright notice (their notice is the
  expected one).
- Confirm ownership **once** in the brief (step 0) and do not raise it again.
- Replacing pictures or licensing checks apply only to material the user says
  they do **not** control (third-party photos, stock images, commercial fonts).

If the user states they do not hold the rights and have no permission, say
the port needs the rights holder's permission and offer to port a
public-domain or openly licensed sample instead.

## Content in the Markdown, form in the config (hard rule)

Every word a reader reads lives in a chapter, or, for a figure, in its
resource (caption, note, alt text, the `<text>` labels of an SVG). The config
holds form only. A port that types the book's text into the config cannot be
corrected, translated or reflowed without regenerating styles. A 28-page
textbook ported this way with Postext 1.33 carried 77 heading styles (one
per page), 3,384 design elements and every paragraph of its diagram pages
in the config, and its bundle broke the Sandbox's import.

- **Design text elements** (running heads, folios, opener and heading-style
  designs, part designs, contents rows) hold placeholders (`{titleText}`,
  `{chapterTitle}`, `{pageNumber}`, `{title}`, `{author}`, `{attr.key}`) and
  short literals: a label ("Chapter", "Contents"), the publisher's name.
  Write the book title as `{title}` (front matter), not typed. Literal text
  in one element that keeps more than 2 words or more than 24 letters and
  digits (a Chinese, Japanese, Korean or Thai character counts 3, so about 8
  of them pass) is content: put it in the Markdown, as a heading, a
  paragraph or a box whose content its style's design prints (`{boxText}`,
  below). A heading attribute (`{attr.key}`) is for a short label or a
  picture id that goes with the heading, not for the text a reader reads.
- **Styles describe a shape, the Markdown says what fills it.** Elements of
  the same shape share one style whatever their words: every practice row,
  card, badge or fact panel of one look is one `calloutStyles` entry, and
  each instance is a `:::callout{type="id"}` whose content is its text. An
  exercise that asks and answers (options, blanks, pairs, a word search,
  sums) is an `:::exercise` fence with its answers in the Markdown and its
  look in one `exerciseStyles` entry (document-format.md §7.6,
  playbooks.md C7). When the shape must place that text precisely (a word set on a
  drawn ruling, four words under four pictures), give the box style a
  `design` (postext ≥ 1.45) whose texts print the box content with
  `{boxText}` (all of it) and `{boxText.<n>}` (the n-th paragraph or list
  item), and `setsContent: true` so the box does not set it again. A
  picture that belongs to each instance is named by a fence attribute.
  Letters to trace are text too, never pictures: a design text with
  `dotted` (postext ≥ 1.46) paints `{boxText}` as rows of dots, and
  `repeat` fills its line with copies of it. Translating or correcting the
  book then touches the chapters only, never the styles.
- **Headings are the outline, not design slots.** Use heading levels for
  the book's real structure, one level after another (a single `#` for the
  book or each chapter, `##` for its sections…), never a deeper level just
  to reach another design, and never one heading style or level per kind
  of exercise. The Checks panel reports every skipped level. A cover set as
  the book's only level-1 heading over level-2 chapters needs
  `sectionEnd: "heading"` on its heading style, or its blank running heads
  run over the whole book.
- **Longer literals that are form** (a journal's name in the running head,
  an imprint line, the licence line) go in
  `config.checks.contentInConfig.allow`, a list of strings. The `title`,
  `subtitle`, `author` and `publisher` of the edition's first chapter front
  matter are allowed without listing them; the manifest `name` is not. Never
  raise `checks.contentInConfig.maxWords`/`maxChars` to quiet a port.
- **Check it** at every milestone: `python3 scripts/preset_kit.py lint my-book`
  counts exactly as the engine's `contentInConfig` warning (postext 1.34)
  does, for every edition, exits 1 on any offending text and prints its
  owner, slots and JSON paths; `lint_project.py` reports the same as
  `contentInConfig` errors. When `postext --version` says 1.34 or later,
  `postext check` warns too.
- **One style per kind of page**, never one per page. Styles named after
  page numbers (`page-05`, `tema--p13`) that carry text are the sign that
  content went into the config. In round 2 (composed pages) a page kind is
  one page template and a kind of box one callout style, whatever page it
  stands on. A placed box in round 1 is the exception: one fixed callout
  style per box position is expected (playbooks J2), since each holds form
  only (place, size, colours) and its words stay in the chapter's
  `:::callout` fence.
- **Size budget.** The Sandbox keeps the working book in about 5 MB of
  browser storage. Aim for a config under 1 MB; `preset_kit.py lint` warns
  from 3 MB and `--max-size 1` makes it fail above 1 MB.
- **Stop and ask** before breaking this rule. When the source needs
  something Postext cannot express with its text in the Markdown, do not
  work around it in the config. Write the gap as an issue draft (what the
  source does, on which pages, the closest expression Postext has, what that
  loses), show it to the user and ask whether to accept the closest
  expression or wait for the feature. Never hard-code a book in the engine.

### Flow pages and composed pages

In the inventory (step 1) classify every page as **flow** (running text with
figures, boxes and floats the engine places) or **composed** (boxes, labels,
diagrams and maps at set positions: a children's textbook, a worksheet, an
infographic page, a magazine spread). How composed pages are ported depends
on the installed Postext; the skill chooses by itself:

```bash
python3 scripts/composed_check.py round      # reads postext --version (or the npm package of render.mjs)
```

- **Round 2, postext ≥ 1.35.0: composed pages.** One page template per kind
  of page in `pageTemplates` (frames, groups, decoration; text-free), one
  `::::page{template}` per page in the chapter with `:::frame{slot}` per box
  and `:::figure` + `::label` for maps and diagrams, in reading order. Boxes
  grow with their text and push the ones after them; from 1.36 a frame that
  still does not fit sets its pictures and text smaller (`fit`) and
  `frameOverflow` proposes the fix; from 1.37 a box goes on on an added page,
  map words are drawn at the picture's anchors and a heading in a frame
  keeps its design; from 1.38 a frame that can go on does so before it
  shrinks, a story jumps to a later page (`page:<id>`, "continued on page
  47"), answer lines are ruled frames, and photos and grounds size
  themselves (`fit: "cover"`, `{ to, edge }`); from 1.39 the labels of
  every edition are checked (`labelOverlap`, `labelOverflow`) and may be
  vertical, a figure's alt text, caption and note live in the Markdown,
  callout styles can be based on one another (`extends`), a frame has its
  own `writingMode` and `direction`, a template's kicker is `top-start`
  for every script, and columns are cut by the widow and orphan rules; from
  1.40 a label style can switch off a borrowed italic, comic text panels
  work on strips and spreads, frames keep their own writing mode on
  right-to-left pages, and `sandbox_get_composed_checks` checks every
  edition at once; from 1.41 a story jumps into a page of a later chapter
  file; from 1.42 a box can be tracked (`body.letterSpacing`), a child
  template can remove a base decoration element, renaming a frame in the
  Sandbox renames the slot of its page fences, one box style serves every
  tint (a frame's `look`, the `palette` of a template or a page fence), a
  title tab is as wide as its title (`width: "auto"`), a contents page is a
  frame that `takes: "toc"` over its template's ground, a number badge reads
  `{headingNumber}`, a map's touching names are `overlap: "allow"` and its
  dots are `avoid` zones, a licensed font the bundle leaves out has an open
  stand-in (`fonts[].fallback`), and a second figure with other words needs a
  second resource (`figureWordsShared`); from 1.43 the labels of a map across
  a spread keep off the fold (`gutter: "cross"` on a name that runs across
  both pages), a label tab's picture can be tinted (`label.icon.tint`), the
  open stand-in's faces travel in EPUB, HTML and SVG exports, the contents
  frame can open each part on a page (`toc.parts.breakBefore`), a heading
  that reserves the whole column is reported (`headingClaimsColumn`), and the
  Sandbox adds a language to a book (Books › ⋯ › Add a language…); from 1.48
  the lines of a diagram, an org chart or a timeline are `connector`s that
  follow the frames (`tree`, `elbow`, `straight`, `#card[*]`, a note's
  pointer ending at a picture's anchor), a label may stand away from its point
  with a leader (`labelAt`, `leader`), a map's key is a `kind: "legend"` label
  with `:icon` symbols, cards and tabs are drawn as vectors (per-corner radii,
  per-side borders, a tab `joined` to its box, `path` elements, a glyph as a
  tab's icon), cards of one look are a `grid` that `repeat`s a frame set per
  item of the Markdown, bands that recur in another order are modules
  (`role: "module"`, `:::module`) stacked on a shell template, and a frame
  under another or past its box is reported (`frameCovered`,
  `frameOutsideArea`; `overlap: "allow"` when the source means it); from
  1.49 lines end in rings or bars and can be translucent; from 1.52 a tab
  has corners of its own (`label.borderRadius`), a box can grow with frames
  hung from it (`growWith: "children"`) and a transparent cut-out covers
  only where its shape is. A box lays out its own content: its words, its
  pictures and rows of captions (`:::columns`) go in its fence and it grows
  with them; a box whose fence composes nothing shows the Sandbox's
  empty-frame placeholder and fails `composed_check.py`. Captions: Markdown
  in the box or frame by default, the picture's resource caption when the
  source sets it small and attached to the picture (composed-pages.md
  §6.5). Recipes 6.12–6.18
  of the reference say when to use each. Follow
  [references/composed-pages.md](references/composed-pages.md). The script
  lists what the installed version lacks and what to do instead. To a person
  who has not made a composed page, point to the two docs pages rather than
  retelling them: [Composed-page books](https://postext.dev/en/docs/composed-page-books)
  (build a template, fill it from the Markdown, label a map, translate,
  review overflows) and [Moving a book to composed pages](https://postext.dev/en/docs/migrating-to-composed-pages)
  (a book that keeps its text in heading styles; the Sandbox's *Move the
  text to the Markdown*, or by hand). Both come in the ten site languages,
  and every page has a `.md` rendition (append `.md`).
- **Round 1, older engines: the ladder** of playbooks J (fixed callouts, page
  grounds in an opener design, live-text SVG labels), first rung first:

  1. **Placed boxes**: one callout style per position, `placement: "fixed"`
     with `fixed: {anchor, offset}`; the box's text is a `:::callout{type="…"}`
     in the chapter, at the page it belongs to. A box that cannot take its
     place moves to the next page and nothing warns: check the page count.
  2. **Page backgrounds and furniture**: image elements with no text in the
     opener design of a `span: "page"` heading style (`reserve: false`),
     painted under the text. Keep that heading visible (`hidden` skips its
     design). One style serves every page of its kind with
     `resourceId: "{attr.fondo}"` (`# Topic {style="topic" fondo="bg-p05"}`).
  3. **Maps and diagrams with many labels**: an SVG resource with live
     `<text>` labels, translated by `localized.<lang>.resources[].file`
     (playbooks D6). Its words live in the SVG or in the strings file your
     script builds it from: the second place the book's text lives in round
     1, and the report says how many words it holds.
  4. **Forbidden** in both rounds: literal text in design elements (a
     template's decoration included); heading styles that hold content (a
     hidden style per page carrying its text); one preset or bundle per
     language; the source's line breaks copied into the paragraphs.

Update the command line first (Setup): an old executable on the PATH makes
the skill pick round 1 for no reason. The version that counts is the one
the book will open in (the Sandbox runs the latest release; a program, the
`postext` version it pins). The report names the round, the version and
the features worked around. A book ported with round 1 or with postext
1.33 moves to round 2 as composed-pages.md §9 says (`moveTextToMarkdown`
for the 1.33 pattern).

With more than a third of the pages composed **in round 1**, go back to the
brief and, unless it already says which (then follow it and name the choice
in the report), ask the user to choose: **identical layout** (rungs 1–3 at
the source's positions; edited or translated text must still fit its box,
and what Postext cannot place is listed as a gap) or **editable,
translatable text** (the composed pages set as flow pages with the source's
type, colours and boxes, placed by the engine). Round 2 gives both, so ask
only when the brief wants composed pages reflowed as running text.

## Read before writing anything

Postext Markdown is **not CommonMark**. These habits break a port:

- **No pipe tables, raw HTML, `---` rules or inline images.** They
  print literally or vanish. Tables and figures are
  *resources* (JSON), cited with `:ref{id="…"}` or placed with
  `::resource{id="…"}`.
- **Blank lines around every block.** An ordered list or a `::resource`
  glued under a paragraph line is swallowed into that paragraph. A `$$`
  display glued there interrupts it instead (postext ≥ 1.5), and text right
  under its closing `$$` continues the paragraph, flush.
- **One line per list item**, 2 spaces per nesting level, real numbers typed.
- **Escape `* _ ^ ~ $`** in literal text, including intraword `_` and prices
  (`\$5`).
- A paragraph starting with `- `, `1998. `, `# ` or `> ` becomes a list,
  heading or quote. Use `—` for dialogue; prefix U+2060 otherwise.
- **Inline marks do not nest** the CommonMark way: write `**a** ***b***`.
  Marks in headings print as in a paragraph (`headings.inlineMarks`, on by default
  since configVersion 6); an italic run in an italic heading comes out upright.
- The containers are `:::callout`, `:::paragraphs`, `:::part`, `:::columns`
  (in a box, or in the running text from postext 1.25), `:::paper` (a run of
  pages on another paper stock, for the Folio viewer), `:::exercise` (with
  `:::solution` and `:::hint` inside; `[[answer]]` blanks are read only
  there) and, on composed pages, `:::frame`. The directives are
  `:::pagebreak`, `:::numbering`, `:::columnbreak`, `:::space`, `:::toc`,
  `:::index`, `:::bibliography` and `:::solutions`.
  The fenced raw-body blocks are `:::references` and `:::verse` (a poem: line by
  line as written, or a classical Arabic poem, one bayt a line split at
  `||`), plus inline index marks
  (`:index[…]`, `:index{term="…"}`), and the comic blocks `:::page` and
  `:::strip` (comics.md); on composed pages (postext ≥ 1.34) the
  four-colon `::::page{template}` with `:::frame{slot}`, `:::figure` +
  `::label` and `slot=` (document-format.md §12.2). Anything else prints
  literally.
- **Extra blank lines add no space.** Where the source has deliberate
  vertical space (a scene break, room above a signature), write
  `:::space` (one body line) or `:::space{lines=N}`.
- **Line breaks inside a paragraph** (postext ≥ 1.23): end the source line
  with a backslash, or write `\\` and a space, for an address, a letter's
  greeting or a signature block kept in one paragraph (document-format.md
  §3.3). Two trailing spaces are no break. Write a poem as `:::verse`, one
  line of verse a line, a blank line between stanzas, leading spaces for its
  indents (§12).
- **Tabs** (postext ≥ 1.23): write `:tab` where the source aligns text at a
  stop (a price, an actor, marks at the margin), and give the paragraph's
  style `tabStops` (document-format.md §10.9, configuration.md §4a). A tab
  character is a tab only in a paragraph whose style has stops; elsewhere it
  is a word space.
- **Drop caps** (postext ≥ 1.23): a chapter's first paragraph stays in the
  text, and its drop cap, raised initial or small-capital first words come
  from the heading level's (or heading style's) `dropCap`; a catalogue's
  entries from a paragraph style's `dropCap` with `each: true`
  (configuration.md §4b). `# Title {dropcap=false}` leaves one chapter
  without it. Never copy the opening words into a `lead` attribute drawn by
  a design text.
- **Code listings** (postext ≥ 1.23): copy a source's code as a ```` ``` ````
  or `~~~` fence, as written (`` ```bash backup.sh `` or
  `` ```js {title="app.js" lineNumbers highlight="3"} ``). Nothing inside is
  read as Markdown, so nothing needs escaping, and leading spaces, tabs and
  blank lines stay. The face, box, long lines, numbers and token colours
  come from `codeStyle` (configuration.md §12b), inline code in a code face
  from `codeStyle.inline`. Never rebuild a listing as one paragraph per
  line with word joiners and no-break spaces, nor fake colours with bold
  and italic runs. A preset stamped below `configVersion` 9 reads fences as
  Markdown: write 9.

Config traps:

- Once `headings` exists, **H1 loses its page break** unless you write
  `levels[0].breakBefore`.
- Accents default to the palette entry `main-color` (blue), and so do bold and
  italic text (`bodyText.boldColor`).
- Without a `header`, the built-in blue Open Sans running head is used.
- Built-in `figure`/`table` types are English.
- Geometry, font sizes and the offsets of rule, box and image elements in
  `em` throw: use mm and pt (a text element's offset may be in `em` of its
  own size, postext ≥ 1.9).
- Never write `config.customFonts`; fonts come from the manifest's `fonts`.

Chinese and Korean traps (postext ≥ 1.9; playbooks F5–F6; the markup, fonts and
punctuation ones hold for Japanese too, whose own list follows):

- **`config.locale` in full**: `zh-Hans` or `zh-Hant`, with the region when
  known (`zh-Hans-CN`, `zh-Hant-TW`, `zh-Hant-HK`). A bare `zh` reads as
  Simplified mainland. The **region** picks line breaking, punctuation widths
  and the book-title mark; the **script** picks 图/圖, （续）/（續） and the
  numerals of `第{1:一}回`.
- **No hyphenation, no italics.** Hyphenation is off in a Chinese document;
  `*…*` on Chinese characters prints emphasis dots (`cjk.emphasis`). Never
  fake italics; keep the source's emphasis as `*…*` or `:dots[…]`.
- **Punctuation as typed**: keep full-width ，。「」（）《》 and the source's
  quotes; do not add spaces around Latin words (the engine sets the Han–Latin
  quarter em and replaces typed spaces).
- **Indents from the config**: `bodyText.firstLineIndent: {value: 2, unit: 'em'}`;
  delete the U+3000 the source typed at paragraph starts (the parser drops
  them anyway).
- **Markup in ASCII**: `:::`, `#`, `[^1]`, `{…}`, `**`. Text cleaned with a
  Chinese input method may carry `：：：`, `＃`, `［＾1］`, which print as text.
- **Sizes in pt**: 五号 = 10.5 pt, 小五 = 9 pt, 小四 = 12 pt, 四号 = 14 pt,
  三号 = 16 pt; there is no 号 unit.
- **One family per style, no fallback**: the bundled Chinese face must hold
  every character the book prints (`lint_project.py` checks it with fontTools).
  Headings default to Open Sans and the body to EB Garamond, which have no Han.
- **Footnotes ① ② restarting on every page** (页下注) are page numbering, not
  typed text: write `[^id]` markers and definitions and set
  `footnotes: {numberFormat: 'circled-decimal', numbering: 'page'}`
  (postext ≥ 1.11). Never type ① into the text or the note.
- **Vertical books** (`layout.writingMode: 'vertical-rl'`) are bound on the
  right by default (`page.binding: 'auto'`); page 1 is the recto and sits on
  the left of its spread. `page.margins` keep their names on the sheet.

Japanese traps (postext ≥ 1.16; playbooks E8, F9–F10; configuration.md §19c2):

- **`config.locale: 'ja'`** (or `ja-JP`), never a `zh-*` tag and never `jp`
  (a country code). Kana in the text mean Japanese, even where kanji
  dominate. `ja` selects the `japan` region: JLReq line breaking and
  spacing, sesame bōten for `*…*`, 『』 for `:book[…]`, jukugo furigana,
  （） warichu, 図/表, 第{1:一}章 as 第百一章 (not 一百零一), gojūon index,
  Japanese note defaults. `lint_project.py` errors on kana under a Chinese
  locale.
- **Fonts must carry kana and Japanese forms**: Noto Serif JP / Noto Sans
  JP, Shippori Mincho, BIZ UDMincho, never the SC/TC builds (Chinese forms
  of 直 骨 角). A pan-CJK face (Source Han, Noto CJK) gets its Japanese forms
  in the PDF from `locale: 'ja'` (JAN `locl`). Prefer TrueType: those faces'
  CFF `.otf` files are embedded whole (`cffEmbeddedWhole`, well over 10 MB a
  weight). Subset with `--ranges latin,latin-ext,punct,cjk-punct,kana`.
- **Furigana**: one reading over a word is `{麦藁帽|むぎわらぼう}` (group
  ruby, what Aozora's 《》 means); one per character is `{東京|とう|きょう}`
  (jukugo: it may break between characters). Never leave `X《よみ》`,
  `｜`, `［＃…］` in a chapter: convert Aozora files with
  `scripts/aozora.py` (sources.md, "Japanese sources").
- **Vertical books**: `layout.writingMode: 'vertical-rl'`, bound on the right
  (`page.binding: 'auto'`); two-digit numbers stand upright by themselves
  (`cjk.uprightDigits: 2`), `!!` `!?` too. Keep full-width Ｋ, ＧＮＰ, １２ as
  typed (upright, one per cell); never NFKC the text (only half-width kana
  become full width). Traditional texts write numbers in kanji: keep them.
- **Kinsoku and hanging**: auto is `ja-very-strict` (JIS X 4051: no っ, ー,
  々 at a line start); a source whose lines open with small kana or ー is
  `ja-strict`, a newspaper `ja-loose`. Hanging 、。 past the line end
  (burasagari) is on by default (`hangingPunctuation: 'auto'`); a source
  whose line ends are all flush is `'none'`.
- **Indents**: 1 em (`firstLineIndent: {value: 1, unit: 'em'}`), not the
  Chinese 2 em. A paragraph opening with 「 sets the bracket in the indent
  (`cjk.paragraphStartBracket` auto). In Aozora a leading U+3000 is the
  indent, 「 has none, and a paragraph with neither is flush: aozora.py
  keeps that distinction.
- **Notes**: unset fields take Japanese defaults that differ by direction:
  vertical = notes after the chapter (後注) with （1） beside the line;
  horizontal = foot of the column, numbered per page, superscript, ⅓ rule.
  The marker goes before a sentence-final 。 (`先生[^1]。`).
- **Index**: every kanji entry needs its reading: `:index[漱石]{yomi="そうせき"}`
  or kana ruby on the marked text; without it the entry files after the
  kana (`indexReadingMissing`). Citations: `citations.style: 'sist02'` for
  science and technology (the CSL locale is ja-JP by itself).
- **Glyph forms as the source prints them**: keep 旧字体 and 歴史的仮名遣い
  (國, ゐ, いふ) when the edition has them; an IVS selector after a kanji
  (葛 + U+E0100, a variant the name needs) stays. The engine never modernises.
- **Never repair unbalanced 「**: a quotation of several paragraphs (a
  letter in a novel) opens every paragraph with 「 and closes once.

Arabic and right-to-left traps (postext ≥ 1.15; playbooks F7–F8; configuration.md §19d):

- **`config.locale: 'ar'`** (or the region, `ar-EG` ٠–٩, `ar-MA` 0–9) is what
  turns the book: right to left, right binding, a mirrored page (first column
  on the right), the region's digits, no hyphenation, kashida, bold emphasis,
  شكل/جدول. Without it an Arabic book is laid out left to right. Do not set
  `direction` by hand; never mirror margins or swap `left`/`right` in the
  config yourself: body-flow sides are flow-relative, so a preset converted
  from an LTR book keeps working. Header/footer slots stay physical.
- **Words are never cut, hyphenated or letter-spaced.** No `letterSpacing` on
  Arabic styles (`joiningScriptLetterSpacing`); a word wider than a narrow
  cell overflows (`unbreakableWordOverflow`): widen the cell.
- **Emphasis**: keep `*…*`; it prints bold (Arabic is never slanted). Do not
  set `emphasis: 'italic'`.
- **Notes «(١)»**: `[^id]` markers before the following punctuation, and
  `footnotes: {markerTemplate: '({n})', numbering: 'page',
  noteNumberPosition: 'inline'}`. Never type the brackets or digits.
- **Mixed direction**: English paragraphs in `:::paragraphs{dir=ltr}`, a
  Latin title inside Arabic as `:ltr[…]{lang=en}` (else its final stop or
  bracket lands on the wrong side). Headings take `{dir=…}`.
- **Keep the text as typed**: the author's digits, ، ؛ ؟ « », the edition's
  orthography (فى، مائة), the harakat. Quranic ﴿…﴾ typed U+FD3F first.
  Strip only justification tatweels a PDF extraction brings in.
- **Verse**: a classical poem is `:::verse`, one bayt a line `ṣadr || ʿajuz`;
  give vocalised verse a paragraph style with 1.9–2.1 em leading. Free verse
  (no `||`) is the same fence set line by line.
- **Fonts**: one family per style, no fallback: Amiri, Noto Naskh Arabic,
  Scheherazade New (Noto Kufi Arabic, Reem Kufi, Aref Ruqaa for headings);
  subset with `--ranges latin,punct,arabic` keeping GSUB/GPOS (`lint_project.py`
  checks glyphs and joining tables). Body 13–15 pt; leading 1.6–1.85 em.
- **Contents at the end** (فهرس): `:::toc` in the last chapter, under a
  heading with `{toc="false"}`.

Comics traps (postext ≥ 1.20; [references/comics.md](references/comics.md)):

- **The engine letters the comic.** Pictures are text-free panel art
  (resources placed with `::panel{art=id}`); each language's Markdown holds
  only the words, one balloon per line (`maya{whisper}: …`). Never bake
  lettering into the pictures of a translated edition.
- **Geometry is written once.** `split`, panels, art, safe areas, speaker
  anchors and avoid zones are the same in every edition; speaker ids too
  (`maya`, not a translated name). The split is a tree of percentages of the
  parent cell (`30 [55 | *] / *`), measured from gutter middles; never
  mirror it by hand for a right-to-left edition.
- **One lettering size per book** (`comics.lettering.fontSize`, default
  7.5 pt): the engine reshapes or moves balloons, never shrinks text. Bundle
  the lettering and sound-effect faces (Comic Neue and Bangers by default;
  Zen Antique and Dela Gothic One for Japanese; Playpen Sans Arabic and
  Lalezar for Arabic).
- **Manga** keeps `comics.artDirection: 'rtl'` in every language, and
  `page.binding: 'auto'` binds it on the right; Japanese and Traditional
  Chinese balloons are vertical by default. A Japanese or Traditional
  Chinese edition of a Western comic reads right to left and is right-bound
  by itself (`readingDirection: 'auto'`, postext > 1.20.2): set
  `readingDirection: 'ltr'` only to keep the Western order on purpose. An
  Arabic edition reads right to left from `locale: 'ar'` alone.

Full references (load the one you need):

- [references/document-format.md](references/document-format.md): every
  Markdown construct, attribute and trap, verified against the parser.
- [references/configuration.md](references/configuration.md): every config
  key, its default and unit, with two complete example configs.
- [references/project-format.md](references/project-format.md): preset.json,
  chapters, languages, resources, tables, fonts, import, headless rendering.
- [references/sources.md](references/sources.md): extraction per source
  format (PDF, DOCX, PPTX, EPUB/HTML, IDML, LaTeX, XML, text, scans).
- [references/design-analysis.md](references/design-analysis.md): measuring
  geometry, grid, type, colour, boxes, openers and placement, and mapping
  them to config.
- [references/playbooks.md](references/playbooks.md): the unusual cases
  already solved (parts with palettes, openers, verse, line numbers, glosses,
  footnotes, back-of-book indexes, tab stops for menus, cast lists and forms,
  floated/split/nested boxes, textbook and workbook exercises with their
  solutions, print masters, live-text figures, cell
  pictures, rotated tables, translated editions, Chinese books set
  horizontally and vertically, CJK fonts, Japanese books (horizontal, and
  vertical bunko or tankōbon) and Japanese fonts, Arabic books (modern and
  classical vocalised editions) and Arabic fonts, the printed object for the
  Folio 3D viewer, fixed-page books such as children's textbooks with their
  placed boxes, backgrounds and labelled maps…) and which public preset
  shows each.
- [references/composed-pages.md](references/composed-pages.md): round 2
  for fixed pages: choosing the round by version, the template/slot model,
  the component library, templates with `extends` and variants, recipes (a
  box with a tab, a category tree, a double-page timeline, a labelled map,
  photos with captions, text round an illustration, a box that continues
  on the next page, a magazine thread with jumps, an activity sheet with
  answer lines, a photo and its ground, a contents page; from 1.48 lines
  between frames, notes that point into a picture, a map's key and symbols,
  cards and shapes, cards the Markdown repeats, modules, frames that lie over
  each other), the drafting loop, the figure's own words and the
  label checks, the composed-page checks with 0 overlaps, one
  bundle for every edition, and moving a round-1 or 1.33 port over.
- [references/comics.md](references/comics.md): comic pages, strips and
  spreads: the split grammar, panels, script lines, the `comics` config,
  speaker anchors and safe areas, reading direction, editions per language,
  warnings, `comic_panels.py`, and porting playbooks (text-free art plus
  translations, lettered scans, generated art, manga, Arabic, newspaper
  strips).
- [references/music.md](references/music.md): music scores (postext ≥
  1.54): notation fences (ABC, MusicXML, MEI, Humdrum), numbered music
  examples as `score` resources, `scoreStyle` mapping (staff size, music
  font), and porting music textbooks, methods, songbooks and hymnals.
- [references/verification.md](references/verification.md): lint, headless
  render, page JPEGs, page-by-page comparison, and a symptom → lever table.

## Setup (once)

```bash
python3 -m pip install pymupdf pillow fonttools brotli numpy   # PDF, images, fonts, comic panels
brew install pandoc poppler                                  # or apt: pandoc poppler-utils (DOCX/PPTX/EPUB/HTML, page images)
mkdir -p ~/.local/bin && curl -fL -o ~/.local/bin/postext https://github.com/drnachio/postext/releases/latest/download/postext-macos-arm64 \
  && chmod +x ~/.local/bin/postext                           # the work loop (layout, page JPEGs, checks, PDF); pick your system's file
```

`postext` is the [postext command line](https://postext.dev/en/docs/command-line):
one self-contained executable per system (`postext-macos-arm64`,
`postext-macos-x64`, `postext-linux-x64`, `postext-linux-arm64`,
`postext-linux-x64-musl`, `postext-windows-x64.exe`), no installation; with
Node, `npx postext-cli` works too. It runs the real engine and reads a project
folder as the Sandbox does. **Iterate with it in watch mode** (step 7).

**Check the command at the start of every session**, and again before you
declare a round-2 port (composed pages need 1.48 or later; the checks of
step 7 read the version):

```bash
postext --version || echo "postext missing"
npm i -g postext-cli@latest                                  # when missing or older than npm view postext-cli version
```

A global npm install lives in one Node version's folder: switching the nvm
default (`nvm alias default …`) drops it from the `PATH` without a word, and
a stale executable in `~/.local/bin` keeps answering with an old engine. If
`postext --version` and `npm view postext-cli version` differ, update before
reading any check.

The Node tools are optional: `scripts/render.mjs` is the fallback when the
executable cannot be downloaded. Its `SANDBOX-WARN` lines (the Sandbox's own
checks) come only with `--repo /path/to/postext`, a Postext checkout with
`packages/postext-sandbox` built; the npm install below gives none. Without a
checkout, get those checks from the Sandbox itself (verification.md §4, WebMCP
`sandbox_get_warnings`). `--tools DIR` (or `POSTEXT_TOOLS`) names the npm tools
folder when it is not `~/.cache/postext-tools`:

```bash
mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools \
  && npm init -y >/dev/null && npm i postext postext-pdf postext-citeproc react @pdf-lib/fontkit @napi-rs/canvas   # render.mjs (Node >= 22.15)
```

Optional: `ocrmypdf` (scans), `magick` (SVG fallback rasters, contact sheets),
`verapdf` (PDF/UA).

## Workflow

Work in this order. Show the user intermediate results (the spec sheet, the
first chapter, page comparisons) instead of converting everything blind.

### 0. Agree the brief
Ask only what you cannot infer:

- **Faithful** reproduction or a redesign inspired by the source?
- Which part: the whole book, or a sample chapter first (recommended)?
- Languages. Every edition is a set of chapters in **one** bundle
  (`chapters.<lang>`); a translation is translated Markdown, never another
  preset.
- Print (PDF) and/or screen.
- The printed object, for the Folio 3D viewer: paper stock and weight,
  binding, cover (a case, or the book's own first and last pages). Read it
  from the source's colophon or the publisher's spec; ask only when it is
  nowhere and the user cares (playbooks A11).
- For Chinese (or Japanese, Korean) sources: the script and region (简体
  mainland; 繁體 Taiwan or Hong Kong), the writing direction (horizontal or
  vertical) and the binding edge (a vertical book is bound on the right).
  Keep the source's; a redesign may change the direction, never the script
  without being asked.
- For Japanese sources: vertical (縦組, bound on the right) or horizontal
  (横組); the grid (字詰め × 行数); the ruby policy (every reading the source
  prints, or only hard words); where the notes go (after the chapter, page
  foot, spread sidenotes); bōten or bold for emphasis; and the edition's
  orthography (新字新仮名 or 旧字旧仮名, kept as it is). For a public-domain
  text: which edition (底本) and its credits.
- For Arabic sources: Modern Standard or classical, the region's digits
  (٠–٩ or 0–9), how much of the text is vocalised (sets the leading),
  whether the poems are set as two-hemistich bayts, and where the contents
  go (front or back).
- For comics: which editions (languages), whether text-free art exists
  (ask the rights holder for the files without the lettering layer before
  cleaning scans), the reading direction of the art (manga: right to left),
  the lettering size and face of the source, and whether translated
  editions keep the original's sound effects drawn in the art.
- Rights, asked once: "Is this your own title (publisher, author or
  licensee)?" Yes → port everything as is. Then only ask about third-party
  pieces they do not control: licensed fonts get `redistributable: false`
  (the files stay in their project, only exports leave them out);
  third-party pictures they cannot reuse get replaced.

Get or produce **a PDF of the original**: the design is read from rendered
pages even when the text comes from DOCX or IDML.

### 1. Inventory
`python3 scripts/inventory.py SOURCE [--pages 1-40]` shows geometry, fonts,
styles in use, media, vector-heavy pages (infographics) and text-less pages
(OCR needed). It names the next command. Rasterise pages for a look:
`pdftoppm -r 50 -png source.pdf /tmp/src/p`.

Classify every page as flow or composed (see "Flow pages and composed
pages" above; `vector_heavy_pages` and pages with many short text runs at
scattered positions are the composed candidates) and write the list into
the spec sheet; run `composed_check.py round` and write the round there
too. In round 2, sort the composed pages into kinds of page (same boxes in
the same places, within about 3 mm): one template per kind, `extends` for
small differences, `variants` for recto and verso, a spread template for a
two-page design (composed-pages.md §3.1). In round 1, more than a third
composed: ask the user the layout question before measuring further.

### 2. Measure the design (spec sheet)
Follow [design-analysis.md](references/design-analysis.md).

- `scripts/measure_layout.py source.pdf --pages <body pages>` gives the trim,
  margins per parity, columns, gutter and leading (the baseline grid).
- `scripts/pdf_extract.py roles source.pdf` gives the type roles (font, size,
  colour).
- Record page types, openers, running heads, box families, table and caption
  looks, placement habits and palette colours.
- Composed pages (round 2): a **component library**, each look measured
  once (frame styles = callout styles holding the dress only, paragraph,
  chip, mark and label styles), never one per page; and per kind of page
  the frame boxes in mm, each box's drawn height as its `minHeight`
  (composed-pages.md §3.2, §4).

Write each number with where you measured it.

Chinese books: measure the grid in characters, as their designers specify
it: characters per line × lines per page (字数 × 行数, the 版心), the body size
as its 号 in pt, the line gap as a fraction of the size, the tiers of a
vertical page, and where the punctuation sits (in the corner or centred,
full width or Kaiming). Then set `cjk.grid` (design-analysis.md §2a).

Japanese books: measure the hanmen (版面) as its designer set it:
characters per line × lines per page (字詰め × 行数, a bunko 38–42 × 16–18),
the size in pt or Q (13 Q ≈ 9.2 pt), the line feed (行送り), the indent of
each heading level in body characters and the lines it takes (行取り)
(design-analysis.md §2c).

Arabic books: measure inner/outer margins, not left/right; column 1 is the
right one; note the folio position, the kashida (long elongated joins or
none), the verse hemistich width and gap (design-analysis.md §2b).

### 3. Scaffold the project
```bash
python3 scripts/preset_kit.py init my-book --id my-book --name "My Book" --lang es [--lang en]
```

This creates `build_preset.py`, a generator using the `preset_kit` helpers
(`mm`, `pt`, `color`, `palette`, `text_el`, `rule_el`, `box_el`, `image_el`,
`place`, `bitmap`, `svg`, `table`, `chapters_from_dir`, `font_families`,
`write_manifest`). Put the spec sheet in it as constants and build `config`
from them. Always generate `preset.json`; never hand-edit it. Composed
pages (round 2): the templates are built there from the geometry constants,
text-free, shared ones first, then `extends` + patches and variants,
single-use templates only for pages like no other, named by role
(composed-pages.md §3.3, §5).

### 4. Extract the content into draft chapters
Pick the path per [sources.md](references/sources.md):

- **PDF**: edit `roles.json` (the role of each font/size/colour), then run
  `scripts/pdf_extract.py markdown source.pdf --roles roles.json --out draft --lang es`.
  Mentions of figures, tables, chapters and sections become `:ref` by
  default (`--no-link-refs` leaves them as text, `--refs-from
  resources.json` links them to resources cut by another script too);
  `report.md` lists the ones left as text and the colour the source sets
  them in, for `bodyText.referenceColor`.
  A roman the source slants by shearing comes out as italic, and
  `report.md` counts those runs: check them against the page.
  Cut the figures with
  `scripts/pdf_figures.py stubs source.pdf draft/resources.json --out-dir my-book/resources`,
  and the tables with `scripts/extract_tables.py source.pdf --pages N` (cells
  with their align, bold and fills, merges, title row as caption, group
  bands; the rules as the nearest table-style preset, never per cell).
  `pdf_extract.py` already sets ruled tables as table resources with their
  models (sources.md, PDF step 5).
- **DOCX / PPTX / ODT / EPUB / HTML / LaTeX / Markdown / JATS / DocBook**:
  `scripts/pandoc_to_postext.py SOURCE --dump-styles`, then
  `scripts/pandoc_to_postext.py SOURCE --out draft --lang es --style-map map.json --link-refs`.
- **InDesign**: export IDML and a print PDF, then run
  `scripts/idml_extract.py roles book.idml > map.json` and
  `scripts/idml_extract.py markdown book.idml --map map.json --out draft`.
- **Scans**: `ocrmypdf` first, then the PDF path.
- **Chinese sources**, vertical ones included: see sources.md, "Chinese,
  Japanese and Korean sources". `idml_extract.py` turns InDesign ruby,
  tate-chu-yoko, kenten and warichu into `:ruby`, `:tcy`, `:dots` and
  `:warichu`, and reports vertical stories and a right-to-left binding.
- **Japanese sources**: an Aozora Bunko text converts with
  `python3 scripts/aozora.py 773_ruby_5968.zip -o draft/01.md --styles styles.json --credits credits.json --report report.json`
  (CP932 zip or text: furigana, bōten, side lines, headings, indents,
  page breaks, 外字, kunten); merge `styles.json` into `paragraphStyles`,
  read the report's gaps, and print the credits block (底本, 入力, 校正) in
  the colophon. Public domain: in Japan an author who died in 1967 or
  earlier; check the country of publication too (EU: life + 70; US:
  published before 1931). Scans of public-domain editions (covers,
  illustrations, the first edition's text) come from the NDL Digital
  Collections. See sources.md, "Japanese sources".
- **Arabic sources**: see sources.md, "Arabic sources" (visual-order PDF
  text, presentation forms, Word `w:bidi`/`w:cs` runs, Wikisource `{{أبيات}}`
  poems → `:::verse`).
- **Comics**: `python3 scripts/comic_panels.py detect pages/*.jpg --out work/panels --page-mm 170x240 [--direction rtl]`
  measures every page into a `split`, gutters, the frame and one picture per
  panel, and prints the `:::page` skeletons; then anchors, safe areas and
  script lines per comics.md §15–§16.
- **Other XML or plain text**: a small script of your own, following
  sources.md; reuse `scripts/postext_md.py` to write safe Markdown
  (`render_runs`, `escape`, `heading`, `fence`, `attr_value`,
  `guard_line_start`).

- **Composed pages** (round 2): one `::::page{template="…"}` per source page
  (or spread) with the content in the source's reading order, a
  `:::frame{slot label}` per box, `::resource{id slot}` per picture, maps and
  diagrams cut without their lettering as `:::figure` + one
  `::label[…]{at="anchor"}` per word with the anchors on the resource,
  per-page design values as fence attributes (`fondo=`, `tema=`); the same
  fences, slots and anchors in every edition (composed-pages.md §3.4, §6).
  From a PDF, draft it with the scripts, then curate (composed-pages.md §3.7):
  `scripts/pdf_regions.py extract source.pdf --pages 4-28 --out work/regions --lang es --fonts my-book/fonts --overlay`
  (frames, styles, pictures cut without their text, labels, page fences;
  the page colour, cards, borders, shapes and a diagram's lines as vector
  decoration: connectors between frames, pointers into pictures at new
  anchors, path elements; a raster ground only for art nothing else draws,
  `--raster-ground` for the round-1 JPEG; a one-page run names its frames by
  role itself, `--name-frames`; art no pixel of its colour shows is left out,
  a cut keeps only its picture, plates whose fill shows over a picture lie over
  it, a box's pictures, rows of captions and nested panels in its fence
  (`:::columns`, `:::callout`; no fence left empty), tab ring icons as
  `label.icon`, art whose ink runs past its box cut whole with `overlap:
  "allow"`, paragraph and list spacing measured per style, map keys and
  scale bars as labels, label halos, text measured to the source's width
  instead of shrunk (`--fit` only as a reserve), a small caption attached
  to its picture its resource caption, ornaments
  by a running head are anchored to it; a box with art over its fill gets the
  fill as decoration under that art, bars under 1 mm are lines, a picture in
  a rounded box is clipped to its corners, a chart keeps its axes and its
  lettering in its cut and lifts no labels, connector ends are measured on
  the boxes the template lays and a slanted leader points into its picture,
  art is read inside the clips it is painted in, hatching is one shape, and
  a page whose loose art vectors would draw badly keeps it in its raster
  ground unless `--vector-ground`),
  `scripts/template_dedupe.py work/regions --laid laid.json` (one template per kind
  of page, `extends` children, merged styles and grounds, frames on a lattice
  as a repeating grid (cards that differ only in colour too, each naming a look from
  `frameLooks`), every band of a page as a module or, when its blocks stand side by
  side, a row of modules (the page template a shell; shells that differ only by
  furniture are one, drawn `when`/`unless` the fence says `frontmatter`) with
  `:::module` blocks in the Markdown, frames named by role with their
  `slot="…"` rewritten in every language; `laid.json` is the draft's frames
  from `scripts/render.mjs --frames`, and `--compare-boxes` checks the folded
  pages lay out as before), and
  `scripts/pdf_regions.py manifest work/regions --fonts my-book/fonts` to lay
  the draft out and compare it with the source. `scripts/anchors.py` does a
  single map or diagram (`--page 6 --box x0,y0,x1,y1`) and writes other
  editions' `::label` lines from a strings file (`--strings en=en.json`); it
  merges a label printed twice at one point and writes `overlap: "allow"`
  for names the source prints touching, and `scripts/pdf_figures.py symbols`
  lists a map's dots as `avoid` zones. A key of symbols and words (a map's
  colours, a weather map's fronts) comes out as a `kind: "legend"` label on
  its picture, or a key table in a frame when it stands alone
  (`scripts/legends.py`, composed-pages.md §6.14). Close the draft with
  `scripts/composed_check.py check work/regions --json-out work/check.json`
  (0 overlaps) and `scripts/compare_pages.py … --score work/score.json
  --check work/check.json` (composed-pages.md §3.7, §6.18).

Every extractor writes `chapters/<lang>/*.md`, `resources.json` and a
`report.md` of decisions to review. Copy the chapters into `my-book/chapters/`
and merge `resources.json` into the generator's resource list.

### 5. Curate: make it Postext, not a transcript
Read each chapter against the source pages and apply
[playbooks.md](references/playbooks.md):

- styles as containers: `:::callout{type}`, `:::paragraphs{style}`;
- parts at the top of their first chapter;
- the contents as `:::toc`, always (playbooks A3), never retyped from the
  source; on a composed page (postext ≥ 1.42) it is a frame that
  `takes: "toc"` over the template's ground, not a flow page with a heading
  design. Where each block (a part, a section heading) must stay with its
  entries, use `toc.groups` / `:::toc{keep="part"}` when the installed
  Postext supports `toc.groups` (postext ≥ 1.34: check with
  `postext --version` and the docs' contents settings); otherwise a
  hand-written contents with `:ref{id="…" style="pageNumber"}` is allowed,
  listed as a documented gap in the report;
- openers as heading attributes (`# Title {author="…" lead="…"}`);
- figures cited with `:ref` in the sentence that first mentions them
  (`style="full"`, `case="lower"` to keep the authored form);
- ornaments and inline tables with `::resource`; a picture or a box the
  text runs beside with `placement.wrap` / `:::callout{wrap=… width=…}`
  (≥ 1.24), not a `:::columns` group;
- footnotes as `[^n]` markers + `[^n]: text` definitions (not in headings,
  captions or cells), margin notes as side callouts;
- a back-of-book index as `:index` marks plus a closing `:::index` chapter,
  rebuilt from the source's markup or, for a printed index,
  `scripts/index_marks.py parse|place` once the text is final
  (playbooks A10);
- poems as `:::verse` blocks, line by line with their indents and stanza
  breaks (`keepStanzas` for haiku and tanka);
- line numbers in the margin (critical editions, poetry, statutes) from the
  config `lineNumbers` (postext ≥ 1.23, configuration.md §19f), with the
  source's typed numbers removed from the text, never side boxes;
- menus, price lists, cast lists, exam marks, forms and run-in indexes as
  paragraphs with tab stops and `:tab` (postext ≥ 1.23, playbooks B13), never
  as two-column tables or runs of spaces;
- drop caps and raised initials on the chapter's own first paragraph, from
  the heading level's `dropCap` (postext ≥ 1.23, playbooks A5), never as a
  heading attribute set apart by the opener design;
- sizes that grow with the text and reflowable content wherever they make
  sense, not fixed sizes or breaks copied from the source pages (see Rules
  of thumb).

Resources get descriptive ids, captions without the number, `note` credit
lines, `altText`, and bitmap `width`/`height`. Keep the source's wording;
list deliberate deviations.

### 6. Fonts and images
- Fonts: `scripts/fonts.py info|instance|subset|scale|split|width`. A licensed
  family the pack leaves out gets an open stand-in (postext ≥ 1.42,
  `fonts[].fallback`) chosen by measurement: `fonts.py width LICENSED.ttf
  CANDIDATE.ttf… --text-from chapters/<lang>/` for regular, bold and italic
  (within about 2 %), then `preset_kit.py pack --fallback "Family=Open family"`
  (project-format.md §4, playbooks E2). From 1.43 that family's faces are
  embedded in EPUB, HTML and SVG exports, so choose an open one.
- Chinese faces: subset a TrueType build to the book's text first
  (`fonts.py subset NotoSerifTC[wght].ttf --out work/ --text-from chapters/ --ranges latin,punct,cjk-punct`),
  then cut static weights (`fonts.py instance`). Layout features (`vert`)
  and vertical metrics survive (playbooks E6).
- Japanese faces: `fonts.py subset NotoSerifJP[wght].ttf --out work/ --text-from . --ranges latin,latin-ext,punct,cjk-punct,kana`,
  then `fonts.py instance` for the weights (playbooks E8).
- Arabic faces: `fonts.py subset Amiri-Regular.ttf --out fonts/ --text-from . --ranges latin,punct,arabic`
  (keeps the joining tables and the tatweel); cut static weights of variable
  faces such as Noto Naskh Arabic (playbooks E7).
- Images: `scripts/images.py prep|join|size|crop|cutout` (`crop` and
  `cutout` take a resource id and keep its anchors and contour in place).
- Print set-up: `inventory.py` reports a source PDF's PDF/X version, output condition and bleed
  with a `suggested_config` (`print`, `page.cutLines`); `render.mjs` prints PREFLIGHT lines for a
  book set up for print (`--preflight` forces them). See configuration.md §21.
- Comic pictures: `scripts/comic_panels.py grid|check|contact` (read and check
  anchors and safe areas, compare pages); give every panel picture its
  `width`/`height` and `altText`.
- Vector artwork: `scripts/convert_assets.py` (`.ai`/`.pdf` → SVG) and
  `scripts/pdf_figures.py crop … .pdf` (print masters).

Then `python3 build_preset.py`.

### 7. Verify and iterate
Follow [verification.md](references/verification.md).

**Work in watch mode, on the unpacked project.** Keep the project as a folder
(`my-book/`, never the packed `.postext`, while you work; to rework an
existing bundle, `postext unpack book.postext -o my-book` first). Start one
watcher in the background on the pages you are working on, then loop: change
a chapter or the generator, wait for the rebuild, open the JPEGs, change
again. Each round takes about a second, even on a long book, because the
engine and the fonts stay loaded, and the whole book is laid out every time,
so folios, plate numbers and cross-references stay right:

```bash
python3 scripts/lint_project.py my-book --quiet          # first, and at every milestone
postext build my-book --locale es --images /tmp/pages --pages 12-15 -f jpeg --dpi 100 --watch > /tmp/watch.log 2>&1 &
until grep -qE 'watching|^error' /tmp/watch.log; do sleep 0.2; done; cat /tmp/watch.log   # first build done
```

Then, for every change:

```bash
n=$(grep -cE 'rebuilt in|^error' /tmp/watch.log)        # before the change
# … edit chapters/es/03-….md, or a constant in build_preset.py then `python3 build_preset.py` …
until [ "$(grep -cE 'rebuilt in|^error' /tmp/watch.log)" -gt "$n" ]; do sleep 0.2; done
tail -n 30 /tmp/watch.log                                 # the warnings of this build, or the error
```

and open `/tmp/pages/page-NNN.jpg` (NNN = position in the book; `--pages` takes
printed numbers, `'#40'` for the 40th page of the layout). A save that breaks
the book prints `error …` and keeps the last good pages. Changes in `source/`,
`*.py` and the other project-only files are ignored; running the generator
rewrites `preset.json`, which counts. `--dpi 100` reads body text; 150–200 for
fine detail; a wider `--pages` range at `--dpi 72` gives a chapter at a
glance. To look at other pages, stop the watcher
(`pkill -f "postext build my-book"`) and start it again with the new
`--pages`: the first build of a long book takes a few seconds, every later
one about a second. Stop it when the pages are right.

Design decisions go the same way: change one constant in `build_preset.py`
(a margin, the leading, a heading size), run it, look, and keep or revert,
before you move to the next. Compare with the source from the same folder:

```bash
python3 scripts/compare_pages.py source.pdf /tmp/pages --source-pages 23-26 --render-pages 1-4 --out /tmp/cmp --sheet
```

Without the executable, `render.mjs` paints the same files in one shot (a few
seconds each time, the engine loaded afresh):

```bash
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages 12-15               # printed page numbers
node scripts/render.mjs my-book --lang es --jpeg /tmp/pages --pages '#40' --dpi 150      # 40th page of the layout, sharper
```

At each milestone (a chapter done, before delivery) run the full checks, which
the watch log does not replace: `lint_project.py`, `preset_kit.py lint my-book`
(content in the config, config size), `postext check my-book --locale es
--json` for **every** locale (every warning with chapter file:line and page;
exit 3 on errors) and the Sandbox's own checks (`sandbox_get_warnings`, or
`render.mjs --repo <checkout>` for its `SANDBOX-WARN` lines). With composed pages, `composed_check.py check my-book
--stress 1.3` runs every edition and fails on `frameOverflow`,
`contentInConfig`, template and slot warnings and a page whose HTML reading
order is not the Markdown's, and lays the text out 30 % longer as the
Cookbook bench does (composed-pages.md §7). `labelOverflow` fails it too;
`labelOverlap` is listed as a note to read in every language. From 1.48 it
fails on every frame under another frame or past its box (`frameCovered`,
`frameOutsideArea`) and ends with `overlaps: N`: fix each with the fixes it
prints, or, only when the source prints it so, set `overlap: "allow"` on the
frame or record the pair with its reason in the project's
`composed-check.json` (composed-pages.md §6.18). `compare_pages.py --score
--check` fails the likeness score while an overlap remains.

**When the stress run puts a box's text under its own pictures, put the
pictures inside the box.** A picture hung from a box (anchored to its
corner, laid over its foot) stays where it is when the text runs longer,
so the text runs under it. The fix is to move the picture (and its
caption) into the box's fence, as `::resource`, `:::figure` or a
`:::columns` row, so the box grows and everything under it moves down.
Never move the box's words out into a capped text frame above the
pictures: the box is left with no content of its own, the Sandbox shows
its empty-frame placeholder on it, and a longer edition overflows the
capped frame instead (composed-pages.md §6.5).

**Review every page side by side before you call a round done.** The
checks pass on pages a reader sees are wrong: on a 28-page textbook every
check passed while captions stood beside the wrong photos, a diagram's
captions had merged into its intro, tab icons floated beside their tabs,
a box came out 6 mm taller than the source and every list was spaced
wider. Make the pairs of the whole book at 80 dpi or more and look at
every pair, not a sample:

```bash
python3 scripts/compare_pages.py source.pdf /tmp/pages --source-pages 1-28 --render-pages 1-28 --out /tmp/review --dpi 80
```

On each pair, go through this list and fix what differs (or name it in the
report):

- **Tabs and icons**: every tab on its box, at its corner, with its icon
  (`label.icon`) and not a shape left beside it.
- **Captions**: each caption under or beside the picture it names, in its
  own style; no caption read into a box's running text, none merged into
  an intro.
- **Lists**: the gap before, between and after items as in the source
  (usually the paragraph gap, not the default 1.5 em).
- **Boxes**: height, feet and paddings as drawn; a box that grows with its
  pictures ends where the source's ends, not a padding lower.
- **Art across edges**: an arrow head past a card, a figure standing over a
  box's foot, in one piece with nothing left in the ground.
- **Maps**: the key (symbols beside their names) and the scale bar as art
  with its numbers, not run-on text in white boxes.
- **Label colours**: small and rotated labels in the source's colour.
- **Empty frames**: no box or frame without content (the Sandbox shows a
  placeholder on each; `composed_check.py` fails on them).
- **Shrunk text**: no frame set smaller than written (the check warns);
  fix the measure, do not lower `fit.minScale`.

`compare_pages.py --score` measures likeness in pixels, so it can improve
while a page reads wrong (a caption beside the wrong photo costs almost
nothing): use the score to catch regressions, and the review to accept a
page.

Build the PDF (`postext pdf my-book -o /tmp/my-book.pdf`, or `render.mjs --out`)
for the print checks and once at the end, not on every iteration.

Before delivery, audit that PDF against the source attribute by attribute
(verification.md §3):

```bash
python3 scripts/port_audit.py source.pdf /tmp/my-book.pdf --source-pages 23-40 --port-pages 1-18 \
    --json /tmp/audit.json --md /tmp/audit.md
```

It matches the words of both by content and counts, per attribute and
page, the special spaces lost, italic (a sheared upright face included),
bold, small capitals, bullet size and weight, table cell alignment and
weight, and the colours of folios, running heads and text that differ.
Fix each gap at its cause, or name it in the report as a choice or an
engine limit.

Fix the config or the Markdown until you reach:

- zero lint errors, and `preset_kit.py lint` clean (no content in the
  config, config under 1 MB);
- with composed pages, `composed_check.py check` passed in every edition
  (no `frameOverflow`, 0 overlaps, reading order = source order, the stress
  test), and the report lists every `overlap: "allow"` frame and recorded
  exception with its reason;
- with composed pages, every page reviewed side by side against the
  checklist above;
- `converged=true`;
- no warnings;
- `port_audit.py` at 0 in every attribute, or each gap left named in the
  report;
- the same page breaks on most pages, within ±1 page per chapter.

A right-bound book reads its spreads right to left: compare page by page,
and when you look at spreads, the source's odd page is the left one.

### 8. Deliver

**Hard rule for composed pages: no `pack` while `composed_check.py check`
exits non-zero.** Run it on the book with `--json-out work/check.json`
(never `--json > file`, which hides the report and the exit code). Each
failure is fixed; each overlap is fixed with a move the check lists, set to
`overlap: "allow"` when the source prints it so, or recorded with its
reason in `composed-check.json` and raised with the user in the report.
`unknownConfigKey` and `unknownConfigValue` fail too: a misspelt setting
changes nothing on the page. Read every WARN line it prints. `preset_kit.py
pack` refuses while `work/check.json` (or `--check FILE`) says the check
failed; `--ignore-check` is for the user to choose, not for you.

```bash
python3 scripts/composed_check.py check my-book --stress 1.3 --json-out work/check.json   # exit 0 before packing
python3 scripts/preset_kit.py pack my-book --manifest-only   # my-book.postext: preset.json and the files it names
python3 scripts/preset_kit.py lint my-book.postext --max-size 1   # no content in the config, config under 1 MB
```

and `postext check my-book.postext --locale <lang>` for each locale (with
composed pages, `composed_check.py check my-book.postext`). Every edition
goes in this one bundle: chapters per locale, templates, styles and
anchors shared.

`pack` without `--manifest-only` zips the whole folder except `source/`,
scripts, dot files and caches: a `work/` folder, label sources or tool
outputs would ship too (`--exclude GLOB` leaves more out).

When the brief asks for other files, write them from the delivered bundle:
`postext epub` (fixed or reflowable, checked with EPUBCheck), `postext html`, a press
`postext pdf` (`--pdfx`, `--profile`) and `postext docx` for an editor who works in
Word; a SCORM package for a learning platform comes from the Sandbox's SCORM tab or
`postext-scorm` (configuration.md §21, "Delivering EPUB, HTML and PDF files"; sources.md § Word).

Import it at https://postext.dev/en/sandbox (Books → New → Open a .postext file…). A
bundle with several languages is kept whole as one book (postext ≥ 1.39: the
editions sit beside the one open, switchable from the Books row, the edition
bar and the permalink `#project=ID&lang=L`; earlier the import asked for one
language and the new book held that edition only, so each edition was
imported to look at it). Each edition takes its title
from `localized.<lang>.name` (postext ≥ 1.34.1, #891; earlier, the
manifest `name` in every language). Or
serve a presets folder to a local sandbox (`preset_kit.py index <root>` +
`POSTEXT_PRIVATE_PRESETS_DIR`). The same file loads in the user's own
program through the `postext` npm package (`openBundle` → `buildBundle` →
canvas, HTML or `postext-pdf`); see
[project-format.md §7](references/project-format.md#7-bundles-from-code).
In the Sandbox, open the **Folio** tab to see the book bound, on the
paper and binding of `config.folio` (Design → Folio). Report what matches,
the known gaps, and anything that needs a human decision (rights, design
choices).

## Bundles from code

The `.postext` file is the hand-off point between this skill, the Sandbox
and code. The `postext` package reads and writes it (`openBundle`,
`createBundle`, `buildBundle` and backend adapters; details in
[project-format.md §7](references/project-format.md#7-bundles-from-code)).
Use it when:

- **the user renders from their own program**: deliver the `.postext` and
  show the loading snippet instead of asking them to rebuild the config;
- **the source is produced by code** (a JS/TS pipeline, a CMS export):
  write the bundle with `createBundle` from that code instead of
  `preset_kit.py`, so the program stays the source of truth;
- **debugging a program's output**: have the program write its book with
  `createBundle`, import it in the Sandbox, fix config/Markdown/resources
  there with the live preview, export, and load the corrected file back
  (`openBundle`) — or copy the manifest's `config` (defaults already
  stripped) back into the code.

`render.mjs` accepts a packed `.postext` as well as a project folder, and so
does `postext`: run `postext check my-book.postext` and
`postext images my-book.postext --pages '#1-#4' -f jpeg -o /tmp/final` on the
delivered file before handing it over.

## Rules of thumb

- **Config and Markdown only, and content only in the Markdown.** Never
  hard-code a book in the engine. If Postext cannot express something,
  choose the closest expression that keeps the text in the Markdown and note
  it as a gap; if the only way left would put content in the config, stop,
  write the gap as an issue draft and ask the user (see the hard rule).
- **Measure, don't guess.** Every number in the generator has a source page.
- **Let it grow with the text.** When Postext can express something as a
  size that follows its content (auto heights, widths as fractions of the
  measure, spacing in lines or em, boxes, tables and chips that size to
  what they hold), prefer it to a fixed size copied from the source. Keep
  whatever can reflow reflowable: live text over text baked into images,
  real tables over pictures of tables, `:::space` and style spacing over
  empty paragraphs, no hard line, column or page breaks the flow would
  produce anyway. The text will be edited, translated and set at other
  sizes; a fixed size that only fits today's wording breaks then. Fix a
  size only where it is the design itself (page and type area, a cover, a
  band or plate of set height, a comics panel) or where reflow makes no
  sense, and note why.
- **Draft, then curate.** Extractors produce drafts. Never re-run an
  extractor over curated chapters.
- **Semantic ids and styles.** Name things by role (`keypoints`, `band`,
  `fig-cohort-study`), never by number or position.
- **Iterate in watch mode and look at JPEGs.** One `postext build … --watch`
  on the unpacked project and the pages at hand: change, wait for the
  rebuild, look, change again, until the page is right; then stop it.
  Never build a PDF and rasterise it, or screenshot a browser, just to see
  a page, and do not start a fresh render for every look.
- **The book is an object too.** Set `config.folio` (paper, binding,
  covers) from the source's specification; layout ignores it, so it costs
  nothing to get right (playbooks A11).
- **Fidelity where it matters.** Match the grid, type, openers, boxes, figure
  placement and page breaks. Don't chase individual line breaks: never copy
  the source's line ends into the paragraphs.
- **Translation is translating Markdown.** One bundle, one design: chapters
  per locale (`chapters.<lang>`), `localized.<lang>.resources` for captions,
  alt text, tables and live-text SVGs. The design is two layers
  (`configVersion` 21): `config` holds the general settings every edition
  reads, and `localized.<lang>.config` only the fields that language sets
  differently (locale, faces for its script and their size, hyphenation,
  labels, a side written as left or right), merged over `config` field by
  field. A change to the page, the grid, the colours or a style then
  reaches every edition (project-format.md §2). Run `postext check` for
  every locale. The same extraction code for every source edition.
