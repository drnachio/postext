# postext-idml

InDesign Markup (IDML) for [Postext](https://postext.dev/) books, in both directions. It writes a book that `postext` has laid out as an IDML package, which InDesign opens with the pages as the PDF shows them, and it reads an IDML package into a typed model, from which the package's importer makes a Postext book. It runs in the browser or in Node, with no server and without InDesign.

```bash
npm install postext postext-idml
```

`postext` is a peer dependency: upgrade the two together.

## From Postext to InDesign

```ts
import { buildBundle, openBundle } from 'postext';
import { idmlDocument } from 'postext-idml';

const bundle = await openBundle(bytes);
const docs = buildBundle(bundle); // one VDTDocument per chapter, in book order

const { bytes: idml, links, fonts } = idmlDocument({
  docs,
  resourceBytes: (fileId) => bundle.files.get(fileId),
  images: 'link',
  onWarning: (w) => console.warn(w.code, w.message),
});
```

`idmlDocument(options)` returns `{ bytes, links, fonts }`: the `.idml` file, the linked pictures and the font files, the last two with a path relative to the IDML file for the caller to write beside it.

- `docs`: the laid-out chapters, in book order.
- `resourceBytes(fileId)`: the bytes of a picture.
- `images`: `'embed'` (default) keeps the pictures inside the file; `'link'` links them to `Links/<name>` and returns them in `links`.
- `lineBreaks`: `'keep'` (default) ends every line where Postext ended it, on the baseline Postext set it on, so InDesign shows the pages as the PDF does; `'reflow'` leaves the paragraphs to InDesign's composer, for a book that will be set again there.
- `spreads`: `'facing'` puts the pages two to a spread about the spine, `'single'` one page to a spread. The default is `'facing'` for a book with mirrored margins and `'single'` for any other.
- `fontFile(family, weight, italic)`: the font file of a face (TrueType or OpenType bytes). With it a face is named as its file names it, which is how InDesign finds it, and the files come back in `fonts` as `Document fonts/<file>`.
- `forms`: chips that carry a form field become InDesign form fields (default `true`).
- `onWarning`: what could not be written as it is in the book (`{ code, message }`).

Rules, boxes, paths and pictures are native page items, tables are InDesign tables, authored CMYK colours are process swatches, and the text of each composed frame is one story under a paragraph style named after its box style (chained frames share a story). Inline maths, music and colour swatches are anchored inline objects in their line (`inlineObjects: false` leaves them out, with a warning), links are InDesign hyperlinks, and with kept lines right-to-left text is written in right-to-left stories. Vertical text is written in horizontal stories, with a warning.

The command line writes the same package with `postext idml` and reads one into a new book with `postext import-idml`.

## From InDesign to Postext

```ts
import { inspectIdml, readIdml } from 'postext-idml';

const doc = readIdml(bytes); // throws IdmlError for what is no IDML
const summary = inspectIdml(doc);

console.log(summary.pages, summary.readableStories, summary.fonts);
for (const w of doc.warnings) console.warn(w.code, w.message);
```

- `readIdml(bytes, options?)` reads the package into an `IdmlDocument`: preferences, layers, swatches, fonts, styles, master spreads, spreads with their page items, and stories. Bytes that are no IDML, or a package that cannot be read at all, throw an `IdmlError` with a `code`; anything else the reader could not read as written is listed in the document's `warnings`. The options bound what is read (`maxPartBytes`, `maxTotalBytes`, `maxParts`, `maxDepth`).
- `inspectIdml(doc)` returns a summary for the dialog a host shows before importing: pages and page sizes, masters, layers, stories and the main one, fonts, the styles in use, pictures (linked, embedded, missing), tables and notes, and a list of what will need a second look (`attention`).

The same entry exports the helpers an importer works with: computed styles and formats, colours, the geometry of page items, master items and reading order.

The importer, `idmlToPostext`, turns the document read this way into the chapters, configuration and resources of a Postext book. Lines the document keeps (a forced line break at the end of each, as the export writes them) come back as the lines of the book: the importer turns on `bodyText.justifyHardBreaks` (postext 1.76), which justifies the line before a forced break as InDesign does, so a book exported from Postext and imported again sets the same lines.

What the importer does to keep the pages as the document has them:

- A paragraph that goes on in another frame is one paragraph. A threaded story is written once and its frames are chained (`next` on a page, `overflow.continueIn` to a later one). Where a document cuts the paragraph in two stories (an export writes one story per block, the first piece justified to its last line), the pieces are joined and their frames chained, when both wear one style and the second opens the next column or page.
- The first line of a frame stands where InDesign's rule puts it (`FirstBaselineOffset`: ascent, cap height, x-height, leading or a fixed height, never less than the minimum): the difference with Postext's rule (a baseline 0.8 of the leading under the top) goes to the frame's top padding or moves the frame up. Ascent, cap height and x-height are taken from typical proportions, since the importer has no font files; the report says so. Insets, the baseline rule and the vertical justification are read from the frame and from its object style.
- Master items are carried per master: on composed pages each template holds the items of its page's masters (those of the masters it is based on under them); in a flowing book the main master gives the running heads of the body pages and the master of the chapter openers those of the opener pages.
- An object anchored at a custom position gets a frame of its own where its rule puts it (composed pages), or hangs at its side of the column with the text beside it (flowing book). A picture typed in a line of a table cell or a caption is an inline symbol (`:icon`).
- A cross-reference to a heading or an anchor of the book is written as `:ref` (its title, its page number), so it follows the book. In a flowing book with no heading style, top-level bookmarks cut the chapters and name them.

Every difference is a finding of `result.report`, with a count and examples; a `loss` says what the book shows instead.

## Entries

- `postext-idml`: everything above.
- `postext-idml/export`: the writer alone.
- `postext-idml/read`: the reader and its helpers alone.
- `postext-idml/import`: the importer alone.

Docs: [Programmatic usage](https://postext.dev/en/docs/configuration-programmatic-usage).

## License

MIT.
