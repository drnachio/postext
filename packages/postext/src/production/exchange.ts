/**
 * Paper and binding profiles as a file one user exports and another
 * imports (`.postext-production.json`), as design templates travel.
 */

import type { BindingMeasures, BindingProfile, BindingStyle, PaperProfile } from '../types/output/production.js';

export const PRODUCTION_FILE_FORMAT = 'postext-production';
export const PRODUCTION_FILE_VERSION = 1;

export interface ProductionFile {
  format: typeof PRODUCTION_FILE_FORMAT;
  version: number;
  papers: PaperProfile[];
  bindings: BindingProfile[];
}

/** Something in an imported file that was left out, and why. */
export interface ProductionImportIssue {
  where: string;
  reason: 'notAProductionFile' | 'newerVersion' | 'missingId' | 'unknownStyle' | 'badMeasure' | 'badNumber';
}

const STYLES: ReadonlySet<string> = new Set<BindingStyle>(['perfect', 'sewnSoftcover', 'caseFlat', 'caseRound']);
const MEASURES: ReadonlySet<string> = new Set<keyof BindingMeasures>([
  'spineAllowance', 'bleed', 'hingeScore', 'flapWidth', 'flapFoldInset', 'board', 'square', 'joint', 'turnIn',
  'boardSetback', 'caseSpineAllowance', 'roundSpineAllowance', 'jacketFoldAllowance', 'jacketFlapWidth', 'jacketBleed',
  'endpaperGlueStrip', 'endpaperBleed', 'safeMargin', 'designMargin',
]);

/** The file for these profiles. */
export function exportProductionProfiles(papers: readonly PaperProfile[], bindings: readonly BindingProfile[]): ProductionFile {
  return {
    format: PRODUCTION_FILE_FORMAT,
    version: PRODUCTION_FILE_VERSION,
    papers: structuredClone([...papers]),
    bindings: structuredClone([...bindings]),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function validLength(v: unknown): boolean {
  if (isNum(v)) return true;
  if (Array.isArray(v)) {
    return v.length > 0 && v.every((s) => isRecord(s) && isNum(s.mm)
      && (s.upTo === undefined || (isRecord(s.upTo) && isNum(s.upTo.width) && isNum(s.upTo.height))));
  }
  return isRecord(v) && isNum(v.ratio) && (v.min === undefined || isNum(v.min)) && (v.max === undefined || isNum(v.max))
    && (v.of === undefined || v.of === 'width' || v.of === 'height');
}

/** The profiles of a file (parsed JSON), each one checked: a profile
 *  without an id or with an unknown binding style is left out; a measure
 *  that is unknown or unreadable is dropped from its profile. What was left
 *  out is listed in `issues`. Ids are kept as written: the caller decides
 *  what to do with one the library already has. */
export function importProductionProfiles(data: unknown): {
  papers: PaperProfile[];
  bindings: BindingProfile[];
  issues: ProductionImportIssue[];
} {
  const issues: ProductionImportIssue[] = [];
  const papers: PaperProfile[] = [];
  const bindings: BindingProfile[] = [];
  if (!isRecord(data) || data.format !== PRODUCTION_FILE_FORMAT) {
    return { papers, bindings, issues: [{ where: 'file', reason: 'notAProductionFile' }] };
  }
  if (typeof data.version !== 'number' || data.version > PRODUCTION_FILE_VERSION) {
    issues.push({ where: 'file', reason: 'newerVersion' });
  }
  (Array.isArray(data.papers) ? data.papers : []).forEach((p, i) => {
    if (!isRecord(p) || typeof p.id !== 'string' || !p.id) return issues.push({ where: `papers[${i}]`, reason: 'missingId' });
    const paper = structuredClone(p) as unknown as PaperProfile;
    for (const key of ['grammage', 'bulk'] as const) {
      if (paper[key] !== undefined && !(isNum(paper[key]) && paper[key]! > 0)) {
        delete paper[key];
        issues.push({ where: `papers[${i}].${key}`, reason: 'badNumber' });
      }
    }
    if (typeof paper.name !== 'string') paper.name = paper.id;
    papers.push(paper);
  });
  (Array.isArray(data.bindings) ? data.bindings : []).forEach((b, i) => {
    if (!isRecord(b) || typeof b.id !== 'string' || !b.id) return issues.push({ where: `bindings[${i}]`, reason: 'missingId' });
    if (typeof b.style !== 'string' || !STYLES.has(b.style)) return issues.push({ where: `bindings[${i}]`, reason: 'unknownStyle' });
    const binding = structuredClone(b) as unknown as BindingProfile;
    if (typeof binding.name !== 'string') binding.name = binding.id;
    if (binding.signature !== undefined && !(isNum(binding.signature) && binding.signature > 0)) {
      delete binding.signature;
      issues.push({ where: `bindings[${i}].signature`, reason: 'badNumber' });
    }
    if (isRecord(binding.measures)) {
      for (const [key, value] of Object.entries(binding.measures)) {
        const ok = MEASURES.has(key) && validLength(value);
        if (!ok) {
          delete (binding.measures as Record<string, unknown>)[key];
          issues.push({ where: `bindings[${i}].measures.${key}`, reason: MEASURES.has(key) ? 'badNumber' : 'badMeasure' });
        }
      }
    } else if (binding.measures !== undefined) {
      delete binding.measures;
      issues.push({ where: `bindings[${i}].measures`, reason: 'badMeasure' });
    }
    bindings.push(binding);
  });
  return { papers, bindings, issues };
}
