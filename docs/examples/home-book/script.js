import { buildDocument, renderPage } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const paragraph = `The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved. The light it gave was small, but it was enough to find the step, and on winter nights it was the first thing travellers saw from the road.`;

const markdown = `# The Lantern

${paragraph}

## Two justified columns

Postext sets this text in **two columns**, breaking each paragraph with the *Knuth–Plass* algorithm and hyphenating it with TeX patterns, so the justified lines keep an even colour. Widows and orphans are avoided, and the columns are balanced on the last page.

${Array(8).fill(paragraph).join('\n\n')}`;

// Postext measures text with the fonts the browser has loaded,
// so wait for every face the document uses before laying it out.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "EB Garamond"'),
  document.fonts.load('italic 16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'), // the default heading face
]);

const doc = buildDocument(
  { markdown },
  {
    page: { sizePreset: '21x28', dpi: 150 }, // 150 dpi keeps the preview light
    layout: { layoutType: 'double' },
    bodyText: {
      fontSize: { value: 12, unit: 'pt' },
      textAlign: 'justify',
      hyphenation: { enabled: true, locale: 'en-us' },
    },
  }
);

// Every page as an image…
const cover = renderPage(doc.pages[0], doc);
document.getElementById('page').replaceChildren(cover);
cover.toBlob((png) => {
  document.getElementById('png').href = URL.createObjectURL(png);
}, 'image/png');

// …or the whole book as a print-ready PDF. The PDF embeds real font files:
// Fontsource publishes one WOFF2 per weight and style, decompressed here
// to the TTF bytes pdf-lib can embed.
const fontProvider = async (family, weight, style) => {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
};
const pdf = await renderToPdf(doc, { fontProvider });

// A PDF viewer cannot run inside this sandboxed result frame,
// so hand the file to a new tab and to a download link.
const pdfUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
document.getElementById('pdf-open').href = pdfUrl;
document.getElementById('pdf-download').href = pdfUrl;
document.getElementById('links').hidden = false;
document.getElementById('status').textContent =
  `${doc.pages.length} page(s) · ${(pdf.length / 1024).toFixed(0)} KB PDF`;
