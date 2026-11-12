// Citations in the flow Word file (#1458): each `[@key]` shows the text
// the citation processor prints for it ("[1,2]", "(Smith 2020)"), as an
// atom over its source, and `:::bibliography` (or the end of the book)
// receives the list of works. Both are the engine's own text: the list is
// generated, so a change to it in Word is reported and never written into
// the Markdown, and the citation's source comes back as it was written.
// Without a citation engine, or for a key no reference defines, the
// citation prints as written.

import { extractFrontmatter } from '../../../parse/frontmatter.js';
import type { ContentBlock, InlineSpan } from '../../../parse/types.js';
import { bookCitationContexts, needsCitationContext, type CitationContext } from '../../../citations/context.js';
import { ensureCitationEngine } from '../../../citations/registry.js';
import { resolvedLocale } from '../../../pipeline/config.js';
import { applyCitations, citationLocale, processCitations, type ProcessedCitations } from '../../../pipeline/references/citations.js';
import { BIBLIOGRAPHY_CONTAINER_BASE } from '../../../pipeline/references/citations/process.js';
import { narrativeName } from '../../../pipeline/references/citations/markers.js';
import type { Resource } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { WriterContext } from '../context.js';
import { generatedRuns, type Piece } from '../generated.js';
import { halfPoints, paragraph, px, twips, type Units } from '../wml.js';

/** What a citation shows in the text. */
export interface CitationLabel {
  /** The citation as the processor prints it. */
  text: string;
  /** `text` in pieces with the processor's emphasis (an italic title),
   *  when it has any (#1518): set as the book sets it. */
  pieces?: Piece[];
  /** A note style: the citation goes into a note of its own, and `text`
   *  is that note's; `name` stays in the sentence ("As Howse says"). */
  note?: { name: string };
}

/** A list of works: its title and entries, as generated pieces. */
export interface WorksList {
  title?: string;
  entries: Piece[][];
}

/** The citations of a book as the Word file shows them. */
export interface BookCitations {
  label(span: InlineSpan): CitationLabel | undefined;
  /** The list a `:::bibliography` block of chapter `chapter` sets. */
  listAt(chapter: number, block: ContentBlock): WorksList | undefined;
  /** The lists of chapter `chapter` no block places (set after its text). */
  unplaced(chapter: number): WorksList[];
  /** The longest label of the lists, in characters (0: unnumbered). */
  labelChars: number;
}

interface ParsedSource {
  input: { markdown: string };
  blocks: ContentBlock[];
}

const plainText = (spans: readonly InlineSpan[]): string => spans.map((s) => s.text).join('');

/** The entry's spans as pieces: the label, a tab, the work. */
function entryPieces(spans: readonly InlineSpan[]): Piece[] {
  const out: Piece[] = [];
  for (const s of spans) {
    const tab = s.labelTab;
    if (tab === 'lead') continue;
    out.push({ text: tab === 'gap' ? '\t' : s.text, ...(s.bold ? { b: true } : {}), ...(s.italic ? { i: true } : {}) });
  }
  return out;
}

