/** The Checks panel's words for a preflight finding (#605). */

import type { SandboxLabels } from '../types/index.js';
import type { PreflightCheck } from '../warnings/types.js';
import { fill } from './fillTokens.js';

/** Process channels as the PDF names their plates. */
const PLATE_NAMES: Record<string, string> = { c: 'Cyan', m: 'Magenta', y: 'Yellow', k: 'Black' };

export function preflightTitle(check: PreflightCheck, labels: SandboxLabels): string {
  switch (check.kind) {
    case 'lowImageResolution': return labels.preflightLowImageResolution;
    case 'declaredPixelsMismatch': return labels.preflightDeclaredPixelsMismatch;
    case 'rgbImage': return labels.preflightRgbImage;
    case 'thinRule': return labels.preflightThinRule;
    case 'smallProcessText': return labels.preflightSmallProcessText;
    case 'inkLimit': return labels.preflightInkLimit;
    case 'spotInks': return labels.preflightSpotInks;
    case 'spotInkConflict': return labels.preflightSpotInkConflict;
    case 'spotInkName': return labels.preflightSpotInkName;
    case 'spotInkSimilar': return labels.preflightSpotInkSimilar;
    case 'platesJob': return labels.preflightPlatesJob;
    case 'offPlateInk': return labels.preflightOffPlateInk;
    case 'offPlateCmyk': return labels.preflightOffPlateCmyk;
    case 'plateUndefined': return labels.preflightPlateUndefined;
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
    case 'declaredPixelsMismatch':
      return fill(labels.preflightDeclaredPixelsMismatchDetail, {
        declared: `${check.declared.width}×${check.declared.height}`,
        actual: `${check.actual.width}×${check.actual.height}`,
      });
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
    case 'spotInks':
      return fill(labels.preflightSpotInksDetail, { inks: check.inks.join(', ') });
    case 'spotInkConflict':
      return fill(labels.preflightSpotInkConflictDetail, { ink: check.ink });
    case 'spotInkName':
      return fill(check.problem === 'reserved' ? labels.preflightSpotInkNameReservedDetail : labels.preflightSpotInkNameLongDetail, { ink: check.ink });
    case 'spotInkSimilar':
      return fill(labels.preflightSpotInkSimilarDetail, { inks: check.inks.map((i) => `“${i}”`).join(', ') });
    case 'platesJob':
      return fill(labels.preflightPlatesJobDetail, { plates: check.plates.map((i) => `“${i}”`).join(', '), images: check.images.map((i) => `“${i}”`).join(', ') });
    case 'offPlateInk':
      return fill(labels.preflightOffPlateInkDetail, { ink: check.ink });
    case 'offPlateCmyk':
      return fill(labels.preflightOffPlateCmykDetail, { color: check.color, channels: check.channels.map((c) => PLATE_NAMES[c] ?? c).join(', ') });
    case 'plateUndefined':
      return fill(labels.preflightPlateUndefinedDetail, { plate: check.plate });
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
