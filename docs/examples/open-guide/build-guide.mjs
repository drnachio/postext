// Builds `apps/web/public/bundles/postext-guide.postext`: the Sandbox's first example — the bilingual
// Postext guide — as one self-contained file. It holds the guide's
// configuration, its chapters in English and Spanish, its figures and
// tables, and the font files of its four typefaces (Fraunces, Lora, Geist,
// Bricolage Grotesque; SIL Open Font License, fetched from Fontsource). The
// Sandbox's own export leaves these fonts out, since it takes them from
// Google Fonts by name. Run it from the repository root whenever the guide
// changes:
//
//   pnpm --filter postext build && node docs/examples/open-guide/build-guide.mjs
//
// Node runs the sandbox's TypeScript sources directly (type stripping).

import { writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// The sources use extensionless relative imports (bundler resolution), and
// the dists do too: retry them with a file extension or `/index`.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (err) {
      if (!specifier.startsWith('.')) throw err;
      for (const suffix of ['.ts', '.js', '/index.ts', '/index.js']) {
        try { return next(specifier + suffix, context); } catch { /* next */ }
      }
      throw err;
    }
  },
});

const sandbox = new URL('../../../packages/postext-sandbox/src/', import.meta.url);
const load = (path) => import(new URL(path, sandbox).href);
const { createPostextGuideConfig } = await load('context/guideConfig.ts');
const { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } = await load('defaultMarkdown/index.ts');
const { sampleBook } = await load('book/chapterOps.ts');
const { buildDefaultResources, SVG_FIGURES } = await load('defaultResources/index.ts');
const { coverThumbnailSvg } = await load('defaultResources/cover.ts');
const { createBundle, zipBundle } = await import(new URL('../../../packages/postext/dist/bundle/index.js', import.meta.url).href);

const LOCALES = ['en', 'es'];
const MARKDOWN = { en: DEFAULT_MARKDOWN_EN, es: DEFAULT_MARKDOWN_ES };
const NAME = { en: 'The Postext guide', es: 'Guía de Postext' };
const DESCRIPTION = 'The Postext guide, in English and Spanish: its configuration, chapters, typefaces, figures and tables in one open .postext file · La guía de Postext en inglés y español: configuración, capítulos, tipografías, figuras y tablas en un único fichero .postext abierto';

// ---------------------------------------------------------------------------
// Fonts: every (family, weight, style) the configuration names, plus regular
// and bold in both styles for each family (markdown emphasis), as far as
// Fontsource publishes them.

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function fontUses(config) {
  const uses = new Map();
  const add = (family, weight, style) => {
    const set = uses.get(family) ?? new Set();
    set.add(`${weight}|${style}`);
    uses.set(family, set);
  };
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const family = node.fontFamily ?? node.family;
    if (typeof family === 'string' && family.trim()) {
      const weight = node.fontWeight ?? node.weight ?? 400;
      const italic = node.fontStyle === 'italic' || node.italic === true;
      add(family, typeof weight === 'number' ? weight : 400, italic ? 'italic' : 'normal');
    }
    Object.values(node).forEach(walk);
  };
  walk(config);
  for (const family of uses.keys()) {
    for (const weight of [400, 700]) for (const style of ['normal', 'italic']) add(family, weight, style);
  }
  return uses;
}

