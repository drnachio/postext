import type {
  ChecksConfig,
  ContentInConfigCheckConfig,
  ResolvedChecksConfig,
  ResolvedContentInConfigCheckConfig,
} from '../../types.js';

export const DEFAULT_CONTENT_IN_CONFIG_CHECK: ResolvedContentInConfigCheckConfig = {
  enabled: true,
  allow: [],
  maxWords: 2,
  maxChars: 24,
};

export const DEFAULT_CHECKS_CONFIG: ResolvedChecksConfig = {
  contentInConfig: DEFAULT_CONTENT_IN_CONFIG_CHECK,
};

/** A whole number from 0, else the default (a negative, fractional or
 *  non-numeric limit is reported by `collectConfigWarnings`). */
function limitOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function resolveContentInConfigCheck(partial?: ContentInConfigCheckConfig): ResolvedContentInConfigCheckConfig {
  const d = DEFAULT_CONTENT_IN_CONFIG_CHECK;
  const allow = Array.isArray(partial?.allow) ? partial!.allow.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : d.allow;
  return {
    enabled: typeof partial?.enabled === 'boolean' ? partial.enabled : d.enabled,
    allow,
    maxWords: limitOf(partial?.maxWords, d.maxWords),
    maxChars: limitOf(partial?.maxChars, d.maxChars),
  };
}

export function resolveChecksConfig(partial?: ChecksConfig): ResolvedChecksConfig {
  return { contentInConfig: resolveContentInConfigCheck(partial?.contentInConfig) };
}

export function stripChecksDefaults(cfg?: ChecksConfig): ChecksConfig | undefined {
  if (!cfg) return undefined;
  const d = DEFAULT_CONTENT_IN_CONFIG_CHECK;
  const c = cfg.contentInConfig;
  const result: ChecksConfig = {};
  if (c) {
    const own: ContentInConfigCheckConfig = {};
    if (c.enabled !== undefined && c.enabled !== d.enabled) own.enabled = c.enabled;
    if (Array.isArray(c.allow) && c.allow.length > 0) own.allow = [...c.allow];
    if (c.maxWords !== undefined && c.maxWords !== d.maxWords) own.maxWords = c.maxWords;
    if (c.maxChars !== undefined && c.maxChars !== d.maxChars) own.maxChars = c.maxChars;
    if (Object.keys(own).length > 0) result.contentInConfig = own;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
