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
import type { CitationContext } from '../citations/context';
import { citationEngine } from '../citations/registry';
import type { BibliographyEntryOutput, CitationClusterInput, CitationProcessor, CslItem } from '../citations/types';
import { htmlToSpans, decodeEntities } from '../citations/html';
import { stringsFor } from '../locale';

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
  ca: 'Referències', nl: 'Literatuur', 'zh-hans': '参考文献', 'zh-hant': '參考文獻',
};

/** The title a bibliography takes in a document language. */
export function defaultBibliographyTitle(locale: unknown): string {
  return stringsFor(BIBLIOGRAPHY_TITLES, locale);
}

/** The CSL locale citations are written in: the configured one, else the
 *  document language (`es` → `es-ES`, `zh-Hant` → `zh-TW`). */
export function citationLocale(resolved: ResolvedConfig, documentLocale: string | undefined): string {
  if (resolved.citations.locale) return resolved.citations.locale;
  const tag = (documentLocale ?? 'en-US').replace(/_/g, '-');
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
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
  numbered: boolean;
  hangingIndent: boolean;
  labelColumn: boolean;
}

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
const isCjkItem = (item: CslItem | undefined): boolean =>
  !!item && ((typeof item.language === 'string' && /^(zh|ja|ko)/i.test(item.language)) || CJK.test(String(item.title ?? '')));

/** Short locator words for a numbered marker the engine writes itself. */
const LOCATOR_WORDS: Readonly<Record<string, string>> = {
  page: 'p.', chapter: 'chap.', section: '§', figure: 'fig.', volume: 'vol.', note: 'n.', line: 'l.', paragraph: '¶', column: 'col.', verse: 'v.',
};

/** Numbers as a marker lists them: sorted, consecutive ones joined into a
 *  range when `collapse`. */
