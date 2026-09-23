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

Set in Fraunces, Lora, Bricolage Grotesque and Geist, served by Google Fonts. The diagrams are plain SVG files, drawn as vectors in the canvas, the HTML view and the PDF. Change anything — a word, a margin, a colour of the palette — and the book sets itself again.

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

## How to read this book

The book is organised in three parts. **Foundations**, the part you are in, explains the problem Postext solves and how the engine is built: what goes in, what comes out and what happens in between. **The craft** is about typography: how a line is set, how a page is framed, where figures and tables go and how a set of chapters becomes a book. **In practice** turns to the tools: the document format, the Sandbox, the three output formats and the project around them.

Each chapter opens with a short introduction on its band, and most of them close their sections with a box headed _Try it in the Sandbox_: a small experiment you can run on this very book, right now, to see the feature at work. Nothing in them can break anything — the reset button on the guide's row in the Projects panel restores it as it shipped — so change freely. The chapters can be read in any order; when one depends on another, it says so.

## Application layout and editorial layout

Modern CSS is a remarkable tool for building user interfaces. Flexbox, Grid, container queries and anchor positioning give developers fine control over how components are arranged in a viewport. But CSS was designed for _application layout_, and long-form reading needs _editorial layout_. The two are different problems:

- **Application layout** arranges interactive components — buttons, forms, cards, navigation — inside a viewport the reader scrolls freely
- **Editorial layout** flows text, figures, tables and callouts across a sequence of fixed pages and columns, following rules refined over centuries of print

The contrast in :ref{id="feature-comparison"} summarises where the two approaches diverge for long documents. (Mentioning it is enough: the table floats into the first free slot after this paragraph by itself, and you never place it twice.)

The difference is one of kind, not degree. An interface adapts to the window that holds it, and the reader moves through it at will; a page, by contrast, has a fixed size, a beginning and an end, and everything it holds must be resolved within those limits: what fits in this column and what moves to the next, where each figure goes, how each line and each paragraph ends. Those decisions are what make the quality of a book, and none of them can be taken by looking at a single element in isolation.

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
_Editorial typography is a constraint satisfaction problem. The browser was never given the language to state the constraints._
:::

CSS describes the _appearance_ of any single region of text in great detail. What it lacks is _global optimisation_: the ability to weigh a whole paragraph, a whole column and a whole page before committing to any of them.

## What existing tools miss

Other tools address parts of the problem. Word processors paginate. Adobe InDesign offers complete editorial control. LaTeX remains the reference for academic and mathematical typesetting. But none of them were designed for the web, and their assumptions make them hard to fit into a modern development workflow:

- They cannot be embedded as a component of a web application
- Their output is static, and rarely keeps the semantic structure accessibility tools rely on
- Their source formats are proprietary, binary or hard to generate programmatically
- They live outside the frontend toolchain a web team already uses

Postext takes a different position, summarised in :ref{id="tools-comparison"}. It is a **JavaScript library** that runs in the browser, reads Markdown, applies the rules of professional typography and hands back a layout you can render as canvas, HTML or PDF. It is meant to be embedded, configured and extended by developers who want publication-grade pages without leaving their tools — and configured by designers who never need to touch the code.

## A craft with a long memory

The rules Postext follows were not invented for it. A comfortable line holds between 45 and 75 characters, which is why long texts are set in columns instead of lines as wide as the page. Text is justified or ragged, but in either case its texture must be even, without the gaps that open into rivers when too many loose lines are stacked. Every line of a page sits on a common baseline grid so that lines face each other across the gutter and show through the paper in register. Headings stay with the text they announce, a paragraph does not leave its first or last line alone at the edge of a column, and a figure appears after the sentence that mentions it, never before.

For centuries these rules were applied by hand, by compositors who read every page before it went to press. Desktop publishing turned many of them into software, but that software remained a separate world, with its own files and its own tools. What was never available was an engine that applied them automatically, from structured text, inside the environment where most reading happens today. That is the gap this book is about.

## Who Postext is for

Postext is useful wherever long, structured text has to look like it was designed rather than merely displayed:

- **Publishers and editorial teams** who want the same source to produce a print-ready PDF and a faithful on-screen edition, without keeping two layouts in sync
- **Documentation and education platforms** whose textbooks, manuals and courses need figures, tables, numbered references and mathematics set properly on every page
- **Developers** building reading experiences — reports, magazines, catalogues, generated documents — who want editorial quality from a library instead of a desktop application
- **Designers and typographers** who want to describe a design once, as rules, and see it applied consistently across hundreds of pages

What they share is a preference for describing the result instead of placing it by hand, and a need for the result to be as good as what a careful compositor would have produced.

## What Postext is not

Being clear about scope keeps the core sharp. Postext does not replace CSS for interfaces; it is a specialised engine for long-form, structured content. It is not a WYSIWYG editor: you write Markdown and describe the design, and the engine sets the pages. It does not manage responsive breakpoints — choosing a configuration per screen size is the host application's decision. It does not load fonts for you: the engine measures with the fonts the browser already has, so a page must load its faces before laying out. And the layout engine is browser-only for now, because its measurements come from the canvas font metrics of a real browser; the PDF renderer, on the other hand, also runs in Node.

The same modesty applies to the content. Postext does not try to understand the text it sets; it applies rules to the structure it is given. A heading must be marked as a heading, a figure must be declared as a resource and a table must be a table. In exchange, it never second-guesses the author: nothing is moved, renamed or rewritten, and every decision the engine takes is visible in the layout and traceable to a rule in the configuration.

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

## Parsing

The parser reads enriched Markdown and produces a flat list of blocks: headings, paragraphs, block quotes, list items, display formulas and the directives that shape the book. It does not decide anything about the layout. What it does is structure the input carefully: it joins the lines of a paragraph, tracks the nesting of lists, separates a heading's title from its attributes, resolves every \`:ref\` against the resources declared outside the text and records, for every block, the exact range of the source it came from.

