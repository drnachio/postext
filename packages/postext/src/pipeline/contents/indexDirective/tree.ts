// The index model: entries and their locators, labels per language, the
// collator, locator ranges, and the tree of entries built from the marks
// (#1278: split out of indexDirective.ts).
import { stripInlineFormatting } from '../../../parse/inlineFormatting.js';
import type { OutlineEntry } from '../../../types.js';
import type { ResolvedConfig, ContentWarning } from '../../../vdt.js';
import { resolvedLocale } from '../../config.js';
import { stringsFor } from '../../../hyphenation/locale.js';

/** A page number's link target, carried as a Markdown link while the entry
 *  is measured and turned into `VDTLineSegment.pageLink` after. */
export const PAGE_HREF = '#postext-index-page:';

/** One page or page range of an entry. */
interface Locator {
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
  format?: string;
  main: boolean;
}

export interface IndexNode {
  /** The level's text as written (inline marks allowed). */
  text: string;
  sort: string;
  sortSet: boolean;
  /** The reading a mark gave (`yomi`), and the one the ruby of a marked
   *  text gave (#425): the first of each wins, as for `sort`. */
  yomi?: string;
  rubyYomi?: string;
  children: Map<string, IndexNode>;
  locators: Locator[];
  see: string[];
  seeAlso: string[];
}

const newNode = (text: string): IndexNode => ({
  text,
  sort: stripInlineFormatting(text),
  sortSet: false,
  children: new Map(),
  locators: [],
  see: [],
  seeAlso: [],
});

export interface IndexLabels {
  see: string;
  seeAlso: string;
  /** Words after the targets of a cross-reference whose verb follows its
   *  object (the Japanese →鷗外も見よ), set only with the built-in label;
   *  unset: none. */
  seeAfter?: string;
  seeAlsoAfter?: string;
  symbols: string;
  /** The head of the entries that open with a digit; `0–9` where not
   *  given. */
  numbers?: string;
  /** After the label and between two targets. Unset: a space and `; `.
   *  What comes before a cross-reference is `index.see.separator` (#836),
   *  whose default follows the language too. */
  refPunctuation?: { gap: string; join: string };
}

/** Chinese cross-references: 贾琏 12。见贾政；王熙凤 */
const CHINESE_REF_PUNCTUATION = { gap: '', join: '；' };

/** Japanese cross-references: 夏目漱石 12, 45　→漱石 (見よ) and
 *  漱石 3　→鷗外、子規も見よ (をも見よ), set off by an ideographic space,
 *  the targets joined by the enumeration comma 、. */
const JAPANESE_REF_PUNCTUATION = { gap: '', join: '、' };

/** Arabic cross-references: the Arabic semicolon between two targets
 *  (الجاحظ ١٢. انظر أيضًا البصرة؛ الكوفة). */
const ARABIC_REF_PUNCTUATION = { gap: ' ', join: '؛ ' };

/** Labels in the document language (English otherwise), keyed by
 *  `stringsKeyOf`. */
const LABELS: Record<string, IndexLabels> = {
  en: { see: 'See', seeAlso: 'See also', symbols: 'Symbols' },
  es: { see: 'Véase', seeAlso: 'Véase también', symbols: 'Símbolos' },
  ca: { see: 'Vegeu', seeAlso: 'Vegeu també', symbols: 'Símbols' },
  gl: { see: 'Véxase', seeAlso: 'Véxase tamén', symbols: 'Símbolos' },
  pt: { see: 'Ver', seeAlso: 'Ver também', symbols: 'Símbolos' },
  fr: { see: 'Voir', seeAlso: 'Voir aussi', symbols: 'Symboles' },
  it: { see: 'Vedi', seeAlso: 'Vedi anche', symbols: 'Simboli' },
  de: { see: 'Siehe', seeAlso: 'Siehe auch', symbols: 'Symbole' },
  'zh-hans': { see: '见', seeAlso: '另见', symbols: '符号', numbers: '数字', refPunctuation: CHINESE_REF_PUNCTUATION },
  'zh-hant': { see: '見', seeAlso: '另見', symbols: '符號', numbers: '數字', refPunctuation: CHINESE_REF_PUNCTUATION },
  // The arrow is the see reference of Japanese indexes; a see-also ends in
  // も見よ, which follows the targets (をも見よ参照).
  ja: { see: '→', seeAlso: '→', seeAlsoAfter: 'も見よ', symbols: '記号', numbers: '数字', refPunctuation: JAPANESE_REF_PUNCTUATION },
  ar: { see: 'انظر', seeAlso: 'انظر أيضًا', symbols: 'رموز', numbers: 'أرقام', refPunctuation: ARABIC_REF_PUNCTUATION },
};

