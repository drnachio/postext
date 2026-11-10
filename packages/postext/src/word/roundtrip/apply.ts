// The importer: read the exported file, diff every block against what the
// map says was exported, turn the hunks into source edits, merge them into
// the current book and report each one.

import type { Resource } from '../../types/resources/resources.js';
import { addedEdits } from './added.js';
import { buildBlocks, withLineSpaces, type BlockView } from './blocks.js';
import { splitKey, withoutCode } from './markup.js';
import { diffText, mapThrough, type Hunk } from './diff.js';
import { blockHunks, hunkEdits, type SourceEdit } from './edits.js';
import { formatEdits } from './formats.js';
import { mergeText, type PlacedEdit } from './merge.js';
import { readExportedDocx, type ReadComment } from './read.js';
import { fieldName, setField, targetKey, textsOf, type TextTarget } from './targets.js';
import type { DocxComment, DocxEdit, DocxEditResult, DocxEditSource } from './types.js';
import { OBJECT_CHAR, PARA_CHAR } from './walk.js';

/** A block marker at the start of a block's source (`## `, `- `, `> `). */
const BLOCK_MARKER_RE = /^(?:#{1,6}[ \t]+|[ \t]*(?:[-*+]|\d+[.)])[ \t]+|[ \t]*>[ \t]?)/;

/** Block markers only, from a line start: `## `, `- `, `1. `, `> > `. */
const MARKERS_ONLY_RE = /^[ \t]*(?:(?:#{1,6}|[-*+]|\d+[.)]|>)[ \t]*)*$/;

/** A footnote definition's label, alone before its text on the line. */
const NOTE_LABEL_RE = /^\[\^[^\]\n]+\]:[ \t]*$/;

/** A block's range from its line start when only block markers stand
 *  before it there (a writer that maps the item text but not its `- `):
 *  deleting, merging and splitting the block need the marker. */
function withMarker(v: BlockView, base: string): void {
  const s = v.range[0];
  if (s <= 0 || s > base.length) return;
  const line = base.lastIndexOf('\n', s - 1) + 1;
  if (line < s && MARKERS_ONLY_RE.test(base.slice(line, s))) v.range = [line, v.range[1]];
}

/** Delete a whole block: its lines, and the blank line after it when a
 *  blank line (or the text start) stands before it. A list item between
 *  others, or the last one before a blank line, keeps that blank line, so
 *  the list does not run into the next paragraph. */
function blockDeletion(v: BlockView, base: string): SourceEdit {
  let [s, e] = v.range;
  // A note's `[^id]: ` label goes with its text.
  const line = base.lastIndexOf('\n', s - 1) + 1;
  if (NOTE_LABEL_RE.test(base.slice(line, s))) s = line;
  const kind = v.dels.length ? 'tracked' : 'paragraph';
  if (/\S/.test(base.slice(e))) {
    if (e === 0 || base[e - 1] !== '\n') {
      const nl = base.indexOf('\n', e);
      e = nl < 0 ? base.length : nl + 1;
    }
    const lineStart = s === 0 || base[s - 1] === '\n';
    if (lineStart && (s === 0 || /\n[ \t]*\n$/.test(base.slice(Math.max(0, s - 256), s)))) {
      while (e < base.length) {
        const n = base.indexOf('\n', e);
        const next = n < 0 ? base.length : n + 1;
        if (/\S/.test(base.slice(e, next))) break;
        e = next;
      }
    }
    return { target: v.target, start: s, end: e, text: '', kind };
  }
  // The last block: take the blank line before it, keep the final newline.
  while (s > 0 && /\s/.test(base[s - 1]!)) s--;
  return { target: v.target, start: s, end: base.length, text: s > 0 && base.endsWith('\n') ? '\n' : '', kind };
}

/** Join two paragraphs the user merged in Word. */
function mergeEdit(a: BlockView, b: BlockView, base: string): SourceEdit {
  const s = a.range[1];
  let e = b.range[0];
  const m = BLOCK_MARKER_RE.exec(base.slice(e, e + 16));
  if (m) e += m[0].length;
  return { target: a.target, start: s, end: Math.max(s, e), text: '', kind: 'paragraph' };
}

const emptied = (v: BlockView): boolean => v.missing || (!/\S/.test(v.N.replaceAll(PARA_CHAR, '')) && !v.NT.some((t) => t !== undefined));

interface BlockResult {
  edits: SourceEdit[];
  hunks: Hunk[];
}

function editsOfBlock(v: BlockView, base: string): BlockResult {
  if (v.target.kind === 'generated') {
    const changed = v.O !== v.N || v.OK.some((k, i) => k !== v.NK[i]);
    const edits: SourceEdit[] = changed ? [{ target: v.target, start: -1, end: -1, text: v.N.replaceAll(PARA_CHAR, '\n'), kind: 'text', reject: 'generated', before: v.O }] : [];
    return { edits, hunks: [] };
  }
  if (emptied(v)) return { edits: v.O.trim() || v.O.includes(OBJECT_CHAR) ? [blockDeletion(v, base)] : [], hunks: [] };
  const hunks = blockHunks(v, base);
  const edits = hunks.flatMap((h) => hunkEdits(v, base, h));
  edits.push(...formatEdits(v, base, hunks));
  return { edits, hunks };
}

/** The generated texts (label, video link line) that went with a figure
 *  deleted whole: missing blocks in one run, in reading order, with a
 *  removed resource field. The figure's own report covers them. */
function removedLabels(blocks: readonly BlockView[], isRemoved: (v: BlockView) => boolean): Set<BlockView> {
  const out = new Set<BlockView>();
  for (let k = 0; k < blocks.length; ) {
    let e = k;
    while (e < blocks.length && blocks[e]!.missing && (blocks[e]!.target.kind === 'generated' || isRemoved(blocks[e]!))) e++;
    const run = blocks.slice(k, e);
    if (run.some(isRemoved)) for (const v of run) if (v.target.kind === 'generated') out.add(v);
    k = Math.max(e, k + 1);
  }
  return out;
}

/**
 * Blocks whose bookmarks an editor dropped while their paragraph still
 * stands in the file word for word (#1458): one block, or a few in a row
 * that shared a paragraph (a heading and its number). They were not
 * deleted, and nothing in them was edited: the import leaves their source
 * alone and does not read the paragraph as one the user typed.
 */
function bookmarksLost(blocks: readonly BlockView[], read: { strays: readonly string[]; added: { chars: readonly { ch: string }[] }[] }): Set<BlockView> {
  const out = new Set<BlockView>();
  if (!read.strays.length) return out;
  const strays = new Map<string, number>();
  for (const s of read.strays) strays.set(s, (strays.get(s) ?? 0) + 1);
  const taken = new Map<string, number>();
  for (let k = 0; k < blocks.length; k++) {
    if (!blocks[k]!.missing) continue;
    let text = '';
    for (let e = k; e < blocks.length && e < k + 4 && blocks[e]!.missing; e++) {
      text += blocks[e]!.O;
      const key = text.replaceAll(PARA_CHAR, ' ').trim();
      if (!key || !strays.get(key)) continue;
      strays.set(key, strays.get(key)! - 1);
      taken.set(key, (taken.get(key) ?? 0) + 1);
      for (let i = k; i <= e; i++) out.add(blocks[i]!);
      k = e;
      break;
    }
  }
  if (out.size) {
    // The paragraphs themselves are not additions.
    for (let i = read.added.length - 1; i >= 0; i--) {
      const key = read.added[i]!.chars.map((c) => c.ch).join('').trim();
      if (!taken.get(key)) continue;
      taken.set(key, taken.get(key)! - 1);
      read.added.splice(i, 1);
    }
  }
  return out;
}

/**
 * The text blocks of a chapter that stand in another order than they were
 * exported in (a paragraph cut and pasted elsewhere, its bookmark with
 * it): the fewest that, taken out, leave the others in order. Notes are
 * read after the body and keep their own order.
 */
function movedBlocks(blocks: readonly BlockView[]): BlockView[] {
  const out: BlockView[] = [];
  const groups = new Map<string, BlockView[]>();
  for (const v of blocks) {
    if (v.target.kind !== 'markdown' || v.missing || v.startPara < 0) continue;
    const key = `${v.target.chapter}|${v.frags[0]?.role === 'footnote' ? 'n' : 'b'}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(v);
  }
  for (const g of groups.values()) {
    // Longest run of blocks whose paragraphs go on in order.
    const best: number[] = new Array<number>(g.length).fill(1);
    const prev: number[] = new Array<number>(g.length).fill(-1);
    let end = -1;
    for (let i = 0; i < g.length; i++) {
      for (let j = 0; j < i; j++) {
        if (g[j]!.startPara <= g[i]!.startPara && best[j]! + 1 > best[i]!) {
          best[i] = best[j]! + 1;
          prev[i] = j;
        }
      }
      if (end < 0 || best[i]! > best[end]!) end = i;
    }
    const kept = new Set<number>();
    for (let i = end; i >= 0; i = prev[i]!) kept.add(i);
    g.forEach((v, i) => {
      if (!kept.has(i)) out.push(v);
    });
  }
  return out;
}

/** Index in the exported text of position `j` of the text read back. */
function backThrough(hunks: readonly Hunk[], j: number): number {
  let delta = 0;
  for (const h of hunks) {
    if (j < h.b0) break;
    if (j < h.b1) return h.a0;
    delta = h.a1 - h.b1;
  }
  return j + delta;
}

function commentSource(v: BlockView, hunks: readonly Hunk[], fid: string, index: number, end: boolean): number {
  const i = backThrough(hunks, (v.starts.get(fid) ?? 0) + index);
  if (end) {
    for (let k = Math.min(i, v.O.length) - 1; k >= 0; k--) if (v.M[k]! >= 0) return v.M[k]! + 1;
  } else {
    for (let k = i; k < v.O.length; k++) if (v.M[k]! >= 0) return v.M[k]!;
  }
  return end ? v.range[1] : v.range[0];
}

/**
 * Re-import the corrections made in Word to a file a postext Word writer
 * exported (`isExportedDocx`). Every chapter of `current` is returned,
 * with the edits applied where they could be placed; the report lists
 * each edit (applied, in conflict with a change made since the export, or
 * rejected) and every comment with its source range. Throws DocxReadError
 * for a broken file or one without an export map.
 */
export function applyDocxEdits(bytes: Uint8Array, current: DocxEditSource): DocxEditResult {
  const read = readExportedDocx(bytes);
  const { map } = read;
  const blocks = buildBlocks(map.fragments, read.fragments, read.holders);
  const byTarget = new Map<string, { target: TextTarget; edits: SourceEdit[] }>();
  const generated: SourceEdit[] = [];
  const hunksOf = new Map<BlockView, Hunk[]>();
  const add = (e: SourceEdit): void => {
    if (e.target.kind === 'generated') {
      generated.push(e);
      return;
    }
    const key = targetKey(e.target);
    let g = byTarget.get(key);
    if (!g) byTarget.set(key, (g = { target: e.target, edits: [] }));
    g.edits.push(e);
  };
  const lost = map.fragments.length > 0 && read.fragments.size === 0;
  // Texts per target, once (a chapter without a snapshot is hashed).
  const texts = new Map<string, { base?: string; ours?: string }>();
  const textsFor = (t: TextTarget): { base?: string; ours?: string } => {
    const key = targetKey(t);
    let got = texts.get(key);
    if (!got) texts.set(key, (got = textsOf(t, map, current)));
    return got;
  };
  const baseOf = (v: BlockView): string => (v.target.kind === 'generated' ? '' : textsFor(v.target).base ?? '');
  if (!lost) {
    for (const v of blocks) {
      if (v.target.kind === 'generated') continue;
      withLineSpaces(v, baseOf(v));
      if (v.target.kind === 'markdown') withMarker(v, baseOf(v));
    }
    // A figure deleted whole in Word leaves every block of its resource
    // without a bookmark. The resource still stands in the book (a :ref
    // floats it, or a block the user did not touch shows it), so emptying
    // its caption and cells would only print a blank figure: report one
    // rejected edit per resource instead. A single field removed while the
    // figure stays is still read as that field emptied.
    const unmarked = bookmarksLost(blocks, read);
    // A file that comes back with no code at all, from a book that had
    // some, went through an editor that keeps no character styles: code is
    // then no longer told from text, and none of it counts as changed.
    const codeChars = (keys: readonly string[]): number => keys.reduce((n, k) => n + (splitKey(k).flags.includes('k') ? 1 : 0), 0);
    if (blocks.reduce((n, v) => n + (v.missing ? 0 : codeChars(v.OK)), 0) >= 12 && !blocks.some((v) => codeChars(v.NK) > 0)) {
      for (const v of blocks) v.OK = v.OK.map(withoutCode);
    }
    const absorbed = new Set<BlockView>();
    const kept = new Set(blocks.filter((v) => v.target.kind === 'resource' && (!v.missing || unmarked.has(v))).map((v) => (v.target as { resourceId: string }).resourceId));
    const isRemoved = (v: BlockView): boolean => v.target.kind === 'resource' && v.missing && !kept.has(v.target.resourceId);
    const withFigure = removedLabels(blocks, isRemoved);
    const removed = new Set<string>();
    for (let k = 0; k < blocks.length; k++) {
      const v = blocks[k]!;
      const base = baseOf(v);
      if (withFigure.has(v) || unmarked.has(v) || absorbed.has(v)) continue;
      if (v.target.kind === 'resource' && isRemoved(v)) {
        if (!removed.has(v.target.resourceId)) {
          removed.add(v.target.resourceId);
          add({ target: v.target, start: -1, end: -1, text: '', kind: 'paragraph', reject: 'resource-removed', before: v.O });
        }
        continue;
      }
      const r = editsOfBlock(v, base);
      hunksOf.set(v, r.hunks);
      r.edits.forEach(add);
      // A paragraph merged into the next one in Word, the paragraphs
      // deleted between the two going with the join.
      if (v.target.kind !== 'markdown' || emptied(v) || v.endPara < 0) continue;
      const sameChapter = (b: BlockView | undefined): b is BlockView => !!b && b.target.kind === 'markdown' && b.target.chapter === (v.target as { chapter: number }).chapter;
      let n = k + 1;
      while (sameChapter(blocks[n]) && emptied(blocks[n]!) && !unmarked.has(blocks[n]!) && blocks[n]!.range[0] >= v.range[1]) n++;
      const next = blocks[n];
      if (sameChapter(next) && !emptied(next) && v.endPara === next.startPara && (n === k + 1 || next.range[0] >= v.range[1])) {
        add(mergeEdit(v, next, base));
        for (let j = k + 1; j < n; j++) absorbed.add(blocks[j]!);
      }
    }
    // Paragraphs moved in Word: the import does not move their source.
    for (const v of movedBlocks(blocks)) {
      if (unmarked.has(v)) continue;
      add({ target: v.target, start: v.range[0], end: v.range[0], text: '', kind: 'paragraph', reject: 'moved', before: v.O });
    }
    // Paragraphs typed outside every bookmark.
    addedEdits(read.added, blocks, baseOf, read.styles).forEach(add);
  }

  const edits: DocxEdit[] = [];
  const chapters = current.chapters.map((c) => ({ ...c }));
  let resources: Resource[] | undefined;
  const transforms = new Map<string, (pos: number) => number>();
  const report = (p: PlacedEdit, t: SourceEdit['target']): DocxEdit => {
    const out: DocxEdit = { start: p.start, end: p.end, before: p.before, after: p.edit.text, kind: p.edit.kind, status: p.status };
    if (p.reason) out.reason = p.reason;
    if (t.kind === 'markdown') out.chapter = map.chapters[t.chapter]?.id;
    else if (t.kind === 'resource') {
      out.resourceId = t.resourceId;
      out.field = fieldName(t);
    }
    return out;
  };
  for (const { target, edits: list } of byTarget.values()) {
    const { base, ours } = textsFor(target);
    const { text, placed, hunks } = mergeText(base, ours, list);
    for (const p of placed) edits.push(report(p, target));
    if (hunks) transforms.set(targetKey(target), (pos) => mapThrough(hunks, pos));
    if (text === undefined || text === ours || !placed.some((p) => p.status === 'applied')) continue;
    if (target.kind === 'markdown') {
      const id = map.chapters[target.chapter]?.id;
      const ch = chapters.find((c) => c.id === id);
      if (ch) ch.markdown = text;
    } else {
      resources ??= JSON.parse(JSON.stringify(current.resources ?? [])) as Resource[];
      const res = resources.find((r) => r.id === target.resourceId);
      if (res) setField(res, target, text);
    }
  }
  for (const g of generated) edits.push({ start: -1, end: -1, before: g.before ?? '', after: g.text, kind: g.kind, status: 'rejected', reason: 'generated' });
  if (lost) edits.push({ start: -1, end: -1, before: '', after: '', kind: 'text', status: 'rejected', reason: 'bookmarks-lost' });

  // A comment on a text the user did not edit still moves with the
  // changes made to the source since the export.
  const moveFor = (t: TextTarget): ((pos: number) => number) | undefined => {
    const key = targetKey(t);
    if (!transforms.has(key)) {
      const { base, ours } = textsFor(t);
      if (base === undefined || ours === undefined) return undefined;
      const hunks = base === ours ? [] : diffText(base, ours);
      transforms.set(key, (pos) => mapThrough(hunks, pos));
    }
    return transforms.get(key);
  };
  const comments = read.comments.map((c) => placeComment(c, blocks, hunksOf, map.chapters.map((ch) => ch.id), moveFor));
  return {
    variant: map.variant,
    exportId: map.exportId,
    chapters,
    ...(resources ? { resources } : {}),
    edits,
    comments,
    changed: edits.some((e) => e.status === 'applied'),
  };
}

function placeComment(c: ReadComment, blocks: readonly BlockView[], hunksOf: Map<BlockView, Hunk[]>, chapterIds: string[], moveFor: (t: TextTarget) => ((pos: number) => number) | undefined): DocxComment {
  const out: DocxComment = { start: -1, end: -1, text: c.text };
  if (c.author) out.author = c.author;
  const pos = c.start ?? c.end;
  if (!pos) return out;
  const v = blocks.find((b) => b.starts.has(pos.fid));
  if (!v || v.target.kind === 'generated') return out;
  const hunks = hunksOf.get(v) ?? [];
  let s = commentSource(v, hunks, pos.fid, pos.index, false);
  const endPos = c.end && blocks.find((b) => b.starts.has(c.end!.fid)) === v ? c.end : pos;
  let e = Math.max(s, commentSource(v, hunks, endPos.fid, endPos.index, true));
  const move = moveFor(v.target);
  if (move) {
    s = move(s);
    e = move(e);
  }
  out.start = s;
  out.end = e;
  if (v.target.kind === 'markdown') out.chapter = chapterIds[v.target.chapter];
  else out.resourceId = v.target.resourceId;
  return out;
}
