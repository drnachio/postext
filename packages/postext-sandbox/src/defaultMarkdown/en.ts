export const DEFAULT_MARKDOWN_EN = `---
title: "Postext: A Programmable Typesetter for the Web"
subtitle: "An open-source layout engine for editorial-grade typography"
author: "Ignacio Ferro"
publishDate: "2026-04-14"
---

# Postext: A Programmable Typesetter for the Web

Postext is an **open-source layout engine** designed to bring the sophistication of professional print typography to modern web development. For centuries, the world of editorial design has refined techniques for placing text, images, and annotations on a page with extraordinary precision. These techniques encompass everything from careful column balancing to meticulous orphan and widow prevention, from intelligent hyphenation to elegant footnote placement. Until now, the web has lacked a tool capable of reproducing these standards in a programmable, declarative way.

The core mission of Postext is to bridge that gap. It takes **semantic content** written in enriched Markdown and transforms it into a fully resolved layout where every element has a precise position, measured in real typographic units. This layout can then be rendered to multiple output formats, including interactive web pages and print-ready PDF documents.

## The Problem Postext Solves

### The Limitations of CSS for Editorial Layout

Modern CSS is a remarkably powerful tool for building user interfaces. Flexbox, Grid, and container queries give developers fine-grained control over how components are arranged on screen. However, CSS was designed primarily for _application layout_, not for _editorial layout_. There is a fundamental difference between the two:

- **Application layout** arranges interactive components such as buttons, forms, navigation bars, and cards within a viewport that the user can scroll
- **Editorial layout** arranges flowing text, images, tables, figures, and annotations across a series of fixed-dimension pages or columns, following strict typographic rules inherited from centuries of print tradition

CSS handles the first case brilliantly. For the second case, it falls short in critical ways:

1. **No native multi-column text flow with reflow awareness**
   - The CSS _columns_ property exists, but it cannot balance column heights intelligently
   - It cannot handle resources that span columns or float to specific positions within a column grid
   - It provides no mechanism for keeping headings together with their following paragraphs
2. **No orphan and widow prevention across columns**
   - While CSS has _orphans_ and _widows_ properties, browser support is inconsistent
   - These properties do not work across column boundaries in the way that professional typesetters expect
   - Editorial-grade prevention requires awareness of the entire page geometry, not just a single text container
3. **No integrated resource placement strategies**
   - Print layouts routinely place figures at the top of the next available column, or float them into the margin, or break them across the full width of the page
   - CSS floats are primitive compared to these strategies and cannot negotiate with surrounding text flow
4. **No footnote or margin note systems**
   - Footnotes in print appear at the bottom of the column where they are referenced, consuming space from the text area above
   - Margin notes align vertically with the paragraph that references them
   - CSS offers no mechanism for either of these

### What Existing Tools Miss

There are, of course, tools that address parts of this problem. Word processors like Microsoft Word and Google Docs handle basic pagination. Desktop publishing applications like Adobe InDesign provide complete editorial control. LaTeX is the gold standard for academic typesetting. However, none of these tools are designed for the web:

- They do not produce _responsive_ layouts that adapt to different screen sizes
- They do not integrate with modern frontend frameworks like React or Vue
- They cannot be embedded as a component within a larger web application
- Their output is static, not interactive

Postext occupies a unique position in this landscape. It is a **JavaScript library** that runs in the browser, takes Markdown as input, applies professional typographic rules, and produces a React component as output. It is designed to be embedded, configured, and extended by web developers who want publication-grade results without leaving their familiar toolchain.

## How Postext Works

### The Processing Pipeline

The Postext layout engine processes content through a carefully orchestrated pipeline. Each stage builds upon the results of the previous one, gradually transforming raw Markdown into a complete, precisely measured layout. Understanding this pipeline is key to understanding the design philosophy of the project.

#### Input Layer

The process begins with the **input layer**, where the developer provides two things:

1. **Content** in enriched Markdown format
   - The main body of text, written using standard Markdown syntax
   - Headings, paragraphs, lists, emphasis, and other inline formatting
   - Special markers that reference external resources or notes
2. **Configuration** that defines the layout rules
   - Page dimensions, margins, and DPI settings
   - Column count, gutter width, and balancing preferences
   - Typography rules for orphan prevention, widow prevention, and hyphenation
   - Resource placement strategies for images, tables, and figures
   - Reference system settings for footnotes, endnotes, and margin notes

The separation of content and configuration is deliberate and important. The same Markdown document can produce radically different layouts simply by changing the configuration. A single-column layout for mobile screens, a two-column layout for tablets, and a three-column layout for wide desktop monitors can all originate from the same source text.

#### Measurement Layer

Before the engine can decide where to place each element, it must know how much space each element occupies. This is the role of the **measurement layer**, which is built on a library called _pretext_.

The measurement challenge is significant. Text rendering is complex because the width and height of a paragraph depend on the font, the font size, the line height, the available width, the hyphenation rules, and many other factors. Traditionally, the only way to measure text accurately in a browser is to render it into the DOM and read back the computed dimensions. This approach is slow, as it triggers layout reflows that can block the main thread for hundreds of milliseconds.

Postext takes a fundamentally different approach. The _pretext_ library performs **DOM-free text measurement** using canvas font metrics and pure arithmetic. This technique is between 300 and 600 times faster than DOM-based measurement. It works by:

1. Loading font metrics from the canvas API
   - Glyph widths and advance metrics
   - Ascender and descender measurements
   - Kerning pair adjustments when available
2. Computing line breaks using the Knuth-Plass algorithm
   - Evaluating all possible break points in a paragraph
   - Choosing the set of breaks that minimizes a penalty function
   - Accounting for hyphenation opportunities
3. Calculating the resulting block dimensions
   - Total height including all lines and inter-line spacing
   - Maximum line width for alignment purposes
   - Baseline positions for grid alignment

This measurement approach is the critical innovation that makes Postext practical. Without it, the engine would need to perform thousands of DOM reflows during layout computation, making interactive editing impossible.

#### Layout Engine

The **layout engine** is the heart of Postext. It takes the measured elements and arranges them on pages and columns according to the configured rules. This is where the editorial intelligence lives.

The layout engine operates iteratively. It makes an initial placement pass and then refines the result through successive iterations, adjusting element positions to satisfy constraints that may conflict with each other. For example:

- A heading must stay with its following paragraph, which might require moving both to the next column
- Moving content to the next column might create a widow in the current column
- Eliminating that widow might require pulling content back, which could break the heading-paragraph constraint

These circular dependencies are resolved through a **convergence loop** that runs up to five iterations. In practice, most layouts converge within two or three iterations. The engine detects when no further improvements can be made and stops early.

The layout engine produces a data structure that describes the exact position and dimensions of every element on every page. This structure is format-agnostic, meaning it contains pure geometry without any rendering-specific information.

#### Output Layer

The final stage is the **output layer**, which takes the abstract geometry and renders it to a specific format:

- **Web renderer** produces HTML elements with precise CSS positioning
   - Each element is absolutely positioned within its page container
   - Text is rendered with exact font sizes, line heights, and baseline positions
   - The result is a React component that can be embedded in any web application
- **PDF renderer** produces print-ready documents
   - Uses the same geometry data as the web renderer
   - Generates vector-based output suitable for professional printing
   - Preserves all typographic details including exact character positions

## Typography Features

### Orphan and Widow Prevention

In professional typography, an **orphan** is a single line of a paragraph that appears alone at the top of a column or page, separated from the rest of its paragraph. A **widow** is a single line that appears alone at the bottom of a column or page. Both are considered serious typographic flaws because they disrupt the visual rhythm of the text and make it harder for readers to maintain their flow.

Postext provides configurable orphan and widow prevention:

- The _orphans_ setting specifies the minimum number of lines that must appear at the beginning of a paragraph before a column break
- The _widows_ setting specifies the minimum number of lines that must appear at the end of a paragraph after a column break
- The engine will adjust column breaks, move content between columns, and even modify line breaks within paragraphs to satisfy these constraints
- When constraints conflict, the engine uses a priority system to determine which rule takes precedence

### Hyphenation and Rag Optimization

**Hyphenation** is the practice of breaking words at syllable boundaries when they fall at the end of a line. Proper hyphenation improves the evenness of line lengths and reduces the visual disturbance caused by large gaps between words in justified text.

Postext supports hyphenation through configurable dictionaries:

- Language-specific hyphenation patterns that define valid break points within words
- Minimum character counts before and after the hyphen to prevent awkward breaks
- Maximum consecutive hyphenated lines to avoid a distracting staircase effect on the right margin
- Hyphenation penalty values that influence the Knuth-Plass algorithm when choosing between a hyphenated break and a looser line

**Rag optimization** refers to the smoothing of the right edge of left-aligned text, which is called the _rag_. An unoptimized rag can appear jagged, with short lines followed by long lines in an erratic pattern. Postext optimizes the rag by:

1. Evaluating the visual quality of the right margin across multiple lines
2. Adjusting word spacing within acceptable limits
3. Choosing break points that produce a gradually varying rag rather than an abrupt one
4. Considering hyphenation as a tool for rag smoothing, not just line fitting

### Spacing and Rhythm

Vertical spacing in editorial typography follows strict rules that maintain the visual rhythm of the page. Postext enforces these rules through its configuration system:

- **Heading spacing** controls the distance above and below headings of each level
   - Larger headings receive more space above them to visually separate them from the preceding section
   - The space below a heading is smaller than the space above it, creating a visual connection between the heading and its content
- **Paragraph spacing** can be configured as either indentation or vertical gaps
   - Traditional book typography uses first-line indentation with no vertical gap between paragraphs
   - Modern digital typography often uses vertical gaps with no indentation
   - Postext supports both approaches and allows mixing them
- **List spacing** controls the distance between list items and between nested levels
   - Items within a list can be tightly or loosely spaced
   - Nested lists can have additional indentation and different bullet styles at each level
- **Baseline grid alignment** snaps text to a regular vertical grid
   - This ensures that text in adjacent columns aligns horizontally
   - It creates a sense of order and stability across the entire page
   - Elements that break the grid, such as headings with larger font sizes, can be configured to realign to the grid afterward

## Column-Based Layouts

### Multi-Column Text Flow

One of the most distinctive features of editorial layout is the use of multiple columns. Columns serve several purposes in professional typography:

- They keep line lengths within the optimal range for reading comfort, which is generally considered to be between 45 and 75 characters per line
- They allow more text to appear on a single page without requiring an uncomfortably small font size
- They create visual variety and structure on the page
- They provide opportunities for sophisticated resource placement

Postext supports flexible multi-column configurations:

1. **Column count** can be set to any positive integer
   - Single-column layouts for narrow viewports or focused reading
   - Two-column layouts for articles and essays
   - Three or more columns for newsletters, magazines, and reference materials
2. **Gutter width** controls the space between columns
   - Wider gutters make columns feel more independent
   - Narrower gutters allow more text per page but require a visual separator
3. **Column rules** are optional vertical lines drawn between columns
   - Their weight, style, and color are configurable
   - They help readers distinguish between columns when gutters are narrow
4. **Column spanning** allows certain elements to break the column grid
   - A heading might span two of three columns
   - A figure might span the full width of the page
   - A pull quote might float across the gutter between two columns

### Column Balancing

When text flows through multiple columns, the columns often end at different heights. The last column on a page might contain only a few lines while the others are full. This looks unfinished and unprofessional.

**Column balancing** is the process of distributing text evenly across columns so that they end at approximately the same height. This is a surprisingly difficult computational problem because:

- Moving text between columns changes line breaks, which changes the height of each column
- Figures and other non-text elements have fixed heights that cannot be split
- Footnotes associated with text in a column must appear at the bottom of that same column, consuming space
- Orphan and widow constraints may prevent certain distributions

Postext approaches column balancing through iterative refinement:

1. First, it fills columns sequentially to establish a baseline distribution
2. Then, it calculates the ideal column height by dividing the total content height by the number of columns
3. It redistributes content to approach this ideal height, respecting all constraints
4. It repeats the redistribution until the column heights converge or the maximum iteration count is reached

### Mixed Column Structures

Not all content on a page needs to follow the same column structure. A common pattern in editorial design is to begin a section with a full-width introductory paragraph, then transition to a multi-column layout for the body text. Another pattern places a wide image or table across the full width of the page, interrupting the multi-column flow and resuming it below.

Postext supports these mixed structures through **section overrides**:

- Each section of a document can specify its own column configuration
- Transitions between section types are handled automatically
- The engine manages the vertical space consumed by each section and ensures that content flows correctly from one to the next

## Resource Placement

### Placement Strategies

In editorial design, resources such as images, tables, figures, and pull quotes are not simply inserted inline at the point where they are referenced. Instead, they are placed according to strategies that optimize the visual quality of the page and the readability of the surrounding text.

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
   - All columns above and below the resource are synchronized
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

The engine ensures that resources never overflow their containers and adjusts surrounding text flow to accommodate the final dimensions.

## Reference Systems

### Footnotes

Footnotes are one of the most complex features in editorial typography. A footnote must appear at the bottom of the column where it is referenced, and the space it occupies must be subtracted from the available text area in that column. This creates a feedback loop:

- Adding a footnote to a column reduces the available text space
- Reducing the text space might push the footnote reference to the next column
- If the reference moves, the footnote must move with it, changing the text space in both columns

Postext handles this complexity through its convergence loop. The engine places footnotes tentatively, checks whether their references are still on the same column, and adjusts positions iteratively until everything settles.

Footnote configuration includes:

- **Marker style** determines how footnotes are numbered or symbolized
   - Superscript numbers are the most common choice
   - Symbols such as asterisks, daggers, and double daggers are traditional in some contexts
   - Custom marker sequences can be defined for specialized applications
- **Separator** is the horizontal rule drawn between the text area and the footnote area
   - Its width, style, and spacing are configurable
- **Font size** for footnote text is typically smaller than the body text
   - The size, line height, and spacing are independently configurable

### Endnotes

Unlike footnotes, endnotes are collected and displayed at the end of a section or at the end of the entire document. They are simpler to implement because they do not compete for space with the body text in the same column. However, they still require careful numbering and cross-referencing.

Postext supports both per-section and per-document endnote collection:

- **Per-section endnotes** appear at the end of each major section, making them easier for readers to find
- **Per-document endnotes** are gathered at the very end, following the traditional academic convention
- The numbering can restart at each section or continue sequentially through the entire document

### Margin Notes

Margin notes are brief annotations that appear in the page margin, aligned vertically with the paragraph that references them. They are commonly used in textbooks, technical manuals, and annotated editions to provide supplementary context without interrupting the main text flow.

Postext places margin notes with the following considerations:

- The note is vertically aligned with the start of the referencing paragraph
- If multiple notes reference paragraphs that are close together, the notes are stacked with appropriate spacing to avoid overlap
- The available margin width determines the maximum width of the note text
- Margin notes can appear on the left margin, the right margin, or alternate between the two on facing pages

## Configuration and Customization

### The Configuration Object

Every aspect of the Postext layout can be controlled through a single, comprehensive configuration object. This object is deeply structured, with nested sections for each area of concern:

- **Page configuration**
   - Width and height in real units, such as centimeters, millimeters, inches, or points
   - Margins for each side of the page, independently configurable
   - DPI setting that controls the resolution for pixel-based calculations
   - Background color for the page surface
   - Cut lines for print production
   - Baseline grid settings including line height and grid color
- **Column configuration**
   - Number of columns per page or section
   - Gutter width between columns
   - Column rule appearance and visibility
   - Balancing behavior and tolerance
- **Typography configuration**
   - Orphan and widow minimum line counts
   - Hyphenation language, minimum characters, and maximum consecutive hyphens
   - Paragraph spacing mode, whether indentation or vertical gaps
   - Heading spacing above and below each level
   - Keep-together rules that prevent page breaks between related elements
- **Resource placement configuration**
   - Default placement strategy for each resource type
   - Sizing behavior and maximum dimensions
   - Spacing around placed resources
- **Reference configuration**
   - Footnote marker style and separator appearance
   - Endnote collection mode and numbering
   - Margin note positioning and width

### Section Overrides

For documents with varied layouts, Postext allows **section-level overrides** that change the configuration for specific parts of the document:

1. A title page might use a single column with large margins
2. The main body might use two columns with standard margins
3. An appendix might use three narrow columns with minimal margins
4. A full-page image section might have no columns and no margins

Each section override specifies which configuration values to change. Unspecified values inherit from the base configuration. This layered approach keeps configuration manageable even for complex documents.

### Preset Sizes

Postext includes a set of **preset page sizes** that correspond to common book and document formats:

- **11 x 17 cm** for small paperback books and pocket guides
- **12 x 19 cm** for standard fiction paperbacks
- **17 x 24 cm** for textbooks and technical manuals
- **21 x 28 cm** for large-format publications and magazines
- **Custom** dimensions for any non-standard format

Each preset automatically sets the width and height, but the developer can override individual dimensions or switch to fully custom values at any time.

## Project Vision and Roadmap

### A Foundation for Editorial Web Content

Postext is not intended to replace CSS for application layout. It is a specialized tool for a specific and underserved need, namely the presentation of long-form, structured content with the visual quality that readers expect from professionally produced publications. The project aims to make this level of quality accessible to web developers without requiring expertise in traditional typesetting.

The long-term vision includes:

- **Responsive editorial layouts** that adapt intelligently to different screen sizes, not by simply reflowing text into a single column, but by choosing appropriate column counts, margin sizes, and resource placement strategies for each viewport
- **Collaborative editing** where authors write content in Markdown and designers configure layout rules, each working in their area of expertise
- **Accessible output** that preserves semantic structure and supports screen readers, keyboard navigation, and high-contrast modes
- **Print and digital parity** where the same content and configuration produce visually consistent results in both web and PDF formats

### Development Phases

The development of Postext is organized into four major phases:

1. **Foundation**
   - Core data structures and type system
   - Markdown parser with resource and note extensions
   - Basic single-column layout with measurement
   - Default configuration and preset system
2. **Editorial Layout**
   - Multi-column text flow with intelligent reflow
   - Column balancing with constraint satisfaction
   - Resource placement with all supported strategies
   - Orphan and widow prevention across columns and pages
3. **Professional Typography**
   - Hyphenation with language-specific dictionaries
   - Rag optimization for left-aligned text
   - Footnote, endnote, and margin note systems
   - Advanced spacing rules and baseline grid alignment
   - Pull quotes, drop caps, and decorative elements
4. **Output and Integration**
   - Web renderer with precise CSS positioning
   - PDF renderer for print production
   - Interactive sandbox for experimentation and learning
   - Plugin system for custom renderers and extensions
   - Documentation, tutorials, and example projects

### Contributing to the Project

Postext is an open-source project that welcomes contributions from developers, designers, and typographers. There are many ways to get involved:

- **Report issues** when you encounter bugs or unexpected behavior
- **Suggest features** that would make the engine more useful for your needs
- **Contribute code** by picking up an open issue and submitting a pull request
- **Improve documentation** by writing tutorials, examples, or explanations
- **Share your layouts** to demonstrate what Postext can do and inspire others

The project is maintained with a commitment to quality, clarity, and respect for the long tradition of typographic craftsmanship that it seeks to bring to the web.
`;
