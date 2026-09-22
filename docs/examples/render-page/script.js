import { buildDocument, renderPage } from 'https://esm.sh/postext';

const markdown = `# The Lantern

The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.

## Two columns

Postext lays this text out in **two columns**, breaking each paragraph with the *Knuth–Plass* algorithm and hyphenating with TeX patterns. Widows and orphans are avoided, and the columns are balanced on the last page.

The light it gave was small, but it was enough to find the step. The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.

The light it gave was small, but it was enough to find the step. The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.`;

const config = {
  // 150 dpi: crisp enough for a preview, light enough to paint instantly.
  page: { sizePreset: '17x24', dpi: 150 },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 10, unit: 'pt' } },
};

// Postext measures text with the fonts the browser has loaded,
// so wait for every face the document uses before laying it out.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "EB Garamond"'),
  document.fonts.load('italic 16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'), // the default heading face
]);

// The whole layout: one entry per page in doc.pages, with exact coordinates.
const doc = buildDocument({ markdown }, config);

// Rasterise the first page. The canvas is sized to the page at the configured dpi.
const canvas = renderPage(doc.pages[0], doc);
document.getElementById('page').replaceChildren(canvas);
document.getElementById('status').textContent =
  `${doc.pages.length} page(s) · page 1 is ${canvas.width} × ${canvas.height} px`;

// The same bitmap as a PNG file.
canvas.toBlob((blob) => {
  const link = document.getElementById('download');
  link.href = URL.createObjectURL(blob);
  link.hidden = false;
}, 'image/png');
