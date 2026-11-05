// Test fixtures: exported .docx files built by hand (createDocxPackage +
// bookmarks + an export map) the way the two writers lay them out, and a
// way to edit their document.xml as Word would.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { bookmarkEndXml, bookmarkName, bookmarkStartXml, newFragmentId } from '../anchors/bookmarks.js';
import { hashText } from '../anchors/hash.js';
import type { ExportMap, ExportVariant, FragmentTarget, MapFormat, MapFragment } from '../anchors/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import type { DocxPackageBuilder } from '../ooxml/types.js';
import { escapeXml } from '../xml.js';

const OBJ = '￼';

export interface Plain {
  text: string;
  map: number[];
  /** Per character: flags and link. */
  flags: string[];
  hrefs: (string | undefined)[];
  atoms: NonNullable<MapFragment['atoms']>;
  /** TeX per equation character. */
  tex: Map<number, string>;
}

/** A small Markdown reader for the fixtures: `**`, `*`, `^…^`,
 *  `[text](url)`, `:index[text]{…}`, `$tex$` and `:ref{id}` (printed as
 *  "1"). Whitespace runs collapse to their first character. */
export function plainOf(src: string, start = 0, end = src.length): Plain {
  const out: Plain = { text: '', map: [], flags: [], hrefs: [], atoms: [], tex: new Map() };
  let bold = false, italic = false, sup = false;
  let href: string | undefined;
  const stack: string[] = [];
  const push = (ch: string, at: number): void => {
    out.text += ch;
    out.map.push(at);
    out.flags.push((bold ? 'b' : '') + (italic ? 'i' : '') + (sup ? 'p' : ''));
    out.hrefs.push(href);
  };
  let i = start;
  while (i < end) {
    const rest = src.slice(i, end);
    if (rest.startsWith('**')) { bold = !bold; i += 2; continue; }
    if (rest[0] === '*') { italic = !italic; i += 1; continue; }
    if (rest[0] === '^') { sup = !sup; i += 1; continue; }
    if (rest.startsWith(':index[')) { stack.push('index'); i += 7; continue; }
    let m = /^:ref\{[^}]*\}/.exec(rest);
    if (m) {
      out.atoms.push({ at: out.text.length, start: i, end: i + m[0].length, kind: 'ref' });
      push('1', i);
      i += m[0].length;
      continue;
    }
    m = /^\$([^$]+)\$/.exec(rest);
    if (m) {
      out.atoms.push({ at: out.text.length, start: i, end: i + m[0].length, kind: 'math' });
      out.tex.set(out.text.length, m[1]!);
      push(OBJ, i);
      i += m[0].length;
      continue;
    }
    if (rest[0] === '[') {
      const close = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest);
      if (close) { href = close[2]; stack.push('link'); i += 1; continue; }
    }
    if (rest[0] === ']' && stack.length) {
      const kind = stack.pop();
      if (kind === 'link') { href = undefined; i += /^\]\([^)]*\)/.exec(rest)![0].length; continue; }
      const attrs = /^\]\{[^}]*\}/.exec(rest);
      i += attrs ? attrs[0].length : 1;
      continue;
    }
    if (/\s/.test(rest[0]!)) {
      push(' ', i);
      i++;
      while (i < end && /\s/.test(src[i]!)) i++;
      continue;
    }
    push(rest[0]!, i);
    i++;
  }
  return out;
}

export interface FragSpec {
  plain: Plain;
  block: string;
  part: number;
  target: FragmentTarget;
  range: [number, number];
}