Inline formatting is parsed at the same time. Bold, italic and their combination, superscripts and subscripts, inline mathematics, colour swatches and references become typed spans inside the paragraph, so that the measurement stage can give each one its own font and colour. Front matter at the head of the document is read as metadata — the title, subtitle, author and date — and made available to every design slot.

## Measuring without the DOM

Before the engine can place anything it must know how much room each element needs, and this is where the whole project begins. Measuring text in a browser normally means rendering it into the page and reading back its size, a reflow that can block the main thread for hundreds of milliseconds on a long document.

Postext measures through _pretext_, a DOM-free text measurement library that uses canvas font metrics and pure arithmetic. Its expensive step, preparing a text for a given font, is cached; laying it out at a given width is nearly free. The approach is 300 to 600 times faster than measuring through reflow, as :ref{id="measurement-speed"} makes vivid, and on top of it the engine's own measurement module adds rich runs of bold, italic and mathematics, hyphenation, justification and optimal line breaking. Every result is cached under a key that includes the text, the fonts, the width and every option that can change a line, so typing into one paragraph re-measures that paragraph and nothing else.

Font loading is the one part of measurement the engine leaves to its host. Measuring with a font that has not arrived yet would measure the fallback instead, and every line would move once the real face appeared. The library therefore expects fonts to be loaded before the first build, and offers a way to clear its measurement caches when a late font does arrive, so the next build measures again with the right metrics. The Sandbox does this automatically: it loads every family the configuration names, from Google Fonts or from the Fonts panel, before it lays out a page.

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

The rules applied in these passes are deliberately few and strict. A heading is always kept with the first lines of what follows it. A paragraph that ends with a colon is kept with the list it introduces. A figure and its caption are never separated. A page-wide box divides the page into bands, and the columns of each band are balanced on their own, so text above a wide table reads down both columns before crossing below it. When two of these rules cannot both be satisfied, the one that damages the page least wins, and the choice is made the same way every time.

## One keystroke, followed

It helps to see what happens when you type a single letter into a paragraph of this book. The editor records the change and the chapter's Markdown is parsed again, which is cheap. Every block except the one you touched finds its measurement in the cache; the edited paragraph is set again at its column width, perhaps gaining or losing a line. The layout of the chapter is rebuilt from those measurements, off the main thread, and the loop runs until the page settles — usually once — before the preview draws the result.

Because each chapter is laid out on its own, continued from the ones before it, the rest of the book is not touched unless the chapter's page count changes. When it does, the following chapters are paginated again in the background, and the contents page picks up their new page numbers.

:::callout{type="figures" title="The engine in figures"}
:::columns{count=3 breaks="3,5"}
**300–600×** faster text measurement than reflowing the DOM. Pretext measures with canvas font metrics and plain arithmetic, which is what lets a whole chapter be set again between two keystrokes.

**7 passes** turn Markdown into positioned pages: structuring, measurement, page and column placement, resource placement, typographic refinement, column balancing and vertical rhythm.

**5 iterations** at most in the convergence loop, and usually one or two. Should the cap ever be reached, the engine keeps the best layout it found along the way, not the last one.

**8 languages** hyphenated with the Liang patterns TeX has used since 1983: English, Spanish, French, German, Italian, Portuguese, Catalan and Dutch.

**3 renderers** — canvas, HTML and PDF — draw one and the same geometry, line for line, so the page you proof on screen is the page that goes to press.

**0 reflows** of the page while laying out. Everything is computed in memory, in a worker when the host asks for it, and the same input always yields the same pages.
:::
:::

Balancing converges segment by segment, between chapter openers and explicit page breaks. The result is a guarantee that matters for books: a chapter laid out on its own and the same chapter inside the whole book come out identical, page for page.

## The virtual document tree

What survives the loop is the **VDT**, the virtual document tree: pages that hold columns, columns that hold blocks, blocks that hold lines, each with its box in real units, alongside a flat list of every block for quick access. The tree is pure geometry — it knows nothing about canvas, HTML or PDF — and that is exactly what lets three renderers draw matching output. Every line also remembers the stretch of Markdown it came from, which is how a click on the page puts the editor's cursor on the right word.

Pages also record what they are for. A page can be a body page, a chapter opener, a part divider or a blank page inserted to reach the right parity, and that role is what lets running heads, folios and decorations choose where to appear. Page labels — the printed page number in its sequence — are computed once, in the tree, so the canvas, the HTML and the PDF agree on them without doing their own counting.

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

## Why the whole paragraph matters

Consider a paragraph whose first line happens to end right after a long word. A greedy breaker takes the break, because it fits, and moves on. The second line then starts with a run of short words, cannot quite be filled, and has to be stretched; the third inherits the problem and ends with a hyphen; the last line ends up holding a single word. None of these defects is visible from the first line, which is the only one the greedy breaker looked at.

The optimal breaker sees the whole chain. It may decide to end the first line one word earlier, slightly looser than it could be, because that choice lets the second line fill naturally, removes the hyphen from the third and brings a second word down to the last line. The paragraph as a whole is better even though its first line, taken alone, is not. That is the essence of the Knuth-Plass algorithm, and the reason it produces the even grey texture readers associate with well-set books.

## Hyphenation

Hyphenation uses the same **Liang patterns** TeX has relied on since 1983, served by the _Hypher_ library, in eight languages: English, Spanish, French, German, Italian, Portuguese, Catalan and Dutch. The document's language is set once, at the top of the configuration, and also tags the PDF for screen readers. Patterns leave at least two letters before a hyphen and three after it, so words shorter than five letters are never divided, and each hyphen is a flagged penalty of 50 that the optimiser can accept or refuse.

Hyphenation only runs on justified text, where it earns its keep. Two break opportunities are always available, whatever the setting: a hard hyphen between two letters is a legitimate break, and a word wider than the whole measure is divided at the last syllable that fits, or at the last character if it has to be.

Soft hyphens typed in the text are honoured as break points, and at the same price as the pattern's own. The language can also change within a book: every chapter shares the configuration's language, so a bilingual edition like this one is configured once per language, and each version of the guide hyphenates by its own rules.

