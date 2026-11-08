// One-line directives in the semantic .docx (#1444) that have a native
// rendering: `:::toc` and `:::index` as Word fields, `:::space` as blank
// room, `:::numbering` as the section's page numbering; `:::references`
// data is not shown. None of them is
// written as text: their source lines stay in the Markdown untouched on
// re-import, because no fragment covers them.

import type { ContentBlock } from '../../parse/types.js';
import { spaceDirectiveLines } from '../../parse/attrs.js';
import { parseNumberFormat } from '../../numerals/numbering/formats.js';
import type { NumberFormatStyle } from '../../numerals/numbering/styles.js';
import { asciiDigits } from '../../numerals/arabicNumerals.js';
import { resolvedLocale } from '../../pipeline/config.js';
import type { WriterContext } from './context.js';
import { indexField, tocField } from './fields.js';
import { blockSdt, paragraph, px, twips } from './wml.js';

/** Word page number formats (`ST_NumberFormat`) of the engine's numeral
 *  styles, after `parseNumberFormat` has read whichever spelling the
 *  directive used. Word has no hiragana series: the kana styles take its
 *  full-width katakana ones, which count in the same order. Persian digits
 *  share Word's Arabic-Indic format, whose glyphs follow the text language.
 *  `decimal` writes nothing: it is already Word's default. */
const PAGE_FORMATS: Record<NumberFormatStyle, string> = {
  decimal: 'decimal',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
  'lower-alpha': 'lowerLetter',
  'upper-alpha': 'upperLetter',
  'simp-chinese-informal': 'chineseCountingThousand',
  'trad-chinese-informal': 'taiwaneseCountingThousand',
  'simp-chinese-formal': 'chineseLegalSimplified',
  'trad-chinese-formal': 'ideographLegalTraditional',
  'japanese-informal': 'japaneseCounting',
  'japanese-formal': 'japaneseLegal',
  hiragana: 'aiueoFullWidth',
  katakana: 'aiueoFullWidth',
  'hiragana-iroha': 'irohaFullWidth',
  'katakana-iroha': 'irohaFullWidth',
  'cjk-decimal': 'ideographDigital',
  'cjk-heavenly-stem': 'ideographTraditional',
  'cjk-earthly-branch': 'ideographZodiac',
  'circled-decimal': 'decimalEnclosedCircle',
  'fullwidth-decimal': 'decimalFullWidth',
  'arabic-indic': 'hindiNumbers',
  persian: 'hindiNumbers',
  'arabic-abjad': 'arabicAbjad',
  'arabic-abjad-maghrebi': 'arabicAbjad',
  abjad: 'arabicAbjad',
  hijai: 'arabicAlpha',
};

/** The Word page number format of a `:::numbering{format}` value, read
 *  the way the engine reads it (every spelling and token, `一` and `壹` by
 *  the document's script); undefined for a value the engine ignores. */
export function pageNumberFormat(value: string | undefined, locale: string): string | undefined {
  const style = parseNumberFormat(value, locale);
  return style ? PAGE_FORMATS[style] : undefined;
}

/** A `startAt` the engine applies: an integer of at least 1, in ASCII or
 *  Arabic-Indic digits. */
export function pageNumberStart(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(asciiDigits(value.trim()));
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** Blank room `lines` body lines tall: an empty paragraph of exact line
 *  height, which the reader passes over like any empty paragraph. */
function space(ctx: WriterContext, lines: number): string {
  const body = ctx.resolved.bodyText;
  const line = twips(ctx.units, body.lineHeight, px(ctx.units, body.fontSize)) || 240;
  const height = Math.max(20, Math.round(line * lines));
  return blockSdt(ctx.nextSdtId(), 'ptx:space', undefined, paragraph({ before: 0, after: 0, line: { twips: height, rule: 'exact' } }, ''));
}

/** Record a `:::numbering{format startAt}` for the chapter's section. */
function numbering(ctx: WriterContext, b: ContentBlock): void {
  const attrs = b.directiveAttrs ?? {};
  // Same reading as the engine's: a format or start it ignores changes
  // nothing. `lines=N` restarts line numbers, which Word sets apart.
  const format = pageNumberFormat(attrs.format, resolvedLocale(ctx.resolved));
  const start = pageNumberStart(attrs.startAt);
  const cur = ctx.chapter.pageNumbers ?? {};
  ctx.chapter.pageNumbers = { ...cur, ...(format ? { format } : {}), ...(start !== undefined ? { start } : {}) };
}

/** The native rendering of a directive block, or undefined to keep it as
 *  source. */
export function renderDirective(ctx: WriterContext, b: ContentBlock): string | undefined {
  switch (b.directiveName) {
    case 'toc':
      return tocField(ctx, b);
    case 'index':
      return indexField(ctx, b);
    case 'space': {
      const lines = spaceDirectiveLines(b.directiveAttrs);
      return lines === undefined ? '' : space(ctx, lines);
    }
    case 'numbering':
      numbering(ctx, b);
      return '';
    case 'references':
      // Bibliographic data (BibTeX or CSL JSON) for the citations, not
      // reading matter: kept out of view like the front matter, its source
      // left uncovered so re-import keeps it.
      return '';
    default:
      return undefined;
  }
}
