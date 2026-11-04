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
import { compareLines, findSoffice, findTool, lineDifferences, markHidden, normaliseLine, parseArgs, parseBboxLayout } from './compare.mjs';
import { FIXTURES, parseArgs as fixtureArgs } from './export-fixtures.mjs';
import { lineKey } from './lines.mjs';
import { hiddenLine, inkRange } from './raster.mjs';

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
  const { words, ...line } = pages[0][0];
  assert.equal(pages[0].length, 1);
  assert.deepEqual(line, { text: 'Fish & chips', x: 10, y: 20, x2: 50, y2: 30, orientation: 'h' });
  assert.equal(words.length, 2);
  assert.deepEqual(pages[1], []);
});

// pdftotext -bbox-layout for one page, from [text, x, y, x2, y2] words per line.
const page = (...lines) =>
  `<doc><page width="600" height="800"><flow><block>${lines
    .map((ws) => {
      const b = [Math.min(...ws.map((w) => w[1])), Math.min(...ws.map((w) => w[2])), Math.max(...ws.map((w) => w[3])), Math.max(...ws.map((w) => w[4]))];
      return `<line xMin="${b[0]}" yMin="${b[1]}" xMax="${b[2]}" yMax="${b[3]}">${ws.map(([t, x, y, x2, y2]) => `<word xMin="${x}" yMin="${y}" xMax="${x2}" yMax="${y2}">${t}</word>`).join('')}</line>`;
    })
    .join('')}</block></flow></page></doc>`;
const texts = (html) => parseBboxLayout(html)[0].map((l) => l.text);

test('the match key drops combining marks in any script, and spaces', () => {
  // The same Arabic word with shadda and fatha extracted in either order.
  assert.equal(lineKey('تَحدّث'), lineKey('تحّدَث'));
  assert.equal(lineKey('crème brûlée'), 'cremebrulee');
});

test('joins runs split on one baseline, and superscript markers into their line', () => {
  // An italic word and the roman quote after it, extracted as two lines.
  assert.deepEqual(texts(page([['galaxy,', 10, 100, 40, 112]], [['”', 40.5, 100, 44, 112]])), ['galaxy,”']);
  // A note marker set small and high, beside the line's last word.
  assert.deepEqual(texts(page([['the', 10, 100, 25, 112], ['line', 27, 100, 45, 112]], [['a', 45.5, 98, 49, 105]])), ['the linea']);
  // Two columns on one baseline stay apart.
  assert.deepEqual(texts(page([['left', 10, 100, 40, 112]], [['right', 60, 100, 90, 112]])), ['left', 'right']);
  // Two long lines set over each other are not one line.
  assert.equal(texts(page([['one long line', 10, 100, 90, 112]], [['two long line', 12, 103, 92, 115]])).length, 2);
});

test('cuts dot leaders out, so an entry and its page number are lines of their own', () => {
  assert.deepEqual(texts(page([['1', 10, 100, 15, 112], ['Why', 18, 100, 40, 112], ['Postext..........', 42, 100, 200, 112], ['6', 202, 100, 207, 112]])), ['1 Why Postext', '6']);
  assert.deepEqual(texts(page([['Index', 10, 100, 40, 112], ['.', 42, 100, 44, 112], ['.', 46, 100, 48, 112], ['.', 50, 100, 52, 112], ['9', 200, 100, 205, 112]])), ['Index', '9']);
});

test('joins glyphs stacked one by one into columns, right to left, and tells the direction', () => {
  // LibreOffice: one word per upright glyph, strung into rows across columns.
  const glyph = (t, x, y) => [t, x, y, x + 10, y + 12];
  const lo = page([glyph('甲', 100, 50), glyph('丁', 80, 50)], [glyph('乙', 100, 60), glyph('戊', 80, 60)], [glyph('丙', 100, 70)]);
  const lines = parseBboxLayout(lo)[0];
  assert.deepEqual(lines.map((l) => l.text), ['甲乙丙', '丁戊']);
  assert.deepEqual(lines.map((l) => l.orientation), ['v', 'v']);
  // The same title set across: a row.
  const across = parseBboxLayout(page([glyph('甲', 50, 50)], [glyph('乙', 65, 50)], [glyph('丙', 80, 50)]))[0];
  assert.deepEqual(across.map((l) => [l.text, l.orientation]), [['甲 乙 丙', 'h']]);
});

