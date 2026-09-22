import { buildDocument, renderToHtml } from 'https://esm.sh/postext';

const markdown = `# The Lantern

The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.

## Two columns

Postext lays this text out in **two columns**, breaking each paragraph with the *Knuth–Plass* algorithm and hyphenating with TeX patterns. Widows and orphans are avoided, and the columns are balanced on the last page.

The light it gave was small, but it was enough to find the step. The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.

The light it gave was small, but it was enough to find the step. The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.`;

const config = {
  // 96 dpi: page pixels are CSS pixels, so the HTML shows at its real size.
  page: { sizePreset: '17x24', dpi: 96 },
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

const doc = buildDocument({ markdown }, config);

// One HTML string for the whole document. Every line is an absolutely
// positioned element, so the browser never reflows the text.
const html = renderToHtml(doc, { mode: 'single', background: '#ffffff' });

document.getElementById('viewer').innerHTML = html;
document.getElementById('source').textContent = html;
document.getElementById('status').textContent =
  `${doc.pages.length} page(s) · ${(html.length / 1024).toFixed(1)} KB of HTML`;
