'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_TEXT_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  HeaderFooterTextElement,
  ResolvedHeaderFooterTextElement,
  HeaderFooterHAlign,
  PageParity,
  Dimension,
  DimensionUnit,
  ColorValue,
} from 'postext';
import {
  TextInput,
  SelectInput,
  FontPicker,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
  ColorPicker,
} from '../../../controls';
import { PlaceholderPicker } from './PlaceholderPicker';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];

interface Props {
  raw: HeaderFooterTextElement;
  resolved: ResolvedHeaderFooterTextElement;
  onChange: (next: HeaderFooterTextElement) => void;
}

export function TextElementEditor({ raw, resolved, onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<HeaderFooterTextElement>) => {
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

  const insertAtCursor = (placeholder: string) => {
    update({ content: `${raw.content ?? ''}{${placeholder}}` });
  };

  const isFontDefault = resolved.fontFamily === DEFAULT_TEXT_ELEMENT.fontFamily;
  const isSizeDefault = dimensionsEqual(resolved.fontSize, DEFAULT_TEXT_ELEMENT.fontSize);
  const isWeightDefault = resolved.fontWeight === DEFAULT_TEXT_ELEMENT.fontWeight;
  const isItalicDefault = resolved.italic === DEFAULT_TEXT_ELEMENT.italic;
  const isColorDefault = colorsEqual(resolved.color, DEFAULT_TEXT_ELEMENT.color);
  const isMarginFromBodyDefault = dimensionsEqual(resolved.marginFromBody, DEFAULT_TEXT_ELEMENT.marginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolved.marginFromEdge, DEFAULT_TEXT_ELEMENT.marginFromEdge);

  return (
    <>
      <TextInput
        label={labels.headerFooterElementContent}
        value={raw.content}
        onChange={(v) => update({ content: v })}
        tooltip={labels.headerFooterElementContentTooltip}
        widthCh={20}
      />
      <PlaceholderPicker onInsert={insertAtCursor} />
      <SelectInput
        label={labels.headerFooterElementAlign}
        value={raw.align}
        options={ALIGN_OPTIONS}
        onChange={(v) => update({ align: v as HeaderFooterHAlign })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
      />
      <FontPicker
        label={labels.headerFooterElementFontFamily}
        value={resolved.fontFamily}
        onChange={(font) => update({ fontFamily: font })}
        isDefault={isFontDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.fontFamily;
          onChange(next);
        }}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.headerFooterElementFontSize}
        value={resolved.fontSize}
        onChange={(dim: Dimension) => update({ fontSize: dim })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={isSizeDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.fontSize;
          onChange(next);
        }}
      />
      <NumberInput
        label={labels.headerFooterElementFontWeight}
        value={resolved.fontWeight}
        onChange={(v) => update({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={isWeightDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.fontWeight;
          onChange(next);
        }}
      />
      <ToggleSwitch
        label={labels.headerFooterElementItalic}
        checked={resolved.italic}
        onChange={(v) => update({ italic: v })}
        isDefault={isItalicDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.italic;
          onChange(next);
        }}
      />
      <ColorPicker
        label={labels.headerFooterElementColor}
        value={resolved.color}
        onChange={(color: ColorValue) => update({ color })}
        isDefault={isColorDefault}
        onReset={() => {
          const next = { ...raw };
          delete next.color;
          onChange(next);
        }}
        fieldId={`headerFooter-text-color-${raw.content.slice(0, 8)}`}
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
      {resolved.align !== 'center' && (
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
