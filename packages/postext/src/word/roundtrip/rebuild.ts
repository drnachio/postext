// The export map of a file that came back without it (#1458). Google Docs
// drops every custom XML part, and the map with them, yet keeps the
// file's custom properties and the fragments' bookmarks by name. The
// writer is deterministic, so the map is written again from the book: the
// same chapters, settings and resources give the same fragments under the
// same names. The properties say how the file was written (design,
// chapters) and what the book was like, so a book that changed since is
// told apart; then the import still runs, against the book as it is now.

import { unzipSync } from 'fflate';
import type { PostextConfig, Resource } from '../../types.js';
import { readExportMap, xmlPartText } from '../anchors/exportMap.js';
import { readExportTrace, traceId, type ExportTrace } from '../anchors/trace.js';
import type { ExportMap, MapFragment } from '../anchors/types.js';
import { DocxReadError } from '../docxRead/parts.js';
import { SEMANTIC_ENGINE, semanticExportMap, type SemanticDesign, type SemanticExportMap } from '../semantic/index.js';
import type { BookStart } from '../semantic/context.js';
import type { WordChapterInput } from '../semantic/types.js';
import { child, parseXml, type XmlElement } from '../xml.js';
import { alignFragments, counterOf, looseText, type Alignment, type Named } from './align.js';
import { assign } from './read.js';
import { LOOK_CAPS, LOOK_HIDDEN } from './looks.js';
import { selfRead, type SelfRead } from './selfRead.js';
import type { DocxImportNote } from './types.js';
import { PARA_CHAR, walkPart, type Token } from './walk.js';

/** The book a file is imported into, as the writer takes it: every
 *  chapter, the settings, the resources and their files. */
export interface DocxBook {
  chapters: WordChapterInput[];
  config: PostextConfig;
  resources?: Resource[];
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  rasterizeSvg?: (svg: string, widthPx: number, heightPx: number) => Promise<Uint8Array | undefined>;
  /** Where the book starts when it continues a longer one. */
  start?: BookStart;
}

/** A map written again from the book, and what goes with it. */
export interface RebuiltMap extends SelfRead {
  map: ExportMap;
  /** Fragments of the map the file holds no text for, because the book
   *  changed since the export: they are left alone. */
  unplaced: Set<string>;
  /** Bookmarks of the file whose text the book no longer has. */
  foreign: Set<string>;
  notes: DocxImportNote[];
}

type Files = Record<string, Uint8Array>;

function parsed(files: Files, path: string): XmlElement | undefined {
  const bytes = files[path];
  if (!bytes) return undefined;
  try {
    return parseXml(xmlPartText(bytes));
  } catch {
    return undefined;
  }
}

/** The text between every `_ptx_` bookmark of the file, by fragment id. */
function fileBookmarks(files: Files): Map<string, string> {
  const tokens: Token[] = [];
  const body = child(parsed(files, 'word/document.xml'), 'body');
  if (!body) return new Map();
  let { nextPara: next, nextBox: box } = walkPart(body, {}, tokens);
  for (const [part, el] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
    for (const note of parsed(files, part)?.children ?? []) {
      if (typeof note === 'string' || !note.name.endsWith(el)) continue;
      ({ nextPara: next, nextBox: box } = walkPart(note, {}, tokens, next, box));
    }
  }
  const ids = new Set<string>();
  for (const t of tokens) if (t.t === 'bmStart') ids.add(t.fid);
  const fragments = [...ids].map((id) => ({ id, block: id, part: 0, target: { kind: 'generated' as const }, text: '', map: [], range: [0, 0] as [number, number] }));
  const read = assign(tokens, { version: 1, exportId: '', variant: 'semantic', engine: '', createdAt: '', chapters: [], fragments });
  const out = new Map<string, string>();
  for (const [id, f] of read.fragments) {
    if (f.startPara < 0) continue;
    out.set(id, f.chars.map((c) => c.ch).join('').replaceAll(PARA_CHAR, ' '));
  }
  return out;
}

/** How many of the file's bookmarks a map names with the text they hold. */
function score(map: ExportMap, file: ReadonlyMap<string, string>): number {
  let n = 0;
  for (const f of map.fragments) {
    const got = file.get(f.id);
    if (got !== undefined && looseText(got) === looseText(f.text)) n++;
  }
  return n;
}

/**
 * How many of the file's bookmarks hold their fragment's text letter for
 * letter, as an editor without a mark for capitals or for hidden text
 * leaves it: the capitals typed out, the hidden text gone. Tells two
 * designs apart that hold the same words.
 */
function exactScore(built: SemanticExportMap, own: SelfRead, file: ReadonlyMap<string, string>): number {
  const tight = (t: string): string => t.replace(/\s+/gu, ' ').trim();
  let n = 0;
  for (const f of built.map.fragments) {
    const looks = own.looks.get(f.id);
    const got = file.get(f.id);
    if (!looks) continue;
    let shown = '';
    for (let i = 0; i < f.text.length; i++) {
      if (looks[i]!.includes(LOOK_HIDDEN)) continue;
      const up = f.text[i]!.toUpperCase();
      shown += looks[i]!.includes(LOOK_CAPS) && up.length === 1 ? up : f.text[i]!;
    }
    if (tight(got ?? '') === tight(shown)) n++;
  }
  return n;
}

