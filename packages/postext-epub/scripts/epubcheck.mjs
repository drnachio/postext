#!/usr/bin/env node
// Lay out a Postext book headlessly, write it as an EPUB and run W3C
// EPUBCheck on it.
//
//   node scripts/epubcheck.mjs <book.postext | preset-dir> [--lang es] [--layout fixed|reflowable|both]
//        [--out dir] [--chapters 0,2] [--name base] [--report result.json] [--no-cover]
//
// The bundle's thumbnail, when it has one, is the cover picture (both
// renditions then open on a cover document); --no-cover leaves it out.
// --report writes what `scripts/validate.mjs` tabulates: pages, file size,
// the EPUB writer's own warnings and EPUBCheck's messages by severity,
// usage notes included (`epubcheck -u`).
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
// Citations (`[@key]`, a bibliography) are formatted by the CSL engine when it is built.
try { await imp('packages/postext-citeproc/dist/register.js'); } catch { /* not built */ }

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

// ---- text audit -----------------------------------------------------------------
// The letters and digits of the laid-out text (lines, captions, notes,
// table cells) against those of the reflowable book's chapters, case aside
// (the style sheet sets capitals the layout spelled out): a lost or
// repeated paragraph, note or caption shows as a difference. Repeated table
// headers, page numbers the contents and the index drop, list markers and
// text the reflowable book adds (back links' labels) differ by design.
function vdtLetters(docs) {
  const counts = new Map();
  const add = (s) => { for (const ch of s.normalize('NFC').toLowerCase()) if (/[\p{L}\p{N}]/u.test(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1); };
  // A segment's text as written: without the tatweels kashida
  // justification inserted (VDTLineSegment.kashida), which the reflowable
  // book leaves out.
  const written = (s) => (s.kashida?.length ? s.text.split('').filter((_, i) => !s.kashida.includes(i)).join('') : s.text);
  const lineText = (l) => (l.segments ? l.segments.filter((s) => s.kind !== 'math').map(written).join('') : l.text);
  const walkRes = (x) => {
    if (Array.isArray(x)) return x.forEach(walkRes);
    if (!x || typeof x !== 'object') return;
    if (typeof x.text === 'string' && x.bbox && typeof x.baseline === 'number') return add(lineText(x));
    for (const [k, v] of Object.entries(x)) if (k !== 'resource') walkRes(v);
  };
  for (const d of docs) for (const p of d.pages) {
    const blocks = [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? []), ...(p.marginNotes ?? [])];
    for (const b of blocks) {
      for (const l of b.lines) add(lineText(l));
      if (b.bulletText) add(b.bulletText);
      if (b.resourceBlock) walkRes({ c: b.resourceBlock.captionLines, n: b.resourceBlock.noteLines, t: b.resourceBlock.table });
    }
  }
  return counts;
}
function xhtmlLetters(files, spine) {
  const counts = new Map();
  for (const s of spine) {
    if (/nav\.xhtml$|cover\.xhtml$/.test(s.path)) continue;
    let x = new TextDecoder().decode(files.get(s.path));
    x = x.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
    for (const ch of x.normalize('NFC').toLowerCase()) if (/[\p{L}\p{N}]/u.test(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return counts;
}
function diffLetters(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const k of keys) { const d = (b.get(k) ?? 0) - (a.get(k) ?? 0); if (d) out.push([k, d]); }
  return out.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
}

// ---- write and check ----------------------------------------------------------
const meta = docs[0]?.metadata ?? {};
const metadata = {
  title: String(meta.title || bundle.name),
  ...(meta.subtitle ? { subtitle: String(meta.subtitle) } : {}),
  creators: meta.author ? [String(meta.author)] : [],
  // The book's language is the one its configuration names: a Cookbook
  // bundle's locale is the reader's language of the recipe page, and the
  // vertical Chinese novel of an English page is still in Chinese.
  language: postext.canonicalLocaleTag(docs[0]?.config.locale) ?? bundle.locale,
  ...(meta.publishDate ? { date: String(meta.publishDate) } : {}),
  modified: new Date(Date.UTC(2026, 0, 1)),
};
const fonts = bundle.fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, bytes: new Uint8Array(f.bytes), format: f.format === 'otf' ? 'otf' : f.format }));
const resourceBytes = (fileId) => {
  const data = bundle.files.get(fileId);
  return data ? { bytes: data, mediaType: '' } : undefined;
};
const coverTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };
const coverType = bundle.thumbnail ? coverTypes[bundle.thumbnail.split('.').pop().toLowerCase()] : undefined;
const cover = coverType && !args.includes('--no-cover') ? { bytes: bundle.files.get(bundle.thumbnail), mediaType: coverType } : undefined;
const outDir = resolve(opt('out', '.'));
mkdirSync(outDir, { recursive: true });
const layouts = opt('layout', 'fixed') === 'both' ? ['fixed', 'reflowable'] : [opt('layout', 'fixed')];
const hasEpubcheck = spawnSync('epubcheck', ['--version'], { encoding: 'utf8' }).status === 0;
let failed = false;
const report = { source: relative(REPO, source), locale: metadata.language, chapters: docs.length, pages: pageCount, cover: !!cover, results: [] };
for (const layout of layouts) {
  const warnings = [];
  const t1 = Date.now();
  const out = await epub.renderToEpub(docs, { layout, metadata, fonts, resourceBytes, ...(cover ? { cover } : {}), onWarning: (w) => warnings.push(w) });
  const file = join(outDir, `${opt('name', basename(source).replace(/\.postext$/, ''))}-${metadata.language}-${layout}.epub`);
  writeFileSync(file, out);
  console.log(`wrote ${file} (${(out.length / 1024).toFixed(0)} KB, ${Date.now() - t1} ms)`);
  for (const w of warnings) console.log(`  EPUB-WARN ${JSON.stringify(w)}`);
  const result = { layout, file, bytes: out.length, warnings };
  if (layout === 'reflowable') {
    const book = epub.readEpub(out);
    const diff = diffLetters(vdtLetters(docs), xhtmlLetters(book.files, book.spine));
    result.textDiff = { missing: diff.filter(([, d]) => d < 0).reduce((n, [, d]) => n - d, 0), extra: diff.filter(([, d]) => d > 0).reduce((n, [, d]) => n + d, 0), top: diff.slice(0, 12) };
    if (process.env.AUDIT_DUMP) {
      const text = book.spine.filter((x) => !/nav\.xhtml$|cover\.xhtml$/.test(x.path)).map((x) => new TextDecoder().decode(book.files.get(x.path)).replace(/<head>[\s\S]*?<\/head>/, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<\/?(?:p|h\d|li|figcaption|td|th|div|section|aside|br|caption|tr|nav|figure|ul|ol|blockquote)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '')).join('\n');
      const lt = (l) => (l.segments ? l.segments.filter((x) => x.kind !== 'math').map((x) => x.text).join('') : l.text);
      const lines = [];
      const walkRes = (x) => {
        if (Array.isArray(x)) return x.forEach(walkRes);
        if (!x || typeof x !== 'object') return;
        if (typeof x.text === 'string' && x.bbox && typeof x.baseline === 'number') return void lines.push(lt(x) + (x.hyphenated ? '\u2010' : ''));
        for (const [k, v] of Object.entries(x)) if (k !== 'resource') walkRes(v);
      };
      for (const d of docs) for (const p of d.pages) for (const b of [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? []), ...(p.marginNotes ?? [])]) {
        lines.push(`[${b.type}]`);
        walkRes(b.lines);
        if (b.resourceBlock) walkRes({ c: b.resourceBlock.captionLines, n: b.resourceBlock.noteLines, t: b.resourceBlock.table });
      }
      writeFileSync(process.env.AUDIT_DUMP + '.epub.txt', text);
      writeFileSync(process.env.AUDIT_DUMP + '.vdt.txt', lines.join('\n'));
    }
    console.log(`  text: ${result.textDiff.missing} letter(s) missing, ${result.textDiff.extra} extra ${JSON.stringify(result.textDiff.top)}`);
  }
  report.results.push(result);
  if (!hasEpubcheck) continue;
  const run = spawnSync('epubcheck', ['--json', '-', '-u', '--locale', 'en', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const checked = JSON.parse(run.stdout);
  const bad = checked.messages.filter((m) => ['FATAL', 'ERROR', 'WARNING'].includes(m.severity));
  const count = (sev) => checked.messages.filter((m) => m.severity === sev).reduce((n, m) => n + (m.locations?.length || 1), 0);
  Object.assign(result, {
    errors: count('FATAL') + count('ERROR'),
    epubcheckWarnings: count('WARNING'),
    usage: checked.messages.filter((m) => m.severity === 'USAGE').map((m) => ({ id: m.ID, message: m.message, count: m.locations?.length || 1 })),
    messages: bad.map((m) => ({ severity: m.severity, id: m.ID, message: m.message, at: m.locations?.slice(0, 5).map((l) => `${l.path}:${l.line}:${l.column}`) })),
  });
  for (const m of bad.slice(0, 40)) {
    const at = m.locations?.[0];
    console.log(`  ${m.severity} ${m.ID} ${at ? `${at.path}:${at.line}:${at.column}` : ''} ${m.message}`);
  }
  if (bad.length > 40) console.log(`  … ${bad.length - 40} more`);
  const usage = result.usage.reduce((n, u) => n + u.count, 0);
  console.log(`  EPUBCheck: ${result.errors} error(s), ${result.epubcheckWarnings} warning(s)${usage ? `, ${usage} usage note(s) (${result.usage.map((u) => u.id).join(', ')})` : ''}`);
  if (bad.length) failed = true;
}
if (opt('report')) writeFileSync(resolve(opt('report')), JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