/** Format the book's citations (undefined: the book has none). */
export async function prepareCitations(parsed: readonly ParsedSource[], book: ResolvedConfig, resources: readonly Resource[]): Promise<BookCitations | undefined> {
  const sources = parsed.map((pc) => ({ metadata: extractFrontmatter(pc.input.markdown).metadata as Record<string, unknown>, blocks: pc.blocks }));
  if (!sources.some((s) => needsCitationContext(s.blocks, s.metadata))) return undefined;
  await ensureCitationEngine();
  const contexts: CitationContext[] = bookCitationContexts(sources, resources);
  const locale = resolvedLocale(book);
  const labels = new WeakMap<InlineSpan, CitationLabel>();
  const placed: Map<ContentBlock, WorksList>[] = [];
  const unplaced: WorksList[][] = [];
  let labelChars = 0;
  parsed.forEach((pc, i) => {
    const ctx = contexts[i]!;
    const processed: ProcessedCitations | null = processCitations(ctx, book, citationLocale(book, locale));
    placed.push(new Map());
    unplaced.push([]);
    if (!processed) return;
    const note = processed.processor.kind === 'note' && book.citations.notes !== 'warichu';
    const items = new Map(ctx.items.map((it) => [it.id, it]));
    let k = 0;
    for (const b of pc.blocks) {
      for (const span of b.spans) {
        if (!span.citation) continue;
        const g = ctx.local[k++];
        const formatted = g !== undefined ? processed.formatted[g] : undefined;
        if (g === undefined || !formatted) continue;
        const missing = processed.unknown[g] ?? [];
        const unknown = missing.length ? ` ${missing.map((id) => `@${id}`).join('; ')}` : '';
        const text = plainText(formatted) + unknown;
        const looks = formatted.some((f) => f.bold || f.italic) ? [...formatted.map((f) => ({ text: f.text, ...(f.bold ? { b: true } : {}), ...(f.italic ? { i: true } : {}) })), { text: unknown }].filter((x) => x.text) : undefined;
        if (note && b.footnoteDef === undefined) {
          const name = span.citation.cluster.mode === 'narrative'
            ? span.citation.cluster.items.map((it) => narrativeName(items.get(it.id), citationLocale(book, locale), processed.processor.terms)).filter(Boolean).join('; ')
            : '';
          labels.set(span, { text, ...(looks ? { pieces: looks } : {}), note: { name } });
        } else labels.set(span, { text, ...(looks ? { pieces: looks } : {}) });
      }
    }
    // The lists, as the build sets them: one per `:::bibliography`, or
    // after the text when nothing places it.
    const applied = applyCitations(pc.blocks, ctx, processed, book, locale);
    labelChars = Math.max(labelChars, applied.labelChars);
    const directives = pc.blocks.filter((b) => b.type === 'directive' && b.directiveName === 'bibliography');
    let open: WorksList | undefined;
    for (const b of applied.blocks) {
      const own = (b.containerId ?? 0) >= BIBLIOGRAPHY_CONTAINER_BASE;
      if (b.type === 'containerStart' && own) open = { entries: [] };
      else if (b.type === 'containerEnd' && own && open) {
        const at = directives.find((d) => d.sourceStart === b.sourceStart && !placed[i]!.has(d));
        if (at) placed[i]!.set(at, open);
        else unplaced[i]!.push(open);
        open = undefined;
      } else if (open && b.type === 'paragraph') {
        if (b.bibEntry === undefined && !open.entries.length) open.title = b.text;
        else open.entries.push(entryPieces(b.spans));
      }
    }
  });
  return {
    label: (span) => labels.get(span),
    listAt: (chapter, block) => placed[chapter]?.get(block),
    unplaced: (chapter) => unplaced[chapter] ?? [],
    labelChars,
  };
}

/** The paragraph look of an entry: the bibliography's size and leading,
 *  its turnover lines hung under the first (by the label column for a
 *  numbered list). */
function entryStyle(ctx: WriterContext, units: Units): string {
  const b = ctx.resolved.citations.bibliography;
  const body = ctx.resolved.bodyText;
  const chars = ctx.citations?.labelChars ?? 0;
  const bodyPx = px(units, body.fontSize) || 16;
  const size = b.fontSize.unit === 'em' || b.fontSize.unit === 'rem' ? { value: b.fontSize.value * body.fontSize.value, unit: body.fontSize.unit } : b.fontSize;
  const sizePx = px(units, size) || bodyPx;
  const hang = chars > 0 ? b.labelWidth ?? { value: chars * 0.6 + 0.8, unit: 'em' as const } : b.hangingIndent;
  const hanging = twips(units, hang, sizePx);
  return ctx.styles.custom('bibliography', 'Bibliography', () => ({
    pPr: {
      ind: { left: hanging, hanging },
      jc: 'left',
      before: 0,
      after: twips(units, b.entrySpacing, sizePx),
      ...(chars > 0 ? { tabs: [{ val: 'left' as const, pos: hanging }] } : {}),
    },
    rPr: ctx.plain ? {} : { sz: halfPoints(units, size, bodyPx) },
  }));
}

/** A list of works as paragraphs of generated text. */
export function renderWorksList(ctx: WriterContext, list: WorksList): string {
  const style = entryStyle(ctx, ctx.units);
  let out = '';
  if (list.title) out += paragraph({ style, keepNext: true, ind: { left: 0, firstLine: 0 }, before: 240, after: 120 }, generatedRuns(ctx, [{ text: list.title, b: true }], 'bibliography:title'));
  for (const entry of list.entries) out += paragraph({ style }, generatedRuns(ctx, entry, 'bibliography'));
  return out;
}
