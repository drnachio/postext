import type { OrderedListNumberFormat } from 'postext';
import { parseNumberFormat } from 'postext';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { eastAsianNumberFormatOptions } from '../../settings/eastAsianOptions';

export function numberFormatOptions(labels: ReturnType<typeof useSandboxLabels>) {
  return [
    { label: labels.orderedListsNumberFormatArabic, value: 'arabic' },
    { label: labels.orderedListsNumberFormatLowerAlpha, value: 'lower-alpha' },
    { label: labels.orderedListsNumberFormatUpperAlpha, value: 'upper-alpha' },
    { label: labels.orderedListsNumberFormatLowerRoman, value: 'lower-roman' },
    { label: labels.orderedListsNumberFormatUpperRoman, value: 'upper-roman' },
    ...eastAsianNumberFormatOptions(labels),
  ];
}

/** A raw list `numberFormat` (a part's override is not resolved) in the
 *  list spelling, read as the engine reads it: any spelling of a format
 *  (`decimal`, `roman-lower`, `i`…), and an unknown value numbers in arabic.
 *  What the number-format select shows. */
export function listNumberFormatValue(value: unknown): OrderedListNumberFormat {
  const style = parseNumberFormat(value) ?? 'decimal';
  return style === 'decimal' ? 'arabic' : style;
}
