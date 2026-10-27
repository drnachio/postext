// Postext inline marks to runs Word can carry: protecting what has no Word
// equivalent, then scripts, italics and emphasis.
import { LINE_BREAK, type InlineRun, sameFlags, UNDERSCORE_BLOCKER } from './render.js';

// ---------------------------------------------------------------------------
// Postext Markdown → runs
// ---------------------------------------------------------------------------

type Atom =
  | { kind: 'char'; text: string }
  | { kind: 'raw'; text: string }
  | { kind: 'note'; id: string }
  | { kind: 'link'; inner: string; dest: string }
  | { kind: 'chip'; inner: string; style: string }
  | { kind: 'smallcaps'; inner: string };

const PH_BASE = 0xe800;
const PH_END = 0xf8ff;

export interface ParseInlineOptions {
  /** Footnote ids to turn into Word notes (the rest stay verbatim). */
  notes?: ReadonlySet<string>;
  /** Called for each note marker taken; return false to keep it verbatim
   *  (a note cited twice is one Word note). */
  takeNote?: (id: string) => boolean;
  /** Heading text: `\\` (a title break) stays verbatim. Elsewhere a forced
   *  line break (#620) becomes a {@link LINE_BREAK} in the text. */
  heading?: boolean;
}

/** Index of the `]` that closes the `[` at `open`, honouring `\]` and
 *  nested brackets; -1 when none. */
function closeBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '\n') return -1;
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i;
  }
  return -1;
}

/** End (exclusive) of a link destination opened at `from` (after `(`). */
function destinationEnd(text: string, from: number): number {
  if (text[from] === '<') {
    const close = text.indexOf('>', from);
    if (close < 0) return -1;
    return text[close + 1] === ')' ? close + 2 : -1;
  }
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) return i + 1;
      depth--;
    } else if (c === '\n') return -1;
  }
  return -1;
}

const ESCAPABLE = new Set(['*', '_', '^', '~', '$', '`']);

/** `s` without the spaces and tabs it ends with. */
function trimBlanksEnd(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === ' ' || s[end - 1] === '\t')) end--;
  return s.slice(0, end);
}
const CJK_BASE = /[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}㄀-ㄯ]/u;

/** Tokenise the constructs Word has no emphasis for into atoms, leaving a
 *  string where each atom is one private-use placeholder character. */
