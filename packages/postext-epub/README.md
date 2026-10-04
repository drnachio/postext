# postext-epub

**EPUB 3 writer for [postext](https://www.npmjs.com/package/postext).**

`postext-epub` writes the book `postext` lays out as an EPUB 3.3 file, in the browser or in Node, with no server. It reads the same per-chapter `VDTDocument`s the PDF backend renders, so the page numbers, notes, cross-references and contents arrive resolved.

- **Fixed layout** (`layout: 'fixed'`, pre-paginated): one XHTML document per printed page, with real, selectable text placed as on the page, the fonts embedded, pictures as files, links between pages, the table of contents from the headings and the printed page numbers as the page list. Right-bound books (Arabic, vertical Chinese) read right to left.
- **Reflowable** (`layout: 'reflowable'`): semantic XHTML whose text reflows to the reader's screen and settings.

Every file is checked with W3C EPUBCheck during development.

## Quick example

```ts
import { buildBundle } from 'postext';
import { renderToEpub } from 'postext-epub';

const docs = buildBundle(bundle); // one VDTDocument per chapter, in order
const bytes = await renderToEpub(docs, {
  layout: 'fixed',
  metadata: { title: 'Lantern', creators: ['Ada Lovelace'], language: 'en' },
  fonts: [{ family: 'Lora', weight: 400, style: 'normal', bytes: loraBytes, format: 'woff2' }],
  resourceBytes: (fileId) => ({ bytes: files.get(fileId)!, mediaType: 'image/png' }),
  onWarning: (w) => console.warn(w),
});
```

`readEpub(bytes)` reads a file back (spine, navigation, page list, the fixed-layout viewport, every file), for viewers.

## Checking output

```bash
pnpm epubcheck                                   # sample books, needs `epubcheck` on the PATH
node scripts/epubcheck.mjs path/to/book.postext --lang es --layout fixed --out /tmp/epub
```

The script lays a `.postext` file or a preset folder out with its own fonts, writes the EPUB and runs EPUBCheck on it (build this package with `npx tsc` first).

## License

MIT
