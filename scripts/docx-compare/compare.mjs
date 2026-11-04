#!/usr/bin/env node
// Fidelity check of a formatted Word export (#1399): the .docx converted to
// PDF by LibreOffice headless, both PDFs rasterised by pdftoppm and compared
// page by page (share of differing pixels, through ImageMagick), and the
// text of every page compared line by line (pdftotext -bbox-layout,
// regrouped by lines.mjs), so a line Word or LibreOffice broke differently
// from the engine shows up with its text, and a line the extractor reads
// under an opaque shape counts as hidden (raster.mjs). Writes report.json
// and report.txt into the output folder and prints the text report.
//
//   node scripts/docx-compare/compare.mjs book.docx book.pdf [--out DIR]
//        [--docx-pdf FILE] [--dpi 72] [--fuzz 10%] [--threshold 0.02]
//        [--pages 1-5,9] [--sheets | --sheets all] [--max-lines 5]
//        [--dy-tolerance 0.25em | --dy-tolerance 2pt]
//
// Exit codes: 0 every page within the thresholds · 1 differences found ·
// 2 wrong usage or a tool failed · 3 LibreOffice not found (pass the
// converted PDF with --docx-pdf instead).

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineKey, parseBboxLayout } from './lines.mjs';
import { hiddenLine, loadGrey } from './raster.mjs';

export { normaliseLine, parseBboxLayout } from './lines.mjs';

const USAGE = `usage: compare.mjs <file.docx> <reference.pdf> [--out DIR] [--docx-pdf FILE] [--dpi N]
       [--fuzz PCT] [--threshold RATIO] [--pages LIST] [--sheets [all]] [--max-lines N]
       [--dy-tolerance Nem|Npt] [--quiet]`;

// ---------------------------------------------------------------- options

export function parseArgs(argv) {
  const opts = { dpi: 72, fuzz: '10%', threshold: 0.02, maxLines: 5, sheets: false, quiet: false, pages: null, out: null, docxPdf: null, dyTolerance: { em: 0.25 } };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === '--out' || a === '-o') opts.out = value();
    else if (a === '--docx-pdf') opts.docxPdf = value();
    else if (a === '--dpi') opts.dpi = Number(value());
    else if (a === '--fuzz') opts.fuzz = value();
    else if (a === '--threshold') opts.threshold = Number(value());
    else if (a === '--pages') opts.pages = parsePages(value());
    else if (a === '--max-lines') opts.maxLines = Number(value());
    else if (a === '--dy-tolerance') opts.dyTolerance = parseTolerance(value());
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--sheets') opts.sheets = argv[i + 1] === 'all' ? (i++, 'all') : 'diff';
    else if (a === '--help' || a === '-h') throw new UsageError(null);
    else if (a.startsWith('-')) throw new UsageError(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length !== 2) throw new UsageError('give the .docx and the reference .pdf');
  if (!(opts.dpi > 0) || !(opts.threshold >= 0) || !(opts.maxLines >= 0)) throw new UsageError('--dpi, --threshold and --max-lines take positive numbers');
  [opts.docx, opts.pdf] = pos;
  return opts;
}

class UsageError extends Error {}
class ToolError extends Error {}

/** `0.25em` (of the line's height) or `2pt` / `2` (points). */
function parseTolerance(v) {
  const m = /^(\d+(?:\.\d+)?|\.\d+)\s*(em|pt)?$/.exec(v.trim());
  if (!m) throw new UsageError(`bad --dy-tolerance "${v}" (give 0.25em or 2pt)`);
  return m[2] === 'em' ? { em: Number(m[1]) } : { pt: Number(m[1]) };
}

function parsePages(list) {
  const set = new Set();
  for (const part of list.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new UsageError(`bad page list "${list}"`);
    for (let p = Number(m[1]); p <= Number(m[2] ?? m[1]); p++) set.add(p);
  }
  return set;
}

// ---------------------------------------------------------------- tools

/** An executable on PATH, or the first of `extra` that exists. */
export function findTool(names, extra = []) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const n of names) {
      const p = join(dir, n);
      try {
        accessSync(p, constants.X_OK);
        return p;
      } catch {
        // next
      }
    }
  }
  return extra.find((p) => existsSync(p)) ?? null;
}

export const findSoffice = () => findTool(['soffice', 'libreoffice'], [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/lib/libreoffice/program/soffice',
  '/opt/libreoffice/program/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
]);

