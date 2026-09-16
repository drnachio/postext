/**
 * Heading styles — `# Title {style="…"}`. A style merges its level
 * overrides over the heading's level config and, for the *section* it
 * opens (the blocks and pages from the heading up to the next heading of
 * the same or a higher level), replaces the running heads, the page
 * geometry, the body typography and the palette. Like the part and
 * paragraph-container plans, the section of every content block is
 * resolved up front by index so the placement loop can rewind freely.
 */

import type { ContentBlock } from '../parse';
import type { ResolvedHeadingLevelConfig, ResolvedHeadingStyleConfig } from '../types';
import type { ResolvedConfig, VDTBlock } from '../vdt';
import { buildHeadingLevelMap } from './config';
import type { ChapterTitlePageInfo } from './placeholders';
import { derivePartResolvedConfig, derivePartMeasureContext } from './parts';
import type { BlockMeasureContext } from './measureContentBlock';

/** The `style` attribute of a heading block, when it names a configured
 *  style. */
export function headingStyleOf(
  block: Pick<ContentBlock, 'type' | 'attrs'>,
  resolved: ResolvedConfig,
): ResolvedHeadingStyleConfig | undefined {
  if (block.type !== 'heading') return undefined;
  const id = block.attrs?.style;
  if (!id) return undefined;
  return resolved.headingStyles.find((s) => s.id === id);
}

/** Whether a heading block advances the numbering counters. */
export function headingIsNumbered(block: ContentBlock, resolved: ResolvedConfig): boolean {
  return headingStyleOf(block, resolved)?.numbered ?? true;
}

/** Whether a heading block is listed by `:::toc`: the style's `toc`, which
 *  a `{toc="false"}` / `{toc="true"}` attribute overrides. */
export function headingIsListed(block: Pick<ContentBlock, 'type' | 'attrs'>, resolved: ResolvedConfig): boolean {
  const attr = block.attrs?.toc;
  if (attr === 'false' || attr === 'no' || attr === '0') return false;
  if (attr === 'true' || attr === 'yes' || attr === '1') return true;
  return headingStyleOf(block, resolved)?.toc ?? true;
}

/** Per-level lookups with every style's overrides merged in, cached per
 *  resolved config. */
export interface HeadingLevelResolver {
  /** The level config a heading block renders with. */
  forBlock(block: Pick<ContentBlock, 'type' | 'level' | 'attrs'>): ResolvedHeadingLevelConfig | undefined;
  /** The level config for a level and an optional style id. */
  forLevel(level: number, styleId?: string): ResolvedHeadingLevelConfig | undefined;
}

