import type {
  Dimension,
  LineNumbersConfig,
  LineNumbersCount,
  LineNumbersMultiColumn,
  LineNumbersPosition,
  LineNumbersRestart,
  ResolvedBodyTextConfig,
  ResolvedLineNumbersConfig,
} from '../types';
import { dimensionsEqual } from './shared';

/** Line numbers (#621): off; when on, every fifth line of verse numbered
 *  in the outer margin, an em from the text, at 0.8 of the body size. */
export const DEFAULT_LINE_NUMBERS_CONFIG: Omit<ResolvedLineNumbersConfig, 'fontFamily' | 'fontWeight' | 'color'> = {
  enabled: false,
  count: 'verse',
  interval: 5,
  numberFirst: false,
  restart: 'poem',
  startAt: 1,
  position: 'outer',
  multiColumn: 'outer-edges',
  gap: { value: 1, unit: 'em' },
  align: 'auto',
  fontSize: { value: 0.8, unit: 'em' },
  italic: false,
};

export const LINE_NUMBERS_COUNTS: readonly LineNumbersCount[] = ['verse', 'all'];
export const LINE_NUMBERS_RESTARTS: readonly LineNumbersRestart[] = ['document', 'chapter', 'section', 'page', 'poem'];
export const LINE_NUMBERS_POSITIONS: readonly LineNumbersPosition[] = ['outer', 'inner', 'left', 'right', 'start', 'end', 'side'];
export const LINE_NUMBERS_MULTI_COLUMN: readonly LineNumbersMultiColumn[] = ['each', 'gutter', 'outer-edges'];
export const LINE_NUMBERS_ALIGNS: readonly ResolvedLineNumbersConfig['align'][] = ['auto', 'left', 'right'];

const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (choices as readonly string[]).includes(value) ? value as T : fallback;

/** The restart an unset `restart` takes: each poem when verse is
 *  counted, each page when every line is. */
export function defaultLineNumbersRestart(count: LineNumbersCount): LineNumbersRestart {
  return count === 'all' ? 'page' : 'poem';
}

/** A whole number ≥ `min`, else `fallback`. */
function whole(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

/** `lineNumbers` in full; the font, weight and colour default to the
 *  body's. */
export function resolveLineNumbersConfig(partial: LineNumbersConfig | undefined, bodyText: ResolvedBodyTextConfig): ResolvedLineNumbersConfig {
  const D = DEFAULT_LINE_NUMBERS_CONFIG;
  const p = partial ?? {};
  const count = oneOf(LINE_NUMBERS_COUNTS, p.count, D.count);
  const format = typeof p.format === 'string' && p.format.trim() !== '' ? p.format.trim() : undefined;
  return {
    enabled: p.enabled === true,
    count,
    interval: whole(p.interval, 1, D.interval),
    numberFirst: p.numberFirst === true,
    restart: oneOf(LINE_NUMBERS_RESTARTS, p.restart, defaultLineNumbersRestart(count)),
    startAt: whole(p.startAt, 0, D.startAt),
    position: oneOf(LINE_NUMBERS_POSITIONS, p.position, D.position),
    multiColumn: oneOf(LINE_NUMBERS_MULTI_COLUMN, p.multiColumn, D.multiColumn),
    gap: p.gap ?? D.gap,
    align: oneOf(LINE_NUMBERS_ALIGNS, p.align, D.align),
    fontFamily: p.fontFamily?.trim() || bodyText.fontFamily,
    fontSize: p.fontSize ?? D.fontSize,
    fontWeight: typeof p.fontWeight === 'number' && Number.isFinite(p.fontWeight) ? p.fontWeight : bodyText.fontWeight,
    italic: p.italic === true,
    color: p.color ?? bodyText.color,
    ...(format && format !== 'decimal' ? { format } : {}),
  };
}

/** `lineNumbers` without the fields that hold their default; undefined
 *  when none is left. The font, weight and colour are kept as written. */
export function stripLineNumbersDefaults(lineNumbers?: LineNumbersConfig): LineNumbersConfig | undefined {
  if (!lineNumbers) return undefined;
  const D = DEFAULT_LINE_NUMBERS_CONFIG;
  const out: LineNumbersConfig = {};
  const count = lineNumbers.count ?? D.count;
  if (lineNumbers.enabled !== undefined && lineNumbers.enabled !== D.enabled) out.enabled = lineNumbers.enabled;
  if (lineNumbers.count !== undefined && lineNumbers.count !== D.count) out.count = lineNumbers.count;
  if (lineNumbers.interval !== undefined && lineNumbers.interval !== D.interval) out.interval = lineNumbers.interval;
  if (lineNumbers.numberFirst !== undefined && lineNumbers.numberFirst !== D.numberFirst) out.numberFirst = lineNumbers.numberFirst;
  if (lineNumbers.restart !== undefined && lineNumbers.restart !== defaultLineNumbersRestart(count)) out.restart = lineNumbers.restart;
  if (lineNumbers.startAt !== undefined && lineNumbers.startAt !== D.startAt) out.startAt = lineNumbers.startAt;
  if (lineNumbers.position !== undefined && lineNumbers.position !== D.position) out.position = lineNumbers.position;
  if (lineNumbers.multiColumn !== undefined && lineNumbers.multiColumn !== D.multiColumn) out.multiColumn = lineNumbers.multiColumn;
  if (lineNumbers.gap !== undefined && !dimensionsEqual(lineNumbers.gap, D.gap as Dimension)) out.gap = lineNumbers.gap;
  if (lineNumbers.align !== undefined && lineNumbers.align !== D.align) out.align = lineNumbers.align;
  if (lineNumbers.fontFamily !== undefined) out.fontFamily = lineNumbers.fontFamily;
  if (lineNumbers.fontSize !== undefined && !dimensionsEqual(lineNumbers.fontSize, D.fontSize)) out.fontSize = lineNumbers.fontSize;
  if (lineNumbers.fontWeight !== undefined) out.fontWeight = lineNumbers.fontWeight;
  if (lineNumbers.italic !== undefined && lineNumbers.italic !== D.italic) out.italic = lineNumbers.italic;
  if (lineNumbers.color !== undefined) out.color = lineNumbers.color;
  if (lineNumbers.format !== undefined && lineNumbers.format.trim() !== '' && lineNumbers.format.trim() !== 'decimal') out.format = lineNumbers.format;
  return Object.keys(out).length > 0 ? out : undefined;
}
