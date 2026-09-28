import type { CjkConfig, CjkLineBreak, CjkRegion, ResolvedCjkConfig } from '../types';

/** `cjk` as written when nothing is set: everything follows the locale. */
export const DEFAULT_CJK_CONFIG: Required<CjkConfig> = {
  region: 'auto',
  lineBreak: 'auto',
};

const REGIONS: readonly CjkRegion[] = ['mainland', 'taiwan', 'hongkong'];
const LINE_BREAKS: readonly CjkLineBreak[] = ['none', 'basic', 'gb', 'strict'];

/**
 * The Chinese region a BCP 47 tag names, from its region subtag or, when it
 * has none, its script (`Intl.Locale#maximize`): CN, SG and MY → mainland,
 * TW → taiwan, HK and MO → hongkong; `zh-Hant` alone → taiwan, `zh-Hans`
 * and `zh` alone → mainland. Undefined for any other language, or a tag
 * that does not parse.
 */
export function cjkRegionOfLocale(locale: string | undefined): CjkRegion | undefined {
  if (!locale || locale.trim() === '') return undefined;
  let loc: Intl.Locale;
  try {
    loc = new Intl.Locale(locale.trim().replace(/_/g, '-'));
  } catch {
    return undefined;
  }
  if (loc.language !== 'zh') return undefined;
  const region = loc.region?.toUpperCase();
  if (region === 'TW') return 'taiwan';
  if (region === 'HK' || region === 'MO') return 'hongkong';
  if (region === 'CN' || region === 'SG' || region === 'MY') return 'mainland';
  let script = loc.script;
  if (!script) {
    try {
      script = loc.maximize().script;
    } catch {
      script = undefined;
    }
  }
  return script === 'Hant' ? 'taiwan' : 'mainland';
}

/** The line-break level a region's text is set with by default: GB/T
 *  15834's for the mainland, clreq's basic set for Taiwan and Hong Kong. */
export function defaultCjkLineBreak(region: CjkRegion): CjkLineBreak {
  return region === 'mainland' ? 'gb' : 'basic';
}

/** `cjk` resolved: `'auto'` (or a value the engine does not know) follows
 *  `locale`, the document language. */
export function resolveCjkConfig(partial: CjkConfig | undefined, locale: string | undefined): ResolvedCjkConfig {
  const region = partial?.region && REGIONS.includes(partial.region as CjkRegion)
    ? (partial.region as CjkRegion)
    : cjkRegionOfLocale(locale) ?? 'mainland';
  const lineBreak = partial?.lineBreak && LINE_BREAKS.includes(partial.lineBreak as CjkLineBreak)
    ? (partial.lineBreak as CjkLineBreak)
    : defaultCjkLineBreak(region);
  return { region, lineBreak };
}

/** `cjk` without the fields at their default (`'auto'`); undefined when
 *  nothing is left. */
export function stripCjkDefaults(cjk?: CjkConfig): CjkConfig | undefined {
  if (!cjk) return undefined;
  const result: CjkConfig = {};
  if (cjk.region !== undefined && cjk.region !== DEFAULT_CJK_CONFIG.region) result.region = cjk.region;
  if (cjk.lineBreak !== undefined && cjk.lineBreak !== DEFAULT_CJK_CONFIG.lineBreak) result.lineBreak = cjk.lineBreak;
  return Object.keys(result).length > 0 ? result : undefined;
}
