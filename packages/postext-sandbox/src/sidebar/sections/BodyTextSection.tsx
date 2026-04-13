'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolveBodyTextConfig, DEFAULT_BODY_TEXT_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { BodyTextConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
} from '../../controls';
import type { DimensionUnit } from 'postext';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_BODY_TEXT_CONFIG;

export function BodyTextSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.bodyText;
  const bodyText = resolveBodyTextConfig(raw);
  const { labels } = state;

  const updateBodyText = (partial: Partial<BodyTextConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: { ...raw, ...partial } },
    });
  };

  const resetBodyText = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: undefined },
    });
  };

  const resetField = (field: keyof BodyTextConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: hasKeys ? next : undefined },
    });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = bodyText.fontFamily === D.fontFamily;
  const isSizeDefault = dimensionsEqual(bodyText.fontSize, D.fontSize);
  const isLineHeightDefault = dimensionsEqual(bodyText.lineHeight, D.lineHeight);
  const isColorDefault = colorsEqual(bodyText.color, D.color);

  return (
    <CollapsibleSection
      title={labels.bodyText}
      sectionId="bodyText"
      defaultOpen
      onReset={resetBodyText}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FontPicker
        label={labels.bodyFont}
        value={bodyText.fontFamily}
        onChange={(font) => updateBodyText({ fontFamily: font })}
        tooltip={labels.bodyFontTooltip}
        isDefault={isFontDefault}
        onReset={() => resetField('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />

      <DimensionInput
        label={labels.bodyFontSize}
        value={bodyText.fontSize}
        onChange={(dim) => updateBodyText({ fontSize: dim })}
        min={1}
        step={0.5}
        tooltip={labels.bodyFontSizeTooltip}
        isDefault={isSizeDefault}
        onReset={() => resetField('fontSize')}
        units={TEXT_SIZE_UNITS}
      />

      <DimensionInput
        label={labels.bodyLineHeight}
        value={bodyText.lineHeight}
        onChange={(dim) => updateBodyText({ lineHeight: dim })}
        min={0.5}
        max={5}
        step={0.1}
        tooltip={labels.bodyLineHeightTooltip}
        isDefault={isLineHeightDefault}
        onReset={() => resetField('lineHeight')}
        units={LINE_HEIGHT_UNITS}
      />

      <ColorPicker
        label={labels.bodyColor}
        value={bodyText.color}
        onChange={(color) => updateBodyText({ color })}
        tooltip={labels.bodyColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="bodyText-color"
      />
    </CollapsibleSection>
  );
}
