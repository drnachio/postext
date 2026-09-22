# postext-pdf

**PDF backend for [postext](https://www.npmjs.com/package/postext).**

`postext-pdf` turns the document that `postext` lays out into a real PDF, in the browser or in Node. It does not re-measure anything: it consumes the same `VDTDocument` the canvas and HTML renderers use and translates its coordinates into PDF points, so the three outputs agree on every line break, column height and resource placement. The PDF embeds the actual font files, carries outline bookmarks and is tagged for accessibility (PDF/UA oriented).

> **Active development** — postext and postext-pdf change frequently. The packages are published so everyone can follow their evolution, but we do not recommend using them in production yet.

**Website:** [postext.dev](https://postext.dev/) · **Docs:** [PDF output](https://postext.dev/en/docs/configuration#generating-pdfs)

## Install

```bash
npm install postext postext-pdf
```

`postext` is a peer dependency. Or import both straight from a CDN:

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

- `renderToPdf(doc | doc[], options)` — renders one document or a whole book (an array of chapters) to PDF bytes. Options: `fontProvider` (required), `resourceBytes` (images, SVGs and single-page PDF masters by file id), `outlines`, `accessible`, `colorSpace`, `pageNegative`, `onProgress`, `rasterizeSvg`.
- `decompressWoff2(bytes)` — WOFF2 → TTF/OTF, for font providers that fetch web fonts.
- `postext-pdf/worker` — `createPdfWorker()` renders off the main thread; fonts and SVG rasters are still resolved on the caller's thread when the worker asks for them. `postext-pdf/worker/entry` is the worker script for bundlers that want to control the worker URL.
- Helpers: `svgToVectorDrawing`, `sniffBytes`, `rasterizeSvgWithDom`.

## WOFF2 decoding and bundlers

`decompressWoff2` loads [`wawoff2`](https://www.npmjs.com/package/wawoff2) lazily, a CommonJS package wrapping an emscripten WASM decoder. It works as published:

- in Node (the emscripten glue assigns `module.exports` when it detects Node), and
- from esm.sh, whose CommonJS → ESM conversion exposes `decompress`.

Some bundlers (Vite, webpack, Turbopack) evaluate the emscripten glue as a web module, where it never assigns `module.exports`, and `decompressWoff2` then fails with `wawoff2: no decompress export`. The fix is a one-line patch to `wawoff2/build/decompress_binding.js` and `compress_binding.js` appending `module.exports = Module;` — the [postext monorepo](https://github.com/drnachio/postext/blob/main/patches/wawoff2.patch) applies it through pnpm's `patchedDependencies`. Alternatively, supply TTF/OTF bytes to your font provider directly and never call `decompressWoff2`.

## License

MIT
