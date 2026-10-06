'use client';

import { ViewPlugin, Decoration, Direction, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Facet, Prec, RangeSetBuilder } from '@codemirror/state';
import { bidiClassOf, isRtlScriptChar } from 'postext';

/**
 * Right-to-left lines in the source editor. A line whose text starts (past
 * the markup) with an Arabic or Hebrew letter is laid out right to left
 * (`dir="rtl"` on the line, read by CodeMirror's `perLineTextDirection`, so
 * the caret and the arrow keys follow the text), and the Markdown and
 * directive syntax inside it is set apart as left-to-right islands
 * (`{…}` attributes, `[^id]` labels, `:name` of a directive, a whole
 * `:ref[fig-1]` whose text has no right-to-left letter, maths, code, link
 * targets), so `:::`, `{dir=rtl}` or `$x^2$` read as typed instead of
 * being reordered with the Arabic around them. Left-to-right lines get no
 * decoration: an English or Chinese document is drawn as before.
 *
 * In a right-to-left interface the editor itself runs right to left (its
 * gutter at the right, `rtlEditor`): there every line with a left-to-right
 * letter first (Markdown in English, a fence, code) gets `dir="ltr"`, so
 * only the lines that read right to left are laid out that way.
 */

/** The editor runs right to left (the interface does): left-to-right lines
 *  are then marked as such. */
export const rtlEditor = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

/** Markup a right-to-left line shows left to right, in the order the
 *  scanner tries them at each position. */
const MARKUP: RegExp[] = [
  /\{[^}\n]*\}/y,
  /\[\^[^\]\n]*\]/y,
  /\]\([^)\n]*\)/y,
  /\$\$?[^$\n]+\$\$?/y,
  /`+[^`\n]*`+/y,
  /<\/?[A-Za-z][^>\n]*>/y,
  /https?:\/\/\S+/y,
];
/** A directive name: `:ref`, `:rtl`, `:index`… (one colon, a letter). */
const DIRECTIVE = /:[A-Za-z][\w-]*(?=[[{])/y;

/** The match of the sticky `re` at `at`, or null. */
function matchAt(re: RegExp, text: string, at: number): string | null {
  re.lastIndex = at;
  return re.exec(text)?.[0] ?? null;
}

export interface BidiLine {
  /** The direction of the line from its first strong letter outside the
   *  markup (a fence is always left to right); null for a line with none
   *  (blank, digits and punctuation only). */
  dir: 'ltr' | 'rtl' | null;
  /** In a right-to-left line, the stretches of markup to isolate left to
   *  right, in order and apart (offsets in the line). */
  isolates: { from: number; to: number }[];
}

function hasRtl(text: string): boolean {
  for (const ch of text) if (isRtlScriptChar(ch.codePointAt(0)!)) return true;
  return false;
}

/** The index of the `]` that closes the `[` at `open`, or -1. */
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return i;
  }
  return -1;
}

/** Where a line's markup is and which way it runs (see the module note). */
export function bidiLine(text: string): BidiLine {
  // Fences (`:::callout{…}`, ``` ``` ```), front matter delimiters and
  // container closes are syntax, not text.
  if (/^\s*(?::::|```|~~~|---\s*$)/.test(text)) return { dir: 'ltr', isolates: [] };
  const markup: { from: number; to: number }[] = [];
  let dir: BidiLine['dir'] = null;
  for (let i = 0; i < text.length;) {
    const ch = text[i]!;
    const directive = ch === ':' ? matchAt(DIRECTIVE, text, i) : null;
    if (directive) {
      const nameEnd = i + directive.length;
      // `:ref[fig-1]`: an identifier in brackets is markup as a whole; a
      // directive around Arabic text (`:rtl[…]`, `:smallcaps[…]`) isolates
      // only its name, the text inside reading with the line.
      const close = text[nameEnd] === '[' ? closingBracket(text, nameEnd) : -1;
      if (close > 0 && !hasRtl(text.slice(nameEnd, close))) {
        markup.push({ from: i, to: close + 1 });
        i = close + 1;
      } else {
        markup.push({ from: i, to: nameEnd });
        i = nameEnd;
      }
      continue;
    }
    const hit = '{[]$`<h'.includes(ch) ? MARKUP.map((re) => matchAt(re, text, i)).find((m) => m !== null) : undefined;
    if (hit) {
      markup.push({ from: i, to: i + hit.length });
      i += hit.length;
      continue;
    }
    const cp = text.codePointAt(i)!;
    if (dir === null) {
      const cls = bidiClassOf(cp);
      if (cls === 'R' || cls === 'AL') dir = 'rtl';
      else if (cls === 'L') dir = 'ltr';
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return { dir, isolates: dir === 'rtl' ? markup : [] };
}

const rtlLine = Decoration.line({ attributes: { dir: 'rtl' } });
const ltrLine = Decoration.line({ attributes: { dir: 'ltr' } });
/** `bidiIsolate` tells CodeMirror's own bidi pass (caret motion, the
 *  order it computes for the line) what the `dir` attribute tells the
 *  browser. */
const ltrIsland = Decoration.mark({ class: 'cm-bidi-ltr', attributes: { dir: 'ltr' }, bidiIsolate: Direction.LTR });

interface BidiDecorations {
  /** The `dir` of the right-to-left lines and their islands. */
  all: DecorationSet;
  /** The islands alone, for `EditorView.bidiIsolatedRanges`. */
  islands: DecorationSet;
}

function buildDecorations(view: EditorView): BidiDecorations {
  const all = new RangeSetBuilder<Decoration>();
  const islands = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const rtlBase = view.state.facet(rtlEditor);
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      // Cheap test first: most lines of most documents have no
      // right-to-left letter at all.
      if (hasRtl(line.text)) {
        const { dir, isolates } = bidiLine(line.text);
        if (dir === 'rtl') {
          all.add(line.from, line.from, rtlLine);
          for (const r of isolates) {
            all.add(line.from + r.from, line.from + r.to, ltrIsland);
            islands.add(line.from + r.from, line.from + r.to, ltrIsland);
          }
        } else if (dir === 'ltr' && rtlBase) {
          all.add(line.from, line.from, ltrLine);
        }
      } else if (rtlBase && /\S/.test(line.text)) {
        all.add(line.from, line.from, ltrLine);
      }
      pos = line.to + 1;
    }
  }
  return { all: all.finish(), islands: islands.finish() };
}

