// Paragraph and character styles of the export (#1555).
//
// A paragraph style used to take the look and the format of the first
// paragraph written in it, and every later paragraph set what differed as
// local formatting. A reader of the package (InDesign's user, or the
// importer, which makes a style of each distinct look) then met a book
// formatted by hand: a Postext book exported and imported again came back
// with a dozen styles that were one. So the pages are written twice. The
// first pass only looks: for every style name it counts the looks its
// paragraphs are set in (face, size, colour, tracking…) and, for each
// look, the indents, space after, leading and alignment its paragraphs
// have. Between the passes each look becomes a style of its own (the look
// with most text keeps the plain name), with the format most of its
// paragraphs share; the second pass writes the pages with those styles,
// and a paragraph sets locally only what really is its own.
//
// Character styles are made as the runs are written: the runs a chip or a
// `:span` set take a style named after it, and words in a face or a size
// their paragraph's style has not take one named after that face and
// size, so the change of face is a style a reader can map, not loose
// formatting.

import type { VDTPage } from 'postext';
import { styleSelf, type CharacterStyleDef, type ParagraphFormat, type ParagraphStyleDef, type TabStopDef, type TextProps } from './parts.js';
import type { Writer } from './writer.js';

/** What a look of a style name was seen with: its weight in characters
 *  and how often each value of its format came up. */
interface LookTally {
  props: TextProps;
  chars: number;
  order: number;
  leading: Tally;
  justification: Map<string, number>;
  leftIndent: Tally;
  firstLineIndent: Tally;
  rightIndent: Tally;
  spaceAfter: Tally;
  tabs: Map<string, { tabs: TabStopDef[]; n: number }>;
}

export interface StyleSurvey {
  /** `survey` while the first pass runs, `write` in the second. */
  pass: 'survey' | 'write';
  /** By style name, the looks its paragraphs were set in, by look key. */
  looks: Map<string, Map<string, LookTally>>;
  /** The second pass: the style of a name and a look. */
  settled: Map<string, ParagraphStyleDef>;
}

export const newSurvey = (): StyleSurvey => ({ pass: 'survey', looks: new Map(), settled: new Map() });

/** What tells one look from another: everything a paragraph style sets
 *  of the text. */
const lookKey = (p: TextProps): string =>
  [p.font, p.fontStyle, Math.round(p.size * 100) / 100, p.color, p.tracking, p.capitalization ?? '', p.position ?? '', p.baselineShift ?? '', p.underline ? 'u' : '', p.strike ? 's' : '', p.stroke ? `${p.stroke.color}/${p.stroke.weight}` : ''].join('|');

/** Lengths counted to the hundredth of a point, each keeping the exact
 *  value first seen. */
type Tally = Map<number, { value: number; n: number }>;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const bump = <K>(m: Map<K, number>, k: K): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};
const count = (m: Tally, value: number): void => {
  const seen = m.get(r2(value));
  if (seen) seen.n++;
  else m.set(r2(value), { value, n: 1 });
};
/** The length seen most often (the first seen of equals). */
const most = (m: Tally, fallback: number): number => {
  let best = fallback;
  let n = 0;
  for (const t of m.values()) if (t.n > n) [best, n] = [t.value, t.n];
  return best;
};
/** The value seen most often (the first seen of equals). */
const mode = <K>(m: Map<K, number>, fallback: K): K => {
  let best = fallback;
  let most = 0;
  for (const [k, n] of m) if (n > most) [best, most] = [k, n];
  return best;
};
const tabsKey = (tabs: readonly TabStopDef[]): string => tabs.map((t) => `${r2(t.position)}${t.alignment}${t.character ?? ''}${t.leader ?? ''}`).join(',');

/** The paragraph style of a paragraph named `name`, set in `props` with
 *  `format`. In the first pass the paragraph is counted and a style for
 *  the moment is handed back; in the second, the style its look settled
 *  on. `chars` weighs the look (the look with most text keeps the name). */
export function paragraphStyle(w: Writer, name: string, props: TextProps, leading: number, justification: string, format: ParagraphFormat, chars: number): ParagraphStyleDef {
  const s = w.styles;
  const key = lookKey(props);
  if (s.pass === 'survey') {
    let looks = s.looks.get(name);
    if (!looks) s.looks.set(name, (looks = new Map()));
    let t = looks.get(key);
    if (!t) {
      t = { props, chars: 0, order: looks.size, leading: new Map(), justification: new Map(), leftIndent: new Map(), firstLineIndent: new Map(), rightIndent: new Map(), spaceAfter: new Map(), tabs: new Map() };
      looks.set(key, t);
    }
    t.chars += chars;
    count(t.leading, leading);
    bump(t.justification, justification);
    count(t.leftIndent, format.leftIndent);
    count(t.firstLineIndent, format.firstLineIndent);
    count(t.rightIndent, format.rightIndent);
    count(t.spaceAfter, format.spaceAfter);
    const tk = tabsKey(format.tabs);
    const seen = t.tabs.get(tk);
    if (seen) seen.n++;
    else t.tabs.set(tk, { tabs: format.tabs, n: 1 });
  }
  let def = s.settled.get(`${name}\u0000${key}`);
  // A look the first pass did not see (it cannot happen while both passes
  // write the same pages) takes the paragraph's own format.
  if (!def) {
    let own = name;
    if (s.pass === 'write') for (let i = 2; w.paraStyles.has(own); i++) own = `${name} · ${props.font} ${props.fontStyle} ${r2(props.size)} pt${i > 2 ? ` ${i}` : ''}`;
    def = { self: styleSelf('ParagraphStyle', own), name: own, props, leading, justification, format };
    if (s.pass === 'write') s.settled.set(`${name}\u0000${key}`, def);
  }
  if (s.pass === 'write' && !w.paraStyles.has(def.name)) w.paraStyles.set(def.name, def);
  return def;
}

