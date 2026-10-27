// The markers the engine writes itself for a citation: number lists,
// locator words per script, and the author name of a narrative citation
// (#1278: split out of citations.ts).
import type { InlineSpan } from '../../../parse/index.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { CslItem, CitationClusterInput, CitationProcessor, CslName } from '../../../citations/types.js';
import { isEtAlName } from '../../../citations/bibtex.js';
import { languageOf } from '../../../hyphenation/locale.js';
import { affixSpans } from '../../../parse/citations.js';

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
const ARABIC = /\p{sc=Arabic}/u;
export const isCjkItem = (item: CslItem | undefined): boolean =>
  !!item && ((typeof item.language === 'string' && /^(zh|ja|ko)/i.test(item.language)) || CJK.test(String(item.title ?? '')));

/** Short locator words for a numbered marker the engine writes itself. */
const LOCATOR_WORDS: Readonly<Record<string, string>> = {
  page: 'p.', chapter: 'chap.', section: '§', figure: 'fig.', volume: 'vol.', note: 'n.', line: 'l.', paragraph: '¶', column: 'col.', verse: 'v.',
};

/** The locator words of an Arabic citation ([٣، ص ١٢]), after the short
 *  terms of the CSL Arabic locale (ص, فصل, عمود, سطر, فقرة), with مج for a
 *  volume (the locale's م reads as the Gregorian-year mark) and بيت for a
 *  verse. */
const ARABIC_LOCATOR_WORDS: Readonly<Record<string, string>> = {
  page: 'ص', chapter: 'فصل', section: '§', figure: 'شكل', volume: 'مج', note: 'ملاحظة', line: 'سطر', paragraph: '¶', column: 'عمود', verse: 'بيت',
};

/** Numbers as a marker lists them: sorted, consecutive ones joined into a
 *  range when `collapse`. */
function numberList(numbers: number[], collapse: boolean, sep = ', '): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (!collapse) return sorted.join(sep);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : j === i + 1 ? `${sorted[i]}${sep}${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(sep);
}

/** A numbered style's citation in the marker the configuration asks for. */
export function markerSpans(
  cluster: CitationClusterInput,
  numbers: ReadonlyMap<string, number>,
  items: ReadonlyMap<string, CslItem>,
  resolved: ResolvedConfig,
  narrative: string | undefined,
  base: { bold: boolean; italic: boolean },
  locale: string,
): InlineSpan[] {
  const cfg = resolved.citations;
  const known = cluster.items.filter((it) => numbers.has(it.id) && items.has(it.id));
  const single = known.length === 1 ? known[0]! : undefined;
  // A Chinese citation writes the page after the number alone, as GB/T 7714
  // does (〔1〕12); other locators keep their word.
  const chinese = locale.toLowerCase().startsWith('zh');
  // An Arabic one writes its locator word in Arabic and separates with the
  // Arabic comma: [٢، ٥، ص ١٢].
  const arabic = languageOf(locale) === 'ar';
  const comma = arabic ? '،' : ',';
  const label = single?.label ?? 'page';
  const word = chinese && label === 'page' ? '' : (arabic ? ARABIC_LOCATOR_WORDS : LOCATOR_WORDS)[label] ?? '';
  const loc = single?.locator ? (word ? `${word}\u00a0${single.locator}` : single.locator) : '';
  // Raised numbers are set close, "⁴,⁶": a space there would stretch on a
  // justified line.
  const list = numberList(known.map((it) => numbers.get(it.id)!), cfg.collapseRanges, cfg.marker === 'superscript' ? comma : `${comma} `);
  const span = (text: string, extra: Partial<InlineSpan> = {}): InlineSpan => ({ text, bold: base.bold, italic: base.italic, ...extra });
  const out: InlineSpan[] = [];
  if (narrative) out.push(span(cfg.marker === 'superscript' || cfg.marker === 'corner' ? narrative : `${narrative} `));
  // The first work's prefix before the marker and the last one's suffix
  // after it, their emphasis read (#528): "see [1], *inter alia*", as
  // citeproc-js sets a bracketed number.
  const prefix = known[0]?.prefix;
  const suffix = known[known.length - 1]?.suffix;
  const affix = (text: string): InlineSpan[] => affixSpans(text).map((s) => ({ ...s, bold: s.bold || base.bold, italic: s.italic !== base.italic }));
  if (prefix && !narrative) out.push(...affix(/[\s([{]$/u.test(prefix) ? prefix : `${prefix} `));
  switch (cfg.marker) {
    case 'parentheses':
      out.push(span(`(${list}${loc ? `${comma} ${loc}` : ''})`));
      break;
    case 'superscript':
      out.push(span(`${list}${loc ? `(${loc})` : ''}`, { script: 'sup' }));
      break;
    case 'corner':
      out.push(span(`〔${list}〕${loc}`));
      break;
    default:
      out.push(span(`[${list}${loc ? `${comma} ${loc}` : ''}]`));
  }
  if (suffix) out.push(...affix(/^[\s\p{P}]/u.test(suffix) ? suffix : ` ${suffix}`));
  return out;
}

/** Authors of a work for a narrative citation in a numbered style. In a
 *  Japanese locale a CJK name takes the locale's words for "and" and "et
 *  al.", set solid (夏目と森, 夏目ほか, #426); Chinese keeps 、 and 等. */
export function narrativeName(item: CslItem | undefined, locale: string, terms: CitationProcessor['terms']): string {
  const listed = (item?.author ?? item?.editor ?? []) as CslName[];
  // `and others` (#533): the names left out make it "et al.".
  const names = listed.filter((n) => !isEtAlName(n));
  if (names.length === 0) return '';
  const first = names[0]!.literal ?? names[0]!.family ?? '';
  const cjk = CJK.test(first);
  // An Arabic name takes the Arabic conjunction, joined to the word it
  // precedes: «الجاحظ والمبرد», «الجاحظ وآخرون».
  const arabic = ARABIC.test(first);
  if (names.length < listed.length) return cjk && terms && languageOf(locale) === 'ja' ? `${first}${terms.etAl}` : cjk ? `${first}等` : arabic ? `${first} وآخرون` : `${first} et al.`;
  if (names.length === 1) return first;
  const second = names[1]!.literal ?? names[1]!.family ?? '';
  if (cjk && terms && languageOf(locale) === 'ja') return names.length === 2 ? `${first}${terms.and}${second}` : `${first}${terms.etAl}`;
  if (names.length === 2) return cjk ? `${first}、${second}` : arabic ? `${first} و${second}` : `${first} & ${second}`;
  return cjk ? `${first}等` : arabic ? `${first} وآخرون` : `${first} et al.`;
}
