import {
  openBundle,
  loadBundleFonts,
  registerBundleImages,
  buildBundle,
  renderPageToCanvas,
} from 'https://esm.sh/postext';

// The Sandbox's first example, the Postext guide, as one .postext file: its
// configuration, its chapters in English and Spanish, the font files of its
// four typefaces, its figures and its tables.
const GUIDE = 'https://cdn.jsdelivr.net/gh/drnachio/postext@main/apps/web/public/bundles/postext-guide.postext';

const status = document.getElementById('status');
const pages = document.getElementById('pages');
const select = document.getElementById('lang');
const data = await (await fetch(GUIDE)).blob();

async function show(locale) {
  select.disabled = true;
  const bundle = await openBundle(data, { locale });

  // Everything comes from the file itself: the typefaces layout measures
  // with, and the pictures the pages draw.
  await loadBundleFonts(bundle);
  await registerBundleImages(bundle);

  status.textContent = `Laying out ${bundle.chapters.length} chapters…`;
  await new Promise(requestAnimationFrame);
  // One laid-out document per chapter, each continuing the one before it.
  const docs = buildBundle(bundle);

  // Every page as a PNG, at half the file's 300 dpi.
  pages.replaceChildren();
  const total = docs.reduce((n, doc) => n + doc.pages.length, 0);
  for (const doc of docs) {
    for (const page of doc.pages) {
      const canvas = document.createElement('canvas');
      renderPageToCanvas(page, doc, canvas, { scale: 0.5 });
      const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const img = new Image();
      img.src = URL.createObjectURL(png);
      img.alt = `Page ${pages.children.length + 1}`;
      pages.append(img);
      status.textContent = `${bundle.name} · page ${pages.children.length} of ${total}`;
    }
  }
  status.textContent = `${bundle.name} · ${bundle.chapters.length} chapters · ${total} pages`
    + ` · ${bundle.fonts.length} font files · ${bundle.resources.length} resources`;
  select.disabled = false;
}

select.value = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
select.addEventListener('change', () => show(select.value));
await show(select.value);
