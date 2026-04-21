export const DEFAULT_MARKDOWN_EN = `---
title: "Postext: A Programmable Typesetter for the Web"
subtitle: "An open-source layout engine for editorial-grade typography"
author: "Ignacio Ferro"
publishDate: "2026-04-21"
---

# Postext: A Programmable Typesetter for the Web

Postext is an **open-source layout engine** designed to bring the sophistication of professional print typography to modern web development. For centuries, the world of editorial design has refined techniques for placing text, images, and annotations on a page with extraordinary precision. These techniques encompass everything from careful column balancing to meticulous orphan and widow prevention, from intelligent hyphenation to elegant footnote placement. Until now, the web has lacked a tool capable of reproducing these standards in a programmable, declarative way.

The core mission of Postext is to bridge that gap. It takes **semantic content** written in enriched Markdown and transforms it into a fully resolved layout where every element has a precise position, measured in real typographic units. That layout can then be rendered to multiple output formats, including interactive web pages, live canvas previews, and print-ready PDF documents, all originating from the same single source of truth.

This default document, which you are reading inside the Sandbox right now, has a double purpose. On one hand it is a live demonstration of what the engine can do with long-form prose. On the other, it is a compact tour of the ideas, decisions, and features that make Postext distinct from every other layout technology available on the web. Feel free to modify it, shorten it, replace it with your own material, or use it as scaffolding while you explore how changes to the configuration panel propagate instantly through the canvas, the HTML view, and the PDF output.

## The Problem Postext Solves

Before explaining the internals, it helps to understand the specific shape of the problem Postext addresses. The gap between what modern browsers can render and what professional editorial design expects is much wider than most developers realise, and the tools that have traditionally filled that gap live outside the web ecosystem entirely. This section describes both sides of that gap and the reasons a new kind of engine became necessary.

### The Limitations of CSS for Editorial Layout

Modern CSS is a remarkably powerful tool for building user interfaces. Flexbox, Grid, and container queries give developers fine-grained control over how components are arranged on screen. Subgrid, anchor positioning, and scroll-driven animations continue to push the boundaries of what a browser can express declaratively. However, CSS was designed primarily for _application layout_, not for _editorial layout_. There is a fundamental difference between the two:

- **Application layout** arranges interactive components such as buttons, forms, navigation bars, and cards within a viewport that the user can scroll freely
- **Editorial layout** arranges flowing text, images, tables, figures, and annotations across a series of fixed-dimension pages or columns, following strict typographic rules inherited from centuries of print tradition

CSS handles the first case brilliantly. For the second case, it falls short in critical ways that have never really been addressed by the platform:

1. **No native multi-column text flow with reflow awareness**
   - The CSS _columns_ property exists, but it cannot balance column heights intelligently
   - It cannot handle resources that span columns or float to specific positions within a column grid
   - It provides no mechanism for keeping headings together with their following paragraphs
   - It has no concept of a globally optimal break set across a page
2. **No orphan and widow prevention across columns**
   - While CSS has _orphans_ and _widows_ properties, browser support is inconsistent
   - These properties do not work across column boundaries in the way professional typesetters expect
   - Editorial-grade prevention requires awareness of the entire page geometry, not just a single text container
   - No CSS property models a _runt_, the single short word left stranded at the end of a paragraph
3. **No integrated resource placement strategies**
   - Print layouts routinely place figures at the top of the next available column, float them into the margin, or break them across the full width of the page
   - CSS floats are primitive compared to these strategies and cannot negotiate with surrounding text flow
   - There is no notion of a figure that should be deferred one column if it would orphan the text above it
4. **No footnote or margin note systems**
   - Footnotes in print appear at the bottom of the column where they are referenced, consuming space from the text area above
   - Margin notes align vertically with the paragraph that references them
   - Endnotes must be collected per section or per document with consistent numbering
   - CSS offers no mechanism for any of these
5. **No concept of a baseline grid**
   - Professional books and magazines align the first baseline of every column to a shared vertical rhythm
   - CSS has no primitive for snapping lines to a grid that spans columns and pages

The pattern is consistent. CSS can describe the _appearance_ of any single region of text in great detail, but it lacks the _global optimisation_ primitives that editorial quality requires. Editorial typography is, ultimately, a constraint satisfaction problem, and the browser has never been given the language needed to express those constraints.

### What Existing Tools Miss

There are, of course, tools that address parts of this problem. Word processors like Microsoft Word and Google Docs handle basic pagination. Desktop publishing applications like Adobe InDesign provide complete editorial control. LaTeX is the gold standard for academic typesetting, and its descendants continue to dominate mathematical publishing. However, none of these tools were designed for the web, and their assumptions make it very hard to graft them onto modern development workflows:

- They do not produce _responsive_ layouts that adapt to different screen sizes
- They do not integrate with modern frontend frameworks like React, Vue, or Svelte
- They cannot be embedded as a component within a larger web application
- Their output is static, not interactive, and rarely preserves the semantic structure that accessibility tools depend on
- Their source formats are either proprietary, binary, or so complex that they are difficult to generate programmatically

Postext occupies a unique position in this landscape. It is a **JavaScript library** that runs in the browser, takes Markdown as input, applies professional typographic rules, and produces a layout that can be rendered as HTML, as canvas, or as PDF. It is designed to be embedded, configured, and extended by web developers who want publication-grade results without leaving their familiar toolchain. It uses the web as both an editing surface and a first-class rendering target, rather than treating it as an afterthought.

## How Postext Works

Understanding the architecture of Postext is the fastest way to understand what it can and cannot do. The engine is organised as a pipeline where each stage refines a shared in-memory representation of the document. No stage hides behind opaque formats, no stage requires disk I/O, and the entire pipeline is pure: given the same content and configuration, it always produces the same layout.

### The Processing Pipeline

The Postext layout engine processes content through a carefully orchestrated pipeline. Each stage builds upon the results of the previous one, gradually transforming raw Markdown into a complete, precisely measured layout. Understanding this pipeline is key to understanding the design philosophy of the project, and it also clarifies which parts of the engine you can replace, extend, or reuse in isolation.

#### Input Layer

The process begins with the **input layer**, where the developer provides the raw ingredients of the document. Two things travel through this layer, and both are intended to be human-readable and hand-editable:

1. **Content** in enriched Markdown format
   - The main body of text, written using standard Markdown syntax
   - Headings, paragraphs, lists, emphasis, and other inline formatting
   - Special markers that reference external resources or notes
   - Optional YAML frontmatter describing the document's title, author, and publication date
2. **Configuration** that defines the layout rules
   - Page dimensions, margins, and DPI settings
   - Column count, gutter width, and balancing preferences
   - Typography rules for orphan prevention, widow prevention, runt prevention, and hyphenation
   - Resource placement strategies for images, tables, and figures
   - Reference system settings for footnotes, endnotes, and margin notes
   - A named colour palette that can be referenced from multiple places in the configuration

The separation of content and configuration is deliberate and important. The same Markdown document can produce radically different layouts simply by changing the configuration. A single-column layout for mobile screens, a two-column layout for tablets, and a three-column layout for wide desktop monitors can all originate from the same source text. This is the editorial equivalent of responsive design, and it is the reason the engine refuses to bake visual decisions into the content itself.

#### Measurement Layer

Before the engine can decide where to place each element, it must know how much space each element occupies. This is the role of the **measurement layer**, which is built on a sister library called _pretext_. The measurement problem sits at the heart of every typography engine, and getting it right — both accurate and fast — was the enabling insight behind the whole project.

The measurement challenge is significant. Text rendering is complex because the width and height of a paragraph depend on the font, the font size, the line height, the available width, the hyphenation rules, and many other factors. Traditionally, the only way to measure text accurately in a browser is to render it into the DOM and read back the computed dimensions. This approach is slow, as it triggers layout reflows that can block the main thread for hundreds of milliseconds per paragraph on realistic documents.

Postext takes a fundamentally different approach. The _pretext_ library performs **DOM-free text measurement** using canvas font metrics and pure arithmetic. This technique is between 300 and 600 times faster than DOM-based measurement, depending on the browser and the document, and it works by combining three ingredients:

1. Loading font metrics from the canvas API
   - Glyph widths and advance metrics
   - Ascender and descender measurements
   - Kerning pair adjustments when available
   - Per-weight metrics for bold and italic variants
2. Computing line breaks using the Knuth-Plass algorithm
   - Evaluating all possible break points in a paragraph
   - Choosing the set of breaks that minimises a global penalty function
   - Accounting for hyphenation opportunities with TeX-quality patterns
   - Respecting adjacency rules between tight, normal, loose, and very loose lines
3. Calculating the resulting block dimensions
   - Total height including all lines and inter-line spacing
   - Maximum line width for alignment purposes
   - Baseline positions for grid alignment
   - Per-line justification ratios for the debug overlay

This measurement approach is the critical innovation that makes Postext practical. Without it, the engine would need to perform thousands of DOM reflows during layout computation, making interactive editing impossible. With it, you can type into the Sandbox and watch the layout update between keystrokes.

#### Layout Engine

The **layout engine** is the heart of Postext. It takes the measured elements and arranges them on pages and columns according to the configured rules. This is where the editorial intelligence lives, and it is the place where the gap between a naive first-fit algorithm and a true typesetting engine becomes visible.

The layout engine operates iteratively. It makes an initial placement pass and then refines the result through successive iterations, adjusting element positions to satisfy constraints that may conflict with each other. For example:

- A heading must stay with its following paragraph, which might require moving both to the next column
- Moving content to the next column might create a widow in the current column
- Eliminating that widow might require pulling content back, which could break the heading-paragraph constraint
- A figure that should appear at the top of the next column might get deferred one more column if it would otherwise push an orphan into the top of the current one

These circular dependencies are resolved through a **convergence loop** that runs up to five iterations. In practice, most layouts converge within two or three iterations. The engine detects when no further improvements can be made and stops early, so the cap is a safety net rather than a typical code path. The data structure that survives this loop is known internally as the **VDT**, the virtual document tree, and it is the single source of truth that every renderer consumes.

The layout engine produces a VDT that describes the exact position and dimensions of every element on every page. This structure is format-agnostic, meaning it contains pure geometry without any rendering-specific information, and that format-agnosticism is precisely what allows Canvas, HTML, and PDF to produce matching output.

#### Output Layer

The final stage is the **output layer**, which takes the abstract geometry and renders it to a specific format. The engine currently ships three renderers, and all three consume the same VDT without ever modifying it:

- **Canvas renderer** produces a rasterised preview on an HTML5 canvas element
   - Pages render lazily via IntersectionObserver for performance on long documents
   - Zoom, fit-to-width, fit-to-height, and double-page spread modes are built in
   - The output is suitable for a quick visual inspection at any zoom level
- **Web renderer** produces HTML elements with precise CSS positioning
   - Each element is absolutely positioned within its page container
   - Text is rendered with exact font sizes, line heights, and baseline positions
   - The result is a React component that can be embedded in any web application
   - Style isolation is achieved through a Shadow DOM so the host page cannot leak in
- **PDF renderer** produces print-ready documents
   - Uses the same VDT data as the web and canvas renderers
   - Generates vector-based output suitable for professional printing
   - Preserves all typographic details including exact character positions
   - Embeds per-weight static fonts so bold and italic actually render at the correct weight

Because all three renderers read from the same VDT, the promise _what you see is what you get_ is not rhetorical: line breaks, page boundaries, and resource placement match pixel-for-pixel across the three backends.

## Typography Features

The following features are where Postext invests most of its effort. Each of them has a long history in the world of print, and each of them has, until now, been either impossible or painfully awkward to achieve inside a browser. Postext treats them as first-class citizens, configurable by a designer who does not need to write a single line of code.

### Orphan and Widow Prevention

In professional typography, an **orphan** is a single line of a paragraph that appears alone at the top of a column or page, separated from the rest of its paragraph. A **widow** is a single line that appears alone at the bottom of a column or page. Both are considered serious typographic flaws because they disrupt the visual rhythm of the text and make it harder for readers to maintain their flow.

Postext provides configurable orphan and widow prevention:

- The _orphan minimum lines_ setting specifies the minimum number of lines that must appear at the beginning of a paragraph before a column break
- The _widow minimum lines_ setting specifies the minimum number of lines that must appear at the end of a paragraph after a column break
- The engine will adjust column breaks, move content between columns, and even modify line breaks within paragraphs to satisfy these constraints
- When constraints conflict, the engine uses a priority system driven by configurable penalties to determine which rule takes precedence
- Orphan and widow rules apply to list items too, with independent toggles for each list type

In addition to orphans and widows, Postext recognises a third common defect called a **runt**: the last line of a paragraph containing just one or two short words, stranded far from the rest of the text. Runts are measured in terms of minimum character count, and they are penalised directly inside the Knuth-Plass optimisation so the line breaker will naturally prefer sets of breaks that avoid them.

### Hyphenation and Rag Optimisation

**Hyphenation** is the practice of breaking words at syllable boundaries when they fall at the end of a line. Proper hyphenation improves the evenness of line lengths and reduces the visual disturbance caused by large gaps between words in justified text. Without it, an engine has no way to avoid a loose line except by moving whole words, and moving whole words tends to just push the problem down the paragraph.

Postext supports hyphenation through **TeX-quality Liang patterns** served by the _Hypher_ library. These are the same patterns that TeX has used since 1983, maintained by the TeX community and refined over four decades of use. They are generated from large word corpora and cover far more edge cases than any hand-written heuristic could hope to match. The supported locales currently include English, Spanish, French, German, Italian, Portuguese, Catalan, and Dutch, and adding more is a matter of importing the corresponding pattern file.

The hyphenation system exposes the following controls:

- Language-specific hyphenation patterns that define valid break points within words
- Minimum character counts before and after the hyphen to prevent awkward breaks
- Maximum consecutive hyphenated lines to avoid a distracting staircase effect on the right margin
- Hyphenation penalty values that influence the Knuth-Plass algorithm when choosing between a hyphenated break and a looser line

**Rag optimisation** refers to the smoothing of the right edge of left-aligned text, which is called the _rag_. An unoptimised rag can appear jagged, with short lines followed by long lines in an erratic pattern. Postext optimises the rag by:

1. Evaluating the visual quality of the right margin across multiple lines
2. Adjusting word spacing within acceptable limits
3. Choosing break points that produce a gradually varying rag rather than an abrupt one
4. Considering hyphenation as a tool for rag smoothing, not just line fitting

### Knuth-Plass Justification

For justified text, Postext implements the full **Knuth-Plass optimal line breaking algorithm**, the same algorithm that has powered TeX since 1981. Unlike the greedy first-fit approach that CSS uses, Knuth-Plass evaluates every possible way to break an entire paragraph and selects the combination that minimises total _badness_ across all lines. The result is justified text whose inter-word spacing is visibly more even than anything the browser can produce natively.

The algorithm models text as a sequence of three primitives:

- **Boxes** are words or word fragments that have a fixed width and cannot be stretched, compressed, or broken
- **Glues** are inter-word spaces that have a natural width plus stretch and shrink capacities, so the engine can adjust them to fill the line
- **Penalties** are potential break points with an associated cost, where _flagged_ penalties also mark hyphenation opportunities and introduce a visible hyphen if used

For each candidate break the algorithm computes an adjustment ratio, a badness value that grows cubically with the absolute ratio, and a total demerit that also takes into account hyphenation and fitness class transitions between adjacent lines. Postext extends the classic demerit set with three editorial penalties — orphan, widow, and runt — so the same optimiser that balances word spacing also avoids paragraph-end defects.

### Spacing and Rhythm

Vertical spacing in editorial typography follows strict rules that maintain the visual rhythm of the page. Postext enforces these rules through its configuration system:

- **Heading spacing** controls the distance above and below headings of each level
   - Larger headings receive more space above them to visually separate them from the preceding section
   - The space below a heading is smaller than the space above it, creating a visual connection between the heading and its content
   - Consecutive headings without text between them are flagged by the warnings panel as a semantic defect, because they almost always indicate a missing introduction
- **Paragraph spacing** can be configured as either indentation or vertical gaps
   - Traditional book typography uses first-line indentation with no vertical gap between paragraphs
   - Modern digital typography often uses vertical gaps with no indentation
   - Postext supports both approaches and allows mixing them within a single document
- **List spacing** controls the distance between list items and between nested levels
   - Items within a list can be tightly or loosely spaced
   - Nested lists can have additional indentation and different bullet styles at each level
- **Baseline grid alignment** snaps text to a regular vertical grid
   - This ensures that text in adjacent columns aligns horizontally
   - It creates a sense of order and stability across the entire page
   - Elements that break the grid, such as headings with larger font sizes, can be configured to realign to the grid afterwards

## Column-Based Layouts

Columns are the most visible expression of editorial design, and they are also the place where most homemade CSS solutions break down first. Postext provides a column system that treats columns as first-class citizens of the page, with their own balancing rules, their own resource placement strategies, and their own relationship to the baseline grid.

### Multi-Column Text Flow

One of the most distinctive features of editorial layout is the use of multiple columns. Columns serve several purposes in professional typography:

- They keep line lengths within the optimal range for reading comfort, which is generally considered to be between 45 and 75 characters per line
- They allow more text to appear on a single page without requiring an uncomfortably small font size
- They create visual variety and structure on the page
- They provide opportunities for sophisticated resource placement and for mixing narrow textual passages with wide figures

Postext supports flexible multi-column configurations:

1. **Column count** can be set to any positive integer, or chosen from several preset layouts
   - Single-column layouts for narrow viewports or focused reading
   - Two-column layouts for articles and essays
   - Column-and-a-half layouts that mix a main column with a narrow side column for annotations
   - Three or more columns for newsletters, magazines, and reference materials
2. **Gutter width** controls the space between columns
   - Wider gutters make columns feel more independent
   - Narrower gutters allow more text per page but often require a visual separator
3. **Column rules** are optional vertical lines drawn between columns
   - Their weight, style, and colour are configurable
   - They help readers distinguish between columns when gutters are narrow
4. **Column spanning** allows certain elements to break the column grid
   - A heading might span two of three columns
   - A figure might span the full width of the page
   - A pull quote might float across the gutter between two columns

### Column Balancing

When text flows through multiple columns, the columns often end at different heights. The last column on a page might contain only a few lines while the others are full. This looks unfinished and unprofessional, and it is one of the most common complaints in amateur multi-column layouts.

**Column balancing** is the process of distributing text evenly across columns so that they end at approximately the same height. This is a surprisingly difficult computational problem because:

- Moving text between columns changes line breaks, which changes the height of each column
- Figures and other non-text elements have fixed heights that cannot be split
- Footnotes associated with text in a column must appear at the bottom of that same column, consuming space
- Orphan and widow constraints may prevent certain distributions
- The baseline grid imposes discrete landing positions rather than continuous ones

Postext approaches column balancing through iterative refinement:

1. First, it fills columns sequentially to establish a baseline distribution
2. Then, it calculates the ideal column height by dividing the total content height by the number of columns
3. It redistributes content to approach this ideal height, respecting all constraints
4. It repeats the redistribution until the column heights converge or the maximum iteration count is reached
5. If convergence fails, it keeps the best intermediate result rather than producing a degenerate layout

### Mixed Column Structures

Not all content on a page needs to follow the same column structure. A common pattern in editorial design is to begin a section with a full-width introductory paragraph, then transition to a multi-column layout for the body text. Another pattern places a wide image or table across the full width of the page, interrupting the multi-column flow and resuming it below. A third pattern uses a column-and-a-half structure where the narrow side column hosts margin notes, pull quotes, and secondary illustrations.

Postext supports these mixed structures through **section overrides**:

- Each section of a document can specify its own column configuration
- Transitions between section types are handled automatically
- The engine manages the vertical space consumed by each section and ensures that content flows correctly from one to the next
- Overrides are applied declaratively, so the same Markdown document can render differently across devices

## Resource Placement

Resources are everything that is not flowing text: images, tables, figures, pull quotes, sidebars, and any other block that interrupts or accompanies the main narrative. The way these blocks are placed on a page has a disproportionate effect on the reader's experience, and Postext gives you a vocabulary for expressing that placement intention at a semantic level rather than a pixel level.

### Placement Strategies

In editorial design, resources such as images, tables, figures, and pull quotes are not simply inserted inline at the point where they are referenced. Instead, they are placed according to strategies that optimise the visual quality of the page and the readability of the surrounding text. A reference in the text is a _hint_ about where a resource belongs, not a command.

Postext supports several placement strategies:

- **Top of column** places the resource at the top of the current or next available column
   - This is the most common strategy in academic and professional publishing
   - The resource is anchored to the top of the column, and text flows below it
   - If the resource is too tall for the remaining space, it is deferred to the next column
- **Inline** places the resource at the exact point where it is referenced in the text
   - The text flow is interrupted, the resource is inserted, and the text resumes below
   - This is the simplest strategy but can lead to awkward page breaks if the resource falls near the bottom of a column
- **Float left and float right** place the resource at the left or right edge of the column
   - Text wraps around the resource, flowing to the opposite side
   - The resource can be configured to extend into the gutter or margin
   - Multiple floats can coexist in the same column if there is sufficient space
- **Full-width break** interrupts the column layout entirely
   - The resource spans the full width of the page
   - All columns above and below the resource are synchronised
   - This is commonly used for large images, wide tables, or section dividers
- **Margin** places the resource in the page margin
   - The resource is aligned vertically with the paragraph that references it
   - This is used for small illustrations, icons, or supplementary annotations

### Aspect Ratio and Sizing

When placing resources, Postext preserves aspect ratios and provides multiple sizing options:

1. **Natural size** uses the intrinsic dimensions of the resource
2. **Column width** scales the resource to fill the width of a single column
3. **Span width** scales the resource to span a specified number of columns including gutters
4. **Full width** scales the resource to fill the entire text area
5. **Custom dimensions** allow the developer to specify exact width and height values

The engine ensures that resources never overflow their containers and adjusts surrounding text flow to accommodate the final dimensions. If two placement strategies compete for the same space — a float right and a top-of-column figure, for example — the engine applies a configurable priority order and defers the loser to the next available slot.

## Reference Systems

Reference systems are the thread that connects an author's main narrative to its scholarly apparatus, supplementary commentary, and bibliographic scaffolding. Handling them well is what separates a document that feels like a finished book from one that feels like a printed blog post, and it is another area where the browser has historically provided almost no help.

### Footnotes

Footnotes are one of the most complex features in editorial typography. A footnote must appear at the bottom of the column where it is referenced, and the space it occupies must be subtracted from the available text area in that column. This creates a feedback loop that a single-pass algorithm cannot resolve:

- Adding a footnote to a column reduces the available text space
- Reducing the text space might push the footnote reference to the next column
- If the reference moves, the footnote must move with it, changing the text space in both columns
- Changing the text space in the next column might, in turn, push a different footnote back to the previous one

Postext handles this complexity through its convergence loop. The engine places footnotes tentatively, checks whether their references are still on the same column, and adjusts positions iteratively until everything settles. Footnote configuration includes:

- **Marker style** determines how footnotes are numbered or symbolised
   - Superscript numbers are the most common choice
   - Symbols such as asterisks, daggers, and double daggers are traditional in some contexts
   - Custom marker sequences can be defined for specialised applications
- **Separator** is the horizontal rule drawn between the text area and the footnote area
   - Its width, style, and spacing are configurable
- **Font size** for footnote text is typically smaller than the body text
   - The size, line height, and spacing are independently configurable

### Endnotes

Unlike footnotes, endnotes are collected and displayed at the end of a section or at the end of the entire document. They are simpler to implement because they do not compete for space with the body text in the same column. However, they still require careful numbering and cross-referencing, and they still need to respect the column structure of the section that hosts them.

Postext supports both per-section and per-document endnote collection:

- **Per-section endnotes** appear at the end of each major section, making them easier for readers to find
- **Per-document endnotes** are gathered at the very end, following the traditional academic convention
- The numbering can restart at each section or continue sequentially through the entire document
- Cross-references between the body text and the endnote block are kept consistent as content moves around during convergence

### Margin Notes

Margin notes are brief annotations that appear in the page margin, aligned vertically with the paragraph that references them. They are commonly used in textbooks, technical manuals, and annotated editions to provide supplementary context without interrupting the main text flow, and they are a defining feature of the column-and-a-half layout that Postext supports natively.

Postext places margin notes with the following considerations:

- The note is vertically aligned with the start of the referencing paragraph
- If multiple notes reference paragraphs that are close together, the notes are stacked with appropriate spacing to avoid overlap
- The available margin width determines the maximum width of the note text
- Margin notes can appear on the left margin, the right margin, or alternate between the two on facing pages

## The Interactive Sandbox

Everything described so far can be explored right now without writing a single line of code. The Sandbox you are currently looking at is not a demo built on top of Postext; it is the engine itself, wrapped in a familiar editor interface designed to make experimentation as frictionless as possible. It exists for two audiences at once: developers evaluating the library for their next project, and typographers or designers who want to see what each configuration option does without ever touching a repository.

### Interface Layout

The Sandbox follows a familiar IDE paradigm with three main areas:

- An **activity bar** on the far left that switches between panels and hosts global actions
- A **resizable sidebar** that hosts the active panel, whether that is the markdown editor, the configuration form, or the warnings list
- A **viewport** on the right with three tabs for Canvas, HTML, and PDF output

The sidebar can be collapsed entirely by clicking the icon of the currently active panel. The boundary between the sidebar and the viewport is draggable within a sensible range, so you can trade editor space for preview space as you work.

### The Activity Bar

The activity bar contains icon buttons for every major action in the Sandbox. From top to bottom you will typically find:

1. **Markdown editor** toggle, which opens or closes the CodeMirror-based editor
2. **Configuration** toggle, which opens or closes the form-based configuration panel
3. **Warnings** toggle, which opens a list of semantic and typographic issues detected in the current document
4. **Resources** toggle, which opens the resource management panel
5. **Export** action, which downloads the current markdown and configuration as a single JSON file
6. **Import** action, which loads a previously exported JSON file back into the Sandbox
7. **Theme toggle** for switching between dark and light modes
8. **Language switcher** for changing the interface language

Clicking the active panel's icon collapses the sidebar, which is useful when you want to maximise the preview area during fine-tuning.

### The Configuration Panel

The configuration panel is a form-based editor for the full Postext configuration object. Settings are grouped into collapsible sections, each with its own reset button that restores the defaults for just that section without disturbing the rest of your work. The sections currently include:

- **Page** for background colour, size preset, custom dimensions, margins, DPI, cut lines, and baseline grid
- **Layout** for column type, gutter width, side column percentage, and column rules
- **Body Text** for font family, size, line height, colour, alignment, weight, hyphenation, and advanced paragraph rules such as orphan, widow, and runt avoidance
- **Headings** for general heading defaults plus per-level overrides from H1 through H6
- **Ordered Lists** and **Unordered Lists** for list-specific typography including numbering format, bullet characters, and hanging indentation
- **HTML Viewer** for the parameters that drive the single-column and multi-column HTML rendering modes
- **Debug** for overlays that visualise the baseline grid, loose lines, cursor sync, and other internal signals
- **Colour Palette** for named colours that can be reused across the configuration

Controls are context-aware: gutter width only appears when a multi-column layout is selected, hyphenation settings only appear when text alignment permits them, and several advanced options are hidden behind expanders so the panel stays approachable at first glance.

### The Three Output Tabs

The viewport displays the rendered output. Switching tabs does not re-run the layout: the same VDT feeds every backend, so the content you see is consistent across modes.

- **Canvas** renders a rasterised preview with zoom, fit-to-width, fit-to-height, and double-page spread modes, with lazy rendering so long documents remain responsive
- **HTML** renders the document inside a Shadow DOM and offers a font-scale control plus a single-column or multi-column flow, useful for reviewing how the content will feel inside a live web application
- **PDF** generates a real PDF on the client using the _postext-pdf_ package and displays it in the browser's native PDF viewer, with one-click regenerate, download, and print actions

Because all three tabs share a single source of truth, any change you make in the editor or the configuration panel propagates everywhere at once. The engine has no hidden state that you cannot see or export.

### Persistence and Sharing

The Sandbox automatically saves your work to the browser's local storage. Markdown content and configuration are saved after about a second of inactivity, and the previous session is restored on the next page load. Viewport state, such as the current canvas view mode and fit mode, is remembered separately, and the expanded or collapsed state of each configuration section is preserved between visits.

For transferring your work between devices or sharing layouts with collaborators, the Sandbox offers explicit **export** and **import** actions. The exported file is a versioned JSON document containing both the markdown content and the configuration. You can commit it to a repository, attach it to an issue, or drop it into a chat conversation, and anyone with the Sandbox open can load it back in a single click.

## Configuration and Customisation

The configuration system is the contract between the engine and everything that uses it. Understanding its shape is the best way to understand what Postext is prepared to negotiate and what it assumes is fixed, and the same object you can edit through the Sandbox panel is the one you would pass to the library programmatically in a standalone integration.

### The Configuration Object

Every aspect of the Postext layout can be controlled through a single, comprehensive configuration object. This object is deeply structured, with nested sections for each area of concern:

- **Page configuration**
   - Width and height in real units, such as centimetres, millimetres, inches, or points
   - Margins for each side of the page, independently configurable
   - DPI setting that controls the resolution for pixel-based calculations
   - Background colour for the page surface
   - Cut lines for print production, including bleed, mark length, mark offset, mark width, and colour
   - Baseline grid settings including line height, colour, and line width
- **Column configuration**
   - Number of columns per page or section
   - Gutter width between columns
   - Column rule appearance and visibility
   - Balancing behaviour and tolerance
- **Typography configuration**
   - Orphan, widow, and runt minimum line or character counts
   - Hyphenation language, minimum characters, and maximum consecutive hyphens
   - Paragraph spacing mode, whether indentation, vertical gaps, or both
   - Heading spacing above and below each level
   - Keep-together rules that prevent page breaks between related elements
   - First-line indent and hanging indent for paragraphs and list items
- **Resource placement configuration**
   - Default placement strategy for each resource type
   - Sizing behaviour and maximum dimensions
   - Spacing around placed resources
- **Reference configuration**
   - Footnote marker style and separator appearance
   - Endnote collection mode and numbering
   - Margin note positioning and width
- **Debug configuration**
   - Overlays for baseline grid, loose lines, page negative space, cursor sync, and selection sync
   - Threshold controls for loose-line detection
   - Individual toggles for each category of warning

### Section Overrides

For documents with varied layouts, Postext allows **section-level overrides** that change the configuration for specific parts of the document:

1. A title page might use a single column with large margins
2. The main body might use two columns with standard margins
3. An appendix might use three narrow columns with minimal margins
4. A full-page image section might have no columns and no margins
5. A dedicated table of contents might use a column-and-a-half layout with hanging indentation

Each section override specifies which configuration values to change. Unspecified values inherit from the base configuration. This layered approach keeps configuration manageable even for complex documents and makes it straightforward to derive variants of the same document without duplicating state.

### Preset Sizes and Named Palettes

Postext includes a set of **preset page sizes** that correspond to common book and document formats:

- **11 x 17 cm** for small paperback books and pocket guides
- **12 x 19 cm** for standard fiction paperbacks
- **17 x 24 cm** for textbooks and technical manuals
- **21 x 28 cm** for large-format publications and magazines
- **Custom** dimensions for any non-standard format

Each preset automatically sets the width and height, but the developer can override individual dimensions or switch to fully custom values at any time.

The configuration also supports a **named colour palette**. Any colour in the configuration can be linked to a palette entry by name, so a single change to the palette propagates everywhere that entry is referenced. This makes it easy to establish a small design system for a publication and ensures that accent colours, rule colours, and palette-driven text colours stay in sync as the document evolves.

### Warnings and Diagnostics

Alongside the configuration, Postext maintains a **warnings panel** that reports problems the engine detected while laying out the current document. Some warnings are typographic, some are semantic, and all of them point at a specific line or element so you can jump straight to the cause. The current warning categories include:

- **Missing font** when a configured font family cannot be loaded in time
- **Loose line** when a justified line exceeds a configurable word-spacing threshold
- **Heading hierarchy** when a heading level skips one or more intermediate levels, for example jumping from H2 to H4
- **Consecutive headings** when two headings sit next to each other with no intervening prose, an almost always unintended structure
- **List after heading** when a list appears directly under a heading without a transitional sentence, another common documentation smell

Each warning can be enabled, disabled, or tuned independently, and each one can be acted on without leaving the Sandbox.

## Project Vision and Roadmap

Postext is not trying to be a universal document platform. It is trying to be a really, really good editorial layout engine for the web, and the surrounding ecosystem is deliberately narrow so the core can stay sharp. This section describes where the project is today, where it is heading next, and how you can influence that direction.

### A Foundation for Editorial Web Content

Postext is not intended to replace CSS for application layout. It is a specialised tool for a specific and underserved need, namely the presentation of long-form, structured content with the visual quality that readers expect from professionally produced publications. The project aims to make this level of quality accessible to web developers without requiring expertise in traditional typesetting, and to make it accessible to designers and typographers without requiring expertise in JavaScript.

The long-term vision includes:

- **Responsive editorial layouts** that adapt intelligently to different screen sizes, not by simply reflowing text into a single column, but by choosing appropriate column counts, margin sizes, and resource placement strategies for each viewport
- **Collaborative editing** where authors write content in Markdown and designers configure layout rules, each working in their area of expertise
- **Accessible output** that preserves semantic structure and supports screen readers, keyboard navigation, and high-contrast modes
- **Print and digital parity** where the same content and configuration produce visually consistent results in both web and PDF formats
- **An open standard** that publishers, magazines, newspapers, book platforms, and development teams worldwide can adopt and build upon, rather than yet another proprietary layout product

### Development Phases

The development of Postext is organised into four major phases. These phases are not strict milestones; they describe the rough order in which capabilities become stable and ready for production use.

1. **Foundation**
   - Core data structures and type system
   - Markdown parser with resource and note extensions
   - Basic single-column layout with measurement
   - Default configuration and preset system
2. **Editorial Layout**
   - Multi-column text flow with intelligent reflow
   - Column balancing with constraint satisfaction
   - Resource placement with all supported strategies
   - Orphan, widow, and runt prevention across columns and pages
3. **Professional Typography**
   - Hyphenation with language-specific Liang patterns
   - Rag optimisation for left-aligned text
   - Knuth-Plass justification with editorial penalties
   - Footnote, endnote, and margin note systems
   - Advanced spacing rules and baseline grid alignment
   - Pull quotes, drop caps, and decorative elements
4. **Output and Integration**
   - Canvas renderer for fast previews
   - Web renderer with Shadow DOM isolation
   - PDF renderer for print production
   - Interactive Sandbox for experimentation and learning
   - Plugin system for custom renderers and extensions
   - Documentation, tutorials, and example projects

## Contributing to the Project

Postext is a community-driven open-source project maintained on GitHub. It welcomes contributions from developers, designers, typographers, translators, and anyone who cares about the future of long-form content on the web. The project is deliberately coordinated in the open: every issue, every pull request, and every design conversation happens on public channels, so newcomers can catch up on any decision by reading its history.

### Ways to Contribute

There are many ways to get involved, and most of them do not require writing JavaScript:

- **Report issues** when you encounter bugs or unexpected behaviour, with a minimal reproduction whenever possible
- **Suggest features** that would make the engine more useful for your own work
- **Contribute code** by picking up an open issue and submitting a pull request, starting from issues labelled _good first issue_ if you are new to the codebase
- **Improve documentation** by writing tutorials, examples, or explanations, either in the main documentation site or as blog posts linked from it
- **Translate content** into new languages so the engine can reach typographic communities outside the current English and Spanish coverage
- **Share your layouts** to demonstrate what Postext can do and inspire others
- **Contribute typographic expertise**, especially for languages and writing systems that are not yet well represented

### How We Work

All coordination happens on GitHub, across three main channels:

1. **Issues** for bug reports, feature requests, and specific tasks that someone might pick up
2. **Pull requests** for code contributions, with review happening in the open and discussions preserved alongside the code
3. **Discussions** for ideas, design conversations, questions, and anything that is not yet concrete enough to become an issue

This is deliberate. When everything lives in one place, anyone can find the context behind any decision, new contributors can read the history, and no one is left out of a conversation that happened in a channel they were not in.

### Principles

The project is maintained with a small set of principles that shape every decision:

- **Respect the craft.** Typography is a discipline with centuries of accumulated wisdom, and the engine should honour it rather than reinvent it badly.
- **Keep the core sharp.** The engine should do one thing extremely well, and resist the temptation to grow into a general-purpose document platform.
- **Prefer open standards.** Markdown, PDF, and open font formats should stay first-class, and proprietary formats should never be required for any end-to-end workflow.
- **Stay embeddable.** Postext should be a library that you can drop into an existing application, not a framework that takes over your project.
- **Document everything.** A feature that only exists inside the implementation is a feature that nobody can use.

If any of this resonates with you, the repository is the best next step. Open an issue, ask a question in discussions, or simply read through the code and tell us what could be clearer. The project is only as broad as the community that builds it.
`;