test('drops a glyph extracted twice at one spot', () => {
  assert.deepEqual(texts(page([['ة', 10, 100, 10.3, 112], ['ة', 10.8, 100, 11.1, 112], ['لي', 12, 100, 30, 112]])), ['ةلي']);
});

test('takes the page shift as one offset and flags only the lines that stray from it', () => {
  const l = (text, y, h = 12) => ({ text, x: 0, y, x2: 100, y2: y + h, orientation: 'h' });
  const ref = [l('one', 10), l('two', 30), l('three', 50), l('four', 70)];
  const docx = [l('one', 17), l('two', 37), l('three', 57.5), l('four', 82)];
  const r = compareLines(ref, docx);
  assert.equal(r.shiftY, 7.25);
  assert.equal(r.moved[0]?.dy, 12);
  assert.deepEqual(r.moved.map((m) => m.text), ['four']);
  assert.equal(lineDifferences(r), 1);
  // A fixed tolerance in points.
  assert.deepEqual(compareLines(ref, docx, { dyTolerance: { pt: 5 } }).moved, []);
  // A move larger than the line's own height counts whatever the shift.
  const all = compareLines(ref, ref.map((x) => ({ ...x, y: x.y + 30, y2: x.y2 + 30 })));
  assert.equal(all.moved.length, 4);
});

test('counts a line set in the other direction, and matches halves and reordered glyphs', () => {
  const l = (text, x, y, x2, y2, orientation = null) => ({ text, x, y, x2, y2, orientation });
  const turned = compareLines([l('こころ', 0, 0, 20, 60, 'v')], [l('こころ', 0, 0, 60, 20, 'h')]);
  assert.equal(turned.orientation.length, 1);
  assert.equal(turned.matched, 1);
  // The two halves of a verse line, read as one line in the docx.
  const verse = compareLines([l('ab cd', 200, 100, 300, 120), l('ef gh', 50, 100, 150, 120)], [l('ef gh ab cd', 50, 102, 300, 122)]);
  assert.deepEqual([verse.matched, verse.joined, verse.missing.length, verse.extra.length], [2, 1, 0, 0]);
  // The same letters on the same spot in another order.
  const order = compareLines([l('لما', 0, 0, 30, 20)], [l('ملا', 1, 1, 31, 21)]);
  assert.deepEqual([order.matched, order.reordered], [1, 1]);
  // Different letters on the same spot are a different line.
  assert.equal(compareLines([l('abc', 0, 0, 30, 20)], [l('abd', 0, 0, 30, 20)]).missing.length, 1);
});

test('a matched line under a flat fill counts as hidden', () => {
  // Two 20x20 grey images: the reference with a dark stroke, the docx flat.
  const img = (fill, stroke) => {
    const data = Buffer.alloc(400, fill);
    if (stroke !== undefined) for (let x = 2; x < 18; x++) data[10 * 20 + x] = stroke;
    return { w: 20, h: 20, data };
  };
  const ref = img(255, 0);
  const box = { x: 0, y: 5, x2: 20, y2: 15 };
  assert.ok(inkRange(ref, box, 1) >= 200);
  assert.equal(inkRange(img(60), box, 1), 0);
  assert.equal(hiddenLine(ref, img(60), box, box, 1), true);
  assert.equal(hiddenLine(ref, img(255, 30), box, box, 1), false);
  const lines = compareLines([{ text: 'x y', ...box }], [{ text: 'xy', ...box }]);
  markHidden(lines, (r, d) => hiddenLine(ref, img(60), r, d, 1));
  assert.deepEqual([lines.matched, lines.hidden], [0, ['x y']]);
});

test('matches lines by text, ignoring spaces, and reports moves and breaks', () => {
  const l = (text, y, x = 0) => ({ text, x, y, x2: 0, y2: y + 10 });
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
  assert.deepEqual(o.dyTolerance, { em: 0.25 });
  assert.deepEqual(parseArgs(['a.docx', 'b.pdf', '--dy-tolerance', '0.5em']).dyTolerance, { em: 0.5 });
  assert.deepEqual(parseArgs(['a.docx', 'b.pdf', '--dy-tolerance', '3pt']).dyTolerance, { pt: 3 });
  assert.deepEqual(parseArgs(['a.docx', 'b.pdf', '--dy-tolerance', '2']).dyTolerance, { pt: 2 });
  assert.throws(() => parseArgs(['a.docx', 'b.pdf', '--dy-tolerance', 'lots']));
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
