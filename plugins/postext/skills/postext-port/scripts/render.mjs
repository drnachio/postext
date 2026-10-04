#!/usr/bin/env node
// Lay out a Postext project headlessly: real font metrics (fontkit, from the
// bundle's own fonts), engine warnings, parse issues, optional PDF + page PNGs.
//
//   node render.mjs <project | book.postext> [--lang es] [--chapters all|0,2] [--out book.pdf]
//        [--jpeg out-dir --pages 3,7-9 --dpi 100 --quality 85]
//        [--png out-dir --dpi 60 --pages 1-8] [--tools DIR | --repo /path/to/postext]
//
// --jpeg paints the pages straight from the layout with the engine's own
// canvas renderer (`renderPageToCanvas` on @napi-rs/canvas), the painter the
// Sandbox's Canvas tab uses: no PDF, no pdftoppm. Pages are book page numbers
// as printed (`--pages 12` is the page that prints 12; `--pages #3` is the
// third page of the layout). Files: <out-dir>/page-<NNN>.jpg, NNN the
// position in the layout (the log line gives the number each page prints). This is the
// quick look for an agent loop; --png goes through the PDF (the print check).
//
// One-time setup (Node >= 22.15; any folder, default ~/.cache/postext-tools):
//   mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools && \
//   npm init -y >/dev/null && npm i postext postext-pdf postext-citeproc react @pdf-lib/fontkit @napi-rs/canvas
// --repo uses a Postext monorepo checkout's built dists instead (and then also
// runs the sandbox's own warning panel logic).
//
// The browser measures with canvas and loads Google Fonts for families you did
// not bundle; here only bundled faces exist, so bundle every family you use.
// The config is read as the Sandbox reads it: a manifest without
// `configVersion` keeps the postext 1.4 rules it was written for (a NOTE line
// lists them).
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// The published dists use extensionless relative imports (bundler resolution):
// retry them with `.js` / `/index.js`. The sandbox dist also imports JSON.
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
  load(url, context, next) {
    if (!url.endsWith('/package.json') || context.format === 'commonjs' || context.importAttributes?.type) return next(url, context);
    const json = readFileSync(new URL(url), 'utf8');
    const keys = Object.keys(JSON.parse(json)).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
    return { format: 'module', shortCircuit: true, source: `const j = ${json};\nexport default j;\n${keys.map((k) => `export const ${k} = j[${JSON.stringify(k)}];`).join('\n')}` };
  },
});

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith('--')) {
  console.error('usage: node render.mjs <project-dir or book.postext> [--lang es] [--out book.pdf] [--png dir] [--tools DIR | --repo DIR]');
  process.exit(2);
}
let BUNDLE = resolve(args[0]);
const OUT = opt('out', null);
const PNG = opt('png', null);
const JPEG = opt('jpeg', null);
const TOOL_DIRS = [opt('tools', null), process.env.POSTEXT_TOOLS, join(homedir(), '.cache/postext-tools'), process.cwd()].filter(Boolean).map((d) => resolve(d));

// ---- load the engine --------------------------------------------------------
// `bundleApi` is the `postext/bundle` subpath (postext >= 1.3), for
// `migrateConfig` (postext >= 1.5).
const REPO = opt('repo', null);
let postext, pdf, fontkit, computeWarnings = null, bundleApi = null;
if (REPO) {
  const imp = (p) => import(pathToFileURL(join(resolve(REPO), p)).href);
  postext = await imp('packages/postext/dist/index.js');
  pdf = await imp('packages/postext-pdf/dist/index.js');
  const req = createRequire(join(resolve(REPO), 'packages/postext-pdf/package.json'));
  fontkit = (await import(pathToFileURL(req.resolve('@pdf-lib/fontkit')).href)).default;
  try { ({ computeWarnings } = await imp('packages/postext-sandbox/dist/warnings/compute.js')); } catch { /* not built */ }
  try { bundleApi = await imp('packages/postext/dist/bundle/index.js'); } catch { /* older checkout */ }
  // Citations (postext >= 1.12): the CSL engine, when built.
  try { await imp('packages/postext-citeproc/dist/register.js'); } catch { /* not built */ }
} else {
  const dir = TOOL_DIRS.find((d) => existsSync(join(d, 'node_modules/postext/package.json')));
  if (!dir) {
    console.error('postext is not installed. Run:\n  mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools && npm init -y >/dev/null && npm i postext postext-pdf postext-citeproc react @pdf-lib/fontkit @napi-rs/canvas');
    process.exit(2);
  }
  const req = createRequire(join(dir, 'package.json'));
  const entry = (name, sub) => pathToFileURL(join(dirname(req.resolve(`${name}/package.json`)), sub)).href;
  postext = await import(entry('postext', 'dist/index.js'));
  pdf = await import(entry('postext-pdf', 'dist/index.js'));
  fontkit = (await import(pathToFileURL(req.resolve('@pdf-lib/fontkit')).href)).default;
  try { bundleApi = await import(entry('postext', 'dist/bundle/index.js')); } catch { /* older release */ }
  // Citations (postext >= 1.12): `npm i postext-citeproc` to format them.
  try { await import(entry('postext-citeproc', 'dist/register.js')); } catch { /* not installed */ }
}

