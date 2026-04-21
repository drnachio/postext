import type { useSandboxLabels } from '../../../context/SandboxContext';

export function numberFormatOptions(labels: ReturnType<typeof useSandboxLabels>) {
  return [
    { label: labels.orderedListsNumberFormatArabic, value: 'arabic' },
    { label: labels.orderedListsNumberFormatLowerAlpha, value: 'lower-alpha' },
    { label: labels.orderedListsNumberFormatUpperAlpha, value: 'upper-alpha' },
    { label: labels.orderedListsNumberFormatLowerRoman, value: 'lower-roman' },
    { label: labels.orderedListsNumberFormatUpperRoman, value: 'upper-roman' },
  ];
}
