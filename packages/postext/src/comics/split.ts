/**
 * The split grammar of a comic page (`:::page{split="30 [30 | 20 | *] / *"}`,
 * #555): how the page's frame is cut into panels.
 *
 * ```
 * list := item (SEP item)*      SEP is '/' (rows, stacked top to bottom)
 *                               or '|' (columns, from the start side)
 * item := size [ '[' list ']' ]  a bracketed list splits that cell on the
 *                               other axis
 * size := number ['%'] ['~' number ['%']] | '*' | ''
 * ```
 *
 * A size is the cell's extent along its list's axis, in percent of the
 * parent cell; the split lines sit at the running sums. `*` takes an equal
 * share of what is left; an empty size is a `*`. `30~40` slants the cell's
 * far edge: 30 % at the start of the cross axis (the top, for columns; the
 * start side, for rows), 40 % at its other end. The last cell of a list
 * runs to 100 % whatever its size says.
 *
 * Everything here is pure: the parser keeps the source offsets of every
 * size so the Sandbox can rewrite one number in place, and the editing
 * functions (`moveComicSplitLine`, `splitComicCell`, `mergeComicCells`)
 * take a `split` value and return the new one.
 */

/** The axis a list splits its cell along: `'rows'` stacks tiers top to
 *  bottom, `'columns'` sets cells side by side from the start side. */
export type ComicSplitAxis = 'rows' | 'columns';

/** A size as written. */
export interface ComicSplitSize {
  /** `*`, or an empty size (`implicit`). */
  star: boolean;
  /** The size was left empty (`[*|*] / *`): a `*` that serialises as
   *  nothing. */
  implicit?: boolean;
  /** Percent at the start end. Unset for a star. */
  start?: number;
  /** Percent at the far end, when the size is slanted (`30~40`). */
  end?: number;
  /** Written with a `%` sign. */
  percent?: boolean;
  /** Offsets of the size in the source (empty at the item's start for an
   *  implicit size). */
  sourceStart: number;
  sourceEnd: number;
}

/** One cell of a list, with the list that splits it further. */
export interface ComicSplitItem {
  size: ComicSplitSize;
  children?: ComicSplitList;
  sourceStart: number;
  sourceEnd: number;
}

/** A list of cells sharing one axis. A one-item list has none. */
export interface ComicSplitList {
  axis?: ComicSplitAxis;
  items: ComicSplitItem[];
  sourceStart: number;
  sourceEnd: number;
}

/** A size token with where it sits in the tree: `path` is the list's path
 *  (the indices of the items walked down from the top list), `index` the
 *  item's in that list. */
export interface ComicSplitToken {
  path: number[];
  index: number;
  size: ComicSplitSize;
}

/** Something the grammar could not read as written. */
export interface ComicSplitIssue {
  kind: 'syntax' | 'overflow';
  message: string;
  sourceStart: number;
  sourceEnd: number;
  /** `overflow`: the sum of the list's sizes (percent). */
  total?: number;
}

export interface ComicSplitParse {
  tree: ComicSplitList;
  tokens: ComicSplitToken[];
  issues: ComicSplitIssue[];
}

/** The smallest share a cell keeps (percent) when the sizes of its list
 *  overflow, and the least a drag leaves a cell. */
export const COMIC_MIN_CELL_PERCENT = 5;

const NUMBER_RE = /^[0-9]+(?:\.[0-9]*)?|^\.[0-9]+/;

/** Parse a `split` value. Never throws: what cannot be read is reported in
 *  `issues` and the rest is kept (an empty or unreadable value is one
 *  cell, a splash page). */
