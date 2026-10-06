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
import { snippetCitations } from '../parse/inlineSnippet';
import { resourceRefId } from '../pipeline/crossRefs';
import type { Resource } from '../types';

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
  /** The citations in the caption and the note of each resource this
   *  document places (#529): the index in {@link clusters} of each, in the
   *  order the caption's, then the note's, text holds them. A caption cites
   *  where the resource is placed: right after the block that first
   *  refers to it in the book (its `::resource` block or first `:ref`). */
  captions?: Record<string, CaptionCitationIndexes>;
  /** The chapter of each citation of {@link clusters} (#537): counted
   *  through the book, a new one at each document and at each level-1
   *  heading after a citation. `citations.numbering: 'chapter'` processes
   *  each chapter's citations on their own. */
  chapters?: number[];
}

/** Where a resource's caption and note citations sit in a book's
 *  {@link CitationContext.clusters}. */
export interface CaptionCitationIndexes {
  caption: number[];
  note: number[];
}

/** What a resource's caption and note cite. */
type CaptionClusters = { caption: CitationClusterInput[]; note: CitationClusterInput[] };

/** The caption and note citations of every resource that has some. */
function captionClustersOf(resources: readonly Pick<Resource, 'id' | 'caption' | 'note'>[] | undefined): Map<string, CaptionClusters> {
  const out = new Map<string, CaptionClusters>();
  for (const r of resources ?? []) {
    const caption = snippetCitations(r.caption).map((c) => c.cluster);
    const note = snippetCitations(r.note).map((c) => c.cluster);
    if (caption.length > 0 || note.length > 0) out.set(r.id, { caption, note });
  }
  return out;
}

/** The resources a block refers to (a `::resource` block, `:ref` spans),
 *  in order. */
export function blockResourceIds(b: ContentBlock, isResource: (id: string) => boolean): string[] {
  const ids: string[] = [];
  if (b.type === 'resourceBlock' && b.resourceId) ids.push(b.resourceId);
  for (const s of b.spans) if (s.ref?.resourceId) ids.push(resourceRefId(s.ref.resourceId, isResource));
  return ids;
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
 * sits in that footnote's note. With the book's `resources`, the citations
 * of a caption or a note (#529) follow those of the block that first
 * refers to the resource (where it is placed), in the note that block
 * reached.
 */
export function bookCitationContexts(
  sources: readonly CitationSource[],
  resources?: readonly Pick<Resource, 'id' | 'caption' | 'note'>[],
): CitationContext[] {
  const captionClusters = captionClustersOf(resources);
  const resourceIds = new Set((resources ?? []).map((r) => r.id));
  const isResource = (id: string): boolean => resourceIds.has(id);
  const anchored = new Set<string>();
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
  type Entry = { cluster: CitationClusterInput; doc: number; order: number; noteIndex: number; seq: number; chapter: number; caption?: { id: string; part: 'caption' | 'note' } };
  const entries: Entry[] = [];
  let seq = 0;
  // A chapter opens with each document and each level-1 heading; one with
  // no citation yet is not counted again.
  let chapter = -1;
  let chapterCites = true;
  const openChapter = (): void => {
    if (!chapterCites) return;
    chapter++;
    chapterCites = false;
  };
  sources.forEach((src, doc) => {
    const noteOf = new Map<string, number>();
    const noteChapter = new Map<string, number>();
    const inNotes: { cluster: CitationClusterInput; note: string; order: number }[] = [];
    let order = 0;
    openChapter();
    for (const b of src.blocks) {
      if (b.footnoteDef !== undefined) {
        for (const s of b.spans) if (s.citation) inNotes.push({ cluster: s.citation.cluster, note: b.footnoteDef, order: order++ });
        continue;
      }
      if (b.type === 'heading' && b.level === 1) openChapter();
      for (const s of b.spans) {
        if (s.footnote && !noteOf.has(s.footnote.id)) {
          noteOf.set(s.footnote.id, ++note);
          noteChapter.set(s.footnote.id, chapter);
          chapterCites = true;
        }
        if (s.citation) {
          entries.push({ cluster: s.citation.cluster, doc, order: order++, noteIndex: ++note, seq: seq++, chapter });
          chapterCites = true;
        }
      }
      if (captionClusters.size === 0) continue;
      for (const id of blockResourceIds(b, isResource)) {
        const cited = captionClusters.get(id);
        if (!cited || anchored.has(id)) continue;
        anchored.add(id);
        for (const part of ['caption', 'note'] as const) {
          for (const cluster of cited[part]) entries.push({ cluster, doc, order: -1, noteIndex: note, seq: seq++, chapter, caption: { id, part } });
          chapterCites ||= cited[part].length > 0;
        }
      }
    }
    for (const c of inNotes) entries.push({ cluster: c.cluster, doc, order: c.order, noteIndex: noteOf.get(c.note) ?? 0, seq: seq++, chapter: noteChapter.get(c.note) ?? chapter });
  });
  const sorted = [...entries].sort((a, b) => a.doc - b.doc || a.noteIndex - b.noteIndex || a.seq - b.seq);
  const clusters = sorted.map((e) => ({ ...e.cluster, noteIndex: e.noteIndex }));
  const chapters = sorted.map((e) => e.chapter);
  const placed = sources.some((s) => hasBibliographyDirective(s.blocks));
  return sources.map((_, doc) => {
    const ofDoc = sorted.map((e, i) => ({ e, i })).filter(({ e }) => e.doc === doc);
    const mine = ofDoc.filter(({ e }) => !e.caption).sort((a, b) => a.e.order - b.e.order);
    let captions: Record<string, CaptionCitationIndexes> | undefined;
    for (const { e, i } of ofDoc.filter(({ e }) => e.caption).sort((a, b) => a.e.seq - b.e.seq)) {
      captions ??= {};
      const slot = (captions[e.caption!.id] ??= { caption: [], note: [] });
      slot[e.caption!.part].push(i);
    }
    return {
      items,
      nocite,
      clusters,
      local: mine.map(({ i }) => i),
      placed,
      last: doc === sources.length - 1,
      issues: issues[doc] ?? [],
      ...(captions ? { captions } : {}),
      chapters,
    };
  });
}

/** A fingerprint of a context's book-wide part: what a chapter's citations
 *  and bibliography depend on (a host compares it to know a chapter's
 *  layout went stale). */
export function citationContextKey(ctx: CitationContext | undefined): string {
  if (!ctx) return '';
  return JSON.stringify([ctx.items, ctx.nocite, ctx.clusters, ctx.local, ctx.placed, ctx.last, ctx.captions ?? null, ctx.chapters ?? null]);
}