function run(cmd, args, { allow = [0] } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw new ToolError(`${basename(cmd)} could not run: ${r.error.message}`);
  if (!allow.includes(r.status)) throw new ToolError(`${basename(cmd)} ${args.join(' ')} failed (${r.status}): ${(r.stderr || r.stdout).trim().slice(0, 500)}`);
  return r;
}

/** ImageMagick 7 (`magick compare`) or 6 (`compare`), or null. */
function imageMagick() {
  const magick = findTool(['magick']);
  if (magick) return { compare: [magick, 'compare'], montage: [magick, 'montage'], identify: [magick, 'identify'], convert: [magick] };
  const compare = findTool(['compare']);
  if (!compare) return null;
  const montage = findTool(['montage']);
  return { compare: [compare], montage: montage ? [montage] : null, identify: [findTool(['identify']) ?? 'identify'], convert: [findTool(['convert']) ?? 'convert'] };
}

const tool = (t, args, o) => run(t[0], [...t.slice(1), ...args], o);

/** Whether the module at `url` is the script node was started with. Both
 *  sides as real file URLs: node resolves symbolic links in
 *  import.meta.url (/tmp → /private/tmp on macOS) and percent-encodes
 *  spaces and accents, so comparing with the raw argv path misses both. */
export function isMain(url) {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return url === pathToFileURL(realpathSync(script)).href;
  } catch {
    return false;
  }
}

/** Empty `dir` of the page images a previous run left (`p-<n>.png` and
 *  their padded copies) and nothing else: --out may name a folder that
 *  holds other files. */
function clearPages(dir) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^p-\d+(\.fit)?\.png$/.test(f)) rmSync(join(dir, f), { force: true });
}

// ---------------------------------------------------------------- steps

function convertDocx(docx, out) {
  const soffice = findSoffice();
  if (!soffice) return null;
  const dir = join(out, 'libreoffice');
  mkdirSync(dir, { recursive: true });
  // A profile of its own, so a LibreOffice already open does not take the
  // job; as a file URL (spaces, accents, Windows drive letters).
  const profile = pathToFileURL(resolve(out, 'lo-profile')).href;
  // LibreOffice names the PDF after the file without its extension; a PDF
  // a previous run left there must not pass for this conversion (soffice
  // exits 0 when it cannot read the file).
  const pdf = join(dir, basename(docx, extname(docx)) + '.pdf');
  rmSync(pdf, { force: true });
  run(soffice, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, docx]);
  if (!existsSync(pdf)) throw new ToolError(`LibreOffice wrote no PDF for ${docx}`);
  return pdf;
}

function pageCount(pdf) {
  const r = run(findTool(['pdfinfo']) ?? 'pdfinfo', [pdf]);
  return Number(/^Pages:\s+(\d+)/m.exec(r.stdout)?.[1] ?? 0);
}

/** PNG per page, `<dir>/p-<n>.png`, keyed by page number. */
function rasterise(pdf, dir, dpi) {
  clearPages(dir);
  run(findTool(['pdftoppm']) ?? 'pdftoppm', ['-r', String(dpi), '-png', pdf, join(dir, 'p')]);
  const pages = new Map();
  for (const f of readdirSync(dir)) {
    const m = /^p-(\d+)\.png$/.exec(f);
    if (m) pages.set(Number(m[1]), join(dir, f));
  }
  return pages;
}

function size(im, png) {
  const [w, h] = tool(im.identify, ['-format', '%w %h', png]).stdout.trim().split(/\s+/).map(Number);
  return { w, h };
}

/** Share of pixels that differ beyond the fuzz, with a diff image. A page
 *  of another size is padded (white) or cropped to the reference's size
 *  first. */
function pixelDiff(im, ref, other, diffPng, fuzz, dpi) {
  const a = size(im, ref);
  const b = size(im, other);
  let input = other;
  if (a.w !== b.w || a.h !== b.h) {
    input = diffPng.replace(/\.png$/, '.fit.png');
    tool(im.convert, [other, '-background', 'white', '-gravity', 'northwest', '-extent', `${a.w}x${a.h}`, input]);
  }
  const r = tool(im.compare, ['-metric', 'AE', '-fuzz', fuzz, ref, input, diffPng], { allow: [0, 1] });
  const output = (r.stderr || r.stdout).trim();
  const ae = Number(/^[\d.]+(?:e[+-]?\d+)?/i.exec(output)?.[0] ?? NaN);
  if (!Number.isFinite(ae)) throw new ToolError(`could not read the pixel count ImageMagick gave for ${basename(other)}: ${output.slice(0, 200)}`);
  // A docx page a point or two bigger (LibreOffice rounds the page size
  // up) is cropped to the reference and not reported.
  const slack = Math.ceil((2 * dpi) / 72) + 1;
  const minor = b.w >= a.w && b.h >= a.h && b.w - a.w <= slack && b.h - a.h <= slack;
  return { ratio: ae / (a.w * a.h), pixels: ae, sizeMismatch: (a.w !== b.w || a.h !== b.h) && !minor ? { reference: a, docx: b } : undefined };
}

