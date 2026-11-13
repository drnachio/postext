// Runs of text with their marks, written as Postext inline Markdown.
//
// The marks nest in one fixed order, outermost first: character style
// (`:span`, #1555), colour, bold, italic, small capitals, underline,
// strikethrough, script, direction, link. Postext reads italic inside bold and not the other way round, so
// bold is always the outer one. Spaces at the edges of a marked stretch
// move outside its markers (`**word** next`, never `**word **next`).
//
// Directives nest by their brackets (`:underline[:smallcaps[x]]`), so a
// `]` of the story inside one is escaped where the text is written, not
// around the directive. A link's label takes no bracket of the story at
// all: such a link is cut at its brackets, each piece a link to the same
// place.

import { linkDestination } from 'postext/writer';
import { escapeStory, LINE_BREAK, WORD_JOINER } from './escape.js';

export interface Seg {
  /** Story text, or Markdown written as it is when `raw`. */
  t: string;
  raw?: boolean;
  href?: string;
  /** Id of a character style (`:span[…]{style}`): the run's face, size,
   *  weight, slant and colour, all at once. */
  span?: string;
  /** Id of a mark style. */
  mark?: string;
  b?: boolean;
  i?: boolean;
  sc?: boolean;
  u?: boolean;
  s?: boolean;
  script?: 'sup' | 'sub';
  dir?: 'ltr' | 'rtl';
  /** Leaf wrappers: a ruby reading, tate-chu-yoko, emphasis dots. */
  ruby?: { text: string; group: boolean };
  tcy?: boolean;
  dots?: string;
}

type Layer = 'span' | 'mark' | 'b' | 'i' | 'sc' | 'u' | 's' | 'script' | 'dir' | 'href';
const LAYERS: Layer[] = ['span', 'mark', 'b', 'i', 'sc', 'u', 's', 'script', 'dir', 'href'];
const BRACKETED = new Set<Layer>(['span', 'mark', 'sc', 'u', 'dir']);

const flagsEqual = (a: Seg, b: Seg): boolean => LAYERS.every((k) => (a[k] || undefined) === (b[k] || undefined)) && !a.ruby && !b.ruby && !a.tcy && !b.tcy && !a.dots && !b.dots;

/** Neighbours with the same marks become one; empty text goes. A raw
 *  piece (an index mark, a note marker) takes the marks of the text
 *  before it, so it never cuts a marked stretch in two. */
function tidy(input: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of input) {
    if (!s.t) continue;
    const last = out[out.length - 1];
    const seg = { ...s };
    if (seg.raw && last && seg.href === undefined) for (const k of LAYERS) if (k !== 'href') (seg as Record<string, unknown>)[k] = last[k];
    if (!seg.raw && seg.href !== undefined && /[[\]]/.test(seg.t)) {
      for (const piece of seg.t.split(/([[\]]+)/)) if (piece) out.push(/^[[\]]+$/.test(piece) ? { ...seg, t: piece, href: undefined } : { ...seg, t: piece });
      continue;
    }
    if (last && !last.raw === !seg.raw && flagsEqual(last, seg)) last.t += seg.t;
    else out.push(seg);
  }
  return out;
}

/** A raw piece that is only room: a tab (`:tab `, with or without a
 *  stop of its own) or spaces. */
const isRoom = (s: Seg): boolean => !!s.raw && (s.t.trim() === '' || /^ ?:tab(?:\{[^{}]{0,120}\})? ?$/.test(s.t));

/** Whitespace at the edges of a group, taken off its segments: spaces,
 *  forced breaks and tabs. A mark of emphasis that closes after a space or
 *  a tab is not read (`**1.1 :tab **` prints its asterisks). */
function edges(segs: Seg[], layer?: Layer): { lead: string; inner: Seg[]; trail: string } {
  // A character style keeps its fixed spaces (thin, en, no-break) inside:
  // they are room the style's look sets, as a chip's padding is (#1555),
  // and a paragraph trimmed at its start would lose them outside.
  const fixed = layer === 'span';
  const leadRe = fixed ? /^[^\S\u00a0\u2000-\u200a\u202f]+/ : /^\s+/;
  const trailRe = fixed ? /[^\S\u00a0\u2000-\u200a\u202f]+$/ : /\s+$/;
  const inner = segs.map((s) => ({ ...s }));
  let lead = '';
  let trail = '';
  for (;;) {
    const first = inner[0];
    if (!first) break;
    if (isRoom(first)) {
      lead += first.t;
      inner.shift();
      continue;
    }
    if (!first.raw) {
      const m = leadRe.exec(first.t);
      if (m) {
        lead += m[0];
        first.t = first.t.slice(m[0].length);
        if (!first.t) {
          inner.shift();
          continue;
        }
      }
    }
    break;
  }
  for (;;) {
    const last = inner[inner.length - 1];
    if (!last) break;
    if (isRoom(last)) {
      trail = last.t + trail;
      inner.pop();
      continue;
    }
    if (!last.raw) {
      const end = last.t.length - (trailRe.exec(last.t)?.[0].length ?? 0);
      if (end < last.t.length) {
        trail = last.t.slice(end) + trail;
        last.t = last.t.slice(0, end);
        if (!last.t) {
          inner.pop();
          continue;
        }
      }
    }
    break;
  }
  return { lead, inner: inner.filter((s) => s.t), trail };
}

