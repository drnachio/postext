/**
 * Citations in the build (#268–#272, #277): each citation span is formatted
 * by the registered processor against its book's context and replaced by
 * its text — linked to its bibliography entry — or, under a note style, by
 * a footnote marker whose note holds it; `:::bibliography` (or the end of
 * the book) receives the list of works; `:::references` blocks leave the
 * flow. A citation the book has no reference for prints as written.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import { FOOTNOTE_PLACEHOLDER } from '../parse/inlineFormatting';
import type { Dimension } from '../types';
import type { ResolvedConfig } from '../vdt';
import type { ResolvedParagraphStyleConfig } from '../types';
import { blockResourceIds, type CitationContext } from '../citations/context';
import { citationEngine } from '../citations/registry';
import type { BibliographyEntryOutput, CitationClusterInput, CitationProcessor, CslItem, CslName } from '../citations/types';
import { isEtAlName } from '../citations/bibtex';
import { htmlToSpans, decodeEntities } from '../citations/html';
import { languageOf, stringsFor } from '../locale';
import { affixRichText, affixSpans } from '../parse/citations';

/** Id of the paragraph style the bibliography is set in. */
export const BIBLIOGRAPHY_STYLE_ID = '__postext-bibliography';
/** Prefix of the anchor of a bibliography entry: `ref-<key>`, as Pandoc
 *  names it. */
export const BIBLIOGRAPHY_ANCHOR_PREFIX = 'ref-';
/** Prefix of the footnote a note style sets a citation in. */
export const CITATION_NOTE_PREFIX = '__cite-';
/** Container ids of the bibliography (clear of the parser's and of the
 *  chapter-end notes'). */
const BIBLIOGRAPHY_CONTAINER_BASE = 2_000_000;
/** Ids of the warichu notes citations are set in (clear of the parser's). */
const WARICHU_ID_BASE = 1_000_000;

const BIBLIOGRAPHY_TITLES: Readonly<Record<string, string>> = {
  en: 'References', es: 'Referencias', fr: 'Références', de: 'Literatur', it: 'Bibliografia', pt: 'Referências',
  ca: 'Referències', nl: 'Literatuur', 'zh-hans': '参考文献', 'zh-hant': '參考文獻', ja: '参考文献',
  ar: 'المراجع',
};

/** The title a bibliography takes in a document language. */
export function defaultBibliographyTitle(locale: unknown): string {
  return stringsFor(BIBLIOGRAPHY_TITLES, locale);
}

/** The CSL locale citations are written in: the configured one, else the
 *  document language (`es` → `es-ES`, `zh-Hant` → `zh-TW`, `ar-EG` →
 *  `ar`, `ja` → `ja-JP`). */
export function citationLocale(resolved: ResolvedConfig, documentLocale: string | undefined): string {
  if (resolved.citations.locale) return resolved.citations.locale;
  const tag = (documentLocale ?? 'en-US').replace(/_/g, '-');
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  // One CSL locale serves every Arabic tag (`ar-EG`, `ar-MA`…), and one
  // every Japanese one (`ja`, `ja-Jpan`…, #426).
  if (languageOf(lower) === 'ar') return 'ar';
  if (languageOf(lower) === 'ja') return 'ja-JP';
  if (lower === 'en' || lower === 'en-us') return 'en-US';
  return tag;
}

