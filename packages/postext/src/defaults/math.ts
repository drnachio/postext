import type { EquationNumberingConfig, MathConfig, ResolvedEquationNumberingConfig, ResolvedMathConfig, Dimension } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

const DEFAULT_MATH_MARGIN_TOP: Dimension = { value: 0.8, unit: 'em' };
const DEFAULT_MATH_MARGIN_BOTTOM: Dimension = { value: 0.8, unit: 'em' };

/** Labelled equations numbered (1), (2)… through the document (#530). */
export const DEFAULT_EQUATION_NUMBERING: ResolvedEquationNumberingConfig = {
  enabled: true,
  numberingTemplate: '{n}',
  resetOn: 'never',
  counterFormat: 'decimal',
  format: '({n})',
};

export const DEFAULT_MATH_CONFIG: ResolvedMathConfig = {
  enabled: true,
  fontSizeScale: 1.0,
  marginTop: DEFAULT_MATH_MARGIN_TOP,
  marginBottom: DEFAULT_MATH_MARGIN_BOTTOM,
  indentAfterDisplay: true,
  keepWithLeadIn: false,
  equationNumbering: DEFAULT_EQUATION_NUMBERING,
};

function resolveEquationNumbering(partial?: EquationNumberingConfig): ResolvedEquationNumberingConfig {
  const d = DEFAULT_EQUATION_NUMBERING;
  if (!partial) return { ...d };
  return {
    enabled: partial.enabled ?? d.enabled,
    numberingTemplate: partial.numberingTemplate ?? d.numberingTemplate,
    resetOn: partial.resetOn ?? d.resetOn,
    counterFormat: partial.counterFormat ?? d.counterFormat,
    format: partial.format ?? d.format,
  };
}

export function resolveMathConfig(partial?: MathConfig): ResolvedMathConfig {
  if (!partial) return { ...DEFAULT_MATH_CONFIG, equationNumbering: { ...DEFAULT_EQUATION_NUMBERING } };
  const resolved: ResolvedMathConfig = {
    enabled: partial.enabled ?? DEFAULT_MATH_CONFIG.enabled,
    fontSizeScale: partial.fontSizeScale ?? DEFAULT_MATH_CONFIG.fontSizeScale,
    marginTop: partial.marginTop ?? DEFAULT_MATH_CONFIG.marginTop,
    marginBottom: partial.marginBottom ?? DEFAULT_MATH_CONFIG.marginBottom,
    indentAfterDisplay: partial.indentAfterDisplay ?? DEFAULT_MATH_CONFIG.indentAfterDisplay,
    keepWithLeadIn: partial.keepWithLeadIn ?? DEFAULT_MATH_CONFIG.keepWithLeadIn,
    equationNumbering: resolveEquationNumbering(partial.equationNumbering),
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
  if (math.indentAfterDisplay !== undefined && math.indentAfterDisplay !== DEFAULT_MATH_CONFIG.indentAfterDisplay) {
    result.indentAfterDisplay = math.indentAfterDisplay;
    hasOverride = true;
  }
  if (math.keepWithLeadIn !== undefined && math.keepWithLeadIn !== DEFAULT_MATH_CONFIG.keepWithLeadIn) {
    result.keepWithLeadIn = math.keepWithLeadIn;
    hasOverride = true;
  }
  if (math.equationNumbering) {
    const d = DEFAULT_EQUATION_NUMBERING;
    const e = math.equationNumbering;
    const kept: EquationNumberingConfig = {};
    if (e.enabled !== undefined && e.enabled !== d.enabled) kept.enabled = e.enabled;
    if (e.numberingTemplate !== undefined && e.numberingTemplate !== d.numberingTemplate) kept.numberingTemplate = e.numberingTemplate;
    if (e.resetOn !== undefined && e.resetOn !== d.resetOn) kept.resetOn = e.resetOn;
    if (e.counterFormat !== undefined && e.counterFormat !== d.counterFormat) kept.counterFormat = e.counterFormat;
    if (e.format !== undefined && e.format !== d.format) kept.format = e.format;
    if (Object.keys(kept).length > 0) {
      result.equationNumbering = kept;
      hasOverride = true;
    }
  }
  return hasOverride ? result : undefined;
}
