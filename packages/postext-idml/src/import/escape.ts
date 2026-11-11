// Story text as Postext Markdown that reads back as the same text.
//
// Postext's dialect is line based with regular-expression inline passes:
// a character acts as markup only in certain places. The engine's own
// escaping (shared with the Word importer) covers emphasis, scripts,
// maths, code, links, footnote markers and `:name[…]` directives. A page
// layout document holds more than a manuscript does (file paths, code,
// catalogue numbers), so the rest of the dialect is closed here too:
// backslashes, cross-reference and citation keys, compact ruby, bracketed
// anchors, bare `:tab`. Where the dialect has no escape, an invisible word
// joiner (U+2060) parts the characters that would act together; it has
// no width and breaks no line.

import { escapeText, guardLineStart, WORD_JOINER } from 'postext/writer';

export { WORD_JOINER };
export const LINE_BREAK = '\u2028';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff\ue000-\uf8ff]/g;

/** Characters that are no text: controls, a byte order mark, private-use
 *  code points (the engine keeps its own marks there). */
export function cleanText(text: string): string {
  return text.replace(/\r\n?|\n/g, ' ').replace(CONTROL, '');
}

/** Text of a story as inline Markdown that prints the same characters.
 *  `before` and `after` are the text around it in its paragraph (they
 *  decide whether an underscore stands inside a word). */
export function escapeStory(text: string, before = '', after = ''): string {
  // A backslash never escapes and never pairs: `\*`, `\\ ` (a forced
  // break) and `\ref{…}` typed in a story are text.
  const guarded = cleanText(text).replace(/\\/g, `\\${WORD_JOINER}`);
  // `\<joiner>` came from the story; `\*` and friends are added here.
  let out = escapeText(guarded, before, after);
  out = out
    // `[words]{#key}` names an anchor.
    .replace(/\](?=\{)/g, `]${WORD_JOINER}`)
    // `{base|reading}` is a compact ruby.
    .replace(/\{(?=[^{}|\n]*[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Bopo}][^{}|\n]*\|)/gu, '\\{')
    // Underscores in a row pair up as emphasis.
    .replace(/(?<!\\)_(?=_)|(?<=_)_/g, '\\_')
    // `@key`, `[@key]`, `@sec:id` are citations and references.
    .replace(/(?<![\p{L}\p{N}_])@(?=[\p{L}\p{N}_-])/gu, `@${WORD_JOINER}`)
    // A bare `:tab` is a tab, a bare `:index` a mark.
    .replace(/(?<![\\:]):(?=(?:tab|index|anchor)(?![a-z0-9-]))/g, `:${WORD_JOINER}`)
    // `![alt](src)` is an image even when the link is broken.
    .replace(/!(?=\[)/g, `!${WORD_JOINER}`)
    // `++text++` underlines where a book switches it on.
    .replace(/\+(?=\+)/g, `+${WORD_JOINER}`);
  return out;
}

/** The first line of a block kept from opening a list, a heading, a
 *  quote, a fence, a formula, a note definition or front matter. */
export function guardBlockStart(line: string): string {
  const guarded = guardLineStart(line);
  if (guarded !== line) return guarded;
  return /^(?:---|\+\s|`{3}|~{3}|={3}|\|)/.test(line) || /^[-*+]$/.test(line.trim()) ? WORD_JOINER + line : line;
}

/** Text set between the brackets of a directive (`:underline[…]`): every
 *  `]` that is not already escaped gets its backslash. The text is
 *  Markdown already. */
export function inBrackets(markdown: string): string {
  let out = '';
  for (let i = 0; i < markdown.length; i++) {
    const c = markdown[i]!;
    if (c === '\\' && i + 1 < markdown.length) out += c + markdown[++i];
    else out += c === ']' ? '\\]' : c;
  }
  return out;
}

/** A value of a directive's attribute (`title="…"`): no quote of its own
 *  kind, no brace, one line. What had to change is told by `changed`. */
export function attributeValue(value: string): { text: string; changed: boolean } {
  const flat = cleanText(value).replace(/\s+/g, ' ').trim();
  const text = flat.replace(/"/g, '”').replace(/[{}]/g, '');
  return { text, changed: text !== flat };
}

/** An identifier the dialect takes for anchors, notes and resources:
 *  ASCII letters, digits and hyphens, never empty. */
export function idOf(text: string, fallback: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return s || fallback;
}

/** Hands out identifiers that are unique among those it gave. */
export class Ids {
  private readonly used = new Set<string>();
  take(base: string): string {
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}-${n}`;
    this.used.add(id);
    return id;
  }
  has(id: string): boolean {
    return this.used.has(id);
  }
}
