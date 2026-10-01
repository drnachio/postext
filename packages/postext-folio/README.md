# postext-folio

**A 3D book viewer for [postext](https://www.npmjs.com/package/postext) documents and page images.**

`postext-folio` sets a book out on the screen in spreads and lets the reader turn its pages: with the ‹ › buttons, the arrow keys, a swipe, a click on a page, or by taking a page by its edge and dragging it over. Each leaf curls in [three.js](https://threejs.org/) and casts a real shadow on the pages under it. At rest the pages are plain DOM (images or canvases) and the WebGL canvas is transparent; it draws only while leaves are moving. A right-bound book (Chinese, Japanese, Arabic) lies mirrored and turns leftward. Without WebGL2, or when the reader asks for reduced motion, the spreads simply change.

**Website:** [postext.dev](https://postext.dev/) · **Docs:** [A 3D book](https://postext.dev/en/docs/configuration#a-3d-book-postext-folio)

## Install

```bash
npm install postext postext-folio three
```

`postext` and `three` are peer dependencies. Or import everything straight from a CDN:

```js
import { buildDocument } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';
```

## A postext document as a book

```ts
import { buildDocument } from 'postext';
import { createFolioFromDocument } from 'postext-folio';

// Postext measures text with the fonts the browser has loaded.
await document.fonts.load('16px "EB Garamond"');

const doc = buildDocument({ markdown }, {
  page: { sizePreset: '17x24' },
  bodyText: { fontFamily: 'EB Garamond' },
});

const book = createFolioFromDocument(document.getElementById('book')!, doc, {
  onChange: ({ pages }) => console.log('showing pages', pages),
});

// After an edit: the same viewer, on the same page.
book.setDocument(buildDocument({ markdown: edited }, config));
```

Pages are painted with `renderPageToCanvas` at the size they are shown (times the device pixel ratio), and only around the open spread (`window`, three spreads either side by default). Pages that fall out of that window are freed, so a book of a thousand pages costs the memory of a few. Turning to a far page paints that spread first. Pages a long turn sweeps past show as blank paper while they are in the air.

The container sets the size: the book fits inside it, leaving room above and below for a lifted leaf. Give it a height.

## Page images

`createFolio` takes any pages: image URLs, `<canvas>` or `<img>` elements, `""` for a blank page.

```ts
import { createFolio } from 'postext-folio';

const book = createFolio(container, {
  pages: ['p01.webp', 'p02.webp', 'p03.webp', { src: 'p04.webp', alt: 'Plate II' }],
  firstPageRecto: true, // page 1 opens alone, on the right
  binding: 'left',
});
book.goToPage(2);
```

## API

<table>
<thead><tr><th>Export</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>createFolio(container, options)</code></td><td>The viewer over any pages. Options: <code>pages</code>, <code>firstPageRecto</code> (default true), <code>binding</code> (<code>'left'</code> | <code>'right'</code>), <code>at</code> (page to open on), <code>mode</code> (<code>'auto'</code> | <code>'single'</code> | <code>'double'</code>; auto shows one page at a time below 560 px), <code>paper</code> (blank-page colour), <code>animate</code>, <code>controls</code>, <code>labels</code>, <code>onChange</code>, <code>onTarget</code>.</td></tr>
<tr><td><code>createFolioFromDocument(container, doc, options)</code></td><td>The same over a postext <code>VDTDocument</code>, painted lazily. Spreads, binding and paper come from the document. Adds <code>scale</code>, <code>window</code>, <code>singleInk</code>, <code>pageNegative</code>, <code>alt</code>, and <code>setDocument(doc)</code> on the viewer.</td></tr>
<tr><td>viewer</td><td><code>goToPage(i)</code>, <code>goToSpread(i)</code>, <code>next()</code>, <code>prev()</code>, <code>setPages(pages, opts)</code>, <code>setLabels(labels)</code>, <code>state</code> (<code>{ spread, pages }</code>), <code>element</code>, <code>dispose()</code>.</td></tr>
<tr><td><code>PageFlipper</code>, <code>canFlip()</code></td><td>The three.js engine alone, for a host that lays out its own spread DOM (as the postext Cookbook does): a canvas over the spread, <code>go(i)</code>, <code>grab</code>/<code>drag</code>/<code>release</code> for the hand, <code>setBook</code>, <code>clear</code>, <code>dispose</code>.</td></tr>
<tr><td><code>spreadsOf(count, firstPageRecto)</code></td><td>The <code>[verso, recto]</code> pairs of a book.</td></tr>
<tr><td><code>FOLIO_CSS</code></td><td>The viewer's styles (injected once on first use). Restyle with <code>--postext-folio-accent</code> and <code>--postext-folio-nav-border</code> on the container.</td></tr>
</tbody>
</table>

The viewer takes the keyboard when focused: ←/→ (mirrored for a right-bound book), Page Up/Down, Home and End. Its labels default to English; pass `labels` (`region`, `prev`, `next`, `count`) to translate them.

## License

MIT
