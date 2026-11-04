// Read an exported .docx back: the export map, and the text Word now holds
// inside each `_ptx_` bookmark with its run formatting. Text typed just
// outside a bookmark joins the fragment beside it in the same paragraph; a
// paragraph without any bookmark is a paragraph the user added, read as a
// paragraph break plus its text at the end of the fragment before it.

import { unzipSync } from 'fflate';
import { attr, child, children, parseXml, textOf, type XmlElement } from '../xml.js';
import { readCustomProp, readExportMap, xmlPartText, PROP_EXPORT_ID } from '../anchors/exportMap.js';
import type { ExportMap } from '../anchors/types.js';
import { DocxReadError } from '../docxRead/parts.js';
import { PARA_CHAR, walkPart, type Token } from './walk.js';

export interface ReadChar {
  ch: string;
  flags: string;
  href?: string;
  tex?: string;
  tracked?: boolean;
}

export interface ReadFragment {
  chars: ReadChar[];
  /** Positions in `chars` where tracked-deleted text stood. */
  dels: number[];
  /** Paragraph ordinals of the bookmark's start and end. */
  startPara: number;
  endPara: number;
}

export interface ReadPosition {
  fid: string;
  index: number;
}

export interface ReadComment {
  author?: string;
  text: string;
  start?: ReadPosition;
  end?: ReadPosition;
}

export interface ReadDocx {
  map: ExportMap;
  fragments: Map<string, ReadFragment>;
  comments: ReadComment[];
}

type Files = Record<string, Uint8Array>;

function unzip(bytes: Uint8Array): Files {
  try {
    return unzipSync(bytes);
  } catch {
    throw new DocxReadError('not a zip');
  }
}

function xmlOf(files: Files, path: string): XmlElement | undefined {
  const bytes = files[path];
  if (!bytes) return undefined;
  try {
    return parseXml(xmlPartText(bytes));
  } catch {
    throw new DocxReadError(`unreadable part ${path}`);
  }
}

/** External hyperlink targets by relationship id. */
function linksOf(files: Files, part: string): Record<string, string> {
  const slash = part.lastIndexOf('/');
  const rels = xmlOf(files, `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`);
  const out: Record<string, string> = {};
  for (const r of children(rels, 'Relationship')) {
    if (r.attrs.TargetMode === 'External' && /\/hyperlink$/.test(r.attrs.Type ?? '')) out[r.attrs.Id ?? ''] = r.attrs.Target ?? '';
  }
  return out;
}

/** Whether `bytes` is a .docx written by a postext Word exporter (it holds
 *  the export map and the custom property naming it). Never throws. */
export function isExportedDocx(bytes: Uint8Array): boolean {
  try {
    const files = unzipSync(bytes);
    return readCustomProp(files, PROP_EXPORT_ID) !== undefined && readExportMap(files) !== undefined;
  } catch {
    return false;
  }
}

