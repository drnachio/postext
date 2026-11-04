#!/usr/bin/env node
// Fidelity check of a formatted Word export (#1399): the .docx converted to
// PDF by LibreOffice headless, both PDFs rasterised by pdftoppm and compared
// page by page (share of differing pixels, through ImageMagick), and the
// text of every page compared line by line (pdftotext -bbox-layout), so a
// line Word or LibreOffice broke differently from the engine shows up with
// its text. Writes report.json and report.txt into the output folder and
// prints the text report.
//
//   node scripts/docx-compare/compare.mjs book.docx book.pdf [--out DIR]
//        [--docx-pdf FILE] [--dpi 72] [--fuzz 10%] [--threshold 0.02]
//        [--pages 1-5,9] [--sheets | --sheets all] [--max-lines 5]
//
// Exit codes: 0 every page within the thresholds · 1 differences found ·
// 2 wrong usage or a tool failed · 3 LibreOffice not found (pass the
// converted PDF with --docx-pdf instead).

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = `usage: compare.mjs <file.docx> <reference.pdf> [--out DIR] [--docx-pdf FILE] [--dpi N]
       [--fuzz PCT] [--threshold RATIO] [--pages LIST] [--sheets [all]] [--max-lines N] [--quiet]`;

// ---------------------------------------------------------------- options

export function parseArgs(argv) {
  const opts = { dpi: 72, fuzz: '10%', threshold: 0.02, maxLines: 5, sheets: false, quiet: false, pages: null, out: null, docxPdf: null };
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
 *  of another size is padded (white) to the reference's size first. */
function pixelDiff(im, ref, other, diffPng, fuzz) {
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
  return { ratio: ae / (a.w * a.h), pixels: ae, sizeMismatch: a.w !== b.w || a.h !== b.h ? { reference: a, docx: b } : undefined };
}

// ---------------------------------------------------------------- text

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };

/** A line's text as compared: NFKC (ligatures, presentation forms), no
 *  soft hyphens, tatweels or zero-width characters, one space between
 *  words, typographic dashes and quotes as they are. */
export function normaliseLine(s) {
  return s
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c])
    .normalize('NFKC')
    .replace(/[\u00AD\u0640\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines per page from `pdftotext -bbox-layout`: text and box in points. */
export function parseBboxLayout(html) {
  const pages = [];
  const pageRe = /<page\b[^>]*>([\s\S]*?)<\/page>/g;
  for (let pm = pageRe.exec(html); pm; pm = pageRe.exec(html)) {
    const lines = [];
    const lineRe = /<line xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/line>/g;
    for (let lm = lineRe.exec(pm[1]); lm; lm = lineRe.exec(pm[1])) {
      const words = [...lm[5].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/g)].map((w) => decode(w[1]));
      const text = normaliseLine(words.join(' '));
      if (text) lines.push({ text, x: Number(lm[1]), y: Number(lm[2]), x2: Number(lm[3]), y2: Number(lm[4]) });
    }
    pages.push(lines);
  }
  return pages;
}

function pdfLines(pdf) {
  return parseBboxLayout(run(findTool(['pdftotext']) ?? 'pdftotext', ['-bbox-layout', '-enc', 'UTF-8', pdf, '-']).stdout);
}

/**
 * Lines of one page matched by text (each docx line used once, the nearest
 * one when a text repeats). Spaces do not count: letterspaced text and
 * word gaps the extractor reads differently in either file still match.
 * A line that does not match means the line broke elsewhere, or its text
 * changed. Matched lines report how far they moved.
 */
export function compareLines(ref, docx) {
  const key = (l) => l.text.replace(/ /g, '');
  const free = new Map();
  docx.forEach((l, i) => {
    const list = free.get(key(l)) ?? [];
    list.push(i);
    free.set(key(l), list);
  });
  const used = new Set();
  const missing = [];
  const moves = [];
  for (const l of ref) {
    const list = free.get(key(l));
    if (!list?.length) {
      missing.push(l);
      continue;
    }
    let best = 0;
    for (let k = 1; k < list.length; k++) {
      if (Math.hypot(docx[list[k]].x - l.x, docx[list[k]].y - l.y) < Math.hypot(docx[list[best]].x - l.x, docx[list[best]].y - l.y)) best = k;
    }
    const j = list.splice(best, 1)[0];
    used.add(j);
    moves.push({ dx: docx[j].x - l.x, dy: docx[j].y - l.y });
  }
  const extra = docx.filter((_, i) => !used.has(i));
  const abs = (k) => moves.map((m) => Math.abs(m[k]));
  return {
    referenceLines: ref.length,
    docxLines: docx.length,
    matched: moves.length,
    missing: missing.map((l) => l.text),
    extra: extra.map((l) => l.text),
    maxDx: round(Math.max(0, ...abs('dx'))),
    maxDy: round(Math.max(0, ...abs('dy'))),
    meanDy: round(moves.length ? abs('dy').reduce((a, b) => a + b, 0) / moves.length : 0),
  };
}

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
      Object.assign(page, pixelDiff(im, refPng.get(p), docxPng.get(p), diffPng, opts.fuzz));
      page.ratio = round(page.ratio, 5);
      page.diffImage = diffPng;
    }
    page.lines = compareLines(refText[p - 1] ?? [], docxText[p - 1] ?? []);
    page.pass = (page.ratio === undefined || page.ratio <= opts.threshold) && page.lines.missing.length === 0 && page.lines.extra.length === 0;
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
  const lineTotals = compared.reduce((t, p) => ({ ref: t.ref + p.lines.referenceLines, matched: t.matched + p.lines.matched }), { ref: 0, matched: 0 });
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
    referenceLines: lineTotals.ref,
    matchedLines: lineTotals.matched,
    pagesWithLineDifferences: compared.filter((p) => p.lines.missing.length || p.lines.extra.length).map((p) => p.page),
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
  for (const p of pages) {
    if (p.missingIn) {
      lines.push(`  page ${p.page}: only in the ${p.missingIn === 'reference' ? 'docx' : 'reference'}`);
      continue;
    }
    if (p.pass) continue;
    const l = p.lines;
    lines.push(`  page ${p.page}:${p.ratio !== undefined ? ` ${pct(p.ratio)} pixels` : ''}${p.sizeMismatch ? ` (page size ${p.sizeMismatch.docx.w}x${p.sizeMismatch.docx.h} vs ${p.sizeMismatch.reference.w}x${p.sizeMismatch.reference.h})` : ''}, ${l.missing.length} reference line(s) not found, ${l.extra.length} docx line(s) not in the reference, matched lines moved up to ${l.maxDy} pt`);
    for (const t of l.missing.slice(0, maxLines)) lines.push(`    pdf : ${JSON.stringify(t)}`);
    for (const t of l.extra.slice(0, maxLines)) lines.push(`    docx: ${JSON.stringify(t)}`);
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