export function labelsFor(locale: string): IndexLabels {
  return stringsFor(LABELS, locale);
}

/** Whether `separator` ends a sentence: a full stop, `!` or `?` (Latin,
 *  full-width or ideographic), spaces after it aside. */
function endsSentence(separator: string): boolean {
  return /[.!?。．！？]\s*$/u.test(separator);
}

/** A built-in cross-reference label in the case `separator` asks for
 *  (#836): `See` after a full stop, `see` after a comma or a space. A
 *  label in a script without case is returned as is. */
export function seeLabelCase(label: string, separator: string, locale: string): string {
  const first = label.match(/^\p{L}/u)?.[0];
  if (!first) return label;
  const cased = endsSentence(separator) ? first.toLocaleUpperCase(locale) : first.toLocaleLowerCase(locale);
  return cased + label.slice(first.length);
}

/** The locale the index sorts in: its own, else the document's. */
export function indexLocale(resolved: ResolvedConfig): string {
  return resolved.index.locale?.trim() || resolvedLocale(resolved);
}

export function collatorFor(locale: string, options: Intl.CollatorOptions): Intl.Collator {
  try {
    return new Intl.Collator(locale, options);
  } catch {
    return new Intl.Collator('en', options);
  }
}

/** Levels of a cross-reference target (`Heart!valves`). */
export function targetLevels(target: string): string[] {
  return target.split('!').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0);
}

/** The second number of a range, as `format` writes it: `'chicago'` drops
 *  the digits it shares with the first (Chicago 9.64: 71–72, 100–104,
 *  101–8, 321–28, 498–532, 1087–89, 1496–500). Labels that are not plain
 *  numbers are kept whole. */
export function rangeEnd(fromLabel: string, toLabel: string, format: 'full' | 'chicago'): string {
  if (format !== 'chicago' || !/^\d+$/.test(fromLabel) || !/^\d+$/.test(toLabel)) return toLabel;
  const a = Number(fromLabel);
  const b = Number(toLabel);
  if (a < 100 || a % 100 === 0 || b <= a || fromLabel.length !== toLabel.length) return toLabel;
  let i = 0;
  while (i < fromLabel.length && fromLabel[i] === toLabel[i]) i++;
  // 101–109 in each hundred: the changed part only; otherwise at least two
  // digits.
  return a % 100 < 10 ? toLabel.slice(i) : toLabel.slice(Math.min(i, toLabel.length - 2));
}

/** Sorted, merged page numbers of an entry. */
function compactLocators(locators: readonly Locator[], mergeRanges: boolean): Locator[] {
  const sorted = [...locators].sort((a, b) => a.from - b.from || a.to - b.to || Number(b.main) - Number(a.main));
  const out: Locator[] = [];
  for (const loc of sorted) {
    const last = out[out.length - 1];
    if (last && loc.from <= last.to) {
      // Inside or overlapping the one before: one locator, main when either
      // was (a main page inside a range makes the range the principal
      // discussion, #170).
      if (loc.to > last.to) {
        last.to = loc.to;
        last.toLabel = loc.toLabel;
      }
      last.main ||= loc.main;
      continue;
    }
    if (mergeRanges && last && !last.main && !loc.main && loc.from === last.to + 1 && loc.format === last.format) {
      last.to = loc.to;
      last.toLabel = loc.toLabel;
      continue;
    }
    out.push({ ...loc });
  }
  return out;
}

