'use client';

import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { DEFAULT_BOX_ELEMENT, colorsEqual, dimensionsEqual, uniformRadius } from 'postext';
import type {
  DesignBoxElement,
  ResolvedDesignBoxElement,
  PageParity,
  Dimension,
  ColorValue,
  ElementSize,
} from 'postext';
import {
  SelectInput,
  DimensionInput,
  ColorPicker,
} from '../../../../controls/index.js';
import { SizeToFields, isSizeTo, type FrameTarget } from './sizeTo.js';
import { BorderSidesFields, CornerRadiusFields } from './shapeFields.js';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields.js';
import {
  type SlotKind,
  alignFromPlacement,
  applyMarginFromBody,
  applyMarginFromEdge,
  isContainerAnchor,
  marginFromBody,
  marginFromEdge,
} from './placementAdapter.js';

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
  siblings?: Sibling[];
  /** The frames and groups of the template, on a composed page's decoration. */
  frames?: FrameTarget[];
  onChange: (next: DesignBoxElement) => void;
}

export function BoxElementEditor({ raw, resolved, slotKind, siblings = [], frames = [], onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<DesignBoxElement>) => {
    onChange({ ...raw, ...partial });
  };

  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];

  const width = sizeDim(resolved.placement.size?.width, DEFAULT_SIZE_DIM);
  const height = sizeDim(resolved.placement.size?.height, DEFAULT_SIZE_DIM);
  // A side may run to an edge of another box (#945).
  const widthSize = resolved.placement.size?.width;
  const heightSize = resolved.placement.size?.height;
  const widthTo = isSizeTo(widthSize) ? widthSize : undefined;
  const heightTo = isSizeTo(heightSize) ? heightSize : undefined;
  const align = alignFromPlacement(resolved.placement);
  const inContainer = isContainerAnchor(resolved.placement);
  const resolvedMarginFromBody = marginFromBody(resolved.placement, slotKind);
  const resolvedMarginFromEdge = marginFromEdge(resolved.placement);
  const defaultMarginFromBody = marginFromBody(DEFAULT_BOX_ELEMENT.placement, slotKind);
  const defaultMarginFromEdge = marginFromEdge(DEFAULT_BOX_ELEMENT.placement);

  const bgColor: ColorValue | undefined = resolved.style.backgroundColor;
  const borderColor: ColorValue | undefined = resolved.style.borderColor;
  const borderWidth: Dimension = resolved.style.borderWidth ?? ZERO;

  const isMarginFromBodyDefault = dimensionsEqual(resolvedMarginFromBody, defaultMarginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolvedMarginFromEdge, defaultMarginFromEdge);
  const defaultRadius = DEFAULT_BOX_ELEMENT.style.borderRadius;
  const isBorderRadiusDefault = defaultRadius === undefined
    ? resolved.style.borderRadius === undefined
    : !!uniformRadius(resolved.style.borderRadius) && dimensionsEqual(uniformRadius(resolved.style.borderRadius)!, uniformRadius(defaultRadius) ?? ZERO);
  const isBgDefault =
    (bgColor && DEFAULT_BOX_ELEMENT.style.backgroundColor)
      ? colorsEqual(bgColor, DEFAULT_BOX_ELEMENT.style.backgroundColor)
      : bgColor === DEFAULT_BOX_ELEMENT.style.backgroundColor;

  const updateSize = (next: { width?: ElementSize; height?: ElementSize }) => {
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
      {!widthTo && (
        <DimensionInput
          label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip}
          value={width}
          onChange={(dim: Dimension) => updateSize({ width: dim })}
          min={0}
          step={1}
        />
      )}
      <SizeToFields
        axis="width"
        value={widthTo}
        slotKind={slotKind}
        siblings={siblings}
        frames={frames}
        allowNone
        onChange={(to) => updateSize({ width: to ?? width })}
      />
      {!heightTo && (
        <DimensionInput
          label={labels.height}
          value={height}
          onChange={(dim: Dimension) => updateSize({ height: dim })}
          min={0}
          step={1}
        />
      )}
      <SizeToFields
        axis="height"
        value={heightTo}
        slotKind={slotKind}
        siblings={siblings}
        frames={frames}
        allowNone
        onChange={(to) => updateSize({ height: to ?? height })}
      />
      <ColorPicker
        label={labels.headerFooterElementBoxBackgroundColor}
        value={bgColor ?? { hex: '#000000', model: 'hex' }}
        onChange={(c: ColorValue) => updateStyle({ backgroundColor: c })}
        isDefault={isBgDefault}
        onReset={() => updateStyle({ backgroundColor: DEFAULT_BOX_ELEMENT.style.backgroundColor })}
        fieldId={`headerFooter-box-bg-${raw.id}`}
      />
      <ColorPicker
        label={labels.headerFooterElementBoxBorderColor}
        value={borderColor ?? { hex: '#000000', model: 'hex' }}
        onChange={(c: ColorValue) => updateStyle({ borderColor: c })}
        fieldId={`headerFooter-box-border-${raw.id}`}
      />
      <DimensionInput
        label={labels.headerFooterElementBoxBorderWidth}
        value={borderWidth}
        onChange={(dim: Dimension) => updateStyle({ borderWidth: dim })}
        min={0}
        step={0.1}
      />
      {/* The border per side (#1059/#1063), over the whole border. */}
      <BorderSidesFields
        sides={resolved.style.borderSides}
        whole={{ enabled: !!borderColor && borderWidth.value > 0, color: borderColor ?? { hex: '#000000', model: 'hex' }, width: borderWidth }}
        fieldId={`headerFooter-box-${raw.id}`}
        onChange={(borderSides) => {
          const style = { ...resolved.style };
          if (borderSides === undefined) delete style.borderSides;
          else style.borderSides = borderSides;
          update({ style });
        }}
      />
      <CornerRadiusFields
        label={labels.headerFooterElementBoxBorderRadius}
        value={resolved.style.borderRadius}
        fallback={ZERO}
        isDefault={isBorderRadiusDefault}
        onReset={() => updateStyle({ borderRadius: DEFAULT_BOX_ELEMENT.style.borderRadius })}
        onChange={(borderRadius) => updateStyle({ borderRadius })}
      />
      <PlacementFields
        placement={resolved.placement}
        slotKind={slotKind}
        siblings={siblings}
        frames={frames}
        pin={raw.pin}
        onPinChange={(pin) => update({ pin })}
        onChange={(placement) => update({ placement })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
        tooltip={labels.headerFooterElementParityTooltip}
      />
      <PagesSelect
        value={raw.pages}
        onChange={(pages) => {
          const next: DesignBoxElement = { ...raw };
          if (pages === undefined) delete next.pages;
          else next.pages = pages;
          onChange(next);
        }}
      />
      {inContainer && (
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
      )}
      {inContainer && align !== 'center' && (
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
