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
import { plainSpans } from '../parse/inlineFormatting';
import { withBookBrackets } from '../parse/annotations';
import type { ResolvedHeadingLevelConfig, ResolvedHeadingStyleConfig, WritingMode } from '../types';
import type { ResolvedConfig, VDTBlock } from '../vdt';
import { buildHeadingLevelMap } from './config';
import { resolveBreakBefore } from '../defaults/headings';
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

/** Memo of {@link headingMarksFor}: per parsed array, the plain headings
 *  without and with book-title brackets. */
const plainHeadingsMemo = new WeakMap<readonly ContentBlock[], { plain?: ContentBlock[]; brackets?: ContentBlock[] }>();

/** The parsed blocks as a configuration with `headings.inlineMarks: false`
 *  lays them out: every heading's spans set plain (see `plainSpans`), the
 *  text unchanged. A book title's 《》 stay when they are the document's
 *  book-title mark (`cjk.bookTitleMark: 'brackets'`): they are its
 *  punctuation, not a mark. `blocks` itself when marks are on or no
 *  heading carries one. Memoised on the (memoised) parsed array. */
export function headingMarksFor(blocks: ContentBlock[], resolved: ResolvedConfig): ContentBlock[] {
  if (resolved.headings.inlineMarks) return blocks;
  const brackets = resolved.cjk.bookTitleMark === 'brackets';
  let memo = plainHeadingsMemo.get(blocks);
  if (!memo) plainHeadingsMemo.set(blocks, (memo = {}));
  let out = brackets ? memo.brackets : memo.plain;
  if (!out) {
    let changed = false;
    const next = blocks.map((b) => {
      if (b.type !== 'heading') return b;
      const spans = plainSpans(brackets && b.spans.some((s) => s.bookTitle) ? withBookBrackets(b.spans) : b.spans);
      if (spans.length === b.spans.length && spans.every((s, i) => s === b.spans[i])) return b;
      changed = true;
      return { ...b, spans };
    });
    out = changed ? next : blocks;
    if (brackets) memo.brackets = out;
    else memo.plain = out;
  }
  return out;
}

/** Memo of {@link numberTitlesFor}: per parsed array, per the heading
 *  settings it reads (a new resolved config every pass keeps the array). */
const numberTitlesMemo = new WeakMap<readonly ContentBlock[], Map<string, ContentBlock[]>>();

/**
 * The parsed blocks with the title of every heading whose number stands
 * for it (`numberPosition: 'replace'`, on the heading's level or style)
 * emptied and the heading flagged `numberIsTitle`: the layout prints the
 * generated number alone, with no separator, and the outline lists it as
 * the title. Only numbered headings with a template; the source title of
 * the others stays. `blocks` itself when no heading is concerned; memoised
 * on the parsed array and the configuration.
 */
export function numberTitlesFor(blocks: ContentBlock[], resolved: ResolvedConfig): ContentBlock[] {
  const replaces = resolved.headings.levels.some((l) => l.numberPosition === 'replace')
    || resolved.headingStyles.some((s) => s.overrides.numberPosition === 'replace');
  if (!replaces) return blocks;
  const key = [
    ...resolved.headings.levels.map((l) => `${l.level}:${l.numberPosition ?? ''}:${l.numberingTemplate}`),
    ...resolved.headingStyles.map((st) => `${st.id}:${st.overrides.numberPosition ?? ''}:${st.numberingTemplate ?? '\u0000'}:${st.numbered}`),
  ].join('\n');
  let memo = numberTitlesMemo.get(blocks);
  if (!memo) numberTitlesMemo.set(blocks, (memo = new Map()));
  const known = memo.get(key);
  if (known) return known;
  let changed = false;
  const out = blocks.map((b) => {
    if (b.type !== 'heading' || !b.level || !headingIsNumbered(b, resolved)) return b;
    const style = headingStyleOf(b, resolved);
    const level = resolved.headings.levels.find((l) => l.level === b.level);
    const position = style?.overrides.numberPosition ?? level?.numberPosition;
    const template = style?.numberingTemplate ?? level?.numberingTemplate ?? '';
    if (position !== 'replace' || template === '') return b;
    changed = true;
    const next: ContentBlock = { ...b, text: '', spans: [], sourceMap: [], numberIsTitle: true };
    delete next.titleBreaks;
    return next;
  });
  const result = changed ? out : blocks;
  memo.set(key, result);
  return result;
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

/** Whether a heading is structural only — prints nothing and takes no
 *  room (`hidden`): its `{hidden="true"}` / `{hidden="false"}` attribute,
 *  else the `hidden` of the level config it renders with (a style's
 *  included). */
export function headingIsHidden(
  block: { attrs?: Record<string, string> },
  level: Pick<ResolvedHeadingLevelConfig, 'hidden'> | undefined,
): boolean {
  const attr = block.attrs?.hidden;
  if (attr === 'true' || attr === 'yes' || attr === '1') return true;
  if (attr === 'false' || attr === 'no' || attr === '0') return false;
  return level?.hidden === true;
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
    const merged: ResolvedHeadingLevelConfig = {
      ...base,
      ...style.overrides,
      level: base.level,
      breakBefore: resolveBreakBefore(style.breakBefore, base.breakBefore),
    };
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
 *  level (which opens its own section, or none) or the next part divider —
 *  a part sits above every heading level, so front matter styled as a
 *  section never runs on into the parts that follow it. */
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
    } else if (b.type === 'containerStart' && b.containerName === 'part') {
      open = undefined;
    }
    byBlock[i] = open?.style;
    if (open) any = true;
  }
  return { byBlock, any };
}

/** Per page, the styled section in effect: the most recent styled heading
 *  whose section has not been closed by a heading of the same or a higher
 *  level or by a part divider. Blank parity pages before a section's heading belong to it, like
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
      // A part divider closes the open section (see planHeadingSections).
      if (current && pages?.[lastPageIndex]?.partInfo) current = undefined;
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

/** The writing mode content block `blockIdx` is laid out in: its styled
 *  section's layout (which inherits the document's writing mode unless it
 *  sets its own), else the document's. */
export function sectionWritingMode(plan: HeadingSectionPlan, resolved: ResolvedConfig, blockIdx: number): WritingMode {
  return (plan.byBlock[blockIdx]?.layout ?? resolved.layout).writingMode;
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
