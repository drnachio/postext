// Formatting changed in Word on text that is otherwise unchanged: bold,
// italic, small caps, super/subscript, code and links back to Markdown
// markup. Conservative: markers are removed only when they wrap exactly
// the unformatted text, and added only around text whose inner markup
// pairs up; anything else is reported, not applied.

import type { Hunk } from './diff.js';
import type { BlockView } from './blocks.js';
import { equalPairs, type SourceEdit } from './edits.js';
import { FLAG_MARKERS, linkAround, markupDeletable, splitKey, stripFlag, wrapFlags } from './markup.js';

interface Change {
  added: string;
  removed: string;
  /** New link ('' = removed), undefined = unchanged. */
  href?: string;
}

function changeOf(oldKey: string, newKey: string): Change | undefined {
  if (oldKey === newKey) return undefined;
  const o = splitKey(oldKey);
  const n = splitKey(newKey);
  let added = '';
  let removed = '';
  for (const l of n.flags) if (!o.flags.includes(l)) added += l;
  for (const l of o.flags) if (!n.flags.includes(l)) removed += l;
  const href = o.href === n.href ? undefined : n.href ?? '';
  if (!added && !removed && href === undefined) return undefined;
  return { added, removed, href };
}

const sameChange = (a: Change, b: Change): boolean => a.added === b.added && a.removed === b.removed && a.href === b.href;

/** Format edits for the equal characters of a block. */
export function formatEdits(v: BlockView, base: string, hunks: readonly Hunk[]): SourceEdit[] {
  const pairs = equalPairs(v, hunks);
  const groups: { first: number; last: number; change: Change }[] = [];
  let open: { first: number; last: number; change: Change } | undefined;
  let prevI = -2;
  for (let i = 0; i < v.O.length; i++) {
    const j = pairs.get(i);
    const usable = j !== undefined && v.M[i]! >= 0 && v.atomOf[i]! < 0;
    if (!usable || i !== prevI + 1) open = undefined;
    if (!usable) continue;
    prevI = i;
    // Spaces neither start nor end a group (Word users select "word ").
    if (/\s/.test(v.O[i]!)) continue;
    const change = changeOf(v.OK[i]!, v.NK[j]!);
    if (!change) {
      open = undefined;
      continue;
    }
    if (open && sameChange(open.change, change)) open.last = i;
    else groups.push((open = { first: i, last: i, change }));
  }
  // Whether character `i` had format `letter` and keeps it.
  const keeps = (i: number, letter: string): boolean => {
    const j = pairs.get(i);
    return j !== undefined && v.M[i]! >= 0 && v.atomOf[i]! < 0 && splitKey(v.OK[i]!).flags.includes(letter) && splitKey(v.NK[j]!).flags.includes(letter);
  };
  return groups.map((g) => formatEdit(v, base, g.first, g.last, g.change, keeps));
}

function formatEdit(v: BlockView, base: string, first: number, last: number, change: Change, keeps: (i: number, letter: string) => boolean): SourceEdit {
  const s = v.M[first]!;
  const e = v.M[last]! + 1;
  const edit: SourceEdit = { target: v.target, start: s, end: e, text: base.slice(s, e), kind: 'format' };
  // Inner markup must pair up for markers around it to be well nested.
  const gaps: string[] = [];
  for (let i = first + 1; i <= last; i++) {
    if (v.M[i]! < 0) continue;
    let p = i - 1;
    while (p >= first && v.M[p]! < 0) p--;
    if (p >= first && v.M[i]! > v.M[p]! + 1) gaps.push(base.slice(v.M[p]! + 1, v.M[i]!));
  }
  if (!markupDeletable(gaps) || (change.added.includes('k') && gaps.some((g) => g.trim()))) return { ...edit, reject: 'format-crosses-markup' };
  let os = s;
  let oe = e;
  for (let left = change.removed; left; ) {
    let progress = false;
    for (const l of left) {
      const r = stripFlag(base, os, oe, l);
      if (r) {
        [os, oe] = r;
        left = left.replace(l, '');
        progress = true;
        break;
      }
    }
    if (!progress) return { ...edit, reject: 'format-partial' };
  }
  const inner = base.slice(s, e);
  if (change.href !== undefined) {
    const link = linkAround(base, os, oe);
    if (link) {
      os = link.s;
      oe = link.e;
    } else if (change.href === '') return { ...edit, reject: 'format-partial' };
  }
  // One format taken over the words right beside text that has it
  // already (bold made longer): the marker between the two goes, since
  // `**a****b**` does not read as one bold passage.
  if (change.added.length === 1 && !change.removed && change.href === undefined) {
    for (const { open, close } of FLAG_MARKERS[change.added] ?? []) {
      const before = first > 0 && keeps(first - 1, change.added) && base.slice(v.M[first - 1]! + 1, os) === close;
      const after = last + 1 < v.O.length && keeps(last + 1, change.added) && base.slice(oe, v.M[last + 1]!) === open;
      if (!before && !after) continue;
      return { target: v.target, start: before ? os - close.length : os, end: after ? oe + open.length : oe, text: (before ? '' : open) + inner + (after ? '' : close), kind: 'format' };
    }
  }
  const text = wrapFlags(inner, change.added, change.href || undefined);
  return { target: v.target, start: os, end: oe, text, kind: 'format' };
}
