import {
  openBundle,
  loadBundleFonts,
  registerBundleImages,
  buildBundle,
  bundleResourceBytes,
  bundleFontProvider,
  renderPage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

// A two-chapter book with its own typeface, an SVG figure and a table.
const SAMPLE = 'https://cdn.jsdelivr.net/gh/drnachio/postext@main/docs/examples/open-bundle/lantern.postext';

const status = document.getElementById('status');
const pdfButton = document.getElementById('pdf');
let current = null;

async function show(data) {
  // Chapters, config (fonts wired to the bundle's own files), resources and
  // every file, keyed by its path inside the bundle.
  const bundle = await openBundle(data);

  // Layout measures text with the fonts the browser has: register the
  // bundle's faces, and load the Google Fonts it names but does not carry
  // (the default running heads use Open Sans; see the pen's CSS).
  await loadBundleFonts(bundle);
  await document.fonts.load('600 16px "Open Sans"');
  await registerBundleImages(bundle);

  // One VDTDocument per chapter, each continuing the one before it.
  const docs = buildBundle(bundle);
  const pages = docs.flatMap((doc) => doc.pages.map((page) => renderPage(page, doc)));
  document.getElementById('pages').replaceChildren(...pages);
  status.textContent = `${bundle.name} · ${bundle.chapters.length} chapter(s) · ${pages.length} page(s)`
    + (bundle.warnings.length ? ` · ${bundle.warnings.length} warning(s)` : '');
  current = { bundle, docs };
  pdfButton.disabled = false;
  document.getElementById('links').hidden = true;
}

// Fonts the bundle does not carry come from Fontsource.
async function fontsource(family, weight, style) {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@latest/files/${id}-latin-${weight}-${style}.woff2`);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${family}`);
  return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
}

pdfButton.addEventListener('click', async () => {
  pdfButton.disabled = true;
  status.textContent = 'Rendering the PDF…';
  const { bundle, docs } = current;
  const bytes = await renderToPdf(docs, {
    fontProvider: bundleFontProvider(bundle, { decodeWoff2: decompressWoff2, fallback: fontsource }),
    resourceBytes: bundleResourceBytes(bundle),
  });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  document.getElementById('open').href = url;
  document.getElementById('download').href = url;
  document.getElementById('links').hidden = false;
  status.textContent = `${bundle.name} · ${(bytes.length / 1024).toFixed(0)} KB PDF`;
  pdfButton.disabled = false;
});

document.getElementById('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  status.textContent = `Opening ${file.name}…`;
  await show(file).catch((err) => { status.textContent = `Could not open ${file.name}: ${err.message}`; });
});

const res = await fetch(SAMPLE);
await show(await res.arrayBuffer());
