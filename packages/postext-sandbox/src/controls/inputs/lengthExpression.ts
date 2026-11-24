import type { DimensionUnit } from 'postext';
import { TO_PT } from './units.js';

/** Units a length may be typed in, with what the field's own units are
 *  called: picas and the inch mark beside the units a field offers. */
const TYPED_UNITS: Record<string, { pt: number; relative: boolean }> = {
  pt: { pt: TO_PT.pt, relative: false },
  mm: { pt: TO_PT.mm, relative: false },
  cm: { pt: TO_PT.cm, relative: false },
  in: { pt: TO_PT.in, relative: false },
  '"': { pt: TO_PT.in, relative: false },
  '″': { pt: TO_PT.in, relative: false },
  pc: { pt: 12, relative: false },
  px: { pt: TO_PT.px, relative: false },
  em: { pt: TO_PT.em, relative: true },
  rem: { pt: TO_PT.rem, relative: true },
};

const RELATIVE: ReadonlySet<DimensionUnit> = new Set(['em', 'rem']);

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'unit'; unit: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' };

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?|[.,]\d+)|(rem|em|mm|cm|in|pt|pc|px|["″])|([-+*/()×÷−]))/giy;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m) return null;
    at = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ kind: 'number', value: Number(m[1].replace(',', '.')) });
    else if (m[2] !== undefined) tokens.push({ kind: 'unit', unit: m[2].toLowerCase() });
    else {
      const op = m[3] === '×' ? '*' : m[3] === '÷' ? '/' : m[3] === '−' ? '-' : m[3];
      tokens.push({ kind: 'op', op: op as '+' });
    }
  }
  return tokens;
}

/** A value of the expression: a bare number (no unit yet) or a length in
 *  points, absolute or relative to the type size. */
interface Quantity {
  value: number;
  length: boolean;
  relative: boolean;
}

/**
 * The value, in `unit`, of a length typed the way a designer types one:
 * a number (`25,5`), a number with a unit of its own (`2cm` in a field set
 * in millimetres), or arithmetic over both (`12pt + 2mm`, `210mm - 2*15mm`,
 * `(21cm - 3cm) / 2`). A bare number added to a length is read in the
 * field's unit; multiplied, it is a factor. Rounded to two decimals.
 *
 * Null when the text is not a length: malformed, a product of two lengths,
 * a division by zero, or a mix of absolute units with `em`/`rem`, which
 * have no size without their text.
 */
export function evalLength(text: string, unit: DimensionUnit): number | null {
  const tokens = tokenize(text);
  if (!tokens || tokens.length === 0) return null;
  const fieldRelative = RELATIVE.has(unit);
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (op: string) => { const t = peek(); return t?.kind === 'op' && t.op === op; };

  /** A bare number read as a length in the field's unit. */
  const asLength = (q: Quantity): Quantity => (q.length ? q : { value: q.value * TO_PT[unit], length: true, relative: fieldRelative });

  const primary = (): Quantity | null => {
    const t = peek();
    if (!t) return null;
    if (t.kind === 'op' && t.op === '(') {
      at++;
      const inner = sum();
      if (!inner || !isOp(')')) return null;
      at++;
      return inner;
    }
    if (t.kind === 'op' && (t.op === '-' || t.op === '+')) {
      at++;
      const q = primary();
      return q && t.op === '-' ? { ...q, value: -q.value } : q;
    }
    if (t.kind !== 'number') return null;
    at++;
    const next = peek();
    if (next?.kind === 'unit') {
      at++;
      const u = TYPED_UNITS[next.unit]!;
      return { value: t.value * u.pt, length: true, relative: u.relative };
    }
    return { value: t.value, length: false, relative: false };
  };

  const product = (): Quantity | null => {
    let left = primary();
    while (left && (isOp('*') || isOp('/'))) {
      const op = (peek() as { op: string }).op;
      at++;
      const right = primary();
      if (!right) return null;
      if (op === '*') {
        if (left.length && right.length) return null;
        left = { value: left.value * right.value, length: left.length || right.length, relative: left.relative || right.relative };
      } else {
        if (right.value === 0 || (!left.length && right.length)) return null;
        if (left.length && right.length && left.relative !== right.relative) return null;
        left = { value: left.value / right.value, length: left.length && !right.length, relative: left.relative && !right.length };
      }
    }
    return left;
  };

  function sum(): Quantity | null {
    let left = product();
    while (left && (isOp('+') || isOp('-'))) {
      const op = (peek() as { op: string }).op;
      at++;
      const right = product();
      if (!right) return null;
      if (left.length || right.length) {
        const a = asLength(left);
        const b = asLength(right);
        if (a.relative !== b.relative) return null;
        left = { value: op === '+' ? a.value + b.value : a.value - b.value, length: true, relative: a.relative };
      } else {
        left = { value: op === '+' ? left.value + right.value : left.value - right.value, length: false, relative: false };
      }
    }
    return left;
  }

  const result = sum();
  if (!result || at !== tokens.length || !Number.isFinite(result.value)) return null;
  if (result.length && result.relative !== fieldRelative) return null;
  const value = result.length ? result.value / TO_PT[unit] : result.value;
  return Math.round(value * 100) / 100;
}

/** Whether the text is no more than a number being typed (`2`, `25,`,
 *  `25,5`): its value can be shown at once; anything else waits for Enter. */
export function plainNumber(text: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
