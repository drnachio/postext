'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveMathConfig, DEFAULT_MATH_CONFIG, dimensionsEqual } from 'postext';
import type { ColorValue, MathConfig, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
} from '../../controls';

const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_MATH_CONFIG;

const FALLBACK_COLOR: ColorValue = { model: 'rgb', hex: '#000000' };

export const MathSection = memo(function MathSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.math);
  const bodyColor = useSandboxSelector((s) => s.config.bodyText?.color);
  const math = resolveMathConfig(raw);

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
      title={labels.mathSection}
      sectionId="math"
      onReset={resetMath}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.mathEnabled}
        checked={math.enabled}
        onChange={(v) => updateMath({ enabled: v })}
        tooltip={labels.mathEnabledTooltip}
        isDefault={isEnabledDefault}
        onReset={() => resetField('enabled')}
      />
      <NumberInput
        label={labels.mathFontSizeScale}
        value={math.fontSizeScale}
        onChange={(v) => updateMath({ fontSizeScale: v })}
        min={0.5}
        max={2}
        step={0.05}
        tooltip={labels.mathFontSizeScaleTooltip}
        isDefault={isScaleDefault}
        onReset={() => resetField('fontSizeScale')}
      />
      <ColorPicker
        label={labels.mathColor}
        value={math.color ?? bodyColor ?? FALLBACK_COLOR}
        onChange={(color) => updateMath({ color })}
        tooltip={labels.mathColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="math-color"
      />
      <DimensionInput
        label={labels.mathMarginTop}
        value={math.marginTop}
        onChange={(dim) => updateMath({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.mathMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => resetField('marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.mathMarginBottom}
        value={math.marginBottom}
        onChange={(dim) => updateMath({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.mathMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => resetField('marginBottom')}
        units={MARGIN_UNITS}
      />
    </CollapsibleSection>
  );
});