/** What processing a book's citations gives. */
export interface ProcessedCitations {
  processor: CitationProcessor;
  /** Formatted spans of each cluster of the context (undefined: no known
   *  work in it). */
  formatted: (InlineSpan[] | undefined)[];
  /** The keys of each cluster no reference defines. */
  unknown: string[][];
  /** The first known work of each cluster: where its link goes. */
  target: (string | undefined)[];
  /** Every work the bibliography lists for the whole book, in order. */
  entries: BibliographyEntryOutput[];
  /** With `citations.numbering: 'chapter'` (#537): each chapter's list
   *  (the works it cites, labelled with its own numbers), by the chapter
   *  index of `CitationContext.chapters`. */
  chapterEntries?: ReadonlyMap<number, BibliographyEntryOutput[]>;
  numbered: boolean;
  hangingIndent: boolean;
  labelColumn: boolean;
}

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
const ARABIC = /\p{sc=Arabic}/u;
const isCjkItem = (item: CslItem | undefined): boolean =>
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
function markerSpans(
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
function narrativeName(item: CslItem | undefined, locale: string, terms: CitationProcessor['terms']): string {
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

const memo: { key: string; value: ProcessedCitations | null }[] = [];

/**
 * Format every citation of a book and its bibliography (memoised by the
 * context and the settings: the chapters of a book share one run). Null
 * without a citation engine, or with no reference at all.
 */
export function processCitations(ctx: CitationContext, resolved: ResolvedConfig, locale: string): ProcessedCitations | null {
  const engine = citationEngine();
  if (!engine || ctx.items.length === 0) return null;
  const cfg = resolved.citations;
  const style = cfg.style === 'custom' && cfg.customStyle ? cfg.customStyle : cfg.style;
  // Each chapter on its own (#537): its citations processed apart, so a
  // numbered style numbers them from 1.
  const byChapter = cfg.numbering === 'chapter' && ctx.chapters !== undefined && ctx.chapters.length === ctx.clusters.length;
  const key = JSON.stringify([ctx.items, ctx.nocite, ctx.clusters, byChapter ? ctx.chapters : null, style, locale, cfg.marker, cfg.collapseRanges, cfg.notes, cfg.bibliography.doi, cfg.bibliography.includeUncited, cfg.bibliography.groupByLanguage]);
  const hit = memo.find((m) => m.key === key);
  if (hit) return hit.value;
  let value: ProcessedCitations | null = null;
  try {
    // `doi: 'hide'` leaves DOIs and URLs out of everything printed.
    const items = cfg.bibliography.doi === 'hide'
      ? ctx.items.map(({ DOI: _d, URL: _u, ...rest }) => rest as CslItem)
      : ctx.items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const processor = engine.createProcessor({ style, locale, items, collapseRanges: cfg.collapseRanges, unnumberedNotes: cfg.notes === 'warichu' });
    const clusters = ctx.clusters.map((c) => ({ ...c, noteIndex: processor.kind === 'note' ? c.noteIndex ?? 0 : 0 }));
    // Affixes reach the processor as CSL rich text: their Markdown
    // emphasis as `<i>`/`<b>` (#528).
    const rich = clusters.map((c) => (c.items.some((it) => it.prefix || it.suffix)
      ? { ...c, items: c.items.map((it) => ({ ...it, ...(it.prefix ? { prefix: affixRichText(it.prefix) } : {}), ...(it.suffix ? { suffix: affixRichText(it.suffix) } : {}) })) }
      : c));
    /** A list as the settings print it. */
    const shaped = (list: BibliographyEntryOutput[]): BibliographyEntryOutput[] => {
      let out = list;
      // A numbered list is in the order of its numbers: grouping by
      // language would set [3] before [1].
      if (cfg.bibliography.groupByLanguage && !processor.numeric) {
        out = [...out.filter((e) => isCjkItem(byId.get(e.id))), ...out.filter((e) => !isCjkItem(byId.get(e.id)))];
      }
      if (cfg.bibliography.doi === 'text') out = out.map((e) => ({ ...e, html: e.html.replace(/<\/?a\b[^>]*>/g, '') }));
      return out;
    };
    const override = processor.numeric && cfg.marker !== 'style' && processor.kind === 'in-text';
    const formatted: (InlineSpan[] | undefined)[] = new Array(clusters.length).fill(undefined);
    // The clusters of each chapter (one group of them all, numbered through
    // the book, unless `numbering: 'chapter'`).
    const groups = new Map<number, number[]>();
    clusters.forEach((_, i) => {
      const g = byChapter ? ctx.chapters![i]! : 0;
      const list = groups.get(g);
      if (list) list.push(i);
      else groups.set(g, [i]);
    });
    const chapterEntries = new Map<number, BibliographyEntryOutput[]>();
    let bib: ReturnType<CitationProcessor['bibliography']> | undefined;
    for (const [chapter, indexes] of groups) {
      const html = processor.cite(indexes.map((i) => rich[i]!));
      const numbers = processor.citationNumbers();
      indexes.forEach((i, j) => {
        const c = clusters[i]!;
        const known = c.items.filter((it) => byId.has(it.id));
        if (known.length === 0) return;
        if (override) {
          const narrative = c.mode === 'narrative' ? known.map((it) => narrativeName(byId.get(it.id), locale, processor.terms)).filter(Boolean).join('; ') : undefined;
          formatted[i] = markerSpans(c, numbers, byId, resolved, narrative, { bold: false, italic: false }, locale);
        } else {
          formatted[i] = htmlToSpans(html[j] ?? '');
        }
      });
      if (byChapter) {
        bib = processor.bibliography([...new Set(indexes.flatMap((i) => clusters[i]!.items.map((it) => it.id)))].filter((id) => byId.has(id)));
        chapterEntries.set(chapter, shaped(bib.entries));
      }
    }
    const listedIds = cfg.bibliography.includeUncited || ctx.nocite.includes('*')
      ? items.map((i) => i.id)
      : [...new Set([...clusters.flatMap((c) => c.items.map((it) => it.id)), ...ctx.nocite])].filter((id) => byId.has(id));
    let entries: BibliographyEntryOutput[];
    if (byChapter) {
      // The book's list: every chapter's entries, a work at its first
      // chapter, then the works no chapter cites (`nocite`).
      const seen = new Set<string>();
      entries = [...chapterEntries.values()].flat().filter((e) => !seen.has(e.id) && seen.add(e.id));
      const rest = listedIds.filter((id) => !seen.has(id));
      if (rest.length > 0 || !bib) {
        bib = processor.bibliography(rest);
        entries = [...entries, ...shaped(bib.entries).filter((e) => !seen.has(e.id))];
      }
    } else {
      bib = processor.bibliography(listedIds);
      entries = shaped(bib.entries);
    }
    value = {
      processor,
      formatted,
      unknown: clusters.map((c) => c.items.filter((it) => !byId.has(it.id)).map((it) => it.id)),
      target: clusters.map((c) => c.items.find((it) => byId.has(it.id))?.id),
      entries,
      ...(byChapter ? { chapterEntries } : {}),
      numbered: processor.numeric,
      hangingIndent: bib!.hangingIndent || !bib!.labelColumn,
      labelColumn: bib!.labelColumn,
    };
  } catch {
    value = null;
  }
  memo.unshift({ key, value });
  if (memo.length > 4) memo.pop();
  return value;
}

/** A length in body `em` as a length in the body size's unit. */
function inBody(resolved: ResolvedConfig, d: Dimension): Dimension {
  const body = resolved.bodyText;
  return d.unit === 'em' || d.unit === 'rem' ? { value: d.value * body.fontSize.value, unit: body.fontSize.unit } : d;
}

/** The paragraph style of the bibliography: body face at the configured
 *  size, the turnover lines hung under the first (by the label column for
 *  a numbered list). `labelChars`: the longest label's length. */
export function bibliographyParagraphStyle(resolved: ResolvedConfig, labelChars: number): ResolvedParagraphStyleConfig {
  const b = resolved.citations.bibliography;
  const body = resolved.bodyText;
  const fontSize = inBody(resolved, b.fontSize);
  const hanging: Dimension = labelChars > 0
    ? b.labelWidth ?? { value: labelChars * 0.6 + 0.8, unit: 'em' }
    : b.hangingIndent;
  return {
    id: BIBLIOGRAPHY_STYLE_ID,
    name: BIBLIOGRAPHY_STYLE_ID,
    fontFamily: body.fontFamily,
    fontSize,
    lineHeight: b.lineHeight ?? body.lineHeight,
    color: body.color,
    textAlign: 'left',
    ...(body.boldColor ? { boldColor: body.boldColor } : {}),
    ...(body.italicColor ? { italicColor: body.italicColor } : {}),
    fontWeight: body.fontWeight,
    boldFontWeight: body.boldFontWeight,
    italic: false,
    smallCaps: false,
    hyphenation: body.hyphenation.enabled,
    indent: { value: 0, unit: 'em' },
    firstLineIndent: { value: 0, unit: 'em' },
    hangingIndent: hanging,
    spaceBetween: b.entrySpacing,
    marginTop: { value: 0.5, unit: 'em' },
    marginBottom: { value: 0, unit: 'em' },
    snapToGrid: false,
    textTransform: 'none',
  };
}

/** The configuration with the bibliography's paragraph style added. */
export function withBibliographyStyle(resolved: ResolvedConfig, labelChars: number): ResolvedConfig {
  if (resolved.paragraphStyles.some((s) => s.id === BIBLIOGRAPHY_STYLE_ID)) return resolved;
  return { ...resolved, paragraphStyles: [...resolved.paragraphStyles, bibliographyParagraphStyle(resolved, labelChars)] };
}

/** A warning about the citations of a document (see `ContentWarning`). */
export interface CitationIssue {
  kind: 'unknownCitationKey' | 'citationsUnavailable' | 'referencesUnreadable';
  key?: string;
  message?: string;
  sourceStart: number;
  sourceEnd: number;
}

/** Which works a list prints: all the book's (`'book'`), the chapter's
 *  (`'chapter'`), or those cited so far in the document that no list
 *  before it printed (`'new'`, `:::bibliography{scope=new}`, #534). */
type BibliographyScope = 'book' | 'chapter' | 'new';

/** What {@link applyCitations} gives the build. */
export interface AppliedCitations {
  blocks: ContentBlock[];
  /** The longest bibliography label, in characters (0: unnumbered or no
   *  bibliography): sizes the label column. */
  labelChars: number;
  /** A bibliography was set in this document. */
  bibliography: boolean;
  /** The formatted citations of the captions and notes of the resources
   *  this document places (#529), by resource id: one entry per citation
   *  in the caption's (the note's) text, undefined for one that prints as
   *  written. Set plain: the caption's emphasis goes on when it is laid
   *  out (see `resolveCitationSpans`). */
  captions: Map<string, CaptionCitations>;
}

/** The formatted citations of a resource's caption and note. */
export interface CaptionCitations {
  caption: (InlineSpan[] | undefined)[];
  note: (InlineSpan[] | undefined)[];
}

/** `spans` with each citation span replaced by its formatted text from
 *  `formatted`, in order, with the emphasis of the text around it; a
 *  citation with none prints as written. */
export function resolveCitationSpans(spans: InlineSpan[], formatted: readonly (InlineSpan[] | undefined)[] | undefined): InlineSpan[] {
  if (!spans.some((s) => s.citation)) return spans;
  let k = 0;
  return spans.flatMap((span) => {
    if (!span.citation) return [span];
    const text = formatted?.[k++];
    if (!text) return [plain(span.citation.raw, span)];
    return text.map((s) => ({ ...s, bold: s.bold || span.bold, italic: s.italic !== span.italic, ...(span.smallCaps ? { smallCaps: true } : {}) }));
  });
}

/** A Chinese mark that ends a clause or a sentence, at the start of a text. */
const CLOSING_CJK = /^[，。、；：！？）」』】》〕]/u;

/** `spans` without the full stop that ends them. */
function withoutFinalStop(spans: InlineSpan[]): InlineSpan[] {
  const last = spans[spans.length - 1];
  if (!last || !last.text.endsWith('.')) return spans;
  const text = last.text.slice(0, -1);
  const links = last.links?.map((l) => ({ ...l, end: Math.min(l.end, text.length) })).filter((l) => l.end > l.start);
  const trimmed: InlineSpan = { ...last, text, ...(last.links ? { links } : {}) };
  return [...spans.slice(0, -1), ...(text.length > 0 ? [trimmed] : [])];
}

/** The spans of a plain text with the emphasis of the text around it. */
function plain(text: string, base: InlineSpan): InlineSpan {
  return { text, bold: base.bold, italic: base.italic, ...(base.smallCaps ? { smallCaps: true } : {}) };
}

/** `spans` linked to `href`, each over its whole text. */
function linked(spans: InlineSpan[], href: string): InlineSpan[] {
  return spans.map((s) => (s.links && s.links.length > 0 ? s : { ...s, links: [{ start: 0, end: s.text.length, href }] }));
}

/** A block whose spans are `spans`, its plain text and source map rebuilt:
 *  each span replacing a citation placeholder takes the placeholder's
 *  source offset for every character. */
function withSpans(block: ContentBlock, replace: Map<number, InlineSpan[]>, dropLead: ReadonlySet<number> = new Set()): ContentBlock {
  const spans: InlineSpan[] = [];
  const sourceMap: number[] = [];
  let at = 0;
  block.spans.forEach((span, i) => {
    const repl = replace.get(i);
    const src = block.sourceMap.slice(at, at + span.text.length);
    at += span.text.length;
    if (!repl && dropLead.has(i)) {
      if (span.text.length > 1) spans.push({ ...span, text: span.text.slice(1) });
      sourceMap.push(...src.slice(1));
      return;
    }
    if (!repl) {
      spans.push(span);
      sourceMap.push(...src);
      return;
    }
    const origin = src[0] ?? block.sourceStart;
    for (const r of repl) {
      spans.push(r);
      for (let k = 0; k < r.text.length; k++) sourceMap.push(origin);
    }
  });
  sourceMap.push(...block.sourceMap.slice(at));
  const merged = mergePlainSpans(spans);
  return { ...block, spans: merged, text: merged.map((s) => s.text).join(''), sourceMap };
}

/** Whether a span is plain text: emphasis and small capitals at most. */
function isPlain(s: InlineSpan): boolean {
  return Object.keys(s).every((k) => k === 'text' || k === 'bold' || k === 'italic' || k === 'smallCaps');
}

/** Adjacent plain spans of one emphasis joined, so a citation printed back
 *  as written leaves the spans as they were without the citation syntax. */
function mergePlainSpans(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && isPlain(last) && isPlain(s) && last.bold === s.bold && last.italic === s.italic && (last.smallCaps ?? false) === (s.smallCaps ?? false)) {
      out[out.length - 1] = { ...last, text: last.text + s.text };
    } else {
      out.push(s);
    }
  }
  return out;
}

