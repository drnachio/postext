# postext-epub

**EPUB 3 writer for [postext](https://www.npmjs.com/package/postext).**

`postext-epub` writes a book that `postext` has laid out as an EPUB 3.3 file, in the browser or in Node, with no server. It reads the same per-chapter `VDTDocument`s the PDF backend renders, so page numbers, footnotes, citations, cross-references, the contents and the index arrive already resolved. The whole file is built in memory and returned as bytes.

A book comes out in one of the two renditions EPUB 3 defines (the `rendition:layout` property):

- **Fixed layout** (`layout: 'fixed'`, EPUB `pre-paginated`): every printed page as it is, one XHTML document per page, with real, selectable text placed where the PDF places it.
- **Reflowable** (`layout: 'reflowable'`, the EPUB default): the text, figures and tables in reading order, as semantic XHTML that the reading system sets again for its screen, typeface and type size.

Right-to-left books (Arabic, Persian, Hebrew…) declare their language and direction on every document and on the navigation, and a right-bound book turns its pages to the left (`page-progression-direction="rtl"`). In the reflowable rendition a run set against its paragraph (a Latin name in Arabic, an Arabic quotation in English) is a `dir` isolate, a language named on `:ltr[…]{lang=en}` is declared, a `:::verse` poem sets each bayt as two hemistichs side by side, and the tatweels kashida justification inserted are left out (the reading system justifies; tatweels the author typed stay). The fixed layout paints them as printed, out of reach of a text selection.

**Website:** [postext.dev](https://postext.dev/) · **Docs:** [EPUB books](https://postext.dev/en/docs/configuration#epub-books-postext-epub)

## Install

```bash
npm install postext postext-epub
```

`postext` is a peer dependency. Each `postext-epub` release needs the `postext` it was released with, or a later one of the same major, so upgrade the two together. Or import both straight from a CDN:

```js
import { buildDocument } from 'https://esm.sh/postext';
import { renderToEpub } from 'https://esm.sh/postext-epub';
```

## Quick example

```ts
import { buildDocument } from 'postext';
import { renderToEpub } from 'postext-epub';

// Postext measures text with the fonts the browser has loaded.
await document.fonts.load('16px "EB Garamond"');

const doc = buildDocument({ markdown: '# Lantern\n\nTypeset me.' }, {
  page: { sizePreset: '17x24' },
  bodyText: { fontFamily: 'EB Garamond' },
});

const bytes = await renderToEpub([doc], {
  layout: 'reflowable', // or 'fixed'
  metadata: { title: 'Lantern', creators: ['Ada Lovelace'], language: 'en' },
  fonts: [
    { family: 'EB Garamond', weight: 400, style: 'normal', bytes: garamondRegular, format: 'woff2' },
    { family: 'EB Garamond', weight: 400, style: 'italic', bytes: garamondItalic, format: 'woff2' },
  ],
});

const url = URL.createObjectURL(new Blob([bytes], { type: 'application/epub+zip' }));
```

## A whole book

`renderToEpub` takes the book's chapters in order, each laid out as a continuation of the one before (counters, page parity, page numbers), which is what `buildBundle` returns for a `.postext` file:

```ts
import { openBundle, buildBundle } from 'postext';
import { renderToEpub } from 'postext-epub';

const bundle = await openBundle(fileBytes, { locale: 'es' });
const docs = buildBundle(bundle); // one VDTDocument per chapter

const bytes = await renderToEpub(docs, {
  layout: 'fixed',
  metadata: { title: 'Don Quijote', creators: ['Miguel de Cervantes'], language: 'es' },
  fonts: bundle.fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, bytes: new Uint8Array(f.bytes), format: f.format })),
  resourceBytes: (fileId) => {
    const data = bundle.files.get(fileId);
    return data ? { bytes: data, mediaType: '' } : undefined; // '' = read the type from the bytes
  },
  onProgress: ({ phase, done, total }) => console.log(phase, done, total),
  onWarning: (w) => console.warn(w),
});
```

The same array is what `renderToPdf` from `postext-pdf` takes for a book, so a PDF and an EPUB of one book come from one layout.

## API

### `renderToEpub(docs, options): Promise<Uint8Array>`

`docs` is the book's print documents, one per chapter in book order (at least one). The result is the `.epub` file.

<table>
  <thead>
    <tr><th>Option</th><th>What it does</th></tr>
  </thead>
  <tbody>
    <tr><td><code>layout</code></td><td>Required. <code>'fixed'</code> or <code>'reflowable'</code>.</td></tr>
    <tr><td><code>metadata</code></td><td>Required. <code>title</code> and <code>language</code> (a BCP 47 tag), and optionally <code>subtitle</code>, <code>creators</code> (authors in order), <code>identifier</code>, <code>date</code> (ISO 8601), <code>publisher</code>, <code>rights</code>, <code>description</code> and <code>modified</code>.</td></tr>
    <tr><td><code>fonts</code></td><td>The faces to embed: <code>{ family, weight, style, bytes, format, unicodeRange? }</code>, with <code>format</code> one of <code>woff2</code>, <code>woff</code>, <code>ttf</code>, <code>otf</code>. Each face becomes a file and an <code>@font-face</code> rule. Several files of one face, each with its <code>unicodeRange</code> (Google Fonts slices), are allowed.</td></tr>
    <tr><td><code>resourceBytes</code></td><td><code>(fileId) =&gt; { bytes, mediaType } | undefined</code>, sync or async: the pictures the pages place, by file id. Bitmaps as they are, SVGs as their source (not a PDF print master). An empty <code>mediaType</code> is read from the bytes. A single-ink book (<code>diagramStyle.singleInk</code>) has its SVGs recoloured in the file.</td></tr>
    <tr><td><code>cover</code></td><td><code>{ bytes, mediaType, alt? }</code>: a JPEG, PNG, WebP or SVG cover picture. It opens the book on a cover document of its own and is marked as the <code>cover-image</code>. Without it, the fixed layout names its first page as the cover, and the reflowable book has no cover picture.</td></tr>
    <tr><td><code>onProgress</code></td><td><code>{ phase, done, total }</code>, with <code>phase</code> one of <code>resources</code> (fonts and pictures), <code>documents</code> (pages for a fixed layout, chapters for a reflowable one) and <code>package</code> (the package document, the navigation and the zip).</td></tr>
    <tr><td><code>onWarning</code></td><td>Problems that do not stop the file: <code>missingImage</code> (a picture with no bytes, left as an empty frame), <code>missingFont</code> (a family, weight or style the pages use with no embedded face, which reading systems replace) and <code>unsupported</code>.</td></tr>
    <tr><td><code>signal</code></td><td>An <code>AbortSignal</code>; aborting rejects the promise between steps.</td></tr>
  </tbody>
</table>

Without an `identifier`, the book gets a `urn:uuid:` derived from its title, creators and language, so writing the same book again keeps its identity in a reader's library. A bare ISBN becomes `urn:isbn:…`. Pass `modified` as well for byte-identical output from the same input.

### Writing on a worker: `createEpubWorker()` (`postext-epub/worker`)

`renderToEpub` keeps the thread it runs on busy while it writes; a fixed layout of a long book takes a second or more. In a page, write the book on a worker instead:

```ts
import { createEpubWorker } from 'postext-epub/worker';

const epubWorker = createEpubWorker();
const controller = new AbortController();
const bytes = await epubWorker.render(docs, {
  layout: 'fixed',
  metadata: { title: 'My book', language: 'en' },
  fonts,
  resourceBytes, // a function, as for renderToEpub, or a Map by fileId
  onProgress: (p) => console.log(p.phase, p.done, p.total),
  onWarning: (w) => console.warn(w),
  signal: controller.signal,
});
epubWorker.dispose(); // when the page no longer needs it
```

`render(docs, options)` takes the options of `renderToEpub` and returns the same bytes. What travels to the worker:

- The documents are copied (structured clone).
- A `resourceBytes` function is asked on the calling thread for every picture the pages place before the worker starts, since the worker cannot reach the host's stores. A `Map` of `{ bytes, mediaType }` by file id is sent as it is.
- The buffers of the fonts, the pictures and the cover are transferred, not copied, so the caller's views of them are empty afterwards. Pass copies of bytes you keep.
- The finished file comes back transferred.

Progress and warnings are forwarded as they happen. Aborting the signal rejects at once with an `AbortError` and stops the worker, and the next render starts a fresh one.

The worker script is `new URL('./epub.worker.js', import.meta.url)`, which webpack, Vite and esbuild bundle. A host that builds its own worker passes it as `createEpubWorker({ worker })`, a `Worker` or a function that makes one. Its script imports `postext-epub/worker/entry`. A worker that fails to load rejects with an `EpubWorkerError`, and the host can then call `renderToEpub` on its own thread.

### `readEpub(bytes): ReadEpubResult`

Reads an EPUB back for a viewer, without `DOMParser`: the layout, the metadata, the reading direction, every file by its zip path, the manifest, the spine in reading order, the table of contents (from the navigation document, or the NCX of an older file), the page list, the fixed-layout viewport and the cover picture's path. `resolveHref(base, href)` and `dirOf(path)` resolve the links between those files.

### Lower-level exports

`buildFixedPublication` and `buildReflowablePublication` return the publication model (`EpubPublication`: items, spine, navigation, accessibility metadata) without packing it, and `packEpub(publication)` writes such a model as a file. `bookIdentifier` and `uuidV5` compute the identifier `renderToEpub` uses.

## What each layout produces

### Fixed layout

- One XHTML document per printed page, from the HTML backend's markup for that page. The viewport is the trimmed page in CSS px; the cut-line margin is cropped.
- Text is real text in the embedded fonts, so it can be selected, searched and read aloud. Formulas are inline SVG; pictures are files, each stored once.
- `page-spread-left` and `page-spread-right` follow the page parity and the binding. A right-bound book (Arabic, vertical Chinese) has `rtl` page progression, and its pages run right to left.
- Links work between pages: cross-references, footnotes, the printed contents and the index. Links to an element the book does not hold are dropped.
- The table of contents comes from the headings and the part pages, the page list from the printed page labels (`iv`, `12`), and the landmarks point at the cover, the printed contents and the start of the body.

### Reflowable

- One XHTML document per chapter (`text/chapter-NNN.xhtml`). A part opens a document of its own.
- Paragraphs are rebuilt from the laid-out lines: the hyphens the line breaks added are removed, hyphens that belong to the word are kept, and a paragraph split across pages or columns is one paragraph again.
- Figures and tables follow the text that cites them, with their numbered captions and alt text. Tables are real tables with header rows and merged cells. Lists nest, boxes become `<aside>` with their titles, heading levels never skip, and formulas are SVG labelled with their TeX.
- Footnotes link to the notes at the end of the chapter and back. Cross-references, citations and web links work. The printed contents link to the headings, and the index's page numbers link to page markers.
- Each printed page leaves a page-break marker where its text starts, so the page list gives the print page numbers.
- A stylesheet is derived from the configuration: sizes relative to the body text, the book's colours, justification with automatic hyphenation, indents, and styles for headings, boxes, tables, captions, lists and notes. Vertical Chinese keeps vertical writing; Arabic documents are `dir="rtl"`.
- Paragraphs set in a paragraph style (`:::paragraphs{style=…}`, a `:::verse` fence's style) carry its class, inside boxes too, and index entries are classed by their level, both as the layout names them (`VDTBlock.paragraphStyleId`, `VDTBlock.indexLevel`). Documents laid out by an older engine fall back to telling them from the face and the indent.
- A pull quote repeats words of the text, so it would be read twice. A box with no title (or a title of marks alone, such as a hanging quotation mark) whose words the chapter's text also has is kept on the page as `<aside epub:type="pullquote" role="doc-pullquote" aria-hidden="true">`: readers see it, assistive technology and read-aloud skip it, and the words are read once, in the text. A box whose style id names it a pull quote but whose words are its own is marked `epub:type="pullquote"` and read.

Both renditions carry the EPUB Accessibility 1.1 metadata (access modes, features such as the table of contents and print page numbers, hazards and a summary), and neither claims WCAG conformance by default.

## Limitations

- The reflowable stylesheet follows the first chapter's configuration: per-part palettes and per-chapter heading-style layouts are not applied.
- A pull quote edited beyond leaving words out (an ellipsis) does not match the text, and is read as well.
- Fonts are embedded as given. Respect the font licences: leave out families that may not be redistributed.
- `renderToEpub` writes on the calling thread; use `createEpubWorker` in a page. The writer checks the signal between steps, so a call on the page's own thread stops at the next step, not at once.

## Checking output with EPUBCheck

Output is checked with [W3C EPUBCheck](https://www.w3.org/publishing/epubcheck/) 5.4. In this repository, with `epubcheck` on the `PATH`:

```bash
pnpm --filter postext-epub epubcheck   # sample books built in the tests
pnpm --filter postext-epub validate    # the guide, the showcase presets and Cookbook books, both layouts
node packages/postext-epub/scripts/epubcheck.mjs path/to/book.postext --lang es --layout both --out /tmp/epub
```

- `epubcheck` (`src/epubcheck.test.ts`) writes the test suite's sample books (fixed, fixed with a cover, reflowable, reflowable with a cover) and fails on any EPUBCheck error or warning. Without the command it is skipped; `EPUBCHECK_OUT=dir` keeps the files.
- `scripts/epubcheck.mjs` lays out one `.postext` file or preset folder with its own fonts, writes the EPUB in one or both layouts and runs EPUBCheck on it. Options: `--lang`, `--layout fixed|reflowable|both`, `--out`, `--chapters 0,2`, `--report result.json`, `--no-cover`. For the reflowable book it also compares the letters of the laid-out text with those of the EPUB, so a lost or repeated paragraph shows.
- `scripts/validate.mjs` runs `epubcheck.mjs` on the whole matrix of books and prints a table; `--only name,name`, `--jobs N`, `--full` (all of Hong Lou Meng). It exits with 1 when any book has an EPUBCheck error or warning.

The scripts read this checkout's built dists: run `npx tsc` in `packages/postext`, `postext-pdf`, `postext-citeproc` and `postext-epub` first (`validate` builds `postext-epub` itself). The usage notes EPUBCheck leaves (`CSS-028` for `@font-face`, `OBS-001` for the NCX kept for older readers, `HTM_062` for `xlink:href` in formulas) are informational.

## License

MIT
