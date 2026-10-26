// Small helpers of the placement pass that need none of its state: float
// pages, forced breaks, chapter numbers, loose paragraphs, verse snaps and
// centred pages (#1276: split out of build.ts).
import type { ResolvedHeadingLevelConfig } from '../../types.js';
import type { ContentBlock } from '../../parse/index.js';
import type { VDTDocument, VDTPage, ResolvedConfig, VDTLine, VDTColumn, VDTBlock } from '../../vdt.js';
import { versesLineByLine, verseLinesSettings } from '../text/verseLines.js';
import { headingStyleOf } from '../sections/headingStyles.js';
import type { BlockStyle } from '../styles.js';
import { measureContentBlock, type BlockMeasureContext, type MeasuredContentBlock, wordSpacingProfile } from '../blocks/measureContentBlock.js';
import { offsetBlock } from '../callouts/calloutLayout.js';
import { chapterNumberCounter } from '../pages/placeholders.js';
import { mostlyJoiningScript } from '../../measure/rtl/joining.js';
import { composesAsCjk } from '../../measure/cjk/cjkCompose.js';

/** The page each floated resource of `doc` lies on (its first slice's). */
export function floatPagesOf(doc: VDTDocument): Map<string, number> {
  const out = new Map<string, number>();
  for (const page of doc.pages) {
    for (const f of page.floats ?? []) {
      const id = f.resourceBlock?.resource.id;
      if (id && !out.has(id)) out.set(id, page.index);
    }
  }
  return out;
}

/** Whether `pageIndex` opens a run of pages after an explicit break (the
 *  document's first page, the page after a chapter's opener break, a part
 *  or a `:::pagebreak`, past the blank pages parity put between them): no
 *  float heads such a page ahead of its citing line (#633). */
export function opensAfterBreak(pages: readonly VDTPage[], pageIndex: number, forcedBreakPages: ReadonlySet<number>): boolean {
  let p = pageIndex - 1;
  while (p >= 0 && (pages[p]?.blankForParity || pages[p]?.blankForForce)) p--;
  return p < 0 || forcedBreakPages.has(p);
}

/** `{chapterNumber}` at each content block: the value of the last level-1
 *  heading at or before it ('' before the first), by the counter the
 *  running heads use over the placed blocks (`computeChapterNumbers`) —
 *  fed the same fields the placed heading blocks will carry. */
export function chapterNumbersOfContent(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  prefixes: ReadonlyArray<string | undefined>,
  values: ReadonlyArray<number | undefined>,
  ordinalOffset: number,
): string[] {
  const numberless = new Set(resolved.headingStyles.filter((s) => s.numberingTemplate === '').map((s) => s.id));
  const next = chapterNumberCounter<{ unnumbered?: boolean; contentIndex: number; headingNumber?: number; numberPrefix?: string; styleId?: string }>(
    ordinalOffset,
    (b) => b.styleId !== undefined && numberless.has(b.styleId),
    resolved.numerals,
  );
  let current = '';
  return blocks.map((b, i) => {
    if (b.type === 'heading' && (b.level ?? 1) === 1) {
      const style = headingStyleOf(b, resolved);
      const value = next({
        contentIndex: i,
        unnumbered: style ? !style.numbered : false,
        headingNumber: values[i],
        numberPrefix: prefixes[i],
        styleId: style?.id,
      });
      // A plate (`runningChapter: false`) reads its own value; the blocks
      // after it stay in the chapter it interrupts.
      if (style && !style.runningChapter) return value;
      current = value;
    }
    return current;
  });
}

/**
 * Column balancing: measure a paragraph asked to run `extraLines` long.
 * Walks the tracking ladder — no tracking first, then a little positive
 * tracking up to `maxTracking` — and keeps the first measurement that gains
 * exactly the requested lines within the word-spacing limit (a rung that
 * gains the line on its own, without needing the looseness target, counts
 * too). A solution whose extra line is a runt is refused: filling a
 * column's foot is no reason to leave a syllable alone at the end of a
 * paragraph. So is one with a justified line past `bodyText.maxWordSpacing`
 * (EF-129): the breaker keeps a looser line only when no break set stays
 * within the limit, and filling a column is no reason to print one. Falls
 * back to the plain measurement when no rung works, recording the outcome
 * either way.
 *
 * The target counts from the paragraph as placed, which the runt fix may
 * have set a line shorter than the breaker's own optimum; the breaker's
 * looseness counts from that optimum, so such a paragraph asks it for one
 * line less (EF-129: asked for one more, it could only match the target by
 * falling back to its optimum, unchecked).
 *
 * With `headings.balancing.fillShortColumns` (#1236) `extraLines` may be
 * -1: the paragraph is set a line short, its tracking rungs taken in the
 * other direction (tighter letters), and the outcome recorded as negative
 * tracking.
 */
