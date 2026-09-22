import { buildDocument } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const markdown = `# The Lantern

The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.

## Two columns

Postext lays this text out in **two columns**, breaking each paragraph with the *Knuth–Plass* algorithm and hyphenating with TeX patterns. Widows and orphans are avoided, and the columns are balanced on the last page.

The light it gave was small, but it was enough to find the step. The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.`;

const config = {
  page: { sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 10, unit: 'pt' } },
};

// The PDF embeds real font files. Fontsource publishes one static WOFF2 per
// weight and style; decompress it to the TTF bytes pdf-lib can embed.
const fontProvider = async (family, weight, style) => {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
};

// Layout is measured with the browser's fonts, so load them before building:
// otherwise the PDF would not match the canvas or HTML output.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "EB Garamond"'),
  document.fonts.load('italic 16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'), // the default heading face
]);

const doc = buildDocument({ markdown }, config);

// Same VDT, now translated to PDF points: identical line breaks and placement.
const bytes = await renderToPdf(doc, { fontProvider });

// A PDF viewer cannot run inside this sandboxed result frame,
// so hand the file to a new tab and to a download link.
const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
document.getElementById('open').href = url;
document.getElementById('download').href = url;
document.getElementById('links').hidden = false;
document.getElementById('status').textContent =
  `${doc.pages.length} page(s) · ${(bytes.length / 1024).toFixed(0)} KB PDF`;
