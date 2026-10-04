# postext-pdf

**PDF backend for [postext](https://www.npmjs.com/package/postext).**

`postext-pdf` turns the document that `postext` lays out into a real PDF, in the browser or in Node. It does not re-measure anything: it consumes the same `VDTDocument` the canvas and HTML renderers use and translates its coordinates into PDF points, so the three outputs agree on every line break, column height and resource placement. The PDF embeds the actual font files, carries outline bookmarks and is tagged for accessibility (PDF/UA oriented).

**Website:** [postext.dev](https://postext.dev/) · **Docs:** [PDF output](https://postext.dev/en/docs/configuration#generating-pdfs)

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

- `renderToPdf(doc | doc[], options)` — renders one document or a whole book (an array of chapters) to PDF bytes. Options: `fontProvider` (required; asked only for the faces the pages paint), `resourceBytes` (images, SVGs and single-page PDF masters by file id; an SVG figure's `svg.pdfFileId` master is asked for first), `outlines`, `accessible`, `colorSpace` (each one, when left out, from the first document's `config.pdfGeneration`, `colorSpace` only while its `forceColorSpace` is on; else bookmarks on, tagged, RGB), `pageNegative`, `characterGrid` (draws the character grid of `cjk.grid.show`, off by default), `onProgress`, `onWarning` (a face the provider rejects is set in another cut of its family — the nearest standard weight in CSS font-matching order, same style first, then the other style — and reported here, `console.warn` by default; the render fails only when the provider has no cut of the family at all), `rasterizeSvg`.
- `decompressWoff2(bytes)` — WOFF2 → TTF/OTF, for font providers that fetch web fonts.
- `postext-pdf/worker` — `createPdfWorker()` renders off the main thread; fonts and SVG rasters are still resolved on the caller's thread when the worker asks for them. `postext-pdf/worker/entry` is the worker script for bundlers that want to control the worker URL. From a CDN such as esm.sh, start the worker yourself from a same-origin blob that imports the entry — `createPdfWorker({ worker: new Worker(URL.createObjectURL(new Blob(["import 'https://esm.sh/postext-pdf/worker/entry';"], { type: 'text/javascript' })), { type: 'module' }) })` — because a page cannot start a worker script from another origin.
- Helpers: `svgToVectorDrawing`, `sniffBytes`, `rasterizeSvgWithDom`.

## WOFF2 decoding and bundlers

`decompressWoff2` loads [`wawoff2`](https://www.npmjs.com/package/wawoff2) lazily, a CommonJS package wrapping an emscripten WASM decoder. It works as published:

- in Node (the emscripten glue assigns `module.exports` when it detects Node), and
- from esm.sh, whose CommonJS → ESM conversion exposes `decompress`.

Some bundlers (Vite, webpack, Turbopack) evaluate the emscripten glue as a web module, where it never assigns `module.exports`, and `decompressWoff2` then fails with `wawoff2: no decompress export`. The fix is a one-line patch to `wawoff2/build/decompress_binding.js` and `compress_binding.js` appending `module.exports = Module;` — the [postext monorepo](https://github.com/drnachio/postext/blob/main/patches/wawoff2.patch) applies it through pnpm's `patchedDependencies`. Alternatively, supply TTF/OTF bytes to your font provider directly and never call `decompressWoff2`.

## Arabic, Hebrew and other right-to-left scripts

Text in a right-to-left or joining script (Hebrew, Arabic, Syriac, Thaana, N'Ko and the other right-to-left blocks) is shaped with [HarfBuzz](https://www.npmjs.com/package/harfbuzzjs) compiled to WebAssembly: joining forms, ligatures, harakat stacked as the font places them, brackets mirrored in right-to-left runs, numbers and Latin words kept left to right. The module and its `harfbuzz.wasm` (about 430 KB, 145 KB brotli) are loaded only when a document sets such text. Character spacing is never applied to joining letters.

The module fetches `harfbuzz.wasm` next to itself (`new URL('harfbuzz.wasm', import.meta.url)`), which Node, a Worker and the usual bundlers handle. Its emscripten glue also holds an `import("module")` for Node, which Turbopack and webpack fail to resolve in a browser build (`Can't resolve 'module'`). The [postext monorepo](https://github.com/drnachio/postext/blob/main/patches/harfbuzzjs.patch) marks that import ignored (`webpackIgnore`, `turbopackIgnore`, `@vite-ignore`) through pnpm's `patchedDependencies`; a bundled app needs the same patch, or an alias of `module` to an empty module for the browser.

## License

MIT
