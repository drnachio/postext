import type { EastAsianNumeralStyle } from 'postext';
import type { SandboxLabels } from '../../types/labels';

/** The East Asian numeral styles, as every numbering select lists them
 *  after the Latin ones: the value is the CSS name, which the page-number,
 *  list and resource-counter settings all read. */
export function eastAsianNumberFormatOptions(labels: SandboxLabels): { value: EastAsianNumeralStyle; label: string }[] {
  return [
    { value: 'simp-chinese-informal', label: labels.numberFormatSimpChineseInformal },
    { value: 'trad-chinese-informal', label: labels.numberFormatTradChineseInformal },
    { value: 'simp-chinese-formal', label: labels.numberFormatSimpChineseFormal },
    { value: 'trad-chinese-formal', label: labels.numberFormatTradChineseFormal },
    { value: 'cjk-decimal', label: labels.numberFormatCjkDecimal },
    { value: 'cjk-heavenly-stem', label: labels.numberFormatCjkHeavenlyStem },
    { value: 'cjk-earthly-branch', label: labels.numberFormatCjkEarthlyBranch },
    { value: 'circled-decimal', label: labels.numberFormatCircledDecimal },
    { value: 'fullwidth-decimal', label: labels.numberFormatFullwidthDecimal },
  ];
}

/** The short strings a separator field offers (between a heading's number
 *  and its title, around a caption's number). */
export type SeparatorChoice = 'space' | 'ideographic' | 'none' | 'nbsp' | 'stop' | 'colon';

const SEPARATOR_VALUES: Record<SeparatorChoice, string> = {
  space: ' ',
  ideographic: '　',
  none: '',
  nbsp: ' ',
  stop: '. ',
  colon: ': ',
};

/** Option value of a separator the list does not offer (a hand-written
 *  config): shown as it is, never written back. */
export const CUSTOM_SEPARATOR = 'custom';

function separatorLabel(choice: SeparatorChoice, labels: SandboxLabels): string {
  switch (choice) {
    case 'space': return labels.separatorSpace;
    case 'ideographic': return labels.separatorIdeographicSpace;
    case 'none': return labels.separatorNone;
    case 'nbsp': return labels.separatorNoBreakSpace;
    case 'stop': return labels.separatorFullStop;
    case 'colon': return labels.separatorColon;
  }
}

/** A separator select: the `choices` in order, plus the current value as
 *  written when it is none of them. Option values are the choice names
 *  (an empty string cannot be a select value); {@link separatorFromOption}
 *  turns one back into the string. */
export function separatorOptions(
  labels: SandboxLabels,
  choices: readonly SeparatorChoice[],
  current: string,
): { value: string; label: string }[] {
  const options = choices.map((c) => ({ value: c as string, label: separatorLabel(c, labels) }));
  if (!choices.some((c) => SEPARATOR_VALUES[c] === current)) {
    options.push({ value: CUSTOM_SEPARATOR, label: labels.separatorCustom.replace('__value__', current) });
  }
  return options;
}

/** The option a separator string selects. */
export function separatorOption(current: string, choices: readonly SeparatorChoice[]): string {
  return choices.find((c) => SEPARATOR_VALUES[c] === current) ?? CUSTOM_SEPARATOR;
}

/** The string an option stands for; `undefined` for the custom entry. */
export function separatorFromOption(option: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(SEPARATOR_VALUES, option) ? SEPARATOR_VALUES[option as SeparatorChoice] : undefined;
}
