// How Word numbers and separates the book's footnotes (#1444): the number
// format (`footnotes.numberFormat`, `w:numFmt`), where the count starts
// again (`footnotes.numbering`: on every page, `w:numRestart eachPage`; at
// each chapter, at the chapter's first section), and the rule over the
// notes as the book draws it (`footnotes.separator`: its length, weight
// and colour) in place of Word's two-inch line.

import { resolvedLocale } from '../../../pipeline/config.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { pageNumberFormat } from '../directives.js';
import { eighths, hex, pPr, px, type Units } from '../wml.js';

/** The Word number format of the notes ('' for Word's own decimal). */
function noteFormat(r: ResolvedConfig): string {
  const f = r.footnotes.numberFormat;
  if (f === 'symbols') return 'chicago';
  const word = pageNumberFormat(String(f), resolvedLocale(r));
  return word && word !== 'decimal' ? word : '';
}

/** Where Word starts counting the notes again: `chapter` for the first
 *  section of each chapter (other sections go on counting). */
function restart(r: ResolvedConfig): 'eachPage' | 'chapter' | undefined {
  const n = r.footnotes.numbering;
  if (n === 'page' || n === 'column' || n === 'spread') {
    // Notes set after the chapter count by chapter instead.
    return r.footnotes.placement === 'chapterEnd' ? 'chapter' : 'eachPage';
  }
  return n === 'chapter' ? 'chapter' : undefined;
}

/** The `w:numFmt` and `w:numRestart` of a section (`first`: the chapter's
 *  first) or, without `first`, of the whole document. A section writes
 *  all three, its first number and how the count goes on included, so
 *  every section says the same thing (LibreOffice numbered a note 0 in a
 *  section that said nothing after one that restarts). */
function noteProps(r: ResolvedConfig, first: boolean | undefined): string {
  const fmt = noteFormat(r);
  const again = restart(r);
  const section = first !== undefined;
  const value = again === 'eachPage' ? 'eachPage' : again === 'chapter' && first ? 'eachSect' : section ? 'continuous' : '';
  return (fmt ? `<w:numFmt w:val="${fmt}"/>` : '') + (section ? '<w:numStart w:val="1"/>' : '') + (value ? `<w:numRestart w:val="${value}"/>` : '');
}

/** The `w:footnotePr` of `settings.xml` (its separator notes listed),
 *  or '' when Word's defaults serve. */
export function settingsFootnotePr(r: ResolvedConfig): string {
  const props = noteProps(r, undefined);
  return props ? `<w:footnotePr>${props}<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>` : '';
}

/** The `w:footnotePr` of a section's `w:sectPr` ('' for none). Only in a
 *  book with notes: a restart at the chapter goes on its first section. */
export function sectionFootnotePr(r: ResolvedConfig, first: boolean): string {
  const props = noteProps(r, first);
  return props ? `<w:footnotePr>${props}</w:footnotePr>` : '';
}

/**
 * The paragraph of the separator note: an empty line whose top border is
 * the book's rule, as long as `separator.width` of the text area (`text`,
 * twips) by a right indent; no line when the book draws none. Undefined
 * for Word's own.
 */
export function separatorParagraph(r: ResolvedConfig, u: Units, text: number): string | undefined {
  const sep = r.footnotes.separator;
  const spacing = { before: 0, after: 0, line: { twips: 240, rule: 'auto' as const } };
  if (!sep.enabled) return `<w:p>${pPr(spacing)}</w:p>`;
  const width = Math.min(1, Math.max(0.02, sep.width));
  const color = hex(sep.color ?? r.footnotes.color) ?? '000000';
  const sz = Math.max(2, Math.min(eighths(u, sep.lineWidth), 24));
  // The rule sits on the paragraph's top edge; the line under it is the
  // gap before the first note.
  const gap = px(u, r.footnotes.spaceBelowRule);
  const line = Math.max(40, Math.round((gap * 1440) / u.dpi));
  return `<w:p>${pPr({ before: 0, after: 0, line: { twips: line, rule: 'exact' }, ind: { left: 0, right: Math.round(text * (1 - width)), firstLine: 0 }, border: { top: { color, sz, space: 0 } } })}</w:p>`;
}
