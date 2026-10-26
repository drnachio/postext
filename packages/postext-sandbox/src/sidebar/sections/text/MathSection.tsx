'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { resolveMathConfig, DEFAULT_MATH_CONFIG, dimensionsEqual } from 'postext';
import type { ColorValue, MathConfig, DimensionUnit, ResourceCounterFormat, ResourceCounterReset } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NestedGroup,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls/index.js';
import { counterFormatOptions, resetOnOptions } from '../../settings/counterOptions.js';

const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_MATH_CONFIG;

type EquationNumberingConfig = NonNullable<MathConfig['equationNumbering']>;

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

  const eqRaw = raw?.equationNumbering;
  const eq = math.equationNumbering;
  const DE = D.equationNumbering;
  const updateEquations = (partial: Partial<EquationNumberingConfig>) => updateMath({ equationNumbering: { ...eqRaw, ...partial } });
  const resetEquationField = (field: keyof EquationNumberingConfig) => {
    if (!eqRaw) return;
    const next = { ...eqRaw };
    delete next[field];
    if (Object.keys(next).length === 0) resetField('equationNumbering');
    else updateMath({ equationNumbering: next });
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
      <ToggleSwitch
        label={labels.mathIndentAfterDisplay}
        checked={math.indentAfterDisplay}
        onChange={(v) => updateMath({ indentAfterDisplay: v })}
        tooltip={labels.mathIndentAfterDisplayTooltip}
        isDefault={math.indentAfterDisplay === D.indentAfterDisplay}
        onReset={() => resetField('indentAfterDisplay')}
      />
      <ToggleSwitch
        label={labels.mathKeepWithLeadIn}
        checked={math.keepWithLeadIn}
        onChange={(v) => updateMath({ keepWithLeadIn: v })}
        tooltip={labels.mathKeepWithLeadInTooltip}
        isDefault={math.keepWithLeadIn === D.keepWithLeadIn}
        onReset={() => resetField('keepWithLeadIn')}
      />
      <ToggleSwitch
        label={labels.mathEquationNumbering}
        checked={eq.enabled}
        onChange={(v) => updateEquations({ enabled: v })}
        tooltip={labels.mathEquationNumberingTooltip}
        isDefault={eqRaw?.enabled === undefined}
        onReset={() => resetEquationField('enabled')}
      />
      {eq.enabled && (
        <NestedGroup>
          <TextInput
            label={labels.resourceTypeNumberingLabel}
            value={eq.numberingTemplate}
            onChange={(v) => updateEquations({ numberingTemplate: v === '' ? undefined : v })}
            placeholder={DE.numberingTemplate}
            tooltip={labels.resourceTypeNumberingTooltip}
            isDefault={eqRaw?.numberingTemplate === undefined}
            onReset={() => resetEquationField('numberingTemplate')}
          />
          <SelectInput
            label={labels.resourceTypeResetCounterLabel}
            value={eq.resetOn}
            options={resetOnOptions(labels)}
            onChange={(v) => updateEquations({ resetOn: v as ResourceCounterReset })}
            tooltip={labels.resourceTypeResetCounterTooltip}
            isDefault={eqRaw?.resetOn === undefined}
            onReset={() => resetEquationField('resetOn')}
          />
          <SelectInput
            label={labels.resourceTypeCounterFormatLabel}
            value={eq.counterFormat}
            options={counterFormatOptions(labels)}
            onChange={(v) => updateEquations({ counterFormat: v as ResourceCounterFormat })}
            tooltip={labels.resourceTypeCounterFormatTooltip}
            isDefault={eqRaw?.counterFormat === undefined}
            onReset={() => resetEquationField('counterFormat')}
          />
          <TextInput
            label={labels.mathEquationFormat}
            value={eq.format}
            onChange={(v) => updateEquations({ format: v === '' ? undefined : v })}
            placeholder={DE.format}
            tooltip={labels.mathEquationFormatTooltip}
            isDefault={eqRaw?.format === undefined}
            onReset={() => resetEquationField('format')}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});