/** A look's name beside the others of its style name: its face and size,
 *  and its colour when another look has the same face and size. */
function variantName(t: LookTally, others: LookTally[]): string {
  const face = `${t.props.font} ${t.props.fontStyle} ${r2(t.props.size)} pt`;
  const same = others.filter((o) => o !== t && o.props.font === t.props.font && o.props.fontStyle === t.props.fontStyle && r2(o.props.size) === r2(t.props.size));
  return same.length ? `${face} ${t.props.color.replace(/^Color\//, '')}` : face;
}

/** Between the passes: a style for every look, with the format most of
 *  its paragraphs share. */
export function settleStyles(s: StyleSurvey): void {
  const taken = new Set<string>();
  const unique = (n: string): string => {
    let out = n;
    for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${n} ${i}`;
    taken.add(out.toLowerCase());
    return out;
  };
  // Every plain name first, so a variant never takes one.
  const ranked = new Map<string, LookTally[]>();
  for (const [name, looks] of s.looks) {
    const list = [...looks.values()].sort((a, b) => b.chars - a.chars || a.order - b.order);
    ranked.set(name, list);
    unique(name);
  }
  for (const [name, list] of ranked) {
    list.forEach((t, i) => {
      const styleName = i === 0 ? name : unique(`${name} · ${variantName(t, list)}`);
      const tabs = [...t.tabs.values()].sort((a, b) => b.n - a.n)[0]?.tabs ?? [];
      const format: ParagraphFormat = {
        leftIndent: most(t.leftIndent, 0),
        firstLineIndent: most(t.firstLineIndent, 0),
        rightIndent: most(t.rightIndent, 0),
        spaceAfter: most(t.spaceAfter, 0),
        tabs,
      };
      s.settled.set(`${name}\u0000${lookKey(t.props)}`, { self: styleSelf('ParagraphStyle', styleName), name: styleName, props: t.props, leading: most(t.leading, 0), justification: mode(t.justification, 'LeftAlign'), format });
    });
  }
  s.pass = 'write';
}

/** The character style called `name`, made with the first run that
 *  names it. */
export function characterStyle(w: Writer, name: string, props: TextProps): CharacterStyleDef {
  let c = w.charStyles.get(name);
  if (!c) {
    const own: TextProps = { font: props.font, fontStyle: props.fontStyle, size: props.size, color: props.color, tracking: props.tracking };
    if (props.capitalization) own.capitalization = props.capitalization;
    w.charStyles.set(name, (c = { self: styleSelf('CharacterStyle', name), name, props: own }));
  }
  return c;
}

/** The character style a run takes beyond its paragraph style's look:
 *  the named style that set it, else, for words in another face or size
 *  than the paragraph style's (not a raised or lowered figure, which
 *  shrinks by its position), a style named after that face and size. */
export function runCharacterStyle(named: string | undefined, props: TextProps, style: TextProps): string | undefined {
  if (named) return named;
  if (props.position || props.stroke) return undefined;
  if (props.font === style.font && Math.abs(props.size - style.size) < 0.01) return undefined;
  return `${props.font} ${props.fontStyle} ${r2(props.size)} pt`;
}

/** The callout style of every block of a page that stands in a box of
 *  the flow, by the display list's block key (`b<contentIndex>`): its
 *  paragraphs are named after the box, as a composed frame's are. A
 *  nested box's blocks take the innermost box's style. */
export function flowCallouts(page: VDTPage): Map<string, string> {
  const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])];
  const box = new Map<number, string>();
  const inner = (b: (typeof blocks)[number]): number | undefined => b.calloutPath?.[b.calloutPath.length - 1] ?? b.containerId;
  for (const b of blocks) {
    const id = inner(b);
    if (b.type === 'callout' && b.callout && id !== undefined) box.set(id, b.callout.styleId);
  }
  const out = new Map<string, string>();
  if (!box.size) return out;
  for (const b of blocks) {
    const id = inner(b);
    const style = id !== undefined ? box.get(id) : undefined;
    if (!style) continue;
    const key = b.footnoteNote !== undefined ? `fn${b.footnoteNote}` : b.contentIndex !== undefined ? `b${b.contentIndex}` : b.id;
    out.set(key, style);
  }
  return out;
}