// A packed `.postext` file: unzip it with the engine's own bundle reader
// (`openBundleZip`, in postext releases that ship the bundle API) into a
// scratch folder and render that.
if (statSync(BUNDLE).isFile()) {
  if (typeof postext.openBundleZip !== 'function') {
    console.error('Reading a .postext file needs a postext release with the bundle API (openBundleZip): update it, or pass the unzipped project folder.');
    process.exit(2);
  }
  const { files } = postext.openBundleZip(new Uint8Array(readFileSync(BUNDLE)));
  const dir = mkdtempSync(join(tmpdir(), 'postext-render-'));
  for (const [path, data] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), data);
  }
  BUNDLE = dir;
}
const manifest = JSON.parse(readFileSync(join(BUNDLE, 'preset.json'), 'utf8'));
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };

// ---- locale (mirrors the sandbox loader) ------------------------------------
const lang = opt('lang', manifest.locale ?? 'en');
function pickKey(keys) {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  return lower.get(lang.toLowerCase()) ?? lower.get(lang.toLowerCase().split(/[-_]/)[0])
    ?? (manifest.locale && lower.get(manifest.locale.toLowerCase())) ?? keys[0];
}
const chapterSpecs = manifest.version === 1
  ? [{ title: '', file: typeof manifest.markdown === 'string' ? manifest.markdown : manifest.markdown[pickKey(Object.keys(manifest.markdown))] }]
  : Array.isArray(manifest.chapters) ? manifest.chapters : manifest.chapters[pickKey(Object.keys(manifest.chapters))];
const locKey = manifest.localized ? Object.keys(manifest.localized).find((k) => k.toLowerCase().split(/[-_]/)[0] === lang.toLowerCase().split(/[-_]/)[0]) : undefined;
const overrides = locKey ? manifest.localized[locKey] : {};

// ---- structure --------------------------------------------------------------
need(manifest.version === 1 || manifest.version === 2, 'version must be 1 or 2');
need(typeof manifest.id === 'string' && manifest.id, 'id required');
need(typeof manifest.name === 'string' && manifest.name, 'name required');
for (const c of chapterSpecs) need(existsSync(join(BUNDLE, c.file)), `missing chapter file ${c.file}`);
const ids = new Set();
for (const r of manifest.resources ?? []) {
  need(r.id && r.typeId, `resource without id/typeId: ${JSON.stringify(r).slice(0, 80)}`);
  need(!ids.has(r.id), `duplicate resource id ${r.id}`); ids.add(r.id);
  if (r.file) need(existsSync(join(BUNDLE, r.file)), `missing resource file ${r.file}`);
  if (r.pdfFile) need(existsSync(join(BUNDLE, r.pdfFile)), `missing print master ${r.pdfFile}`);
  if (r.kind === 'bitmap') need(r.width && r.height, `bitmap ${r.id}: declare width/height`);
  if (r.kind === 'table') need(Array.isArray(r.table?.model?.rows), `table ${r.id}: table.model.rows missing`);
}
const cfgTypes = overrides.config?.resourceTypes ?? manifest.config?.resourceTypes;
const typeIds = new Set((cfgTypes ?? [{ id: 'figure' }, { id: 'table' }]).map((t) => t.id));
for (const r of manifest.resources ?? []) if (r.typeId) need(typeIds.has(r.typeId), `resource ${r.id}: typeId "${r.typeId}" not in resourceTypes`);
for (const f of manifest.fonts ?? []) for (const v of f.variants) need(existsSync(join(BUNDLE, v.file)), `missing font ${v.file}`);
if (problems.some((p) => p.startsWith('missing'))) { for (const p of problems) console.log('PROBLEM', p); process.exit(1); }

