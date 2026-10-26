import type { ColorValue } from './page.js';

export interface SyncIndicatorConfig {
  enabled: boolean;
  color?: ColorValue;
}

export interface LooseLineHighlightConfig {
  enabled: boolean;
  color?: ColorValue;
  /** Threshold as a multiplier of the normal space width. Lines whose
   *  justified space ratio exceeds this are highlighted. */
  threshold?: number;
}

export interface WarningsToggleConfig {
  missingFont?: boolean;
  looseLines?: boolean;
  headingHierarchy?: boolean;
  consecutiveHeadings?: boolean;
  listAfterHeading?: boolean;
  designIssues?: boolean;
}

export interface ResolvedWarningsToggleConfig {
  missingFont: boolean;
  looseLines: boolean;
  headingHierarchy: boolean;
  consecutiveHeadings: boolean;
  listAfterHeading: boolean;
  designIssues: boolean;
}

export interface DebugConfig {
  cursorSync?: SyncIndicatorConfig;
  selectionSync?: SyncIndicatorConfig;
  looseLineHighlight?: LooseLineHighlightConfig;
  pageNegative?: { enabled: boolean };
  warnings?: WarningsToggleConfig;
  /** Which fit marks the Sandbox canvas draws over composed pages by
   *  default (#1160): `all` (the scale badges of text and pictures too),
   *  `problems` (default since #1200: frames that do not fit, looks the
   *  config does not have) or `none`. A viewer's own choice in the canvas
   *  toolbar wins. Never painted in any output. */
  fitMarks?: FitMarksMode;
  /** A frame set at this scale or larger shows no scale badge (0.95 hides
   *  95 % and up). Default 1: every scaled frame is marked. */
  fitMarksMinScale?: number;
}

/** What the Sandbox canvas marks of how composed frames fit (#1160). */
export type FitMarksMode = 'all' | 'problems' | 'none';

export interface ResolvedDebugConfig {
  cursorSync: { enabled: boolean; color: ColorValue };
  selectionSync: { enabled: boolean; color: ColorValue };
  looseLineHighlight: { enabled: boolean; color: ColorValue; threshold: number };
  pageNegative: { enabled: boolean };
  warnings: ResolvedWarningsToggleConfig;
  fitMarks: FitMarksMode;
  fitMarksMinScale: number;
}
