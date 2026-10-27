// The index set as content blocks: the letter groups entries fall in
// (Latin initials, Japanese kana rows) and each entry's spans with its page
// references (#1278: split out of indexDirective.ts).
import type { ContentBlock, IndexBlockInfo, InlineSpan } from '../../../parse/index.js';
import { parseInlineFormatting } from '../../../parse/inlineFormatting.js';
import type { OutlineEntry, ResolvedIndexConfig } from '../../../types.js';
import type { ResolvedConfig, ContentWarning } from '../../../vdt.js';
import { chineseScriptOf, localeScript, languageOf } from '../../../hyphenation/locale.js';
import { type IndexGrouping, pinyinInitial, strokeGroup, strokeLabel, indexGrouping, sortLocaleFor, canGroupBy, arabicSortKey } from '../indexGroups.js';
import { japaneseLead, gojuonRow, gojuonRowLabel, kanaLabel, compareJapanese, hasKanji } from '../indexJapanese.js';
import { buildIndexTree, indexLocale, collatorFor, labelsFor, seeLabelCase, type IndexNode, type IndexLabels, rangeEnd, PAGE_HREF, targetLevels } from './tree.js';

/** Group of a main entry: rank (symbols, numbers, letters, and Han
 *  characters grouped by strokes), head and, when the grouping orders its
 *  groups itself, the group's place among those of its rank. */
interface EntryGroup {
  rank: number;
  label: string;
  order?: number;
}

const LATIN_INITIALS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function groupOf(
  sortKey: string,
  locale: string,
  base: Intl.Collator,
  labels: { symbols: string; numbers: string },
  grouping: IndexGrouping,
): EntryGroup {
  const lead = [...sortKey.trim()][0] ?? '';
  // A fullwidth letter or digit files with its ASCII form (`Ｑ版` under Q).
  const first = /[\uff01-\uffee]/.test(lead) ? lead.normalize('NFKC') : lead;
  // A Han numeral (〇, read líng) files with the characters, not the digits.
  const han = /\p{sc=Han}/u.test(first);
  if (han || /\p{L}/u.test(first)) {
    if (grouping === 'none') return { rank: 2, label: '' };
    if (han && grouping === 'pinyin') {
      const initial = pinyinInitial(base, first);
      if (initial) return { rank: 2, label: initial, order: LATIN_INITIALS.indexOf(initial) };
    }
    if (han && grouping === 'stroke') {
      const strokes = strokeGroup(base, first);
      if (strokes !== undefined) return { rank: 3, label: strokeLabel(strokes, chineseScriptOf(locale) !== 'Hans'), order: strokes };
    }
    const upper = first.toLocaleUpperCase(locale);
    const plain = upper.normalize('NFD').replace(/\p{M}/gu, '');
    // `Á` files under A; the Spanish Ñ, a letter of its own, under Ñ.
    const label = plain.length > 0 && base.compare(plain, upper) === 0 ? plain : upper;
    if (grouping === 'letter') return { rank: 2, label };
    // Pinyin groups: a Latin sort key (`sort="jia bao yu"`) files under
    // its letter, after the Han entries read that way (the collator sorts
    // Latin after Han); other letters follow Z.
    const at = LATIN_INITIALS.indexOf(label);
    return { rank: 2, label, order: at >= 0 ? at : LATIN_INITIALS.length };
  }
  if (/\p{N}/u.test(first)) return { rank: 1, label: labels.numbers };
  return { rank: 0, label: labels.symbols };
}

/**
 * Group of a main entry of a Japanese index (#425), from its reading, in
 * JIS X 4061 order: symbols, numbers, Latin letters (under their letter),
 * the kana (under their gojūon row, or their own kana with `kana`; `letter`
 * reads a kana's letter as the kana itself), then the entries left with a
 * kanji at their head, which have no reading to file by: they follow with
 * no head (`indexReadingMissing` names each).
 */
function japaneseGroupOf(
  sortKey: string,
  locale: string,
  base: Intl.Collator,
  labels: { symbols: string; numbers: string },
  grouping: IndexGrouping,
): EntryGroup {
  const lead = japaneseLead(sortKey);
  switch (lead.kind) {
    case 'kana':
      if (grouping === 'none') return { rank: 3, label: '' };
      if (grouping === 'gojuon') {
        const row = gojuonRow(lead.base);
        return { rank: 3, label: gojuonRowLabel(row), order: row };
      }
      return { rank: 3, label: kanaLabel(lead.base), order: lead.base };
    case 'kanji':
      return { rank: 4, label: '' };
    case 'latin': {
      if (grouping === 'none') return { rank: 2, label: '' };
      const { label } = groupOf(sortKey, locale, base, labels, 'letter');
      const at = LATIN_INITIALS.indexOf(label);
      return { rank: 2, label, order: at >= 0 ? at : LATIN_INITIALS.length };
    }
    case 'digit':
      return { rank: 1, label: labels.numbers };
    default:
      return { rank: 0, label: labels.symbols };
  }
}

