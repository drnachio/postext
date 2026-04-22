'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_RULE_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  HeaderFooterRuleElement,
  ResolvedHeaderFooterRuleElement,
  HeaderFooterHAlign,
  PageParity,
  Dimension,
  ColorValue,
} from 'postext';
import {
  SelectInput,
  DimensionInput,
  ColorPicker,
} from '../../../controls';

interface Props {
  raw: HeaderFooterRuleElement;
  resolved: ResolvedHeaderFooterRuleElement;
  onChange: (next: HeaderFooterRuleElement) => void;
}

export function RuleElementEditor({ raw, resolved, onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<HeaderFooterRuleElement>) => {
    onChange({ ...raw, ...partial });
  };

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headerFooterElementAlignLeft },
    { value: 'center', label: labels.headerFooterElementAlignCenter },
    { value: 'right', label: labels.headerFooterElementAlignRight },
  ];
  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];
  const WIDTH_MODE_OPTIONS = [
    { value: 'full', label: labels.headerFooterElementWidthFull },
    { value: 'custom', label: labels.headerFooterElementWidthCustom },
  ];

  const widthMode: 'full' | 'custom' = raw.width === 'full' ? 'full' : 'custom';
  const isColorDefault = colorsEqual(resolved.color, DEFAULT_RULE_ELEMENT.color);
  const isThicknessDefault = dimensionsEqual(resolved.thickness, DEFAULT_RULE_ELEMENT.thickness);
  const isMarginFromBodyDefault = dimensionsEqual(resolved.marginFromBody, DEFAULT_RULE_ELEMENT.marginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolved.marginFromEdge, DEFAULT_RULE_ELEMENT.marginFromEdge);

  return (
    <>
      <ColorPicker
        label={labels.headerFooterElementColor}
        value={resolved.color}
        onChange={(color: ColorValue) => update({ color })}
        isDefault={isColorDefault}
        onReset={() => update({ color: { ...DEFAULT_RULE_ELEMENT.color } })}
        fieldId={`headerFooter-rule-color-${resolved.thickness.value}`}
      />
      <DimensionInput
        label={labels.headerFooterElementThickness}
        value={resolved.thickness}
        onChange={(dim: Dimension) => update({ thickness: dim })}
        min={0.1}
        step={0.1}
        isDefault={isThicknessDefault}
        onReset={() => update({ thickness: { ...DEFAULT_RULE_ELEMENT.thickness } })}
      />
      <SelectInput
        label={labels.headerFooterElementWidth}
        value={widthMode}
        options={WIDTH_MODE_OPTIONS}
        onChange={(v) => {
          if (v === 'full') update({ width: 'full' });
          else update({ width: { value: 40, unit: 'pt' } as Dimension });
        }}
      />
      {widthMode === 'custom' && typeof raw.width !== 'string' && (
        <DimensionInput
          label={labels.headerFooterElementWidth}
          value={raw.width as Dimension}
          onChange={(dim: Dimension) => update({ width: dim })}
          min={0}
          step={1}
        />
      )}
      <SelectInput
        label={labels.headerFooterElementAlign}
        value={resolved.align}
        options={ALIGN_OPTIONS}
        onChange={(v) => update({ align: v as HeaderFooterHAlign })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={resolved.parity}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
      />
      <DimensionInput
        label={labels.headerFooterElementMarginFromBody}
        value={resolved.marginFromBody}
        onChange={(dim: Dimension) => update({ marginFromBody: dim })}
        min={0}
        step={1}
        tooltip={labels.headerFooterElementMarginFromBodyTooltip}
        isDefault={isMarginFromBodyDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.marginFromBody;
          onChange(next);
        }}
      />
      {widthMode === 'custom' && resolved.align !== 'center' && (
        <DimensionInput
          label={labels.headerFooterElementMarginFromEdge}
          value={resolved.marginFromEdge}
          onChange={(dim: Dimension) => update({ marginFromEdge: dim })}
          min={0}
          step={1}
          tooltip={labels.headerFooterElementMarginFromEdgeTooltip}
          isDefault={isMarginFromEdgeDefault}
          onReset={() => {
            const next = { ...raw };
            delete next.marginFromEdge;
            onChange(next);
          }}
        />
      )}
    </>
  );
}
