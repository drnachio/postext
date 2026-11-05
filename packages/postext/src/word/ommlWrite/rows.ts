// A row of MathML read as a list: grouping wrappers flattened, stretchy
// fence pairs (`\left…\right`, `\bigl…\bigr`, `\binom`) turned into
// delimiters (`m:d`), n-ary operators taking the terms after them as their
// body (`m:nary`), function names their argument (`m:func`).

import { escapeAttr } from '../xml.js';
import { kids, tokenText, unwrap, TEXCLASS, type MmlNode } from './mml.js';
import type { RunOptions } from './runs.js';
import { convertNary, convertNode, naryBase, rowOf, wrap } from './convert.js';

const NARY = new Set([
  '∑', '∏', '∐', '∫', '∬', '∭', '⨌', '∮', '∯', '∰', '∱', '∲', '∳',
  '⋃', '⋂', '⋁', '⋀', '⨀', '⨁', '⨂', '⨄', '⨆',
]);

export const isNaryChar = (t: string): boolean => NARY.has(t);

type Item =
  | { t: 'node'; node: MmlNode }
  | { t: 'fence'; side: 'open' | 'close'; chr: string; node: MmlNode }
  | { t: 'd'; beg: string; end: string; sep: string | undefined; parts: Item[][] };

const FUNCTION_APPLY = '⁡';

/** The mo a node is (or wraps), if any. */
function asMo(node: MmlNode): MmlNode | undefined {
  const n = unwrap(node);
  return n.kind === 'mo' ? n : undefined;
}

const isEmptyGroup = (node: MmlNode): boolean =>
  (node.kind === 'mrow' || node.kind === 'TeXAtom' || node.kind === 'inferredMrow') && kids(node).every(isEmptyGroup);

/** `\left … \middle … \right` (an INNER mrow) as a delimiter item. */
function innerFence(node: MmlNode): Item | undefined {
  if (node.kind !== 'mrow' || node.texClass !== TEXCLASS.INNER) return undefined;
  const c = kids(node);
  if (c.length < 2) return undefined;
  const first = c[0]!;
  const last = c[c.length - 1]!;
  if (first.kind !== 'mo' || last.kind !== 'mo') return undefined;
  const parts: Item[][] = [[]];
  let sep: string | undefined;
  for (let i = 1; i < c.length - 1; i++) {
    const n = c[i]!;
    if (isEmptyGroup(n)) continue;
    // `\middle|` leaves an mo between two empty fence atoms.
    const middle = n.kind === 'mo' && i > 1 && i < c.length - 2 && isEmptyGroup(c[i - 1]!) && isEmptyGroup(c[i + 1]!);
    if (middle) {
      sep ??= tokenText(n);
      parts.push([]);
      continue;
    }
    parts[parts.length - 1]!.push(...expand([n]));
  }
  return { t: 'd', beg: tokenText(first), end: tokenText(last), sep, parts };
}

/** Flatten grouping wrappers; mark fence atoms. */
function expand(nodes: MmlNode[]): Item[] {
  const out: Item[] = [];
  for (const node of nodes) {
    const d = innerFence(node);
    if (d) {
      out.push(d);
      continue;
    }
    const cls = node.texClass;
    if ((node.kind === 'mrow' || node.kind === 'TeXAtom') && (cls === TEXCLASS.OPEN || cls === TEXCLASS.CLOSE)) {
      if (isEmptyGroup(node)) continue;
      const mo = asMo(node);
      if (mo) {
        out.push({ t: 'fence', side: cls === TEXCLASS.OPEN ? 'open' : 'close', chr: tokenText(mo), node: mo });
        continue;
      }
    }
    const row = rowOf(node);
    if (row.length !== 1 || row[0] !== node) {
      out.push(...expand(row));
      continue;
    }
    out.push({ t: 'node', node });
  }
  return pairFences(out);
}

/** Pair open/close fence atoms of one row into delimiters. */
function pairFences(items: Item[]): Item[] {
  const out: Item[] = [];
  const opens: number[] = [];
  for (const it of items) {
    if (it.t === 'fence' && it.side === 'open') {
      opens.push(out.length);
      out.push(it);
    } else if (it.t === 'fence' && it.side === 'close' && opens.length > 0) {
      const at = opens.pop()!;
      const open = out[at] as Extract<Item, { t: 'fence' }>;
      const inner = out.splice(at + 1);
      out[at] = { t: 'd', beg: open.chr, end: it.chr, sep: undefined, parts: [inner] };
    } else {
      out.push(it);
    }
  }
  return out.map((it) => (it.t === 'fence' ? { t: 'node', node: it.node } : it));
}

