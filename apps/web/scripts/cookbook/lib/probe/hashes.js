// Layout and lines hashes and warning keys of a document (C33).
import { comicDetail, layoutDetail } from './record.js';
import { vdtText } from './render.js';

// ─── The bundle, read back (C33) ────────────────────────────────────────────

/** The layout hash of one document: every block, line and running head
 *  with its place on the page, pages counted from the document's first.
 *  What C33 compares, what `sandbox.chapters` records and what
 *  `pnpm cookbook sandbox` computes of the Sandbox's own layout (#736). */
export function layoutHash(doc) {
  return shortHash(vdtText([doc], { own: true }));
}

/** The lines hash of one document: its pages, the blocks of each in their
 *  order and the text of every line and running head, with no box. A line
 *  that breaks at another word, a block on another page and a line more or
 *  fewer change it; a width that differs does not. What holds between two
 *  builds of one family: a pen measures with the static cuts Fontsource
 *  serves and the Sandbox with Google's variable file, whose advances
 *  between the masters are not rounded to the font's units, so the widths
 *  {@link layoutHash} rounds to half a pixel fall on either side of it
 *  (#736: on 1.28.1, 127 of 334 editions with every line the same and
 *  another layout hash). */
export function linesHash(doc) {
  return shortHash(vdtText([doc], { own: true, boxes: false }));
}

/** A short hash of a layout text (two rounds of FNV-1a), for the report. */
export function shortHash(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x811c9dc5) + (b << 7);
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'));
}

/** Where two layout texts part: the page and the two lines. */
export function firstDifference(pen, bundle) {
  const a = pen.split('\n');
  const b = bundle.split('\n');
  let page = 0;
  const cut = (line) => (line === undefined ? 'nothing' : line.length > 90 ? `${line.slice(0, 90)}…` : line);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]?.startsWith('P')) page = Number(a[i].slice(1, a[i].indexOf('|'))) + 1;
    if (a[i] !== b[i]) return `page ${page || 1}: the pen sets ${cut(a[i])}, the bundle ${cut(b[i])}`;
  }
  return null;
}

/** What a warning of a document names, positions aside. */
export function warningsOf(doc) {
  const said = (w) => (/^comic[A-Z]/.test(w.kind) ? comicDetail(w)
    : layoutDetail(w) ?? [w.resourceId, w.target, w.term, w.text, w.reason, w.value]
      .filter((x) => typeof x === 'string' || typeof x === 'number').join(' '));
  return [
    ...(doc.contentWarnings ?? []).map((w) => `${w.kind} ${said(w)}`.trim()),
    ...(doc.warnings ?? []).map((w) => `${w.kind} (layout)`),
    ...(doc.configWarnings ?? []).map((w) => `${w.kind} ${w.path}`.trim()),
  ];
}

/** The warnings in `bundle` beyond those in `pen`, each as often as it is over. */
export function extraWarnings(pen, bundle) {
  const left = new Map();
  for (const w of pen) left.set(w, (left.get(w) ?? 0) + 1);
  const out = [];
  for (const w of bundle) {
    const n = left.get(w) ?? 0;
    if (n > 0) left.set(w, n - 1);
    else out.push(w);
  }
  return out;
}
