/**
 * Postext inline markup from runs of text: emphasis, scripts and character
 * styles, escaped where the text holds a mark, with style boundaries moved
 * onto word boundaries (a port of the agent skill's `postext_md.py`).
 */

export const WORD_JOINER = '\u2060';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** Already Postext markup (a footnote marker, a character style). */
  raw?: boolean;
}

const ESCAPABLE = /[*_^~$`\\]/g;
const TRAP = /^(\d+[.)]\s|[-*+]\s|>|#{1,6}\s|:::|::resource|\[\^)/;

/** Escape the characters with an inline meaning so they print as typed. */
export function escapeText(text: string): string {
  return text.replace(ESCAPABLE, (c) => `\\${c}`);
}

/** A word joiner before a paragraph that would read as a list, a heading,
 *  a quotation or a fence. */
export function guardLineStart(line: string): string {
  return TRAP.test(line) ? WORD_JOINER + line : line;
}

/** Runs of breaking white space to one space, the no-break and fixed
 *  spaces kept. */
export function collapseSpaces(text: string): string {
  return text.replace(/[^\S\u00a0\u202f\u2007\u2002\u2003]+/g, ' ').replace(/ *([\u2002\u2003\u00a0\u202f\u2007]) */g, '$1').trim();
}

/** Odd characters of a layout program as text: ligatures undone, zero
 *  widths dropped, odd spaces plain. */
export function cleanText(text: string): string {
  return text
    .replace(/[\u200b\u200c\u200d\ufeff\u0007]/g, '')
    .replace(/[\u2000\u2001\u2004-\u2006\u2008\u205f\u3000]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/g, (c) => ({ ﬀ: 'ff', ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl', ﬅ: 'st', ﬆ: 'st' })[c] ?? c);
}

const style = (r: Run) => `${!!r.bold}${!!r.italic}${!!r.sup}${!!r.sub}`;

function merge(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !r.raw && !last.raw && style(last) === style(r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

// Letters of a word; Chinese and Japanese write no spaces, so a boundary
// between two of their characters is no slip inside a word.
const WORD_TAIL = /((?:(?![぀-ヿ㐀-䶿一-鿿豈-﫿])[\p{L}\p{N}_])+)$/u;
const WORD_HEAD = /^((?:(?![぀-ヿ㐀-䶿一-鿿豈-﫿])[\p{L}\p{N}_])+)/u;
const NEUTRAL = /^[\s.,;:!?()[\]«»“”‘’'"–—-]*$/;

/** Style boundaries on word boundaries: white space and punctuation take
 *  the style around them, and a boundary inside a word goes to the side
 *  with fewer letters. */
export function normaliseRuns(input: readonly Run[]): Run[] {
  let runs = merge(input.map((r) => (r.raw ? r : { ...r, text: cleanText(r.text) })));
  runs.forEach((r, i) => {
    if (r.raw || r.sup || r.sub || !NEUTRAL.test(r.text)) return;
    const prev = runs[i - 1];
    const next = runs[i + 1];
    if (prev && next && !prev.raw && !next.raw && style(prev) === style(next)) {
      r.bold = prev.bold;
      r.italic = prev.italic;
    } else if (r.text.trim() === '') {
      r.bold = r.italic = false;
    }
  });
  runs = merge(runs);
  for (let guard = 0, changed = true; changed && guard < 4 * Math.max(1, runs.length); guard++) {
    changed = false;
    for (let i = 0; i < runs.length - 1; i++) {
      const a = runs[i]!;
      const b = runs[i + 1]!;
      if (a.raw || b.raw || a.sup || a.sub || b.sup || b.sub || style(a) === style(b)) continue;
      const left = WORD_TAIL.exec(a.text)?.[1];
      const right = WORD_HEAD.exec(b.text)?.[1];
      if (!left || !right) continue;
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

/** Postext inline markup for runs (flat, never nested). */
export function renderRuns(runs: readonly Run[], trim = true): string {
  const parts: string[] = [];
  for (const r of normaliseRuns(runs)) {
    if (r.raw) {
      parts.push(r.text);
      continue;
    }
    const text = r.text;
    // Spaces, and the punctuation that closes or opens what is beside the
    // run, stay outside its marks: `*a*, **b**`, not `*a***, b**`.
    const marked = (r.bold || r.italic) && !r.sup && !r.sub;
    const lead = (marked ? /^[\s,.;:!?)\]»”’]*/ : /^\s*/).exec(text)![0];
    const trail = (marked ? /[\s,.;:!?([«“‘]*$/ : /\s*$/).exec(text.slice(lead.length))![0];
    const inner = text.slice(lead.length, text.length - trail.length);
    if (!inner) {
      parts.push(escapeText(text));
      continue;
    }
    if (r.sup || r.sub) {
      const mark = r.sup ? '^' : '~';
      parts.push(`${lead}${mark}${escapeText(inner)}${mark}${trail}`);
      continue;
    }
    if (!r.bold && !r.italic) {
      parts.push(escapeText(text));
      continue;
    }
    const mark = r.bold && r.italic ? '***' : r.bold ? '**' : '*';
    parts.push(`${lead}${mark}${escapeText(inner)}${mark}${trail}`);
  }
  const out = parts.join('').replace(/ {2,}/g, ' ').replace(/ *([\u2002\u2003\u00a0\u202f\u2007]) */g, '$1');
  return trim ? out.trim() : out;
}

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'by', 'from', 'at', 'as', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'en', 'con', 'por', 'para', 'al', 'le', 'les', 'des', 'du', 'et', 'der', 'die', 'das', 'und']);

/** A short id from a text: lowercase words of any script, accents off. */
export function slugify(text: string, maxWords = 4, maxLen = 48): string {
  const plain = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const words = plain.match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((w) => !STOPWORDS.has(w));
  const slug = (kept.length > 0 ? kept : words).slice(0, maxWords).join('-').slice(0, maxLen).replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/** Unique slugs within one book. */
export class Slugger {
  private readonly used = new Set<string>();

  constructor(taken: Iterable<string> = []) {
    for (const t of taken) this.used.add(t);
  }

  slug(text: string, prefix = ''): string {
    const base = (prefix ? `${prefix}-` : '') + slugify(text);
    let slug = base;
    for (let n = 2; this.used.has(slug); n++) slug = `${base}-${n}`;
    this.used.add(slug);
    return slug;
  }
}

/** A value safe inside `key="…"`. */
export function attrValue(value: string): string {
  return collapseSpaces(cleanText(value).replace(/"/g, '”').replace(/\{/g, '(').replace(/\}/g, ')'));
}

/** One heading line. Heading text is plain in Postext. */
export function heading(level: number, text: string): string {
  let t = collapseSpaces(cleanText(text));
  if (t.endsWith('}')) t += WORD_JOINER;
  return `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${t}`;
}

export function fence(name: string, body: readonly string[], attributes: Record<string, string | undefined> = {}): string {
  const a = Object.entries(attributes).filter(([, v]) => v).map(([k, v]) => `${k}="${attrValue(v!)}"`).join(' ');
  return `:::${name}${a ? `{${a}}` : ''}\n${body.filter((b) => b.trim()).join('\n\n')}\n:::`;
}

export const resourceEmbed = (id: string): string => `::resource{id="${id}"}`;

/** Caption labels a caption starts with («Figura 3.», «Table 2-1:»). */
export const CAPTION_LABEL = /^\s*(fig(?:ure|ura|\.)?|figs?\.|table|tabla|tab\.|tableau|tabelle|tabella|taula|plate|lámina|chart|gráfico|map|mapa|image|imagen|ilustración|illustration|esquema|diagram|diagrama|box|recuadro|cuadro|abbildung|abb\.|図|表|图)\s*([0-9IVXLC]+(?:[.\-–][0-9]+)*)\s*[.:\-–—]?\s*/i;

export function captionKind(label: string): 'table' | 'figure' {
  return /^(tab|cuadro|表)/i.test(label) ? 'table' : 'figure';
}
