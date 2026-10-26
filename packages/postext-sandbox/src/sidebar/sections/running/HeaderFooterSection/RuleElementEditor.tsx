'use client';

import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { DEFAULT_RULE_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  DesignRuleElement,
  ResolvedDesignRuleElement,
  PageParity,
  Dimension,
  ColorValue,
} from 'postext';
import type { PlacementSize } from './placementAdapter.js';
import {
  SelectInput,
  DimensionInput,
  ColorPicker,
} from '../../../../controls/index.js';
import { SizeToFields, isSizeTo, type FrameTarget } from './sizeTo.js';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields.js';
import {
  type SlotKind,
  alignFromPlacement,
  applyMarginFromBody,
  applyMarginFromEdge,
  applyWidthMode,
  isContainerAnchor,
  marginFromBody,
  marginFromEdge,
  widthMode,
} from './placementAdapter.js';

const ZERO: Dimension = { value: 0, unit: 'pt' };

interface Props {
  raw: DesignRuleElement;
  resolved: ResolvedDesignRuleElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  /** The frames and groups of the template, on a composed page's decoration. */
  frames?: FrameTarget[];
  onChange: (next: DesignRuleElement) => void;
}

export function RuleElementEditor({ raw, resolved, slotKind, siblings = [], frames = [], onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<DesignRuleElement>) => {
    onChange({ ...raw, ...partial });
  };

  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];
  const WIDTH_MODE_OPTIONS = [
    { value: 'full', label: labels.headerFooterElementWidthFull },
    { value: 'custom', label: labels.headerFooterElementWidthCustom },
  ];
  const DIRECTION_OPTIONS = [
    { value: 'horizontal', label: labels.headerFooterElementDirectionHorizontal },
    { value: 'vertical', label: labels.headerFooterElementDirectionVertical },
  ];
  const vertical = resolved.direction === 'vertical';
  const heightSize = resolved.placement.size?.height;
  // A length that runs to another box's edge (#928, #945) has fields of its own.
  const lengthTo = isSizeTo(heightSize) ? heightSize : undefined;
  const lengthMode: 'full' | 'custom' = heightSize && typeof heightSize === 'object' && 'value' in heightSize ? 'custom' : 'full';
  const customLength: Dimension = heightSize && typeof heightSize === 'object' && 'value' in heightSize ? heightSize : { value: 40, unit: 'pt' };

  const mode = widthMode(resolved.placement.size);
  const ruleWidth = resolved.placement.size?.width;
  const widthTo = isSizeTo(ruleWidth) ? ruleWidth : undefined;
  const customWidth: Dimension =
    ruleWidth && typeof ruleWidth === 'object' && 'value' in ruleWidth
      ? ruleWidth
      : { value: 40, unit: 'pt' };

  const align = alignFromPlacement(resolved.placement);
  const inContainer = isContainerAnchor(resolved.placement);
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
        label={labels.headerFooterElementDirection}
        value={resolved.direction}
        options={DIRECTION_OPTIONS}
        onChange={(v) => update({ direction: v as DesignRuleElement['direction'] })}
        tooltip={labels.headerFooterElementDirectionTooltip}
        isDefault={resolved.direction === DEFAULT_RULE_ELEMENT.direction}
        onReset={() => update({ direction: DEFAULT_RULE_ELEMENT.direction })}
      />
      {vertical ? (
        <>
          {!lengthTo && (
            <SelectInput
              label={labels.headerFooterElementLength}
              value={lengthMode}
              options={WIDTH_MODE_OPTIONS}
              onChange={(v) => {
                const size = { ...(resolved.placement.size ?? {}) };
                if (v === 'full') delete size.height;
                else size.height = customLength;
                updateSize(size);
              }}
              tooltip={labels.headerFooterElementLengthTooltip}
            />
          )}
          {!lengthTo && lengthMode === 'custom' && (
            <DimensionInput
              label={labels.headerFooterElementLength}
              value={customLength}
              onChange={(dim: Dimension) => updateSize({ ...(resolved.placement.size ?? {}), height: dim })}
              min={0}
              step={1}
            />
          )}
          <SizeToFields
            axis="height"
            value={lengthTo}
            slotKind={slotKind}
            siblings={siblings}
            frames={frames}
            allowNone
            onChange={(to) => {
              const size = { ...(resolved.placement.size ?? {}) };
              if (to) size.height = to;
              else delete size.height;
              updateSize(size);
            }}
          />
        </>
      ) : (
        <>
          {!widthTo && (
            <SelectInput
              label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip}
              value={mode}
              options={WIDTH_MODE_OPTIONS}
              onChange={(v) => updateSize(applyWidthMode(resolved.placement.size, v as 'full' | 'custom'))}
            />
          )}
          {!widthTo && mode === 'custom' && (
            <DimensionInput
              label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip}
              value={customWidth}
              onChange={(dim: Dimension) => updateSize({ ...(resolved.placement.size ?? {}), width: dim })}
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
            onChange={(to) => updateSize(to ? { ...(resolved.placement.size ?? {}), width: to } : applyWidthMode(resolved.placement.size, 'full'))}
          />
        </>
      )}
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
          const next: DesignRuleElement = { ...raw };
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
      {inContainer && mode === 'custom' && !widthTo && align !== 'center' && (
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
