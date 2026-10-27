import type {
  ContrastAllowEntry,
  ContrastConfig,
  ContrastLevel,
  ContrastMode,
  ContrastReversedTextConfig,
  ResolvedContrastConfig,
  ResolvedContrastReversedTextConfig,
} from '../../types.js';
import { dimensionsEqual } from '../shared.js';

export const DEFAULT_CONTRAST_REVERSED_TEXT_CONFIG: ResolvedContrastReversedTextConfig = {
  enabled: true,
  minSize: { value: 8, unit: 'pt' },
  minFineSize: { value: 12, unit: 'pt' },
  lightWeight: 300,
};

export const DEFAULT_CONTRAST_CONFIG: ResolvedContrastConfig = {
  enabled: true,
  level: 'AA',
  mode: 'auto',
  reversedText: DEFAULT_CONTRAST_REVERSED_TEXT_CONFIG,
  allow: [],
};

export const CONTRAST_LEVELS: readonly ContrastLevel[] = ['AA', 'AAA'];
export const CONTRAST_MODES: readonly ContrastMode[] = ['auto', 'screen', 'print', 'both'];

export function resolveContrastReversedTextConfig(partial?: ContrastReversedTextConfig): ResolvedContrastReversedTextConfig {
  const d = DEFAULT_CONTRAST_REVERSED_TEXT_CONFIG;
  const weight = partial?.lightWeight;
  return {
    enabled: partial?.enabled ?? d.enabled,
    minSize: partial?.minSize ?? d.minSize,
    minFineSize: partial?.minFineSize ?? d.minFineSize,
    lightWeight: typeof weight === 'number' && Number.isFinite(weight) ? weight : d.lightWeight,
  };
}

/** A colour of an allow entry as `#rrggbb` (or `#rrggbbaa`) in lower
 *  case: `#` added, a short form spelled out. Undefined for no hex. */
export function normalContrastHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!m) return undefined;
  const hex = m[1]!.toLowerCase();
  return `#${hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex}`;
}

/** The allow entries that match something (#1124): colours that are no
 *  hex and entries that give no colour or style are dropped. */
export function resolveContrastAllow(allow: unknown): ContrastAllowEntry[] {
  if (!Array.isArray(allow)) return [];
  const out: ContrastAllowEntry[] = [];
  for (const raw of allow) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Partial<ContrastAllowEntry>;
    const fg = normalContrastHex(e.fg);
    const bg = normalContrastHex(e.bg);
    const style = typeof e.style === 'string' && e.style.trim() ? e.style.trim() : undefined;
    if ((e.fg !== undefined && !fg) || (e.bg !== undefined && !bg)) continue;
    if (!fg && !bg && !style) continue;
    out.push({ ...(fg ? { fg } : {}), ...(bg ? { bg } : {}), ...(style ? { style } : {}), reason: typeof e.reason === 'string' ? e.reason : '' });
  }
  return out;
}

/** A level or a mode written otherwise reads as the default
 *  (`collectConfigWarnings` reports it). */
export function resolveContrastConfig(partial?: ContrastConfig): ResolvedContrastConfig {
  const d = DEFAULT_CONTRAST_CONFIG;
  return {
    enabled: partial?.enabled ?? d.enabled,
    level: CONTRAST_LEVELS.includes(partial?.level as ContrastLevel) ? (partial!.level as ContrastLevel) : d.level,
    mode: CONTRAST_MODES.includes(partial?.mode as ContrastMode) ? (partial!.mode as ContrastMode) : d.mode,
    reversedText: resolveContrastReversedTextConfig(partial?.reversedText),
    allow: resolveContrastAllow(partial?.allow),
  };
}

export function stripContrastDefaults(cfg?: ContrastConfig): ContrastConfig | undefined {
  if (!cfg) return undefined;
  const d = DEFAULT_CONTRAST_CONFIG;
  const result: ContrastConfig = {};
  if (cfg.enabled !== undefined && cfg.enabled !== d.enabled) result.enabled = cfg.enabled;
  if (cfg.level !== undefined && cfg.level !== d.level) result.level = cfg.level;
  if (cfg.mode !== undefined && cfg.mode !== d.mode) result.mode = cfg.mode;
  const r = cfg.reversedText;
  if (r) {
    const dr = d.reversedText;
    const reversed: ContrastReversedTextConfig = {};
    if (r.enabled !== undefined && r.enabled !== dr.enabled) reversed.enabled = r.enabled;
    if (r.minSize !== undefined && !dimensionsEqual(r.minSize, dr.minSize)) reversed.minSize = r.minSize;
    if (r.minFineSize !== undefined && !dimensionsEqual(r.minFineSize, dr.minFineSize)) reversed.minFineSize = r.minFineSize;
    if (r.lightWeight !== undefined && r.lightWeight !== dr.lightWeight) reversed.lightWeight = r.lightWeight;
    if (Object.keys(reversed).length > 0) result.reversedText = reversed;
  }
  if (Array.isArray(cfg.allow) && cfg.allow.length > 0) result.allow = cfg.allow;
  return Object.keys(result).length > 0 ? result : undefined;
}
