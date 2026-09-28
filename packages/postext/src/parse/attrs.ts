import type { DirectiveAttrs } from './types';

/** An attribute key: ASCII, so ids stay portable. */
const KEY = '[A-Za-z_][A-Za-z0-9_-]*';
/** `=`, or the fullwidth `＝` a Chinese input method types (#181). */
const EQUALS = '[=\\uFF1D]';
/** A value: `"…"`, `'…'`, the curly `“…”` and corner `「…」` quotes a
 *  Chinese input method types (#181), or bare up to the next space. */
const VALUE = `"([^"]*)"|'([^']*)'|\\u201C([^\\u201D]*)\\u201D|\\u300C([^\\u300D]*)\\u300D|([^\\s]+)`;
const TOKEN = `(${KEY})(?:\\s*${EQUALS}\\s*(?:${VALUE}))?`;

/** One `key`, `key=value` or `key="value"` of an attribute blob, with where
 *  its value sits in the blob. */
export interface AttrToken {
  key: string;
  value: string;
  /** Offsets of the token in the blob. */
  start: number;
  end: number;
  /** Offsets of the value's text (inside its quotes), when it has one. */
  valueStart?: number;
  valueEnd?: number;
  /** The value was written between quotes. */
  quoted: boolean;
  /** A key without `=`: a flag with an empty value. */
  flag: boolean;
}

function tokenAt(m: RegExpExecArray): AttrToken {
  const key = m[1]!;
  const groups = [m[2], m[3], m[4], m[5], m[6]];
  const which = groups.findIndex((g) => g !== undefined);
  const start = m.index;
  const end = m.index + m[0].length;
  if (which < 0) return { key, value: '', start, end, quoted: false, flag: true };
  const value = groups[which]!;
  const quoted = which < 4;
  // The value is the end of the match, before its closing quote.
  const valueEnd = end - (quoted ? 1 : 0);
  return { key, value, start, end, valueStart: valueEnd - value.length, valueEnd, quoted, flag: false };
}

/** Every token of an attribute blob, read leniently: anything that is not
 *  a token is skipped (see {@link parseDirectiveAttrs}). */
export function scanDirectiveAttrs(raw: string): AttrToken[] {
  const re = new RegExp(TOKEN, 'g');
  const out: AttrToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(tokenAt(m));
  return out;
}

/** Parse the attribute blob inside a `:::name{ ... }` directive, a
 *  `:::container{ ... }` fence or an inline `:ref{ ... }`.
 *  Supports `key="quoted"`, `key='quoted'`, `key=“quoted”`,
 *  `key=「quoted」`, `key=bare`, and bare `key`; `＝` works as `=`.
 *  Attributes may appear in any order; a repeated key keeps the last value.
 *
 *  Lives in its own module so the block parser and the inline-formatting
 *  pre-pass can share it without a circular import. */
export function parseDirectiveAttrs(raw: string): DirectiveAttrs {
  const out: DirectiveAttrs = {};
  for (const t of scanDirectiveAttrs(raw)) out[t.key] = t.value;
  return out;
}

/**
 * The tokens of a blob the attribute grammar reads whole: tokens separated
 * by whitespace (none needed after a quoted value), nothing else. `undefined`
 * when anything in it is not a token (`{x, y}`, `{紅樓|hóng lóu}`), so a
 * heading keeps such braces in its title.
 */
export function parseAttrBlobStrict(raw: string): AttrToken[] | undefined {
  const re = new RegExp(TOKEN, 'y');
  const out: AttrToken[] = [];
  let at = 0;
  const skipSpace = (): void => {
    while (at < raw.length && /\s/.test(raw[at]!)) at++;
  };
  skipSpace();
  while (at < raw.length) {
    re.lastIndex = at;
    const m = re.exec(raw);
    if (!m) return undefined;
    const token = tokenAt(m);
    at = token.end;
    const before = at;
    skipSpace();
    // Two tokens need a space between them unless a quote closes the first.
    if (at < raw.length && at === before && !token.quoted) return undefined;
    out.push(token);
  }
  return out;
}

/** A key written with letters outside ASCII (`作者=曹雪芹`): the grammar
 *  does not read it, so the attribute is lost. Offsets into the blob. */
export interface InvalidAttrKey {
  key: string;
  start: number;
  end: number;
}

/**
 * The keys of an attribute blob that hold letters outside ASCII, each
 * followed by `=` or `＝`. Quoted values are skipped, so an `=` inside a
 * value is never read as a key.
 */
export function invalidAttributeKeys(raw: string): InvalidAttrKey[] {
  const out: InvalidAttrKey[] = [];
  const closers: Record<string, string> = { '"': '"', "'": "'", '“': '”', '「': '」' };
  const keyRe = /[\p{L}_][\p{L}\p{N}_-]*/uy;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    const close = closers[ch];
    if (close !== undefined) {
      const end = raw.indexOf(close, i + 1);
      i = end < 0 ? raw.length : end + 1;
      continue;
    }
    keyRe.lastIndex = i;
    const m = keyRe.exec(raw);
    if (!m) {
      i++;
      continue;
    }
    const key = m[0];
    let j = i + key.length;
    while (j < raw.length && /\s/.test(raw[j]!)) j++;
    if ((raw[j] === '=' || raw[j] === '＝') && /[^\x00-\x7F]/.test(key)) {
      out.push({ key, start: i, end: i + key.length });
    }
    i += key.length;
  }
  return out;
}

/** Upper bound on `:::space{lines=N}` — a typo like `lines=100` must not
 *  swallow page after page. */
export const MAX_SPACE_LINES = 20;

/** The body lines a `:::space` directive asks for: its `lines` attribute
 *  (default 1). `undefined` when the value is not a positive number up to
 *  {@link MAX_SPACE_LINES} — the engine then falls back to one line and the
 *  sandbox flags it. */
export function spaceDirectiveLines(attrs: DirectiveAttrs | undefined): number | undefined {
  const raw = attrs?.lines;
  if (raw === undefined) return 1;
  const n = Number(raw.trim());
  if (raw.trim() === '' || !Number.isFinite(n) || n <= 0 || n > MAX_SPACE_LINES) return undefined;
  return n;
}
