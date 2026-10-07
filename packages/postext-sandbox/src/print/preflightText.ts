/** The Checks panel's words for a preflight finding (#605). */

import type { SandboxLabels } from '../types';
import type { PreflightCheck } from '../warnings/types';
import { fill } from './fillTokens';

export function preflightTitle(check: PreflightCheck, labels: SandboxLabels): string {
  switch (check.kind) {
    case 'lowImageResolution': return labels.preflightLowImageResolution;
    case 'rgbImage': return labels.preflightRgbImage;
    case 'thinRule': return labels.preflightThinRule;
    case 'smallProcessText': return labels.preflightSmallProcessText;
    case 'inkLimit': return labels.preflightInkLimit;
    case 'safeZone': return labels.preflightSafeZone;
    case 'nearTrim': return labels.preflightNearTrim;
    case 'masterFonts': return labels.preflightMasterFonts;
    case 'masterRgb': return labels.preflightMasterRgb;
    case 'masterTransparency': return labels.preflightMasterTransparency;
  }
}

function edge(e: 'top' | 'right' | 'bottom' | 'left', labels: SandboxLabels): string {
  switch (e) {
    case 'top': return labels.preflightEdgeTop;
    case 'right': return labels.preflightEdgeRight;
    case 'bottom': return labels.preflightEdgeBottom;
    case 'left': return labels.preflightEdgeLeft;
  }
}

export function preflightDetail(check: PreflightCheck, labels: SandboxLabels): string {
  switch (check.kind) {
    case 'lowImageResolution':
      return fill(labels.preflightLowImageResolutionDetail, { ppi: check.ppi, min: check.minimum });
    case 'rgbImage':
      return check.converted ? labels.preflightRgbImageConverted : labels.preflightRgbImageKept;
    case 'thinRule':
      return fill(labels.preflightThinRuleDetail, { width: check.widthPt, min: check.minimumPt });
    case 'smallProcessText':
      return fill(labels.preflightSmallProcessTextDetail, { size: check.sizePt, inks: check.inks, text: check.text });
    case 'inkLimit':
      return fill(labels.preflightInkLimitDetail, {
        color: check.color === 'rich-black' ? labels.preflightRichBlackRecipe : check.color,
        coverage: check.coverage,
        limit: check.limit,
      });
    case 'safeZone':
      return fill(labels.preflightSafeZoneDetail, { distance: check.distanceMm, zone: check.safeZoneMm, text: check.text });
    case 'nearTrim':
      return fill(labels.preflightNearTrimDetail, { gap: check.gapMm, edge: edge(check.edge, labels) });
    case 'masterFonts':
      return fill(labels.preflightMasterDetail, { name: check.name, detail: check.fonts.join(', ') });
    case 'masterRgb':
      return check.name;
    case 'masterTransparency':
      return fill(labels.preflightMasterDetail, { name: check.name, detail: labels.preflightMasterTransparencyX1a });
  }
}
