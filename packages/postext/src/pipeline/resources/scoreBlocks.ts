// Music scores (#1172): a notation fence is engraved at the width of the
// flow's column and expanded into one `score` block per system. Each system
// is then placed like a display formula — a single line of its own height,
// never cut — so a long score runs on over columns and pages, breaking only
// between systems.

import type { ContentBlock, ScoreBlockInfo } from '../../parse/types.js';
import type { VDTResourceScore, VDTScoreInfo } from '../../vdt.js';
import type { Resource } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { ResolvedScoreStyleConfig } from '../../types.js';
import type { BlockStyle } from '../styles.js';
import { pickScoreStyle } from '../../defaults/scoreStyle.js';
import { dimensionToPx } from '../../units.js';
import { buildFontString } from '../../measure/font.js';
import { computeBaselineGrid } from '../config.js';
import { renderScore } from '../../music/engine.js';
import type { ScoreRenderOptions } from '../../music/types.js';

/** Whether parsed content holds a score: the host starts the engraver. */
export function blocksHaveScore(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'score');
}

/** The style a score fence picks with `style="…"`. */
export function scoreStyleOf(block: ContentBlock, resolved: ResolvedConfig): ResolvedScoreStyleConfig {
  const id = block.score?.attrs.style;
  return pickScoreStyle(resolved, typeof id === 'string' ? id : undefined);
}

export function scoreRenderOptions(style: ResolvedScoreStyleConfig, resolved: ResolvedConfig): ScoreRenderOptions {
  const dpi = resolved.page.dpi;
  return {
    staffSizePx: Math.max(4, dimensionToPx(style.staffSize, dpi)),
    font: style.musicFont,
    textFont: style.textFont,
    spacing: style.spacing,
    barNumbers: style.barNumbers,
    systemSpacing: 0,
  };
}

/** A placeholder system the size of one staff with room around it: what a
 *  score is set as while the engraver loads (or when its notation does
 *  not load). */
function placeholderHeight(options: ScoreRenderOptions): number {
  return options.staffSizePx * 2.5;
}

/**
 * Expand each `score` block into one block per engraved system, laid out
 * `widthPx` wide. A block keeps the fence's source range; the systems after
 * the first carry an empty one at its end.
 */
export function expandScoreBlocks(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  widthPx: number,
): { blocks: ContentBlock[]; expanded: boolean } {
  if (!blocksHaveScore(blocks)) return { blocks: blocks as ContentBlock[], expanded: false };
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    const score = b.score;
    if (b.type !== 'score' || !score) { out.push(b); continue; }
    const style = scoreStyleOf(b, resolved);
    const options = scoreRenderOptions(style, resolved);
    const render = renderScore(score.source, score.format, Math.max(40, widthPx), options);
    const meta = {
      ...(render.title ? { title: render.title } : {}),
      ...(render.composer ? { composer: render.composer } : {}),
    };
    if (render.systems.length === 0) {
      out.push({
        ...b,
        score: {
          ...score, ...meta, index: 0, count: 1,
          system: { widthPx, heightPx: placeholderHeight(options), items: [], svg: '', textFont: options.textFont ?? '' },
          ...(render.error ? { error: render.error } : {}),
        },
      });
      continue;
    }
    const count = render.systems.length;
    render.systems.forEach((system, index) => {
      out.push({
        ...b,
        ...(index > 0 ? { sourceStart: b.sourceEnd } : {}),
        score: { ...score, ...meta, system, index, count },
      });
    });
  }
  return { blocks: out, expanded: true };
}

/** A score resource's body (#1172): its systems engraved `widthPx` wide
 *  and stacked with the style's system gap. */
export function layoutScoreResource(
  resource: Resource,
  resolved: ResolvedConfig,
  widthPx: number,
): { width: number; height: number; score: VDTResourceScore } {
  const score = resource.score!;
  const style = pickScoreStyle(resolved, score.styleId);
  const options = scoreRenderOptions(style, resolved);
  const dpi = resolved.page.dpi;
  const gap = dimensionToPx(style.systemGap, dpi, dimensionToPx(resolved.bodyText.fontSize, dpi));
  const render = renderScore(score.source, score.format, Math.max(40, widthPx), options);
  const systems: VDTResourceScore['systems'] = [];
  let y = 0;
  for (const system of render.systems) {
    if (systems.length > 0) y += gap;
    systems.push({ system, y, width: system.widthPx, height: system.heightPx });
    y += system.heightPx;
  }
  const alt = resource.altText?.trim() || [render.title, render.composer].filter(Boolean).join(', ');
  return {
    width: widthPx,
    height: systems.length > 0 ? y : placeholderHeight(options),
    score: { systems, color: style.color.hex, ...(alt ? { alt } : {}) },
  };
}

/** Block style of one system: the score's margins above its first system
 *  and below its last, the system gap between two. */
export function resolveScoreBlockStyle(block: ContentBlock, resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const style = scoreStyleOf(block, resolved);
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const index = block.score?.index ?? 0;
  const count = block.score?.count ?? 1;
  return {
    fontString: buildFontString(style.textFont, fontSizePx, '400'),
    fontSizePx,
    lineHeightPx: computeBaselineGrid(resolved),
    color: style.color.hex,
    textAlign: 'left',
    hyphenate: false,
    marginTopPx: index === 0 ? dimensionToPx(style.marginTop, dpi, fontSizePx) : dimensionToPx(style.systemGap, dpi, fontSizePx),
    marginBottomPx: index === count - 1 ? dimensionToPx(style.marginBottom, dpi, fontSizePx) : 0,
    firstLineIndentPx: 0,
    hangingIndent: false,
  };
}

/** What a VDT block keeps of its score: its system's place, and on the
 *  first system the alt text (the fence's `alt`, else the title and
 *  composer read from the notation). */
export function scoreInfoOf(score: ScoreBlockInfo): VDTScoreInfo {
  const index = score.index ?? 0;
  const alt = typeof score.attrs.alt === 'string' && score.attrs.alt.trim() !== ''
    ? score.attrs.alt.trim()
    : [score.title, score.composer].filter(Boolean).join(', ');
  return { index, count: score.count ?? 1, ...(alt && index === 0 ? { alt } : {}) };
}

/**
 * The room the systems kept with the one at `blockIdx` need (#1173): from
 * the first system, the first `minSystemsAtBreak`; from the one that opens
 * the last `minSystemsAtBreak`, all of them. Undefined for any other system,
 * or a score too short to break (fewer than twice the minimum: it moves
 * whole, the first system keeping them all).
 */
export function scoreKeepHeight(
  blocks: readonly ContentBlock[],
  blockIdx: number,
  resolved: ResolvedConfig,
): number | undefined {
  const block = blocks[blockIdx];
  const score = block?.score;
  if (!block || !score || score.index === undefined || score.count === undefined || score.count < 2) return undefined;
  const style = scoreStyleOf(block, resolved);
  const m = style.minSystemsAtBreak;
  const whole = score.count < 2 * m;
  let span: number;
  if (score.index === 0) span = whole ? score.count : Math.min(m, score.count);
  else if (!whole && score.index === score.count - m) span = m;
  else return undefined;
  if (span < 2) return undefined;
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const gap = dimensionToPx(style.systemGap, dpi, fontSizePx);
  let h = 0;
  for (let k = 0; k < span; k++) {
    const sys = blocks[blockIdx + k]?.score?.system;
    if (!sys) return undefined;
    h += sys.heightPx + (k > 0 ? gap : 0);
  }
  return h;
}
