// Formatting a book's citations by the registered processor, the
// bibliography's ids, titles and paragraph style (#1278: split out of
// citations.ts).
import type { InlineSpan } from '../../../parse/index.js';
import type { Dimension, ResolvedParagraphStyleConfig } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { CitationContext } from '../../../citations/context.js';
import { citationEngine } from '../../../citations/registry.js';
import type { CitationProcessor, BibliographyEntryOutput, CslItem } from '../../../citations/types.js';
import { htmlToSpans } from '../../../citations/html.js';
import { stringsFor, languageOf } from '../../../hyphenation/locale.js';
import { affixRichText } from '../../../parse/citations.js';
import { isCjkItem, narrativeName, markerSpans } from './markers.js';

/** Id of the paragraph style the bibliography is set in. */
export const BIBLIOGRAPHY_STYLE_ID = '__postext-bibliography';
/** Prefix of the anchor of a bibliography entry: `ref-<key>`, as Pandoc
 *  names it. */
export const BIBLIOGRAPHY_ANCHOR_PREFIX = 'ref-';
/** Prefix of the footnote a note style sets a citation in. */
export const CITATION_NOTE_PREFIX = '__cite-';
/** Container ids of the bibliography (clear of the parser's and of the
 *  chapter-end notes'). */
export const BIBLIOGRAPHY_CONTAINER_BASE = 2_000_000;
/** Ids of the warichu notes citations are set in (clear of the parser's). */
export const WARICHU_ID_BASE = 1_000_000;

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
