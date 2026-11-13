/** The Checks panel's words for a preflight finding (#605). */

import type { SandboxLabels } from '../types/index.js';
import type { PreflightCheck } from '../warnings/types.js';
import type { InkFinish } from 'postext';
import { fill } from './fillTokens.js';
import { finishText } from '../controls/color/inkFinish.js';

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
    case 'spotInkUndefined': return labels.preflightSpotInkUndefined;
    case 'overprintWhite': return labels.preflightOverprintWhite;
    case 'platesJob': return labels.preflightPlatesJob;
    case 'offPlateInk': return labels.preflightOffPlateInk;
    case 'offPlateCmyk': return labels.preflightOffPlateCmyk;
    case 'offPlateColor': return labels.preflightOffPlateColor;
    case 'plateUndefined': return labels.preflightPlateUndefined;
    case 'cmykImageForeign': return labels.preflightCmykImageForeign;
    case 'safeZone': return labels.preflightSafeZone;
    case 'nearTrim': return labels.preflightNearTrim;
    case 'masterFonts': return labels.preflightMasterFonts;
    case 'masterRgb': return labels.preflightMasterRgb;
    case 'masterTransparency': return labels.preflightMasterTransparency;
    case 'masterInks': return labels.preflightMasterInks;
    // The special-ink and die-cut findings (#1563, #1565) the engine adds:
    // read by kind, so the panel names them whatever shape they take.
    default: return specialFindingTitle(check as unknown as SpecialFinding, labels);
  }
}

/** A special-ink or die-cut finding as the panel reads it (#1570). Its
 *  fields are read defensively: an ink by `ink` (or `name`), a die by
 *  `die` (or `source`, `id`), a finish as a kind or an `InkFinish`. */
interface SpecialFinding {
  kind: string;
  ink?: string;
  name?: string;
  finish?: InkFinish | InkFinish['kind'];
  die?: string;
  first?: string[];
  last?: string[];
  source?: string;
  id?: string;
}

const SPECIAL_KINDS = ['spotInkFinish', 'inkPressOrder', 'whiteInkOnWhite', 'dieCutText', 'dieCutTrim', 'dieCutGutter'] as const;

/** Whether a preflight kind is one of the special-ink or die-cut findings. */
export function isSpecialFindingKind(kind: string): kind is (typeof SPECIAL_KINDS)[number] {
  return (SPECIAL_KINDS as readonly string[]).includes(kind);
}

function specialFindingTitle(check: SpecialFinding, labels: SandboxLabels): string {
  switch (check.kind) {
    case 'spotInkFinish': return labels.preflightSpotInkFinish;
    case 'inkPressOrder': return labels.preflightInkPressOrder;
    case 'whiteInkOnWhite': return labels.preflightWhiteInkOnWhite;
    case 'dieCutText': return labels.preflightDieCutText;
    case 'dieCutTrim': return labels.preflightDieCutTrim;
    case 'dieCutGutter': return labels.preflightDieCutGutter;
    default: return check.kind;
  }
}

/** Ink names for a detail line, or a dash when there are none. */
const list = (names: string[] | undefined): string => (names && names.length > 0 ? names.join(', ') : '—');

function specialFindingDetail(check: SpecialFinding, labels: SandboxLabels): string {
  const ink = check.ink ?? check.name ?? '';
  const die = check.die ?? check.source ?? check.id ?? '';
  const finish = typeof check.finish === 'string' ? { kind: check.finish } : check.finish;
  switch (check.kind) {
    case 'spotInkFinish': return fill(labels.preflightSpotInkFinishDetail, { ink, finish: finish ? finishText(finish, labels) : '—' });
    case 'inkPressOrder': return fill(labels.preflightInkPressOrderDetail, { first: list(check.first), last: list(check.last) });
    case 'whiteInkOnWhite': return fill(labels.preflightWhiteInkOnWhiteDetail, { ink });
    case 'dieCutText': return fill(labels.preflightDieCutTextDetail, { die });
    case 'dieCutTrim': return fill(labels.preflightDieCutTrimDetail, { die });
    case 'dieCutGutter': return fill(labels.preflightDieCutGutterDetail, { die });
    default: return '';
  }
}

/** A projection's detail with how far it lands, when that is known. */
function withDeltaE(detail: string, deltaE: number | undefined, labels: SandboxLabels): string {
  return deltaE === undefined ? detail : `${detail} ${fill(labels.preflightPlateDeltaE, { deltaE: deltaE.toFixed(1) })}`;
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
    case 'spotInkName': {
      const detail = {
        reserved: labels.preflightSpotInkNameReservedDetail,
        process: labels.preflightSpotInkNameProcessDetail,
        control: labels.preflightSpotInkNameControlDetail,
        tooLong: labels.preflightSpotInkNameLongDetail,
      }[check.problem];
      return fill(detail, { ink: check.ink, written: check.written });
    }
    case 'spotInkUndefined':
      return fill(labels.preflightSpotInkUndefinedDetail, { ink: check.ink, file: check.resourceId ?? check.fileId });
    case 'spotInkSimilar':
      return fill(labels.preflightSpotInkSimilarDetail, { inks: check.inks.map((i) => `“${i}”`).join(', ') });
    case 'overprintWhite':
      return fill(labels.preflightOverprintWhiteDetail, { color: check.color });
    case 'platesJob':
      return fill(labels.preflightPlatesJobDetail, { plates: check.plates.map((i) => `“${i}”`).join(', '), images: check.images.map((i) => `“${i}”`).join(', ') });
    case 'offPlateInk':
      return withDeltaE(fill(labels.preflightOffPlateInkDetail, { ink: check.ink }), check.deltaE, labels);
    case 'offPlateCmyk':
      return withDeltaE(fill(labels.preflightOffPlateCmykDetail, { color: check.color, channels: check.channels.map((c) => PLATE_NAMES[c] ?? c).join(', ') }), check.deltaE, labels);
    case 'offPlateColor':
      return withDeltaE(fill(labels.preflightOffPlateColorDetail, { color: check.color }), check.deltaE, labels);
    case 'plateUndefined':
      return fill(labels.preflightPlateUndefinedDetail, { plate: check.plate });
    case 'cmykImageForeign':
      return fill(labels.preflightCmykImageForeignDetail, { file: check.resourceId ?? check.fileId, profile: check.profile });
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
    case 'masterInks':
      return fill(check.problem === 'offPlates' ? labels.preflightMasterInksOffPlatesDetail : check.problem === 'renamed' ? labels.preflightMasterInksRenamedDetail : labels.preflightMasterInksUnknownDetail, { name: check.name, inks: check.inks.map((i) => `“${i}”`).join(', ') });
    default:
      return specialFindingDetail(check as unknown as SpecialFinding, labels);
  }
}