export function parseComicSplit(src: string): ComicSplitParse {
  const issues: ComicSplitIssue[] = [];
  const tokens: ComicSplitToken[] = [];
  let at = 0;
  const skip = (): void => {
    while (at < src.length && /\s/.test(src[at]!)) at++;
  };
  const issue = (message: string, start: number, end = start + 1): void => {
    issues.push({ kind: 'syntax', message, sourceStart: start, sourceEnd: Math.max(start, Math.min(end, src.length)) });
  };

  const parseNumber = (): number | undefined => {
    const m = NUMBER_RE.exec(src.slice(at));
    if (!m) return undefined;
    at += m[0].length;
    return Number(m[0]);
  };

  const parseSize = (): ComicSplitSize => {
    skip();
    const start = at;
    if (src[at] === '*') {
      at++;
      return { star: true, sourceStart: start, sourceEnd: at };
    }
    const a = parseNumber();
    if (a === undefined) return { star: true, implicit: true, sourceStart: start, sourceEnd: start };
    let percent = false;
    if (src[at] === '%') { at++; percent = true; }
    const size: ComicSplitSize = { star: false, start: a, sourceStart: start, sourceEnd: at };
    if (src[at] === '~') {
      at++;
      const b = parseNumber();
      if (b === undefined) {
        issue('a slant needs a number after "~"', at - 1, at);
      } else {
        if (src[at] === '%') { at++; percent = true; }
        size.end = b;
      }
    }
    if (percent) size.percent = true;
    size.sourceEnd = at;
    return size;
  };

  const parseList = (path: number[], closer: string | undefined): ComicSplitList => {
    skip();
    const list: ComicSplitList = { items: [], sourceStart: at, sourceEnd: at };
    let sep: '/' | '|' | undefined;
    for (;;) {
      skip();
      const itemStart = at;
      const index = list.items.length;
      const size = parseSize();
      skip();
      const item: ComicSplitItem = { size, sourceStart: itemStart, sourceEnd: at };
      if (src[at] === '[') {
        const open = at;
        at++;
        item.children = parseList([...path, index], ']');
        skip();
        if (src[at] === ']') at++;
        else issue('"[" is never closed', open, at);
      }
      item.sourceEnd = at;
      list.items.push(item);
      tokens.push({ path, index, size });
      // The separator after the item, past anything unreadable.
      let next: 'sep' | 'end' = 'end';
      for (;;) {
        skip();
        const c = src[at];
        if (c === '/' || c === '|') {
          if (sep === undefined) sep = c;
          else if (sep !== c) issue('a list mixes "/" and "|": put one of them inside brackets', at);
          at++;
          next = 'sep';
          break;
        }
        if (c === undefined || c === closer) break;
        // Anything else: report it and skip to the next separator or closer.
        const bad = at;
        at++;
        while (at < src.length && !'/|'.includes(src[at]!) && src[at] !== closer) at++;
        issue(`"${src.slice(bad, at).trim()}" is not a size`, bad, at);
      }
      if (next === 'end') break;
    }
    list.sourceEnd = at;
    if (sep !== undefined && list.items.length > 1) list.axis = sep === '/' ? 'rows' : 'columns';
    return list;
  };

  const tree = parseList([], undefined);
  skip();
  if (at < src.length) issue(`"${src.slice(at)}" is left over`, at, src.length);
  tokens.sort((x, y) => x.size.sourceStart - y.size.sourceStart);
  checkAxes(tree, undefined, issues);
  checkOverflow(tree, issues);
  return { tree, tokens, issues };
}

/** A bracketed list on its parent's axis (`30 [10 / 20] / *`). */
function checkAxes(list: ComicSplitList, parentAxis: ComicSplitAxis | undefined, issues: ComicSplitIssue[]): void {
  if (parentAxis !== undefined && list.axis === parentAxis) {
    issues.push({
      kind: 'syntax',
      message: `a bracketed list splits its cell on the other axis: use "${parentAxis === 'rows' ? '|' : '/'}" inside it`,
      sourceStart: list.sourceStart,
      sourceEnd: list.sourceEnd,
    });
  }
  for (const item of list.items) if (item.children) checkAxes(item.children, list.axis ?? parentAxis, issues);
}

function checkOverflow(list: ComicSplitList, issues: ComicSplitIssue[]): void {
  if (list.items.length > 1) {
    for (const end of ['start', 'end'] as const) {
      const total = list.items.reduce((sum, it) => sum + (it.size.star ? 0 : sizeAt(it.size, end)), 0);
      if (total > 100 + 1e-6) {
        issues.push({ kind: 'overflow', message: `the sizes add up to ${round1(total)} %`, total: round1(total), sourceStart: list.sourceStart, sourceEnd: list.sourceEnd });
        break;
      }
    }
  }
  for (const item of list.items) if (item.children) checkOverflow(item.children, issues);
}

