import type {
  CmykPercent,
  Dimension,
  PrintBlackConfig,
  PrintConfig,
  InkFinish,
  PrintDieLineConfig,
  PrintInk,
  PrintPlatesConfig,
  PrintImageColorConfig,
  PrintPreflightConfig,
  ResolvedPrintBlackConfig,
  ResolvedPrintConfig,
  ResolvedPrintDieLineConfig,
  ResolvedPrintInk,
  ResolvedPrintPlatesConfig,
  ResolvedPrintImageColorConfig,
  ResolvedPrintPreflightConfig,
} from '../../types.js';
import { DEFAULT_OUTPUT_PROFILE_ID, outputProfileInfo } from '../../color/catalogue.js';
import { dimensionsEqual } from '../shared.js';

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

export const DEFAULT_PRINT_DIE_LINE: ResolvedPrintDieLineConfig = {
  output: 'page',
  ink: 'Die',
  cmyk: { c: 0, m: 100, y: 0, k: 0 },
  width: { value: 0.25, unit: 'pt' },
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
  inks: [],
  plates: { inks: [], images: [], curves: {} },
  imageColor: { embeddedProfile: 'ignore', grayDotGain: 'none', cmykProfile: 'keep' },
  dieLine: DEFAULT_PRINT_DIE_LINE,
};

const FINISH_KINDS = ['metallic', 'foil', 'fluorescent', 'white', 'varnish'] as const;
const SHEENS = ['gloss', 'satin', 'matte', 'softTouch'] as const;

/** A finish as written, checked: an unknown kind is dropped (`undefined`),
 *  an unknown sheen left out; soft-touch is a varnish's only. */
export function resolveInkFinish(f: unknown): InkFinish | undefined {
  if (!f || typeof f !== 'object') return undefined;
  const kind = (f as { kind?: unknown }).kind;
  if (!FINISH_KINDS.includes(kind as InkFinish['kind'])) return undefined;
  const out: InkFinish = { kind: kind as InkFinish['kind'] };
  const sheen = (f as { sheen?: unknown }).sheen;
  if (SHEENS.includes(sheen as NonNullable<InkFinish['sheen']>) && kind !== 'fluorescent' && kind !== 'white') {
    if (sheen !== 'softTouch' || kind === 'varnish') out.sheen = sheen as InkFinish['sheen'];
  }
  return out;
}

export function resolvePrintDieLine(partial?: PrintDieLineConfig): ResolvedPrintDieLineConfig {
  const d = DEFAULT_PRINT_DIE_LINE;
  const ink = typeof partial?.ink === 'string' && partial.ink.trim() ? partial.ink.trim() : d.ink;
  return {
    output: partial?.output === 'none' ? 'none' : 'page',
    ink,
    cmyk: resolveCmyk(partial?.cmyk, d.cmyk),
    width: partial?.width ? { ...partial.width } : { ...d.width },
  };
}

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

/** The ink table with its names trimmed and its defaults filled in; an
 *  entry without a name is dropped. */
export function resolvePrintInks(partial?: PrintInk[]): ResolvedPrintInk[] {
  if (!Array.isArray(partial)) return [];
  const out: ResolvedPrintInk[] = [];
  for (const ink of partial) {
    const name = typeof ink?.name === 'string' ? ink.name.trim() : '';
    if (!name) continue;
    const pdfName = typeof ink.pdfName === 'string' && ink.pdfName.trim() ? ink.pdfName.trim() : name;
    const aliases = Array.isArray(ink.aliases) ? ink.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()) : [];
    const resolved: ResolvedPrintInk = { name, aliases, pdfName, output: ink.output === 'process' ? 'process' : 'spot' };
    if (ink.cmyk) resolved.cmyk = resolveCmyk(ink.cmyk, { c: 0, m: 0, y: 0, k: 0 });
    if (typeof ink.overprint === 'boolean') resolved.overprint = ink.overprint;
    const finish = resolveInkFinish(ink.finish);
    if (finish) resolved.finish = finish;
    out.push(resolved);
  }
  return out;
}