async function fontFiles(config) {
  const files = {};
  const families = [];
  for (const [family, set] of fontUses(config)) {
    const id = family.toLowerCase().replace(/\s+/g, '-');
    const meta = await (await fetch(`https://api.fontsource.org/v1/fonts/${id}`)).json();
    const variants = [];
    for (const key of [...set].sort()) {
      const [w, style] = key.split('|');
      const weight = Number(w);
      if (!meta.weights.includes(weight) || !meta.styles.includes(style)) continue;
      const fileId = `${id}-${weight}-${style}`;
      files[fileId] = await fetchBytes(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}-${style}.woff2`);
      variants.push({ weight, style, fileId, format: 'woff2', fileName: `${family.replace(/\s+/g, '')}-${weight}-${style}.woff2` });
    }
    families.push({ name: family, variants });
  }
  return { files, families };
}

// ---------------------------------------------------------------------------
// One single-language bundle per locale, with the same code the pens use.

const built = {};
let fonts = null;
for (const locale of LOCALES) {
  const config = createPostextGuideConfig(locale);
  fonts ??= await fontFiles(config);
  const resources = await buildDefaultResources(locale);
  const files = { ...fonts.files };
  for (const [fileId, fig] of Object.entries(SVG_FIGURES)) files[fileId] = fig.generate(locale === 'es');
  const { chapters } = sampleBook(MARKDOWN[locale], () => 'chapter', NAME[locale]);
  const bundle = await createBundle({
    id: 'postext-guide',
    name: NAME[locale],
    description: DESCRIPTION,
    locale,
    chapters: chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
    config: { ...config, customFonts: fonts.families },
    resources,
    files,
    thumbnail: { data: coverThumbnailSvg(), mime: 'image/svg+xml' },
    canvasScope: 'book',
  });
  if (bundle.warnings.length) console.warn(locale, bundle.warnings);
  built[locale] = bundle;
}

// ---------------------------------------------------------------------------
// Merge them into one bilingual bundle: English is the base; Spanish brings
// its chapters, the config keys that differ, and the wording and artwork of
// each resource.

const en = built.en;
const es = built.es;
const files = {};
const chaptersByLocale = {};
for (const locale of LOCALES) {
  chaptersByLocale[locale] = built[locale].manifest.chapters.map((c) => {
    const file = c.file.replace(/^chapters\//, `chapters/${locale}/`);
    files[file] = built[locale].files[c.file];
    return { title: c.title, file };
  });
}
const chapterFiles = new Set([...en.manifest.chapters, ...es.manifest.chapters].map((c) => c.file));
for (const [path, bytes] of Object.entries(en.files)) {
  if (path !== 'preset.json' && !chapterFiles.has(path)) files[path] = bytes;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameBytes = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

const configOverrides = {};
for (const key of new Set([...Object.keys(en.manifest.config ?? {}), ...Object.keys(es.manifest.config ?? {})])) {
  if (!same(en.manifest.config?.[key], es.manifest.config?.[key])) configOverrides[key] = es.manifest.config?.[key];
}

const WORDING = ['caption', 'note', 'altText', 'table'];
const resourceOverrides = [];
for (const spec of es.manifest.resources ?? []) {
  const base = en.manifest.resources.find((r) => r.id === spec.id);
  const override = { id: spec.id };
  for (const key of WORDING) if (spec[key] !== undefined && !same(spec[key], base?.[key])) override[key] = spec[key];
  if (spec.file && !sameBytes(es.files[spec.file], en.files[spec.file])) {
    const file = spec.file.replace(/^resources\//, 'resources/es/');
    files[file] = es.files[spec.file];
    override.file = file;
  }
  if (Object.keys(override).length > 1) resourceOverrides.push(override);
}

const manifest = {
  ...en.manifest,
  name: 'The Postext guide · Guía de Postext',
  locale: 'en',
  locales: LOCALES,
  license: 'MIT',
  credits: 'Postext · fonts: Fraunces, Lora, Geist, Bricolage Grotesque (SIL Open Font License)',
  chapters: chaptersByLocale,
  localized: { es: { config: configOverrides, resources: resourceOverrides } },
};
files['preset.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

const bytes = zipBundle(files);
// Served by the site (a download on the home page) and, through jsDelivr,
// to the pen that opens it.
const out = new URL('../../../apps/web/public/bundles/postext-guide.postext', import.meta.url);
await writeFile(out, bytes);
const fontCount = fonts.families.reduce((n, f) => n + f.variants.length, 0);
console.log(`${out.pathname}: ${(bytes.length / 1024).toFixed(0)} KB · ${Object.keys(files).length} files`
  + ` · ${chaptersByLocale.en.length}+${chaptersByLocale.es.length} chapters · ${fontCount} font files`
  + ` · ${en.manifest.resources.length} resources · ${Object.keys(configOverrides).length} localized config keys`
  + ` · ${resourceOverrides.length} localized resources`);