export function measureLooseParagraph(
  rawBlock: Parameters<typeof measureContentBlock>[0],
  blockIdx: number,
  columnWidth: number,
  ctx: BlockMeasureContext,
  styleOverride: BlockStyle | undefined,
  extraLines: number,
  trackingLadder: readonly number[],
  looseOutcome: Map<number, number | null>,
  offGrid?: Set<number>,
): MeasuredContentBlock | null {
  const base = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { styleOverride });
  if (!base) return null;
  // A paragraph with a tab at a stop (#622) is set line by line, as
  // measured: neither looseness nor tracking moves its stops' text.
  if (base.measured.lines.some((l) => l.tabbed)) {
    looseOutcome.set(blockIdx, null);
    return base;
  }
  const target = base.measured.lines.length + extraLines;
  // The breaker's optimum, before any runt fix (a looseness of 0 skips it).
  const optimum = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { styleOverride, looseness: 0 });
  const looseness = optimum ? target - optimum.measured.lines.length : extraLines;
  // A paragraph mostly in a joining script (Arabic…) is not tracked: its
  // words take no letter-spacing (`measure/rtl/joining.ts`), so only the first
  // rung, word spacing alone, can gain it the line.
  // On a character grid (#632) a paragraph the CJK composer sets keeps
  // every character in its one-em cell: no tracking is added to its
  // letters, and a line it breaks short may spread between its characters
  // no more than `maxTracking` (on a grid of whole cells that refuses any
  // line a character short, whose spread is an em over the line's gaps).
  const onGrid = ctx.resolved.cjk.grid.enabled && composesAsCjk(rawBlock.text);
  const ladder = trackingLadder.length > 1 && (onGrid || mostlyJoiningScript(rawBlock.text)) ? trackingLadder.slice(0, 1) : trackingLadder;
  const gridCap = onGrid ? { gridTrackingEm: ctx.resolved.headings.balancing.maxTracking / 1000 } : {};
  // With `fillShortColumns` (#1236) the limit is the one the runt fix
  // keeps (EF-65): no justified line looser than `maxWordSpacing` or than
  // the paragraph's own loosest one, and no more lines set ragged past 3x
  // than it had. A narrow column of long words often passes the absolute
  // limit in every setting of a paragraph, the breaker's own included.
  const natural = ctx.resolved.headings.balancing.fillShortColumns ? wordSpacingProfile(base.measured.lines) : undefined;
  const maxWordSpacing = Math.max(ctx.resolved.bodyText.maxWordSpacing, natural?.loosest ?? 0) + 1e-9;
  // A CJK line spread past its tracking cap (`cjkLoose`) is past the
  // limit too.
  const withinLimit = (lines: readonly VDTLine[]): boolean => natural
    ? lines.every((l) => !l.cjkLoose) && ((p) => p.loosest <= maxWordSpacing && p.ragged <= natural.ragged)(wordSpacingProfile(lines))
    : lines.every((l) => l.isLastLine || ((l.justifiedSpaceRatio === undefined || l.justifiedSpaceRatio <= maxWordSpacing) && !l.cjkLoose));
  const gains = (loose: MeasuredContentBlock | null): loose is MeasuredContentBlock =>
    loose !== null
    && loose.measured.lines.length === target
    && !loose.measured.lastLineRunt
    && withinLimit(loose.measured.lines);
  const sign = extraLines < 0 ? -1 : 1;
  for (const tracking of ladder) {
    const loose = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, {
      styleOverride,
      looseness,
      trackingEm: tracking > 0 ? (sign * tracking) / 1000 : undefined,
      ...gridCap,
    });
    if (gains(loose)) {
      looseOutcome.set(blockIdx, sign * tracking);
      return loose;
    }
  }
  // Refused for the grid's sake alone: the paragraph would gain its line
  // off the grid. Recorded, so the column says why it ends short.
  if (onGrid && offGrid && gains(measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { styleOverride, looseness }))) {
    offGrid.add(blockIdx);
  }
  looseOutcome.set(blockIdx, null);
  return base;
}

