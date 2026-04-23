import type { ContentBlock } from './parse';

export type NumeralStyle =
  | 'decimal'
  | 'decimal-02'
  | 'upper-alpha'
  | 'lower-alpha'
  | 'upper-roman'
  | 'lower-roman';

type Token =
  | { kind: 'literal'; text: string }
  | { kind: 'counter'; level: number; style: NumeralStyle };

const STYLE_ALIASES: Record<string, NumeralStyle> = {
  '1': 'decimal',
  decimal: 'decimal',
  '01': 'decimal-02',
  'decimal-02': 'decimal-02',
  A: 'upper-alpha',
  'upper-alpha': 'upper-alpha',
  a: 'lower-alpha',
  'lower-alpha': 'lower-alpha',
  I: 'upper-roman',
  'upper-roman': 'upper-roman',
  i: 'lower-roman',
  'lower-roman': 'lower-roman',
};

export function parseTemplate(tpl: string): Token[] {
  const tokens: Token[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf.length > 0) {
      tokens.push({ kind: 'literal', text: buf });
      buf = '';
    }
  };
  while (i < tpl.length) {
    const ch = tpl[i]!;
    if (ch === '\\' && i + 1 < tpl.length) {
      const next = tpl[i + 1]!;
      if (next === '{' || next === '}' || next === '\\') {
        buf += next;
        i += 2;
        continue;
      }
    }
    if (ch === '{') {
      const end = tpl.indexOf('}', i + 1);
      if (end === -1) {
        buf += ch;
        i++;
        continue;
      }
      const body = tpl.slice(i + 1, end);
      const [rawLevel, rawStyle] = body.split(':');
      const level = Number(rawLevel);
      if (Number.isInteger(level) && level >= 1 && level <= 6) {
        const style: NumeralStyle = rawStyle
          ? STYLE_ALIASES[rawStyle.trim()] ?? 'decimal'
          : 'decimal';
        flush();
        tokens.push({ kind: 'counter', level, style });
        i = end + 1;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return tokens;
}

function toUpperAlpha(n: number): string {
  if (n <= 0) return '';
  let s = '';
  let x = n;
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

function toRoman(n: number): string {
  if (n <= 0) return '';
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let x = n;
  let s = '';
  for (const [val, sym] of table) {
    while (x >= val) {
      s += sym;
      x -= val;
    }
  }
  return s;
}

export function formatNumeral(n: number, style: NumeralStyle): string {
  if (n <= 0) return '';
  switch (style) {
    case 'decimal':
      return String(n);
    case 'decimal-02':
      return n < 10 ? `0${n}` : String(n);
    case 'upper-alpha':
      return toUpperAlpha(n);
    case 'lower-alpha':
      return toUpperAlpha(n).toLowerCase();
    case 'upper-roman':
      return toRoman(n);
    case 'lower-roman':
      return toRoman(n).toLowerCase();
  }
}

function renderTemplate(
  tokens: Token[],
  counters: number[],
  currentLevel: number,
): string {
  const pieces: Array<{ kind: 'literal' | 'counter'; text: string }> = [];
  for (const t of tokens) {
    if (t.kind === 'literal') {
      pieces.push({ kind: 'literal', text: t.text });
      continue;
    }
    if (t.level > currentLevel) continue;
    const value = counters[t.level] ?? 0;
    const rendered = value > 0 ? formatNumeral(value, t.style) : '';
    pieces.push({ kind: 'counter', text: rendered });
  }
  let out = '';
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (p.kind === 'counter' && p.text === '') {
      const prev = out;
      const next = pieces[i + 1];
      if (next && next.kind === 'literal') {
        pieces[i + 1] = { kind: 'literal', text: '' };
        continue;
      }
      if (prev.length > 0 && pieces[i - 1]?.kind === 'literal') {
        out = out.replace(/[^A-Za-z0-9]+$/, '');
      }
      continue;
    }
    out += p.text;
  }
  return out;
}

export type HeadingTemplates = Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;

// ---------------------------------------------------------------------------
// Page-level numbering sequencer
// ---------------------------------------------------------------------------

/** A switch in the page-numbering sequence. At `startPageIndex`, the
 *  (optional) `format` and/or (optional) `startAt` take effect.
 *  A `format`-only segment keeps the counter flowing; a `startAt`-only
 *  segment resets the counter without changing the format. The first
 *  segment (typically pushed from `cfg.page.pageNumbering`) must set both
 *  and have `startPageIndex === 0`. */
export interface PageNumberSegment {
  startPageIndex: number;
  format?: NumeralStyle;
  startAt?: number;
}

export interface PageLabelInfo {
  value: number;
  label: string;
  format: NumeralStyle;
}

/** Assign (format, numeric value, rendered label) to every page.
 *
 *  Segments must be sorted by `startPageIndex`. The first segment is
 *  treated as the document-wide default and must define both `format`
 *  and `startAt`. Later segments with an omitted field carry over the
 *  previous one. */
export function buildPageLabels(
  pageCount: number,
  segments: PageNumberSegment[],
): PageLabelInfo[] {
  if (pageCount <= 0) return [];
  if (segments.length === 0) {
    // Defensive default — behave as a plain decimal-from-1 sequence.
    return Array.from({ length: pageCount }, (_, i) => ({
      value: i + 1,
      label: String(i + 1),
      format: 'decimal' as NumeralStyle,
    }));
  }
  const sorted = [...segments].sort((a, b) => a.startPageIndex - b.startPageIndex);
  const out: PageLabelInfo[] = new Array(pageCount);

  let curFormat: NumeralStyle = sorted[0]!.format ?? 'decimal';
  let curValue: number = sorted[0]!.startAt ?? 1;
  let segIdx = 0;
  // Absorb any segments that apply before / at page 0.
  while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex <= 0) {
    const s = sorted[segIdx]!;
    if (s.format !== undefined) curFormat = s.format;
    if (s.startAt !== undefined) curValue = s.startAt;
    segIdx++;
  }

  for (let i = 0; i < pageCount; i++) {
    while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex === i) {
      const s = sorted[segIdx]!;
      if (s.format !== undefined) curFormat = s.format;
      if (s.startAt !== undefined) curValue = s.startAt;
      segIdx++;
    }
    const label = formatNumeral(curValue, curFormat);
    out[i] = { value: curValue, label, format: curFormat };
    curValue++;
  }
  return out;
}

