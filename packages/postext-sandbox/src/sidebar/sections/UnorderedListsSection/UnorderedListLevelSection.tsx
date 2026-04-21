'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import { dimensionsEqual, colorsEqual } from 'postext';
import type {
  UnorderedListLevelConfig,
  ResolvedUnorderedListLevelConfig,
  ColorValue,
  Dimension,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';
import { TEXT_SIZE_UNITS, INDENT_UNITS, OFFSET_UNITS } from './units';

export function UnorderedListLevelSection({
  level,
  resolved,
  raw,
  generalBulletChar,
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
  resolved: ResolvedUnorderedListLevelConfig;
  raw: UnorderedListLevelConfig | undefined;
  generalBulletChar: string;
  generalFont: string;
  generalFontSize: Dimension;
  generalColor: ColorValue;
  generalFontWeight: number;
  generalItalic: boolean;
  generalIndent: Dimension;
  generalVerticalOffset: Dimension;
  onUpdate: (level: number, partial: Partial<UnorderedListLevelConfig>) => void;
  onReset: (level: number, field: keyof UnorderedListLevelConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}) {
  const isBulletCharDefault = resolved.bulletChar === generalBulletChar;
  const isFontDefault = resolved.fontFamily === generalFont;
  const isFontSizeDefault = dimensionsEqual(resolved.fontSize, generalFontSize);
  const isColorDefault = colorsEqual(resolved.color, generalColor);
  const isFontWeightDefault = resolved.fontWeight === generalFontWeight;
  const isItalicDefault = resolved.italic === generalItalic;
  // When `indent` is undefined, the renderer cascades from the previous level —
  // the UI shows the general indent as a stand-in so the DimensionInput has a value.
  const isIndentDefault = resolved.indent === undefined;
  const indentDisplay: Dimension = resolved.indent ?? generalIndent;
  const isVerticalOffsetDefault = dimensionsEqual(resolved.verticalOffset, generalVerticalOffset);
  const hasOverrides = raw !== undefined && Object.keys(raw).filter((k) => k !== 'level').length > 0;

  return (
    <CollapsibleSection
      title={`${labels.unorderedListLevel}${level}`}
      sectionId={`ul-l${level}`}
      onReset={() => onReset(level, 'bulletChar')}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <TextInput
        label={labels.unorderedListLevelBulletChar}
        value={resolved.bulletChar}
        onChange={(v) => onUpdate(level, { bulletChar: v })}
        placeholder={labels.unorderedListsBulletCharPlaceholder}
        tooltip={labels.unorderedListLevelBulletCharTooltip}
        isDefault={isBulletCharDefault}
        onReset={() => onReset(level, 'bulletChar')}
        widthCh={6}
      />
      <FontPicker
        label={labels.unorderedListLevelFont}
        value={resolved.fontFamily}
        onChange={(f) => onUpdate(level, { fontFamily: f })}
        tooltip={labels.unorderedListLevelFontTooltip}
        isDefault={isFontDefault}
        onReset={() => onReset(level, 'fontFamily')}
        searchPlaceholder={labels.unorderedListsFontSearch}
        noResultsLabel={labels.unorderedListsFontNoResults}
      />
      <DimensionInput
        label={labels.unorderedListLevelFontSize}
        value={resolved.fontSize}
        onChange={(dim) => onUpdate(level, { fontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.unorderedListLevelFontSizeTooltip}
        isDefault={isFontSizeDefault}
        onReset={() => onReset(level, 'fontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <ColorPicker
        label={labels.unorderedListLevelColor}
        value={resolved.color}
        onChange={(color) => onUpdate(level, { color })}
        tooltip={labels.unorderedListLevelColorTooltip}
        isDefault={isColorDefault}
        onReset={() => onReset(level, 'color')}
        fieldId={`ul-l${level}-color`}
      />
      <NumberInput
        label={labels.unorderedListLevelFontWeight}
        value={resolved.fontWeight}
        onChange={(w) => onUpdate(level, { fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.unorderedListLevelFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => onReset(level, 'fontWeight')}
      />
      <ToggleSwitch
        label={labels.unorderedListLevelItalic}
        checked={resolved.italic}
        onChange={(v) => onUpdate(level, { italic: v })}
        tooltip={labels.unorderedListLevelItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => onReset(level, 'italic')}
      />
      <DimensionInput
        label={labels.unorderedListLevelIndent}
        value={indentDisplay}
        onChange={(dim) => onUpdate(level, { indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListLevelIndentTooltip}
        isDefault={isIndentDefault}
        onReset={() => onReset(level, 'indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListLevelVerticalOffset}
        value={resolved.verticalOffset}
        onChange={(dim) => onUpdate(level, { verticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.unorderedListLevelVerticalOffsetTooltip}
        isDefault={isVerticalOffsetDefault}
        onReset={() => onReset(level, 'verticalOffset')}
        units={OFFSET_UNITS}
      />
    </CollapsibleSection>
  );
}
