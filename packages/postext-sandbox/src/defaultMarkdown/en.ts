export const DEFAULT_MARKDOWN_EN = `---
title: "Postext"
subtitle: "A programmable typesetter for the web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Open-source layout engine · The guide" publisher="postext.dev · MIT licence · Every page of this book was set by Postext in your browser"}

# Contents {style="contents" toc="false"}

:::toc

:::callout{type="colophon"}
**The Postext Guide** is the sample book that ships with the Sandbox. It is both a tour of the engine and a demonstration of it: the cover, the self-numbering contents, the part dividers, the chapter openers, the running heads, every figure and table float — all of it is laid out by Postext, in your browser, from the Markdown you can open in the editor.

Set in Fraunces, Lora, Bricolage Grotesque, Geist and Geist Mono, served by Google Fonts. The diagrams are plain SVG files, drawn as vectors in the canvas, the HTML view and the PDF. Change anything — a word, a margin, a colour of the palette — and the book sets itself again.

Postext is open source under the MIT licence. Text © 2026 Ignacio Ferro and the Postext contributors.
:::

:::part{number="I" title="Foundations" palette="band=#2b4acb"}
1. Why Postext
2. How the engine works
:::

# Why Postext {lead="Print typography spent five centuries learning how to set a page; browsers learned how to lay out an interface. Postext brings the first to the second: a layout engine that turns Markdown into pages set to editorial standards." summary="The gap between the web and the page, and what fills it"}

Postext is an **open-source layout engine** that brings the craft of professional print typography to the web. It takes **semantic content** written in enriched Markdown and a configuration object, and computes a fully resolved layout:index{term="configuration"} in which every line, heading, figure and table has a precise position, measured in real typographic units. That layout is then drawn by three renderers — a live canvas preview, positioned HTML and a print-ready PDF — which all read the same geometry, so what you see on screen is exactly what goes to press, and written as an EPUB 3 e-book from the same pages.

This book is its own demonstration. Its cover, the contents page that numbers itself, the part dividers in four colours, the band that opens each chapter, the running heads at the top of these pages and every figure that floats into place were all laid out by Postext, in your browser, a moment ago. Nothing here was placed by hand: the Markdown only says what things are, and the configuration decides how they look. Given another configuration, the same text would come out as a pocket paperback or a magazine.

:::callout{type="try"}
Open the **Text** panel and pick this chapter in the chapter switcher at its head. Change a word in this paragraph, or delete a sentence: the page sets itself again, the columns rebalance and the page numbers of the following chapters follow.
:::

If you would rather watch first, :ref{id="postext-showreel"} covers it in two minutes; in the Folio view it plays on the page itself. It follows one chapter from the Markdown in the editor to the canvas preview, its pages turning in the Folio viewer and the PDF that comes out at the end.

## How to read this book

The book is organised in four parts. **Foundations**, the part you are in, explains the problem Postext solves and how the engine is built: what goes in, what comes out and what happens in between. **The craft** is about typography: how a line is set, how a page is framed, where figures, tables and boxes go, how a set of chapters becomes a book and how one book lives in several languages. **Beyond running text** sets pages that are not a flow of columns: composed pages, comics, music and exercises. **In practice** turns to the tools: the document format, the Sandbox, the outputs and the press, the command line and the agents, and the project around them.

Each chapter opens with a short introduction on its band, and most of them close their sections with a box headed _Try it in the Sandbox_: a small experiment you can run on this very book, right now, to see the feature at work. Nothing in them can break anything — **Restore the original…**, in the menu of the guide's row in the **Books** panel, brings it back as it shipped — so change freely. The chapters can be read in any order; when one depends on another, it says so.

## Application layout and editorial layout

Modern CSS is a remarkable tool for building user interfaces. Flexbox, Grid, container queries and anchor positioning give developers fine control over how components are arranged in a viewport. But CSS was designed for _application layout_, and long-form reading needs _editorial layout_. The two are different problems:

- **Application layout** arranges interactive components — buttons, forms, cards, navigation — inside a viewport the reader scrolls freely
- **Editorial layout** flows text, figures, tables and callouts across a sequence of fixed pages and columns, following rules refined over centuries of print

The contrast in :ref{id="feature-comparison"} summarises where the two approaches diverge for long documents. (Mentioning it is enough: the table floats into the first free slot after this paragraph by itself, and you never place it twice.)

The difference is one of kind, not degree. An interface adapts to the window that holds it, and the reader moves through it at will; a page, by contrast, has a fixed size, a beginning and an end, and everything it holds must be resolved within those limits: what fits in this column and what moves to the next, where each figure goes, how each line and each paragraph ends. Those decisions are what make the quality of a book, and none of them can be taken by looking at a single element in isolation, however carefully each one is styled.

CSS handles the first case brilliantly. For the second, the platform has never offered the primitives that matter:

1. **Balanced columns that know about their content.** The CSS _columns_ property flows text, but it cannot level columns by adjusting the space above headings or the looseness of a paragraph; it has no notion of a figure or table that must float to the head of the next free column, and it cannot keep a heading with the paragraph it introduces across a column break.
2. **Paragraph-end and column-end defects.** _Orphans_ and _widows_ exist in CSS, but browser support is uneven and they do not see the geometry of the whole page; and there is no rule for a _runt_, the short word left alone on the last line of a paragraph.
3. **Whole-paragraph line breaking.** Browsers break lines greedily, one at a time, and can only spread the leftover space inside each line, while balanced justification needs the entire paragraph weighed at once.
4. **A shared vertical rhythm.** Books and magazines set every line on a baseline grid shared by all the columns of a page, and CSS has no primitive that snaps lines to a grid across columns and pages.
5. **The apparatus of a book.** Running heads that know the chapter, page numbers in roman or arabic sequences, parity-aware chapter breaks and a table of contents with real page numbers: none of these exist in a scrolling document.

:::callout{type="quote" placement="top"}
_Editorial typography is a constraint satisfaction problem. The browser was never given the language to state the constraints._
:::

CSS describes the _appearance_ of any single region of text in great detail. What it lacks is _global optimisation_: the ability to weigh a whole paragraph, a whole column and a whole page before committing to any of them. A browser settles each box as soon as it meets it, and never goes back to move a line once the next box has been laid out; a typesetter goes back all the time, because a decision taken at the foot of a page can undo one taken at its head.

## What existing tools miss

Other tools address parts of the problem. Word processors paginate. Adobe InDesign offers complete editorial control. LaTeX remains the reference for academic and mathematical typesetting. But none of them were designed for the web, and their assumptions make them hard to fit into a modern development workflow:

- They cannot be embedded as a component of a web application
- Their output is static, and rarely keeps the semantic structure accessibility tools rely on
- Their source formats are proprietary, binary or hard to generate programmatically
- They live outside the frontend toolchain a web team already uses

Postext takes a different position, summarised in :ref{id="tools-comparison"}. It is a **JavaScript library** that runs in the browser, reads Markdown, applies the rules of professional typography and hands back a layout you can render as canvas, HTML or PDF, or write as an EPUB e-book. It is meant to be embedded, configured and extended by developers who want publication-grade pages without leaving their tools — and configured by designers who never need to touch the code.

## A craft with a long memory

The rules Postext follows were not invented for it. A comfortable line holds between 45 and 75 characters, which is why long texts are set in columns instead of lines as wide as the page. Text is justified or ragged, but in either case its texture must be even, without the gaps that open into rivers when too many loose lines are stacked. Every line of a page sits on a common baseline grid so that lines face each other across the gutter and show through the paper in register. Headings stay with the text they announce, a paragraph does not leave its first or last line alone at the edge of a column, and a figure appears after the sentence that mentions it, never before.

For centuries these rules were applied by hand, by compositors who read every page before it went to press. Desktop publishing turned many of them into software, but that software remained a separate world, with its own files and its own tools. What was never available was an engine that applied them automatically, from structured text, inside the environment where most reading happens today. That is the gap this book is about.

## Who Postext is for

Postext is useful wherever long, structured text has to look like it was designed rather than merely displayed:

- **Publishers and editorial teams** who want the same source to produce a print-ready PDF, a faithful on-screen edition and an e-book, without keeping separate layouts in sync
- **Documentation and education platforms** whose textbooks, manuals and courses need figures, tables, numbered references and mathematics set properly on every page
- **Developers** building reading experiences — reports, magazines, catalogues, generated documents — who want editorial quality from a library instead of a desktop application
- **Designers and typographers** who want to describe a design once, as rules, and see it applied consistently across hundreds of pages

## What Postext is not

Postext does not replace CSS for interfaces; it is a specialised engine for long-form, structured content. It is not a WYSIWYG editor: you write Markdown and describe the design, and the engine sets the pages. It does not load fonts for you: the engine measures with the fonts the browser already has, so a page must load its faces before laying out. And the layout engine is browser-only for now, because its measurements come from the canvas font metrics of a real browser; the PDF and EPUB writers, on the other hand, also run in Node.

# How the engine works {#engine lead="Markdown and a configuration object go in; a tree in which every line has a position in real units comes out. In between is a short pipeline that measures text without touching the DOM and iterates until the page settles." summary="Parsing, measuring, laying out, converging"}

The fastest way to understand what Postext can do is to follow a document through it. The engine is a pipeline, sketched in :ref{id="layout-pipeline"}, in which each stage refines one shared in-memory representation of the document. No stage hides behind an opaque format and none touches the disk. The pipeline is also pure: given the same content and the same configuration, it always produces the same layout, the same pages line for line.

## Content and configuration

Two things enter the pipeline, and both are meant to be read and edited by people:

1. **Content** in enriched Markdown
   - Headings, paragraphs, block quotes, lists, emphasis and mathematics
   - Directives for page breaks, page numbering, parts, callouts and the table of contents
   - References to resources — figures, SVG diagrams and tables — declared by id outside the text
   - Optional YAML front matter with the title, subtitle, author and date
2. **Configuration** that describes the design
   - Page size, margins, bleed and page numbering
   - Column structure, gutter and column rules
   - Body text, headings, lists, captions, tables and mathematics
   - Heading styles, paragraph styles, callout styles, parts and the contents page
   - Running heads, a named colour palette and the PDF output options

Keeping them apart is deliberate. The same Markdown can become a pocket paperback, a two-column magazine or a textbook with a side column simply by changing the configuration. That is the reason the engine refuses to bake visual decisions into the content.

## Parsing

The parser reads enriched Markdown and produces a flat list of blocks: headings, paragraphs, block quotes, list items, display formulas and the directives that shape the book. It does not decide anything about the layout. What it does is structure the input carefully: it joins the lines of a paragraph, tracks the nesting of lists, separates a heading's title from its attributes, resolves every \`:ref\` against the resources declared outside the text and records, for every block, the exact range of the source it came from.

Inline formatting is parsed at the same time. Bold, italic and their combination, superscripts and subscripts, inline mathematics, colour swatches and references become typed spans inside the paragraph, so that the measurement stage can give each one its own font and colour. Front matter at the head of the document is read as metadata — the title, subtitle, author and date — and made available to every design slot.

## Measuring without the DOM

Before the engine can place anything it must know how much room each element needs, and this is where the whole project begins. Measuring text in a browser normally means rendering it into the page and reading back its size, a reflow that can block the main thread for hundreds of milliseconds on a long document.

Postext measures through _pretext_:index{term="pretext"}, a DOM-free text measurement library that uses canvas font metrics and pure arithmetic. Its expensive step, preparing a text for a given font, is cached; laying it out at a given width is nearly free. The approach is 300 to 600 times faster than measuring through reflow, as :ref{id="measurement-speed"} makes vivid, and on top of it the engine's own measurement module adds rich runs of bold, italic and mathematics, hyphenation, justification and optimal line breaking. Every result is cached under a key that includes the text, the fonts, the width and every option that can change a line, so typing into one paragraph re-measures that paragraph and nothing else.

Font loading is the one part of measurement the engine leaves to its host. Measuring with a font that has not arrived yet would measure the fallback instead, and every line would move once the real face appeared. The library therefore expects fonts to be loaded before the first build, and offers a way to clear its measurement caches when a late font does arrive, so the next build measures again with the right metrics. The Sandbox does this automatically: it loads every family the configuration names, from Google Fonts or from the Fonts panel, before it lays out a page.

## A line breaker in WebAssembly

The part of the engine that does the most arithmetic is the line breaker, which weighs every way of breaking a paragraph. It is written in Rust and compiled to WebAssembly:index{term="WebAssembly"}, a module of about thirty kilobytes inside the package, and it chooses exactly the breaks the TypeScript version would, so a book sets the same with either. The breaker runs two to three times faster that way, and a whole book lays out about fifteen per cent faster. Where WebAssembly is blocked, the TypeScript breaker answers instead, and nothing on the page changes.

## Seven passes and a loop

The layout itself runs in seven passes:

1. **Content structuring** parses the Markdown into a flat list of blocks and resolves resources by id
2. **Text measurement** sets every paragraph into lines at the width it will occupy
3. **Page and column placement** fills pages and columns, reserving room for running heads and page-wide boxes
4. **Resource placement** floats every referenced figure and table into the first free slot after its reference
5. **Typographic refinement** applies the rules that keep headings with their text and lists with their introductions
6. **Column balancing** levels the columns of each page
7. **Vertical rhythm** snaps text back to the baseline grid after anything that breaks it

These passes depend on each other in circles. Keeping a heading with its paragraph can push both into the next column; that move can strand a widow; fixing the widow pulls a line back, which may separate the heading again. Postext resolves the circle with the **convergence loop**:index{term="convergence loop"} of :ref{id="convergence-loop"}: passes three to seven repeat, marking only what changed, until nothing moves. The loop is capped at five iterations and typical documents settle in one or two. A score of typographic violations follows every iteration, so if the cap is ever reached the engine keeps the best layout it found, not the last one.

The rules applied in these passes are deliberately few and strict. A heading is always kept with the first lines of what follows it. A paragraph that ends with a colon is kept with the list it introduces. A figure and its caption are never separated. A page-wide box divides the page into bands, and the columns of each band are balanced on their own, so text above a wide table reads down both columns before crossing below it. When two of these rules cannot both be satisfied, the one that damages the page least wins, and the choice is made the same way every time.

## One keystroke, followed

It helps to see what happens when you type a single letter into a paragraph of this book. The editor records the change and the chapter's Markdown is parsed again, which is cheap. Every block except the one you touched finds its measurement in the cache; the edited paragraph is set again at its column width, perhaps gaining or losing a line. The layout of the chapter is rebuilt from those measurements, off the main thread, and the loop runs until the page settles — usually once — before the preview draws the result.

Because each chapter is laid out on its own, continued from the ones before it, the rest of the book is not touched unless the chapter's page count changes. When it does, the following chapters are paginated again in the background, and the contents page picks up their new page numbers.

:::callout{type="figures" title="The engine in figures" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** faster text measurement than reflowing the DOM. Pretext measures with canvas font metrics and plain arithmetic, which is what lets a whole chapter be set again between two keystrokes.

**7 passes** turn Markdown into positioned pages: structuring, measurement, page and column placement, resource placement, typographic refinement, column balancing and vertical rhythm.

**5 iterations** at most in the convergence loop, and usually one or two. Should the cap ever be reached, the engine keeps the best layout it found along the way, not the last one.

**8 languages** hyphenated with the Liang patterns TeX has used since 1983: English, Spanish, French, German, Italian, Portuguese, Catalan and Dutch.

**4 outputs** — canvas, HTML, PDF and EPUB 3 — come from one and the same layout, so the page you proof on screen is the page that goes to press.

**0 reflows** of the page while laying out. Everything is computed in memory, in a worker when the host asks for it, and the same input always yields the same pages.
:::
:::

Balancing converges segment by segment, between chapter openers and explicit page breaks. The result is a guarantee that matters for books: a chapter laid out on its own and the same chapter inside the whole book come out identical, page for page.

## The virtual document tree

:index{term="VDT (virtual document tree)"}What survives the loop is the **VDT**, the virtual document tree: pages that hold columns, columns that hold blocks, blocks that hold lines, each with its box in real units, alongside a flat list of every block for quick access. The tree is pure geometry — it knows nothing about canvas, HTML, PDF or EPUB — and that is exactly what lets every renderer draw matching output. Every line also remembers the stretch of Markdown it came from, which is how a click on the page puts the editor's cursor on the right word.

Pages also record what they are for. A page can be a body page, a chapter opener, a part divider or a blank page inserted to reach the right parity, and that role is what lets running heads, folios and decorations choose where to appear. Page labels — the printed page number in its sequence — are computed once, in the tree, so the canvas, the HTML and the PDF agree on them without doing their own counting. A preface numbered in roman numerals and a body that restarts at one need no special case in any renderer: each prints the label the tree gives it.

## Off the main thread

A layout can take longer than a keystroke, so the engine can run in a Web Worker:index{term="Web Worker"}. The worker keeps its own measurement cache between builds and cancels cooperatively: when a new build is requested, the previous one stops at its next checkpoint and the last request wins. The Sandbox lays out every view this way, and the PDF and EPUB writers have workers of their own, so the interface stays responsive while a whole book is being set or written.

:::callout{type="note" title="In code"}
\`buildDocument(content, config)\` returns the VDT. \`renderPage\` draws a page on a canvas, \`renderToHtml\` returns positioned HTML, and \`renderToPdf\` from the _postext-pdf_ package returns the bytes of a PDF — of one document or of a whole book passed as an array of chapters. \`renderToEpub\` from _postext-epub_ writes the same chapters as an EPUB 3 file. \`createLayoutWorker\` from _postext/worker_ runs the build off the main thread.
:::

:::part{number="II" title="The craft" palette="band=#8f6408"}
3. Setting the line
4. The page and its columns
5. Figures, tables and floats
6. Boxes, notes and marks
7. Books, parts and running heads
8. One book, many languages
:::

# Setting the line {lead="A paragraph is set as a whole, not one line at a time. Postext weighs every possible way of breaking it, prices spacing, hyphens and stray words, and chooses the set of breaks that costs least." summary="Optimal line breaking, hyphenation, spacing and the defects it avoids"}

The quality of a page is decided first in its paragraphs. A browser breaks lines greedily: it fills a line with as many words as fit, moves on, and can only spread the leftover space inside each line. Postext implements the **Knuth-Plass algorithm**, the optimal line breaker that has powered TeX since 1981. It evaluates every feasible way of breaking the whole paragraph and picks the one that minimises the total cost, so spacing stays even from the first line to the last, and no line pays for its neighbours.

## Boxes, glue and penalties

:index{term="Knuth–Plass line breaking"}The algorithm sees a paragraph as a sequence of three primitives, drawn full width in :ref{id="knuth-plass-model"}:

- **Boxes** are words or pieces of words, with a fixed width
- **Glue** is the space between words, with a natural width and a capacity to stretch or shrink
- **Penalties** are possible break points with a cost; a _flagged_ penalty marks a hyphenation point and draws a hyphen when it is used

For every candidate line the engine computes an adjustment ratio $r$, how far the glue must stretch or shrink to fill the measure, and a badness that grows with the cube of it, $b = 100\\,|r|^3$. Lines are sorted into four fitness classes — tight, normal, loose and very loose — and each break is charged its demerits:

$$
d = (1 + b + p)^2
$$

where $p$ is the penalty of the break. Two hyphenated lines in a row cost an extra 3000, and a jump of more than one fitness class between neighbouring lines costs 100, so the optimiser prefers paragraphs whose texture changes gently. Should no feasible set of breaks exist, the engine falls back to greedy breaking rather than failing.

## Why the whole paragraph matters

Consider a paragraph whose first line happens to end right after a long word. A greedy breaker takes the break, because it fits, and moves on. The second line then starts with a run of short words, cannot quite be filled, and has to be stretched; the third inherits the problem and ends with a hyphen; the last line ends up holding a single word. None of these defects is visible from the first line, which is the only one the greedy breaker looked at.

The optimal breaker sees the whole chain. It may decide to end the first line one word earlier, slightly looser than it could be, because that choice lets the second line fill naturally, removes the hyphen from the third and brings a second word down to the last line. The paragraph as a whole is better even though its first line, taken alone, is not. That is the essence of the Knuth-Plass algorithm, and the reason it produces the even grey texture readers associate with well-set books.

## Hyphenation

:index{term="hyphenation"}Hyphenation uses the same **Liang patterns** TeX has relied on since 1983, served by the _Hypher_ library, in eight languages: English, Spanish, French, German, Italian, Portuguese, Catalan and Dutch. The document's language is set once, at the top of the configuration, and also tags the PDF for screen readers. Patterns leave at least two letters before a hyphen and three after it, so words shorter than five letters are never divided, and each hyphen is a flagged penalty of 50 that the optimiser can accept or refuse.

Hyphenation only runs on justified text, where it earns its keep. Two break opportunities are always available, whatever the setting: a hard hyphen between two letters is a legitimate break, and a word wider than the whole measure is divided at the last syllable that fits, or at the last character if it has to be.

Soft hyphens typed in the text are honoured as break points, and at the same price as the pattern's own. Catalan follows the rules of the Institut d'Estudis Catalans: a word with a geminated _l·l_, such as _col·lecció_, divides between the two _l_, and the hyphen takes the place of the middle dot, _col-_ at the end of one line and _lecció_ at the start of the next. The language can also change within a book: every chapter shares the configuration's language, so an edition in several languages, like this one, is configured once per language, and each version of the guide hyphenates by its own rules.

## Word spacing and ragged lines

Two settings bound how far a space may stretch or shrink: \`maxWordSpacing\`, by default twice the natural space, and \`minWordSpacing\`, 0.6 of it. Stretching past the maximum is priced above any other defect, so the breaker will hyphenate, move a word or accept a runt before it opens a river. Some lines cannot be filled at all — a long URL, the unbreakable tail of a list item — and rather than opening them into gaps three times the natural space, the engine sets them ragged at natural spacing. The last line of a paragraph is always ragged, except when it is overfull: then its spaces compress to fit, exactly as TeX sets glue.

## Chinese and East Asian text

:index{term="Chinese typesetting"}Chinese is written without spaces between words and is never hyphenated: a line may end between almost any two characters. A paragraph that holds more Chinese, Japanese or Korean characters than word spaces does not go through Knuth-Plass; the **CJK composer** sets it one line after another. What it has to respect are the rules for the ends of lines: a comma, a full stop or a closing bracket never opens a line, and an opening bracket never ends one. How strict they are depends on the region, which the document language gives — \`zh-Hans\` follows the mainland standard, GB/T 15834, and \`zh-Hant\` the practice of Taiwan and Hong Kong — and \`cjk.lineBreak\` sets the level by hand. Some runs are never split: a two-em dash or ellipsis, a number with its unit. A Latin word or a web address set among the characters moves to the next line whole, unless it is wider than the line; then the word is divided, and the address is cut after a slash or before a dot.

Each Chinese punctuation mark sits in a square of its own, half of it ink and half blank, and how much of the blank a book keeps is a matter of house style, shown in :ref{id="cjk-composition"}. Taiwan keeps every mark a full square. Hong Kong sets its marks a full square too, but closes up most pairs of marks that meet, and a bracket that opens or closes a line loses its outer half. The mainland's Kaiming style, the default for \`zh-Hans\`, sets commas, brackets and quotation marks in half a square and keeps the full stop whole except at the end of a line; where two marks meet, the blank between them goes as well. The style is set with \`cjk.punctuationWidth\`, and the two adjustments are switched with \`cjk.compressAdjacent\` and \`cjk.trimLineStart\`; \`cjk.hangingPunctuation\` lets a comma or a full stop hang past the end of the line. The \`cjk\` settings, with the document language and the writing mode, are in the **Writing system** group of the **Design** panel.

A justified Chinese line is filled in a fixed order: first the spaces between Western words, then the quarter of an em the engine sets between Chinese and Latin text (\`cjk.latinSpacing\`; it is never typed), and last every gap between two characters, never inside a Latin word or a number. When a character may not open the next line, the composer first tries to take it into the line by giving up blank from the marks already on it, and only when that fails carries the character before it down to the next line. A line that would need more than half an em between its characters is left short, and the **Checks** panel reports it as a CJK line set short.

The rest of a Chinese book follows the same settings. Chapter templates, page numbers, lists and counters accept the Chinese numeral styles, such as \`cjk-decimal\`, \`simp-chinese-informal\` and \`trad-chinese-informal\`, so chapters can be named by their Chinese ordinals; figures and tables take their Chinese names and are numbered by chapter with a hyphen. \`cjk.grid\` sets the type area as a number of characters per line and lines per page, the grid Chinese books are designed on. The Chinese edition of this guide is set vertically and bound on the right, as Chinese books were printed for centuries: it names its chapters by their Chinese ordinals, prints its folios in Chinese numerals and numbers its figures and tables by chapter; its row in the **Books** panel has a language button of its own. Among the sample books, _Dream of the Red Chamber_ is a whole novel set in Chinese, and its Traditional edition is set vertically on a grid of 38 characters by 15 lines.

\`layout.writingMode: 'vertical-rl'\` sets a book vertically. Lines run from top to bottom and follow each other from right to left, two columns become two tiers stacked on the page, figures and tables stay upright, Latin words and long numbers turn on their side, and each mark takes the place or the form it has in vertical text: brackets and quotation marks take their vertical forms, and the full stop moves to the top right of its cell on the mainland and stays centred in Taiwan and Hong Kong. Such a book is bound on the right (\`page.binding\`): its first page stands alone to the left of the spine, and the Sandbox shows its spreads from right to left. The canvas and the PDF set the same vertical lines; the HTML view breaks its own lines to the height of its page, and stands each character upright or turns it as they do. By default \`cjk.uprightDigits\` stands a number of up to two digits upright in a single cell, and it can be raised to three or four; \`:tcy[…]\` does the same for any short run.

Chinese books also mark text in ways Latin type has no use for. Emphasis is shown by a dot beside each character, not by italics, so in a Chinese document \`*…*\` sets emphasis dots on the Chinese characters it holds, as \`:dots[…]\` does; \`cjk.emphasis: 'italic'\` keeps italics. \`:name[…]\` draws the straight line of a proper name, and \`:book[…]\` marks the title of a book, and \`cjk.bookTitleMark\` chooses how: the double angle brackets of the mainland or the wavy line of Taiwan and Hong Kong. \`:ruby[…]{rt="…"}\` sets a reading, pinyin over the characters or zhuyin to the right of each one, and \`:warichu[…]\` sets a note in two half-size rows inside the line, carried on to the next line or page when it does not fit. None of them changes the leading: the **Checks** panel says when dots, lines or readings need more room between the lines than the paragraph leaves. In vertical text the dots move to the right of the column, the lines to its left, and the right row of a note is read first.

## Arabic and right-to-left text

:index{term="Arabic typesetting"}Arabic, Persian, Urdu and Hebrew are written from right to left, and Postext sets them from the same Markdown and configuration as any other language. The document language decides it: with \`locale: 'ar'\` the lines start on the right, the first column is the right-hand one, the book is bound on its right edge and its spreads read from right to left. The engine lays such a page out as a left-to-right page and then mirrors it whole, painting every word, image and formula the right way round, so a design made for an English book works unchanged: a setting that names a side means a side of the text, and \`start\` and \`end\` are accepted as plain names for it. Running heads and folios stay on the sheet, where a designer expects them.

Inside a line, numbers, Latin words and quotations still read from left to right. The order of those runs is decided by the Unicode Bidirectional Algorithm, implemented in full; the text is stored, searched and copied in the order it was typed, and only the painting is reordered. Brackets and guillemets are mirrored in right-to-left runs. A block set against the book's direction takes \`{dir=ltr}\` or \`{dir=rtl}\`, and a run of text \`:ltr[…]\` or \`:rtl[…]\`, an isolate whose full stop no longer wanders to the wrong end of the line.

Arabic letters join, and each takes the form its neighbours ask for, so a word is measured and painted as one shaped string, never letter by letter; the PDF shapes it with HarfBuzz and maps every glyph back to its characters, so copied text and screen readers get the words that were typed. Three rules follow: no hyphenation, no letter spacing, and no cut inside a word, which overflows the line and is reported rather than divided. Justified lines are stretched at their spaces first, then by **kashida**, the elongated joins a calligrapher draws between two connected letters, placed only where the Naskh rules allow one and left out of the copied text. The line breaker counts that elongation as stretch, so it chooses its breaks knowing where a line can widen. Emphasis is set in bold, since Arabic type has no italics, and the engine never slants an Arabic letter.

Vowel marks stack over and under the letters, in the leading, which never grows on its own: the **Checks** panel reports a paragraph whose marks would touch the line above, with the leading it would need. Generated numbers — folios, chapter, figure and note numbers — take the digits of the region, Arabic-Indic in the east of the Arab world and European in the Maghreb, while numbers the author types are never rewritten; a heading can spell its number as an ordinal word, and front matter can count in the abjad order of the manuscripts. Classical poems are written in \`:::verse\`, one verse a line with its two halves separated by \`||\`: every half is brought to one width, with kashidas first, so the rhymes line up down the poem. The Arabic edition of this guide is set this way, bound on the right, and among the sample books _One Thousand and One Nights_ sets the whole work in Arabic, in the manner of the Bulaq press.

## Emphasis and runs

A paragraph is rarely a single run of text. Bold, italic and bold italic are set in the real faces of the family — a true italic, not a slanted roman — each measured with its own metrics, so a word in bold takes exactly the room it needs. The colour of bold text, italic text and references can be set separately; in this book, references to figures and tables are set in bold in the part colour, so they are easy to find on the page and in the PDF, where they are also links.

Superscripts and subscripts are set smaller and shifted from the baseline without disturbing the leading, and inline colour swatches sit on the baseline like a letter. All of these are atomic: the line breaker can break before or after them but never inside them, so a formula or a swatch never ends up split across two lines.

Two more runs set words apart without a face of their own. \`:smallcaps[…]\` sets small capitals drawn from the face's capitals, the same way in every output, for acronyms and the names of the characters in a play. \`:chip[…]\` sets a word in a small rounded box that flows with the line — keyboard keys, tags, the word bank of an exercise — styled by name, never broken inside, and with words that stay real text in the HTML and the PDF.

Numbers have styles too.:index{term="figure styles"} A face can draw its figures lining, as tall as capitals, or old-style, rising and falling like lower-case letters, and proportional or tabular, all the same width so that columns of numbers line up. \`figureStyle\` chooses among them for the body, a paragraph style, a heading level, a table or a caption: old-style figures in the running text, where lining ones would shout, and tabular lining figures in a table of results. A face that does not draw the style asked for keeps its own figures.

## Orphans, widows and runts

:index{term="widows and orphans"}An **orphan** is the first line of a paragraph left alone at the foot of a column; a **widow** is its last line carried alone to the head of the next. Both break the reader's rhythm, and :ref{id="orphan-widow"} shows the two on either side of a column break. A third defect, the **runt**, is a last line holding a single short word, stranded under a full paragraph.

Postext prices all three. When a paragraph crosses a column, the engine compares every possible split and charges each one for the space it leaves unused, for an orphan and for a widow — 1000 by default, each, with at least two lines on either side. Runts are priced inside the line breaker itself, as badness, whenever the last line is shorter than twenty characters' worth of space. When a runt cannot be avoided by breaking differently, the engine can set the paragraph one line shorter instead, tightening word spaces within their minimum and, if needed, letter spacing by at most ten thousandths of an em. List items follow the same rules, with switches of their own.

## Lists

Lists follow the same discipline as paragraphs, with a typography of their own. Bulleted lists choose their bullet character, its size, weight and colour, and the gap and hanging indentation that keep the text of every item aligned; numbered lists choose between arabic numbers, lower or upper letters and lower or upper roman numerals, with a separator that can be styled on its own and numbers aligned to the right, so items 9 and 10 line up. Nesting goes five levels deep, each level with its own indentation and markers, and task lists draw a checkbox for every item, checked or not. Items can be kept tight or spaced, and the engine treats the end of a list as one of its levers when it balances columns.

:::callout{type="try"}
In the **Design** panel, search for _loose_ and turn on **Highlight loose lines**, in the **Advanced** group. Then narrow the columns or raise \`maxWordSpacing\` and watch which lines the engine has to open, and how the optimiser redistributes them.
:::

## Mathematics

:index{term="mathematics"}Formulas are first-class citizens. Inline expressions such as $e^{i\\pi}+1=0$ flow with the text, typeset by MathJax as vector paths that stay crisp at any zoom. When a formula is taller than the line allows, it is scaled down uniformly so the baseline grid survives, and the reader keeps the rhythm of the text however dense the notation. Display formulas sit on lines of their own, centred on the column, with their own margins, and the text that follows returns to the grid:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

The same paths are drawn by the canvas, the HTML view and the PDF, so formulas match in the three outputs and stay vectors in print.

A few more examples show the range of notation the engine handles, and what it does with each so the formula can live alongside the text. The first is an infinite series, the sum of the inverse squares that Euler solved in 1734. In a display formula the limits of the sum are set above and below the symbol, as in an analysis textbook, and the fraction of the result takes its full size instead of the reduced form used inside a line.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Matrices are another common test, because they require rows and columns to line up and the brackets to grow to the height of their content. MathJax sets the matrix as a table of centred cells and stretches the delimiters to span it; Postext receives the result as paths, measures its whole box and reserves exactly that room before returning the text to the grid. The determinant of a two-by-two matrix reads as follows.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

The normal distribution gathers in one expression almost everything that makes mathematical typesetting hard: a root with its bar, Greek letters, and a whole fraction inside an exponent, which has to shrink twice without becoming unreadable. It is the formula found in any statistics textbook, and here it is set by the same rules TeX would use.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Definitions by cases close the series. A brace groups the branches of the definition, each with its condition aligned on the right, and the brace grows with the number of cases. It is a frequent device in mathematics and computer science texts, and a good example of a formula that would not fit inside a line of text.

$$
|x| = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}
$$

Inline formulas follow other rules, because they must live with the words around them. The roots of $ax^2+bx+c=0$ are $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, Euler's product reads $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$, and the Fourier transform $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ stays on its line too. In all three cases the engine measures the formula's height and, when it exceeds what the leading allows, scales it down only as far as needed, so the lines around it keep their place on the grid and the paragraph keeps its texture. No formula breaks the rhythm of the page.

# The page and its columns {#columns lead="Pages are fixed, columns are finite, and every line should sit on a rhythm shared across the spread. This chapter is about the frame: page geometry, column structures, the baseline grid and the art of ending columns level." summary="Page geometry, columns, the baseline grid and balancing"}

Columns are the most visible expression of editorial design, and the place where homemade solutions break down first. Postext treats the page and its columns as first-class objects, with their own geometry, their own rhythm and their own rules for ending well.

## Page geometry

A page starts with its size. Postext offers the usual book and magazine formats as presets, listed in :ref{id="preset-sizes"}, and any custom size in centimetres, millimetres, inches or points; this guide is set on the 21 × 28 cm format. Margins can be **mirrored**, so the left margin becomes the inner one, by the spine, and swaps sides on every verso. For print production, the page can carry a bleed and crop marks, and a DPI setting controls the resolution of pixel-based measures.

Page numbers follow sequences: arabic, lower or upper roman, lower or upper alphabetic, each with its own starting number, so a book can number its front matter i, ii, iii and begin chapter one at 1. The PDF records the same sequences as page labels, so a viewer's page box reads exactly what is printed at the foot.

## Measure and leading

The two numbers that most decide how a page reads are the length of its lines and the distance between them. The configuration sets the body size and leading in real units — this book uses 9.4 points on 13.6 — and the column width follows from the page, the margins, the column structure and the gutter. A line of 45 to 75 characters is the classic target; much shorter and the eye jumps too often, much longer and it loses its way back to the next line. Two columns on a 21 cm page land comfortably inside that range, which is one reason the format is so common for magazines and technical books.

Leading is also the unit of the baseline grid. Every vertical distance that matters — the space above and below a heading, around a figure, between list items — is best expressed as a whole number of grid lines, or is corrected to one, so the page keeps a single rhythm from top to bottom.

## Column structures

Three structures cover most publications, sketched as page thumbnails in :ref{id="column-layouts"}:

1. **Single column** for novels, essays and focused reading
2. **Two columns** for magazines, reports and books like this one
3. **A column and a half**, a main column beside a narrower side column
   - The side column can carry text that continues from the main column
   - Or it can be a **float channel** that only holds figures, tables, captions and callouts, as in textbooks with an outer column of notes and diagrams

The gutter between columns is configurable, and an optional column rule can be drawn in it, with its own weight and colour. Page-wide elements — a figure, a table, a callout — cut through the columns: the text above them is split level across the columns, and the columns resume below.

## Headings

Headings are configured level by level, up to six levels deep: typeface, size, leading, weight, italic, capitals, colour, alignment and the space above and below each one. A level can be numbered with a template — \`{1}.{2}\` prints 4.3 for the third section of chapter 4, and formats such as \`{1:I}\` or \`{1:a}\` switch a level to roman numerals or letters. A level can also break to a new page, with the parity it asks for, and span the full width of the page instead of one column: that is what makes a first-level heading a chapter opener.

Headings are kept with what follows them, so a section title never waits alone at the foot of a column. They are also snapped to the baseline grid: a heading larger than the body takes the space it needs, and the text after it returns to the grid, so the columns on either side of the gutter keep facing each other line for line.

## The baseline grid

:index{term="baseline grid"}Professional books align the first baseline of every column to a shared vertical rhythm, and every line after it lands on the same grid, so lines face each other across the gutter. Postext snaps text to a baseline grid derived from the body leading, as :ref{id="baseline-grid"} illustrates. Elements that break the grid — a heading larger than the body, a figure, a display formula — are followed by the space needed to return the next line to it. The grid can be drawn as an overlay while you work, wherever there is text.

## Ending columns level

When a page ends in the middle of the text, its columns should end at the same height. That is **column balancing**:index{term="column balancing"}, and it is harder than it looks: lines come in whole grid steps, figures cannot be split, headings must stay with their text and paragraphs must not leave orphans behind. Postext levels a short column with three levers, used in order of preference and drawn in :ref{id="column-balancing"}:

1. **Space above headings**, one whole grid line at a time, distributed by importance and never at the head of a column
2. **A line after the end of a list**
3. **Looser paragraphs**: a paragraph set one line longer, TeX's _looseness_, accepted only if none of its lines stretches beyond the word-spacing limit; if it helps, a touch of letter spacing, at most ten thousandths of an em

Each fix is verified by laying the page out again, up to eight times, and the best result wins. A paragraph set one line longer keeps its words and only widens its spaces, so a short paragraph, with few spaces to widen, is seldom the one chosen. Some columns are left alone on purpose: the last column before a forced page break or a chapter opener, the last page of the document, a column with nothing to stretch. Two related rules level the closing columns of a chapter, and the columns above a page-wide box that moves or splits.

## Bands and page-wide boxes

A page is not always one set of columns from top to bottom. A page-wide figure, table or callout cuts it into **bands**:index{term="bands"}: the text above the box fills its columns as a band of its own, the box crosses the page, and the columns start again below it. Each band is balanced on its own, so the reader goes down the first column and up to the head of the second before crossing the box, as in a newspaper. When a band would end uneven, a **band cap** shortens its columns to the same number of lines, and the text that no longer fits flows on below.

The closing columns of a chapter get the same treatment. Rather than leaving the last page with one full column and one nearly empty, a trailing cap shares the remaining lines between them, and the balancing levers do the rest. Explicit column breaks are respected: \`:::columnbreak\` ends a column where the author wants it, and the balancer leaves that column's foot alone.

:::callout{type="try"}
In the **Design** panel, open **Headings & contents** and switch **Balance columns** off. Look at the foot of the columns of this chapter, then switch it back on and see which lever the engine used on each page.
:::

## Rules you choose

Some decisions are matters of house style rather than of right and wrong, and the configuration leaves them to the book. Should a short list of three items be allowed to break between two columns? Should a figure float onto a chapter opener? Each such **composition rule** takes one of three values.:index{term="composition rules"} :chip[allow]{style="state"} lets the engine do it, :chip[warn]{style="state"} lets it happen and adds an entry to the Checks panel, and :chip[avoid]{style="state"} makes the engine change the page so it never happens: the whole list moves on with its introduction, the float waits for the page after the opener. A rule set to warn is how an editor learns how often a book would break it before deciding. Both rules start at allow, so a configuration that never mentions them sets its pages as it always did, and a short list means up to three items unless the configuration names another number.
# Figures, tables and floats {lead="A reference is a promise, not a position. Mention a figure and Postext finds it a home: the first free slot after the mention, numbered in reading order, captioned, never before the words that call for it." summary="Where resources land, how they are numbered, tables that split"}

Everything that is not flowing text — images, SVG diagrams, tables — is a **resource**. Resources are declared outside the text, each with an id, a type, a caption and its placement preferences, and the Markdown simply mentions them. In the Sandbox they live in the Resources panel.

## One mention is enough

:index{term="floats"}Writing \`:ref{id="…"}\` in a sentence does two things: it prints the resource's label, and the first time, it _incorporates_ the resource, which then floats into the first free slot after the reference. The slots are tried in order, as :ref{id="float-slots"} shows: the foot of the column that holds the reference, then the head and the foot of the next free column, then a band on the next page. The text is never interrupted.

A handful of rules keep floats honest:

- A float never lands before its reference and is never shrunk to fit
- Floats of one numbering sequence keep their order, so figure 12 never appears before figure 11; a table waiting for room does not hold figures back
- Floats never escape their chapter: chapter openers, part dividers and the end of the document are barriers
- A float that would leave less than three lines of text on a fresh page waits for the next one
- Head and foot bands are aligned to the baseline grid, and a foot float's caption shares the last text line's baseline

## Placement

Each resource can state where it prefers to go, and each resource type has a default; the fields are gathered in :ref{id="placement-options"}. A resource can be embedded inline at a precise point too, when its position is _here_. And a table or figure too wide for the page can be turned a quarter turn, either way: it then takes a page of its own, set flush to the spine and sized to the page's height.

## Numbers and labels

Resource types define their own numbering sequences. Figures and tables are built in and localised to the document's language; a type can add a prefix, a short label, a template such as \`{h1}.{n}\` for chapter-relative numbers — figure 5.2 is the second figure of chapter 5 — a reset rule and a counter format. Numbers follow the **first reference in reading order**: insert an earlier mention and every number after it moves. A reference can print the number alone, the full label or the short one, change its case, or print text of its own.

Numbering stays correct across a whole book because it is part of what each chapter inherits from the chapters before it. The seventh chapter of this guide starts its figures at 7.1 because the chapter counter says so, not because anyone typed the number, and moving a chapter renumbers everything after it the next time the book is laid out.

## Types of your own

Figures and tables are only the two types every book needs. A configuration can declare as many resource types as a publication uses — maps, plates, boxes, charts, documents — each with a singular and a plural name, a short label for references, a prefix for its captions and a numbering sequence of its own. A catalogue can number its plates 1, 2, 3 through the whole book while its figures restart in every chapter. Each type can also carry its default placement and adjust the caption style, so plates can take a whole page with their caption above while figures float at column width.

## Tables

:index{term="tables"}Tables carry their model inline: rows of cells with column and row spans, header rows, alignment and relative column widths. Cells accept inline Markdown, paragraphs and simple lists, a fill of their own — this book's four part colours are :swatch{color="#2b4acb"} blue, :swatch{color="#8f6408"} gilt, :swatch{color="#1f7a6d"} teal and :swatch{color="#c0452f"} vermilion — and even an image. Tables are styled once, for the whole document: body and header typography, header fill, rules in a grid, horizontal only, outer only or none.

A table taller than the page splits across pages. Its header rows repeat on every part, the caption of each continuation gains a _(cont.)_ suffix, a _Continued_ marker closes every part but the last, and no split ever cuts through a row span. A rotated table splits the same way, page after page.

## Figures beside the text

In a column-and-a-half layout whose side column carries only floats, resources can live beside the text instead of inside it. A figure with the _side_ span stacks in the side column next to the paragraph that cites it; a callout can do the same, so textbooks can keep definitions, key concepts and marginal figures next to the lines they explain. A wide figure can also keep its caption beside it, in the side column, which is the classic arrangement of illustrated textbooks and exhibition catalogues. The showcase presets include a biochemistry textbook and a literary edition set exactly that way.

## Text that wraps round

:index{term="text wrap"}A picture or a box narrower than its column can stand at one side of it, with the text running beside it at the measure left over and returning to the full measure underneath, as in a magazine. The lines stay on the baseline grid, and the paragraph that starts beside the picture and ends under it stays one paragraph. A cut-out drawing can go further: with a **contour** wrap each line is set as short as the drawing is wide at its height, so the text follows the outline rather than the box. Headings, formulas and other figures do not run beside a wrapped item; they wait underneath it.

## Safe areas

A photograph rarely needs all of itself. A picture can mark its **safe area**:index{term="safe area"}, the rectangle that holds what matters, and the engine may then crop it anywhere between the whole picture and that rectangle, keeping its width. It uses that freedom to keep a picture in a column it would otherwise leave short, to fit a picture taller than the page, and to balance columns: a picture with a safe area can grow by whole lines to fill the foot of a short column, which leaves no visible hole. The safe area is drawn on the picture in the Resources panel, and comic panels use the same mark to know what never to cut.

## Captions and credits

A caption is the type's prefix, the number and the caption text — which accepts inline Markdown and references of its own. Captions go above or below their resource, optionally on a coloured bar, in the typeface and size of the caption style; the label can be bold or coloured, as in this book. A resource can also carry a note: a smaller credit or source line set under it.

## Vector figures

SVG diagrams are drawn as vectors everywhere. The PDF converts the common subset of SVG — shapes, paths, groups, clip paths, solid fills and strokes, opacity and text — into native drawing operations, and rasterises anything beyond it at 600 dpi; a figure can also bring a PDF master of its own, embedded as it is. For single-colour printing, a switch recolours every diagram as tints of one ink, by luminance, in all three renderers.

Text inside an SVG stays text. In the PDF it is set in real fonts and can be selected and searched, and in the Sandbox it can be edited in place: the Resources panel opens the diagram's source with only its text editable — the drawing itself stays locked unless you unlock it — so a label can be corrected or translated without opening a drawing program. The diagrams in this book are generated for each language, which is why their labels are Spanish in the Spanish edition, Catalan in the Catalan one, Chinese in the Chinese one, Arabic in the Arabic one and English in this one.

Three figures set here to prove the point. The rosette of :ref{id="vector-rosette"} is made of Bézier curves, hairline strokes and a line of microtext two and a half points tall; the chart of :ref{id="vector-chart"} combines a filled area, a dashed line and text labels; and :ref{id="vector-clip"} uses a clipping path, a group drawn with transparency and one shape reused five times. Open the PDF, zoom in to several times their size and look at the edges: they stay as sharp as the text around them, because they are drawn with the same operators, not pasted in as pictures. Try selecting the chart's labels, or searching for them: they are text.

:::callout{type="try"}
Click the caption of any figure in the canvas: the Resources panel opens on that resource, with its caption field ready. Change its placement from _auto_ to _top_ and watch it move.
:::

## Videos

:index{term="videos"}A video is one more resource. It is mentioned, numbered on its own (Video 1.1 next to Figure 1.1) and floats to the first free slot like a figure. It can come from YouTube or Vimeo, from a file kept in the book, or from a web address: an MP4 or WebM file, or an HLS stream.

Print carries its poster, a chosen frame, with a play mark and a QR code that opens the video; in the PDF the poster is also a link. The HTML view and the EPUB play it, except YouTube, Vimeo and HLS videos, which an e-book can only link to. In the Folio view a click on the poster plays it on the page, and it keeps playing while the leaf turns. The videos in this book, such as :ref{id="postext-showreel"}, are HLS streams.

# Boxes, notes and marks {#boxes lead="Around the running text a book keeps a second layer: boxes that set an aside apart, notes at the foot of the column, small marks inside the line and an index that remembers every page. Each is written in the Markdown and drawn by the configuration." summary="Callouts, nested and floated boxes, chips, footnotes and the index"}

Running text is only part of what a reader meets on a page. Textbooks frame definitions and exercises, essays drop their sources to the foot of the page, manuals mark keys and states inside the sentence, and long books end with an index. Postext treats each of these as content with a name, written where it belongs in the text, and leaves its look to the configuration.

## Callouts

:index{term="callouts"}\`:::callout\` sets a box with an optional title, in one of the styles the configuration defines. This book defines five: the _Try it_ boxes that send you to the Sandbox, the technical notes, the pull quotes set in display italics, the dark page-wide panel of key figures and, new in this chapter, a margin aside marked by a rule. A style decides the box's background, border, stripe and corner radius, an optional icon or marker, the typography of its title, body and lists, and where it goes: in the flow, at the head or foot of a column, across the page, into the side column of a column-and-a-half layout, or fixed to a position on the page.

A long callout can split between its paragraphs, or even between its lines, keeping at least two on each side; the continuation leaves out the title. Inside a callout, \`:::columns\` sets its content in balanced columns, like the panel of figures in :ref{id="engine"}.

A callout's attributes can override its style for one box: a \`title\`, a \`placement\`, a \`span\` of column, page or side, and a \`label\` printed in a tab at its top corner, like the _Box 1-1_ labels of a textbook.

## Boxes inside boxes

:index{term="callouts!nested"}A box can hold another. A worked example inside a lesson, a warning inside a procedure: the inner box is opened inside the outer one and closed before it, each bare \`:::\` closing the innermost box still open. The inner box takes the width of its parent, minus the parent's padding, and keeps its own style, so a technical note can carry a _Try it_ box without either losing its colours.

:::callout{type="note" title="Two boxes, one block"}
The outer box is a technical note. It keeps together with what it holds, so the engine places the two as one block: it never leaves the inner box alone at the head of the next column.

:::callout{type="try"}
Open the Text panel at this chapter and delete the line that closes the inner box. The outer box now ends where the chapter does, and the Checks panel says so.
:::

The outer box goes on after the inner one, in its own style.
:::

## Boxes that float

A box usually stands where it is written, between the paragraphs around it. Some boxes have no reason to interrupt the reading: a sidebar, a profile, a summary of figures. Given a \`placement\` of _top_ or _bottom_, such a box floats like a figure to the head or the foot of the first column with room for it, and the text that follows it in the Markdown fills the page above or below. The box below this paragraph was written here, in the middle of the section, and set at the foot of a column.

:::callout{type="aside" placement="bottom" title="Where a floating box lands"}
In the first free slot at or after the point where it is written, the same rule a figure follows. A box that must stay whole yields to the boxes and figures already placed, never the other way round.
:::

## Markers and designed boxes

A style can draw a **marker** outside the box, in a narrow column of its own beside it: an icon, a glyph, a shape or a picture from the resources, with a rule that runs down the height of the box. The aside that floated from the previous section uses one: a gilt dot over a rule of the same colour.

Where a marker is not enough, a style can draw the whole box with a **design**, the same slots of text, boxes, rules and images that draw the chapter openers of this book. The box's text becomes one element among the others, and the attributes written on the box can be printed in the design: a number in a badge, a level in a tab, a name in a strip at the foot.

## Marks inside the line

:index{term="chips"}Some content is smaller than a box. \`:chip[…]\` sets a word in a small rounded box that flows with the text, for keys, states and tags: a setting that can be :chip[allow]{style="state"}, :chip[warn]{style="state"} or :chip[avoid]{style="state"}, or a key such as :chip[Esc]. A chip has a style, like a box: its background, border, radius, typeface and colour, and the space around it, all from the configuration. Chips break with the line and never split inside, and the engine counts their width when it chooses the breaks of the paragraph.

Swatches are a second kind. Written \`:swatch{color="#c0452f"}\`, a swatch sets a small square in that colour inside the line, :swatch{color="#c0452f"} like this one, which is how a style guide or a table of inks names a colour and shows it at once.

## Footnotes

:index{term="footnotes"}A note is cited with \`[^id]\` right after the word or the punctuation it belongs to,[^first-note] and written anywhere in the chapter as a paragraph that opens with \`[^id]:\`. Notes are numbered in the order they are first cited, from one again in each chapter; \`footnotes.numbering\` can run them on through the book or start them again on every page, as Chinese and classical Arabic books do.

[^first-note]: This is one. It was written a few lines further down in the Markdown, as a paragraph of its own, and set at the foot of the column that holds the line citing it.

A note is set at the foot of the column that holds the line citing it, under a short rule, and the line and its note always share a column: when the note does not fit, the line moves on with it.[^second-note] \`footnotes.placement: 'chapterEnd'\` gathers a chapter's notes after its last block instead. A marker with no note and a note that nothing cites are both reported in the **Checks** panel.

[^second-note]: The engine balances the column with the note's lines counted in, so a page with notes still ends level.

## An index at the back

:index{term="index"}A back-of-book index is written where the text discusses each term. \`:index[anaemia]\` prints the word and files it; \`:index{term="Heart!valves"}\` prints nothing and files the page under a sub-entry. A \`main\` flag sets the page in bold, \`range="start"\` and \`range="end"\` bound a discussion that runs over several pages, and \`see\` and \`seealso\` write cross-references. \`:::index\` prints the index where it stands, usually under a heading whose style sets it in two columns.

The engine reads the page of every mark after layout, so the numbers follow the text: add a paragraph, move a chapter or change the trim, and the index prints the new pages. Entries are sorted in the alphabetical order of the document's language and grouped under their initial letters, consecutive pages join into a range, and every number is a link in the PDF. This book has one, at the back, built from marks written in every chapter.

# Books, parts and running heads {lead="A book is more than its chapters: a cover, a contents page that keeps itself up to date, part dividers, openers that announce each chapter and running heads that know where the reader is. All of it is configuration." summary="Chapters, heading styles, design slots, parts, contents and page numbers"}

This guide is a book of twenty-one chapters, and each chapter is a Markdown document of its own. A project in the Sandbox is always a book: the configuration, the resources and the fonts are shared, and the chapters follow each other, as :ref{id="book-anatomy"} shows.

## Chapters make a book

Every chapter is laid out on its own, _continued_ from the chapters before it: it inherits their page count and page parity, their chapter and figure counters, the open part and the running heads. That is why this chapter's figures are numbered from 7.1, and why editing one chapter never forces the engine to set the whole book again.

## What a chapter inherits

The continuation a chapter receives is small and precise. It carries the page count and the parity of the next page, so an opener that must fall on a verso knows whether it needs a blank page before it. It carries the counters of chapters, resources and page labels. And it carries the book's outline, so a contents page in chapter two can print the page on which chapter ten begins.

## Heading styles

A heading can carry attributes, written in braces at the end of its line. The most powerful is a **style**: \`{style="cover"}\` applies a named heading style, which changes the heading's typography and design and, for the section the heading opens, can change the running heads, the page margins, the column layout, the body typography and the palette. A style can also leave its headings unnumbered, so a preface does not shift the chapter numbers, and keep them out of the contents.

## A look at this book's configuration

The cover is the first-level heading of the first chapter, with the style _cover_. The style removes the running heads and draws a full-page design: a box filling the bleed with the night colour, the cover artwork, a kicker in gilt capitals, the title from the front matter in Fraunces at 88 points, a short gilt rule, the subtitle in Lora italic and a line of credits at the foot. The kicker and the credits come from attributes of the heading, written on its line in the Markdown.

The chapter openers are a design of the first heading level. A box fills the top of the bleed in the part colour; the chapter number is printed large at the outer edge, the kicker combines the word _Chapter_, the number and the part's title, and below a short white rule come the title and the chapter's introduction, taken from the heading's \`lead\` attribute. The same heading's \`summary\` attribute is what the contents page prints under each entry.

## Design slots

:index{term="design slots"}Running heads, footers, chapter openers and part pages are drawn by **design slots**: small free compositions of text, rules, boxes and images. Each element is anchored to the page, the bleed, the text area or another element, with offsets and sizes in real units, and its text can hold **placeholders** such as \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` or any attribute of the heading, like the \`{attr.lead}\` that sets the introduction on this chapter's band. Elements can be limited to odd or even pages, and to pages of a given role: body, opener, part or blank.

Running heads are an ordinary design slot with elements filtered by parity and role. On this book's versos, the folio in the part colour and the title of the book sit at the outer edge; on rectos, the chapter title and the folio. They appear only on body pages; openers carry a folio at their foot instead, and part dividers carry nothing. The page in the part colour that faces each divider is a design element too: a box filling the bleed, shown only on blank versos, which in this book are exactly the pages that face a part.

## Parts and palettes

:index{term="parts"}\`:::part\` opens a part divider: a page of its own, broken to the parity the configuration asks for, drawn by the part design and followed by a body — usually the list of its chapters.

In this book every part opens as a spread: a verso in the part colour on the left, the divider on the right. The parts break with the parity _always odd_, which lays one blank leaf before every divider, so the divider always lands on a recto. The first chapter of the part then opens on its back, on a verso, as every chapter does.

A part can also recolour the book. Colours in the configuration can be linked to named entries of the **palette**:index{term="palette"}, and a part's \`palette\` attribute replaces entries until the next part. This book defines one entry, the _part colour_, and each part sets it: blue for the foundations, gilt for the craft, teal for the pages beyond running text, vermilion for practice.

## A contents page that keeps up

:index{term="contents page"}\`:::toc\` prints the table of contents: an entry for each heading of the listed levels and a row for each part, with numbers, titles, dotted leaders, page numbers and, optionally, a line from a heading attribute — in this book, each chapter's summary. The page numbers are real: the engine lays the book out, reads where each heading landed and sets the contents again until the numbers settle.

## Page breaks and numbering

\`:::pagebreak\` starts a new page, and can ask for an odd or even one, adding a blank page when needed. \`:::numbering\` switches the page-number sequence from the next page on, which is how front matter numbered in roman numerals hands over to arabic page numbers at chapter one. And where a passage wants a little more air above it, \`:::space\` leaves a blank line, or \`:::space{lines=2}\` two; extra blank lines in the Markdown add nothing, as in any Markdown.

# One book, many languages {#languages lead="This guide exists in ten editions, in four scripts and two directions, and they share one design. Each edition keeps only what its language needs to say differently." summary="Editions, general settings, overrides, scripts and directions"}

A translated book is usually a second book. Its designer opens the first one, saves a copy and starts changing things, and from then on every correction to the design has to be made twice, or ten times, by hand. Postext keeps the editions of a book together instead: one project with a set of chapters for each language, one shared design and, for each language, a short list of the settings it sets otherwise.

## Editions

:index{term="editions"}A book in the Sandbox can hold several languages. Each **edition** has its own chapters, its own name and description and, where a figure needs it, its own artwork; the resources, the fonts and the design are the book's. The Books panel shows a tag for every language a book holds, and the address of the page names the one on screen, so a link opens the edition it was copied from. The canvas can lay two editions out side by side, which is how a translator checks that the Spanish chapter still fits the pages the English one fills.

A new edition starts as a copy of the one on screen, still untranslated, from **Add a language** in the book's menu. When the new language is Arabic, Chinese or Japanese, the copy takes that language's defaults on the way: the direction, the writing mode, the typefaces and the rules of its typography, which differ too much from a Latin book to be left to chance.

## General settings and overrides

The design of a book in several languages is held in two layers. The **general settings** are those every edition uses:index{term="general settings"}; each language then has an **override** that names only the fields it sets otherwise, merged field by field over the general ones. A colour, a size or a margin changed in the general layer reaches every edition at once; changed in one language's override, it reaches that edition alone.

The Design panel shows the two layers with a switch at its head, between _All languages_ and the current language only. With the switch on one language, a field that language overrides carries a mark, and the panel can send a value to the general layer or bring an edition back to it. A short list at the head of the panel names every setting the language sets for itself, so an override never hides in a corner of five hundred fields.

:::callout{type="note" title="How this guide is set"}
The seven editions in the Latin script share almost everything: of the settings that make the design, each sets a few dozen for itself, and all of them are words, the titles of its boxes, the names of its colours, styles and figures, the title in its running heads and the language of its hyphenation. The Arabic, Chinese and Japanese editions keep the same page, palette and parts, and set their type, direction and writing mode for their scripts.
:::

Those numbers are shown in :ref{id="edition-layers"}. The split is not an accident of how the guide was written: it is the smallest override each edition can have, computed by the engine from the editions themselves.

## What a language changes

The document's language is a setting, \`locale\`, and it reaches further than hyphenation. It chooses the hyphenation patterns, eight languages of them built in; the names of the built-in figure and table types, _Figure_ in English, _Figura_ in Spanish, _Abbildung_ in German; the words a split table or a continued box prints; the order of an index; and the digits, which an Arabic book can set in Arabic-Indic numerals. A heading or a paragraph can change language for itself, and a few words in another language can be marked inline, so a French quotation in an English chapter breaks by French rules.

## Four scripts, two directions

The editions of this guide use every kind of typesetting the engine knows. The Latin editions are set left to right, justified and hyphenated. The **Arabic** edition reads from the right and is bound on the right: its lines are justified by stretching letters with kashida where the script allows it rather than only by widening spaces, numbers and Latin words keep their own direction inside the line, and the figures are drawn as mirror images where their layout follows the reading order.

The **Chinese** and **Japanese** editions are set vertically, in columns that run from top to bottom and from right to left, bound on the right like the Arabic one. Their lines follow the rules each language has written down for itself: which punctuation can start or end a line, how much space a comma takes, where Latin words turn on their side and where short numbers stand upright in the column. Japanese adds **ruby**:index{term="ruby"}, small readings set beside difficult characters, written in the Markdown as \`:ruby[…]{rt="…"}\`, or in a shorter form between braces that gives each character its own reading, with a bar before each reading.

## Translating with the engine in view

Because the pages are set as you type, a translation can be judged as it is written. A German sentence a third longer than its English source shows its cost at once, in a column that runs one line over or a heading that no longer fits its band. The editions of this guide were each set page by page with the Checks panel open and the columns read for holes and short ends, in the same way a typesetter would set them by hand.

:::callout{type="try"}
Open the Books panel and switch this guide between its languages with the buttons of its row. Then open the Design panel, set the switch at its head to the current language only, and read the list of what this edition sets for itself.
:::

:::part{number="III" title="Beyond running text" palette="band=#1f7a6d"}
9. Composed pages
10. Comics and scores
11. Exercises and courses
:::

# Composed pages {#composed lead="Not every page is a river of text. A textbook spread, a magazine opener or a quick-reference sheet is built from frames, each holding its own piece. Postext keeps the frames in a template and the words in the Markdown." summary="Page templates, frames, slots, spreads and text that does not fit"}

The chapters so far set text in columns that run from page to page, and the engine decides where each line falls. A large family of books works the other way round. In a school textbook every spread is drawn first: a band for the title, a box for the definition, a strip of photographs, a column of exercises, a map with labels. The words are written to fit the frames, and when they do not fit, someone shortens them or moves a frame. Postext sets these pages too, under the name **composed pages**, and keeps to the rule the rest of the engine follows: the Markdown says what the content is, the configuration says where it goes.

## Templates and frames

:index{term="composed pages"}A **page template** is part of the configuration:index{term="page templates"}, under \`pageTemplates\`. It names a set of **frames**: rectangles placed on the page by an anchor and an offset or by a cell of a grid, with a width, a height and a box style drawn from the callout styles of the book. A frame can be as tall as its content, fixed, or run to the edge of the page; frames can be stacked or set in a row as a **group**, so when one grows the others move with it. A template also carries a **decoration**: rules, bands, pictures and short texts placed once the frames are in place, so a band can hang from a box and follow it.

No words live in a template. A frame has a name, a size and a look; the title it prints, the text it holds and the picture it frames all come from the page that uses it. That is what lets the ten editions of this guide share one template for the quick-reference sheet that closes the book, before the index: each fills the same frames with its own words.

## Filling the frames from the Markdown

A composed page is a fence of four colons that names its template. Inside it, \`:::frame{slot="…"}\` sends its content to the frame of that name, and a heading, a resource or a box can name a slot of its own. Content that names nothing goes to the frame marked as the template's **flow** frame, and the first heading goes to the frame that takes headings of its level. The quick-reference sheet at the end of the book was written this way, and its Markdown reads like any other chapter's.

:::callout{type="note" title="The fence of the quick-reference sheet"}
\`::::page{template="sheet"}\` opens it and \`::::\` closes it. Between them, a heading for the title, a paragraph for the flow frame, six \`:::frame\` blocks for the cards and one for the key on the foot of the page. The positions, sizes and colours are in the template, under Design › Page & columns › Page templates.
:::

## How a page is set

A composed page takes a page of its own, or two for a spread, and the text after its fence starts on the next one. The engine places the frames in turn, fills each with the typography of the rest of the book, the same paragraph styles, headings, lists and chips, and draws its box at its final size. Frames are read in the order their content appears in the Markdown, not in the order they are painted, so a screen reader, the tagged PDF and the reflowable EPUB read the title, then the text, then the boxes, as a person would.

## When the words do not fit

Text written for a frame never fits on the first attempt. A template says what the page may do about it, and the engine tries each step in order and stops at the first that works. A frame that follows its content grows into the space its group leaves; the frames below it move down; frames marked to give way shrink; the text can be set a little tighter. When none of that is enough, the text goes on in another frame, chained like the threaded frames of a desktop publishing program, or on a page added after this one, under a mark that says where it continues.

What the page could not settle is reported in the Checks panel with its proposals: which frame overflows, by how many lines, and what would make it fit. A **reflow log** records every move the engine made for the page, so a designer can see why a box ended up lower than the template put it. In the Sandbox, a click on the warning shows the frame, and the frame's fields are a click away.

## Spreads and connectors

:index{term="spreads"}A template can cover two facing pages as one sheet. A **spread** opens on a verso, adds a blank page before it when the text ahead ends on one, and lets frames and decoration run across the spine where the template allows it; a gutter keeps everything else clear of the fold. Timelines, maps and double-page openers are set this way, and each page of the spread still prints its own running head and folio.

Frames can also be joined by **connectors**: lines, elbows and curves drawn between two frames that stay attached however the words move them, for organisation charts, family trees and labelled maps. Pictures in a frame can carry labels anchored to points of the picture, with leaders and pointers, so a map of rivers keeps its names on the rivers when the map is resized or translated.

## Templates in the Sandbox

Templates are edited in the Design panel, where each one is drawn with its frames and listed with the number of pages that use it. With the preview in **Design** mode, a composed page shows its grid and margins, a press on a frame selects it, a drag moves it and its handles resize it; the box is written back to the template in millimetres. When other pages use the same template, the Sandbox asks whether the change is for all of them or for this page only, which makes a new template based on the first.

The reverse path is there too. A page laid out by hand can be saved as a template, and a book whose old styles held its words can move them into the Markdown, where they belong, with one command for the whole book.

:::callout{type="try"}
Switch the preview to Design mode, go to the quick-reference sheet just before the index and drag one of the cards down. The Sandbox asks whether to change the template or this page only; choose this page only and open the Text panel to see the fence now naming a new template.
:::


# Comics and scores {#comics lead="Some books speak in pictures and some in notes. A comic is a set of drawings and a script; a score is music written as text. In both, Postext keeps the words in the Markdown and does the lettering and the engraving itself." summary="Panels, balloons, lettering, strips and music notation"}

Comics and music look like the opposite of what a text engine is for. A comic page is drawn, a score is engraved, and neither is a column of justified lines. Yet both are made of text at heart. Every balloon of a comic is a line of dialogue that has to be translated, lettered and fitted into a drawing, and every bar of a score is notation a musician can write in a text editor. Postext treats them that way: the drawings and the rules are resources and settings, the dialogue and the music are in the chapter.

## Pictures without words

:index{term="comics"}A comic in Postext starts from drawings with no lettering on them. Each picture can mark what must never be cropped, its **safe area**, and where its characters are: a point for each speaker's mouth, a box for each face, zones that balloons should stay off. Those marks are made once, in the Resources panel, and every edition of the comic uses them.

The script is the chapter's Markdown. A \`:::page\` block cuts a page into panels with a short formula, \`30 [30 | 20 | *] / *\` for a tier of three panels above one large one, gives each panel its picture, and lists under each panel what is said in it, one line per balloon: \`maya: Grandpa! I'm here!\`. A caption, a thought, a whisper, a shout or a sound effect is the same line with a different key or style.

## Lettering

:index{term="lettering"}The engine letters every balloon at one size, in the lettering face of the book, the way a letterer works. It breaks the words into lines that make a rounded shape, short at the top and bottom, then draws the balloon around them with the same air on every side, places it in reading order inside the panel, away from faces and from the zones the picture marks, and points its tail at the speaker's mouth. Two lines in a row from the same speaker are joined into one balloon with two lobes. Text is never shrunk to fit: a balloon that does not fit changes shape, moves or is reported in the Checks panel.

The strip in :ref{id="guide-strip"} was lettered this way. Its three drawings carry no words; the dialogue is three lines of Markdown in this chapter, and each edition of this guide letters it in its own language.

:::strip{split="* | * | *" span=page placement=top caption="A strip lettered by the engine. The drawings are shared by every edition of this guide; the balloons are written in each edition's Markdown." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: The German edition runs a line over on page 212.
::panel{art=strip-screen}
designer: Then tighten the paragraph, not the page.
::panel{art=strip-book}
sfx: FLIP
:::

## Reading direction and translation

A Western comic is read from left to right, a manga and an Arabic comic from right to left. Postext takes the direction from the language of the edition: an Arabic or Japanese edition lays the panels of each tier out from the right, mirrors the corners and the slants, and binds the book on the right, while the pictures stay as drawn. Japanese balloons are lettered in vertical columns, with the punctuation turned for the column.

A translation is the same Markdown with other words. The pictures, the crops and the marks are shared; each edition measures its own text and places its own balloons. Spanish runs about a fifth longer than English and Chinese much shorter, and the balloons change size with it, without anyone moving them by hand.

## Pages, spreads and strips

A comic can fill a page, run across two facing pages for a panorama, or sit in the text as a **strip**, the width of a column or of the page, like the daily strip of a newspaper. A strip behaves like a figure: it can be numbered and captioned, cited with \`:ref\`, and floated to the head or the foot of a page. The newspaper recipes of the Cookbook set strips this way, between articles.

## Music as text

:index{term="music notation"}A score is written in the chapter as a fenced block of notation, the way code is written in a technical book. Postext reads four formats: **ABC**, compact and easy to type, for melodies and songs; **MusicXML**, exported by the notation programs musicians use; **MEI**, for scholarly editions; and **Humdrum**, for chorales and analysis. The engine engraves the music with Verovio, the engraving library of the Music Encoding Initiative, at the width of the column.

The tune below is written in five lines of ABC in this chapter's Markdown. The engine engraves it and sets it like a display formula, on the baseline grid, with the text resuming after it.

\`\`\`abc {alt="A short melody in G major, in three-four time"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

A long score is cut into **systems**, the lines of music a reader follows, and the systems run on from column to column and page to page like the lines of a paragraph, never cut through a stave. A music example the text cites can be a resource instead, numbered and captioned like a figure. How the music looks is a setting: the size of the staves, the music font, bar numbers and the margins around a score, with named styles for smaller examples in a box.

Music is opt-in. The engraver weighs several megabytes and is only loaded by books that hold notation, so a novel never pays for it. Scores are drawn as vectors in the canvas, the HTML and the PDF, tagged as figures with their alternative text in the accessible PDF, and carried into the EPUB.

# Exercises and courses {#exercises lead="A textbook asks its reader to do something: choose, complete, match, write. Postext reads the questions and their answers from the Markdown, prints the exercise for the pupil, and lets the screen editions check it." summary="Exercise kinds, answer keys, solutions, screen editions and SCORM"}

The exercises of a schoolbook are among the most tedious pages to set by hand. Every blank must be long enough to write in and must not give its answer away by its length, the options of a question are labelled in the style of the series, the answer key at the back must match the questions at the front, and the teacher's edition prints the same pages with the answers filled in. All of that follows from two things: what the question is, and what its answer is. Postext asks for nothing else.

## An exercise in the Markdown

:index{term="exercises"}An exercise is a block between \`:::exercise\` and \`:::\`. Its first paragraphs are the instruction; what follows is the question, written in Markdown a teacher could type without a manual. A task list with the right options ticked is a multiple-choice question. Words in double brackets are blanks, and the words inside are the answers. Pairs joined by an arrow are a matching exercise. The engine reads the kind of exercise from what it finds, and a \`type\` attribute says it when the content is not enough.

The three exercises below are about this book. They were written in this chapter's Markdown in a few lines each, and the engine numbered them, labelled their options, drew the blanks and set the boxes.

:::exercise{level=1}
Which of these does the configuration decide, rather than the Markdown?

- [ ] The words of a heading
- [x] The colour of the chapter band
- [ ] Which figure a paragraph mentions
:::

:::exercise{bank level=2}
Complete the sentences with the words in the box.

1. A figure floats into the first free slot after its [[mention]].
2. The engine breaks a paragraph as a [[whole]], not one line at a time.
3. A composed page fills the frames of a [[template]].

::bank[margin | column]
:::

:::exercise{level=2}
Match each output with what it is for.

- PDF/X -> The printer
- EPUB -> An e-reader
- SCORM -> A course on a learning platform
:::

## Twelve kinds

Postext knows twelve kinds of exercise, enough for most of what a textbook prints: multiple choice and true or false; gaps, with or without a word bank, and choices set inside the line; matching, sorting into groups, putting items or the words of a sentence in order; marking words in a text; open questions with lines or a ruled area to write on; word searches and crosswords, whose grids the engine builds from the list of words; and operations set in columns, for arithmetic. Items are shuffled where the kind needs it, always the same way, so the PDF, the screen and the answer key agree.

A difficulty level prints as dots after the number, activity icons can mark the exercises done in pairs or aloud, and the first item can be printed answered as a model. How each of these looks is an **exercise style**: the badge of the number, the labels of the options, the look of a blank, the ruling of a writing area, the box around the exercise, drawn from the callout styles of the book.

## Answers and solutions

Every graded exercise has an **answer key** built from its answers: the right option, the blanks in order, the pairs. A \`:::solution\` block inside an exercise adds a worked solution in any Markdown. Where they print is a setting for the whole book: nowhere, right after each exercise, upside down under it as puzzle books do, at the end of the chapter, at a point of the chapter that asks for them, or in a chapter of answers at the back of the book. This guide keeps its answers for the screen.

A **teacher's edition** is the same book with one setting changed: every answer printed in its place, in the colour of a correcting pen, blanks filled, options ringed, matching lines drawn.

## On screen

In the HTML view and in an EPUB, the exercises can be answered. The reader types in the blanks, ticks options and draws the matching lines, then checks the answers, asks for a hint, sees the solution or starts again. Right and wrong answers are marked with a colour and a sign and announced to screen readers, and the answers are kept in the browser, so a reader finds them again on the next visit.

:::callout{type="try"}
Open the HTML view at this chapter and answer the three exercises. Check them, then switch to the PDF view: the same exercises, set for the pupil's pencil.
:::

## Courses

:index{term="SCORM"}A book with exercises can become a course. The **SCORM** view of the Sandbox packs the chapters and sections you choose into a SCORM package, the format learning platforms such as Moodle read. Each part of the book the platform tracks reports a score, from the exercises answered right, whether it is complete, every page seen and every exercise checked, and whether it is passed, against a mark the book sets. A test can limit how many times an exercise is checked, how many times it starts again and when its solution appears.

The package carries the book as the HTML view shows it, laid out by the same engine, so the course looks like the printed book its pupils have on the desk.

:::part{number="IV" title="In practice" palette="band=#c0452f"}
12. Writing for Postext
13. The Sandbox
14. Output: canvas, HTML, PDF and EPUB
15. Proofing and going to press
16. The book in 3D
17. Tools around the engine
18. Roadmap and community
:::

# Writing for Postext {lead="Everything in this book was written in plain Markdown with a handful of extensions. They stay readable in any text editor and say what the text is, never where it goes." summary="Markdown, directives, callouts and paragraph styles"}

Postext documents are Markdown first.:index{term="Markdown"} A writer who knows Markdown can write for Postext on day one; the extensions only appear where a book needs something Markdown never had words for.

## Plain Markdown

Headings from one to six hashes, paragraphs, block quotes, bulleted, numbered and task lists — nested two spaces per level, up to five levels — and display mathematics between double dollar signs. Inline, the usual bold and italic, plus superscript between carets, as in 10^-8^, subscript between tildes, as in H~2~O, inline mathematics between dollar signs and backslash escapes for literal characters.

A few details are worth knowing. Consecutive lines of a paragraph are joined, so line breaks in the source never reach the page; a new paragraph needs a blank line. Lists tolerate a single blank line between items, but two blank lines end them. Ordered lists keep the number they start with, so a list can begin at 0 or 5. And a heading can force a line break in its title with two backslashes, which only affects the designs that print the title large — openers and part pages — while the running heads, the contents and the PDF bookmarks keep it on one line.

Some Markdown is deliberately left out, because a book has other ways to say it: images are resources rather than inline pictures, tables are resources with a model rather than pipe tables, and raw HTML has no meaning on a printed page. Links are live in the HTML view and in the PDF, and inline code between backticks is set in the book's code face, as the syntax quoted in this book is.

## Highlights, small capitals and tabs

Three more marks change how words look without leaving the line. \`:mark[…]\` lays a band of colour behind a phrase, :mark[the way a textbook highlights what matters], and the words under it still break, hyphenate and justify like the ones around them, so marking a finished book moves none of its pages. \`:smallcaps[…]\` sets lower-case letters as small capitals, as for :smallcaps[Hamlet] in the cast of a play or an acronym such as :smallcaps[unesco], drawn from the face's own capitals in the same way on every output. And \`:tab\` sends the rest of a line to a stop the configuration sets: a price at the end of the measure behind a row of dots, or the marks of an exam question at the margin.

## Directives and containers

Everything else is expressed with a small vocabulary of directives, listed in :ref{id="document-format"}. Single-line directives start with three colons and act at the point where they appear. Containers wrap blocks between an opening line with attributes and a closing line of three colons; they nest, and an unclosed one is closed at the end of the chapter, with a warning.

Attribute values can be quoted with double or single quotes, or left bare when they are a single word, and a bare key is a flag. A directive the engine does not know is not dropped silently: it is printed as a paragraph, so nothing disappears, and the Checks panel reports it with its chapter and line. The same happens with a callout style or a paragraph style that the configuration does not define. Boxes, footnotes and the index are written with directives too; they have a chapter of their own, :ref{id="boxes"}.

## Mentioning resources

References deserve a closer look, because they are how most of a book's apparatus is written. \`:ref{id="…"}\` prints the short label and the number by default — _Fig. 5.1_ in this book's English edition — and incorporates the resource the first time it appears. A \`style\` attribute prints the number alone or the full label, _Figure 5.1_; \`case\` changes the label to lower case, upper case or capitalised, so a reference at the start of a sentence reads correctly; and \`text\` prints any wording at all while still incorporating and linking the resource. A reference to an id that does not exist prints a question mark and a warning, so broken references are found before the book goes to press.

\`::resource{id="…"}\` on a line of its own embeds a resource at that exact point, when its placement says _here_; otherwise it simply counts as a mention. This book uses it nowhere, and lets every figure float — which is usually the better choice, since the engine then finds each one a place near its mention.

## Cross-references and citations

:index{term="citations"}The same \`:ref\` names any place of the book:index{term="cross-references"} that carries an identifier: a heading written \`## Method {#method}\`, a box opened with \`{#id}\`, or a phrase marked \`[these words]{#key}\`. It prints _section 3.2_ or _chapter 4_, the title with \`style=title\`, or the page with \`style=page\`, and the page is right because the engine lays the book out again until it settles. Every such reference is a link in the PDF, the HTML and these previews.

Works are cited as Pandoc writes them: in brackets, \`[@garcia2020, p. 33]\`, or in the sentence, \`@garcia2020\`, with the references in the front matter or in a \`:::references\` block of BibTeX. The citation style is a setting, not a property of the text: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 or a style of your own, chosen under Design › Citations, where a preview shows the result. The bibliography follows the last chapter, or stands wherever \`:::bibliography\` is written. A citation of a work the references do not hold prints as written and is listed among the warnings.

## Links on paper

:index{term="links"}A link to the web is written as in any Markdown, \`[words](https://…)\`, and stays a link wherever a reader can follow it: these previews, the HTML, the PDF and the EPUB. On paper only its words would show. \`links.print\` decides what a printed page adds: nothing, the address in parentheses after the words (\`'inline'\`), or a note (\`'notes'\`) with the address, a QR code that a phone opens, or both. Link notes take the numbers and the style of the footnotes. This book prints the short address and the code, as the note of this link to [the Postext repository](https://github.com/drnachio/postext) shows.

## Mathematics in the source

Mathematics is written in LaTeX notation. Inline formulas go between single dollar signs, in the middle of a sentence; display formulas go between double dollar signs, on a line of their own or as a block of several lines. A dollar sign that should print as a dollar is escaped with a backslash. A formula that is never closed, or that MathJax cannot read, is reported in the Checks panel and replaced on the page by a red placeholder, so it cannot go unnoticed into the PDF.

## Code

A longer piece of code is a **listing**, written between fences of three backticks. Everything inside is kept as written, spaces and blank lines included, and nothing in it is read as Markdown. The word after the opening fence names the language, and the engine colours the keywords, strings, numbers and comments of a dozen of them; attributes add a title, line numbers and a tint behind the lines that matter:

\`\`\`js {title="chapter.js" lineNumbers highlight="4"}
import { buildDocument } from 'postext';
import { renderToPdf } from 'postext-pdf';

const doc = buildDocument(markdown, config);
const pdf = await renderToPdf(doc, { fontProvider });
\`\`\`

A line wider than its column turns over under a small mark, or the whole listing is set a little smaller, or the line is cut at the edge, as the code style says, under Design › Typography › Code. A long listing splits between lines like a box, never leaving fewer than two lines on either side, and a fence can also span the page or float to the head or foot of a column.

## Paragraph styles

\`:::paragraphs{style="…"}\` applies a named paragraph style to the paragraphs it wraps: an epigraph, a dedication, a bibliography, a colophon. A style can change the typeface, size, leading, colour, alignment — including centred and right-aligned — indentation and spacing. The signature that closes the last chapter of this book is one. A style can also open its first paragraph with a **drop cap**, an initial set over two or three lines, and a heading's \`dropcap\` attribute turns it on or off for the paragraph that follows.

## Writing well for the engine

A few habits make the engine's work easier and the pages better. Introduce every list with a sentence, so the list is never the first thing under a heading; the **Checks** panel can flag the ones that are. Keep headings in order, without skipping levels. Mention every figure and table in the text, near where you want it: the mention decides where the resource can go and what number it gets. Leave the placement to the configuration unless a resource really needs a position of its own. Mark the terms of the index where the text discusses them, not wherever they are named. And write alternative text for every figure, because the accessible PDF gives it to readers who cannot see the image.

## Front matter

A book's metadata lives in YAML front matter at the head of its first chapter: title, subtitle, author and publication date, available to every design slot as placeholders. This book's cover prints its title and subtitle from there. Any other key is kept for the host application; front matter in later chapters is ignored, with a warning.

# The Sandbox {lead="The Sandbox is the engine with an editor around it: the page you are reading, the Markdown it came from and every setting that shaped it, side by side and live." summary="The editor, the panels, projects, presets and sharing"}

Everything described in this book can be tried right now, without writing code. The Sandbox is not a demo built on top of Postext; it is the engine itself, in an interface meant for two audiences at once — developers evaluating the library, and designers who want to see what every option does.

## A tour of the interface

:index{term="Sandbox"}The interface follows the layout of a familiar code editor, sketched in :ref{id="sandbox-ui"}. An **activity bar** on the left switches between seven panels — Books, Chapters, Text, Resources, Fonts, Design and Checks, the last with a count of open issues. A resizable **sidebar** holds the active panel; clicking the active icon collapses it. The **viewport** on the right shows the same layout in six tabs: Canvas, PDF, Folio, HTML, EPUB 3 and SCORM. The interface speaks English, Spanish, Catalan, French, German, Italian, Brazilian Portuguese, Simplified Chinese, Japanese and Arabic, and runs from right to left in Arabic; a setting for large buttons and fields makes every control easier to reach by touch or with an unsteady hand.

The sidebar and the viewport share the window, and the boundary between them can be dragged. Every panel and the viewport remember their state between visits: the zoom and view mode of the canvas, the column mode of the HTML view, the groups open in the Design panel. The theme and the interface language are switched from the foot of the activity bar, and the language of the interface is independent of the language of the book.

## Editing a book

The editor of the **Text** panel highlights front matter and mathematics, and its toolbar inserts formatting, lists, page breaks and numbering changes. At its head, a **chapter switcher** moves between the chapters of the book, showing their page ranges; each chapter keeps its own undo history and cursor. Editor and pages stay in step both ways: clicking a word on the page puts the cursor on it in the Markdown, and selecting text highlights it on the page. The **Chapters** panel shows the open book as a whole, its chapters in order with their page ranges.

The bar above the preview switches between two ways of working. In **Content** mode the text is edited, in the Text panel and on the pages; in **Design** mode the styles and the page templates are, and a click on the page picks the style or the frame that drew what lies under the pointer. A second click on the same spot climbs one level, from a word to its paragraph, its box and its page, and :chip[⌘ Z] takes back the latest change of either kind, a word typed or a setting moved, from a single history.

The editor also keeps an eye on the book. Its chapter menu lists every chapter with the pages it occupies once they are known, and moving to another chapter switches the previews to it. Chapters can be created, renamed, reordered, split at their first-level headings or merged into the previous one, and the whole chapter can be exported as a Markdown file or replaced by one. A book of a hundred and twenty chapters works like a short one: the menu lists them under their parts and, past thirty, opens with a search field that finds a chapter by its number or a word of its title.

## Configuration

The **Design** panel edits the whole configuration — more than five hundred fields — in groups: page and columns, writing system, colours, typography, headings and contents, lists, figures and tables, boxes, exercises, comics, headers and footers, parts, export, Folio (the book in 3D) and advanced settings. A search box finds any option by name, and the **Changed** filter shows what differs from the defaults. Every field and every section can be reset on its own, and the configuration can be exported and imported as a file. In a book with several languages a switch at the head of the panel chooses between the settings all editions share and those of the edition on screen, as :ref{id="languages"} explains.

## The six views

The **canvas** view is the working preview: it zooms from a quarter of real size to four times, fits the page to the width or the height of the viewport, and shows single pages or spreads, with the first page on its own as a recto, the way a printed book opens. The **PDF** view generates a real PDF in the browser and shows it in the browser's own viewer, with buttons to generate it again, download it and print it. The **Folio** view shows the book bound and lying open on a desk, in three dimensions, with leaves that turn under the hand; it has a chapter of its own, _The book in 3D_. The **HTML** view shows the same layout as positioned HTML, isolated from the rest of the page, with a control for the size of the text and two reading modes: one scrolling column, or as many columns as fit the screen. The **EPUB 3** view writes the book as an e-book, in the browser, in one of two layouts: a **fixed layout** keeps the printed pages line for line, with real text that can be selected and searched; a **reflowable** book lets the text flow to the reader's screen and type size. A small reader inside the tab shows the file you are about to download: the arrow keys, a swipe on a phone or the buttons turn its pages, a list jumps to any chapter, and a reflowable book can be read at a larger or smaller size. The **SCORM** view packs the chapters and sections you tick in a tree of the book into a course for a learning platform such as Moodle, as fixed pages or reflowable text; its exercises send their scores to the platform.

The canvas, HTML and Folio views can lay out the current chapter or the whole book; the PDF has its own choice, so a single chapter can be proofed quickly while the previews show the book; the EPUB and the SCORM package are always laid out from the whole book. This guide opens in whole-book mode. A book set vertically, like the Chinese edition of this guide, reads in the HTML view page by page only, because a single scrolling column would turn its lines on their side.

## On a phone

Below the width of a tablet the Sandbox rearranges itself. The panel bar moves to the foot of the screen, an open panel covers the preview instead of sitting beside it, and closing the panel finds the preview on the page it showed. The toolbars of the previews dock along the bottom edge, where a thumb reaches them, and wrap onto a second row when the screen is narrow. A phone cannot show a PDF inside a page, so the PDF view offers to open the file instead; and since a phone gives a browser tab less memory than a book in three dimensions needs, the Folio view is left out there.

## Resources and fonts

The **Resources** panel lists the book's resources by type. Images and SVG files can be dragged in, tables are edited in a spreadsheet-like editor with merged cells, fills, images, column widths and pasting from a spreadsheet, and the text of an SVG diagram can be edited in place. Clicking a caption, a note, a cell or the text of a diagram in the preview opens it in the panel. The Fonts panel adds families of your own, weight by weight, in the usual web and desktop formats; a custom family takes precedence over a Google Font of the same name.

Each resource has a detail view with its id, its type, its caption, its note and its alternative text, its placement — position, span, rotation, width, alignment and a caption beside it — and a live preview. Deleting a resource warns when the text still mentions it. The Fonts panel, for its part, checks that every family the configuration names has the weights and styles it needs, and warns about missing or duplicate variants.

## Warnings

The **Checks** panel lists everything the engine noticed while setting the book: fonts that failed to load, loose lines, skipped heading levels, unclosed containers and unknown directives, unknown styles, placeholders that print nothing, missing resources and callouts too tall for their column. Every warning names its chapter and line, and clicking it jumps there.

## Projects, presets and sharing

Your work is saved in the browser as you type. **Projects** are books stored locally, listed under **My books** in the **Books** panel, each with its name, description and cover image; they can be duplicated, exported and imported. **Presets** are read-only books to start from, listed under **Sample books**: this guide and a gallery of showcase editions — an astronomy magazine, an illustrated _Don Quixote_, an environmental magazine, an exhibition catalogue, two university textbooks, _Dream of the Red Chamber_ in Chinese, _One Thousand and One Nights_ in Arabic, bound on the right, and an annotated _Paradise Lost_ with Doré's plates — each set with a design of its own. **Make my own copy** turns one into a project of yours.

Presets follow their source. When a preset bundle changes on the server, the Sandbox notices within seconds: an untouched preset is reloaded on its own, and one you have edited shows a banner offering to reload it, so work in progress is never overwritten. Presets can be hidden from the list and shown again, and each one can be opened in any of its languages when it has more than one, like this guide, which comes in English, Spanish, Catalan, French, German, Italian, Brazilian Portuguese, Simplified Chinese, Arabic and Japanese.

A book travels as a single **.postext** file: its chapters, configuration, resources and fonts, plus the pagination already computed, so it opens paginated. The recipes of the Cookbook open in the Sandbox the same way, as books of your own; a recipe you have opened before asks whether to open your copy, with your changes, or replace it with the published version, which may have been corrected since. And the address bar always holds a permalink to what you are looking at — the book, the language, the viewer, the chapter and the page.

:::callout{type="try"}
Scroll to a page you like and copy the address from the browser: opening that link shows the same book, in the same viewer, at the same page.
:::

## Embedding the Sandbox

The Sandbox is itself a package, _postext-sandbox_, a React component that any web application can embed. Its host decides the initial Markdown and configuration, the interface language and every label, the sources of presets it offers, and the theme toggle, language switcher and home link it shows. The Sandbox you are using is exactly that component, embedded in the Postext website.

# Output: canvas, HTML, PDF and EPUB {#output lead="One tree, four outputs. The canvas previews, the HTML reads on screen, the PDF goes to press and the EPUB goes to the reader's device, and all of them are written from the same layout." summary="The renderers, accessible PDF, EPUB books and using the library"}

Because every renderer reads the same VDT, the promise _what you see is what you get_ is literal: line breaks, page boundaries and the position of every figure match across the canvas, the HTML and the PDF, and a fixed-layout EPUB keeps them too. A reflowable EPUB gives up the page on purpose and keeps everything else the layout resolved: the numbers, the notes, the references and the printed page numbers. The agent skill that brings existing books into Postext checks its work with these outputs, as :ref{id="skill-tutorial"} shows.

## Canvas

The canvas renderer draws a page on an HTML canvas, at any resolution. In the Sandbox it is the live preview, with zoom, fit to width or height, single pages or spreads, and pages drawn lazily as they scroll into view, so long books stay responsive.

## HTML

The HTML renderer returns absolutely positioned HTML with editorial CSS: every line where the layout put it, in its exact font, size and baseline. An indexed variant tells the host which parts of the page changed, so a viewer can patch only those. In the Sandbox, the HTML tab isolates the output in a Shadow DOM and adds a reading mode with a single scrolling column or as many columns as fit the screen, with a font-scale control. A screen-only set of overrides can adjust the design for reading on screen without touching the print pages.

The renderer takes a function that turns a resource's file id into a URL, so images can be served from anywhere, and a background colour for the page. Its output is plain markup and CSS, with no script, which makes it suitable for static hosting, e-mail previews or server-side storage once the layout has been computed in a browser.

## PDF

:index{term="PDF"}The _postext-pdf_ package turns the VDT into a real PDF, for one document or for a whole book. It never measures again: the canvas metrics are the source of truth and the PDF only transports them, which is why the lines break in exactly the same places. It embeds real fonts, one static face per weight, so bold is bold and italic is italic, and the text stays selectable. On top of the pages it adds bookmarks from the headings and parts, page labels that match the printed numbers, clickable references, SVG figures as vectors and a choice of colour space — RGB, CMYK or greyscale — for print.

The fonts reach the PDF through a **font provider**, a function that returns the bytes of a family in a given weight and style. The Sandbox's provider fetches static faces from Fontsource, one file per weight, and decompresses them from WOFF2; custom fonts come from the Fonts panel. Resource bytes are handed over the same way, by file id. Rendering reports its progress, runs in a worker of its own when asked, and accepts a whole book as a list of chapter documents, producing one PDF with continuous page labels, bookmarks and links.

## Accessible by default

:index{term="PDF!accessible (PDF/UA)"}Every PDF is **tagged** by default, following the PDF/UA-1 standard: a structure tree of headings, paragraphs, lists, tables and figures in reading order, alternative text for every figure, the document language, and decorative elements marked as artefacts so screen readers skip them. Accessibility is not an export option to remember; it is the way the file is made.

Tagging follows the layout rather than the source. Paragraphs split across columns and pages are tagged as one paragraph, lists keep their items together, tables keep their header cells, and figures carry their alternative text — or their caption, or their label, when no alternative text was written. The document's title and language travel in its metadata, running heads and page decorations are marked as artefacts, and references between the text and the figures they mention are real links.

## Colour for print

Colours in the configuration are written as hexadecimal values, optionally linked to the palette, and that is what the PDF draws by default. A PDF can also be forced into CMYK for offset printing or greyscale for single-colour work, and a book set up for the press goes further: an ICC profile, PDF/X, a black that prints in one ink and a preflight of every page. All of that is the subject of :ref{id="press"}.

## Whole books

The PDF of a book is not a concatenation of separate files. The renderer receives the layout of every chapter and writes one document: the page labels run on across chapters, the bookmarks form one tree with the parts above their chapters, and the accessible structure of the whole book is one tree in reading order. Because each chapter was laid out as a continuation of the ones before it, the pages of chapter seven in the book PDF are exactly the pages of chapter seven printed on its own.

## Fonts in the PDF

A PDF is only as good as the fonts inside it. Postext embeds every face the layout used — one static file per weight and style, so a bold word is set in the real bold and an italic in the real italic, never a slanted or thickened imitation. TrueType faces are subset to the glyphs the book actually uses, which keeps files small even with four families; OpenType faces with PostScript outlines are embedded whole, because some viewers cannot read their subsets. Every embedded font carries a map from glyphs back to characters, including ligatures, so copying a sentence out of the PDF gives back the sentence that was written, and searching the document finds every word.

A family available only as WOFF is not accepted by the PDF, because the format cannot be embedded reliably; WOFF2, TrueType and OpenType files all work.

## EPUB 3

:index{term="EPUB"}The _postext-epub_ package writes a laid-out book as an EPUB 3 file, the format of e-book stores, libraries and reading apps. It reads the same chapter documents as the PDF of a whole book, so page numbers, notes, citations, cross-references, the contents and the index arrive resolved, and it returns the file as bytes, in the browser or in Node, with no server. EPUB defines two renditions, set side by side in :ref{id="epub-renditions"}, and the writer produces either one from the same layout.

A **fixed layout** keeps the printed page. Each page becomes a document of its own, at the page's size, with the text where the PDF puts it and in the book's own fonts, so columns, floats, running heads, openers and every line break survive. The text stays text: it can be selected, searched and read aloud, and the links of the book work between pages — cross-references, notes, the printed contents and the index. Spreads pair as they do in print, and a book bound on the right, in Arabic or in vertical Chinese, turns from right to left. It suits books whose pages are designed as pages, an illustrated book, a textbook, a catalogue or a magazine, read on a large screen; on a phone the page is scaled down and the reader zooms in to read it.

## Reflowable books

A **reflowable** book gives up the page and keeps the text. Each chapter becomes one document that the reading system sets again for its screen, in the typeface, size and margins the reader picks. The writer does not go back to the Markdown: it rebuilds every paragraph from the lines the engine set, removing the hyphens the line breaks added and keeping those that belong to the word, so a paragraph split across two columns or two pages is one paragraph again. Figures and tables follow the text that cites them, with their numbered captions and alternative text; tables stay real tables, with header rows and merged cells; boxes become asides with their titles; and notes link to the end of the chapter and back. Each printed page leaves a marker where its text begins, so a reader can find page 112 of the printed edition, and the index points to those markers.

The look comes from the configuration. A style sheet derived from it gives the headings, boxes, tables, captions and lists their sizes and colours, relative to the body text, so the reader's choice of size carries through. Paragraphs set in a paragraph style keep it, because the layout records which style set each block, and the levels of the index are told apart the same way; a chapter configured differently, or a part that recolours the book, adds a second sheet with only the rules that change. Vertical Chinese keeps its vertical lines, and an Arabic book runs from right to left.

Both renditions carry the same navigation: a table of contents from the headings and the parts, a list of the printed page numbers, and landmarks for the cover, the printed contents and the start of the text. Every family the design names is embedded, unless it is marked as not redistributable, and every picture goes in once. Both carry the metadata of EPUB Accessibility 1.1, and both pass W3C EPUBCheck, the validator e-book stores run on the files they receive, with no errors and no warnings, for this guide and for every sample book. In the Sandbox, the **EPUB 3** tab writes the file on a worker, so the page stays responsive while a long book is written. Anything the file cannot carry, such as a picture with no stored file, is listed among its warnings.

## Using the library

The engine ships on npm as _postext_, for the layout and the canvas and HTML renderers, with a package for each heavier output: _postext-pdf_ for PDF, _postext-epub_ for EPUB 3 and _postext-folio_ for the book in 3D. All are ES modules under the MIT licence and can also be imported straight from a CDN. The documentation includes live examples that render a page to an image, to HTML and to a PDF, ready to fork.

The layout engine runs in the browser, where it can measure with the fonts the reader sees; _postext-pdf_ and _postext-epub_ run in the browser too, and also in Node, so a PDF or an EPUB can be produced on a server from a layout computed elsewhere. A whole book travels the same way: \`openBundle\` reads a .postext file, \`buildBundle\` lays out its chapters in order, and the result goes straight to \`renderToPdf\` or \`renderToEpub\`. The packages are ES modules only, with TypeScript types included, and some bundlers need a one-line setting for the WOFF2 decoder the PDF package uses. The documentation walks through the whole path, from installing the packages to a first PDF, and no step of it needs the Sandbox.

:::callout{type="note" title="Four steps"}
1. Load the fonts the configuration names, so the browser can measure them
2. Build the document with \`buildDocument(content, config)\`
3. Draw its pages with \`renderPage\`, or render them with \`renderToHtml\`
4. For print, pass the same document to \`renderToPdf\` with a font provider; for e-books, pass the chapters to \`renderToEpub\`
:::

## Pages as images, from a script

A page does not need a browser to become a picture. The canvas renderer draws on any canvas that speaks the browser's drawing interface, and in Node a prebuilt canvas does: lay the book out, draw the page, and encode it as a JPEG or a PNG. That is how the agent skill that ports books to Postext looks at its work. After each change to the configuration or the text it lays the book out again, draws only the pages it is working on and reads them as images, in a second or two, with no PDF to generate. The PDF is built at the end, for the checks that only a PDF can answer: fonts embedded, images at their resolution, the tagged structure.

:ref{id="skill-tutorial"} shows the skill from start to finish: it is given the reference PDF, the fonts and the original illustrations, proposes a specification sheet, sets the first chapter and checks every page it sets.

# Proofing and going to press {#press lead="A printer asks different questions from a reader. Is every picture sharp enough at its printed size, does the black of the text use one ink, does the art reach past the trim? Postext answers them before the file leaves the browser." summary="Checks, contrast, ICC colour, PDF/X, black and preflight"}

A book is finished twice. It is finished for the reader when the text is right and the pages look as they should; it is finished for the press when the file obeys the rules of the machine that will print it. Postext keeps both checklists in the same place, so a problem is seen while there is still time to fix it in the Markdown or the configuration rather than in a phone call from the printer.

## The Checks panel

:index{term="Checks panel"}Everything the engine notices is gathered in the **Checks** panel, sorted in the order a production editor would deal with it: fonts first, then figures and tables, text and markup, design, contrast, typesetting, preflight and the browser. Each entry names its chapter and line, and clicking it jumps there. Which checks run is a setting, under Design › Advanced › Warnings, so a book can silence a warning it accepts on purpose.

Some checks are about the text: a loose line, a skipped heading level, an unknown directive, a callout too tall for its column. Others are about the design and come from **composition rules**, described in :ref{id="columns"}, that a configuration sets to _allow_, _warn_ or _avoid_. A rule on _warn_ leaves the page alone and adds an entry; on _avoid_ the engine changes the page and nothing is reported.

## Contrast

:index{term="contrast"}Colour on a page is a question of legibility before it is one of taste. The contrast check measures every pair of text and background colours the book uses, including the text of boxes, captions, running heads and design slots, and reports the pairs below the level asked for: AA or the stricter AAA of the accessibility guidelines. It can judge the colours as a screen shows them, as they will print, or both. In the Design panel, every colour field shows its lowest contrast next to the swatch, so a change of palette shows its cost before anything is laid out.

Print adds a problem a screen never has. White text reversed out of a dark band is printed as the absence of four inks laid on top of each other, and thin strokes fill in when the registration of the press is a hair off. The check flags reversed text that is too small or too thin for the press.

## Colour that a press understands

A screen mixes light; a press lays down ink. The colours of a configuration are written for the screen, and on the way to press they have to be converted into the four inks of the printing condition: a given paper, a given press, a given standard. That conversion is what an **ICC profile** describes:index{term="ICC profiles"}, and Postext carries fifteen of them, from FOGRA39 and FOGRA51 for coated paper in Europe to GRACoL and SWOP for North America, with FOGRA39 by default.

The conversion is done by Postext itself, in the browser, with a rendering intent, relative or perceptual, and black point compensation. Pictures can be converted too, so a photograph in the PDF is already in the inks of the press, and an **ink limit** caps the total coverage of the four inks where the paper would not dry. The print settings never move a line: the layout ignores them, and they act only in the PDF, the print preview and the preflight.

## PDF/X

Printers ask for **PDF/X**:index{term="PDF!PDF/X"} because it removes the guesswork. A PDF/X file says which printing condition it was made for, embeds every font, carries its trim and bleed boxes and leaves out anything a press cannot use, such as links. Postext writes the two versions printers ask for most. PDF/X-1a is the conservative one: four inks and grey only, no transparency. PDF/X-4 keeps transparency and is the usual choice today. Either is chosen under Design › Export › Print preparation, or with the \`--pdfx\` option of the command line.

A book for print also needs **bleed**:index{term="bleed"}: pictures and bands that run off the page must go a few millimetres past the trim, so a blade a hair out of line never leaves a white edge. The cut lines settings add the bleed and draw crop marks at the corners, in the registration colour that prints on every plate.

## Black

Black is the colour a printer worries about most. Body text should print in black ink alone, because text set in four inks blurs as soon as the plates move apart. Greys and blacks can be kept to the black ink only, and solid black can **overprint**, laid on top of what is under it, so a thin white gap never appears around a black letter on a coloured band. Large areas of black are the opposite case: one ink alone looks washed out, so a **rich black** adds:index{term="rich black"} the other three inks under it, above a size that text never reaches.

## Preflight

:index{term="preflight"}Before a file goes to press, prepress runs a **preflight**: a machine reading of every page against the rules of the job. Postext runs its own whenever a book is set up for print, with a PDF/X standard, a CMYK PDF or crop marks, and lists the findings in the Checks panel, the critical ones first. It reports pictures below 300 pixels per inch at their printed size, and below 150 as critical; pictures that are still in RGB; rules thinner than a quarter of a point; small text in several inks; ink above the limit; text too close to the trim; art that stops just short of the trim, when it should either stay clear of it or run into the bleed.

The same preflight runs outside the Sandbox. The command line's \`check\` command exits with an error code when it finds a critical problem, so a publishing pipeline can refuse to send a file that would come back from the printer.

:::callout{type="try"}
Open Design › Export › Print preparation, choose PDF/X-4 and switch on the crop marks. The Checks panel gains a Preflight group; the PDF view now draws the bleed and the marks around every page.
:::

## A proof on screen

The **print preview** shows:index{term="print preview"} the pages as the press will print them. Every colour is separated through the profile of the job and drawn back on the white of the paper, rich blacks included; a greyscale book shows in black ink alone. Guides and outlines disappear, and nothing is laid out again: the preview only repaints. It is a switch in the toolbar of the Canvas view, shared with the Folio view, where the pages can also be seen on the paper stock the book will be printed on.

## The accessible PDF and the printed one

The PDF for the press and the PDF for readers can be the same file. The tagged structure that makes a PDF accessible, described in :ref{id="output"}, sits alongside the PDF/X rules without conflict; only the links are dropped, because a printing standard does not allow them.

# The book in 3D {lead="A layout is a set of pages, but a book is an object: paper of a certain weight and colour, a binding that opens a certain way, a thickness the hand feels. The Folio view shows the pages as that object, before anything is printed." summary="The Folio view, paper stocks, bindings, covers and the light"}

Proofs on a screen are flat. A spread seen as two rectangles says nothing about how the book will feel open on a desk: whether the gutter swallows the inner margin, whether a plate on gloss paper catches the light, whether three hundred pages of cream paper make a block too thick for the binding. The **Folio** view answers those questions with the pages Postext has already set. It shows the book bound, lying open on a surface, lit, with leaves that bend and turn under the hand.

Nothing in it is a second layout. The pages are the ones the canvas paints, drawn at the exact pixels of the screen, so the text in Folio is as sharp as in the Canvas view and line for line the same. What Folio adds is everything around the pages: the paper, the binding, the covers, the desk and the light. All of it comes from one part of the configuration, \`folio\`, which the layout never reads. Changing the paper or the binding redraws the book at once and never moves a line.

## Turning the pages

:index{term="Folio"}A page is turned the way a page is turned: take it by its edge and drag it over. Let it go past the middle and it lands on the other side; let it go short of that and it falls back. A click on a page turns it too, forward on the right-hand page and back on the left, and so do the arrows of the toolbar and the arrow keys, Page Up and Page Down, Home and End when the book has the focus. The page field of the toolbar takes a page number and turns the book to that spread.

Each leaf bends according to its paper. Thin bible paper rolls in a tight curve and lets the print of the other side show through; card turns in a wide arc; board, as in a board book for small children, turns as a rigid plate on its hinge. The covers turn as boards too. A jump of more than ten pages does not turn them one by one: the block of pages in between lifts as one slab, as thick as those pages, and is laid over on the other side.

The view itself can move. A drag with the right mouse button orbits round the book, down to a grazing angle, to look at the spine, the fore-edge or the thickness of the block, and it can be done while leaves are still turning. The view stays where it was left until **Reset view** brings it back to the angle the settings give. In a narrow window the book shows one page at a time, still turning its leaf over the spine; when the system asks for reduced motion, the spreads change without the turn.

Four buttons of the toolbar, or the keys H, O, S and M, choose what the pointer does on the book: turn the pages by hand, orbit the view, which is what a trackpad or a tablet needs in place of a right-drag, select text, or hold a magnifying glass. Selection works on the pages as they are seen, tilted or orbited, the way it works on the Canvas view: a click puts the caret in the editor at that word, a drag selects, a double click takes a word, and a link is followed. It also works the other way: the caret and the selection of the editor are drawn on the pages, and moving the caret to a page that is not on show turns the book to it.

The **magnifying glass** is held over the book where the pointer is, or just above a finger on a touch screen: a round glass with a black rim that shows the page as the eye sees it, lit and curved as it lies, magnified most at its centre. The wheel and the plus and minus keys change how much it magnifies, from one and a half times to ten, and Esc puts it away. It reads a footnote or the microtext of a figure without leaving the view.

Videos play on the page. In page-turning mode a click on a video's poster starts it there, and it keeps playing while the leaf turns. Another click pauses it, starting another stops the first, and a video stops when the book comes to rest on a spread that no longer shows it. A video set to play by itself starts the first time its spread is shown. YouTube and Vimeo videos cannot be drawn inside a page: a click on one turns the leaf.

:::callout{type="try"}
Open the Folio tab on this guide, turn a few pages by dragging their corners, then orbit the book with a right-drag to see its stapled fold. Reset view brings it back.
:::

## Paper

The paper is chosen as a printer would order it: by **stock**, the kind of paper, and by **weight**, its grammage in grams per square metre. Each stock brings the values that are typical of it, listed in :ref{id="paper-stocks"}, and any of them can be changed on its own: a book wove at 70 grams instead of 80, an uncoated stock in a warmer shade.

Thickness follows from two numbers. The **bulk** of a paper, in cubic centimetres per gram, says how much room a gram of it takes; grammage times bulk is the **caliper**, the thickness of one sheet in micrometres. A book's block is its number of leaves times that caliper, which is why the same three hundred pages make a slim volume on coated paper and a fat one on bulky book wove. Folio counts the whole book, so a chapter shown on its own still sits between the pages before and after it, at their real thickness.

The surface has three settings. The **finish** says whether the paper is uncoated, with its fibres and no sheen, or coated and calendered to matte, silk or gloss, which reflects the room. The **texture** is the relief: smooth, the fine tooth of vellum, the even weave of wove, the lines of laid paper, an embossed linen or the irregular marks of felt; its strength can be turned down or up. The **shade** is the colour of the paper before printing, white, natural or cream, and **show-through** lets the print of the reverse appear faintly on thin paper, less and less as the paper gets heavier and more opaque. A newspaper needs none of this: a book with a newspaper trim, broadsheet, Berliner or tabloid, lies on the desk as folded newsprint unless its settings choose another stock and binding.

## Bindings and covers

Five bindings are available. A **hardcover** is case bound, with boards slightly larger than the pages. A **paperback** is perfect bound, its spine milled and glued, and opens less flat. A **sewn softcover** keeps its sections sewn under a soft cover and opens more easily. A **lay-flat** binding opens fully, with no dip of the pages towards the spine. A **saddle-stitched** booklet is made of folded sheets stapled through the fold, like a magazine or a programme, and has no flat spine. A thick book opens as a thick book does, with its spine standing between the two blocks of pages. A book bound on the right, an Arabic one or a Chinese or Japanese one set vertically, lies mirrored, with its spine on the right, and its leaves and the arrow keys turn the other way.

The covers come from one of two places. By default Folio draws a **case** round the pages, in cloth, card or leather and in the cover colour. When the document already carries its covers, as this guide does, they can be **the document's own pages**: the first page becomes the front cover and the last, when it falls on a left-hand page, the back cover. The book then lies closed on its cover until the reader opens it, the cover turns as a stiff board, and turning the last leaf closes the book again.

The spine can carry a picture. Any image or SVG of the Resources panel can be printed on it, seen as the spine is seen on a shelf, head up with the front cover to the right; it is scaled to cover the spine, so it should leave a little room at its edges. A saddle-stitched booklet has no spine to print. The picture travels with the book's resources in its .postext file, and it shows whenever the view is orbited round to the spine.

## Plates on another paper

Books often change paper for a few pages: a section of colour plates on coated stock in a novel printed on book wove, a card divider, a few leaves of tinted paper. In Postext that is a container in the text:

:::callout{type="note" title="A plate section"}
\`:::paper{type=coatedGloss grammage=130}\` opens the run and \`:::\` closes it. Everything between them is printed on that stock.
:::

A stock covers whole sheets, so the content inside the run starts on a new page and whatever follows it starts on a new page too. Each page set from inside the run carries its paper in the layout, and the Folio view draws those leaves with that paper's colour, surface, thickness and stiffness; the canvas, the HTML and the PDF set them like any other page. Attributes left out follow the book's paper, and a run inside another overrides only what it sets.

## The desk and the light

The book lies on a **surface**: oak, walnut, linen, felt, leather, marble, a plain colour, or nothing at all, which leaves the background of the page. Each surface is a photographed texture, and a tint recolours any of them. Five **lights** set the scene: a studio, daylight, a reading lamp, an overcast sky and night. Each is a pair: the surroundings that coated and gloss paper reflect as a leaf turns, and a main light that casts the shadows of the block and of a lifted page onto the pages beneath it. The **exposure** brightens or darkens the scene, and the shadows can be turned off on a slow computer. The **tilt** sets how far the view leans from straight above, up to seventy degrees, and the **turn** how far it goes round the book; Save as default view stores both as you see them.

This guide is set as a saddle-stitched booklet, on coated gloss paper of 170 grams, on a blue felt mat in studio light. Its covers are its own first and last pages, so it opens on the cover and closes when the last leaf turns. All of it is in the **Folio** group of the Design panel, and nothing in that group changes a single line of the pages.

## Where Folio runs

Folio draws with WebGL2, the three-dimensional graphics of the browser, with a texture for each side of every painted page. Painting only the spreads around the open one keeps the memory of a long book to that of a few pages, but a phone still gives a browser tab less memory than a book needs, so the Sandbox offers the Folio tab on computers and tablets and leaves it out on phones, and in browsers without WebGL2.

:::callout{type="note" title="In code"}
The viewer is a package of its own, _postext-folio_, built on three.js. \`createFolioFromDocument(container, doc)\` shows a laid-out document as a book; \`setDocument\` shows the next layout on the same page, \`setAppearance\` changes the paper, the binding or the light, and \`resetView\` brings the view back. \`createFolio\` does the same over any page images.
:::

The same package turns the pages of the Cookbook's recipes, and it can sit in any web page that wants to present a book as a book: a publisher's catalogue, a proof sent to an author, a preview before the order goes to the printer. The light table of the Cookbook turns the pages of a recipe with the same package, flat, without the third dimension.

# Tools around the engine {#tools lead="The Sandbox is one way into Postext. A command line sets books from a terminal, a file format carries them whole, Word documents come in and go out, and agents can work the Sandbox or port a book from its PDF." summary="The command line, the .postext file, Word, WebMCP and the porting skill"}

The engine at the centre of this book is a library, and a library can be called from anywhere. The Sandbox is the most visible place it runs, but a publisher with a catalogue to produce, a developer with a build pipeline or an assistant asked to typeset a manuscript each needs another door. This chapter goes through them, from the terminal to the agents.

## The command line

:index{term="command line"}**postext** is a program for the terminal that turns a book into a PDF, an EPUB, HTML, page images or a Word document, without a browser. It comes as one file per system, for macOS, Linux and Windows, downloaded from the project's releases, or through npm as _postext-cli_. Everything it needs travels inside it: the engine, a drawing library, a text shaper, the ICC profiles of the print chapter and two families of fonts. Other fonts are fetched once from Google Fonts or a folder you name and kept in a cache; the fonts installed on the computer are never used, so a book sets the same on every machine.

The program reads a \`.postext\` file, a folder holding a book, or loose Markdown files taken as chapters in the order of their names. Each output has its command: \`pdf\`, \`epub\`, \`html\`, \`image\` and \`images\`, \`docx\`. Options cover what the Sandbox offers in its panels: a PDF/X standard and a profile, a fixed or reflowable EPUB, a single page or a range of pages in the numbering the book prints, a resolution, a print preview. \`--set\` changes any setting for one run, \`--locale\` chooses an edition and \`--chapters\` a part of the book.

:::callout{type="note" title="From a manuscript to a PDF"}
1. \`postext pdf book.postext\` writes the whole book as a PDF
2. \`postext images book.postext --pages 12-15 --dpi 200\` draws four pages as pictures
3. \`postext check book.postext --strict\` fails on any warning
4. \`postext build book/ --watch\` sets the book again whenever a chapter is saved
:::

Two commands serve automation. \`check\` lays the book out and reports what the Checks panel would report, with the preflight when the book is set up for print, and ends with an error code a script can test. \`build --watch\` keeps a book open and sets it again when a file changes, so an editor and a PDF viewer side by side behave like the Sandbox. On an ordinary laptop a 140-page illustrated novel is set and written as a PDF in about ten seconds.

## A book in one file

:index{term="file format (.postext)"}A **.postext** file is a book packed for travel: a zip archive with the chapters as Markdown, the configuration, the resources, the fonts and a manifest that ties them together. It can also carry the pagination already computed, so a book opens laid out and the first page appears before the engine has set a line. The Sandbox downloads a book in this format from the Books panel and opens one from the same place; the command line reads and writes it; the website's sample books are served as .postext files.

A file can hold several languages, each with its chapters, its resources and its settings, as :ref{id="languages"} describes. Programs read and write the format through a small interface in the engine, \`openBundle\`, \`createBundle\` and \`buildBundle\`, which lays out every chapter of a bundle as one book, counters and page numbers continued. A file made by one version of Postext opens in the next: the manifest records the version of the settings it was written with, and older files are read the way they were meant.

## Word documents

:index{term="Word documents"}Most manuscripts arrive as Word files. The Text panel imports a .docx in the browser, without sending it anywhere, and opens a dialog before anything changes. It first judges the document: _well styled_ when the author used paragraph styles, _partly styled_, or _no styles_ when every heading was made bold by hand. Then it shows how each Word style will be read, as a heading level, a paragraph style, a list, a quote or plain text, and lets you change any of them; the choices can be saved as a template and used for the next manuscript from the same author or the same house. A preview of the resulting Markdown updates as you go.

Pictures and tables become resources, footnotes become notes, the index fields of Word become index marks and its equations become mathematics. The import can replace the current chapter, add new chapters after it, or replace the whole book, cut at its first-level headings.

The journey also runs the other way. **Export to Word** writes a chapter or the whole book as a .docx for an author or an editor who works in Word. What Word cannot show, a directive or a resource reference, is kept in grey paragraphs of a style named _Postext Markup_, and the template travels inside the file, so the corrected document comes back into Postext without losing anything.

## Agents in the Sandbox

An assistant that can use a browser can also use the Sandbox, through **WebMCP**:index{term="WebMCP"}, a proposed web standard for pages that offer tools to agents. While the Sandbox is open it offers more than fifty: read the book's state, edit a chapter, change a setting, add a resource, render a page as a picture, read the warnings, export a PDF, undo. An agent asked to tighten a chapter can edit the text, look at the page it produced and try again, the way a person would, and every change it makes is on screen and in the undo history.

Tools that destroy work, deleting a chapter, a resource or a book, are marked as consequential, so the browser asks the person before running them. An application that embeds the Sandbox can turn the tools off.

## Porting a book with an agent

Bringing an existing book into Postext is mostly a question of reading its design: the trim, the margins, the columns, the type sizes, the way chapters open and figures sit. The **postext-port** skill:index{term="postext-port skill"} teaches an agent to do that from whatever the publisher has: a PDF, a Word or InDesign file, an EPUB, LaTeX, HTML or scanned pages. It inventories the source, measures the pages, proposes a specification sheet, writes the configuration and the chapters, and then checks its own work: it draws each page it sets as a picture and compares it with the original, page by page, until they match. The result is a .postext file that opens in the Sandbox like any other book.

The skill is installed in any agent that reads skills, with one command, and in Claude Code as a plugin. It knows the scripts of this book: Chinese and Japanese books set vertically, Arabic books set from the right, comics re-lettered in another language, textbooks built on composed pages.

# Roadmap and community {lead="Postext is young and open. The core pipeline, the document format and the configuration system have shipped; what comes next is decided in public." summary="Where the project stands and how to take part"}

Postext is not trying to be a universal document platform. It aims to be a very good editorial layout engine for the web, and it keeps its scope narrow so the core can stay sharp. Its long-term ambition is to become the standard layout engine for editorial content on the web: something publishers, magazines, book platforms and development teams can adopt and build on.

## Where the project stands

The work is organised in four phases, summarised in :ref{id="development-phases"}. They are not strict milestones; they describe the order in which capabilities become stable enough for production.

The first two phases are essentially complete: the data model, the parser and the measurement layer, the document format, the column engine with its balancing, floats and tables, and the book machinery of chapters, parts, contents and running heads. The third phase has delivered its core — optimal line breaking with editorial penalties, hyphenation in eight languages, mathematics, footnotes and chapter-end notes, citations, a back-of-book index, Chinese and Japanese set horizontally and vertically, Arabic set from right to left with kashida justification, composed pages, comics, music, exercises and text that wraps round pictures — and has margin notes still open. The fourth, output, has shipped canvas, HTML, a tagged PDF ready for the press, EPUB 3 books and SCORM courses, together with the worker, the Sandbox and its presets, the Folio view that shows a layout as a printed book and a command line that sets books without a browser.

What is still missing is as important as what has shipped. **Margin notes** have a place in the data model but are not laid out yet. Text does not yet run on both sides of a picture, Korean is set with the Chinese rules rather than its own, and the command line shapes text without the language forms a browser applies, so a line can now and then break at another word than in the Sandbox. These are the next problems worth solving, and the ones where help counts most.

## Getting involved

The project lives on GitHub, and every conversation happens in the open: **issues** for bugs, requests and concrete tasks; **pull requests** for code, reviewed in public; **discussions** for ideas, design questions and anything not yet concrete enough to be an issue. Issues labelled _good first issue_ are the easiest way in.

The usual path from idea to code is short: an issue describes the problem, a discussion settles the approach when there is more than one, a pull request implements it, and the change is merged into the development branch and released from there. Opening an issue before a large pull request saves everyone time, because the approach can be agreed before the code is written.

## Where help counts

Every part of the project welcomes contributors. The **engine** has deep problems — line breaking, balancing, numbering, float placement — and approachable ones in its tests and benchmarks. The **PDF backend** has font embedding, colour management and accessibility. The **Sandbox** has its panels, its editors and its translations, organised so every interface string is added the same way in every language. **Design and typography** need people who know editorial traditions, especially those of scripts the engine does not yet serve well. And the **documentation** and its translations, currently in English, Spanish, Catalan, French, German, Italian, Brazilian Portuguese, Simplified Chinese, Japanese and Arabic, are open to anyone who can explain something clearly.

The best first step is small: read the contributing guide in the repository, introduce yourself in the discussions, pick an issue labelled _good first issue_, or translate a page of the documentation.

Most contributions do not require writing code:

- **Report issues** with a minimal example of the document and the configuration
- **Share your layouts**, and turn them into presets others can start from
- **Improve the documentation** with tutorials, examples and explanations
- **Translate** the interface and the documentation into new languages
- **Bring typographic expertise**, especially for scripts and traditions not yet well served
- **Contribute code** to the engine, the renderers or the Sandbox

## What will stay out

Some things Postext will deliberately not become, and saying so is part of keeping the project honest. It will not be a word processor: there is no plan for editing the page directly, because the page is the result of the rules, not their input. It will not manage responsive breakpoints for its host, because that decision belongs to the application. It will not load fonts on its own, because font loading is a concern of the page that embeds it. And it will not grow into a general document platform, with storage, collaboration and publishing workflows, when other tools do those things well and Postext can be embedded in them.

Other things are simply not done yet. Real-time collaboration, sharing a live session by link, is on the Sandbox's list of ideas, and margin notes are as much a design question as a technical one. Both will be discussed in the open before any code is written.

## Licence

:index{term="licence"}Postext is released under the **MIT licence**: the engine, the PDF and EPUB writers, the Folio viewer and the Sandbox can be used, modified and embedded in open and closed projects alike, commercially or not, provided the licence notice travels with the code. The typefaces of this book are open fonts served by Google Fonts, the diagrams are part of the Sandbox's source, and the text of this guide belongs to the project and its contributors.

## Values

Three values guide the project, and they are meant to be used, not framed: when two good ideas pull in different directions, they are how the choice gets made.

_Thoughtful design over speed._ Typography has centuries of accumulated wisdom, and the engine should honour it rather than reinvent it badly. A feature lands when it does the right thing on a real page, not when it merely works in a demo; a rule borrowed from print is studied in the books that use it before it becomes an option. Some features take longer that way. The ones that ship do not need to be taken back.

_Clarity over cleverness._ Code, configuration and documentation should be easy to read, change and explain. An option that needs a paragraph of caveats is a sign that the design is not finished yet; a function that only its author can follow will not survive its author's holidays. The configuration keeps real units and plain names, the document format stays readable in any editor, and the engine's decisions can always be traced back to a rule someone can point at.

_Collaboration over territory._ Decisions are made in public, in issues and discussions anyone can read and join, and no part of the code belongs to a single person. Every contribution is recognised — code, documentation, translations, bug reports, typographic advice and the example books that show what the engine can do — because a layout engine for everyone can only be built by many people.

If any of this resonates with you, the repository is the next step. Open an issue, ask a question in the discussions, or change something in this book and see what the engine does with it.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

::::page{template="sheet"}
## Postext on one page

Postext sets books from two inputs: Markdown that says what the text is, and a configuration that says how it looks. Change either and the pages are set again, in the browser, in a fraction of a second.

:::frame{slot="card" label="Write"}
Plain Markdown and a few directives: \`:::callout\` for a box, \`:ref\` for a figure, \`[^id]\` for a note, \`::::page\` for a page like this one. The text never says where anything goes.
:::

:::frame{slot="card" label="Design"}
More than five hundred settings in the Design panel: the page and its columns, the type, the boxes, the openers, the running heads and a palette that each part can recolour.
:::

:::frame{slot="card" label="Set"}
Every paragraph broken as a whole, columns that end level, figures in the first free slot after their mention, a book laid out again until its page numbers settle.
:::

:::frame{slot="card" label="Check"}
The Checks panel lists what the engine noticed: a loose line, a missing font, a colour too pale to read, a picture too coarse for the press. A click jumps to the line.
:::

:::frame{slot="card" label="Publish"}
One layout, five outputs: the canvas, HTML for the screen, a PDF for the press or for the library, EPUB for e-readers and a SCORM package for a course.
:::

:::frame{slot="card" label="Share"}
A book travels as one .postext file with its chapters, design, pictures and fonts. The command line sets it on a server; the Sandbox opens it in any browser.
:::

:::frame{slot="key" label="Keys"}
This sheet is a composed page: a template with a title, a flow frame, a grid of cards and a box on the foot of the page, filled from the Markdown of the last chapter. In the editor, :chip[⌘ Z] undoes and :chip[⌘ F] finds; :chip[Esc] closes a dialog.
:::
::::

# Index {style="index" summary="Every term this guide marks, with its pages"}

:::index

# Back cover {style="back" toc="false" book="Postext" blurb="Postext sets Markdown as books, magazines and textbooks, in the browser: every paragraph broken as a whole, columns that end level, figures placed after the words that call them, a PDF ready for print and an EPUB for e-readers. Every page of this guide was set by Postext itself." licence="Open source · MIT licence"}
`;
