import type {
  NamedScoreStyleConfig,
  ResolvedBodyTextConfig,
  ResolvedNamedScoreStyleConfig,
  ResolvedScoreStyleConfig,
  ScoreStyleConfig,
} from '../../types.js';
import { dimensionsEqual } from '../shared.js';

export const DEFAULT_SCORE_STYLE_CONFIG: Omit<ResolvedScoreStyleConfig, 'textFont' | 'color'> = {
  enabled: true,
  staffSize: { value: 6, unit: 'mm' },
  musicFont: 'Bravura',
  spacing: 1,
  barNumbers: 'system',
  systemGap: { value: 3, unit: 'mm' },
  marginTop: { value: 6, unit: 'pt' },
  marginBottom: { value: 6, unit: 'pt' },
  minSystemsAtBreak: 1,
};

/** Resolve `scoreStyle`: the text font and ink default to the body text's. */
export function resolveScoreStyleConfig(partial: ScoreStyleConfig | undefined, bodyText: ResolvedBodyTextConfig): ResolvedScoreStyleConfig {
  const d = DEFAULT_SCORE_STYLE_CONFIG;
  const p = partial ?? {};
  return {
    enabled: p.enabled ?? d.enabled,
    staffSize: p.staffSize ?? d.staffSize,
    musicFont: p.musicFont ?? d.musicFont,
    textFont: p.textFont ?? bodyText.fontFamily,
    spacing: p.spacing !== undefined && p.spacing > 0 ? p.spacing : d.spacing,
    barNumbers: p.barNumbers ?? d.barNumbers,
    systemGap: p.systemGap ?? d.systemGap,
    marginTop: p.marginTop ?? d.marginTop,
    marginBottom: p.marginBottom ?? d.marginBottom,
    color: p.color ?? bodyText.color,
    minSystemsAtBreak: Math.max(1, Math.round(p.minSystemsAtBreak ?? d.minSystemsAtBreak)),
  };
}

function definedFields<T extends object>(style: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Resolve the named score styles, each laid over the `scoreStyle` partial. */
export function resolveScoreStylesConfig(
  styles: NamedScoreStyleConfig[] | undefined,
  base: ScoreStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedNamedScoreStyleConfig[] {
  return (styles ?? []).map(({ id, name, ...fields }) => ({
    id,
    name: name ?? id,
    ...resolveScoreStyleConfig({ ...definedFields(base ?? {}), ...definedFields(fields) }, bodyText),
  }));
}

/** The resolved style a score is set in: the named style its `style`
 *  attribute picks, else `scoreStyle`. */
export function pickScoreStyle(
  resolved: { scoreStyle: ResolvedScoreStyleConfig; scoreStyles?: readonly ResolvedNamedScoreStyleConfig[] },
  styleId: string | undefined,
): ResolvedScoreStyleConfig {
  if (!styleId) return resolved.scoreStyle;
  return resolved.scoreStyles?.find((s) => s.id === styleId) ?? resolved.scoreStyle;
}

export function stripScoreStyleDefaults(scoreStyle?: ScoreStyleConfig): ScoreStyleConfig | undefined {
  if (!scoreStyle) return undefined;
  const d = DEFAULT_SCORE_STYLE_CONFIG;
  const out: ScoreStyleConfig = {};
  if (scoreStyle.enabled !== undefined && scoreStyle.enabled !== d.enabled) out.enabled = scoreStyle.enabled;
  if (scoreStyle.staffSize && !dimensionsEqual(scoreStyle.staffSize, d.staffSize)) out.staffSize = scoreStyle.staffSize;
  if (scoreStyle.musicFont !== undefined && scoreStyle.musicFont !== d.musicFont) out.musicFont = scoreStyle.musicFont;
  if (scoreStyle.textFont !== undefined) out.textFont = scoreStyle.textFont;
  if (scoreStyle.spacing !== undefined && scoreStyle.spacing !== d.spacing) out.spacing = scoreStyle.spacing;
  if (scoreStyle.barNumbers !== undefined && scoreStyle.barNumbers !== d.barNumbers) out.barNumbers = scoreStyle.barNumbers;
  if (scoreStyle.systemGap && !dimensionsEqual(scoreStyle.systemGap, d.systemGap)) out.systemGap = scoreStyle.systemGap;
  if (scoreStyle.marginTop && !dimensionsEqual(scoreStyle.marginTop, d.marginTop)) out.marginTop = scoreStyle.marginTop;
  if (scoreStyle.marginBottom && !dimensionsEqual(scoreStyle.marginBottom, d.marginBottom)) out.marginBottom = scoreStyle.marginBottom;
  if (scoreStyle.color !== undefined) out.color = scoreStyle.color;
  if (scoreStyle.minSystemsAtBreak !== undefined && scoreStyle.minSystemsAtBreak !== d.minSystemsAtBreak) out.minSystemsAtBreak = scoreStyle.minSystemsAtBreak;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stripScoreStylesDefaults(styles: NamedScoreStyleConfig[] | undefined): NamedScoreStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map(({ id, name, ...fields }) => ({
    id,
    ...(name !== undefined && name !== id ? { name } : {}),
    ...definedFields(fields),
  }));
}