function sizeAt(size: ComicSplitSize, end: 'start' | 'end'): number {
  const v = end === 'end' ? size.end ?? size.start : size.start;
  return Math.max(0, v ?? 0);
}

/** The axis a list's children split on: its own, or for a one-item list
 *  the cross axis of its parent (rows at the top). */
export function crossAxis(axis: ComicSplitAxis): ComicSplitAxis {
  return axis === 'rows' ? 'columns' : 'rows';
}

/**
 * The line positions of a list (cumulative percent of its cell) at each end
 * of the cross axis: `lines[b]` is the line between items `b` and `b + 1`.
 * Stars share what the fixed sizes leave; sizes past 100 are scaled down so
 * every star keeps {@link COMIC_MIN_CELL_PERCENT}; the last item runs to
 * 100. Lines never run backwards.
 */
export function comicSplitLines(list: ComicSplitList): { start: number[]; end: number[] } {
  return { start: linesAt(list, 'start'), end: linesAt(list, 'end') };
}

function linesAt(list: ComicSplitList, end: 'start' | 'end'): number[] {
  const sizes = resolvedSizes(list, end);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    sum += sizes[i]!;
    out.push(Math.min(100, Math.max(out[i - 1] ?? 0, sum)));
  }
  return out;
}

/** The sizes of a list's items at one end, in percent, before the last item
 *  is stretched to 100. */
function resolvedSizes(list: ComicSplitList, end: 'start' | 'end'): number[] {
  const stars = list.items.filter((it) => it.size.star).length;
  const fixed = list.items.reduce((sum, it) => sum + (it.size.star ? 0 : sizeAt(it.size, end)), 0);
  const room = 100 - stars * (stars > 0 ? COMIC_MIN_CELL_PERCENT : 0);
  const scale = fixed > (stars > 0 ? room : 100) && fixed > 0 ? (stars > 0 ? room : 100) / fixed : 1;
  const left = Math.max(0, 100 - fixed * scale);
  return list.items.map((it) => (it.size.star ? left / stars : sizeAt(it.size, end) * scale));
}

/** The list at `path` (item indices walked down from the top list). */
export function comicSplitListAt(tree: ComicSplitList, path: readonly number[]): ComicSplitList | undefined {
  let list: ComicSplitList | undefined = tree;
  for (const i of path) {
    list = list?.items[i]?.children;
    if (!list) return undefined;
  }
  return list;
}

/** Leaf cells in reading order (tree order), each with its item path. */
export function comicSplitLeaves(tree: ComicSplitList): number[][] {
  const out: number[][] = [];
  const walk = (list: ComicSplitList, path: number[]): void => {
    list.items.forEach((item, i) => {
      if (item.children && item.children.items.length > 0) walk(item.children, [...path, i]);
      else out.push([...path, i]);
    });
  };
  walk(tree, []);
  return out;
}

// ---------------------------------------------------------------------------
// Serialising
// ---------------------------------------------------------------------------

/** A number with at most one decimal, no trailing `.0`. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatNumber(n: number): string {
  return String(round1(n));
}

function formatSize(size: ComicSplitSize): string {
  if (size.star) return size.implicit ? '' : '*';
  const pct = size.percent ? '%' : '';
  const a = `${formatNumber(size.start ?? 0)}${pct}`;
  if (size.end === undefined || round1(size.end) === round1(size.start ?? 0)) return a;
  return `${a}~${formatNumber(size.end)}${pct}`;
}

/** Write a tree back as a `split` value: ` / ` between rows, ` | ` between
 *  columns, numbers with at most one decimal. */
