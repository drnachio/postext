'use client';

import type { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_HEADINGS_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { HeadingLevelConfig, HeadingBreakBeforeConfig, HeadingBreakParity, ColorValue, Dimension, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_HEADINGS_CONFIG;

export function HeadingLevelSection({
  level,
  resolved,
  raw,
  generalFont,
  generalLineHeight,
  generalColor,
  generalFontWeight,
  generalMarginTop,
  generalMarginBottom,
  onUpdate,
  onReset,
  labels,
}: {
  level: number;
  resolved: { fontSize: Dimension; lineHeight: Dimension; fontFamily: string; color: ColorValue; fontWeight: number; marginTop: Dimension; marginBottom: Dimension; numberingTemplate: string; italic: boolean; breakBefore: { enabled: boolean; parity: HeadingBreakParity } };
  raw: HeadingLevelConfig | undefined;
  generalFont: string;
  generalLineHeight: Dimension;
  generalColor: ColorValue;
  generalFontWeight: number;
  generalMarginTop: Dimension;
  generalMarginBottom: Dimension;
  onUpdate: (level: number, partial: Partial<HeadingLevelConfig>) => void;
  onReset: (level: number, field: keyof HeadingLevelConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}) {
  const defLevel = D.levels.find((l) => l.level === level)!;

  const isSizeDefault = dimensionsEqual(resolved.fontSize, defLevel.fontSize);
  const isLhDefault = dimensionsEqual(resolved.lineHeight, generalLineHeight);
  const isFontDefault = resolved.fontFamily === generalFont;
  const isColorDefault = colorsEqual(resolved.color, generalColor);
  const isFontWeightDefault = resolved.fontWeight === generalFontWeight;
  const isMarginTopDefault = dimensionsEqual(resolved.marginTop, generalMarginTop);
  const isMarginBottomDefault = dimensionsEqual(resolved.marginBottom, generalMarginBottom);
  const isNumberingDefault = (resolved.numberingTemplate ?? '') === '';
  const isItalicDefault = resolved.italic === false;
  const isBreakBeforeEnabledDefault = resolved.breakBefore.enabled === false;
  const isBreakBeforeParityDefault = resolved.breakBefore.parity === 'any';
  const hasOverrides = raw !== undefined && Object.keys(raw).filter((k) => k !== 'level').length > 0;

  return (
    <CollapsibleSection
      title={`${labels.headingLevel}${level}`}
      sectionId={`heading-h${level}`}
      onReset={() => onReset(level, 'fontSize')}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <DimensionInput
        label={labels.headingFontSize}
        value={resolved.fontSize}
        onChange={(dim) => onUpdate(level, { fontSize: dim })}
        min={1}
        step={0.5}
        tooltip={labels.headingFontSizeTooltip}
        isDefault={isSizeDefault}
        onReset={() => onReset(level, 'fontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <DimensionInput
        label={labels.headingLineHeight}
        value={resolved.lineHeight}
        onChange={(dim) => onUpdate(level, { lineHeight: dim })}
        min={0.5}
        max={5}
        step={0.1}
        tooltip={labels.headingLineHeightTooltip}
        isDefault={isLhDefault}
        onReset={() => onReset(level, 'lineHeight')}
        units={LINE_HEIGHT_UNITS}
      />
      <FontPicker
        label={labels.headingFont}
        value={resolved.fontFamily}
        onChange={(font) => onUpdate(level, { fontFamily: font })}
        tooltip={labels.headingFontTooltip}
        isDefault={isFontDefault}
        onReset={() => onReset(level, 'fontFamily')}
        searchPlaceholder={labels.headingFontSearch}
        noResultsLabel={labels.headingFontNoResults}
      />
      <NumberInput
        label={labels.headingFontWeight}
        value={resolved.fontWeight}
        onChange={(w) => onUpdate(level, { fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.headingFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => onReset(level, 'fontWeight')}
      />
      <ColorPicker
        label={labels.headingColor}
        value={resolved.color}
        onChange={(color) => onUpdate(level, { color })}
        tooltip={labels.headingColorTooltip}
        isDefault={isColorDefault}
        onReset={() => onReset(level, 'color')}
        fieldId={`heading-h${level}-color`}
      />
      <DimensionInput
        label={labels.headingMarginTop}
        value={resolved.marginTop}
        onChange={(dim) => onUpdate(level, { marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => onReset(level, 'marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.headingMarginBottom}
        value={resolved.marginBottom}
        onChange={(dim) => onUpdate(level, { marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => onReset(level, 'marginBottom')}
        units={MARGIN_UNITS}
      />
      <ToggleSwitch
        label={labels.headingItalic}
        checked={resolved.italic}
        onChange={(v) => onUpdate(level, { italic: v })}
        tooltip={labels.headingItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => onReset(level, 'italic')}
      />
      <TextInput
        label={labels.headingNumberingTemplate}
        value={resolved.numberingTemplate ?? ''}
        onChange={(v) => onUpdate(level, { numberingTemplate: v })}
        placeholder={labels.headingNumberingTemplatePlaceholder}
        tooltip={labels.headingNumberingTemplateTooltip}
        isDefault={isNumberingDefault}
        onReset={() => onReset(level, 'numberingTemplate')}
      />
      <ToggleSwitch
        label={labels.headingBreakBefore}
        checked={resolved.breakBefore.enabled}
        onChange={(v) => {
          const next: HeadingBreakBeforeConfig = { enabled: v };
          if (resolved.breakBefore.parity !== 'any') next.parity = resolved.breakBefore.parity;
          onUpdate(level, { breakBefore: next });
        }}
        tooltip={labels.headingBreakBeforeTooltip}
        isDefault={isBreakBeforeEnabledDefault}
        onReset={() => onReset(level, 'breakBefore')}
      />
      {resolved.breakBefore.enabled && (
        <NestedGroup>
          <SelectInput
            label={labels.headingBreakBeforeParity}
            value={resolved.breakBefore.parity}
            options={[
              { value: 'any', label: labels.headingBreakBeforeParityAny },
              { value: 'odd', label: labels.headingBreakBeforeParityOdd },
              { value: 'even', label: labels.headingBreakBeforeParityEven },
              { value: 'always-odd', label: labels.headingBreakBeforeParityAlwaysOdd },
              { value: 'always-even', label: labels.headingBreakBeforeParityAlwaysEven },
            ]}
            onChange={(v) => onUpdate(level, { breakBefore: { enabled: true, parity: v as HeadingBreakParity } })}
            tooltip={labels.headingBreakBeforeParityTooltip}
            isDefault={isBreakBeforeParityDefault}
            onReset={() => onUpdate(level, { breakBefore: { enabled: true } })}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}
