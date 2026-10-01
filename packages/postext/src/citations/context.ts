/**
 * The citations of a book (#272): every reference its documents define,
 * every citation in reading order, and where each document's citations
 * sit in that order. Numbering, disambiguation and *ibid.* see the whole
 * book, so each document is formatted against its book's context — the
 * host builds it once (`bookCitationContexts`) and hands each chapter its
 * own; a document laid out alone is a book of one.
 */

import type { ContentBlock } from '../parse';
import { extractFrontmatter } from '../frontmatter';
import { parseMarkdownMemo } from '../parse';
import type { CitationClusterInput, CslItem } from './types';
import { documentReferences, type ReferenceIssue } from './data';

/** A document's share of its book's citations. */
export interface CitationContext {
  /** Every reference of the book (the first definition of a key wins). */
  items: CslItem[];
  /** Keys the book lists without citing them (`'*'`: all). */
  nocite: string[];
  /** Every citation of the book in note order: reading order, a citation
   *  inside a footnote at its note's place. `noteIndex` is the note a
   *  note style sets it in. */
  clusters: CitationClusterInput[];
  /** The index in {@link clusters} of each citation of this document, in
   *  the order the document's spans hold them. */
  local: number[];
  /** Some document of the book places the bibliography (`:::bibliography`). */
  placed: boolean;
  /** This document is the book's last (the bibliography goes after it when
   *  nothing places it). */
  last: boolean;
  /** Problems with this document's reference data. */
  issues: ReferenceIssue[];
}

/** The citations of a parsed document, each with the note it sits in:
 *  `note` is the footnote id for a citation in a footnote's text. */
export function citationsOfBlocks(blocks: readonly ContentBlock[]): { cluster: CitationClusterInput; note?: string }[] {
  const out: { cluster: CitationClusterInput; note?: string }[] = [];
  for (const b of blocks) {
    for (const s of b.spans) {
      if (s.citation) out.push({ cluster: s.citation.cluster, ...(b.footnoteDef !== undefined ? { note: b.footnoteDef } : {}) });
    }
  }
  return out;
}

/** Whether a document has anything for the citations to do: a citation,
 *  a `:::references` or `:::bibliography` block, or references in its front
 *  matter. */
export function needsCitationContext(blocks: readonly ContentBlock[], metadata: Record<string, unknown> | object | undefined): boolean {
  if (metadata && Array.isArray((metadata as Record<string, unknown>).references)) return true;
  return blocks.some((b) => (b.type === 'directive' && (b.directiveName === 'references' || b.directiveName === 'bibliography')) || b.spans.some((s) => s.citation));
}

/** Whether the parsed content places a bibliography. */
export function hasBibliographyDirective(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'directive' && b.directiveName === 'bibliography');
}

/** One document of a book, parsed: its front matter and blocks. */
export interface CitationSource {
  metadata?: Record<string, unknown>;
  blocks: readonly ContentBlock[];
}

/** The parsed form of a document's markdown, for {@link bookCitationContexts}. */
export function citationSourceOf(markdown: string): CitationSource {
  const { metadata, content } = extractFrontmatter(markdown);
  return { metadata: metadata as Record<string, unknown>, blocks: parseMarkdownMemo(content) };
}

/**
 * The citation context of every document of a book, in order. Notes are
 * counted through the book: a footnote marker takes the next note the
 * first time its id is cited, a citation in the text takes a note of its
 * own (where a note style sets it), and a citation in a footnote's text
 * sits in that footnote's note.
 */
export function bookCitationContexts(sources: readonly CitationSource[]): CitationContext[] {
  const items: CslItem[] = [];
  const seen = new Set<string>();
  const nocite: string[] = [];
  const issues: ReferenceIssue[][] = [];
  for (const src of sources) {
    const data = documentReferences(src.metadata, src.blocks);
    for (const item of data.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    for (const k of data.nocite) if (!nocite.includes(k)) nocite.push(k);
    issues.push(data.issues);
  }
  // Note order: number the notes, then sort the citations by note.
  let note = 0;
  const entries: { cluster: CitationClusterInput; doc: number; order: number; noteIndex: number; seq: number }[] = [];
  let seq = 0;
  sources.forEach((src, doc) => {
    const noteOf = new Map<string, number>();
    const inNotes: { cluster: CitationClusterInput; note: string; order: number }[] = [];
    let order = 0;
    for (const b of src.blocks) {
      if (b.footnoteDef !== undefined) {
        for (const s of b.spans) if (s.citation) inNotes.push({ cluster: s.citation.cluster, note: b.footnoteDef, order: order++ });
        continue;
      }
      for (const s of b.spans) {
        if (s.footnote && !noteOf.has(s.footnote.id)) noteOf.set(s.footnote.id, ++note);
        if (s.citation) entries.push({ cluster: s.citation.cluster, doc, order: order++, noteIndex: ++note, seq: seq++ });
      }
    }
    for (const c of inNotes) entries.push({ cluster: c.cluster, doc, order: c.order, noteIndex: noteOf.get(c.note) ?? 0, seq: seq++ });
  });
  const sorted = [...entries].sort((a, b) => a.doc - b.doc || a.noteIndex - b.noteIndex || a.seq - b.seq);
  const clusters = sorted.map((e) => ({ ...e.cluster, noteIndex: e.noteIndex }));
  const placed = sources.some((s) => hasBibliographyDirective(s.blocks));
  return sources.map((_, doc) => {
    const mine = sorted.map((e, i) => ({ e, i })).filter(({ e }) => e.doc === doc).sort((a, b) => a.e.order - b.e.order);
    return {
      items,
      nocite,
      clusters,
      local: mine.map(({ i }) => i),
      placed,
      last: doc === sources.length - 1,
      issues: issues[doc] ?? [],
    };
  });
}

/** A fingerprint of a context's book-wide part: what a chapter's citations
 *  and bibliography depend on (a host compares it to know a chapter's
 *  layout went stale). */
export function citationContextKey(ctx: CitationContext | undefined): string {
  if (!ctx) return '';
  return JSON.stringify([ctx.items, ctx.nocite, ctx.clusters, ctx.local, ctx.placed, ctx.last]);
}
