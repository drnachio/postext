'use client';

import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';

import { useState } from 'react';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_TEXT_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  DesignTextElement,
  ResolvedDesignTextElement,
  ElementBoxStyle,
  PageParity,
  Dimension,
  DimensionUnit,
  ColorValue,
  ElementSize,
  VAlign,
  DesignTextAlign,
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
import { NestedGroup } from '../../../controls';
import { lineHeightFieldValue, lineHeightFromField } from './lineHeight';
import { PlaceholderPicker } from './PlaceholderPicker';
import { DropCapFields } from '../../settings/DropCapFields';
import { useRightToLeftFlow } from '../../settings/flowSides';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields';
import {
  type SlotKind,
  alignFromPlacement,
  applyMarginFromBody,
  applyMarginFromEdge,
  marginFromBody,
  marginFromEdge,
  isContainerAnchor,
} from './placementAdapter';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
const BOX_SIZE_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
const ZERO: Dimension = { value: 0, unit: 'pt' };
const DEFAULT_CUSTOM_WIDTH: Dimension = { value: 40, unit: 'mm' };
const DEFAULT_CUSTOM_HEIGHT: Dimension = { value: 10, unit: 'mm' };

type SizeMode = 'auto' | 'fill' | 'custom';

function sizeMode(size: ElementSize | undefined): SizeMode {
  if (size === 'fill') return 'fill';
  if (size && typeof size === 'object') return 'custom';
  return 'auto';
}

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  return size && typeof size === 'object' ? size : fallback;
}

interface Props {
  raw: DesignTextElement;
  resolved: ResolvedDesignTextElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  onChange: (next: DesignTextElement) => void;
}

