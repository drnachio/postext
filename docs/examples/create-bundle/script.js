import { createBundle, openBundle, registerBundleImages, buildBundle, renderPage } from 'https://esm.sh/postext';

// A picture resource names its payload by fileId; the bytes (here, SVG
// markup) go in `files` under that same id.
const lanternSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150">
  <rect width="240" height="150" fill="#f3efe6"/>
  <path d="M100 36 h40 l8 14 h-56 z" fill="#2f3e46"/>
  <rect x="98" y="50" width="44" height="58" rx="4" fill="#f6c453" stroke="#2f3e46" stroke-width="4"/>
  <circle cx="120" cy="79" r="11" fill="#fff4c2"/>
  <path d="M94 108 h52 l-6 12 h-40 z" fill="#2f3e46"/>
</svg>`;

const resources = [{
  id: 'lantern',
  typeId: 'figure',
  kind: 'svg',
  caption: 'The lantern by the door.',
  svg: { fileId: 'lantern.svg', width: 240, height: 150 },
  createdAt: 0,
  updatedAt: 0,
}];

const text = 'The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved.';

// One entry per chapter; a chapter without a title takes its first # heading.
const chapters = [
  { markdown: `# Dusk\n\n${text} It is drawn in :ref{id="lantern"}.\n\n${text}\n\n${text}` },
  { markdown: `# Night\n\n${text}\n\n${text}` },
];

const config = {
  layout: { layoutType: 'double' },
  headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }] },
};

// Everything a .postext file holds: manifest, chapters, resources, fonts.
const { bytes, manifest, files, warnings } = await createBundle({
  name: 'The Lantern',
  locale: 'en',
  chapters,
  config,
  resources,
  files: { 'lantern.svg': lanternSvg },
});
if (warnings.length) console.warn(warnings);

const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
document.getElementById('download').href = url;
document.getElementById('actions').hidden = false;
document.getElementById('files').replaceChildren(...Object.entries(files).map(([path, data]) => {
  const li = document.createElement('li');
  li.textContent = `${path} (${data.length} B)`;
  return li;
}));
document.getElementById('manifest').textContent = JSON.stringify(manifest, null, 2);

// Round trip: open the file just written, the way any program would.
await Promise.all([
  document.fonts.load('16px "EB Garamond"'),
  document.fonts.load('bold 16px "EB Garamond"'),
  document.fonts.load('bold 16px "Open Sans"'), // the default heading face
]);
const bundle = await openBundle(bytes);
await registerBundleImages(bundle);
const [firstChapter] = buildBundle(bundle);
document.getElementById('page').replaceChildren(renderPage(firstChapter.pages[0], firstChapter));
document.getElementById('status').textContent =
  `${bundle.name}: ${bundle.chapters.length} chapters, ${(bytes.length / 1024).toFixed(1)} KB`;
