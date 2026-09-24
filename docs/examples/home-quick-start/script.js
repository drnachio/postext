// Quick start: Markdown in, pages out.
import { buildDocument, renderPage } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

// The default faces are EB Garamond (body) and Open Sans (headings).
// Layout is measured with the browser's fonts, so load them first.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'),
]);

const doc = buildDocument(
  { markdown: '# Hello World\n\nYour content here.' },
  // A body size that reads well on screen (the default is 8 pt).
  { bodyText: { fontSize: { value: 14, unit: 'pt' } } }
);

// Draw the first page on a canvas
document.body.append(renderPage(doc.pages[0], doc));

// Export a vector PDF. It embeds the same fonts, fetched from Fontsource
// and decompressed from WOFF2 to the bytes pdf-lib can embed.
const fontProvider = async (family, weight, style) => {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
};
const pdf = await renderToPdf(doc, { fontProvider });

const pdfUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
document.getElementById('pdf-open').href = pdfUrl;
document.getElementById('pdf-download').href = pdfUrl;
document.getElementById('links').hidden = false;
document.getElementById('status').textContent =
  `${doc.pages.length} page(s) · ${(pdf.length / 1024).toFixed(0)} KB PDF`;
