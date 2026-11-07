// One-line directives in the semantic .docx (#1444) that have a native
// rendering: `:::toc` and `:::index` as Word fields, `:::space` as blank
// room, `:::numbering` as the section's page numbering. None of them is
// written as text: their source lines stay in the Markdown untouched on
// re-import, because no fragment covers them.

import type { ContentBlock } from '../../parse/types.js';
import { spaceDirectiveLines } from '../../parse/attrs.js';
import type { WriterContext } from './context.js';
import { indexField, tocField } from './fields.js';
import { blockSdt, paragraph, px, twips } from './wml.js';

/** Word page number formats (`ST_NumberFormat`) of the numeral styles a
 *  `:::numbering{format}` names. A style Word lacks keeps the section's
 *  decimal numbers. */
const PAGE_FORMATS: Record<string, string> = {
  decimal: 'decimal',
  arabic: 'decimal',
  'decimal-02': 'decimalZero',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
  'lower-alpha': 'lowerLetter',
  'upper-alpha': 'upperLetter',
  'arabic-abjad': 'arabicAbjad',
  'arabic-abjad-maghrebi': 'arabicAbjad',
  abjad: 'arabicAbjad',
  hijai: 'arabicAlpha',
  'circled-decimal': 'decimalEnclosedCircle',
  'fullwidth-decimal': 'decimalFullWidth',
  'cjk-decimal': 'ideographDigital',
  'katakana-iroha': 'iroha',
  'cjk-heavenly-stem': 'ideographTraditional',
  'cjk-earthly-branch': 'ideographZodiac',
};

/** The `w:pgNumType` a chapter's `:::numbering` asks for ('' for none). */
export function pageNumberType(ctx: WriterContext): string {
  const p = ctx.chapter.pageNumbers;
  if (!p || (p.format === undefined && p.start === undefined)) return '';
  return `<w:pgNumType${p.format ? ` w:fmt="${p.format}"` : ''}${p.start !== undefined ? ` w:start="${p.start}"` : ''}/>`;
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
  const format = attrs.format !== undefined ? PAGE_FORMATS[attrs.format.trim()] : undefined;
  const startRaw = attrs.startAt ?? attrs.start;
  const start = startRaw !== undefined && /^\d+$/.test(startRaw.trim()) ? Number(startRaw.trim()) : undefined;
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
    default:
      return undefined;
  }
}
