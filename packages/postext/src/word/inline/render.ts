// Word runs to Postext inline marks: escaping, run normalising and rendering.

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

/** A forced line break inside a paragraph (#620) in a run's text: Word's
 *  soft return (`<w:br/>`, Shift+Enter), Postext Markdown's backslash at
 *  the end of a line (or `\\` before a space). */
export const LINE_BREAK = '\u2028';

// ---------------------------------------------------------------------------
// Runs → Postext Markdown
// ---------------------------------------------------------------------------

/** Letters that keep an `_` beside them from opening emphasis (CJK do not). */
export const UNDERSCORE_BLOCKER = /^(?:_|(?![\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}])[\p{L}\p{N}])$/u;

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
export const sameFlags = (a: Flags, b: Flags): boolean =>
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

/** Markdown set inside a directive's `[…]`: each `]` that closes nothing
 *  escaped. The text is Markdown already, so a backslash pair (`\*`, `\]`)
 *  is an escape kept as written, never escaped twice. */
function escapeClosingBrackets(markdown: string): string {
  let out = '';
  for (let i = 0; i < markdown.length; i++) {
    const c = markdown[i]!;
    if (c === '\\' && i + 1 < markdown.length) {
      out += c + markdown[++i];
    } else out += c === ']' ? '\\]' : c;
  }
  return out;
}

function renderSmallCaps(runs: InlineRun[], ctx: RenderContext): string {
  return groups(runs, (r) => (r.smallCaps ? 'sc' : null)).map((g) => {
    if (g.key === null) return renderLeaf(g.runs, ctx);
    const { lead, inner, trail } = edges(g.runs.map((r) => ({ ...r, smallCaps: undefined })), ctx.tidy);
    if (!inner.length) return renderLeaf(g.runs.map((r) => ({ ...r, smallCaps: undefined })), ctx);
    const body = escapeClosingBrackets(renderLeaf(inner, { before: '', tidy: ctx.tidy }));
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
      const text = escapeClosingBrackets(renderInline(body, { tidy: opts.tidy })).replace(/\s+/g, ' ');
      const s = text ? `${lead}:chip[${text}]{style="${first.chip}"}${trail}` : lead + trail;
      out += s;
      ctx.before += s;
    }
  }
  if (opts.collapseSpaces === false) return out;
  // Spaces typed twice are a Word habit; an export keeps the source's.
  const flat = ctx.tidy ? out.replace(/[ \t\r\n]+/g, ' ') : out.replace(/\r?\n/g, ' ');
  return flat.includes(LINE_BREAK) ? withLineBreaks(flat) : flat;
}

/** The forced line breaks of a rendered paragraph (#620) written as a
 *  backslash ending the line, each line after one kept from opening a
 *  block. A break at either end, or after another, adds nothing (the
 *  engine reads it so). */
function withLineBreaks(text: string): string {
  const lines = text.split(/[ \t]*\u2028[ \t]*/).filter((l) => l.trim() !== '');
  return lines.map((l, i) => (i === 0 ? l : guardLineStart(l))).join('\\\n');
}
