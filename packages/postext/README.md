# postext

**A programmable typesetter for the web.**

postext is a layout engine that takes semantic content — enriched markdown with referenced resources — and applies professional editorial layout rules to produce publication-grade output. Built on top of [`@chenglou/pretext`](https://github.com/chenglou/pretext) for DOM-free, pixel-perfect text measurement.

**Website:** [postext.dev](https://postext.dev/)

## Install

```bash
npm install postext
```

The main entry has no framework dependency. React (>= 18, a peer dependency) is used only by the `postext/react` subpath. PDF and EPUB output live in the companion packages [`postext-pdf`](https://www.npmjs.com/package/postext-pdf) and [`postext-epub`](https://www.npmjs.com/package/postext-epub).

From a CDN, import it as a module — no build step:

```js
import { buildDocument, renderPage } from 'https://esm.sh/postext';
```

## Quick Example

```ts
import { buildDocument, registerResourceImage, renderPage } from 'postext';
import type { PostextConfig, PostextContent } from 'postext';

const content: PostextContent = {
  markdown: '# My Article\n\nThe harbour, shown in :ref{id="harbour"}, was rebuilt in 1854.',
  resources: [
    {
      id: 'harbour',
      typeId: 'figure',
      kind: 'bitmap',
      caption: 'The harbour at dawn.',
      altText: 'Fishing boats moored in a small harbour',
      createdAt: 0,
      updatedAt: 0,
      bitmap: { fileId: 'harbour.jpg', format: 'jpeg', width: 1600, height: 1000 },
    },
  ],
};

const config: PostextConfig = {
  page: { sizePreset: '17x24', dpi: 150 },
  layout: { layoutType: 'double', gutterWidth: { value: 0.75, unit: 'cm' } },
  bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 9, unit: 'pt' } },
  headings: { fontFamily: 'Open Sans' },
  locale: 'en-us',
};

// Fonts before layout: text measured with a fallback font breaks differently.
await Promise.all(['16px "EB Garamond"', 'bold 16px "Open Sans"'].map((f) => document.fonts.load(f)));

// Images are registered by `fileId`, out of band.
const img = new Image();
img.src = '/images/harbour.jpg';
await img.decode();
registerResourceImage('harbour.jpg', img);

const doc = buildDocument(content, config);
document.body.append(...doc.pages.map((page) => renderPage(page, doc)));
```

`buildDocument` returns the Virtual Document Tree (VDT): every page, column, line and figure with its coordinates. The renderers only paint it.

## API at a glance

| Export | What it does |
|---|---|
| `buildDocument(content, config?)` | Lays the content out and returns the VDT (`VDTDocument`). |
| `buildDocumentWithFonts(content, config?, options?)`, `prepareFonts(content, config?, options?)` | Load the faces the document sets, then lay it out (or only load them). See [Fonts](#fonts). |
| `renderPage(page, doc)`, `renderPageToCanvas(page, doc, canvas, { scale? })` | Paint one page on a canvas. |
| `renderToHtml(doc, options?)` | Absolutely positioned HTML for the pages. Pages are transparent unless you pass `background`. |
| `renderToPdf(doc, { fontProvider })` | From `postext-pdf`: a print-ready, tagged PDF. |
| `initMathEngine()` | Starts MathJax. Await it before laying out `$…$` / `$$…$$` on the main thread; until then formulas are grey placeholder boxes. |
| `registerResourceImage(fileId, image)` | Supplies the decoded image of a bitmap or SVG resource to the canvas renderer. |
| `findLooseLines(doc)`, `drawLooseLines(ctx, page, doc)` | The loose justified lines, as data or painted over a page. |
| `openBundle`, `createBundle`, `buildBundle` | Read, write and lay out `.postext` books. |
| `createLayoutWorker()` (`postext/worker`) | Runs the layout in a Web Worker, with cancellation. Works from esm.sh too. |
| `createLayout(content, config?)` (`postext/react`) | A React component that lays the content out and shows its pages. |

The resolvers (`resolve*Config`), strippers (`strip*Defaults`), `DEFAULT_*` constants and every type are exported as well. See the [configuration reference](https://postext.dev/en/docs/configuration) and the [document format](https://postext.dev/en/docs/document-format).

## Content

`PostextContent` is the input:

| Field | Type | Description |
|---|---|---|
| `markdown` | `string` | Enriched markdown: headings, lists, code blocks, `[^id]` footnotes, `[@key]` citations, `:ref{id="…"}` references, `::resource{id="…"}` embeds, `:::callout`, `:::verse`, `:::part`, `:::toc`, `:::index`, `$…$` math, … |
| `resources?` | `Resource[]` | Bitmaps, SVGs, tables and videos, referenced by `id` from the markdown. Binary payloads (pictures, a video's poster and own file) are referenced by `fileId`; tables carry their model inline. |
| `metadata?` | `DocumentMetadata` | Title, author and dates (also read from the markdown's YAML frontmatter). |
| `continuation?` | `LayoutContinuation` | Counters, page numbering and parity carried over from the chapters before, for a book laid out chapter by chapter. |
| `outline?` | `OutlineEntry[]` | The book's outline, for a `:::toc` in a chapter laid out on its own. |
| `notes?` | `PostextNote[]` | Accepted, but the engine does not read it: notes are written in the markdown (below). |

Footnotes are written in the markdown: a `[^id]` marker where the note is cited and a paragraph that opens with `[^id]:` for its text. Each note is set at the foot of the column that cites it; `footnotes.placement: 'chapterEnd'` gathers them after the chapter instead. See [Footnotes](https://postext.dev/en/docs/document-format#footnotes).

## Fonts

postext measures text with the browser's canvas, so the document's web fonts must be loaded before layout. `await buildDocumentWithFonts(content, config)` does both: it loads every face the configuration and the text ask for, lays the document out, and lays it out again when the pages used a face that was missing. `await prepareFonts(content, config)` only loads them, before a `buildDocument` of your own. Both load the faces the page declares (an `@font-face` rule, a `FontFace` you added) and take a `resolve(family, weight, style)` option that hands over the files of the rest.

Measured widths follow the faces. When a face arrives after a build, the engine drops what it measured in that family and the next build measures it again, with no call from you; up to 1.24 that took `clearMeasurementCache()` and a second build. `doc.contentWarnings` lists a face that was measured with a fallback as `fontFallback`. A layout worker has its own font set; send it the font files with `registerFonts`.

## Bundles (`.postext` files)

A `.postext` file is a whole book (manifest, chapters, resources and fonts) in one zip: the format the [Sandbox](https://postext.dev/en/sandbox) exports and imports. Open one and render it, or write one from your own document:

```ts
import { openBundle, loadBundleFonts, registerBundleImages, buildBundle, renderPage, createBundle } from 'postext';

const bundle = await openBundle(await file.arrayBuffer());
await loadBundleFonts(bundle);
await registerBundleImages(bundle);
const docs = buildBundle(bundle);                 // one VDTDocument per chapter
const canvas = renderPage(docs[0].pages[0], docs[0]);

const { bytes } = await createBundle({ name: 'My Book', chapters: [{ markdown: '# One\n\n…' }], config });
```

See [Bundles](https://postext.dev/en/docs/configuration#bundles-postext-files) for the full API, the PDF adapters and live examples.

## With pretext

postext is designed to work alongside [`@chenglou/pretext`](https://github.com/chenglou/pretext). **pretext** measures how much space text needs (DOM-free, 300-600x faster than DOM measurement). **postext** uses those measurements to make editorial layout decisions.

```ts
import { prepare, layout } from '@chenglou/pretext';
import { buildDocument } from 'postext';

// pretext: measure text dimensions
const prepared = prepare(paragraphText, '16px/1.5 Inter');
const { height } = layout(prepared, columnWidth, 24);

// postext: apply layout rules
const doc = buildDocument(content, config);
```

## Full Documentation

Visit [postext.dev](https://postext.dev/) for the full documentation, project vision, architecture, and roadmap. For contributing guidelines, see the [GitHub repository](https://github.com/drnachio/postext).

## License

MIT. The math engine bundles [MathJax](https://github.com/mathjax/MathJax-src) and [mhchemParser](https://github.com/mhchem/mhchemParser), both under the Apache License 2.0.
