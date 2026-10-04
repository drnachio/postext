#!/usr/bin/env node
// Validate postext-epub on real books: lay out each book of the matrix
// below headlessly from this checkout's dists, write it as a fixed-layout
// and as a reflowable EPUB, run W3C EPUBCheck on both and print the table
// (book × layout → errors, warnings, usage notes, size).
//
//   node scripts/validate.mjs [--out dir] [--only don-quijote,arabic] [--jobs 3] [--full]
//
// Each book runs `scripts/epubcheck.mjs` in its own process (a long book
// takes a few GB). The books: the built-in guide, the public showcase
// presets, vertical and horizontal Chinese, a right-to-left Arabic sample
// (written here, set in the Amiri subset of postext-pdf's shaping tests)
// and Cookbook bundles with footnotes, an index, citations, maths and
// cross-references. `--full` lays out the whole of Hong Lou Meng (2030
// pages) instead of its first chapters. Exits 1 when any book has an
// EPUBCheck error or warning, or fails to lay out.
//
// Needs the dists built (`npx tsc` in packages/postext, postext-pdf,
// postext-citeproc and postext-epub) and `epubcheck` on the PATH.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT = resolve(opt('out', join(tmpdir(), 'postext-epub-validate')));
const JOBS = Number(opt('jobs', '3'));
const FULL = args.includes('--full');
mkdirSync(OUT, { recursive: true });

const preset = (id) => join(REPO, 'apps/web/public/presets', id);
const recipe = (slug, lang) => join(REPO, 'apps/web/public/cookbook', slug, lang, `${slug}.postext`);
const GUIDE = join(REPO, 'apps/web/public/bundles/postext-guide.postext');

/** name, source, and the options of epubcheck.mjs. */
const MATRIX = [
  { name: 'guide-en', source: GUIDE, lang: 'en' },
  { name: 'guide-es', source: GUIDE, lang: 'es' },
  { name: 'don-quijote', source: preset('don-quijote'), lang: 'es' },
  { name: 'don-quijote-en', source: preset('don-quijote'), lang: 'en' },
  { name: 'deep-sky', source: preset('deep-sky') },
  { name: 'openstax-fisica', source: preset('openstax-fisica') },
  { name: 'pintura-espanola', source: preset('pintura-espanola') },
  { name: 'senales', source: preset('senales') },
  { name: 'paradise-lost', source: preset('paradise-lost') },
  { name: 'bioquimica-feduchi', source: preset('bioquimica-feduchi') },
  { name: 'hongloumeng', source: preset('hongloumeng'), ...(FULL ? {} : { chapters: '0,1,2,3,4' }) },
  { name: 'vertical-novel-right-bound', source: recipe('vertical-novel-right-bound', 'en') },
  { name: 'vertical-jiazhu-citations', source: recipe('vertical-book-with-jiazhu-citations', 'en') },
  { name: 'zhuyin-vertical-reader', source: recipe('zhuyin-vertical-reader', 'en') },
  { name: 'chinese-novel-horizontal', source: recipe('chinese-novel-horizontal', 'en') },
  { name: 'chinese-name-index', source: recipe('chinese-name-index', 'en') },
  { name: 'gbt7714-chinese-paper', source: recipe('gbt7714-chinese-paper', 'en') },
  { name: 'arabic', source: arabicSample(join(OUT, 'fixtures/arabic')) },
  { name: 'novel-footnotes', source: recipe('novel-footnotes-column-foot', 'es') },
  { name: 'endnotes', source: recipe('endnotes-instead-of-footnotes', 'en') },
  { name: 'back-of-book-index', source: recipe('back-of-book-index', 'en') },
  { name: 'names-subjects-indexes', source: recipe('names-and-subjects-indexes', 'es') },
  { name: 'apa-thesis-bibtex', source: recipe('apa-thesis-with-bibtex', 'en') },
  { name: 'four-citation-styles', source: recipe('one-text-four-citation-styles', 'es') },
  { name: 'history-chicago-notes', source: recipe('history-essay-chicago-notes', 'en') },
  { name: 'technical-crossref', source: recipe('technical-book-crossref-chapters', 'en') },
  { name: 'journal-maths', source: recipe('journal-article-with-maths', 'en') },
  { name: 'catalan-novella', source: recipe('catalan-pocket-novella', 'es') },
  { name: 'textbook-box-family', source: recipe('textbook-box-family', 'es') },
  { name: 'magazine-contents', source: recipe('magazine-cover-and-contents', 'en') },
];

/** A two-chapter Arabic book, right to left and right-bound, written as a
 *  preset folder: headings, justified paragraphs (kashida), a footnote, a
 *  list, a quotation, mixed Latin text and Arabic-Indic page numbers. Its
 *  words use only the letters of the Amiri subset in postext-pdf's test
 *  fixtures. */