/**
 * Format the citations of a document's blocks, set its bibliography and
 * drop its `:::references` blocks. `ctx` places the document in its book;
 * `processed` is the book's formatted citations (null: none can be
 * formatted, and every citation prints as written).
 */
export function applyCitations(
  blocks: readonly ContentBlock[],
  ctx: CitationContext,
  processed: ProcessedCitations | null,
  resolved: ResolvedConfig,
  locale: string | undefined,
): AppliedCitations {
  const cfg = resolved.citations;
  const note = processed?.processor.kind === 'note';
  const warichu = note && cfg.notes === 'warichu';
  const out: ContentBlock[] = [];
  const notes: ContentBlock[] = [];
  let k = 0;
  const citedHere = new Set<string>();
  /** Every work this document has cited so far, and those a list has
   *  printed (`scope=new`, #534). */
  const citedSoFar = new Set<string>();
  const printed = new Set<string>();
  /** The chapter (`CitationContext.chapters`) of the last citation read. */
  let chapterAt: number | undefined;
  /** Cluster `g`, formatted, read here: its works counted. */
  const counted = (g: number): void => {
    for (const it of ctx.clusters[g]?.items ?? []) {
      citedHere.add(it.id);
      citedSoFar.add(it.id);
    }
    chapterAt = ctx.chapters?.[g] ?? chapterAt;
  };
  let bibliographySet = false;
  let labelChars = 0;
  let containerSeq = 0;
  const listedIds = new Set(processed?.entries.map((e) => e.id) ?? []);
  const itemsById = new Map(ctx.items.map((i) => [i.id, i]));
  const willList = (id: string | undefined): boolean => id !== undefined && listedIds.has(id) && (cfg.bibliography.auto || ctx.placed);
  /** The printed text of cluster `g` with the emphasis of `span` (the
   *  citation's span), linked to its entry; undefined when it prints as
   *  written. */
  const formattedText = (g: number | undefined, span: InlineSpan): InlineSpan[] | undefined => {
    const spans = g !== undefined ? processed?.formatted[g] : undefined;
    if (g === undefined || !spans) return undefined;
    const target = processed!.target[g];
    const href = cfg.link && willList(target) ? `#${BIBLIOGRAPHY_ANCHOR_PREFIX}${target}` : undefined;
    // The citation takes the emphasis of the text around it.
    const styled = spans.map((s) => ({ ...s, bold: s.bold || span.bold, italic: s.italic !== span.italic, ...(span.smallCaps ? { smallCaps: true } : {}) }));
    const linkedText = href ? linked(styled, href) : styled;
    // A key no reference defines, in a citation of several works: set in
    // bold after it, as written, so the missing work shows on the page
    // and not only among the warnings.
    const missing = processed!.unknown[g] ?? [];
    return missing.length > 0
      ? [...linkedText, plain(' ', span), { ...plain(missing.map((id) => `@${id}`).join('; '), span), bold: true }]
      : linkedText;
  };
  // Captions and notes (#529): formatted in the text's way (a note style
  // sets them in the caption too: a caption takes no note), their works
  // counted where the block that places the resource is read.
  const captions = new Map<string, CaptionCitations>();
  const captionIds = new Set(Object.keys(ctx.captions ?? {}));
  const captionAnchors = (block: ContentBlock): void => {
    if (captionIds.size === 0) return;
    for (const id of blockResourceIds(block, (rid) => captionIds.has(rid))) {
      const at = ctx.captions?.[id];
      if (!at || captions.has(id)) continue;
      const base: InlineSpan = { text: '', bold: false, italic: false };
      for (const g of [...at.caption, ...at.note]) {
        if (processed?.formatted[g]) counted(g);
      }
      captions.set(id, { caption: at.caption.map((g) => formattedText(g, base)), note: at.note.map((g) => formattedText(g, base)) });
    }
  };

  const bibliographyBlocks = (at: number, scope: BibliographyScope, title: string | undefined): ContentBlock[] => {
    if (!processed) return [];
    // Numbered by chapter (#537), a chapter's list takes its own labels.
    const pool = scope !== 'book' && processed.chapterEntries && chapterAt !== undefined
      ? processed.chapterEntries.get(chapterAt) ?? processed.entries
      : processed.entries;
    const entries = scope === 'chapter'
      ? pool.filter((e) => citedHere.has(e.id))
      // The works cited so far that no list before printed (#534).
      : scope === 'new' ? pool.filter((e) => citedSoFar.has(e.id) && !printed.has(e.id)) : pool;
    for (const e of entries) printed.add(e.id);
    if (entries.length === 0) return [];
    bibliographySet = true;
    const alignRight = cfg.bibliography.labelAlign === 'right';
    const id = BIBLIOGRAPHY_CONTAINER_BASE + containerSeq++;
    const base = { sourceStart: at, sourceEnd: at, sourceMap: [] as number[] };
    const blocksOut: ContentBlock[] = [
      { ...base, type: 'containerStart', text: '', spans: [], containerName: 'paragraphs', containerAttrs: { style: BIBLIOGRAPHY_STYLE_ID }, containerId: id },
    ];
    // Unset: the document language's word; blank: no title.
    const heading = (title ?? defaultBibliographyTitle(locale)).trim();
    if (heading.length > 0) {
      blocksOut.push({ ...base, type: 'paragraph', text: heading, spans: [{ text: heading, bold: true, italic: false }], sourceMap: new Array<number>(heading.length).fill(at) });
    }
    for (const entry of entries) {
      const body = htmlToSpans(entry.html);
      const label = entry.label ? decodeEntities(entry.label.replace(/<[^>]*>/g, '')) : undefined;
      if (label) labelChars = Math.max(labelChars, [...label].length);
      // The label in a column of its own (#290): the en space after it is
      // widened when the entry is measured, so every entry's text starts
      // where its turnover lines do; a right-aligned label is pushed
      // against that space by one before it. The label stays in the text.
      const spans: InlineSpan[] = label
        ? [
          ...(alignRight ? [{ text: ' ', bold: false, italic: false, labelTab: 'lead' as const }] : []),
          { text: label, bold: false, italic: false },
          { text: ' ', bold: false, italic: false, labelTab: 'gap' as const },
          ...body,
        ]
        : body;
      const text = spans.map((s) => s.text).join('');
      blocksOut.push({ ...base, type: 'paragraph', text, spans, sourceMap: new Array<number>(text.length).fill(at), bibEntry: entry.id });
    }
    blocksOut.push({ ...base, type: 'containerEnd', text: '', spans: [], containerName: 'paragraphs', containerId: id });
    return blocksOut;
  };

  const chapterScope = cfg.bibliography.scope === 'chapter';
  const autoChapter = chapterScope && cfg.bibliography.auto && processed !== null;
  /** Whether the chapter being read has set its list itself. */
  let chapterListed = false;
  for (const block of blocks) {
    if (block.type === 'directive' && block.directiveName === 'references') continue;
    if (block.type === 'directive' && block.directiveName === 'bibliography') {
      const scopeAttr = block.directiveAttrs?.scope;
      const scope = scopeAttr === 'chapter' || scopeAttr === 'book' || scopeAttr === 'new' ? scopeAttr : cfg.bibliography.scope;
      out.push(...bibliographyBlocks(block.sourceStart, scope, block.directiveAttrs?.title ?? cfg.bibliography.title));
      chapterListed = true;
      continue;
    }
    // A chapter list holds the works its chapter cites: a document of
    // several chapters starts each one afresh, the list of the one before
    // set ahead of its heading when nothing placed it.
    if (chapterScope && block.type === 'heading' && block.level === 1) {
      if (autoChapter && !chapterListed && citedHere.size > 0) out.push(...bibliographyBlocks(block.sourceStart, 'chapter', cfg.bibliography.title));
      citedHere.clear();
      chapterListed = false;
    }
    if (!block.spans.some((s) => s.citation)) {
      out.push(block);
      captionAnchors(block);
      continue;
    }
    const replace = new Map<number, InlineSpan[]>();
    const dropLead = new Set<number>();
    block.spans.forEach((span, i) => {
      if (!span.citation) return;
      const g = ctx.local[k++];
      const text = formattedText(g, span);
      if (g === undefined || !text) {
        // No reference: the citation prints as it was written.
        replace.set(i, [plain(span.citation.raw, span)]);
        return;
      }
      counted(g);
      if (note && block.footnoteDef === undefined) {
        // "As @howse1980 says": the sentence keeps the author's name, the
        // reference goes to the note.
        const who = span.citation.cluster.mode === 'narrative'
          ? span.citation.cluster.items.map((it) => narrativeName(itemsById.get(it.id), citationLocale(resolved, locale), processed!.processor.terms)).filter(Boolean).join('; ')
          : '';
        const name: InlineSpan[] = who ? [{ text: who, bold: span.bold, italic: span.italic }] : [];
        if (warichu) {
          // 夹注: the citation set as a two-row note inside the line.
          const w = { id: WARICHU_ID_BASE + g };
          // A Chinese mark after the note closes the sentence: the note's
          // own full stop goes ("…dlxb201501001，", not ".，").
          const after = block.spans[i + 1];
          const inNote = after && !after.citation && CLOSING_CJK.test(after.text) ? withoutFinalStop(text) : text;
          replace.set(i, [...name, ...inNote.map((s) => ({ ...s, warichu: w }))]);
          return;
        }
        // A note style: the citation goes into a note of its own.
        const id = `${CITATION_NOTE_PREFIX}${g}`;
        replace.set(i, [...name, { text: FOOTNOTE_PLACEHOLDER, bold: span.bold, italic: span.italic, footnote: { id } }]);
        const noteText = text.map((s) => s.text).join('');
        const origin = block.sourceMap[0] ?? block.sourceStart;
        notes.push({ type: 'paragraph', text: noteText, spans: text, footnoteDef: id, sourceStart: block.sourceStart, sourceEnd: block.sourceEnd, sourceMap: new Array<number>(noteText.length).fill(origin) });
        return;
      }
      replace.set(i, text);
      // A citation that ends a sentence brings its own full stop: the one
      // written after it goes ("See [@k, chap. 3]." prints one period).
      const next = block.spans[i + 1];
      if (next && !next.citation && next.text.startsWith('.') && !next.text.startsWith('..') && /\.$/.test(text.map((t) => t.text).join(''))) dropLead.add(i + 1);
    });
    out.push(withSpans(block, replace, dropLead));
    captionAnchors(block);
  }
  // Nothing places the list: it goes after the text (the book's last
  // document for a book-wide list).
  const auto = cfg.bibliography.auto && processed !== null
    && (chapterScope ? !chapterListed && citedHere.size > 0 : !ctx.placed && ctx.last);
  if (auto) {
    const at = blocks[blocks.length - 1]?.sourceEnd ?? 0;
    out.push(...bibliographyBlocks(at, cfg.bibliography.scope, cfg.bibliography.title));
  }
  return { blocks: [...out, ...notes], labelChars, bibliography: bibliographySet, captions };
}

