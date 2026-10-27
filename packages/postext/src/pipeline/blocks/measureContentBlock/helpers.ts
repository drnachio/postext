// Small reads of the block measure: a container's start marker, justified
// tracking, a heading's jidori, word spacing of justified lines and the
// runt tracking ladder (#1278: split out of measureContentBlock.ts).
import type { ContentBlock } from '../../../parse/index.js';
import type { ResolvedConfig, VDTLine } from '../../../vdt.js';
import type { BlockStyle } from '../../styles.js';
import { composesAsCjk } from '../../../measure/cjk/cjkCompose.js';
import { LINE_MAX_SPACE_RATIO } from '../../text/raggedLines.js';

/** Index of the `containerStart` marker that the `containerEnd` at `endIdx`
 *  closes, when there is one. */
export function containerStartOf(blocks: readonly ContentBlock[], endIdx: number): number | undefined {
  const id = blocks[endIdx]?.containerId;
  if (id === undefined) return undefined;
  for (let i = endIdx - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.type === 'containerStart' && b.containerId === id) return i;
  }
  return undefined;
}

/** The most a justified line may spread between two letters, px
 * (`bodyText.maxJustifyTracking`, EF-65), or undefined when off, so the
 * common-case cache keys stay unchanged. A loose paragraph on a character
 * grid (`gridEm`, #632) the CJK composer sets is held to the balancing
 * cap as well; a cap of zero is passed as a hair above it, since the
 * composer reads zero as no cap. */
export function justifyTrackingPx(
  resolved: ResolvedConfig,
  style: BlockStyle,
  vdtType: string,
  text: string,
  gridEm: number | undefined,
): number | undefined {
  const justified = style.textAlign === 'justify' && vdtType !== 'heading';
  const own = resolved.bodyText.maxJustifyTracking > 0 && justified
    ? (resolved.bodyText.maxJustifyTracking / 1000) * style.fontSizePx
    : undefined;
  if (gridEm === undefined || !justified || !composesAsCjk(text)) return own;
  const grid = Math.max(1e-6, gridEm * style.fontSizePx);
  return own === undefined ? grid : Math.min(own, grid);
}

/** A heading's jidori width in its own ems: its `{jidori=N}` attribute
 *  (`0` or anything under 1 turns the level's off), else its level's
 *  `jidori`. Undefined: none. */
export function headingJidori(style: BlockStyle, block: ContentBlock): number | undefined {
  const own = block.attrs?.jidori;
  if (own !== undefined) {
    const n = Number(own.trim());
    return Number.isFinite(n) && n > 1 ? n : undefined;
  }
  return style.jidori;
}

/** How loose a paragraph's justified lines are: the widest word spacing of
 *  the ones that stay justified, as a multiple of the normal space
 *  (`VDTLine.justifiedSpaceRatio`; 0 when none is), and how many stretch
 *  past `LINE_MAX_SPACE_RATIO`, which `raggedLooseLines` sets ragged. */
export function wordSpacingProfile(lines: readonly VDTLine[]): { loosest: number; ragged: number } {
  let loosest = 0;
  let ragged = 0;
  for (const line of lines) {
    const ratio = line.justifiedSpaceRatio;
    if (line.isLastLine || ratio === undefined) continue;
    if (ratio > LINE_MAX_SPACE_RATIO) ragged++;
    else if (ratio > loosest) loosest = ratio;
  }
  return { loosest, ragged };
}

/** Tracking rungs a runt fix may climb, in thousandths of an em: none
 *  first — word spacing alone may carry the line — then 5‰ steps to the
 *  cap, the cap always included. Tracking is measured on the rich path, so
 *  a block without rich fonts only gets the first rung. */
export function runtTrackingLadder(maxTracking: number, hasRichFonts: boolean): number[] {
  const rungs = [0];
  if (!hasRichFonts || maxTracking <= 0) return rungs;
  for (let t = 5; t < maxTracking; t += 5) rungs.push(t);
  rungs.push(maxTracking);
  return rungs;
}