export function serializeComicSplit(tree: ComicSplitList): string {
  const list = (l: ComicSplitList): string =>
    l.items.map(item).join(l.axis === 'columns' ? ' | ' : ' / ');
  const item = (it: ComicSplitItem): string => {
    const size = formatSize(it.size);
    if (!it.children || it.children.items.length === 0) return size === '' ? '*' : size;
    return `${size}${size === '' ? '' : ' '}[${list(it.children)}]`;
  };
  return list(tree);
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

const EPS = 0.06;

interface SizeEdit {
  index: number;
  size: ComicSplitSize;
}

/** Whether giving `edits` to the list puts its lines at the targets. */
function linesMatch(list: ComicSplitList, edits: SizeEdit[], start: number[], end: number[]): boolean {
  const items = list.items.map((it, i) => {
    const e = edits.find((x) => x.index === i);
    return e ? { ...it, size: e.size } : it;
  });
  const lines = comicSplitLines({ ...list, items });
  return lines.start.every((v, i) => Math.abs(v - start[i]!) < EPS) && lines.end.every((v, i) => Math.abs(v - end[i]!) < EPS);
}

function fixedSize(old: ComicSplitSize, a: number, b: number): ComicSplitSize {
  const size: ComicSplitSize = { star: false, start: round1(Math.max(0, a)), sourceStart: old.sourceStart, sourceEnd: old.sourceEnd };
  if (Math.abs(round1(b) - round1(a)) > 1e-9) size.end = round1(Math.max(0, b));
  if (old.percent) size.percent = true;
  return size;
}

/** The fewest size edits that put a list's lines at `start` / `end`,
 *  keeping `*` sizes where the result allows. */
function editsFor(list: ComicSplitList, start: number[], end: number[], touched: number[]): SizeEdit[] {
  const n = list.items.length;
  const want = (i: number): [number, number] => [
    (i < n - 1 ? start[i]! : 100) - (i > 0 ? start[i - 1]! : 0),
    (i < n - 1 ? end[i]! : 100) - (i > 0 ? end[i - 1]! : 0),
  ];
  const fixedEdit = (i: number): SizeEdit => {
    const [a, b] = want(i);
    return { index: i, size: fixedSize(list.items[i]!.size, a, b) };
  };
  // 1. Only the touched items that are not stars.
  const candidates: SizeEdit[][] = [];
  const nonStars = touched.filter((i) => !list.items[i]!.size.star).map(fixedEdit);
  candidates.push(nonStars);
  // 2. One touched star written out, the other kept.
  for (const i of touched) if (list.items[i]!.size.star) candidates.push([...nonStars, fixedEdit(i)]);
  // 3. Every touched item fixed.
  candidates.push(touched.map(fixedEdit));
  for (const edits of candidates) if (linesMatch(list, edits, start, end)) return edits;
  // 4. Every item fixed.
  return list.items.map((_, i) => fixedEdit(i));
}

function applyEdits(src: string, list: ComicSplitList, edits: SizeEdit[]): string {
  const sorted = [...edits].sort((x, y) => list.items[y.index]!.size.sourceStart - list.items[x.index]!.size.sourceStart);
  let out = src;
  for (const e of sorted) {
    const old = list.items[e.index]!.size;
    let text = formatSize(e.size);
    // An implicit size followed by its bracket needs a space.
    if (old.implicit && src[old.sourceEnd] === '[') text += ' ';
    out = out.slice(0, old.sourceStart) + text + out.slice(old.sourceEnd);
  }
  return out;
}

/**
 * Move the split line between children `boundary` and `boundary + 1` of the
 * list at `path` to `newPercentAtStart` (cumulative percent of the parent
 * cell). With `newPercentAtEnd` the far end goes there (a slant); without
 * it the line keeps its slant, both ends moving by the same amount. The
 * line is clamped so every cell keeps {@link COMIC_MIN_CELL_PERCENT}. Only
 * the sizes that change are rewritten, in place; `*` stays where the
 * result allows. Returns `src` unchanged when the path names no line.
 */
export function moveComicSplitLine(
  src: string,
  path: readonly number[],
  boundary: number,
  newPercentAtStart: number,
  newPercentAtEnd?: number,
): string {
  const { tree } = parseComicSplit(src);
  const list = comicSplitListAt(tree, path);
  if (!list || boundary < 0 || boundary >= list.items.length - 1) return src;
  const lines = comicSplitLines(list);
  const start = [...lines.start];
  const end = [...lines.end];
  const lo = (arr: number[]) => (boundary > 0 ? arr[boundary - 1]! : 0) + COMIC_MIN_CELL_PERCENT;
  const hi = (arr: number[]) => (boundary < arr.length - 1 ? arr[boundary + 1]! : 100) - COMIC_MIN_CELL_PERCENT;
  const clamp = (v: number, arr: number[]) => Math.max(lo(arr), Math.min(hi(arr), v));
  let s: number;
  let e: number;
  if (newPercentAtEnd === undefined) {
    const delta = newPercentAtStart - start[boundary]!;
    const minDelta = Math.max(lo(start) - start[boundary]!, lo(end) - end[boundary]!);
    const maxDelta = Math.min(hi(start) - start[boundary]!, hi(end) - end[boundary]!);
    const d = Math.max(minDelta, Math.min(maxDelta, delta));
    s = start[boundary]! + d;
    e = end[boundary]! + d;
  } else {
    s = clamp(newPercentAtStart, start);
    e = clamp(newPercentAtEnd, end);
  }
  start[boundary] = round1(s);
  end[boundary] = round1(e);
  const edits = editsFor(list, start, end, [boundary, boundary + 1]);
  return applyEdits(src, list, edits);
}

function cloneList(list: ComicSplitList): ComicSplitList {
  return {
    ...list,
    items: list.items.map((it) => ({ ...it, size: { ...it.size }, ...(it.children ? { children: cloneList(it.children) } : {}) })),
  };
}

/** The sizes of a list rewritten as fixed numbers (each end), its lines
 *  unchanged — for edits that add or remove an item. */
function sizesOf(list: ComicSplitList): { start: number; end: number }[] {
  const lines = comicSplitLines(list);
  const n = list.items.length;
  return list.items.map((_, i) => ({
    start: (i < n - 1 ? lines.start[i]! : 100) - (i > 0 ? lines.start[i - 1]! : 0),
    end: (i < n - 1 ? lines.end[i]! : 100) - (i > 0 ? lines.end[i - 1]! : 0),
  }));
}

function sizeFrom(a: number, b: number, like?: ComicSplitSize): ComicSplitSize {
  return fixedSize({ star: false, sourceStart: 0, sourceEnd: 0, ...(like?.percent ? { percent: true } : {}) }, a, b);
}

const STAR: ComicSplitSize = { star: true, sourceStart: 0, sourceEnd: 0 };

/**
 * Split the cell at `cellPath` (item indices walked down from the top list)
 * in two along `axis` (`'rows'`: one above the other). A cell whose list
 * runs along `axis` gets a sibling after it, the two sharing its size; any
 * other cell is split by a bracketed list (`30` → `30 [* | *]`). Returns the
 * new `split` value, re-serialised (`serializeComicSplit`).
 */
export function splitComicCell(src: string, cellPath: readonly number[], axis: ComicSplitAxis): string {
  const { tree } = parseComicSplit(src);
  const root = cloneList(tree);
  if (cellPath.length === 0) return src;
  const parentPath = cellPath.slice(0, -1);
  const index = cellPath[cellPath.length - 1]!;
  const list = comicSplitListAt(root, parentPath);
  const item = list?.items[index];
  if (!list || !item) return src;
  // The axis of the list above `list` (a list may not repeat it).
  const grand = parentPath.length > 0 ? comicSplitListAt(root, parentPath.slice(0, -1)) : undefined;
  const grandAxis = grand?.axis;
  const listAxis = list.axis ?? (grandAxis ? crossAxis(grandAxis) : undefined);
  if (listAxis === undefined || listAxis === axis) {
    // A sibling on the list's own axis.
    const stars = list.items.filter((it) => it.size.star).length;
    let first: ComicSplitSize;
    let second: ComicSplitSize;
    if (item.size.star && stars === 1) {
      const s = sizesOf(list)[index]!;
      first = sizeFrom(s.start / 2, s.end / 2);
      second = { ...STAR };
    } else if (item.size.star) {
      // Several stars: the others keep their share if this one is written
      // out as two halves.
      const s = sizesOf(list)[index]!;
      first = sizeFrom(s.start / 2, s.end / 2);
      second = sizeFrom(s.start / 2, s.end / 2);
    } else {
      const a = (item.size.start ?? 0) / 2;
      const b = (item.size.end ?? item.size.start ?? 0) / 2;
      first = sizeFrom(a, b, item.size);
      second = sizeFrom(a, b, item.size);
      // The last item of a list runs to 100: keep it a star when it was
      // stretched, so the line stays put.
      if (index === list.items.length - 1) {
        const s = sizesOf(list)[index]!;
        first = sizeFrom(s.start / 2, s.end / 2, item.size);
        second = { ...STAR };
      }
    }
    const firstItem: ComicSplitItem = { ...item, size: first };
    const secondItem: ComicSplitItem = { size: second, sourceStart: 0, sourceEnd: 0 };
    list.items.splice(index, 1, firstItem, secondItem);
    list.axis = axis;
    return serializeComicSplit(root);
  }
  // Across the list's axis: a bracketed list inside the cell.
  if (item.children && item.children.items.length > 1) {
    // Already split that way: one more child at the end.
    const kids = item.children;
    const last = kids.items[kids.items.length - 1]!;
    const s = sizesOf(kids)[kids.items.length - 1]!;
    kids.items[kids.items.length - 1] = { ...last, size: sizeFrom(s.start / 2, s.end / 2, last.size.star ? undefined : last.size) };
    kids.items.push({ size: { ...STAR }, sourceStart: 0, sourceEnd: 0 });
    return serializeComicSplit(root);
  }
  item.children = {
    axis,
    items: [{ size: { ...STAR }, sourceStart: 0, sourceEnd: 0 }, { size: { ...STAR }, sourceStart: 0, sourceEnd: 0 }],
    sourceStart: 0,
    sourceEnd: 0,
  };
  if (item.size.implicit) item.size = { ...STAR };
  return serializeComicSplit(root);
}

/**
 * Merge children `boundary` and `boundary + 1` of the list at `path` into one
 * cell spanning both (the split line between them goes). The merged cell
 * keeps the first one's own split, if any. A bracketed list left with one
 * cell loses its brackets. Returns the new `split` value, re-serialised.
 */
export function mergeComicCells(src: string, path: readonly number[], boundary: number): string {
  const { tree } = parseComicSplit(src);
  const root = cloneList(tree);
  const list = comicSplitListAt(root, path);
  if (!list || boundary < 0 || boundary >= list.items.length - 1) return src;
  const sizes = sizesOf(list);
  const a = list.items[boundary]!;
  const b = list.items[boundary + 1]!;
  // The lines that stay, which the merged size must keep where they are.
  const lines = comicSplitLines(list);
  const keep = (arr: number[]) => arr.filter((_, i) => i !== boundary);
  const fixed = sizeFrom(
    sizes[boundary]!.start + sizes[boundary + 1]!.start,
    sizes[boundary]!.end + sizes[boundary + 1]!.end,
    a.size.star ? (b.size.star ? undefined : b.size) : a.size,
  );
  const trial = (size: ComicSplitSize): boolean => {
    const items = [...list.items];
    items.splice(boundary, 2, { ...a, size });
    const got = comicSplitLines({ ...list, items });
    const start = keep(lines.start);
    const end = keep(lines.end);
    return got.start.every((v, i) => Math.abs(v - start[i]!) < EPS) && got.end.every((v, i) => Math.abs(v - end[i]!) < EPS);
  };
  const size = a.size.star || b.size.star ? (trial({ ...STAR }) ? { ...STAR } : fixed) : fixed;
  const merged: ComicSplitItem = { ...a, size };
  list.items.splice(boundary, 2, merged);
  if (list.items.length === 1) {
    delete list.axis;
    // A bracketed list of one cell: the brackets go.
    if (path.length > 0) {
      const parent = comicSplitListAt(root, path.slice(0, -1))!;
      const owner = parent.items[path[path.length - 1]!]!;
      if (merged.children && merged.children.items.length > 1) owner.children = merged.children;
      else delete owner.children;
    }
  }
  return serializeComicSplit(root);
}
