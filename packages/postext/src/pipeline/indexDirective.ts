/**
 * `:::index` — the back-of-book index (#165). The directive expands, before
 * layout, into ordinary content blocks, one per entry, that flow through
 * the column machinery like paragraphs (the contents do the same, see
 * `toc.ts`). The entries come from the index marks of the book's outline
 * (`OutlineEntry.indexMark`), each with the page it landed on: grouped by
 * term and sub-term, sorted in the document language's alphabetical order,
 * their pages merged into ranges. An entry that opens a new letter carries
 * the letter head in its own block, so a head never ends a column alone.
 */

import type { ContentBlock, IndexBlockInfo, InlineSpan } from '../parse';
import { parseInlineFormatting, stripInlineFormatting } from '../parse/inlineFormatting';
import type { OutlineEntry, ResolvedIndexConfig } from '../types';
import type { ContentWarning, ResolvedConfig, VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../vdt';
import { dimensionToPx } from '../units';
import { buildFontString, measureRichBlock } from '../measure';
import { linkSegments } from '../measure/links';
import type { BlockStyle } from './styles';
import type { BlockMeasureContext, MeasuredContentBlock } from './measureContentBlock';
import { stampSourceRanges } from './buildHelpers';
import { bookTitlesAsConfigured } from './annotations';
import { resolvedLocale } from './config';
import { chineseScriptOf, localeScript, stringsFor } from '../locale';
import type { IndexGrouping } from './indexGroups';
import { arabicSortKey, canGroupBy, indexGrouping, pinyinInitial, sortLocaleFor, strokeGroup, strokeLabel } from './indexGroups';

/** A page number's link target, carried as a Markdown link while the entry
 *  is measured and turned into `VDTLineSegment.pageLink` after. */
const PAGE_HREF = '#postext-index-page:';

/** One page or page range of an entry. */
interface Locator {
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
  format?: string;
  main: boolean;
}

interface IndexNode {
  /** The level's text as written (inline marks allowed). */
  text: string;
  sort: string;
  sortSet: boolean;
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

interface IndexLabels {
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
  /** Before a cross-reference, after the label, and between two targets.
   *  Unset: `. `, a space and `; `. */
  refPunctuation?: { lead: string; gap: string; join: string };
}

/** Chinese cross-references: 贾琏 12。见贾政；王熙凤 */
const CHINESE_REF_PUNCTUATION = { lead: '。', gap: '', join: '；' };

/** Japanese cross-references: 夏目漱石 12, 45　→漱石 (見よ) and
 *  漱石 3　→鷗外、子規も見よ (をも見よ), set off by an ideographic space,
 *  the targets joined by the enumeration comma 、. */
const JAPANESE_REF_PUNCTUATION = { lead: '\u3000', gap: '', join: '、' };

/** Arabic cross-references: the Arabic semicolon between two targets
 *  (الجاحظ ١٢. انظر أيضًا البصرة؛ الكوفة). */
const ARABIC_REF_PUNCTUATION = { lead: '. ', gap: ' ', join: '؛ ' };

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

function labelsFor(locale: string): IndexLabels {
  return stringsFor(LABELS, locale);
}

/** The locale the index sorts in: its own, else the document's. */
export function indexLocale(resolved: ResolvedConfig): string {
  return resolved.index.locale?.trim() || resolvedLocale(resolved);
}

function collatorFor(locale: string, options: Intl.CollatorOptions): Intl.Collator {
  try {
    return new Intl.Collator(locale, options);
  } catch {
    return new Intl.Collator('en', options);
  }
}

/** Levels of a cross-reference target (`Heart!valves`). */
function targetLevels(target: string): string[] {
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
function buildIndexTree(outline: readonly OutlineEntry[], name: string, mergeRanges: boolean): IndexTree {
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

/** The blocks of one `:::index` directive. */
function indexBlocksFor(
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
  const labels = {
    see: cfg.see.label ?? localized.see,
    seeAlso: cfg.see.alsoLabel ?? localized.seeAlso,
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
  const keys = new Map<IndexNode, string>();
  const keyOf = (node: IndexNode): string => {
    if (!arabicKeys) return node.sort;
    let key = keys.get(node);
    if (key === undefined) {
      key = arabicSortKey(node.sort, cfg.ignoreArticle && !node.sortSet);
      keys.set(node, key);
    }
    return key;
  };
  const bySort = (a: IndexNode, b: IndexNode): number => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return base.compare(ka, kb) || fine.compare(ka, kb) || fine.compare(a.text, b.text);
  };
  const sortedRoots = roots
    .map((node) => ({ node, group: groupOf(keyOf(node), locale, base, labels, grouping) }))
    .sort((a, b) => a.group.rank - b.group.rank || (a.group.order ?? 0) - (b.group.order ?? 0) || bySort(a.node, b.node));

  const out: ContentBlock[] = [];
  const baseBlock = { sourceStart: directive.sourceStart, sourceEnd: directive.sourceEnd };
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
    push(node, 0, { label: group.label, start, first });
  }
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
  const punctuation = labels.refPunctuation ?? { lead: '. ', gap: ' ', join: '; ' };
  const refs = (label: string, targets: readonly string[], after = ''): void => {
    if (targets.length === 0) return;
    plain(punctuation.lead);
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

/** The content blocks with every `:::index` directive replaced by the
 *  entries it prints, and the warnings the index raised. Without an
 *  outline (no directive) the input is returned as is. */
export function expandIndexDirectives(
  blocks: readonly ContentBlock[],
  outline: readonly OutlineEntry[] | undefined,
  resolved: ResolvedConfig,
): { blocks: ContentBlock[]; warnings: ContentWarning[] } {
  if (!outline || !blocks.some((b) => b.type === 'directive' && b.directiveName === 'index')) {
    return { blocks: blocks as ContentBlock[], warnings: [] };
  }
  const out: ContentBlock[] = [];
  const warnings: ContentWarning[] = [];
  for (const b of blocks) {
    if (b.type !== 'directive' || b.directiveName !== 'index') { out.push(b); continue; }
    const expanded = indexBlocksFor(b, outline, resolved);
    out.push(...expanded.blocks);
    for (const w of expanded.warnings) warnings.push({ ...w, sourceStart: b.sourceStart, sourceEnd: b.sourceEnd });
  }
  return { blocks: out, warnings };
}

function lineHeightPxOf(lineHeight: { value: number; unit: string }, fontSizePx: number, dpi: number): number {
  if (lineHeight.unit === 'em' || lineHeight.unit === 'rem') return fontSizePx * lineHeight.value;
  return dimensionToPx(lineHeight as Parameters<typeof dimensionToPx>[0], dpi, fontSizePx);
}

/** The segments of a line, made from its text when it has none. */
function segmentsOf(line: VDTLine): VDTLineSegment[] {
  if (line.segments && line.segments.length > 0) return line.segments;
  const segs: VDTLineSegment[] = [{ kind: 'text', text: line.text, width: line.bbox.width }];
  line.segments = segs;
  return segs;
}

/** Page links: the page numbers' link targets become `pageLink`. */
function pageLinks(lines: VDTLine[]): VDTLine[] {
  return lines.map((line) => {
    if (!line.segments?.some((s) => s.href?.startsWith(PAGE_HREF))) return line;
    return {
      ...line,
      segments: line.segments.map((seg) => {
        if (!seg.href?.startsWith(PAGE_HREF)) return seg;
        const { href, ...rest } = seg;
        return { ...rest, pageLink: Number(href.slice(PAGE_HREF.length)) };
      }),
    };
  });
}

/** Measure one block of an expanded `:::index` (see the module header). */
export function measureIndexBlock(
  rawBlock: ContentBlock,
  columnWidth: number,
  ctx: BlockMeasureContext,
): MeasuredContentBlock | null {
  const info = rawBlock.index!;
  const { resolved, bodyOffset } = ctx;
  const cfg = resolved.index;
  const dpi = resolved.page.dpi;
  const body = resolved.bodyText;
  const fontSizePx = dimensionToPx(cfg.fontSize, dpi);
  const lineHeightPx = lineHeightPxOf(cfg.lineHeight, fontSizePx, dpi);
  const weight = cfg.fontWeight.toString();
  const boldWeight = Math.max(cfg.fontWeight, body.boldFontWeight).toString();
  const fontString = buildFontString(cfg.fontFamily, fontSizePx, weight);
  const boldFontString = buildFontString(cfg.fontFamily, fontSizePx, boldWeight);
  const italicFontString = buildFontString(cfg.fontFamily, fontSizePx, weight, 'italic');
  const boldItalicFontString = buildFontString(cfg.fontFamily, fontSizePx, boldWeight, 'italic');
  const color = cfg.color.hex;
  const topLevel = info.leads?.[0]?.level ?? info.level;
  const marginTop = info.groupStart ? cfg.groups.marginTop : topLevel === 0 ? cfg.entrySpacing : undefined;
  const style: BlockStyle = {
    fontString, boldFontString, italicFontString, boldItalicFontString,
    fontSizePx, lineHeightPx, color, boldColor: color, italicColor: color,
    textAlign: 'left', hyphenate: false,
    marginTopPx: marginTop ? dimensionToPx(marginTop, dpi, fontSizePx) : 0,
    marginBottomPx: 0,
    firstLineIndentPx: 0, hangingIndent: false,
  };

  const turnoverPx = dimensionToPx(cfg.turnoverIndent, dpi, fontSizePx);
  /** The lines of one entry at its level's indent, turnover lines hung. */
  const entryLines = (written: InlineSpan[], level: number): VDTLine[] => {
    // A book title in a term takes the document's book-title mark (#193).
    const spans = bookTitlesAsConfigured(written, resolved.cjk);
    const indentPx = level * dimensionToPx(cfg.indent, dpi, fontSizePx);
    const measured = measureRichBlock(
      spans, fontString, boldFontString, italicFontString, boldItalicFontString,
      Math.max(1, columnWidth - indentPx), lineHeightPx,
      { textAlign: 'left', hyphenate: false, firstLineIndentPx: turnoverPx, hangingIndent: true },
    );
    const out = pageLinks(linkSegments(measured.lines, spans));
    for (const line of out) line.bbox.x += indentPx;
    // Where the entry starts, for renditions that set it as text of its
    // own (`VDTLine.indexLevel`).
    if (out[0]) out[0].indexLevel = level;
    return out;
  };
  const own = entryLines(rawBlock.spans, info.level);
  if (own.length === 0) return null;
  // The entries this one's first line heads (see `leads`), above it.
  const lines = [...(info.leads ?? []).flatMap((lead) => entryLines(lead.spans, lead.level)), ...own];

  if (info.group) {
    // The letter head: a line of its own above the entry, in the head's
    // face, on the entry's line pitch.
    const g = cfg.groups;
    const headSizePx = dimensionToPx(g.fontSize, dpi);
    const headFont = buildFontString(g.fontFamily, headSizePx, g.fontWeight.toString(), g.italic ? 'italic' : 'normal');
    const head = measureRichBlock(
      [{ text: info.group, bold: false, italic: false }], headFont, headFont, headFont, headFont,
      Math.max(1, columnWidth), lineHeightPx, { textAlign: 'left', hyphenate: false },
    );
    const headLine = head.lines[0];
    if (headLine) {
      for (const seg of segmentsOf(headLine)) {
        if (seg.kind === 'space') continue;
        seg.fontString = headFont;
        seg.color = g.color.hex;
      }
      headLine.isLastLine = false;
      lines.unshift(headLine);
    }
  }
  // Uniform line pitch: the placement loop re-seats every line at the
  // block's line height (`resetLinePositions`).
  const finalMeasured = { lines, totalHeight: lines.length * lineHeightPx };
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(finalMeasured, rawBlock, rawBlock, bodyOffset);
  return {
    kind: { style, vdtType: 'paragraph', contentBlock: rawBlock, bulletXOffsetInColumn: 0, strikethroughText: false },
    contentBlock: rawBlock,
    measured: finalMeasured,
    prefixLen,
    absoluteSourceMap,
  };
}

/**
 * The page of each index mark of `blocks` (the parsed markdown body) in the
 * laid-out `doc`: the page of the line holding the character the mark is
 * attached to (`IndexMark.anchor`), found by the lines' source ranges.
 * When no line holds it (the character set by a design, not a line), the
 * mark takes the nearest line before it (`attach: 'before'`) or after it.
 * Undefined when the document has no marks.
 */
export function locateIndexMarks(
  doc: VDTDocument,
  blocks: readonly ContentBlock[],
  bodyOffset: number,
): { sourceStart: number; pageIndex: number }[] | undefined {
  const marks = blocks.flatMap((b) => b.indexMarks ?? []);
  if (marks.length === 0) return undefined;
  const lines: { start: number; end: number; page: number }[] = [];
  const add = (b: VDTBlock): void => {
    if (b.pageIndex < 0 || b.hidden) return;
    for (const l of b.lines) {
      if (l.sourceStart !== undefined && l.sourceEnd !== undefined) lines.push({ start: l.sourceStart, end: l.sourceEnd, page: b.pageIndex });
    }
  };
  for (const b of doc.blocks) add(b);
  for (const page of doc.pages) for (const f of page.floats ?? []) add(f);
  if (lines.length === 0) return [];
  lines.sort((a, b) => a.start - b.start || a.page - b.page);
  /** Index of the last line starting at or before `at` (-1: none). */
  const lastAtOrBefore = (at: number): number => {
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid]!.start <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  };
  const out: { sourceStart: number; pageIndex: number }[] = [];
  for (const mark of marks) {
    if (mark.anchor < 0) continue;
    const at = mark.anchor + bodyOffset;
    const i = lastAtOrBefore(at);
    // A line holding the character: the first page one does.
    let page: number | undefined;
    for (let j = i; j >= 0 && j > i - 64; j--) {
      const line = lines[j]!;
      if (at >= line.start && at < line.end && (page === undefined || line.page < page)) page = line.page;
    }
    if (page === undefined) {
      const line = mark.attach === 'before' ? lines[i] ?? lines[i + 1] : lines[i + 1] ?? lines[i];
      page = line?.page;
    }
    if (page !== undefined) out.push({ sourceStart: mark.sourceStart, pageIndex: page });
  }
  return out;
}
