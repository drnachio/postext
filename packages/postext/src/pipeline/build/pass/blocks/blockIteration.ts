// What the steps of a loop split into modules share (#1276).
import type { ContentBlock, ListKind } from '../../../../parse/types.js';
import type { ParagraphContainer } from '../../../callouts/paragraphContainers.js';
import type { VDTColumn, VDTPage, VDTBlockType, VDTBlock, VDTLine } from '../../../../vdt.js';
import type { BlockMeasureContext, MeasuredContentBlock, MeasureContentBlockOptions } from '../../../blocks/measureContentBlock.js';
import type { BlockStyle } from '../../../styles.js';
import type { InlineAside } from '../../passTypes.js';
import type { BlockKind } from '../../../blocks/buildBlockKind.js';
import type { MeasuredBlock, BreakTrace, LineInsetStep } from '../../../../measure/types.js';
import type { MathRender } from '../../../../math/types.js';
import type { MeasuredDropCap } from '../../../text/dropCap.js';
import type { ListBulletStyle } from '../../../text/lists.js';

/** How a step ends its turn of the loop: as `continue` or `break` would, or
 *  by falling through to the next step (undefined). */
export type StepJump = 'continue' | 'break' | undefined;

/** One block's turn of the placement loop: the bindings its steps share.
 *  Reassigned ones live here; the others are copied in once made. */
export interface BlockIteration {
  /** The loop's own index; a step that moves it, the loop reads back. */
  blockIdx: number;
  rawBlock: ContentBlock;
  id: string;
  paragraphContainer: ParagraphContainer | undefined;
  isContainerTail: boolean;
  col: VDTColumn;
  blockMeasureCtx: BlockMeasureContext;
  collapseTail: boolean;
  styleOverride: BlockStyle | undefined;
  looseLines: number | undefined;
  tryLoose: boolean;
  measureWidth: number;
  blockPage: VDTPage;
  figureGrowPx: number;
  figureDelta: { figureHeightDelta: number; } | { figureHeightDelta?: undefined; };
  measuredBlock: MeasuredContentBlock | null;
  asideWanted: boolean;
  inlineAside: InlineAside | null;
  kind: BlockKind;
  contentBlock: ContentBlock;
  measured: MeasuredBlock;
  prefixLen: number;
  absoluteSourceMap: number[];
  mathDisplayRender: MathRender | undefined;
  capInfo: MeasuredDropCap | undefined;
  letterSpacingPx: number | undefined;
  runtTracking: number | undefined;
  vdtType: VDTBlockType;
  headingLevel: number | undefined;
  numberPrefix: string | undefined;
  numberSeparator: string | undefined;
  headingNumber: number | undefined;
  listBullet: ListBulletStyle | undefined;
  listDepth: number | undefined;
  listKind: ListKind | undefined;
  bulletXOffsetInColumn: number;
  strikethroughText: boolean;
  hiddenHeading: boolean;
  lineSpan: number | undefined;
  style: BlockStyle;
  finalizeListItem: (blk: VDTBlock, isFirstPart: boolean) => void;
  nextBlock: ContentBlock | null;
  nextIsListItem: boolean;
  itemGapPx: (bullet: NonNullable<ListBulletStyle | undefined>) => number;
  nextIsHeading: boolean;
  shouldSnapToGrid: boolean;
  canSplit: boolean;
  remainingLines: VDTLine[];
  partIndex: number;
  shortColumnMoves: number;
  columnEndHyphenRetried: boolean;
  guardedColumnEnds: (mode: false | "withinPage", splitAt: number, lineCount: number, fullColumn: number, page: VDTPage, columnIndex: number) => number[];
  paragraphLines: VDTLine[];
  paragraphBreaks: BreakTrace | undefined;
  guardedEnds: readonly number[];
  columnEndHyphenPart: number;
  brokenForWidth: number;
  laterWidths: { fromLine: number; columnWidth: number }[];
  wrapInsets: LineInsetStep[];
  wrapsBeside: boolean;
  rebreaksForColumn: boolean;
  measureForColumns: (extra: MeasureContentBlockOptions) => MeasuredContentBlock | null;
  endsWithColon: boolean;
  nextIsVerse: boolean;
}
