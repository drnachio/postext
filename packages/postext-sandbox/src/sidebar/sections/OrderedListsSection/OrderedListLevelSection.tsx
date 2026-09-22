'use client';

import type { useSandboxLabels } from '../../../context/SandboxContext';
import { dimensionsEqual, colorsEqual } from 'postext';
import type {
  OrderedListLevelConfig,
  ResolvedOrderedListLevelConfig,
  OrderedListNumberFormat,
  ColorValue,
  Dimension,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';
import { numberFormatOptions } from './numberFormat';
import { TEXT_SIZE_UNITS, INDENT_UNITS, OFFSET_UNITS } from './units';

export function OrderedListLevelSection({
  level,
  resolved,
  raw,
  generalNumberFormat,
  generalSeparator,
  generalFont,
  generalFontSize,
  generalColor,
  generalFontWeight,
  generalItalic,
  generalIndent,
  generalVerticalOffset,
  onUpdate,
  onReset,
  labels,
}: {
  level: number;
  resolved: ResolvedOrderedListLevelConfig;
  raw: OrderedListLevelConfig | undefined;
  generalNumberFormat: OrderedListNumberFormat;
  generalSeparator: string;
  generalFont: string;
  generalFontSize: Dimension;
  generalColor: ColorValue;
  generalFontWeight: number;
  generalItalic: boolean;
  generalIndent: Dimension;
  generalVerticalOffset: Dimension;
  onUpdate: (level: number, partial: Partial<OrderedListLevelConfig>) => void;
  onReset: (level: number, field: keyof OrderedListLevelConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}) {
  const isNumberFormatDefault = resolved.numberFormat === generalNumberFormat;
  const isSeparatorDefault = resolved.separator === generalSeparator;
  const isFontDefault = resolved.fontFamily === generalFont;
  const isFontSizeDefault = dimensionsEqual(resolved.fontSize, generalFontSize);
  const isColorDefault = colorsEqual(resolved.color, generalColor);
  const isFontWeightDefault = resolved.fontWeight === generalFontWeight;
  const isItalicDefault = resolved.italic === generalItalic;
  const isIndentDefault = resolved.indent === undefined;
  const indentDisplay: Dimension = resolved.indent ?? generalIndent;
  const isVerticalOffsetDefault = dimensionsEqual(resolved.verticalOffset, generalVerticalOffset);
  const hasOverrides = raw !== undefined && Object.keys(raw).filter((k) => k !== 'level').length > 0;

  return (
    <CollapsibleSection
      title={`${labels.orderedListLevel}${level}`}
      sectionId={`ol-l${level}`}
      onReset={() => onReset(level, 'numberFormat')}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.orderedListLevelNumberFormat}
        value={resolved.numberFormat}
        options={numberFormatOptions(labels)}
        onChange={(v) => onUpdate(level, { numberFormat: v as OrderedListNumberFormat })}
        tooltip={labels.orderedListLevelNumberFormatTooltip}
        isDefault={isNumberFormatDefault}
        onReset={() => onReset(level, 'numberFormat')}
      />
      <TextInput
        label={labels.orderedListLevelSeparator}
        value={resolved.separator}
        onChange={(v) => onUpdate(level, { separator: v })}
        placeholder={labels.orderedListsSeparatorPlaceholder}
        tooltip={labels.orderedListLevelSeparatorTooltip}
        isDefault={isSeparatorDefault}
        onReset={() => onReset(level, 'separator')}
        widthCh={6}
      />
      <FontPicker
        label={labels.orderedListLevelFont}
        value={resolved.fontFamily}
        onChange={(f) => onUpdate(level, { fontFamily: f })}
        tooltip={labels.orderedListLevelFontTooltip}
        isDefault={isFontDefault}
        onReset={() => onReset(level, 'fontFamily')}
        searchPlaceholder={labels.orderedListsFontSearch}
        noResultsLabel={labels.orderedListsFontNoResults}
      />
      <DimensionInput
        label={labels.orderedListLevelFontSize}
        value={resolved.fontSize}
        onChange={(dim) => onUpdate(level, { fontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.orderedListLevelFontSizeTooltip}
        isDefault={isFontSizeDefault}
        onReset={() => onReset(level, 'fontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <ColorPicker
        label={labels.orderedListLevelColor}
        value={resolved.color}
        onChange={(color) => onUpdate(level, { color })}
        tooltip={labels.orderedListLevelColorTooltip}
        isDefault={isColorDefault}
        onReset={() => onReset(level, 'color')}
        fieldId={`ol-l${level}-color`}
      />
      <NumberInput
        label={labels.orderedListLevelFontWeight}
        value={resolved.fontWeight}
        onChange={(w) => onUpdate(level, { fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.orderedListLevelFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => onReset(level, 'fontWeight')}
      />
      <ToggleSwitch
        label={labels.orderedListLevelItalic}
        checked={resolved.italic}
        onChange={(v) => onUpdate(level, { italic: v })}
        tooltip={labels.orderedListLevelItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => onReset(level, 'italic')}
      />
      <DimensionInput
        label={labels.orderedListLevelIndent}
        value={indentDisplay}
        onChange={(dim) => onUpdate(level, { indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListLevelIndentTooltip}
        isDefault={isIndentDefault}
        onReset={() => onReset(level, 'indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.orderedListLevelVerticalOffset}
        value={resolved.verticalOffset}
        onChange={(dim) => onUpdate(level, { verticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.orderedListLevelVerticalOffsetTooltip}
        isDefault={isVerticalOffsetDefault}
        onReset={() => onReset(level, 'verticalOffset')}
        units={OFFSET_UNITS}
      />
      <FontPicker
        label={labels.orderedListsSeparatorFont}
        value={resolved.separatorFontFamily}
        onChange={(f) => onUpdate(level, { separatorFontFamily: f })}
        tooltip={labels.orderedListsSeparatorFontTooltip}
        isDefault={raw?.separatorFontFamily === undefined}
        onReset={() => onReset(level, 'separatorFontFamily')}
        searchPlaceholder={labels.orderedListsFontSearch}
        noResultsLabel={labels.orderedListsFontNoResults}
      />
      <ColorPicker
        label={labels.orderedListsSeparatorColor}
        value={resolved.separatorColor}
        onChange={(color) => onUpdate(level, { separatorColor: color })}
        tooltip={labels.orderedListsSeparatorColorTooltip}
        isDefault={raw?.separatorColor === undefined}
        onReset={() => onReset(level, 'separatorColor')}
        fieldId={`ol-l${level}-separator-color`}
      />
      <NumberInput
        label={labels.orderedListsSeparatorFontWeight}
        value={resolved.separatorFontWeight}
        onChange={(w) => onUpdate(level, { separatorFontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.orderedListsSeparatorFontWeightTooltip}
        isDefault={raw?.separatorFontWeight === undefined}
        onReset={() => onReset(level, 'separatorFontWeight')}
      />
      <ToggleSwitch
        label={labels.orderedListsSeparatorItalic}
        checked={resolved.separatorItalic}
        onChange={(v) => onUpdate(level, { separatorItalic: v })}
        tooltip={labels.orderedListsSeparatorItalicTooltip}
        isDefault={raw?.separatorItalic === undefined}
        onReset={() => onReset(level, 'separatorItalic')}
      />
      <DimensionInput
        label={labels.orderedListsSeparatorGap}
        value={resolved.separatorGap}
        onChange={(dim) => onUpdate(level, { separatorGap: dim })}
        min={0}
        step={0.05}
        tooltip={labels.orderedListsSeparatorGapTooltip}
        isDefault={raw?.separatorGap === undefined}
        onReset={() => onReset(level, 'separatorGap')}
        units={INDENT_UNITS}
      />
    </CollapsibleSection>
  );
}