export function createHeadingLevelResolver(resolved: ResolvedConfig): HeadingLevelResolver {
  const byLevel = buildHeadingLevelMap(resolved);
  const cache = new Map<string, ResolvedHeadingLevelConfig>();
  const forLevel = (level: number, styleId?: string): ResolvedHeadingLevelConfig | undefined => {
    const base = byLevel.get(level);
    if (!base || !styleId) return base;
    const style = resolved.headingStyles.find((s) => s.id === styleId);
    if (!style) return base;
    const key = `${level}|${styleId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const merged: ResolvedHeadingLevelConfig = { ...base, ...style.overrides, level: base.level };
    cache.set(key, merged);
    return merged;
  };
  return {
    forLevel,
    forBlock: (block) => forLevel(block.level ?? 1, block.type === 'heading' ? block.attrs?.style : undefined),
  };
}

export interface HeadingSectionPlan {
  /** Content-block index → the style of the section the block sits in
   *  (the styled heading itself included); `undefined` outside any. */
  byBlock: Array<ResolvedHeadingStyleConfig | undefined>;
  /** Whether any block sits in a styled section. */
  any: boolean;
}

/** Resolve the styled section of every content block: a styled heading
 *  opens one that runs until the next heading of the same or a higher
 *  level (which opens its own section, or none). */
export function planHeadingSections(
  contentBlocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
): HeadingSectionPlan {
  const byBlock = new Array<ResolvedHeadingStyleConfig | undefined>(contentBlocks.length);
  let open: { style: ResolvedHeadingStyleConfig; level: number } | undefined;
  let any = false;
  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.type === 'heading' && b.level) {
      const style = headingStyleOf(b, resolved);
      if (style) open = { style, level: b.level };
      else if (open && b.level <= open.level) open = undefined;
    }
    byBlock[i] = open?.style;
    if (open) any = true;
  }
  return { byBlock, any };
}

/** Per page, the styled section in effect: the most recent styled heading
 *  whose section has not been closed by a heading of the same or a higher
 *  level. Blank parity pages before a section's heading belong to it, like
 *  chapter titles do (`computeChapterTitles`). */
export function computeSectionStyles(
  blocks: readonly VDTBlock[],
  totalPages: number,
  pages: readonly ChapterTitlePageInfo[] | undefined,
  resolved: ResolvedConfig,
): Array<ResolvedHeadingStyleConfig | undefined> {
  const out = new Array<ResolvedHeadingStyleConfig | undefined>(totalPages).fill(undefined);
  const byPage = new Map<number, ResolvedHeadingStyleConfig | undefined>();
  let current: { style: ResolvedHeadingStyleConfig; level: number } | undefined;
  let lastPageIndex = -1;
  const starts: Array<{ pageIndex: number; value: ResolvedHeadingStyleConfig | undefined }> = [];
  for (const b of blocks) {
    if (b.pageIndex < 0) continue;
    while (lastPageIndex < b.pageIndex) {
      lastPageIndex++;
      byPage.set(lastPageIndex, current?.style);
    }
    if (b.type === 'heading' && b.headingLevel !== undefined) {
      const style = b.headingStyleId ? resolved.headingStyles.find((s) => s.id === b.headingStyleId) : undefined;
      let changed = false;
      if (style) { current = { style, level: b.headingLevel }; changed = true; }
      else if (current && b.headingLevel <= current.level) { current = undefined; changed = true; }
      if (changed) {
        byPage.set(b.pageIndex, current?.style);
        starts.push({ pageIndex: b.pageIndex, value: current?.style });
      }
    }
  }
  for (let p = 0; p < totalPages; p++) {
    out[p] = byPage.has(p) ? byPage.get(p) : p > 0 ? out[p - 1] : undefined;
  }
  if (pages) {
    for (const { pageIndex, value } of starts) {
      for (let p = pageIndex - 1; p >= 0; p--) {
        const info = pages[p];
        if (!info || info.blankForForce || !info.blankForParity) break;
        out[p] = value;
      }
    }
  }
  return out;
}

/** The resolved config a styled section's pages are laid out with: the
 *  section's page margins and column layout in place of the document's
 *  (page creation reads both), everything else untouched. */
export function deriveSectionGeometryConfig(
  resolved: ResolvedConfig,
  style: ResolvedHeadingStyleConfig,
): ResolvedConfig {
  if (!style.margins && !style.layout) return resolved;
  return {
    ...resolved,
    ...(style.margins ? { page: { ...resolved.page, margins: style.margins } } : {}),
    ...(style.layout ? { layout: style.layout } : {}),
  };
}

/** Measurement context for the blocks inside a styled section with a
 *  `bodyStyle`: the part machinery, run on a config whose `parts.bodyStyle`
 *  is the section's. */
export function deriveSectionMeasureContext(
  ctx: BlockMeasureContext,
  style: ResolvedHeadingStyleConfig,
): BlockMeasureContext {
  if (!style.bodyStyle) return ctx;
  const withBody: ResolvedConfig = { ...ctx.resolved, parts: { ...ctx.resolved.parts, bodyStyle: style.bodyStyle } };
  return derivePartMeasureContext({ ...ctx, resolved: withBody });
}

/** `derivePartResolvedConfig` for a section body style. */
export function deriveSectionResolvedConfig(resolved: ResolvedConfig, style: ResolvedHeadingStyleConfig): ResolvedConfig {
  if (!style.bodyStyle) return resolved;
  return derivePartResolvedConfig({ ...resolved, parts: { ...resolved.parts, bodyStyle: style.bodyStyle } });
}