// ---------------------------------------------------------------- text

function pdfLines(pdf) {
  return parseBboxLayout(run(findTool(['pdftotext']) ?? 'pdftotext', ['-bbox-layout', '-enc', 'UTF-8', pdf, '-']).stdout);
}

const sortedKey = (l) => [...lineKey(l.text)].sort().join('');
const overlaps = (a, b) => Math.min(a.x2, b.x2) > Math.max(a.x, b.x) && Math.min(a.y2, b.y2) > Math.max(a.y, b.y);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** The pieces of `one` among `lines`: two or more lines on its baseline,
 *  over its box, whose characters together are the characters of `one`
 *  (pieces of a verse line come out in either order, and the extractors
 *  reorder Arabic letters around a lam-alef); or null. */
function halves(one, lines) {
  const same = (a, b) => Math.min(a.y2, b.y2) - Math.max(a.y, b.y) >= 0.5 * Math.min(a.y2 - a.y, b.y2 - b.y);
  const pieces = lines.filter((l) => overlaps(l, one) && same(l, one));
  if (pieces.length < 2) return null;
  const key = sortedKey(one);
  if ([...pieces.map((l) => lineKey(l.text)).join('')].sort().join('') === key) return pieces;
  for (const a of pieces) {
    for (const b of pieces) {
      if (b !== a && [...(lineKey(a.text) + lineKey(b.text))].sort().join('') === key) return [a, b];
    }
  }
  return null;
}

/** The vertical move a line may make in points: `dyTolerance` em of its
 *  height ({ em }, never under 1.5 pt: a pixel at 72 dpi and rounding) or
 *  a fixed { pt }. */
const tolerance = (l, t) => t.pt ?? Math.max(1.5, t.em * (l.y2 - l.y));

/**
 * Lines of one page matched by key (lines.mjs: no spaces, no combining
 * marks), each docx line used once, the nearest one when a key repeats.
 * A line whose key matches no line is tried once more against the docx
 * lines left over on the same spot with the same characters in another
 * order (glyphs a display font draws out of reading order); those count
 * as `reordered`. A reference line with no match broke elsewhere, or its
 * text changed. Matched lines report how far they moved; the page's
 * median vertical shift is taken as one offset (LibreOffice sets the
 * baseline of an exact-height line at 80 % of it, Word does not), and a
 * line counts as `moved` when it strays from that shift by more than
 * `dyTolerance`, or moves more than its own height. A line set across in
 * one PDF and down in the other counts under `orientation`.
 */
