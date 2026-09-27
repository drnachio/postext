import type { Dimension, ResolvedDesignTextElement } from 'postext';
import { TO_PT, toPt } from '../../../controls/units';

/** The default leading of a design text (`DEFAULT_TEXT_ELEMENT.lineHeight`). */
const DEFAULT_MULTIPLIER = 1.2;

/** A design text's leading as the line-height field shows it: the absolute
 *  length when the element gives one, else its multiplier in `em`. */
export function lineHeightFieldValue(resolved: Pick<ResolvedDesignTextElement, 'lineHeight' | 'lineHeightLength'>): Dimension {
  return resolved.lineHeightLength ?? { value: resolved.lineHeight, unit: 'em' };
}

/** What the line-height field writes to the element when it changes from
 *  `current` to `next`: `em` is stored as the plain multiplier the element
 *  has always taken, `pt` / `mm` as a Dimension. A change of unit keeps the
 *  leading on the page, converted through the element's `fontSize` (the
 *  field's own conversion assumes a 12 pt em). */
export function lineHeightFromField(current: Dimension, next: Dimension, fontSize: Dimension): number | Dimension {
  let dim = next;
  if (next.unit !== current.unit) {
    const fontPt = toPt(fontSize);
    const leadingPt = current.unit === 'em' || current.unit === 'rem' ? current.value * fontPt : toPt(current);
    const value = next.unit === 'em' || next.unit === 'rem'
      ? (fontPt > 0 ? leadingPt / fontPt : DEFAULT_MULTIPLIER)
      : leadingPt / TO_PT[next.unit];
    dim = { value: Math.round(value * 100) / 100, unit: next.unit };
  }
  return dim.unit === 'em' ? dim.value : dim;
}