export function TextElementEditor({ raw, resolved, slotKind, siblings = [], onChange }: Props) {
  const labels = useSandboxLabels();
  const [showPicker, setShowPicker] = useState(false);

  const rtlBook = useRightToLeftFlow();
  const logicalAlign = rtlBook || raw.direction !== undefined || raw.align === 'start' || raw.align === 'end';
  const update = (partial: Partial<DesignTextElement>) => {
    onChange({ ...raw, ...partial });
  };

  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];

  type Stroke = NonNullable<DesignTextElement['stroke']>;
  /** Merge into `stroke`; a zero width drops the outline altogether, and
   *  unset colour / hollow keys are left out. */
  const updateStroke = (partial: Partial<Stroke>) => {
    const stroke: Stroke = { width: raw.stroke?.width ?? ZERO, ...raw.stroke, ...partial };
    if (stroke.color === undefined) delete stroke.color;
    if (!stroke.hollow) delete stroke.hollow;
    const next: DesignTextElement = { ...raw };
    if (stroke.width.value > 0) next.stroke = stroke;
    else delete next.stroke;
    onChange(next);
  };
  const strokeWidth = raw.stroke?.width ?? ZERO;

  const insertAtCursor = (placeholder: string) => {
    update({ content: `${raw.content ?? ''}{${placeholder}}` });
  };

  const align = alignFromPlacement(resolved.placement);
  const resolvedMarginFromBody = marginFromBody(resolved.placement, slotKind);
  const resolvedMarginFromEdge = marginFromEdge(resolved.placement);
  const defaultMarginFromBody = marginFromBody(DEFAULT_TEXT_ELEMENT.placement, slotKind);
  const defaultMarginFromEdge = marginFromEdge(DEFAULT_TEXT_ELEMENT.placement);

  const isFontDefault = resolved.fontFamily === DEFAULT_TEXT_ELEMENT.fontFamily;
  const isSizeDefault = dimensionsEqual(resolved.fontSize, DEFAULT_TEXT_ELEMENT.fontSize);
  const isWeightDefault = resolved.fontWeight === DEFAULT_TEXT_ELEMENT.fontWeight;
  const isItalicDefault = resolved.italic === DEFAULT_TEXT_ELEMENT.italic;
  const isColorDefault = colorsEqual(resolved.color, DEFAULT_TEXT_ELEMENT.color);
  const isVerticalAlignDefault = raw.verticalAlign === undefined;
  const isLineHeightDefault = raw.lineHeight === undefined;
  // Leading: `em` is the multiplier of the font size, `pt` / `mm` the
  // distance between baselines (see `lineHeightFromField`).
  const lineHeightValue = lineHeightFieldValue(resolved);
  const updateLineHeight = (dim: Dimension) => {
    update({ lineHeight: lineHeightFromField(lineHeightValue, dim, resolved.fontSize) });
  };
  const isLetterSpacingDefault = raw.letterSpacing === undefined;
  const isTextTransformDefault = raw.textTransform === undefined || raw.textTransform === 'none';
  const widthMode = sizeMode(raw.placement.size?.width);
  const heightMode = sizeMode(raw.placement.size?.height);
  const maxWidth = raw.placement.size?.maxWidth;
  const isMarginFromBodyDefault = dimensionsEqual(resolvedMarginFromBody, defaultMarginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolvedMarginFromEdge, defaultMarginFromEdge);

  /** Merge into `placement.size`, dropping keys set to `undefined`. */
  const updateSize = (partial: { width?: ElementSize; height?: ElementSize; maxWidth?: ElementSize }) => {
    const size: NonNullable<DesignTextElement['placement']['size']> = { ...(raw.placement.size ?? {}) };
    for (const [k, v] of Object.entries(partial) as [keyof typeof size, ElementSize | undefined][]) {
      if (v === undefined) delete size[k];
      else size[k] = v;
    }
    const placement = { ...raw.placement };
    if (Object.keys(size).length === 0) delete placement.size;
    else placement.size = size;
    update({ placement });
  };
  const applySizeMode = (axis: 'width' | 'height', mode: SizeMode) => {
    const fallback = axis === 'width' ? DEFAULT_CUSTOM_WIDTH : DEFAULT_CUSTOM_HEIGHT;
    const current = raw.placement.size?.[axis];
    updateSize({
      [axis]: mode === 'auto' ? undefined : mode === 'fill' ? 'fill' : sizeDim(current, fallback),
    });
  };

  const SIZE_MODE_OPTIONS = [
    { value: 'auto', label: labels.headerFooterElementSizeAuto },
    { value: 'fill', label: labels.headerFooterElementSizeFill },
    { value: 'custom', label: labels.headerFooterElementWidthCustom },
  ];
  const VERTICAL_ALIGN_OPTIONS = [
    { value: 'top', label: labels.headerFooterElementVerticalAlignTop },
    { value: 'middle', label: labels.headerFooterElementVerticalAlignMiddle },
    { value: 'bottom', label: labels.headerFooterElementVerticalAlignBottom },
  ];
  const TEXT_TRANSFORM_OPTIONS = [
    { value: 'none', label: labels.headingTextTransformNone },
    { value: 'uppercase', label: labels.headingTextTransformUppercase },
  ];

  return (
    <>
      <TextInput
        label={labels.headerFooterElementContent}
        value={raw.content}
        onChange={(v) => update({ content: v })}
        tooltip={labels.headerFooterElementContentTooltip}
        widthCh={20}
        onFocus={() => setShowPicker(true)}
        onBlur={() => { setTimeout(() => setShowPicker(false), 150); }}
      />
      {showPicker && <PlaceholderPicker onInsert={insertAtCursor} slotKind={slotKind} />}
      <PlacementFields
        placement={resolved.placement}
        slotKind={slotKind}
        siblings={siblings}
        onChange={(placement, impliedAlign) =>
          update({ placement, ...(impliedAlign ? { align: impliedAlign } : {}) })
        }
      />
      <SelectInput
        label={labels.headerFooterElementWidth}
        value={widthMode}
        options={SIZE_MODE_OPTIONS}
        onChange={(v) => applySizeMode('width', v as SizeMode)}
        tooltip={labels.headerFooterElementTextWidthTooltip}
        isDefault={widthMode === 'auto'}
        onReset={() => applySizeMode('width', 'auto')}
      />
      {widthMode === 'custom' && (
        <DimensionInput
          label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip}
          value={sizeDim(raw.placement.size?.width, DEFAULT_CUSTOM_WIDTH)}
          onChange={(dim: Dimension) => updateSize({ width: dim })}
          min={0}
          step={1}
          units={BOX_SIZE_UNITS}
        />
      )}
      {widthMode === 'auto' && (
        <DimensionInput
          label={labels.headerFooterElementMaxWidth}
          value={sizeDim(maxWidth, ZERO)}
          onChange={(dim: Dimension) => updateSize({ maxWidth: dim.value > 0 ? dim : undefined })}
          min={0}
          step={1}
          units={BOX_SIZE_UNITS}
          tooltip={labels.headerFooterElementMaxWidthTooltip}
          isDefault={maxWidth === undefined}
          onReset={() => updateSize({ maxWidth: undefined })}
        />
      )}
      <SelectInput
        label={labels.height}
        value={heightMode}
        options={SIZE_MODE_OPTIONS}
        onChange={(v) => applySizeMode('height', v as SizeMode)}
        tooltip={labels.headerFooterElementTextHeightTooltip}
        isDefault={heightMode === 'auto'}
        onReset={() => applySizeMode('height', 'auto')}
      />
      {heightMode === 'custom' && (
        <DimensionInput
          label={labels.height}
          value={sizeDim(raw.placement.size?.height, DEFAULT_CUSTOM_HEIGHT)}
          onChange={(dim: Dimension) => updateSize({ height: dim })}
          min={0}
          step={1}
          units={BOX_SIZE_UNITS}
        />
      )}
      <SelectInput
        label={labels.headerFooterElementTextDirection}
        value={raw.direction ?? 'document'}
        options={[
          { value: 'document', label: labels.headerFooterElementTextDirectionDocument },
          { value: 'ltr', label: labels.documentDirectionLtr },
          { value: 'rtl', label: labels.documentDirectionRtl },
          { value: 'auto', label: labels.headerFooterElementTextDirectionAuto },
        ]}
        onChange={(v) => {
          const next: DesignTextElement = { ...raw };
          if (v === 'ltr' || v === 'rtl' || v === 'auto') next.direction = v;
          else delete next.direction;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementTextDirectionTooltip}
        isDefault={raw.direction === undefined}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.direction;
          onChange(next);
        }}
      />
      <SelectInput
        label={labels.headerFooterElementTextAlign}
        value={resolved.align}
        // Start and end (the sides the text's direction reads from and to)
        // join the sheet's sides when they can differ from left and right:
        // a right-to-left book, an element with its own direction, or one
        // already set so. The list then drops its icons for room.
        variant={logicalAlign ? undefined : 'segmented'}
        options={[
          { value: 'left', label: labels.headerFooterElementAlignLeft, icon: <AlignLeft size={13} /> },
          { value: 'center', label: labels.headerFooterElementAlignCenter, icon: <AlignCenter size={13} /> },
          { value: 'right', label: labels.headerFooterElementAlignRight, icon: <AlignRight size={13} /> },
          { value: 'justify', label: labels.headerFooterElementAlignJustify, icon: <AlignJustify size={13} /> },
          ...(logicalAlign
            ? [
                { value: 'start', label: labels.headerFooterElementAlignStart },
                { value: 'end', label: labels.headerFooterElementAlignEnd },
              ]
            : []),
        ]}
        onChange={(v) => update({ align: v as DesignTextAlign })}
        tooltip={labels.headerFooterElementTextAlignTooltip}
        isDefault={raw.align === undefined}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.align;
          onChange(next);
        }}
      />
      <SelectInput
        label={labels.headerFooterElementVerticalAlign}
        value={resolved.verticalAlign}
        options={VERTICAL_ALIGN_OPTIONS}
        onChange={(v) => update({ verticalAlign: v as VAlign })}
        tooltip={labels.headerFooterElementVerticalAlignTooltip}
        isDefault={isVerticalAlignDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.verticalAlign;
          onChange(next);
        }}
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
          const next: DesignTextElement = { ...raw };
          if (pages === undefined) delete next.pages;
          else next.pages = pages;
          onChange(next);
        }}
      />
      <FontPicker
        label={labels.headerFooterElementFontFamily}
        value={resolved.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily ?? ''}
        onChange={(font) => update({ fontFamily: font })}
        isDefault={isFontDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.fontFamily = undefined;
          onChange(next);
        }}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
        tooltip={labels.headerFooterElementFontFamilyTooltip}
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
          const next: DesignTextElement = { ...raw };
          next.fontSize = undefined as unknown as Dimension;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementFontSizeTooltip}
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
          const next: DesignTextElement = { ...raw };
          next.fontWeight = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementFontWeightTooltip}
      />
      <ToggleSwitch
        label={labels.headerFooterElementItalic}
        checked={resolved.italic}
        onChange={(v) => update({ italic: v })}
        isDefault={isItalicDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.italic = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementItalicTooltip}
      />
      <ColorPicker
        label={labels.headerFooterElementColor}
        value={resolved.color}
        onChange={(color: ColorValue) => update({ color })}
        isDefault={isColorDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.color = undefined;
          onChange(next);
        }}
        fieldId={`headerFooter-text-color-${raw.id}`}
        tooltip={labels.headerFooterElementColorTooltip}
      />
      <DimensionInput
        label={labels.headerFooterElementLineHeight}
        value={lineHeightValue}
        onChange={updateLineHeight}
        min={0.1}
        step={0.05}
        units={LINE_HEIGHT_UNITS}
        tooltip={labels.headerFooterElementLineHeightTooltip}
        isDefault={isLineHeightDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.lineHeight;
          onChange(next);
        }}
      />
      <DimensionInput
        label={labels.headerFooterElementLetterSpacing}
        value={raw.letterSpacing ?? ZERO}
        onChange={(dim: Dimension) => update({ letterSpacing: dim })}
        min={-5}
        step={0.1}
        units={TRACKING_UNITS}
        tooltip={labels.headerFooterElementLetterSpacingTooltip}
        isDefault={isLetterSpacingDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.letterSpacing;
          onChange(next);
        }}
      />
      <SelectInput
        label={labels.headingTextTransform}
        value={raw.textTransform ?? 'none'}
        options={TEXT_TRANSFORM_OPTIONS}
        onChange={(v) => update({ textTransform: v as DesignTextElement['textTransform'] })}
        tooltip={labels.headerFooterElementTextTransformTooltip}
        isDefault={isTextTransformDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.textTransform;
          onChange(next);
        }}
      />
      <SelectInput
        label={labels.headerFooterElementWritingMode}
        value={raw.writingMode ?? 'horizontal-tb'}
        options={[
          { value: 'horizontal-tb', label: labels.writingModeHorizontal },
          { value: 'vertical-rl', label: labels.writingModeVertical },
        ]}
        onChange={(v) => {
          const next: DesignTextElement = { ...raw };
          if (v === 'vertical-rl') next.writingMode = 'vertical-rl';
          else delete next.writingMode;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementWritingModeTooltip}
        isDefault={raw.writingMode !== 'vertical-rl'}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.writingMode;
          onChange(next);
        }}
      />
      <SelectInput
        label={labels.headerFooterElementOverflow}
        value={resolved.overflow}
        options={[
          { value: 'wrap', label: labels.headerFooterElementOverflowWrap },
          { value: 'ellipsis-end', label: labels.headerFooterElementOverflowEllipsisEnd },
          { value: 'ellipsis-middle', label: labels.headerFooterElementOverflowEllipsisMiddle },
          { value: 'ellipsis-start', label: labels.headerFooterElementOverflowEllipsisStart },
          { value: 'clip', label: labels.headerFooterElementOverflowClip },
        ]}
        onChange={(v) => update({ overflow: v as DesignTextElement['overflow'] })}
        tooltip={labels.headerFooterElementOverflowTooltip}
        // Unset, the slot decides (#628): shown resolved, reset to it.
        isDefault={raw.overflow === undefined}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.overflow;
          onChange(next);
        }}
      />
      <ToggleSwitch
        label={labels.headerFooterElementHyphenate}
        checked={raw.hyphenate ?? false}
        onChange={(v) => update({ hyphenate: v })}
        isDefault={!raw.hyphenate}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.hyphenate = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementHyphenateTooltip}
      />
      <DimensionInput
        label={labels.headerFooterElementParagraphIndent}
        value={raw.paragraphIndent ?? ZERO}
        onChange={(dim: Dimension) => update({ paragraphIndent: dim })}
        min={0}
        step={0.1}
        units={BOX_SIZE_UNITS}
        tooltip={labels.headerFooterElementParagraphIndentTooltip}
        isDefault={raw.paragraphIndent === undefined}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.paragraphIndent;
          onChange(next);
        }}
      />
      <ToggleSwitch
        label={labels.headerFooterElementDropCap}
        checked={raw.dropCap !== undefined}
        onChange={(v) => {
          const next: DesignTextElement = { ...raw };
          if (v) next.dropCap = { ...raw.dropCap };
          else delete next.dropCap;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementDropCapTooltip}
        isDefault={raw.dropCap === undefined}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.dropCap;
          onChange(next);
        }}
      />
      {raw.dropCap && (
        <DropCapFields
          kind="design"
          value={raw.dropCap}
          onChange={(dropCap) => update({ dropCap })}
          inherited={{ fontFamily: resolved.fontFamily, fontWeight: resolved.fontWeight, color: resolved.color }}
          fieldId={`headerFooter-text-dropcap-${raw.id}`}
        />
      )}
      <ToggleSwitch
        label={labels.headerFooterElementInlineMarks}
        checked={raw.inlineMarks ?? false}
        onChange={(v) => {
          const next: DesignTextElement = { ...raw };
          if (v) next.inlineMarks = true;
          else delete next.inlineMarks;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementInlineMarksTooltip}
        isDefault={!raw.inlineMarks}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          delete next.inlineMarks;
          onChange(next);
        }}
      />
      <DimensionInput
        label={labels.headerFooterElementStrokeWidth}
        value={strokeWidth}
        onChange={(dim: Dimension) => updateStroke({ width: dim })}
        min={0}
        step={0.1}
        units={TRACKING_UNITS}
        tooltip={labels.headerFooterElementStrokeWidthTooltip}
        isDefault={raw.stroke === undefined}
        onReset={() => updateStroke({ width: ZERO })}
      />
      {raw.stroke && (
        <NestedGroup>
          <ColorPicker
            label={labels.headerFooterElementStrokeColor}
            value={raw.stroke.color ?? resolved.color}
            onChange={(c: ColorValue) => updateStroke({ color: c })}
            isDefault={raw.stroke.color === undefined}
            onReset={() => updateStroke({ color: undefined })}
            fieldId={`headerFooter-text-stroke-${raw.id}`}
            tooltip={labels.headerFooterElementStrokeColorTooltip}
          />
          <ToggleSwitch
            label={labels.headerFooterElementStrokeHollow}
            checked={raw.stroke.hollow ?? false}
            onChange={(v) => updateStroke({ hollow: v })}
            tooltip={labels.headerFooterElementStrokeHollowTooltip}
            isDefault={!raw.stroke.hollow}
            onReset={() => updateStroke({ hollow: false })}
          />
        </NestedGroup>
      )}
      {(() => {
        const box: ElementBoxStyle = resolved.box ?? {};
        const bg = box.backgroundColor;
        const bc = box.borderColor;
        const bw = box.borderWidth ?? ZERO;
        const br = box.borderRadius ?? ZERO;
        const padH = box.padding?.left ?? box.padding?.right ?? ZERO;
        const padV = box.padding?.top ?? box.padding?.bottom ?? ZERO;
        const updateBox = (partial: Partial<ElementBoxStyle>) => {
          const nextBox: ElementBoxStyle = { ...(raw.box ?? {}), ...partial };
          const cleaned: ElementBoxStyle = {};
          if (nextBox.backgroundColor) cleaned.backgroundColor = nextBox.backgroundColor;
          if (nextBox.borderColor) cleaned.borderColor = nextBox.borderColor;
          if (nextBox.borderWidth) cleaned.borderWidth = nextBox.borderWidth;
          if (nextBox.borderRadius) cleaned.borderRadius = nextBox.borderRadius;
          if (nextBox.padding) {
            const p = nextBox.padding;
            const hasAny =
              (p.top && p.top.value !== 0) ||
              (p.right && p.right.value !== 0) ||
              (p.bottom && p.bottom.value !== 0) ||
              (p.left && p.left.value !== 0);
            if (hasAny) cleaned.padding = p;
          }
          const next: DesignTextElement = { ...raw };
          if (Object.keys(cleaned).length === 0) next.box = undefined;
          else next.box = cleaned;
          onChange(next);
        };
        const updatePaddingH = (dim: Dimension) => {
          const prev = raw.box?.padding ?? {};
          updateBox({ padding: { ...prev, left: dim, right: dim } });
        };
        const updatePaddingV = (dim: Dimension) => {
          const prev = raw.box?.padding ?? {};
          updateBox({ padding: { ...prev, top: dim, bottom: dim } });
        };
        return (
          <>
            <ColorPicker
              label={labels.headerFooterElementBoxBackgroundColor}
              value={bg ?? { hex: '#ffffff', model: 'hex' }}
              onChange={(c: ColorValue) => updateBox({ backgroundColor: c })}
              isDefault={!bg}
              onReset={() => updateBox({ backgroundColor: undefined })}
              fieldId={`headerFooter-text-bg-${raw.id}`}
              tooltip={labels.headerFooterElementBoxBackgroundColorTooltip}
            />
            <ColorPicker
              label={labels.headerFooterElementBoxBorderColor}
              value={bc ?? { hex: '#000000', model: 'hex' }}
              onChange={(c: ColorValue) => updateBox({ borderColor: c })}
              isDefault={!bc}
              onReset={() => updateBox({ borderColor: undefined })}
              fieldId={`headerFooter-text-border-${raw.id}`}
              tooltip={labels.headerFooterElementBoxBorderColorTooltip}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxBorderWidth}
              value={bw}
              onChange={(dim: Dimension) => updateBox({ borderWidth: dim })}
              min={0}
              step={0.1}
              isDefault={bw.value === 0}
              onReset={() => updateBox({ borderWidth: undefined })}
              tooltip={labels.headerFooterElementBoxBorderWidthTooltip}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxBorderRadius}
              value={br}
              onChange={(dim: Dimension) => updateBox({ borderRadius: dim })}
              min={0}
              step={0.5}
              isDefault={br.value === 0}
              onReset={() => updateBox({ borderRadius: undefined })}
              tooltip={labels.headerFooterElementBoxBorderRadiusTooltip}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxPaddingH}
              value={padH}
              onChange={updatePaddingH}
              min={0}
              step={0.5}
              isDefault={padH.value === 0}
              onReset={() => updatePaddingH(ZERO)}
              tooltip={labels.headerFooterElementBoxPaddingHTooltip}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxPaddingV}
              value={padV}
              onChange={updatePaddingV}
              min={0}
              step={0.5}
              isDefault={padV.value === 0}
              onReset={() => updatePaddingV(ZERO)}
              tooltip={labels.headerFooterElementBoxPaddingVTooltip}
            />
          </>
        );
      })()}
      {isContainerAnchor(resolved.placement) && (
        <>
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
      )}
    </>
  );
}
