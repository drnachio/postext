'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_RULE_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  DesignRuleElement,
  ResolvedDesignRuleElement,
  HAlign,
  PageParity,
  Dimension,
  ColorValue,
} from 'postext';
import type { PlacementSize } from './placementAdapter';
import {
  SelectInput,
  DimensionInput,
  ColorPicker,
} from '../../../controls';
import {
  type SlotKind,
  alignFromPlacement,
  applyAlign,
  applyMarginFromBody,
  applyMarginFromEdge,
  applyWidthMode,
  marginFromBody,
  marginFromEdge,
  widthMode,
} from './placementAdapter';

const ZERO: Dimension = { value: 0, unit: 'pt' };

interface Props {
  raw: DesignRuleElement;
  resolved: ResolvedDesignRuleElement;
  slotKind: SlotKind;
  onChange: (next: DesignRuleElement) => void;
}

export function RuleElementEditor({ raw, resolved, slotKind, onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<DesignRuleElement>) => {
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

  const mode = widthMode(resolved.placement.size);
  const customWidth: Dimension =
    resolved.placement.size && typeof resolved.placement.size.width === 'object'
      ? resolved.placement.size.width
      : { value: 40, unit: 'pt' };

  const align = alignFromPlacement(resolved.placement);
  const resolvedMarginFromBody = marginFromBody(resolved.placement, slotKind);
  const resolvedMarginFromEdge = marginFromEdge(resolved.placement);
  const defaultMarginFromBody = marginFromBody(DEFAULT_RULE_ELEMENT.placement, slotKind);
  const defaultMarginFromEdge = marginFromEdge(DEFAULT_RULE_ELEMENT.placement);

  const isColorDefault = colorsEqual(resolved.color, DEFAULT_RULE_ELEMENT.color);
  const isThicknessDefault = dimensionsEqual(resolved.thickness, DEFAULT_RULE_ELEMENT.thickness);
  const isMarginFromBodyDefault = dimensionsEqual(resolvedMarginFromBody, defaultMarginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolvedMarginFromEdge, defaultMarginFromEdge);

  const updateSize = (next: PlacementSize) => {
    update({ placement: { ...resolved.placement, size: next } });
  };

  return (
    <>
      <ColorPicker
        label={labels.headerFooterElementColor}
        value={resolved.color}
        onChange={(color: ColorValue) => update({ color })}
        isDefault={isColorDefault}
        onReset={() => update({ color: { ...DEFAULT_RULE_ELEMENT.color } })}
        fieldId={`headerFooter-rule-color-${raw.id}`}
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
        value={mode}
        options={WIDTH_MODE_OPTIONS}
        onChange={(v) => updateSize(applyWidthMode(resolved.placement.size, v as 'full' | 'custom'))}
      />
      {mode === 'custom' && (
        <DimensionInput
          label={labels.headerFooterElementWidth}
          value={customWidth}
          onChange={(dim: Dimension) => updateSize({ ...(resolved.placement.size ?? {}), width: dim })}
          min={0}
          step={1}
        />
      )}
      <SelectInput
        label={labels.headerFooterElementAlign}
        value={align}
        options={ALIGN_OPTIONS}
        onChange={(v) => update({ placement: applyAlign(resolved.placement, slotKind, v as HAlign) })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
      />
      <DimensionInput
        label={labels.headerFooterElementMarginFromBody}
        value={resolvedMarginFromBody}
        onChange={(dim: Dimension) => update({ placement: applyMarginFromBody(resolved.placement, slotKind, dim) })}
        min={0}
        step={1}
        tooltip={labels.headerFooterElementMarginFromBodyTooltip}
        isDefault={isMarginFromBodyDefault}
        onReset={() => update({ placement: applyMarginFromBody(resolved.placement, slotKind, ZERO) })}
      />
      {mode === 'custom' && align !== 'center' && (
        <DimensionInput
          label={labels.headerFooterElementMarginFromEdge}
          value={resolvedMarginFromEdge}
          onChange={(dim: Dimension) => update({ placement: applyMarginFromEdge(resolved.placement, dim) })}
          min={0}
          step={1}
          tooltip={labels.headerFooterElementMarginFromEdgeTooltip}
          isDefault={isMarginFromEdgeDefault}
          onReset={() => update({ placement: applyMarginFromEdge(resolved.placement, ZERO) })}
        />
      )}
    </>
  );
}
