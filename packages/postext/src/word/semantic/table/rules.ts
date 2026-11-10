// The rules of a table in the semantic .docx (#1444), as the table style
// asks for them (`tableStyle.rules`): the whole grid, the rows' rules only
// (`horizontal`), the outer frame, none, or the booktabs pattern (a heavy
// rule above the table and under its last row, a light rule under the
// header, rules under spanning header cells and above group rows). Rules
// the style does not ask for are switched off, so Word's default grid never
// shows.

import type { ResolvedTableStyleConfig } from '../../../types.js';
import type { Units } from '../wml.js';
import { eighths, hex, px } from '../wml.js';

/** Thinnest rule the engine strokes, px (`MIN_BORDER_PX`). */
const MIN_RULE_PX = 0.25;

const SIDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'] as const;
type Side = (typeof SIDES)[number];

/** Border XML for a table: `table` goes in `w:tblBorders`; the cell rules
 *  of a booktabs table go in a cell's `w:tcBorders`. */
export interface TableRules {
  table: string;
  /** Under the last header row (booktabs light rule). */
  headerRule?: string;
  /** Under a header cell spanning several columns above the last header
   *  row (booktabs span rule). */
  spanRule?: string;
  /** Above a body row heading a group (booktabs group rules). */
  groupRule?: string;
}

/** Eighths of a point for a rule width: 0 drops the rule, a hairline is
 *  raised to the engine's thinnest. */
function ruleSize(u: Units, width: Parameters<typeof px>[1], basePx: number): number {
  const w = px(u, width, basePx);
  return w > 0 ? eighths(u, { value: Math.max(MIN_RULE_PX, w), unit: 'px' }) : 0;
}

/** The rules of `style`, for a table whose body cells are `bodyPx` px
 *  (booktabs widths in `em` are relative to it). */
export function tableRules(u: Units, style: ResolvedTableStyleConfig, bodyPx: number): TableRules {
  const color = hex(style.borderColor) ?? '000000';
  const line = (sz: number): string => (sz > 0 ? `w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"` : 'w:val="nil"');
  const borders = (on: Partial<Record<Side, number>>): string => SIDES.map((s) => `<w:${s} ${line(on[s] ?? 0)}/>`).join('');
  if (!style.borders || style.rules === 'none') return { table: borders({}) };
  if (style.rules === 'booktabs') {
    const heavy = ruleSize(u, style.heavyRuleWidth, bodyPx);
    const light = ruleSize(u, style.lightRuleWidth, bodyPx);
    const span = ruleSize(u, style.spanRuleWidth, bodyPx);
    return {
      table: borders({ top: heavy, bottom: heavy }),
      ...(light > 0 ? { headerRule: `<w:bottom ${line(light)}/>` } : {}),
      ...(span > 0 && style.spanRules !== 'none' ? { spanRule: `<w:bottom ${line(span)}/>` } : {}),
      ...(light > 0 && style.groupRules ? { groupRule: `<w:top ${line(light)}/>` } : {}),
    };
  }
  const w = ruleSize(u, style.borderWidth, bodyPx) || eighths(u, { value: MIN_RULE_PX, unit: 'px' });
  if (style.rules === 'horizontal') return { table: borders({ top: w, bottom: w, insideH: w }) };
  if (style.rules === 'outer') return { table: borders({ top: w, left: w, bottom: w, right: w }) };
  return { table: borders({ top: w, left: w, bottom: w, right: w, insideH: w, insideV: w }) };
}
