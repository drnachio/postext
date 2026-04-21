'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolveMathConfig, DEFAULT_MATH_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { MathConfig, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
} from '../../controls';

const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_MATH_CONFIG;

export function MathSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.math;
  const math = resolveMathConfig(raw);
  const { labels } = state;

  const updateMath = (partial: Partial<MathConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { math: { ...raw, ...partial } },
    });
  };

  const resetMath = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { math: undefined },
    });
  };

  const resetField = (field: keyof MathConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { math: hasKeys ? next : undefined },
    });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isEnabledDefault = math.enabled === D.enabled;
  const isScaleDefault = math.fontSizeScale === D.fontSizeScale;
  const isColorDefault = raw?.color === undefined;
  const isMarginTopDefault = dimensionsEqual(math.marginTop, D.marginTop);
  const isMarginBottomDefault = dimensionsEqual(math.marginBottom, D.marginBottom);

  return (
    <CollapsibleSection
      title={labels.mathSection ?? 'Math'}
      sectionId="math"
      onReset={resetMath}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.mathEnabled ?? 'Enable LaTeX'}
        checked={math.enabled}
        onChange={(v) => updateMath({ enabled: v })}
        tooltip={labels.mathEnabledTooltip ?? 'Render $…$ and $$…$$ as typeset math'}
        isDefault={isEnabledDefault}
        onReset={() => resetField('enabled')}
      />
      <NumberInput
        label={labels.mathFontSizeScale ?? 'Size scale'}
        value={math.fontSizeScale}
        onChange={(v) => updateMath({ fontSizeScale: v })}
        min={0.5}
        max={2}
        step={0.05}
        tooltip={labels.mathFontSizeScaleTooltip ?? 'Multiplier applied to the body font size when rendering math'}
        isDefault={isScaleDefault}
        onReset={() => resetField('fontSizeScale')}
      />
      <ColorPicker
        label={labels.mathColor ?? 'Color'}
        value={math.color ?? state.config.bodyText?.color ?? { model: 'rgb', hex: '#000000' }}
        onChange={(color) => updateMath({ color })}
        tooltip={labels.mathColorTooltip ?? 'Formula colour (inherits body colour when unset)'}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="math-color"
      />
      <DimensionInput
        label={labels.mathMarginTop ?? 'Display margin top'}
        value={math.marginTop}
        onChange={(dim) => updateMath({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.mathMarginTopTooltip ?? 'Top margin for $$...$$ display blocks'}
        isDefault={isMarginTopDefault}
        onReset={() => resetField('marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.mathMarginBottom ?? 'Display margin bottom'}
        value={math.marginBottom}
        onChange={(dim) => updateMath({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.mathMarginBottomTooltip ?? 'Bottom margin for $$...$$ display blocks (baseline grid snap may enlarge it)'}
        isDefault={isMarginBottomDefault}
        onReset={() => resetField('marginBottom')}
        units={MARGIN_UNITS}
      />
    </CollapsibleSection>
  );
}
