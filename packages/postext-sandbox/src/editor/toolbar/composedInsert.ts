/**
 * The Markdown the editor's «Composed page» button inserts (#864): a
 * `::::page{template="…"}` fence with one empty `:::frame{slot="…"}` per
 * frame of the template, in template order.
 *
 * - A frame that only receives what another frame's text continues with
 *   (it is that frame's `next`, or its `overflow.continueIn: '#frame'`)
 *   gets no fence: nothing is written for it.
 * - A frame that `takes` a heading gets that heading, its text the frame's
 *   name for the writer to type over; the flow frame gets a blank line for
 *   the running text. Neither needs a slot fence.
 *
 * Pure.
 */

import type { ResolvedFrame, ResolvedPageTemplate } from 'postext';

/** The frames of the template some other frame continues into. */
export function chainTargets(frames: readonly Pick<ResolvedFrame, 'name' | 'next' | 'overflow'>[]): Set<string> {
  const names = new Set(frames.map((f) => f.name));
  const out = new Set<string>();
  for (const f of frames) {
    const ci = f.overflow?.continueIn;
    const target = f.next ?? (typeof ci === 'string' && ci.startsWith('#') && ci.length > 1 ? ci.slice(1) : undefined);
    if (target && target !== f.name && names.has(target)) out.add(target);
  }
  return out;
}

export interface ComposedInsertion {
  text: string;
  /** The selection to leave, relative to the start of `text`: the first
   *  heading's name (to type over), else the first place to write. */
  anchor: number;
  head: number;
}

/** An attribute value with delimiters the attribute grammar reads and the
 *  value does not hold: `"…"`, else `'…'`, else `“…”` (the grammar has no
 *  backslash escapes). */
const quoted = (v: string): string => (!v.includes('"') ? `"${v}"` : !v.includes("'") ? `'${v}'` : `“${v}”`);

/** The page fence for `template`. */
export function composedPageInsertion(template: Pick<ResolvedPageTemplate, 'id' | 'frames'>): ComposedInsertion {
  const skip = chainTargets(template.frames);
  let text = `::::page{template=${quoted(template.id)}}\n`;
  let sel: { anchor: number; head: number } | null = null;
  let flowDone = false;
  for (const f of template.frames) {
    if (skip.has(f.name)) continue;
    if (f.takes) {
      const level = Number(f.takes.slice(1));
      const prefix = `${'#'.repeat(level)} `;
      const at = text.length + prefix.length;
      text += `${prefix}${f.name}\n\n`;
      sel ??= { anchor: at, head: at + f.name.length };
      continue;
    }
    if (f.flow) {
      if (flowDone) continue;
      flowDone = true;
      // The running text: a blank line to write on.
      sel ??= { anchor: text.length, head: text.length };
      text += '\n';
      continue;
    }
    const open = `:::frame{slot=${quoted(f.name)}}\n`;
    sel ??= { anchor: text.length + open.length, head: text.length + open.length };
    text += `${open}\n:::\n\n`;
  }
  text = text.replace(/\n+$/, '\n');
  if (!sel) sel = { anchor: text.length, head: text.length };
  text += '::::';
  return { text, ...sel };
}