const bidiPlugin = ViewPlugin.fromClass(
  class {
    decorations: BidiDecorations;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    // Lowest precedence: CodeMirror draws the marks of lower precedence
    // outside the others, so an island stays one element and the syntax
    // colours of `[fig-1]` or `{…}` are drawn inside it. Split by them,
    // each piece would be an island of its own, and the line would put
    // the pieces in right-to-left order.
    provide: (plugin) => [
      Prec.lowest(EditorView.decorations.of((view) => view.plugin(plugin)?.decorations.all ?? Decoration.none)),
      EditorView.bidiIsolatedRanges.of((view) => view.plugin(plugin)?.decorations.islands ?? Decoration.none),
    ],
  },
);

export const bidiLines = [
  EditorView.perLineTextDirection.of(true),
  bidiPlugin,
  EditorView.baseTheme({
    '.cm-bidi-ltr': { unicodeBidi: 'isolate', direction: 'ltr' },
    // CodeMirror pads a line on physical sides, 6px left and 2px right;
    // the wider gap belongs where the line starts, the right of a
    // right-to-left line.
    '.cm-content > .cm-line': { paddingInline: '6px 2px' },
    // A right-to-left line starts at the right edge; the wrapped lines of
    // a long paragraph follow it.
    '.cm-line[dir="rtl"]': { textAlign: 'right' },
    // In a right-to-left editor, a left-to-right line starts at the left.
    '.cm-line[dir="ltr"]': { textAlign: 'left' },
  }),
];
