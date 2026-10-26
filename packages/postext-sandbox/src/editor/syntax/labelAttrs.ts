import type { TextChange } from '../../book/textChanges.js';

// ---------------------------------------------------------------------------
// The attributes of a figure's label in the chapter's Markdown (#1064): the
// one-line `::label[TEXT]{at=… style=…}` and the container `:::label{…}` …
// `:::` (#1058). A label's words and its own attributes stay in the text:
// the anchor editor and the sandbox_edit_labels tool turn one attribute
// on, set it or take it off here (`leader`, `leader="none"`), and the
// text editor's symbol picker writes an `:icon` (`iconDirective`). Pure.
// ---------------------------------------------------------------------------

/** Where a label is written: its start (`::label[` or `:::label`) and the
 *  end of its bracketed text (one-line form), as `MarkdownLabel` and the
 *  parser's `FigureLabel` give them. */
export interface LabelSource {
  start: number;
  textEnd: number;
}

interface Token {
  name: string;
  text: string;
}

/** The attributes of a directive's braces, each as written. A value may be
 *  quoted with `"` or `'`; a name stands alone for a flag. Scanned by hand
 *  (no pattern over the user's text). */
export function attrTokens(blob: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = blob.length;
  const space = (c: string | undefined) => c === ' ' || c === '\t';
  while (i < n) {
    while (i < n && space(blob[i])) i++;
    if (i >= n) break;
    const start = i;
    while (i < n && !space(blob[i]) && blob[i] !== '=') i++;
    const name = blob.slice(start, i);
    if (blob[i] === '=') {
      i++;
      const q = blob[i];
      if (q === '"' || q === "'") {
        i++;
        while (i < n && blob[i] !== q) i++;
        if (i < n) i++;
      } else {
        while (i < n && !space(blob[i])) i++;
      }
    }
    out.push({ name, text: blob.slice(start, i) });
  }
  return out;
}

/** The braces of the label written at `label` in `markdown`: the range
 *  inside them, or, when it has none, where `{}` would go. */
export function labelBraces(markdown: string, label: LabelSource): { from: number; to: number; open: boolean } | null {
  let lineEnd = markdown.indexOf('\n', label.start);
  if (lineEnd < 0) lineEnd = markdown.length;
  const line = markdown.slice(label.start, lineEnd);
  if (line.startsWith(':::')) {
    const open = line.indexOf('{');
    if (open < 0) {
      // `:::label` with no attributes: after the word.
      const word = ':::label'.length;
      if (!line.startsWith(':::label')) return null;
      return { from: label.start + word, to: label.start + word, open: false };
    }
    const close = line.indexOf('}', open);
    if (close < 0) return null;
    return { from: label.start + open + 1, to: label.start + close, open: true };
  }
  if (!line.startsWith('::label[')) return null;
  // The bracketed text ends at `textEnd` (its `]`).
  if (markdown[label.textEnd] !== ']') return null;
  const after = label.textEnd + 1;
  if (markdown[after] !== '{') return { from: after, to: after, open: false };
  const close = markdown.indexOf('}', after);
  if (close < 0 || close > lineEnd) return null;
  return { from: after + 1, to: close, open: true };
}

/** A value as an attribute writes it: quoted, without the characters that
 *  would end it. */
const quoteValue = (v: string) => `"${v.replace(/["}\n\r]/g, '')}"`;

/**
 * The change that sets attribute `key` of the label at `label`: `true` a
 * bare flag (`leader`), a string `key="value"`, null takes it away. The
 * other attributes stay as written, in their order; the new one goes last.
 * Null when there is nothing to change or the label is not where it says.
 */
export function setLabelAttr(markdown: string, label: LabelSource, key: string, value: string | true | null): TextChange | null {
  const braces = labelBraces(markdown, label);
  if (!braces) return null;
  const blob = braces.open ? markdown.slice(braces.from, braces.to) : '';
  const tokens = attrTokens(blob);
  const kept = tokens.filter((t) => t.name !== key).map((t) => t.text);
  if (value !== null) kept.push(value === true ? key : `${key}=${quoteValue(value)}`);
  const inner = kept.join(' ');
  if (!braces.open) {
    if (value === null) return null;
    return { from: braces.from, to: braces.to, insert: `{${inner}}`, expect: '' };
  }
  if (inner === blob) return null;
  return { from: braces.from, to: braces.to, insert: inner, expect: blob };
}

/** What a label's own `leader` attribute says: `'anchor'` (none written:
 *  the anchor and the style decide), `'on'` or `'off'` (`leader="none"`). */
export type LabelLeaderChoice = 'anchor' | 'on' | 'off';

/** The change that writes `choice` as the label's `leader` attribute. */
export function setLabelLeader(markdown: string, label: LabelSource, choice: LabelLeaderChoice): TextChange | null {
  return setLabelAttr(markdown, label, 'leader', choice === 'anchor' ? null : choice === 'on' ? true : 'none');
}

/** An inline symbol of a label (#1058): a picture of the book, a glyph in a
 *  face, or a line sample. */
export type IconSpec =
  | { kind: 'resource'; resource: string }
  | { kind: 'glyph'; glyph: string; font?: string }
  | { kind: 'line'; line: 'solid' | 'dashed' | 'dotted' };

/** The `:icon[alt]{…}` directive of `spec`: `alt` is what a reader hears
 *  for the symbol (brackets escaped, backslashes dropped), `color` a hex or a palette id, `size`
 *  the symbol's height in ems. */
export function iconDirective(spec: IconSpec, alt: string, options: { color?: string; size?: number } = {}): string {
  const attrs: string[] = [];
  if (spec.kind === 'resource') attrs.push(`resource=${quoteValue(spec.resource.trim())}`);
  else if (spec.kind === 'glyph') {
    attrs.push(`glyph=${quoteValue(spec.glyph)}`);
    if (spec.font?.trim()) attrs.push(`font=${quoteValue(spec.font.trim())}`);
  } else attrs.push(`line=${quoteValue(spec.line)}`);
  const color = options.color?.trim();
  if (color) attrs.push(`color=${quoteValue(color)}`);
  if (options.size !== undefined && Number.isFinite(options.size) && options.size > 0) attrs.push(`size=${quoteValue(String(Math.round(options.size * 100) / 100))}`);
  // A backslash means nothing in a spoken name and would start an escape
  // (or a `\\` line break in a label), so it is dropped, not escaped.
  const text = alt
    .replace(/[\n\r]+/g, ' ')
    .replace(/[\\[\]]/g, (c) => (c === '\\' ? '' : `\\${c}`))
    .trim();
  return `:icon[${text}]{${attrs.join(' ')}}`;
}