function protect(text: string, opts: ParseInlineOptions): { s: string; atoms: Atom[] } {
  const atoms: Atom[] = [];
  let s = '';
  const add = (a: Atom): void => {
    s += String.fromCharCode(PH_BASE + atoms.length);
    atoms.push(a);
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const rest = text.slice(i);
    const code = c.charCodeAt(0);
    if (code >= PH_BASE && code <= PH_END) {
      add({ kind: 'char', text: c });
      i++;
      continue;
    }
    if (c === '\\') {
      if (opts.heading && text[i + 1] === '\\') {
        const m = /^[ \t]*\\\\[ \t]*/.exec(rest)!;
        add({ kind: 'raw', text: m[0] });
        i += m[0].length;
        continue;
      }
      // A forced line break in body text (#620): a backslash before the
      // line feed that joins two lines of the paragraph, or `\\` before a
      // space. Not at the paragraph's end, where the engine prints it.
      const brk = opts.heading ? null : /^\\(?:\n|\\(?:[ \t]+|\n|$))\s*/.exec(rest);
      if (brk && text.slice(i + brk[0].length).trim() !== '' && s.trim() !== '') {
        s = trimBlanksEnd(s);
        add({ kind: 'char', text: LINE_BREAK });
        i += brk[0].length;
        continue;
      }
      const n = text[i + 1];
      if (n !== undefined && ESCAPABLE.has(n)) {
        add({ kind: 'char', text: n });
        i += 2;
        continue;
      }
      s += c;
      i++;
      continue;
    }
    if (c === '`') {
      const m = /^`[^`\n]+?`/.exec(rest);
      if (m) {
        add({ kind: 'raw', text: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if (c === '$') {
      if (text[i + 1] === '$') {
        add({ kind: 'raw', text: '$$' });
        i += 2;
        continue;
      }
      let j = i + 1;
      let close = -1;
      while (j < text.length) {
        if (text[j] === '\\' && text[j + 1] === '$') {
          j += 2;
          continue;
        }
        if (text[j] === '$') {
          close = j;
          break;
        }
        j++;
      }
      add({ kind: 'raw', text: close > i + 1 ? text.slice(i, close + 1) : '$' });
      i = close > i + 1 ? close + 1 : i + 1;
      continue;
    }
    if (c === '[') {
      const note = /^\[\^([\p{L}\p{N}_.:-]+)\]/u.exec(rest);
      if (note) {
        const id = note[1]!;
        if (opts.notes?.has(id) && (opts.takeNote?.(id) ?? true)) add({ kind: 'note', id });
        else add({ kind: 'raw', text: note[0] });
        i += note[0].length;
        continue;
      }
      const close = closeBracket(text, i);
      if (close > i && text[close + 1] === '(') {
        const end = destinationEnd(text, close + 2);
        if (end > 0) {
          const dest = text.slice(close + 2, end - 1);
          if (!/\s"/.test(dest) && !dest.startsWith('<')) add({ kind: 'link', inner: text.slice(i + 1, close), dest });
          else add({ kind: 'raw', text: text.slice(i, end) });
          i = end;
          continue;
        }
      }
    }
    if (c === ':') {
      // A tab (#622) is Word's tab, the spaces around it taken in; one with
      // a stop of its own (`:tab{at=…}`) travels verbatim.
      const tab = /^:tab(?![\p{L}{])/u.exec(rest);
      if (tab && text[i - 1] !== '\\') {
        s = trimBlanksEnd(s);
        add({ kind: 'char', text: '\t' });
        i += tab[0].length;
        while (text[i] === ' ' || text[i] === '\t') i++;
        continue;
      }
      const chip = /^:chip\[((?:\\.|[^\]\\\n])+)\](?:\{([^}\n]*)\})?/.exec(rest);
      if (chip) {
        const attrs = chip[2] ?? '';
        const style = /^\s*style\s*=\s*"([^"]*)"\s*$/.exec(attrs)?.[1] ?? /^\s*style\s*=\s*([^\s"]+)\s*$/.exec(attrs)?.[1];
        if (style !== undefined && !/[$`:[]/.test(chip[1]!)) add({ kind: 'chip', inner: chip[1]!, style });
        else add({ kind: 'raw', text: chip[0] });
        i += chip[0].length;
        continue;
      }
      const sc = /^:smallcaps\[((?:\\.|[^\]\\\n])+)\]/.exec(rest);
      if (sc && !/[[:]/.test(sc[1]!)) {
        add({ kind: 'smallcaps', inner: sc[1]! });
        i += sc[0].length;
        continue;
      }
      const dir = /^:[a-z][a-zA-Z0-9-]*/.exec(rest);
      if (dir && (rest[dir[0].length] === '[' || rest[dir[0].length] === '{') && text[i - 1] !== '\\') {
        let end = i + dir[0].length;
        if (text[end] === '[') {
          const close = closeBracket(text, end);
          end = close > 0 ? close + 1 : end;
        }
        if (text[end] === '{') {
          const close = text.indexOf('}', end);
          if (close > 0 && !text.slice(end, close).includes('\n')) end = close + 1;
        }
        if (end > i + dir[0].length) {
          add({ kind: 'raw', text: text.slice(i, end) });
          i = end;
          continue;
        }
      }
    }
    if (c === '{') {
      const ruby = /^\{([^{}|\n]+)\|([^{}\n]+)\}/.exec(rest);
      if (ruby && CJK_BASE.test(ruby[1]!)) {
        add({ kind: 'raw', text: ruby[0] });
        i += ruby[0].length;
        continue;
      }
    }
    s += c;
    i++;
  }
  return { s, atoms };
}

const UB = '(?:_|(?![\\p{sc=Han}\\p{sc=Hira}\\p{sc=Kana}\\p{sc=Hang}])[\\p{L}\\p{N}])';
const usOpen = (n: number): string => `(?<!${UB})${'_'.repeat(n)}(?!_)`;
const usClose = (n: number): string => `(?<!_)${'_'.repeat(n)}(?!${UB})`;
const SUP = '\\^(\\S(?:[^^\\n]*?\\S)?)\\^';
const EA = '(?:[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff01-\\uff60]|[\\ud840-\\ud8bf][\\udc00-\\udfff])';
const TILDE = '(?!(?<=[0-9])~[0-9])~';
const TILDE_OPEN = `(?!(?<=${EA})~${EA})${TILDE}`;
const SUB = `${TILDE_OPEN}(\\S(?:[^~\\n]*?\\S)?)${TILDE}`;

interface Span { text: string; bold: boolean; italic: boolean; script?: 'sup' | 'sub' }

function scripts(text: string, bold: boolean, italic: boolean, out: Span[]): void {
  const re = new RegExp(`${SUP}|${SUB}`, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold, italic });
    if (m[1] !== undefined) out.push({ text: m[1], bold, italic, script: 'sup' });
    else out.push({ text: m[2]!, bold, italic, script: 'sub' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold, italic });
}

