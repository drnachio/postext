// Nested, GREP and line styles: character styles a paragraph style lays
// over part of each paragraph by a rule. Postext has no such rules, so
// each is reported by style with what it would have applied. The one
// case that reads as a plain mark over a range the importer can find (a
// lead-in: bold or italic up to a colon, a full stop, a tab, a number of
// words) is applied to the text.

import type { IdmlParagraph, IdmlStyle } from '../model/document.js';
import { computeStyle, styleChain, stylePath } from '../resolve/styles.js';
import type { Context } from './context.js';
import type { InlineEnv } from './inline.js';
import { ownText, type Look } from './looks.js';
import { italicOf, weightOf } from './values.js';

type Rule = NonNullable<IdmlStyle['nested']>[number];

const rulesOf = new WeakMap<Context, Map<string, { style: IdmlStyle; rules: Rule[] } | null>>();

/** The rules a paragraph style carries, its own or the nearest inherited. */
function rules(ctx: Context, self: string | undefined): { style: IdmlStyle; rules: Rule[] } | null {
  if (!self) return null;
  let cache = rulesOf.get(ctx);
  if (!cache) rulesOf.set(ctx, (cache = new Map()));
  const hit = cache.get(self);
  if (hit !== undefined) return hit;
  let found: { style: IdmlStyle; rules: Rule[] } | null = null;
  const chain = styleChain(ctx.doc, 'paragraph', self);
  for (let n = chain.length - 1; n >= 0; n--) {
    const s = chain[n]!;
    if (s.nested?.length) {
      found = { style: s, rules: s.nested };
      break;
    }
  }
  cache.set(self, found);
  if (found) report(ctx, chain[chain.length - 1] ?? found.style, found.rules);
  return found;
}

const characterStyleName = (ctx: Context, ref: string): string => ctx.doc.styles.character.get(ref)?.name ?? ref.replace(/^CharacterStyle\//, '');

function marksOfStyle(ctx: Context, ref: string): { marks: Pick<NonNullable<InlineEnv['leadIn']>['marks'], 'b' | 'i' | 'sc'>; whole: boolean } {
  const props = computeStyle(ctx.doc, 'character', ref);
  const marks: { b?: boolean; i?: boolean; sc?: boolean } = {};
  let known = 0;
  const face = props.attrs.FontStyle;
  if (face) {
    known++;
    if (weightOf(face) >= 600) marks.b = true;
    if (italicOf(face)) marks.i = true;
  }
  if (props.attrs.Capitalization === 'SmallCaps' || props.attrs.Capitalization === 'CapToSmallCap') {
    known++;
    marks.sc = true;
  }
  const others = Object.keys(props.attrs).filter((k) => k !== 'FontStyle' && k !== 'Capitalization').length + Object.keys(props.properties).length;
  return { marks, whole: known > 0 && others === 0 };
}

function describe(ctx: Context, r: Rule): string {
  const style = characterStyleName(ctx, r.characterStyle);
  if (r.kind === 'grep') return `GREP style: "${style}" on /${r.expression ?? ''}/`;
  if (r.kind === 'line') return `line style: "${style}" on ${r.repetition ?? 1} line(s)`;
  return `nested style: "${style}" ${r.inclusive ? 'through' : 'up to'} ${r.repetition ?? 1} × ${r.delimiter ?? '?'}`;
}

function report(ctx: Context, style: IdmlStyle, list: Rule[]): void {
  for (const r of list) {
    const applied = r === list[0] && r.kind === 'nested' && rangeEnd('x', r) !== undefined && Object.keys(marksOfStyle(ctx, r.characterStyle).marks).length > 0;
    const what = `${stylePath(style)}: ${describe(ctx, r)}`;
    if (applied) ctx.rep.add('nestedStyleApplied', 'info', 'A nested style that opens the paragraph with bold, italic or small capitals up to a delimiter is applied to the text as marks', what);
    else if (r.kind === 'grep') ctx.rep.add('grepStyles', 'loss', 'GREP styles are not applied: Postext has no rule that styles text by a pattern', what);
    else if (r.kind === 'line') ctx.rep.add('lineStyles', 'loss', 'Line styles are not applied: Postext has no rule that styles the first lines of a paragraph (a drop cap\'s lead-in aside)', what);
    else ctx.rep.add('nestedStyles', 'loss', 'Nested styles other than a plain lead-in are not applied', what);
  }
}

/** Where a nested style's range ends in a paragraph's text; undefined
 *  for a delimiter the importer cannot find in plain text. */
function rangeEnd(text: string, r: Rule): number | undefined {
  const times = Math.max(1, r.repetition ?? 1);
  const d = r.delimiter ?? '';
  let pattern: RegExp | undefined;
  if (d === 'Sentence') pattern = /[.!?…](?=\s|$)/g;
  else if (d === 'AnyWord') pattern = /\s+/g;
  else if (d === 'Tabs') pattern = /\t/g;
  else if (d === 'EmSpace') pattern = /\u2003/g;
  else if (d === 'EnSpace') pattern = /\u2002/g;
  else if (d === 'NonbreakingSpace') pattern = /\u00a0/g;
  else if ([...d].length === 1) pattern = new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  if (!pattern) return undefined;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = pattern.exec(text))) {
    if (++n === times) return r.inclusive ? m.index + m[0].length : m.index;
    if (m[0].length === 0) pattern.lastIndex++;
  }
  // No delimiter: InDesign styles the whole paragraph.
  return text.length;
}

/** The lead-in a paragraph's style lays over its first characters. */
export function nestedLeadIn(ctx: Context, para: IdmlParagraph, look: Look): InlineEnv['leadIn'] {
  const found = rules(ctx, look.style);
  const first = found?.rules[0];
  if (!first || first.kind !== 'nested') return undefined;
  const { marks } = marksOfStyle(ctx, first.characterStyle);
  if (!Object.keys(marks).length) return undefined;
  const chars = rangeEnd(ownText(para), first);
  return chars ? { chars, marks } : undefined;
}
