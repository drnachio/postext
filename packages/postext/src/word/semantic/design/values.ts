// What a heading design's placeholders read (#1444): the book's metadata
// (the first chapter's front matter, as the engine takes it), and for each
// heading the chapter number, chapter title and part it stands in, counted
// through the book as the engine counts them for its openers.

import { extractFrontmatter } from '../../../parse/frontmatter.js';
import type { ContentBlock } from '../../../parse/types.js';
import { createHeadingLevelResolver, headingIsNumbered, headingStyleOf, type HeadingLevelResolver } from '../../../pipeline/sections/headingStyles.js';
import { parsePartNumber, parsePartPalette } from '../../../pipeline/sections/parts.js';
import { computeHeadingContext } from '../../../pipeline/resources/resourceNumbering.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import type { DocumentMetadata, ResolvedHeadingLevelConfig } from '../../../types.js';
import type { ResolvedConfig, VDTPage } from '../../../vdt.js';
import type { WriterContext } from '../context.js';

interface HeadingValues {
  chapterNumber: string;
  chapterTitle: string;
  partTitle: string;
  partNumber: string;
  /** The heading's own number prefix (no separator). */
  number: string;
  /** The palette overrides of the part the heading stands in (palette id
   *  → hex), empty outside a part that recolours. */
  palette: Record<string, string>;
}

interface BookValues {
  metadata: DocumentMetadata;
  byBlock: Map<ContentBlock, HeadingValues>;
  /** Each `:::part` fence's own palette overrides. */
  parts: Map<ContentBlock, Record<string, string>>;
}

const memo = new WeakMap<object, BookValues>();

function bookValues(ctx: WriterContext): BookValues {
  const hit = memo.get(ctx.book);
  if (hit) return hit;
  const first = ctx.book[0] as { input?: { markdown: string } } | undefined;
  const metadata = first?.input ? extractFrontmatter(first.input.markdown).metadata : {};
  const byBlock = new Map<ContentBlock, HeadingValues>();
  const parts = new Map<ContentBlock, Record<string, string>>();
  let chapterNumber = '';
  let chapterTitle = '';
  let partTitle = '';
  let partNumber = '';
  let palette: Record<string, string> = {};
  // The chapter counter as the engine keeps it: from the book's start
  // (`start.headings`, a volume that continues another) through every
  // chapter, numbered headings only.
  let counters = ctx.start?.headings ? { ...ctx.start.headings } : undefined;
  ctx.book.forEach((ch, ci) => {
    const prefixes = ctx.numbers.headings[ci] ?? [];
    const context = computeHeadingContext(ch.blocks, counters, (b) => headingIsNumbered(b, ctx.resolved));
    if (context.length) counters = context[context.length - 1];
    ch.blocks.forEach((b, bi) => {
      if (b.type === 'containerStart' && b.containerName === 'part') {
        // A part rules until the next one opens, past its fence and into
        // the chapters after it, as in the engine.
        partTitle = b.containerAttrs?.title ?? '';
        partNumber = b.containerAttrs?.number ?? '';
        palette = parsePartPalette(b.containerAttrs?.palette);
        parts.set(b, palette);
        return;
      }
      if (b.type !== 'heading') return;
      const number = (prefixes[bi] ?? '').trim();
      if ((b.level ?? 1) === 1) {
        const style = headingStyleOf(b, ctx.resolved);
        if (style && !style.numbered) chapterNumber = '';
        else chapterNumber = number || (style?.numberingTemplate === '' ? '' : String(context[bi]?.h1 ?? ''));
        chapterTitle = b.text;
      }
      byBlock.set(b, { chapterNumber, chapterTitle, partTitle, partNumber, number, palette });
    });
  });
  const out = { metadata, byBlock, parts };
  memo.set(ctx.book, out);
  return out;
}

/** The palette overrides in force at heading `b` (or at a `:::part`
 *  fence, its own): palette id → hex, empty when nothing recolours. */
export function partPaletteAt(ctx: WriterContext, b: ContentBlock): Record<string, string> {
  const v = bookValues(ctx);
  return v.byBlock.get(b)?.palette ?? v.parts.get(b) ?? {};
}

/** The placeholder context of heading `b`'s design. */
export function designPlaceholders(ctx: WriterContext, b: ContentBlock): DesignPlaceholderContext {
  const { metadata, byBlock } = bookValues(ctx);
  const v = byBlock.get(b);
  // No page: `{pageNumber}` prints nothing, `{attr.x}` reads the heading's.
  const page = { index: 0, pageLabel: '' } as unknown as VDTPage;
  const numeric = v?.number && /^\d+$/.test(v.number) ? Number(v.number) : undefined;
  return {
    kind: 'heading',
    page,
    allPages: [],
    metadata,
    chapterTitleByPageIndex: [v?.chapterTitle ?? ''],
    partTitleByPageIndex: [v?.partTitle ?? ''],
    partNumberByPageIndex: [v?.partNumber ?? ''],
    chapterNumberByPageIndex: [v?.chapterNumber ?? ''],
    numerals: ctx.resolved.numerals,
    heading: {
      titleText: b.text,
      formattedNumber: v?.number ?? '',
      ...(numeric !== undefined ? { numericValue: numeric } : {}),
      locale: ctx.config.locale,
      chapterNumber: v?.chapterNumber ?? '',
      chapterTitle: v?.chapterTitle ?? b.text,
      attrs: b.attrs,
    },
  };
}

/** The placeholder context of a `:::part` fence's page design: the part's
 *  number and title as the heading's. */
export function partPlaceholders(ctx: WriterContext, part: ContentBlock): DesignPlaceholderContext {
  const { metadata } = bookValues(ctx);
  const number = part.containerAttrs?.number ?? '';
  const title = part.containerAttrs?.title ?? '';
  const page = { index: 0, pageLabel: '' } as unknown as VDTPage;
  const numeric = parsePartNumber(number);
  return {
    kind: 'part',
    page,
    allPages: [],
    metadata,
    chapterTitleByPageIndex: [''],
    partTitleByPageIndex: [title],
    partNumberByPageIndex: [number],
    chapterNumberByPageIndex: [''],
    numerals: ctx.resolved.numerals,
    heading: {
      titleText: title,
      formattedNumber: number,
      ...(numeric !== undefined ? { numericValue: numeric } : {}),
      locale: ctx.config.locale,
      chapterNumber: '',
      attrs: part.containerAttrs,
    },
  };
}

const resolvers = new WeakMap<ResolvedConfig, HeadingLevelResolver>();

/** The level config heading `b` is set with (its style's merged in). */
export function headingLevelOf(resolved: ResolvedConfig, b: Pick<ContentBlock, 'type' | 'level' | 'attrs'>): ResolvedHeadingLevelConfig | undefined {
  let resolver = resolvers.get(resolved);
  if (!resolver) resolvers.set(resolved, (resolver = createHeadingLevelResolver(resolved)));
  return resolver.forBlock(b);
}