// ---- fonts: measure with the bundle's own faces ------------------------------
const faces = new Map();
async function loadFace(file) {
  let e = faces.get(file);
  if (!e) {
    let bytes = new Uint8Array(readFileSync(join(BUNDLE, file)));
    if (file.endsWith('.woff2')) bytes = await pdf.decompressWoff2(bytes);
    e = { bytes, face: fontkit.create(Buffer.from(bytes)) };
    faces.set(file, e);
  }
  return e;
}
const families = new Map((manifest.fonts ?? []).map((f) => [f.name, f.variants]));
function pickVariant(family, weight, style) {
  const vs = families.get(family) ?? families.values().next().value ?? [];
  const pool = vs.filter((v) => (v.style ?? 'normal') === style);
  const list = pool.length ? pool : vs;
  return list.reduce((b, v) => (Math.abs(v.weight - weight) < Math.abs(b.weight - weight) ? v : b), list[0]);
}
for (const vs of families.values()) for (const v of vs) await loadFace(v.file);
const unknownFamilies = new Set();
class Ctx {
  font = '';
  measureText(s) {
    const m = /^(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(this.font.trim());
    if (!m) return { width: s.length * 7 };
    const family = m[4].replace(/["']/g, '').split(',')[0].trim();
    if (!families.has(family)) unknownFamilies.add(family);
    const v = pickVariant(family, m[2] === 'bold' ? 700 : m[2] ? Number(m[2]) : 400, m[1] ? 'italic' : 'normal');
    if (!v) return { width: s.length * Number(m[3]) * 0.5 };
    const { face } = faces.get(v.file);
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * Number(m[3]) };
  }
}
globalThis.OffscreenCanvas = class { getContext() { return new Ctx(); } };

// ---- resources (mirrors the sandbox loader) ----------------------------------
const wording = new Map((overrides.resources ?? []).map((r) => [r.id, r]));
function svgSize(text) {
  const head = text.slice(0, 4000);
  const num = (a) => { const m = new RegExp(`\\s${a}="([\\d.]+)`).exec(head); return m ? Number(m[1]) : undefined; };
  let w = num('width'), h = num('height');
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(head);
  if ((!w || !h) && vb) { w = Number(vb[1]); h = Number(vb[2]); }
  return w && h ? { width: w, height: h } : {};
}
const blobs = new Map();
const resources = (manifest.resources ?? []).map((spec) => {
  const s = { ...spec, ...(wording.get(spec.id) ?? {}) };
  const { file, pdfFile, width, height, source, ...rest } = s;
  const base = { ...rest, createdAt: 0, updatedAt: 0 };
  if (!file) return base;
  const bytes = new Uint8Array(readFileSync(join(BUNDLE, file)));
  blobs.set(file, bytes);
  if (file.toLowerCase().endsWith('.svg')) {
    const size = width && height ? { width, height } : svgSize(new TextDecoder().decode(bytes));
    const master = pdfFile ? (blobs.set(pdfFile, new Uint8Array(readFileSync(join(BUNDLE, pdfFile)))), { pdfFileId: pdfFile }) : {};
    return { ...base, kind: 'svg', svg: { fileId: file, ...size, ...master } };
  }
  const ext = file.split('.').pop().toLowerCase();
  return { ...base, kind: 'bitmap', bitmap: { fileId: file, format: ext === 'jpg' ? 'jpeg' : ext, width: width ?? 0, height: height ?? 0 } };
});

// ---- config: defaults <- config <- localized config -----------------------------
let config = { colorPalette: postext.cloneDefaultColorPalette(), resourceTypes: postext.defaultResourceTypes(lang), ...(manifest.config ?? {}), ...(overrides.config ?? {}) };
// Read like the Sandbox reads a bundle (`readBundle`): a manifest written for
// older config rules than this engine's (no `configVersion`: postext 1.4 or
// earlier) keeps the rules it was laid out with: heading breaks, formula
// size, space around inline resources, plain headings, drop-cap sizes, the
// room under a colon line, box cuts, breaks at dashes and at compounds'
// hyphens, ragged breaking, the split under a heading and the space under
// paragraph containers. `migrateConfig` looks at every chapter of this
// language, as the Sandbox loads them all.
if (typeof bundleApi?.migrateConfig === 'function') {
  const content = chapterSpecs.map((c) => readFileSync(join(BUNDLE, c.file), 'utf8'));
  const read = bundleApi.migrateConfig(config, manifest.configVersion, { content });
  // Each pin writes its own fields; a NOTE names the ones that changed.
  const breaksOf = (c) => JSON.stringify([
    (Array.isArray(c.headings?.levels) ? c.headings.levels : []).map((l) => [l?.level, l?.breakBefore]),
    (Array.isArray(c.headingStyles) ? c.headingStyles : []).map((s) => s?.breakBefore),
  ]);
  const dropCapSizes = (value) => {
    let n = 0;
    const walk = (x) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        if (x.kind === 'text' && x.dropCap?.fontSize !== undefined) n++;
        Object.values(x).forEach(walk);
      }
    };
    walk(value);
    return n;
  };
  const kept = [
    [breaksOf, 'heading breaks'],
    [(c) => JSON.stringify(c.math), 'formula size'],
    [(c) => `${c.layout?.inlineResourceGap}|${c.layout?.inlineResourceGapInBoxes}`, 'space around inline resources'],
    [(c) => c.headings?.inlineMarks, 'plain headings'],
    [dropCapSizes, 'drop-cap sizes'],
    [(c) => c.bodyText?.colonListRoom, 'room under a colon line'],
    [(c) => c.layout?.boxChildSplitMinLines, 'box cuts'],
    [(c) => c.bodyText?.breakAfterDashes, 'breaks at dashes'],
    [(c) => c.bodyText?.breakAfterHyphens, "breaks at compounds' hyphens"],
    [(c) => c.bodyText?.optimalRagged, 'line-by-line ragged text'],
    [(c) => c.headings?.keepWithNextSplit, 'split under a heading'],
    [(c) => c.bodyText?.paragraphContainerSpacing, 'space under paragraph containers'],
  ].filter(([of]) => of(read) !== of(config)).map(([, what]) => what);
  if (kept.length) {
    const v = manifest.configVersion;
    const stamp = v === undefined
      ? 'no "configVersion"'
      : typeof v !== 'number' || !Number.isFinite(v)
        ? `"configVersion": ${JSON.stringify(v)}, which is not a number and counts as none`
        : `"configVersion": ${v}, older than this engine's ${bundleApi.CONFIG_VERSION}`;
    const list = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0];
    console.log(`NOTE preset.json has ${stamp}: read as the Sandbox reads it, with the ${list} postext 1.4 used. Set "configVersion": ${bundleApi.CONFIG_VERSION} once the config is written for today's rules.`);
  }
  config = read;
}
const customFonts = [...families.entries()].map(([name, vs]) => ({ name, variants: vs.map((v) => ({ weight: v.weight, style: v.style ?? 'normal', fileId: v.file, format: v.file.split('.').pop() })) }));
if (customFonts.length) config.customFonts = customFonts;