const moClass = (it: Item | undefined): number | undefined => {
  if (!it || it.t !== 'node') return undefined;
  const mo = asMo(it.node);
  return mo ? mo.texClass : undefined;
};

/** An operator that ends an n-ary body or keeps a function from taking an
 *  argument: binary, relation, punctuation. */
const isBreak = (it: Item | undefined): boolean => {
  const c = moClass(it);
  return c === TEXCLASS.BIN || c === TEXCLASS.REL || c === TEXCLASS.PUNCT;
};

const isApply = (it: Item | undefined): boolean =>
  it?.t === 'node' && asMo(it.node) !== undefined && tokenText(asMo(it.node)!) === FUNCTION_APPLY;

/** A function name (`\sin`, `\operatorname{tr}`, `\lim_{…}`): a word set as
 *  an operator, bare or with limits. */
function isFunctionHead(node: MmlNode, next: Item | undefined): boolean {
  let n = unwrap(node);
  if (['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(n.kind)) {
    const b = n.childNodes[0];
    if (!b) return false;
    n = unwrap(b);
  }
  if (n.kind !== 'mi' && n.kind !== 'mo') return false;
  const text = tokenText(n);
  if (!/^[A-Za-z]{2,}$/.test(text)) return false;
  return n.texClass === TEXCLASS.OP || isApply(next);
}

/** The end of a bracket group opening at `i` (an open bracket through its
 *  partner), or undefined when `i` is no open bracket. */
function bracketEnd(items: Item[], i: number): number | undefined {
  if (moClass(items[i]) !== TEXCLASS.OPEN) return undefined;
  let depth = 0;
  for (let j = i; j < items.length; j++) {
    const c = moClass(items[j]);
    if (c === TEXCLASS.OPEN) depth++;
    else if (c === TEXCLASS.CLOSE && --depth === 0) return j + 1;
  }
  return items.length;
}

/** The items a function name takes as its argument from `i`: a delimiter
 *  or bracket group, or one item and the brackets right after it
 *  (`\lim f(x)`). */
function takeArgument(items: Item[], i: number): number {
  const it = items[i];
  if (!it || isBreak(it)) return i;
  const group = bracketEnd(items, i);
  if (group !== undefined) return group;
  const next = i + 1;
  const isName = it.t === 'node' && unwrap(it.node).kind === 'mi';
  return (isName ? bracketEnd(items, next) : undefined) ?? (isName && items[next]?.t === 'd' ? next + 1 : next);
}

/** The end of an n-ary operator's body from `i`: the next binary operator,
 *  relation or punctuation, or a closing bracket the body did not open
 *  (`(\sum_i x_i)` keeps its `)` outside). */
function naryBodyEnd(items: Item[], i: number): number {
  let depth = 0;
  let j = i;
  for (; j < items.length; j++) {
    const it = items[j];
    if (isBreak(it)) break;
    const c = moClass(it);
    if (c === TEXCLASS.OPEN) depth++;
    else if (c === TEXCLASS.CLOSE && depth-- === 0) break;
  }
  return j;
}

function convertItem(it: Item, opts: RunOptions): string {
  if (it.t === 'd') {
    const pr = `<m:begChr m:val="${escapeAttr(it.beg)}"/>${it.sep !== undefined ? `<m:sepChr m:val="${escapeAttr(it.sep)}"/>` : ''}<m:endChr m:val="${escapeAttr(it.end)}"/>`;
    return wrap('d', `<m:dPr>${pr}</m:dPr>${it.parts.map((p) => wrap('e', emit(p, opts))).join('')}`);
  }
  return convertNode(it.node, opts);
}

function emit(items: Item[], opts: RunOptions): string {
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.t !== 'node') {
      out += convertItem(it, opts);
      continue;
    }
    const nary = naryBase(it.node);
    if (nary) {
      const j = naryBodyEnd(items, i + 1);
      out += convertNary(nary.base, nary.chr, emit(items.slice(i + 1, j), opts), opts);
      i = j - 1;
      continue;
    }
    if (isFunctionHead(it.node, items[i + 1])) {
      let j = i + 1;
      const applied = isApply(items[j]);
      if (applied) j++;
      const end = takeArgument(items, j);
      if (end > j || applied) {
        out += wrap('func', `${wrap('fName', convertNode(it.node, opts))}${wrap('e', emit(items.slice(j, end), opts))}`);
        i = end - 1;
        continue;
      }
    }
    out += convertNode(it.node, opts);
  }
  return out;
}

/** A row of MathML nodes as OMML. */
export function convertRow(nodes: MmlNode[], opts: RunOptions): string {
  return emit(expand(nodes), opts);
}
