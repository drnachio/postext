/**
 * The small HTML a citation processor writes (citeproc-js's `html` output)
 * as inline spans: `<i>`, `<b>`, `<sup>`, `<sub>`, the `font-style` /
 * `font-weight` / `font-variant` spans CSL flip-flops use, `<a href>`
 * links, and character entities. Any other tag is dropped, its text kept.
 */

import type { InlineSpan } from '../parse';

interface Style {
  italic: boolean;
  bold: boolean;
  smallCaps: boolean;
  script?: 'sup' | 'sub';
  href?: string;
}

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Character entities of `text` decoded. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

/** The spans of a formatted citation or bibliography entry. `base` is
 *  the emphasis of the text around it (a citation in an italic sentence). */
export function htmlToSpans(html: string, base: { bold: boolean; italic: boolean } = { bold: false, italic: false }): InlineSpan[] {
  const out: InlineSpan[] = [];
  const stack: Style[] = [{ italic: base.italic, bold: base.bold, smallCaps: false }];
  const top = (): Style => stack[stack.length - 1]!;
  const tagStack: string[] = [];
  const push = (text: string): void => {
    if (text.length === 0) return;
    const s = top();
    const last = out[out.length - 1];
    const linkOf = (span: InlineSpan): string | undefined => span.links?.[0]?.href;
    if (last && last.italic === s.italic && last.bold === s.bold && (last.smallCaps ?? false) === s.smallCaps && last.script === s.script && linkOf(last) === s.href) {
      last.text += text;
      if (s.href) last.links = [{ start: 0, end: last.text.length, href: s.href }];
      return;
    }
    out.push({
      text,
      bold: s.bold,
      italic: s.italic,
      ...(s.smallCaps ? { smallCaps: true } : {}),
      ...(s.script ? { script: s.script } : {}),
      ...(s.href ? { links: [{ start: 0, end: text.length, href: s.href }] } : {}),
    });
  };
  const TAG = /<(\/?)([a-z]+)([^>]*)>/gi;
  let last = 0;
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    push(decodeEntities(html.slice(last, m.index)));
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const name = m[2]!.toLowerCase();
    const attrs = m[3] ?? '';
    if (name === 'br') continue;
    if (closing) {
      const at = tagStack.lastIndexOf(name);
      if (at >= 0) {
        stack.length = at + 1;
        tagStack.length = at;
      }
      continue;
    }
    const s: Style = { ...top() };
    if (name === 'i' || name === 'em') s.italic = true;
    else if (name === 'b' || name === 'strong') s.bold = true;
    else if (name === 'sup') s.script = 'sup';
    else if (name === 'sub') s.script = 'sub';
    else if (name === 'a') {
      const href = /href="([^"]*)"/i.exec(attrs)?.[1];
      if (href) s.href = decodeEntities(href);
    } else if (name === 'span') {
      const style = /style="([^"]*)"/i.exec(attrs)?.[1] ?? '';
      if (/font-style:\s*italic/i.test(style)) s.italic = true;
      if (/font-style:\s*normal/i.test(style)) s.italic = false;
      if (/font-weight:\s*bold/i.test(style)) s.bold = true;
      if (/font-weight:\s*normal/i.test(style)) s.bold = false;
      if (/font-variant:\s*small-caps/i.test(style)) s.smallCaps = true;
      if (/font-variant:\s*normal/i.test(style)) s.smallCaps = false;
    }
    stack.push(s);
    tagStack.push(name);
  }
  push(decodeEntities(html.slice(last)));
  return out;
}