// ---- compose the book like the sandbox (blank join, later front matter blanked)
const which = opt('chapters', 'all');
const picked = which === 'all' ? chapterSpecs : which.split(',').map((i) => chapterSpecs[Number(i)]);
const texts = picked.map((c, i) => {
  const md = readFileSync(join(BUNDLE, c.file), 'utf8');
  if (i === 0) return md;
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, (m) => m.replace(/[^\n]/g, ' '));
});
const markdown = texts.join('\n\n');
// map a source offset back to "chapter file:line"
const starts = []; { let off = 0; texts.forEach((t, i) => { starts.push(off); off += t.length + 2; }); }
function where(offset) {
  if (offset == null) return '';
  let i = starts.length - 1; while (i > 0 && starts[i] > offset) i--;
  const line = texts[i].slice(0, offset - starts[i]).split('\n').length;
  return `${picked[i].file}:${line}`;
}

if (/\$[^$\n]+\$|\$\$/.test(markdown) && postext.initMathEngine) await postext.initMathEngine();

const t0 = Date.now();
const doc = postext.buildDocument({ markdown, resources }, config);
console.log(`layout: ${doc.pages.length} pages, converged=${doc.converged}, passes=${doc.iterationCount}, ${Date.now() - t0} ms (${lang}, ${picked.length} chapter file(s))`);