export function compareLines(ref, docx, { dyTolerance = { em: 0.25 } } = {}) {
  const free = new Map();
  docx.forEach((l, i) => {
    const k = lineKey(l.text);
    const list = free.get(k) ?? [];
    list.push(i);
    free.set(k, list);
  });
  const used = new Set();
  const pairs = [];
  const unmatched = [];
  for (const l of ref) {
    const list = free.get(lineKey(l.text));
    if (!list?.length) {
      unmatched.push(l);
      continue;
    }
    let best = 0;
    for (let k = 1; k < list.length; k++) {
      if (Math.hypot(docx[list[k]].x - l.x, docx[list[k]].y - l.y) < Math.hypot(docx[list[best]].x - l.x, docx[list[best]].y - l.y)) best = k;
    }
    const j = list.splice(best, 1)[0];
    used.add(j);
    pairs.push({ ref: l, docx: docx[j] });
  }
  let missing = [];
  let reordered = 0;
  for (const l of unmatched) {
    const key = sortedKey(l);
    const j = docx.findIndex((d, i) => !used.has(i) && overlaps(l, d) && sortedKey(d) === key);
    if (j < 0) {
      missing.push(l);
      continue;
    }
    used.add(j);
    pairs.push({ ref: l, docx: docx[j] });
    reordered++;
  }
  // Lines on one baseline in one PDF that the other's extractor reads as
  // one (the halves of a verse line, a heading and its number).
  let joined = 0;
  const left = docx.map((d, i) => (used.has(i) ? null : d)).filter(Boolean);
  for (const [ones, twos, refIsOne] of [[left, missing, false], [missing, left, true]]) {
    for (const one of [...ones]) {
      const two = halves(one, twos);
      if (!two) continue;
      // The halves' left edge against the whole line's: the second half
      // of a split line has not moved across.
      const dx = refIsOne ? Math.min(...two.map((h) => h.x)) - one.x : one.x - Math.min(...two.map((h) => h.x));
      for (const h of two) {
        twos.splice(twos.indexOf(h), 1);
        pairs.push(refIsOne ? { ref: one, docx: h, joined: true, dx } : { ref: h, docx: one, joined: true, dx });
      }
      ones.splice(ones.indexOf(one), 1);
      joined++;
    }
  }
  docx.forEach((d, i) => {
    if (!left.includes(d)) used.add(i);
  });
  missing = missing.filter((l) => !pairs.some((p) => p.ref === l));
  for (const p of pairs) {
    p.dx ??= p.docx.x - p.ref.x;
    // Box centres: a line joined from pieces (display faces, markers) may
    // reach higher or lower in one PDF than in the other.
    p.dy = (p.docx.y + p.docx.y2 - p.ref.y - p.ref.y2) / 2;
  }
  const shift = median(pairs.map((p) => p.dy));
  const moved = pairs.filter((p) => Math.abs(p.dy - shift) > tolerance(p.ref, dyTolerance) || Math.abs(p.dy) > p.ref.y2 - p.ref.y);
  const orientation = pairs.filter((p) => !p.joined && p.ref.orientation && p.docx.orientation && p.ref.orientation !== p.docx.orientation);
  const extra = docx.filter((_, i) => !used.has(i));
  const abs = (k) => pairs.map((m) => Math.abs(m[k]));
  const result = {
    referenceLines: ref.length,
    docxLines: docx.length,
    matched: new Set(pairs.map((p) => p.ref)).size,
    reordered,
    joined,
    hidden: [],
    missing: missing.map((l) => l.text),
    extra: extra.map((l) => l.text),
    moved: moved.map((p) => ({ text: p.ref.text, dy: round(p.dy) })),
    orientation: orientation.map((p) => ({ text: p.ref.text, reference: p.ref.orientation, docx: p.docx.orientation })),
    shiftY: round(shift),
    maxDx: round(Math.max(0, ...abs('dx'))),
    maxDy: round(Math.max(0, ...abs('dy'))),
    meanDy: round(pairs.length ? abs('dy').reduce((a, b) => a + b, 0) / pairs.length : 0),
  };
  Object.defineProperty(result, 'pairs', { value: pairs, enumerable: false });
  return result;
}

/** Matched lines whose text the docx page does not show (hiddenLine)
 *  leave `matched` for `hidden`. */
export function markHidden(lines, isHidden) {
  // Per reference line: one of the halves a line was matched to hidden
  // hides the line, once.
  const hidden = [...new Set(lines.pairs.filter((p) => isHidden(p.ref, p.docx)).map((p) => p.ref))];
  lines.hidden = hidden.map((r) => r.text);
  lines.matched -= hidden.length;
  return lines;
}

/** Whether a page's lines differ in a way that fails it. */
export const lineDifferences = (l) => l.missing.length + l.extra.length + l.hidden.length + l.moved.length + l.orientation.length;

const round = (n, k = 2) => Math.round(n * 10 ** k) / 10 ** k;

// ---------------------------------------------------------------- report

