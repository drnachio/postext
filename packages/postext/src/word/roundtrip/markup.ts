// Markdown inline markup the importer reads between mapped characters or
// writes for a formatting change: emphasis, small caps, super/subscript,
// inline code and links (the engine's syntax, see parse/inlineFormatting).

/** Markers per format flag: the one written, then the ones read. */
export const FLAG_MARKERS: Record<string, { open: string; close: string }[]> = {
  b: [{ open: '**', close: '**' }, { open: '__', close: '__' }],
  i: [{ open: '*', close: '*' }, { open: '_', close: '_' }],
  c: [{ open: ':smallcaps[', close: ']' }],
  p: [{ open: '^', close: '^' }],
  s: [{ open: '~', close: '~' }],
  k: [{ open: '`', close: '`' }],
};

/** Flag letters in writing order (outermost first). */
export const FLAG_ORDER = 'bicpsk';

const DELIMITER_RE = /\*\*|__|\*|_|\^|~|`|:smallcaps\[|\]\([^()\s]*(?:\s+"[^"]*")?\)|\]|\[|\s+/gy;

/** Whether the markup left between deleted characters may go with them:
 *  only whitespace and delimiters that pair up among themselves (a whole
 *  `**bold**` or `[link](url)` inside the deleted text). Index marks,
 *  attributes and anything else stay. */
export function markupDeletable(gaps: readonly string[]): boolean {
  const counts = new Map<string, number>();
  let opens = 0;
  let closes = 0;
  for (const gap of gaps) {
    DELIMITER_RE.lastIndex = 0;
    let pos = 0;
    while (pos < gap.length) {
      DELIMITER_RE.lastIndex = pos;
      const m = DELIMITER_RE.exec(gap);
      if (!m) return false;
      pos = DELIMITER_RE.lastIndex;
      const tok = m[0];
      if (/^\s/.test(tok)) continue;
      if (tok === '[' || tok === ':smallcaps[') opens++;
      else if (tok.startsWith(']')) closes++;
      else counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  if (opens !== closes) return false;
  for (const n of counts.values()) if (n % 2) return false;
  return true;
}

const LINK_CLOSE_RE = /^\]\([^()\s]*(?:\s+"[^"]*")?\)/;

/** Delimiter pairs wrapping exactly `[s, e)` in `base`: the widened range
 *  when the text between them is all deleted. */
export function widenOverDelimiters(base: string, s: number, e: number): [number, number] {
  for (;;) {
    let grown = false;
    for (const letter of FLAG_ORDER) {
      for (const { open, close } of FLAG_MARKERS[letter]!) {
        if (s >= open.length && base.startsWith(open, s - open.length) && base.startsWith(close, e)) {
          s -= open.length;
          e += close.length;
          grown = true;
          break;
        }
      }
      if (grown) break;
    }
    if (!grown && s > 0 && base[s - 1] === '[') {
      const m = LINK_CLOSE_RE.exec(base.slice(e));
      if (m) {
        s -= 1;
        e += m[0].length;
        grown = true;
      }
    }
    if (!grown) return [s, e];
  }
}

/** The link markup around `[s, e)`: `[` before and `](url)` after. */
export function linkAround(base: string, s: number, e: number): { s: number; e: number } | undefined {
  if (s < 1 || base[s - 1] !== '[') return undefined;
  const m = LINK_CLOSE_RE.exec(base.slice(e));
  return m ? { s: s - 1, e: e + m[0].length } : undefined;
}

/** Length of the run of `ch` ending before `s` / starting at `e`. */
function runBefore(base: string, s: number, ch: string): number {
  let n = 0;
  while (s - n - 1 >= 0 && base[s - n - 1] === ch) n++;
  return n;
}

function runAfter(base: string, e: number, ch: string): number {
  let n = 0;
  while (base[e + n] === ch) n++;
  return n;
}

/** Strip the markers of `letter` immediately around `[s, e)`. In a run of
 *  `*` (or `_`) an odd count holds an italic marker, two or more a bold one
 *  (`***x***` is both). */
export function stripFlag(base: string, s: number, e: number, letter: string): [number, number] | undefined {
  if (letter === 'b' || letter === 'i') {
    for (const ch of ['*', '_']) {
      const before = runBefore(base, s, ch);
      const after = runAfter(base, e, ch);
      if (letter === 'b' && before >= 2 && after >= 2) return [s - 2, e + 2];
      if (letter === 'i' && before % 2 === 1 && after % 2 === 1) return [s - 1, e + 1];
    }
    return undefined;
  }
  for (const { open, close } of FLAG_MARKERS[letter] ?? []) {
    if (s >= open.length && base.startsWith(open, s - open.length) && base.startsWith(close, e)) return [s - open.length, e + close.length];
  }
  return undefined;
}

/** Open and close markup for added flags (outermost first) and a link. */
export function wrapFlags(text: string, letters: string, href?: string): string {
  let open = '';
  let close = '';
  for (const l of FLAG_ORDER) {
    if (!letters.includes(l)) continue;
    const m = FLAG_MARKERS[l]![0]!;
    open += m.open;
    close = m.close + close;
  }
  const inner = open + text + close;
  return href ? `[${inner}](${href})` : inner;
}

/** Escape text typed in Word so the parser reads it as text. */
export function escapeTyped(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if ('*_^~`$\\'.includes(ch)) {
      // A backslash only needs escaping before a character it would escape.
      if (ch === '\\' && !/[*_^~`$@\\[\]]/.test(text[i + 1] ?? '')) out += ch;
      else out += `\\${ch}`;
    } else if (ch === '@' && /[\p{L}\p{N}_]/u.test(text[i + 1] ?? '') && !/[\p{L}\p{N}]/u.test(text[i - 1] ?? '')) {
      out += '\\@';
    } else out += ch;
  }
  return out;
}

/** Flag letters (a key's part before `|`) and link (after it). */
export function splitKey(key: string): { flags: string; href?: string } {
  const bar = key.indexOf('|');
  return bar < 0 ? { flags: key } : { flags: key.slice(0, bar), href: key.slice(bar + 1) };
}

export function makeKey(flags: string, href?: string): string {
  let ordered = '';
  for (const l of FLAG_ORDER) if (flags.includes(l)) ordered += l;
  return href && !href.startsWith('#') ? `${ordered}|${href}` : ordered;
}
