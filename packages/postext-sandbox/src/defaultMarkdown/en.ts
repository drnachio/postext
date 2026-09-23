export const DEFAULT_MARKDOWN_EN = `---
title: "Postext"
subtitle: "A programmable typesetter for the web"
author: "Ignacio Ferro"
publishDate: "2026-09-23"
---

# Postext {style="cover" toc="false" kicker="Open-source layout engine · The guide" publisher="postext.dev · MIT licence · Every page of this book was set by Postext in your browser"}

:::pagebreak

:::paragraphs{style="colophon"}
**The Postext Guide** is the sample book that ships with the Sandbox. It is both a tour of the engine and a demonstration of it: the cover, the self-numbering contents, the part dividers, the chapter openers, the running heads, every figure and table float — all of it is laid out by Postext, in your browser, from the Markdown you can open in the editor.

Set in Fraunces, Lora and Geist, served by Google Fonts. The diagrams are plain SVG files, drawn as vectors in the canvas, the HTML view and the PDF. Change anything — a word, a margin, a colour of the palette — and the book sets itself again.

Postext is open source under the MIT licence. Text © 2026 Ignacio Ferro and the Postext contributors.
:::

# Contents {style="contents" toc="false"}

:::toc

:::part{number="I" title="Foundations" palette="band=#2b4acb"}
1. Why Postext
2. How the engine works
:::

# Why Postext {lead="Print typography spent five centuries learning how to set a page; browsers learned how to lay out an interface. Postext brings the first to the second: a layout engine that turns Markdown into pages set to editorial standards." summary="The gap between the web and the page, and what fills it"}

Postext is an **open-source layout engine** that brings the craft of professional print typography to the web. It takes **semantic content** written in enriched Markdown and a configuration object, and computes a fully resolved layout in which every line, heading, figure and table has a precise position, measured in real typographic units. That layout is then drawn by three renderers — a live canvas preview, positioned HTML and a print-ready PDF — which all read the same geometry, so what you see on screen is exactly what goes to press.

This book is its own demonstration. Its cover, the contents page that numbers itself, the part dividers in three colours, the band that opens each chapter, the running heads at the top of these pages and every figure that floats into place were all laid out by Postext, in your browser, a moment ago. Nothing here was placed by hand: the Markdown only says what things are, and the configuration decides how they look.

:::callout{type="try"}
Open the **Markdown** panel and pick this chapter in the chapter switcher at its head. Change a word in this paragraph, or delete a sentence: the page sets itself again, the columns rebalance and the page numbers of the following chapters follow.
:::

## Application layout and editorial layout

Modern CSS is a remarkable tool for building user interfaces. Flexbox, Grid, container queries and anchor positioning give developers fine control over how components are arranged in a viewport. But CSS was designed for _application layout_, and long-form reading needs _editorial layout_. The two are different problems:

- **Application layout** arranges interactive components — buttons, forms, cards, navigation — inside a viewport the reader scrolls freely
- **Editorial layout** flows text, figures, tables and callouts across a sequence of fixed pages and columns, following rules refined over centuries of print

The contrast in :ref{id="feature-comparison"} summarises where the two approaches diverge for long documents. (Mentioning it is enough: the table floats into the first free slot after this paragraph by itself, and you never place it twice.)

CSS handles the first case brilliantly. For the second, the platform has never offered the primitives that matter:

1. **Balanced columns that know about their content**
   - The CSS _columns_ property flows text, but it cannot level columns by adjusting the space above headings or the looseness of a paragraph
   - It has no notion of a figure or table that must float to the head of the next free column
   - It cannot keep a heading with the paragraph it introduces across a column break
2. **Paragraph-end and column-end defects**
   - _Orphans_ and _widows_ exist in CSS, but browser support is uneven and they do not see the geometry of the whole page
   - There is no rule for a _runt_, the short word left alone on the last line of a paragraph
3. **Whole-paragraph line breaking**
   - Browsers break lines greedily, one at a time, and can only spread the leftover space inside each line
   - Balanced justification needs the entire paragraph weighed at once
4. **A shared vertical rhythm**
   - Books and magazines set every line on a baseline grid shared by all the columns of a page
   - CSS has no primitive that snaps lines to a grid across columns and pages
5. **The apparatus of a book**
   - Running heads that know the chapter, page numbers in roman or arabic sequences, parity-aware chapter breaks, a table of contents with real page numbers
   - None of these exist in a scrolling document

:::callout{type="quote"}
Editorial typography is a constraint satisfaction problem. The browser was never given the language to state the constraints.
:::

CSS describes the _appearance_ of any single region of text in great detail. What it lacks is _global optimisation_: the ability to weigh a whole paragraph, a whole column and a whole page before committing to any of them.

## What existing tools miss

Other tools address parts of the problem. Word processors paginate. Adobe InDesign offers complete editorial control. LaTeX remains the reference for academic and mathematical typesetting. But none of them were designed for the web, and their assumptions make them hard to fit into a modern development workflow:

- They cannot be embedded as a component of a web application
- Their output is static, and rarely keeps the semantic structure accessibility tools rely on
- Their source formats are proprietary, binary or hard to generate programmatically
- They live outside the frontend toolchain a web team already uses

Postext takes a different position, summarised in :ref{id="tools-comparison"}. It is a **JavaScript library** that runs in the browser, reads Markdown, applies the rules of professional typography and hands back a layout you can render as canvas, HTML or PDF. It is meant to be embedded, configured and extended by developers who want publication-grade pages without leaving their tools — and configured by designers who never need to touch the code.

## What Postext is not

Being clear about scope keeps the core sharp. Postext does not replace CSS for interfaces; it is a specialised engine for long-form, structured content. It is not a WYSIWYG editor: you write Markdown and describe the design, and the engine sets the pages. It does not manage responsive breakpoints — choosing a configuration per screen size is the host application's decision. It does not load fonts for you: the engine measures with the fonts the browser already has, so a page must load its faces before laying out. And the layout engine is browser-only for now, because its measurements come from the canvas font metrics of a real browser; the PDF renderer, on the other hand, also runs in Node.

# How the engine works {lead="Markdown and a configuration object go in; a tree in which every line has a position in real units comes out. In between is a short pipeline that measures text without touching the DOM and iterates until the page settles." summary="Parsing, measuring, laying out, converging"}

The fastest way to understand what Postext can do is to follow a document through it. The engine is a pipeline, sketched in :ref{id="layout-pipeline"}, in which each stage refines one shared in-memory representation of the document. No stage hides behind an opaque format and none touches the disk. The pipeline is also pure: given the same content and the same configuration, it always produces the same layout.

## Content and configuration

Two things enter the pipeline, and both are meant to be read and edited by people:

1. **Content** in enriched Markdown
   - Headings, paragraphs, lists, emphasis, block quotes and mathematics
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

## Measuring without the DOM

Before the engine can place anything it must know how much room each element needs, and this is where the whole project begins. Measuring text in a browser normally means rendering it into the page and reading back its size, a reflow that can block the main thread for hundreds of milliseconds on a long document.

Postext measures through _pretext_, a DOM-free text measurement library that uses canvas font metrics and pure arithmetic. Its expensive step, preparing a text for a given font, is cached; laying it out at a given width is nearly free. The approach is 300 to 600 times faster than measuring through reflow, as :ref{id="measurement-speed"} makes vivid, and on top of it the engine's own measurement module adds rich runs of bold, italic and mathematics, hyphenation, justification and optimal line breaking. Every result is cached under a key that includes the text, the fonts, the width and every option that can change a line, so typing into one paragraph re-measures that paragraph and nothing else.

## Seven passes and a loop

The layout itself runs in seven passes:

1. **Content structuring** parses the Markdown into a flat list of blocks and resolves resources by id
2. **Text measurement** sets every paragraph into lines at the width it will occupy
3. **Page and column placement** fills pages and columns, reserving room for running heads and page-wide boxes
4. **Resource placement** floats every referenced figure and table into the first free slot after its reference
5. **Typographic refinement** applies the rules that keep headings with their text and lists with their introductions
6. **Column balancing** levels the columns of each page
7. **Vertical rhythm** snaps text back to the baseline grid after anything that breaks it

These passes depend on each other in circles. Keeping a heading with its paragraph can push both into the next column; that move can strand a widow; fixing the widow pulls a line back, which may separate the heading again. Postext resolves the circle with the **convergence loop** of :ref{id="convergence-loop"}: passes three to seven repeat, marking only what changed, until nothing moves. The loop is capped at five iterations and typical documents settle in one or two. A score of typographic violations follows every iteration, so if the cap is ever reached the engine keeps the best layout it found, not the last one.

:::callout{type="figures" title="The engine in figures"}
:::columns{count=3}
**300–600×** faster text measurement than DOM reflow, the enabling idea behind the project.

**7 passes** from Markdown to a positioned page, repeated in a loop of at most **5 iterations**, usually one or two.

**3 renderers** — canvas, HTML and PDF — drawing one geometry, line for line.
:::
:::

Balancing converges segment by segment, between chapter openers and explicit page breaks. The result is a guarantee that matters for books: a chapter laid out on its own and the same chapter inside the whole book come out identical, page for page.

## The virtual document tree

What survives the loop is the **VDT**, the virtual document tree: pages that hold columns, columns that hold blocks, blocks that hold lines, each with its box in real units, alongside a flat list of every block for quick access. The tree is pure geometry — it knows nothing about canvas, HTML or PDF — and that is exactly what lets three renderers draw matching output. Every line also remembers the stretch of Markdown it came from, which is how a click on the page puts the editor's cursor on the right word.

## Off the main thread

A layout can take longer than a keystroke, so the engine can run in a Web Worker. The worker keeps its own measurement cache between builds and cancels cooperatively: when a new build is requested, the previous one stops at its next checkpoint and the last request wins. The Sandbox lays out every view this way, and the PDF renderer has a worker of its own, so the interface stays responsive while a whole book is being set.

:::callout{type="note" title="In code"}
\`buildDocument(content, config)\` returns the VDT. \`renderPage\` draws a page on a canvas, \`renderToHtml\` returns positioned HTML, and \`renderToPdf\` from the _postext-pdf_ package returns the bytes of a PDF — of one document or of a whole book passed as an array of chapters. \`createLayoutWorker\` from _postext/worker_ runs the build off the main thread.
:::

:::part{number="II" title="The craft" palette="band=#b7820f"}
3. Setting the line
4. The page and its columns
5. Figures, tables and floats
6. Books, parts and running heads
:::

# Setting the line {lead="A paragraph is set as a whole, not one line at a time. Postext weighs every possible way of breaking it, prices spacing, hyphens and stray words, and chooses the set of breaks that costs least." summary="Optimal line breaking, hyphenation, spacing and the defects it avoids"}

The quality of a page is decided first in its paragraphs. A browser breaks lines greedily: it fills a line with as many words as fit, moves on, and can only spread the leftover space inside each line. Postext implements the **Knuth-Plass algorithm**, the optimal line breaker that has powered TeX since 1981. It evaluates every feasible way of breaking the whole paragraph and picks the one that minimises the total cost, so spacing stays even from the first line to the last.

## Boxes, glue and penalties

The algorithm sees a paragraph as a sequence of three primitives, drawn full width in :ref{id="knuth-plass-model"}:

- **Boxes** are words or pieces of words, with a fixed width
- **Glue** is the space between words, with a natural width and a capacity to stretch or shrink
- **Penalties** are possible break points with a cost; a _flagged_ penalty marks a hyphenation point and draws a hyphen when it is used

For every candidate line the engine computes an adjustment ratio $r$, how far the glue must stretch or shrink to fill the measure, and a badness that grows with the cube of it, $b = 100\\,|r|^3$. Lines are sorted into four fitness classes — tight, normal, loose and very loose — and each break is charged its demerits:

$$
d = (1 + b + p)^2
$$

where $p$ is the penalty of the break. Two hyphenated lines in a row cost an extra 3000, and a jump of more than one fitness class between neighbouring lines costs 100, so the optimiser prefers paragraphs whose texture changes gently. Should no feasible set of breaks exist, the engine falls back to greedy breaking rather than failing.

## Hyphenation

Hyphenation uses the same **Liang patterns** TeX has relied on since 1983, served by the _Hypher_ library, in eight languages: English, Spanish, French, German, Italian, Portuguese, Catalan and Dutch. The document's language is set once, at the top of the configuration, and also tags the PDF for screen readers. Patterns leave at least two letters before a hyphen and three after it, so words shorter than five letters are never divided, and each hyphen is a flagged penalty of 50 that the optimiser can accept or refuse.

Hyphenation only runs on justified text, where it earns its keep. Two break opportunities are always available, whatever the setting: a hard hyphen between two letters is a legitimate break, and a word wider than the whole measure is divided at the last syllable that fits, or at the last character if it has to be.

## Word spacing and ragged lines

Two settings bound how far a space may stretch or shrink: \`maxWordSpacing\`, by default twice the natural space, and \`minWordSpacing\`, 0.6 of it. Stretching past the maximum is priced above any other defect, so the breaker will hyphenate, move a word or accept a runt before it opens a river. Some lines cannot be filled at all — a long URL, the unbreakable tail of a list item — and rather than opening them into gaps three times the natural space, the engine sets them ragged at natural spacing. The last line of a paragraph is always ragged, except when it is overfull: then its spaces compress to fit, exactly as TeX sets glue.

## Orphans, widows and runts

An **orphan** is the first line of a paragraph left alone at the foot of a column; a **widow** is its last line carried alone to the head of the next. Both break the reader's rhythm, and :ref{id="orphan-widow"} shows the two on either side of a column break. A third defect, the **runt**, is a last line holding a single short word, stranded under a full paragraph.

Postext prices all three. When a paragraph crosses a column, the engine compares every possible split and charges each one for the space it leaves unused, for an orphan and for a widow — 1000 by default, each, with at least two lines on either side. Runts are priced inside the line breaker itself, as badness, whenever the last line is shorter than twenty characters' worth of space. When a runt cannot be avoided by breaking differently, the engine can set the paragraph one line shorter instead, tightening word spaces within their minimum and, if needed, letter spacing by at most ten thousandths of an em. List items follow the same rules, with switches of their own.

:::callout{type="try"}
In **Configuration**, search for _loose_ and turn on the loose-line highlight of the debug section. Then narrow the columns or raise \`maxWordSpacing\` and watch which lines the engine has to open, and how the optimiser redistributes them.
:::

## Mathematics

Formulas are first-class citizens. Inline expressions such as $e^{i\\pi}+1=0$ flow with the text, typeset by MathJax as vector paths that stay crisp at any zoom. When a formula is taller than the line allows, it is scaled down uniformly so the baseline grid survives, and the reader keeps the rhythm of the text however dense the notation. Display formulas sit on lines of their own, centred on the column, with their own margins, and the text that follows returns to the grid:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

The same paths are drawn by the canvas, the HTML view and the PDF, so formulas match in the three outputs and stay vectors in print.

# The page and its columns {lead="Pages are fixed, columns are finite, and every line should sit on a rhythm shared across the spread. This chapter is about the frame: page geometry, column structures, the baseline grid and the art of ending columns level." summary="Page geometry, columns, the baseline grid and balancing"}

Columns are the most visible expression of editorial design, and the place where homemade solutions break down first. Postext treats the page and its columns as first-class objects, with their own geometry, their own rhythm and their own rules for ending well.

## Page geometry

A page starts with its size. Postext offers the usual book and magazine formats as presets, listed in :ref{id="preset-sizes"}, and any custom size in centimetres, millimetres, inches or points; this guide is set on the 21 × 28 cm format. Margins can be **mirrored**, so the left margin becomes the inner one, by the spine, and swaps sides on every verso. For print production, the page can carry a bleed and crop marks, and a DPI setting controls the resolution of pixel-based measures.

Page numbers follow sequences: arabic, lower or upper roman, lower or upper alphabetic, each with its own starting number, so a book can number its front matter i, ii, iii and begin chapter one at 1. The PDF records the same sequences as page labels, so a viewer's page box reads exactly what is printed at the foot.

## Column structures

Three structures cover most publications, sketched as page thumbnails in :ref{id="column-layouts"}:

1. **Single column** for novels, essays and focused reading
2. **Two columns** for magazines, reports and books like this one
3. **A column and a half**, a main column beside a narrower side column
   - The side column can carry text that continues from the main column
   - Or it can be a **float channel** that only holds figures, tables, captions and callouts, as in textbooks with an outer column of notes and diagrams

The gutter between columns is configurable, and an optional column rule can be drawn in it, with its own weight and colour. Page-wide elements — a figure, a table, a callout — cut through the columns: the text above them is split level across the columns, and the columns resume below.

## The baseline grid

Professional books align the first baseline of every column to a shared vertical rhythm, and every line after it lands on the same grid, so lines face each other across the gutter. Postext snaps text to a baseline grid derived from the body leading, as :ref{id="baseline-grid"} illustrates. Elements that break the grid — a heading larger than the body, a figure, a display formula — are followed by the space needed to return the next line to it. The grid can be drawn as an overlay while you work, wherever there is text.

## Ending columns level

When a page ends in the middle of the text, its columns should end at the same height. That is **column balancing**, and it is harder than it looks: lines come in whole grid steps, figures cannot be split, headings must stay with their text and paragraphs must not leave orphans behind. Postext levels a short column with three levers, used in order of preference and drawn in :ref{id="column-balancing"}:

1. **Space above headings**, one whole grid line at a time, distributed by importance and never at the head of a column
2. **A line after the end of a list**
3. **Looser paragraphs**: a paragraph set one line longer, TeX's _looseness_, accepted only if none of its lines stretches beyond the word-spacing limit; if it helps, a touch of letter spacing, at most ten thousandths of an em

Each fix is verified by laying the page out again, up to eight times, and the best result wins. Some columns are left alone on purpose: the last column before a forced page break or a chapter opener, the last page of the document, a column with nothing to stretch. Two related rules level the closing columns of a chapter, and the columns above a page-wide box that moves or splits.

:::callout{type="quote"}
A column that ends two lines short is the first thing a reader notices and the last thing a designer should have to fix by hand.
:::

:::callout{type="try"}
In **Configuration**, open **Headings** and switch **Balance Columns** off. Look at the foot of the columns of this chapter, then switch it back on and see which lever the engine used on each page.
:::

# Figures, tables and floats {lead="A reference is a promise, not a position. Mention a figure and Postext finds it a home: the first free slot after the mention, numbered in reading order, captioned, never before the words that call for it." summary="Where resources land, how they are numbered, tables that split"}

Everything that is not flowing text — images, SVG diagrams, tables — is a **resource**. Resources are declared outside the text, each with an id, a type, a caption and its placement preferences, and the Markdown simply mentions them. In the Sandbox they live in the Resources panel.

## One mention is enough

Writing \`:ref{id="…"}\` in a sentence does two things: it prints the resource's label, and the first time, it _incorporates_ the resource, which then floats into the first free slot after the reference. The slots are tried in order, as :ref{id="float-slots"} shows: the foot of the column that holds the reference, then the head and the foot of the next free column, then a band on the next page. The text is never interrupted.

A handful of rules keep floats honest:

- A float never lands before its reference and is never shrunk to fit
- Floats of one numbering sequence keep their order, so figure 12 never appears before figure 11; a table waiting for room does not hold figures back
- Floats never escape their chapter: chapter openers, part dividers and the end of the document are barriers
- A float that would leave less than three lines of text on a fresh page waits for the next one
- Head and foot bands are aligned to the baseline grid, and a foot float's caption shares the last text line's baseline

## Placement

Each resource can state where it prefers to go, and each resource type has a default; the fields are gathered in :ref{id="placement-options"}. A resource can be embedded inline at a precise point too, when its position is _here_. And a table or figure too wide for the page can be turned a quarter turn: it then takes a page of its own, set flush to the spine.

## Numbers and labels

Resource types define their own numbering sequences. Figures and tables are built in and localised to the document's language; a type can add a prefix, a short label, a template such as \`{h1}.{n}\` for chapter-relative numbers — figure 5.2 is the second figure of chapter 5 — a reset rule and a counter format. Numbers follow the **first reference in reading order**: insert an earlier mention and every number after it moves. A reference can print the number alone, the full label or the short one, change its case, or print text of its own.

## Tables

Tables carry their model inline: rows of cells with column and row spans, header rows, alignment and relative column widths. Cells accept inline Markdown, paragraphs and simple lists, a fill of their own — this book's three part colours are :swatch{color="#2b4acb"} blue, :swatch{color="#b7820f"} gilt and :swatch{color="#c0452f"} vermilion — and even an image. Tables are styled once, for the whole document: body and header typography, header fill, rules in a grid, horizontal only, outer only or none.

A table taller than the page splits across pages. Its header rows repeat on every part, the caption of each continuation gains a _(cont.)_ suffix, a _Continued_ marker closes every part but the last, and no split ever cuts through a row span. A rotated table splits the same way, page after page.

## Captions and credits

A caption is the type's prefix, the number and the caption text — which accepts inline Markdown and references of its own. Captions go above or below their resource, optionally on a coloured bar, in the typeface and size of the caption style; the label can be bold or coloured, as in this book. A resource can also carry a note: a smaller credit or source line set under it.

## Vector figures

SVG diagrams are drawn as vectors everywhere. The PDF converts the common subset of SVG — shapes, paths, groups, clip paths, solid fills and strokes, opacity and text — into native drawing operations, and rasterises anything beyond it at 600 dpi; a figure can also bring a PDF master of its own, embedded as it is. For single-colour printing, a switch recolours every diagram as tints of one ink, by luminance, in all three renderers.

:::callout{type="try"}
Click the caption of any figure in the canvas: the Resources panel opens on that resource, with its caption field ready. Change its placement from _auto_ to _top_ and watch it move.
:::

# Books, parts and running heads {lead="A book is more than its chapters: a cover, a contents page that keeps itself up to date, part dividers, openers that announce each chapter and running heads that know where the reader is. All of it is configuration." summary="Chapters, heading styles, design slots, parts, contents and page numbers"}

This guide is a book of twelve chapters, and each chapter is a Markdown document of its own. A project in the Sandbox is always a book: the configuration, the resources and the fonts are shared, and the chapters follow each other, as :ref{id="book-anatomy"} shows.

## Chapters make a book

Every chapter is laid out on its own, _continued_ from the chapters before it: it inherits their page count and page parity, their chapter and figure counters, the open part and the running heads. That is why this chapter's figures are numbered from 6.1, and why editing one chapter never forces the engine to set the whole book again. The previews can show the current chapter or the whole book; the PDF can be built for either. Chapters can be added, renamed, reordered, split at their first-level headings or merged into the previous one.

## Heading styles

A heading can carry attributes, written in braces at the end of its line. The most powerful is a **style**: \`{style="cover"}\` applies a named heading style, which changes the heading's typography and design and, for the section the heading opens, can change the running heads, the page margins, the column layout, the body typography and the palette. The cover of this book is a heading style with its own margins, no running heads and a full-page design; the contents page is another. A style can also leave its headings unnumbered, so a preface does not shift the chapter numbers, and keep them out of the contents.

## Design slots

Running heads, footers, chapter openers and part pages are drawn by **design slots**: small free compositions of text, rules, boxes and images. Each element is anchored to the page, the bleed, the text area or another element, with offsets and sizes in real units, and prints **placeholders** such as \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` or any attribute of the heading, like the \`{attr.lead}\` that sets the introduction on this chapter's band. Elements can be limited to odd or even pages, and to pages of a given role — body, opener, part or blank — which is how the running heads of this book disappear on chapter openers while a folio appears at their foot. Text elements can wrap, hyphenate, truncate with an ellipsis, draw a box behind themselves and open with a drop cap.

## Parts and palettes

\`:::part\` opens a part divider: a page of its own, broken to the parity the configuration asks for, drawn by the part design and followed by a body — usually the list of its chapters. Parts carry forward, so the running heads and chapter openers of later chapters can name the part they belong to, and they appear both in the contents and in the PDF bookmarks.

A part can also recolour the book. Colours in the configuration can be linked to named entries of the **palette**, and a part's \`palette\` attribute replaces entries until the next part. This book defines one entry, the _part colour_, and each part sets it: blue for the foundations, gilt for the craft, vermilion for practice. The chapter bands, the heading numbers, the running folios and the captions all follow.

## A contents page that keeps up

\`:::toc\` prints the table of contents: an entry for each heading of the listed levels and a row for each part, with numbers, titles, dotted leaders, page numbers and, optionally, a line from a heading attribute — in this book, each chapter's summary. The page numbers are real: the engine lays the book out, reads where each heading landed and sets the contents again until the numbers settle, which takes at most three extra passes. Entries are links in the PDF.

## Page breaks and numbering

\`:::pagebreak\` starts a new page, and can ask for an odd or even one, adding a blank page when needed. \`:::numbering\` switches the page-number sequence from the next page on, which is how front matter numbered in roman numerals hands over to arabic page numbers at chapter one. Chapter openers can ask for a parity of their own, and blank pages are recognised as such, so the running heads leave them blank.

:::part{number="III" title="In practice" palette="band=#c0452f"}
7. Writing for Postext
8. The Sandbox
9. Output: canvas, HTML and PDF
10. Roadmap and community
:::

# Writing for Postext {lead="Everything in this book was written in plain Markdown with a handful of extensions. They stay readable in any text editor and say what the text is, never where it goes." summary="Markdown, directives, callouts and paragraph styles"}

Postext documents are Markdown first. A writer who knows Markdown can write for Postext on day one; the extensions only appear where a book needs something Markdown never had words for.

## Plain Markdown

Headings from one to six hashes, paragraphs, block quotes, bulleted, numbered and task lists — nested two spaces per level, up to five levels — and display mathematics between double dollar signs. Inline, the usual bold and italic, plus superscript between carets, as in 10^-8^, subscript between tildes, as in H~2~O, inline mathematics between dollar signs and backslash escapes for literal characters.

Some Markdown is deliberately left out, because a book has other ways to say it: images are resources rather than inline pictures, tables are resources with a model rather than pipe tables, and raw HTML has no meaning on a printed page. Links keep their text; making them clickable and giving inline code a style of its own are on the roadmap.

## Directives and containers

Everything else is expressed with a small vocabulary of directives, listed in :ref{id="document-format"}. Single-line directives start with three colons and act at the point where they appear. Containers wrap blocks between an opening line with attributes and a closing line of three colons; they nest, and an unclosed one is closed at the end of the chapter, with a warning.

## Callouts

\`:::callout\` sets a box with an optional title, in one of the styles the configuration defines. This book defines four: the _Try it_ boxes that send you to the Sandbox, the technical notes, the pull quotes set in display italics, and a dark page-wide panel of key figures. A style decides the box's background, border, stripe and corner radius, an optional icon or marker, the typography of its title, body and lists, and where it goes: in the flow, at the head or foot of a column, across the page, into the side column of a column-and-a-half layout, or fixed to a position on the page.

A long callout can split between its paragraphs, or even between its lines, keeping at least two on each side; the continuation leaves out the title. Inside a callout, \`:::columns\` sets its content in balanced columns, like the panel of figures in chapter 2.

:::callout{type="note" title="Why a vocabulary this small"}
Each extension answers one question a book asks and Markdown cannot: where a page ends, how pages are numbered, what a part is, which paragraphs belong to a box. Everything about how they look lives in the configuration, so the same text can be set as a paperback or a magazine without a single edit.
:::

## Paragraph styles

\`:::paragraphs{style="…"}\` applies a named paragraph style to the paragraphs it wraps: an epigraph, a dedication, a bibliography, a colophon. A style can change the typeface, size, leading, colour, alignment — including centred and right-aligned — indentation and spacing. The colophon on the back of this book's cover is one.

## Front matter

A book's metadata lives in YAML front matter at the head of its first chapter: title, subtitle, author and publication date, available to every design slot as placeholders. This book's cover prints its title and subtitle from there. Any other key is kept for the host application; front matter in later chapters is ignored, with a warning.

# The Sandbox {lead="The Sandbox is the engine with an editor around it: the page you are reading, the Markdown it came from and every setting that shaped it, side by side and live." summary="The editor, the panels, projects, presets and sharing"}

Everything described in this book can be tried right now, without writing code. The Sandbox is not a demo built on top of Postext; it is the engine itself, in an interface meant for two audiences at once — developers evaluating the library, and designers who want to see what every option does.

## A tour of the interface

The interface follows a familiar editor layout, sketched in :ref{id="sandbox-ui"}. An **activity bar** on the left switches between six panels — Projects, Markdown, Resources, Fonts, Configuration and Warnings, the last with a count of open issues. A resizable **sidebar** holds the active panel; clicking the active icon collapses it. The **viewport** on the right shows the same layout in three tabs: Canvas, HTML and PDF.

## Editing a book

The Markdown editor highlights front matter and mathematics, and its toolbar inserts formatting, lists, page breaks and numbering changes. At its head, a **chapter switcher** moves between the chapters of the book, showing their page ranges; each chapter keeps its own undo history and cursor. Editor and pages stay in step both ways: clicking a word on the page puts the cursor on it in the Markdown, and selecting text highlights it on the page.

## Configuration

The Configuration panel edits the whole configuration — more than five hundred fields — grouped in collapsible sections. A search box finds any option by name, category chips narrow the list to the document, the text, figures and tables, the output or advanced settings, and a _modified only_ filter shows what differs from the defaults. Every field and every section can be reset on its own, and the configuration can be exported and imported as a file.

## Resources and fonts

The Resources panel lists the book's resources by type. Images and SVG files can be dragged in, tables are edited in a spreadsheet-like editor with merged cells, fills, images, column widths and pasting from a spreadsheet, and the text of an SVG diagram can be edited in place. Clicking a caption, a note, a cell or the text of a diagram in the preview opens it in the panel. The Fonts panel adds families of your own, weight by weight, in the usual web and desktop formats; a custom family takes precedence over a Google Font of the same name.

## Warnings

The Warnings panel lists everything the engine noticed while setting the book: fonts that failed to load, loose lines, skipped heading levels, unclosed containers and unknown directives, unknown styles, placeholders that print nothing, missing resources and callouts too tall for their column. Every warning names its chapter and line, and clicking it jumps there.

## Projects, presets and sharing

Your work is saved in the browser as you type. **Projects** are books stored locally, each with its name, description and cover image; they can be duplicated, exported and imported. **Presets** are read-only books to start from: this guide and a gallery of showcase editions — an astronomy magazine, an illustrated _Don Quixote_, an environmental magazine, an exhibition catalogue and two university textbooks — each set with a design of its own. Duplicate one as a project to make it yours.

A book travels as a single **.postext** file: its chapters, configuration, resources and fonts, plus the pagination already computed, so it opens paginated. And the address bar always holds a permalink to what you are looking at — the book, the language, the viewer, the chapter and the page.

:::callout{type="try"}
Scroll to a page you like and copy the address from the browser: opening that link shows the same book, in the same viewer, at the same page.
:::

# Output: canvas, HTML and PDF {lead="One tree, three renderers. The canvas previews, the HTML reads on screen, the PDF goes to press — and all three draw the same lines at the same positions." summary="The three renderers, accessible PDF and using the library"}

Because every renderer reads the same VDT, the promise _what you see is what you get_ is literal: line breaks, page boundaries and the position of every figure match across the three outputs.

## Canvas

The canvas renderer draws a page on an HTML canvas, at any resolution. In the Sandbox it is the live preview, with zoom, fit to width or height, single pages or spreads, and pages drawn lazily as they scroll into view, so long books stay responsive.

## HTML

The HTML renderer returns absolutely positioned HTML with editorial CSS: every line where the layout put it, in its exact font, size and baseline. An indexed variant tells the host which parts of the page changed, so a viewer can patch only those. In the Sandbox, the HTML tab isolates the output in a Shadow DOM and adds a reading mode with a single scrolling column or as many columns as fit the screen, with a font-scale control. A screen-only set of overrides can adjust the design for reading on screen without touching the print pages.

## PDF

The _postext-pdf_ package turns the VDT into a real PDF, for one document or for a whole book. It never measures again: the canvas metrics are the source of truth and the PDF only transports them, which is why the lines break in exactly the same places. It embeds real fonts, one static face per weight, so bold is bold and italic is italic, and the text stays selectable. On top of the pages it adds bookmarks from the headings and parts, page labels that match the printed numbers, clickable references, SVG figures as vectors and a choice of colour space — RGB, CMYK or greyscale — for print.

## Accessible by default

Every PDF is **tagged** by default, following the PDF/UA-1 standard: a structure tree of headings, paragraphs, lists, tables and figures in reading order, alternative text for every figure, the document language, and decorative elements marked as artefacts so screen readers skip them. Accessibility is not an export option to remember; it is the way the file is made.

## Using the library

The engine ships as two packages on npm: _postext_ for the layout and the canvas and HTML renderers, and _postext-pdf_ for PDF output. Both are ES modules under the MIT licence and can also be imported straight from a CDN. The documentation includes live examples that render a page to an image, to HTML and to a PDF, ready to fork.

:::callout{type="note" title="Four steps"}
1. Load the fonts the configuration names, so the browser can measure them
2. Build the document with \`buildDocument(content, config)\`
3. Draw its pages with \`renderPage\`, or render them with \`renderToHtml\`
4. For print, pass the same document to \`renderToPdf\` with a font provider
:::

# Roadmap and community {lead="Postext is young and open. The core pipeline, the document format and the configuration system have shipped; what comes next is decided in public." summary="Where the project stands and how to take part"}

Postext is not trying to be a universal document platform. It aims to be a very good editorial layout engine for the web, and it keeps its scope narrow so the core can stay sharp. Its long-term ambition is to become the standard layout engine for editorial content on the web: something publishers, magazines, book platforms and development teams can adopt and build on.

## Where the project stands

The work is organised in four phases, summarised in :ref{id="development-phases"}. They are not strict milestones; they describe the order in which capabilities become stable enough for production.

What is still missing is as important as what has shipped. **Footnotes, endnotes and margin notes** are the largest open area: the data model has a place for them, but they are not laid out yet. **Links** keep their text but not their destination, inline code has no style of its own, text does not yet flow around obstacles, and layout happens in the browser only. These are the next problems worth solving, and the ones where help counts most.

## Getting involved

The project lives on GitHub, and every conversation happens in the open: **issues** for bugs, requests and concrete tasks; **pull requests** for code, reviewed in public; **discussions** for ideas, design questions and anything not yet concrete enough to be an issue. Issues labelled _good first issue_ are the easiest way in.

Most contributions do not require writing code:

- **Report issues** with a minimal example of the document and the configuration
- **Share your layouts**, and turn them into presets others can start from
- **Improve the documentation** with tutorials, examples and explanations
- **Translate** the interface and the documentation into new languages
- **Bring typographic expertise**, especially for scripts and traditions not yet well served
- **Contribute code** to the engine, the renderers or the Sandbox

## Values

Three values guide the project. _Thoughtful design over speed_: typography has centuries of accumulated wisdom, and the engine should honour it rather than reinvent it badly. _Clarity over cleverness_: code, configuration and documentation should be easy to read, change and explain. _Collaboration over territory_: decisions are made in public, and every contributor is recognised.

If any of this resonates with you, the repository is the next step. Open an issue, ask a question in the discussions, or change something in this book and see what the engine does with it.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::
`;