export async function compare(opts) {
  const out = resolve(opts.out ?? join(tmpdir(), 'postext-docx-compare', basename(opts.docx).replace(/\.docx$/i, '')));
  if (!existsSync(opts.pdf)) throw new UsageError(`no file ${opts.pdf}`);
  let docxPdf = opts.docxPdf;
  if (docxPdf) {
    if (!existsSync(docxPdf)) throw new UsageError(`no file ${docxPdf}`);
  } else {
    if (!existsSync(opts.docx)) throw new UsageError(`no file ${opts.docx}`);
    if (!findSoffice()) return { exit: 3 };
  }
  mkdirSync(out, { recursive: true });
  if (!docxPdf) docxPdf = convertDocx(opts.docx, out);
  const refPages = pageCount(opts.pdf);
  const docxPages = pageCount(docxPdf);
  const im = imageMagick();
  const method = im ? 'imagemagick' : 'text-only';
  const refPng = im ? rasterise(opts.pdf, join(out, 'reference'), opts.dpi) : new Map();
  const docxPng = im ? rasterise(docxPdf, join(out, 'docx'), opts.dpi) : new Map();
  if (im) clearPages(join(out, 'diff'));
  if (opts.sheets) clearPages(join(out, 'sheets'));
  const refText = pdfLines(opts.pdf);
  const docxText = pdfLines(docxPdf);

  const pages = [];
  for (let p = 1; p <= Math.max(refPages, docxPages); p++) {
    if (opts.pages && !opts.pages.has(p)) continue;
    const page = { page: p };
    if (p > refPages || p > docxPages) {
      page.missingIn = p > refPages ? 'reference' : 'docx';
      pages.push(page);
      continue;
    }
    if (im && refPng.has(p) && docxPng.has(p)) {
      const diffPng = join(out, 'diff', `p-${String(p).padStart(3, '0')}.png`);
      Object.assign(page, pixelDiff(im, refPng.get(p), docxPng.get(p), diffPng, opts.fuzz, opts.dpi));
      page.ratio = round(page.ratio, 5);
      page.diffImage = diffPng;
    }
    page.lines = compareLines(refText[p - 1] ?? [], docxText[p - 1] ?? [], opts);
    if (im && refPng.has(p) && docxPng.has(p)) {
      const a = loadGrey(im.convert, refPng.get(p));
      const b = loadGrey(im.convert, docxPng.get(p));
      if (a && b) markHidden(page.lines, (r, d) => hiddenLine(a, b, r, d, opts.dpi / 72));
    }
    page.pass = (page.ratio === undefined || page.ratio <= opts.threshold) && lineDifferences(page.lines) === 0;
    if (opts.sheets && im?.montage && (opts.sheets === 'all' || !page.pass)) {
      mkdirSync(join(out, 'sheets'), { recursive: true });
      page.sheet = join(out, 'sheets', `p-${String(p).padStart(3, '0')}.png`);
      // Reference, docx, difference; no labels (montage needs a font for them).
      try {
        tool(im.montage, [refPng.get(p), docxPng.get(p), page.diffImage, '-tile', '3x1', '-geometry', '+8+8', '-background', '#bbbbbb', page.sheet]);
      } catch (e) {
        delete page.sheet;
        page.sheetError = e.message;
      }
    }
    pages.push(page);
  }

  const compared = pages.filter((p) => p.lines);
  const ratios = compared.map((p) => p.ratio).filter((r) => r !== undefined);
  const worst = compared.reduce((w, p) => (p.ratio !== undefined && (!w || p.ratio > w.ratio) ? p : w), null);
  const total = (f) => compared.reduce((t, p) => t + f(p.lines), 0);
  const summary = {
    method,
    dpi: opts.dpi,
    fuzz: opts.fuzz,
    threshold: opts.threshold,
    referencePages: refPages,
    docxPages,
    comparedPages: compared.length,
    meanRatio: ratios.length ? round(ratios.reduce((a, b) => a + b, 0) / ratios.length, 5) : null,
    worstPage: worst ? { page: worst.page, ratio: worst.ratio } : null,
    pagesOverThreshold: compared.filter((p) => p.ratio !== undefined && p.ratio > opts.threshold).map((p) => p.page),
    dyTolerance: opts.dyTolerance.pt !== undefined ? `${opts.dyTolerance.pt}pt` : `${opts.dyTolerance.em}em`,
    referenceLines: total((l) => l.referenceLines),
    matchedLines: total((l) => l.matched),
    reorderedLines: total((l) => l.reordered),
    joinedLines: total((l) => l.joined),
    hiddenLines: total((l) => l.hidden.length),
    missingLines: total((l) => l.missing.length),
    extraLines: total((l) => l.extra.length),
    movedLines: total((l) => l.moved.length),
    orientationMismatches: total((l) => l.orientation.length),
    pagesWithLineDifferences: compared.filter((p) => lineDifferences(p.lines)).map((p) => p.page),
    pagesWithHiddenLines: compared.filter((p) => p.lines.hidden.length).map((p) => p.page),
    pass: refPages === docxPages && pages.every((p) => p.pass),
  };
  const report = { docx: opts.docx, reference: opts.pdf, docxPdf, out, summary, pages };
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  const text = textReport(report, opts.maxLines);
  writeFileSync(join(out, 'report.txt'), text);
  return { exit: summary.pass ? 0 : 1, report, text };
}

