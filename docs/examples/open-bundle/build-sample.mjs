// Builds `lantern.postext`, the sample the "open a bundle" pen loads, with
// the same `createBundle` the pens use — in Node, from the local build:
//
//   pnpm --filter postext build && node docs/examples/open-bundle/build-sample.mjs
//
// The book carries its own typeface (EB Garamond, SIL Open Font License,
// fetched from Fontsource), an SVG figure and a table.

import { writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// The dists use extensionless relative imports (bundler resolution): retry
// them with `.js` / `/index.js` under Node.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (err) {
      if (!specifier.startsWith('.')) throw err;
      for (const suffix of ['.js', '/index.js']) {
        try { return next(specifier + suffix, context); } catch { /* next */ }
      }
      throw err;
    }
  },
});
const { createBundle } = await import('../../../packages/postext/dist/bundle/index.js');

const fontUrl = (weight, style) =>
  `https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond@5/files/eb-garamond-latin-${weight}-${style}.woff2`;

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const faces = [
  { weight: 400, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'normal' },
];
const files = {};
const variants = [];
for (const { weight, style } of faces) {
  const fileId = `eb-garamond-${weight}-${style}`;
  files[fileId] = await fetchBytes(fontUrl(weight, style));
  variants.push({ weight, style, fileId, format: 'woff2', fileName: `EBGaramond-${weight}-${style}.woff2` });
}

files['lantern-svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150">
  <rect width="240" height="150" fill="#f3efe6"/>
  <line x1="20" y1="18" x2="220" y2="18" stroke="#4a4a4a" stroke-width="3"/>
  <line x1="120" y1="18" x2="120" y2="36" stroke="#4a4a4a" stroke-width="2"/>
  <path d="M100 36 h40 l8 14 h-56 z" fill="#2f3e46"/>
  <rect x="98" y="50" width="44" height="58" rx="4" fill="#f6c453" stroke="#2f3e46" stroke-width="4"/>
  <circle cx="120" cy="79" r="11" fill="#fff4c2"/>
  <path d="M94 108 h52 l-6 12 h-40 z" fill="#2f3e46"/>
</svg>`;

const config = {
  page: { sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'EB Garamond', fontSize: { value: 10.5, unit: 'pt' } },
  headings: {
    fontFamily: 'EB Garamond',
    levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }],
  },
  customFonts: [{ name: 'EB Garamond', variants }],
};

const resources = [
  {
    id: 'lantern',
    typeId: 'figure',
    kind: 'svg',
    caption: 'The lantern by the door.',
    createdAt: 0,
    updatedAt: 0,
    svg: { fileId: 'lantern-svg', width: 240, height: 150 },
  },
  {
    id: 'hours',
    typeId: 'table',
    kind: 'table',
    caption: 'When the lantern was lit.',
    createdAt: 0,
    updatedAt: 0,
    table: {
      model: {
        rows: [
          [{ content: 'Season' }, { content: 'Lit at' }],
          [{ content: 'Winter' }, { content: '17:00' }],
          [{ content: 'Summer' }, { content: '21:30' }],
        ],
        headerRowCount: 1,
      },
    },
  },
];

const para = 'The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there, or why the lantern was never moved. The light it gave was small, but it was enough to find the step.';

const chapters = [
  {
    markdown: `# Dusk

${para} It is drawn in :ref{id="lantern"}.

${para}

${para}`,
  },
  {
    markdown: `# Night

The hours changed with the seasons, as :ref{id="hours"} shows. ${para}

${para}

${para}`,
  },
];

const { bytes, warnings } = await createBundle({
  name: 'The Lantern',
  description: 'A two-chapter sample book with its own typeface, an SVG figure and a table.',
  locale: 'en',
  chapters,
  config,
  resources,
  files,
});
if (warnings.length) console.warn(warnings);
const out = new URL('./lantern.postext', import.meta.url);
await writeFile(out, bytes);
console.log(`${out.pathname}: ${(bytes.length / 1024).toFixed(1)} KB`);
