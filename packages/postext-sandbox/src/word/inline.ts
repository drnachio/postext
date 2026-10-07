// Inline text both ways: Word runs → Postext inline marks (import) and
// Postext inline marks → runs Word can carry (export). Whatever has no Word
// equivalent (`:ref{…}`, maths, `:index`, annotations, a stray `*`) travels
// as a verbatim run, so a manuscript that goes to Word and back keeps it.

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  script?: 'sup' | 'sub';
  /** Postext Markdown written as is. */
  raw?: boolean;
  /** Link destination. */
  href?: string;
  /** Chip style id. */
  chip?: string;
  /** Footnote marker (`[^id]`); `text` is empty. */
  note?: string;
}

export const WORD_JOINER = '⁠';

// ---------------------------------------------------------------------------
// Runs → Postext Markdown
// ---------------------------------------------------------------------------

/** Letters that keep an `_` beside them from opening emphasis (CJK do not). */
const UNDERSCORE_BLOCKER = /^(?:_|(?![\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}])[\p{L}\p{N}])$/u;

/** Escape the characters with inline meaning so they print literally. An
 *  `_` between two letters is text already and stays bare. */
export function escapeText(text: string, before = '', after = ''): string {
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === '*' || ch === '^' || ch === '~' || ch === '$' || ch === '`') out += '\\' + ch;
    else if (ch === '_') {
      const prev = i > 0 ? chars[i - 1]! : [...before].pop() ?? '';
      const next = i + 1 < chars.length ? chars[i + 1]! : [...after][0] ?? '';
      out += UNDERSCORE_BLOCKER.test(prev) && UNDERSCORE_BLOCKER.test(next) ? '_' : '\\_';
    } else out += ch;
  }
  // `[text](url)` and `:name[` / `:name{` typed as text would become a link
  // or a directive: an invisible word joiner keeps them literal.
  return out
    .replace(/\]\(/g, `]${WORD_JOINER}(`)
    .replace(/(?<![\\:]):(?=[a-z][a-z0-9-]*[[{])/g, `:${WORD_JOINER}`)
    .replace(/\[(?=\^)/g, `[${WORD_JOINER}`);
}

const LINE_START_TRAP = /^(?:\d+[.)]\s|[٠-٩۰-۹]+[.)]\s|[-*+]\s|>|#{1,6}\s|:::|::resource|\$\$|\[\^[^\]]*\]:)/;

/** A word joiner in front of a paragraph that would otherwise open a list,
 *  heading, quote, fence or note definition. */
export function guardLineStart(line: string): string {
  return LINE_START_TRAP.test(line) ? WORD_JOINER + line : line;
}

/** A link destination Postext reads back whole: spaces, `$`, backslashes,
 *  angle brackets and unbalanced parentheses percent-encoded. */
export function linkDestination(url: string): string {
  const u = url.trim();
  let depth = 0;
  let balanced = true;
  for (const ch of u) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) balanced = false;
  }
  balanced = balanced && depth === 0;
  let out = '';
  for (const ch of u) {
    if (/\s/.test(ch)) out += '%20';
    else if ('$\\<>'.includes(ch) || ('()'.includes(ch) && !balanced)) out += '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    else out += ch;
  }
  return out;
}

type Flags = Pick<InlineRun, 'bold' | 'italic' | 'smallCaps' | 'script' | 'raw' | 'href' | 'chip' | 'note'>;
const sameFlags = (a: Flags, b: Flags): boolean =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.smallCaps === !!b.smallCaps && a.script === b.script
  && !!a.raw === !!b.raw && a.href === b.href && a.chip === b.chip && a.note === undefined && b.note === undefined;