/** The blocks of one `:::index` directive. */
export function indexBlocksFor(
  directive: ContentBlock,
  outline: readonly OutlineEntry[],
  resolved: ResolvedConfig,
): { blocks: ContentBlock[]; warnings: ContentWarning[] } {
  const cfg = resolved.index;
  const name = directive.directiveAttrs?.index?.trim() ?? '';
  const { roots, warnings } = buildIndexTree(outline, name, cfg.mergeRanges);
  const locale = indexLocale(resolved);
  // Chinese heads (#182): pinyin initials or stroke counts, sorted in the
  // collation that orders them, so heads and order agree. A collator that
  // cannot tell them (no Chinese collation data) sets no heads.
  let grouping = indexGrouping(cfg.groupBy, locale);
  const sortLocale = sortLocaleFor(locale, grouping);
  const base = collatorFor(sortLocale, { sensitivity: 'base', numeric: true });
  const fine = collatorFor(sortLocale, { sensitivity: 'variant', numeric: true });
  if ((grouping === 'pinyin' || grouping === 'stroke') && !canGroupBy(base, grouping)) grouping = 'none';
  const localized = labelsFor(locale);
  // A built-in label takes the case of the separator before it (#836); an
  // author's own label prints as written.
  const labels = {
    see: cfg.see.label ?? seeLabelCase(localized.see, cfg.see.separator, locale),
    seeAlso: cfg.see.alsoLabel ?? seeLabelCase(localized.seeAlso, cfg.see.separator, locale),
    // The trailing words belong to the built-in label: an author's own
    // label stands alone.
    ...(cfg.see.label === undefined && localized.seeAfter ? { seeAfter: localized.seeAfter } : {}),
    ...(cfg.see.alsoLabel === undefined && localized.seeAlsoAfter ? { seeAlsoAfter: localized.seeAlsoAfter } : {}),
    symbols: cfg.groups.symbolsLabel ?? localized.symbols,
    numbers: cfg.groups.numbersLabel ?? localized.numbers ?? '0–9',
    ...(localized.refPunctuation ? { refPunctuation: localized.refPunctuation } : {}),
  };
  // Arabic (#372): entries sort and file by a key without vowel signs,
  // hamza seats or (with `ignoreArticle`) the article; an entry's own
  // `sort` key keeps its article. Any other index sorts by the text.
  const arabicKeys = localeScript(locale) === 'Arab' || cfg.ignoreArticle;
  // Japanese (#425): entries file by their reading — `yomi`, else the kana
  // ruby of the marked text, else `sort` — in JIS X 4061 order, not in the
  // collator's (which orders kanji by code point). A gojūon or kana
  // grouping asks for that order in any language.
  const japanese = languageOf(locale) === 'ja' || grouping === 'gojuon' || grouping === 'kana';
  const keys = new Map<IndexNode, string>();
  const keyOf = (node: IndexNode): string => {
    if (japanese) return node.yomi ?? node.rubyYomi ?? node.sort;
    if (!arabicKeys) return node.yomi ?? node.sort;
    let key = keys.get(node);
    if (key === undefined) {
      key = arabicSortKey(node.yomi ?? node.sort, cfg.ignoreArticle && !node.sortSet && node.yomi === undefined);
      keys.set(node, key);
    }
    return key;
  };
  const bySort = japanese
    ? (a: IndexNode, b: IndexNode): number => compareJapanese(keyOf(a), keyOf(b)) || compareJapanese(a.text, b.text)
    : (a: IndexNode, b: IndexNode): number => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return base.compare(ka, kb) || fine.compare(ka, kb) || fine.compare(a.text, b.text);
    };
  const sortedRoots = roots
    .map((node) => ({
      node,
      group: (japanese ? japaneseGroupOf : groupOf)(keyOf(node), locale, base, labels, grouping),
    }))
    .sort((a, b) => a.group.rank - b.group.rank || (a.group.order ?? 0) - (b.group.order ?? 0) || bySort(a.node, b.node));
  if (japanese) {
    // An entry whose key still holds a kanji has no reading: it files by
    // code point, after the kana (ja typography §13).
    const unread = (nodes: Iterable<IndexNode>, path: readonly string[]): void => {
      for (const node of nodes) {
        const at = [...path, node.text];
        if (hasKanji(keyOf(node))) warnings.push({ kind: 'indexReadingMissing', term: at.join('!'), index: name });
        unread(node.children.values(), at);
      }
    };
    unread(roots, []);
  }

  const out: ContentBlock[] = [];
  const baseBlock = { sourceStart: directive.sourceStart, sourceEnd: directive.sourceEnd };
  /** The group being expanded and the entry blocks it holds so far. */
  let groupIndex = 0;
  let groupPlace = 0;
  const push = (
    node: IndexNode,
    level: number,
    group?: { label: string; start: boolean; first: boolean },
    leads: NonNullable<IndexBlockInfo['leads']> = [],
  ): void => {
    const spans = entrySpans(node, cfg, labels);
    const children = [...node.children.values()].sort(bySort);
    // An entry with no page and no cross-reference only heads its
    // sub-entries: it is set in one block with the first of them, so it
    // never ends a column alone (#171).
    if (children.length > 0 && node.locators.length === 0 && node.see.length === 0 && node.seeAlso.length === 0) {
      push(children[0]!, level + 1, group, [...leads, { level, spans }]);
      for (const child of children.slice(1)) push(child, level + 1);
      return;
    }
    const text = [...leads.map((l) => l.spans), spans].map((list) => list.map((s) => s.text).join('')).join(' ');
    const info: IndexBlockInfo = {
      level,
      // The first group takes no space above it: what precedes the
      // directive (the index's heading) sets that distance (#166).
      ...(group?.start && !group.first ? { groupStart: true } : {}),
      ...(group?.start && cfg.groups.enabled && grouping !== 'none' ? { group: group.label } : {}),
      ...(leads.length > 0 ? { leads } : {}),
      groupIndex,
      groupPlace: groupPlace++,
    };
    out.push({
      ...baseBlock,
      type: 'paragraph',
      text,
      spans,
      // Every character maps to the directive line: a click on the index
      // lands on `:::index`.
      sourceMap: new Array<number>(text.length).fill(directive.sourceStart),
      index: info,
    });
    for (const child of children) push(child, level + 1);
  };
  let lastGroup: string | undefined;
  for (const { node, group } of sortedRoots) {
    // With no heads (`none`) the groups are the ranks: symbols, numbers,
    // words.
    const key = grouping === 'none' ? String(group.rank) : group.label;
    const start = key !== lastGroup;
    const first = lastGroup === undefined;
    lastGroup = key;
    if (start && !first) { groupIndex++; groupPlace = 0; }
    push(node, 0, { label: group.label, start, first });
  }
  // Every entry block knows the size of its group (#712).
  const sizes = new Map<number, number>();
  for (const b of out) sizes.set(b.index!.groupIndex!, (sizes.get(b.index!.groupIndex!) ?? 0) + 1);
  for (const b of out) b.index!.groupSize = sizes.get(b.index!.groupIndex!)!;
  return { blocks: out, warnings };
}