// ---- diagnostics ----------------------------------------------------------------
for (const issue of postext.parseMarkdownWithIssues(markdown).issues ?? []) {
  console.log(`PARSE ${issue.kind} ${where(issue.sourceStart)}: ${JSON.stringify(markdown.slice(issue.sourceStart, Math.min(issue.sourceEnd ?? issue.sourceStart, issue.sourceStart + 60)))}`);
}
// Releases with engine content warnings list unknown ids in doc.contentWarnings.
if (!postext.collectContentWarnings) {
  for (const m of markdown.matchAll(/(?:::resource|:ref)\{[^}]*id="([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`unknown resource id ${m[1]} at ${where(m.index)}`);
}
// doc.warnings: boxes the layout had to force; doc.contentWarnings: what the
// source names wrongly.
const engineWarnings = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? [])];
for (const w of engineWarnings) {
  const snippet = w.sourceStart == null ? '' : JSON.stringify(markdown.slice(w.sourceStart, Math.min(w.sourceEnd ?? w.sourceStart, w.sourceStart + 60)));
  if (w.kind === 'calloutOverflow') {
    console.log(`WARN ${w.kind} page ${w.pageIndex + 1} col ${w.columnIndex} overflow ${w.overflowPx?.toFixed?.(1)}px at ${where(w.sourceStart)}: ${snippet}`);
  } else {
    // Unknown resource ids, directives, embeds and style ids, irregular table grids.
    const text = postext.formatWarning ? postext.formatWarning(w) : JSON.stringify(w);
    console.log(`WARN ${w.kind} at ${where(w.sourceStart)}: ${text}${snippet ? ` ${snippet}` : ''}`);
  }
}
// doc.configWarnings: settings the engine could not honour as written (an
// unknown numbering format, a character grid larger than the page).
for (const w of doc.configWarnings ?? []) {
  console.log(`CONFIG ${w.kind}: ${postext.formatWarning ? postext.formatWarning(w) : JSON.stringify(w)}`);
}
if (computeWarnings) {
  const IGNORE = new Set(['missingFont', 'missingFontFamily', 'storageUnavailable', opt('show-loose') ? '' : 'looseLine']);
  // The kinds the engine reported above are listed once.
  const reported = new Set(engineWarnings.map((w) => w.kind));
  for (const w of computeWarnings({ markdown, config, doc, resources })) {
    if (IGNORE.has(w.payload.kind) || reported.has(w.payload.kind)) continue;
    console.log(`SANDBOX-WARN ${JSON.stringify(w.payload)} ${where(w.sourceStart)}`);
  }
}
if (unknownFamilies.size) problems.push(`font families used but not bundled (measured with a stand-in face; the browser would try Google Fonts): ${[...unknownFamilies].join(', ')}`);
for (const p of problems) console.log('PROBLEM', p);

