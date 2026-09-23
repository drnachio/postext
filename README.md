# Postext

[![npm version](https://img.shields.io/npm/v/postext)](https://www.npmjs.com/package/postext)
[![CI](https://img.shields.io/github/actions/workflow/status/drnachio/postext/ci.yml?branch=develop&label=tests)](https://github.com/drnachio/postext/actions)

**A programmable typesetter for the web.**

Postext is a layout engine that bridges the centuries-old craft of print typesetting and the modern web. It takes semantic content — enriched markdown with referenced resources — and applies professional editorial layout rules to produce publication-grade output for both HTML and PDF.

Built on top of [`@chenglou/pretext`](https://github.com/chenglou/pretext) for DOM-free text measurement.

---

## How It Works

```
  Enriched Markdown              Postext engine                   Output
  ─────────────────         ─────────────────────────         ─────────────
                            ┌────────────────────────┐
  # Heading                 │                        │         HTML + CSS
  Paragraph text...         │  1. Parse & structure  │    ┌─► (web rendering)
  More text with a     ───► │  2. Measure (pretext)  │ ───┤
  ![figure](ref) and        │  3. Apply layout rules │    └─► PDF
  a [^footnote].            │  4. Compute geometry   │        (print rendering)
                            │                        │
                            └────────────────────────┘
                                      ▲
                              Configuration files
                            (columns, rules, spacing)
```

1. **Input.** Enriched markdown with referenced resources: images, tables, figures, footnotes, pull quotes. The content is semantic, not visual — it describes *what* to present, not *how*.

2. **Engine.** postext parses the content structure, calls pretext for pixel-perfect text measurement without touching the DOM, then runs the layout algorithm: column balancing, resource placement, typographic quality rules, reference systems. All driven by configuration files.

3. **Output.** Format-agnostic layout geometry — precise coordinates and dimensions for every element. Renderers translate this geometry to the target format: HTML/CSS for the web, PDF for print.

---

## Why postext?

### The gap between print and web

A professional typesetter — the person who lays out a magazine, a newspaper, or a book — applies dozens of rules that have been refined over centuries:

- No orphans (a single line of a paragraph stranded at the top of a column).
- No widows (a single line of a paragraph left behind at the bottom).
- Balanced columns (roughly equal height across columns on a spread).
- Text flowing around figures, pull quotes, and inset images.
- Proper placement of footnotes at the bottom of the column where they are referenced.
- Margin notes aligned with the paragraph that cites them.
- Consistent and deliberate spacing around headings, block quotes, and figures.
- Hyphenation that avoids rivers and excessive rag.

CSS gives you almost none of this.

`column-count` exists but is fragile — there is no control over resource placement within columns, no overflow awareness, and no cross-column orphan/widow prevention. There is no native concept of "flow text around an arbitrarily positioned obstacle." Multi-column editorial layouts on the web remain essentially hand-crafted, usually as static designs that break on different screen sizes.

The web has had responsive layout (flexbox, grid) for over a decade. What it has never had is responsive *editorial* layout — the kind where content reflows intelligently through columns, around images, past footnotes, obeying the rules that make text *pleasant to read*.

### A decade of trying

This problem is not new. The [Content First](https://medium.com/binpar/el-arte-de-maquetar-para-ser-le%C3%ADdo-933be57cb293) project, started around 2014, was an early attempt to bring editorial layout quality to the web. I built column-based layouts, experimented with text flow algorithms, and ran into the same wall repeatedly: **you cannot make good layout decisions without knowing exactly how much space text will occupy.**

DOM-based measurement is expensive. Every time you ask the browser "how tall is this paragraph at this width?", you trigger a layout reflow. Do this hundreds of times for a complex layout and the page becomes unusable. I needed a way to measure text that was fast enough to run speculatively — trying different layouts, different column widths, different break points — without blocking the main thread.

### The missing piece

In 2025, Cheng Lou released [`pretext`](https://github.com/chenglou/pretext): a DOM-free text measurement library that is 300-600x faster than DOM measurement and pixel-perfect across Chrome, Safari, and Firefox. It uses canvas font metrics and pure arithmetic to compute text height and line breaks without ever touching the DOM.

With pretext, the core bottleneck disappears. You can measure thousands of text blocks in milliseconds. You can try ten different column configurations and pick the best one. You can run the full layout algorithm on every resize.

postext is what happens next.

---

## pretext + postext

The naming is intentional.

**pretext** is what happens *before* text is placed: measuring how much space it will need. DOM-free, canvas-based, operating on pure numbers.

**postext** is what happens *after* measurement: the editorial decisions. Given exact dimensions for every text block at any width, the engine decides where each element goes — which column, at what position, flowing around which resources, obeying which typographic rules.

```ts
import { prepare, layout } from '@chenglou/pretext';
import { buildDocument } from 'postext';

// pretext: measure (the "pre" work)
const prepared = prepare(paragraphText, '16px/1.5 Inter');
const { height } = layout(prepared, columnWidth, 24);
// => "This paragraph is 144px tall at this column width."

// postext: decide (the "post" work)
const doc = buildDocument(content, config);
// => "Put this paragraph in column 2, starting at y=320.
//     Move the image to the top of column 3.
//     Add a footnote at the bottom of column 2.
//     Break here to avoid a widow."
```

pretext gives you the measurements. postext gives you the layout.

*pretext was created by [Cheng Lou](https://github.com/chenglou). postext builds on top of it.*

---

## Features

Everything below ships today in `postext` and `postext-pdf` 1.2.

### Column-based layouts

- Single, double, and column-and-a-half layouts (`layoutType: 'single' | 'double' | 'oneAndHalf'`) with configurable gutter width, an optional column rule, mirrored margins, a page-wide baseline grid, and crop marks with bleed for print production.
- The column-and-a-half layout can turn its side column into a channel for figures, tables and callouts (`sideColumnRole: 'floats'`), placed at the outer edge of every page — the marginal column of a textbook — with side captions set level with their figure.
- `:::columns` switches the column count mid-page, and `:::pagebreak` forces a break with parity control.
- Headings span a column or the full page, with parity-aware page breaks (`'odd'`, `'even'`, `'always-odd'`, …) for chapter openings.

### Column balancing

- Columns on a page end level: the engine closes each column's gap with the least visible lever — grid lines above headings, space after lists, room under top floats, and finally loosened or tightened paragraphs within word-spacing and tracking limits.
- Closing pages of a chapter balance too: the trailing band before a page-span box is levelled, short final columns are evened out, and a syllable is never stranded just to fill a column.
- Balancing converges chapter by chapter, so a chapter laid out alone and inside the whole book produce the same pages.

### Optimal justification

- Knuth-Plass optimal line breaking — whole paragraphs are broken globally, not greedily line by line.
- TeX-pattern hyphenation in 8 locales (English, Spanish, French, German, Italian, Portuguese, Catalan, Dutch); overlong words are divided by syllable, then by character.
- Orphan, widow, and runt control, plus keep-together rules (a heading with its first lines, a colon with the list it introduces).

### Resources as first-class citizens

- Bitmaps, SVGs, and tables are declared once alongside the content and incorporated by inline `:ref{id="…"}` references — the first reference floats the resource into the first free top or bottom band after it, spanning the column, the page, or the side channel.
- Floats of one numbering sequence never overtake each other; figures can be fitted to the page, and an explicit `::resource{id="…"}` embeds a resource inline.
- Typed first-reference numbering: `Figure` and `Table` built-ins (localized per document language) plus custom resource types, with configurable reference styles and caption prefixes.
- Tables taller than the page split between rows across as many pages as needed, repeating their header rows and a *(cont.)* caption; rowspans and group-head rows are never cut.
- Rotated tables (`placement.rotate`), cell fills, cell images (bitmap or SVG, aligned within the cell), in-cell lists, and inline colour swatches for legends.
- `diagramStyle.singleInk` recolors SVG diagrams to luminance-mapped tints of a single ink, so diagrams survive single-spot-colour printing.

### Callouts, pull quotes and marginal material

- `:::callout` boxes with named `calloutStyles`: fill, frame, radius, title, icon marker column, and their own paragraph typography — sidebars, key concepts, activities, pull quotes.
- Callouts can nest, float to the top or bottom of the page (`placement`), sit in the side channel, and split across columns and pages when they cannot be kept together, with a continuation that drops the title and icon.
- Named `paragraphStyles` applied with `:::paragraphs{style="…"}` for bibliographies, glossaries, notes and hanging-indent entries; tables and figures carry their own notes and source lines.
- Inline chips, `:chip[text]{style="…"}`: boxed words (word banks, keys, tags) that wrap as one unit, painted as real text in every backend.

### Books, parts and front matter

- Books laid out one chapter at a time with an engine `continuation`: page numbers, parity, heading and figure counters and open parts carry across chapters, or the whole book is built as one document.
- `:::part` divider pages with their own design, and part palettes that recolour the design and flow of every chapter in the part.
- Named `headingStyles` that govern a whole section — running heads, page geometry, body typography, palette — so front matter can live beside decimal-numbered chapters in one configuration.
- `:::toc` prints a table of contents fed by the book's outline, with leaders, numbers and page labels.

### Styling configuration

- `tableStyle` / `tableStyles` — table typography independent of body text, named variants picked with `table.styleId`, and a rounded outer frame.
- `captionStyle`, `chipStyles`, `calloutStyles`, `paragraphStyles`, `headingStyles` — every style is a named, reusable object.
- Color palettes let a whole document re-ink from one place.

### Math

- LaTeX math, inline (`$…$`) and display (`$$…$$`), rendered to crisp SVG via MathJax in every backend.

### Headers & footers

- Design slots composed of text, rule, box, and image elements with precise placement, painted in array order and bounded to the trim box.
- Placeholders resolve page numbers, chapter numbers and titles, part titles, and document metadata at layout time.
- Page-parity control — different designs for odd and even pages.

### Multi-format output

- **Canvas renderer.** Rasterize any page for previews and thumbnails (`renderPage`, `renderPageToCanvas`).
- **HTML renderer.** Precise absolutely-positioned markup; `renderToHtmlIndexed` returns a per-block index so viewers can patch only the DOM nodes that changed between builds.
- **PDF renderer** (`postext-pdf`). Print-ready output with document outlines, clickable cross-reference links, embedded custom fonts (woff2/woff/ttf/otf) with GPOS kerning, vector SVG figures (with optional PDF print masters), RGB, CMYK, or grayscale color spaces, and **tagged, accessible PDF/UA-1** output validated with veraPDF.
- **Web Worker.** `postext/worker` runs the pipeline off the main thread with last-wins cancellation.
- **Format-agnostic core.** The engine computes geometry; renderers translate it.

### Sandbox

- A hosted editor at [postext.dev](https://postext.dev/en/sandbox): books of chapters, a visual configuration editor, a resources panel, live Canvas / HTML / PDF previews with source ↔ preview sync, a warnings panel, and permalinks to any page.
- Books travel as `.postext` bundles that carry their pagination, so an imported book opens already paginated.
- Bilingual showcase bundles — a magazine, a literary edition, an atlas, an exhibition catalogue, a physics textbook, a column-and-a-half biochemistry manual — plus a built-in guide to Postext, itself set as a book.

### Configuration-driven

- Every behavior above is driven by a single configuration object with sensible defaults — an empty config produces a well-typeset document, and each section (page, layout, body text, headings, lists, math, resource types, styles, parts, TOC, …) can be overridden independently.

### Agent skill: port existing publications

- **`postext-port`** teaches a coding agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, …) to turn an existing publication — a PDF, Word, PowerPoint, EPUB, HTML, InDesign (IDML), LaTeX or scanned source — into a Postext project that follows the original layout: measured config manifest, curated chapters, resources and fonts.
- It bundles verified references (document format, configuration, project format, per-source playbooks, the unusual cases solved in every preset) and scripts: type-role PDF extraction, figure and table cutting, pandoc/IDML converters, font and image tools, a linter, a headless renderer and page-by-page comparison.
- Install it with `npx skills add drnachio/postext --skill postext-port`, or in Claude Code with `/plugin marketplace add drnachio/postext` + `/plugin install postext@postext`. See [the Skill docs](https://postext.dev/en/docs/skill).

---

## Project Structure

```
postext/
├── apps/
│   └── web/                      # Next.js docs site, landing page & hosted sandbox
├── packages/
│   ├── postext/                  # Core layout engine library
│   ├── postext-pdf/              # PDF rendering backend
│   ├── postext-sandbox/          # Interactive sandbox UI (controls + viewports)
│   └── typescript-config/        # Shared TypeScript configurations
├── docs/                         # Bilingual MDX documentation (<topic>-en.mdx / <topic>-es.mdx)
├── plugins/postext/              # Agent skill `postext-port` (Claude Code plugin + skills.sh)
├── .claude-plugin/               # Claude Code plugin marketplace manifest
├── turbo.json                    # Turborepo task pipeline
├── pnpm-workspace.yaml           # pnpm workspace definition
└── package.json                  # Root scripts (delegate to turbo)
```

| Package | Purpose |
|---|---|
| `packages/postext` | The core library. Semantic content in, layout geometry out. Zero DOM dependencies. Published to npm as `postext`. |
| `packages/postext-pdf` | The PDF backend: renders the layout geometry to print-ready PDF (outlines, links, font embedding, color spaces). |
| `packages/postext-sandbox` | The interactive sandbox UI — configuration controls and live HTML/canvas/PDF viewports — embedded by the web app. |
| `apps/web` | Next.js 16 + Tailwind CSS 4 application: the documentation site, landing page, and hosted sandbox at [postext.dev](https://postext.dev). |
| `packages/typescript-config` | Shared strict TypeScript configuration across all packages. |

Documentation lives in the top-level `docs/` folder as bilingual MDX pairs (`<topic>-en.mdx` / `<topic>-es.mdx`) rendered by `apps/web`.

**Tech stack:** pnpm workspaces, Turborepo 2.9, TypeScript 5.9, ESM-only, Node.js 20+, Next.js 16, Tailwind CSS 4.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10

### Installation

```bash
git clone https://github.com/drnachio/postext.git
cd postext
pnpm install
```

### Development

```bash
# Start all packages in dev mode (library watch + Next.js dev server)
pnpm dev

# Build all packages
pnpm build

# Lint all packages
pnpm lint

# Type-check all packages
pnpm check-types
```

Turborepo handles the dependency graph: `packages/postext` builds first, then `apps/web` picks up the changes. In dev mode, the library recompiles on save and the Next.js app hot-reloads.

### Using postext in your project

```bash
npm install postext
# or
pnpm add postext
```

`buildDocument` takes content plus a configuration object and returns the laid-out document — plain layout geometry, not framework components — which any backend can then render. The quickest path is the HTML string renderer:

```ts
import { buildDocument, renderToHtml } from 'postext';

const doc = buildDocument(
  { markdown: '# Hello\n\nThis is postext.' },
  {
    page: { sizePreset: '17x24' },
    layout: { layoutType: 'double', gutterWidth: { value: 0.75, unit: 'cm' } },
    bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 8, unit: 'pt' } },
    // ...see docs/configuration for the full reference
  },
);

// Render to an HTML string (in-browser viewer)
const html = renderToHtml(doc);

// …or rasterize to canvas — see renderPage / renderPageToCanvas.
```

### Asynchronous layout in a Web Worker (recommended for UIs)

For interactive integrations — live previews, editors, anything that rebuilds
the document on every keystroke or resize — run the pipeline off the main
thread via the dedicated worker entry point. This keeps the UI responsive,
gives you last-wins cancellation via `AbortSignal`, and ships fonts into the
worker as transferable `ArrayBuffer`s so measurement stays pixel-identical to
the main-thread build:

```ts
import { createLayoutWorker } from 'postext/worker';

const layout = createLayoutWorker();

// Register fonts once per family (woff2/ttf ArrayBuffers are transferred).
await layout.registerFonts(fontPayloads);

const controller = new AbortController();
const vdt = await layout.build(content, config, { signal: controller.signal });

// Call controller.abort() to supersede an in-flight build — the worker stops
// the current pipeline and the pending promise rejects with AbortError.
layout.dispose();
```

The full async integration pattern (font shipping, cancellation, measurement
cache reuse) is documented under
[Running layout in a Web Worker](https://postext.dev/en/docs/configuration#running-layout-in-a-web-worker).
For an end-to-end HTML-viewer integration (multi-column, resize-aware, Shadow DOM),
see [Integrating the HTML viewer](https://postext.dev/en/docs/configuration#integrating-the-html-viewer).

---

## Roadmap

Every milestone of the original roadmap is closed. Postext now typesets full books — textbooks, magazines, literary editions and catalogues — end to end, from enriched markdown to accessible, print-ready PDF.

### Phase 1: Foundation ✅

- [x] Core layout data structures (columns, blocks, inline resources, break points)
- [x] Integration with `@chenglou/pretext` for text measurement
- [x] Enriched markdown input format definition and parser
- [x] Basic single-column layout with paragraph placement
- [x] Configuration file schema (first draft)

### Phase 2: Editorial Layout ✅

- [x] Multi-column layout engine
- [x] Column balancing algorithm (level columns and closing pages, chapter-wise convergence)
- [x] Resource placement within columns (images, figures, tables — floats with column, page or side-channel span)
- [x] Text flow around obstacles (floats, callout boxes, side channel and side captions)
- [x] Orphan and widow prevention
- [x] Keep-together rules (headings + first paragraph, colons + lists)

### Phase 3: Professional Typography ✅

- [x] Hyphenation dictionary integration (TeX patterns, 8 locales)
- [x] Typed resource numbering and cross-references (figures, tables, custom types)
- [x] LaTeX math rendering (inline and display, MathJax SVG)
- [x] Custom font loading and embedding (woff2/woff/ttf/otf)
- [x] Notes (resource and table notes, note paragraph styles, marginal glosses in the side channel)
- [x] Pull quotes and margin notes (callout styles, side-channel boxes)
- [x] Fine-grained spacing rules (configurable spacing scale)
- [x] Rag optimization
- [x] Configuration file format finalization

### Phase 4: Output Targets ✅

- [x] Web renderer (HTML/CSS with precise positioning)
- [x] PDF renderer (outlines, clickable cross-reference links, RGB/CMYK/grayscale)
- [x] Interactive playground in `apps/web`
- [x] Visual configuration editor (stretch goal)
- [x] Asynchronous layout worker (off-main-thread `buildDocument` with last-wins cancellation)

### Beyond the original plan ✅

- [x] Books, chapters and parts with cross-chapter continuation
- [x] Front matter, heading styles and a table of contents built from the outline
- [x] Tables split across pages, rotated tables, cell images and fills
- [x] Nested, floated and splittable callouts; inline chips
- [x] Tagged, accessible PDF/UA-1 output and vector figures in PDF
- [x] `.postext` book bundles and bilingual showcase presets

What comes next is driven by the community — open an issue to propose it.

---

## Contributing

Postext is a community-driven open-source project. An active community of contributors is growing around it, and new collaborators are always welcome. The goal is to build a shared standard that any editorial development team worldwide can adopt — a common foundation for professional web typography.

If you want to contribute code, please open an issue first to discuss the approach. This helps avoid duplicate work and ensures alignment with the project direction. Follow existing code style and TypeScript strict mode.

The project especially welcomes people with experience in:

- **Typographic layout algorithms** (Knuth-Plass, column balancing, optimal paragraph breaking)
- **PDF generation** (low-level PDF construction, font embedding)
- **Editorial design** (magazine/newspaper layout, book typesetting)
- **Text rendering** (canvas, SVG, font metrics)
- **Documentation, translations, and testing**

For the full community vision and all the ways to get involved, see the [Contributing guide](https://postext.dev/en/docs/contributing).

---

## Acknowledgments

**[pretext](https://github.com/chenglou/pretext)** by Cheng Lou. The foundational text measurement library that makes postext possible. Without DOM-free, pixel-perfect text measurement at sub-millisecond speed, none of this would be practical.

**Content First** (~2014). The original exploration into high-quality editorial layout on the web. A decade of running into walls, learning what doesn't work, and accumulating the conviction that this problem is worth solving properly.

postext stands on centuries of typographic tradition. The rules it implements are not invented — they are inherited from the work of typesetters, typographers, and designers who refined the art of making text readable long before screens existed. From Gutenberg's movable type to Tschichold's asymmetric typography to Bringhurst's *Elements of Typographic Style* — postext aims to bring that accumulated craft to the web, where it has been conspicuously absent.

---

## License

MIT