/** Insert engine line breaks (and added hyphens) after plain indices. */
export function withBreaks(p: Plain, breaks: { after: number; hyphen?: boolean }[]): Plain {
  const out: Plain = { text: '', map: [], flags: [], hrefs: [], atoms: [], tex: new Map() };
  const at = new Map(breaks.map((b) => [b.after, b]));
  const shift: number[] = [];
  for (let i = 0; i < p.text.length; i++) {
    shift.push(out.text.length);
    out.text += p.text[i];
    out.map.push(p.map[i]!);
    out.flags.push(p.flags[i]!);
    out.hrefs.push(p.hrefs[i]);
    if (p.tex.has(i)) out.tex.set(out.text.length - 1, p.tex.get(i)!);
    const b = at.get(i);
    if (!b) continue;
    for (const ch of b.hyphen ? ['-', '\n'] : ['\n']) {
      out.text += ch;
      out.map.push(-1);
      out.flags.push(p.flags[i]!);
      out.hrefs.push(undefined);
    }
  }
  out.atoms = p.atoms.map((a) => ({ ...a, at: shift[a.at]! }));
  return out;
}

/** Cut a plain text in two at index `k` (a column or page break). */
export function cut(p: Plain, k: number): [Plain, Plain] {
  const part = (s: number, e: number): Plain => ({
    text: p.text.slice(s, e), map: p.map.slice(s, e), flags: p.flags.slice(s, e), hrefs: p.hrefs.slice(s, e),
    atoms: p.atoms.filter((a) => a.at >= s && a.at < e).map((a) => ({ ...a, at: a.at - s })),
    tex: new Map([...p.tex].filter(([i]) => i >= s && i < e).map(([i, t]) => [i - s, t])),
  });
  return [part(0, k), part(k, p.text.length)];
}

function formatsOf(p: Plain): MapFormat[] {
  const out: MapFormat[] = [];
  for (let i = 0; i < p.text.length; i++) {
    const flags = p.flags[i]!;
    const href = p.hrefs[i];
    if (!flags && !href) continue;
    const last = out[out.length - 1];
    if (last && last.end === i && last.flags === flags && last.href === href) last.end = i + 1;
    else out.push({ start: i, end: i + 1, flags, ...(href ? { href } : {}) });
  }
  return out;
}

const SUP = '<m:oMath><m:sSup><m:e><m:r><m:t>$B</m:t></m:r></m:e><m:sup><m:r><m:t>$E</m:t></m:r></m:sup></m:sSup></m:oMath>';

/** OMML for the fixtures' equations: `b^e` or plain runs. */
export function ommlOf(tex: string): string {
  const m = /^(\w)\^\{?(\w+)\}?$/.exec(tex);
  return m ? SUP.replace('$B', m[1]!).replace('$E', m[2]!) : `<m:oMath><m:r><m:t>${escapeXml(tex)}</m:t></m:r></m:oMath>`;
}

/** Runs of a fragment: one per change of formatting, `w:br` per line end. */
function runsXml(p: Plain, pkg: DocxPackageBuilder): string {
  let out = '';
  let i = 0;
  while (i < p.text.length) {
    const ch = p.text[i]!;
    if (ch === OBJ) {
      out += ommlOf(p.tex.get(i) ?? '');
      i++;
      continue;
    }
    if (ch === '\n') {
      out += '<w:r><w:br/></w:r>';
      i++;
      continue;
    }
    let j = i;
    while (j < p.text.length && p.text[j] !== '\n' && p.text[j] !== OBJ && p.flags[j] === p.flags[i] && p.hrefs[j] === p.hrefs[i]) j++;
    const f = p.flags[i]!;
    const rPr = (f.includes('b') ? '<w:b/>' : '') + (f.includes('i') ? '<w:i/>' : '') + (f.includes('p') ? '<w:vertAlign w:val="superscript"/>' : '');
    const run = `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(p.text.slice(i, j))}</w:t></w:r>`;
    out += p.hrefs[i] ? `<w:hyperlink r:id="${pkg.addLink(p.hrefs[i]!)}">${run}</w:hyperlink>` : run;
    i = j;
  }
  return out;
}

export interface Fixture {
  bytes: Uint8Array;
  map: ExportMap;
}

/**
 * An exported file. `semantic`: one body paragraph per fragment.
 * `formatted`: pages of text boxes (`pages[k]` = fragment indices), each
 * text box holding one fragment, with a VML fallback copy that the
 * importer must not read twice.
 */
