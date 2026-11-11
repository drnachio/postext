// What a replacement writes. Plain text writes the replacement as it is.
// A regular expression reads, in the replacement, `$1`…`$99` (a capture
// group), `$<name>` (a named group), `$&` (the whole match), `$$` (a
// dollar), and the escapes `\n` (a line break), `\t` (a tab) and `\\` (a
// backslash). Everything else is written as it is: `[^$1]` gives `[^`,
// the first group and `]`.

import type { TextChange } from '../textChanges.js';
import type { FindMatch } from './compile.js';

function expandDollar(template: string, i: number, match: FindMatch, text: string, out: string[]): number {
  const next = template[i + 1];
  if (next === '$') {
    out.push('$');
    return i + 2;
  }
  if (next === '&') {
    out.push(text.slice(match.from, match.to));
    return i + 2;
  }
  if (next === '<' && match.named) {
    const close = template.indexOf('>', i + 2);
    if (close > i + 2) {
      out.push(match.named[template.slice(i + 2, close)] ?? '');
      return close + 1;
    }
  }
  const groups = match.groups ?? [];
  const d1 = template.charCodeAt(i + 1) - 48;
  if (d1 >= 0 && d1 <= 9) {
    // `$12` is group 12 when there is one, else group 1 and a "2"
    // (the rule of String.prototype.replace).
    const d2 = template.charCodeAt(i + 2) - 48;
    if (d2 >= 0 && d2 <= 9) {
      const n = d1 * 10 + d2;
      if (n >= 1 && n <= groups.length) {
        out.push(groups[n - 1] ?? '');
        return i + 3;
      }
    }
    if (d1 >= 1 && d1 <= groups.length) {
      out.push(groups[d1 - 1] ?? '');
      return i + 2;
    }
  }
  out.push('$');
  return i + 1;
}

/** The text that replaces `match` in `text`. */
export function expandReplacement(template: string, match: FindMatch, text: string, regex: boolean): string {
  if (!regex) return template;
  const out: string[] = [];
  let i = 0;
  while (i < template.length) {
    const c = template[i]!;
    if (c === '$') {
      i = expandDollar(template, i, match, text, out);
    } else if (c === '\\' && (template[i + 1] === 'n' || template[i + 1] === 't' || template[i + 1] === '\\')) {
      const e = template[i + 1]!;
      out.push(e === 'n' ? '\n' : e === 't' ? '\t' : '\\');
      i += 2;
    } else {
      out.push(c);
      i++;
    }
  }
  return out.join('');
}

/** The changes that replace every match of `matches` in `text`, each
 *  narrowed to the part that differs (1.7 → 1,7 changes the point, so the
 *  caret and the editor's undo stay where they were) and carrying the text
 *  it replaces as `expect`: a change worked out on an older text never
 *  lands (see `EDIT_CHAPTER_MARKDOWN`). */
export function replaceChanges(text: string, matches: readonly FindMatch[], template: string, regex: boolean): TextChange[] {
  return matches.map((m) => {
    const before = text.slice(m.from, m.to);
    const after = expandReplacement(template, m, text, regex);
    let head = 0;
    while (head < before.length && head < after.length && before[head] === after[head]) head++;
    let tail = 0;
    while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
    // Never between the two halves of a surrogate pair.
    if (head > 0 && /[\uD800-\uDBFF]/.test(before[head - 1]!)) head--;
    if (tail > 0 && /[\uDC00-\uDFFF]/.test(before[before.length - tail]!)) tail--;
    return {
      from: m.from + head,
      to: m.to - tail,
      insert: after.slice(head, after.length - tail),
      expect: before.slice(head, before.length - tail),
    };
  });
}