interface State {
  out: string;
  /** Directive brackets the text stands in. */
  brackets: number;
}

// The text is escaped Markdown already: a pair that opens with a backslash
// is left as it is, a bare closing bracket is escaped.
const closers = (text: string): string => text.replace(/\\[\s\S]|\]/g, (m) => (m === ']' ? '\\]' : m));

function leaf(segs: Seg[], st: State): string {
  let out = '';
  segs.forEach((s, n) => {
    if (s.raw) {
      out += s.t;
      return;
    }
    const next = segs[n + 1];
    let text = escapeStory(s.t, st.out + out, next && !next.raw ? next.t : '');
    if (st.brackets > 0 || s.ruby || s.tcy || s.dots !== undefined) text = closers(text);
    if (s.ruby) text = `:ruby[${text}]{rt="${s.ruby.text.replace(/["{}]/g, '')}"${s.ruby.group ? ' group' : ''}}`;
    else if (s.tcy) text = `:tcy[${text}]`;
    else if (s.dots !== undefined) text = `:dots[${text}]${s.dots}`;
    out += text;
  });
  return out;
}

function wrap(layer: Layer, value: unknown, body: string): string {
  switch (layer) {
    case 'href':
      return `[${body}](${linkDestination(String(value))})`;
    case 'span':
      return `:span[${body}]{style="${String(value)}"}`;
    case 'mark':
      return `:mark[${body}]{style="${String(value)}"}`;
    case 'b':
      return `**${body}**`;
    case 'i':
      return `*${body}*`;
    case 'sc':
      return `:smallcaps[${body}]`;
    case 'u':
      return `:underline[${body}]`;
    case 's':
      return `~~${body}~~`;
    case 'script':
      return value === 'sup' ? `^${body}^` : `~${body}~`;
    case 'dir':
      return `:${String(value)}[${body}]`;
  }
}

function render(segs: Seg[], depth: number, st: State): string {
  const layer = LAYERS[depth];
  if (!layer) {
    const text = leaf(segs, st);
    st.out += text;
    return text;
  }
  let out = '';
  let n = 0;
  while (n < segs.length) {
    const value = segs[n]![layer] || undefined;
    let end = n + 1;
    while (end < segs.length && (segs[end]![layer] || undefined) === value) end++;
    const group = segs.slice(n, end);
    n = end;
    if (value === undefined) {
      out += render(group, depth + 1, st);
      continue;
    }
    const { lead, inner, trail } = edges(group.map((s) => ({ ...s, [layer]: undefined })), layer);
    if (!inner.length) {
      st.out += lead + trail;
      out += lead + trail;
      continue;
    }
    // A script takes no space inside (`^a b^` is not read): each word
    // is raised on its own.
    if (layer === 'script' && inner.some((s) => !s.raw && /\s/.test(s.t))) {
      const pieces: Seg[] = [];
      for (const s of inner) {
        if (s.raw) pieces.push(s);
        else for (const part of s.t.split(/(\s+)/)) if (part) pieces.push({ ...s, t: part, ...(/^\s+$/.test(part) ? {} : { script: value as 'sup' | 'sub' }) });
      }
      st.out += lead;
      out += lead + render(pieces.map((p) => ({ ...p })), depth, st) + trail;
      st.out += trail;
      continue;
    }
    st.out += lead;
    // Two markers of emphasis that meet (`**a***b*`) are parted.
    const glue = (layer === 'b' || layer === 'i') && /[*_]$/.test(st.out) ? WORD_JOINER : '';
    let body = render(inner, depth + 1, { out: '', brackets: st.brackets + (BRACKETED.has(layer) ? 1 : 0) });
    // Fixed spaces a character style opens the paragraph with (a chip's
    // padding) would be dropped as a line's leading spaces: a word joiner
    // before them holds them on the line (#1555).
    if (layer === 'span' && !st.out.trim() && /^[\u00a0\u2000-\u200a\u202f]/.test(body)) body = WORD_JOINER + body;
    const text = glue + wrap(layer, value, body);
    st.out += text + trail;
    out += lead + text + trail;
  }
  return out;
}

/** Inline Markdown for a paragraph's segments. Forced line breaks stay
 *  as U+2028: the block that takes the text writes them its own way. */
export function renderSegs(input: Seg[]): string {
  const segs = tidy(input);
  return render(segs, 0, { out: '', brackets: 0 });
}

/** The forced line breaks of a rendered text, as a paragraph takes them:
 *  a backslash ending the line. A break at either end, or after another,
 *  adds nothing. */
export function withLineBreaks(text: string, guard: (line: string) => string): string {
  if (!text.includes(LINE_BREAK)) return text;
  const lines = text.split(/[ \t]*\u2028[ \t]*/).filter((l) => l.trim() !== '');
  return lines.map((l, n) => (n === 0 ? l : guard(l))).join('\\\n');
}

/** The same on one source line (`\\ ` before a space): list items,
 *  headings, table cells, notes. */
export function withInlineBreaks(text: string): string {
  if (!text.includes(LINE_BREAK)) return text;
  return text.split(/[ \t]*\u2028[ \t]*/).filter((l) => l.trim() !== '').join(' \\\\ ');
}
