#!/usr/bin/env node
// Lay out a Postext book headlessly, write it as an EPUB and run W3C
// EPUBCheck on it.
//
//   node scripts/epubcheck.mjs <book.postext | preset-dir> [--lang es] [--layout fixed|reflowable|both]
//        [--out dir] [--chapters 0,2]
//
// Uses this checkout's built dists (packages/postext, postext-pdf for the
// WOFF2 decoder and fontkit, postext-epub): run `npx tsc` in postext-epub
// first. Text is measured with the bundle's own faces through fontkit, as
// the Sandbox measures it with canvas. Exits 1 when EPUBCheck reports an
// error or a warning. Without `epubcheck` on the PATH it only writes the
// files.
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';

// The dists use extensionless relative imports (bundler resolution).
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

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith('--')) {
  console.error('usage: node scripts/epubcheck.mjs <book.postext | preset-dir> [--lang es] [--layout fixed|reflowable|both] [--out dir] [--chapters 0,2]');
  process.exit(2);
}
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const postext = await imp('packages/postext/dist/index.js');
const pdf = await imp('packages/postext-pdf/dist/index.js');
const epub = await imp('packages/postext-epub/dist/index.js');
const fontkit = (await import(pathToFileURL(createRequire(join(REPO, 'packages/postext-pdf/package.json')).resolve('@pdf-lib/fontkit')).href)).default;
const { zipSync } = await import(pathToFileURL(createRequire(join(REPO, 'packages/postext-epub/package.json')).resolve('fflate')).href);

// ---- open the book: a .postext file, or a preset directory zipped in memory
const source = resolve(args[0]);
function zipDir(dir) {
  const files = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue;
      const p = join(d, name);
      const real = realpathSync(p);
      if (statSync(real).isDirectory()) walk(p);
      else files[relative(dir, p).split('\\').join('/')] = new Uint8Array(readFileSync(real));
    }
  };
  walk(dir);
  return zipSync(files, { level: 0 });
}
const bytes = statSync(source).isDirectory() ? zipDir(source) : new Uint8Array(readFileSync(source));
const lang = opt('lang', undefined);
const bundle = await postext.openBundle(bytes, lang ? { locale: lang } : {});
const which = opt('chapters', 'all');
const chapters = which === 'all' ? bundle.chapters : which.split(',').map((i) => bundle.chapters[Number(i)]);

// ---- measure with the bundle's faces ------------------------------------------
const faces = [];
for (const f of bundle.fonts) {
  let data = new Uint8Array(f.bytes);
  if (f.format === 'woff2') data = await pdf.decompressWoff2(data);
  faces.push({ ...f, face: fontkit.create(Buffer.from(data)) });
}
function pickFace(family, weight, style) {
  const all = faces.filter((f) => f.family.toLowerCase() === family.toLowerCase());
  const pool = all.filter((f) => f.style === style);
  const list = pool.length ? pool : all;
  return list.reduce((b, f) => (b && Math.abs(b.weight - weight) <= Math.abs(f.weight - weight) ? b : f), undefined);
}
class Ctx {
  font = '';
  letterSpacing = '0px';
  measureText(s) {
    const m = /^(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(this.font.trim());
    const size = m ? Number(m[3]) : 16;
    const families = m ? m[4].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')) : [];
    const weight = m?.[2] === 'bold' ? 700 : m?.[2] && m[2] !== 'normal' ? Number(m[2]) : 400;
    const f = families.map((fam) => pickFace(fam, weight, m?.[1] ? 'italic' : 'normal')).find(Boolean) ?? faces[0];
    const width = f ? (f.face.layout(s).advanceWidth / f.face.unitsPerEm) * size : s.length * size * 0.5;
    return { width, actualBoundingBoxAscent: size * 0.7, actualBoundingBoxDescent: size * 0.2, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 };
  }
}
globalThis.OffscreenCanvas = class { getContext() { return new Ctx(); } };

if (chapters.some((c) => /\$[^$\n]+\$|\$\$/.test(c.markdown)) && postext.initMathEngine) await postext.initMathEngine();

const t0 = Date.now();
const docs = postext.buildBundle({ chapters, config: bundle.config, resources: bundle.resources });
const pageCount = docs.reduce((n, d) => n + d.pages.length, 0);
console.log(`${basename(source)} (${bundle.locale}): ${docs.length} chapter(s), ${pageCount} pages laid out in ${Date.now() - t0} ms`);

// ---- write and check ----------------------------------------------------------
const meta = docs[0]?.metadata ?? {};
const metadata = {
  title: String(meta.title || bundle.name),
  ...(meta.subtitle ? { subtitle: String(meta.subtitle) } : {}),
  creators: meta.author ? [String(meta.author)] : [],
  language: bundle.locale,
  ...(meta.publishDate ? { date: String(meta.publishDate) } : {}),
  modified: new Date(Date.UTC(2026, 0, 1)),
};
const fonts = bundle.fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, bytes: new Uint8Array(f.bytes), format: f.format === 'otf' ? 'otf' : f.format }));
const resourceBytes = (fileId) => {
  const data = bundle.files.get(fileId);
  return data ? { bytes: data, mediaType: '' } : undefined;
};
const outDir = resolve(opt('out', '.'));
mkdirSync(outDir, { recursive: true });
const layouts = opt('layout', 'fixed') === 'both' ? ['fixed', 'reflowable'] : [opt('layout', 'fixed')];
const hasEpubcheck = spawnSync('epubcheck', ['--version'], { encoding: 'utf8' }).status === 0;
let failed = false;
for (const layout of layouts) {
  const warnings = [];
  const t1 = Date.now();
  const out = await epub.renderToEpub(docs, { layout, metadata, fonts, resourceBytes, onWarning: (w) => warnings.push(w) });
  const file = join(outDir, `${basename(source).replace(/\.postext$/, '')}-${bundle.locale}-${layout}.epub`);
  writeFileSync(file, out);
  console.log(`wrote ${file} (${(out.length / 1024).toFixed(0)} KB, ${Date.now() - t1} ms)`);
  for (const w of warnings) console.log(`  EPUB-WARN ${JSON.stringify(w)}`);
  if (!hasEpubcheck) continue;
  const run = spawnSync('epubcheck', ['--json', '-', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const report = JSON.parse(run.stdout);
  const bad = report.messages.filter((m) => ['FATAL', 'ERROR', 'WARNING'].includes(m.severity));
  for (const m of bad.slice(0, 40)) {
    const at = m.locations?.[0];
    console.log(`  ${m.severity} ${m.ID} ${at ? `${at.path}:${at.line}:${at.column}` : ''} ${m.message}`);
  }
  if (bad.length > 40) console.log(`  … ${bad.length - 40} more`);
  console.log(`  EPUBCheck: ${bad.filter((m) => m.severity !== 'WARNING').length} error(s), ${bad.filter((m) => m.severity === 'WARNING').length} warning(s)`);
  if (bad.length) failed = true;
}
process.exit(failed ? 1 : 0);
