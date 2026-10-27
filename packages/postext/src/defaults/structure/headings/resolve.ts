// Resolving the headings config and the per-level overrides
// (#1278: split out of headings.ts).
import type { HeadingsConfig, ResolvedHeadingsConfig, KeepWithNextSplit, ColumnHeadSpace, StretchAfterWideFloats, TrailingStep, ClosingBoxLever, ResolvedHeadingLevelConfig, HeadingLevelConfig } from '../../../types.js';
import { startEndAsLeftRight } from '../../shared.js';
import { isDropCap } from '../../text/dropCap.js';
import { withFigureStyle } from '../../../fonts/figureStyle.js';
import { DEFAULT_HEADINGS_CONFIG, DEFAULT_COLUMN_BALANCING, DEFAULT_HEADING_LEVELS, KEEP_WITH_NEXT_SPLITS, CLOSING_BOX_LEVERS, resolveBreakBefore, resolveAdvancedDesign } from './defaults.js';

export function resolveHeadingsConfig(partial?: HeadingsConfig): ResolvedHeadingsConfig {
  if (!partial) {
    return {
      ...DEFAULT_HEADINGS_CONFIG,
      balancing: { ...DEFAULT_COLUMN_BALANCING },
      levels: DEFAULT_HEADING_LEVELS.map((l) => ({ ...l })),
    };
  }

  // The figures (#1237) name the family; a level's own win.
  const generalFont = withFigureStyle(partial.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily, partial.figureStyle);
  const generalLineHeight = partial.lineHeight ?? DEFAULT_HEADINGS_CONFIG.lineHeight;
  const generalColor = partial.color ?? DEFAULT_HEADINGS_CONFIG.color;
  const generalTextAlign = startEndAsLeftRight(partial.textAlign ?? DEFAULT_HEADINGS_CONFIG.textAlign);
  const generalFontWeight = partial.fontWeight ?? DEFAULT_HEADINGS_CONFIG.fontWeight;
  const generalMarginTop = partial.marginTop ?? DEFAULT_HEADINGS_CONFIG.marginTop;
  const generalMarginBottom = partial.marginBottom ?? DEFAULT_HEADINGS_CONFIG.marginBottom;
  const generalKeepWithNext = partial.keepWithNext ?? DEFAULT_HEADINGS_CONFIG.keepWithNext;
  const keepWithNextSpread = partial.keepWithNextSpread === true;
  // Any other value reads as the default.
  const keepWithNextSplit = KEEP_WITH_NEXT_SPLITS.includes(partial.keepWithNextSplit as KeepWithNextSplit)
    ? partial.keepWithNextSplit!
    : DEFAULT_HEADINGS_CONFIG.keepWithNextSplit;
  const generalSnapToGrid = partial.snapToGrid ?? DEFAULT_HEADINGS_CONFIG.snapToGrid;
  // Any other value reads as the default.
  const columnHeadSpace: ColumnHeadSpace = partial.columnHeadSpace === 'remainder' ? 'remainder' : DEFAULT_HEADINGS_CONFIG.columnHeadSpace;
  const inlineMarks = partial.inlineMarks ?? DEFAULT_HEADINGS_CONFIG.inlineMarks;
  const balancing = partial.balancing
    ? {
        enabled: partial.balancing.enabled ?? DEFAULT_COLUMN_BALANCING.enabled,
        maxLinesPerHeading:
          partial.balancing.maxLinesPerHeading ?? DEFAULT_COLUMN_BALANCING.maxLinesPerHeading,
        maxLinesBeforeLoose:
          partial.balancing.maxLinesBeforeLoose ?? DEFAULT_COLUMN_BALANCING.maxLinesBeforeLoose,
        stretchAfterLists:
          partial.balancing.stretchAfterLists ?? DEFAULT_COLUMN_BALANCING.stretchAfterLists,
        maxLinesAfterList:
          partial.balancing.maxLinesAfterList ?? DEFAULT_COLUMN_BALANCING.maxLinesAfterList,
        stretchAfterDisplays:
          partial.balancing.stretchAfterDisplays ?? DEFAULT_COLUMN_BALANCING.stretchAfterDisplays,
        stretchAfterFloats:
          partial.balancing.stretchAfterFloats ?? DEFAULT_COLUMN_BALANCING.stretchAfterFloats,
        maxLinesAfterFloat:
          partial.balancing.maxLinesAfterFloat ?? DEFAULT_COLUMN_BALANCING.maxLinesAfterFloat,
        // Any other value reads as the default.
        stretchAfterWideFloats: partial.balancing.stretchAfterWideFloats === 'always'
          ? 'always' as StretchAfterWideFloats
          : DEFAULT_COLUMN_BALANCING.stretchAfterWideFloats,
        looseParagraphs:
          partial.balancing.looseParagraphs ?? DEFAULT_COLUMN_BALANCING.looseParagraphs,
        maxLooseParagraphs:
          partial.balancing.maxLooseParagraphs ?? DEFAULT_COLUMN_BALANCING.maxLooseParagraphs,
        trackParagraphs:
          partial.balancing.trackParagraphs ?? DEFAULT_COLUMN_BALANCING.trackParagraphs,
        maxTracking:
          partial.balancing.maxTracking ?? DEFAULT_COLUMN_BALANCING.maxTracking,
        fillShortColumns:
          partial.balancing.fillShortColumns ?? DEFAULT_COLUMN_BALANCING.fillShortColumns,
        trailing:
          partial.balancing.trailing ?? DEFAULT_COLUMN_BALANCING.trailing,
        // Any other value reads as the default.
        trailingStep: partial.balancing.trailingStep === 'grid' ? 'grid' as TrailingStep : DEFAULT_COLUMN_BALANCING.trailingStep,
        beforeSpan:
          partial.balancing.beforeSpan ?? DEFAULT_COLUMN_BALANCING.beforeSpan,
        // Any other value reads as the default.
        closingBox: CLOSING_BOX_LEVERS.includes(partial.balancing.closingBox as ClosingBoxLever)
          ? partial.balancing.closingBox!
          : DEFAULT_COLUMN_BALANCING.closingBox,
        // Absent unless `'off'` (#632), so every other configuration
        // resolves as before.
        ...(partial.balancing.gridLines === 'off' ? { gridLines: 'off' as const } : {}),
      }
    : { ...DEFAULT_COLUMN_BALANCING };

  const levels: ResolvedHeadingLevelConfig[] = DEFAULT_HEADING_LEVELS.map((def) => {
    const override = partial.levels?.find((l) => l.level === def.level);
    return {
      level: def.level,
      fontSize: override?.fontSize ?? def.fontSize,
      lineHeight: override?.lineHeight ?? generalLineHeight,
      fontFamily: withFigureStyle(override?.fontFamily ?? generalFont, override?.figureStyle ?? partial.figureStyle),
      color: override?.color ?? generalColor,
      fontWeight: override?.fontWeight ?? generalFontWeight,
      marginTop: override?.marginTop ?? generalMarginTop,
      marginBottom: override?.marginBottom ?? generalMarginBottom,
      numberingTemplate: override?.numberingTemplate ?? def.numberingTemplate,
      numberSeparator: override?.numberSeparator ?? def.numberSeparator,
      ...(override?.numberPosition === 'replace' ? { numberPosition: 'replace' as const } : {}),
      italic: override?.italic ?? def.italic,
      letterSpacing: override?.letterSpacing ?? def.letterSpacing,
      breakBefore: resolveBreakBefore(override?.breakBefore, def.breakBefore),
      span: override?.span ?? def.span,
      // Absent unless turned off (#539): every other configuration
      // resolves as before.
      ...(override?.spanBreak === false ? { spanBreak: false } : {}),
      advancedDesign: resolveAdvancedDesign(override?.advancedDesign),
      textTransform: override?.textTransform ?? def.textTransform,
      hidden: override?.hidden ?? def.hidden,
      snapToGrid: override?.snapToGrid ?? generalSnapToGrid,
      // The Japanese heading fields (#424) stay absent unless set, so
      // every other configuration resolves as before.
      ...headingPlacementFields(override),
    };
  });

  return { fontFamily: generalFont, lineHeight: generalLineHeight, color: generalColor, textAlign: generalTextAlign, fontWeight: generalFontWeight, marginTop: generalMarginTop, marginBottom: generalMarginBottom, keepWithNext: generalKeepWithNext, ...(keepWithNextSpread ? { keepWithNextSpread } : {}), keepWithNextSplit, snapToGrid: generalSnapToGrid, columnHeadSpace, inlineMarks, balancing, levels };
}

