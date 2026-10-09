import type { DiagramStyleConfig, ResolvedDiagramStyleConfig } from '../types';
import { DEFAULT_MAIN_COLOR, colorsEqual } from './shared';

export const DEFAULT_DIAGRAM_STYLE_CONFIG: ResolvedDiagramStyleConfig = {
  singleInk: false,
  inkColor: DEFAULT_MAIN_COLOR,
  inlineFonts: true,
};

export function resolveDiagramStyleConfig(partial?: DiagramStyleConfig): ResolvedDiagramStyleConfig {
  if (!partial) return { ...DEFAULT_DIAGRAM_STYLE_CONFIG };
  return {
    singleInk: partial.singleInk ?? DEFAULT_DIAGRAM_STYLE_CONFIG.singleInk,
    inkColor: partial.inkColor ?? DEFAULT_DIAGRAM_STYLE_CONFIG.inkColor,
    inlineFonts: partial.inlineFonts ?? DEFAULT_DIAGRAM_STYLE_CONFIG.inlineFonts,
  };
}

export function stripDiagramStyleDefaults(
  diagramStyle?: DiagramStyleConfig,
): DiagramStyleConfig | undefined {
  if (!diagramStyle) return undefined;
  const result: DiagramStyleConfig = {};
  let hasOverride = false;
  if (diagramStyle.singleInk !== undefined && diagramStyle.singleInk !== DEFAULT_DIAGRAM_STYLE_CONFIG.singleInk) {
    result.singleInk = diagramStyle.singleInk;
    hasOverride = true;
  }
  if (diagramStyle.inkColor !== undefined && !colorsEqual(diagramStyle.inkColor, DEFAULT_DIAGRAM_STYLE_CONFIG.inkColor)) {
    result.inkColor = diagramStyle.inkColor;
    hasOverride = true;
  }
  if (diagramStyle.inlineFonts !== undefined && diagramStyle.inlineFonts !== DEFAULT_DIAGRAM_STYLE_CONFIG.inlineFonts) {
    result.inlineFonts = diagramStyle.inlineFonts;
    hasOverride = true;
  }
  return hasOverride ? result : undefined;
}
