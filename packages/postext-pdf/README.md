# postext-pdf

**PDF backend for [postext](https://www.npmjs.com/package/postext).**

`postext-pdf` turns the document that `postext` lays out into a real PDF, in the browser or in Node. It does not re-measure anything: it consumes the same `VDTDocument` the canvas and HTML renderers use and translates its coordinates into PDF points, so the three outputs agree on every line break, column height and resource placement. The PDF embeds the actual font files, carries outline bookmarks, keeps every link clickable (the QR codes of printed link notes are vector modules with a link of their own) and is tagged for accessibility (PDF/UA oriented).

**Website:** [postext.dev](https://postext.dev/) · **Docs:** [PDF output](https://postext.dev/en/docs/configuration-pdf-output#generating-pdfs)

## Install

```bash
npm install postext postext-pdf
```

`postext` is a peer dependency. Each `postext-pdf` release needs the `postext` it was released with, or a later one of the same major (its peer range is `^` that version), so upgrade the two together. Or import both straight from a CDN:

```js
import { buildDocument } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
```

## Quick example

```ts
import { buildDocument } from 'postext';
import { renderToPdf, decompressWoff2 } from 'postext-pdf';

// The PDF embeds real font files; resolve every family/weight/style the
// document uses to TTF or OTF bytes. Here: Fontsource's static WOFF2 cuts.
const fontProvider = async (family, weight, style) => {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`;
  const res = await fetch(url);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
};

const doc = buildDocument({ markdown: '# Hello\n\nTypeset me.' }, {
  page: { sizePreset: '17x24' },
  bodyText: { fontFamily: 'EB Garamond' },
});

const bytes = await renderToPdf(doc, { fontProvider }); // Uint8Array
```

In the browser, load the web fonts (`document.fonts.load(...)`) before calling `buildDocument`, so the layout is measured with the same faces the PDF embeds.

## API

- `renderToPdf(doc | doc[], options)` — renders one document or a whole book (an array of chapters) to PDF bytes. Options: `fontProvider` (required; asked only for the faces the pages paint), `resourceBytes` (images, SVGs and single-page PDF masters by file id; an SVG figure's `svg.pdfFileId` master is asked for first), `outlines`, `accessible`, `colorSpace` (each one, when left out, from the first document's `config.pdfGeneration`, `colorSpace` only while its `forceColorSpace` is on; else bookmarks on, tagged, RGB), `pageNegative`, `characterGrid` (draws the character grid of `cjk.grid.show`, off by default), `onProgress`, `onWarning` (a face the provider rejects is set in another cut of its family — the nearest standard weight in CSS font-matching order, same style first, then the other style — and reported here, `console.warn` by default; the render fails only when the provider has no cut of the family at all), `rasterizeSvg`, `harfbuzzWasm` (where to load `harfbuzz.wasm` from, a URL or its bytes; see below), `print` (PDF/X standard, output profile, black handling; else the first document's `config.print`), `outputProfile` (the ICC output profile's bytes), `profileBaseUrl` (where catalogue profiles are fetched from when no bytes are given), `date` (the file's creation and modification date, and a PDF/X file's XMP dates and document id; the same document and date give the same bytes, and without it the file carries the time of the call).
- `decompressWoff2(bytes)` — WOFF2 → TTF/OTF, for font providers that fetch web fonts.
- `postext-pdf/worker` — `createPdfWorker()` renders off the main thread; fonts and SVG rasters are still resolved on the caller's thread when the worker asks for them. `postext-pdf/worker/entry` is the worker script for bundlers that want to control the worker URL. From a CDN such as esm.sh, start the worker yourself from a same-origin blob that imports the entry — `createPdfWorker({ worker: new Worker(URL.createObjectURL(new Blob(["import 'https://esm.sh/postext-pdf/worker/entry';"], { type: 'text/javascript' })), { type: 'module' }) })` — because a page cannot start a worker script from another origin.
- `declaredFontFile(bytes, { unicodeRange, order })` — marks a font file the provider returns with the `unicode-range` and order of the `@font-face` rule it came from, for a family split into several files.
- `inspectPrintMaster(bytes)` — reports what the first page of a PDF print master brings into a print file: fonts it does not embed, RGB colour, transparency (which PDF/X-1a forbids). The Sandbox's preflight reads it.
- Helpers: `svgToVectorDrawing`, `sniffBytes`, `rasterizeSvgWithDom`.

## WOFF2 decoding and bundlers

`decompressWoff2` runs [`wawoff2`](https://www.npmjs.com/package/wawoff2)'s emscripten WebAssembly decoder (about 320 KB, loaded on first use), shipped inside postext-pdf as `dist/woff2Binding.js`. postext-pdf does not import wawoff2 itself: wawoff2's glue hands its decoder over only when it detects Node, so a bundler or a CDN that builds it as a web module (Vite, webpack, Turbopack, esm.sh) got a decoder that never answered. The module postext-pdf ships hides the host's globals from the glue, decodes the embedded WebAssembly itself and needs no patch, in Node, a page, a worker or from a CDN.

## Arabic, Hebrew and other right-to-left scripts

Text in a right-to-left or joining script (Hebrew, Arabic, Syriac, Thaana, N'Ko and the other right-to-left blocks) is shaped with [HarfBuzz](https://www.npmjs.com/package/harfbuzzjs) compiled to WebAssembly: joining forms, ligatures, harakat stacked as the font places them, brackets mirrored in right-to-left runs, numbers and Latin words kept left to right. Its `harfbuzz.wasm` (about 430 KB, 145 KB brotli) is loaded only when a document sets such text. Character spacing is never applied to joining letters.

postext-pdf instantiates the binary itself, without the harfbuzzjs JavaScript glue, so it loads the same in Node, a page, a Worker and a bundled app, and from a CDN that rebuilds packages for the browser (esm.sh). It looks for the file, in order:

1. `options.harfbuzzWasm`: a URL (a relative one resolves against the page) or the file's bytes;
2. `harfbuzz.wasm` beside postext-pdf's own module (`dist/harfbuzz.wasm`), as `new URL('./harfbuzz.wasm', import.meta.url)`: Node reads the file, Vite, webpack and Turbopack emit it as an asset, and jsDelivr or unpkg serve it from the package;
3. the same harfbuzzjs release from jsDelivr, then from esm.sh, for a page that imports postext-pdf from esm.sh (which serves the module from a path with no `.wasm` beside it).

When none loads, the PDF is still written, shaped with fontkit: Arabic keeps its joining but loses its mark positions. The render reports it as a `complexShapingUnavailable` warning (to `onWarning`, else `console.warn`), with every place tried and why it failed.

## License

MIT
