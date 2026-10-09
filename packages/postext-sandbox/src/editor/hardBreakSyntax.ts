'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { verseLineKinds } from './verseSyntax';

/**
 * Editor support for forced line breaks (#620): marks the backslash that
 * ends a line of a paragraph, a quotation or a list item when the block
 * goes on below it, and `\\` before a space, as the engine reads them
 * (`replaceBodyBreaks`). Inline code and maths, display formulas and
 * `:::verse` poems (whose spaced `\\` parts a bayt) are left alone. A
 * heading's `\\` breaks its title, and is marked too.
 */

const breakMark = Decoration.mark({ class: 'cm-hard-break' });

/** A line that opens a block of its own, so the paragraph above ends. */
const BLOCK_START_RE = /^\s*(?:#{1,6}\s|:::|::resource\b|\$\$|>|(?:[-*+]|\d+[.)])\s)/;
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s/;
const HEADING_RE = /^\s*#{1,6}\s/;
/** Inline code and inline maths, whose backslashes are theirs. */
const CODE_OR_MATH_RE = /`[^`\n]+?`|\$[^$\n]+\$/g;
const DISPLAY_RE = /^\s*\$\$/;
/** How many lines above the viewport are read to tell whether it starts
 *  inside a display formula. */
const LOOK_BACK = 400;

/** The forced breaks of a line (`[from, to)` in it), given the line after
 *  it in the text (undefined at the end). */
export function hardBreakMarks(text: string, next: string | undefined): Array<{ from: number; to: number }> {
  if (!text.includes('\\')) return [];
  // Code and maths become text of their length with no backslash in it.
  const masked = text.replace(CODE_OR_MATH_RE, (m) => 'x'.repeat(m.length));
  const out: Array<{ from: number; to: number }> = [];
  const re = /\\\\(?=[ \t]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const before = masked.slice(0, m.index).replace(/^\s*(?:>\s?|(?:[-*+]|\d+[.)])\s+)?/, '');
    if (before.trim() !== '' && masked.slice(m.index + 2).trim() !== '') out.push({ from: m.index, to: m.index + 2 });
  }
  // A backslash ending the line, when the block goes on below it: the next
  // line holds text and opens no block (a quotation goes on in a `>` line).
  const end = masked.replace(/\s+$/, '').length;
  if (masked[end - 1] === '\\' && !LIST_RE.test(text) && !HEADING_RE.test(text) && next !== undefined && next.trim() !== '') {
    const quote = /^\s*>/.test(text);
    const goesOn = quote ? /^\s*>\s*\S/.test(next) : !BLOCK_START_RE.test(next);
    const from = masked[end - 2] === '\\' ? end - 2 : end - 1;
    if (goesOn && !out.some((r) => r.from === from)) out.push({ from, to: end });
  }
  return out;
}

/** For each of `lines`, whether a forced break may stand on it: not inside
 *  a display formula (`display` says whether the first line is in one) nor
 *  in a poem (`verse`, as `verseLineKinds` reads them). */
export function breakableLines(lines: readonly string[], display = false, verse: boolean | 'bayt' | 'lines' = false): boolean[] {
  const kinds = verseLineKinds(lines, verse);
  let inDisplay = display;
  return lines.map((text, i) => {
    if (DISPLAY_RE.test(text)) {
      const t = text.trim();
      if (inDisplay) inDisplay = false;
      else if (!(t.length > 2 && t.endsWith('$$'))) inDisplay = true;
      return false;
    }
    return !inDisplay && kinds[i] === null;
  });
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    // Read from a little above, so a formula or a poem open at the top of
    // the range is known.
    const start = Math.max(1, first - LOOK_BACK);
    const lines: string[] = [];
    for (let n = start; n <= last; n++) lines.push(doc.line(n).text);
    const ok = breakableLines(lines);
    for (let n = first; n <= last; n++) {
      const i = n - start;
      if (!ok[i]) continue;
      const line = doc.line(n);
      const next = n < doc.lines ? doc.line(n + 1).text : undefined;
      for (const r of hardBreakMarks(line.text, next)) builder.add(line.from + r.from, line.from + r.to, breakMark);
    }
  }
  return builder.finish();
}

export const hardBreakHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const hardBreakTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-hard-break': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
  }),
);