interface IndexTree {
  roots: IndexNode[];
  warnings: ContentWarning[];
}

/** The entries of index `name` from the marks of `outline`. */
export function buildIndexTree(outline: readonly OutlineEntry[], name: string, mergeRanges: boolean): IndexTree {
  const top = new Map<string, IndexNode>();
  const warnings: ContentWarning[] = [];
  const open = new Map<string, { entry: OutlineEntry; main: boolean }[]>();
  const nodeFor = (path: readonly string[]): IndexNode => {
    let level = top;
    let node: IndexNode | undefined;
    for (const text of path) {
      node = level.get(text);
      if (!node) {
        node = newNode(text);
        level.set(text, node);
      }
      level = node.children;
    }
    return node!;
  };
  const locatorOf = (from: OutlineEntry, to: OutlineEntry, main: boolean): Locator | undefined => {
    if (from.pageIndex === undefined || to.pageIndex === undefined) return undefined;
    const [a, b] = from.pageIndex <= to.pageIndex ? [from, to] : [to, from];
    return {
      from: a.pageIndex!, to: b.pageIndex!, fromLabel: a.pageLabel ?? '', toLabel: b.pageLabel ?? '',
      ...(a.pageFormat !== undefined ? { format: a.pageFormat } : {}), main,
    };
  };
  for (const entry of outline) {
    const mark = entry.indexMark;
    if (entry.kind !== 'indexMark' || !mark || mark.index !== name || mark.path.length === 0) continue;
    const node = nodeFor(mark.path);
    if (mark.sort && !node.sortSet) {
      node.sort = mark.sort;
      node.sortSet = true;
    }
    if (mark.yomi && node.yomi === undefined) node.yomi = mark.yomi;
    if (mark.rubyYomi && node.rubyYomi === undefined) node.rubyYomi = mark.rubyYomi;
    if (mark.see && !node.see.includes(mark.see)) node.see.push(mark.see);
    if (mark.seeAlso && !node.seeAlso.includes(mark.seeAlso)) node.seeAlso.push(mark.seeAlso);
    // `see` sends the reader elsewhere: the mark has no page. A `seealso`
    // mark is a passage on the term like any other (#167).
    if (mark.see) continue;
    const key = mark.path.join('!');
    if (mark.range === 'start') {
      const list = open.get(key) ?? [];
      list.push({ entry, main: !!mark.main });
      open.set(key, list);
      continue;
    }
    if (mark.range === 'end') {
      const start = open.get(key)?.pop();
      if (!start) warnings.push({ kind: 'indexRangeUnclosed', term: key, missing: 'start', index: name });
      const loc = locatorOf(start?.entry ?? entry, entry, (start?.main ?? false) || !!mark.main);
      if (loc) node.locators.push(loc);
      continue;
    }
    const loc = locatorOf(entry, entry, !!mark.main);
    if (loc) node.locators.push(loc);
  }
  for (const [key, list] of open) {
    for (const start of list) {
      warnings.push({ kind: 'indexRangeUnclosed', term: key, missing: 'end', index: name });
      const loc = locatorOf(start.entry, start.entry, start.main);
      if (loc) nodeFor(key.split('!')).locators.push(loc);
    }
  }
  // Cross-references to entries the index does not hold.
  const exists = (levels: readonly string[]): boolean => {
    let level = top;
    for (const text of levels) {
      const node = level.get(text) ?? [...level.values()].find((n) => n.sort.toLowerCase() === text.toLowerCase());
      if (!node) return false;
      level = node.children;
    }
    return levels.length > 0;
  };
  const walk = (nodes: Iterable<IndexNode>): void => {
    for (const node of nodes) {
      node.locators = compactLocators(node.locators, mergeRanges);
      for (const target of [...node.see, ...node.seeAlso]) {
        if (!exists(targetLevels(target))) warnings.push({ kind: 'indexSeeUnknown', target, index: name });
      }
      walk(node.children.values());
    }
  };
  walk(top.values());
  return { roots: [...top.values()], warnings };
}