function merge(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const r of runs) {
    if (!r.text && r.note === undefined) continue;
    const last = out[out.length - 1];
    if (last && sameFlags(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

const NEUTRAL_RE = /^\s*$/u;
const WORD_RE = '(?:(?![\\u3040-\\u30ff\\u3100-\\u312f\\u31a0-\\u31ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff])[\\p{L}\\p{N}_])+';
const WORD_TAIL = new RegExp(`(${WORD_RE})$`, 'u');
const WORD_HEAD = new RegExp(`^(${WORD_RE})`, 'u');
const plainRun = (r: InlineRun): boolean => !r.raw && !r.script && !r.chip && r.note === undefined && !r.href;

/** Style boundaries on word boundaries: spaces and punctuation between two
 *  runs of one style take that style; a style change inside a word moves to
 *  the word's edge (the longer side wins). */
export function normaliseRuns(input: InlineRun[], tidy = true): InlineRun[] {
  let runs = merge(input.map((r) => ({ ...r })));
  if (!tidy) return runs;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (!plainRun(r) || !NEUTRAL_RE.test(r.text)) continue;
    const prev = runs[i - 1];
    const next = runs[i + 1];
    if (prev && next && plainRun(prev) && plainRun(next) && !!prev.bold === !!next.bold && !!prev.italic === !!next.italic && !!prev.smallCaps === !!next.smallCaps) {
      r.bold = prev.bold;
      r.italic = prev.italic;
      r.smallCaps = prev.smallCaps;
    } else if (r.text.trim() === '') {
      r.bold = r.italic = r.smallCaps = undefined;
    }
  }
  runs = merge(runs);
  for (let guard = 0, changed = true; changed && guard < 4 * Math.max(1, runs.length); guard++) {
    changed = false;
    for (let i = 0; i < runs.length - 1; i++) {
      const a = runs[i]!;
      const b = runs[i + 1]!;
      if (!plainRun(a) || !plainRun(b) || sameFlags(a, b)) continue;
      const ma = WORD_TAIL.exec(a.text);
      const mb = WORD_HEAD.exec(b.text);
      if (!ma || !mb) continue;
      const left = ma[1]!;
      const right = mb[1]!;
      if (left.length >= right.length) {
        a.text += right;
        b.text = b.text.slice(right.length);
      } else {
        b.text = left + b.text;
        a.text = a.text.slice(0, -left.length);
      }
      changed = true;
    }
    runs = merge(runs);
  }
  return runs;
}

/** Split leading and trailing whitespace off a group so markers hug text. */
function edges(runs: InlineRun[], tidy = true): { lead: string; inner: InlineRun[]; trail: string } {
  const inner = runs.map((r) => ({ ...r }));
  if (!tidy && inner.some((r) => r.text.trim() || r.raw)) return { lead: '', inner, trail: '' };
  let lead = '';
  let trail = '';
  const first = inner[0];
  if (first && !first.raw && first.note === undefined) {
    const m = /^\s+/.exec(first.text);
    if (m) {
      lead = m[0];
      first.text = first.text.slice(lead.length);
    }
  }
  const last = inner[inner.length - 1];
  if (last && !last.raw && last.note === undefined) {
    const m = /\s+$/.exec(last.text);
    if (m) {
      trail = m[0];
      last.text = last.text.slice(0, -trail.length);
    }
  }
  return { lead, inner: inner.filter((r) => r.text || r.note !== undefined), trail };
}

/** Group consecutive runs by a key (null: runs outside any group). */
function groups<K>(runs: InlineRun[], keyOf: (r: InlineRun) => K | null): Array<{ key: K | null; runs: InlineRun[] }> {
  const out: Array<{ key: K | null; runs: InlineRun[] }> = [];
  for (const r of runs) {
    const k = keyOf(r);
    const last = out[out.length - 1];
    if (last && last.key === k) last.runs.push(r);
    else out.push({ key: k, runs: [r] });
  }
  return out;
}

interface RenderContext {
  before: string;
  /** Move spaces out of emphasis markers (Word documents); off, the runs
   *  are written as they are (a Sandbox export coming back). */
  tidy: boolean;
}

function renderLeaf(runs: InlineRun[], ctx: RenderContext): string {
  let out = '';
  runs.forEach((r, i) => {
    if (r.note !== undefined) out += `[^${r.note}]`;
    else if (r.raw) out += r.text;
    else if (r.script) {
      const { lead, inner, trail } = edges([{ ...r, script: undefined }]);
      const text = inner.map((x) => x.text).join('');
      const mark = r.script === 'sup' ? '^' : '~';
      out += text ? `${lead}${mark}${escapeText(text)}${mark}${trail}` : escapeText(lead + trail);
    } else {
      const next = runs[i + 1];
      out += escapeText(r.text, ctx.before + out, next && !next.raw ? next.text : '');
    }
  });
  ctx.before += out;
  return out;
}

function renderSmallCaps(runs: InlineRun[], ctx: RenderContext): string {
  return groups(runs, (r) => (r.smallCaps ? 'sc' : null)).map((g) => {
    if (g.key === null) return renderLeaf(g.runs, ctx);
    const { lead, inner, trail } = edges(g.runs.map((r) => ({ ...r, smallCaps: undefined })), ctx.tidy);
    if (!inner.length) return renderLeaf(g.runs.map((r) => ({ ...r, smallCaps: undefined })), ctx);
    const body = renderLeaf(inner, { before: '', tidy: ctx.tidy }).replace(/\]/g, '\\]');
    const s = `${lead}:smallcaps[${body}]${trail}`;
    ctx.before += s;
    return s;
  }).join('');
}

function renderItalic(runs: InlineRun[], ctx: RenderContext): string {
  return groups(runs, (r) => (r.italic ? 'i' : null)).map((g) => {
    if (g.key === null) return renderSmallCaps(g.runs, ctx);
    const { lead, inner, trail } = edges(g.runs.map((r) => ({ ...r, italic: undefined })), ctx.tidy);
    if (!inner.length || inner.every((r) => r.raw && !r.text.trim())) return renderSmallCaps(g.runs.map((r) => ({ ...r, italic: undefined })), ctx);
    ctx.before += lead + '*';
    const s = `${lead}*${renderSmallCaps(inner, ctx)}*${trail}`;
    ctx.before += '*' + trail;
    return s;
  }).join('');
}

function renderEmphasis(runs: InlineRun[], ctx: RenderContext): string {
  return groups(runs, (r) => (r.bold ? 'b' : null)).map((g) => {
    if (g.key === null) return renderItalic(g.runs, ctx);
    const { lead, inner, trail } = edges(g.runs.map((r) => ({ ...r, bold: undefined })), ctx.tidy);
    if (!inner.length) return renderItalic(g.runs.map((r) => ({ ...r, bold: undefined })), ctx);
    if (inner.every((r) => r.italic)) {
      ctx.before += lead + '***';
      const s = `${lead}***${renderSmallCaps(inner.map((r) => ({ ...r, italic: undefined })), ctx)}***${trail}`;
      ctx.before += '***' + trail;
      return s;
    }
    ctx.before += lead + '**';
    const s = `${lead}**${renderItalic(inner, ctx)}**${trail}`;
    ctx.before += '**' + trail;
    return s;
  }).join('');
}

/** Postext inline Markdown for runs. Links and chips wrap their own runs. */
export function renderInline(input: InlineRun[], opts: { collapseSpaces?: boolean; tidy?: boolean } = {}): string {
  const runs = normaliseRuns(input, opts.tidy ?? true);
  const ctx: RenderContext = { before: '', tidy: opts.tidy ?? true };
  let out = '';
  for (const g of groups(runs, (r) => (r.href !== undefined ? `h:${r.href}` : r.chip !== undefined ? `c:${r.chip}` : null))) {
    if (g.key === null) {
      out += renderEmphasis(g.runs, ctx);
      continue;
    }
    const first = g.runs[0]!;
    const inner = g.runs.map((r) => ({ ...r, href: undefined, chip: undefined }));
    if (first.href !== undefined) {
      const { lead, inner: body, trail } = edges(inner, ctx.tidy);
      const text = renderInline(body, { tidy: opts.tidy, collapseSpaces: false });
      const s = text ? `${lead}[${text}](${linkDestination(first.href)})${trail}` : lead + trail;
      out += s;
      ctx.before += s;
    } else {
      const { lead, inner: body, trail } = edges(inner, ctx.tidy);
      const text = renderInline(body, { tidy: opts.tidy }).replace(/\]/g, '\\]').replace(/\s+/g, ' ');
      const s = text ? `${lead}:chip[${text}]{style="${first.chip}"}${trail}` : lead + trail;
      out += s;
      ctx.before += s;
    }
  }
  if (opts.collapseSpaces === false) return out;
  // Spaces typed twice are a Word habit; an export keeps the source's.
  return ctx.tidy ? out.replace(/[ \t\r\n]+/g, ' ') : out.replace(/\r?\n/g, ' ');
}

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
  /** Heading text: `\\` (a title break) stays verbatim. */
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