/** One contiguous run of pages sharing `(format, counter)`. Boundary rule:
 *  a run starts whenever the format differs from the previous page or the
 *  counter is not exactly `previous + 1`. Feeds the PDF `/PageLabels`
 *  emitter. `maxValue` is the max `value` seen in the run — used by the
 *  PDF backend to detect the alpha-overflow (`>26`) case. */
export interface PageLabelRun {
  startPageIndex: number;
  endPageIndex: number;
  format: NumeralStyle;
  startAt: number;
  maxValue: number;
}

export function collectPageLabelRuns(labels: PageLabelInfo[]): PageLabelRun[] {
  const runs: PageLabelRun[] = [];
  for (let i = 0; i < labels.length; i++) {
    const p = labels[i]!;
    const prev = runs[runs.length - 1];
    if (
      prev
      && prev.format === p.format
      && p.value === prev.startAt + (i - prev.startPageIndex)
    ) {
      prev.endPageIndex = i;
      if (p.value > prev.maxValue) prev.maxValue = p.value;
      continue;
    }
    runs.push({
      startPageIndex: i,
      endPageIndex: i,
      format: p.format,
      startAt: p.value,
      maxValue: p.value,
    });
  }
  return runs;
}

export function computeHeadingNumbers(
  blocks: ContentBlock[],
  templates: HeadingTemplates,
): Array<string | undefined> {
  const counters = [0, 0, 0, 0, 0, 0, 0];
  const parsed: Record<number, Token[] | null> = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    const tpl = templates[lvl as 1 | 2 | 3 | 4 | 5 | 6] ?? '';
    parsed[lvl] = tpl.length > 0 ? parseTemplate(tpl) : null;
  }
  const prefixes: Array<string | undefined> = new Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'heading' || !b.level) continue;
    const lvl = b.level;
    counters[lvl] = (counters[lvl] ?? 0) + 1;
    for (let k = lvl + 1; k <= 6; k++) counters[k] = 0;
    const tokens = parsed[lvl];
    if (!tokens) continue;
    const rendered = renderTemplate(tokens, counters, lvl);
    if (rendered.length > 0) prefixes[i] = rendered;
  }
  return prefixes;
}