function arabicSample(dir) {
  const fonts = join(REPO, 'packages/postext-pdf/src/__tests__/fixtures/arabic');
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  mkdirSync(join(dir, 'chapters'), { recursive: true });
  copyFileSync(join(fonts, 'amiri-subset.ttf'), join(dir, 'fonts/Amiri-Regular.ttf'));
  copyFileSync(join(fonts, 'amiri-bold-subset.ttf'), join(dir, 'fonts/Amiri-Bold.ttf'));
  const say = [
    'كان الملك الحكيم يحب الكتاب والعلم، وكان يتعلم كل ليلة من معلم كريم.',
    'السلام عليكم ورحمة الله وبركاته، قال المعلم للملك حين كان القمر بين الليل والنهار.',
    'تعلم العربية مع المعلم كل سنة، كلمة من قبل كلمة، ورسالة من قبل رسالة.',
    'كتـــاب الملك عام 2024 م سنة ١٤٤٥ هـ، وهو كتاب Latin كبير (قوس) كما قال.',
  ];
  const para = (i, n = 3) => Array.from({ length: n }, (_, k) => say[(i + k) % say.length]).join(' ');
  const one = [
    '---', 'title: حكاية الملك الحكيم', 'author: علي حسن', '---', '',
    '# حكاية الملك الحكيم', '',
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '',
    ...Array.from({ length: 6 }, (_, i) => [para(i, 4), '']).flat(),
    `${para(1)} كان المعلم كريما.[^1]`, '',
    '## ليلة القمر', '',
    '- كتاب', '- قلم', '- رسالة', '',
    '> «لا إله إلا الله» قال الملك، وكان القمر نورا.', '',
    ...Array.from({ length: 8 }, (_, i) => [para(i + 2, 5), '']).flat(),
    '[^1]: كان المعلم حكيما، وكان يحب الكتاب والقلم.', '',
  ].join('\n');
  const two = [
    '# رحلة البحر', '',
    ...Array.from({ length: 10 }, (_, i) => [para(i + 1, 5), '']).flat(),
    '1. كلمة', '2. سنة', '3. عام', '',
    ...Array.from({ length: 4 }, (_, i) => [para(i, 3), '']).flat(),
  ].join('\n');
  writeFileSync(join(dir, 'chapters/01.md'), one);
  writeFileSync(join(dir, 'chapters/02.md'), two);
  const pt = (value) => ({ value, unit: 'pt' });
  const mm = (value) => ({ value, unit: 'mm' });
  writeFileSync(join(dir, 'preset.json'), JSON.stringify({
    version: 2,
    id: 'arabic-sample',
    name: 'حكاية الملك الحكيم',
    locale: 'ar',
    configVersion: 8,
    chapters: [{ title: 'حكاية الملك الحكيم', file: 'chapters/01.md' }, { title: 'رحلة البحر', file: 'chapters/02.md' }],
    config: {
      locale: 'ar',
      page: { sizePreset: 'custom', width: mm(148), height: mm(210), margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(16), mirror: true } },
      layout: { layoutType: 'single' },
      bodyText: { fontFamily: 'Amiri', fontSize: pt(13), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: mm(5), hyphenation: { enabled: false } },
      headings: { fontFamily: 'Amiri' },
    },
    fonts: [{ name: 'Amiri', variants: [{ weight: 400, style: 'normal', file: 'fonts/Amiri-Regular.ttf' }, { weight: 700, style: 'normal', file: 'fonts/Amiri-Bold.ttf' }] }],
  }, null, 2));
  return dir;
}

// ---- run ------------------------------------------------------------------
const only = opt('only', null)?.split(',');
const books = MATRIX.filter((b) => !only || only.includes(b.name)).filter((b) => {
  if (existsSync(b.source)) return true;
  console.log(`skip ${b.name}: ${b.source} is missing`);
  return false;
});

function run(book) {
  const report = join(OUT, `${book.name}.json`);
  const argv = [join(HERE, 'epubcheck.mjs'), book.source, '--layout', 'both', '--out', OUT, '--name', book.name, '--report', report,
    ...(book.lang ? ['--lang', book.lang] : []), ...(book.chapters ? ['--chapters', book.chapters] : [])];
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ['--max-old-space-size=12288', ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    child.on('close', (code) => {
      writeFileSync(join(OUT, `${book.name}.log`), log);
      let result;
      try { result = JSON.parse(readFileSync(report, 'utf8')); } catch { /* crashed */ }
      console.log(`${book.name}: ${result ? 'done' : `FAILED (exit ${code}), see ${book.name}.log`} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      done({ book, result, code, log });
    });
  });
}

const queue = [...books];
const results = [];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) results.push(await run(queue.shift()));
}));
results.sort((a, b) => books.indexOf(a.book) - books.indexOf(b.book));

// ---- table ------------------------------------------------------------------
const rows = [['Book', 'Lang', 'Pages', 'Cover', 'Layout', 'Errors', 'Warnings', 'Usage notes', 'Writer warnings', 'Text audit', 'Size']];
let failed = false;
for (const { book, result, log } of results) {
  if (!result) {
    failed = true;
    rows.push([book.name, '', '', '', '', 'layout failed', '', '', '', '', log.trim().split('\n').at(-1)?.slice(0, 80) ?? '']);
    continue;
  }
  for (const r of result.results) {
    if (r.errors || r.epubcheckWarnings || r.errors === undefined) failed = true;
    const byId = {};
    for (const u of r.usage ?? []) byId[u.id] = (byId[u.id] ?? 0) + u.count;
    const usage = Object.entries(byId).map(([id, n]) => `${id}×${n}`).join(' ') || '0';
    const kinds = {};
    for (const w of r.warnings) kinds[w.kind] = (kinds[w.kind] ?? 0) + 1;
    const writer = Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(' ') || '0';
    // Letters and digits of the laid-out text the reflowable book lost (−)
    // or added (+).
    const text = r.textDiff ? `−${r.textDiff.missing} +${r.textDiff.extra}` : '';
    rows.push([book.name, result.locale, String(result.pages), result.cover ? 'yes' : 'no', r.layout, String(r.errors ?? '?'), String(r.epubcheckWarnings ?? '?'), usage, writer, text, `${(r.bytes / 1024 / 1024).toFixed(2)} MB`]);
  }
}
const table = [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map((r) => `| ${r.join(' | ')} |`).join('\n');
console.log(`\n${table}`);
writeFileSync(join(OUT, 'matrix.md'), `${table}\n`);
console.log(`\nfiles, logs and reports in ${OUT}`);
process.exit(failed ? 1 : 0);