/** The runs of an entry: its term, its page numbers (links to their
 *  pages; the main ones bold) and its cross-references. */
function entrySpans(
  node: IndexNode,
  cfg: ResolvedIndexConfig,
  labels: Pick<IndexLabels, 'see' | 'seeAlso' | 'seeAfter' | 'seeAlsoAfter' | 'refPunctuation'>,
): InlineSpan[] {
  const spans: InlineSpan[] = parseInlineFormatting(node.text);
  const plain = (text: string): void => {
    if (text.length > 0) spans.push({ text, bold: false, italic: false });
  };
  node.locators.forEach((loc, i) => {
    plain(i === 0 ? cfg.separator : cfg.locatorSeparator);
    const end = rangeEnd(loc.fromLabel, loc.toLabel, cfg.rangeFormat);
    const label = loc.from === loc.to || loc.fromLabel === loc.toLabel ? loc.fromLabel : `${loc.fromLabel}${cfg.rangeSeparator}${end}`;
    // A range links to its first page.
    spans.push({
      text: label,
      bold: loc.main && cfg.main.bold,
      italic: loc.main && cfg.main.italic,
      links: [{ start: 0, end: label.length, href: `${PAGE_HREF}${loc.from}` }],
    });
  });
  const punctuation = labels.refPunctuation ?? { gap: ' ', join: '; ' };
  const refs = (label: string, targets: readonly string[], after = ''): void => {
    if (targets.length === 0) return;
    plain(cfg.see.separator);
    spans.push({ text: label, bold: false, italic: cfg.see.italic });
    plain(punctuation.gap);
    targets.forEach((target, i) => {
      if (i > 0) plain(punctuation.join);
      for (const s of parseInlineFormatting(targetLevels(target).join(': '))) spans.push(s);
    });
    if (after) spans.push({ text: after, bold: false, italic: cfg.see.italic });
  };
  refs(labels.see, node.see, labels.seeAfter);
  refs(labels.seeAlso, node.seeAlso, labels.seeAlsoAfter);
  return spans;
}
