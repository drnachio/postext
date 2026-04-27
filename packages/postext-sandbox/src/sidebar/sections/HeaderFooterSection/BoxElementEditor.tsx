'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_BOX_ELEMENT, colorsEqual, dimensionsEqual } from 'postext';
import type {
  DesignBoxElement,
  ResolvedDesignBoxElement,
  HAlign,
  PageParity,
  Dimension,
  ColorValue,
  ElementSize,
} from 'postext';
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
  marginFromBody,
  marginFromEdge,
} from './placementAdapter';

const ZERO: Dimension = { value: 0, unit: 'pt' };
const DEFAULT_SIZE_DIM: Dimension = { value: 20, unit: 'pt' };

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  if (size && typeof size === 'object' && 'value' in size) return size;
  return fallback;
}

interface Props {
  raw: DesignBoxElement;
  resolved: ResolvedDesignBoxElement;
  slotKind: SlotKind;
  onChange: (next: DesignBoxElement) => void;
}

export function BoxElementEditor({ raw, resolved, slotKind, onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<DesignBoxElement>) => {
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

  const width = sizeDim(resolved.placement.size?.width, DEFAULT_SIZE_DIM);
  const height = sizeDim(resolved.placement.size?.height, DEFAULT_SIZE_DIM);
  const align = alignFromPlacement(resolved.placement);
  const resolvedMarginFromBody = marginFromBody(resolved.placement, slotKind);
  const resolvedMarginFromEdge = marginFromEdge(resolved.placement);
  const defaultMarginFromBody = marginFromBody(DEFAULT_BOX_ELEMENT.placement, slotKind);
  const defaultMarginFromEdge = marginFromEdge(DEFAULT_BOX_ELEMENT.placement);

  const bgColor: ColorValue | undefined = resolved.style.backgroundColor;
  const borderColor: ColorValue | undefined = resolved.style.borderColor;
  const borderWidth: Dimension = resolved.style.borderWidth ?? ZERO;
  const borderRadius: Dimension = resolved.style.borderRadius ?? ZERO;

  const isMarginFromBodyDefault = dimensionsEqual(resolvedMarginFromBody, defaultMarginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolvedMarginFromEdge, defaultMarginFromEdge);
  const isBorderRadiusDefault = dimensionsEqual(
    borderRadius,
    DEFAULT_BOX_ELEMENT.style.borderRadius ?? ZERO,
  );
  const isBgDefault =
    (bgColor && DEFAULT_BOX_ELEMENT.style.backgroundColor)
      ? colorsEqual(bgColor, DEFAULT_BOX_ELEMENT.style.backgroundColor)
      : bgColor === DEFAULT_BOX_ELEMENT.style.backgroundColor;

  const updateSize = (next: { width?: Dimension; height?: Dimension }) => {
    update({
      placement: {
        ...resolved.placement,
        size: {
          ...(resolved.placement.size ?? {}),
          ...next,
        },
      },
    });
  };

  const updateStyle = (partial: Partial<typeof resolved.style>) => {
    update({ style: { ...resolved.style, ...partial } });
  };

  return (
    <>
      <DimensionInput
        label={labels.headerFooterElementWidth}
        value={width}
        onChange={(dim: Dimension) => updateSize({ width: dim })}
        min={0}
        step={1}
      />
      <DimensionInput
        label={labels.height}
        value={height}
        onChange={(dim: Dimension) => updateSize({ height: dim })}
        min={0}
        step={1}
      />
      <ColorPicker
        label={labels.headerFooterElementBoxBackgroundColor ?? 'Background'}
        value={bgColor ?? { hex: '#000000', model: 'hex' }}
        onChange={(c: ColorValue) => updateStyle({ backgroundColor: c })}
        isDefault={isBgDefault}
        onReset={() => updateStyle({ backgroundColor: DEFAULT_BOX_ELEMENT.style.backgroundColor })}
        fieldId={`headerFooter-box-bg-${raw.id}`}
      />
      <ColorPicker
        label={labels.headerFooterElementBoxBorderColor ?? 'Border color'}
        value={borderColor ?? { hex: '#000000', model: 'hex' }}
        onChange={(c: ColorValue) => updateStyle({ borderColor: c })}
        fieldId={`headerFooter-box-border-${raw.id}`}
      />
      <DimensionInput
        label={labels.headerFooterElementBoxBorderWidth ?? 'Border width'}
        value={borderWidth}
        onChange={(dim: Dimension) => updateStyle({ borderWidth: dim })}
        min={0}
        step={0.1}
      />
      <DimensionInput
        label={labels.headerFooterElementBoxBorderRadius ?? 'Border radius'}
        value={borderRadius}
        onChange={(dim: Dimension) => updateStyle({ borderRadius: dim })}
        min={0}
        step={0.5}
        isDefault={isBorderRadiusDefault}
        onReset={() => updateStyle({ borderRadius: DEFAULT_BOX_ELEMENT.style.borderRadius })}
      />
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
      {align !== 'center' && (
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
