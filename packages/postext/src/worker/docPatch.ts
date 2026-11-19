// A document sent in pieces (#1642). After a build with tapes most pages
// of a chapter are the pages of the document sent before: unchanged, or
// with their places in the source moved by the edit. The worker names
// those by their place in that document and sends the others; the client
// puts the document together from the one it holds.

import type { VDTDocument } from '../vdt.js';
import { moveSourcePlaces, movesMadeOn } from '../pipeline/build/passMade.js';

/** The pages and blocks of the document last sent, as the worker holds
 *  them, and the number it was sent under. */
export interface SentDocument {
  seq: number;
  pages: readonly object[];
  blocks: readonly object[];
}

/** A move of the places in the source: those at or after `at`, by `delta`. */
interface Move { at: number; delta: number }

/** A document as it differs from the one sent under `base`. */
export interface DocumentPatch {
  base: number;
  /** Each page: its place in the document before, or the page. */
  pages: (number | object)[];
  /** Each block of the document's list, likewise. */
  blocks: (number | object)[];
  /** The moves made since on pages and blocks kept from the document
   *  before, in order, with the places (in that document) of what each
   *  list was made on. */
  moves: { list: Move[]; pages: number[]; blocks: number[] }[];
  /** The rest of the document: `pages` and `blocks` hold nothing. */
  rest: VDTDocument;
}

/** What is told the pages and blocks of `doc` have had done since they
 *  were last sent is forgotten: `doc` goes out whole. */
export function sentWhole(doc: VDTDocument, seq: number): SentDocument {
  for (const page of doc.pages) movesMadeOn(page);
  for (const block of doc.blocks) movesMadeOn(block);
  return { seq, pages: [...doc.pages], blocks: [...doc.blocks] };
}

/** `doc` as it differs from the document sent as `sent`. */
export function makeDocumentPatch(doc: VDTDocument, sent: SentDocument): DocumentPatch {
  const pageAt = new Map<object, number>(sent.pages.map((page, i) => [page, i]));
  const blockAt = new Map<object, number>(sent.blocks.map((block, i) => [block, i]));
  // The moves, by list: the pages and blocks a pass took share theirs.
  const moves = new Map<string, DocumentPatch['moves'][number]>();
  const note = (object: object, kind: 'pages' | 'blocks', at: number): void => {
    const made = movesMadeOn(object);
    if (!made || made.length === 0) return;
    const key = made.map((m) => `${m.at}:${m.delta}`).join(',');
    let entry = moves.get(key);
    if (!entry) moves.set(key, (entry = { list: made, pages: [], blocks: [] }));
    entry[kind].push(at);
  };
  const pages = doc.pages.map((page) => {
    const at = pageAt.get(page);
    if (at === undefined) {
      movesMadeOn(page);
      return page;
    }
    note(page, 'pages', at);
    return at;
  });
  const blocks = doc.blocks.map((block) => {
    const at = blockAt.get(block);
    if (at === undefined) {
      movesMadeOn(block);
      return block;
    }
    note(block, 'blocks', at);
    return at;
  });
  return { base: sent.seq, pages, blocks, moves: [...moves.values()], rest: { ...doc, pages: [], blocks: [] } };
}

/**
 * The document `patch` describes, from `base`, the document it differs
 * from as the client holds it. `base` is used up: its unchanged pages are
 * the new document's, and the moved ones are moved in place.
 */
export function applyDocumentPatch(patch: DocumentPatch, base: VDTDocument): VDTDocument {
  for (const { list, pages, blocks } of patch.moves) {
    for (const { at, delta } of list) {
      const seen = new Set<object>();
      for (const i of pages) moveSourcePlaces(base.pages[i], at, delta, seen);
      for (const i of blocks) moveSourcePlaces(base.blocks[i], at, delta, seen);
    }
  }
  const doc = patch.rest;
  doc.pages = patch.pages.map((page) => (typeof page === 'number' ? base.pages[page]! : page as VDTDocument['pages'][number]));
  doc.blocks = patch.blocks.map((block) => (typeof block === 'number' ? base.blocks[block]! : block as VDTDocument['blocks'][number]));
  return doc;
}
