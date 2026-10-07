import type {
  CmykPercent,
  Dimension,
  PrintBlackConfig,
  PrintConfig,
  PrintPreflightConfig,
  ResolvedPrintBlackConfig,
  ResolvedPrintConfig,
  ResolvedPrintPreflightConfig,
} from '../types';
import { DEFAULT_OUTPUT_PROFILE_ID, outputProfileInfo } from '../color/catalogue';
import { dimensionsEqual } from './shared';

export const DEFAULT_RICH_BLACK: CmykPercent = { c: 60, m: 40, y: 40, k: 100 };

export const DEFAULT_PRINT_BLACK_CONFIG: ResolvedPrintBlackConfig = {
  kOnlyNeutrals: true,
  overprint: true,
  richBlack: true,
  richBlackColor: DEFAULT_RICH_BLACK,
  richBlackMinSize: { value: 6, unit: 'mm' },
};

export const DEFAULT_PRINT_PREFLIGHT_CONFIG: ResolvedPrintPreflightConfig = {
  enabled: true,
  minImageResolution: 300,
  criticalImageResolution: 150,
  minRuleWidth: { value: 0.25, unit: 'pt' },
  smallTextSize: { value: 9, unit: 'pt' },
  safeZone: { value: 5, unit: 'mm' },
  bleedSnap: { value: 3, unit: 'mm' },
  checkFonts: true,
};

export const DEFAULT_PRINT_CONFIG: ResolvedPrintConfig = {
  standard: 'none',
  outputProfile: DEFAULT_OUTPUT_PROFILE_ID,
  renderingIntent: 'relative',
  blackPointCompensation: true,
  convertImages: true,
  inkLimit: 300,
  black: DEFAULT_PRINT_BLACK_CONFIG,
  preflight: DEFAULT_PRINT_PREFLIGHT_CONFIG,
};

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

function resolveCmyk(v: CmykPercent | undefined, fallback: CmykPercent): CmykPercent {
  if (!v) return { ...fallback };
  return { c: clampPct(v.c ?? 0), m: clampPct(v.m ?? 0), y: clampPct(v.y ?? 0), k: clampPct(v.k ?? 0) };
}

export function resolvePrintBlackConfig(partial?: PrintBlackConfig): ResolvedPrintBlackConfig {
  const d = DEFAULT_PRINT_BLACK_CONFIG;
  return {
    kOnlyNeutrals: partial?.kOnlyNeutrals ?? d.kOnlyNeutrals,
    overprint: partial?.overprint ?? d.overprint,
    richBlack: partial?.richBlack ?? d.richBlack,
    richBlackColor: resolveCmyk(partial?.richBlackColor, d.richBlackColor),
    richBlackMinSize: partial?.richBlackMinSize ?? d.richBlackMinSize,
  };
}

export function resolvePrintPreflightConfig(partial?: PrintPreflightConfig): ResolvedPrintPreflightConfig {
  const d = DEFAULT_PRINT_PREFLIGHT_CONFIG;
  const min = partial?.minImageResolution ?? d.minImageResolution;
  return {
    enabled: partial?.enabled ?? d.enabled,
    minImageResolution: min,
    // Critical can never sit above the warning threshold.
    criticalImageResolution: Math.min(min, partial?.criticalImageResolution ?? d.criticalImageResolution),
    minRuleWidth: partial?.minRuleWidth ?? d.minRuleWidth,
    smallTextSize: partial?.smallTextSize ?? d.smallTextSize,
    safeZone: partial?.safeZone ?? d.safeZone,
    bleedSnap: partial?.bleedSnap ?? d.bleedSnap,
    checkFonts: partial?.checkFonts ?? d.checkFonts,
  };
}

/** The ink limit of the profile a config names (a custom profile's own,
 *  else the catalogue's), before any `inkLimit` override. */