const PROCESS_PLATES = ['Cyan', 'Magenta', 'Yellow', 'Black'];

/** The plates of a job with their names trimmed (a process plate in its
 *  PDF spelling, `black` as `Black`), each once; the picture plates are
 *  among them (a spot plate maybe by an alias the ink table gives it),
 *  `Black` or the first when none is given. */
export function resolvePrintPlates(partial?: PrintPlatesConfig): ResolvedPrintPlatesConfig {
  const names = (list: unknown): string[] => {
    const out: string[] = [];
    if (!Array.isArray(list)) return out;
    for (const item of list) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const name = item.trim();
      const proc = PROCESS_PLATES.find((p) => p.toLowerCase() === name.toLowerCase());
      const plate = proc ?? name;
      if (!out.includes(plate)) out.push(plate);
    }
    return out;
  };
  const inks = names(partial?.inks);
  if (inks.length === 0) return { inks: [], images: [], curves: {} };
  // A spot plate may be named through the ink table (an alias): the
  // render resolves it (`jobImagePlates`); a process plate must be printed.
  let images = names(partial?.images).filter((n) => inks.includes(n) || !PROCESS_PLATES.includes(n)).slice(0, 2);
  if (images.length === 0) images = [inks.includes('Black') ? 'Black' : inks[0]!];
  const curves: Record<string, Array<[number, number]>> = {};
  for (const [plate, points] of Object.entries(partial?.curves ?? {})) {
    if (!Array.isArray(points)) continue;
    const pts = points
      .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]) => [clampPct(x), clampPct(y)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const name = names([plate])[0];
    if (name && pts.length > 0) curves[name] = pts;
  }
  return { inks, images, curves };
}

/** How pictures' colours are read, with its defaults; a dot gain is
 *  clamped to 0–50 %. */
export function resolvePrintImageColor(partial?: PrintImageColorConfig): ResolvedPrintImageColorConfig {
  const gain = partial?.grayDotGain;
  const out: ResolvedPrintImageColorConfig = {
    embeddedProfile: partial?.embeddedProfile === 'use' ? 'use' : 'ignore',
    grayDotGain: typeof gain === 'number' && Number.isFinite(gain) ? Math.max(0, Math.min(50, gain)) : gain === 'profile' ? 'profile' : 'none',
    cmykProfile: partial?.cmykProfile === 'convert' ? 'convert' : 'keep',
  };
  const assigned = partial?.assignedRgbProfile;
  if (assigned && typeof assigned.fileId === 'string' && assigned.fileId) out.assignedRgbProfile = { name: assigned.name ?? assigned.fileId, fileId: assigned.fileId };
  return out;
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
    inks: resolvePrintInks(partial?.inks),
    plates: resolvePrintPlates(partial?.plates),
    imageColor: resolvePrintImageColor(partial?.imageColor),
    dieLine: resolvePrintDieLine(partial?.dieLine),
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
  if (cfg.inks && cfg.inks.length > 0) result.inks = cfg.inks.map((ink) => ({ ...ink }));
  if (cfg.plates && (cfg.plates.inks?.length ?? 0) > 0) result.plates = structuredClone(cfg.plates);
  if (cfg.imageColor) {
    const ic = { ...cfg.imageColor };
    if (ic.embeddedProfile === 'ignore') delete ic.embeddedProfile;
    if (ic.grayDotGain === 'none') delete ic.grayDotGain;
    if (ic.cmykProfile === 'keep') delete ic.cmykProfile;
    if (Object.keys(ic).length > 0) result.imageColor = ic;
  }
  if (cfg.dieLine) {
    const dl = stripSection(cfg.dieLine, DEFAULT_PRINT_DIE_LINE as unknown as Record<string, unknown>);
    if (dl) result.dieLine = dl;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