function italics(text: string, bold: boolean, forced: boolean, out: Span[]): void {
  if (forced) {
    scripts(text, bold, true, out);
    return;
  }
  const re = new RegExp(`\\*(.+?)\\*|${usOpen(1)}(.+?)${usClose(1)}`, 'gu');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) scripts(text.slice(last, m.index), bold, false, out);
    scripts(m[1] ?? m[2]!, bold, true, out);
    last = m.index + m[0].length;
  }
  if (last < text.length) scripts(text.slice(last), bold, false, out);
}

/** The engine's emphasis scan (bold first, then italics, then scripts). */
function emphasis(text: string): Span[] {
  const re = new RegExp(`\\*\\*\\*(.+?)\\*\\*\\*|${usOpen(3)}(.+?)${usClose(3)}|\\*\\*(.+?)\\*\\*|${usOpen(2)}(.+?)${usClose(2)}`, 'gu');
  const out: Span[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) italics(text.slice(last, m.index), false, false, out);
    const triple = m[1] ?? m[2];
    if (triple !== undefined) italics(triple, true, true, out);
    else italics(m[3] ?? m[4]!, true, false, out);
    last = m.index + m[0].length;
  }
  if (last < text.length) italics(text.slice(last), false, false, out);
  return out;
}

/** Postext inline Markdown → runs. Every character with inline meaning the
 *  runs cannot say (an unpaired `*`, a `$` that opens nothing) is kept as a
 *  verbatim run, so `renderInline(parseInline(x))` reads as `x`. */
export function parseInline(text: string, opts: ParseInlineOptions = {}): InlineRun[] {
  const { s, atoms } = protect(text, opts);
  const out: InlineRun[] = [];
  const push = (r: InlineRun): void => {
    const last = out[out.length - 1];
    if (last && r.note === undefined && sameFlags(last, r)) last.text += r.text;
    else out.push(r);
  };
  for (const span of emphasis(s)) {
    const base: InlineRun = { text: '', ...(span.bold ? { bold: true } : {}), ...(span.italic ? { italic: true } : {}), ...(span.script ? { script: span.script } : {}) };
    const chars = [...span.text];
    chars.forEach((ch, ci) => {
      const code = ch.charCodeAt(0);
      if (code >= PH_BASE && code <= PH_END && ch.length === 1) {
        const atom = atoms[code - PH_BASE]!;
        switch (atom.kind) {
          case 'char':
            push({ ...base, text: atom.text });
            return;
          case 'raw':
            push({ ...base, text: atom.text, raw: true });
            return;
          case 'note':
            push({ text: '', note: atom.id });
            return;
          case 'link':
            for (const r of parseInline(atom.inner, opts)) push({ ...r, bold: r.bold || base.bold || undefined, italic: r.italic || base.italic || undefined, href: atom.dest });
            return;
          case 'chip':
            for (const r of parseInline(atom.inner.replace(/\\\]/g, ']'), opts)) push({ ...r, bold: r.bold || base.bold || undefined, italic: r.italic || base.italic || undefined, chip: atom.style });
            return;
          case 'smallcaps':
            for (const r of parseInline(atom.inner.replace(/\\([[\]])/g, '$1'), opts)) push({ ...r, bold: r.bold || base.bold || undefined, italic: r.italic || base.italic || undefined, smallCaps: true });
            return;
        }
      }
      // A marker character the scan left: verbatim, unless re-importing
      // would write it bare anyway (an `_` inside a word).
      if (ch === '*' || ch === '^' || ch === '~' || ch === '`') {
        push({ ...base, text: ch, raw: true });
        return;
      }
      if (ch === '_') {
        const prev = chars[ci - 1] ?? '';
        const next = chars[ci + 1] ?? '';
        if (!(UNDERSCORE_BLOCKER.test(prev) && UNDERSCORE_BLOCKER.test(next))) {
          push({ ...base, text: ch, raw: true });
          return;
        }
      }
      push({ ...base, text: ch });
    });
  }
  return out.map((r) => {
    const clean: InlineRun = { text: r.text };
    if (r.bold) clean.bold = true;
    if (r.italic) clean.italic = true;
    if (r.smallCaps) clean.smallCaps = true;
    if (r.script) clean.script = r.script;
    if (r.raw) clean.raw = true;
    if (r.href !== undefined) clean.href = r.href;
    if (r.chip !== undefined) clean.chip = r.chip;
    if (r.note !== undefined) clean.note = r.note;
    return clean;
  });
}
