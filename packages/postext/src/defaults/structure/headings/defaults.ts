// Default heading values: breaks, fonts, margins, levels and column balancing
// (#1278: split out of headings.ts).
import type { ResolvedHeadingBreakBeforeConfig, ResolvedHeadingAdvancedDesignConfig, HeadingAdvancedDesignConfig, HeadingBreakBeforeConfig, Dimension, ColorValue, ClosingBoxLever, KeepWithNextSplit, StretchAfterWideFloats, TrailingStep, PostextConfig, ResolvedHeadingLevelConfig, ResolvedHeadingsConfig } from '../../../types.js';
import { DEFAULT_MAIN_COLOR } from '../../shared.js';
import { resolveDesignSlot } from '../headerFooter.js';

export const DEFAULT_BREAK_BEFORE: ResolvedHeadingBreakBeforeConfig = { enabled: false, parity: 'any' };

const DEFAULT_ADVANCED_DESIGN: ResolvedHeadingAdvancedDesignConfig = {
  enabled: false,
  slot: { elements: [] },
};

export function resolveAdvancedDesign(raw?: HeadingAdvancedDesignConfig): ResolvedHeadingAdvancedDesignConfig {
  if (!raw) return { enabled: false, slot: { elements: [] } };
  return {
    enabled: raw.enabled ?? false,
    // A design text wraps unless it says otherwise (#628). A design with no
    // slot has always resolved to the running head's default slot.
    slot: raw.slot === undefined ? resolveDesignSlot(undefined, 'header') : resolveDesignSlot(raw.slot, 'heading'),
    ...(raw.minHeight ? { minHeight: raw.minHeight } : {}),
  };
}

/** A partial `breakBefore` merged field by field over `base` (the level's
 *  default, or the level a heading style applies to): setting only
 *  `parity` keeps the base's `enabled`, and vice versa. */
export function resolveBreakBefore(
  raw?: HeadingBreakBeforeConfig,
  base: ResolvedHeadingBreakBeforeConfig = DEFAULT_BREAK_BEFORE,
): ResolvedHeadingBreakBeforeConfig {
  return {
    enabled: raw?.enabled ?? base.enabled,
    parity: raw?.parity ?? base.parity,
  };
}

const DEFAULT_HEADING_FONT = 'Open Sans';
const DEFAULT_HEADING_LINE_HEIGHT: Dimension = { value: 1.2, unit: 'em' };
const DEFAULT_HEADING_COLOR: ColorValue = { ...DEFAULT_MAIN_COLOR };
const DEFAULT_HEADING_FONT_WEIGHT = 700;
export const CLOSING_BOX_LEVERS: readonly ClosingBoxLever[] = ['first', 'last', 'off'];
export const KEEP_WITH_NEXT_SPLITS: readonly KeepWithNextSplit[] = ['rules', 'fill'];

export const DEFAULT_COLUMN_BALANCING = {
  enabled: true,
  maxLinesPerHeading: 4,
  maxLinesBeforeLoose: 2,
  stretchAfterLists: true,
  maxLinesAfterList: 1,
  stretchAfterDisplays: true,
  stretchAfterFloats: true,
  maxLinesAfterFloat: 1,
  stretchAfterWideFloats: 'flush' as StretchAfterWideFloats,
  looseParagraphs: true,
  maxLooseParagraphs: 2,
  trackParagraphs: true,
  maxTracking: 10,
  fillShortColumns: false,
  trailing: true,
  trailingStep: 'lines' as TrailingStep,
  beforeSpan: true,
  closingBox: 'first' as ClosingBoxLever,
};

/**
 * Whether column balancing is on when `config` does not set
 * `headings.balancing.enabled` itself. Off in two cases:
 * - tiers of vertical text are not balanced: the flow fills the upper
 *   tier, then the next, and a chapter's last tiers end where their text
 *   ends (clreq §7.1.3.4);
 * - a page on a character grid (`cjk.grid`, #632) is filled cell by cell
 *   and line by line, the way the standards that count its lines set it
 *   (GB/T 9704: 22 lines of 28 characters): a column that ends short is
 *   left short, and no row is added above a heading. A config that turns
 *   balancing on there gets the levers that keep every character in its
 *   cell (see `pipeline/columns/columnBalancing.ts`).
 */
export function balancingOnByDefault(config: PostextConfig | undefined): boolean {
  if (config?.cjk?.grid?.enabled === true) return false;
  return config?.layout?.writingMode !== 'vertical-rl';
}

const DEFAULT_HEADING_MARGIN_TOP: Dimension = { value: 1.5, unit: 'em' };
const DEFAULT_HEADING_MARGIN_BOTTOM: Dimension = { value: 0.5, unit: 'em' };
/** No tracking: the heading's letters at their natural spacing. */
const DEFAULT_HEADING_LETTER_SPACING: Dimension = { value: 0, unit: 'pt' };

export const DEFAULT_HEADING_LEVELS: ResolvedHeadingLevelConfig[] = [
  { level: 1, fontSize: { value: 18, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { enabled: true, parity: 'always-odd' }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 2, fontSize: { value: 15, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 3, fontSize: { value: 12, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 4, fontSize: { value: 10, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 5, fontSize: { value: 9, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
  { level: 6, fontSize: { value: 8, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '', numberSeparator: ' ', italic: false, letterSpacing: DEFAULT_HEADING_LETTER_SPACING, breakBefore: { ...DEFAULT_BREAK_BEFORE }, span: 'column', advancedDesign: { ...DEFAULT_ADVANCED_DESIGN, slot: { elements: [] } }, textTransform: 'none', hidden: false, snapToGrid: true },
];

export const DEFAULT_HEADINGS_CONFIG: ResolvedHeadingsConfig = {
  fontFamily: DEFAULT_HEADING_FONT,
  lineHeight: DEFAULT_HEADING_LINE_HEIGHT,
  color: DEFAULT_HEADING_COLOR,
  textAlign: 'left',
  fontWeight: DEFAULT_HEADING_FONT_WEIGHT,
  marginTop: DEFAULT_HEADING_MARGIN_TOP,
  marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM,
  keepWithNext: true,
  keepWithNextSplit: 'rules',
  snapToGrid: true,
  columnHeadSpace: 'none',
  inlineMarks: true,
  balancing: { ...DEFAULT_COLUMN_BALANCING },
  levels: DEFAULT_HEADING_LEVELS,
};