export function profileInkLimit(config?: PrintConfig): number {
  const id = config?.outputProfile ?? DEFAULT_OUTPUT_PROFILE_ID;
  if (id === 'custom') return config?.customProfile?.inkLimit ?? DEFAULT_PRINT_CONFIG.inkLimit;
  return outputProfileInfo(id)?.inkLimit ?? DEFAULT_PRINT_CONFIG.inkLimit;
}

export function resolvePrintConfig(partial?: PrintConfig): ResolvedPrintConfig {
  const d = DEFAULT_PRINT_CONFIG;
  let outputProfile = partial?.outputProfile ?? d.outputProfile;
  // A custom choice without its file, or an id the catalogue lacks, falls
  // back to the default condition.
  if (outputProfile === 'custom' ? !partial?.customProfile : !outputProfileInfo(outputProfile)) {
    outputProfile = d.outputProfile;
  }
  const resolved: ResolvedPrintConfig = {
    standard: partial?.standard ?? d.standard,
    outputProfile,
    renderingIntent: partial?.renderingIntent ?? d.renderingIntent,
    blackPointCompensation: partial?.blackPointCompensation ?? d.blackPointCompensation,
    convertImages: partial?.convertImages ?? d.convertImages,
    inkLimit: partial?.inkLimit ?? profileInkLimit({ ...partial, outputProfile }),
    black: resolvePrintBlackConfig(partial?.black),
    preflight: resolvePrintPreflightConfig(partial?.preflight),
  };
  if (partial?.customProfile) resolved.customProfile = { ...partial.customProfile };
  return resolved;
}

function stripSection<T extends object>(cfg: T | undefined, defaults: Record<string, unknown>): T | undefined {
  if (!cfg) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (value === undefined) continue;
    const def = defaults[key];
    if (isDimension(value) && isDimension(def) && dimensionsEqual(value, def)) continue;
    if (isCmyk(value) && isCmyk(def) && cmykEqual(value, def)) continue;
    if (value === def) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

function isDimension(v: unknown): v is Dimension {
  return !!v && typeof v === 'object' && 'unit' in v && 'value' in v;
}

function isCmyk(v: unknown): v is CmykPercent {
  return !!v && typeof v === 'object' && 'c' in v && 'k' in v;
}

function cmykEqual(a: CmykPercent, b: CmykPercent): boolean {
  return a.c === b.c && a.m === b.m && a.y === b.y && a.k === b.k;
}

export function stripPrintDefaults(cfg?: PrintConfig): PrintConfig | undefined {
  if (!cfg) return undefined;
  const d = DEFAULT_PRINT_CONFIG;
  const result: PrintConfig = {};
  if (cfg.standard !== undefined && cfg.standard !== d.standard) result.standard = cfg.standard;
  if (cfg.outputProfile !== undefined && cfg.outputProfile !== d.outputProfile) result.outputProfile = cfg.outputProfile;
  if (cfg.customProfile) result.customProfile = cfg.customProfile;
  if (cfg.renderingIntent !== undefined && cfg.renderingIntent !== d.renderingIntent) result.renderingIntent = cfg.renderingIntent;
  if (cfg.blackPointCompensation !== undefined && cfg.blackPointCompensation !== d.blackPointCompensation) {
    result.blackPointCompensation = cfg.blackPointCompensation;
  }
  if (cfg.convertImages !== undefined && cfg.convertImages !== d.convertImages) result.convertImages = cfg.convertImages;
  if (cfg.inkLimit !== undefined && cfg.inkLimit !== profileInkLimit(cfg)) result.inkLimit = cfg.inkLimit;
  const black = stripSection(cfg.black, DEFAULT_PRINT_BLACK_CONFIG as unknown as Record<string, unknown>);
  if (black) result.black = black;
  const preflight = stripSection(cfg.preflight, DEFAULT_PRINT_PREFLIGHT_CONFIG as unknown as Record<string, unknown>);
  if (preflight) result.preflight = preflight;
  return Object.keys(result).length > 0 ? result : undefined;
}
