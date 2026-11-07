// Music scores in the semantic .docx (#1444): a notation fence (```` ```abc ````
// and the others) engraved by the engine's music engine at the width of the
// column, one picture per system (the SVG over a PNG fallback). The fence
// stays in the Markdown: the pictures map to nothing, so the round trip
// leaves it as written. Without the engine or a rasterizer the fence is
// kept as source, as before.

import type { ContentBlock } from '../../../parse/types.js';
import { initMusicEngine, renderScore } from '../../../music/engine.js';
import { scoreRenderOptions, scoreStyleOf } from '../../../pipeline/resources/scoreBlocks.js';
import type { PreparedPicture, WriterContext } from '../context.js';
import { pictureRun } from './figures.js';
import { rawSdt } from '../raw.js';
import { STYLE } from '../styles.js';
import { blockSdt, paragraph } from '../wml.js';

const prepared = new WeakMap<WriterContext, Map<string, PreparedPicture[]>>();

const keyOf = (chapter: number, b: ContentBlock): string => `${chapter}:${b.sourceStart}`;

/** Engrave the scores of the chapters into the package before the body is
 *  written (engraving and rasterizing are async). */
export async function prepareScores(ctx: WriterContext, chapters: ReadonlyArray<{ blocks: readonly ContentBlock[] }>): Promise<void> {
  const scores = chapters.flatMap((c, i) => c.blocks.filter((b) => b.type === 'score' && b.score).map((b) => ({ chapter: i, b })));
  if (!scores.length) return;
  if (!ctx.rasterizeSvg) {
    ctx.warn('scoreWithoutFallback', 'Music scores need a bitmap fallback (rasterizeSvg) to be shown in Word: kept as notation.');
    return;
  }
  try {
    await initMusicEngine();
  } catch (e) {
    ctx.warn('musicUnavailable', `Music scores are kept as notation: ${(e as Error).message}`);
    return;
  }
  const map = new Map<string, PreparedPicture[]>();
  prepared.set(ctx, map);
  const scale = 300 / ctx.units.dpi;
  for (const { chapter, b } of scores) {
    const style = scoreStyleOf(b, ctx.resolved);
    const render = renderScore(b.score!.source, b.score!.format, Math.max(40, ctx.columnPx), scoreRenderOptions(style, ctx.resolved));
    if (!render.systems.length) {
      if (render.error) ctx.warn('scoreError', `A score did not engrave (${render.error}): kept as notation.`);
      continue;
    }
    const color = style.color.hex || '#000000';
    const pics: PreparedPicture[] = [];
    for (const system of render.systems) {
      const svg = system.svg.replaceAll('currentColor', color);
      const png = await ctx.rasterizeSvg(svg, Math.max(1, Math.round(system.widthPx * scale)), Math.max(1, Math.round(system.heightPx * scale)));
      if (!png) {
        pics.length = 0;
        break;
      }
      pics.push({ rel: ctx.pkg.addMedia(png, 'png'), svgRel: ctx.pkg.addMedia(new TextEncoder().encode(svg), 'svg'), widthPx: system.widthPx, heightPx: system.heightPx });
    }
    if (pics.length) map.set(keyOf(chapter, b), pics);
    else ctx.warn('scoreWithoutFallback', 'A score could not be rasterized for Word: kept as notation.');
  }
}

/** A score fence: its systems as pictures, else its notation as source. */
export function renderScoreBlock(ctx: WriterContext, b: ContentBlock, start: number, end: number, widthTwips: number): string {
  const pics = prepared.get(ctx)?.get(keyOf(ctx.chapter.index, b));
  if (!pics) return rawSdt(ctx, start, end, 'score');
  const attrs = b.score?.attrs ?? {};
  const alt = attrs.alt ?? '';
  const maxPx = (widthTwips * ctx.units.dpi) / 1440;
  const xml = pics.map((p, i) => paragraph({ style: STYLE.figure, keepNext: i < pics.length - 1 }, pictureRun(ctx, p, attrs.id ?? `score${i + 1}`, alt, maxPx))).join('');
  return blockSdt(ctx.nextSdtId(), 'ptx:score', alt || undefined, xml);
}
