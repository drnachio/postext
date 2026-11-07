// What a heading design's placeholders read (#1444): the book's metadata
// (the first chapter's front matter, as the engine takes it), and for each
// heading the chapter number, chapter title and part it stands in, counted
// through the book as the engine counts them for its openers.

import { extractFrontmatter } from '../../../parse/frontmatter.js';
import type { ContentBlock } from '../../../parse/types.js';
import { createHeadingLevelResolver, headingStyleOf, type HeadingLevelResolver } from '../../../pipeline/sections/headingStyles.js';
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
}

interface BookValues {
  metadata: DocumentMetadata;
  byBlock: Map<ContentBlock, HeadingValues>;
}

const memo = new WeakMap<object, BookValues>();

function bookValues(ctx: WriterContext): BookValues {
  const hit = memo.get(ctx.book);
  if (hit) return hit;
  const first = ctx.book[0] as { input?: { markdown: string } } | undefined;
  const metadata = first?.input ? extractFrontmatter(first.input.markdown).metadata : {};
  const byBlock = new Map<ContentBlock, HeadingValues>();
  let ordinal = 0;
  let chapterNumber = '';
  let chapterTitle = '';
  let partTitle = '';
  let partNumber = '';
  ctx.book.forEach((ch, ci) => {
    const prefixes = ctx.numbers.headings[ci] ?? [];
    ch.blocks.forEach((b, bi) => {
      if (b.type === 'containerStart' && b.containerName === 'part') {
        partTitle = b.containerAttrs?.title ?? '';
        partNumber = b.containerAttrs?.number ?? '';
        return;
      }
      if (b.type !== 'heading') return;
      const number = (prefixes[bi] ?? '').trim();
      if ((b.level ?? 1) === 1) {
        const style = headingStyleOf(b, ctx.resolved);
        if (style && !style.numbered) chapterNumber = '';
        else {
          ordinal++;
          chapterNumber = number || (style?.numberingTemplate === '' ? '' : String(ordinal));
        }
        chapterTitle = b.text;
      }
      byBlock.set(b, { chapterNumber, chapterTitle, partTitle, partNumber, number });
    });
  });
  const out = { metadata, byBlock };
  memo.set(ctx.book, out);
  return out;
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

const resolvers = new WeakMap<ResolvedConfig, HeadingLevelResolver>();

/** The level config heading `b` is set with (its style's merged in). */
export function headingLevelOf(resolved: ResolvedConfig, b: Pick<ContentBlock, 'type' | 'level' | 'attrs'>): ResolvedHeadingLevelConfig | undefined {
  let resolver = resolvers.get(resolved);
  if (!resolver) resolvers.set(resolved, (resolver = createHeadingLevelResolver(resolved)));
  return resolver.forBlock(b);
}