function numberList(numbers: number[], collapse: boolean): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (!collapse) return sorted.join(', ');
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : j === i + 1 ? `${sorted[i]}, ${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(', ');
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
  const label = single?.label ?? 'page';
  const word = chinese && label === 'page' ? '' : LOCATOR_WORDS[label] ?? '';
  const loc = single?.locator ? (word ? `${word}\u00a0${single.locator}` : single.locator) : '';
  const list = numberList(known.map((it) => numbers.get(it.id)!), cfg.collapseRanges);
  const span = (text: string, extra: Partial<InlineSpan> = {}): InlineSpan => ({ text, bold: base.bold, italic: base.italic, ...extra });
  const out: InlineSpan[] = [];
  if (narrative) out.push(span(cfg.marker === 'superscript' || cfg.marker === 'corner' ? narrative : `${narrative} `));
  switch (cfg.marker) {
    case 'parentheses':
      out.push(span(`(${list}${loc ? `, ${loc}` : ''})`));
      break;
    case 'superscript':
      out.push(span(`${list}${loc ? `(${loc})` : ''}`, { script: 'sup' }));
      break;
    case 'corner':
      out.push(span(`〔${list}〕${loc}`));
      break;
    default:
      out.push(span(`[${list}${loc ? `, ${loc}` : ''}]`));
  }
  return out;
}

/** Authors of a work for a narrative citation in a numbered style. */
function narrativeName(item: CslItem | undefined): string {
  const names = (item?.author ?? item?.editor ?? []) as { family?: string; literal?: string }[];
  if (names.length === 0) return '';
  const first = names[0]!.literal ?? names[0]!.family ?? '';
  const cjk = CJK.test(first);
  if (names.length === 1) return first;
  if (names.length === 2) return cjk ? `${first}、${names[1]!.literal ?? names[1]!.family ?? ''}` : `${first} & ${names[1]!.literal ?? names[1]!.family ?? ''}`;
  return cjk ? `${first}等` : `${first} et al.`;
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
  const key = JSON.stringify([ctx.items, ctx.nocite, ctx.clusters, style, locale, cfg.marker, cfg.collapseRanges, cfg.notes, cfg.bibliography.doi, cfg.bibliography.includeUncited, cfg.bibliography.groupByLanguage]);
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
    const html = processor.cite(clusters);
    const numbers = processor.citationNumbers();
    const listedIds = cfg.bibliography.includeUncited || ctx.nocite.includes('*')
      ? items.map((i) => i.id)
      : [...new Set([...clusters.flatMap((c) => c.items.map((it) => it.id)), ...ctx.nocite])].filter((id) => byId.has(id));
    const bib = processor.bibliography(listedIds);
    let entries = bib.entries;
    if (cfg.bibliography.groupByLanguage) {
      entries = [...entries.filter((e) => isCjkItem(byId.get(e.id))), ...entries.filter((e) => !isCjkItem(byId.get(e.id)))];
    }
    if (cfg.bibliography.doi === 'text') entries = entries.map((e) => ({ ...e, html: e.html.replace(/<\/?a\b[^>]*>/g, '') }));
    const override = processor.numeric && cfg.marker !== 'style' && processor.kind === 'in-text';
    value = {
      processor,
      formatted: clusters.map((c, i) => {
        const known = c.items.filter((it) => byId.has(it.id));
        if (known.length === 0) return undefined;
        if (override) {
          const narrative = c.mode === 'narrative' ? known.map((it) => narrativeName(byId.get(it.id))).filter(Boolean).join('; ') : undefined;
          return markerSpans(c, numbers, byId, resolved, narrative, { bold: false, italic: false }, locale);
        }
        return htmlToSpans(html[i] ?? '');
      }),
      unknown: clusters.map((c) => c.items.filter((it) => !byId.has(it.id)).map((it) => it.id)),
      target: clusters.map((c) => c.items.find((it) => byId.has(it.id))?.id),
      entries,
      numbered: processor.numeric,
      hangingIndent: bib.hangingIndent || !bib.labelColumn,
      labelColumn: bib.labelColumn,
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

/** What {@link applyCitations} gives the build. */
export interface AppliedCitations {
  blocks: ContentBlock[];
  /** The longest bibliography label, in characters (0: unnumbered or no
   *  bibliography): sizes the label column. */
  labelChars: number;
  /** A bibliography was set in this document. */
  bibliography: boolean;
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
  let bibliographySet = false;
  let labelChars = 0;
  let containerSeq = 0;
  const listedIds = new Set(processed?.entries.map((e) => e.id) ?? []);
  const itemsById = new Map(ctx.items.map((i) => [i.id, i]));
  const willList = (id: string | undefined): boolean => id !== undefined && listedIds.has(id) && (cfg.bibliography.auto || ctx.placed);

  const bibliographyBlocks = (at: number, scope: 'book' | 'chapter', title: string | undefined): ContentBlock[] => {
    if (!processed) return [];
    const entries = scope === 'chapter' ? processed.entries.filter((e) => citedHere.has(e.id)) : processed.entries;
    if (entries.length === 0) return [];
    bibliographySet = true;
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
      const spans: InlineSpan[] = label ? [{ text: `${label} `, bold: false, italic: false }, ...body] : body;
      const text = spans.map((s) => s.text).join('');
      blocksOut.push({ ...base, type: 'paragraph', text, spans, sourceMap: new Array<number>(text.length).fill(at), bibEntry: entry.id });
    }
    blocksOut.push({ ...base, type: 'containerEnd', text: '', spans: [], containerName: 'paragraphs', containerId: id });
    return blocksOut;
  };

  for (const block of blocks) {
    if (block.type === 'directive' && block.directiveName === 'references') continue;
    if (block.type === 'directive' && block.directiveName === 'bibliography') {
      const scopeAttr = block.directiveAttrs?.scope;
      const scope = scopeAttr === 'chapter' || scopeAttr === 'book' ? scopeAttr : cfg.bibliography.scope;
      out.push(...bibliographyBlocks(block.sourceStart, scope, block.directiveAttrs?.title ?? cfg.bibliography.title));
      continue;
    }
    if (!block.spans.some((s) => s.citation)) {
      out.push(block);
      continue;
    }
    const replace = new Map<number, InlineSpan[]>();
    const dropLead = new Set<number>();
    block.spans.forEach((span, i) => {
      if (!span.citation) return;
      const g = ctx.local[k++];
      const spans = g !== undefined ? processed?.formatted[g] : undefined;
      if (g === undefined || !spans) {
        // No reference: the citation prints as it was written.
        replace.set(i, [plain(span.citation.raw, span)]);
        return;
      }
      for (const it of span.citation.cluster.items) citedHere.add(it.id);
      const target = processed!.target[g];
      const href = cfg.link && willList(target) ? `#${BIBLIOGRAPHY_ANCHOR_PREFIX}${target}` : undefined;
      // The citation takes the emphasis of the text around it.
      const styled = spans.map((s) => ({ ...s, bold: s.bold || span.bold, italic: s.italic !== span.italic, ...(span.smallCaps ? { smallCaps: true } : {}) }));
      const text = href ? linked(styled, href) : styled;
      if (note && block.footnoteDef === undefined) {
        // "As @howse1980 says": the sentence keeps the author's name, the
        // reference goes to the note.
        const who = span.citation.cluster.mode === 'narrative'
          ? span.citation.cluster.items.map((it) => narrativeName(itemsById.get(it.id))).filter(Boolean).join('; ')
          : '';
        const name: InlineSpan[] = who ? [{ text: who, bold: span.bold, italic: span.italic }] : [];
        if (warichu) {
          // 夹注: the citation set as a two-row note inside the line.
          const w = { id: WARICHU_ID_BASE + g };
          replace.set(i, [...name, ...text.map((s) => ({ ...s, warichu: w }))]);
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
  }
  // Nothing places the list: it goes after the text (the book's last
  // document for a book-wide list).
  const auto = cfg.bibliography.auto && processed !== null
    && (cfg.bibliography.scope === 'chapter' ? !out.some((b) => b.bibEntry !== undefined) && citedHere.size > 0 : !ctx.placed && ctx.last);
  if (auto) {
    const at = blocks[blocks.length - 1]?.sourceEnd ?? 0;
    out.push(...bibliographyBlocks(at, cfg.bibliography.scope, cfg.bibliography.title));
  }
  return { blocks: [...out, ...notes], labelChars, bibliography: bibliographySet };
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