// ---- page JPEGs, painted by the engine's canvas renderer -------------------------
// Which pages: book page numbers as printed ("3,7-9"), or "#n" for the n-th
// page of the layout. Default: every page.
function pickPages(spec) {
  const all = doc.pages.map((_, i) => i);
  if (!spec) return all;
  const printed = (p, i) => p.pageNumberValue ?? (doc.pageIndexOffset ?? 0) + i + 1;
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const byIndex = part.startsWith('#');
    const [a, b] = part.replace('#', '').split('-').map(Number);
    for (const [i, p] of doc.pages.entries()) {
      const n = byIndex ? i + 1 : printed(p, i);
      if (n >= a && n <= (b || a)) out.add(i);
    }
  }
  return [...out].sort((x, y) => x - y);
}
if (JPEG) {
  let napi = null;
  for (const d of [REPO, ...TOOL_DIRS].filter(Boolean)) {
    try { napi = await import(pathToFileURL(createRequire(join(resolve(d), 'package.json')).resolve('@napi-rs/canvas')).href); break; } catch { /* next */ }
  }
  napi = napi?.default ?? napi;
  if (!napi?.createCanvas) {
    console.error('--jpeg needs @napi-rs/canvas next to postext:\n  cd ~/.cache/postext-tools && npm i @napi-rs/canvas');
    process.exit(2);
  }
  // Layout is done: from here on the engine's scratch canvases (rasterised
  // SVGs, maths) are real ones.
  globalThis.OffscreenCanvas = class { constructor(w, h) { return napi.createCanvas(Math.max(1, w), Math.max(1, h)); } };
  globalThis.Path2D ??= napi.Path2D;
  globalThis.DOMMatrix ??= napi.DOMMatrix;
  // Every bundled face under its family name (Skia picks weight and style
  // from the file itself, as the browser does from @font-face).
  for (const vs of families.values()) for (const v of vs) {
    const { bytes } = await loadFace(v.file);
    napi.GlobalFonts.register(Buffer.from(bytes), [...families.entries()].find(([, x]) => x === vs)[0]);
  }
  for (const r of resources) {
    const fileId = r.svg?.fileId ?? r.bitmap?.fileId;
    if (!fileId || !blobs.has(fileId)) continue;
    try {
      postext.registerResourceImage(fileId, await napi.loadImage(Buffer.from(blobs.get(fileId))), { vector: !!r.svg });
    } catch (e) { console.log(`JPEG-WARN image ${fileId} does not decode: ${e.message}`); }
  }
  mkdirSync(JPEG, { recursive: true });
  const dpi = Number(opt('dpi', '100'));
  const scale = dpi / (doc.config.page.dpi || 300);
  const quality = Number(opt('quality', '85'));
  const wanted = pickPages(opt('pages', null));
  for (const i of wanted) {
    const page = doc.pages[i];
    const canvas = napi.createCanvas(1, 1);
    postext.renderPageToCanvas(page, doc, canvas, {
      scale,
      onWarning: (w) => console.log(`JPEG-WARN page ${i + 1} ${w.kind} ${w.fileId ?? ''}`),
    });
    // Named by position in the layout (printed numbers can repeat: roman
    // front matter, a restart); the log gives the number the page prints.
    const file = join(JPEG, `page-${String(i + 1).padStart(3, '0')}.jpg`);
    writeFileSync(file, await canvas.encode('jpeg', quality));
    console.log(`wrote ${file} (#${i + 1}, prints ${page.pageLabel ?? page.pageNumberValue}, ${canvas.width}×${canvas.height})`);
  }
  if (!wanted.length) console.log(`JPEG: no page matches --pages ${opt('pages', '')}`);
}

// ---- PDF and page images --------------------------------------------------------------
if (OUT || PNG) {
  const pdfPath = OUT ?? join(PNG, 'render.pdf');
  mkdirSync(dirname(resolve(pdfPath)), { recursive: true });
  const bytes = await pdf.renderToPdf(doc, {
    fontProvider: async (family, weight, style) => {
      const v = pickVariant(family, weight, style);
      if (!v) throw new Error(`no font for ${family}`);
      return (await loadFace(v.file)).bytes;
    },
    resourceBytes: (fileId) => blobs.get(fileId),
    // missingGlyph (characters no file of a face has), variableFontDefaultInstance, cffEmbeddedWhole.
    onWarning: (w) => console.log(`PDF-WARN ${w.kind}: ${w.message ?? JSON.stringify(w)}`),
    // SVGs outside the PDF vector subset: rasterise with ImageMagick when present.
    rasterizeSvg: async (svgText, w, h) => {
      try {
        return new Uint8Array(execFileSync('magick', ['-background', 'none', 'svg:-', '-resize', `${Math.round(w)}x${Math.round(h)}!`, 'png:-'], { input: svgText, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'ignore'] }));
      } catch { return null; }
    },
  });
  writeFileSync(pdfPath, bytes);
  console.log(`wrote ${pdfPath} (${(bytes.length / 1024).toFixed(0)} KB)`);
  if (PNG) {
    mkdirSync(PNG, { recursive: true });
    const pages = opt('pages', null);
    const range = pages ? ['-f', pages.split('-')[0], '-l', pages.split('-')[1] ?? pages.split('-')[0]] : [];
    try {
      execFileSync('pdftoppm', ['-r', opt('dpi', '60'), '-png', ...range, pdfPath, join(PNG, 'page')], { stdio: ['ignore', 'ignore', 'ignore'] });
      console.log(`page images in ${PNG}/page-*.png`);
    } catch { console.log('pdftoppm not found (brew install poppler): page images skipped'); }
  }
}
process.exit(problems.length ? 1 : 0);