/** The chapter of the book the file most likely is, for a file that does
 *  not say: the one holding most of the file's longer texts. */
function likelyChapter(chapters: readonly WordChapterInput[], file: ReadonlyMap<string, string>): WordChapterInput | undefined {
  const texts = [...file.values()].map((t) => t.trim()).filter((t) => t.length >= 24).slice(0, 400);
  let best: WordChapterInput | undefined;
  let most = 0;
  for (const c of chapters) {
    let n = 0;
    for (const t of texts) if (c.markdown.includes(t)) n++;
    if (n > most) {
      most = n;
      best = c;
    }
  }
  return best;
}

const inOrder = (xs: readonly Named[]): Named[] => [...xs].sort((a, b) => counterOf(a.id) - counterOf(b.id));

/** Match the rebuilt fragments with the file's bookmarks, chapter by
 *  chapter when the file says where each chapter's fragments start. */
function align(built: SemanticExportMap, trace: ExportTrace | undefined, file: ReadonlyMap<string, string>, sameSetting: boolean): Alignment {
  const out: Alignment = { ids: new Map(), unplaced: new Set(), foreign: new Set() };
  const r = inOrder(built.map.fragments);
  const f = inOrder([...file].map(([id, text]) => ({ id, text })));
  const was = trace?.chapters;
  const now = built.trace.chapters ?? [];
  if (!was) return alignFragments(r, f, out);
  const end = (list: readonly { first: number }[], k: number, total: number): number => (k + 1 < list.length ? list[k + 1]!.first : total);
  const total = trace?.fragments ?? Infinity;
  const claimed = new Set<number>();
  now.forEach((c, k) => {
    const j = was.findIndex((w, at) => w.id === c.id && !claimed.has(at));
    const mine = r.filter((x) => counterOf(x.id) >= c.first && counterOf(x.id) < end(now, k, Infinity));
    if (j < 0) {
      for (const x of mine) out.unplaced.add(x.id);
      return;
    }
    claimed.add(j);
    const from = was[j]!.first;
    const to = end(was, j, total);
    const theirs = f.filter((x) => counterOf(x.id) >= from && counterOf(x.id) < to);
    // A chapter that stands as it did keeps its names, moved along with
    // whatever the chapters before it gained or lost: the fragments the
    // file lacks were deleted in it. The same holds when a setting or a
    // resource changed and every text still stands where it stood.
    const shift = (): void => {
      const have = new Set(theirs.map((x) => x.id));
      for (const x of mine) {
        const id = (counterOf(x.id) - c.first + from).toString(36);
        out.ids.set(x.id, id);
        have.delete(id);
      }
      for (const id of have) out.foreign.add(id);
    };
    const sameText = was[j]!.text === c.text && to - from === end(now, k, built.map.fragments.length) - c.first;
    if (sameText && sameSetting) return shift();
    const found = alignFragments(mine, theirs);
    if (sameText && found.foreign.size === 0 && [...found.ids].every(([a, b]) => counterOf(a) - c.first === counterOf(b) - from)) return shift();
    for (const [a, b] of found.ids) out.ids.set(a, b);
    for (const id of found.unplaced) out.unplaced.add(id);
    for (const id of found.foreign) out.foreign.add(id);
  });
  was.forEach((w, j) => {
    if (claimed.has(j)) return;
    for (const x of f) if (counterOf(x.id) >= w.first && counterOf(x.id) < end(was, j, total)) out.foreign.add(x.id);
  });
  return out;
}

/** The map with its fragments under the names the file knows them by. */
function renamed(map: ExportMap, a: Alignment): ExportMap {
  const fragments: MapFragment[] = map.fragments.map((f) => ({ ...f, id: a.ids.get(f.id) ?? `~${f.id}` }));
  return { ...map, fragments };
}

/**
 * Write again, from the book, the export map of a file that came back
 * without one. Undefined when the file carries its map, when it is no
 * flow export of postext at all (no property naming an export and no
 * `_ptx_` bookmark; the page facsimile cannot be written again without
 * its layout), and when the book holds none of its text (it was exported
 * from another book). Throws DocxReadError for a file that is no .docx.
 */
