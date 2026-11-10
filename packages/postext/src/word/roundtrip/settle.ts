// A block read from a file whose editor wrote every style's formatting on
// the runs themselves and typed out the capitals a style gave (Google
// Docs), set back to what the import compares (#1458). The map written
// again from the book knows how each character looked in the file as it
// was written (`selfRead.ts`); the file says how it looks now. Where the
// two looks agree the character keeps the marks the Markdown gave it;
// where they differ, the difference is the edit: a word made bold, an
// italic taken off.

import type { BlockView } from './blocks.js';
import { diffText } from './diff.js';
import { LOOK_CAPS, LOOK_HIDDEN } from './looks.js';
import { FLAG_ORDER, makeKey, splitKey } from './markup.js';

/** The format flags of a look (its letters without capitals and hidden). */
const flagsOf = (look: string): string => [...look].filter((l) => FLAG_ORDER.includes(l)).join('');

/** One code unit in capitals, when its capital is one code unit too. */
function upper(ch: string): string {
  const u = ch.toUpperCase();
  return u.length === 1 ? u : ch;
}

function lower(ch: string): string {
  const l = ch.toLowerCase();
  return l.length === 1 ? l : ch;
}

/** Whether the writer hid the whole block (`w:vanish`): an editor that
 *  keeps no hidden text drops it, which deletes nothing. */
export function writtenHidden(v: BlockView): boolean {
  return !!v.OL && v.OL.length > 0 && v.OL.every((l) => l.includes(LOOK_HIDDEN));
}

/**
 * Compare the block by looks. `literalCaps`: the file's editor has no
 * mark for capitals, so the text a style set in capitals came back typed
 * in capitals; it is compared as capitals, and what was typed into it
 * goes into the source in small letters (a capital first where the text
 * it replaces had one).
 */
export function settleLooks(v: BlockView, literalCaps: boolean): void {
  const { OL, NL } = v;
  if (!OL || !NL || v.missing) return;
  const capsAt = (i: number): boolean => OL[i]?.includes(LOOK_CAPS) === true;
  const caps = literalCaps && OL.some((l) => l.includes(LOOK_CAPS));
  // The text as it stood in capitals, to find what was typed into it.
  let written = v.O;
  if (caps) {
    written = '';
    for (let i = 0; i < v.O.length; i++) written += capsAt(i) ? upper(v.O[i]!) : v.O[i]!;
  }
  const units = v.N.split('');
  const NK = v.NK.slice();
  /** The marks of the character read back at `j`, against the one
   *  written at `i`: the one it stands for (`equal`), or the one beside
   *  the text typed in. */
  const settle = (i: number, j: number, equal: boolean): void => {
    const o = splitKey(v.OK[i] ?? '');
    const { href } = splitKey(NK[j] ?? '');
    const was = flagsOf(OL[i] ?? '');
    const is = flagsOf(NL[j] ?? '');
    let flags = '';
    for (const l of FLAG_ORDER) {
      // What the style gave and the Markdown did not mark is no mark.
      const fromStyle = was.includes(l) && !o.flags.includes(l);
      if (is.includes(l) ? !fromStyle : equal && !was.includes(l) && o.flags.includes(l)) flags += l;
    }
    NK[j] = makeKey(flags, href);
    if (caps && capsAt(i)) units[j] = equal ? v.O[i]! : lower(units[j]!);
  };
  let i = 0;
  let j = 0;
  for (const h of diffText(written, v.N)) {
    for (; i < h.a0; i++, j++) settle(i, j, true);
    // Text typed in: its marks beyond the ones of the text beside it,
    // and in capitals only where the text it replaces began with one.
    const beside = h.a0 > 0 ? h.a0 - 1 : Math.min(h.a1, v.O.length - 1);
    if (beside >= 0) {
      const typed = units[h.b0];
      for (let k = h.b0; k < h.b1; k++) settle(beside, k, false);
      if (caps && capsAt(beside) && typed !== undefined && h.a1 > h.a0 && v.O[h.a0] !== lower(v.O[h.a0]!)) units[h.b0] = typed;
    }
    i = h.a1;
    j = h.b1;
  }
  for (; i < v.O.length && j < v.N.length; i++, j++) settle(i, j, true);
  v.NK = NK;
  if (caps) v.N = units.join('');
}
