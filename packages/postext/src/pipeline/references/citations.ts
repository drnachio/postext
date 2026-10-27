/**
 * Citations in the build (#268–#272, #277): each citation span is formatted
 * by the registered processor against its book's context and replaced by
 * its text — linked to its bibliography entry — or, under a note style, by
 * a footnote marker whose note holds it; `:::bibliography` (or the end of
 * the book) receives the list of works; `:::references` blocks leave the
 * flow. A citation the book has no reference for prints as written.
 */

import type { ContentBlock, InlineSpan } from '../../parse/index.js';
import { resolvedDirection } from '../config.js';
import { FOOTNOTE_PLACEHOLDER } from '../../parse/inlineFormatting.js';
import type { ResolvedConfig } from '../../vdt.js';
import { type CitationContext, blockResourceIds } from '../../citations/context.js';
import { citationEngine } from '../../citations/registry.js';
import { htmlToSpans, decodeEntities, stripTags } from '../../citations/html.js';
import { narrativeName } from './citations/markers.js';
import { type ProcessedCitations, BIBLIOGRAPHY_ANCHOR_PREFIX, BIBLIOGRAPHY_CONTAINER_BASE, BIBLIOGRAPHY_STYLE_ID, defaultBibliographyTitle, citationLocale, WARICHU_ID_BASE, CITATION_NOTE_PREFIX } from './citations/process.js';
import { isolated, linked, plain, CLOSING_CJK, withoutFinalStop, withSpans } from './citations/spans.js';

export { BIBLIOGRAPHY_STYLE_ID, BIBLIOGRAPHY_ANCHOR_PREFIX, CITATION_NOTE_PREFIX, defaultBibliographyTitle, citationLocale, processCitations, bibliographyParagraphStyle, withBibliographyStyle } from './citations/process.js';
export type { ProcessedCitations } from './citations/process.js';
export { resolveCitationSpans } from './citations/spans.js';

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
  const documentDirection = resolvedDirection(resolved);
  const listedIds = new Set(processed?.entries.map((e) => e.id) ?? []);
  const itemsById = new Map(ctx.items.map((i) => [i.id, i]));
  const willList = (id: string | undefined): boolean => id !== undefined && listedIds.has(id) && (cfg.bibliography.auto || ctx.placed);
  /** The printed text of cluster `g` with the emphasis of `span` (the
   *  citation's span), linked to its entry; undefined when it prints as
   *  written. */
  const formattedText = (g: number | undefined, span: InlineSpan, base: 'ltr' | 'rtl' = documentDirection, at = 0): InlineSpan[] | undefined => {
    const formatted = g !== undefined ? processed?.formatted[g] : undefined;
    if (g === undefined || !formatted) return undefined;
    // Set against the text it joins, the citation is an isolate (#667).
    const spans = isolated(formatted, base, at, span.direction);
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
      captions.set(id, { caption: at.caption.map((g, i) => formattedText(g, base, documentDirection, i)), note: at.note.map((g, i) => formattedText(g, base, documentDirection, i)) });
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
      // An entry in the other direction keeps its punctuation (#667).
      const body = isolated(htmlToSpans(entry.html), documentDirection, 0);
      const label = entry.label ? decodeEntities(stripTags(entry.label)) : undefined;
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
      // A note style sets the citation in a note, which runs as the
      // document does whatever the direction of the block that cites.
      const toNote = note && block.footnoteDef === undefined && !warichu;
      const text = formattedText(g, span, toNote ? documentDirection : block.direction ?? documentDirection, i);
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
