# postext-folio

**A 3D book viewer for [postext](https://www.npmjs.com/package/postext) documents and page images.**

`postext-folio` sets a book out on the screen in spreads and lets the reader turn its pages: with the ‹ › buttons, the arrow keys, a swipe, a click on a page, or by taking a page by its edge and dragging it over. Each leaf curls in [three.js](https://threejs.org/) and casts a real shadow on the pages under it. The WebGL canvas draws the book still and turning alike, so a page never changes look when it lands; the DOM pages under it (images or canvases) are the textures' sources and the pages' text alternatives. A right-bound book (Chinese, Japanese, Arabic) lies mirrored and turns leftward. Without WebGL2, or when the reader asks for reduced motion, the spreads simply change.

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

Pages are painted with `renderPageToCanvas` at exactly the device pixels of a page slot, so WebGL shows them texel for pixel, as sharp as the canvas preview, and only around the open spread (`window`, three spreads either side by default). Pages that fall out of that window are freed, so a book of a thousand pages costs the memory of a few. Turning to a far page paints that spread first. Pages a long turn sweeps past show as blank paper while they are in the air.

The container sets the size: the book fills it, with the ‹ › buttons and the page count in the margins. Give it a height. A resize paints the pages again at the new size.

## Videos on the pages

A video resource of the document plays on its page. A click on the poster starts it there, in any pointer mode: the page's shader draws the frames over the poster, so the picture curls with the leaf and keeps playing while it turns. Another click pauses it, starting another stops the first, and it stops when the book comes to rest on a spread that no longer shows it. Space or Enter plays or pauses the video on the open spread. A video with `player.autoplay` starts by itself the first time its spread is shown (muted until the reader has interacted with the page).

```ts
const book = createFolioFromDocument(container, doc, {
  videoUrl: (fileId) => objectUrls.get(fileId), // an uploaded file's URL; else the video's address
  onVideo: ({ resourceId, state }) => console.log(resourceId, state),
});
```

Files and web addresses play (MP4, WebM, and HLS streams through [hls.js](https://github.com/video-dev/hls.js), an optional peer dependency loaded on the first play and capped at the picture's size on screen; the browser's own HLS is the fallback). The server must allow cross-origin reads (CORS) for WebGL to draw the video; YouTube and Vimeo play in iframes, which WebGL cannot draw, so their posters turn the page as before. `videos: false` turns it off.

## The book on the desk

The book lies open on a desk, seen from in front and a little above (the foot of the pages comes closer), lit by an environment that glossy paper reflects as a leaf curls, and by a key light that casts the shadows. The pages already read and those still to come form two blocks of real thickness: leaf count × the paper's caliper, with the book's other chapters counted in (`extraPages`). They are never painted, only counted. The open pages curve down into the gutter, and the darker gutter comes from the occlusion of that shape, not from a painted gradient. Each leaf bends according to its paper's stiffness: bible paper rolls tight, card turns in a wide arc, and board turns as a rigid plate on its hinge.

All of this is set with postext's `folio` config, read from `doc.config.folio` or passed as `appearance`:

```ts
const book = createFolioFromDocument(container, doc, {
  appearance: {
    folio: {
      tilt: 22, // degrees from straight above, 0 … 70
      yaw: 0, // degrees round the book, −180 … 180
      paper: { type: 'bookWove', grammage: 80, texture: 'laid' },
      binding: { type: 'hardcover', coverColor: { hex: '#5a1f1f', model: 'hex' } },
      surface: { type: 'walnut' },
      lighting: { environment: 'lamp', intensity: 1 },
    },
  },
});
book.setAppearance({ folio: { lighting: { environment: 'daylight' } } });
```

<table>
<thead><tr><th>Setting</th><th>Values</th></tr></thead>
<tbody>
<tr><td><code>paper.type</code></td><td><code>uncoated</code> (woodfree offset, 90 g/m²), <code>bookWove</code> (bulky cream, 80 g/m²), <code>coatedMatte</code>, <code>coatedSilk</code>, <code>coatedGloss</code> (115 g/m²), <code>bible</code> (40 g/m²), <code>newsprint</code>, <code>cardStock</code> (250 g/m²), <code>board</code> (rigid, about 2 mm). Each sets the defaults below.</td></tr>
<tr><td><code>paper.grammage</code>, <code>paper.bulk</code></td><td>g/m² and cm³/g; caliper µm = grammage × bulk. Thickness, stiffness (∝ caliper^⅔ for the roll) and opacity follow.</td></tr>
<tr><td><code>paper.finish</code></td><td><code>uncoated</code> | <code>matte</code> | <code>silk</code> | <code>gloss</code>: roughness and clear coat.</td></tr>
<tr><td><code>paper.texture</code>, <code>paper.textureStrength</code></td><td><code>smooth</code> | <code>vellum</code> | <code>wove</code> | <code>laid</code> | <code>linen</code> | <code>felt</code>, as a normal map at physical scale; strength 0 … 2.</td></tr>
<tr><td><code>paper.shade</code>, <code>paper.showThrough</code></td><td>The stock's colour (pages are printed on it); the reverse page showing faintly through thin paper.</td></tr>
<tr><td><code>binding.type</code></td><td><code>hardcover</code> (boards with squares) | <code>paperback</code> (opens less flat) | <code>sewn</code> | <code>layflat</code>; plus <code>coverMaterial</code> (cloth, paper, leather) and <code>coverColor</code>.</td></tr>
<tr><td><code>surface.type</code></td><td><code>oak</code> | <code>walnut</code> | <code>linen</code> | <code>felt</code> | <code>leather</code> | <code>marble</code> | <code>plain</code> | <code>none</code> (the host's background, with the book's shadow); <code>color</code> tints it.</td></tr>
<tr><td><code>lighting</code></td><td><code>environment</code>: <code>studio</code> | <code>daylight</code> | <code>lamp</code> | <code>overcast</code> | <code>night</code>; <code>intensity</code> 0.25 … 2; <code>shadows</code>.</td></tr>
</tbody>
</table>

A `:::paper{type=coatedGloss}` run in the markdown (a plate section, say) stamps its pages with their own stock; the viewer gives those leaves that paper's look, thickness and stiffness. With `createFolio`, a page may carry its own `paper` the same way: `{ src, paper: { type: 'coatedGloss' } }`.

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
<tr><td><code>createFolio(container, options)</code></td><td>The viewer over any pages. Options: <code>pages</code>, <code>firstPageRecto</code> (default true), <code>binding</code> (<code>'left'</code> | <code>'right'</code>), <code>at</code> (page to open on), <code>mode</code> (<code>'auto'</code> | <code>'single'</code> | <code>'double'</code>; auto shows one page at a time below 560 px), <code>paper</code> (blank-page colour), <code>animate</code>, <code>interaction</code> (what the left button does: <code>'hand'</code> turns pages, <code>'orbit'</code> turns the view, <code>'select'</code> leaves the pointer to the host), <code>controls</code>, <code>showCount</code> (false keeps the count for screen readers only), <code>labels</code>, <code>appearance</code> (<code>folio</code>, <code>pageWidthMm</code>, <code>extraPages</code>, <code>covers</code>, <code>spineImage</code>, <code>textureBaseUrl</code>), <code>onChange</code>, <code>onTarget</code>, <code>onLayout</code>. One page at a time the book is WebGL too: the spine runs along the page's inner edge and the leaf turns over it; a drag towards the spine turns forward, a swipe away from it goes back, a tap turns.</td></tr>
<tr><td><code>createFolioFromDocument(container, doc, options)</code></td><td>The same over a postext <code>VDTDocument</code>, painted lazily. Spreads, binding and paper come from the document. Adds <code>scale</code>, <code>window</code>, <code>singleInk</code>, <code>pageNegative</code>, <code>alt</code>, <code>videos</code>, <code>videoUrl</code>, <code>onVideo</code>, and on the viewer <code>setDocument(doc)</code>, <code>toggleVideoAt(point)</code> and <code>stopVideo()</code>.</td></tr>
<tr><td>viewer</td><td><code>goToPage(i, { instant })</code>, <code>goToSpread(i, { instant })</code> (instant opens there without turning), <code>next()</code>, <code>prev()</code>, <code>setPages(pages, opts)</code>, <code>setLabels(labels)</code>, <code>setAppearance(appearance)</code>, <code>resetView()</code> (eases the view back to the settings' <code>tilt</code> and <code>yaw</code> after the reader orbited it with a right-drag), <code>getView()</code> (the view as seen now, <code>{ tilt, yaw }</code> in degrees, to store as the settings), <code>setInteraction(mode)</code>, <code>pageAt(event)</code> (the page under a pointer and where on it, <code>{ page, x, y }</code>, on the book as seen), <code>pointOnScreen(point)</code> (the reverse, for drawing a caret or a selection), <code>refreshPage(src)</code>, <code>setPageVideo(video)</code> (draws a playing <code>&lt;video&gt;</code> on a page, at a place given in page fractions), <code>onPageClick</code> / <code>isPageAction</code> options (a click on a page that acts instead of turning it), <code>pageSize</code>, <code>state</code> (<code>{ spread, pages }</code>), <code>element</code>, <code>dispose()</code>.</td></tr>
<tr><td><code>PageFlipper</code>, <code>canFlip()</code></td><td>The three.js engine alone: a canvas over a host's spread, <code>go(i)</code>, <code>grab</code>/<code>drag</code>/<code>release</code> for the hand (ray-cast onto the tilted pages), <code>hit</code>, <code>setBook</code>, <code>setAppearance</code>, <code>clear</code>, <code>dispose</code>; <code>{ persistent: true }</code> draws the book at rest too, <code>turnAt</code> sets how far a leaf let go must be to turn over.</td></tr>
<tr><td><code>FlatPageFlipper</code></td><td>The flat page-turn that predates the 3D book, for a host whose DOM spread shows the pages at rest and must match the turning leaf pixel for pixel (the postext Cookbook's light table).</td></tr>
<tr><td><code>pageVideoSpots(page, doc)</code>, <code>attachVideoSource(el, url, opts)</code></td><td>Where each video lies on a page as bound (turned, unmirrored, cropped as printed), and a source for a <code>&lt;video&gt;</code>: a file as it is, an HLS stream natively or through hls.js.</td></tr>
<tr><td><code>spreadsOf(count, firstPageRecto)</code></td><td>The <code>[verso, recto]</code> pairs of a book.</td></tr>
<tr><td><code>FOLIO_CSS</code></td><td>The viewer's styles (injected once on first use). Restyle with <code>--postext-folio-accent</code> and <code>--postext-folio-nav-border</code> on the container.</td></tr>
</tbody>
</table>

The viewer takes the keyboard when focused: ←/→ (mirrored for a right-bound book), Page Up/Down, Home and End. Its labels default to English; pass `labels` (`region`, `prev`, `next`, `count`) to translate them.

## Desk textures

The photographed desk surfaces served from postext.dev (`/folio/textures/`, with a `manifest.json` and a `CREDITS` file) are CC0 texture sets, resized and re-encoded for the web. No attribution is required; thanks to their authors:

<table>
<thead><tr><th>Desk</th><th>Set</th><th>Author</th><th>Source</th></tr></thead>
<tbody>
<tr><td>oak</td><td>Oak Veneer 01</td><td>Jenelle van Heerden</td><td><a href="https://polyhaven.com/a/oak_veneer_01">Poly Haven</a></td></tr>
<tr><td>walnut</td><td>Wood 051</td><td>Lennart Demes</td><td><a href="https://ambientcg.com/view?id=Wood051">ambientCG</a></td></tr>
<tr><td>linen</td><td>Fabric 036</td><td>Lennart Demes</td><td><a href="https://ambientcg.com/view?id=Fabric036">ambientCG</a></td></tr>
<tr><td>felt</td><td>Fabric 034</td><td>Lennart Demes</td><td><a href="https://ambientcg.com/view?id=Fabric034">ambientCG</a></td></tr>
<tr><td>leather</td><td>Brown Leather</td><td>Rob Tuytel</td><td><a href="https://polyhaven.com/a/brown_leather">Poly Haven</a></td></tr>
<tr><td>marble</td><td>Marble 021</td><td>Lennart Demes</td><td><a href="https://ambientcg.com/view?id=Marble021">ambientCG</a></td></tr>
<tr><td>plain</td><td>Plastic 013 A</td><td>Lennart Demes</td><td><a href="https://ambientcg.com/view?id=Plastic013A">ambientCG</a></td></tr>
</tbody>
</table>

## License

MIT (code). The desk textures above are CC0.
