// The comparator on its own (#1399): line extraction and matching, and the
// whole run on PDFs from the repository with --docx-pdf (no LibreOffice).
//   node --test scripts/docx-compare/compare.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareLines, findSoffice, findTool, normaliseLine, parseArgs, parseBboxLayout } from './compare.mjs';
import { FIXTURES, parseArgs as fixtureArgs } from './export-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SCRIPT = join(HERE, 'compare.mjs');
const RECIPE = join(ROOT, 'apps/web/public/cookbook/back-of-book-index');
const EN = join(RECIPE, 'en/back-of-book-index.pdf');
const ES = join(RECIPE, 'es/back-of-book-index.pdf');
const poppler = findTool(['pdftoppm']) && findTool(['pdftotext']) && findTool(['pdfinfo']);

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'docx-compare-'));

test('normalises ligatures, soft hyphens, tatweels and spaces', () => {
  assert.equal(normaliseLine('  eﬃcient­  co-​op  كــتاب '), 'efficient co-op كتاب');
});

test('reads lines per page from pdftotext -bbox-layout', () => {
  const html = `<doc><page width="100" height="100"><flow><block>
    <line xMin="10" yMin="20" xMax="50" yMax="30"><word xMin="10" yMin="20" xMax="20" yMax="30">Fish &amp;</word><word xMin="22" yMin="20" xMax="50" yMax="30">chips</word></line>
    </block></flow></page><page width="100" height="100"></page></doc>`;
  const pages = parseBboxLayout(html);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], [{ text: 'Fish & chips', x: 10, y: 20, x2: 50, y2: 30 }]);
  assert.deepEqual(pages[1], []);
});

test('matches lines by text, ignoring spaces, and reports moves and breaks', () => {
  const l = (text, y, x = 0) => ({ text, x, y, x2: 0, y2: 0 });
  const ref = [l('a quick brown', 10), l('fox jumps', 20), l('C H A P T E R', 30), l('same', 40), l('same', 50)];
  const docx = [l('a quick', 11), l('brown fox jumps', 21), l('CHAPTER', 31), l('same', 52), l('same', 41)];
  const r = compareLines(ref, docx);
  assert.equal(r.matched, 3);
  assert.deepEqual(r.missing, ['a quick brown', 'fox jumps']);
  assert.deepEqual(r.extra, ['a quick', 'brown fox jumps']);
  assert.equal(r.maxDy, 2);
});

test('two identical PDFs pass with no difference', { skip: !poppler && 'poppler not installed' }, () => {
  const out = tmp();
  const r = run('book.docx', EN, '--docx-pdf', EN, '--out', out, '--quiet');
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  assert.equal(report.summary.pass, true);
  assert.equal(report.summary.referencePages, report.summary.docxPages);
  assert.equal(report.summary.matchedLines, report.summary.referenceLines);
  assert.ok(report.summary.referenceLines > 100);
  if (report.summary.method === 'imagemagick') assert.equal(report.summary.meanRatio, 0);
});

test('another edition of the same book differs in pixels and lines', { skip: !poppler && 'poppler not installed' }, () => {
  const out = tmp();
  const r = run('book.docx', EN, '--docx-pdf', ES, '--out', out, '--max-lines', '1');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /result: differences found/);
  assert.match(r.stdout, /pdf : "/);
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  assert.ok(report.summary.pagesWithLineDifferences.length > 0);
  if (report.summary.method === 'imagemagick') assert.ok(report.summary.pagesOverThreshold.length > 0);
});

test('without LibreOffice and without --docx-pdf it stops with exit code 3', { skip: findSoffice() ? 'LibreOffice is installed' : false }, () => {
  const dir = tmp();
  const docx = join(dir, 'book.docx');
  writeFileSync(docx, '');
  const r = run(docx, EN, '--out', join(dir, 'out'));
  assert.equal(r.status, 3);
  assert.match(r.stderr, /--docx-pdf/);
});

test('wrong usage exits 2', () => {
  assert.equal(run('only-one.docx').status, 2);
  assert.equal(run('a.docx', 'b.pdf', '--bogus').status, 2);
});

test('runs when started through a symbolic link or from a folder with spaces', () => {
  const dir = join(tmp(), 'a folder ñ');
  mkdirSync(dir);
  const link = join(dir, 'compare.mjs');
  symlinkSync(SCRIPT, link);
  const r = spawnSync(process.execPath, [link, 'only-one.docx'], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'main() did not run');
  assert.match(r.stderr, /usage: compare\.mjs/);
});

test('reads its options and refuses bad numbers and page lists', () => {
  const o = parseArgs(['a.docx', 'b.pdf', '--pages', '1-3,7', '--sheets', 'all', '--dpi', '96']);
  assert.deepEqual([...o.pages], [1, 2, 3, 7]);
  assert.equal(o.sheets, 'all');
  assert.equal(o.dpi, 96);
  assert.throws(() => parseArgs(['a.docx', 'b.pdf', '--dpi', 'x']));
  assert.throws(() => parseArgs(['a.docx', 'b.pdf', '--pages', '2-']));
  assert.throws(() => parseArgs(['a.docx', 'b.pdf', '--out']));
});

test('leaves the other files of the --out folder alone', { skip: !poppler && 'poppler not installed' }, () => {
  const out = tmp();
  for (const d of ['reference', 'docx', 'diff']) {
    mkdirSync(join(out, d));
    writeFileSync(join(out, d, 'keep.txt'), 'mine');
  }
  // A page image a longer earlier run left goes.
  writeFileSync(join(out, 'docx', 'p-999.png'), '');
  const r = run('book.docx', EN, '--docx-pdf', EN, '--out', out, '--quiet');
  assert.equal(r.status, 0, r.stderr);
  for (const d of ['reference', 'docx', 'diff']) assert.equal(readFileSync(join(out, d, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(existsSync(join(out, 'docx', 'p-999.png')), false);
});

test('the fixture exporter refuses a missing value and unknown fixtures', () => {
  assert.equal(fixtureArgs(['--only', 'rtl,guide']).only.size, 2);
  assert.throws(() => fixtureArgs(['--out']), /needs a value/);
  assert.throws(() => fixtureArgs(['--out', '--semantic']), /needs a value/);
  assert.throws(() => fixtureArgs(['--only', 'rlt']), /no fixture rlt/);
  assert.throws(() => fixtureArgs(['--bogus']), /unknown argument/);
  assert.deepEqual(FIXTURES.map((f) => f.name), ['guide', 'two-column', 'column-and-a-half', 'footnotes', 'rtl', 'vertical-cjk']);
});

test('the fixture exporter exits 2 on wrong usage, before building anything', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'export-fixtures.mjs'), '--only', 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: export-fixtures\.mjs/);
});