/** A level's `lineSpan`, `indent` and `jidori` (#424) and its
 *  `firstLineIndent` (#636) as they resolve: each present only when set to
 *  something that takes effect (a whole number of lines from 1, a non-zero
 *  indent, a width over one character),
 *  so a configuration without them resolves exactly as before. */
export function headingPlacementFields(
  partial: Pick<HeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> | undefined,
): Pick<ResolvedHeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> {
  const out: Pick<ResolvedHeadingLevelConfig, 'lineSpan' | 'indent' | 'firstLineIndent' | 'jidori' | 'dropCap'> = {};
  const lineSpan = partial?.lineSpan;
  if (typeof lineSpan === 'number' && Number.isFinite(lineSpan) && lineSpan >= 1) out.lineSpan = Math.round(lineSpan);
  if (partial?.indent && partial.indent.value !== 0) out.indent = partial.indent;
  if (partial?.firstLineIndent && partial.firstLineIndent.value !== 0) out.firstLineIndent = partial.firstLineIndent;
  const jidori = partial?.jidori;
  if (typeof jidori === 'number' && Number.isFinite(jidori) && jidori > 1) out.jidori = jidori;
  // The drop cap of the paragraph after the heading (#623).
  if (isDropCap(partial?.dropCap)) out.dropCap = partial.dropCap;
  return out;
}