/** Whether two lines set one bayt of a poem (`VDTLine.verse`), which a
 *  column never cuts. */
function sameBayt(a: VDTLine | undefined, b: VDTLine | undefined): boolean {
  return a?.verse !== undefined && b?.verse !== undefined && a.verse.bayt === b.verse.bayt;
}

/** Whether a column may not break between two lines of verse: they set one
 *  bayt (#378), or `b` is a turnover of the line of verse `a` sets or
 *  turns over (#620). */
export function sameVerseLine(a: VDTLine | undefined, b: VDTLine | undefined): boolean {
  return sameBayt(a, b) || (a?.verseLine !== undefined && b?.verseLine?.turnover === true);
}

/** Whether a stanza of the line layout is kept whole (#620): it has no
 *  more lines of verse than `keepStanzas` asks for. */
export function keepsStanzaWhole(raw: ContentBlock, resolved: ResolvedConfig): boolean {
  const stanza = raw.verse?.stanza;
  if (!stanza || !versesLineByLine(raw, resolved)) return false;
  const keep = verseLinesSettings(raw.verse!.attrs, { fontSizePx: 0, lineHeightPx: 0 }, resolved, false).keepStanzas;
  return keep > 0 && stanza.lines.length <= keep;
}

/** Whether the text after a poem goes back to the baseline grid: unless
 *  the paragraph style its fence names says `snapToGrid: false`. */
export function verseSnaps(styleId: string | undefined, resolved: ResolvedConfig): boolean {
  const key = styleId?.trim();
  return !key || resolved.paragraphStyles.find((s) => s.id === key)?.snapToGrid !== false;
}

/** `lines` (block-relative, as `resetLinePositions` sets them) moved `dy`
 *  px down their block: a 行取り heading's lines in its band (#424). */
export function shiftLinesDown(lines: VDTLine[], dy: number): VDTLine[] {
  if (dy === 0) return lines;
  for (const line of lines) {
    line.bbox.y += dy;
    line.baseline += dy;
  }
  return lines;
}

/** Whether a heading level sets the band it takes itself — a page opener
 *  (`span: 'page'`) or a heading painted from its `advancedDesign` — so a
 *  `lineSpan` (#424) does not apply to it. */
export function headingSetsOwnBand(lvl: ResolvedHeadingLevelConfig | undefined): boolean {
  return lvl !== undefined && (lvl.span === 'page' || lvl.advancedDesign.enabled);
}

/**
 * ページの左右中央 (#424): the text on `page` centred between the head and
 * the foot of its type area — across the page in vertical text, down it in
 * horizontal text — as a dedication or a part title is set on a page of its
 * own. The extent is measured from the first line box to the last one of
 * every text column (a box or a figure by its frame), and the room taken by
 * floats at the head or foot of a column is left out; every block of the
 * columns moves by the same amount, so columns and the text in them keep
 * their places relative to each other. Floats, notes and running heads stay
 * where they are. A page whose text already fills the area is left alone.
 */
export function centrePageText(page: VDTPage, reservedOf: (col: VDTColumn) => { top: number; bottom: number }): void {
  const cols = page.columns.filter((c) => c.kind !== 'side' && c.blocks.length > 0);
  if (cols.length === 0) return;
  let top = Infinity;
  let bottom = -Infinity;
  let areaTop = Infinity;
  let areaBottom = -Infinity;
  for (const col of cols) {
    const reserved = reservedOf(col);
    areaTop = Math.min(areaTop, col.bbox.y + reserved.top);
    areaBottom = Math.max(areaBottom, col.bbox.y + col.bbox.height - reserved.bottom);
    for (const b of col.blocks) {
      if (b.hidden) continue;
      const first = b.lines[0];
      const last = b.lines[b.lines.length - 1];
      const textual = first !== undefined && last !== undefined && b.type !== 'resource' && b.containerId === undefined;
      top = Math.min(top, textual ? first.bbox.y : b.bbox.y);
      bottom = Math.max(bottom, textual ? last.bbox.y + last.bbox.height : b.bbox.y + b.bbox.height);
    }
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
  const dy = (areaTop + areaBottom) / 2 - (top + bottom) / 2;
  if (dy < 0.5) return;
  const moved = new Set<VDTBlock>();
  for (const col of cols) {
    for (const b of col.blocks) {
      if (moved.has(b)) continue;
      moved.add(b);
      offsetBlock(b, 0, dy);
    }
  }
}
