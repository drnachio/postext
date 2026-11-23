/**
 * Paper and binding profiles as a file one user exports and another
 * imports (`.postext-production.json`), as design templates travel.
 */

import type { BindingMeasures, BindingProfile, BindingStyle, PaperProfile } from '../types/output/production.js';
import { isNum, isRecord } from './guards.js';

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
  reason: 'notAProductionFile' | 'newerVersion' | 'missingId' | 'unknownStyle' | 'badMeasure' | 'badNumber' | 'badText';
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

const isTrim = (v: unknown): boolean => isRecord(v) && isNum(v.width) && isNum(v.height);

/** `accepts` as written, or undefined when any part of it does not read:
 *  trims with a width and a height, spine limits as numbers. */
function validAccepts(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const { trim, spine } = v;
  if (trim !== undefined && !(isRecord(trim) && (trim.min === undefined || isTrim(trim.min)) && (trim.max === undefined || isTrim(trim.max)))) return false;
  if (spine !== undefined && !(isRecord(spine) && (spine.min === undefined || isNum(spine.min)) && (spine.max === undefined || isNum(spine.max)))) return false;
  return true;
}

/** Drops each named field that is present but not a string. */
function keepStrings(o: Record<string, unknown>, keys: readonly string[], where: string, issues: ProductionImportIssue[]): void {
  for (const key of keys) {
    if (o[key] !== undefined && typeof o[key] !== 'string') {
      delete o[key];
      issues.push({ where: `${where}.${key}`, reason: 'badText' });
    }
  }
}

function validLength(v: unknown): boolean {
  if (isNum(v)) return true;
  if (Array.isArray(v)) {
    return v.length > 0 && v.every((s) => isRecord(s) && isNum(s.mm)
      && (s.upTo === undefined || (isRecord(s.upTo) && isNum(s.upTo.width) && isNum(s.upTo.height))));
  }
  return isRecord(v) && isNum(v.ratio) && (v.min === undefined || isNum(v.min)) && (v.max === undefined || isNum(v.max))
    && (v.of === undefined || v.of === 'width' || v.of === 'height');
}

/** A paper profile as read from untrusted data, or undefined when it has
 *  no id. Fields that do not read are dropped and listed in `issues`. */
export function readPaperProfile(p: unknown, where: string, issues: ProductionImportIssue[]): PaperProfile | undefined {
  if (!isRecord(p) || typeof p.id !== 'string' || !p.id) {
    issues.push({ where, reason: 'missingId' });
    return undefined;
  }
  const paper = structuredClone(p) as unknown as PaperProfile;
  for (const key of ['grammage', 'bulk'] as const) {
    if (paper[key] !== undefined && !(isNum(paper[key]) && paper[key]! > 0)) {
      delete paper[key];
      issues.push({ where: `${where}.${key}`, reason: 'badNumber' });
    }
  }
  for (const [key, value] of Object.entries(paper)) {
    // A paper's other fields are Folio's: words and numbers only.
    if (value !== undefined && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)) && typeof value !== 'boolean') {
      delete (paper as unknown as Record<string, unknown>)[key];
      issues.push({ where: `${where}.${key}`, reason: 'badText' });
    }
  }
  keepStrings(paper as unknown as Record<string, unknown>, ['name', 'supplier', 'commercialName'], where, issues);
  if (typeof paper.name !== 'string') paper.name = paper.id;
  return paper;
}

/** A binding profile as read from untrusted data, or undefined when it has
 *  no id or an unknown style. Fields that do not read are dropped and
 *  listed in `issues`. */
export function readBindingProfile(b: unknown, where: string, issues: ProductionImportIssue[]): BindingProfile | undefined {
  if (!isRecord(b) || typeof b.id !== 'string' || !b.id) {
    issues.push({ where, reason: 'missingId' });
    return undefined;
  }
  if (typeof b.style !== 'string' || !STYLES.has(b.style)) {
    issues.push({ where, reason: 'unknownStyle' });
    return undefined;
  }
  const binding = structuredClone(b) as unknown as BindingProfile;
  keepStrings(binding as unknown as Record<string, unknown>, ['name', 'printer'], where, issues);
  if (typeof binding.name !== 'string') binding.name = binding.id;
  if (binding.accepts !== undefined && !validAccepts(binding.accepts)) {
    delete binding.accepts;
    issues.push({ where: `${where}.accepts`, reason: 'badNumber' });
  }
  if (binding.signature !== undefined && !(isNum(binding.signature) && binding.signature > 0)) {
    delete binding.signature;
    issues.push({ where: `${where}.signature`, reason: 'badNumber' });
  }
  if (isRecord(binding.measures)) {
    for (const [key, value] of Object.entries(binding.measures)) {
      if (!(MEASURES.has(key) && validLength(value))) {
        delete (binding.measures as Record<string, unknown>)[key];
        issues.push({ where: `${where}.measures.${key}`, reason: MEASURES.has(key) ? 'badNumber' : 'badMeasure' });
      }
    }
  } else if (binding.measures !== undefined) {
    delete binding.measures;
    issues.push({ where: `${where}.measures`, reason: 'badMeasure' });
  }
  return binding;
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
    const paper = readPaperProfile(p, `papers[${i}]`, issues);
    if (paper) papers.push(paper);
  });
  (Array.isArray(data.bindings) ? data.bindings : []).forEach((b, i) => {
    const binding = readBindingProfile(b, `bindings[${i}]`, issues);
    if (binding) bindings.push(binding);
  });
  return { papers, bindings, issues };
}
