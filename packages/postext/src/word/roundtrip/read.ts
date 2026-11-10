// Read an exported .docx back: the export map, and the text Word now holds
// inside each `_ptx_` bookmark with its run formatting. Text typed just
// outside a bookmark joins the fragment beside it in the same paragraph; a
// paragraph without any bookmark is a paragraph the user added, read as a
// paragraph break plus its text at the end of the fragment before it.

import { unzipSync } from 'fflate';
import { attr, child, children, parseXml, textOf, type XmlElement } from '../xml.js';
import { readCustomProp, readExportMap, xmlPartText, PROP_EXPORT_ID } from '../anchors/exportMap.js';
import { BOOKMARK_PREFIX, type ExportMap } from '../anchors/types.js';
import { DocxReadError } from '../docxRead/parts.js';
import { PARA_CHAR, walkPart, type ParaProps, type Token } from './walk.js';
import { readParaStyles, type ParaStyles } from './added.js';
import { styleLooks } from './looks.js';

export interface ReadChar {
  ch: string;
  flags: string;
  href?: string;
  tex?: string;
  /** Hash of the equation's canonical OMML. */
  mathHash?: string;
  tracked?: boolean;
  /** An atom's holder, by the writer's w:noProof mark. */
  holder?: true;
  /** The note a note reference calls (`f3`: footnote 3, `e1`: endnote 1). */
  note?: string;
  /** How the character looks, styles counted in (`looks.ts`), when the
   *  file was read for it. */
  look?: string;
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

/** A paragraph typed outside every bookmark: it goes into the source next
 *  to the block of fragment `fid`, after it or (at a chapter's start)
 *  before it. */
export interface AddedParagraph {
  fid: string;
  side: 'after' | 'before';
  chars: ReadChar[];
  props?: ParaProps;
  /** The fragment whose bookmark opens right after the paragraph, in the
   *  same run of paragraphs. */
  next?: string;
  /** The paragraph stands in a table, the same one as the bookmark it is
   *  placed by: in a table of the book, a row or a line added to it. */
  cell?: true;
}

export interface ReadDocx {
  map: ExportMap;
  fragments: Map<string, ReadFragment>;
  added: AddedParagraph[];
  /** The text of every paragraph that stands outside the bookmarks, the
   *  ones passed over as decoration too: a fragment whose bookmark is gone
   *  while its paragraph still stands there word for word lost its
   *  bookmark to the editor, and was not deleted (`apply.ts`). */
  strays: string[];
  /** The notes typed in the editor (none of their text is a fragment's),
   *  by the key their reference carries (`ReadChar.note`): their text. */
  newNotes: Map<string, ReadChar[]>;
  /** The paragraph styles of the file, to read an added paragraph's role. */
  styles: ParaStyles;
  comments: ReadComment[];
  /** The writer marked atom holders and the marks survived the editor
   *  (its own w:noProof anchor runs are still there): an unmarked U+00A0
   *  is then a typed no-break space. */
  holders: boolean;
  /** Some style or run of the file sets capitals with `w:caps`; an editor
   *  that has no such mark (Google Docs) types the capitals out. Set when
   *  the looks were read. */
  caps?: boolean;
}

/** How `readExportedDocx` reads a file. */
export interface ReadOptions {
  /** The map to read the file by when it carries none: the one written
   *  again from the book (`rebuild.ts`). */
  map?: ExportMap;
  /** Read each character's look, styles counted in. */
  looks?: boolean;
  /** Bookmarks of the file that stand for nothing in the map and whose
   *  text is no addition either (text the book no longer has). */
  foreign?: ReadonlySet<string>;
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

/** Whether `bytes` is a .docx written by a postext Word exporter: it holds
 *  the export map. The custom property that names the export is not asked
 *  for (an editor may drop the document properties and keep the map); when
 *  it is there, the map must be the one it names. Never throws. */
export function isExportedDocx(bytes: Uint8Array): boolean {
  try {
    return readExportMap(unzipSync(bytes)) !== undefined;
  } catch {
    return false;
  }
}

/** Whether `bytes` is a postext export an editor saved without its export
 *  map (Google Docs drops it): the property naming the export or the
 *  fragments' bookmarks are still there, the map is not. Its edits are
 *  placed by a map written again from the book (`rebuildExportMap`).
 *  Never throws. */
export function exportMapLost(bytes: Uint8Array): boolean {
  try {
    const files = unzipSync(bytes);
    if (readExportMap(files) !== undefined) return false;
    if (readCustomProp(files, PROP_EXPORT_ID) !== undefined) return true;
    const doc = files['word/document.xml'];
    return !!doc && xmlPartText(doc).includes(`w:name="${BOOKMARK_PREFIX}`);
  } catch {
    return false;
  }
}

/** Distribute the token stream over the fragments. */
export function assign(tokens: Token[], map: ExportMap, foreign?: ReadonlySet<string>): Pick<ReadDocx, 'fragments' | 'added' | 'strays'> & { marks: Map<string, ReadPosition> } {
  const fragments = new Map<string, ReadFragment>();
  const open: { wid: string; fid: string; depth: number }[] = [];
  const lastClosedIn = new Map<number, string>();
  /** Characters waiting for a fragment that opens later in their paragraph.
   *  `after`: they stand behind a fragment postext generates (a caption's
   *  number), and `at` are the places of the tracked deletions among them. */
  let pending: { para: number; chars: ReadChar[]; dels: number; after?: string; at?: number[] } | undefined;
  /** Paragraphs without a bookmark yet (added by the user), with the
   *  container they stand in. */
  let orphan: { chars: ReadChar[]; box: number; props?: ParaProps; afterSect: boolean; tbl?: number }[] = [];
  /** The fragments postext generates: text typed just after one, before
   *  the book's own text in the same paragraph, belongs to that text. */
  const generated = new Set(map.fragments.filter((f) => f.target.kind === 'generated').map((f) => f.id));
  /** The table each fragment's bookmark opens in. */
  const tableOf = new Map<string, number>();
  const added: AddedParagraph[] = [];
  const strays: string[] = [];
  /** A section ended since the last bookmark (semantic: a chapter end), so
   *  what follows opens the next chapter. */
  let sectSeen = false;
  const chapterSections = map.variant === 'semantic';
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
  /** Text held behind a generated fragment goes to it after all: no text
   *  of the book followed in the paragraph. */
  const releaseHeld = (): void => {
    if (!pending || pending.after === undefined) return;
    const f = frag(pending.after);
    const base = f.chars.length;
    for (const d of pending.at ?? []) f.dels.push(base + d);
    f.chars.push(...pending.chars);
    pending = undefined;
  };
  // A paragraph in a container without any bookmark (a text box holding a
  // list marker, a folio or a running head) is decoration, not text the
  // user added; the formatted writer leaves those unbookmarked.
  // The others go after the block before them, or before the block after
  // them when they open a chapter (or the document).
  const flushOrphans = (nextBox?: number, nextFid?: string): void => {
    for (const o of orphan) {
      const text = o.chars.map((c) => c.ch).join('').trim();
      if (text) strays.push(text);
    }
    const paras = orphan
      .filter((o) => boxesWithMarks.has(o.box) || o.box === nextBox)
      .filter((o) => o.chars.some((c) => c.ch.trim() !== '' || c.tex !== undefined));
    orphan = [];
    for (const o of paras) {
      const before = nextFid !== undefined && (!lastFid || o.afterSect);
      const fid = before ? nextFid : lastFid;
      const cell = o.tbl !== undefined && fid !== undefined && tableOf.get(fid) === o.tbl;
      if (fid) added.push({ fid, side: before ? 'before' : 'after', chars: o.chars, ...(o.props ? { props: o.props } : {}), ...(nextFid !== undefined ? { next: nextFid } : {}), ...(cell ? { cell } : {}) });
    }
  };
  const known = new Set(map.fragments.map((f) => f.id));
  // Text the book no longer has is read into fragments nothing looks at.
  if (foreign) for (const id of foreign) known.add(id);
  // A bookmark an editor renamed stands for its fragment when no bookmark
  // keeps the fragment's own name, and only the first such one does.
  const named = new Set<string>();
  for (const tok of tokens) if (tok.t === 'bmStart' && !tok.renamed) named.add(tok.fid);

  for (const tok of tokens) {
    switch (tok.t) {
      case 'bmStart': {
        if (!known.has(tok.fid)) break;
        if (tok.renamed) {
          if (named.has(tok.fid)) break;
          named.add(tok.fid);
        }
        boxesWithMarks.add(tok.box);
        if (tok.tbl !== undefined) tableOf.set(tok.fid, tok.tbl);
        // Text held behind a generated fragment: the book's own text
        // opens here and takes it, anything else leaves it where it was.
        if (pending?.after !== undefined && (pending.para !== tok.para || generated.has(tok.fid) || blank(pending.chars))) releaseHeld();
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
        flushOrphans(tok.box, tok.fid);
        sectSeen = false;
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
        const top = open[open.length - 1]?.fid;
        const closed = top === undefined ? lastClosedIn.get(tok.para) : undefined;
        if (closed !== undefined && generated.has(closed)) {
          if (!pending || pending.para !== tok.para || pending.after !== closed) pending = { para: tok.para, chars: [], dels: 0, after: closed, at: [] };
          if (tok.t === 'del') {
            pending.dels++;
            pending.at!.push(pending.chars.length);
          } else pending.chars.push(tok);
          break;
        }
        const fid = top ?? closed;
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
        releaseHeld();
        const top = open[open.length - 1];
        if (top && top.depth === tok.depth) {
          frag(top.fid).chars.push({ ch: PARA_CHAR, flags: '' });
        } else if (pending && pending.para === tok.para) {
          orphan.push({ chars: pending.chars, box: tok.box, afterSect: sectSeen, ...(tok.props ? { props: tok.props } : {}), ...(tok.tbl !== undefined ? { tbl: tok.tbl } : {}) });
          pending = undefined;
        }
        if (chapterSections && tok.props?.sect && !open.length) sectSeen = true;
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
  // A paragraph still waiting when its part ends (a note without any
  // bookmark) is a stray too.
  releaseHeld();
  if (pending && pending.chars.length) orphan.push({ chars: pending.chars, box: -1, afterSect: false });
  flushOrphans();
  return { fragments, added, strays, marks };
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
 *  without an export map (its own, or the one given). */
export function readExportedDocx(bytes: Uint8Array, options: ReadOptions = {}): ReadDocx {
  const files = unzip(bytes);
  const map = readExportMap(files) ?? options.map;
  if (!map) throw new DocxReadError('no postext export map');
  const doc = xmlOf(files, 'word/document.xml');
  const body = child(doc, 'body');
  if (!body) throw new DocxReadError('no document part');
  const tokens: Token[] = [];
  const looks = options.looks ? styleLooks(xmlOf(files, 'word/styles.xml')) : undefined;
  const more = looks ? { looks } : {};
  const walked = walkPart(body, linksOf(files, 'word/document.xml'), tokens, 0, 0, more);
  const { noProof } = walked;
  let { nextPara: next, nextBox: box } = walked;
  // Notes typed in the editor: the writer numbers a book's notes from 1
  // with no gap, one fragment each, so a note numbered past them is new.
  // Google Docs numbers the notes again from 0 in reading order, so a
  // note typed there may take the number of one of the book's: when every
  // note of the book still stands in the file with its bookmark, a note
  // without one is new whatever its number.
  const known = new Set(map.fragments.map((f) => f.id));
  const noteFragments = new Set(map.fragments.filter((f) => f.role === 'footnote').map((f) => f.id));
  const exportedNotes = noteFragments.size;
  const newNotes = new Map<string, ReadChar[]>();
  const unmarked: { key: string; id: number; own: Token[] }[] = [];
  const standing = new Set<string>();
  // Notes after the body, in their part order (the semantic writer's).
  for (const [part, el] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
    const root = xmlOf(files, part);
    if (!root) continue;
    const links = linksOf(files, part);
    for (const note of children(root, el)) {
      const type = attr(note, 'type');
      if (type && type !== 'normal') continue;
      const from = tokens.length;
      ({ nextPara: next, nextBox: box } = walkPart(note, links, tokens, next, box, more));
      // A note with no bookmark of ours may have been typed in the editor.
      const own = tokens.slice(from);
      let marked = false;
      for (const t of own) {
        if (t.t !== 'bmStart' || !known.has(t.fid)) continue;
        marked = true;
        if (noteFragments.has(t.fid)) standing.add(t.fid);
      }
      if (!marked) unmarked.push({ key: `${el[0]}${attr(note, 'id') ?? ''}`, id: Number(attr(note, 'id')), own });
    }
  }
  const allStand = standing.size >= exportedNotes;
  for (const { key, id, own } of unmarked) {
    if (!(id > exportedNotes) && !allStand) continue;
    const chars: ReadChar[] = [];
    for (const t of own) {
      if (t.t === 'char') chars.push(t);
      else if (t.t === 'para' && chars.length) chars.push({ ch: ' ', flags: '' });
    }
    if (chars.some((c) => c.ch.trim())) newNotes.set(key, chars);
  }
  const { fragments, added, strays, marks } = assign(tokens, map, options.foreign);
  const holders = map.holders === true && noProof;
  return {
    map, fragments, added, strays, newNotes, styles: readParaStyles(files, (path) => xmlOf(files, path)), comments: readComments(files, marks), holders,
    ...(looks ? { caps: looks.caps } : {}),
  };
}