/** The issues of a document's citations, for the content warnings. */
export function citationIssues(blocks: readonly ContentBlock[], ctx: CitationContext, bookKeys?: ReadonlySet<string>): CitationIssue[] {
  const out: CitationIssue[] = [];
  for (const issue of ctx.issues) out.push({ kind: 'referencesUnreadable', message: issue.message, sourceStart: issue.sourceStart, sourceEnd: issue.sourceEnd });
  const keys = bookKeys ?? new Set(ctx.items.map((i) => i.id));
  if (keys.size === 0) return out;
  const engine = citationEngine();
  let warnedEngine = false;
  for (const b of blocks) {
    let plainAt = 0;
    for (const s of b.spans) {
      if (s.citation) {
        const at = b.sourceMap[plainAt] ?? b.sourceStart;
        const range = { sourceStart: at, sourceEnd: at + s.citation.raw.length };
        if (!engine && !warnedEngine) {
          out.push({ kind: 'citationsUnavailable', ...range });
          warnedEngine = true;
        }
        // A bare `@name` naming no reference is likely text (a handle).
        if (s.citation.cluster.mode === 'parenthetical' || s.citation.raw.includes('[')) {
          for (const it of s.citation.cluster.items) if (!keys.has(it.id)) out.push({ kind: 'unknownCitationKey', key: it.id, ...range });
        }
      }
      plainAt += s.text.length;
    }
  }
  return out;
}