export function buildFixture(options: {
  variant: ExportVariant;
  chapters: { id: string; markdown: string }[];
  frags: FragSpec[];
  pages?: number[][];
  resources?: Record<string, unknown>;
}): Fixture {
  const pkg = createDocxPackage();
  const fragments: MapFragment[] = options.frags.map((f, k) => ({
    id: newFragmentId(k), block: f.block, part: f.part, target: f.target, text: f.plain.text, map: f.plain.map,
    ...(f.plain.atoms.length ? { atoms: f.plain.atoms } : {}), formats: formatsOf(f.plain), range: f.range,
  }));
  const para = (k: number): string => {
    const bm = pkg.nextBookmarkId();
    return `<w:p>${bookmarkStartXml(bm, bookmarkName(fragments[k]!.id))}${runsXml(options.frags[k]!.plain, pkg)}${bookmarkEndXml(bm)}</w:p>`;
  };
  let body = '';
  if (options.variant === 'semantic') body = options.frags.map((_, k) => para(k)).join('');
  else {
    for (const page of options.pages ?? [options.frags.map((_, k) => k)]) {
      let boxes = '';
      for (const k of page) {
        const id = pkg.nextDrawingId();
        const content = `<w:txbxContent>${para(k)}</w:txbxContent>`;
        boxes +=
          `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id}" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">` +
          `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
          `<wp:extent cx="914400" cy="914400"/><wp:wrapNone/><wp:docPr id="${id}" name="Text ${id}"/>` +
          `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr/>` +
          `<wps:txbx>${content}</wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
          `<mc:Fallback><w:pict><v:shape><v:textbox>${content.replace(/w:id="\d+"/g, 'w:id="9999"')}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
      }
      body += `<w:p>${boxes}</w:p>`;
    }
  }
  body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
  const map: ExportMap = {
    version: 1, exportId: 'exp-1', variant: options.variant, engine: '1.67.0', createdAt: '2026-11-04T00:00:00Z',
    chapters: options.chapters.map((c) => ({ id: c.id, hash: hashText(c.markdown) })),
    fragments,
    snapshot: { chapters: options.chapters, ...(options.resources ? { resources: options.resources } : {}) },
  };
  const bytes = pkg.build({ body, styles: '', exportMap: map, core: { date: '2026-11-04T00:00:00Z' } });
  return { bytes, map };
}

/** The document part's XML. */
export function documentXml(bytes: Uint8Array, part = 'word/document.xml'): string {
  return strFromU8(unzipSync(bytes)[part]!);
}

/** Rewrite parts of the package (as Word would after an edit). */
export function editDocx(bytes: Uint8Array, edit: (xml: string) => string, extra: Record<string, string> = {}): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(edit(strFromU8(files['word/document.xml']!)));
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}

/** Replace the one occurrence of `find` (throws when it is not unique). */
export function replaceOnce(xml: string, find: string, replace: string): string {
  const at = xml.indexOf(find);
  if (at < 0 || xml.indexOf(find, at + 1) >= 0) throw new Error(`replaceOnce: "${find}" is not unique in the document`);
  return xml.slice(0, at) + replace + xml.slice(at + find.length);
}

/** Replace every occurrence of `find` (a text box and its fallback copy). */
export function replaceEach(xml: string, find: string, replace: string): string {
  if (!xml.includes(find)) throw new Error(`replaceEach: "${find}" is not in the document`);
  return xml.split(find).join(replace);
}

/** A block covering the source line that starts with `line`. */
export function lineBlock(md: string, line: string, block: string, chapter = 0, prefix = 0): FragSpec {
  const start = md.indexOf(line);
  if (start < 0) throw new Error(`lineBlock: no line "${line}"`);
  let end = md.indexOf('\n', start);
  if (end < 0) end = md.length;
  return { plain: plainOf(md, start + prefix, end), block, part: 0, target: { kind: 'markdown', chapter }, range: [start, end] };
}
