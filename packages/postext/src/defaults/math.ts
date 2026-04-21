import type { MathConfig, ResolvedMathConfig, Dimension } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

const DEFAULT_MATH_MARGIN_TOP: Dimension = { value: 0.8, unit: 'em' };
const DEFAULT_MATH_MARGIN_BOTTOM: Dimension = { value: 0.8, unit: 'em' };

export const DEFAULT_MATH_CONFIG: ResolvedMathConfig = {
  enabled: true,
  fontSizeScale: 1.0,
  marginTop: DEFAULT_MATH_MARGIN_TOP,
  marginBottom: DEFAULT_MATH_MARGIN_BOTTOM,
};

export function resolveMathConfig(partial?: MathConfig): ResolvedMathConfig {
  if (!partial) return { ...DEFAULT_MATH_CONFIG };
  const resolved: ResolvedMathConfig = {
    enabled: partial.enabled ?? DEFAULT_MATH_CONFIG.enabled,
    fontSizeScale: partial.fontSizeScale ?? DEFAULT_MATH_CONFIG.fontSizeScale,
    marginTop: partial.marginTop ?? DEFAULT_MATH_CONFIG.marginTop,
    marginBottom: partial.marginBottom ?? DEFAULT_MATH_CONFIG.marginBottom,
  };
  if (partial.color !== undefined) resolved.color = partial.color;
  return resolved;
}

export function stripMathDefaults(math?: MathConfig): MathConfig | undefined {
  if (!math) return undefined;
  const result: MathConfig = {};
  let hasOverride = false;
  if (math.enabled !== undefined && math.enabled !== DEFAULT_MATH_CONFIG.enabled) {
    result.enabled = math.enabled;
    hasOverride = true;
  }
  if (math.fontSizeScale !== undefined && math.fontSizeScale !== DEFAULT_MATH_CONFIG.fontSizeScale) {
    result.fontSizeScale = math.fontSizeScale;
    hasOverride = true;
  }
  if (math.color !== undefined && (DEFAULT_MATH_CONFIG.color === undefined || !colorsEqual(math.color, DEFAULT_MATH_CONFIG.color))) {
    result.color = math.color;
    hasOverride = true;
  }
  if (math.marginTop !== undefined && !dimensionsEqual(math.marginTop, DEFAULT_MATH_CONFIG.marginTop)) {
    result.marginTop = math.marginTop;
    hasOverride = true;
  }
  if (math.marginBottom !== undefined && !dimensionsEqual(math.marginBottom, DEFAULT_MATH_CONFIG.marginBottom)) {
    result.marginBottom = math.marginBottom;
    hasOverride = true;
  }
  return hasOverride ? result : undefined;
}