/** Distribute the token stream over the fragments. */
function assign(tokens: Token[], map: ExportMap): Omit<ReadDocx, 'map' | 'comments'> & { marks: Map<string, ReadPosition> } {
  const fragments = new Map<string, ReadFragment>();
  const open: { wid: string; fid: string; depth: number }[] = [];
  const lastClosedIn = new Map<number, string>();
  /** Characters waiting for a fragment that opens later in their paragraph. */
  let pending: { para: number; chars: ReadChar[]; dels: number } | undefined;
  /** Paragraphs without a bookmark yet (added by the user), with the
   *  container they stand in. */
  let orphan: { chars: ReadChar[]; box: number }[] = [];
  /** Containers holding at least one of our bookmarks. */
  const boxesWithMarks = new Set<number>();
  let lastFid: string | undefined;
  const marks = new Map<string, ReadPosition>();
  const waiting: string[] = [];
  /** Where the text after a fragment's bookmark end starts, in its paragraph. */
  let tail: { fid: string; para: number; from: number } | undefined;
  const blank = (chars: readonly ReadChar[]): boolean => chars.every((c) => c.ch.trim() === '' && c.tex === undefined);

  const frag = (fid: string): ReadFragment => {
    let f = fragments.get(fid);
    if (!f) fragments.set(fid, (f = { chars: [], dels: [], startPara: -1, endPara: -1 }));
    return f;
  };
  const target = (para: number): string | undefined => open[open.length - 1]?.fid ?? lastClosedIn.get(para);
  // A paragraph in a container without any bookmark (a text box holding a
  // list marker, a folio or a running head) is decoration, not text the
  // user added; the formatted writer leaves those unbookmarked.
  const flushOrphans = (nextBox?: number): void => {
    const paras = orphan
      .filter((o) => boxesWithMarks.has(o.box) || o.box === nextBox)
      .map((o) => o.chars)
      .filter((p) => p.some((c) => c.ch.trim() !== '' || c.tex !== undefined));
    orphan = [];
    if (!paras.length || !lastFid) return;
    const f = frag(lastFid);
    for (const p of paras) f.chars.push({ ch: PARA_CHAR, flags: '', tracked: p[0]?.tracked }, ...p);
  };
  const known = new Set(map.fragments.map((f) => f.id));

  for (const tok of tokens) {
    switch (tok.t) {
      case 'bmStart': {
        if (!known.has(tok.fid)) break;
        boxesWithMarks.add(tok.box);
        open.push({ wid: tok.wid, fid: tok.fid, depth: tok.depth });
        const f = frag(tok.fid);
        f.startPara = tok.para;
        tail = undefined;
        // Spaces alone before the bookmark (a note's space after its
        // number) change nothing in Markdown: they are not an edit.
        if (pending && pending.para === tok.para && (!blank(pending.chars) || pending.dels)) {
          f.chars.unshift(...pending.chars);
          if (pending.dels) f.dels.push(0);
        }
        pending = undefined;
        flushOrphans(tok.box);
        for (const cid of waiting) marks.set(cid, { fid: tok.fid, index: 0 });
        waiting.length = 0;
        lastFid = tok.fid;
        break;
      }
      case 'bmEnd': {
        const at = open.findIndex((o) => o.wid === tok.wid);
        if (at < 0) break;
        const [o] = open.splice(at, 1);
        frag(o!.fid).endPara = tok.para;
        lastClosedIn.set(tok.para, o!.fid);
        lastFid = o!.fid;
        if (!open.length) tail = { fid: o!.fid, para: tok.para, from: frag(o!.fid).chars.length };
        break;
      }
      case 'char':
      case 'del': {
        const fid = target(tok.para);
        if (fid) {
          const f = frag(fid);
          if (tok.t === 'del') f.dels.push(f.chars.length);
          else f.chars.push(tok);
          break;
        }
        if (tok.t === 'del') {
          if (pending) pending.dels++;
          break;
        }
        if (!pending || pending.para !== tok.para) pending = { para: tok.para, chars: [], dels: 0 };
        pending.chars.push(tok);
        break;
      }
      case 'para': {
        const top = open[open.length - 1];
        if (top && top.depth === tok.depth) {
          frag(top.fid).chars.push({ ch: PARA_CHAR, flags: '' });
        } else if (pending && pending.para === tok.para) {
          orphan.push({ chars: pending.chars, box: tok.box });
          pending = undefined;
        }
        // Likewise spaces alone after the bookmark end.
        if (tail && tail.para === tok.para) {
          const f = frag(tail.fid);
          if (!f.dels.some((d) => d > tail!.from) && blank(f.chars.slice(tail.from))) f.chars.length = tail.from;
        }
        tail = undefined;
        lastClosedIn.delete(tok.para);
        break;
      }
      case 'cStart':
      case 'cEnd': {
        const key = `${tok.t}:${tok.cid}`;
        const fid = open[open.length - 1]?.fid ?? lastFid;
        if (tok.t === 'cStart' && !open.length) {
          waiting.push(key);
          break;
        }
        if (fid) marks.set(key, { fid, index: frag(fid).chars.length });
        break;
      }
    }
  }
  flushOrphans();
  return { fragments, marks };
}

function readComments(files: Files, marks: Map<string, ReadPosition>): ReadComment[] {
  const root = xmlOf(files, 'word/comments.xml');
  const out: ReadComment[] = [];
  for (const c of children(root, 'comment')) {
    const id = attr(c, 'id') ?? '';
    const text = children(c, 'p').map(textOf).join('\n').trim();
    const start = marks.get(`cStart:${id}`);
    const end = marks.get(`cEnd:${id}`);
    out.push({
      author: attr(c, 'author'),
      text,
      start,
      end,
    });
  }
  return out;
}

/** Read an exported file. Throws DocxReadError for a broken file or one
 *  without an export map. */
export function readExportedDocx(bytes: Uint8Array): ReadDocx {
  const files = unzip(bytes);
  const map = readExportMap(files);
  if (!map) throw new DocxReadError('no postext export map');
  const doc = xmlOf(files, 'word/document.xml');
  const body = child(doc, 'body');
  if (!body) throw new DocxReadError('no document part');
  const tokens: Token[] = [];
  let { nextPara: next, nextBox: box } = walkPart(body, linksOf(files, 'word/document.xml'), tokens);
  // Notes after the body, in their part order (the semantic writer's).
  for (const [part, el] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
    const root = xmlOf(files, part);
    if (!root) continue;
    const links = linksOf(files, part);
    for (const note of children(root, el)) {
      const type = attr(note, 'type');
      if (type && type !== 'normal') continue;
      ({ nextPara: next, nextBox: box } = walkPart(note, links, tokens, next, box));
    }
  }
  const { fragments, marks } = assign(tokens, map);
  return { map, fragments, comments: readComments(files, marks) };
}