const pct = (r) => `${(r * 100).toFixed(2)}%`;

export function textReport({ docx, reference, out, summary: s, pages }, maxLines = 5) {
  const lines = [
    `docx-compare: ${basename(docx)} against ${basename(reference)}`,
    `pages: ${s.referencePages} in the reference, ${s.docxPages} in the docx${s.referencePages === s.docxPages ? '' : '  << page counts differ'}`,
  ];
  if (s.method === 'text-only') lines.push('pixels: not compared (ImageMagick not found)');
  else lines.push(`pixels (${s.dpi} dpi, fuzz ${s.fuzz}): mean ${pct(s.meanRatio ?? 0)}, worst page ${s.worstPage?.page ?? '-'} (${pct(s.worstPage?.ratio ?? 0)}), ${s.pagesOverThreshold.length} page(s) over ${pct(s.threshold)}${s.pagesOverThreshold.length ? `: ${s.pagesOverThreshold.slice(0, 20).join(', ')}${s.pagesOverThreshold.length > 20 ? ', …' : ''}` : ''}`);
  lines.push(`lines: ${s.matchedLines} of ${s.referenceLines} reference lines found in the docx (${s.referenceLines ? pct(s.matchedLines / s.referenceLines) : '-'}), ${s.pagesWithLineDifferences.length} page(s) with line differences`);
  lines.push(`       ${s.missingLines} missing, ${s.hiddenLines} hidden under a shape, ${s.extraLines} extra, ${s.movedLines} moved beyond ${s.dyTolerance} of the page's shift or more than a line height, ${s.orientationMismatches} set in the other direction, ${s.reorderedLines} matched with glyphs reordered, ${s.joinedLines} matched as two halves on one baseline`);
  for (const p of pages) {
    if (p.missingIn) {
      lines.push(`  page ${p.page}: only in the ${p.missingIn === 'reference' ? 'docx' : 'reference'}`);
      continue;
    }
    if (p.pass) continue;
    const l = p.lines;
    lines.push(`  page ${p.page}:${p.ratio !== undefined ? ` ${pct(p.ratio)} pixels` : ''}${p.sizeMismatch ? ` (page size ${p.sizeMismatch.docx.w}x${p.sizeMismatch.docx.h} vs ${p.sizeMismatch.reference.w}x${p.sizeMismatch.reference.h})` : ''}, ${l.missing.length} reference line(s) not found, ${l.hidden.length} hidden, ${l.extra.length} docx line(s) not in the reference, ${l.moved.length} moved, ${l.orientation.length} turned; shift ${l.shiftY} pt, matched lines moved up to ${l.maxDy} pt`);
    for (const t of l.missing.slice(0, maxLines)) lines.push(`    pdf : ${JSON.stringify(t)}`);
    for (const t of l.hidden.slice(0, maxLines)) lines.push(`    hid : ${JSON.stringify(t)}`);
    for (const t of l.extra.slice(0, maxLines)) lines.push(`    docx: ${JSON.stringify(t)}`);
    for (const m of l.moved.slice(0, maxLines)) lines.push(`    move: ${m.dy > 0 ? '+' : ''}${m.dy} pt ${JSON.stringify(m.text)}`);
    for (const o of l.orientation.slice(0, maxLines)) lines.push(`    turn: ${o.reference} -> ${o.docx} ${JSON.stringify(o.text)}`);
  }
  lines.push(s.pass ? 'result: pass' : 'result: differences found', `report: ${join(out, 'report.json')}`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      if (e.message) console.error(`compare.mjs: ${e.message}`);
      console.error(USAGE);
      process.exit(e.message ? 2 : 0);
    }
    throw e;
  }
  try {
    const r = await compare(opts);
    if (r.exit === 3) {
      console.error('compare.mjs: LibreOffice (soffice) not found on PATH or in /Applications/LibreOffice.app. Install it (brew install --cask libreoffice), or convert the .docx yourself and pass the PDF with --docx-pdf FILE.');
      process.exit(3);
    }
    if (!opts.quiet) process.stdout.write(r.text);
    process.exit(r.exit);
  } catch (e) {
    if (e instanceof UsageError || e instanceof ToolError) {
      console.error(`compare.mjs: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}

if (isMain(import.meta.url)) main();