## Word spacing and ragged lines

Two settings bound how far a space may stretch or shrink: \`maxWordSpacing\`, by default twice the natural space, and \`minWordSpacing\`, 0.6 of it. Stretching past the maximum is priced above any other defect, so the breaker will hyphenate, move a word or accept a runt before it opens a river. Some lines cannot be filled at all — a long URL, the unbreakable tail of a list item — and rather than opening them into gaps three times the natural space, the engine sets them ragged at natural spacing. The last line of a paragraph is always ragged, except when it is overfull: then its spaces compress to fit, exactly as TeX sets glue.

## Emphasis and runs

A paragraph is rarely a single run of text. Bold, italic and bold italic are set in the real faces of the family — a true italic, not a slanted roman — each measured with its own metrics, so a word in bold takes exactly the room it needs. The colour of bold text, italic text and references can be set separately; in this book, references to figures and tables are set in bold in the part colour, so they are easy to find on the page and in the PDF, where they are also links.

Superscripts and subscripts are set smaller and shifted from the baseline without disturbing the leading, and inline colour swatches sit on the baseline like a letter. All of these are atomic: the line breaker can break before or after them but never inside them, so a formula or a swatch never ends up split across two lines.

## Orphans, widows and runts

An **orphan** is the first line of a paragraph left alone at the foot of a column; a **widow** is its last line carried alone to the head of the next. Both break the reader's rhythm, and :ref{id="orphan-widow"} shows the two on either side of a column break. A third defect, the **runt**, is a last line holding a single short word, stranded under a full paragraph.

Postext prices all three. When a paragraph crosses a column, the engine compares every possible split and charges each one for the space it leaves unused, for an orphan and for a widow — 1000 by default, each, with at least two lines on either side. Runts are priced inside the line breaker itself, as badness, whenever the last line is shorter than twenty characters' worth of space. When a runt cannot be avoided by breaking differently, the engine can set the paragraph one line shorter instead, tightening word spaces within their minimum and, if needed, letter spacing by at most ten thousandths of an em. List items follow the same rules, with switches of their own.

## Lists

Lists follow the same discipline as paragraphs, with a typography of their own. Bulleted lists choose their bullet character, its size, weight and colour, and the gap and hanging indentation that keep the text of every item aligned; numbered lists choose between arabic numbers, lower or upper letters and lower or upper roman numerals, with a separator that can be styled on its own and numbers aligned to the right, so items 9 and 10 line up. Nesting goes five levels deep, each level with its own indentation and markers, and task lists draw a checkbox for every item, checked or not. Items can be kept tight or spaced, and the engine treats the end of a list as one of its levers when it balances columns.

:::callout{type="try"}
In **Configuration**, search for _loose_ and turn on the loose-line highlight of the debug section. Then narrow the columns or raise \`maxWordSpacing\` and watch which lines the engine has to open, and how the optimiser redistributes them.
:::

## Mathematics

Formulas are first-class citizens. Inline expressions such as $e^{i\\pi}+1=0$ flow with the text, typeset by MathJax as vector paths that stay crisp at any zoom. When a formula is taller than the line allows, it is scaled down uniformly so the baseline grid survives, and the reader keeps the rhythm of the text however dense the notation. Display formulas sit on lines of their own, centred on the column, with their own margins, and the text that follows returns to the grid:

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

# The page and its columns {lead="Pages are fixed, columns are finite, and every line should sit on a rhythm shared across the spread. This chapter is about the frame: page geometry, column structures, the baseline grid and the art of ending columns level." summary="Page geometry, columns, the baseline grid and balancing"}

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

Professional books align the first baseline of every column to a shared vertical rhythm, and every line after it lands on the same grid, so lines face each other across the gutter. Postext snaps text to a baseline grid derived from the body leading, as :ref{id="baseline-grid"} illustrates. Elements that break the grid — a heading larger than the body, a figure, a display formula — are followed by the space needed to return the next line to it. The grid can be drawn as an overlay while you work, wherever there is text.

## Ending columns level

When a page ends in the middle of the text, its columns should end at the same height. That is **column balancing**, and it is harder than it looks: lines come in whole grid steps, figures cannot be split, headings must stay with their text and paragraphs must not leave orphans behind. Postext levels a short column with three levers, used in order of preference and drawn in :ref{id="column-balancing"}:

1. **Space above headings**, one whole grid line at a time, distributed by importance and never at the head of a column
2. **A line after the end of a list**
3. **Looser paragraphs**: a paragraph set one line longer, TeX's _looseness_, accepted only if none of its lines stretches beyond the word-spacing limit; if it helps, a touch of letter spacing, at most ten thousandths of an em

Each fix is verified by laying the page out again, up to eight times, and the best result wins. Some columns are left alone on purpose: the last column before a forced page break or a chapter opener, the last page of the document, a column with nothing to stretch. Two related rules level the closing columns of a chapter, and the columns above a page-wide box that moves or splits.

## Bands and page-wide boxes

A page is not always one set of columns from top to bottom. A page-wide figure, table or callout cuts it into **bands**: the text above the box fills its columns as a band of its own, the box crosses the page, and the columns start again below it. Each band is balanced on its own, so the reader goes down the first column and up to the head of the second before crossing the box, as in a newspaper. When a band would end uneven, a **band cap** shortens its columns to the same number of lines, and the text that no longer fits flows on below.

The closing columns of a chapter get the same treatment. Rather than leaving the last page with one full column and one nearly empty, a trailing cap shares the remaining lines between them, and the balancing levers do the rest. Explicit column breaks are respected: \`:::columnbreak\` ends a column where the author wants it, and the balancer leaves that column's foot alone.

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

Numbering stays correct across a whole book because it is part of what each chapter inherits from the chapters before it. The sixth chapter of this guide starts its figures at 6.1 because the chapter counter says so, not because anyone typed the number, and moving a chapter renumbers everything after it the next time the book is laid out.

## Types of your own

Figures and tables are only the two types every book needs. A configuration can declare as many resource types as a publication uses — maps, plates, boxes, charts, documents — each with a singular and a plural name, a short label for references, a prefix for its captions and a numbering sequence of its own. A catalogue can number its plates 1, 2, 3 through the whole book while its figures restart in every chapter; a textbook can number its boxes 1-1, 1-2 in chapter one and 2-1 in chapter two. Each type can also carry its default placement and adjust the caption style, so plates can take a whole page with their caption above while figures float at column width.

A type with an empty prefix and no caption is useful too: it turns an image into an ornament, a vignette or a logo that can be embedded exactly where it is mentioned, without a number and without ever entering the list of figures.

## Tables

Tables carry their model inline: rows of cells with column and row spans, header rows, alignment and relative column widths. Cells accept inline Markdown, paragraphs and simple lists, a fill of their own — this book's three part colours are :swatch{color="#2b4acb"} blue, :swatch{color="#b7820f"} gilt and :swatch{color="#c0452f"} vermilion — and even an image. Tables are styled once, for the whole document: body and header typography, header fill, rules in a grid, horizontal only, outer only or none.

Tables are edited in the Resources panel, in an editor that works like a small spreadsheet: add or remove rows and columns, merge and split cells, mark header rows and columns, align cells, set fills and column widths, drop an image into a cell, and paste a block of cells copied from a spreadsheet. Every change is undoable, and the table on the page follows as you type.

A table taller than the page splits across pages. Its header rows repeat on every part, the caption of each continuation gains a _(cont.)_ suffix, a _Continued_ marker closes every part but the last, and no split ever cuts through a row span. A rotated table splits the same way, page after page.

## Figures beside the text

In a column-and-a-half layout whose side column carries only floats, resources can live beside the text instead of inside it. A figure with the _side_ span stacks in the side column next to the paragraph that cites it; a callout can do the same, so textbooks can keep definitions, key concepts and marginal figures next to the lines they explain. A wide figure can also keep its caption beside it, in the side column, which is the classic arrangement of illustrated textbooks and exhibition catalogues. The showcase presets include a biochemistry textbook and a literary edition set exactly that way.

## Captions and credits

A caption is the type's prefix, the number and the caption text — which accepts inline Markdown and references of its own. Captions go above or below their resource, optionally on a coloured bar, in the typeface and size of the caption style; the label can be bold or coloured, as in this book. A resource can also carry a note: a smaller credit or source line set under it.

## Turned a quarter

Some resources are wider than the page is tall: a timeline, a wide table of results, a panoramic plate. Such a resource can be turned a quarter turn, clockwise or counter-clockwise. It then takes a page of its own, placed flush to the spine, so that turning the book to read it feels natural, and it is sized to the page's height rather than its width. A rotated table that is taller than one rotated page — that is, wider than the page's height — splits across as many pages as it needs, repeating its header rows, as an upright table would.

## Vector figures

SVG diagrams are drawn as vectors everywhere. The PDF converts the common subset of SVG — shapes, paths, groups, clip paths, solid fills and strokes, opacity and text — into native drawing operations, and rasterises anything beyond it at 600 dpi; a figure can also bring a PDF master of its own, embedded as it is. For single-colour printing, a switch recolours every diagram as tints of one ink, by luminance, in all three renderers.

Text inside an SVG stays text. In the PDF it is set in real fonts and can be selected and searched, and in the Sandbox it can be edited in place: the Resources panel opens the diagram's source with only its text editable — the drawing itself stays locked unless you unlock it — so a label can be corrected or translated without opening a drawing program. The diagrams in this book are generated for each language, which is why their labels are Spanish in the Spanish edition and English in this one.

Three figures set here to prove the point. The rosette of :ref{id="vector-rosette"} is made of Bézier curves, hairline strokes and a line of microtext two and a half points tall; the chart of :ref{id="vector-chart"} combines a filled area, a dashed line and text labels; and :ref{id="vector-clip"} uses a clipping path, a group drawn with transparency and one shape reused five times. Open the PDF, zoom in to several times their size and look at the edges: they stay as sharp as the text around them, because they are drawn with the same operators, not pasted in as pictures. Try selecting the chart's labels, or searching for them: they are text.

:::callout{type="try"}
Click the caption of any figure in the canvas: the Resources panel opens on that resource, with its caption field ready. Change its placement from _auto_ to _top_ and watch it move.
:::

# Books, parts and running heads {lead="A book is more than its chapters: a cover, a contents page that keeps itself up to date, part dividers, openers that announce each chapter and running heads that know where the reader is. All of it is configuration." summary="Chapters, heading styles, design slots, parts, contents and page numbers"}

This guide is a book of twelve chapters, and each chapter is a Markdown document of its own. A project in the Sandbox is always a book: the configuration, the resources and the fonts are shared, and the chapters follow each other, as :ref{id="book-anatomy"} shows.

## Chapters make a book

Every chapter is laid out on its own, _continued_ from the chapters before it: it inherits their page count and page parity, their chapter and figure counters, the open part and the running heads. That is why this chapter's figures are numbered from 6.1, and why editing one chapter never forces the engine to set the whole book again. The previews can show the current chapter or the whole book; the PDF can be built for either. Chapters can be added, renamed, reordered, split at their first-level headings or merged into the previous one.

## What a chapter inherits

The continuation a chapter receives is small and precise. It carries the page count and the parity of the next page, so an opener that must fall on a verso knows whether it needs a blank page before it. It carries the counters: the chapter number, the numbers of every resource sequence, the numbering sequence of the page labels. It carries the open part, with its title, number and palette, so a chapter in the middle of a part keeps its colours. And it carries the book's outline, so a contents page in chapter two can print the page on which chapter ten begins.

Because the continuation is all a chapter needs from the rest of the book, chapters can be laid out independently, in the background, and stitched together for the whole-book view and the PDF. The result is the same as laying out the whole book in one go, page for page — a property the engine is built to guarantee.

## Heading styles

A heading can carry attributes, written in braces at the end of its line. The most powerful is a **style**: \`{style="cover"}\` applies a named heading style, which changes the heading's typography and design and, for the section the heading opens, can change the running heads, the page margins, the column layout, the body typography and the palette. The cover of this book is a heading style with its own margins, no running heads and a full-page design; the contents page is another. A style can also leave its headings unnumbered, so a preface does not shift the chapter numbers, and keep them out of the contents.

## A look at this book's configuration

It is worth seeing how the pages you are reading are built. The cover is the first-level heading of the first chapter, with the style _cover_. The style gives that section margins that push any text to the foot of the page, removes the running heads, and draws a full-page design: a box filling the bleed with the night colour, the cover artwork as an image element anchored to the top of the bleed, a kicker in gilt capitals with generous letter spacing, the title from the front matter in Fraunces at 88 points, a short gilt rule, the subtitle in Lora italic and a line of credits at the foot. The kicker and the credits come from attributes of the heading, written on its line in the Markdown.

The chapter openers are a design of the first heading level. A box fills the top of the bleed in the part colour; the chapter number is printed large at the outer edge, the kicker combines the word _Chapter_, the number and the part's title, and below a short white rule come the title and the chapter's introduction, taken from the heading's \`lead\` attribute. The same heading's \`summary\` attribute is what the contents page prints under each entry. Nothing in these designs is specific to this book: any configuration can compose its own.

## Design slots

Running heads, footers, chapter openers and part pages are drawn by **design slots**: small free compositions of text, rules, boxes and images. Each element is anchored to the page, the bleed, the text area or another element, with offsets and sizes in real units, and prints **placeholders** such as \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` or any attribute of the heading, like the \`{attr.lead}\` that sets the introduction on this chapter's band. Elements can be limited to odd or even pages, and to pages of a given role — body, opener, part or blank — which is how the running heads of this book disappear on chapter openers while a folio appears at their foot. Text elements can wrap, hyphenate, truncate with an ellipsis, draw a box behind themselves and open with a drop cap.

Running heads are an ordinary design slot with elements filtered by parity and role. On this book's versos, the folio in the part colour and the title of the book sit at the outer edge; on rectos, the chapter title and the folio. They appear only on body pages; openers carry a folio at their foot instead, and part dividers carry nothing. The black page facing each part divider is also a design element: a box filling the bleed, shown only on blank versos — which, in a book whose chapters open on versos and whose parts open on rectos, are exactly the pages that face a part.

## Parts and palettes

\`:::part\` opens a part divider: a page of its own, broken to the parity the configuration asks for, drawn by the part design and followed by a body — usually the list of its chapters. Parts carry forward, so the running heads and chapter openers of later chapters can name the part they belong to, and they appear both in the contents and in the PDF bookmarks.

In this book every part opens as a spread: a solid black verso on the left, the divider on the right. The parts break with the parity _always odd_, which lays one blank leaf before every divider and pads a second when the chapter before ends on a verso, so the divider always lands on a recto with a blank verso in front of it. The first chapter of the part then opens on the back of the divider, on a verso, as every chapter does.

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

A few details are worth knowing. Consecutive lines of a paragraph are joined, so line breaks in the source never reach the page; a new paragraph needs a blank line. Lists tolerate a single blank line between items, but two blank lines end them. Ordered lists keep the number they start with, so a list can begin at 0 or 5. And a heading can force a line break in its title with two backslashes, which only affects the designs that print the title large — openers and part pages — while the running heads, the contents and the PDF bookmarks keep it on one line.

Some Markdown is deliberately left out, because a book has other ways to say it: images are resources rather than inline pictures, tables are resources with a model rather than pipe tables, and raw HTML has no meaning on a printed page. Links keep their text; making them clickable and giving inline code a style of its own are on the roadmap.

## Directives and containers

Everything else is expressed with a small vocabulary of directives, listed in :ref{id="document-format"}. Single-line directives start with three colons and act at the point where they appear. Containers wrap blocks between an opening line with attributes and a closing line of three colons; they nest, and an unclosed one is closed at the end of the chapter, with a warning.

Attribute values can be quoted with double or single quotes, or left bare when they are a single word, and a bare key is a flag. A directive the engine does not know is not dropped silently: it is printed as a paragraph, so nothing disappears, and the Warnings panel reports it with its chapter and line. The same happens with a callout style or a paragraph style that the configuration does not define.

## Mentioning resources

References deserve a closer look, because they are how most of a book's apparatus is written. \`:ref{id="…"}\` prints the short label and the number by default — _Fig. 5.1_ in this book's English edition — and incorporates the resource the first time it appears. A \`style\` attribute prints the number alone or the full label, _Figure 5.1_; \`case\` changes the label to lower case, upper case or capitalised, so a reference at the start of a sentence reads correctly; and \`text\` prints any wording at all while still incorporating and linking the resource. A reference to an id that does not exist prints a question mark and a warning, so broken references are found before the book goes to press.

\`::resource{id="…"}\` on a line of its own embeds a resource at that exact point, when its placement says _here_; otherwise it simply counts as a mention. This book uses it nowhere, and lets every figure float — which is usually the better choice.

## Callouts

\`:::callout\` sets a box with an optional title, in one of the styles the configuration defines. This book defines four: the _Try it_ boxes that send you to the Sandbox, the technical notes, the pull quotes set in display italics, and a dark page-wide panel of key figures. A style decides the box's background, border, stripe and corner radius, an optional icon or marker, the typography of its title, body and lists, and where it goes: in the flow, at the head or foot of a column, across the page, into the side column of a column-and-a-half layout, or fixed to a position on the page.

A long callout can split between its paragraphs, or even between its lines, keeping at least two on each side; the continuation leaves out the title. Inside a callout, \`:::columns\` sets its content in balanced columns, like the panel of figures in chapter 2.

A callout's attributes can override its style for one box: a \`title\`, a \`span\` of column, page or side, a \`placement\`, and a \`label\` printed in a tab at its top corner, like the _Box 1-1_ labels of a textbook. Styles can also stop floats at their edge, so a figure mentioned inside a box never escapes past it, and can decide whether a box too tall for its column should split or warn.

:::callout{type="note" title="Why a vocabulary this small"}
Each extension answers one question a book asks and Markdown cannot: where a page ends, how pages are numbered, what a part is, which paragraphs belong to a box. Everything about how they look lives in the configuration, so the same text can be set as a paperback or a magazine without a single edit.
:::

## Mathematics in the source

Mathematics is written in LaTeX notation. Inline formulas go between single dollar signs, in the middle of a sentence; display formulas go between double dollar signs, on a line of their own or as a block of several lines. A dollar sign that should print as a dollar is escaped with a backslash. A formula that is never closed, or that MathJax cannot read, is reported in the Warnings panel and replaced on the page by a red placeholder, so it cannot go unnoticed into the PDF.

## Paragraph styles

\`:::paragraphs{style="…"}\` applies a named paragraph style to the paragraphs it wraps: an epigraph, a dedication, a bibliography, a colophon. A style can change the typeface, size, leading, colour, alignment — including centred and right-aligned — indentation and spacing. The colophon on the back of this book's cover is one.

## Writing well for the engine

A few habits make the engine's work easier and the pages better. Introduce every list with a sentence, so the list is never the first thing under a heading; the warnings panel can flag the ones that are. Keep headings in order, without skipping levels. Mention every figure and table in the text, near where you want it: the mention decides where the resource can go and what number it gets. Leave the placement to the configuration unless a resource really needs a position of its own. And write alternative text for every figure, because the accessible PDF gives it to readers who cannot see the image.

## Front matter

A book's metadata lives in YAML front matter at the head of its first chapter: title, subtitle, author and publication date, available to every design slot as placeholders. This book's cover prints its title and subtitle from there. Any other key is kept for the host application; front matter in later chapters is ignored, with a warning.

# The Sandbox {lead="The Sandbox is the engine with an editor around it: the page you are reading, the Markdown it came from and every setting that shaped it, side by side and live." summary="The editor, the panels, projects, presets and sharing"}

Everything described in this book can be tried right now, without writing code. The Sandbox is not a demo built on top of Postext; it is the engine itself, in an interface meant for two audiences at once — developers evaluating the library, and designers who want to see what every option does.

## A tour of the interface

The interface follows a familiar editor layout, sketched in :ref{id="sandbox-ui"}. An **activity bar** on the left switches between six panels — Projects, Markdown, Resources, Fonts, Configuration and Warnings, the last with a count of open issues. A resizable **sidebar** holds the active panel; clicking the active icon collapses it. The **viewport** on the right shows the same layout in three tabs: Canvas, HTML and PDF.

The sidebar and the viewport share the window, and the boundary between them can be dragged. Every panel and the viewport remember their state between visits: the zoom and view mode of the canvas, the column mode of the HTML view, the sections open in the Configuration panel. The theme and the interface language are switched from the foot of the activity bar, and the language of the interface is independent of the language of the book.

## Editing a book

The Markdown editor highlights front matter and mathematics, and its toolbar inserts formatting, lists, page breaks and numbering changes. At its head, a **chapter switcher** moves between the chapters of the book, showing their page ranges; each chapter keeps its own undo history and cursor. Editor and pages stay in step both ways: clicking a word on the page puts the cursor on it in the Markdown, and selecting text highlights it on the page.

The editor also keeps an eye on the book. Its chapter menu lists every chapter with the pages it occupies once they are known, and moving to another chapter switches the previews to it. Chapters can be created, renamed, reordered, split at their first-level headings or merged into the previous one, and the whole chapter can be exported as a Markdown file or replaced by one.

## Configuration

The Configuration panel edits the whole configuration — more than five hundred fields — grouped in collapsible sections. A search box finds any option by name, category chips narrow the list to the document, the text, figures and tables, the output or advanced settings, and a _modified only_ filter shows what differs from the defaults. Every field and every section can be reset on its own, and the configuration can be exported and imported as a file.

## The three views

The **canvas** view is the working preview: it zooms from a quarter of real size to four times, fits the page to the width or the height of the viewport, and shows single pages or spreads, with the first page on its own as a recto, the way a printed book opens. The **HTML** view shows the same layout as positioned HTML, isolated from the rest of the page, with a control for the size of the text and two reading modes: one scrolling column, or as many columns as fit the screen. The **PDF** view generates a real PDF in the browser and shows it in the browser's own viewer, with buttons to generate it again, download it and print it.

The canvas and the HTML views can lay out the current chapter or the whole book; the PDF has its own choice, so a single chapter can be proofed quickly while the previews show the book. This guide opens in whole-book mode.

## Resources and fonts

The Resources panel lists the book's resources by type. Images and SVG files can be dragged in, tables are edited in a spreadsheet-like editor with merged cells, fills, images, column widths and pasting from a spreadsheet, and the text of an SVG diagram can be edited in place. Clicking a caption, a note, a cell or the text of a diagram in the preview opens it in the panel. The Fonts panel adds families of your own, weight by weight, in the usual web and desktop formats; a custom family takes precedence over a Google Font of the same name.

Each resource has a detail view with its id, its type, its caption, its note and its alternative text, its placement — position, span, rotation, width, alignment and a caption beside it — and a live preview. Deleting a resource warns when the text still mentions it. The Fonts panel, for its part, checks that every family the configuration names has the weights and styles it needs, and warns about missing or duplicate variants.

## Warnings

The Warnings panel lists everything the engine noticed while setting the book: fonts that failed to load, loose lines, skipped heading levels, unclosed containers and unknown directives, unknown styles, placeholders that print nothing, missing resources and callouts too tall for their column. Every warning names its chapter and line, and clicking it jumps there.

## Projects, presets and sharing

Your work is saved in the browser as you type. **Projects** are books stored locally, each with its name, description and cover image; they can be duplicated, exported and imported. **Presets** are read-only books to start from: this guide and a gallery of showcase editions — an astronomy magazine, an illustrated _Don Quixote_, an environmental magazine, an exhibition catalogue and two university textbooks — each set with a design of its own. Duplicate one as a project to make it yours.

Presets follow their source. When a preset bundle changes on the server, the Sandbox notices within seconds: an untouched preset is reloaded on its own, and one you have edited shows a banner offering to reload it, so work in progress is never overwritten. Presets can be hidden from the list and shown again, and each one can be opened in either of its languages when it has two, like this guide.

A book travels as a single **.postext** file: its chapters, configuration, resources and fonts, plus the pagination already computed, so it opens paginated. And the address bar always holds a permalink to what you are looking at — the book, the language, the viewer, the chapter and the page.

:::callout{type="try"}
Scroll to a page you like and copy the address from the browser: opening that link shows the same book, in the same viewer, at the same page.
:::

## Embedding the Sandbox

The Sandbox is itself a package, _postext-sandbox_, a React component that any web application can embed. Its host decides the initial Markdown and configuration, the interface language and every label, the sources of presets it offers, and the theme toggle, language switcher and home link it shows. The Sandbox you are using is exactly that component, embedded in the Postext website.

# Output: canvas, HTML and PDF {lead="One tree, three renderers. The canvas previews, the HTML reads on screen, the PDF goes to press — and all three draw the same lines at the same positions." summary="The three renderers, accessible PDF and using the library"}

Because every renderer reads the same VDT, the promise _what you see is what you get_ is literal: line breaks, page boundaries and the position of every figure match across the three outputs.

## Canvas

The canvas renderer draws a page on an HTML canvas, at any resolution. In the Sandbox it is the live preview, with zoom, fit to width or height, single pages or spreads, and pages drawn lazily as they scroll into view, so long books stay responsive.

Resource images are registered with the renderer once, by file id, and reused on every page. Pages can be drawn to any canvas at any scale, which makes the same renderer useful for thumbnails, print previews and image export: the documentation's live examples draw a page and turn it into a PNG.

## HTML

The HTML renderer returns absolutely positioned HTML with editorial CSS: every line where the layout put it, in its exact font, size and baseline. An indexed variant tells the host which parts of the page changed, so a viewer can patch only those. In the Sandbox, the HTML tab isolates the output in a Shadow DOM and adds a reading mode with a single scrolling column or as many columns as fit the screen, with a font-scale control. A screen-only set of overrides can adjust the design for reading on screen without touching the print pages.

The renderer takes a function that turns a resource's file id into a URL, so images can be served from anywhere, and a background colour for the page. Its output is plain markup and CSS, with no script, which makes it suitable for static hosting, e-mail previews or server-side storage once the layout has been computed in a browser.

## PDF

The _postext-pdf_ package turns the VDT into a real PDF, for one document or for a whole book. It never measures again: the canvas metrics are the source of truth and the PDF only transports them, which is why the lines break in exactly the same places. It embeds real fonts, one static face per weight, so bold is bold and italic is italic, and the text stays selectable. On top of the pages it adds bookmarks from the headings and parts, page labels that match the printed numbers, clickable references, SVG figures as vectors and a choice of colour space — RGB, CMYK or greyscale — for print.

The fonts reach the PDF through a **font provider**, a function that returns the bytes of a family in a given weight and style. The Sandbox's provider fetches static faces from Fontsource, one file per weight, and decompresses them from WOFF2; custom fonts come from the Fonts panel. Resource bytes are handed over the same way, by file id. Rendering reports its progress, runs in a worker of its own when asked, and accepts a whole book as a list of chapter documents, producing one PDF with continuous page labels, bookmarks and links.

## Accessible by default

Every PDF is **tagged** by default, following the PDF/UA-1 standard: a structure tree of headings, paragraphs, lists, tables and figures in reading order, alternative text for every figure, the document language, and decorative elements marked as artefacts so screen readers skip them. Accessibility is not an export option to remember; it is the way the file is made.

Tagging follows the layout rather than the source. Paragraphs split across columns and pages are tagged as one paragraph, lists keep their items together, tables keep their header cells, and figures carry their alternative text — or their caption, or their label, when no alternative text was written. The document's title and language travel in its metadata, running heads and page decorations are marked as artefacts, and references between the text and the figures they mention are real links.

## Colour for print

Colours in the configuration are written as hexadecimal values, optionally linked to the palette, and that is what the PDF draws by default. For print production the PDF can be forced into a colour space: CMYK for offset printing or greyscale for single-colour work. Combined with single-ink diagrams, a book can go from a colourful screen edition to a one-colour print edition by changing two settings, without touching the text or the figures.

## Whole books

The PDF of a book is not a concatenation of separate files. The renderer receives the layout of every chapter and writes one document: the page labels run on across chapters, the bookmarks form one tree with the parts above their chapters, and the accessible structure of the whole book is one tree in reading order. Because each chapter was laid out as a continuation of the ones before it, the pages of chapter seven in the book PDF are exactly the pages of chapter seven printed on its own.

The Sandbox offers both: the PDF view can be switched between the current chapter, for quick proofs, and the whole book, for the final file. Building the whole book takes longer, so it runs in the PDF worker and reports its progress page by page.

## Fonts in the PDF

A PDF is only as good as the fonts inside it. Postext embeds every face the layout used — one static file per weight and style, so a bold word is set in the real bold and an italic in the real italic, never a slanted or thickened imitation. TrueType faces are subset to the glyphs the book actually uses, which keeps files small even with four families; OpenType faces with PostScript outlines are embedded whole, because some viewers cannot read their subsets. Every embedded font carries a map from glyphs back to characters, including ligatures, so copying a sentence out of the PDF gives back the sentence that was written, and searching the document finds every word.

The families come from wherever the Sandbox found them. Google Fonts are fetched face by face from Fontsource and decompressed on the fly; families uploaded in the Fonts panel are embedded from the files you gave. A family available only as WOFF is not accepted by the PDF, because the format cannot be embedded reliably; WOFF2, TrueType and OpenType files all work.

## Choosing an output

The three outputs share the layout but serve different moments of a book's life. The **canvas** is the working view: fast, faithful, and the one the Sandbox keeps open while you write and design. The **HTML** is for reading on screen and for publishing inside a web application: the same pages as positioned markup, or the text reflowed into the reading modes of the viewer, isolated from the styles of the page around it. The **PDF** is the finished artefact: the file that goes to the printer, to an archive or to a reader's device, tagged, bookmarked and searchable.

Nothing forces a choice between them. A book can be written in the Sandbox with the canvas open, reviewed in the HTML viewer by someone reading on a phone, and sent to press as a PDF the same afternoon, from the same source and the same configuration, without any of the three drifting from the others.

## Using the library

The engine ships as two packages on npm: _postext_ for the layout and the canvas and HTML renderers, and _postext-pdf_ for PDF output. Both are ES modules under the MIT licence and can also be imported straight from a CDN. The documentation includes live examples that render a page to an image, to HTML and to a PDF, ready to fork.

:::callout{type="note" title="Four steps"}
1. Load the fonts the configuration names, so the browser can measure them
2. Build the document with \`buildDocument(content, config)\`
3. Draw its pages with \`renderPage\`, or render them with \`renderToHtml\`
4. For print, pass the same document to \`renderToPdf\` with a font provider
:::

The layout engine runs in the browser, where it can measure with the fonts the reader sees; _postext-pdf_ runs in the browser too, and also in Node, so a PDF can be produced on a server from a layout computed elsewhere. Both packages are ES modules only, with TypeScript types included, and some bundlers need a one-line setting for the WOFF2 decoder the PDF package uses. The documentation walks through the whole path, from installing the packages to a first PDF.

The engine and its PDF renderer are released together, with the same version number, so the two always agree on the shape of the layout they share.

# Roadmap and community {lead="Postext is young and open. The core pipeline, the document format and the configuration system have shipped; what comes next is decided in public." summary="Where the project stands and how to take part"}

Postext is not trying to be a universal document platform. It aims to be a very good editorial layout engine for the web, and it keeps its scope narrow so the core can stay sharp. Its long-term ambition is to become the standard layout engine for editorial content on the web: something publishers, magazines, book platforms and development teams can adopt and build on.

## Where the project stands

The work is organised in four phases, summarised in :ref{id="development-phases"}. They are not strict milestones; they describe the order in which capabilities become stable enough for production.

The first two phases are essentially complete: the data model, the parser and the measurement layer, the document format, the column engine with its balancing, floats and tables, and the book machinery of chapters, parts, contents and running heads. The third phase has delivered its core — optimal line breaking with editorial penalties, hyphenation in eight languages and mathematics — and has one large piece still open. The fourth, output, has shipped canvas, HTML and a tagged PDF, together with the worker, the Sandbox and its presets.

What is still missing is as important as what has shipped. **Footnotes, endnotes and margin notes** are the largest open area: the data model has a place for them, but they are not laid out yet. **Links** keep their text but not their destination, inline code has no style of its own, text does not yet flow around obstacles, and layout happens in the browser only. These are the next problems worth solving, and the ones where help counts most.

## Getting involved

The project lives on GitHub, and every conversation happens in the open: **issues** for bugs, requests and concrete tasks; **pull requests** for code, reviewed in public; **discussions** for ideas, design questions and anything not yet concrete enough to be an issue. Issues labelled _good first issue_ are the easiest way in.

The usual path from idea to code is short: an issue describes the problem, a discussion settles the approach when there is more than one, a pull request implements it, and the change is merged into the development branch and released from there. Opening an issue before a large pull request saves everyone time, because the approach can be agreed before the code is written.

## Where help counts

Every part of the project welcomes contributors. The **engine** has deep problems — line breaking, balancing, numbering, float placement — and approachable ones in its tests and benchmarks. The **PDF backend** has font embedding, colour management and accessibility. The **Sandbox** has its panels, its editors and its translations, organised so every interface string is added the same way in every language. **Design and typography** need people who know editorial traditions, especially those of scripts the engine does not yet serve well. And the **documentation** and its translations, currently in English and Spanish, are open to anyone who can explain something clearly.

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

Other things are simply not done yet. Laying out on a server, without a browser, is a later scope: the engine measures with the metrics of a real browser today, and a server version would need the same metrics to produce the same pages. Real-time collaboration, sharing a live session by link, is on the Sandbox's list of ideas. Both will be discussed in the open before any code is written.

## Licence

Postext is released under the **MIT licence**: the engine, the PDF renderer and the Sandbox can be used, modified and embedded in open and closed projects alike, commercially or not, provided the licence notice travels with the code. The typefaces of this book are open fonts served by Google Fonts, the diagrams are part of the Sandbox's source, and the text of this guide belongs to the project and its contributors.

## Values

Three values guide the project, and they are meant to be used, not framed: when two good ideas pull in different directions, they are how the choice gets made.

_Thoughtful design over speed._ Typography has centuries of accumulated wisdom, and the engine should honour it rather than reinvent it badly. A feature lands when it does the right thing on a real page, not when it merely works in a demo; a rule borrowed from print is studied in the books that use it before it becomes an option. Some features take longer that way. The ones that ship do not need to be taken back.

_Clarity over cleverness._ Code, configuration and documentation should be easy to read, change and explain. An option that needs a paragraph of caveats is a sign that the design is not finished yet; a function that only its author can follow will not survive its author's holidays. The configuration keeps real units and plain names, the document format stays readable in any editor, and the engine's decisions can always be traced back to a rule someone can point at.

_Collaboration over territory._ Decisions are made in public, in issues and discussions anyone can read and join, and no part of the code belongs to a single person. Every contribution is recognised — code, documentation, translations, bug reports, typographic advice and the example books that show what the engine can do — because a layout engine for everyone can only be built by many people.

If any of this resonates with you, the repository is the next step. Open an issue, ask a question in the discussions, or change something in this book and see what the engine does with it.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::
`;
