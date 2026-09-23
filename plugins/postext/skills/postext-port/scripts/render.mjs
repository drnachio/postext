#!/usr/bin/env node
// Lay out a Postext project headlessly: real font metrics (fontkit, from the
// bundle's own fonts), engine warnings, parse issues, optional PDF + page PNGs.
//
//   node render.mjs <project> [--lang es] [--chapters all|0,2] [--out book.pdf]
//        [--png out-dir --dpi 60 --pages 1-8] [--tools DIR | --repo /path/to/postext]
//
// One-time setup (Node >= 22.15; any folder, default ~/.cache/postext-tools):
//   mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools && \
//   npm init -y >/dev/null && npm i postext postext-pdf react @pdf-lib/fontkit
// --repo uses a Postext monorepo checkout's built dists instead (and then also
// runs the sandbox's own warning panel logic).
//
// The browser measures with canvas and loads Google Fonts for families you did
// not bundle; here only bundled faces exist, so bundle every family you use.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { homedir } from 'node:os';
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
  console.error('usage: node render.mjs <project> [--lang es] [--out book.pdf] [--png dir] [--tools DIR | --repo DIR]');
  process.exit(2);
}
const BUNDLE = resolve(args[0]);
const OUT = opt('out', null);
const PNG = opt('png', null);

// ---- load the engine --------------------------------------------------------
const REPO = opt('repo', null);
let postext, pdf, fontkit, computeWarnings = null;
if (REPO) {
  const imp = (p) => import(pathToFileURL(join(resolve(REPO), p)).href);
  postext = await imp('packages/postext/dist/index.js');
  pdf = await imp('packages/postext-pdf/dist/index.js');
  const req = createRequire(join(resolve(REPO), 'packages/postext-pdf/package.json'));
  fontkit = (await import(pathToFileURL(req.resolve('@pdf-lib/fontkit')).href)).default;
  try { ({ computeWarnings } = await imp('packages/postext-sandbox/dist/warnings/compute.js')); } catch { /* not built */ }
} else {
  const candidates = [opt('tools', null), process.env.POSTEXT_TOOLS, join(homedir(), '.cache/postext-tools'), process.cwd()].filter(Boolean);
  const dir = candidates.find((d) => existsSync(join(d, 'node_modules/postext/package.json')));
  if (!dir) {
    console.error('postext is not installed. Run:\n  mkdir -p ~/.cache/postext-tools && cd ~/.cache/postext-tools && npm init -y >/dev/null && npm i postext postext-pdf react @pdf-lib/fontkit');
    process.exit(2);
  }
  const req = createRequire(join(dir, 'package.json'));
  const entry = (name, sub) => pathToFileURL(join(dirname(req.resolve(`${name}/package.json`)), sub)).href;
  postext = await import(entry('postext', 'dist/index.js'));
  pdf = await import(entry('postext-pdf', 'dist/index.js'));
  fontkit = (await import(pathToFileURL(req.resolve('@pdf-lib/fontkit')).href)).default;
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
const config = { colorPalette: postext.cloneDefaultColorPalette(), resourceTypes: postext.defaultResourceTypes(lang), ...(manifest.config ?? {}), ...(overrides.config ?? {}) };
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
for (const m of markdown.matchAll(/(?:::resource|:ref)\{[^}]*id="([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`unknown resource id ${m[1]} at ${where(m.index)}`);
for (const w of doc.warnings ?? []) {
  console.log(`WARN ${w.kind} page ${w.pageIndex + 1} col ${w.columnIndex} overflow ${w.overflowPx?.toFixed?.(1)}px at ${where(w.sourceStart)}: ${JSON.stringify(markdown.slice(w.sourceStart, Math.min(w.sourceEnd ?? w.sourceStart, (w.sourceStart ?? 0) + 60)))}`);
}
if (computeWarnings) {
  const IGNORE = new Set(['missingFont', 'missingFontFamily', 'storageUnavailable', opt('show-loose') ? '' : 'looseLine']);
  for (const w of computeWarnings({ markdown, config, doc, resources })) {
    if (IGNORE.has(w.payload.kind)) continue;
    console.log(`SANDBOX-WARN ${JSON.stringify(w.payload)} ${where(w.sourceStart)}`);
  }
}
if (unknownFamilies.size) problems.push(`font families used but not bundled (measured with a stand-in face; the browser would try Google Fonts): ${[...unknownFamilies].join(', ')}`);
for (const p of problems) console.log('PROBLEM', p);

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
