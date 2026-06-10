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

This problem is not new. The [Content First](https://blog.binpar.com/el-arte-de-maquetar-para-ser-le%C3%ADdo-933be57cb293) project, started around 2014, was an early attempt to bring editorial layout quality to the web. I built column-based layouts, experimented with text flow algorithms, and ran into the same wall repeatedly: **you cannot make good layout decisions without knowing exactly how much space text will occupy.**

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

Everything below ships today — see the [Roadmap](#roadmap) for what's still in progress.

### Column-based layouts

- Single, double, and one-and-a-half column layouts (`layoutType: 'single' | 'double' | 'oneAndHalf'`) with configurable gutter width and an optional column rule (line width and color).
- Headings can span a single column or the full page width, with parity-aware page breaks (`'odd'`, `'even'`, `'always-odd'`, …) for chapter openings.

### Optimal justification

- Knuth-Plass optimal line breaking — whole paragraphs are broken globally, not greedily line by line.
- TeX-pattern hyphenation in 8 locales (English, Spanish, French, German, Italian, Portuguese, Catalan, Dutch).
- Orphan, widow, and runt control: no stranded first or last lines across column breaks, and a tunable penalty against very short final lines.

### Resources as first-class citizens

- Bitmaps, SVGs, and tables are declared once alongside the content and incorporated by inline `:ref{id="…"}` references — the first reference floats the resource to a top or bottom band, spanning either the column or the full page.
- An explicit `::resource{id="…"}` block embed is available as an inline placement override.
- Typed first-reference numbering: `Figure` and `Table` built-ins plus custom resource types, with configurable reference styles and caption prefixes.
- In PDF output every `:ref` becomes a clickable cross-reference link that jumps to the resource.

### Styling configuration

- `tableStyle` — table body and header typography fully independent of body text.
- `captionStyle` — caption typeface, weight, and color.
- `diagramStyle.singleInk` — recolors SVG diagrams to luminance-mapped tints of a single ink, so diagrams survive single-spot-colour printing.

### Math

- LaTeX math, inline (`$…$`) and display (`$$…$$`), rendered to crisp SVG via MathJax in every backend.

### Headers & footers

- Design slots composed of text, rule, and box elements with precise placement.
- Placeholders resolve page numbers, chapter titles, and document metadata at layout time.
- Page-parity control — different designs for odd and even pages.

### Multi-format output

- **Canvas renderer.** Rasterize any page for previews and thumbnails (`renderPage`, `renderPageToCanvas`).
- **HTML renderer.** Precise absolutely-positioned markup; `renderToHtmlIndexed` returns a per-block index so viewers can patch only the DOM nodes that changed between builds.
- **PDF renderer.** Print-ready output with document outlines (bookmarks), clickable cross-reference links, embedded custom fonts (woff2/woff/ttf/otf), and RGB, CMYK, or grayscale color spaces.
- **Format-agnostic core.** The engine computes geometry; renderers translate it.

### Configuration-driven

- Every behavior above is driven by a single configuration object with sensible defaults — an empty config produces a well-typeset document, and each section (page, layout, body text, headings, lists, math, resource types, …) can be overridden independently.
- Color palettes let a whole document re-ink from one place.

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

### Phase 1: Foundation

- [x] Core layout data structures (columns, blocks, inline resources, break points)
- [x] Integration with `@chenglou/pretext` for text measurement
- [x] Enriched markdown input format definition and parser
- [x] Basic single-column layout with paragraph placement
- [x] Configuration file schema (first draft)

### Phase 2: Editorial Layout

- [x] Multi-column layout engine
- [ ] Column balancing algorithm
- [x] Resource placement within columns (images, figures, tables — floats with column or page span)
- [ ] Text flow around obstacles (using pretext's `layoutNextLine`)
- [x] Orphan and widow prevention
- [x] Keep-together rules (headings + first paragraph, colons + lists)

### Phase 3: Professional Typography

- [x] Hyphenation dictionary integration (TeX patterns, 8 locales)
- [x] Typed resource numbering and cross-references (figures, tables, custom types)
- [x] LaTeX math rendering (inline and display, MathJax SVG)
- [x] Custom font loading and embedding (woff2/woff/ttf/otf)
- [ ] Footnote and endnote systems
- [ ] Pull quotes and margin notes
- [x] Fine-grained spacing rules (configurable spacing scale)
- [x] Rag optimization
- [ ] Configuration file format finalization

### Phase 4: Output Targets

- [x] Web renderer (HTML/CSS with precise positioning)
- [x] PDF renderer (outlines, clickable cross-reference links, RGB/CMYK/grayscale)
- [x] Interactive playground in `apps/web`
- [x] Visual configuration editor (stretch goal)
- [x] Asynchronous layout worker (off-main-thread `buildDocument` with last-wins cancellation)

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
