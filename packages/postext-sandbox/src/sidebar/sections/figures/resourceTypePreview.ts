import type { DigitSystem, NumberFormatStyle, ResourceCounterFormat, ResourceType } from 'postext';
import { parseNumberFormat, renderTemplateNumber } from 'postext';

/** The resource spelling of each numeral style: `counterFormat` says
 *  `roman-lower` where page labels say `lower-roman`; the East Asian and
 *  Arabic styles keep their CSS names everywhere. */
const RESOURCE_COUNTER_FORMATS: Record<NumberFormatStyle, ResourceCounterFormat> = {
  decimal: 'decimal',
  'lower-roman': 'roman-lower',
  'upper-roman': 'roman-upper',
  'lower-alpha': 'alpha-lower',
  'upper-alpha': 'alpha-upper',
  'simp-chinese-informal': 'simp-chinese-informal',
  'trad-chinese-informal': 'trad-chinese-informal',
  'simp-chinese-formal': 'simp-chinese-formal',
  'trad-chinese-formal': 'trad-chinese-formal',
  'japanese-informal': 'japanese-informal',
  'japanese-formal': 'japanese-formal',
  hiragana: 'hiragana',
  katakana: 'katakana',
  'hiragana-iroha': 'hiragana-iroha',
  'katakana-iroha': 'katakana-iroha',
  'cjk-decimal': 'cjk-decimal',
  'cjk-heavenly-stem': 'cjk-heavenly-stem',
  'cjk-earthly-branch': 'cjk-earthly-branch',
  'circled-decimal': 'circled-decimal',
  'fullwidth-decimal': 'fullwidth-decimal',
  'arabic-indic': 'arabic-indic',
  persian: 'persian',
  'arabic-abjad': 'arabic-abjad',
  'arabic-abjad-maghrebi': 'arabic-abjad-maghrebi',
  abjad: 'abjad',
  hijai: 'hijai',
};

/** A type's `counterFormat` in the resource spelling, read as the engine
 *  reads it: any spelling of a format (`lower-roman`, `arabic`, `i`…), and
 *  an unknown value counts in decimal. What the counter-format select shows,
 *  so a preset written with another setting's spelling still selects its
 *  option. The document language `locale` reads the `一` token as the
 *  engine does (Japanese numerals in a ja document). */
export function resourceCounterFormat(format: unknown, locale?: string): ResourceCounterFormat {
  return RESOURCE_COUNTER_FORMATS[parseNumberFormat(format, locale) ?? 'decimal'];
}

/** Sample heading numbers used solely to render the live preview. */
const PREVIEW_HEADING = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** Render a sample number for a type using a fixed sample counter (7) and the
 *  sample heading context above, with the engine's own renderer: the
 *  tokens `{n}` and `{h1}`..`{h6}`, the style a token names after a colon
 *  (`{h1:A}.{n}`, #730) and the document's `digits` on the decimal ones
 *  (شكل ١-٧ in an Arabic book) are read as a build reads them. */
function renderPreviewNumber(type: ResourceType, digits: DigitSystem, locale?: string): string {
  return renderTemplateNumber(type.numberingTemplate, 7, type.counterFormat, PREVIEW_HEADING, digits, locale);
}

/** Builds the full preview string, e.g. "Fig. 1.7" or "Figure 1.7", in the
 *  document's digits (default European); `locale`, the document language,
 *  reads the `一` counter token. */
export function renderResourceTypePreview(type: ResourceType, digits: DigitSystem = 'latn', locale?: string): string {
  const number = renderPreviewNumber(type, digits, locale);
  const prefix = type.shortLabel || type.captionPrefix || type.name;
  return [prefix, number].filter(Boolean).join(' ');
}