export async function rebuildExportMap(bytes: Uint8Array, book: DocxBook): Promise<RebuiltMap | undefined> {
  let files: Files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new DocxReadError('not a zip');
  }
  if (readExportMap(files) !== undefined) return undefined;
  const trace = readExportTrace(files);
  const file = fileBookmarks(files);
  if ((!trace && file.size === 0) || trace?.variant === 'formatted' || book.chapters.length === 0) return undefined;

  const notes: DocxImportNote[] = [{ code: 'map-rebuilt' }];
  const write = (chapters: WordChapterInput[], design: SemanticDesign): Promise<SemanticExportMap> =>
    semanticExportMap({
      chapters,
      config: book.config,
      design,
      ...(book.resources ? { resources: book.resources } : {}),
      ...(book.resourceBytes ? { resourceBytes: book.resourceBytes } : {}),
      ...(book.rasterizeSvg ? { rasterizeSvg: book.rasterizeSvg } : {}),
      ...(book.start && chapters[0] === book.chapters[0] ? { start: book.start } : {}),
      ...(trace?.exportId ? { exportId: trace.exportId } : {}),
      date: '1980-01-01T00:00:00.000Z',
    });

  // The chapters the file was exported with, by the ids it lists.
  let chapters = book.chapters;
  let listed = false;
  if (trace?.chapters) {
    const ids = new Set(trace.chapters.map((c) => c.id));
    const found = book.chapters.filter((c) => ids.has(traceId(c.id)));
    if (found.length > 0) {
      chapters = found;
      listed = true;
      if (found.length < ids.size) notes.push({ code: 'chapters-missing', count: ids.size - found.length });
    }
  }
  const designs: SemanticDesign[] = trace?.design ? [trace.design] : ['book', 'plain'];
  let best: { built: SemanticExportMap; score: number; own?: SelfRead } | undefined;
  const attempt = async (list: WordChapterInput[], design: SemanticDesign): Promise<void> => {
    const built = await write(list, design);
    const s = score(built.map, file);
    if (best && s === best.score) {
      // The same words in both designs: the one whose capitals and hidden
      // text the file shows.
      best.own ??= selfRead(best.built.map, best.built.parts);
      const own = selfRead(built.map, built.parts);
      if (exactScore(built, own, file) > exactScore(best.built, best.own, file)) best = { built, score: s, own };
    } else if (!best || s > best.score) best = { built, score: s };
  };
  for (const design of designs) await attempt(chapters, design);
  // A file that names no chapters and fits the whole book badly may be
  // one chapter of it (the Sandbox exports the chapter on screen too).
  if (!listed && book.chapters.length > 1 && best && best.score < file.size / 2) {
    const one = likelyChapter(book.chapters, file);
    if (one) await attempt([one], best.built.map.design ?? 'book');
  }
  if (!best) return undefined;
  const { built } = best;

  // Whether the book stands as it did at the export: the file says what
  // it was like, and the names still fit the texts (a writer that changed
  // under the same name shifts them).
  const now = built.trace;
  const said = trace?.text !== undefined;
  const sameSetting = said && trace!.resources === now.resources && trace!.config === now.config && trace!.engine === SEMANTIC_ENGINE;
  const same = sameSetting && trace!.text === now.text && trace!.fragments === now.fragments;
  const named = built.map.fragments.reduce((n, f) => n + (file.has(f.id) ? 1 : 0), 0);
  const fits = named > 0 && best.score >= named * 0.9;
  // A file that says the book stands as it did, or says nothing, is read
  // name by name while the names fit the texts.
  const trusted = same || !said;
  let alignment: Alignment | undefined;
  if (!(fits && trusted)) {
    alignment = align(built, trace, file, sameSetting);
    // Every name found its own text after all (a short file, much edited).
    if (trusted && alignment.foreign.size === 0 && [...alignment.ids].every(([a, b]) => a === b)) alignment = undefined;
  }
  if (!alignment) {
    // The fragments the file lacks were deleted in it, or lost by its
    // editor, as in a book that did not change.
    if (!said) notes.push({ code: 'book-unverified' });
  } else {
    const left = { unplaced: alignment.unplaced.size, foreign: alignment.foreign.size };
    if (said && !same) {
      if (trace!.engine !== SEMANTIC_ENGINE) notes.push({ code: 'writer-changed' });
      const was = new Map((trace!.chapters ?? []).map((c) => [c.id, c.text]));
      const changed = chapters.filter((c, k) => was.has(traceId(c.id)) && was.get(traceId(c.id)) !== now.chapters?.[k]?.text).map((c) => c.id);
      notes.push({ code: 'book-changed', chapters: changed, ...left });
    } else if (said) {
      notes.push({ code: 'writer-changed', ...left });
    } else {
      notes.push({ code: 'book-changed', unverified: true, ...left });
    }
  }
  // A file none of whose passages the book holds was exported from
  // another book.
  const placed = alignment ? alignment.ids.size : named;
  if (file.size > 0 && placed === 0) return undefined;
  const own = best.own ?? selfRead(built.map, built.parts);
  if (!alignment) return { map: built.map, ...own, unplaced: new Set(), foreign: new Set(), notes };
  const map = renamed(built.map, alignment);
  const looks = new Map<string, string[]>();
  built.map.fragments.forEach((f, k) => {
    const l = own.looks.get(f.id);
    if (l) looks.set(map.fragments[k]!.id, l);
  });
  return { map, looks, furniture: own.furniture, unplaced: new Set([...alignment.unplaced].map((id) => `~${id}`)), foreign: alignment.foreign, notes };
}