/** The level fields a heading style (or any partial level config) sets,
 *  resolved to their final shape — `breakBefore` and `advancedDesign`
 *  normalised, everything else passed through — so they can be merged
 *  over a resolved level with a spread. `breakBefore` is resolved on its
 *  own here (unset fields as for a level without a break); a heading
 *  style's break is merged over its level's instead (see
 *  `createHeadingLevelResolver`). */
export function resolveHeadingLevelOverrides(
  partial: Omit<HeadingLevelConfig, 'level' | 'numberingTemplate'>,
): Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>> {
  const out: Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>> = {};
  if (partial.fontSize !== undefined) out.fontSize = partial.fontSize;
  if (partial.lineHeight !== undefined) out.lineHeight = partial.lineHeight;
  if (partial.fontFamily !== undefined) out.fontFamily = withFigureStyle(partial.fontFamily, partial.figureStyle);
  if (partial.figureStyle !== undefined) out.figureStyle = partial.figureStyle;
  if (partial.color !== undefined) out.color = partial.color;
  if (partial.fontWeight !== undefined) out.fontWeight = partial.fontWeight;
  if (partial.marginTop !== undefined) out.marginTop = partial.marginTop;
  if (partial.marginBottom !== undefined) out.marginBottom = partial.marginBottom;
  if (partial.numberSeparator !== undefined) out.numberSeparator = partial.numberSeparator;
  if (partial.numberPosition === 'replace' || partial.numberPosition === 'before') out.numberPosition = partial.numberPosition;
  if (partial.italic !== undefined) out.italic = partial.italic;
  if (partial.letterSpacing !== undefined) out.letterSpacing = partial.letterSpacing;
  if (partial.breakBefore !== undefined) out.breakBefore = resolveBreakBefore(partial.breakBefore);
  if (partial.span !== undefined) out.span = partial.span;
  if (partial.spanBreak !== undefined) out.spanBreak = partial.spanBreak !== false;
  if (partial.advancedDesign !== undefined) out.advancedDesign = resolveAdvancedDesign(partial.advancedDesign);
  if (partial.textTransform !== undefined) out.textTransform = partial.textTransform;
  if (partial.hidden !== undefined) out.hidden = partial.hidden;
  if (partial.snapToGrid !== undefined) out.snapToGrid = partial.snapToGrid;
  // A style that sets one of them to nothing (`lineSpan: 0`, `indent: 0`)
  // takes it off its level's.
  if (partial.lineSpan !== undefined) out.lineSpan = headingPlacementFields(partial).lineSpan;
  if (partial.indent !== undefined) out.indent = headingPlacementFields(partial).indent;
  if (partial.firstLineIndent !== undefined) out.firstLineIndent = headingPlacementFields(partial).firstLineIndent;
  if (partial.jidori !== undefined) out.jidori = headingPlacementFields(partial).jidori;
  // `dropCap: false` takes the level's off.
  if (partial.dropCap !== undefined) out.dropCap = headingPlacementFields(partial).dropCap;
  return out;
}
